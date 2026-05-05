# Implementation Plan

This document defines the phased implementation plan for the Temporal Agent project. Each phase follows **TDD methodology** (see [test-plan.md](./test-plan.md)) — tests are written first, then implementation.

---

## Table of Contents

1. [Phase Overview](#phase-overview)
2. [Phase 0 — Project Infrastructure](#phase-0--project-infrastructure)
3. [Phase 1 — Shared Types & Configuration](#phase-1--shared-types--configuration)
4. [Phase 2 — LLM Provider Layer](#phase-2--llm-provider-layer)
5. [Phase 3 — Tool System](#phase-3--tool-system)
6. [Phase 4 — Temporal Activities](#phase-4--temporal-activities)
7. [Phase 5 — Temporal Workflows](#phase-5--temporal-workflows)
8. [Phase 6 — Temporal Worker](#phase-6--temporal-worker)
9. [Phase 7 — API Server](#phase-7--api-server)
10. [Phase 8 — Docker Compose & Scripts](#phase-8--docker-compose--scripts)
11. [Phase 9 — E2E Testing & Polish](#phase-9--e2e-testing--polish)
12. [Dependency Graph](#dependency-graph)
13. [Quality Gates Per Phase](#quality-gates-per-phase)
14. [Branching Strategy](#branching-strategy)

---

## Phase Overview

```
Phase 0: Project Infrastructure ──────────────── (scaffolding, no logic)
    │
Phase 1: Shared Types & Configuration ────────── (foundation)
    │
Phase 2: LLM Provider Layer ──────────────────── (can call LLM)
    │
Phase 3: Tool System ─────────────────────────── (tools work)
    │
Phase 4: Temporal Activities ─────────────────── (activities wrap LLM + tools)
    │
Phase 5: Temporal Workflows ──────────────────── (durable agent loop)
    │
Phase 6: Temporal Worker ─────────────────────── (worker process)
    │
Phase 7: API Server ──────────────────────────── (HTTP interface)
    │
Phase 8: Docker Compose & Scripts ────────────── (infra + dev scripts)
    │
Phase 9: E2E Testing & Polish ────────────────── (full-stack validation)
```

**Estimated effort**: ~10 phases, each independently testable and mergeable.

---

## Phase 0 — Project Infrastructure

**Goal**: Set up the project skeleton with all tooling configured. No application logic.

**Branch**: `feature/phase0-project-infrastructure`

### Tasks

| # | Task | TDD? | Files |
|---|---|---|---|
| 0.1 | Initialize `package.json` with all dependencies | N/A | `package.json` |
| 0.2 | Configure TypeScript (`tsconfig.json`) | N/A | `tsconfig.json` |
| 0.3 | Configure Vitest (`vitest.config.ts`) | N/A | `vitest.config.ts` |
| 0.4 | Configure ESLint + Prettier | N/A | `.eslintrc.cjs`, `.prettierrc` |
| 0.5 | Add npm scripts (build, test, lint, dev) | N/A | `package.json` |
| 0.6 | Create placeholder `src/**/index.ts` files | N/A | `src/**/index.ts` |
| 0.7 | Verify build and test commands work | N/A | — |
| 0.8 | Create `tests/helpers/` with empty mock factories | N/A | `tests/helpers/mocks.ts`, `fixtures.ts` |

### Dependencies

```
package.json
  ├── @temporalio/workflow
  ├── @temporalio/worker
  ├── @temporalio/client
  ├── @temporalio/activity
  ├── @temporalio/common
  ├── @temporalio/testing
  ├── openai
  ├── fastify
  ├── @fastify/cors
  ├── zod
  ├── dotenv
  ├── vitest (dev)
  ├── nock (dev)
  ├── c8 (dev)
  ├── typescript (dev)
  ├── tsx (dev)
  ├── eslint (dev)
  └── prettier (dev)
```

### Quality Gate

- [ ] `npm install` succeeds
- [ ] `npm run build` succeeds (compiles empty project)
- [ ] `npm run test` succeeds (no tests yet, exits 0)
- [ ] `npm run lint` succeeds
- [ ] `package.json` has all required scripts

---

## Phase 1 — Shared Types & Configuration

**Goal**: Define all shared TypeScript types, constants, and the configuration loader.

**Branch**: `feature/phase1-shared-types-config`

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 1.1 | Define `AgentMessage`, `ToolCall`, `ToolResult` types | No (types only) | `tests/unit/shared/types.test.ts` | `src/shared/types.ts` |
| 1.2 | Define `AgentRunInput`, `AgentRunResult`, `WorkflowState` types | No (types only) | — | `src/shared/types.ts` |
| 1.3 | Define `ApprovalRequest`, `ApprovalResponse`, `ApprovalStatus` types | No (types only) | — | `src/shared/types.ts` |
| 1.4 | Define `LLMResponse`, `LLMProviderConfig` types | No (types only) | — | `src/shared/types.ts` |
| 1.5 | Define constants (task queue, defaults, limits) | No | — | `src/shared/constants.ts` |
| 1.6 | **Write tests** for config loading | First | `tests/unit/shared/config.test.ts` | — |
| 1.7 | Implement config loader with Zod validation | Then | — | `src/shared/config.ts` |
| 1.8 | Export barrel from `src/shared/index.ts` | No | — | `src/shared/index.ts` |

### TDD Sequence for Task 1.6–1.7

```
1. Write test: loads from env vars (CFG-001)          → RED
2. Write config.ts with Zod schema                    → GREEN
3. Write test: defaults for optional vars (CFG-002)   → RED
4. Add defaults to schema                             → GREEN
5. Write test: missing required vars (CFG-003)        → RED
6. Add required validation                            → GREEN
7. Write test: validate ranges (CFG-004, 005)         → RED
8. Add range validation                               → GREEN
9. Write test: resolve paths (CFG-006)                → RED
10. Add path resolution                               → GREEN
11. Refactor                                          → All GREEN
```

### Quality Gate

- [ ] All tests in `tests/unit/shared/` pass
- [ ] Config validates all env vars with clear error messages
- [ ] Types compile without errors
- [ ] Coverage >= 90% for `src/shared/`

---

## Phase 2 — LLM Provider Layer

**Goal**: Implement the provider-agnostic LLM abstraction with OpenAI-compatible provider.

**Branch**: `feature/phase2-llm-provider`

### Dependencies

- Phase 1 (types, config)

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 2.1 | Define `LLMProvider` interface | No | — | `src/llm/provider.interface.ts` |
| 2.2 | **Write tests** for OpenAI-compatible provider | First | `tests/unit/llm/openai-compatible.test.ts` | — |
| 2.3 | Implement `OpenAICompatibleProvider` | Then | — | `src/llm/openai-compatible.ts` |
| 2.4 | **Write tests** for provider factory | First | `tests/unit/llm/factory.test.ts` | — |
| 2.5 | Implement `createLLMProvider` factory | Then | — | `src/llm/factory.ts` |
| 2.6 | Export barrel from `src/llm/index.ts` | No | — | `src/llm/index.ts` |

### TDD Sequence for Tasks 2.2–2.3

```
1. Write test: chat returns text response (LLM-001)              → RED
2. Implement chat() with openai SDK, parse text response         → GREEN
3. Write test: chat returns tool calls (LLM-002)                 → RED
4. Parse tool_calls from response                                 → GREEN
5. Write test: handles rate limit (LLM-003)                       → RED
6. Add retry logic for 429                                        → GREEN
7. Write test: handles server error (LLM-004)                     → RED
8. Add retry + error throw for 5xx                                → GREEN
9. Write test: message format conversion (LLM-006)                → RED
10. Implement message converter                                    → GREEN
11. Write test: tool definition conversion (LLM-007)              → RED
12. Implement tool converter                                       → GREEN
13. Write tests: timeout, empty response, usage (LLM-005,008,009) → RED
14. Implement edge case handling                                   → GREEN
15. Refactor                                                      → All GREEN
```

### Quality Gate

- [ ] All tests in `tests/unit/llm/` pass
- [ ] Provider works against mock HTTP (nock)
- [ ] Factory creates correct provider from config
- [ ] Coverage >= 85% for `src/llm/`

---

## Phase 3 — Tool System

**Goal**: Implement the tool registry and all four built-in tool definitions.

**Branch**: `feature/phase3-tool-system`

### Dependencies

- Phase 1 (types)

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 3.1 | Define `Tool` interface and `ToolResult` type | No | — | `src/tools/tool.interface.ts` |
| 3.2 | **Write tests** for `ToolRegistry` | First | `tests/unit/tools/registry.test.ts` | — |
| 3.3 | Implement `ToolRegistry` | Then | — | `src/tools/registry.ts` |
| 3.4 | **Write tests** for web-search tool | First | `tests/unit/tools/web-search.test.ts` | — |
| 3.5 | Implement web-search tool | Then | — | `src/tools/definitions/web-search.ts` |
| 3.6 | **Write tests** for code-execution tool | First | `tests/unit/tools/code-execution.test.ts` | — |
| 3.7 | Implement code-execution tool | Then | — | `src/tools/definitions/code-execution.ts` |
| 3.8 | **Write tests** for file-io tools (read + write) | First | `tests/unit/tools/file-io.test.ts` | — |
| 3.9 | Implement file-read and file-write tools | Then | — | `src/tools/definitions/file-io.ts` |
| 3.10 | **Write tests** for http-request tool | First | `tests/unit/tools/http-request.test.ts` | — |
| 3.11 | Implement http-request tool | Then | — | `src/tools/definitions/http-request.ts` |
| 3.12 | Export barrel from `src/tools/index.ts` | No | — | `src/tools/index.ts` |

### TDD Sequence for Each Tool (e.g., Tasks 3.4–3.5)

```
1. Write test: successful execution with valid input      → RED
2. Implement execute() with happy path                    → GREEN
3. Write test: handles API/external errors                → RED
4. Add error handling                                     → GREEN
5. Write test: validates input / edge cases               → RED
6. Add input validation                                   → GREEN
7. Write test: security (path traversal, SSRF, etc.)      → RED
8. Add security checks                                    → GREEN
9. Refactor                                              → All GREEN
```

### Quality Gate

- [ ] All tests in `tests/unit/tools/` pass
- [ ] Registry correctly registers, retrieves, and lists tools
- [ ] Each tool's `execute()` returns correct `ToolResult`
- [ ] Security validations work (path traversal, SSRF, sandbox escape)
- [ ] `requiresApproval` flags set correctly per tool
- [ ] Coverage >= 90% for `src/tools/`

---

## Phase 4 — Temporal Activities

**Goal**: Implement the Temporal activity functions that wrap the LLM provider and tool registry.

**Branch**: `feature/phase4-activities`

### Dependencies

- Phase 2 (LLM provider)
- Phase 3 (tool system)

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 4.1 | **Write tests** for `callLLM` activity | First | `tests/unit/activities/llm.activity.test.ts` | — |
| 4.2 | Implement `callLLM` activity | Then | — | `src/activities/llm.activity.ts` |
| 4.3 | **Write tests** for `executeTool` activity | First | `tests/unit/activities/tool.activity.test.ts` | — |
| 4.4 | Implement `executeTool` activity | Then | — | `src/activities/tool.activity.ts` |
| 4.5 | Export activities from `src/activities/index.ts` | No | — | `src/activities/index.ts` |

### TDD Sequence for Task 4.1–4.2

```
1. Write test: callLLM returns LLMResponse (ACT-LLM-001)    → RED
2. Implement callLLM wrapping provider.chat()               → GREEN
3. Write test: callLLM passes tools (ACT-LLM-004)            → RED
4. Ensure tools are forwarded to provider                     → GREEN
5. Write test: callLLM handles provider error (ACT-LLM-003)  → RED
6. Add error propagation                                      → GREEN
7. Refactor                                                  → All GREEN
```

### Quality Gate

- [ ] All tests in `tests/unit/activities/` pass
- [ ] Activities correctly delegate to provider/registry
- [ ] Error propagation works (Temporal can retry)
- [ ] Coverage >= 85% for `src/activities/`

---

## Phase 5 — Temporal Workflows

**Goal**: Implement the `agentWorkflow` and `toolExecutionWorkflow` with full approval flow.

**Branch**: `feature/phase5-workflows`

### Dependencies

- Phase 4 (activities)
- `@temporalio/testing` for `TestWorkflowEnvironment`

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 5.1 | **Write tests** for `agentWorkflow` — simple cases | First | `tests/integration/agent-workflow.test.ts` | — |
| 5.2 | Implement `agentWorkflow` — basic loop (no tools) | Then | — | `src/workflows/agent.workflow.ts` |
| 5.3 | **Write tests** for `agentWorkflow` — with tools | First | `tests/integration/agent-workflow.test.ts` | — |
| 5.4 | Implement `agentWorkflow` — tool execution branch | Then | — | `src/workflows/agent.workflow.ts` |
| 5.5 | **Write tests** for `agentWorkflow` — approval flow | First | `tests/integration/agent-workflow.test.ts` | — |
| 5.6 | Implement `agentWorkflow` — child workflow for approval | Then | — | `src/workflows/agent.workflow.ts` |
| 5.7 | **Write tests** for `toolExecutionWorkflow` | First | `tests/integration/tool-execution-workflow.test.ts` | — |
| 5.8 | Implement `toolExecutionWorkflow` | Then | — | `src/workflows/tool-execution.workflow.ts` |
| 5.9 | Add query handlers (`getState`, `approvalStatus`) | With tests | — | `src/workflows/*.ts` |
| 5.10 | Add message truncation logic | With tests | — | `src/workflows/agent.workflow.ts` |
| 5.11 | Export workflows from `src/workflows/index.ts` | No | — | `src/workflows/index.ts` |

### TDD Sequence for Tasks 5.1–5.6

```
1. Write test: simple Q&A, no tools (WF-AGENT-001)                → RED
2. Implement basic workflow loop with callLLM activity             → GREEN
3. Write test: single tool call (WF-AGENT-002)                     → RED
4. Add tool call parsing + executeTool activity                    → GREEN
5. Write test: multi-turn tool use (WF-AGENT-004)                  → RED
6. Add loop continuation after tool results                        → GREEN
7. Write test: max iterations (WF-AGENT-005)                       → RED
8. Add iteration counter + termination                              → GREEN
9. Write test: tool activity failure (WF-AGENT-007)                → RED
10. Add error handling in loop                                      → GREEN
11. Write test: query getState (WF-AGENT-009)                       → RED
12. Add query handler                                               → GREEN
13. Write test: message truncation (WF-AGENT-010)                   → RED
14. Add truncation logic                                            → GREEN
15. Refactor                                                        → All GREEN
```

### TDD Sequence for Tasks 5.7–5.8

```
1. Write test: approval granted (WF-TOOL-001)                     → RED
2. Implement signal handler + condition + execute                  → GREEN
3. Write test: approval rejected (WF-TOOL-002)                     → RED
4. Handle rejection in condition                                    → GREEN
5. Write test: approval timeout (WF-TOOL-003)                      → RED
6. Add timeout to condition                                         → GREEN
7. Write test: query approval status (WF-TOOL-004,005)             → RED
8. Add query handler                                                → GREEN
9. Write test: modified arguments (WF-TOOL-006)                    → RED
10. Use modified args in execute call                               → GREEN
11. Refactor                                                        → All GREEN
```

### Quality Gate

- [ ] All integration tests pass
- [ ] Workflow logic is deterministic (no non-deterministic calls)
- [ ] Signals and queries work correctly
- [ ] Approval flow (approve, reject, timeout) works
- [ ] Coverage >= 80% for `src/workflows/`

---

## Phase 6 — Temporal Worker

**Goal**: Implement the worker process that connects to Temporal and runs workflows/activities.

**Branch**: `feature/phase6-worker`

### Dependencies

- Phase 5 (workflows)

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 6.1 | **Write tests** for worker startup | First | `tests/unit/worker/worker.test.ts` | — |
| 6.2 | Implement worker with workflow/activity registration | Then | — | `src/worker/worker.ts` |
| 6.3 | Add tool registration in worker init | With tests | — | `src/worker/worker.ts` |
| 6.4 | Add graceful shutdown (SIGINT/SIGTERM) | With tests | — | `src/worker/worker.ts` |
| 6.5 | Add `npm run start:worker` script | No | — | `package.json` |

### Quality Gate

- [ ] Worker starts and connects to Temporal
- [ ] Worker registers all workflows and activities
- [ ] Worker shuts down gracefully on signal
- [ ] `npm run start:worker` works end-to-end

---

## Phase 7 — API Server

**Goal**: Implement the Fastify HTTP API server with all routes.

**Branch**: `feature/phase7-api-server`

### Dependencies

- Phase 5 (workflows — for Temporal client operations)

### Tasks

| # | Task | TDD? | Test File | Source File |
|---|---|---|---|---|
| 7.1 | **Write tests** for health route | First | `tests/unit/api/health.routes.test.ts` | — |
| 7.2 | Implement health route | Then | — | `src/api/routes/health.routes.ts` |
| 7.3 | **Write tests** for agent routes | First | `tests/unit/api/agent.routes.test.ts` | — |
| 7.4 | Implement agent routes (start, get, result, continue, cancel, list) | Then | — | `src/api/routes/agent.routes.ts` |
| 7.5 | **Write tests** for approval routes | First | `tests/unit/api/approval.routes.test.ts` | — |
| 7.6 | Implement approval routes (pending, approve, reject, status) | Then | — | `src/api/routes/approval.routes.ts` |
| 7.7 | **Write tests** for SSE endpoint | First | `tests/unit/api/sse.test.ts` | — |
| 7.8 | Implement SSE streaming | Then | — | `src/api/sse.ts` |
| 7.9 | Implement Fastify server setup (CORS, error handler) | With tests | — | `src/api/server.ts` |
| 7.10 | Add `npm run start:api` and `npm run dev:api` scripts | No | — | `package.json` |

### TDD Sequence for Tasks 7.3–7.4

```
1. Write test: start agent with valid input (API-AGENT-001)       → RED
2. Implement POST /agent/start with Temporal client               → GREEN
3. Write test: start agent with invalid input (API-AGENT-002)     → RED
4. Add request validation schema                                   → GREEN
5. Write test: get agent state (API-AGENT-003)                     → RED
6. Implement GET /agent/:id with query handler                     → GREEN
7. Write test: get non-existent agent (API-AGENT-004)              → RED
8. Add 404 handling                                                → GREEN
9. Continue for remaining endpoints...                             →
10. Refactor                                                       → All GREEN
```

### Quality Gate

- [ ] All API route tests pass
- [ ] Request validation rejects invalid input
- [ ] SSE streams events correctly
- [ ] Error responses follow consistent format
- [ ] Coverage >= 85% for `src/api/`

---

## Phase 8 — Docker Compose & Scripts

**Goal**: Set up Docker Compose for local development and create helper scripts.

**Branch**: `feature/phase8-docker-scripts`

### Dependencies

- Phase 6 (worker)
- Phase 7 (API server)

### Tasks

| # | Task | TDD? | Files |
|---|---|---|---|
| 8.1 | Create `docker-compose.yml` (PostgreSQL, Temporal, Web UI) | N/A | `docker-compose.yml` |
| 8.2 | Create `Dockerfile` for app-api and app-worker | N/A | `Dockerfile` |
| 8.3 | Create `.dockerignore` | N/A | `.dockerignore` |
| 8.4 | Create `scripts/setup.sh` | N/A | `scripts/setup.sh` |
| 8.5 | Create `scripts/start-dev.sh` | N/A | `scripts/start-dev.sh` |
| 8.6 | Verify full stack starts with `docker compose up` | N/A | — |
| 8.7 | Verify `scripts/start-dev.sh` works | N/A | — |

### Quality Gate

- [ ] `docker compose up` starts all services
- [ ] Temporal Web UI accessible at `localhost:8080`
- [ ] API server responds at `localhost:3000/health`
- [ ] Worker connects to Temporal
- [ ] `scripts/start-dev.sh` starts everything in dev mode

---

## Phase 9 — E2E Testing & Polish

**Goal**: Validate the full system end-to-end and polish the codebase.

**Branch**: `feature/phase9-e2e-polish`

### Dependencies

- All previous phases

### Tasks

| # | Task | TDD? | Test File |
|---|---|---|---|
| 9.1 | **Write & run** E2E-001: Simple agent run | Yes | `tests/e2e/simple-agent.test.ts` |
| 9.2 | **Write & run** E2E-002: Agent with auto-approved tool | Yes | `tests/e2e/agent-with-tools.test.ts` |
| 9.3 | **Write & run** E2E-003: Agent with approval | Yes | `tests/e2e/agent-with-approval.test.ts` |
| 9.4 | **Write & run** E2E-004: Agent with rejection | Yes | `tests/e2e/agent-with-approval.test.ts` |
| 9.5 | **Write & run** E2E-005: Agent continuation | Yes | `tests/e2e/simple-agent.test.ts` |
| 9.6 | **Write & run** E2E-006: Agent cancellation | Yes | `tests/e2e/simple-agent.test.ts` |
| 9.7 | Fix any issues found in E2E testing | No | — |
| 9.8 | Run full coverage report | No | — |
| 9.9 | Lint and format all code | No | — |
| 9.10 | Update README with any changes | No | `README.md` |
| 9.11 | Create `.github/workflows/test.yml` for CI | No | `.github/workflows/test.yml` |

### Quality Gate

- [ ] All E2E tests pass
- [ ] Overall coverage >= 85% statements, >= 80% branches
- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run build` succeeds
- [ ] Full stack works: `docker compose up` → API → agent → result
- [ ] Approval flow works end-to-end
- [ ] README instructions are accurate

---

## Dependency Graph

```
Phase 0 (Infrastructure)
  │
  └──► Phase 1 (Types & Config)
         │
         ├──► Phase 2 (LLM Provider) ──┐
         │                              │
         ├──► Phase 3 (Tool System) ────┤
         │                              │
         │                  ┌───────────┘
         │                  ▼
         └──────► Phase 4 (Activities)
                     │
                     ▼
                  Phase 5 (Workflows)
                     │
               ┌─────┴─────┐
               ▼            ▼
         Phase 6        Phase 7
         (Worker)       (API Server)
               │            │
               └─────┬──────┘
                     ▼
              Phase 8 (Docker & Scripts)
                     │
                     ▼
              Phase 9 (E2E & Polish)
```

**Parallelizable**: Phases 2 and 3 can be done in parallel (both depend only on Phase 1). Phases 6 and 7 can also be parallelized (both depend on Phase 5).

---

## Quality Gates Per Phase

Each phase must pass its quality gate before merging to `main`:

| Phase | Auto Tests | Build | Coverage | Manual Review |
|---|---|---|---|---|
| 0 | — | Pass | — | Dependency list |
| 1 | All pass | Pass | >= 90% `shared/` | Type design review |
| 2 | All pass | Pass | >= 85% `llm/` | Provider interface review |
| 3 | All pass | Pass | >= 90% `tools/` | Security review |
| 4 | All pass | Pass | >= 85% `activities/` | — |
| 5 | All pass | Pass | >= 80% `workflows/` | Determinism review |
| 6 | All pass | Pass | — | — |
| 7 | All pass | Pass | >= 85% `api/` | API design review |
| 8 | — | Pass | — | Dockerfile review |
| 9 | All E2E pass | Pass | >= 85% overall | Full review |

---

## Branching Strategy

### Branch Naming Convention

```
feature/phase{N}-{short-description}

Examples:
  feature/phase0-project-infrastructure
  feature/phase1-shared-types-config
  feature/phase2-llm-provider
  feature/phase3-tool-system
  feature/phase4-activities
  feature/phase5-workflows
  feature/phase6-worker
  feature/phase7-api-server
  feature/phase8-docker-scripts
  feature/phase9-e2e-polish
```

### Merge Process

```
1. Create feature branch from main
2. Write tests (RED)
3. Implement code (GREEN)
4. Refactor (still GREEN)
5. Run quality gate checks locally
6. Commit with descriptive message
7. Merge to main (via merge commit or squash)
8. Delete feature branch
```

### Commit Message Convention

```
type(scope): description

Types: feat, fix, test, refactor, docs, chore, ci
Scopes: shared, llm, tools, activities, workflows, worker, api, infra

Examples:
  feat(shared): add config loader with Zod validation
  test(llm): add tests for OpenAI-compatible provider
  fix(tools): block path traversal in file-io tool
  refactor(workflows): extract message truncation helper
```
