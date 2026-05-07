# Runbook: Worker Task Queue Backlog

**Alert**: `WorkerTaskQueueBacklog`

## Symptoms

- Task queue backlog exceeds 1000 pending tasks
- Workflows taking longer to complete

## Investigation

1. Check task queue status:
   ```bash
   temporal task-queue describe --task-queue agent-task-queue
   ```

2. Check worker pod count and health:
   ```bash
   kubectl get pods -l app.kubernetes.io/component=worker -n temporal-agent
   kubectl top pods -l app.kubernetes.io/component=worker -n temporal-agent
   ```

3. Check HPA status:
   ```bash
   kubectl get hpa -n temporal-agent
   ```

## Resolution

1. Scale workers manually:
   ```bash
   kubectl scale deployment/temporal-agent-worker --replicas=10 -n temporal-agent
   ```

2. If HPA is enabled, check why it hasn't scaled:
   ```bash
   kubectl describe hpa temporal-agent-worker -n temporal-agent
   ```

3. Check for worker errors that may be causing slow processing:
   ```bash
   kubectl logs -l app.kubernetes.io/component=worker -n temporal-agent --tail=100
   ```

## Prevention

- Ensure HPA is configured for production (minReplicas: 3, maxReplicas: 20)
- Monitor task queue backlog trends over time
- Set up auto-scaling based on `temporal_task_queue_backlog` metric
