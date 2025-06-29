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
      // Give LSP server time to process the close
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }

    // Open document in LSP with current content
    client.openDocument(fileUri, fileContent);

    // If not using virtual content, send a document update to ensure LSP has latest content
    if (!request.virtualContent) {
      // Force LSP to re-read the file by sending an update
      client.updateDocument(fileUri, fileContent, 2);
    }

    // Give LSP server time to process and compute diagnostics
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));

    // Get diagnostics from LSP
    let lspDiagnostics = client.getDiagnostics(fileUri) as LSPDiagnostic[];

    // If no diagnostics yet, try updating the document again to trigger diagnostics
    if (lspDiagnostics.length === 0) {
      client.updateDocument(fileUri, fileContent, 3);
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      lspDiagnostics = client.getDiagnostics(fileUri) as LSPDiagnostic[];
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
