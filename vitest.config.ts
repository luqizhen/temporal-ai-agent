import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "../../src": path.resolve(__dirname, "src"),
      "../src": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/index.ts",
        "src/api/server.ts",
        "src/worker/worker.ts",
        "src/workflows/agent.workflow.ts",
        "src/workflows/tool-execution.workflow.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
