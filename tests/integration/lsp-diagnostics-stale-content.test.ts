import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe.skip("LSP Diagnostics - Stale Content Issue #8", () => {
  let tmpDir: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Create temporary directory for test files
    tmpDir = await fs.mkdtemp(path.join(tmpdir(), "lsp-diagnostics-test-"));

    // Start MCP server with LSP support
    const lspCommand = path.join(
      __dirname,
      "../../node_modules/.bin/typescript-language-server",
    );
    transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../../dist/typescript-mcp.js")],
      env: { ...process.env, LSP_COMMAND: `${lspCommand} --stdio` },
    });

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    // Clean up
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should detect errors in newly created file", async () => {
    const testFile = "new-file-with-errors.ts";
    const filePath = path.join(tmpDir, testFile);

    // Create file with errors
    await fs.writeFile(
      filePath,
      `
const x: string = 123; // Type error
console.log(undefinedVar); // Undefined variable
function foo(): string {
  return 42; // Type error
}
`,
    );

    // Wait for file to be written
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = await client.callTool({
      name: "lsmcp_get_diagnostics",
      arguments: {
        root: tmpDir,
        filePath: testFile,
      },
    });

    const text = result.content[0].text;
    expect(text).toContain("3 errors");
    expect(text).toContain("Type 'number' is not assignable to type 'string'");
    expect(text).toContain("Cannot find name 'undefinedVar'");
  });

  it("should update diagnostics when file is modified", async () => {
    const testFile = "file-to-modify.ts";
    const filePath = path.join(tmpDir, testFile);

    // Create file with errors
    await fs.writeFile(filePath, `const x: string = 123;`);

    // Wait for file to be written
    await new Promise((resolve) => setTimeout(resolve, 300));

    // First check - should have error
    let result = await client.callTool({
      name: "lsmcp_get_diagnostics",
      arguments: {
        root: tmpDir,
        filePath: testFile,
      },
    });

    expect(result.content[0].text).toContain("1 error");

    // Fix the file
    await fs.writeFile(filePath, `const x: string = "fixed";`);

    // Wait a bit for file system
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second check - should have no errors
    result = await client.callTool({
      name: "lsmcp_get_diagnostics",
      arguments: {
        root: tmpDir,
        filePath: testFile,
      },
    });

    expect(result.content[0].text).toContain("0 errors and 0 warnings");
  });

  it("should handle multiple rapid file changes", async () => {
    const testFile = "rapid-changes.ts";
    const filePath = path.join(tmpDir, testFile);

    const changes = [
      { content: `const x: string = 123;`, hasError: true },
      { content: `const x: string = "ok";`, hasError: false },
      { content: `const x: number = "wrong";`, hasError: true },
      { content: `const x: number = 456;`, hasError: false },
    ];

    for (const change of changes) {
      await fs.writeFile(filePath, change.content);

      const result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile,
        },
      });

      const text = result.content[0].text;
      if (change.hasError) {
        expect(text).toContain("1 error");
      } else {
        expect(text).toContain("0 errors");
      }
    }
  });

  it("should handle concurrent diagnostics for different files", async () => {
    const files = [
      { name: "concurrent1.ts", content: `const a: string = 123;` },
      { name: "concurrent2.ts", content: `const b: string = "ok";` },
      { name: "concurrent3.ts", content: `console.log(notDefined);` },
    ];

    // Create all files
    await Promise.all(
      files.map((file) =>
        fs.writeFile(path.join(tmpDir, file.name), file.content)
      ),
    );

    // Get diagnostics concurrently
    const results = await Promise.all(
      files.map((file) =>
        client.callTool({
          name: "lsmcp_get_diagnostics",
          arguments: {
            root: tmpDir,
            filePath: file.name,
          },
        })
      ),
    );

    // Check results
    expect(results[0].content[0].text).toContain("1 error"); // concurrent1.ts
    expect(results[1].content[0].text).toContain("0 errors"); // concurrent2.ts
    expect(results[2].content[0].text).toContain("1 error"); // concurrent3.ts
  });

  it("should work correctly with virtualContent override", async () => {
    const testFile = "virtual-content-test.ts";
    const filePath = path.join(tmpDir, testFile);

    // Create file with no errors
    await fs.writeFile(filePath, `const x: string = "hello";`);

    // But use virtualContent with errors
    const result = await client.callTool({
      name: "lsmcp_get_diagnostics",
      arguments: {
        root: tmpDir,
        filePath: testFile,
        virtualContent: `const x: string = 123; // Error in virtual content`,
      },
    });

    expect(result.content[0].text).toContain("1 error");
    expect(result.content[0].text).toContain(
      "Type 'number' is not assignable to type 'string'",
    );
  });

  it("should not cache results between different file extensions", async () => {
    const tsFile = "test.ts";
    const jsFile = "test.js";

    // Create TypeScript file with type error
    await fs.writeFile(path.join(tmpDir, tsFile), `const x: string = 123;`);

    // Create JavaScript file with no type checking
    await fs.writeFile(path.join(tmpDir, jsFile), `const x = 123;`);

    // Check TypeScript file - should have error
    const tsResult = await client.callTool({
      name: "lsmcp_get_diagnostics",
      arguments: {
        root: tmpDir,
        filePath: tsFile,
      },
    });

    expect(tsResult.content[0].text).toContain("1 error");

    // Check JavaScript file - should have no errors
    const jsResult = await client.callTool({
      name: "lsmcp_get_diagnostics",
      arguments: {
        root: tmpDir,
        filePath: jsFile,
      },
    });

    expect(jsResult.content[0].text).toContain("0 errors");
  });
});
