import { URL } from "node:url";
import dns from "node:dns/promises";
import type { Tool } from "../tool.interface.js";
import type { ToolResult } from "../../shared/types.js";

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
];

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string;
    const method = ((params.method as string) || "GET").toUpperCase();
    const headers = (params.headers as Record<string, string>) || {};
    const body = params.body as string | undefined;
    const timeout = (params.timeout as number) || 30000;

    if (!isValidUrl(url)) {
      return {
        toolCallId: "",
        success: false,
        output: "",
        error: "Invalid URL format",
      };
    }

    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "localhost.localdomain"
      ) {
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: "Request to private hostname is blocked",
        };
      }

      const isIPAddress =
        /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
      if (isIPAddress) {
        if (isPrivateIP(hostname)) {
          return {
            toolCallId: "",
            success: false,
            output: "",
            error: `Request to private IP (${hostname}) is blocked`,
          };
        }
      } else {
        try {
          const addresses = await dns.resolve4(hostname);
          for (const addr of addresses) {
            if (isPrivateIP(addr)) {
              return {
                toolCallId: "",
                success: false,
                output: "",
                error: `Request to private IP (${addr}) is blocked`,
              };
            }
          }
        } catch {
          // DNS resolution failed - let the request fail naturally
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body && (method === "POST" || method === "PUT")) {
        fetchOptions.body = body;
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const responseBody = await response.text();

      if (response.ok) {
        return { toolCallId: "", success: true, output: responseBody };
      }
      return {
        toolCallId: "",
        success: false,
        output: responseBody,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === "AbortError" || err.message?.includes("abort")) {
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: `Request timeout after ${timeout}ms`,
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
