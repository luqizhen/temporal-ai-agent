# Runbook: API High Latency

**Alert**: `APIHighLatency`

## Symptoms

- API p99 latency exceeds 5 seconds
- Slow response times for `/api/agent/start` endpoint

## Investigation

1. Check API latency metrics:
   ```bash
   kubectl port-forward svc/temporal-agent-api 3000:3000 -n temporal-agent &
   curl http://localhost:3000/metrics | grep http_request_duration
   ```

2. Check downstream services:
   - Temporal server response time
   - LLM provider response time
   - Tool execution time

3. Check API pod health:
   ```bash
   kubectl top pods -l app.kubernetes.io/component=api -n temporal-agent
   ```

## Common Causes

- Temporal server slow or unavailable
- LLM provider slow response (especially for complex prompts)
- High number of concurrent requests
- Tool execution timeouts

## Resolution

1. Scale API pods:
   ```bash
   kubectl scale deployment/temporal-agent-api --replicas=5 -n temporal-agent
   ```

2. Check Temporal server health:
   ```bash
   kubectl get pods -l app=temporal -n temporal-agent
   ```

3. Increase API timeout if legitimate slow operations expected

## Prevention

- Configure HPA for API pods based on CPU/memory
- Set appropriate rate limits on ingress
- Monitor p95/p99 latencies over time
