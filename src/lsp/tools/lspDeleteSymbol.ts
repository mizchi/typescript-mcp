import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import {
  Location,
  Position,
  Range,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver-types";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { getLSPClient } from "../lspClient.ts";
import { resolveLineParameter } from "../../textUtils/resolveLineParameter.ts";

const schemaShape = {
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the symbol (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),
  target: z.string().describe("Name of the symbol to delete"),
  removeReferences: z
    .boolean()
    .optional()
    .default(true)
    .describe("Also delete all references to the symbol"),
};

const schema = z.object(schemaShape);

interface DeleteSymbolResult {
  applied: boolean;
  deletedFromFiles: Set<string>;
  totalDeleted: number;
  failureReason?: string;
}

async function handleDeleteSymbol({
  root,
  filePath,
  line,
  target,
  removeReferences = true,
}: z.infer<typeof schema>): Promise<DeleteSymbolResult> {
  const client = getLSPClient();
  if (!client) {
    throw new Error("LSP client not initialized");
  }

  // Convert to absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);

  // Convert to file URI
  const fileUri = pathToFileURL(absolutePath).toString();

  // Read the file content
  const content = await fs.readFile(absolutePath, "utf-8");
  const lines = content.split("\n");

  // Open the document in LSP
  client.openDocument(fileUri, content);

  let locations: Location[] = [];

  try {
    // Resolve line parameter
    const resolveResult = resolveLineParameter(content, line);

    if (!resolveResult.success) {
      throw new Error(resolveResult.error);
    }

    const resolvedLine = resolveResult.lineIndex + 1; // Convert back to 1-based

    // Find the symbol position on the line
    const lineContent = lines[resolveResult.lineIndex];
    const symbolIndex = lineContent.indexOf(target);

    if (symbolIndex === -1) {
      throw new Error(
        `Symbol "${target}" not found on line ${resolvedLine}: "${lineContent.trim()}"`,
      );
    }

    // Create position for the symbol
    const position: Position = {
      line: resolveResult.lineIndex, // LSP uses 0-based line numbers
      character: symbolIndex,
    };

    // First, find all references if removeReferences is true
    locations = removeReferences
      ? await client.findReferences(fileUri, position)
      : [{ uri: fileUri, range: { start: position, end: position } }];

    if (locations.length === 0) {
      return {
        applied: false,
        deletedFromFiles: new Set(),
        totalDeleted: 0,
        failureReason: "No references found for the symbol",
      };
    }

    // Create workspace edit
    const workspaceEdit: WorkspaceEdit = {
      changes: {},
    };

    // Group locations by file
    const fileChanges = new Map<string, Range[]>();

    for (const location of locations) {
      const ranges = fileChanges.get(location.uri) || [];
      ranges.push(location.range);
      fileChanges.set(location.uri, ranges);
    }

    // Create text edits for each file
    for (const [uri, ranges] of fileChanges) {
      // Sort ranges in reverse order to avoid position shifts
      const sortedRanges = ranges.sort((a, b) => {
        if (a.start.line !== b.start.line) {
          return b.start.line - a.start.line;
        }
        return b.start.character - a.start.character;
      });

      // Read file content if it's different from the current file
      let fileContent: string;
      let fileLines: string[];

      if (uri === fileUri) {
        fileContent = content;
        fileLines = lines;
      } else {
        const filePath = fileURLToPath(uri);
        fileContent = await fs.readFile(filePath, "utf-8");
        fileLines = fileContent.split("\n");
        // Open document for editing
        client.openDocument(uri, fileContent);
      }

      const edits: TextEdit[] = [];

      for (const range of sortedRanges) {
        // Check if this is a complete line deletion
        const lineText = fileLines[range.start.line];
        const beforeSymbol = lineText.substring(0, range.start.character)
          .trim();
        const afterSymbol = lineText.substring(range.end.character).trim();

        if (!beforeSymbol && !afterSymbol) {
          // Delete the entire line
          edits.push({
            range: {
              start: { line: range.start.line, character: 0 },
              end: { line: range.start.line + 1, character: 0 },
            },
            newText: "",
          });
        } else {
          // Delete just the symbol
          edits.push({
            range,
            newText: "",
          });
        }
      }

      workspaceEdit.changes![uri] = edits;
    }

    // Apply the workspace edit
    const result = await client.applyEdit(
      workspaceEdit,
      `Delete symbol "${target}"`,
    );

    if (!result.applied) {
      return {
        applied: false,
        deletedFromFiles: new Set(),
        totalDeleted: 0,
        failureReason: result.failureReason || "Failed to apply workspace edit",
      };
    }

    return {
      applied: true,
      deletedFromFiles: new Set(fileChanges.keys()),
      totalDeleted: locations.length,
    };
  } finally {
    // Close all opened documents
    for (const uri of new Set([fileUri, ...locations.map((l) => l.uri)])) {
      client.closeDocument(uri);
    }
  }
}

function formatDeleteSymbolResult(result: DeleteSymbolResult): string {
  if (!result.applied) {
    return `Failed to delete symbol: ${result.failureReason}`;
  }

  const fileCount = result.deletedFromFiles.size;
  const fileList = Array.from(result.deletedFromFiles)
    .map((uri) => {
      try {
        return fileURLToPath(uri);
      } catch {
        return uri;
      }
    })
    .join("\n  ");

  return `Successfully deleted symbol from ${fileCount} file(s) with ${result.totalDeleted} occurrence(s)\n\nModified files:\n  ${fileList}`;
}

export const lspDeleteSymbolTool: ToolDef<typeof schema> = {
  name: "lsmcp_delete_symbol",
  description:
    "Delete a symbol (variable, function, class, etc.) and optionally all its references using LSP",
  schema,
  execute: async (args) => {
    const result = await handleDeleteSymbol(args);
    return formatDeleteSymbolResult(result);
  },
};
