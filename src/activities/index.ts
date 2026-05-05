import type { AgentMessage, LLMResponse, ToolDefinition } from "../shared/types.js";

export async function callLLM(
  _messages: AgentMessage[],
  _tools?: ToolDefinition[],
): Promise<LLMResponse> {
  throw new Error("Not implemented yet - Phase 4");
}

export async function executeTool(
  _toolName: string,
  _params: Record<string, unknown>,
): Promise<import("../shared/types.js").ToolResult> {
  throw new Error("Not implemented yet - Phase 4");
}
