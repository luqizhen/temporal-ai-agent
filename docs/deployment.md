# Deployment Guide

This document covers deployment strategies for the Temporal Agent across three environments: local development, staging (single VM), and production (Kubernetes).

---

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Local Development](#local-development)
3. [Staging (Docker Compose)](#staging-docker-compose)
4. [Production (Kubernetes)](#production-kubernetes)
5. [Temporal Server Deployment](#temporal-server-deployment)
6. [Database Management](#database-management)
7. [Secrets Management](#secrets-management)
8. [TLS & Networking](#tls--networking)
9. [Scaling Strategy](#scaling-strategy)
10. [Backup & Recovery](#backup--recovery)
11. [Troubleshooting](#troubleshooting)

---

## Deployment Overview

| Environment | Orchestration | Use Case | TLS | Replicas |
|---|---|---|---|---|
| Local | Docker Compose | Development & testing | No | 1 per service |
| Staging | Docker Compose | Pre-production validation | Yes (self-signed) | 2 API + 2 Worker |
| Production | Kubernetes (Helm) | Live traffic | Yes (cert-manager) | 3+ API + 3-20 Worker (HPA) |

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

## Staging (Docker Compose)

A production-like environment on a single VM. Suitable for integration testing, load testing, and pre-release validation.

### Prerequisites

- Linux VM (Ubuntu 22.04+, 4 vCPU, 8GB RAM, 50GB SSD)
- Docker 24+ and Docker Compose v2+
- Domain name pointing to VM (for TLS)
- LLM API key

### Setup

```bash
# 1. Clone the repository
git clone <repo-url> && cd temporal-agent

# 2. Create staging env file
cp .env.staging.example .env.staging
# Edit .env.staging with real values:
#   LLM_API_KEY=sk-...
#   POSTGRES_PASSWORD=<strong-password>
#   DOMAIN=staging.your-domain.com

# 3. Deploy
./scripts/deploy-staging.sh
```

### deploy-staging.sh

```bash
#!/bin/bash
set -euo pipefail

echo "=== Deploying Temporal Agent (Staging) ==="

# Pull latest images
docker compose -f docker-compose.staging.yml pull

# Start services
docker compose -f docker-compose.staging.yml up -d

# Wait for Temporal to be ready
echo "Waiting for Temporal server..."
until docker compose -f docker-compose.staging.yml exec -T temporal \
  temporal workflow list --address temporal:7233 2>/dev/null; do
  sleep 5
done

echo "Creating staging namespace..."
docker compose -f docker-compose.staging.yml exec -T temporal-admin-tools \
  temporal operator namespace create staging --retention 7d || true

echo "=== Staging deployment complete ==="
echo "API:        https://${DOMAIN}"
echo "Temporal:   https://${DOMAIN}/temporal"
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.staging.yml logs -f app-api"
echo "  docker compose -f docker-compose.staging.yml logs -f app-worker"
echo "  docker compose -f docker-compose.staging.yml ps"
```

### Architecture

```
Internet
    │
    ▼  (DNS: staging.example.com)
┌──────────────┐
│  Caddy       │  Port 80/443
│  TLS term.   │  Auto HTTPS (Let's Encrypt or self-signed)
└──┬───────┬───┘
   │       │
   ▼       ▼
┌──────┐ ┌──────────┐
│ API  │ │ Temporal  │
│ x2   │ │ UI        │
└──┬───┘ └──────────┘
   │
   ▼
┌──────┐
│Worker│
│ x2   │
└──┬───┘
   │
   ▼
┌──────────┐
│ Temporal │──── PostgreSQL
│ Server   │──── Elasticsearch
└──────────┘
```

### Resource Requirements

| Service | Memory | CPU |
|---|---|---|
| Caddy | 64MB | 0.1 |
| API (x2) | 512MB each | 0.5 each |
| Worker (x2) | 1GB each | 1.0 each |
| Temporal Server | 2GB | 2.0 |
| PostgreSQL | 512MB | 1.0 |
| Elasticsearch | 1GB | 1.0 |
| **Total** | **~7.5GB** | **~7.2 CPUs** |

### Monitoring

```bash
# Check service health
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml exec -T app-api curl -s http://localhost:3000/health

# View logs
docker compose -f docker-compose.staging.yml logs -f --tail=100 app-api
docker compose -f docker-compose.staging.yml logs -f --tail=100 app-worker
docker compose -f docker-compose.staging.yml logs -f --tail=100 temporal

# Resource usage
docker stats --no-stream
```

---

## Production (Kubernetes)

Provider-agnostic Kubernetes deployment using Helm.

### Prerequisites

- Kubernetes cluster (v1.27+)
- `kubectl` configured
- `helm` v3.8+
- Container registry with built images
- DNS records pointing to cluster ingress

### Quick Deploy

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
