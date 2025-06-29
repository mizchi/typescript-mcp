import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("list_tools functionality", () => {
  describe("TypeScript server", () => {
    let client: Client;
    let transport: StdioClientTransport;
    
    beforeAll(async () => {
      // Build the server first
      await new Promise<void>((resolve, reject) => {
        const buildProcess = spawn("pnpm", ["build"], {
          cwd: path.join(__dirname, ".."),
          shell: true,
        });
        
        buildProcess.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Build failed with code ${code}`));
        });
      });

      const SERVER_PATH = path.join(__dirname, "../dist/typescript-mcp.js");
      await fs.access(SERVER_PATH);

      transport = new StdioClientTransport({
        command: "node",
        args: [SERVER_PATH],
        env: process.env,
      });

      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      await client.connect(transport);
    }, 30000);
    
    afterAll(async () => {
      await client.close();
    });
    
    it("should list TypeScript tools", async () => {
      const result = await client.callTool({
        name: "list_tools",
        arguments: { category: "typescript" }
      });
      
      expect(result.content[0].text).toContain("TypeScript Tools");
      expect(result.content[0].text).toContain("move_file");
      expect(result.content[0].text).toContain("get_module_symbols");
      expect(result.content[0].text).toContain("search_symbols");
    });
    
    it("should list all tools including LSP", async () => {
      const result = await client.callTool({
        name: "list_tools",
        arguments: { category: "all" }
      });
      
      expect(result.content[0].text).toContain("TypeScript Tools");
      expect(result.content[0].text).toContain("LSP Tools");
      expect(result.content[0].text).toContain("lsp_find_references");
    });
  });
  
  describe("Generic LSP server", () => {
    let client: Client;
    let transport: StdioClientTransport;
    
    beforeAll(async () => {
      const SERVER_PATH = path.join(__dirname, "../dist/generic-lsp-mcp.js");
      await fs.access(SERVER_PATH);

      // Use typescript-language-server from node_modules to avoid npx overhead
      const tsLangServerPath = path.join(__dirname, "../node_modules/.bin/typescript-language-server");
      transport = new StdioClientTransport({
        command: "node",
        args: [SERVER_PATH, `--lsp-command=${tsLangServerPath} --stdio`],
        env: {
          ...process.env,
          LSP_COMMAND: `${tsLangServerPath} --stdio`
        },
      });

      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      await client.connect(transport);
    }, 30000);
    
    afterAll(async () => {
      await client.close();
    });
    
    it("should only list LSP tools, not TypeScript tools", async () => {
      const result = await client.callTool({
        name: "list_tools",
        arguments: {}
      });
      
      expect(result.content[0].text).toContain("LSP Tools");
      expect(result.content[0].text).toContain("lsp_find_references");
      expect(result.content[0].text).toContain("lsp_get_hover");
      
      // Should NOT contain TypeScript-specific tools
      expect(result.content[0].text).not.toContain("TypeScript Tools");
      expect(result.content[0].text).not.toContain("move_file");
      expect(result.content[0].text).not.toContain("get_module_symbols");
      expect(result.content[0].text).not.toContain("search_symbols");
    });
    
    it("should ignore category parameter for LSP-only server", async () => {
      // Even with category "all", should only show LSP tools
      const result = await client.callTool({
        name: "list_tools",
        arguments: { category: "all" }
      });
      
      expect(result.content[0].text).toContain("LSP Tools");
      expect(result.content[0].text).not.toContain("TypeScript Tools");
    });
  });
});