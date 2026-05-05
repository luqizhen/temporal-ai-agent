import type { ToolResult } from "../shared/types.js";

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, import("../shared/types.js").JSONSchemaProperty>;
    required?: string[];
  };
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high";
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

export type { ToolResult };
