# API Reference

Complete reference for the Temporal Agent HTTP API.

**Base URL**: `http://localhost:3000` (configurable via `API_PORT`)

**Content Type**: All request/response bodies are `application/json` unless noted.

---

## Table of Contents

1. [Health & Status](#health--status)
2. [Agent Operations](#agent-operations)
3. [Approval Operations](#approval-operations)
4. [Real-Time Events (SSE)](#real-time-events-sse)
5. [Error Responses](#error-responses)

---

## Health & Status

### `GET /health`

Health check endpoint. Verifies API server and Temporal connection.

**Response** `200 OK`:

```json
{
  "status": "ok",
  "temporal": "connected",
  "version": "1.0.0"
}
```

If Temporal is unreachable:

```json
{
  "status": "degraded",
  "temporal": "disconnected",
  "version": "1.0.0"
}
```

---

## Agent Operations

### `POST /agent/start`

Start a new agent workflow. The agent will process the prompt through the LLM reasoning loop, executing tools as needed.

**Request Body**:

```json
{
  "prompt": "string (required)",
  "systemPrompt": "string (optional)",
  "maxIterations": "number (optional, default: 20)",
  "sessionId": "string (optional)"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | string | Yes | — | The user's message to the agent |
| `systemPrompt` | string | No | `"You are a helpful AI assistant..."` | System prompt for agent behavior |
| `maxIterations` | number | No | `20` | Max LLM call iterations |
| `sessionId` | string | No | Random UUID | Session identifier (used in workflow ID) |

**Response** `202 Accepted`:

```json
{
  "workflowId": "agent-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "runId": "run-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Search for the latest news about TypeScript 5.5 and summarize it",
    "systemPrompt": "You are a research assistant. Use tools to find current information."
  }'
```

---

### `GET /agent/:workflowId`

Get the current state of an agent workflow.

**Path Parameters**:

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow ID returned by `POST /agent/start` |

**Response** `200 OK`:

```json
{
  "workflowId": "agent-a1b2c3d4-...",
  "runId": "run-xxxx-xxxx",
  "status": "running",
  "iteration": 3,
  "toolCallsExecuted": 2,
  "approvalsRequested": 0,
  "messages": [
    {
      "role": "system",
      "content": "You are a research assistant..."
    },
    {
      "role": "user",
      "content": "Search for the latest news..."
    },
    {
      "role": "assistant",
      "content": "I'll search for that.",
      "toolCalls": [
        {
          "id": "call_abc123",
          "name": "web-search",
          "arguments": { "query": "TypeScript 5.5 latest news" }
        }
      ]
    },
    {
      "role": "tool",
      "content": "{\"results\": [...]}",
      "toolCallId": "call_abc123"
    },
    {
      "role": "assistant",
      "content": "Here is a summary of the latest TypeScript 5.5 news: ..."
    }
  ],
  "pendingApproval": null,
  "startedAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:15Z"
}
```

**Status values**:

| Status | Description |
|---|---|
| `running` | Agent is actively processing |
| `waiting_approval` | Agent is waiting for human approval on a tool call |
| `completed` | Agent finished successfully |
| `failed` | Agent encountered an unrecoverable error |
| `max_iterations` | Agent hit the iteration limit |

**If workflow is completed**, the response includes the result:

```json
{
  "status": "completed",
  "result": {
    "finalAnswer": "Here is a summary...",
    "iterations": 3,
    "toolCallsExecuted": 2,
    "approvalsRequested": 0,
    "status": "completed"
  }
}
```

**Example**:

```bash
curl http://localhost:3000/agent/agent-a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Error** `404 Not Found`:

```json
{
  "error": "Workflow not found",
  "workflowId": "agent-xxxxx"
}
```

---

### `GET /agent/:workflowId/result`

Get the final result of a completed agent workflow.

**Path Parameters**: Same as `GET /agent/:workflowId`

**Response** `200 OK`:

```json
{
  "workflowId": "agent-a1b2c3d4-...",
  "status": "completed",
  "result": {
    "finalAnswer": "Based on my research, TypeScript 5.5 introduces...",
    "iterations": 3,
    "toolCallsExecuted": 2,
    "approvalsRequested": 0,
    "status": "completed"
  }
}
```

**Error** `409 Conflict` (workflow still running):

```json
{
  "error": "Workflow is still running",
  "status": "running",
  "workflowId": "agent-a1b2c3d4-..."
}
```

---

### `POST /agent/:workflowId/continue`

Send a follow-up message to a completed agent workflow. This starts a new workflow run with the existing conversation context.

**Path Parameters**: Same as `GET /agent/:workflowId`

**Request Body**:

```json
{
  "prompt": "string (required)"
}
```

**Response** `202 Accepted`:

```json
{
  "workflowId": "agent-a1b2c3d4-...",
  "runId": "run-yyyy-yyyy",
  "previousRunId": "run-xxxx-xxxx"
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/agent/agent-a1b2c3d4-.../continue \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Can you also save this summary to a file?"}'
```

---

### `DELETE /agent/:workflowId`

Cancel a running agent workflow.

**Path Parameters**: Same as `GET /agent/:workflowId`

**Response** `200 OK`:

```json
{
  "message": "Workflow cancellation requested",
  "workflowId": "agent-a1b2c3d4-..."
}
```

**Note**: Cancellation is asynchronous. The workflow may continue briefly before terminating.

---

### `GET /agent`

List recent agent workflows.

**Query Parameters**:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | all | Filter by status (`running`, `completed`, `failed`) |
| `limit` | number | `20` | Max results to return |
| `offset` | number | `0` | Pagination offset |

**Response** `200 OK`:

```json
{
  "workflows": [
    {
      "workflowId": "agent-a1b2c3d4-...",
      "runId": "run-xxxx-xxxx",
      "status": "completed",
      "startedAt": "2025-01-15T10:30:00Z",
      "completedAt": "2025-01-15T10:30:15Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

## Approval Operations

### `GET /approval/pending`

List all workflows currently waiting for human approval.

**Response** `200 OK`:

```json
{
  "pending": [
    {
      "workflowId": "tool-agent-a1b2c3d4-...-call_abc123",
      "parentWorkflowId": "agent-a1b2c3d4-...",
      "toolCall": {
        "id": "call_abc123",
        "name": "file-write",
        "arguments": {
          "path": "summary.txt",
          "content": "TypeScript 5.5 summary..."
        }
      },
      "riskLevel": "medium",
      "description": "Write file: summary.txt (156 bytes)",
      "waitingSince": "2025-01-15T10:30:10Z"
    }
  ],
  "count": 1
}
```

---

### `POST /approval/:workflowId/approve`

Approve a pending tool execution.

**Path Parameters**:

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The **tool execution workflow** ID (not the parent agent workflow) |

**Request Body**:

```json
{
  "modifiedArguments": {}
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `modifiedArguments` | object | No | Override the tool's arguments before execution |

**Response** `200 OK`:

```json
{
  "message": "Approval sent",
  "workflowId": "tool-agent-a1b2c3d4-...-call_abc123"
}
```

**Example** — Approve with modified path:

```bash
curl -X POST http://localhost:3000/approval/tool-agent-xxx-call_abc123/approve \
  -H "Content-Type: application/json" \
  -d '{
    "modifiedArguments": {
      "path": "research/summary.txt",
      "content": "TypeScript 5.5 summary..."
    }
  }'
```

**Example** — Approve as-is:

```bash
curl -X POST http://localhost:3000/approval/tool-agent-xxx-call_abc123/approve \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### `POST /approval/:workflowId/reject`

Reject a pending tool execution.

**Path Parameters**: Same as approve

**Request Body**:

```json
{
  "reason": "string (optional)"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | string | No | Reason for rejection (sent to the agent) |

**Response** `200 OK`:

```json
{
  "message": "Rejection sent",
  "workflowId": "tool-agent-a1b2c3d4-...-call_abc123"
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/approval/tool-agent-xxx-call_abc123/reject \
  -H "Content-Type: application/json" \
  -d '{"reason": "Please use a different filename"}'
```

After rejection, the agent receives the rejection reason and can try an alternative approach.

---

### `GET /approval/:workflowId/status`

Get the approval status of a specific tool execution workflow.

**Path Parameters**: Same as approve

**Response** `200 OK`:

```json
{
  "workflowId": "tool-agent-a1b2c3d4-...-call_abc123",
  "toolCall": {
    "id": "call_abc123",
    "name": "file-write",
    "arguments": { "path": "summary.txt", "content": "..." }
  },
  "status": "pending",
  "description": "Write file: summary.txt (156 bytes)",
  "riskLevel": "medium"
}
```

---

## Real-Time Events (SSE)

### `GET /events`

Server-Sent Events endpoint for real-time workflow updates.

**Query Parameters**:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `workflowId` | string | No | Watch a specific workflow |
| `watchAll` | boolean | No | Watch all agent workflows |

**Response**: `text/event-stream`

**Event Types**:

| Event | Data | Description |
|---|---|---|
| `state_update` | `{ workflowId, status }` | Workflow status changed |
| `tool_call` | `{ workflowId, toolCall, result? }` | Tool execution started or completed |
| `approval_needed` | `{ workflowId, childWorkflowId, toolCall, riskLevel }` | Waiting for human approval |
| `completed` | `{ workflowId, result }` | Workflow finished |
| `error` | `{ workflowId, error }` | Workflow failed |
| `heartbeat` | `{}` | Keep-alive (every 30s) |

**Example**:

```bash
curl -N http://localhost:3000/events?workflowId=agent-a1b2c3d4-...
```

Output:
```
event: state_update
data: {"workflowId":"agent-a1b2c3d4-...","status":"running"}

event: tool_call
data: {"workflowId":"agent-a1b2c3d4-...","toolCall":{"name":"web-search","arguments":{"query":"TypeScript 5.5"}}}

event: tool_call
data: {"workflowId":"agent-a1b2c3d4-...","toolCall":{"name":"web-search"},"result":{"success":true,"output":"..."}}

event: completed
data: {"workflowId":"agent-a1b2c3d4-...","result":{"finalAnswer":"...","iterations":3}}
```

**JavaScript Client**:

```javascript
const source = new EventSource("http://localhost:3000/events?workflowId=agent-xxx");

source.addEventListener("state_update", (e) => {
  const data = JSON.parse(e.data);
  console.log(`Status: ${data.status}`);
});

source.addEventListener("approval_needed", (e) => {
  const data = JSON.parse(e.data);
  console.log(`Approval needed for: ${data.toolCall.name}`);
  // Show approval UI
});

source.addEventListener("completed", (e) => {
  const data = JSON.parse(e.data);
  console.log(`Done: ${data.result.finalAnswer}`);
  source.close();
});
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Error Codes

| HTTP Status | Code | Description |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Invalid request body or parameters |
| `404` | `WORKFLOW_NOT_FOUND` | No workflow with the given ID |
| `409` | `WORKFLOW_RUNNING` | Operation conflicts with workflow state |
| `409` | `WORKFLOW_NOT_RUNNING` | Workflow is not in expected state |
| `422` | `INVALID_TOOL_CALL` | Tool call validation failed |
| `500` | `INTERNAL_ERROR` | Unexpected server error |
| `503` | `TEMPORAL_UNAVAILABLE` | Cannot connect to Temporal server |

### Example Error Responses

**400 Validation Error**:
```json
{
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fields": {
      "prompt": "Required field"
    }
  }
}
```

**404 Not Found**:
```json
{
  "error": "Workflow not found",
  "code": "WORKFLOW_NOT_FOUND",
  "details": {
    "workflowId": "agent-xxxxx"
  }
}
```

**409 Conflict**:
```json
{
  "error": "Workflow is still running. Use GET to check status.",
  "code": "WORKFLOW_RUNNING",
  "details": {
    "workflowId": "agent-a1b2c3d4-...",
    "currentStatus": "running"
  }
}
```
