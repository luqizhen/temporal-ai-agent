import {
  proxyActivities,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../activities/index.js";
import type {
  AgentRunInput,
  AgentRunResult,
  AgentMessage,
  WorkflowState,
} from "../shared/types.js";
import { DEFAULT_MAX_ITERATIONS } from "../shared/constants.js";
import {
  initializeMessages,
  truncateMessages,
  buildState,
  buildCompletedResult,
  buildMaxIterResult,
  buildAssistantMessage,
  buildToolMessage,
  buildToolErrorMessage,
} from "./agent.helpers.js";

const { callLLM, executeTool } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: { initialInterval: "1s", maximumInterval: "10s", maximumAttempts: 3 },
});

const stateQuery = defineQuery<WorkflowState>("getState");

export async function agentWorkflow(input: AgentRunInput): Promise<AgentRunResult> {
  const maxIter = input.maxIterations || DEFAULT_MAX_ITERATIONS;
  const messages = initializeMessages(input.prompt, input.systemPrompt);

  let iteration = 0;
  let toolCallsExecuted = 0;
  let approvalsRequested = 0;

  setHandler(stateQuery, (): WorkflowState =>
    buildState(messages, iteration, maxIter, toolCallsExecuted, approvalsRequested),
  );

  while (iteration < maxIter) {
    iteration++;

    const truncatedMessages = truncateMessages(messages);
    const llmResponse = await callLLM(truncatedMessages);

    messages.push(buildAssistantMessage(llmResponse.content, llmResponse.toolCalls));

    if (llmResponse.toolCalls.length === 0) {
      return buildCompletedResult(
        llmResponse.content || "",
        iteration,
        toolCallsExecuted,
        approvalsRequested,
      );
    }

    for (const toolCall of llmResponse.toolCalls) {
      try {
        const result = await executeTool(toolCall.name, {
          ...toolCall.arguments,
          _toolCallId: toolCall.id,
        });
        toolCallsExecuted++;
        messages.push(buildToolMessage(result, toolCall.id));
      } catch (error) {
        messages.push(buildToolErrorMessage(error, toolCall.id));
      }
    }
  }

  return buildMaxIterResult(messages, iteration, toolCallsExecuted, approvalsRequested);
}
