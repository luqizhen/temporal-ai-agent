import type {
  AgentMessage,
  AgentRunResult,
  WorkflowState,
} from "../shared/types.js";
import {
  DEFAULT_SYSTEM_PROMPT,
  MAX_STATE_MESSAGES,
} from "../shared/constants.js";

export function initializeMessages(
  prompt: string,
  systemPrompt?: string,
): AgentMessage[] {
  const messages: AgentMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  } else {
    messages.push({ role: "system", content: DEFAULT_SYSTEM_PROMPT });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

export function truncateMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length > MAX_STATE_MESSAGES) {
    return [messages[0], ...messages.slice(-(MAX_STATE_MESSAGES - 1))];
  }
  return messages;
}

export function buildState(
  messages: AgentMessage[],
  iteration: number,
  maxIter: number,
  toolCallsExecuted: number,
  approvalsRequested: number,
): WorkflowState {
  return {
    messages,
    iteration,
    status: iteration < maxIter ? "running" : "completed",
    toolCallsExecuted,
    approvalsRequested,
  };
}

export function buildCompletedResult(
  content: string,
  iteration: number,
  toolCallsExecuted: number,
  approvalsRequested: number,
): AgentRunResult {
  return {
    finalAnswer: content,
    iterations: iteration,
    toolCallsExecuted,
    approvalsRequested,
    status: "completed",
  };
}

export function buildMaxIterResult(
  messages: AgentMessage[],
  iteration: number,
  toolCallsExecuted: number,
  approvalsRequested: number,
): AgentRunResult {
  return {
    finalAnswer:
      messages[messages.length - 1]?.content || "Max iterations reached",
    iterations: iteration,
    toolCallsExecuted,
    approvalsRequested,
    status: "max_iterations",
  };
}

export function buildAssistantMessage(
  content: string | null,
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[],
): AgentMessage {
  return {
    role: "assistant",
    content: content || "",
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

export function buildToolMessage(
  result: { success: boolean; output: string; error?: string },
  toolCallId: string,
): AgentMessage {
  return {
    role: "tool",
    content: result.success ? result.output : `Error: ${result.error}`,
    toolCallId,
  };
}

export function buildToolErrorMessage(
  error: unknown,
  toolCallId: string,
): AgentMessage {
  return {
    role: "tool",
    content: `Error: ${error instanceof Error ? error.message : String(error)}`,
    toolCallId,
  };
}
