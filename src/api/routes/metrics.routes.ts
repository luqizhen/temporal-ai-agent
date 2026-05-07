import type { FastifyInstance } from "fastify";
import { getMetrics, getMetricsContentType } from "../../shared/metrics.js";

export async function metricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (_request, reply) => {
    const contentType = await getMetricsContentType();
    const body = await getMetrics();
    reply.header("Content-Type", contentType);
    return reply.send(body);
  });
}
