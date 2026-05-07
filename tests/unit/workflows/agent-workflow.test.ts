import { describe, it, expect } from "vitest";
import type {
  AgentMessage,
  AgentRunResult,
  LLMResponse,
  ToolResult,
} from "../../../src/shared/types.js";
import { DEFAULT_SYSTEM_PROMPT, MAX_STATE_MESSAGES } from "../../../src/shared/constants.js";
import {
  initializeMessages,
  truncateMessages,
  buildState,
  buildCompletedResult,
  buildMaxIterResult,
  buildAssistantMessage,
  buildToolMessage,
  buildToolErrorMessage,
} from "../../../src/workflows/agent.helpers.js";

describe("initializeMessages", () => {
  it("creates messages with default system prompt when no systemPrompt provided", () => {
    const messages = initializeMessages("Hello");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "system", content: DEFAULT_SYSTEM_PROMPT });
    expect(messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("creates messages with custom system prompt when provided", () => {
    const messages = initializeMessages("Hello", "Custom prompt");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "system", content: "Custom prompt" });
    expect(messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("uses default system prompt when systemPrompt is empty string", () => {
    const messages = initializeMessages("Hello", "");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "system", content: DEFAULT_SYSTEM_PROMPT });
  });
});

describe("truncateMessages", () => {
  it("returns messages unchanged when under limit", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    expect(truncateMessages(messages)).toEqual(messages);
  });

  it("returns messages unchanged when at limit", () => {
    const messages = Array.from({ length: MAX_STATE_MESSAGES }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }));
    expect(truncateMessages(messages)).toEqual(messages);
  });

  it("truncates messages when over limit, keeping first and last N-1", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "sys" },
      ...Array.from({ length: MAX_STATE_MESSAGES }, (_, i) => ({
        role: "user" as const,
        content: `msg ${i + 1}`,
      })),
    ];
    const truncated = truncateMessages(messages);
    expect(truncated).toHaveLength(MAX_STATE_MESSAGES);
    expect(truncated[0]).toEqual({ role: "system", content: "sys" });
    expect(truncated[truncated.length - 1]).toEqual({
      role: "user",
      content: `msg ${MAX_STATE_MESSAGES}`,
    });
  });

  it("preserves system message as first after truncation", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "important system" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ];
    const result = truncateMessages(messages);
    expect(result[0]).toEqual({ role: "system", content: "important system" });
  });
});

describe("buildState", () => {
  it("returns running status when iteration < maxIter", () => {
    const messages = initializeMessages("test");
    const state = buildState(messages, 2, 10, 1, 0);
    expect(state).toEqual({
      messages,
      iteration: 2,
      status: "running",
      toolCallsExecuted: 1,
      approvalsRequested: 0,
    });
  });

  it("returns completed status when iteration >= maxIter", () => {
    const messages = initializeMessages("test");
    const state = buildState(messages, 10, 10, 5, 0);
    expect(state.status).toBe("completed");
  });
});

describe("buildCompletedResult", () => {
  it("builds a completed result with all fields", () => {
    const result = buildCompletedResult("The answer is 42", 3, 2, 0);
    expect(result).toEqual({
      finalAnswer: "The answer is 42",
      iterations: 3,
      toolCallsExecuted: 2,
      approvalsRequested: 0,
      status: "completed",
    });
  });

  it("handles empty content", () => {
    const result = buildCompletedResult("", 1, 0, 0);
    expect(result.finalAnswer).toBe("");
  });
});

describe("buildMaxIterResult", () => {
  it("uses last message content as final answer", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "sys" },
      { role: "assistant", content: "partial answer" },
    ];
    const result = buildMaxIterResult(messages, 5, 3, 0);
    expect(result).toEqual({
      finalAnswer: "partial answer",
      iterations: 5,
      toolCallsExecuted: 3,
      approvalsRequested: 0,
      status: "max_iterations",
    });
  });

  it("uses fallback when messages is empty", () => {
    const result = buildMaxIterResult([], 5, 0, 0);
    expect(result.finalAnswer).toBe("Max iterations reached");
  });
});

describe("buildAssistantMessage", () => {
  it("builds assistant message without tool calls", () => {
    const msg = buildAssistantMessage("Hello!", []);
    expect(msg).toEqual({ role: "assistant", content: "Hello!" });
    expect(msg.toolCalls).toBeUndefined();
  });

  it("builds assistant message with tool calls", () => {
    const toolCalls = [{ id: "call_1", name: "search", arguments: { query: "test" } }];
    const msg = buildAssistantMessage("Searching...", toolCalls);
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Searching...");
    expect(msg.toolCalls).toEqual(toolCalls);
  });

  it("handles null content", () => {
    const msg = buildAssistantMessage(null, []);
    expect(msg.content).toBe("");
  });
});

describe("buildToolMessage", () => {
  it("builds tool message for successful result", () => {
    const msg = buildToolMessage({ success: true, output: "result data" }, "call_1");
    expect(msg).toEqual({
      role: "tool",
      content: "result data",
      toolCallId: "call_1",
    });
  });

  it("builds tool message for failed result", () => {
    const msg = buildToolMessage({ success: false, output: "", error: "Tool failed" }, "call_1");
    expect(msg).toEqual({
      role: "tool",
      content: "Error: Tool failed",
      toolCallId: "call_1",
    });
  });
});

describe("buildToolErrorMessage", () => {
  it("builds message from Error object", () => {
    const msg = buildToolErrorMessage(new Error("network error"), "call_1");
    expect(msg).toEqual({
      role: "tool",
      content: "Error: network error",
      toolCallId: "call_1",
    });
  });

  it("builds message from string error", () => {
    const msg = buildToolErrorMessage("something broke", "call_1");
    expect(msg).toEqual({
      role: "tool",
      content: "Error: something broke",
      toolCallId: "call_1",
    });
  });
});

describe("WF-AGENT: Agent workflow logic simulation", () => {
  function simulateAgentLoop(
    input: { prompt: string; systemPrompt?: string; maxIterations?: number },
    llmResponses: LLMResponse[],
    toolResults: Map<string, ToolResult>,
  ): AgentRunResult {
    const maxIter = input.maxIterations || 20;
    const messages = initializeMessages(input.prompt, input.systemPrompt);
    let iteration = 0;
    let toolCallsExecuted = 0;
    let responseIndex = 0;

    while (iteration < maxIter) {
      iteration++;
      const llmResponse = llmResponses[responseIndex++];
      if (!llmResponse) break;

      messages.push(buildAssistantMessage(llmResponse.content, llmResponse.toolCalls));

      if (llmResponse.toolCalls.length === 0) {
        return buildCompletedResult(llmResponse.content || "", iteration, toolCallsExecuted, 0);
      }

      for (const toolCall of llmResponse.toolCalls) {
        const result = toolResults.get(toolCall.id);
        if (result) {
          toolCallsExecuted++;
          messages.push(buildToolMessage(result, toolCall.id));
        } else {
          messages.push(buildToolErrorMessage(`Unknown tool call: ${toolCall.id}`, toolCall.id));
        }
      }
    }

    return buildMaxIterResult(messages, iteration, toolCallsExecuted, 0);
  }

  it("WF-AGENT-001: Simple Q&A with no tool calls completes", () => {
    const result = simulateAgentLoop(
      { prompt: "What is 2+2?" },
      [
        {
          content: "4",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        },
      ],
      new Map(),
    );
    expect(result.status).toBe("completed");
    expect(result.finalAnswer).toBe("4");
    expect(result.iterations).toBe(1);
    expect(result.toolCallsExecuted).toBe(0);
  });

  it("WF-AGENT-002: Single tool call executes and completes", () => {
    const toolResults = new Map<string, ToolResult>([
      ["call_1", { toolCallId: "call_1", success: true, output: "search results" }],
    ]);
    const result = simulateAgentLoop(
      { prompt: "Search for something" },
      [
        {
          content: null,
          toolCalls: [{ id: "call_1", name: "web-search", arguments: { query: "test" } }],
          usage: { promptTokens: 10, completionTokens: 20 },
          finishReason: "tool_calls",
        },
        {
          content: "Here are the results: search results",
          toolCalls: [],
          usage: { promptTokens: 15, completionTokens: 10 },
          finishReason: "stop",
        },
      ],
      toolResults,
    );
    expect(result.status).toBe("completed");
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.finalAnswer).toBe("Here are the results: search results");
    expect(result.iterations).toBe(2);
  });

  it("WF-AGENT-005: Max iterations when LLM always returns tool calls", () => {
    const alwaysToolResponse: LLMResponse = {
      content: null,
      toolCalls: [{ id: "call_1", name: "search", arguments: { query: "test" } }],
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "tool_calls",
    };
    const responses = Array(5).fill(alwaysToolResponse);
    const toolResults = new Map<string, ToolResult>([
      ["call_1", { toolCallId: "call_1", success: true, output: "result" }],
    ]);

    const result = simulateAgentLoop(
      { prompt: "complex task", maxIterations: 5 },
      responses,
      toolResults,
    );
    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(5);
    expect(result.toolCallsExecuted).toBe(5);
  });

  it("WF-AGENT-008: Custom system prompt is applied as first message", () => {
    const result = simulateAgentLoop(
      { prompt: "Hello", systemPrompt: "You are a pirate." },
      [
        {
          content: "Ahoy!",
          toolCalls: [],
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        },
      ],
      new Map(),
    );
    expect(result.status).toBe("completed");
  });

  it("WF-AGENT-008: System prompt appears in initial messages", () => {
    const messages = initializeMessages("Hello", "You are a coding assistant.");
    expect(messages[0]).toEqual({ role: "system", content: "You are a coding assistant." });
    expect(messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("handles multiple tool calls in a single LLM response", () => {
    const toolResults = new Map<string, ToolResult>([
      ["call_1", { toolCallId: "call_1", success: true, output: "result 1" }],
      ["call_2", { toolCallId: "call_2", success: true, output: "result 2" }],
    ]);
    const result = simulateAgentLoop(
      { prompt: "Do two things" },
      [
        {
          content: null,
          toolCalls: [
            { id: "call_1", name: "search", arguments: { query: "a" } },
            { id: "call_2", name: "search", arguments: { query: "b" } },
          ],
          usage: { promptTokens: 10, completionTokens: 30 },
          finishReason: "tool_calls",
        },
        {
          content: "Done with both",
          toolCalls: [],
          usage: { promptTokens: 20, completionTokens: 5 },
          finishReason: "stop",
        },
      ],
      toolResults,
    );
    expect(result.status).toBe("completed");
    expect(result.toolCallsExecuted).toBe(2);
    expect(result.iterations).toBe(2);
  });

  it("handles failed tool results", () => {
    const toolResults = new Map<string, ToolResult>([
      ["call_1", { toolCallId: "call_1", success: false, output: "", error: "Rate limited" }],
    ]);
    const result = simulateAgentLoop(
      { prompt: "Search" },
      [
        {
          content: null,
          toolCalls: [{ id: "call_1", name: "search", arguments: { query: "test" } }],
          usage: { promptTokens: 10, completionTokens: 20 },
          finishReason: "tool_calls",
        },
        {
          content: "I encountered an error but here's my answer",
          toolCalls: [],
          usage: { promptTokens: 15, completionTokens: 10 },
          finishReason: "stop",
        },
      ],
      toolResults,
    );
    expect(result.status).toBe("completed");
    expect(result.toolCallsExecuted).toBe(1);
  });

  it("truncates messages when they exceed MAX_STATE_MESSAGES", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "sys" },
      ...Array.from({ length: MAX_STATE_MESSAGES + 10 }, (_, i) => ({
        role: "user" as const,
        content: `msg ${i}`,
      })),
    ];
    const truncated = truncateMessages(messages);
    expect(truncated).toHaveLength(MAX_STATE_MESSAGES);
    expect(truncated[0]).toEqual({ role: "system", content: "sys" });
  });
});
