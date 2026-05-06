import type { FastifyInstance } from "fastify";
import { Connection, Client } from "@temporalio/client";
import { approvalSignal } from "../../workflows/index.js";
import type { ApprovalResponse } from "../../shared/types.js";

async function getTemporalClient() {
  const connection = await Connection.connect();
  return new Client({ connection });
}

export async function approvalRoutes(app: FastifyInstance) {
  app.get("/approval/pending", async () => {
    return { pending: [], count: 0 };
  });

  app.post("/approval/:workflowId/approve", async (request) => {
    const { workflowId } = request.params as { workflowId: string };
    const body = (request.body || {}) as { modifiedArguments?: Record<string, unknown> };
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);

    await handle.signal(approvalSignal, {
      approved: true,
      modifiedArguments: body.modifiedArguments,
    } satisfies ApprovalResponse);

    return { message: "Approval sent", workflowId };
  });

  app.post("/approval/:workflowId/reject", async (request) => {
    const { workflowId } = request.params as { workflowId: string };
    const body = (request.body || {}) as { reason?: string };
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);

    await handle.signal(approvalSignal, {
      approved: false,
      reason: body.reason,
    } satisfies ApprovalResponse);

    return { message: "Rejection sent", workflowId };
  });
}
