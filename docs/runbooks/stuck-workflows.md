# Runbook: Stuck Workflows

**Alert**: `AgentStuckWorkflows`

## Symptoms

- More than 50 workflows have been running for over 30 minutes
- Workflows are not completing or failing

## Investigation

1. List running workflows in Temporal:
   ```bash
   temporal workflow list --status Running --namespace default
   ```

2. Check for pending approvals:
   ```bash
   kubectl logs -l app.kubernetes.io/component=api -n temporal-agent | grep "waiting_approval"
   ```

3. Check if workers are healthy:
   ```bash
   kubectl get pods -l app.kubernetes.io/component=worker -n temporal-agent
   ```

## Common Causes

- Approval requests not being responded to (human-in-the-loop stuck)
- Worker pods crashed or OOM-killed
- Temporal server connectivity issues
- Tool execution timeout (e.g., HTTP request hanging)

## Resolution

- Approve or reject pending approvals via API: `POST /api/approval/:workflowId`
- Restart worker pods: `kubectl rollout restart deployment/temporal-agent-worker -n temporal-agent`
- Check `approvalTimeoutHours` config — reduce if approvals are not needed

## Escalation

If workflows remain stuck after resolving approvals and restarting workers, check Temporal server logs.
