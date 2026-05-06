import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Tool } from "../../../src/tools/tool.interface.js";
import type { ToolResult } from "../../../src/shared/types.js";

const mockTool: Tool = {
  name: "mock-tool",
  description: "A mock tool",
  parameters: { type: "object", properties: {} },
  requiresApproval: false,
  riskLevel: "low",
  execute: vi.fn().mockResolvedValue({
    toolCallId: "",
    success: true,
    output: "mock output",
  } satisfies ToolResult),
};

vi.mock("../../../src/tools/registry.js", () => ({
  toolRegistry: {
    get: vi.fn(),
  },
}));

import { toolRegistry } from "../../../src/tools/registry.js";

describe("executeTool activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute a registered tool and return result", async () => {
    vi.mocked(toolRegistry.get).mockReturnValue(mockTool);

    const { executeTool } = await import("../../../src/activities/index.js");
    const result = await executeTool("mock-tool", { input: "test" });

    expect(result.success).toBe(true);
    expect(result.output).toBe("mock output");
    expect(mockTool.execute).toHaveBeenCalledWith({ input: "test" });
  });

  it("should throw for unknown tool", async () => {
    vi.mocked(toolRegistry.get).mockImplementation(() => {
      throw new Error("Tool not found: unknown-tool");
    });

    const { executeTool } = await import("../../../src/activities/index.js");

    await expect(executeTool("unknown-tool", {})).rejects.toThrow("Tool not found");
  });

  it("should return error result when tool execution fails", async () => {
    const failTool: Tool = {
      ...mockTool,
      execute: vi.fn().mockResolvedValue({
        toolCallId: "",
        success: false,
        output: "",
        error: "Something went wrong",
      } satisfies ToolResult),
    };
    vi.mocked(toolRegistry.get).mockReturnValue(failTool);

    const { executeTool } = await import("../../../src/activities/index.js");
    const result = await executeTool("fail-tool", {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Something went wrong");
  });

  it("should set toolCallId on result", async () => {
    vi.mocked(toolRegistry.get).mockReturnValue(mockTool);

    const { executeTool } = await import("../../../src/activities/index.js");
    const result = await executeTool("mock-tool", { _toolCallId: "call_abc" });

    expect(result.toolCallId).toBeDefined();
  });
});
