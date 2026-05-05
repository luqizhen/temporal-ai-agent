import type { AgentMessage, LLMResponse, ToolDefinition } from "../shared/types.js";

export interface LLMProvider {
  chat(messages: AgentMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}
