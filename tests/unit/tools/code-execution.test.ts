import { describe, it, expect } from "vitest";
import { codeExecutionTool } from "../../../src/tools/definitions/code-execution.js";

describe("code-execution tool", () => {
  it("CEX-001: execute simple JS returns result", async () => {
    const result = await codeExecutionTool.execute({
      code: "const x = 1 + 1; return x;",
      language: "js",
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe("2");
  });

  it("CEX-003: execution timeout returns error", async () => {
    const result = await codeExecutionTool.execute({
      code: "while(true) {}",
      language: "js",
      timeout: 500,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
  });

  it("CEX-004: runtime error returns error message", async () => {
    const result = await codeExecutionTool.execute({
      code: "throw new Error('test error');",
      language: "js",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("test error");
  });

  it("CEX-006: requiresApproval is true", () => {
    expect(codeExecutionTool.requiresApproval).toBe(true);
  });

  it("should block require calls", async () => {
    const result = await codeExecutionTool.execute({
      code: "require('fs')",
      language: "js",
    });
    expect(result.success).toBe(false);
  });

  it("should block process.exit", async () => {
    const result = await codeExecutionTool.execute({
      code: "process.exit(1)",
      language: "js",
    });
    expect(result.success).toBe(false);
  });

  it("should block import statements", async () => {
    const result = await codeExecutionTool.execute({
      code: "import fs from 'fs'",
      language: "js",
    });
    expect(result.success).toBe(false);
  });

  it("should return console.log output", async () => {
    const result = await codeExecutionTool.execute({
      code: 'console.log("hello"); console.log("world");',
      language: "js",
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe("hello\nworld");
  });
});
