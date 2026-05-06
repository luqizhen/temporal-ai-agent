import { describe, it, expect } from "vitest";
import type { ApprovalResponse } from "../../../src/shared/types.js";
import {
  getApprovalStatus,
  buildRejectionResult,
  resolveExecutionParams,
} from "../../../src/workflows/tool-execution.helpers.js";

describe("getApprovalStatus", () => {
  it("returns pending when no decision", () => {
    const status = getApprovalStatus(null, "web-search");
    expect(status).toEqual({ status: "pending", toolName: "web-search" });
  });

  it("returns approved when decision is approved", () => {
    const decision: ApprovalResponse = { approved: true };
    const status = getApprovalStatus(decision, "file-write");
    expect(status).toEqual({ status: "approved", toolName: "file-write" });
  });

  it("returns rejected when decision is rejected", () => {
    const decision: ApprovalResponse = { approved: false, reason: "Dangerous" };
    const status = getApprovalStatus(decision, "shell-exec");
    expect(status).toEqual({ status: "rejected", toolName: "shell-exec" });
  });
});

describe("buildRejectionResult", () => {
  it("WF-TOOL-002: builds result for rejected decision with reason", () => {
    const decision: ApprovalResponse = { approved: false, reason: "Not allowed" };
    const result = buildRejectionResult("call_1", decision);
    expect(result).toEqual({
      toolCallId: "call_1",
      success: false,
      output: "",
      error: "Not allowed",
    });
  });

  it("WF-TOOL-003: builds result for timeout (null decision)", () => {
    const result = buildRejectionResult("call_1", null);
    expect(result).toEqual({
      toolCallId: "call_1",
      success: false,
      output: "",
      error: "Approval timeout",
    });
  });

  it("builds result for rejected decision without reason uses fallback", () => {
    const decision: ApprovalResponse = { approved: false };
    const result = buildRejectionResult("call_2", decision);
    expect(result.error).toBe("Approval timeout");
    expect(result.success).toBe(false);
  });
});

describe("resolveExecutionParams", () => {
  it("uses default args when no modified arguments", () => {
    const decision: ApprovalResponse = { approved: true };
    const defaultArgs = { query: "test" };
    expect(resolveExecutionParams(decision, defaultArgs)).toEqual({ query: "test" });
  });

  it("WF-TOOL-001: uses modified arguments when provided", () => {
    const decision: ApprovalResponse = {
      approved: true,
      modifiedArguments: { query: "safe query", limit: 10 },
    };
    const defaultArgs = { query: "dangerous query" };
    expect(resolveExecutionParams(decision, defaultArgs)).toEqual({
      query: "safe query",
      limit: 10,
    });
  });

  it("prefers modified arguments over defaults", () => {
    const decision: ApprovalResponse = {
      approved: true,
      modifiedArguments: { path: "/safe/path" },
    };
    const defaultArgs = { path: "/etc/passwd" };
    const params = resolveExecutionParams(decision, defaultArgs);
    expect(params).toEqual({ path: "/safe/path" });
  });
});

describe("WF-TOOL: Tool execution workflow logic simulation", () => {
  function simulateToolExecution(
    input: {
      toolCall: { id: string; name: string; arguments: Record<string, unknown> };
      riskLevel: "low" | "medium" | "high";
    },
    decision: ApprovalResponse | null,
    timedOut: boolean,
  ) {
    const status = getApprovalStatus(decision, input.toolCall.name);

    if (timedOut || !decision?.approved) {
      return buildRejectionResult(input.toolCall.id, decision);
    }

    const params = resolveExecutionParams(decision, input.toolCall.arguments);
    return {
      toolCallId: input.toolCall.id,
      success: true,
      output: `Executed ${input.toolCall.name} with ${JSON.stringify(params)}`,
    };
  }

  it("WF-TOOL-001: approval granted executes tool", () => {
    const result = simulateToolExecution(
      {
        toolCall: { id: "call_1", name: "web-search", arguments: { query: "test" } },
        riskLevel: "low",
      },
      { approved: true },
      false,
    );
    expect(result.success).toBe(true);
    expect(result.toolCallId).toBe("call_1");
    expect(result.output).toContain("web-search");
  });

  it("WF-TOOL-001: approval with modified arguments uses those args", () => {
    const result = simulateToolExecution(
      {
        toolCall: { id: "call_1", name: "file-write", arguments: { path: "/etc/hosts", content: "test" } },
        riskLevel: "high",
      },
      { approved: true, modifiedArguments: { path: "/tmp/safe.txt", content: "test" } },
      false,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("/tmp/safe.txt");
  });

  it("WF-TOOL-002: approval rejected returns failure", () => {
    const result = simulateToolExecution(
      {
        toolCall: { id: "call_1", name: "shell-exec", arguments: { command: "rm -rf /" } },
        riskLevel: "high",
      },
      { approved: false, reason: "Dangerous command rejected" },
      false,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Dangerous command rejected");
  });

  it("WF-TOOL-003: approval timeout returns failure", () => {
    const result = simulateToolExecution(
      {
        toolCall: { id: "call_1", name: "file-write", arguments: { path: "/test" } },
        riskLevel: "medium",
      },
      null,
      true,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("Approval timeout");
  });
});
