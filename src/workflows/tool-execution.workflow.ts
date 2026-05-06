import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
} from "@temporalio/workflow";
import type * as activities from "../activities/index.js";
import type { ToolResult, ApprovalResponse } from "../shared/types.js";
import {
  getApprovalStatus,
  buildRejectionResult,
  resolveExecutionParams,
} from "./tool-execution.helpers.js";

const { executeTool } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 seconds",
  retry: { initialInterval: "1s", maximumAttempts: 2 },
});

export const approvalSignal = defineSignal<[ApprovalResponse]>("approvalSignal");
const approvalStatusQuery = defineQuery<{ status: string; toolName: string }>(
  "approvalStatus",
);

export async function toolExecutionWorkflow(input: {
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  description: string;
  riskLevel: "low" | "medium" | "high";
  approvalTimeoutMs?: number;
}): Promise<ToolResult> {
  const state: { decision: ApprovalResponse | null } = { decision: null };

  setHandler(approvalSignal, (response: ApprovalResponse) => {
    state.decision = response;
  });

  setHandler(approvalStatusQuery, () =>
    getApprovalStatus(state.decision, input.toolCall.name),
  );

  const approved = await condition(
    () => state.decision !== null,
    input.approvalTimeoutMs ? `${input.approvalTimeoutMs} ms` : "24 hours",
  );

  if (!approved || state.decision === null || !state.decision.approved) {
    return buildRejectionResult(input.toolCall.id, state.decision);
  }

  const params = resolveExecutionParams(state.decision, input.toolCall.arguments);
  const result = await executeTool(input.toolCall.name, {
    ...params,
    _toolCallId: input.toolCall.id,
  });
  return result;
}
