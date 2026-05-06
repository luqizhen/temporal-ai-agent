import type { FastifyInstance } from "fastify";
import { Connection, Client } from "@temporalio/client";
import { agentWorkflow } from "../../workflows/index.js";
import { TASK_QUEUE } from "../../shared/constants.js";
import type { AgentRunInput, AgentRunResult, WorkflowState } from "../../shared/types.js";

async function getTemporalClient() {
  const connection = await Connection.connect();
  return new Client({ connection });
}

export async function agentRoutes(app: FastifyInstance) {
  app.post("/agent/start", async (request, reply) => {
    const body = request.body as AgentRunInput;
    if (!body || !body.prompt) {
      return reply.code(400).send({ error: "prompt is required" });
    }

    const client = await getTemporalClient();
    const workflowId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handle = await client.workflow.start(agentWorkflow, {
      args: [body],
      taskQueue: TASK_QUEUE,
      workflowId,
    });

    return reply.code(202).send({
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    });
  });

  app.get("/agent/:workflowId", async (request) => {
    const { workflowId } = request.params as { workflowId: string };
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);

    try {
      const state = await handle.query<WorkflowState>("getState");
      return { workflowId, ...state };
    } catch {
      return { error: "Workflow not found", workflowId };
    }
  });

  app.get("/agent/:workflowId/result", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);

    try {
      const result = await handle.result() as AgentRunResult;
      return { workflowId, status: "completed", result };
    } catch {
      return reply.code(409).send({ error: "Workflow still running", workflowId });
    }
  });

  app.delete("/agent/:workflowId", async (request) => {
    const { workflowId } = request.params as { workflowId: string };
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    await handle.cancel();
    return { message: "Cancellation requested", workflowId };
  });
}
