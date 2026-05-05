# CI/CD Pipeline — GitHub Actions

This document details the continuous integration and continuous deployment pipelines for the Temporal Agent project.

---

## Table of Contents

1. [Overview](#overview)
2. [Workflow: ci.yml (PR Validation)](#workflow-ciyml-pr-validation)
3. [Workflow: deploy-staging.yml](#workflow-deploy-stagingyml)
4. [Workflow: deploy-production.yml](#workflow-deploy-productionyml)
5. [Workflow: pr-cleanup.yml](#workflow-pr-cleanupyml)
6. [Composite Actions](#composite-actions)
7. [Docker Image Strategy](#docker-image-strategy)
8. [Helm Chart Publishing](#helm-chart-publishing)
9. [GitHub Configuration](#github-configuration)
10. [Release Process](#release-process)
11. [Rollback Procedure](#rollback-procedure)

---

## Overview

### Pipeline Flow

```
Developer                GitHub Actions                Kubernetes
────────                 ─────────────                 ──────────

  │                         │                            │
  │  git push feature/*     │                            │
  │ ──────────────────────► │  ci.yml                    │
  │                         │  lint + test + build       │
  │                         │  docker build (no push)    │
  │                         │  helm lint                 │
  │                         │                            │
  │  git push main          │                            │
  │ ──────────────────────► │  deploy-staging.yml        │
  │                         │  test + build + push       │
  │                         │  helm upgrade staging ───► │ staging ns
  │                         │  smoke test                │
  │                         │                            │
  │  git tag v1.0.0         │                            │
  │ ──────────────────────► │  deploy-production.yml     │
  │                         │  test + retag + publish    │
  │                         │  helm upgrade prod ──────► │ production ns
  │                         │  smoke test                │
  │                         │                            │
```

### File Structure

```
.github/
├── workflows/
│   ├── ci.yml                    # Triggered on PRs to main
│   ├── deploy-staging.yml        # Triggered on push to main
│   ├── deploy-production.yml     # Triggered on release publish
│   └── pr-cleanup.yml            # Triggered on PR close
└── actions/
    ├── docker-build/
    │   └── action.yml            # Reusable Docker build + push
    └── helm-deploy/
        └── action.yml            # Reusable Helm deploy
```

---

## Workflow: ci.yml (PR Validation)

Runs on every pull request targeting `main`. Validates code quality and catches issues before merge.

**Trigger**: `pull_request` (branches: `[main]`)

### Jobs

```
ci.yml
├── lint          (ESLint + Prettier check)
├── typecheck     (tsc --noEmit)
├── test          (vitest + coverage threshold)
├── docker-build  (build image, no push)
└── helm-lint     (helm lint + helm template)
```

### Full Workflow

```yaml
name: CI

on:
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run test:coverage
      - name: Check coverage thresholds
        run: |
          npm run test:coverage -- --check-coverage \
            --thresholds statements=85 \
            --thresholds branches=80 \
            --thresholds functions=85 \
            --thresholds lines=85

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max

  helm-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
        with:
          version: "v3.14.0"
      - run: helm lint deploy/helm/temporal-agent --strict
      - run: |
          helm template temporal-agent deploy/helm/temporal-agent \
            -f deploy/helm/temporal-agent/values-staging.yaml \
            > /dev/null
      - run: |
          helm template temporal-agent deploy/helm/temporal-agent \
            -f deploy/helm/temporal-agent/values-production.yaml \
            > /dev/null
```

### Concurrency

Uses `concurrency` with `cancel-in-progress: true` to cancel earlier CI runs when new commits are pushed to the same PR.

---

## Workflow: deploy-staging.yml

Deploys to the staging Kubernetes cluster automatically when code is merged to `main`.

**Trigger**: `push` (branches: `[main]`)

### Jobs

```
deploy-staging.yml
├── test              (lint + test)
├── build-and-push    (Docker build + push to GHCR with :sha and :staging-latest tags)
└── deploy-staging    (helm upgrade staging namespace + smoke test)
```

### Full Workflow

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]

concurrency:
  group: deploy-staging
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=raw,value=staging-latest

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            COMMIT_SHA=${{ github.sha }}

  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
        with:
          version: "v3.14.0"
      - uses: azure/k8s-set-context@v4
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBECONFIG_STAGING }}

      - name: Helm Deploy
        run: |
          helm repo add temporal https://charts.temporal.io
          helm repo add bitnami https://charts.bitnami.com/bitnami
          helm repo update
          helm dependency update deploy/helm/temporal-agent

          helm upgrade temporal-agent ./deploy/helm/temporal-agent \
            --install \
            --namespace temporal-agent-staging \
            --create-namespace \
            -f deploy/helm/temporal-agent/values-staging.yaml \
            --set api.image.tag=${{ needs.build-and-push.outputs.image_tag }} \
            --set worker.image.tag=${{ needs.build-and-push.outputs.image_tag }} \
            --set secrets.llmApiKey=${{ secrets.LLM_API_KEY_STAGING }} \
            --history-max 10 \
            --wait \
            --timeout 5m

      - name: Smoke Test
        run: |
          kubectl rollout status deployment/temporal-agent-api \
            -n temporal-agent-staging --timeout=120s

          kubectl port-forward svc/temporal-agent-api 3000:3000 \
            -n temporal-agent-staging &
          PF_PID=$!
          sleep 10

          STATUS=$(curl -sf http://localhost:3000/health | jq -r '.status')
          kill $PF_PID 2>/dev/null || true

          if [ "$STATUS" != "ok" ]; then
            echo "Smoke test failed: health status = $STATUS"
            exit 1
          fi
          echo "Staging smoke test passed"
```

---

## Workflow: deploy-production.yml

Deploys to the production Kubernetes cluster when a GitHub release is published. Requires manual approval via GitHub Environment protection rules.

**Trigger**: `release` (types: `[published]`)

### Jobs

```
deploy-production.yml
├── test                (full test suite)
├── retag-and-push      (retag SHA image with version tag + :latest)
├── publish-helm-chart  (package + push to GHCR OCI registry)
└── deploy-production   (helm upgrade production namespace + smoke test, requires approval)
```

### Full Workflow

```yaml
name: Deploy Production

on:
  release:
    types: [published]

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test

  retag-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Retag image with version
        run: |
          SHA_SHORT=$(echo "${{ github.sha }}" | cut -c1-7)
          SOURCE="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${SHA_SHORT}"
          VERSION_TAG="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name }}"
          LATEST_TAG="${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest"
          
          echo "Retagging ${SHA_SHORT} → ${{ github.ref_name }}, latest"
          docker buildx imagetools create \
            -t "$VERSION_TAG" \
            -t "$LATEST_TAG" \
            "$SOURCE"

  publish-helm-chart:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
        with:
          version: "v3.14.0"

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Package and publish Helm chart
        run: |
          # Update chart version to match release tag
          VERSION="${{ github.ref_name }}"
          yq -i ".version = \"${VERSION#v}\"" deploy/helm/temporal-agent/Chart.yaml
          yq -i ".appVersion = \"${VERSION}\"" deploy/helm/temporal-agent/Chart.yaml

          # Package
          helm package deploy/helm/temporal-agent \
            --destination ./dist

          # Push to GHCR as OCI artifact
          helm push ./dist/temporal-agent-*.tgz \
            oci://${{ env.REGISTRY }}/${{ github.repository }}/charts

  deploy-production:
    needs: [retag-and-push, publish-helm-chart]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
        with:
          version: "v3.14.0"
      - uses: azure/k8s-set-context@v4
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBECONFIG_PRODUCTION }}

      - name: Helm Deploy
        run: |
          helm repo add temporal https://charts.temporal.io
          helm repo add bitnami https://charts.bitnami.com/bitnami
          helm repo update
          helm dependency update deploy/helm/temporal-agent

          helm upgrade temporal-agent ./deploy/helm/temporal-agent \
            --install \
            --namespace temporal-agent \
            --create-namespace \
            -f deploy/helm/temporal-agent/values-production.yaml \
            --set api.image.tag=${{ github.ref_name }} \
            --set worker.image.tag=${{ github.ref_name }} \
            --set secrets.llmApiKey=${{ secrets.LLM_API_KEY_PRODUCTION }} \
            --history-max 20 \
            --wait \
            --timeout 10m

      - name: Smoke Test
        run: |
          kubectl rollout status deployment/temporal-agent-api \
            -n temporal-agent --timeout=300s

          kubectl port-forward svc/temporal-agent-api 3000:3000 \
            -n temporal-agent &
          PF_PID=$!
          sleep 15

          STATUS=$(curl -sf http://localhost:3000/health | jq -r '.status')
          kill $PF_PID 2>/dev/null || true

          if [ "$STATUS" != "ok" ]; then
            echo "Production smoke test failed: health status = $STATUS"
            exit 1
          fi
          echo "Production smoke test passed"
```

---

## Workflow: pr-cleanup.yml

Cleans up any preview resources when a PR is closed.

```yaml
name: PR Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: ubuntu-latest
    if: false  # Enable when PR preview environments are set up
    steps:
      - run: echo "Cleanup PR #${{ github.event.number }} preview resources"
```

This is a placeholder for future PR preview environments.

---

## Composite Actions

### docker-build/action.yml

Reusable Docker build action shared between CI and deploy workflows.

```yaml
name: "Docker Build"
description: "Build and optionally push Docker image"
inputs:
  push:
    description: "Push image to registry"
    required: false
    default: "false"
  tags:
    description: "Docker image tags"
    required: true
  registry:
    description: "Container registry URL"
    required: false
    default: "ghcr.io"
  github-token:
    description: "GitHub token for registry auth"
    required: false

runs:
  using: "composite"
  steps:
    - uses: docker/setup-buildx-action@v3
    - uses: docker/login-action@v3
      if: inputs.push == 'true'
      with:
        registry: ${{ inputs.registry }}
        username: ${{ github.actor }}
        password: ${{ inputs.github-token }}
    - uses: docker/build-push-action@v5
      with:
        context: .
        push: ${{ inputs.push }}
        tags: ${{ inputs.tags }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        build-args: |
          COMMIT_SHA=${{ github.sha }}
```

### helm-deploy/action.yml

Reusable Helm deploy action.

```yaml
name: "Helm Deploy"
description: "Deploy Helm chart to Kubernetes"
inputs:
  release-name:
    description: "Helm release name"
    required: true
  namespace:
    description: "Kubernetes namespace"
    required: true
  values-file:
    description: "Path to values file"
    required: true
  image-tag:
    description: "Container image tag"
    required: true
  kubeconfig:
    description: "Base64-encoded kubeconfig"
    required: true
  llm-api-key:
    description: "LLM API key"
    required: true
  timeout:
    description: "Helm install timeout"
    required: false
    default: "5m"

runs:
  using: "composite"
  steps:
    - uses: azure/setup-helm@v4
      with:
        version: "v3.14.0"
    - uses: azure/k8s-set-context@v4
      with:
        method: kubeconfig
        kubeconfig: ${{ inputs.kubeconfig }}
    - shell: bash
      run: |
        helm repo add temporal https://charts.temporal.io
        helm repo add bitnami https://charts.bitnami.com/bitnami
        helm repo update
        helm dependency update deploy/helm/temporal-agent

        helm upgrade ${{ inputs.release-name }} ./deploy/helm/temporal-agent \
          --install \
          --namespace ${{ inputs.namespace }} \
          --create-namespace \
          -f ${{ inputs.values-file }} \
          --set api.image.tag=${{ inputs.image-tag }} \
          --set worker.image.tag=${{ inputs.image-tag }} \
          --set secrets.llmApiKey=${{ inputs.llm-api-key }} \
          --wait \
          --timeout ${{ inputs.timeout }}
```

---

## Docker Image Strategy

### Multi-stage Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/deploy ./deploy

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/api/server.js"]
```

### Image Tagging

| Tag | When | Format | Example |
|---|---|---|---|
| SHA | Every merge to main | `<7-char-sha>` | `a1b2c3d` |
| staging-latest | Every merge to main | `staging-latest` | `staging-latest` |
| Version | Every release | `<semver>` | `v1.0.0` |
| latest | Every release | `latest` | `latest` |

### Registry

Images are published to **GitHub Container Registry (GHCR)**:
- `ghcr.io/<owner>/temporal-agent:<tag>`
- Free for public repositories
- Uses `GITHUB_TOKEN` for authentication (no extra secrets needed)

---

## Helm Chart Publishing

Helm charts are published as OCI artifacts to GHCR alongside Docker images.

### Publishing Flow

```
Release tag (v1.0.0) created
  → Update Chart.yaml version to match release
  → helm package → temporal-agent-1.0.0.tgz
  → helm push to oci://ghcr.io/<owner>/temporal-agent/charts
```

### Installing from Registry

```bash
helm pull oci://ghcr.io/<owner>/temporal-agent/charts/temporal-agent \
  --version 1.0.0

helm install temporal-agent \
  oci://ghcr.io/<owner>/temporal-agent/charts/temporal-agent \
  --version 1.0.0 \
  -f values-staging.yaml
```

---

## GitHub Configuration

### Repository Settings

1. **Environments** (Settings → Environments):
   - Create `staging` environment (no protection rules)
   - Create `production` environment with:
     - Required reviewers: 1+ people
     - Wait timer: 5 minutes
     - Deployment branch: `v*` tags only

2. **Secrets** (Settings → Secrets and variables → Actions):

| Secret Name | Environment | Value |
|---|---|---|
| `KUBECONFIG_STAGING` | staging | Base64-encoded kubeconfig for staging cluster |
| `KUBECONFIG_PRODUCTION` | production | Base64-encoded kubeconfig for production cluster |
| `LLM_API_KEY_STAGING` | staging | LLM API key for staging |
| `LLM_API_KEY_PRODUCTION` | production | LLM API key for production |

Note: `GITHUB_TOKEN` is automatically available — no configuration needed.

### Kubeconfig Setup

```bash
# Encode kubeconfig for GitHub secret
cat ~/.kube/config | base64 -w 0 | pbcopy
# Paste into GitHub secret value
```

### Branch Protection (Settings → Branches → main)

- [ ] Require status checks to pass before merging
  - [ ] lint
  - [ ] typecheck
  - [ ] test
  - [ ] docker-build
  - [ ] helm-lint
- [ ] Require branches to be up to date before merging
- [ ] Require linear history (recommended)

---

## Release Process

### Creating a Release

```bash
# 1. Ensure staging is working
#    (Every merge to main auto-deploys to staging)

# 2. Create a release tag
git tag -a v1.0.0 -m "Release v1.0.0: initial release"
git push origin v1.0.0

# 3. Create GitHub release (via web UI or CLI)
gh release create v1.0.0 \
  --title "v1.0.0" \
  --notes "## Changes
- Initial release of Temporal Agent
- Features: agent loop, 4 tools, approval flow, API server"

# 4. GitHub Actions triggers deploy-production.yml
# 5. Approve the deployment in the GitHub Actions UI
# 6. Production is deployed
```

### Versioning Convention

- Follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`
- Tag format: `v1.0.0`
- Breaking changes: bump MAJOR
- New features: bump MINOR
- Bug fixes: bump PATCH

---

## Rollback Procedure

### Kubernetes (Helm Rollback)

```bash
# List release history
helm history temporal-agent --namespace temporal-agent-staging

# Rollback to previous revision
helm rollback temporal-agent --namespace temporal-agent-staging

# Rollback to specific revision
helm rollback temporal-agent 5 --namespace temporal-agent-staging
```

### Emergency Production Rollback

```bash
# Immediate rollback
helm rollback temporal-agent --namespace temporal-agent

# If Helm rollback isn't sufficient, redeploy previous image
helm upgrade temporal-agent ./deploy/helm/temporal-agent \
  --namespace temporal-agent \
  -f deploy/helm/temporal-agent/values-production.yaml \
  --set api.image.tag=v0.9.0 \
  --set worker.image.tag=v0.9.0 \
  --set secrets.llmApiKey=$LLM_API_KEY \
  --wait --timeout 5m
```

### GitHub Actions Redeploy

Re-run a specific workflow run from the GitHub Actions UI:
1. Go to Actions → select the last known good deploy
2. Click "Re-run all jobs"

### Docker Image Rollback

Since all SHA-tagged images are retained in GHCR:

```bash
# Find the last working SHA
helm history temporal-agent --namespace temporal-agent

# Deploy that specific SHA
helm upgrade temporal-agent ./deploy/helm/temporal-agent \
  --set api.image.tag=<working-sha> \
  --set worker.image.tag=<working-sha> \
  ...
```
