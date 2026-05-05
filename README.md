# Temporal Agent

A durable, production-grade AI agent built on [Temporal](https://temporal.io/) orchestration. The agent uses an LLM-powered reasoning loop with extensible tool use, human-in-the-loop approvals, and automatic fault tolerance.

## Why Temporal for AI Agents?

AI agents are inherently **long-running, multi-step processes** that call unreliable external services (LLM APIs, tool executions). Temporal is purpose-built for this pattern:

| Temporal Feature | Benefit for AI Agents |
|---|---|
| Durable execution | Survives server crashes — agent resumes from last completed step |
| Built-in retries & timeouts | LLM API flakiness handled declaratively |
| Automatic state persistence | Conversation history and agent state never lost |
| Signals & Queries | Human-in-the-loop approval gates |
| Full observability | Every step visible in Temporal Web UI |
| Versioning | Evolve agent logic without breaking in-flight workflows |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Client / Web UI                        │
│            Chat interface · Approval panel · History         │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTP / SSE
┌─────────────────────────────▼────────────────────────────────┐
│                    API Server (Fastify)                       │
│   Start workflows · Query state · Send signals · SSE stream  │
└──────┬──────────────────────────────────────────┬───────────┘
       │                                          │
       ▼                                          ▼
┌─────────────────┐                    ┌──────────────────────┐
│ Temporal Server │                    │    LLM Provider      │
│ (Docker)        │                    │ Z.AI (OpenAI-compat) │
└───────┬─────────┘                    └──────────────────────┘
        │                                         ▲
┌───────▼─────────────────────────────────────────┼───────────┐
│              Temporal Worker                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Workflows (deterministic)                  │  │
│  │   AgentWorkflow (main loop)                            │  │
│  │     └── ToolExecutionWorkflow (child, approval gate)   │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Activities (side effects)                  │  │
│  │   callLLM · searchWeb · executeCode · fileIO · httpReq │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Durable agent loop** — The core reasoning loop is a Temporal workflow that never loses progress
- **Provider-agnostic LLM** — Pluggable LLM providers via OpenAI-compatible interface (Z.AI, OpenAI, etc.)
- **Extensible tool system** — Add new tools by implementing a simple interface and registering them
- **Human-in-the-loop** — Configurable approval gates for risky operations via Temporal Signals
- **Real-time streaming** — Server-Sent Events (SSE) for live workflow progress
- **Full observability** — Temporal Web UI + structured logging for every decision and action
- **Built-in tools** — Web search, code execution, file I/O, HTTP requests

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Docker](https://www.docker.com/) & Docker Compose
- An LLM API key (Z.AI or OpenAI-compatible endpoint)

### Setup

```bash
# 1. Clone and enter the project
cd temporal-agent

# 2. Copy environment template and configure
cp .env.example .env
# Edit .env and set your LLM_API_KEY and LLM_BASE_URL

# 3. Install dependencies
npm install

# 4. Start Temporal server
docker compose up -d

# 5. Build the project
npm run build

# 6. Start the worker (in one terminal)
npm run start:worker

# 7. Start the API server (in another terminal)
npm run start:api
```

### First Agent Run

```bash
# Start an agent workflow
curl -X POST http://localhost:3000/agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Search the web for the latest TypeScript features and summarize them",
    "systemPrompt": "You are a helpful research assistant."
  }'

# Response: { "workflowId": "agent-xxxx-xxxx", "runId": "..." }

# Check status
curl http://localhost:3000/agent/agent-xxxx-xxxx

# Approve a pending tool call
curl -X POST http://localhost:3000/approval/agent-xxxx-xxxx/approve
```

### Development

```bash
# Run with hot reload
npm run dev:worker   # Worker with auto-restart
npm run dev:api      # API server with auto-restart

# Or start everything at once
./scripts/start-dev.sh
```

## Project Structure

```
temporal-agent/
├── docker-compose.yml          # Temporal server + Web UI + PostgreSQL
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── .env.example                # Environment variable template
│
├── docs/                       # Documentation
│   ├── architecture.md         # Detailed architecture and design decisions
│   ├── getting-started.md      # Comprehensive setup guide
│   ├── adding-tools.md         # How to create and register new tools
│   ├── workflows.md            # Workflow design and patterns
│   └── api-reference.md        # API endpoint reference
│
├── src/
│   ├── shared/                 # Shared types, constants, configuration
│   ├── llm/                    # LLM provider abstraction layer
│   ├── tools/                  # Tool interface, registry, and definitions
│   ├── activities/             # Temporal activities (side effects)
│   ├── workflows/              # Temporal workflows (durable logic)
│   ├── worker/                 # Temporal worker process
│   └── api/                    # HTTP API server (Fastify)
│
└── scripts/                    # Development and setup scripts
```

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `TEMPORAL_ADDRESS` | Temporal server address | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `LLM_BASE_URL` | LLM API base URL | (required) |
| `LLM_API_KEY` | LLM API key | (required) |
| `LLM_MODEL` | Model identifier | `gpt-4` |
| `LLM_MAX_TOKENS` | Max tokens per response | `4096` |
| `LLM_TEMPERATURE` | Response temperature | `0.7` |
| `AGENT_MAX_ITERATIONS` | Max agent loop iterations | `20` |
| `APPROVAL_TIMEOUT_HOURS` | Hours before auto-reject | `24` |
| `WORKSPACE_DIR` | File I/O sandbox directory | `./workspace` |
| `API_PORT` | API server port | `3000` |

## Documentation

- [Architecture & Design Decisions](docs/architecture.md)
- [Getting Started Guide](docs/getting-started.md)
- [Adding New Tools](docs/adding-tools.md)
- [Workflow Design](docs/workflows.md)
- [API Reference](docs/api-reference.md)
- [Test Plan (TDD)](docs/test-plan.md)
- [Implementation Plan (Phases 0-12)](docs/implementation-plan.md)
- [Deployment Guide](docs/deployment.md)

## License

MIT
