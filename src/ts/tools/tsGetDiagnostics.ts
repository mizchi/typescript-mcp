import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { getDiagnostics } from "../navigations/getDiagnostics.ts";
import {
  findProjectForFile,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
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

interface GetDiagnosticsResult {
  message: string;
}

async function handleGetDiagnostics({
  root,
  filePath,
  virtualContent,
}: z.infer<typeof schema>): Promise<GetDiagnosticsResult> {
  // Always treat paths as relative to root
  const absolutePath = path.join(root, filePath);

  // Check if file exists
  await fs.access(absolutePath);

  const project = findProjectForFile(absolutePath);

  // Ensure the source file is loaded in the project with fresh content
  const sourceFile = getOrCreateSourceFileWithRefresh(absolutePath);

  let originalContent: string | undefined;

  try {
    // If virtual content is provided, temporarily replace the file content
    if (virtualContent !== undefined) {
      originalContent = sourceFile.getFullText();
      sourceFile.replaceWithText(virtualContent);
    }

    // Get diagnostics
    const result = getDiagnostics(project, {
      filePaths: [absolutePath],
    });

    if (result.isErr()) {
      throw new Error(result.error);
    }

    return result.value;
  } finally {
    // Restore original content if it was replaced
    if (originalContent !== undefined) {
      sourceFile.replaceWithText(originalContent);
    }
  }
}

function formatGetDiagnosticsResult(
  result: GetDiagnosticsResult
): string {
  // Return ts-morph's formatted output directly
  return result.message;
}

export const getDiagnosticsTool: ToolDef<typeof schema> = {
  name: "ts_get_diagnostics",
  description:
    "Get TypeScript diagnostics (errors, warnings) for a single file",
  schema,
  execute: async (args) => {
    const result = await handleGetDiagnostics(args);
    return formatGetDiagnosticsResult(result);
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("get_diagnostics", () => {
    describe("formatGetDiagnosticsResult", () => {
      it("should format diagnostics with errors", () => {
        const result: GetDiagnosticsResult = {
          message: `src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.

10     const count: number = "hello";
       ~~~~~

src/index.ts:15:3 - error TS2304: Cannot find name 'unknownFunction'.

15   unknownFunction();
     ~~~~~~~~~~~~~~~`,
        };

        expect(formatGetDiagnosticsResult(result)).toMatchInlineSnapshot(`
          "src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.

          10     const count: number = "hello";
                 ~~~~~

          src/index.ts:15:3 - error TS2304: Cannot find name 'unknownFunction'.

          15   unknownFunction();
               ~~~~~~~~~~~~~~~"
        `);
      });

      it("should format diagnostics with warnings", () => {
        const result: GetDiagnosticsResult = {
          message: `src/utils.ts:5:7 - warning TS6133: 'unusedVar' is declared but its value is never read.

5       const unusedVar = 42;
        ~~~~~~~~~`,
        };

        expect(formatGetDiagnosticsResult(result)).toMatchInlineSnapshot(`
          "src/utils.ts:5:7 - warning TS6133: 'unusedVar' is declared but its value is never read.

          5       const unusedVar = 42;
                  ~~~~~~~~~"
        `);
      });

      it("should format no diagnostics", () => {
        const result: GetDiagnosticsResult = {
          message: "No diagnostics found in 1 file.",
        };

        expect(formatGetDiagnosticsResult(result)).toMatchInlineSnapshot(
          `"No diagnostics found in 1 file."`
        );
      });

      it("should format mixed diagnostics", () => {
        const result: GetDiagnosticsResult = {
          message: `src/app.ts:3:1 - error TS1128: Declaration or statement expected.

3 }
  ~

src/app.ts:7:10 - warning TS6133: 'name' is declared but its value is never read.

7 function greet(name: string) {
           ~~~~~

Found 1 error and 1 warning in 1 file.`,
        };

        expect(formatGetDiagnosticsResult(result)).toMatchInlineSnapshot(`
          "src/app.ts:3:1 - error TS1128: Declaration or statement expected.

          3 }
            ~

          src/app.ts:7:10 - warning TS6133: 'name' is declared but its value is never read.

          7 function greet(name: string) {
                     ~~~~~

          Found 1 error and 1 warning in 1 file."
        `);
      });
    });
  });
}
