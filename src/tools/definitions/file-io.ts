import fs from "node:fs";
import path from "node:path";
import type { Tool } from "../tool.interface.js";
import type { ToolResult } from "../../shared/types.js";

function validatePath(workspaceDir: string, filePath: string): string {
  const normalizedWorkspace = path.resolve(workspaceDir);
  const resolved = path.resolve(normalizedWorkspace, filePath);
  if (!resolved.startsWith(normalizedWorkspace + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function createFileReadTool(workspaceDir: string): Tool {
  return {
    name: "file-read",
    description:
      "Reads the content of a file within the workspace directory.",
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

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const filePath = params.path as string;
      try {
        const resolvedPath = validatePath(workspaceDir, filePath);
        const content = await fs.promises.readFile(resolvedPath, "utf-8");
        return { toolCallId: "", success: true, output: content };
      } catch (error: unknown) {
        const err = error as Error;
        if (err.message === "Path traversal detected") {
          return {
            toolCallId: "",
            success: false,
            output: "",
            error: "Path traversal detected",
          };
        }
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: err.message,
        };
      }
    },
  };
}

export function createFileWriteTool(workspaceDir: string): Tool {
  return {
    name: "file-write",
    description:
      "Writes content to a file within the workspace directory. Creates parent directories if needed.",
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

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const filePath = params.path as string;
      const content = params.content as string;
      try {
        const resolvedPath = validatePath(workspaceDir, filePath);
        await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.promises.writeFile(resolvedPath, content, "utf-8");
        return { toolCallId: "", success: true, output: `File written: ${filePath}` };
      } catch (error: unknown) {
        const err = error as Error;
        if (err.message === "Path traversal detected") {
          return {
            toolCallId: "",
            success: false,
            output: "",
            error: "Path traversal detected",
          };
        }
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: err.message,
        };
      }
    },
  };
}
