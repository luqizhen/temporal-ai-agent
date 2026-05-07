import { describe, it, expect, vi, afterAll } from "vitest";
import Fastify from "fastify";

const mockStart = vi.fn().mockResolvedValue({
  workflowId: "agent-1234567890-abc123",
  firstExecutionRunId: "run-abc123",
});

const mockQuery = vi.fn().mockResolvedValue({
  messages: [],
  iteration: 0,
  status: "running",
  toolCallsExecuted: 0,
  approvalsRequested: 0,
});

const mockResult = vi.fn().mockRejectedValue(new Error("still running"));
const mockSignal = vi.fn().mockResolvedValue(undefined);
const mockCancel = vi.fn().mockResolvedValue(undefined);

const mockGetHandle = vi.fn().mockReturnValue({
  query: mockQuery,
  result: mockResult,
  signal: mockSignal,
  cancel: mockCancel,
});

vi.mock("@temporalio/client", () => ({
  Connection: {
    connect: vi.fn().mockResolvedValue({}),
  },
  Client: vi.fn().mockImplementation(() => ({
    workflow: {
      start: mockStart,
      getHandle: mockGetHandle,
    },
  })),
}));

async function buildApp() {
  const { agentRoutes } = await import("../../../src/api/routes/agent.routes.js");
  const app = Fastify();
  await app.register(agentRoutes);
  return app;
}

describe("Agent Routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterAll(async () => {
    if (app) await app.close();
  });

  it("API-AGENT-001: POST /agent/start returns 202 with workflowId", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/agent/start",
      payload: { prompt: "Hello, agent!" },
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.workflowId).toBe("agent-1234567890-abc123");
    expect(body.runId).toBe("run-abc123");
  });

  it("API-AGENT-002: POST /agent/start with empty body returns 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/agent/start",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("API-AGENT-003: GET /agent/:workflowId returns workflow state", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/agent/test-workflow-id",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.workflowId).toBe("test-workflow-id");
    expect(body.status).toBe("running");
  });

  it("API-AGENT-004: GET /agent/:workflowId/result returns 409 when still running", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/agent/test-workflow-id/result",
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error).toContain("running");
  });

  it("API-AGENT-005: DELETE /agent/:workflowId requests cancellation", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/agent/test-workflow-id",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toContain("Cancellation");
    expect(mockCancel).toHaveBeenCalled();
  });
});
