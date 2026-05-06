import OpenAI from "openai";
import type {
  AgentMessage,
  LLMResponse,
  ToolCall,
  ToolDefinition,
} from "../shared/types.js";
import type { LLMProvider } from "./provider.interface.js";

export class OpenAICompatibleProvider implements LLMProvider {
  private _client: OpenAI;
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

    this._client = new OpenAI({
      baseURL: this._baseUrl,
      apiKey: this._apiKey,
      maxRetries: 0,
    });
  }

  get model(): string {
    return this._model;
  }

  get maxTokens(): number {
    return this._maxTokens;
  }

  get temperature(): number {
    return this._temperature;
  }

  async chat(
    messages: AgentMessage[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    const openaiMessages = this.toOpenAIMessages(messages);
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this._model,
      messages: openaiMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: this._maxTokens,
      temperature: this._temperature,
    };

    if (tools && tools.length > 0) {
      params.tools = this.toOpenAITools(tools) as OpenAI.Chat.Completions.ChatCompletionTool[];
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const response = await this._client.chat.completions.create(params);

        if (!response.choices || response.choices.length === 0) {
          throw new Error("LLM returned empty response: no choices in response");
        }

        const choice = response.choices[0];
        const message = choice.message;

        const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        }));

        return {
          content: message.content ?? null,
          toolCalls,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
          },
          finishReason: (choice.finish_reason as LLMResponse["finishReason"]) ?? "stop",
        };
      } catch (error) {
        lastError = error as Error;
        if ((error as Error).message?.includes("empty response")) {
          throw lastError;
        }
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw lastError;
        }
        if (attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  toOpenAIMessages(messages: AgentMessage[]): unknown[] {
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

  toOpenAITools(tools: ToolDefinition[]): unknown[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}

export type { LLMProvider };
