import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { deleteSymbol } from "../commands/deleteSymbol.ts";
import {
  getOrCreateProject,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
import { resolveLineParameterForSourceFile as resolveLineParameter } from "../../textUtils/resolveLineParameterForSourceFile.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";

const schemaShape = {
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the symbol (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),
  symbolName: z.string().describe("Name of the symbol to delete"),
  removeReferences: z
    .boolean()
    .optional()
    .default(true)
    .describe("Also delete all references to the symbol"),
};

const schema = z.object(schemaShape);

interface DeleteSymbolResult {
  message: string;
  removedFromFiles: string[];
}

async function handleDeleteSymbol({
  root,
  filePath,
  line,
  symbolName,
  removeReferences = true,
}: z.infer<typeof schema>): Promise<DeleteSymbolResult> {
  // Always treat paths as relative to root
  const absolutePath = path.join(root, filePath);

  // Check if file exists
  await fs.access(absolutePath);

  const project = await getOrCreateProject(absolutePath);

  // Ensure the source file is loaded in the project with fresh content
  const sourceFile = getOrCreateSourceFileWithRefresh(absolutePath);

  // Resolve line parameter
  const resolvedLine = resolveLineParameter(sourceFile, line);

  // Perform the removal
  const result = await deleteSymbol(project, {
    filePath: absolutePath,
    line: resolvedLine,
    symbolName,
    removeReferences,
  });

  if (result.isErr()) {
    throw new Error(result.error);
  }

  // Save all changes
  await project.save();

  return result.value;
}

function formatDeleteSymbolResult(result: DeleteSymbolResult): string {
  const { message, removedFromFiles } = result;
  return `${message} from ${removedFromFiles.length} file(s).`;
}

export const deleteSymbolTool: ToolDef<typeof schema> = {
  name: "ts_delete_symbol",
  description:
    "Delete a TypeScript/JavaScript symbol (variable, function, class, etc.) and all its references",
  schema,
  execute: async (args) => {
    const result = await handleDeleteSymbol(args);
    return formatDeleteSymbolResult(result);
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("delete_symbol", () => {
    describe("formatDeleteSymbolResult", () => {
      it("should format single file deletion", () => {
        const result: DeleteSymbolResult = {
          message: "Removed symbol 'myFunction'",
          removedFromFiles: ["/path/to/file.ts"],
        };

        expect(formatDeleteSymbolResult(result)).toMatchInlineSnapshot(
          `"Removed symbol 'myFunction' from 1 file(s)."`
        );
      });

      it("should format multiple file deletion", () => {
        const result: DeleteSymbolResult = {
          message: "Removed symbol 'MyClass'",
          removedFromFiles: [
            "/path/to/file1.ts",
            "/path/to/file2.ts",
            "/path/to/file3.ts",
          ],
        };

        expect(formatDeleteSymbolResult(result)).toMatchInlineSnapshot(
          `"Removed symbol 'MyClass' from 3 file(s)."`
        );
      });

      it("should format zero file deletion", () => {
        const result: DeleteSymbolResult = {
          message: "Removed symbol 'unusedVar'",
          removedFromFiles: [],
        };

        expect(formatDeleteSymbolResult(result)).toMatchInlineSnapshot(
          `"Removed symbol 'unusedVar' from 0 file(s)."`
        );
      });
    });
  });
}
