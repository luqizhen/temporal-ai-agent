import type { AgentMessage, LLMResponse, ToolDefinition, ToolResult } from "../shared/types.js";
import { createLLMProvider } from "../llm/factory.js";
import { toolRegistry } from "../tools/registry.js";
import { loadConfig } from "../shared/config.js";

export async function callLLM(
  messages: AgentMessage[],
  tools?: ToolDefinition[],
): Promise<LLMResponse> {
  const config = loadConfig();
  const provider = createLLMProvider(config);
  return provider.chat(messages, tools);
}

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = toolRegistry.get(toolName);
  const toolCallId = (params._toolCallId as string) || "";
  const cleanParams = { ...params };
  delete cleanParams._toolCallId;
  const result = await tool.execute(cleanParams);
  return { ...result, toolCallId };
}
