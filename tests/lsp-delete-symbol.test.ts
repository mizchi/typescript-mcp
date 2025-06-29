import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../src/lsp/lspClient.ts";
import { lspDeleteSymbolTool } from "../src/lsp/tools/lspDeleteSymbol.ts";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

// const FIXTURES_DIR = path.join(__dirname, "fixtures/lsp-delete");

describe("lsp delete symbol", () => {
  let lspProcess: ChildProcess;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP delete tests: LSP_COMMAND not set");
      return;
    }

    // Start TypeScript language server
    const [command, ...args] = process.env.LSP_COMMAND.split(" ");
    lspProcess = spawn(command, args, {
      cwd: __dirname,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Initialize LSP client
    await initializeLSPClient(__dirname, lspProcess, "typescript");
  });

  beforeAll(async () => {
    // Create temporary directory with random hash
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-lsp-delete-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });
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

  it("should delete a simple variable and its references", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create test file content
    const testContent = `const foo = 1;
const bar = foo + 2;
console.log(foo);
export { foo };`;

    const testFile = path.join(tmpDir, "delete-variable.ts");
    await fs.writeFile(testFile, testContent);

    // Execute delete
    const result = await lspDeleteSymbolTool.execute({
      root: tmpDir,
      filePath: "delete-variable.ts",
      line: 1, // const foo = 1;
      target: "foo",
      removeReferences: true,
    });

    // Verify result
    expect(result).toContain("Successfully deleted symbol");
    expect(result).toContain("delete-variable.ts");

    // Verify file content - all foo references should be removed
    const actualContent = await fs.readFile(testFile, "utf-8");
    expect(actualContent).not.toContain("foo");

    // The first line should be deleted entirely
    const lines = actualContent.split("\n").filter((line) => line.trim());
    expect(lines[0]).toBe("const bar =  + 2;");
  });

  it("should delete only declaration when removeReferences is false", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create test file content
    const testContent = `function processData(data: string): string {
  return data.toUpperCase();
}

const result = processData("hello");
console.log(processData("world"));`;

    const testFile = path.join(tmpDir, "delete-function-only.ts");
    await fs.writeFile(testFile, testContent);

    // Execute delete without references
    const result = await lspDeleteSymbolTool.execute({
      root: tmpDir,
      filePath: "delete-function-only.ts",
      line: 1, // function processData
      target: "processData",
      removeReferences: false,
    });

    // Verify result
    expect(result).toContain("Successfully deleted symbol");

    // Verify file content - only declaration should be removed
    const actualContent = await fs.readFile(testFile, "utf-8");
    expect(actualContent).not.toContain("function processData");
    // References should still exist
    expect(actualContent).toContain('processData("hello")');
    expect(actualContent).toContain('processData("world")');
  });

  it("should handle deletion errors gracefully", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Try to delete from a non-existent file
    await expect(
      lspDeleteSymbolTool.execute({
        root: tmpDir,
        filePath: "nonexistent.ts",
        line: 1,
        target: "foo",
        removeReferences: true,
      }),
    ).rejects.toThrow();
  });

  it("should handle symbol not found on line", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testContent = `const bar = 1;
const baz = 2;`;

    const testFile = path.join(tmpDir, "wrong-symbol.ts");
    await fs.writeFile(testFile, testContent);

    // Try to delete a symbol that doesn't exist on the specified line
    await expect(
      lspDeleteSymbolTool.execute({
        root: tmpDir,
        filePath: "wrong-symbol.ts",
        line: 1,
        target: "foo", // foo doesn't exist on line 1
        removeReferences: true,
      }),
    ).rejects.toThrow('Symbol "foo" not found on line 1');
  });
});
