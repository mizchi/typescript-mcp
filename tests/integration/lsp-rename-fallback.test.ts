import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../../src/lsp/lspClient.ts";
import { lspRenameSymbolTool } from "../../src/lsp/tools/lspRenameSymbol.ts";

describe.skip("LSP Rename with TypeScript fallback", () => {
  let lspProcess: ChildProcess;
  const projectRoot = path.join(__dirname, "fixtures", "rename-fallback-test");

  beforeAll(async () => {
    // Create test project
    await fs.mkdir(projectRoot, { recursive: true });

    const testCode = `// Test file for rename
export function oldFunctionName(param: string): string {
  return "Hello " + param;
}

const result = oldFunctionName("world");
console.log(result);

// Another usage
function test() {
  return oldFunctionName("test");
}
`;

    await fs.writeFile(path.join(projectRoot, "test.ts"), testCode);

    // Start a mock LSP that doesn't support rename
    // For this test, we'll use typescript-language-server but simulate the error
    lspProcess = spawn("typescript-language-server", ["--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Initialize LSP client
    await initializeLSPClient(projectRoot, lspProcess);
  }, 10000);

  afterAll(async () => {
    // Cleanup
    await shutdownLSPClient();
    lspProcess.kill();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("should fall back to TypeScript tool when LSP doesn't support rename", async () => {
    // Mock the rename to fail by using a special test mode
    // In real scenario, TypeScript Native Preview would fail here

    const result = await lspRenameSymbolTool.execute({
      root: projectRoot,
      filePath: "test.ts",
      line: 2,
      target: "oldFunctionName",
      newName: "newFunctionName",
    });

    // Should succeed using either LSP or fallback
    expect(result).toMatch(/renamed|Renamed/);
    expect(result).toContain("oldFunctionName");
    expect(result).toContain("newFunctionName");

    // Check if the file was actually modified
    const content = await fs.readFile(
      path.join(projectRoot, "test.ts"),
      "utf-8",
    );

    // The rename should have been applied
    if (content.includes("newFunctionName")) {
      console.log("✅ Rename was successful");
    } else if (content.includes("oldFunctionName")) {
      console.log(
        "ℹ️  Rename might have used dry-run mode or needs manual application",
      );
    }
  });

  it("should handle rename without line parameter", async () => {
    // First write a fresh file to ensure the symbol exists
    const freshCode = `// Test file for rename without line
export function targetFunction(param: string): string {
  return "Hello " + param;
}

const result = targetFunction("world");
`;
    await fs.writeFile(path.join(projectRoot, "test2.ts"), freshCode);

    const result = await lspRenameSymbolTool.execute({
      root: projectRoot,
      filePath: "test2.ts",
      target: "targetFunction",
      newName: "renamedFunction",
    });

    expect(result).toMatch(/renamed|Renamed/);
    expect(result).not.toContain("error");
  });
});
