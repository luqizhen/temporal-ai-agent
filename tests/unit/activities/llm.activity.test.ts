import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentMessage, LLMResponse, ToolDefinition } from "../../../src/shared/types.js";
import type { LLMProvider } from "../../../src/llm/provider.interface.js";

vi.mock("../../../src/shared/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    llm: {
      baseUrl: "https://api.test.com/v1",
      apiKey: "sk-test",
      model: "test-model",
      maxTokens: 4096,
      temperature: 0.7,
    },
  }),
}));

vi.mock("../../../src/llm/factory.js", () => ({
  createLLMProvider: vi.fn(),
}));

import { createLLMProvider } from "../../../src/llm/factory.js";

const mockProvider = {
  chat: vi.fn(),
} as unknown as LLMProvider;

vi.mocked(createLLMProvider).mockReturnValue(mockProvider);

vi.mock("../../../src/tools/registry.js", () => ({
  toolRegistry: {
    getOpenAIToolDefinitions: vi.fn().mockReturnValue([]),
    get: vi.fn(),
  },
}));

const SAMPLE_LLM_RESPONSE: LLMResponse = {
  content: "Hello! How can I help?",
  toolCalls: [],
  usage: { promptTokens: 10, completionTokens: 20 },
  finishReason: "stop",
};

const SAMPLE_MESSAGES: AgentMessage[] = [
  { role: "system", content: "You are helpful" },
  { role: "user", content: "Hi" },
];

describe("callLLM activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return LLMResponse from provider", async () => {
    vi.mocked(mockProvider.chat).mockResolvedValue(SAMPLE_LLM_RESPONSE);

    const { callLLM } = await import("../../../src/activities/index.js");
    const result = await callLLM(SAMPLE_MESSAGES);

    expect(result).toEqual(SAMPLE_LLM_RESPONSE);
    expect(result.content).toBe("Hello! How can I help?");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("should pass messages and tools to provider", async () => {
    vi.mocked(mockProvider.chat).mockResolvedValue(SAMPLE_LLM_RESPONSE);
    const tools: ToolDefinition[] = [
      {
        name: "search",
        description: "Search",
        parameters: { type: "object", properties: { q: { type: "string" } } },
      },
    ];

    const { callLLM } = await import("../../../src/activities/index.js");
    await callLLM(SAMPLE_MESSAGES, tools);

    expect(mockProvider.chat).toHaveBeenCalledWith(SAMPLE_MESSAGES, tools);
  });

  it("should propagate provider errors", async () => {
    vi.mocked(mockProvider.chat).mockRejectedValue(new Error("API timeout"));

    const { callLLM } = await import("../../../src/activities/index.js");

    await expect(callLLM(SAMPLE_MESSAGES)).rejects.toThrow("API timeout");
  });

  it("should return tool calls in response", async () => {
    const toolResponse: LLMResponse = {
      content: null,
      toolCalls: [{ id: "call_1", name: "search", arguments: { query: "test" } }],
      usage: { promptTokens: 50, completionTokens: 30 },
      finishReason: "tool_calls",
    };
    vi.mocked(mockProvider.chat).mockResolvedValue(toolResponse);

    const { callLLM } = await import("../../../src/activities/index.js");
    const result = await callLLM(SAMPLE_MESSAGES);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("search");
    expect(result.finishReason).toBe("tool_calls");
  });
});
