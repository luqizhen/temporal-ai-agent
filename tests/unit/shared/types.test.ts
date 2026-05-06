import { describe, it, expect } from "vitest";
import {
  AgentMessage,
  ToolCall,
  ToolResult,
  AgentRunInput,
  AgentRunResult,
  WorkflowState,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalStatus,
  LLMResponse,
  ToolDefinition,
} from "../../src/shared/types.js";

describe("AgentMessage", () => {
  it("should allow system role", () => {
    const msg: AgentMessage = { role: "system", content: "You are helpful" };
    expect(msg.role).toBe("system");
    expect(msg.content).toBe("You are helpful");
  });

  it("should allow user role", () => {
    const msg: AgentMessage = { role: "user", content: "Hello" };
    expect(msg.role).toBe("user");
  });

  it("should allow assistant role with tool calls", () => {
    const msg: AgentMessage = {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "call_1", name: "search", arguments: { q: "test" } }],
    };
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe("search");
  });

  it("should allow tool role with toolCallId", () => {
    const msg: AgentMessage = {
      role: "tool",
      content: "result",
      toolCallId: "call_1",
    };
    expect(msg.toolCallId).toBe("call_1");
  });
});

describe("ToolCall", () => {
  it("should have id, name, and arguments", () => {
    const tc: ToolCall = {
      id: "call_abc",
      name: "web-search",
      arguments: { query: "test" },
    };
    expect(tc.id).toBe("call_abc");
    expect(tc.name).toBe("web-search");
    expect(tc.arguments.query).toBe("test");
  });
});

describe("ToolResult", () => {
  it("should represent a successful result", () => {
    const result: ToolResult = {
      toolCallId: "call_1",
      success: true,
      output: '{"data": "found"}',
    };
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should represent a failed result", () => {
    const result: ToolResult = {
      toolCallId: "call_1",
      success: false,
      output: "",
      error: "API timeout",
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe("API timeout");
  });
});

describe("AgentRunInput", () => {
  it("should require prompt", () => {
    const input: AgentRunInput = { prompt: "Hello" };
    expect(input.prompt).toBe("Hello");
    expect(input.maxIterations).toBeUndefined();
    expect(input.systemPrompt).toBeUndefined();
  });

  it("should accept optional fields", () => {
    const input: AgentRunInput = {
      prompt: "Hello",
      systemPrompt: "Be concise",
      maxIterations: 10,
      sessionId: "sess-123",
    };
    expect(input.systemPrompt).toBe("Be concise");
    expect(input.maxIterations).toBe(10);
    expect(input.sessionId).toBe("sess-123");
  });
});

describe("AgentRunResult", () => {
  it("should track completed status", () => {
    const result: AgentRunResult = {
      finalAnswer: "42",
      iterations: 1,
      toolCallsExecuted: 0,
      approvalsRequested: 0,
      status: "completed",
    };
    expect(result.status).toBe("completed");
    expect(result.error).toBeUndefined();
  });

  it("should track error status", () => {
    const result: AgentRunResult = {
      finalAnswer: "",
      iterations: 20,
      toolCallsExecuted: 15,
      approvalsRequested: 3,
      status: "max_iterations",
    };
    expect(result.status).toBe("max_iterations");
  });
});

describe("WorkflowState", () => {
  it("should represent running state", () => {
    const state: WorkflowState = {
      messages: [{ role: "user", content: "hi" }],
      iteration: 0,
      status: "running",
      toolCallsExecuted: 0,
      approvalsRequested: 0,
    };
    expect(state.status).toBe("running");
    expect(state.pendingApproval).toBeUndefined();
  });

  it("should include pending approval when waiting", () => {
    const approval: ApprovalRequest = {
      toolCallId: "call_1",
      toolName: "file-write",
      arguments: { path: "test.txt" },
      riskLevel: "medium",
      description: "Write file test.txt",
      childWorkflowId: "tool-wf-123",
    };
    const state: WorkflowState = {
      messages: [],
      iteration: 1,
      status: "waiting_approval",
      pendingApproval: approval,
      toolCallsExecuted: 1,
      approvalsRequested: 1,
    };
    expect(state.pendingApproval?.toolName).toBe("file-write");
  });
});

describe("ApprovalResponse", () => {
  it("should approve", () => {
    const response: ApprovalResponse = { approved: true };
    expect(response.approved).toBe(true);
    expect(response.modifiedArguments).toBeUndefined();
  });

  it("should reject with reason", () => {
    const response: ApprovalResponse = { approved: false, reason: "Unsafe" };
    expect(response.approved).toBe(false);
    expect(response.reason).toBe("Unsafe");
  });
});

describe("LLMResponse", () => {
  it("should represent text-only response", () => {
    const resp: LLMResponse = {
      content: "Hello!",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop",
    };
    expect(resp.finishReason).toBe("stop");
    expect(resp.toolCalls).toHaveLength(0);
  });

  it("should represent tool-calling response", () => {
    const resp: LLMResponse = {
      content: null,
      toolCalls: [{ id: "c1", name: "search", arguments: { q: "x" } }],
      usage: { promptTokens: 50, completionTokens: 20 },
      finishReason: "tool_calls",
    };
    expect(resp.finishReason).toBe("tool_calls");
    expect(resp.toolCalls).toHaveLength(1);
  });
});

describe("ToolDefinition", () => {
  it("should define tool schema", () => {
    const def: ToolDefinition = {
      name: "calculator",
      description: "Evaluates math expressions",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "Math expression" },
        },
        required: ["expression"],
      },
    };
    expect(def.parameters.required).toContain("expression");
  });
});
