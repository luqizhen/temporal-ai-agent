import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("@temporalio/worker", () => ({
  Worker: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    }),
  },
  NativeConnection: {
    connect: vi.fn().mockResolvedValue({}),
  },
}));

describe("Worker", () => {
  describe("WK-001: registerTools() populates the registry correctly", () => {
    let toolRegistry: typeof import("../../../src/tools/registry.js").toolRegistry;
    let registerTools: (workspaceDir: string) => Promise<void>;

    beforeAll(async () => {
      const registryModule = await import("../../../src/tools/registry.js");
      toolRegistry = registryModule.toolRegistry;

      const workerModule = await import("../../../src/worker/worker.js");
      registerTools = workerModule.registerTools;

      await registerTools("/tmp/test-workspace");
    });

    it("registers all 5 tools", () => {
      const tools = toolRegistry.list();
      expect(tools).toHaveLength(5);
    });

    it("registers web-search tool", () => {
      const tool = toolRegistry.get("web-search");
      expect(tool.name).toBe("web-search");
      expect(tool.description).toContain("web");
    });

    it("registers code-execution tool", () => {
      const tool = toolRegistry.get("code-execution");
      expect(tool.name).toBe("code-execution");
      expect(tool.requiresApproval).toBe(true);
      expect(tool.riskLevel).toBe("high");
    });

    it("registers file-read tool", () => {
      const tool = toolRegistry.get("file-read");
      expect(tool.name).toBe("file-read");
      expect(tool.requiresApproval).toBe(false);
      expect(tool.riskLevel).toBe("low");
    });

    it("registers file-write tool", () => {
      const tool = toolRegistry.get("file-write");
      expect(tool.name).toBe("file-write");
      expect(tool.requiresApproval).toBe(true);
      expect(tool.riskLevel).toBe("medium");
    });

    it("registers http-request tool", () => {
      const tool = toolRegistry.get("http-request");
      expect(tool.name).toBe("http-request");
      expect(tool.requiresApproval).toBe(true);
    });

    it("all tools have required properties", () => {
      const tools = toolRegistry.list();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe("object");
        expect(tool.parameters.properties).toBeDefined();
        expect(typeof tool.execute).toBe("function");
      }
    });
  });

  describe("WK-002: runWorker function exists and is async", () => {
    it("exports runWorker as a function", async () => {
      const workerModule = await import("../../../src/worker/worker.js");
      expect(typeof workerModule.runWorker).toBe("function");
    });
  });
});
