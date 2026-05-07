import type { Tool } from "../tool.interface.js";
import type { ToolResult } from "../../shared/types.js";

export const webSearchTool: Tool = {
  name: "web-search",
  description: "Searches the web for information. Returns results with titles, URLs, and snippets.",
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

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    const maxResults = (params.maxResults as number) || 5;
    const timeout = (params.timeout as number) || 10000;

    if (!query || query.trim() === "") {
      return {
        toolCallId: "",
        success: false,
        output: "",
        error: "Query cannot be empty",
      };
    }

    const apiKey = process.env.WEB_SEARCH_API_KEY;
    if (!apiKey) {
      return {
        toolCallId: "",
        success: true,
        output: JSON.stringify({
          results: [
            {
              title: `Simulated result for: ${query}`,
              url: "https://example.com/simulated",
              snippet: "This is a simulated search result for development purposes.",
            },
          ],
          simulated: true,
        }),
      };
    }

    const apiUrl =
      process.env.WEB_SEARCH_API_URL || "https://api.search.brave.com/res/v1/web/search";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const url = `${apiUrl}?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: `Search API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        web?: {
          results?: Array<{
            title?: string;
            url?: string;
            description?: string;
          }>;
        };
      };
      const results = (data.web?.results || []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.description ?? "",
      }));

      return {
        toolCallId: "",
        success: true,
        output: JSON.stringify({ results }),
      };
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === "AbortError" || err.message?.toLowerCase().includes("abort")) {
        return {
          toolCallId: "",
          success: false,
          output: "",
          error: `Search request timeout after ${timeout}ms`,
        };
      }
      return {
        toolCallId: "",
        success: false,
        output: "",
        error: `Search failed: ${err.message}`,
      };
    }
  },
};
