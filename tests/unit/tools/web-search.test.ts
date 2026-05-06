import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { webSearchTool } from "../../../src/tools/definitions/web-search.js";

describe("web-search tool", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    nock.cleanAll();
  });

  afterEach(() => {
    process.env = originalEnv;
    nock.cleanAll();
  });

  it("WSE-001: successful search returns success with results", async () => {
    process.env.WEB_SEARCH_API_KEY = "test-key";

    const mockResponse = {
      web: {
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            description: "A test result",
          },
        ],
      },
    };

    nock("https://api.search.brave.com")
      .get("/res/v1/web/search")
      .query(true)
      .reply(200, mockResponse);

    const result = await webSearchTool.execute({ query: "test query" });
    expect(result.success).toBe(true);
    const output = JSON.parse(result.output);
    expect(output.results).toHaveLength(1);
    expect(output.results[0].title).toBe("Test Result");
    expect(output.results[0].url).toBe("https://example.com");
  });

  it("WSE-003: API error returns failure", async () => {
    process.env.WEB_SEARCH_API_KEY = "test-key";

    nock("https://api.search.brave.com")
      .get("/res/v1/web/search")
      .query(true)
      .reply(500, { error: "Internal Server Error" });

    const result = await webSearchTool.execute({ query: "error query" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("WSE-004: API timeout returns error containing timeout", async () => {
    process.env.WEB_SEARCH_API_KEY = "test-key";

    nock("https://api.search.brave.com")
      .get("/res/v1/web/search")
      .query(true)
      .delayConnection(5000)
      .reply(200, {});

    const result = await webSearchTool.execute({
      query: "slow query",
      timeout: 200,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
  });

  it("WSE-005: empty query returns failure", async () => {
    const result = await webSearchTool.execute({ query: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should return simulated response when no API key configured", async () => {
    delete process.env.WEB_SEARCH_API_KEY;
    const result = await webSearchTool.execute({ query: "test" });
    expect(result.success).toBe(true);
    const output = JSON.parse(result.output);
    expect(output.results).toBeDefined();
    expect(output.simulated).toBe(true);
  });
});
