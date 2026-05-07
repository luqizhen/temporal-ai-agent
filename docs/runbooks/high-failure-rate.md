# Runbook: High Workflow Failure Rate

**Alert**: `AgentHighFailureRate` (warning) or `AgentCriticalFailureRate` (critical)

## Symptoms

- More than 10% (warning) or 25% (critical) of workflows are failing
- Workflow status shows `max_iterations` or `error`

## Investigation

1. Check workflow status in Temporal Web UI:
   ```bash
   kubectl port-forward svc/temporal-agent-temporal-ui 8080:80 -n temporal-agent
   # Open http://localhost:8080
   ```

2. Check LLM provider health:
   ```bash
   kubectl logs -l app.kubernetes.io/component=worker -n temporal-agent | grep "LLM error"
   ```

3. Check if API key is valid:
   ```bash
   kubectl logs -l app.kubernetes.io/component=worker -n temporal-agent | grep "401\|403"
   ```

## Common Causes

- LLM API key expired or rate-limited
- LLM provider outage (check status.openai.com or equivalent)
- Tool execution errors (check tool-specific logs)
- Max iterations reached (agent stuck in loop)

## Resolution

- Rotate LLM API key if expired
- Check LLM provider status page
- Increase `agentMaxIterations` if agent legitimately needs more steps
- Check tool configurations for errors

## Escalation

If unresolved after 30 minutes, check LLM provider status and contact the platform team.
