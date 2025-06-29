import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { type Result, ok, err } from "neverthrow";
import { renameSymbol } from "../commands/renameSymbol.ts";
import {
  getOrCreateProject,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
import { resolveLineParameterForSourceFile as resolveLineParameter } from "../../textUtils/resolveLineParameterForSourceFile.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { symbolLocationSchema } from "../../common/schemas.ts";

const schema = symbolLocationSchema.extend({
  oldName: z.string().describe("Current name of the symbol"),
  newName: z.string().describe("New name for the symbol"),
}).omit({ symbolName: true });

export interface RenameSymbolResult {
  message: string;
  changedFiles: {
    filePath: string;
    changes: {
      line: number;
      oldText: string;
      newText: string;
    }[];
  }[];
}

async function handleRenameSymbol({
  root,
  filePath,
  line,
  oldName,
  newName,
}: z.infer<typeof schema>): Promise<Result<RenameSymbolResult, string>> {
  // Always treat paths as relative to root
  const absolutePath = path.join(root, filePath);

  // Get or create project based on the file path
  const project = await getOrCreateProject(absolutePath);

  // Ensure the source file is loaded in the project with fresh content
  const sourceFile = getOrCreateSourceFileWithRefresh(absolutePath);

  // Resolve line parameter
  const resolvedLine = resolveLineParameter(sourceFile, line);

  // Perform the rename
  const result = await renameSymbol(project, {
    filePath: absolutePath,
    line: resolvedLine,
    symbolName: oldName,
    newName,
    renameInStrings: true,
    renameInComments: false,
  });

  if (result.isErr()) {
    return err(result.error);
  }

  // Save all changes
  await project.save();

  return ok(result.value);
}

async function formatFileChanges(
  file: RenameSymbolResult["changedFiles"][0],
  root: string
): Promise<Result<string[], string>> {
  const relativePath = path.relative(root, file.filePath);
  const output = [`  ${relativePath}:`];

  // Try to read the file content
  const contentResult = await fs
    .readFile(file.filePath, "utf-8")
    .then((content) => ok(content))
    .catch((error: unknown) =>
      err(error instanceof Error ? error.message : String(error))
    );

  if (contentResult.isErr()) {
    // Fallback to simple format if file reading fails
    const fallbackLines = file.changes.map(
      (change) =>
        `    Line ${String(change.line)}: "${change.oldText}" → "${
          change.newText
        }"`
    );
    output.push(...fallbackLines);
    return ok(output);
  }

  const lines = contentResult.value.split("\n");

  // Group changes by line to handle multiple changes on the same line
  const changesByLine = Object.groupBy(file.changes, (change) => change.line);

  // Process each line with changes
  const formattedChanges = Object.entries(changesByLine).flatMap(
    ([lineNumStr, lineChanges]) => {
      if (!lineChanges) return [];

      const lineNum = Number(lineNumStr);
      const lineIndex = lineNum - 1; // Convert to 0-based
      if (lineIndex < 0 || lineIndex >= lines.length) return [];

      const oldLine = lines[lineIndex];
      
      // Simply replace old text with new text in the line
      // Note: This assumes only one change per line in current implementation
      const newLine = lineChanges.reduce((line, change) => {
        return line.replace(change.oldText, change.newText);
      }, oldLine);

      return [
        `    @@ -${String(lineNum)},1 +${String(lineNum)},1 @@`,
        `    - ${oldLine}`,
        `    + ${newLine}`,
      ];
    }
  );

  output.push(...formattedChanges);
  return ok(output);
}

async function formatRenameSymbolResult(
  result: RenameSymbolResult,
  root: string
): Promise<Result<string, string>> {
  const { message, changedFiles } = result;
  const totalChanges = changedFiles.reduce(
    (sum, file) => sum + file.changes.length,
    0
  );

  const output = [
    `${message} in ${String(changedFiles.length)} file(s) with ${String(
      totalChanges
    )} change(s).`,
    "",
    "Changes:",
  ];

  // Process all files and collect their formatted changes
  const fileResults = await Promise.all(
    changedFiles.map((file) => formatFileChanges(file, root))
  );

  // Check if any file processing failed
  for (const fileResult of fileResults) {
    if (fileResult.isErr()) {
      return err(fileResult.error);
    }
    output.push(...fileResult.value);
  }

  return ok(output.join("\n"));
}

export const renameSymbolTool: ToolDef<typeof schema> = {
  name: "ts_rename_symbol",
  description:
    "Rename a TypeScript symbol (variable, function, class, etc.) across the codebase",
  schema,
  execute: async (args) => {
    const result = await handleRenameSymbol(args);
    if (result.isErr()) {
      throw new Error(result.error);
    }

    const formattedResult = await formatRenameSymbolResult(
      result.value,
      args.root
    );
    if (formattedResult.isErr()) {
      throw new Error(formattedResult.error);
    }

    return formattedResult.value;
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("rename_symbol", () => {
    describe("formatRenameSymbolResult", () => {
      it("should format rename with no files changed", async () => {
        const result: RenameSymbolResult = {
          message: "Renamed 'oldName' to 'newName'",
          changedFiles: [],
        };

        const formatted = await formatRenameSymbolResult(result, "/project");
        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Renamed 'oldName' to 'newName' in 0 file(s) with 0 change(s)."
          );
          expect(formatted.value).toMatch("Changes:");
        }
      });

      it("should format rename with single file changed", async () => {
        const result: RenameSymbolResult = {
          message: "Renamed 'getUserId' to 'getUserID'",
          changedFiles: [
            {
              filePath: "/project/src/user.ts",
              changes: [
                {
                  line: 10,
                  oldText: "getUserId",
                  newText: "getUserID",
                },
              ],
            },
          ],
        };

        const formatted = await formatRenameSymbolResult(result, "/project");
        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Renamed 'getUserId' to 'getUserID' in 1 file(s) with 1 change(s)."
          );
          expect(formatted.value).toMatch("src/user.ts:");
          // Since we can't read the actual file in tests, it will fall back to simple format
          expect(formatted.value).toMatch('Line 10: "getUserId" → "getUserID"');
        }
      });

      it("should format rename with multiple files and changes", async () => {
        const result: RenameSymbolResult = {
          message: "Renamed 'Component' to 'BaseComponent'",
          changedFiles: [
            {
              filePath: "/project/src/components/Button.tsx",
              changes: [
                {
                  line: 5,
                  oldText: "Component",
                  newText: "BaseComponent",
                },
                {
                  line: 15,
                  oldText: "Component",
                  newText: "BaseComponent",
                },
              ],
            },
            {
              filePath: "/project/src/components/Form.tsx",
              changes: [
                {
                  line: 3,
                  oldText: "Component",
                  newText: "BaseComponent",
                },
              ],
            },
            {
              filePath: "/project/src/index.ts",
              changes: [
                {
                  line: 1,
                  oldText: "Component",
                  newText: "BaseComponent",
                },
              ],
            },
          ],
        };

        const formatted = await formatRenameSymbolResult(result, "/project");
        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Renamed 'Component' to 'BaseComponent' in 3 file(s) with 4 change(s)."
          );
          expect(formatted.value).toMatch("src/components/Button.tsx:");
          expect(formatted.value).toMatch("src/components/Form.tsx:");
          expect(formatted.value).toMatch("src/index.ts:");
        }
      });

      it("should format class rename with many changes", async () => {
        const result: RenameSymbolResult = {
          message: "Renamed class 'User' to 'UserModel'",
          changedFiles: [
            {
              filePath: "/project/src/models/user.ts",
              changes: [
                {
                  line: 5,
                  oldText: "User",
                  newText: "UserModel",
                },
              ],
            },
            {
              filePath: "/project/src/services/auth.ts",
              changes: [
                {
                  line: 8,
                  oldText: "User",
                  newText: "UserModel",
                },
                {
                  line: 15,
                  oldText: "User",
                  newText: "UserModel",
                },
                {
                  line: 20,
                  oldText: "User",
                  newText: "UserModel",
                },
              ],
            },
            {
              filePath: "/project/src/api/user.api.ts",
              changes: [
                {
                  line: 3,
                  oldText: "User",
                  newText: "UserModel",
                },
                {
                  line: 10,
                  oldText: "User",
                  newText: "UserModel",
                },
              ],
            },
          ],
        };

        const formatted = await formatRenameSymbolResult(result, "/project");
        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Renamed class 'User' to 'UserModel' in 3 file(s) with 6 change(s)."
          );
          expect(formatted.value).toMatch("src/models/user.ts:");
          expect(formatted.value).toMatch("src/services/auth.ts:");
          expect(formatted.value).toMatch("src/api/user.api.ts:");
        }
      });

      it("should handle empty changes array", async () => {
        const result: RenameSymbolResult = {
          message: "Renamed 'unusedSymbol' to 'newUnusedSymbol'",
          changedFiles: [
            {
              filePath: "/project/src/unused.ts",
              changes: [],
            },
          ],
        };

        const formatted = await formatRenameSymbolResult(result, "/project");
        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Renamed 'unusedSymbol' to 'newUnusedSymbol' in 1 file(s) with 0 change(s)."
          );
          expect(formatted.value).toMatch("src/unused.ts:");
        }
      });
    });
  });
}
