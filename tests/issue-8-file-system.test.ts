import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Issue #8 - Real File System Tests", () => {
  let tmpDir: string;
  let testFilePath: string;

  beforeAll(async () => {
    // Create a temporary directory for test files
    tmpDir = await fs.mkdtemp(path.join(tmpdir(), "issue8-test-"));
  });

  afterAll(async () => {
    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Ensure clean state for each test
    const files = await fs.readdir(tmpDir);
    for (const file of files) {
      await fs.unlink(path.join(tmpDir, file));
    }
  });

  it("should handle file creation, modification, and deletion cycle", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../dist/typescript-mcp.js")],
      env: { 
        ...process.env, 
        LSP_COMMAND: `${path.join(__dirname, "../node_modules/.bin/typescript-language-server")} --stdio` 
      }
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    try {
      const testFile = "lifecycle-test.ts";
      testFilePath = path.join(tmpDir, testFile);

      // Step 1: Create file with errors
      await fs.writeFile(testFilePath, `
const str: string = 123;
console.log(undefinedVariable);
`);

      // Wait for file to be written and MCP server to be ready
      await new Promise(resolve => setTimeout(resolve, 500));

      let result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result.content[0].text).toContain("2 errors");

      // Step 2: Modify file to fix one error
      await fs.writeFile(testFilePath, `
const str: string = "fixed";
console.log(undefinedVariable);
`);

      // Small delay to ensure file system update
      await new Promise(resolve => setTimeout(resolve, 200));

      result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result.content[0].text).toContain("1 error");
      expect(result.content[0].text).toContain("undefinedVariable");

      // Step 3: Fix all errors
      await fs.writeFile(testFilePath, `
const str: string = "fixed";
const undefinedVariable = "now defined";
console.log(undefinedVariable);
`);

      await new Promise(resolve => setTimeout(resolve, 200));

      result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result.content[0].text).toContain("0 errors and 0 warnings");

      // Step 4: Add new errors
      await fs.writeFile(testFilePath, `
const num: number = "not a number";
`);

      await new Promise(resolve => setTimeout(resolve, 200));

      result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result.content[0].text).toContain("1 error");
      expect(result.content[0].text).toContain("Type 'string' is not assignable to type 'number'");

    } finally {
      await client.close();
    }
  });

  it("should handle symlinks correctly", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../dist/typescript-mcp.js")],
      env: { 
        ...process.env, 
        LSP_COMMAND: `${path.join(__dirname, "../node_modules/.bin/typescript-language-server")} --stdio` 
      }
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    try {
      const originalFile = "original.ts";
      const symlinkFile = "symlink.ts";
      const originalPath = path.join(tmpDir, originalFile);
      const symlinkPath = path.join(tmpDir, symlinkFile);

      // Create original file with error
      await fs.writeFile(originalPath, `const x: string = 123;`);

      // Create symlink
      await fs.symlink(originalPath, symlinkPath);

      // Check diagnostics via symlink
      const result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: symlinkFile
        }
      });

      expect(result.content[0].text).toContain("1 error");

      // Fix the original file
      await fs.writeFile(originalPath, `const x: string = "fixed";`);

      await new Promise(resolve => setTimeout(resolve, 200));

      // Check again via symlink
      const result2 = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: symlinkFile
        }
      });

      expect(result2.content[0].text).toContain("0 errors");

    } finally {
      await client.close();
    }
  });

  it("should handle large files with many errors", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../dist/typescript-mcp.js")],
      env: { 
        ...process.env, 
        LSP_COMMAND: `${path.join(__dirname, "../node_modules/.bin/typescript-language-server")} --stdio` 
      }
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    try {
      const testFile = "large-file.ts";
      const filePath = path.join(tmpDir, testFile);

      // Generate a large file with many errors
      const lines = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`const var${i}: string = ${i}; // Type error`);
        lines.push(`console.log(undefined_${i}); // Undefined variable`);
      }

      await fs.writeFile(filePath, lines.join('\n'));

      const result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      const text = result.content[0].text;
      expect(text).toContain("200 errors"); // 100 type errors + 100 undefined variables

      // Fix all errors
      const fixedLines = [];
      for (let i = 0; i < 100; i++) {
        fixedLines.push(`const var${i}: string = "${i}";`);
        fixedLines.push(`const undefined_${i} = "defined";`);
        fixedLines.push(`console.log(undefined_${i});`);
      }

      await fs.writeFile(filePath, fixedLines.join('\n'));

      await new Promise(resolve => setTimeout(resolve, 500)); // Longer delay for large file

      const result2 = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result2.content[0].text).toContain("0 errors and 0 warnings");

    } finally {
      await client.close();
    }
  });

  it("should handle files with different encodings", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../dist/typescript-mcp.js")],
      env: { 
        ...process.env, 
        LSP_COMMAND: `${path.join(__dirname, "../node_modules/.bin/typescript-language-server")} --stdio` 
      }
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    try {
      const testFile = "unicode-test.ts";
      const filePath = path.join(tmpDir, testFile);

      // Create file with unicode characters and errors
      await fs.writeFile(filePath, `
// 日本語コメント
const str: string = 123; // Type error
const emoji: string = "🎉";
console.log(undefinedVariable); // Undefined variable
`, 'utf8');

      const result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result.content[0].text).toContain("2 errors");

      // Fix the file
      await fs.writeFile(filePath, `
// 日本語コメント
const str: string = "123"; // Fixed
const emoji: string = "🎉";
const undefinedVariable = "now defined";
console.log(undefinedVariable);
`, 'utf8');

      await new Promise(resolve => setTimeout(resolve, 200));

      const result2 = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile
        }
      });

      expect(result2.content[0].text).toContain("0 errors");

    } finally {
      await client.close();
    }
  });
});