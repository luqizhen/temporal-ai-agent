import { z } from "zod";
import path from "node:path";

const llmSchema = z.object({
  baseUrl: z.string().url().default("https://api.openai.com/v1"),
  apiKey: z.string().min(1),
  model: z.string().default("gpt-4"),
  maxTokens: z.coerce.number().int().min(1).max(128000).default(4096),
  temperature: z.coerce.number().min(0).max(2).default(0.7),
});

const temporalSchema = z.object({
  address: z.string().default("localhost:7233"),
  namespace: z.string().default("default"),
});

const agentSchema = z.object({
  maxIterations: z.coerce.number().int().min(1).max(100).default(DEFAULT_MAX_ITERATIONS),
  approvalTimeoutHours: z.coerce.number().int().min(1).default(DEFAULT_APPROVAL_TIMEOUT_HOURS),
  maxStateMessages: z.coerce.number().int().min(5).max(200).default(MAX_STATE_MESSAGES),
  workspaceDir: z.string().transform((v) => path.resolve(v)).default("./workspace"),
});

const apiSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  corsOrigin: z.string().default("*"),
});

import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_APPROVAL_TIMEOUT_HOURS,
  MAX_STATE_MESSAGES,
} from "./constants.js";

const fullConfigSchema = z.object({
  temporal: temporalSchema,
  llm: llmSchema,
  agent: agentSchema,
  api: apiSchema,
});

export type Config = z.infer<typeof fullConfigSchema>;

export function loadConfig(): Config {
  const raw = {
    temporal: {
      address: process.env.TEMPORAL_ADDRESS,
      namespace: process.env.TEMPORAL_NAMESPACE,
    },
    llm: {
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      maxTokens: process.env.LLM_MAX_TOKENS,
      temperature: process.env.LLM_TEMPERATURE,
    },
    agent: {
      maxIterations: process.env.AGENT_MAX_ITERATIONS,
      approvalTimeoutHours: process.env.APPROVAL_TIMEOUT_HOURS,
      maxStateMessages: process.env.MAX_STATE_MESSAGES,
      workspaceDir: process.env.WORKSPACE_DIR,
    },
    api: {
      port: process.env.API_PORT,
      corsOrigin: process.env.CORS_ORIGIN,
    },
  };

  return fullConfigSchema.parse(raw);
}
