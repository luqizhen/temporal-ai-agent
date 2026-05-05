import type { LLMResponse, ToolCall } from "../shared/types.js";
import type { LLMProvider } from "./provider.interface.js";

export class OpenAICompatibleProvider implements LLMProvider {
  private _baseUrl: string;
  private _apiKey: string;
  private _model: string;
  private _maxTokens: number;
  private _temperature: number;
  private _maxRetries: number;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    maxRetries?: number;
  }) {
    this._baseUrl = config.baseUrl.replace(/\/$/, "");
    this._apiKey = config.apiKey;
    this._model = config.model;
    this._maxTokens = config.maxTokens;
    this._temperature = config.temperature;
    this._maxRetries = config.maxRetries ?? 3;
  }

  async chat(): Promise<LLMResponse> {
    throw new Error("Not implemented yet - Phase 2");
  }

  toOpenAIMessages(messages: import("../shared/types.js").AgentMessage[]): unknown[] {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool" as const,
          content: msg.content,
          tool_call_id: msg.toolCallId,
        };
      }

      if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: "assistant" as const,
          content: msg.content ?? null,
          tool_calls: msg.toolCalls.map((tc: ToolCall) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }

      return {
        role: msg.role,
        content: msg.content,
      };
    });
  }
}

export type { LLMProvider };
