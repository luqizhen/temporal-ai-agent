# Architecture & Design Decisions

This document provides a detailed view of the system architecture, design rationale, data flows, and key technical decisions.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Component Design](#component-design)
3. [Data Flow](#data-flow)
4. [Agent Workflow Design](#agent-workflow-design)
5. [Tool Execution & Approval](#tool-execution--approval)
6. [LLM Provider Abstraction](#llm-provider-abstraction)
7. [State Management](#state-management)
8. [Error Handling & Resilience](#error-handling--resilience)
9. [Security Considerations](#security-considerations)
10. [Design Decisions Log](#design-decisions-log)

---

## System Architecture

### High-Level Topology

```
                         ┌──────────────────┐
                         │   User / Client  │
                         └────────┬─────────┘
                                  │
                          HTTP / SSE (port 3000)
                                  │
                         ┌────────▼─────────┐
                         │   API Server     │
                         │   (Fastify)      │
                         │                  │
                         │ Routes:          │
                         │  /agent/*        │
                         │  /approval/*     │
                         │  /events (SSE)   │
                         └──┬───────────┬───┘
                            │           │
                 Temporal Client     Direct call
                 (start/signals)    (for SSE)
                            │           │
         ┌──────────────────▼───────────▼──────┐
         │          Temporal Server             │
         │                                      │
         │  ┌──────────────────────────────┐    │
         │  │      Persistence Layer       │    │
         │  │   (PostgreSQL + Elasticsearch│    │
         │  │    for visibility)           │    │
         │  └──────────────────────────────┘    │
         └──────────────────┬───────────────────┘
                            │
              Task Queue: "agent-task-queue"
                            │
         ┌──────────────────▼───────────────────┐
         │          Temporal Worker              │
         │                                       │
         │  Workflows:                           │
         │   ├── agentWorkflow                   │
         │   └── toolExecutionWorkflow           │
         │                                       │
         │  Activities:                          │
         │   ├── callLLM ──────► LLM Provider   │
         │   ├── executeTool ──► Tool Registry   │
         │   └── (tool-specific activities)      │
         └───────────────────────────────────────┘
```

### Infrastructure Stack

```
docker-compose.yml
├── postgresql         # Temporal persistence (port 5432)
├── temporal           # Temporal server (port 7233)
├── temporal-web       # Temporal Web UI (port 8080)
├── app-api            # API server (port 3000)
└── app-worker         # Temporal worker process
```

---

## Component Design

### 1. Shared Layer (`src/shared/`)

The shared layer provides types, constants, and configuration used across all other components.

**`types.ts`** — Core domain types:

```
AgentMessage
├── role: "system" | "user" | "assistant" | "tool"
├── content: string
├── toolCalls?: ToolCall[]
└── toolCallId?: string          // for tool role messages

ToolCall
├── id: string
├── name: string
├── arguments: Record<string, any>

ToolResult
├── toolCallId: string
├── success: boolean
├── output: string
├── error?: string

AgentRunInput
├── prompt: string
├── systemPrompt?: string
├── maxIterations?: number
├── sessionId?: string

AgentRunResult
├── finalAnswer: string
├── iterations: number
├── toolCallsExecuted: number
├── approvalsRequested: number
├── status: "completed" | "max_iterations" | "error"

WorkflowState
├── messages: AgentMessage[]
├── iteration: number
├── status: "running" | "waiting_approval" | "completed" | "failed"
├── pendingApproval?: ApprovalRequest

ApprovalRequest
├── toolCallId: string
├── toolName: string
├── arguments: Record<string, any>
├── riskLevel: "low" | "medium" | "high"
├── description: string

ApprovalResponse
├── approved: boolean
├── modifiedArguments?: Record<string, any>
├── reason?: string
```

**`constants.ts`**:

| Constant | Value | Purpose |
|---|---|---|
| `TASK_QUEUE` | `"agent-task-queue"` | Temporal task queue name |
| `AGENT_WORKFLOW_ID` | `"agent-workflow"` | Workflow type identifier |
| `TOOL_WORKFLOW_ID` | `"tool-execution-workflow"` | Tool child workflow type |
| `DEFAULT_MAX_ITERATIONS` | `20` | Agent loop safety limit |
| `DEFAULT_APPROVAL_TIMEOUT` | `"24 hours"` | Human approval deadline |
| `MAX_STATE_MESSAGES` | `50` | Truncate conversation beyond this |

**`config.ts`** — Reads and validates environment variables, exports a typed `Config` object:

```
Config
├── temporal: { address, namespace }
├── llm: { baseUrl, apiKey, model, maxTokens, temperature }
├── agent: { maxIterations, approvalTimeoutHours, workspaceDir }
└── api: { port, corsOrigin }
```

---

### 2. LLM Provider Layer (`src/llm/`)

**`provider.interface.ts`**:

```typescript
interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number };
  finishReason: "stop" | "tool_calls" | "length";
}

interface LLMProvider {
  chat(messages: AgentMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
```

**`openai-compatible.ts`** — Uses the `openai` npm package:

- Configurable `baseURL` (points to Z.AI endpoint by default)
- Converts `AgentMessage[]` to OpenAI message format
- Converts `ToolDefinition[]` to OpenAI function format
- Parses responses into unified `LLMResponse`
- Handles rate limiting (429) and server errors (5xx) with retries

**`factory.ts`**:

```typescript
function createLLMProvider(config?: Partial<LLMConfig>): LLMProvider
```

Reads from `Config.llm`, allows override. Currently returns `OpenAICompatibleProvider`. Future: switch on provider type to return Anthropic, Ollama, etc.

---

### 3. Tool System (`src/tools/`)

**`tool.interface.ts`**:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;           // JSON Schema for input validation
  requiresApproval: boolean;        // Does this tool need human sign-off?
  riskLevel: "low" | "medium" | "high";
  execute(params: Record<string, any>): Promise<ToolResult>;
}
```

**`registry.ts`**:

```typescript
class ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool;
  list(): Tool[];
  getOpenAIToolDefinitions(): OpenAIToolDef[];   // Convert all tools to OpenAI format
}
```

The registry is a singleton. Tools are registered at worker startup.

#### Built-in Tools

| Tool | Approval | Risk | Key Parameters |
|---|---|---|---|
| **web-search** | No | Low | `query: string`, `maxResults?: number` |
| **code-execution** | Yes | High | `code: string`, `language: "js" \| "py"`, `timeout?: number` |
| **file-read** | No | Low | `path: string` |
| **file-write** | Yes | Medium | `path: string`, `content: string` |
| **http-request** | Yes* | Medium | `url: string`, `method: string`, `headers?: object`, `body?: string` |

*http-request requires approval for POST/PUT/DELETE; GET is auto-approved.

---

### 4. Activities Layer (`src/activities/`)

Activities are the only place where side effects happen. They are pure wrappers that delegate to the LLM provider and tool registry.

**`llm.activity.ts`** — `callLLM`:

```
Input:  { messages: AgentMessage[], tools: ToolDefinition[] }
Output: LLMResponse
Side effects: HTTP call to LLM API
Retry: 3 attempts, exponential backoff (1s, 3s, 9s)
Timeout: 60 seconds
```

**`tool.activity.ts`** — `executeTool`:

```
Input:  { toolName: string, params: Record<string, any> }
Output: ToolResult
Side effects: Depends on the tool (HTTP, filesystem, process spawn)
Retry: 2 attempts for transient errors (network, timeout)
Timeout: 120 seconds (300s for code-execution)
```

**Important**: Activities must be stateless and idempotent where possible. The activity function receives all needed context as parameters — no module-level mutable state.

---

### 5. Workflows Layer (`src/workflows/`)

See [Workflow Design](./workflows.md) for detailed workflow documentation.

**`agent.workflow.ts`** — Main agent loop (see [Agent Workflow Design](#agent-workflow-design) below)

**`tool-execution.workflow.ts`** — Child workflow with approval gate (see [Tool Execution & Approval](#tool-execution--approval) below)

---

### 6. Worker (`src/worker/`)

Single-process worker that:

1. Creates a `Worker` instance with `TASK_QUEUE`
2. Registers all workflows (`agentWorkflow`, `toolExecutionWorkflow`)
3. Registers all activities (`callLLM`, `executeTool`)
4. Initializes the `ToolRegistry` with all built-in tools
5. Creates the `LLMProvider` via factory
6. Runs until SIGINT/SIGTERM, then graceful shutdown

---

### 7. API Server (`src/api/`)

Fastify-based HTTP server with JSON schemas for request/response validation.

**Middleware**:
- CORS (`@fastify/cors`)
- Request logging
- Error handler (maps to JSON error responses)

**SSE (`sse.ts`)**:
- Endpoint: `GET /events?workflowId=xxx`
- Polls workflow state at regular intervals
- Pushes updates as SSE events
- Event types: `state_update`, `tool_call`, `approval_needed`, `completed`

---

## Data Flow

### Happy Path — Agent Execution

```
1. Client       ──POST /agent/start──►  API Server
2. API Server   ──workflowClient.start(agentWorkflow, input)──► Temporal
3. Temporal     ──schedule task──► Worker
4. Worker       ──agentWorkflow starts──►
5. Workflow     ──callLLM activity──► LLM Provider
6. LLM Provider ──HTTP POST──► Z.AI API
7. LLM Provider ──response──► Activity ──► Workflow
8. Workflow     ──parse tool calls──►
9. Workflow     ──executeTool activity──► Tool Registry
10.Tool         ──side effect (search/code/file)──► External Service
11.Tool         ──result──► Activity ──► Workflow
12.Workflow     ──(repeat 5-11 until no more tool calls)──►
13.Workflow     ──return final answer──► Temporal
14.Client       ──GET /agent/:id──► API ──query──► Temporal ──► Client
```

### Approval Path — Human-in-the-Loop

```
1. Workflow     ──detects tool requiring approval──►
2. Workflow     ──starts toolExecutionWorkflow (child)──►
3. Child WF     ──sets query handler for approval status──►
4. Client       ──GET /agent/:id──► sees "waiting_approval" status
5. Client       ──POST /approval/:wfId/approve──► API
6. API          ──workflowClient.getHandle().signal(approvalSignal, {approved: true})──► Temporal
7. Child WF     ──condition resolves──► executes tool──► returns result
8. Parent WF    ──continues with tool result──►
```

### Failure & Recovery Path

```
1. Worker crashes mid-execution
2. Temporal detects heartbeat failure
3. Temporal re-schedules the activity on another worker (or same after restart)
4. Activity replays from the beginning (must be idempotent)
5. Workflow continues from the last completed activity
6. No state loss — full conversation history preserved in Temporal event history
```

---

## Agent Workflow Design

### Pseudocode

```
workflow agentWorkflow(input: AgentRunInput): AgentRunResult {
  state = {
    messages: [{ role: "system", content: input.systemPrompt || DEFAULT_SYSTEM_PROMPT }],
    iteration: 0,
    status: "running"
  }
  state.messages.push({ role: "user", content: input.prompt })

  maxIter = input.maxIterations || DEFAULT_MAX_ITERATIONS

  while (state.iteration < maxIter) {
    state.iteration++

    // Call LLM
    llmResponse = await executeActivity(callLLM, {
      messages: truncateMessages(state.messages),
      tools: toolRegistry.getOpenAIToolDefinitions()
    })

    // Add assistant message
    state.messages.push({
      role: "assistant",
      content: llmResponse.content,
      toolCalls: llmResponse.toolCalls
    })

    // No tool calls → agent is done
    if (llmResponse.toolCalls.length === 0) {
      state.status = "completed"
      return buildResult(state, llmResponse)
    }

    // Process tool calls
    for (toolCall of llmResponse.toolCalls) {
      tool = toolRegistry.get(toolCall.name)

      if (tool.requiresApproval) {
        // Start child workflow with approval gate
        state.status = "waiting_approval"
        state.pendingApproval = buildApprovalRequest(toolCall)

        result = await executeChildWorkflow(toolExecutionWorkflow, {
          toolCall,
          timeout: DEFAULT_APPROVAL_TIMEOUT
        })
      } else {
        // Direct execution
        result = await executeActivity(executeTool, {
          toolName: toolCall.name,
          params: toolCall.arguments
        })
      }

      // Add tool result to messages
      state.messages.push({
        role: "tool",
        content: result.output,
        toolCallId: toolCall.id
      })
    }

    state.status = "running"
  }

  // Hit max iterations
  state.status = "max_iterations"
  return buildTruncatedResult(state)
}
```

### Key Design Points

1. **Message truncation**: Only the last `MAX_STATE_MESSAGES` messages are sent to the LLM to stay within context limits and control Temporal state size. A summary of older messages can be prepended.

2. **Sequential tool execution**: Tool calls from a single LLM response are executed sequentially. This is simpler and safer than parallel execution. Future optimization: parallel execution for independent tools.

3. **Child workflow for approval**: Using a child workflow (not just an activity) for approved tools provides:
   - Independent retry policies
   - Separate timeout management
   - Clean separation of approval state from main workflow state
   - Ability to cancel approval independently

4. **Workflow query support**: The workflow registers query handlers so the API can poll state without needing a separate store.

---

## Tool Execution & Approval

### Tool Execution Workflow

```
workflow toolExecutionWorkflow(input: { toolCall, timeout }) {
  approvalDecision = null

  // Signal handler — receives approval/rejection
  setHandler(approvalSignal, (response: ApprovalResponse) => {
    approvalDecision = response
  })

  // Query handler — API can check status
  setQueryHandler("approvalStatus", () => ({
    toolCall: input.toolCall,
    status: approvalDecision === null ? "pending" :
            approvalDecision.approved ? "approved" : "rejected"
  }))

  // Wait for approval with timeout
  approved = await condition(
    () => approvalDecision !== null,
    input.timeout || DEFAULT_APPROVAL_TIMEOUT
  )

  if (!approved || !approvalDecision.approved) {
    return {
      toolCallId: input.toolCall.id,
      success: false,
      output: "Tool execution was not approved",
      error: approvalDecision?.reason || "Approval timeout"
    }
  }

  // Execute with (possibly modified) arguments
  return await executeActivity(executeTool, {
    toolName: input.toolCall.name,
    params: approvalDecision.modifiedArguments || input.toolCall.arguments
  })
}
```

### Approval Lifecycle

```
┌───────────────┐     ┌──────────────┐     ┌──────────────┐
│ Tool requires │     │ Workflow     │     │ Human        │
│ approval      │────►│ waits on     │────►│ reviews in   │
│               │     │ condition()  │     │ UI / API     │
└───────────────┘     └──────┬───────┘     └──────┬───────┘
                             │                    │
                    ┌────────▼────────┐  ┌────────▼────────┐
                    │ Timeout expires │  │ Signal received  │
                    │ → auto-reject   │  │ → approve/reject │
                    └────────┬────────┘  └────────┬────────┘
                             │                    │
                             └────────┬───────────┘
                                      ▼
                             ┌──────────────┐
                             │ If approved: │
                             │ Execute tool │
                             │ Return result│
                             └──────────────┘
```

---

## LLM Provider Abstraction

### Provider Interface

```
LLMProvider
├── chat(messages, tools?) → LLMResponse
```

The interface is intentionally minimal. Each provider handles:

1. **Message conversion**: `AgentMessage[]` → provider-specific format
2. **Tool conversion**: `ToolDefinition[]` → provider-specific function calling format
3. **Response parsing**: provider response → unified `LLMResponse`
4. **Error handling**: provider-specific errors → unified error types

### OpenAI-Compatible Provider

Used for Z.AI, OpenAI, and any endpoint that follows the OpenAI API spec:

```
Configuration:
  baseURL: process.env.LLM_BASE_URL   (e.g., "https://api.z.ai/v1")
  apiKey:   process.env.LLM_API_KEY
  model:    process.env.LLM_MODEL     (e.g., "glm-4")

Request:
  POST {baseURL}/chat/completions
  Body: { model, messages, tools, max_tokens, temperature }

Response mapping:
  choices[0].finish_reason === "tool_calls" → toolCalls parsed
  choices[0].finish_reason === "stop"       → content returned
  choices[0].message.tool_calls             → ToolCall[]
```

### Future Providers

To add a new provider (e.g., Anthropic):

1. Create `src/llm/anthropic.ts` implementing `LLMProvider`
2. Add the provider type to `src/llm/factory.ts`
3. Add configuration variables (e.g., `ANTHROPIC_API_KEY`)
4. No changes to workflows or activities needed

---

## State Management

### What Gets Stored in Temporal State

| Data | Storage Strategy |
|---|---|
| Conversation messages | Workflow state (up to `MAX_STATE_MESSAGES`) |
| Current iteration count | Workflow state |
| Workflow status | Workflow state (queryable) |
| Pending approval info | Workflow state (queryable) |
| LLM response metadata | Activity result (in event history) |
| Tool execution results | Activity result (in event history) |

### State Size Control

Temporal has limits on workflow event history size. To manage this:

1. **Message truncation**: Only keep the last N messages in workflow state
2. **Summary generation**: When truncating, use the LLM to generate a summary of removed messages
3. **Continue-as-new**: For very long conversations, use Temporal's `continueAsNew` to start a fresh workflow with compacted state

### External State (Future)

For production deployments with very long conversations:

- Offload full message history to Redis or PostgreSQL
- Store only a reference (conversation ID) in workflow state
- Activities read/write from the external store

---

## Error Handling & Resilience

### Activity Retry Policies

| Activity | Max Attempts | Initial Interval | Maximum Interval | Timeout |
|---|---|---|---|---|
| `callLLM` | 3 | 1s | 10s | 60s |
| `executeTool` (web-search) | 3 | 2s | 15s | 30s |
| `executeTool` (http-request) | 3 | 1s | 10s | 60s |
| `executeTool` (code-execution) | 1 | — | — | 300s |
| `executeTool` (file-io) | 2 | 1s | 5s | 30s |

### Workflow-Level Error Handling

```typescript
try {
  result = await executeActivity(callLLM, { ... });
} catch (error) {
  if (error instanceof ActivityFailure) {
    // All retries exhausted
    state.messages.push({
      role: "system",
      content: `LLM call failed after retries: ${error.message}. Attempting to continue.`
    });
    // Try again in next iteration — the LLM might recover
  }
}
```

### Cancellation

- Client can cancel a running workflow via `DELETE /agent/:workflowId`
- Temporal propagates cancellation to all running activities and child workflows
- Activities should check `context().cancelled` for clean shutdown

### Dead Letter

- Workflows that hit max iterations are marked as `"max_iterations"` status
- Failed workflows are marked as `"failed"` with error details
- These can be queried and inspected via the API or Temporal Web UI

---

## Security Considerations

### 1. Tool Sandboxing

- **Code execution**: Runs in a sandboxed process with:
  - No network access (unless explicitly granted)
  - Filesystem restricted to workspace directory
  - Memory and CPU limits
  - Execution timeout
- **File I/O**: Restricted to `WORKSPACE_DIR` — path traversal attempts are rejected
- **HTTP requests**: Blocklist for internal/private IPs (SSRF prevention)

### 2. LLM API Key Security

- API key stored only in environment variables, never in code or logs
- `.env` is in `.gitignore`
- API key is not included in workflow state or activity payloads

### 3. Approval Gate

- Destructive operations (file-write, code-execution, HTTP mutations) require human approval
- Approval includes a description of what the tool will do
- User can modify parameters before approval (e.g., change a file path)
- All approval decisions are logged in Temporal event history for audit

### 4. Input Validation

- All API endpoints validate input with JSON Schema (via Fastify schema validation)
- Tool parameters validated against their JSON Schema before execution
- LLM responses validated before processing (defensive against malformed tool calls)

---

## Design Decisions Log

### Decision 1: TypeScript over Python

**Context**: Both are viable for Temporal + AI agents.

**Decision**: TypeScript.

**Rationale**:
- Most mature Temporal SDK (written in Rust, compiled to native)
- Strong typing for complex agent state
- Fastify is one of the fastest Node.js HTTP frameworks
- OpenAI SDK is first-class in TypeScript
- Easier to share types between API, worker, and shared layer

### Decision 2: OpenAI-Compatible API as Default

**Context**: Need to support Z.AI and potentially other providers.

**Decision**: Use the OpenAI npm package with configurable `baseURL`.

**Rationale**:
- Z.AI is OpenAI-compatible — no custom SDK needed
- The `openai` package is well-maintained and feature-rich
- Switching between OpenAI-compatible providers = changing env vars only
- The provider abstraction allows future non-compatible providers

### Decision 3: Sequential Tool Execution

**Context**: LLM can return multiple tool calls in one response.

**Decision**: Execute them sequentially.

**Rationale**:
- Simpler to implement and debug
- No race conditions on shared state
- Easier to reason about approval flow
- Performance impact is minimal for typical agent use cases
- Can be optimized to parallel later if needed

### Decision 4: Child Workflow for Approval

**Context**: Need to pause execution and wait for human approval.

**Decision**: Use a separate child workflow with Signal-based approval.

**Rationale**:
- Clean isolation of approval timeout logic
- Parent workflow doesn't need to handle approval timeout directly
- Child workflow can be cancelled independently
- Approval state is queryable via the child workflow's query handler
- Aligns with Temporal best practices for human-in-the-loop

### Decision 5: Docker Compose for Local Development

**Context**: Need Temporal server for development.

**Decision**: Docker Compose with Temporal + PostgreSQL + Web UI.

**Rationale**:
- No need to install Temporal CLI separately
- Web UI provides excellent visibility into workflows
- Matches production deployment topology
- Easy to reset state (`docker compose down -v`)

### Decision 6: Fastify over Express

**Context**: Need an HTTP API server.

**Decision**: Fastify.

**Rationale**:
- 2-3x faster than Express
- Built-in JSON Schema validation for routes
- First-class TypeScript support
- Plugin architecture matches the modular tool registration pattern
- Lower overhead for SSE connections
