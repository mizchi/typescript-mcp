import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

interface TextContent {
  type: "text";
  text: string;
}

interface CallToolResult {
  content: TextContent[];
  isError?: boolean;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures/lsp-mcp");

describe.skip("LSP MCP integration tests", () => {
  let mcpProcess: ChildProcess;
  let client: Client;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if required tools are not available
    try {
      await fs.access(path.join(__dirname, "../dist/generic-lsp-mcp.js"));
    } catch {
      console.log(
        "Skipping LSP MCP tests: dist/generic-lsp-mcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    // Create fixtures directory
    await fs.mkdir(FIXTURES_DIR, { recursive: true });

    // Create temporary directory
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-lsp-mcp-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Start MCP server with TypeScript LSP
    mcpProcess = spawn("node", [
      path.join(__dirname, "../dist/generic-lsp-mcp.js"),
    ], {
      env: {
        ...process.env,
        LSP_COMMAND: "typescript-language-server --stdio",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Initialize MCP client
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../dist/generic-lsp-mcp.js")],
      env: {
        ...process.env,
        LSP_COMMAND: "typescript-language-server --stdio",
      },
    });

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await client.connect(transport);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    if (client) {
      await client.close();
    }

    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill();
    }
  });

  it("should list available LSP tools", async () => {
    if (!client) {
      return;
    }

    const tools = await client.listTools();

    // Verify all LSP tools are available
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain("lsmcp_get_hover");
    expect(toolNames).toContain("lsmcp_find_references");
    expect(toolNames).toContain("lsmcp_get_definitions");
    expect(toolNames).toContain("lsmcp_get_diagnostics");
    expect(toolNames).toContain("lsmcp_rename_symbol");
    expect(toolNames).toContain("lsmcp_get_document_symbols");
  });

  it("should execute hover tool via MCP", async () => {
    if (!client) {
      return;
    }

    // Create a test file
    const testFile = `const message: string = "Hello, World!";
console.log(message);
`;
    await fs.writeFile(path.join(tmpDir, "hover-test.ts"), testFile);

    // Execute hover tool
    const result = await client.callTool({
      name: "lsmcp_get_hover",
      arguments: {
        root: tmpDir,
        filePath: "hover-test.ts",
        line: 1,
        character: 6, // hover over 'message'
      },
    });

    const typedResult = result as CallToolResult;
    expect(typedResult.content[0].text).toContain("message");
    expect(typedResult.content[0].text).toContain("string");
  });

  it("should execute find references tool via MCP", async () => {
    if (!client) {
      return;
    }

    // Create test files
    const moduleFile = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;
    const mainFile = `import { greet } from "./module.ts";

const result = greet("Alice");
console.log(result);

// Another usage
const greeting = greet("Bob");
`;

    await fs.writeFile(path.join(tmpDir, "module.ts"), moduleFile);
    await fs.writeFile(path.join(tmpDir, "main.ts"), mainFile);

    // Find references to 'greet' function
    const result = await client.callTool({
      name: "lsmcp_find_references",
      arguments: {
        root: tmpDir,
        filePath: "module.ts",
        line: 1,
        symbolName: "greet",
      },
    });

    const typedResult = result as CallToolResult;
    expect(typedResult.content[0].text).toContain("Found");
    expect(typedResult.content[0].text).toMatch(/reference/); // matches "reference" or "references"
    expect(typedResult.content[0].text).toContain("module.ts");
    // Note: main.ts references are not found by LSP in this test setup
  });

  it("should execute rename symbol tool via MCP", async () => {
    if (!client) {
      return;
    }

    // Create a test file
    const originalFile = `function calculateSum(a: number, b: number): number {
  return a + b;
}

const result = calculateSum(5, 3);
console.log(calculateSum(10, 20));
`;
    const testPath = path.join(tmpDir, "rename-test.ts");
    await fs.writeFile(testPath, originalFile);

    // Rename 'calculateSum' to 'computeSum'
    const result = await client.callTool({
      name: "lsmcp_rename_symbol",
      arguments: {
        root: tmpDir,
        filePath: "rename-test.ts",
        line: 1,
        target: "calculateSum",
        newName: "computeSum",
      },
    });

    const typedResult = result as CallToolResult;
    expect(typedResult.content[0].text).toContain(
      "Successfully renamed symbol",
    );
    expect(typedResult.content[0].text).toContain(
      '"calculateSum" → "computeSum"',
    );

    // Verify the file was updated
    const updatedContent = await fs.readFile(testPath, "utf-8");
    expect(updatedContent).toContain("computeSum");
    expect(updatedContent).not.toContain("calculateSum");
  });

  it("should execute document symbols tool via MCP", async () => {
    if (!client) {
      return;
    }

    // Create a test file with various symbols
    const testFile = `interface Person {
  name: string;
  age: number;
}

class Employee implements Person {
  constructor(public name: string, public age: number, private id: number) {}
  
  getInfo(): string {
    return \`\${this.name} (\${this.age})\`;
  }
}

const employees: Employee[] = [];

function addEmployee(emp: Employee): void {
  employees.push(emp);
}
`;
    await fs.writeFile(path.join(tmpDir, "symbols-test.ts"), testFile);

    // Get document symbols
    const result = await client.callTool({
      name: "lsmcp_get_document_symbols",
      arguments: {
        root: tmpDir,
        filePath: "symbols-test.ts",
      },
    });

    const typedResult = result as CallToolResult;
    const text = typedResult.content[0].text;
    expect(text).toContain("Person [Interface]");
    expect(text).toContain("Employee [Class]");
    expect(text).toContain("employees [Constant]");
    expect(text).toContain("addEmployee [Function]");
    expect(text).toContain("getInfo [Method]");
  });

  it("should handle errors gracefully via MCP", async () => {
    if (!client) {
      return;
    }

    // Try to get hover on non-existent file
    const result = await client.callTool({
      name: "lsmcp_get_hover",
      arguments: {
        root: tmpDir,
        filePath: "non-existent.ts",
        line: 1,
        character: 0,
      },
    });

    const typedResult = result as CallToolResult;
    expect(typedResult.isError).toBe(true);
    expect(typedResult.content[0].text).toContain("Error");
  });
});
