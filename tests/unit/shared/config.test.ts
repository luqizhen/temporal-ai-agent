import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../src/shared/config.js";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should load config from env vars", () => {
    process.env.LLM_API_KEY = "sk-test-key";
    process.env.LLM_BASE_URL = "https://api.test.com/v1";
    process.env.LLM_MODEL = "test-model";

    const config = loadConfig();

    expect(config.llm.apiKey).toBe("sk-test-key");
    expect(config.llm.baseUrl).toBe("https://api.test.com/v1");
    expect(config.llm.model).toBe("test-model");
  });

  it("should apply defaults for optional vars", () => {
    process.env.LLM_API_KEY = "sk-test";

    const config = loadConfig();

    expect(config.llm.model).toBe("gpt-4");
    expect(config.llm.maxTokens).toBe(4096);
    expect(config.llm.temperature).toBe(0.7);
    expect(config.temporal.address).toBe("localhost:7233");
    expect(config.temporal.namespace).toBe("default");
    expect(config.agent.maxIterations).toBe(20);
    expect(config.agent.approvalTimeoutHours).toBe(24);
    expect(config.api.port).toBe(3000);
    expect(config.api.corsOrigin).toBe("*");
  });

  it("should throw on missing LLM_API_KEY", () => {
    delete process.env.LLM_API_KEY;

    expect(() => loadConfig()).toThrow();
  });

  it("should validate LLM_TEMPERATURE range", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_TEMPERATURE = "3.0";

    expect(() => loadConfig()).toThrow();
  });

  it("should accept valid LLM_TEMPERATURE", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_TEMPERATURE = "1.5";

    const config = loadConfig();
    expect(config.llm.temperature).toBe(1.5);
  });

  it("should resolve WORKSPACE_DIR to absolute path", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.WORKSPACE_DIR = "./workspace";

    const config = loadConfig();
    expect(config.agent.workspaceDir).toMatch(/^\//);
  });

  it("should validate API_PORT range", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.API_PORT = "0";

    expect(() => loadConfig()).toThrow();
  });

  it("should accept valid API_PORT", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.API_PORT = "8080";

    const config = loadConfig();
    expect(config.api.port).toBe(8080);
  });

  it("should override defaults with env vars", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.TEMPORAL_ADDRESS = "temporal.prod:7233";
    process.env.TEMPORAL_NAMESPACE = "production";
    process.env.AGENT_MAX_ITERATIONS = "50";
    process.env.API_PORT = "4000";

    const config = loadConfig();

    expect(config.temporal.address).toBe("temporal.prod:7233");
    expect(config.temporal.namespace).toBe("production");
    expect(config.agent.maxIterations).toBe(50);
    expect(config.api.port).toBe(4000);
  });

  it("should validate LLM_BASE_URL is a valid URL", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_BASE_URL = "not-a-url";

    expect(() => loadConfig()).toThrow();
  });

  it("should coerce numeric env vars from strings", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_MAX_TOKENS = "8192";

    const config = loadConfig();
    expect(config.llm.maxTokens).toBe(8192);
  });
});
