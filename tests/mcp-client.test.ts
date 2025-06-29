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
    // Enable LSP mode to use lsp_rename_symbol and lsp_delete_symbol
    cleanEnv.USE_LSP = "true";
    cleanEnv.LSP_COMMAND = "node_modules/.bin/typescript-language-server --stdio";
    
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
    it("should rename a symbol in a file", async () => {
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

  describe("move_file", () => {
    it("should move a file and update imports", async () => {
      // Create test files
      const srcFile = path.join(tmpDir, "src.ts");
      const importerFile = path.join(tmpDir, "importer.ts");
      
      await fs.writeFile(srcFile, `export const value = 42;`);
      await fs.writeFile(importerFile, `import { value } from "./src";\nconsole.log(value);`);
      
      // Verify files exist before calling tool
      await expect(fs.access(srcFile)).resolves.toBeUndefined();
      await expect(fs.access(importerFile)).resolves.toBeUndefined();

      const result = await client.callTool({
        name: "lsmcp_move_file",
        arguments: {
          root: tmpDir,
          oldPath: "src.ts",
          newPath: "moved/src.ts",
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Check for errors in the result
      if (result.content && Array.isArray(result.content)) {
        const content = result.content[0];
        if (content && 'text' in content && content.text.startsWith("Error:")) {
          throw new Error(`Tool error: ${content.text}`);
        }
      }
      
      // Verify file was moved
      await expect(fs.access(srcFile)).rejects.toThrow();
      await expect(fs.access(path.join(tmpDir, "moved/src.ts"))).resolves.toBeUndefined();
      
      // Verify import was updated
      const importerContent = await fs.readFile(importerFile, "utf-8");
      expect(importerContent).toContain(`import { value } from "./moved/src"`);
    });
  });

  describe("get_type_at_symbol", () => {
    it("should get type information for a symbol", async () => {
      const testFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(testFile, `
const num = 42;
const str = "hello";
const arr = [1, 2, 3];
`);

      const result = await client.callTool({
        name: "lsmcp_get_type_at_symbol",
        arguments: {
          root: tmpDir,
          filePath: "test.ts",
          line: 2,
          symbolName: "num",
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const contents = result.content as Array<{ type: string; text?: string }>;
      if (contents.length > 0) {
        const content = contents[0];
        if (content.type === "text" && content.text) {
          expect(content.text).toContain("42");
        }
      }
    });
  });

  describe("get_symbols_in_scope", () => {
    it("should list all symbols in scope", async () => {
      const testFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(testFile, `
import { Result } from "neverthrow";

const localVar = 10;
type LocalType = string;

function testFunction() {
  const innerVar = 20;
  // Get symbols here
}
`);

      const result = await client.callTool({
        name: "lsmcp_get_symbols_in_scope",
        arguments: {
          root: tmpDir,
          filePath: "test.ts",
          line: 8,
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const contents = result.content as Array<{ type: string; text?: string }>;
      if (contents.length > 0) {
        const content = contents[0];
        if (content.type === "text" && content.text) {
          expect(content.text).toContain("innerVar");
          expect(content.text).toContain("testFunction");
          expect(content.text).toContain("localVar");
        }
      }
    });
  });

  describe("delete_symbol", () => {
    it("should delete a symbol and its references", async () => {
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