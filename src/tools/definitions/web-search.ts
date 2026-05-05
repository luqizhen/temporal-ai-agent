import type { Tool } from "../tool.interface.js";

export const webSearchTool: Tool = {
  name: "web-search",
  description:
    "Searches the web for information. Returns results with titles, URLs, and snippets.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query string",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (1-10)",
        default: 5,
      },
    },
    required: ["query"],
  },
  requiresApproval: false,
  riskLevel: "low",

  async execute(_params: Record<string, unknown>) {
    return {
      toolCallId: "",
      success: false,
      output: "",
      error: "Not implemented yet - Phase 3",
    };
  },
};
