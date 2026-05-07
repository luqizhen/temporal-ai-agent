import vm from "node:vm";
import type { Tool } from "../tool.interface.js";
import type { ToolResult } from "../../shared/types.js";

const BLOCKED_PATTERNS = [/\brequire\s*\(/, /\bimport\s+/, /\bprocess\s*\.\s*exit/, /\beval\s*\(/];

export const codeExecutionTool: Tool = {
  name: "code-execution",
  description:
    "Executes JavaScript or Python code in a sandboxed environment. Returns stdout output.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "The code to execute",
      },
      language: {
        type: "string",
        description: "Programming language: 'js' or 'py'",
        enum: ["js", "py"],
        default: "js",
      },
      timeout: {
        type: "number",
        description: "Execution timeout in milliseconds",
        default: 30000,
      },
    },
    required: ["code"],
  },
  requiresApproval: true,
  riskLevel: "high",

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const code = params.code as string;
    const language = (params.language as string) || "js";
    const timeout = (params.timeout as number) || 30000;

    if (language !== "js") {
      return {
        toolCallId: "",
        success: false,
        output: "",
        error: `Language '${language}' is not supported. Only 'js' is currently supported.`,
      };
    }

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(code)) {
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: `Code contains blocked pattern: ${pattern.source}`,
        };
      }
    }

    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: unknown[]) => {
          logs.push(
            args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "),
          );
        },
      },
    };

    try {
      const wrappedCode = `(function() {\n${code}\n})()`;
      const context = vm.createContext(sandbox);
      const script = new vm.Script(wrappedCode, { filename: "sandbox.js" });
      const result = script.runInContext(context, { timeout });

      let output = "";
      if (logs.length > 0) {
        output = logs.join("\n");
      } else if (result !== undefined) {
        output = String(result);
      }

      return { toolCallId: "", success: true, output };
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      if (
        err.message?.toLowerCase().includes("timed out") ||
        err.message?.toLowerCase().includes("timeout") ||
        err.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
      ) {
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: `Execution timeout after ${timeout}ms`,
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
