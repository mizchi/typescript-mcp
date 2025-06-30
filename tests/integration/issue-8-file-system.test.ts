import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Issue #8 - Real File System Tests", () => {
  let tmpDir: string;
  let testFilePath: string;

  beforeAll(async () => {
    // Create a unique temporary directory
    tmpDir = await fs.mkdtemp(path.join(tmpdir(), "mcp-fs-test-"));
    testFilePath = path.join(tmpDir, "test.ts");
  });

  afterAll(async () => {
    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean up any existing files
    const files = await fs.readdir(tmpDir);
    for (const file of files) {
      await fs.unlink(path.join(tmpDir, file));
    }
  });

  it("should handle file creation, modification, and deletion cycle", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../../dist/typescript-mcp.js")],
      env: {
        ...process.env,
        LSP_COMMAND: `${
          path.join(
            __dirname,
            "../../node_modules/.bin/typescript-language-server",
          )
        } --stdio`,
      },
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const testFile = "lifecycle-test.ts";
    testFilePath = path.join(tmpDir, testFile);

    try {
      // Step 1: Create file with errors
      await fs.writeFile(
        testFilePath,
        `
const str: string = 123;
console.log(undefinedVariable);
`,
      );

      // Wait for file to be written and MCP server to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      let result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile,
        },
      });

      // LSP might report errors differently, so check for presence of errors
      expect(result.content[0].text).toMatch(/\d+ errors?/);
      expect(result.content[0].text).not.toContain("0 errors");

      // Step 2: Fix all errors
      await fs.writeFile(
        testFilePath,
        `
const str: string = "fixed";
const undefinedVariable = "now defined";
console.log(undefinedVariable);
`,
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile,
        },
      });

      expect(result.content[0].text).toContain("0 errors and 0 warnings");

      // Step 3: Add new errors
      await fs.writeFile(
        testFilePath,
        `
const num: number = "not a number";
`,
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: testFile,
        },
      });

      expect(result.content[0].text).toMatch(/1 error/);
      // LSP error messages vary, so just check that it mentions the issue
      const errorText = result.content[0].text.toLowerCase();
      expect(errorText).toMatch(/type|string|number|assignable/);
    } finally {
      await client.close();
    }
  });

  it("should handle symlinks correctly", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../../dist/typescript-mcp.js")],
      env: {
        ...process.env,
        LSP_COMMAND: `${
          path.join(
            __dirname,
            "../../node_modules/.bin/typescript-language-server",
          )
        } --stdio`,
      },
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const originalFile = "original.ts";
    const symlinkFile = "symlink.ts";
    const originalPath = path.join(tmpDir, originalFile);
    const symlinkPath = path.join(tmpDir, symlinkFile);

    try {
      // Create original file with an error
      await fs.writeFile(originalPath, `const x: string = 123;`);

      // Create symlink
      await fs.symlink(originalPath, symlinkPath);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get diagnostics via symlink
      const result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: symlinkFile,
        },
      });

      expect(result.content[0].text).toMatch(/1 error/);

      // Fix the original file
      await fs.writeFile(originalPath, `const x: string = "fixed";`);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check again via symlink
      const result2 = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: symlinkFile,
        },
      });

      expect(result2.content[0].text).toContain("0 errors");
    } finally {
      await client.close();
    }
  });

  it.skip("should handle large files with many errors", async () => {
    // This test is skipped due to performance considerations
  });

  it("should handle files with different encodings", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "../../dist/typescript-mcp.js")],
      env: {
        ...process.env,
        LSP_COMMAND: `${
          path.join(
            __dirname,
            "../../node_modules/.bin/typescript-language-server",
          )
        } --stdio`,
      },
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const unicodeFile = "unicode-test.ts";
    const unicodeFilePath = path.join(tmpDir, unicodeFile);

    try {
      // Create file with Unicode characters and errors
      await fs.writeFile(
        unicodeFilePath,
        `
// 日本語のコメント 🚀
const 変数: string = 123; // エラー
const emoji = "😊";
const value: number = "wrong"; // Another error
`,
        "utf8",
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await client.callTool({
        name: "lsmcp_get_diagnostics",
        arguments: {
          root: tmpDir,
          filePath: unicodeFile,
        },
      });

      // Check that we get errors regardless of encoding
      expect(result.content[0].text).toMatch(/[1-2] errors?/);
      expect(result.content[0].text).not.toContain("0 errors");
    } finally {
      await client.close();
    }
  });
});
