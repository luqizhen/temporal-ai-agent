import { describe, it, expect, beforeAll, afterAll } from "vitest";

const NATIVE_AVAILABLE = await import("@temporalio/testing")
  .then(() => true)
  .catch(() => false);

describe.skipIf(!NATIVE_AVAILABLE)("Agent Workflow Integration", () => {
  let env: any;
  let worker: any;

  beforeAll(async () => {
    const { TestWorkflowEnvironment } = await import("@temporalio/testing");
    const { Worker } = await import("@temporalio/worker");
    env = await TestWorkflowEnvironment.createLocal();

    const workflowsPath = new URL(
      "../../src/workflows/agent.workflow.ts",
      import.meta.url,
    ).pathname;

    worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: "test-agent",
      workflowsPath,
      activities: {
        callLLM: async () => ({
          content: "Hello response",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        }),
        executeTool: async () => ({
          toolCallId: "call_mock",
          success: true,
          output: "mock output",
        }),
      },
    });
  });

  afterAll(async () => {
    await worker?.shutdown();
    await env?.teardown();
  });

  it("WF-AGENT-001: completes simple Q&A", async () => {
    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start("agentWorkflow", {
        taskQueue: "test-agent",
        args: [{ prompt: "What is 2+2?" }],
        workflowId: "wf-agent-001",
      });
      const result = await handle.result();
      expect(result.status).toBe("completed");
      expect(result.finalAnswer).toBe("Hello response");
    });
  });
});
