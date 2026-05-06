import { describe, it, expect, afterAll } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../../../src/api/routes/health.routes.js";

async function buildApp() {
  const app = Fastify();
  await app.register(healthRoutes);
  return app;
}

describe("Health Routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterAll(async () => {
    if (app) await app.close();
  });

  it("API-HLT-001: GET /health returns status ok", async () => {
    app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
  });
});
