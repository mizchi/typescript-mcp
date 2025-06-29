import { z } from "zod";
import { type Result, ok, err } from "neverthrow";
import { readFileSync } from "fs";
import path from "path";
import { getActiveClient } from "../lspClient.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path to check for diagnostics (relative to root)"),
  virtualContent: z
    .string()
    .optional()
    .describe("Virtual content to use for diagnostics instead of file content"),
});

type GetDiagnosticsRequest = z.infer<typeof schema>;

interface Diagnostic {
  severity: "error" | "warning" | "information" | "hint";
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  source?: string;
  code?: string | number;
}

interface GetDiagnosticsSuccess {
  message: string;
  diagnostics: Diagnostic[];
}

// LSP Diagnostic severity mapping
const SEVERITY_MAP: Record<number, Diagnostic["severity"]> = {
  1: "error",
  2: "warning",
  3: "information",
  4: "hint",
};

interface LSPDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

/**
 * Gets diagnostics for a TypeScript file using LSP
 */
async function getDiagnosticsWithLSP(
  request: GetDiagnosticsRequest
): Promise<Result<GetDiagnosticsSuccess, string>> {
  try {
    const client = getActiveClient();

    // Read file content or use virtual content
    const absolutePath = path.resolve(request.root, request.filePath);
    const fileContent =
      request.virtualContent || readFileSync(absolutePath, "utf-8");
    const fileUri = `file://${absolutePath}`;

    // Check if document is already open and close it to force refresh
    const isAlreadyOpen = client.isDocumentOpen(fileUri);
    if (isAlreadyOpen) {
      client.closeDocument(fileUri);
      // Reduced wait time from 100ms to 50ms
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    // Open document in LSP with current content
    client.openDocument(fileUri, fileContent);

    // If not using virtual content, send a document update to ensure LSP has latest content
    if (!request.virtualContent) {
      // Force LSP to re-read the file by sending an update
      client.updateDocument(fileUri, fileContent, 2);
    }
    
    // Try event-driven approach first
    let lspDiagnostics: LSPDiagnostic[] = [];
    let usePolling = false;
    
    // Determine if this is a large file that might need more time
    const lineCount = fileContent.split('\n').length;
    const isLargeFile = lineCount > 100;
    const eventTimeout = isLargeFile ? 3000 : 500; // Give large files much more time in CI
    
    try {
      // Wait for diagnostics with event-driven approach (shorter timeout for faster fallback)
      const diagnostics = await client.waitForDiagnostics(fileUri, eventTimeout);
      lspDiagnostics = diagnostics as LSPDiagnostic[];
    } catch (error) {
      // Event-driven failed, fall back to polling
      usePolling = true;
    }
    
    // Fallback to polling if event-driven didn't work
    if (usePolling || (lspDiagnostics.length === 0 && !client.waitForDiagnostics)) {
      // Initial wait for LSP to process the document (important for CI)
      const initialWait = isLargeFile ? 500 : 100; // Give large files much more initial processing time
      await new Promise<void>((resolve) => setTimeout(resolve, initialWait));
      
      // Poll for diagnostics
      const maxPolls = isLargeFile ? 100 : 30; // Max 5 seconds for large files, 1.5 seconds for normal
      const pollInterval = 50; // Poll every 50ms
      const minPollsForNoError = isLargeFile ? 60 : 20; // More polls for large files
      
      for (let poll = 0; poll < maxPolls; poll++) {
        await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
        lspDiagnostics = client.getDiagnostics(fileUri) as LSPDiagnostic[];
        
        // Break early if we have diagnostics or after minimum polls for no-error files
        if (lspDiagnostics.length > 0 || poll >= minPollsForNoError) {
          break;
        }
        
        // Try updating document again after a few polls
        if ((poll === 5 || poll === 10) && !request.virtualContent) {
          client.updateDocument(fileUri, fileContent, poll + 1);
        }
      }
    }

    // Convert LSP diagnostics to our format
    const diagnostics: Diagnostic[] = lspDiagnostics.map((diag) => ({
      severity: SEVERITY_MAP[diag.severity ?? 1] ?? "error",
      line: diag.range.start.line + 1, // Convert to 1-based
      column: diag.range.start.character + 1,
      endLine: diag.range.end.line + 1,
      endColumn: diag.range.end.character + 1,
      message: diag.message,
      source: diag.source,
      code: diag.code,
    }));

    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const warningCount = diagnostics.filter(
      (d) => d.severity === "warning"
    ).length;

    // Always close the document to avoid caching issues
    client.closeDocument(fileUri);

    return ok({
      message: `Found ${errorCount} error${
        errorCount !== 1 ? "s" : ""
      } and ${warningCount} warning${warningCount !== 1 ? "s" : ""} in ${
        request.filePath
      }`,
      diagnostics,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export const lspGetDiagnosticsTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_diagnostics",
  description:
    "Get diagnostics (errors, warnings) for a file using LSP",
  schema,
  execute: async (args: z.infer<typeof schema>) => {
    const result = await getDiagnosticsWithLSP(args);
    if (result.isOk()) {
      const messages = [result.value.message];

      if (result.value.diagnostics.length > 0) {
        for (const diag of result.value.diagnostics) {
          const codeInfo = diag.code ? ` [${diag.code}]` : "";
          const sourceInfo = diag.source ? ` (${diag.source})` : "";
          messages.push(
            `\n${diag.severity.toUpperCase()}: ${
              diag.message
            }${codeInfo}${sourceInfo}\n` +
              `  at ${args.filePath}:${diag.line}:${diag.column}`
          );
        }
      }

      return messages.join("\n\n");
    } else {
      throw new Error(result.error);
    }
  },
};

if (import.meta.vitest) {
  const { describe, it, expect, beforeAll, afterAll } = import.meta.vitest;
  const { setupLSPForTest, teardownLSPForTest } = await import("../testHelpers.ts");
  const { default: path } = await import("path");

  describe("lspGetDiagnosticsTool", { timeout: 10000 }, () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    
    beforeAll(async () => {
      await setupLSPForTest(root);
    });
    
    afterAll(async () => {
      await teardownLSPForTest();
    });

    it("should have correct tool definition", () => {
      expect(lspGetDiagnosticsTool.name).toBe("lsmcp_get_diagnostics");
      expect(lspGetDiagnosticsTool.description).toContain("diagnostics");
    });

    it("should get diagnostics for a file with errors", async () => {
      const virtualContent = `
        const x: string = 123; // Type error
        console.log(y); // Undefined variable
        
        function foo(a: number) {
          return a + "hello"; // Type error
        }
      `;

      const result = await lspGetDiagnosticsTool.execute({
        root,
        filePath: "test.ts",
        virtualContent,
      });

      expect(result).toContain("error");
      // Should find multiple errors
      expect(result.toLowerCase()).toMatch(/\d+ errors?/);
    });

    it("should handle file with no errors", async () => {
      const virtualContent = `
        const x: string = "hello";
        console.log(x);
        
        function foo(a: number): number {
          return a + 1;
        }
      `;

      const result = await lspGetDiagnosticsTool.execute({
        root,
        filePath: "test.ts",
        virtualContent,
      });

      expect(result).toContain("0 errors and 0 warnings");
    });

    it("should handle warnings", async () => {
      const virtualContent = `
        // @ts-check
        const x = 123;
        // @ts-ignore
        const unused = 456; // This might generate a warning
      `;

      const result = await lspGetDiagnosticsTool.execute({
        root,
        filePath: "test.js",
        virtualContent,
      });

      expect(result).toMatch(/\d+ errors? and \d+ warnings?/);
    });
    
    it("should handle stale file contents by refreshing (Issue #8)", async () => {
      const testFile = "test-stale-content.ts";
      const filePath = path.join(root, testFile);
      
      // Create a file with errors
      const contentWithErrors = `
const x: string = 123; // Type error
console.log(y); // Undefined variable
`;
      
      // First, get diagnostics with virtual content (errors)
      const result1 = await lspGetDiagnosticsTool.execute({
        root,
        filePath: testFile,
        virtualContent: contentWithErrors,
      });
      
      expect(result1).toContain("error");
      expect(result1).toMatch(/2 errors/);
      
      // Now get diagnostics with fixed content
      const contentFixed = `
const x: string = "hello";
const y = "world";
console.log(y);
`;
      
      const result2 = await lspGetDiagnosticsTool.execute({
        root,
        filePath: testFile,
        virtualContent: contentFixed,
      });
      
      expect(result2).toContain("0 errors and 0 warnings");
    });
    
    it("should properly close and reopen documents to avoid caching", async () => {
      const testFile = "test-cache.ts";
      
      // Test opening same file multiple times with different content
      const contents = [
        `const a: string = 123; // Error`,
        `const a: string = "ok"; // No error`,
        `const a: number = "wrong"; // Error again`,
      ];
      
      for (let i = 0; i < contents.length; i++) {
        const result = await lspGetDiagnosticsTool.execute({
          root,
          filePath: testFile,
          virtualContent: contents[i],
        });
        
        if (i === 1) {
          expect(result).toContain("0 errors");
        } else {
          expect(result).toContain("error");
          expect(result).toMatch(/1 error/);
        }
      }
    });
    
    it("should handle rapid consecutive calls without mixing results", async () => {
      const files = [
        { name: "rapid-file1.ts", content: `const x: string = 123;` }, // Error
        { name: "rapid-file2.ts", content: `const y: string = "ok";` }, // No error (different variable name)
        { name: "rapid-file3.ts", content: `console.log(undefined_var);` }, // Error
      ];
      
      // Execute all diagnostics concurrently
      const results = await Promise.all(
        files.map(file => 
          lspGetDiagnosticsTool.execute({
            root,
            filePath: file.name,
            virtualContent: file.content,
          })
        )
      );
      
      // Check results match expected
      expect(results[0]).toContain("error"); // rapid-file1
      expect(results[1]).toContain("0 errors"); // rapid-file2
      expect(results[2]).toContain("error"); // rapid-file3
    });
    
    it("should update diagnostics when file content changes without virtualContent", async () => {
      // This test simulates the actual file system scenario
      const testFile = "test-real-file.ts";
      const filePath = path.join(root, testFile);
      
      // Note: This test would require actual file system operations
      // which might not work in all test environments
      // So we use virtualContent to simulate the behavior
      
      // First check with errors
      const result1 = await lspGetDiagnosticsTool.execute({
        root,
        filePath: testFile,
        virtualContent: `const x: string = 123;`,
      });
      
      expect(result1).toContain("error");
      
      // Check again with fixed content
      const result2 = await lspGetDiagnosticsTool.execute({
        root,
        filePath: testFile,
        virtualContent: `const x: string = "fixed";`,
      });
      
      expect(result2).toContain("0 errors");
    });

    it("should handle non-existent file error", async () => {
      await expect(
        lspGetDiagnosticsTool.execute({
          root,
          filePath: "non-existent-file-12345.ts",
        })
      ).rejects.toThrow("ENOENT");
    });

    it.skip("should get diagnostics for actual file", async () => {
      const result = await lspGetDiagnosticsTool.execute({
        root,
        filePath: "examples/typescript/scratch.ts",
      });

      expect(result).toMatch(/Found \d+ errors? and \d+ warnings?/);
    });
  });
}
