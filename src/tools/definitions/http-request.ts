import type { Tool } from "../tool.interface.js";

export const httpRequestTool: Tool = {
  name: "http-request",
  description:
    "Makes HTTP requests to external APIs. Supports GET, POST, PUT, DELETE methods.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to request",
      },
      method: {
        type: "string",
        description: "HTTP method",
        enum: ["GET", "POST", "PUT", "DELETE"],
        default: "GET",
      },
      headers: {
        type: "object",
        description: "HTTP headers to send",
        properties: {},
      },
      body: {
        type: "string",
        description: "Request body (for POST/PUT)",
      },
      timeout: {
        type: "number",
        description: "Request timeout in milliseconds",
        default: 30000,
      },
    },
    required: ["url"],
  },
  requiresApproval: true,
  riskLevel: "medium",

  async execute(_params: Record<string, unknown>) {
    return {
      toolCallId: "",
      success: false,
      output: "",
      error: "Not implemented yet - Phase 3",
    };
  },
};
