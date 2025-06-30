import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../lspClient.ts";
import { lspGetCompletionTool } from "./lspGetCompletion.ts";
import { randomBytes } from "crypto";

describe.skip("lspGetCompletionTool", () => {
  let lspProcess: ChildProcess;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP completion tests: LSP_COMMAND not set");
      return;
    }

    // Create temporary directory
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-lsp-completion-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Start TypeScript language server
    const [command, ...args] = process.env.LSP_COMMAND.split(" ");
    lspProcess = spawn(command, args, {
      cwd: tmpDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Initialize LSP client
    await initializeLSPClient(tmpDir, lspProcess, "typescript");
  });

  afterAll(async () => {
    // Cleanup
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    if (lspProcess) {
      await shutdownLSPClient();
      lspProcess.kill();
    }
  });

  it("should get completions for object properties", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
const person = {
  name: "John",
  age: 30,
  email: "john@example.com"
};

person.
`;
    const filePath = "person.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: "person.",
      target: "person.",
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("Completions at");
    expect(result).toContain("name [Property]");
    expect(result).toContain("age [Property]");
    expect(result).toContain("email [Property]");
  });

  it("should get completions for array methods", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
const numbers = [1, 2, 3, 4, 5];
numbers.
`;
    const filePath = "array.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: "numbers.",
      target: "numbers.",
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("map [Method]");
    expect(result).toContain("filter [Method]");
    expect(result).toContain("reduce [Method]");
    expect(result).toContain("length [Property]");
  });

  it("should get completions for imported modules", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
import * as path from "path";
path.
`;
    const filePath = "imports.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: "path.",
      target: "path.",
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("join [Function]");
    expect(result).toContain("resolve [Function]");
    expect(result).toContain("dirname [Function]");
  });

  it("should handle completions with line number", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  
};
`;
    const filePath = "interface.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: 9, // Inside the object literal
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("id [Property]");
    expect(result).toContain("name [Property]");
    expect(result).toContain("email [Property]");
  });

  it("should show no completions for invalid position", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `// Just a comment`;
    const filePath = "comment.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: 1,
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("No completions available");
  });

  it("should handle completions in string context", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
const str = "hello";
str.
`;
    const filePath = "string.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: 3,
      target: "str.",
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("charAt [Method]");
    expect(result).toContain("indexOf [Method]");
    expect(result).toContain("substring [Method]");
    expect(result).toContain("length [Property]");
  });

  // Test for internal function
  it("should format completion items with documentation", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
// This will trigger Promise completions which have documentation
async function test() {
  return Promise.
}
`;
    const filePath = "promise.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetCompletionTool.execute({
      root: tmpDir,
      filePath,
      line: "Promise.",
      target: "Promise.",
      resolve: false,
      includeAutoImport: false,
    });

    expect(result).toContain("resolve [Method]");
    expect(result).toContain("reject [Method]");
    expect(result).toContain("all [Method]");
    // Should contain some documentation
    expect(result.length).toBeGreaterThan(200);
  });
});
