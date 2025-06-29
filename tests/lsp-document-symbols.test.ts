import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../src/lsp/lspClient.ts";
import { lspGetDocumentSymbolsTool } from "../src/lsp/tools/lspGetDocumentSymbols.ts";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

describe("lsp document symbols", () => {
  let lspProcess: ChildProcess;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP document symbols tests: LSP_COMMAND not set");
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

  afterAll(async () => {
    if (lspProcess) {
      await shutdownLSPClient();
      lspProcess.kill();
    }
  });

  it("should get document symbols from a TypeScript file", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const result = await lspGetDocumentSymbolsTool.execute({
      root: FIXTURES_DIR,
      filePath: "document-symbols-test.ts",
    });

    // Verify result contains expected symbols
    expect(result).toContain("Document symbols in document-symbols-test.ts");
    expect(result).toContain("User [Interface]");
    expect(result).toContain("UserService [Class]");
    expect(result).toContain("processUser [Function]");
    expect(result).toContain("defaultUser [Constant]"); // TypeScript LSP reports const as Constant

    // Check for class members
    expect(result).toContain("users [Property]");
    expect(result).toContain("constructor [Constructor]");
    expect(result).toContain("addUser [Method]");
    expect(result).toContain("getUser [Method]");
    expect(result).toContain("userCount [Method]"); // getter is reported as Method

    // Check for interface members
    expect(result).toContain("id [Property]");
    expect(result).toContain("name [Property]");
    expect(result).toContain("email [Property]");
  });

  it("should handle files with no symbols", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create an empty test file
    const emptyFile = path.join(FIXTURES_DIR, "empty.ts");
    await import("fs/promises").then((fs) =>
      fs.writeFile(emptyFile, "// Empty file\n")
    );

    try {
      const result = await lspGetDocumentSymbolsTool.execute({
        root: FIXTURES_DIR,
        filePath: "empty.ts",
      });

      expect(result).toBe("No symbols found in empty.ts");
    } finally {
      // Clean up
      await import("fs/promises").then((fs) =>
        fs.unlink(emptyFile).catch(() => {})
      );
    }
  });

  it("should handle non-existent files", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    await expect(
      lspGetDocumentSymbolsTool.execute({
        root: FIXTURES_DIR,
        filePath: "non-existent.ts",
      }),
    ).rejects.toThrow();
  });
});
