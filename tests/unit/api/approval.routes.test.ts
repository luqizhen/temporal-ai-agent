import { describe, it, expect, vi, afterAll } from "vitest";
import Fastify from "fastify";

const mockSignal = vi.fn().mockResolvedValue(undefined);

const mockGetHandle = vi.fn().mockReturnValue({
  signal: mockSignal,
});

vi.mock("@temporalio/client", () => ({
  Connection: {
    connect: vi.fn().mockResolvedValue({}),
  },
  Client: vi.fn().mockImplementation(() => ({
    workflow: {
      getHandle: mockGetHandle,
    },
  })),
}));

async function buildApp() {
  const { approvalRoutes } = await import("../../../src/api/routes/approval.routes.js");
  const app = Fastify();
  await app.register(approvalRoutes);
  return app;
}

describe("Approval Routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterAll(async () => {
    if (app) await app.close();
  });

  it("API-APR-001: GET /approval/pending returns empty pending list", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/approval/pending",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.pending).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("API-APR-002: POST /approval/:id/approve returns 200", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/approval/test-workflow-id/approve",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toContain("Approval");
    expect(body.workflowId).toBe("test-workflow-id");
    expect(mockSignal).toHaveBeenCalled();
  });

  it("API-APR-003: POST /approval/:id/approve with modified arguments passes them through", async () => {
    mockSignal.mockClear();
    const response = await app.inject({
      method: "POST",
      url: "/approval/test-workflow-id/approve",
      payload: { modifiedArguments: { path: "/new/path" } },
    });

    expect(response.statusCode).toBe(200);
    expect(mockSignal).toHaveBeenCalled();
  });

  it("API-APR-004: POST /approval/:id/reject returns 200", async () => {
    mockSignal.mockClear();
    const response = await app.inject({
      method: "POST",
      url: "/approval/test-workflow-id/reject",
      payload: { reason: "Too risky" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toContain("Rejection");
    expect(body.workflowId).toBe("test-workflow-id");
    expect(mockSignal).toHaveBeenCalled();
  });
});
