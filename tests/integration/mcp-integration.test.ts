import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "../../dist/typescript-mcp.js");

describe("MCP Server Integration", () => {
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

    // Verify the server file exists
    await fs.access(SERVER_PATH);

    // Create transport with server parameters
    const cleanEnv = { ...process.env } as Record<string, string>;
    // Ensure TypeScript-specific tools are enabled
    delete cleanEnv.FORCE_LSP;
    delete cleanEnv.LSP_COMMAND;

    transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_PATH],
      env: cleanEnv,
    });

    // Create and connect client
    client = new Client({
      name: "test-client",
      version: "1.0.0",
    });

    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    await client.close();
  });

  it("should list available tools", async () => {
    const response = await client.listTools();
    const tools = response.tools;

    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    // Check for some expected tools
    const toolNames = tools.map((tool) => tool.name);
    // TypeScript-specific tools (not LSP tools since we disabled LSP mode)
    expect(toolNames).toContain("lsmcp_move_file");
    expect(toolNames).toContain("lsmcp_get_type_in_module");
    expect(toolNames).toContain("lsmcp_get_module_symbols");
    expect(toolNames).toContain("lsmcp_search_symbols");
  });

  it("should call get_module_symbols tool", async () => {
    const result = await client.callTool({
      name: "lsmcp_get_module_symbols",
      arguments: {
        root: path.join(__dirname, ".."),
        moduleName: "neverthrow",
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    const contents = result.content as Array<{ type: string; text?: string }>;
    expect(Array.isArray(contents)).toBe(true);

    if (contents.length > 0) {
      const content = contents[0];
      if (content.type === "text" && content.text) {
        expect(content.text).toContain("Result");
        expect(content.text).toContain("Ok");
        expect(content.text).toContain("Err");
      }
    }
  });

  it("should handle get_type_in_module tool", async () => {
    const result = await client.callTool({
      name: "lsmcp_get_type_in_module",
      arguments: {
        root: path.join(__dirname, ".."),
        moduleName: "neverthrow",
        typeName: "Result",
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    const contents = result.content as Array<{ type: string; text?: string }>;
    expect(Array.isArray(contents)).toBe(true);

    if (contents.length > 0) {
      const content = contents[0];
      if (content.type === "text" && content.text) {
        expect(content.text).toContain("Result");
        expect(content.text).toContain("type");
      }
    }
  });

  it("should handle errors gracefully", async () => {
    const result = await client.callTool({
      name: "lsmcp_get_module_symbols",
      arguments: {
        root: "/non/existent/path",
        moduleName: "non-existent-module",
      },
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result).toBeDefined();
    // Error should be thrown for invalid paths
  });
});
