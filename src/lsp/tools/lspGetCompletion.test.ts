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

describe("lspGetCompletionTool", () => {
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
    // LSP may format property names differently
    expect(result.toLowerCase()).toContain("name");
    expect(result.toLowerCase()).toContain("age");
    expect(result.toLowerCase()).toContain("email");
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

    // LSP may format method names differently
    expect(result.toLowerCase()).toContain("map");
    expect(result.toLowerCase()).toContain("filter");
    expect(result.toLowerCase()).toContain("reduce");
    expect(result.toLowerCase()).toContain("length");
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

    // LSP may format function names differently
    expect(result.toLowerCase()).toContain("join");
    expect(result.toLowerCase()).toContain("resolve");
    expect(result.toLowerCase()).toContain("dirname");
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

    // LSP may format property names differently
    expect(result.toLowerCase()).toContain("id");
    expect(result.toLowerCase()).toContain("name");
    expect(result.toLowerCase()).toContain("email");
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

    // LSP may format method names differently
    expect(result.toLowerCase()).toContain("charat");
    expect(result.toLowerCase()).toContain("indexof");
    expect(result.toLowerCase()).toContain("substring");
    expect(result.toLowerCase()).toContain("length");
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
