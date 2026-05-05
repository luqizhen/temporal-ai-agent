import type { Config } from "../shared/config.js";
import type { LLMProvider } from "./provider.interface.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";

export function createLLMProvider(config: Config): LLMProvider {
  return new OpenAICompatibleProvider({
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
    maxTokens: config.llm.maxTokens,
    temperature: config.llm.temperature,
  });
}
