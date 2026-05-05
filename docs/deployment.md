# Deployment Guide

This document covers deployment strategies for the Temporal Agent across three environments: local development, staging (Kubernetes), and production (Kubernetes). Both staging and production use Helm charts, deployed via GitHub Actions CI/CD.

---

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Local Development](#local-development)
3. [Staging (Kubernetes)](#staging-kubernetes)
4. [Production (Kubernetes)](#production-kubernetes)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Temporal Server Deployment](#temporal-server-deployment)
7. [Database Management](#database-management)
8. [Secrets Management](#secrets-management)
9. [TLS & Networking](#tls--networking)
10. [Scaling Strategy](#scaling-strategy)
11. [Backup & Recovery](#backup--recovery)
12. [Troubleshooting](#troubleshooting)

---

## Deployment Overview

| Environment | Orchestration | Use Case | TLS | Replicas | Deploy Trigger |
|---|---|---|---|---|---|
| Local | Docker Compose | Development & testing | No | 1 per service | Manual |
| Staging | Kubernetes (Helm) | Pre-production validation | Yes (cert-manager) | 2 API + 2 Worker | Auto (merge to main) |
| Production | Kubernetes (Helm) | Live traffic | Yes (cert-manager) | 3+ API + 3-20 Worker (HPA) | Manual (release tag) |

### Infrastructure Components

Every environment runs these core components:

| Component | Purpose | Required |
|---|---|---|
| PostgreSQL 15 | Temporal persistence | Yes |
| Temporal Server | Workflow orchestration engine | Yes |
| Elasticsearch 7.x | Temporal advanced visibility | Staging+ |
| Caddy/Nginx | TLS termination & reverse proxy | Staging+ |
| App API | HTTP interface | Yes |
| App Worker | Workflow & activity execution | Yes |

---

## Local Development

See [getting-started.md](./getting-started.md) for detailed setup.

### Quick Start

```bash
# Start Temporal + PostgreSQL + Web UI
docker compose up -d

# Start worker + API in dev mode
./scripts/start-dev.sh
```

### Architecture

```
localhost:3000  ──►  API Server (tsx watch)
localhost:7233  ──►  Temporal Server (Docker)
localhost:8080  ──►  Temporal Web UI (Docker)
localhost:5432  ──►  PostgreSQL (Docker)
```

### Limits

- No TLS
- No Elasticsearch (basic visibility only)
- Single replica per service
- No auto-restart on host process crash
- Data lost on `docker compose down -v`

---

## Staging (Kubernetes)

Staging uses the same Helm chart as production, with different values. Deployed automatically by GitHub Actions on every merge to `main`.

### Prerequisites

- Kubernetes cluster (v1.27+) — can be a small single-node cluster (minikube, kind, or a cloud k8s cluster)
- `kubectl` configured with cluster access
- `helm` v3.8+
- GitHub repository with Actions enabled
- Container registry (GHCR) with published images
- DNS records for staging domain

### Setup (First Time)

```bash
# 1. Add dependency repos
helm repo add temporal https://charts.temporal.io
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add elastic https://helm.elastic.co
helm repo update

# 2. Create namespace
kubectl create namespace temporal-agent-staging

# 3. Create secrets
kubectl create secret generic temporal-agent-secrets \
  --namespace temporal-agent-staging \
  --from-literal=llm-api-key="$LLM_API_KEY" \
  --from-literal=postgres-password="$(openssl rand -base64 32)"

# 4. Install (or let CI/CD do it on first merge)
helm install temporal-agent ./deploy/helm/temporal-agent \
  --namespace temporal-agent-staging \
  -f deploy/helm/temporal-agent/values-staging.yaml \
  --set secrets.llmApiKey="$LLM_API_KEY"
```

### Subsequent Deploys (Automatic)

After setup, staging deploys are **automatic** via GitHub Actions on every merge to `main`:

```
PR merged to main → CI/CD: test + build + push image → helm upgrade staging
```

See [CI/CD Pipeline](#cicd-pipeline) for details.

### Architecture

```
Internet
    │
    ▼  (DNS: staging.agent.example.com)
┌──────────────┐
│  Ingress     │  TLS via cert-manager (Let's Encrypt staging)
│  + cert-mgr  │
└──────┬───────┘
       │
┌──────┴──────┐
│  API Pods   │  ClusterIP → 2 replicas
│  (Fastify)  │
└──────┬──────┘
       │
┌──────┴──────┐
│ Worker Pods │  2 replicas
└──────┬──────┘
       │
┌──────┴──────────────────┐
│  Temporal Server        │  1 replica
│  Persistence: PostgreSQL│  (in-cluster or managed)
│  Visibility: ES         │  (in-cluster or managed)
└─────────────────────────┘
```

### values-staging.yaml

```yaml
global:
  namespace: temporal-agent-staging
  environment: staging

api:
  replicaCount: 2
  image:
    repository: ghcr.io/your-org/temporal-agent
    tag: staging-latest
  ingress:
    enabled: true
    className: nginx
    hosts:
      - host: staging.agent.example.com
        paths: ["/"]
    tls:
      - secretName: agent-staging-tls
        hosts: [staging.agent.example.com]
  resources:
    requests: { memory: "256Mi", cpu: "250m" }
    limits: { memory: "512Mi", cpu: "500m" }
  hpa:
    enabled: false

worker:
  replicaCount: 2
  image:
    repository: ghcr.io/your-org/temporal-agent
    tag: staging-latest
  resources:
    requests: { memory: "256Mi", cpu: "250m" }
    limits: { memory: "512Mi", cpu: "500m" }
  hpa:
    enabled: false

config:
  agentMaxIterations: 20
  approvalTimeoutHours: 1
  workspaceDir: "/app/workspace"

temporal:
  enabled: true
  server:
    replicaCount: 1

postgresql:
  enabled: true
  primary:
    persistence:
      size: 10Gi

elasticsearch:
  enabled: true
  replicas: 1
  resources:
    requests: { memory: "512Mi" }
```

### Resource Requirements

| Component | Memory | CPU | Replicas |
|---|---|---|---|
| API | 512MB | 0.5 | 2 |
| Worker | 512MB | 0.5 | 2 |
| Temporal Server | 1GB | 1.0 | 1 |
| PostgreSQL | 512MB | 0.5 | 1 |
| Elasticsearch | 512MB | 0.5 | 1 |
| **Total** | **~4.5GB** | **~4.5 CPUs** | |

### Monitoring

```bash
# Check pod status
kubectl get pods -n temporal-agent-staging

# View API logs
kubectl logs -f -l app=temporal-agent-api -n temporal-agent-staging

# View Worker logs
kubectl logs -f -l app=temporal-agent-worker -n temporal-agent-staging

# Port-forward for local testing
kubectl port-forward svc/temporal-agent-api 3000:3000 -n temporal-agent-staging
curl http://localhost:3000/health
```

---

## Production (Kubernetes)

Production uses the same Helm chart as staging, with production-grade values. Deployed via GitHub Actions when a release tag is created.

### Prerequisites

- Production Kubernetes cluster (v1.27+, multi-node)
- `kubectl` configured
- `helm` v3.8+
- Container registry with published images
- DNS records for production domain
- TLS certificates (via cert-manager + Let's Encrypt or custom CA)

### Quick Deploy (Manual, or via CI/CD)

```bash
# 1. Add dependency repos
helm repo add temporal https://charts.temporal.io
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add elastic https://helm.elastic.co
helm repo update

# 2. Create namespace
kubectl create namespace temporal-agent

# 3. Create secrets
kubectl create secret generic temporal-agent-secrets \
  --namespace temporal-agent \
  --from-literal=llm-api-key="$LLM_API_KEY" \
  --from-literal=postgres-password="$(openssl rand -base64 32)"

# 4. Install
helm install temporal-agent ./deploy/helm/temporal-agent \
  --namespace temporal-agent \
  -f values-production.yaml

# 5. Verify
kubectl get pods -n temporal-agent
kubectl port-forward svc/temporal-agent-api 3000:3000 -n temporal-agent
curl http://localhost:3000/health
```

### Upgrading

```bash
# Rolling update with zero downtime
helm upgrade temporal-agent ./deploy/helm/temporal-agent \
  --namespace temporal-agent \
  -f values-production.yaml \
  --set api.image.tag=1.1.0 \
  --set worker.image.tag=1.1.0

# Rollback if issues
helm rollback temporal-agent --namespace temporal-agent
```

### Using External Temporal (Temporal Cloud)

```yaml
# values-production.yaml
temporal:
  enabled: false  # Don't deploy self-hosted Temporal

config:
  temporalAddress: "your-namespace.tmprl.cloud:7233"
  temporalNamespace: "your-namespace"

secrets:
  temporalClientCert: "..."  # mTLS cert
  temporalClientKey: "..."   # mTLS key
```

### Using External Database

```yaml
# values-production.yaml
postgresql:
  enabled: false  # Don't deploy self-hosted PostgreSQL

config:
  temporalAddress: "temporal-agent-temporal:7233"

secrets:
  postgresHost: "your-rds-endpoint.amazonaws.com"
  postgresPort: "5432"
  postgresUser: "temporal"
  postgresPassword: "..."
  postgresDatabase: "temporal"
```

### Architecture

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │  Ingress        │  (Nginx/Traefik/ALB)
              │  + cert-manager │  TLS via Let's Encrypt
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │  API Service    │  ClusterIP → API Pods (HPA: 3-10)
              │  (Fastify)      │
              └─────────────────┘
                       │
              ┌────────┴────────┐
              │  Worker Pods    │  (HPA: 3-20, scales with queue depth)
              │  (Temporal SDK) │
              └─────────────────┘
                       │
              ┌────────┴──────────────────────┐
              │  Temporal Server               │
              │  (StatefulSet or from chart)   │
              └────────┬────────────┬──────────┘
                       │            │
              ┌────────▼──┐  ┌──────▼──────┐
              │ PostgreSQL│  │ Elasticsearch│
              │ (RDS/Cloud│  │ (managed or │
              │  SQL)     │  │  self-hosted)│
              └───────────┘  └──────────────┘
```

---

## CI/CD Pipeline

All deployments to staging and production are automated via GitHub Actions. See [CI/CD Documentation](./cicd.md) for full details.

### Pipeline Summary

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Pull Request      │     │   Merge to main     │     │   Release Tag       │
│                     │     │                     │     │   (v1.0.0)          │
│   ci.yml:           │     │   deploy-staging:   │     │   deploy-production:│
│   • lint            │     │   • test            │     │   • test            │
│   • typecheck       │     │   • build + push    │     │   • retag :v1.0.0   │
│   • test + coverage │     │     Docker image    │     │   • publish Helm    │
│   • docker build    │     │   • helm upgrade    │     │     chart           │
│     (no push)       │     │     staging ns      │     │   • helm upgrade    │
│   • helm lint       │     │   • smoke test      │     │     production ns   │
│                     │     │                     │     │   • smoke test      │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

### GitHub Environments

| Environment | Protection | Auto-deploy | Trigger |
|---|---|---|---|
| staging | None | Yes | Push to `main` |
| production | 1+ required reviewers | No (manual approval) | Release `v*` tag |

### GitHub Secrets

| Secret | Description |
|---|---|
| `KUBECONFIG_STAGING` | Staging cluster kubeconfig (base64 encoded) |
| `KUBECONFIG_PRODUCTION` | Production cluster kubeconfig (base64 encoded) |
| `LLM_API_KEY_STAGING` | LLM API key for staging |
| `LLM_API_KEY_PRODUCTION` | LLM API key for production |

### Manual Operations

```bash
# Force redeploy staging (without a code change)
git commit --allow-empty -m "chore: trigger staging deploy"
git push origin main

# Rollback staging
helm rollback temporal-agent --namespace temporal-agent-staging

# Rollback production
helm rollback temporal-agent --namespace temporal-agent
```

---

## Temporal Server Deployment

### Self-Hosted (Default)

The Helm chart includes the [official Temporal Helm chart](https://github.com/temporalio/helm-charts) as a dependency. This deploys:

- Temporal server (configurable replicas)
- PostgreSQL schema auto-setup
- Elasticsearch integration for advanced visibility
- Admin tools

### Temporal Cloud (Alternative)

For production workloads, [Temporal Cloud](https://temporal.io/cloud) eliminates the operational burden of managing Temporal server:

- Fully managed, SLA-backed
- Built-in advanced visibility
- mTLS authentication
- Auto-scaling
- 99.99% uptime SLA

To use Temporal Cloud, disable the self-hosted chart and configure the client:

```yaml
temporal:
  enabled: false

config:
  temporalAddress: "your-namespace.tmprl.cloud:7233"
  temporalNamespace: "your-namespace"
```

### Temporal Configuration

Key Temporal server settings per environment:

| Setting | Local | Staging | Production |
|---|---|---|---|
| Persistence | PostgreSQL (Docker) | PostgreSQL (Docker) | Managed RDS |
| Visibility | Standard | Elasticsearch | Elasticsearch |
| Replicas | 1 | 1 | 3+ |
| Namespace retention | 3 days | 7 days | 30 days |
| History archival | Off | Off | On (S3/GCS) |

---

## Database Management

### PostgreSQL

#### Schema Management

Temporal auto-creates its schema on first startup (`auto-setup` image). For production:

```bash
# Run schema migrations manually (recommended for production)
temporal-sql-tool --endpoint $PG_HOST --database temporal setup-schema -v 0.0
temporal-sql-tool --endpoint $PG_HOST --database temporal update-schema -d ./schema/postgresql/v96/temporal/versioned
```

#### Backup Strategy

| Environment | Strategy | Frequency | Retention |
|---|---|---|---|
| Local | `docker compose down -v` (data lost) | N/A | N/A |
| Staging | `pg_dump` cron job | Daily | 7 days |
| Production | Managed DB automated backups | Continuous | 30 days |

```bash
# Manual backup (staging)
docker compose -f docker-compose.staging.yml exec -T postgresql \
  pg_dump -U postgres temporal > backup-$(date +%Y%m%d).sql

# Restore
cat backup-20250115.sql | docker compose -f docker-compose.staging.yml exec -T postgresql \
  psql -U postgres temporal
```

#### Connection Pooling

For production, use connection pooling (PgBouncer or managed equivalent):

```yaml
# In Temporal server config
postgresql:
  connectAttributes:
    sslmode: require
  maxConns: 50
  maxIdleConns: 25
  maxConnLifetime: "1h"
```

---

## Secrets Management

### Local Development

Secrets stored in `.env` file (git-ignored):

```bash
LLM_API_KEY=sk-...
POSTGRES_PASSWORD=temporal
```

### Staging

Secrets in `.env.staging` (git-ignored, file permissions 600):

```bash
LLM_API_KEY=sk-...
POSTGRES_PASSWORD=<strong-random-password>
```

### Production

**Option A: Kubernetes Secrets** (simplest)

```bash
kubectl create secret generic temporal-agent-secrets \
  --from-literal=llm-api-key="$LLM_API_KEY" \
  --from-literal=postgres-password="$PG_PASSWORD"
```

**Option B: External Secrets Operator** (recommended)

Syncs secrets from AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: temporal-agent-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: temporal-agent-secrets
  data:
    - secretKey: llm-api-key
      remoteRef:
        key: temporal-agent/llm-api-key
```

**Option C: Sealed Secrets**

Encrypt secrets into Kubernetes resources that can be committed to git:

```bash
echo -n "$LLM_API_KEY" | kubectl create secret generic llm-key \
  --dry-run=client --from-file=api-key=/dev/stdin -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml
```

---

## TLS & Networking

### Staging (Caddy)

```caddyfile
# Caddyfile
{$DOMAIN} {
    reverse_proxy /temporal/* temporal-ui:8080
    reverse_proxy /* app-api:3000

    tls internal  # Self-signed for staging
    # tls {$DOMAIN}  # Let's Encrypt for public staging
}
```

### Production (Kubernetes)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: temporal-agent
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [agent.example.com]
      secretName: agent-tls
  rules:
    - host: agent.example.com
      http:
        paths:
          - path: /temporal
            pathType: Prefix
            backend:
              service:
                name: temporal-ui
                port: { number: 8080 }
          - path: /
            pathType: Prefix
            backend:
              service:
                name: temporal-agent-api
                port: { number: 3000 }
```

### Internal mTLS (Temporal)

Temporal supports mTLS for worker-to-server communication:

```yaml
temporal:
  server:
    tls:
      internode:
        enabled: true
      frontend:
        enabled: true
```

---

## Scaling Strategy

### Worker Scaling

Workers are the primary scaling target. Scale based on task queue backlog:

```yaml
worker:
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    metrics:
      - type: External
        external:
          metric:
            name: temporal_task_queue_backlog
            selector:
              matchLabels:
                task_queue: agent-task-queue
          target:
            type: AverageValue
            averageValue: "100"
```

### API Scaling

Scale API based on HTTP request rate:

```yaml
api:
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilization: 70
    targetMemoryUtilization: 80
```

### Database Scaling

| Load Level | Setup |
|---|---|
| Low (<100 workflows/day) | Single PostgreSQL instance |
| Medium (100-10k/day) | Managed RDS with read replica |
| High (>10k/day) | Managed RDS Multi-AZ + PgBouncer + connection pooling |

---

## Backup & Recovery

### Backup Checklist

| Component | Local | Staging | Production |
|---|---|---|---|
| PostgreSQL data | No backup | Daily `pg_dump` | Managed automated backups |
| Elasticsearch | No backup | Weekly snapshot | Daily snapshot to S3/GCS |
| Temporal history | No backup | In PostgreSQL backup | Archival to S3/GCS |
| App configuration | Git | Git | Git + Helm values |
| Secrets | `.env` file | `.env.staging` file | Secrets manager |

### Disaster Recovery

```bash
# Kubernetes: restore from backup
helm rollback temporal-agent --namespace temporal-agent

# Database: point-in-time recovery (managed RDS)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier temporal-prod \
  --restore-time 2025-01-15T10:00:00Z

# Elasticsearch: restore from snapshot
curl -X POST "localhost:9200/_snapshot/temporal_backup/snapshot_20250115/_restore"
```

---

## Troubleshooting

### Temporal Server Won't Start

```bash
# Check if PostgreSQL is ready
docker compose exec postgresql pg_isready

# Check Temporal logs
docker compose logs temporal | grep -i error

# Common issues:
# - PostgreSQL not ready → increase depends_on healthcheck retries
# - Schema migration failed → run temporal-sql-tool manually
# - Port conflict → change ports in docker-compose.yml
```

### Worker Can't Connect to Temporal

```bash
# Verify Temporal address
echo $TEMPORAL_ADDRESS  # Should be temporal:7233 (Docker) or service:7233 (k8s)

# Test connectivity
docker compose exec app-worker nc -zv temporal 7233

# k8s: check DNS resolution
kubectl exec -it worker-pod -- nslookup temporal-agent-temporal
```

### High Memory Usage

```bash
# Check which service is using memory
docker stats --no-stream

# Worker memory grows with long conversations →
# - Reduce MAX_STATE_MESSAGES
# - Implement continue-as-new
# - Increase worker replica count instead of per-pod memory
```

### Slow Workflow Execution

```bash
# Check Temporal task queue backlog
temporal task-queue describe --task-queue agent-task-queue

# If backlog > 0, workers can't keep up:
# - Scale up worker replicas
# - Check worker logs for errors
# - Increase maxTasksPerSecond on worker config
```
