import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "../dist/typescript-mcp.js");

describe("MCP TypeScript Tools", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Create a minimal tsconfig.json to make it a TypeScript project
    await fs.writeFile(path.join(tmpDir, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "es2020",
        module: "commonjs",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      }
    }, null, 2));

    // Create transport with server parameters
    const cleanEnv = { ...process.env } as Record<string, string>;
    // Ensure TypeScript-specific tools are enabled
    delete cleanEnv.FORCE_LSP;
    delete cleanEnv.LSP_COMMAND;
    
    transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_PATH],
      env: cleanEnv,
      cwd: tmpDir,  // Use cwd instead of --project-root
    });

    // Create and connect client
    client = new Client({
      name: "test-client",
      version: "1.0.0",
    });

    await client.connect(transport);
  }, 20000); // 20 second timeout for setup

  afterEach(async () => {
    try {
      // Close client and transport
      if (client) {
        await client.close();
      }
    } catch (error) {
      console.error("Error during client cleanup:", error);
    }
    
    // Clean up temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error during temp directory cleanup:", error);
    }
  }, 10000); // 10 second timeout for cleanup

  describe("rename_symbol", () => {
    it.skip("should rename a symbol in a file (TypeScript-specific tool removed)", async () => {
      // Create test file
      const testFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(testFile, `
export const oldName = "value";
export function useOldName() {
  return oldName;
}
`);

      const result = await client.callTool({
        name: "lsmcp_rename_symbol",
        arguments: {
          root: tmpDir,
          filePath: "test.ts",
          line: 2,
          oldName: "oldName",
          newName: "newName",
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Verify the file was updated
      const content = await fs.readFile(testFile, "utf-8");
      expect(content).toContain("export const newName");
      expect(content).toContain("return newName");
      expect(content).not.toContain("oldName");
    });
  });

  describe("move_file (removed - TypeScript-specific tool)", () => {
    it.skip("should move a file and update imports", async () => {
      // This test has been skipped as TypeScript-specific tools have been removed.
      // File moving with import updates is not available in standard LSP.
    });
  });

  describe("get_type_at_symbol (removed - use LSP hover instead)", () => {
    it.skip("should get type information for a symbol", async () => {
      // This test has been skipped as tsGetTypeAtSymbol has been removed.
      // Use lsp_get_hover instead for type information.
      const testFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(testFile, `
const num = 42;
const str = "hello";
const arr = [1, 2, 3];
`);

      // Example of using LSP hover instead:
      // const result = await client.callTool({
      //   name: "lsp_get_hover",
      //   arguments: {
      //     root: tmpDir,
      //     filePath: "test.ts",
      //     line: 2,
      //     target: "num",
      //   }
      // });

      expect(true).toBe(true); // Placeholder
    });
  });

  describe("get_symbols_in_scope (removed - TypeScript-specific tool)", () => {
    it.skip("should list all symbols in scope", async () => {
      // This test has been skipped as TypeScript-specific tools have been removed.
      // Use lsp_get_completion for similar functionality.
    });
  });

  describe("delete_symbol", () => {
    it.skip("should delete a symbol and its references (TypeScript-specific tool removed)", async () => {
      const testFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(testFile, `
export const toDelete = "value";
export function useIt() {
  return toDelete;
}
export const keepThis = "keep";
`);

      const result = await client.callTool({
        name: "lsmcp_delete_symbol",
        arguments: {
          root: tmpDir,
          filePath: "test.ts",
          line: 2,
          symbolName: "toDelete",
          removeReferences: true,
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Check for errors in the result
      if (result.content && Array.isArray(result.content)) {
        const content = result.content[0];
        if (content && 'text' in content && content.text.includes("Error")) {
          throw new Error(`Tool error: ${content.text}`);
        }
      }
      
      const content = await fs.readFile(testFile, "utf-8");
      expect(content).not.toContain("toDelete");
      expect(content).toContain("keepThis");
    });
  });
});