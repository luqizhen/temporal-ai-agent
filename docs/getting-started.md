# Getting Started Guide

This guide walks you through setting up and running the Temporal Agent project from scratch.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Configuration](#configuration)
4. [Starting the Infrastructure](#starting-the-infrastructure)
5. [Running the Application](#running-the-application)
6. [Your First Agent Run](#your-first-agent-run)
7. [Using the Approval System](#using-the-approval-system)
8. [Development Workflow](#development-workflow)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Ensure you have the following installed:

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | v20+ | Runtime |
| [npm](https://www.npmjs.com/) | v10+ | Package manager |
| [Docker](https://www.docker.com/) | v24+ | Container runtime |
| [Docker Compose](https://docs.docker.com/compose/) | v2+ | Multi-container orchestration |
| [Git](https://git-scm.com/) | v2+ | Version control |

### Verify Prerequisites

```bash
node --version     # Should be v20+
npm --version      # Should be v10+
docker --version   # Should be v24+
docker compose version  # Should be v2+
```

---

## Project Setup

### Step 1: Install Dependencies

```bash
cd temporal-agent
npm install
```

This installs:
- `@temporalio/*` — Temporal TypeScript SDK (workflow, worker, client, activity)
- `openai` — OpenAI-compatible LLM client
- `fastify` + `@fastify/cors` — HTTP API server
- `zod` — Runtime type validation
- `dotenv` — Environment variable loading
- `typescript`, `tsx` — TypeScript compiler and dev runner

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings. At minimum, set:

```env
# Required: Your LLM provider details
LLM_BASE_URL=https://api.z.ai/v1      # Z.AI endpoint (or OpenAI, etc.)
LLM_API_KEY=your-api-key-here          # Your API key
LLM_MODEL=glm-4                        # Model to use

# Optional: Defaults are fine for local development
TEMPORAL_ADDRESS=localhost:7233
API_PORT=3000
```

See [Configuration](#configuration) below for all available options.

### Step 3: Build

```bash
npm run build
```

This compiles TypeScript to JavaScript in `dist/`. The build step is needed before running the worker and API server.

---

## Configuration

All configuration is via environment variables in `.env`:

### Temporal Settings

| Variable | Description | Default |
|---|---|---|
| `TEMPORAL_ADDRESS` | Temporal server gRPC address | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |

### LLM Settings

| Variable | Description | Default |
|---|---|---|
| `LLM_BASE_URL` | LLM API base URL | (required) |
| `LLM_API_KEY` | LLM API key | (required) |
| `LLM_MODEL` | Model identifier | `gpt-4` |
| `LLM_MAX_TOKENS` | Max response tokens | `4096` |
| `LLM_TEMPERATURE` | Sampling temperature (0-2) | `0.7` |

### Agent Settings

| Variable | Description | Default |
|---|---|---|
| `AGENT_MAX_ITERATIONS` | Max agent loop iterations | `20` |
| `APPROVAL_TIMEOUT_HOURS` | Hours before auto-reject | `24` |
| `MAX_STATE_MESSAGES` | Max messages in workflow state | `50` |
| `WORKSPACE_DIR` | File I/O sandbox directory | `./workspace` |

### API Settings

| Variable | Description | Default |
|---|---|---|
| `API_PORT` | API server port | `3000` |
| `CORS_ORIGIN` | Allowed CORS origin | `*` |

### Tool-Specific Settings

| Variable | Description | Default |
|---|---|---|
| `WEB_SEARCH_API_KEY` | API key for web search provider | (optional) |
| `CODE_EXEC_TIMEOUT_MS` | Code execution timeout | `30000` |
| `CODE_EXEC_MAX_MEMORY_MB` | Code execution memory limit | `256` |

---

## Starting the Infrastructure

### Start Temporal Server

```bash
docker compose up -d
```

This starts:

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL | 5432 | Temporal persistence backend |
| Temporal Server | 7233 | Temporal gRPC server |
| Temporal Web UI | 8080 | Web-based workflow inspector |

### Verify Temporal is Running

```bash
# Check all services are up
docker compose ps

# Open the Temporal Web UI
open http://localhost:8080
```

The Web UI should show an empty namespace with no running workflows.

### Stop Temporal

```bash
# Stop services (preserves data)
docker compose stop

# Stop and remove containers (preserves volumes/data)
docker compose down

# Stop and remove everything including data
docker compose down -v
```

---

## Running the Application

You need two processes running: the **Worker** and the **API Server**.

### Option A: Manual (Two Terminals)

Terminal 1 — Start the Worker:
```bash
npm run start:worker
```

Terminal 2 — Start the API Server:
```bash
npm run start:api
```

### Option B: Development Mode (Hot Reload)

Terminal 1 — Worker with auto-restart:
```bash
npm run dev:worker
```

Terminal 2 — API with auto-restart:
```bash
npm run dev:api
```

### Option C: One-Command Dev Setup

```bash
./scripts/start-dev.sh
```

This starts Temporal (via Docker), the worker, and the API server in a single command with hot reload.

### Verify Everything is Running

```bash
# API health check
curl http://localhost:3000/health

# Expected response: { "status": "ok", "temporal": "connected" }
```

---

## Your First Agent Run

### Start a Simple Agent Session

```bash
curl -X POST http://localhost:3000/agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is 2 + 2? Think step by step."
  }'
```

Response:
```json
{
  "workflowId": "agent-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "runId": "run-xxxx-xxxx"
}
```

### Check the Result

```bash
curl http://localhost:3000/agent/agent-a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Response:
```json
{
  "workflowId": "agent-a1b2c3d4-...",
  "status": "completed",
  "result": {
    "finalAnswer": "2 + 2 = 4. ...",
    "iterations": 1,
    "toolCallsExecuted": 0,
    "approvalsRequested": 0
  }
}
```

### Start an Agent with Tool Use

```bash
curl -X POST http://localhost:3000/agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Search the web for the population of Tokyo and then save the result to a file called tokyo-population.txt",
    "systemPrompt": "You are a research assistant. Use tools to find and store information."
  }'
```

This will:
1. LLM decides to use `web-search` tool (auto-approved)
2. `web-search` executes, returns results
3. LLM decides to use `file-write` tool (requires approval)
4. Workflow pauses, waiting for your approval

### Watch in Temporal Web UI

Open http://localhost:8080 to see:
- Running workflows
- Activity execution history
- Workflow state at each step
- Pending signals (for approval)

---

## Using the Approval System

When an agent wants to execute a tool that requires approval, the workflow pauses and the API reports the pending approval.

### List Pending Approvals

```bash
curl http://localhost:3000/approval/pending
```

Response:
```json
{
  "pending": [
    {
      "workflowId": "agent-a1b2c3d4-...",
      "runId": "run-xxxx-xxxx",
      "toolCall": {
        "id": "call_abc123",
        "name": "file-write",
        "arguments": {
          "path": "tokyo-population.txt",
          "content": "Tokyo population: 13.96 million (2023 estimate)"
        }
      },
      "riskLevel": "medium",
      "description": "Write file: tokyo-population.txt (76 bytes)"
    }
  ]
}
```

### Approve a Tool Call

```bash
curl -X POST http://localhost:3000/approval/agent-a1b2c3d4-.../approve \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or approve with modified arguments:

```bash
curl -X POST http://localhost:3000/approval/agent-a1b2c3d4-.../approve \
  -H "Content-Type: application/json" \
  -d '{
    "modifiedArguments": {
      "path": "research/tokyo-population.txt",
      "content": "Tokyo population: 13.96 million (2023 estimate)"
    }
  }'
```

### Reject a Tool Call

```bash
curl -X POST http://localhost:3000/approval/agent-a1b2c3d4-.../reject \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "I don't want to write files yet"
  }'
```

After rejection, the agent receives the rejection as a tool result and can continue with an alternative approach.

---

## Development Workflow

### Project Scripts

| Script | Description |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:worker` | Start the Temporal worker |
| `npm run start:api` | Start the API server |
| `npm run dev:worker` | Start worker with hot reload |
| `npm run dev:api` | Start API server with hot reload |
| `npm run clean` | Remove `dist/` and `node_modules/` |

### Development Cycle

1. Make code changes
2. If in dev mode, worker/API auto-restart
3. Start a new agent run via API
4. Inspect in Temporal Web UI
5. Check API logs for errors

### Watching Workflow Events (SSE)

Connect to the SSE endpoint to watch real-time updates:

```bash
curl -N http://localhost:3000/events?workflowId=agent-a1b2c3d4-...
```

Event types:
- `state_update` — Workflow status changed
- `tool_call` — Tool execution started/completed
- `approval_needed` — Waiting for human approval
- `completed` — Workflow finished

---

## Troubleshooting

### "Connection refused" to Temporal

```bash
# Check if Temporal is running
docker compose ps

# If not running, start it
docker compose up -d

# Check Temporal logs
docker compose logs temporal
```

### Worker fails to start

- Ensure `npm run build` completed successfully
- Check that `TEMPORAL_ADDRESS` matches your Docker setup
- Verify Temporal is healthy: `docker compose logs temporal | grep "Started"`

### LLM API errors

- Verify `LLM_BASE_URL` is correct and accessible
- Verify `LLM_API_KEY` is valid
- Check API rate limits — the retry policy handles transient errors
- Test the API directly: `curl -H "Authorization: Bearer $LLM_API_KEY" $LLM_BASE_URL/models`

### Workflow stuck in "running"

- Check worker is running and connected to Temporal
- Look at the worker logs for errors
- Check Temporal Web UI for activity failures
- Use `temporal workflow list` (via admin tools container) to inspect

### Docker issues

```bash
# Full reset
docker compose down -v
docker compose up -d

# Check resource usage
docker stats

# View all logs
docker compose logs -f
```

### Port conflicts

If ports are already in use:

| Service | Default Port | Change via |
|---|---|---|
| API Server | 3000 | `API_PORT` env var |
| Temporal gRPC | 7233 | `docker-compose.yml` |
| Temporal Web UI | 8080 | `docker-compose.yml` |
| PostgreSQL | 5432 | `docker-compose.yml` |
