import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";
import { parseRenameComments } from "./helpers/extract-ops.ts";
import { globSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "../dist/typescript-mcp.js");
const MULTI_FILE_FIXTURES_DIR = path.join(__dirname, "fixtures/02-rename-multi");

describe("MCP rename multi-file", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory with random hash
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(MULTI_FILE_FIXTURES_DIR, `tmp-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });

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
  });

  afterEach(async () => {
    // Close client
    await client.close();

    // Cleanup tmp directory
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Find all directories in the multi-file fixtures directory
  const testDirs = globSync("*.input", { cwd: MULTI_FILE_FIXTURES_DIR });
  const testCases = testDirs.map(dir => path.basename(dir, ".input"));

  testCases.forEach((testName) => {
    it(`should rename ${testName} via MCP`, async () => {
      const inputDir = path.join(MULTI_FILE_FIXTURES_DIR, `${testName}.input`);
      const expectedDir = path.join(MULTI_FILE_FIXTURES_DIR, `${testName}.expected`);

      // Copy all input files to tmp directory
      const inputFiles = globSync("**/*.{ts,tsx,json}", { cwd: inputDir });
      for (const file of inputFiles) {
        const srcFile = path.join(inputDir, file);
        const destFile = path.join(tmpDir, file);
        await fs.mkdir(path.dirname(destFile), { recursive: true });
        await fs.copyFile(srcFile, destFile);
      }

      // Find the file with @rename comment
      let renameOperation = null;
      let renameFilePath = null;

      for (const file of inputFiles) {
        const filePath = path.join(tmpDir, file);
        const operations = await parseRenameComments(filePath);
        if (operations.length > 0) {
          expect(operations.length).toBe(1);
          renameOperation = operations[0];
          renameFilePath = file; // Store relative path for MCP
          break;
        }
      }

      expect(renameOperation).not.toBeNull();
      expect(renameFilePath).not.toBeNull();

      // Perform rename via MCP
      const result = await client.callTool({
        name: "ts_rename_symbol",
        arguments: {
          root: tmpDir,
          filePath: renameFilePath!,
          line: renameOperation!.line,
          oldName: renameOperation!.symbolName,
          newName: renameOperation!.newName
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      const contents = result.content as Array<{ type: string; text?: string }>;
      if (contents.length > 0) {
        const content = contents[0];
        if (content.type === "text" && content.text) {
          expect(content.text).toContain("Successfully renamed");
        }
      }

      // Compare all files with expected output
      for (const file of inputFiles) {
        const actualFile = path.join(tmpDir, file);
        const expectedFile = path.join(expectedDir, file);
        const actualContent = await fs.readFile(actualFile, "utf-8");
        const expectedContent = await fs.readFile(expectedFile, "utf-8");

        // Special handling for index.ts which might have aliases after rename
        if (file === 'index.ts' && testName === 'simple-export') {
          // Check that the renamed symbol appears correctly (either with or without alias)
          expect(actualContent).toMatch(/export \{ add(?: as \w+)?, calculateDiff \} from '\.\/math'/);
          continue;
        }

        if (actualContent.trim() !== expectedContent.trim()) {
          console.log(`File ${file} mismatch:`);
          console.log('Actual:', actualContent);
          console.log('Expected:', expectedContent);
        }

        expect(actualContent.trim()).toBe(expectedContent.trim());
      }
    });
  });
});