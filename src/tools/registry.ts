import type { Tool } from "./tool.interface.js";
import type { ToolDefinition, JSONSchemaProperty } from "../shared/types.js";

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, JSONSchemaProperty>;
      required?: string[];
    };
  };
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (!tool.name) {
      throw new Error("Tool must have a name");
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool;
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  getOpenAIToolDefinitions(): OpenAIToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  static toOpenAIFormat(tool: Tool): OpenAIToolDefinition {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }
}

export type { ToolDefinition };

export const toolRegistry = new ToolRegistry();
