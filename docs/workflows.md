# Workflow Design & Patterns

This document provides detailed documentation for the Temporal workflows that power the agent system.

---

## Table of Contents

1. [Overview](#overview)
2. [Agent Workflow](#agent-workflow)
3. [Tool Execution Workflow](#tool-execution-workflow)
4. [Signals & Queries Reference](#signals--queries-reference)
5. [State Transitions](#state-transitions)
6. [Temporal Best Practices](#temporal-best-practices)
7. [Workflow Versioning](#workflow-versioning)
8. [Continue-As-New Pattern](#continue-as-new-pattern)

---

## Overview

The system uses two Temporal workflows:

| Workflow | Purpose | Type |
|---|---|---|
| `agentWorkflow` | Main agent reasoning loop | Top-level workflow |
| `toolExecutionWorkflow` | Execute a single tool with optional approval | Child workflow |

```
agentWorkflow (parent)
├── Activity: callLLM
├── Activity: executeTool (for auto-approved tools)
├── Child Workflow: toolExecutionWorkflow (for tools needing approval)
│   ├── Signal: approvalSignal (approve/reject)
│   ├── Query: approvalStatus (poll current status)
│   └── Activity: executeTool (after approval)
├── Child Workflow: toolExecutionWorkflow (next approved tool)
│   └── ...
└── Activity: callLLM (next iteration)
```

---

## Agent Workflow

### Identity

| Property | Value |
|---|---|
| Workflow Type | `agentWorkflow` |
| Task Queue | `agent-task-queue` |
| Workflow ID | `agent-{uuid}` (auto-generated) |
| Execution Timeout | 1 hour (configurable) |
| Run Timeout | 1 hour |
| Task Timeout | 10 seconds |

### Input

```typescript
interface AgentWorkflowInput {
  /** The user's prompt / message to the agent */
  prompt: string;

  /** System prompt to set agent behavior and persona */
  systemPrompt?: string;

  /** Maximum number of LLM call iterations (default: 20) */
  maxIterations?: number;

  /** 
   * Optional session ID for conversation continuity.
   * If provided, the workflow ID will be "agent-{sessionId}".
   */
  sessionId?: string;
}
```

### Output

```typescript
interface AgentWorkflowOutput {
  /** The agent's final answer */
  finalAnswer: string;

  /** Number of LLM call iterations used */
  iterations: number;

  /** Total tool calls executed */
  toolCallsExecuted: number;

  /** Number of tools that required human approval */
  approvalsRequested: number;

  /** Final status */
  status: "completed" | "max_iterations" | "error";

  /** Error message if status is "error" */
  error?: string;
}
```

### Internal State (Queryable)

```typescript
interface AgentWorkflowState {
  /** Full conversation history */
  messages: AgentMessage[];

  /** Current iteration number */
  iteration: number;

  /** Current workflow status */
  status: "running" | "waiting_approval" | "completed" | "failed";

  /** Current pending approval (if any) */
  pendingApproval?: {
    toolCallId: string;
    toolName: string;
    arguments: Record<string, any>;
    riskLevel: "low" | "medium" | "high";
    description: string;
    childWorkflowId: string;
  };

  /** Tool calls executed so far (count) */
  toolCallsExecuted: number;

  /** Approvals requested so far (count) */
  approvalsRequested: number;
}
```

### Execution Flow

```
START
  │
  ▼
Initialize state
messages = [system prompt (if any)]
messages.push(user prompt)
iteration = 0
status = "running"
│
▼
┌─────────────────────────────────────┐
│ iteration < maxIterations?          │
│                                     │
│ NO ──► Return result with           │
│        status: "max_iterations"     │
│                                     │
│ YES ──► iteration++                 │
│         │                           │
│         ▼                           │
│    ┌────────────────────────────┐   │
│    │ Activity: callLLM          │   │
│    │ Input: messages + tools    │   │
│    │ Retry: 3x exp backoff     │   │
│    │ Timeout: 60s              │   │
│    └────────────┬───────────────┘   │
│                 │                    │
│                 ▼                    │
│    Add assistant response to messages│
│                 │                    │
│                 ▼                    │
│    ┌────────────────────────────┐   │
│    │ LLM returned tool calls?  │   │
│    │                            │   │
│    │ NO ──► Return result with  │   │
│    │        status: "completed" │   │
│    │                            │   │
│    │ YES ──► For each tool call │   │
│    │         │                  │   │
│    │         ▼                  │   │
│    │  ┌──────────────────────┐  │   │
│    │  │ Tool requires        │  │   │
│    │  │ approval?            │  │   │
│    │  │                      │  │   │
│    │  │ YES ──► Start child  │  │   │
│    │  │   toolExecutionWF    │  │   │
│    │  │   status =           │  │   │
│    │  │   "waiting_approval" │  │   │
│    │  │                      │  │   │
│    │  │ NO ──► Activity:     │  │   │
│    │  │   executeTool        │  │   │
│    │  └──────────────────────┘  │   │
│    │         │                  │   │
│    │         ▼                  │   │
│    │   Add tool result to       │   │
│    │   messages                 │   │
│    │         │                  │   │
│    └─────────┼──────────────────┘   │
│              │                      │
│              ▼                      │
│     status = "running"              │
│              │                      │
└──────────────┘ (loop back)
```

### Code Structure

```typescript
// src/workflows/agent.workflow.ts

import { proxyActivities, startChildWorkflow, condition, defineQuery, defineSignal, setQueryHandler, setHandler, workflowInfo } from "@temporalio/workflow";
import type * as activities from "../activities";
import { AgentWorkflowInput, AgentWorkflowOutput, AgentWorkflowState, AgentMessage } from "../shared/types";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MAX_ITERATIONS, MAX_STATE_MESSAGES } from "../shared/constants";

const { callLLM, executeTool } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "10 seconds",
    maximumAttempts: 3,
  },
});

export async function agentWorkflow(input: AgentWorkflowInput): Promise<AgentWorkflowOutput> {
  // ... implementation
}
```

---

## Tool Execution Workflow

This is a **child workflow** started by `agentWorkflow` when a tool requires human approval.

### Identity

| Property | Value |
|---|---|
| Workflow Type | `toolExecutionWorkflow` |
| Task Queue | `agent-task-queue` |
| Workflow ID | `tool-{parentWfId}-{toolCallId}` |
| Execution Timeout | 24 hours (configurable) |

### Input

```typescript
interface ToolExecutionInput {
  /** The tool call details */
  toolCall: {
    id: string;
    name: string;
    arguments: Record<string, any>;
  };

  /** Description shown to the human reviewer */
  description: string;

  /** Risk level for this tool */
  riskLevel: "low" | "medium" | "high";

  /** Timeout duration for waiting on approval (default: 24h) */
  approvalTimeout?: string;
}
```

### Output

```typescript
interface ToolExecutionOutput {
  toolCallId: string;
  success: boolean;
  output: string;
  error?: string;
}
```

### Signals

| Signal Name | Payload | Description |
|---|---|---|
| `approvalSignal` | `ApprovalResponse` | Send approval or rejection decision |

```typescript
interface ApprovalResponse {
  approved: boolean;
  modifiedArguments?: Record<string, any>;
  reason?: string;
}
```

### Queries

| Query Name | Return Type | Description |
|---|---|---|
| `approvalStatus` | `ApprovalStatus` | Current approval state for polling |

```typescript
interface ApprovalStatus {
  toolCall: ToolCall;
  status: "pending" | "approved" | "rejected" | "timeout" | "executing" | "completed";
  description: string;
  riskLevel: "low" | "medium" | "high";
}
```

### Execution Flow

```
START
  │
  ▼
Register signal handler (approvalSignal)
Register query handler (approvalStatus)
  │
  ▼
status = "pending"
  │
  ▼
Wait: condition(approvalDecision !== null, approvalTimeout)
  │
  ├── Timeout expired ──► status = "timeout"
  │                       Return { success: false, error: "Approval timeout" }
  │
  └── Signal received
      │
      ├── Rejected ──► status = "rejected"
      │                Return { success: false, error: reason }
      │
      └── Approved ──► status = "executing"
                        │
                        ▼
                   Activity: executeTool
                   (with original or modified arguments)
                        │
                        ▼
                   status = "completed"
                   Return tool result
```

### Code Structure

```typescript
// src/workflows/tool-execution.workflow.ts

import { proxyActivities, condition, defineSignal, defineQuery, setQueryHandler, setHandler } from "@temporalio/workflow";
import type * as activities from "../activities";
import { ToolExecutionInput, ToolExecutionOutput, ApprovalResponse, ApprovalStatus } from "../shared/types";
import { DEFAULT_APPROVAL_TIMEOUT } from "../shared/constants";

const { executeTool } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 seconds",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "5 seconds",
    maximumAttempts: 2,
  },
});

export const approvalSignal = defineSignal<[ApprovalResponse]>("approvalSignal");
export const approvalStatusQuery = defineQuery<ApprovalStatus>("approvalStatus");

export async function toolExecutionWorkflow(input: ToolExecutionInput): Promise<ToolExecutionOutput> {
  // ... implementation
}
```

---

## Signals & Queries Reference

### Agent Workflow

| Type | Name | Purpose |
|---|---|---|
| Query | `getState` | Returns full `AgentWorkflowState` for status polling |
| Signal | `cancel` | Requests workflow cancellation |

### Tool Execution Workflow

| Type | Name | Purpose |
|---|---|---|
| Query | `approvalStatus` | Returns current approval state |
| Signal | `approvalSignal` | Sends approve/reject decision |

### Usage from API

```typescript
// Get workflow state (query)
const state = await handle.query(getStateQuery);

// Send approval (signal)
await handle.signal(approvalSignal, { approved: true });

// Cancel workflow
await handle.cancel();
```

---

## State Transitions

### Agent Workflow States

```
                    ┌───────────┐
                    │  running  │◄──────────────┐
                    └─────┬─────┘               │
                          │                     │
            LLM returns   │    Tool approved    │
            tool calls    │    and executed     │
            needing       │                     │
            approval      │                     │
                          │                     │
                          ▼                     │
                    ┌──────────────┐            │
                    │ waiting_     │────────────┘
                    │ approval    │
                    └─────┬───────┘
                          │
              ┌───────────┼───────────┐
              │                       │
        LLM returns           Max iterations
        no tool calls         reached
              │                       │
              ▼                       ▼
        ┌───────────┐         ┌────────────────┐
        │ completed │         │ max_iterations │
        └───────────┘         └────────────────┘

     Any unhandled error
              │
              ▼
        ┌───────────┐
        │  failed   │
        └───────────┘
```

### Tool Execution States

```
┌─────────┐    Signal:      ┌──────────┐    Execute     ┌───────────┐
│ pending │──── approve ───►│ approved │──── tool ─────►│ completed │
└────┬────┘                 └──────────┘                └───────────┘
     │
     │    Signal:      ┌──────────┐
     ├──── reject ────►│ rejected │
     │                 └──────────┘
     │
     │    Timeout      ┌─────────┐
     └────────────────►│ timeout │
                       └─────────┘
```

---

## Temporal Best Practices

### 1. Determinism

Workflows MUST be deterministic. The same workflow code with the same inputs must produce the same sequence of commands.

**Rules:**
- No `Date.now()`, `Math.random()`, `UUID.generate()` in workflow code
- No network calls, filesystem access, or external API calls in workflow code
- No mutable module-level state
- All side effects go in activities

```typescript
// BAD — non-deterministic
if (Date.now() > someTime) { ... }

// GOOD — use Temporal's workflow info
import { workflowInfo } from "@temporalio/workflow";
if (workflowInfo().workflowExecutionTimeoutMs > someTime) { ... }
```

### 2. Activity Granularity

Keep activities focused and idempotent:

- **callLLM**: Single LLM call — can be retried safely (LLM may return different results, but the workflow handles this)
- **executeTool**: Single tool execution — tools should be idempotent where possible

### 3. Workflow State Size

Temporal limits workflow event history. Manage state size:

- Truncate old messages beyond `MAX_STATE_MESSAGES`
- Don't store large payloads in workflow state — return summaries from activities
- Use `continueAsNew` for very long conversations

### 4. Timeout Configuration

```typescript
// Activity timeouts
const { callLLM } = proxyActivities({
  startToCloseTimeout: "60 seconds",    // Total activity execution time
  scheduleToCloseTimeout: "120 seconds", // Including queue wait time
  heartbeatTimeout: "30 seconds",       // For long-running activities
});

// Child workflow timeouts
await startChildWorkflow(toolExecutionWorkflow, input, {
  workflowExecutionTimeout: "24 hours",  // Max total time including approval wait
  workflowTaskTimeout: "10 seconds",
});
```

### 5. Error Handling in Workflows

```typescript
import { ActivityFailure, ApplicationFailure } from "@temporalio/common";

try {
  const result = await callLLM({ messages, tools });
} catch (err) {
  if (err instanceof ActivityFailure) {
    // Activity failed after all retries
    // Add error context to messages and continue
    messages.push({
      role: "system",
      content: `LLM call failed: ${err.message}. Please try a different approach.`,
    });
  } else {
    // Unexpected error — fail the workflow
    throw ApplicationFailure.nonRetryable(err.message, "UnexpectedError");
  }
}
```

---

## Workflow Versioning

When you need to change workflow logic, use Temporal's versioning to ensure in-flight workflows aren't broken:

```typescript
import { defineQuery, defineSignal, setHandler, condition } from "@temporalio/workflow";

// In the workflow:
const version = workflowInfo().searchAttributes?.version || "v1";

// Use getVersion for patching in-flight workflows
import { patched } from "@temporalio/workflow";

if (patched("add-summary-step")) {
  // New behavior
  await summarizeMessages(messages);
} else {
  // Old behavior (for in-flight workflows started before the patch)
  // ...
}
```

### Versioning Strategy

1. **Patch-based** (recommended for small changes): Use `patched()` to add new behavior without breaking in-flight workflows
2. **New workflow type** (for major changes): Create `agentWorkflowV2` and update the API to use it

---

## Continue-As-New Pattern

For conversations that exceed the event history limit, use `continueAsNew` to start a fresh workflow with compacted state:

```typescript
import { continueAsNew } from "@temporalio/workflow";

if (messages.length > MAX_STATE_MESSAGES * 2) {
  // Summarize old messages
  const summary = await summarizeActivity(messages.slice(0, -MAX_STATE_MESSAGES));
  
  // Continue with compacted state
  await continueAsNew<typeof agentWorkflow>({
    prompt: "", // Don't re-add the original prompt
    systemPrompt: input.systemPrompt,
    maxIterations: input.maxIterations,
    sessionId: workflowInfo().workflowId.replace("agent-", ""),
    _compactedMessages: [
      { role: "system", content: `Previous conversation summary: ${summary}` },
      ...messages.slice(-MAX_STATE_MESSAGES),
    ],
  });
}
```

This preserves conversation continuity while keeping Temporal's event history manageable.
