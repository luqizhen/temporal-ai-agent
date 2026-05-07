import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFileReadTool, createFileWriteTool } from "../../../src/tools/definitions/file-io.js";

describe("file-io tools", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "test-workspace-"));
  });

  afterEach(async () => {
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  });

  describe("file-read", () => {
    it("FIO-001: read existing file returns content", async () => {
      await fs.promises.writeFile(path.join(workspaceDir, "test.txt"), "hello world");
      const tool = createFileReadTool(workspaceDir);
      const result = await tool.execute({ path: "test.txt" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("hello world");
    });

    it("FIO-002: read non-existent file returns error", async () => {
      const tool = createFileReadTool(workspaceDir);
      const result = await tool.execute({ path: "nonexistent.txt" });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("FIO-005: path traversal blocked", async () => {
      const tool = createFileReadTool(workspaceDir);
      const result = await tool.execute({ path: "../../etc/passwd" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal");
    });

    it("FIO-007: file-read requiresApproval is false", () => {
      const tool = createFileReadTool(workspaceDir);
      expect(tool.requiresApproval).toBe(false);
    });
  });

  describe("file-write", () => {
    it("FIO-003: write file creates file with content", async () => {
      const tool = createFileWriteTool(workspaceDir);
      const result = await tool.execute({
        path: "new-file.txt",
        content: "new content",
      });
      expect(result.success).toBe(true);
      const content = await fs.promises.readFile(path.join(workspaceDir, "new-file.txt"), "utf-8");
      expect(content).toBe("new content");
    });

    it("should create parent directories when writing", async () => {
      const tool = createFileWriteTool(workspaceDir);
      const result = await tool.execute({
        path: "sub/dir/file.txt",
        content: "nested",
      });
      expect(result.success).toBe(true);
      const content = await fs.promises.readFile(
        path.join(workspaceDir, "sub/dir/file.txt"),
        "utf-8",
      );
      expect(content).toBe("nested");
    });

    it("should block path traversal on write", async () => {
      const tool = createFileWriteTool(workspaceDir);
      const result = await tool.execute({
        path: "../../../tmp/evil.txt",
        content: "evil",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal");
    });

    it("FIO-006: file-write requiresApproval is true", () => {
      const tool = createFileWriteTool(workspaceDir);
      expect(tool.requiresApproval).toBe(true);
    });
  });
});
