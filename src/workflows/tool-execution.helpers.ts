import type { ToolResult, ApprovalResponse } from "../shared/types.js";

export function getApprovalStatus(
  decision: ApprovalResponse | null,
  toolName: string,
): { status: string; toolName: string } {
  return {
    status:
      decision === null
        ? "pending"
        : decision.approved
          ? "approved"
          : "rejected",
    toolName,
  };
}

export function buildRejectionResult(
  toolCallId: string,
  decision: ApprovalResponse | null,
): ToolResult {
  return {
    toolCallId,
    success: false,
    output: "",
    error: decision?.reason || "Approval timeout",
  };
}

export function resolveExecutionParams(
  decision: ApprovalResponse,
  defaultArgs: Record<string, unknown>,
): Record<string, unknown> {
  return decision.modifiedArguments || defaultArgs;
}
