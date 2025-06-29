import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../src/lsp/lspClient.ts";
import { lspGetHoverTool } from "../src/lsp/tools/lspGetHover.ts";
import { lspFindReferencesTool } from "../src/lsp/tools/lspFindReferences.ts";
import { lspGetDefinitionsTool } from "../src/lsp/tools/lspGetDefinitions.ts";
import { lspRenameSymbolTool } from "../src/lsp/tools/lspRenameSymbol.ts";
import { lspGetDocumentSymbolsTool } from "../src/lsp/tools/lspGetDocumentSymbols.ts";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const FIXTURES_DIR = path.join(__dirname, "fixtures/lsp-errors");

describe("LSP error handling tests", () => {
  let lspProcess: ChildProcess;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP error handling tests: LSP_COMMAND not set");
      return;
    }

    // Create fixtures directory
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    // Start TypeScript language server
    const [command, ...args] = process.env.LSP_COMMAND.split(" ");
    lspProcess = spawn(command, args, {
      cwd: __dirname,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Initialize LSP client
    await initializeLSPClient(__dirname, lspProcess, "typescript");

    // Create temporary directory
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-lsp-errors-${hash}`);
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

  describe("File system errors", () => {
    it("should handle non-existent files", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      // All tools should throw on non-existent files
      await expect(
        lspGetHoverTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
          line: 1,
          character: 0,
        }),
      ).rejects.toThrow(/ENOENT/);

      await expect(
        lspFindReferencesTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
          line: 1,
          symbolName: "foo",
        }),
      ).rejects.toThrow(/ENOENT/);

      await expect(
        lspGetDefinitionsTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
          line: 1,
          symbolName: "foo",
        }),
      ).rejects.toThrow(/ENOENT/);

      await expect(
        lspRenameSymbolTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
          line: 1,
          target: "foo",
          newName: "bar",
        }),
      ).rejects.toThrow(/ENOENT/);

      await expect(
        lspGetDocumentSymbolsTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
        }),
      ).rejects.toThrow(/ENOENT/);
    });

    it("should handle permission errors", async () => {
      if (!process.env.LSP_COMMAND || process.platform === "win32") {
        return; // Skip on Windows
      }

      const restrictedFile = path.join(tmpDir, "restricted.ts");
      await fs.writeFile(restrictedFile, "const x = 1;");
      await fs.chmod(restrictedFile, 0o000); // No permissions

      try {
        await expect(
          lspGetHoverTool.execute({
            root: tmpDir,
            filePath: "restricted.ts",
            line: 1,
            character: 6,
          }),
        ).rejects.toThrow(/EACCES|permission/i);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedFile, 0o644);
      }
    });
  });

  describe("Invalid input errors", () => {
    it("should handle invalid line numbers", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = "const x = 1;";
      await fs.writeFile(path.join(tmpDir, "test.ts"), testFile);

      // Line number out of range
      await expect(
        lspRenameSymbolTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: 999,
          target: "x",
          newName: "y",
        }),
      ).rejects.toThrow(/Invalid line number|line.*not found/i);

      // Negative line number
      await expect(
        lspGetHoverTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: -1,
          character: 0,
        }),
      ).rejects.toThrow(/Invalid line number/i);
    });

    it("should handle invalid characters", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = "const x = 1;";
      await fs.writeFile(path.join(tmpDir, "test.ts"), testFile);

      // Character position out of range - should return no hover info
      const result = await lspGetHoverTool.execute({
        root: tmpDir,
        filePath: "test.ts",
        line: 1,
        character: 999,
      });
      expect(result).toBe("No hover information available");
    });

    it("should handle empty search strings", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = "const x = 1;";
      await fs.writeFile(path.join(tmpDir, "test.ts"), testFile);

      // Empty target string
      await expect(
        lspFindReferencesTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: 1,
          symbolName: "",
        }),
      ).rejects.toThrow(/Symbol.*not found|empty/i);
    });

    it("should handle invalid rename targets", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = `const message = "hello";
console.log(message);`;
      await fs.writeFile(path.join(tmpDir, "test.ts"), testFile);

      // Try to rename a string literal
      await expect(
        lspRenameSymbolTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: 1,
          target: '"hello"',
          newName: '"goodbye"',
        }),
      ).rejects.toThrow(/not found/i);

      // Try to rename to invalid identifier
      await expect(
        lspRenameSymbolTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: 1,
          target: "message",
          newName: "123invalid", // Invalid identifier
        }),
      ).rejects.toThrow(/not a valid|invalid/i);
    });
  });

  describe("LSP client errors", () => {
    it("should handle operations without initialized client", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      // Temporarily shut down the client
      await shutdownLSPClient();

      // Try to use tools without client
      await expect(
        lspGetHoverTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: 1,
          character: 0,
        }),
      ).rejects.toThrow(/LSP client not initialized/);

      // Re-initialize for other tests
      await initializeLSPClient(__dirname, lspProcess, "typescript");
    });
  });

  describe("Symbol search errors", () => {
    it("should handle ambiguous symbol searches", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = `function process() { return 1; }
function process() { return 2; } // Duplicate
const x = process();
const y = process();
`;
      await fs.writeFile(path.join(tmpDir, "ambiguous.ts"), testFile);

      // Search for "process" should find multiple matches
      await expect(
        lspFindReferencesTool.execute({
          root: tmpDir,
          filePath: "ambiguous.ts",
          line: "process()",
          symbolName: "process",
        }),
      ).rejects.toThrow(/Multiple lines found|ambiguous/i);
    });

    it("should handle symbols not found on specified line", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = `const x = 1;
const y = 2;
const z = 3;`;
      await fs.writeFile(path.join(tmpDir, "symbols.ts"), testFile);

      // Try to find 'x' on line 2
      await expect(
        lspRenameSymbolTool.execute({
          root: tmpDir,
          filePath: "symbols.ts",
          line: 2,
          target: "x",
          newName: "a",
        }),
      ).rejects.toThrow(/Symbol "x" not found on line 2/);
    });
  });

  describe("File content errors", () => {
    it("should handle empty files", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const emptyFile = path.join(tmpDir, "empty.ts");
      await fs.writeFile(emptyFile, "");

      // Document symbols on empty file
      const symbolsResult = await lspGetDocumentSymbolsTool.execute({
        root: tmpDir,
        filePath: "empty.ts",
      });
      expect(symbolsResult).toContain("No symbols found");

      // Hover on empty file
      const hoverResult = await lspGetHoverTool.execute({
        root: tmpDir,
        filePath: "empty.ts",
        line: 1,
        character: 0,
      });
      expect(hoverResult).toBe("No hover information available");
    });

    it("should handle files with only comments", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const commentFile = `// This is a comment
/* Multi-line
   comment */
// Another comment`;
      await fs.writeFile(path.join(tmpDir, "comments.ts"), commentFile);

      const symbolsResult = await lspGetDocumentSymbolsTool.execute({
        root: tmpDir,
        filePath: "comments.ts",
      });
      expect(symbolsResult).toContain("No symbols found");
    });

    it("should handle binary files", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      // Create a binary file
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const binaryFile = path.join(tmpDir, "binary.ts");
      await fs.writeFile(binaryFile, binaryData);

      // Most operations should handle binary gracefully or throw
      const symbolsResult = await lspGetDocumentSymbolsTool.execute({
        root: tmpDir,
        filePath: "binary.ts",
      });
      // Should either return no symbols or handle gracefully
      expect(symbolsResult).toBeTruthy();
    });
  });
});
