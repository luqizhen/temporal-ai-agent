import type { Tool } from "../tool.interface.js";

export const fileReadTool: Tool = {
  name: "file-read",
  description: "Reads the content of a file within the workspace directory.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file within the workspace",
      },
    },
    required: ["path"],
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

export const fileWriteTool: Tool = {
  name: "file-write",
  description: "Writes content to a file within the workspace directory. Creates parent directories if needed.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file within the workspace",
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
    },
    required: ["path", "content"],
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
