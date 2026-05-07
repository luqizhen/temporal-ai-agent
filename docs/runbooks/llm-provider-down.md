# Runbook: LLM Provider Down

**Alert**: `LLMProviderDown`

## Symptoms

- More than 5 consecutive LLM API errors in 5 minutes
- Workflows failing with LLM-related errors

## Investigation

1. Check LLM error types:
   ```bash
   kubectl logs -l app.kubernetes.io/component=worker -n temporal-agent | grep "LLM error"
   ```

2. Test LLM API connectivity from a worker pod:
   ```bash
   kubectl exec -it <worker-pod> -- curl -s https://api.openai.com/v1/models \
     -H "Authorization: Bearer $LLM_API_KEY" | head -20
   ```

3. Check API key validity:
   - Verify `LLM_API_KEY` secret in Kubernetes
   - Check if key has been rotated or revoked

## Common Causes

- Invalid or expired API key
- LLM provider rate limiting (429 errors)
- LLM provider outage
- Network connectivity issues
- Incorrect `LLM_BASE_URL` configuration

## Resolution

1. Rotate API key:
   ```bash
   kubectl create secret generic temporal-agent-secrets \
     --from-literal=llm-api-key="$NEW_KEY" \
     --dry-run=client -o yaml | kubectl apply -n temporal-agent -f -
   kubectl rollout restart deployment/temporal-agent-worker -n temporal-agent
   ```

2. If rate-limited, reduce concurrent workflow execution
3. Check provider status page for outages

## Escalation

Contact LLM provider support if errors persist after key rotation and connectivity is confirmed.
