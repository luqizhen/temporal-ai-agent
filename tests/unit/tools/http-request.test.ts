import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { httpRequestTool } from "../../../src/tools/definitions/http-request.js";

describe("http-request tool", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("HREQ-001: GET request returns response body", async () => {
    nock("https://api.example.com").get("/data").reply(200, { message: "hello" });

    const result = await httpRequestTool.execute({
      url: "https://api.example.com/data",
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ message: "hello" });
  });

  it("HREQ-003: request timeout returns error", async () => {
    nock("https://slow.example.com").get("/slow").delayConnection(5000).reply(200, {});

    const result = await httpRequestTool.execute({
      url: "https://slow.example.com/slow",
      timeout: 200,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
  });

  it("HREQ-004: SSRF prevention - block 127.0.0.1", async () => {
    const result = await httpRequestTool.execute({
      url: "http://127.0.0.1/admin",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("private");
  });

  it("should block localhost", async () => {
    const result = await httpRequestTool.execute({
      url: "http://localhost/admin",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("private");
  });

  it("should block 10.x private IP", async () => {
    const result = await httpRequestTool.execute({
      url: "http://10.0.0.1/internal",
    });
    expect(result.success).toBe(false);
  });

  it("should block 192.168.x private IP", async () => {
    const result = await httpRequestTool.execute({
      url: "http://192.168.1.1/router",
    });
    expect(result.success).toBe(false);
  });

  it("should block 172.16.x private IP", async () => {
    const result = await httpRequestTool.execute({
      url: "http://172.16.0.1/internal",
    });
    expect(result.success).toBe(false);
  });

  it("HREQ-005: requiresApproval is true", () => {
    expect(httpRequestTool.requiresApproval).toBe(true);
  });

  it("should reject invalid URL format", async () => {
    const result = await httpRequestTool.execute({ url: "not-a-url" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should make POST request with body", async () => {
    nock("https://api.example.com").post("/data", { name: "test" }).reply(201, { id: 1 });

    const result = await httpRequestTool.execute({
      url: "https://api.example.com/data",
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ id: 1 });
  });
});
