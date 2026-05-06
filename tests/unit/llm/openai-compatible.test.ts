import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { OpenAICompatibleProvider } from "../../../src/llm/openai-compatible.js";
import type { AgentMessage, ToolDefinition } from "../../../src/shared/types.js";

const BASE_URL = "https://api.test.com/v1";
const API_KEY = "test-api-key";
const MODEL = "gpt-4";

function createProvider(overrides?: { maxRetries?: number }) {
  return new OpenAICompatibleProvider({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    model: MODEL,
    maxTokens: 1024,
    temperature: 0.7,
    maxRetries: overrides?.maxRetries,
  });
}

describe("OpenAICompatibleProvider", () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe("LLM-001: chat() returns text response (no tools)", () => {
    it("should return text content when no tool calls", async () => {
      const provider = createProvider();
      const messages: AgentMessage[] = [
        { role: "user", content: "Hello" },
      ];

      nock(BASE_URL)
        .post("/chat/completions")
        .reply(200, {
          id: "chatcmpl-1",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "Hello! How can I help you?",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
        });

      const result = await provider.chat(messages);

      expect(result.content).toBe("Hello! How can I help you?");
      expect(result.toolCalls).toEqual([]);
      expect(result.finishReason).toBe("stop");
    });
  });

  describe("LLM-002: chat() returns tool calls", () => {
    it("should parse tool_calls from response", async () => {
      const provider = createProvider();
      const messages: AgentMessage[] = [
        { role: "user", content: "What's the weather?" },
      ];
      const tools: ToolDefinition[] = [
        {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
            },
            required: ["location"],
          },
        },
      ];

      nock(BASE_URL)
        .post("/chat/completions")
        .reply(200, {
          id: "chatcmpl-2",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_abc123",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: '{"location":"San Francisco"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 20,
            total_tokens: 70,
          },
        });

      const result = await provider.chat(messages, tools);

      expect(result.content).toBeNull();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: "call_abc123",
        name: "get_weather",
        arguments: { location: "San Francisco" },
      });
      expect(result.finishReason).toBe("tool_calls");
    });
  });

  describe("LLM-003: handles rate limit 429", () => {
    it("should retry on 429 and succeed", async () => {
      const provider = createProvider({ maxRetries: 3 });

      nock(BASE_URL)
        .post("/chat/completions")
        .reply(429, { error: { message: "Rate limit exceeded", type: "rate_limit_error" } })
        .post("/chat/completions")
        .reply(200, {
          id: "chatcmpl-3",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Retried successfully" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        });

      const messages: AgentMessage[] = [{ role: "user", content: "test" }];
      const result = await provider.chat(messages);

      expect(result.content).toBe("Retried successfully");
    });
  });

  describe("LLM-004: handles server error 500", () => {
    it("should throw after all retries exhausted on 500", async () => {
      const provider = createProvider({ maxRetries: 2 });

      nock(BASE_URL)
        .post("/chat/completions")
        .reply(500, { error: { message: "Internal server error" } })
        .post("/chat/completions")
        .reply(500, { error: { message: "Internal server error" } })
        .post("/chat/completions")
        .reply(500, { error: { message: "Internal server error" } });

      const messages: AgentMessage[] = [{ role: "user", content: "test" }];

      await expect(provider.chat(messages)).rejects.toThrow();
    });
  });

  describe("LLM-006: toOpenAIMessages converts AgentMessage[] correctly", () => {
    it("should convert system, user, assistant, and tool roles", () => {
      const provider = createProvider();
      const messages: AgentMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call_1",
              name: "search",
              arguments: { query: "test" },
            },
          ],
        },
        { role: "tool", content: '{"result": "found"}', toolCallId: "call_1" },
      ];

      const result = provider.toOpenAIMessages(messages);

      expect(result).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "search", arguments: '{"query":"test"}' },
            },
          ],
        },
        { role: "tool", content: '{"result": "found"}', tool_call_id: "call_1" },
      ]);
    });
  });

  describe("LLM-007: converts ToolDefinition[] to OpenAI function format", () => {
    it("should convert tools to OpenAI function tools", () => {
      const provider = createProvider();
      const tools: ToolDefinition[] = [
        {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      ];

      const result = provider.toOpenAITools(tools);

      expect(result).toEqual([
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] },
              },
              required: ["location"],
            },
          },
        },
      ]);
    });
  });

  describe("LLM-008: handles empty response", () => {
    it("should throw on empty choices array", async () => {
      const provider = createProvider();
      const messages: AgentMessage[] = [{ role: "user", content: "test" }];

      nock(BASE_URL)
        .post("/chat/completions")
        .reply(200, {
          id: "chatcmpl-empty",
          object: "chat.completion",
          choices: [],
          usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
        });

      await expect(provider.chat(messages)).rejects.toThrow("empty response");
    });
  });

  describe("LLM-009: tracks token usage from response", () => {
    it("should return usage data from the API response", async () => {
      const provider = createProvider();
      const messages: AgentMessage[] = [{ role: "user", content: "Count tokens" }];

      nock(BASE_URL)
        .post("/chat/completions")
        .reply(200, {
          id: "chatcmpl-usage",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Done" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 42,
            completion_tokens: 13,
            total_tokens: 55,
          },
        });

      const result = await provider.chat(messages);

      expect(result.usage).toEqual({
        promptTokens: 42,
        completionTokens: 13,
      });
    });
  });
});
