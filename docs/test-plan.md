# Test Plan

This document defines the test strategy, test cases, coverage targets, and tooling for the Temporal Agent project, following **Test-Driven Development (TDD)** methodology.

---

## Table of Contents

1. [TDD Methodology](#tdd-methodology)
2. [Test Pyramid](#test-pyramid)
3. [Testing Tools & Framework](#testing-tools--framework)
4. [Test Categories](#test-categories)
5. [Test Matrix](#test-matrix)
6. [Coverage Targets](#coverage-targets)
7. [Mocking Strategy](#mocking-strategy)
8. [CI Integration](#ci-integration)
9. [Quality Gate](#quality-gate)

---

## TDD Methodology

We follow strict **Red-Green-Refactor** for every component:

```
1. RED    — Write a failing test that defines the expected behavior
2. GREEN  — Write the minimum code to make the test pass
3. REFACTOR — Clean up the code while keeping tests green
```

### TDD Workflow Per Component

```
For each feature/bug:
  ┌─────────────────────────────────────┐
  │ 1. Write unit test (failing)        │
  │    - Define interface contract       │
  │    - Define expected behavior        │
  │    - Run: RED                       │
  ├─────────────────────────────────────┤
  │ 2. Implement minimum code           │
  │    - Make test pass                 │
  │    - Run: GREEN                     │
  ├─────────────────────────────────────┤
  │ 3. Refactor                         │
  │    - Clean up, extract, optimize    │
  │    - Run: Still GREEN               │
  ├─────────────────────────────────────┤
  │ 4. Write integration test           │
  │    - Test component interactions    │
  │    - Run: GREEN                     │
  ├─────────────────────────────────────┤
  │ 5. Repeat for next component        │
  └─────────────────────────────────────┘
```

### When to Write Tests First

| Scenario | Test First? |
|---|---|
| New module/interface | Yes — define contract via test |
| New tool definition | Yes — test the execute function |
| Workflow logic | Yes — test state transitions |
| API endpoint | Yes — test request/response schema |
| Bug fix | Yes — write regression test, then fix |
| Refactoring | No — existing tests are the safety net |

---

## Test Pyramid

```
           ┌──────────┐
           │   E2E    │   5% — Full workflow via Temporal test server
           │  Tests   │         (agent start → LLM → tools → result)
          ┌┴──────────┴┐
          │ Integration │   15% — Component interactions
          │   Tests     │         (workflow + activities with mocks)
         ┌┴────────────┴┐
         │               │
         │  Unit Tests   │   80% — Isolated component tests
         │               │         (tools, config, registry, API routes)
         └───────────────┘
```

### Unit Tests (80%)

Test individual functions and classes in isolation. All external dependencies are mocked.

**Scope**:
- Tool `execute()` functions
- `ToolRegistry` operations
- `LLMProvider` implementations (with mocked HTTP)
- `Config` loading and validation
- API route handlers (with mocked Temporal client)
- Utility functions

### Integration Tests (15%)

Test interactions between components. Real code, mocked external services.

**Scope**:
- Workflow logic via Temporal's `TestWorkflowEnvironment`
- Activity execution with real tools (mocked LLM)
- API server + Temporal client interaction
- Tool execution with approval flow

### E2E Tests (5%)

Test complete user scenarios through the full stack.

**Scope**:
- Start agent → LLM responds → tool executes → result returned
- Start agent → tool needs approval → approve → tool executes → result
- Start agent → LLM fails → retry → succeeds → result
- Agent hits max iterations → graceful termination

---

## Testing Tools & Framework

| Tool | Purpose | Version |
|---|---|---|
| [Vitest](https://vitest.dev/) | Test runner, assertions, mocking | ^3.x |
| [@temporalio/testing](https://docs.temporal.io/typescript/testing) | Temporal test environment (TimeSkipping) | ^1.x |
| [nock](https://github.com/nock/nock) | HTTP mocking for LLM API calls | ^14.x |
| [tsx](https://github.com/privatenumber/tsx) | TypeScript execution for tests | ^4.x |
| [c8](https://github.com/bcoe/c8) | Code coverage (native V8) | ^10.x |

### Why Vitest over Jest?

- Native ESM support (Temporal SDK is ESM-only)
- Faster watch mode
- Compatible with Temporal's testing utilities
- Drop-in Jest-compatible API

### Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 30_000,     // 30s for integration tests
    hookTimeout: 60_000,     // 60s for setup (Temporal environment)
  },
});
```

### Test Directory Structure

```
tests/
├── unit/
│   ├── shared/
│   │   ├── config.test.ts
│   │   └── types.test.ts
│   ├── llm/
│   │   ├── openai-compatible.test.ts
│   │   └── factory.test.ts
│   ├── tools/
│   │   ├── registry.test.ts
│   │   ├── web-search.test.ts
│   │   ├── code-execution.test.ts
│   │   ├── file-io.test.ts
│   │   └── http-request.test.ts
│   ├── activities/
│   │   ├── llm.activity.test.ts
│   │   └── tool.activity.test.ts
│   └── api/
│       ├── agent.routes.test.ts
│       ├── approval.routes.test.ts
│       └── health.routes.test.ts
│
├── integration/
│   ├── agent-workflow.test.ts
│   ├── tool-execution-workflow.test.ts
│   └── api-server.test.ts
│
├── e2e/
│   ├── simple-agent.test.ts
│   ├── agent-with-tools.test.ts
│   └── agent-with-approval.test.ts
│
└── helpers/
    ├── mocks.ts              # Shared mock factories
    ├── fixtures.ts           # Test data fixtures
    └── temporal-setup.ts     # Temporal test environment helpers
```

---

## Test Categories

### 1. Shared Types & Configuration Tests

#### `config.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| CFG-001 | Loads config from env vars | Valid env vars | Config object with correct values |
| CFG-002 | Uses defaults for optional vars | Partial env vars | Defaults applied |
| CFG-003 | Throws on missing required vars | Missing `LLM_API_KEY` | Error with message |
| CFG-004 | Validates LLM_TEMPERATURE range | `LLM_TEMPERATURE=3.0` | Error: must be 0-2 |
| CFG-005 | Validates API_PORT range | `API_PORT=0` | Error: must be 1-65535 |
| CFG-006 | Resolves WORKSPACE_DIR to absolute path | `WORKSPACE_DIR=./workspace` | Absolute path |

#### `types.test.ts`

| Test ID | Description | Expected |
|---|---|---|
| TYP-001 | AgentMessage role type guard | Correctly narrows type |
| TYP-002 | ToolResult success discriminator | Discriminated union works |
| TYP-003 | AgentRunInput validation with defaults | Defaults applied for optional fields |

---

### 2. LLM Provider Tests

#### `openai-compatible.test.ts`

| Test ID | Description | Mock | Expected |
|---|---|---|---|
| LLM-001 | Chat completion without tools | LLM returns text response | `LLMResponse { content, toolCalls: [] }` |
| LLM-002 | Chat completion with tool calls | LLM returns function_calls | `LLMResponse { toolCalls: [{ id, name, arguments }] }` |
| LLM-003 | Handles rate limit (429) | 429 response | Retries, then succeeds |
| LLM-004 | Handles server error (500) | 500 response | Retries, then throws |
| LLM-005 | Handles timeout | Delayed response | Throws with timeout error |
| LLM-006 | Converts AgentMessage to OpenAI format | Messages array | Correct OpenAI message format |
| LLM-007 | Converts ToolDefinition to OpenAI format | Tool definitions | Correct function format |
| LLM-008 | Handles empty response | Empty choices | Throws descriptive error |
| LLM-009 | Tracks token usage | Response with usage | Usage object populated |
| LLM-010 | Streams response (if implemented) | Stream response | Assembled content |

#### `factory.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| FAC-001 | Creates OpenAI-compatible provider | Default config | `OpenAICompatibleProvider` instance |
| FAC-002 | Creates provider with custom config | Override config | Config values applied |
| FAC-003 | Throws for unknown provider type | `provider: "unknown"` | Error |

---

### 3. Tool Registry & Definition Tests

#### `registry.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| REG-001 | Register a valid tool | Valid tool object | Tool is registered |
| REG-002 | Retrieve tool by name | `registry.get("web-search")` | Returns tool |
| REG-003 | List all tools | `registry.list()` | Array of all tools |
| REG-004 | Generate OpenAI tool definitions | `registry.getOpenAIToolDefinitions()` | Correct format |
| REG-005 | Reject duplicate tool name | Same tool registered twice | Error |
| REG-006 | Reject invalid tool (missing name) | Tool without name | Error |
| REG-007 | Get non-existent tool | `registry.get("nonexistent")` | Error |

#### `web-search.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| WSE-001 | Successful search | Valid query | `{ success: true, output: JSON }` |
| WSE-002 | Search with maxResults | `maxResults: 3` | At most 3 results |
| WSE-003 | Search API error | API returns 500 | `{ success: false, error: "..." }` |
| WSE-004 | Search API timeout | Delayed response | `{ success: false, error: "timeout" }` |
| WSE-005 | Empty query | `query: ""` | `{ success: false, error: "..." }` |

#### `code-execution.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| CEX-001 | Execute simple JS | `"return 1 + 1"` | `{ success: true, output: "2" }` |
| CEX-002 | Execute with console.log | `"console.log('hello')"` | `{ success: true, output: "hello" }` |
| CEX-003 | Execution timeout | Infinite loop | `{ success: false, error: "timeout" }` |
| CEX-004 | Runtime error | `"throw new Error('boom')"` | `{ success: false, error: "boom" }` |
| CEX-005 | Memory limit exceeded | Large allocation | `{ success: false, error: "memory" }` |
| CEX-006 | Requires approval flag | — | `requiresApproval === true` |
| CEX-007 | No network access | Fetch call | `{ success: false }` |
| CEX-008 | Python execution | `"print('hello')"` | `{ success: true, output: "hello" }` |

#### `file-io.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| FIO-001 | Read existing file | Valid path | `{ success: true, output: content }` |
| FIO-002 | Read non-existent file | Bad path | `{ success: false, error: "not found" }` |
| FIO-003 | Write file | Valid path + content | `{ success: true }` |
| FIO-004 | Write creates directories | Nested path | Directories created |
| FIO-005 | Path traversal blocked | `"../../etc/passwd"` | `{ success: false, error: "path denied" }` |
| FIO-006 | Write requires approval | — | `requiresApproval === true` |
| FIO-007 | Read does NOT require approval | — | `requiresApproval === false` |
| FIO-008 | Write outside workspace | Absolute path outside | `{ success: false, error: "path denied" }` |

#### `http-request.test.ts`

| Test ID | Description | Input | Expected |
|---|---|---|---|
| HREQ-001 | GET request | Valid URL | `{ success: true, output: body }` |
| HREQ-002 | POST request | URL + body | `{ success: true }` |
| HREQ-003 | Request timeout | Slow server | `{ success: false, error: "timeout" }` |
| HREQ-004 | SSRF prevention | `http://127.0.0.1` | `{ success: false, error: "blocked" }` |
| HREQ-005 | POST requires approval | — | `requiresApproval === true` for POST |
| HREQ-006 | GET does NOT require approval | — | `requiresApproval === false` for GET |
| HREQ-007 | Custom headers | URL + headers | Headers sent correctly |
| HREQ-008 | Invalid URL | `not-a-url` | `{ success: false, error: "invalid URL" }` |

---

### 4. Activity Tests

#### `llm.activity.test.ts`

| Test ID | Description | Mock | Expected |
|---|---|---|---|
| ACT-LLM-001 | Successful LLM call | Provider returns text | Activity returns `LLMResponse` |
| ACT-LLM-002 | LLM returns tool calls | Provider returns tool calls | Activity returns tool calls |
| ACT-LLM-003 | LLM provider throws | Provider throws | Activity propagates error |
| ACT-LLM-004 | Passes tools to provider | Tool definitions | Provider called with tools |
| ACT-LLM-005 | Passes messages correctly | Messages | Provider called with messages |

#### `tool.activity.test.ts`

| Test ID | Description | Mock | Expected |
|---|---|---|---|
| ACT-TOOL-001 | Execute registered tool | Valid tool name + params | Returns `ToolResult` |
| ACT-TOOL-002 | Execute unknown tool | Invalid tool name | Throws error |
| ACT-TOOL-003 | Validate params against schema | Invalid params | Throws validation error |
| ACT-TOOL-004 | Tool execution error | Tool throws | Returns `{ success: false }` |
| ACT-TOOL-005 | Sets toolCallId on result | Any tool call | Result includes `toolCallId` |

---

### 5. Workflow Tests (Integration)

Workflow tests use Temporal's `TestWorkflowEnvironment` with time-skipping enabled.

#### `agent-workflow.test.ts`

| Test ID | Description | Mock Activities | Expected |
|---|---|---|---|
| WF-AGENT-001 | Simple Q&A (no tools) | `callLLM` returns text | Completes with `status: "completed"` |
| WF-AGENT-002 | Single tool call | `callLLM` returns tool call, `executeTool` succeeds | Completes, `toolCallsExecuted: 1` |
| WF-AGENT-003 | Multiple tool calls | `callLLM` returns 2 tool calls | Both executed |
| WF-AGENT-004 | Multi-turn tool use | `callLLM` returns tool call → then text | 2 iterations |
| WF-AGENT-005 | Max iterations reached | `callLLM` always returns tool calls | `status: "max_iterations"` |
| WF-AGENT-006 | LLM activity failure | `callLLM` throws | Error handled gracefully |
| WF-AGENT-007 | Tool activity failure | `executeTool` throws | Error added to messages, continues |
| WF-AGENT-008 | System prompt applied | Input with systemPrompt | First message is system role |
| WF-AGENT-009 | Query getState | Running workflow | Returns current `AgentWorkflowState` |
| WF-AGENT-010 | Message truncation | 60 messages | Only last `MAX_STATE_MESSAGES` sent |
| WF-AGENT-011 | Custom maxIterations | `maxIterations: 5` | Stops at 5 |

#### `tool-execution-workflow.test.ts`

| Test ID | Description | Action | Expected |
|---|---|---|---|
| WF-TOOL-001 | Approval granted | Send approve signal | Tool executes, returns success |
| WF-TOOL-002 | Approval rejected | Send reject signal | Returns `{ success: false }` |
| WF-TOOL-003 | Approval timeout | No signal, advance time | Returns timeout error |
| WF-TOOL-004 | Query approval status pending | Query before signal | `status: "pending"` |
| WF-TOOL-005 | Query approval status approved | Query after approve | `status: "approved"` |
| WF-TOOL-006 | Modified arguments on approval | Approve with modified args | Tool called with modified args |
| WF-TOOL-007 | Tool execution after approval | Approve → tool runs | Returns tool result |

---

### 6. API Route Tests

#### `agent.routes.test.ts`

| Test ID | Description | Request | Expected |
|---|---|---|---|
| API-AGENT-001 | Start agent | `POST /agent/start` with valid body | `202` with `workflowId` |
| API-AGENT-002 | Start agent missing prompt | `POST /agent/start` with `{}` | `400` validation error |
| API-AGENT-003 | Get agent state | `GET /agent/:id` | `200` with state |
| API-AGENT-004 | Get non-existent agent | `GET /agent/fake-id` | `404` |
| API-AGENT-005 | Get completed result | `GET /agent/:id/result` (completed) | `200` with result |
| API-AGENT-006 | Get result while running | `GET /agent/:id/result` (running) | `409` |
| API-AGENT-007 | Continue conversation | `POST /agent/:id/continue` | `202` with new `runId` |
| API-AGENT-008 | Cancel agent | `DELETE /agent/:id` | `200` |
| API-AGENT-009 | List agents | `GET /agent` | `200` with array |
| API-AGENT-010 | List with status filter | `GET /agent?status=running` | Filtered results |
| API-AGENT-011 | List with pagination | `GET /agent?limit=5&offset=10` | Paginated results |

#### `approval.routes.test.ts`

| Test ID | Description | Request | Expected |
|---|---|---|---|
| API-APR-001 | List pending approvals | `GET /approval/pending` | `200` with array |
| API-APR-002 | Approve tool call | `POST /approval/:id/approve` | `200` |
| API-APR-003 | Approve with modified args | `POST /approval/:id/approve` with body | `200`, modified args sent |
| API-APR-004 | Reject tool call | `POST /approval/:id/reject` | `200` |
| API-APR-005 | Reject with reason | `POST /approval/:id/reject` with reason | `200`, reason sent |
| API-APR-006 | Approve non-existent | `POST /approval/fake/approve` | `404` |
| API-APR-007 | Get approval status | `GET /approval/:id/status` | `200` with status |

#### `health.routes.test.ts`

| Test ID | Description | Request | Expected |
|---|---|---|---|
| API-HLT-001 | Health check - healthy | `GET /health` (Temporal up) | `200` with `status: "ok"` |
| API-HLT-002 | Health check - degraded | `GET /health` (Temporal down) | `200` with `status: "degraded"` |

---

### 7. E2E Tests

| Test ID | Description | Flow | Expected |
|---|---|---|---|
| E2E-001 | Simple agent run | Start → LLM responds → Complete | Final answer returned |
| E2E-002 | Agent with auto-approved tool | Start → LLM calls web-search → Complete | Tool result in final answer |
| E2E-003 | Agent with approval | Start → LLM calls file-write → Approve → Complete | Tool executed after approval |
| E2E-004 | Agent with rejection | Start → LLM calls file-write → Reject → LLM adapts | Agent recovers from rejection |
| E2E-005 | Agent continuation | Start → Complete → Continue → Complete | Conversation persists |
| E2E-006 | Agent cancellation | Start → Cancel | Workflow terminated cleanly |

---

## Coverage Targets

| Component | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `src/shared/` | 90% | 85% | 90% | 90% |
| `src/llm/` | 85% | 80% | 85% | 85% |
| `src/tools/` | 90% | 85% | 95% | 90% |
| `src/activities/` | 85% | 80% | 85% | 85% |
| `src/workflows/` | 80% | 75% | 80% | 80% |
| `src/api/` | 85% | 80% | 85% | 85% |
| **Overall** | **85%** | **80%** | **85%** | **85%** |

---

## Mocking Strategy

### What to Mock

| Dependency | Mocking Tool | Strategy |
|---|---|---|
| LLM HTTP calls | `nock` | Record/replay HTTP interactions |
| Temporal client | `vi.mock()` | Mock `workflowClient.start()`, `handle.query()`, `handle.signal()` |
| Temporal environment | `@temporalio/testing` | Use real `TestWorkflowEnvironment` for workflow tests |
| Filesystem | `vi.mock('fs')` | Mock for file-io tool unit tests; use temp dirs for integration |
| Child processes | `vi.mock('child_process')` | Mock for code-execution unit tests |
| Environment variables | `vi.stubEnv()` | Set/clean per test |

### Mock Factory Pattern

```typescript
// tests/helpers/mocks.ts

export function createMockLLMProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue({
      content: "mock response",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
    }),
    ...overrides,
  };
}

export function createMockTool(overrides?: Partial<Tool>): Tool {
  return {
    name: "mock-tool",
    description: "A mock tool for testing",
    parameters: { type: "object", properties: {} },
    requiresApproval: false,
    riskLevel: "low",
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: "mock output",
    }),
    ...overrides,
  };
}

export function createMockTemporalClient() {
  return {
    workflow: {
      start: vi.fn().mockResolvedValue({
        workflowId: "test-wf-id",
        runId: "test-run-id",
        firstExecutionRunId: "test-run-id",
      }),
      getHandle: vi.fn().mockReturnValue({
        query: vi.fn(),
        signal: vi.fn(),
        cancel: vi.fn(),
        result: vi.fn(),
        describe: vi.fn(),
      }),
    },
  };
}
```

### Test Fixtures

```typescript
// tests/helpers/fixtures.ts

export const SAMPLE_MESSAGES: AgentMessage[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello" },
];

export const SAMPLE_TOOL_CALL: ToolCall = {
  id: "call_abc123",
  name: "web-search",
  arguments: { query: "test query" },
};

export const SAMPLE_TOOL_RESULT: ToolResult = {
  toolCallId: "call_abc123",
  success: true,
  output: JSON.stringify([{ title: "Test", url: "https://example.com", snippet: "..." }]),
};

export const SAMPLE_LLM_RESPONSE: LLMResponse = {
  content: "Here is the answer.",
  toolCalls: [],
  usage: { promptTokens: 100, completionTokens: 50 },
  finishReason: "stop",
};
```

---

## CI Integration

### Test Commands

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:coverage": "vitest run --coverage",
    "test:ci": "npm run test:coverage && npm run test:integration"
  }
}
```

### CI Pipeline (GitHub Actions)

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: temporal
          POSTGRES_DB: temporal
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run build
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:coverage
      - name: Coverage check
        run: npm run test:coverage -- --check-coverage
```

### Pre-commit Hook

```bash
# Run unit tests before every commit
npm run test:unit
```

---

## Quality Gate

A feature branch **must pass all of the following** before merging to `main`:

| Gate | Criteria | Automated? |
|---|---|---|
| All tests pass | `npm run test` exits 0 | Yes |
| Coverage threshold | Statements >= 85%, Branches >= 80% | Yes |
| TypeScript compiles | `npm run build` exits 0 | Yes |
| No lint errors | `npm run lint` exits 0 | Yes |
| New code has tests | Every new `.ts` file has a corresponding `.test.ts` | PR review |
| No regression | All existing tests still pass | Yes |
| E2E critical path | E2E tests E2E-001 through E2E-004 pass | Yes |

### Quality Gate Checklist (Manual)

For each PR, verify:

- [ ] Unit tests written BEFORE implementation (TDD)
- [ ] All new functions/methods covered by tests
- [ ] Error paths tested (not just happy path)
- [ ] Edge cases tested (empty input, max limits, invalid data)
- [ ] No `console.log` or debug code left in
- [ ] No hardcoded secrets or credentials
- [ ] Types are strict (no `any` without justification)
