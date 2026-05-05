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
10. [Phase 8 — Local Docker Compose](#phase-8--local-docker-compose)
11. [Phase 9 — E2E Testing & Polish](#phase-9--e2e-testing--polish)
12. [Phase 10 — Staging Docker Compose](#phase-10--staging-docker-compose)
13. [Phase 11 — Kubernetes & Helm Charts](#phase-11--kubernetes--helm-charts)
14. [Phase 12 — Monitoring & Observability](#phase-12--monitoring--observability)
15. [Dependency Graph](#dependency-graph)
16. [Quality Gates Per Phase](#quality-gates-per-phase)
17. [Branching Strategy](#branching-strategy)

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
Phase 8: Local Docker Compose ────────────────── (dev environment)
    │
Phase 9: E2E Testing & Polish ────────────────── (full-stack validation)
    │
    ├── Phase 10: Staging Docker Compose ──────── (production-like single VM)
    │
    ├── Phase 11: Kubernetes & Helm ───────────── (production k8s deployment)
    │        │
    │        └── Phase 12: Monitoring & Observability ── (metrics, logging, alerting)
```

**Phases 0-9**: Core application development (local dev focused)
**Phases 10-12**: Deployment & operations (staging → production)

**Estimated effort**: ~13 phases, each independently testable and mergeable.

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

## Phase 8 — Local Docker Compose

**Goal**: Set up Docker Compose for local development and create helper scripts.

**Branch**: `feature/phase8-local-docker`

### Dependencies

- Phase 6 (worker)
- Phase 7 (API server)

### Tasks

| # | Task | TDD? | Files |
|---|---|---|---|
| 8.1 | Create `docker-compose.yml` (PostgreSQL, Temporal server, Temporal Web UI) | N/A | `docker-compose.yml` |
| 8.2 | Create `Dockerfile` (multi-stage: build + production images) | N/A | `Dockerfile` |
| 8.3 | Create `.dockerignore` | N/A | `.dockerignore` |
| 8.4 | Create `scripts/setup.sh` (first-time setup) | N/A | `scripts/setup.sh` |
| 8.5 | Create `scripts/start-dev.sh` (Temporal + worker + API) | N/A | `scripts/start-dev.sh` |
| 8.6 | Verify full stack starts with `docker compose up` | N/A | — |
| 8.7 | Verify `scripts/start-dev.sh` works | N/A | — |

### Infrastructure Components

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgresql` | `postgres:15-alpine` | 5432 | Temporal persistence |
| `temporal` | `temporalio/auto-setup:latest` | 7233 | Temporal server |
| `temporal-admin-tools` | `temporalio/admin-tools:latest` | — | CLI for debugging |
| `temporal-ui` | `temporalio/ui:latest` | 8080 | Web UI |

### docker-compose.yml Structure

```yaml
services:
  postgresql:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: temporal
      POSTGRES_DB: temporal
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  temporal:
    image: temporalio/auto-setup:latest
    depends_on: [postgresql]
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=postgres
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=postgresql
    ports: ["7233:7233"]

  temporal-ui:
    image: temporalio/ui:latest
    depends_on: [temporal]
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
    ports: ["8080:8080"]

  temporal-admin-tools:
    image: temporalio/admin-tools:latest
    depends_on: [temporal]
    environment:
      - TEMPORAL_CLI_ADDRESS=temporal:7233

volumes:
  pgdata:
```

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

## Phase 10 — Staging Docker Compose

**Goal**: Create a production-like Docker Compose setup for staging on a single VM with TLS, proper persistence, secrets management, and health checks.

**Branch**: `feature/phase10-staging-docker`

### Dependencies

- Phase 9 (E2E validated)

### Tasks

| # | Task | TDD? | Files |
|---|---|---|---|
| 10.1 | Create `docker-compose.staging.yml` (extends local compose) | N/A | `docker-compose.staging.yml` |
| 10.2 | Add Elasticsearch service for Temporal advanced visibility | N/A | `docker-compose.staging.yml` |
| 10.3 | Add TLS termination with Caddy/Nginx reverse proxy | N/A | `reverse-proxy/`, `Caddyfile` or `nginx.conf` |
| 10.4 | Add health checks to all services | N/A | `docker-compose.staging.yml` |
| 10.5 | Add resource limits (memory, CPU) per service | N/A | `docker-compose.staging.yml` |
| 10.6 | Add Docker secrets or `.env.staging` for production secrets | N/A | `.env.staging.example` |
| 10.7 | Add log aggregation config (JSON structured logs) | N/A | Logging config |
| 10.8 | Add persistent volumes with backup strategy | N/A | Volume config |
| 10.9 | Add Temporal namespace setup (`default` + `staging`) | N/A | `scripts/setup-staging.sh` |
| 10.10 | Create `scripts/deploy-staging.sh` deployment script | N/A | `scripts/deploy-staging.sh` |
| 10.11 | Verify full staging stack starts and passes E2E tests | N/A | — |
| 10.12 | Create staging documentation | N/A | `docs/deployment.md` |

### Infrastructure Architecture

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │  Caddy/Nginx    │  TLS termination
              │  (reverse proxy)│  Port 443 → internal
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │                 │
    ┌─────────▼──────┐ ┌───────▼──────────┐
    │  app-api       │ │  Temporal UI     │
    │  (Fastify)     │ │  (Web UI)        │
    │  Port 3000     │ │  Port 8080       │
    └────────────────┘ └──────────────────┘
              │
    ┌─────────▼──────────────────────────────┐
    │  app-worker (replicas: 2)               │
    │  (Temporal Worker)                      │
    └─────────────────────────────────────────┘
              │
    ┌─────────▼──────────────────────────────┐
    │  Temporal Server                        │
    │  Port 7233                              │
    │  Persistence: PostgreSQL                │
    │  Visibility: Elasticsearch              │
    └─────────┬────────────────┬──────────────┘
              │                │
    ┌─────────▼──────┐ ┌──────▼──────────┐
    │  PostgreSQL 15  │ │  Elasticsearch  │
    │  Port 5432      │ │  Port 9200      │
    │  (volume: pg)   │ │  (volume: es)   │
    └─────────────────┘ └─────────────────┘
```

### docker-compose.staging.yml Key Sections

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["443:443", "80:80"]
    volumes:
      - ./reverse-proxy/Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: always

  app-api:
    build: .
    command: npm run start:api
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_API_KEY=${LLM_API_KEY}  # from .env.staging
    deploy:
      replicas: 2
      resources:
        limits: { memory: 512M, cpus: "0.5" }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: always

  app-worker:
    build: .
    command: npm run start:worker
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_API_KEY=${LLM_API_KEY}
    deploy:
      replicas: 2
      resources:
        limits: { memory: 1G, cpus: "1.0" }
    restart: always

  temporal:
    image: temporalio/auto-setup:latest
    depends_on:
      postgresql: { condition: service_healthy }
      elasticsearch: { condition: service_healthy }
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=postgres
      - POSTGRES_PWD=${POSTGRES_PASSWORD}
      - POSTGRES_SEEDS=postgresql
      - ENABLE_ES=true
      - ES_SEEDS=elasticsearch
      - ES_VERSION=v7
    deploy:
      resources:
        limits: { memory: 2G, cpus: "2.0" }
    restart: always

  postgresql:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: temporal
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

  elasticsearch:
    image: elasticsearch:7.17.18
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - esdata:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health"]
      interval: 30s
      timeout: 10s
      retries: 5
    restart: always

volumes:
  pgdata:
  esdata:
  caddy_data:
  caddy_config:
```

### Quality Gate

- [ ] `docker compose -f docker-compose.staging.yml up` starts all services
- [ ] TLS works (HTTPS with self-signed cert or Let's Encrypt staging)
- [ ] API accessible via reverse proxy at `https://staging.example.com`
- [ ] Temporal UI accessible at `https://staging.example.com/temporal`
- [ ] Health checks pass for all services
- [ ] E2E tests pass against staging environment
- [ ] Elasticsearch advanced visibility works in Temporal UI
- [ ] Secrets are NOT in docker-compose.yml (from `.env.staging`)
- [ ] Services restart automatically on failure

---

## Phase 11 — Kubernetes & Helm Charts

**Goal**: Create provider-agnostic Helm charts for deploying the Temporal Agent stack to any Kubernetes cluster.

**Branch**: `feature/phase11-kubernetes-helm`

### Dependencies

- Phase 10 (staging validated)

### Tasks

| # | Task | TDD? | Files |
|---|---|---|---|
| 11.1 | Initialize Helm chart structure | N/A | `deploy/helm/temporal-agent/` |
| 11.2 | Create `Chart.yaml` with dependencies | N/A | `Chart.yaml` |
| 11.3 | Create `values.yaml` with all configurable parameters | N/A | `values.yaml` |
| 11.4 | Create API server deployment + service manifests | N/A | `templates/api-deployment.yaml`, `templates/api-service.yaml` |
| 11.5 | Create Worker deployment manifest (with HPA) | N/A | `templates/worker-deployment.yaml`, `templates/worker-hpa.yaml` |
| 11.6 | Create ConfigMap and Secrets templates | N/A | `templates/configmap.yaml`, `templates/secrets.yaml` |
| 11.7 | Create Ingress template (provider-agnostic) | N/A | `templates/ingress.yaml` |
| 11.8 | Create Temporal server sub-chart or reference official Helm chart | N/A | `Chart.yaml` dependency |
| 11.9 | Create PostgreSQL sub-chart or reference Bitnami chart | N/A | `Chart.yaml` dependency |
| 11.10 | Add Elasticsearch sub-chart or reference Elastic chart | N/A | `Chart.yaml` dependency |
| 11.11 | Create `values-dev.yaml` (minikube/kind defaults) | N/A | `values-dev.yaml` |
| 11.12 | Create `values-staging.yaml` (staging defaults) | N/A | `values-staging.yaml` |
| 11.13 | Create `values-production.yaml` (production defaults) | N/A | `values-production.yaml` |
| 11.14 | Create namespace and service account templates | N/A | `templates/namespace.yaml`, `templates/serviceaccount.yaml` |
| 11.15 | Create NetworkPolicy templates | N/A | `templates/networkpolicy.yaml` |
| 11.16 | Create PodDisruptionBudget templates | N/A | `templates/pdb.yaml` |
| 11.17 | Write Helm chart tests | N/A | `templates/tests/` |
| 11.18 | Verify `helm install` works on minikube/kind | N/A | — |
| 11.19 | Verify `helm upgrade` works (rolling update) | N/A | — |
| 11.20 | Create deployment documentation | N/A | Update `docs/deployment.md` |

### Helm Chart Structure

```
deploy/
└── helm/
    └── temporal-agent/
        ├── Chart.yaml                  # Chart metadata + dependencies
        ├── values.yaml                 # Default values (production-ready)
        ├── values-dev.yaml             # Dev overrides (minikube)
        ├── values-staging.yaml         # Staging overrides
        ├── values-production.yaml      # Production overrides
        ├── .helmignore
        ├── templates/
        │   ├── _helpers.tpl            # Template helpers
        │   ├── namespace.yaml
        │   ├── serviceaccount.yaml
        │   ├── configmap.yaml
        │   ├── secrets.yaml
        │   ├── api-deployment.yaml
        │   ├── api-service.yaml
        │   ├── api-hpa.yaml
        │   ├── worker-deployment.yaml
        │   ├── worker-hpa.yaml
        │   ├── ingress.yaml
        │   ├── networkpolicy.yaml
        │   ├── pdb.yaml
        │   └── tests/
        │       └── test-connection.yaml
        └── README.md                   # Helm chart README
```

### Chart.yaml

```yaml
apiVersion: v2
name: temporal-agent
description: AI Agent orchestrated by Temporal with LLM reasoning and tool execution
type: application
version: 0.1.0
appVersion: "1.0.0"

dependencies:
  - name: temporal
    version: "0.46.x"
    repository: "https://charts.temporal.io"
    condition: temporal.enabled
    alias: temporal

  - name: postgresql
    version: "15.x"
    repository: "https://charts.bitnami.com/bitnami"
    condition: postgresql.enabled
    alias: postgresql

  - name: elasticsearch
    version: "8.x"
    repository: "https://helm.elastic.co"
    condition: elasticsearch.enabled
    alias: elasticsearch
```

### values.yaml Key Sections

```yaml
global:
  namespace: temporal-agent
  environment: production

api:
  replicaCount: 3
  image:
    repository: temporal-agent
    tag: "1.0.0"
    pullPolicy: IfNotPresent
  service:
    type: ClusterIP
    port: 3000
  ingress:
    enabled: true
    className: "nginx"
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    hosts:
      - host: agent.example.com
        paths: ["/"]
    tls:
      - secretName: agent-tls
        hosts: [agent.example.com]
  resources:
    requests: { memory: "256Mi", cpu: "250m" }
    limits: { memory: "512Mi", cpu: "500m" }
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70

worker:
  replicaCount: 3
  image:
    repository: temporal-agent
    tag: "1.0.0"
    pullPolicy: IfNotPresent
  resources:
    requests: { memory: "512Mi", cpu: "500m" }
    limits: { memory: "1Gi", cpu: "1000m" }
  hpa:
    enabled: true
    minReplicas: 2
    maxReplicas: 20
    targetCPUUtilization: 60
  maxTasksPerSecond: 100

config:
  temporalAddress: "temporal-agent-temporal.default.svc:7233"
  temporalNamespace: "default"
  llmBaseUrl: ""
  llmModel: "gpt-4"
  llmMaxTokens: 4096
  llmTemperature: 0.7
  agentMaxIterations: 20
  approvalTimeoutHours: 24
  workspaceDir: "/app/workspace"

secrets:
  llmApiKey: ""
  postgresPassword: ""

temporal:
  enabled: true   # Set false to use external Temporal (e.g., Temporal Cloud)

postgresql:
  enabled: true   # Set false to use external managed PostgreSQL

elasticsearch:
  enabled: true   # Set false to use external managed ES
```

### Deployment Environments

```bash
# Dev (minikube/kind)
helm install temporal-agent ./deploy/helm/temporal-agent \
  -f values-dev.yaml \
  --set secrets.llmApiKey=$LLM_API_KEY

# Staging
helm install temporal-agent ./deploy/helm/temporal-agent \
  -f values-staging.yaml \
  --namespace temporal-agent-staging \
  --set secrets.llmApiKey=$LLM_API_KEY

# Production
helm install temporal-agent ./deploy/helm/temporal-agent \
  -f values-production.yaml \
  --namespace temporal-agent \
  --set secrets.llmApiKey=$LLM_API_KEY \
  --set config.temporalAddress="temporal.example.com:7233"
```

### Quality Gate

- [ ] `helm lint deploy/helm/temporal-agent` passes
- [ ] `helm template` renders all manifests without errors
- [ ] `helm install` succeeds on minikube/kind
- [ ] API and Worker pods become ready
- [ ] Ingress routes traffic to API
- [ ] HPA scales workers under load
- [ ] `helm upgrade` performs rolling update without downtime
- [ ] `helm rollback` restores previous version
- [ ] Network policies restrict pod-to-pod communication
- [ ] E2E tests pass against k8s deployment
- [ ] Documentation covers all deployment scenarios

---

## Phase 12 — Monitoring & Observability

**Goal**: Add comprehensive monitoring, logging, and alerting for production operations.

**Branch**: `feature/phase12-monitoring`

### Dependencies

- Phase 11 (Kubernetes deployment working)

### Tasks

| # | Task | TDD? | Files |
|---|---|---|---|
| 12.1 | Add Prometheus metrics to API server (`prom-client`) | N/A | `src/api/server.ts` |
| 12.2 | Add Prometheus metrics to Worker (Temporal SDK built-in) | N/A | `src/worker/worker.ts` |
| 12.3 | Create Grafana dashboard for Temporal Agent | N/A | `deploy/grafana/dashboards/` |
| 12.4 | Create Prometheus rules / alerts | N/A | `deploy/prometheus/alerts.yaml` |
| 12.5 | Add structured JSON logging (pino) | N/A | `src/shared/logger.ts` |
| 12.6 | Add Helm values for monitoring stack | N/A | `deploy/helm/temporal-agent/values.yaml` |
| 12.7 | Create monitoring sub-chart (Prometheus + Grafana) | N/A | `deploy/helm/temporal-agent/Chart.yaml` |
| 12.8 | Create runbooks for common alerts | N/A | `docs/runbooks/` |
| 12.9 | Create monitoring documentation | N/A | Update `docs/deployment.md` |

### Metrics to Expose

| Metric | Type | Labels | Description |
|---|---|---|---|
| `agent_workflows_started_total` | Counter | namespace | Total agent workflows started |
| `agent_workflows_completed_total` | Counter | namespace, status | Total completed (by status) |
| `agent_workflow_duration_seconds` | Histogram | namespace, status | Workflow execution duration |
| `agent_iterations_total` | Counter | namespace | Total LLM iterations |
| `agent_tool_calls_total` | Counter | namespace, tool_name | Tool executions by tool |
| `agent_tool_duration_seconds` | Histogram | namespace, tool_name | Tool execution duration |
| `agent_approval_wait_seconds` | Histogram | namespace | Time waiting for approval |
| `agent_llm_tokens_total` | Counter | namespace, type (prompt/completion) | Token usage |
| `agent_llm_errors_total` | Counter | namespace, error_type | LLM API errors |
| `http_requests_total` | Counter | method, path, status | API request count |
| `http_request_duration_seconds` | Histogram | method, path | API request latency |

### Alerts

| Alert | Condition | Severity | Action |
|---|---|---|---|
| `AgentHighFailureRate` | >10% workflows failing over 5m | Warning | Check LLM provider health |
| `AgentCriticalFailureRate` | >25% workflows failing over 5m | Critical | Investigate immediately |
| `AgentStuckWorkflows` | >50 workflows running >30m | Warning | Check for stuck approvals |
| `LLMProviderDown` | >5 consecutive LLM errors | Critical | Check API key, provider status |
| `WorkerTaskQueueBacklog` | >1000 pending tasks | Warning | Scale up workers |
| `HighMemoryUsage` | >80% memory limit | Warning | Investigate or scale |
| `APIHighLatency` | p99 > 5s over 5m | Warning | Check downstream services |

### Grafana Dashboard Panels

1. **Overview**: Active workflows, completed/failed rates, avg duration
2. **LLM**: Token usage, error rates, latency, cost estimation
3. **Tools**: Call frequency by tool, success rates, duration distribution
4. **Approvals**: Pending count, avg wait time, approval/rejection ratio
5. **Infrastructure**: CPU, memory, worker count, API request rate

### Quality Gate

- [ ] Prometheus scrapes metrics from API and Worker
- [ ] Grafana dashboards render correctly
- [ ] Alerts fire for configured conditions
- [ ] Structured logs include correlation IDs (workflow ID)
- [ ] Monitoring documentation complete

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
              Phase 8 (Local Docker Compose)
                     │
                     ▼
              Phase 9 (E2E & Polish)
                     │
                     ▼
           ┌─────────┴──────────┐
           ▼                    ▼
    Phase 10               Phase 11
    (Staging Docker)       (Kubernetes & Helm)
                                  │
                                  ▼
                           Phase 12
                           (Monitoring & Observability)
```

**Parallelizable**:
- Phases 2 and 3 (both depend only on Phase 1)
- Phases 6 and 7 (both depend on Phase 5)
- Phases 10 and 11 can start together after Phase 9 (staging Docker is simpler and validates before k8s)

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
| 10 | E2E vs staging | Pass | — | Security + TLS review |
| 11 | Helm tests pass | Pass | — | k8s manifest review |
| 12 | — | Pass | — | Alerting rules review |

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
  feature/phase8-local-docker
  feature/phase9-e2e-polish
  feature/phase10-staging-docker
  feature/phase11-kubernetes-helm
  feature/phase12-monitoring
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
Scopes: shared, llm, tools, activities, workflows, worker, api, infra, deploy, helm

Examples:
  feat(shared): add config loader with Zod validation
  test(llm): add tests for OpenAI-compatible provider
  fix(tools): block path traversal in file-io tool
  refactor(workflows): extract message truncation helper
  feat(deploy): add staging docker-compose with TLS
  feat(helm): create Helm chart for k8s deployment
  chore(infra): add Prometheus metrics to API server
```
