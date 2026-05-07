# Runbook: High Memory Usage

**Alert**: `HighMemoryUsage`

## Symptoms

- Container memory usage exceeds 80% of limit
- Potential OOM kills

## Investigation

1. Check pod memory usage:
   ```bash
   kubectl top pods -n temporal-agent
   ```

2. Check for OOM events:
   ```bash
   kubectl describe pod <pod-name> -n temporal-agent | grep -A5 "Last State"
   ```

3. Check worker memory growth (long conversations):
   ```bash
   kubectl logs <worker-pod> -n temporal-agent | grep "messages\|state"
   ```

## Common Causes

- Large conversation state (many messages in workflow history)
- Memory leak in tool execution
- Too many concurrent workflow executions per worker

## Resolution

1. Reduce `maxStateMessages` to limit state size:
   ```yaml
   config:
     maxStateMessages: 50
   ```

2. Increase memory limits:
   ```bash
   helm upgrade temporal-agent ./deploy/helm/temporal-agent \
     --set worker.resources.limits.memory=1Gi
   ```

3. Scale out (more replicas with less memory each) rather than scaling up

## Prevention

- Monitor memory trends over time in Grafana
- Implement Temporal's "continue-as-new" for long-running workflows
- Set appropriate memory requests/limits
