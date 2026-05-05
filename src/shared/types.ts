export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface AgentRunInput {
  prompt: string;
  systemPrompt?: string;
  maxIterations?: number;
  sessionId?: string;
}

export interface AgentRunResult {
  finalAnswer: string;
  iterations: number;
  toolCallsExecuted: number;
  approvalsRequested: number;
  status: "completed" | "max_iterations" | "error";
  error?: string;
}

export interface WorkflowState {
  messages: AgentMessage[];
  iteration: number;
  status: "running" | "waiting_approval" | "completed" | "failed";
  pendingApproval?: ApprovalRequest;
  toolCallsExecuted: number;
  approvalsRequested: number;
}

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high";
  description: string;
  childWorkflowId: string;
}

export interface ApprovalResponse {
  approved: boolean;
  modifiedArguments?: Record<string, unknown>;
  reason?: string;
}

export interface ApprovalStatus {
  toolCall: ToolCall;
  status: "pending" | "approved" | "rejected" | "timeout" | "executing" | "completed";
  description: string;
  riskLevel: "low" | "medium" | "high";
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  finishReason: "stop" | "tool_calls" | "length";
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };
}

export interface JSONSchemaProperty {
  type: string;
  description?: string;
  default?: unknown;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  enum?: string[];
}
