import Fastify from "fastify";
import cors from "@fastify/cors";
import { agentRoutes } from "./routes/agent.routes.js";
import { approvalRoutes } from "./routes/approval.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { loadConfig } from "../shared/config.js";

export async function createServer() {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.api.corsOrigin });
  await app.register(healthRoutes);
  await app.register(agentRoutes);
  await app.register(approvalRoutes);

  return { app, config };
}

export async function startServer() {
  const { app, config } = await createServer();
  await app.listen({ port: config.api.port, host: "0.0.0.0" });
}
