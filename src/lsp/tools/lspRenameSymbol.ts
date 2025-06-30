import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { getActiveClient } from "../lspClient.ts";
import { parseLineNumber } from "../../textUtils/parseLineNumber.ts";
import { findSymbolInLine } from "../../textUtils/findSymbolInLine.ts";
import { findTargetInFile } from "../../textUtils/findTargetInFile.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import {
  Position,
  TextDocumentEdit,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver-types";
import { debug } from "../../mcp/_mcplib.ts";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the symbol (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line")
    .optional(),
  target: z.string().describe("Symbol to rename"),
  newName: z.string().describe("New name for the symbol"),
});

type RenameSymbolRequest = z.infer<typeof schema>;

interface RenameSymbolSuccess {
  message: string;
  changedFiles: {
    filePath: string;
    changes: {
      line: number;
      column: number;
      oldText: string;
      newText: string;
    }[];
  }[];
}

/**
 * Helper to handle rename request when line is not provided
 */
async function performRenameWithoutLine(
  request: RenameSymbolRequest,
): Promise<Result<RenameSymbolSuccess, string>> {
  try {
    // Read file content
    const absolutePath = path.resolve(request.root, request.filePath);
    const fileContent = readFileSync(absolutePath, "utf-8");
    const fileUri = `file://${absolutePath}`;
    const lines = fileContent.split("\n");

    // Find target text in file
    const targetResult = findTargetInFile(lines, request.target);
    if ("error" in targetResult) {
      return err(`${targetResult.error} in ${request.filePath}`);
    }

    const { lineIndex: targetLine, characterIndex: symbolPosition } =
      targetResult;

    return performRenameAtPosition(
      request,
      fileUri,
      fileContent,
      targetLine,
      symbolPosition,
    );
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Handle rename request when line is provided
 */
async function performRenameWithLine(
  request: RenameSymbolRequest,
): Promise<Result<RenameSymbolSuccess, string>> {
  try {
    // Read file content
    const absolutePath = path.resolve(request.root, request.filePath);
    const fileContent = readFileSync(absolutePath, "utf-8");
    const fileUri = `file://${absolutePath}`;
    const lines = fileContent.split("\n");

    // Parse line parameter
    const lineResult = parseLineNumber(fileContent, request.line!);
    if ("error" in lineResult) {
      return err(
        `Line parameter "${
          String(request.line)
        }" not found in ${request.filePath}: ${lineResult.error}`,
      );
    }

    const targetLine = lineResult.lineIndex;
    const line = lines[targetLine];

    // Find symbol position in line
    const symbolResult = findSymbolInLine(line, request.target);
    if ("error" in symbolResult) {
      return err(
        `Symbol "${request.target}" not found on line ${
          String(targetLine + 1)
        }: ${symbolResult.error}`,
      );
    }
    const symbolPosition = symbolResult.characterIndex;

    return performRenameAtPosition(
      request,
      fileUri,
      fileContent,
      targetLine,
      symbolPosition,
    );
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Perform rename at a specific position
 */
async function performRenameAtPosition(
  request: RenameSymbolRequest,
  fileUri: string,
  fileContent: string,
  targetLine: number,
  symbolPosition: number,
): Promise<Result<RenameSymbolSuccess, string>> {
  try {
    const client = getActiveClient();

    // Open all TypeScript/JavaScript files in the project to ensure LSP knows about them
    const projectFiles = await findProjectFiles(request.root);
    for (const file of projectFiles) {
      if (file !== path.resolve(request.root, request.filePath)) {
        try {
          const content = readFileSync(file, "utf-8");
          client.openDocument(`file://${file}`, content);
        } catch (e) {
          debug(`[lspRenameSymbol] Failed to open file: ${file}`, e);
        }
      }
    }

    // Open the target document
    client.openDocument(fileUri, fileContent);
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    const position: Position = {
      line: targetLine,
      character: symbolPosition,
    };

    // Optional: Check if rename is possible at this position
    try {
      const prepareResult = await client.prepareRename(fileUri, position);

      if (prepareResult === null) {
        return err(
          `Cannot rename symbol at line ${targetLine + 1}, column ${
            symbolPosition + 1
          }`,
        );
      }
    } catch {
      // Some LSP servers don't support prepareRename, continue with rename
    }

    // Perform rename
    let workspaceEdit: WorkspaceEdit | null = null;

    try {
      // Use the client's rename method which handles errors properly
      workspaceEdit = await client.rename(
        fileUri,
        position,
        request.newName,
      );
    } catch (error: any) {
      // Check if LSP doesn't support rename (e.g., TypeScript Native Preview)
      if (
        error.code === -32601 ||
        error.message?.includes("Unhandled method") ||
        error.message?.includes("Method not found")
      ) {
        return err("LSP server doesn't support rename operation");
      }
      // Re-throw other errors
      throw error;
    }

    if (!workspaceEdit) {
      // LSP returned null, try TypeScript tool as fallback
      return err("No changes from LSP rename operation");
    }

    // Debug: Log the workspace edit
    debug(
      "[lspRenameSymbol] WorkspaceEdit from LSP:",
      JSON.stringify(workspaceEdit, null, 2),
    );

    // Apply changes and format result
    const result = await applyWorkspaceEdit(request.root, workspaceEdit);

    // Close all opened documents
    client.closeDocument(fileUri);
    for (const file of projectFiles) {
      if (file !== path.resolve(request.root, request.filePath)) {
        try {
          client.closeDocument(`file://${file}`);
        } catch (e) {
          // Ignore close errors
        }
      }
    }

    return ok(result);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Apply workspace edit and return formatted result
 */
async function applyWorkspaceEdit(
  _root: string,
  workspaceEdit: WorkspaceEdit,
): Promise<RenameSymbolSuccess> {
  const changedFiles: RenameSymbolSuccess["changedFiles"] = [];
  const allFileContents = new Map<string, string[]>();

  // Collect all file contents before applying changes
  if (workspaceEdit.changes) {
    for (const [uri, _edits] of Object.entries(workspaceEdit.changes)) {
      if (!uri) continue;
      const filePath = uri.replace("file://", "");
      const content = readFileSync(filePath, "utf-8");
      allFileContents.set(filePath, content.split("\n"));
    }
  }

  if (workspaceEdit.documentChanges) {
    for (const change of workspaceEdit.documentChanges) {
      if (TextDocumentEdit.is(change) && change.textDocument?.uri) {
        const filePath = change.textDocument.uri.replace("file://", "");
        if (!allFileContents.has(filePath)) {
          const content = readFileSync(filePath, "utf-8");
          allFileContents.set(filePath, content.split("\n"));
        }
      }
    }
  }

  // Process changes from WorkspaceEdit.changes
  if (workspaceEdit.changes) {
    for (const [uri, edits] of Object.entries(workspaceEdit.changes)) {
      if (!uri) continue;
      const filePath = uri.replace("file://", "");
      const lines = allFileContents.get(filePath);
      if (!lines) continue;
      const fileChanges = processTextEdits(filePath, lines, edits);

      if (fileChanges.changes.length > 0) {
        changedFiles.push(fileChanges);

        // Apply edits to file
        const newContent = applyTextEditsToContent(lines.join("\n"), edits);
        writeFileSync(filePath, newContent, "utf-8");
      }
    }
  }

  // Process changes from WorkspaceEdit.documentChanges
  if (workspaceEdit.documentChanges) {
    for (const change of workspaceEdit.documentChanges) {
      if (TextDocumentEdit.is(change) && change.textDocument?.uri) {
        const filePath = change.textDocument.uri.replace("file://", "");
        const lines = allFileContents.get(filePath);
        if (!lines) continue;
        const fileChanges = processTextEdits(filePath, lines, change.edits);

        if (fileChanges.changes.length > 0) {
          // Check if we already processed this file
          const existingFile = changedFiles.find((f) =>
            f.filePath === filePath
          );
          if (existingFile) {
            existingFile.changes.push(...fileChanges.changes);
          } else {
            changedFiles.push(fileChanges);
          }

          // Apply edits to file
          const newContent = applyTextEditsToContent(
            lines.join("\n"),
            change.edits,
          );
          writeFileSync(filePath, newContent, "utf-8");
        }
      }
    }
  }

  const totalChanges = changedFiles.reduce(
    (sum, file) => sum + file.changes.length,
    0,
  );

  return {
    message:
      `Successfully renamed symbol in ${changedFiles.length} file(s) with ${totalChanges} change(s)`,
    changedFiles,
  };
}

/**
 * Process text edits and extract change information
 */
function processTextEdits(
  filePath: string,
  lines: string[],
  edits: TextEdit[],
): RenameSymbolSuccess["changedFiles"][0] {
  const changes: RenameSymbolSuccess["changedFiles"][0]["changes"] = [];

  for (const edit of edits) {
    const startLine = edit.range.start.line;
    const startCol = edit.range.start.character;
    const endLine = edit.range.end.line;
    const endCol = edit.range.end.character;

    // Extract old text
    let oldText = "";
    if (startLine === endLine) {
      oldText = lines[startLine].substring(startCol, endCol);
    } else {
      // Multi-line edit
      oldText = lines[startLine].substring(startCol);
      for (let i = startLine + 1; i < endLine; i++) {
        oldText += "\n" + lines[i];
      }
      oldText += "\n" + lines[endLine].substring(0, endCol);
    }

    changes.push({
      line: startLine + 1, // Convert to 1-based
      column: startCol + 1, // Convert to 1-based
      oldText,
      newText: edit.newText,
    });
  }

  return {
    filePath,
    changes,
  };
}

/**
 * Apply text edits to content
 */
function applyTextEditsToContent(content: string, edits: TextEdit[]): string {
  // Sort edits by position (reverse order to avoid position shifts)
  const sortedEdits = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  let result = content;
  const lines = result.split("\n");

  for (const edit of sortedEdits) {
    const startLine = edit.range.start.line;
    const startCol = edit.range.start.character;
    const endLine = edit.range.end.line;
    const endCol = edit.range.end.character;

    if (startLine === endLine) {
      // Single line edit
      lines[startLine] = lines[startLine].substring(0, startCol) +
        edit.newText +
        lines[startLine].substring(endCol);
    } else {
      // Multi-line edit
      const newLines = edit.newText.split("\n");
      const before = lines[startLine].substring(0, startCol);
      const after = lines[endLine].substring(endCol);

      // Remove old lines
      lines.splice(startLine, endLine - startLine + 1);

      // Insert new lines
      if (newLines.length === 1) {
        lines.splice(startLine, 0, before + newLines[0] + after);
      } else {
        const insertLines = [
          before + newLines[0],
          ...newLines.slice(1, -1),
          newLines[newLines.length - 1] + after,
        ];
        lines.splice(startLine, 0, ...insertLines);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Handle rename symbol request
 */
async function handleRenameSymbol(
  request: RenameSymbolRequest,
): Promise<Result<RenameSymbolSuccess, string>> {
  try {
    if (request.line !== undefined) {
      return performRenameWithLine(request);
    } else {
      return performRenameWithoutLine(request);
    }
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Find all TypeScript/JavaScript files in the project
 */
async function findProjectFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

  function walkDir(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry !== "node_modules" && !entry.startsWith(".")) {
            walkDir(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(fullPath);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      debug(`[lspRenameSymbol] Error walking directory ${dir}:`, e);
    }
  }

  walkDir(rootPath);
  return files;
}

export const lspRenameSymbolTool: ToolDef<typeof schema> = {
  name: "lsmcp_rename_symbol",
  description:
    "Rename a symbol across the codebase using Language Server Protocol",
  schema,
  execute: async (args) => {
    const result = await handleRenameSymbol(args);
    if (result.isErr()) {
      throw new Error(result.error);
    }

    // Format output
    const { message, changedFiles } = result.value;
    const output = [message, "", "Changes:"];

    for (const file of changedFiles) {
      const relativePath = path.relative(args.root, file.filePath);
      output.push(`  ${relativePath}:`);

      for (const change of file.changes) {
        output.push(
          `    Line ${change.line}: "${change.oldText}" → "${change.newText}"`,
        );
      }
    }

    return output.join("\n");
  },
};
