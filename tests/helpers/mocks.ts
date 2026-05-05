import type { AgentMessage, ToolCall, ToolResult, LLMResponse } from "../../src/shared/types.js";
import type { Tool } from "../../src/tools/tool.interface.js";
import type { LLMProvider } from "../../src/llm/provider.interface.js";

export function createMockLLMProvider(
  overrides?: Partial<LLMProvider>,
): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue({
      content: "mock response",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
    } satisfies LLMResponse),
    ...overrides,
  };
}

export function createMockTool(overrides?: Partial<Tool>): Tool {
  return {
    name: "mock-tool",
    description: "A mock tool for testing",
    parameters: { type: "object", properties: {} },
    requiresApproval: false,
    riskLevel: "low",
    execute: vi.fn().mockResolvedValue({
      toolCallId: "call_mock",
      success: true,
      output: "mock output",
    } satisfies ToolResult),
    ...overrides,
  };
}

export const SAMPLE_MESSAGES: AgentMessage[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello" },
];

export const SAMPLE_TOOL_CALL: ToolCall = {
  id: "call_abc123",
  name: "web-search",
  arguments: { query: "test query" },
};

export const SAMPLE_TOOL_RESULT: ToolResult = {
  toolCallId: "call_abc123",
  success: true,
  output: JSON.stringify([
    { title: "Test", url: "https://example.com", snippet: "..." },
  ]),
};

export const SAMPLE_LLM_RESPONSE: LLMResponse = {
  content: "Here is the answer.",
  toolCalls: [],
  usage: { promptTokens: 100, completionTokens: 50 },
  finishReason: "stop",
};
