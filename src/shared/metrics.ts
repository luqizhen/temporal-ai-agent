import promClient from "prom-client";

const register = new promClient.Registry();

register.setDefaultLabels({
  app: "temporal-agent",
});

promClient.collectDefaultMetrics({ register, prefix: "agent_" });

export const metrics = {
  register,

  workflowsStarted: new promClient.Counter({
    name: "agent_workflows_started_total",
    help: "Total agent workflows started",
    labelNames: ["namespace"],
    registers: [register],
  }),

  workflowsCompleted: new promClient.Counter({
    name: "agent_workflows_completed_total",
    help: "Total completed workflows",
    labelNames: ["namespace", "status"],
    registers: [register],
  }),

  workflowDuration: new promClient.Histogram({
    name: "agent_workflow_duration_seconds",
    help: "Workflow execution duration",
    labelNames: ["namespace", "status"],
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
    registers: [register],
  }),

  iterationsTotal: new promClient.Counter({
    name: "agent_iterations_total",
    help: "Total LLM iterations",
    labelNames: ["namespace"],
    registers: [register],
  }),

  toolCallsTotal: new promClient.Counter({
    name: "agent_tool_calls_total",
    help: "Tool executions by tool",
    labelNames: ["namespace", "tool_name"],
    registers: [register],
  }),

  toolDuration: new promClient.Histogram({
    name: "agent_tool_duration_seconds",
    help: "Tool execution duration",
    labelNames: ["namespace", "tool_name"],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [register],
  }),

  approvalWait: new promClient.Histogram({
    name: "agent_approval_wait_seconds",
    help: "Time waiting for approval",
    buckets: [1, 5, 10, 30, 60, 300, 600, 3600],
    registers: [register],
  }),

  llmTokensTotal: new promClient.Counter({
    name: "agent_llm_tokens_total",
    help: "Token usage",
    labelNames: ["namespace", "type"],
    registers: [register],
  }),

  llmErrorsTotal: new promClient.Counter({
    name: "agent_llm_errors_total",
    help: "LLM API errors",
    labelNames: ["namespace", "error_type"],
    registers: [register],
  }),

  httpRequestsTotal: new promClient.Counter({
    name: "http_requests_total",
    help: "API request count",
    labelNames: ["method", "path", "status"],
    registers: [register],
  }),

  httpRequestDuration: new promClient.Histogram({
    name: "http_request_duration_seconds",
    help: "API request latency",
    labelNames: ["method", "path"],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),
};

export async function getMetricsContentType(): Promise<string> {
  return register.contentType;
}

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
