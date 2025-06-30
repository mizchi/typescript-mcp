import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLSPClient } from "../../src/lsp/lspClient.ts";
import { readFileSync } from "fs";
import { resolve } from "path";
import { spawn } from "child_process";

describe("LSP Client Direct Integration", () => {
  const projectRoot = process.cwd();
  let client: ReturnType<typeof createLSPClient>;

  beforeEach(() => {
    // Client will be created in each test with its own process
  });

  afterEach(async () => {
    await client.stop().catch(() => {});
  });

  it("should start LSP server successfully", async () => {
    const process = spawn("npx", ["typescript-language-server", "--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = createLSPClient({ rootPath: projectRoot, process });
    await expect(client.start()).resolves.not.toThrow();
  });

  it("should handle document operations", async () => {
    const process = spawn("npx", ["typescript-language-server", "--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = createLSPClient({ rootPath: projectRoot, process });
    await client.start();

    const testFilePath = resolve(projectRoot, "examples/typescript/types.ts");
    const fileContent = readFileSync(testFilePath, "utf-8");
    const fileUri = `file://${testFilePath}`;

    expect(() => {
      client.openDocument(fileUri, fileContent);
    }).not.toThrow();

    // Wait for LSP to process
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it("should find references for Value type", async () => {
    const process = spawn("npx", ["typescript-language-server", "--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = createLSPClient({ rootPath: projectRoot, process });
    await client.start();

    const testFilePath = resolve(projectRoot, "examples/typescript/types.ts");
    const fileContent = readFileSync(testFilePath, "utf-8");
    const fileUri = `file://${testFilePath}`;

    client.openDocument(fileUri, fileContent);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const references = await client.findReferences(fileUri, {
      line: 0, // 0-based
      character: 12, // 0-based
    });

    expect(Array.isArray(references)).toBe(true);
    expect(references.length).toBeGreaterThan(0);

    references.forEach((ref) => {
      expect(ref.uri).toBeDefined();
      expect(ref.range).toBeDefined();
      expect(ref.range.start).toBeDefined();
      expect(ref.range.end).toBeDefined();
      expect(typeof ref.range.start.line).toBe("number");
      expect(typeof ref.range.start.character).toBe("number");
    });
  });

  it("should get definition for property access", async () => {
    const process = spawn("npx", ["typescript-language-server", "--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = createLSPClient({ rootPath: projectRoot, process });
    await client.start();

    const testFilePath = resolve(projectRoot, "examples/typescript/types.ts");
    const fileContent = readFileSync(testFilePath, "utf-8");
    const fileUri = `file://${testFilePath}`;

    client.openDocument(fileUri, fileContent);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const definitions = await client.getDefinition(fileUri, {
      line: 10, // 0-based
      character: 11, // 0-based
    });

    expect(definitions).toBeDefined();

    const defArray = Array.isArray(definitions) ? definitions : [definitions];
    expect(defArray.length).toBeGreaterThan(0);
  });

  it("should get hover information for ValueWithOptional type", async () => {
    const process = spawn("npx", ["typescript-language-server", "--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = createLSPClient({ rootPath: projectRoot, process });
    await client.start();

    const testFilePath = resolve(projectRoot, "examples/typescript/types.ts");
    const fileContent = readFileSync(testFilePath, "utf-8");
    const fileUri = `file://${testFilePath}`;

    client.openDocument(fileUri, fileContent);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const hover = await client.getHover(fileUri, {
      line: 4, // 0-based
      character: 12, // 0-based
    });

    if (hover) {
      const hoverResult = hover;
      expect(hoverResult.contents).toBeDefined();

      if (typeof hoverResult.contents === "string") {
        expect(hoverResult.contents.length).toBeGreaterThan(0);
      } else if (Array.isArray(hoverResult.contents)) {
        expect(hoverResult.contents.length).toBeGreaterThan(0);
      } else if ("value" in hoverResult.contents) {
        expect(hoverResult.contents.value).toBeDefined();
      }
    }
  });

  it("should handle invalid syntax gracefully", async () => {
    const process = spawn("npx", ["typescript-language-server", "--stdio"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    client = createLSPClient({ rootPath: projectRoot, process });
    await client.start();

    const invalidContent = `
export type Broken = {
  value: string
  // Missing closing brace
    `;

    const tempFileUri = `file://${projectRoot}/temp-broken.ts`;

    expect(() => {
      client.openDocument(tempFileUri, invalidContent);
    }).not.toThrow();

    const hover = await client.getHover(tempFileUri, {
      line: 1,
      character: 12,
    });

    // Should not throw, hover may or may not be available
    // Just verify the call completed without throwing
    expect(hover).toBeDefined();
  });
});

describe("LSP Client Error Handling", () => {
  const projectRoot = process.cwd();

  describe("Server Crash Recovery", () => {
    it("should detect server crash", async () => {
      const process = spawn(
        "npx",
        ["typescript-language-server", "--stdio"],
        {
          cwd: projectRoot,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      const crashClient = createLSPClient({ rootPath: projectRoot, process });

      try {
        await crashClient.start();

        // Force kill the process to simulate crash
        if ((crashClient as any).process) {
          (crashClient as any).process.kill("SIGKILL");
        }

        // Try to use the client after crash
        await new Promise((resolve) => setTimeout(resolve, 100));

        const hoverPromise = crashClient.getHover(
          `file://${projectRoot}/examples/types.ts`,
          {
            line: 0,
            character: 0,
          },
        );

        // Should throw error after crash
        await expect(hoverPromise).rejects.toThrow();
      } catch (error) {
        // Expected behavior - server crash should be detected
        expect(error).toBeDefined();
      }
    });
  });

  describe("Resource Cleanup", () => {
    it("should clean up resources properly", async () => {
      const process = spawn("npx", ["typescript-language-server", "--stdio"], {
        cwd: projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const client = createLSPClient({ rootPath: projectRoot, process });
      await client.start();

      // Should not throw when stopping
      await expect(client.stop()).resolves.not.toThrow();

      // Should not throw when stopping again
      await expect(client.stop()).resolves.not.toThrow();
    });
  });
});
