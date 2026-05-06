import { describe, it, expect } from "vitest";
import { createLLMProvider } from "../../../src/llm/factory.js";
import { OpenAICompatibleProvider } from "../../../src/llm/openai-compatible.js";
import type { Config } from "../../../src/shared/config.js";

const mockConfig: Config = {
  temporal: {
    address: "localhost:7233",
    namespace: "default",
  },
  llm: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "test-key-123",
    model: "gpt-4",
    maxTokens: 2048,
    temperature: 0.5,
  },
  agent: {
    maxIterations: 10,
    approvalTimeoutHours: 24,
    maxStateMessages: 50,
    workspaceDir: "/tmp/workspace",
  },
  api: {
    port: 3000,
    corsOrigin: "*",
  },
};

describe("createLLMProvider factory", () => {
  describe("FAC-001: Creates OpenAICompatibleProvider with config values", () => {
    it("should return an instance of OpenAICompatibleProvider", () => {
      const provider = createLLMProvider(mockConfig);
      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    });
  });

  describe("FAC-002: Provider has correct config applied", () => {
    it("should expose config values through the provider", () => {
      const provider = createLLMProvider(mockConfig) as OpenAICompatibleProvider;
      expect(provider.model).toBe("gpt-4");
      expect(provider.maxTokens).toBe(2048);
      expect(provider.temperature).toBe(0.5);
    });
  });
});
