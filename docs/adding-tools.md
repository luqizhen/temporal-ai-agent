# Adding New Tools

This guide explains how to create, register, and test new tools for the Temporal Agent. The tool system is designed to be extensible — adding a new tool requires implementing a single interface and registering it.

---

## Table of Contents

1. [Tool Architecture](#tool-architecture)
2. [Quick Start: Creating a Tool](#quick-start-creating-a-tool)
3. [Tool Interface Reference](#tool-interface-reference)
4. [Step-by-Step Guide](#step-by-step-guide)
5. [Approval Configuration](#approval-configuration)
6. [Testing Tools](#testing-tools)
7. [Examples](#examples)
8. [Best Practices](#best-practices)

---

## Tool Architecture

```
LLM Response
    │
    ▼
AgentWorkflow
    │
    ├── Tool requires approval? ──► ToolExecutionWorkflow (child)
    │                                      │
    │                                   Signal: approve/reject
    │                                      │
    │                                   Approved? ──► executeTool Activity
    │                                      │
    └── No approval needed ───────────► executeTool Activity
                                            │
                                            ▼
                                     ToolRegistry.get(name)
                                            │
                                            ▼
                                     tool.execute(params)
                                            │
                                            ▼
                                     ToolResult { success, output, error }
```

Each tool is a self-contained module that:
1. Declares its name, description, and parameter schema (JSON Schema)
2. Declares whether it requires human approval
3. Implements an `execute` function that performs the actual work

---

## Quick Start: Creating a Tool

Here's the minimal template for a new tool:

```typescript
// src/tools/definitions/my-tool.ts

import { Tool, ToolResult } from "../tool.interface";

export const myTool: Tool = {
  name: "my-tool",
  description: "A brief description of what this tool does. This is sent to the LLM.",
  parameters: {
    type: "object",
    properties: {
      input: {
        type: "string",
        description: "Description of the input parameter",
      },
    },
    required: ["input"],
  },
  requiresApproval: false,
  riskLevel: "low",

  async execute(params: Record<string, any>): Promise<ToolResult> {
    try {
      const result = doSomething(params.input);
      return {
        toolCallId: "", // Set by the activity layer
        success: true,
        output: JSON.stringify(result),
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
```

Then register it in the worker:

```typescript
// src/worker/worker.ts (registration section)

import { myTool } from "../tools/definitions/my-tool";
registry.register(myTool);
```

That's it. The tool will automatically:
- Appear in the LLM's available tools list
- Be callable by the agent when the LLM decides to use it
- Show up in the Temporal Web UI as an activity execution

---

## Tool Interface Reference

```typescript
interface Tool {
  /** Unique identifier for the tool. Used by the LLM to call it. */
  name: string;

  /** 
   * Description of the tool's capabilities. This is sent to the LLM as part 
   * of the tool definition. Be specific — the LLM uses this to decide when 
   * and how to use the tool.
   */
  description: string;

  /**
   * JSON Schema defining the tool's input parameters. This serves two purposes:
   * 1. Sent to the LLM so it knows what arguments to provide
   * 2. Used to validate arguments before execution
   */
  parameters: {
    type: "object";
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };

  /**
   * Whether this tool requires human approval before execution.
   * Set to true for any tool that:
   * - Writes to the filesystem
   * - Executes code
   * - Makes mutating HTTP requests (POST, PUT, DELETE)
   * - Has side effects that are hard to reverse
   */
  requiresApproval: boolean;

  /**
   * Risk level displayed to the human reviewer during approval.
   * - "low": Read-only operations, minimal risk
   * - "medium": Write operations with limited scope
   * - "high": Destructive or irreversible operations
   */
  riskLevel: "low" | "medium" | "high";

  /**
   * The actual tool implementation. This function is called by the 
   * executeTool activity. It receives validated parameters and must 
   * return a ToolResult.
   * 
   * IMPORTANT: This function runs inside a Temporal activity. It must:
   * - Be stateless (no module-level mutable state)
   * - Be safe to retry (ideally idempotent)
   * - Complete within the activity timeout
   */
  execute(params: Record<string, any>): Promise<ToolResult>;
}

interface ToolResult {
  /** 
   * Tool call ID from the LLM response. 
   * Set by the activity layer — tools don't need to set this.
   */
  toolCallId?: string;

  /** Whether the tool execution succeeded. */
  success: boolean;

  /** 
   * The tool's output. Stringified for consistency.
   * This is sent back to the LLM as the tool result message.
   */
  output: string;

  /** Error message if success is false. */
  error?: string;
}
```

---

## Step-by-Step Guide

### Step 1: Create the Tool Definition File

Create a new file in `src/tools/definitions/`. Use kebab-case for the filename matching the tool name:

```bash
touch src/tools/definitions/my-tool.ts
```

### Step 2: Implement the Tool

Follow the template from [Quick Start](#quick-start-creating-a-tool). Key considerations:

**Description**: Write a clear, specific description. The LLM relies on this to decide when to use your tool. Include:
- What the tool does
- When to use it
- Any limitations or caveats

Bad: "Searches things"
Good: "Searches the web for information. Returns up to N results with titles, URLs, and snippets. Use this when you need current information that may not be in your training data."

**Parameters**: Define a complete JSON Schema. Include descriptions for each property — the LLM uses these too.

```typescript
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
    region: {
      type: "string",
      description: "Geographic region for results (e.g., 'us', 'uk')",
      default: "us",
    },
  },
  required: ["query"],
},
```

**Execute**: Implement the core logic. Follow these rules:
- Accept `Record<string, any>` as input (already validated against schema)
- Return a `ToolResult` — always set `success` appropriately
- Catch all errors — never throw from execute (return error in ToolResult)
- Keep it idempotent when possible (same input = same output)

### Step 3: Register the Tool

Import and register in the worker setup:

```typescript
// src/worker/worker.ts

import { myTool } from "../tools/definitions/my-tool";

// In the worker initialization:
registry.register(myTool);
```

The `ToolRegistry.register()` method:
- Validates the tool definition
- Checks for duplicate names
- Makes the tool available to all workflows

### Step 4: Test the Tool

Write unit tests for the tool's execute function:

```typescript
// tests/tools/my-tool.test.ts

import { myTool } from "../../src/tools/definitions/my-tool";

describe("my-tool", () => {
  it("should return expected output for valid input", async () => {
    const result = await myTool.execute({ input: "test" });
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  });

  it("should handle invalid input gracefully", async () => {
    const result = await myTool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

Integration test via API:

```bash
# Start a workflow that uses your tool
curl -X POST http://localhost:3000/agent/start \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Use the my-tool to do X",
    "systemPrompt": "You have access to my-tool. Use it when asked."
  }'
```

### Step 5: Verify in Temporal Web UI

1. Open http://localhost:8080
2. Find your workflow run
3. Inspect the activity history to see your tool's execution
4. Check input/output values

---

## Approval Configuration

### When to Require Approval

| Operation Type | Requires Approval | Risk Level |
|---|---|---|
| Read-only (search, get, list) | No | Low |
| Write to filesystem | Yes | Medium |
| Execute code | Yes | High |
| HTTP mutations (POST, PUT, DELETE) | Yes | Medium |
| HTTP read-only (GET) | No | Low |
| Database writes | Yes | High |
| Send email/messages | Yes | High |

### Conditional Approval

Some tools may need approval only under certain conditions. For example, `http-request` only needs approval for non-GET methods:

```typescript
export const httpRequestTool: Tool = {
  // ... other fields ...

  requiresApproval: false, // Base value; actual check in execute

  async execute(params: Record<string, any>): Promise<ToolResult> {
    // The activity layer checks requiresApproval statically.
    // For dynamic approval, set requiresApproval to true and 
    // handle GET approval quickly (auto-approve in the approval handler).
    // ...
  },
};
```

Alternatively, split into two tools: `http-get` (no approval) and `http-mutate` (requires approval).

---

## Testing Tools

### Unit Testing

Test the `execute` function directly. Mock external dependencies.

```typescript
describe("web-search tool", () => {
  beforeEach(() => {
    // Mock the search API
    vi.mock("../services/search-api", () => ({
      search: vi.fn().mockResolvedValue([
        { title: "Result 1", url: "https://...", snippet: "..." },
      ]),
    }));
  });

  it("should return search results", async () => {
    const result = await webSearchTool.execute({
      query: "test query",
      maxResults: 5,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("Result 1");
  });

  it("should handle API errors", async () => {
    vi.mocked(search).mockRejectedValueOnce(new Error("API timeout"));

    const result = await webSearchTool.execute({ query: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API timeout");
  });
});
```

### Integration Testing

Test the full flow: workflow → activity → tool → result.

```bash
# 1. Start Temporal
docker compose up -d

# 2. Start worker
npm run start:worker

# 3. Run integration test
npm run test:integration
```

---

## Examples

### Example 1: Calculator Tool (Simple)

```typescript
import { Tool, ToolResult } from "../tool.interface";

export const calculatorTool: Tool = {
  name: "calculator",
  description:
    "Evaluates a mathematical expression. Supports basic arithmetic " +
    "(+, -, *, /), parentheses, and common math functions. " +
    "Use this when you need to compute a precise numerical result.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The mathematical expression to evaluate, e.g., '2 * (3 + 4)'",
      },
    },
    required: ["expression"],
  },
  requiresApproval: false,
  riskLevel: "low",

  async execute(params: Record<string, any>): Promise<ToolResult> {
    const { expression } = params;
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return {
        success: true,
        output: String(result),
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to evaluate expression: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

### Example 2: Database Query Tool (With Approval)

```typescript
import { Tool, ToolResult } from "../tool.interface";

export const databaseQueryTool: Tool = {
  name: "database-query",
  description:
    "Executes a read-only SQL query against the configured database. " +
    "Returns results as a JSON array. Only SELECT statements are allowed. " +
    "Use this when you need to look up data from the database.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The SQL SELECT query to execute",
      },
      maxRows: {
        type: "number",
        description: "Maximum number of rows to return",
        default: 100,
      },
    },
    required: ["query"],
  },
  requiresApproval: true,
  riskLevel: "medium",

  async execute(params: Record<string, any>): Promise<ToolResult> {
    const { query, maxRows = 100 } = params;

    if (!query.trim().toUpperCase().startsWith("SELECT")) {
      return {
        success: false,
        output: "",
        error: "Only SELECT queries are allowed",
      };
    }

    try {
      const results = await executeQuery(query, maxRows);
      return {
        success: true,
        output: JSON.stringify(results, null, 2),
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

### Example 3: Email Tool (High Risk, Approval Required)

```typescript
import { Tool, ToolResult } from "../tool.interface";

export const emailTool: Tool = {
  name: "send-email",
  description:
    "Sends an email to a specified recipient. Requires human approval " +
    "before sending. Use this when the user explicitly asks to send an email.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient email address",
      },
      subject: {
        type: "string",
        description: "Email subject line",
      },
      body: {
        type: "string",
        description: "Email body content (plain text)",
      },
    },
    required: ["to", "subject", "body"],
  },
  requiresApproval: true,
  riskLevel: "high",

  async execute(params: Record<string, any>): Promise<ToolResult> {
    const { to, subject, body } = params;

    try {
      await sendEmail({ to, subject, body });
      return {
        success: true,
        output: `Email sent successfully to ${to}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
```

---

## Best Practices

### 1. Write Clear Descriptions

The LLM uses your tool's description to decide when and how to use it. A vague description leads to the LLM using the wrong tool or using it incorrectly.

### 2. Use Descriptive Parameter Names and Descriptions

```typescript
// Bad
properties: { q: { type: "string" } }

// Good
properties: {
  query: {
    type: "string",
    description: "The search query. Use specific terms for better results.",
  }
}
```

### 3. Return Structured Output

Return JSON stringified output for complex data. The LLM can parse it.

```typescript
return {
  success: true,
  output: JSON.stringify({ files: ["a.txt", "b.txt"], totalSize: 1024 }),
};
```

### 4. Handle Errors Gracefully

Never throw from `execute`. Always return a `ToolResult` with `success: false`.

### 5. Validate Inputs

Even though the JSON Schema validates structure, validate semantics too:

```typescript
if (params.port < 1 || params.port > 65535) {
  return { success: false, output: "", error: "Port must be between 1 and 65535" };
}
```

### 6. Keep Tools Focused

Each tool should do one thing well. Instead of a "database" tool that does read and write, create "database-query" (read) and "database-execute" (write, requires approval).

### 7. Consider Idempotency

If a tool is retried (due to activity failure), it should produce the same result. For write operations, use idempotency keys or check-before-write patterns.

### 8. Document the Tool

Add a comment block at the top of the file explaining:
- What the tool does
- What external services it depends on
- Any configuration it needs
- Security considerations

```typescript
/**
 * Web Search Tool
 * 
 * Searches the web using the configured search API (default: SerpAPI).
 * Requires WEB_SEARCH_API_KEY environment variable.
 * 
 * Security: Read-only, no approval needed.
 * Rate limit: Respects API rate limits, retries on 429.
 */
```
