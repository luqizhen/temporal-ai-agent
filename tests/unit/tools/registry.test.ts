import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { createMockTool } from "../../helpers/mocks.js";

describe("ToolRegistry", () => {
  it("REG-001: should register a valid tool", () => {
    const registry = new ToolRegistry();
    const tool = createMockTool({ name: "test-tool" });
    registry.register(tool);
    expect(registry.get("test-tool")).toBe(tool);
  });

  it("REG-002: should retrieve tool by name", () => {
    const registry = new ToolRegistry();
    const tool = createMockTool({ name: "my-tool" });
    registry.register(tool);
    const retrieved = registry.get("my-tool");
    expect(retrieved.name).toBe("my-tool");
    expect(retrieved).toBe(tool);
  });

  it("REG-003: should list all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool({ name: "tool-a" }));
    registry.register(createMockTool({ name: "tool-b" }));
    const tools = registry.list();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(["tool-a", "tool-b"]);
  });

  it("REG-004: should generate OpenAI tool definitions in correct format", () => {
    const registry = new ToolRegistry();
    registry.register(
      createMockTool({
        name: "search",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      }),
    );
    const defs = registry.getOpenAIToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toEqual({
      type: "function",
      function: {
        name: "search",
        description: "Search the web",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
    });
  });

  it("REG-005: should reject duplicate tool name registration", () => {
    const registry = new ToolRegistry();
    registry.register(createMockTool({ name: "duplicate" }));
    expect(() =>
      registry.register(createMockTool({ name: "duplicate" })),
    ).toThrow("Tool already registered: duplicate");
  });

  it("REG-006: should reject tool without name (empty string)", () => {
    const registry = new ToolRegistry();
    const tool = createMockTool({ name: "" });
    expect(() => registry.register(tool)).toThrow("Tool must have a name");
  });

  it("REG-007: should throw when getting non-existent tool", () => {
    const registry = new ToolRegistry();
    expect(() => registry.get("nonexistent")).toThrow(
      "Tool not found: nonexistent",
    );
  });
});
