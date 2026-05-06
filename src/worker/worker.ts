import { Worker, NativeConnection } from "@temporalio/worker";
import { loadConfig } from "../shared/config.js";
import { TASK_QUEUE } from "../shared/constants.js";
import { toolRegistry } from "../tools/registry.js";
import { webSearchTool } from "../tools/definitions/web-search.js";
import { codeExecutionTool } from "../tools/definitions/code-execution.js";
import { createFileReadTool, createFileWriteTool } from "../tools/definitions/file-io.js";
import { httpRequestTool } from "../tools/definitions/http-request.js";
import * as activities from "../activities/index.js";

export async function registerTools(workspaceDir: string) {
  toolRegistry.register(webSearchTool);
  toolRegistry.register(codeExecutionTool);
  toolRegistry.register(createFileReadTool(workspaceDir));
  toolRegistry.register(createFileWriteTool(workspaceDir));
  toolRegistry.register(httpRequestTool);
}

export async function runWorker() {
  const config = loadConfig();
  await registerTools(config.agent.workspaceDir);

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: TASK_QUEUE,
    workflowsPath: new URL("../workflows/index.ts", import.meta.url).pathname,
    activities,
  });

  const shutdown = async () => {
    await worker.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await worker.run();
}
