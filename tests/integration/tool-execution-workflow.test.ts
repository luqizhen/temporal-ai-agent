import { describe, it, expect, beforeAll, afterAll } from "vitest";

const NATIVE_AVAILABLE = await import("@temporalio/testing").then(() => true).catch(() => false);

describe.skipIf(!NATIVE_AVAILABLE)("Tool Execution Workflow Integration", () => {
  let env: any;
  let worker: any;

  beforeAll(async () => {
    const { TestWorkflowEnvironment } = await import("@temporalio/testing");
    const { Worker } = await import("@temporalio/worker");
    env = await TestWorkflowEnvironment.createLocal();

    const workflowsPath = new URL("../../src/workflows/tool-execution.workflow.ts", import.meta.url)
      .pathname;

    worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: "test-tool",
      workflowsPath,
      activities: {
        executeTool: async () => ({
          toolCallId: "call_1",
          success: true,
          output: "executed",
        }),
      },
    });
  });

  afterAll(async () => {
    await worker?.shutdown();
    await env?.teardown();
  });

  it("WF-TOOL-001: approval granted executes tool", async () => {
    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start("toolExecutionWorkflow", {
        taskQueue: "test-tool",
        args: [
          {
            toolCall: { id: "call_1", name: "search", arguments: { query: "test" } },
            description: "Search the web",
            riskLevel: "low",
          },
        ],
        workflowId: "wf-tool-001",
      });
      await handle.signal("approvalSignal", [{ approved: true }]);
      const result = await handle.result();
      expect(result.success).toBe(true);
    });
  });
});
