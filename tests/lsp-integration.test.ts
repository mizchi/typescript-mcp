import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import {
  getLSPClient,
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../src/lsp/lspClient.ts";
import { lspGetHoverTool } from "../src/lsp/tools/lspGetHover.ts";
import { lspFindReferencesTool } from "../src/lsp/tools/lspFindReferences.ts";
import { lspGetDefinitionsTool } from "../src/lsp/tools/lspGetDefinitions.ts";
import { lspGetDiagnosticsTool } from "../src/lsp/tools/lspGetDiagnostics.ts";
import { lspRenameSymbolTool } from "../src/lsp/tools/lspRenameSymbol.ts";
import { lspGetDocumentSymbolsTool } from "../src/lsp/tools/lspGetDocumentSymbols.ts";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const FIXTURES_DIR = path.join(__dirname, "fixtures/lsp-integration");

describe("LSP integration tests", () => {
  let lspProcess: ChildProcess;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP integration tests: LSP_COMMAND not set");
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
    tmpDir = path.join(__dirname, `tmp-lsp-integration-${hash}`);
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

  describe("Complete workflow test", () => {
    it("should work with a TypeScript project", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      // Create test files
      const mainFile = `// Main application file
import { Calculator } from "./calculator.ts";
import { formatResult } from "./utils.ts";

const calc = new Calculator();
const result = calc.add(5, 3);
console.log(formatResult("Addition", result));

const product = calc.multiply(4, 7);
console.log(formatResult("Multiplication", product));
`;

      const calculatorFile = `// Calculator class
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Division by zero");
    }
    return a / b;
  }
}
`;

      const utilsFile = `// Utility functions
export function formatResult(operation: string, result: number): string {
  return \`\${operation} result: \${result}\`;
}

export function roundTo(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
`;

      // Write test files
      await fs.writeFile(path.join(tmpDir, "main.ts"), mainFile);
      await fs.writeFile(path.join(tmpDir, "calculator.ts"), calculatorFile);
      await fs.writeFile(path.join(tmpDir, "utils.ts"), utilsFile);

      // Test 1: Get hover information
      const hoverResult = await lspGetHoverTool.execute({
        root: tmpDir,
        filePath: "main.ts",
        line: 5,
        character: 6, // hover over 'calc'
      });
      expect(hoverResult).toContain("const calc");
      // Type information may vary based on LSP server state

      // Test 2: Find references
      const referencesResult = await lspFindReferencesTool.execute({
        root: tmpDir,
        filePath: "calculator.ts",
        line: "add(a: number",
        symbolName: "add",
      });
      expect(referencesResult).toContain("Found 2 references");
      expect(referencesResult).toContain("calculator.ts");
      expect(referencesResult).toContain("main.ts");

      // Test 3: Get definitions
      const definitionsResult = await lspGetDefinitionsTool.execute({
        root: tmpDir,
        filePath: "main.ts",
        line: "formatResult",
        symbolName: "formatResult",
      });
      expect(definitionsResult).toContain("Found 1 definition");
      expect(definitionsResult).toContain("utils.ts");

      // Test 4: Get document symbols
      const symbolsResult = await lspGetDocumentSymbolsTool.execute({
        root: tmpDir,
        filePath: "calculator.ts",
      });
      expect(symbolsResult).toContain("Calculator [Class]");
      expect(symbolsResult).toContain("add [Method]");
      expect(symbolsResult).toContain("subtract [Method]");
      expect(symbolsResult).toContain("multiply [Method]");
      expect(symbolsResult).toContain("divide [Method]");

      // Test 5: Rename symbol
      const renameResult = await lspRenameSymbolTool.execute({
        root: tmpDir,
        filePath: "utils.ts",
        line: "formatResult",
        target: "formatResult",
        newName: "formatOutput",
      });
      expect(renameResult).toContain("Successfully renamed symbol");
      expect(renameResult).toContain('"formatResult" → "formatOutput"');

      // Verify rename was applied
      const utilsContent = await fs.readFile(
        path.join(tmpDir, "utils.ts"),
        "utf-8",
      );
      expect(utilsContent).toContain("formatOutput");
      expect(utilsContent).not.toContain("formatResult");

      // Test 6: Get diagnostics
      // Add an error to trigger diagnostics
      const errorFile = `// File with errors
const x: string = 123; // Type error
console.log(unknownVariable); // Unknown variable
`;
      await fs.writeFile(path.join(tmpDir, "error.ts"), errorFile);

      // Wait a bit for diagnostics to be processed
      await new Promise((resolve) => setTimeout(resolve, 500));

      const diagnosticsResult = await lspGetDiagnosticsTool.execute({
        root: tmpDir,
        filePath: "error.ts",
      });
      expect(diagnosticsResult).toContain("errors");
      expect(diagnosticsResult).toContain(
        "Type 'number' is not assignable to type 'string'",
      );
    });
  });

  describe("Error handling", () => {
    it("should handle non-existent files", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      // Test hover on non-existent file
      await expect(
        lspGetHoverTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
          line: 1,
          character: 0,
        }),
      ).rejects.toThrow();

      // Test references on non-existent file
      await expect(
        lspFindReferencesTool.execute({
          root: tmpDir,
          filePath: "non-existent.ts",
          line: 1,
          symbolName: "foo",
        }),
      ).rejects.toThrow();
    });

    it("should handle invalid positions", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const testFile = `const x = 1;\nconst y = 2;`;
      await fs.writeFile(path.join(tmpDir, "test.ts"), testFile);

      // Test hover at invalid position
      const hoverResult = await lspGetHoverTool.execute({
        root: tmpDir,
        filePath: "test.ts",
        line: 2, // Valid line but beyond content
        character: 0,
      });
      expect(hoverResult).toContain("No hover information available");

      // Test rename on non-existent symbol
      await expect(
        lspRenameSymbolTool.execute({
          root: tmpDir,
          filePath: "test.ts",
          line: 1,
          target: "nonExistentSymbol",
          newName: "newName",
        }),
      ).rejects.toThrow();
    });
  });

  describe("LSP client state", () => {
    it("should maintain LSP client connection", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      const client = getLSPClient();
      expect(client).toBeDefined();

      // Perform multiple operations to ensure connection stability
      const testFile =
        `export const VERSION = "1.0.0";\nexport const NAME = "Test";`;
      await fs.writeFile(path.join(tmpDir, "constants.ts"), testFile);

      // Multiple operations on the same file
      const hover1 = await lspGetHoverTool.execute({
        root: tmpDir,
        filePath: "constants.ts",
        line: 1,
        character: 13, // VERSION
      });
      expect(hover1).toContain("VERSION");

      const hover2 = await lspGetHoverTool.execute({
        root: tmpDir,
        filePath: "constants.ts",
        line: 2,
        character: 13, // NAME
      });
      expect(hover2).toContain("NAME");

      // Client should still be active
      const clientAfter = getLSPClient();
      expect(clientAfter).toBe(client);
    });
  });

  describe("Cross-file operations", () => {
    it("should handle cross-file references", async () => {
      if (!process.env.LSP_COMMAND) {
        return;
      }

      // Create interconnected files
      const libFile = `// Library file
export interface Config {
  apiUrl: string;
  timeout: number;
}

export function createConfig(url: string): Config {
  return {
    apiUrl: url,
    timeout: 5000
  };
}
`;

      const appFile = `// Application file
import { Config, createConfig } from "./lib.ts";

const config: Config = createConfig("https://api.example.com");
console.log(config.apiUrl);

function updateConfig(cfg: Config): Config {
  return {
    ...cfg,
    timeout: 10000
  };
}

const updatedConfig = updateConfig(config);
`;

      await fs.writeFile(path.join(tmpDir, "lib.ts"), libFile);
      await fs.writeFile(path.join(tmpDir, "app.ts"), appFile);

      // Find all references to Config interface
      const configRefs = await lspFindReferencesTool.execute({
        root: tmpDir,
        filePath: "lib.ts",
        line: 2, // interface Config line
        symbolName: "Config",
      });
      expect(configRefs).toContain("Found");
      expect(configRefs).toContain("references");
      expect(configRefs).toContain("lib.ts");
      // Note: Cross-file references depend on LSP server implementation
      // Some servers may not find references in unopened files

      // Get definition from usage
      const configDef = await lspGetDefinitionsTool.execute({
        root: tmpDir,
        filePath: "app.ts",
        line: "const config: Config",
        symbolName: "Config",
      });
      expect(configDef).toContain("lib.ts");
      expect(configDef).toContain("interface Config");
    });
  });
});
