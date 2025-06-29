import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { pathToFileURL } from "url";
import { FormattingOptions, TextEdit } from "vscode-languageserver-types";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { getLSPClient } from "../lspClient.ts";
import { applyTextEdits } from "../../textUtils/applyTextEdits.ts";

const schemaShape = {
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path to format (relative to root)"),
  tabSize: z
    .number()
    .default(2)
    .describe("Number of spaces for indentation"),
  insertSpaces: z
    .boolean()
    .default(true)
    .describe("Use spaces instead of tabs"),
  trimTrailingWhitespace: z
    .boolean()
    .default(true)
    .describe("Trim trailing whitespace"),
  insertFinalNewline: z
    .boolean()
    .default(true)
    .describe("Insert final newline"),
  trimFinalNewlines: z
    .boolean()
    .default(true)
    .describe("Trim final newlines"),
  applyChanges: z
    .boolean()
    .default(false)
    .describe("Apply formatting changes to the file"),
};

const schema = z.object(schemaShape);

function formatTextEdit(edit: TextEdit, content: string): string {
  const lines = content.split("\n");
  const startLine = edit.range.start.line;
  const endLine = edit.range.end.line;

  // Extract the text being replaced
  let originalText = "";
  if (startLine === endLine) {
    const line = lines[startLine] || "";
    originalText = line.substring(
      edit.range.start.character,
      edit.range.end.character,
    );
  } else {
    // Multi-line range
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      if (i === startLine) {
        originalText += (lines[i] || "").substring(edit.range.start.character);
      } else if (i === endLine) {
        originalText += "\n" +
          (lines[i] || "").substring(0, edit.range.end.character);
      } else {
        originalText += "\n" + (lines[i] || "");
      }
    }
  }

  // Show the change
  const arrow = " → ";
  const newText = edit.newText;

  // For readability, truncate very long texts
  const maxLength = 50;
  const truncate = (text: string) => {
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + "...";
    }
    return text;
  };

  const displayOld = truncate(originalText.replace(/\n/g, "\\n"));
  const displayNew = truncate(newText.replace(/\n/g, "\\n"));

  return `Line ${startLine + 1}:${
    edit.range.start.character + 1
  }: "${displayOld}"${arrow}"${displayNew}"`;
}

async function handleFormatDocument({
  root,
  filePath,
  tabSize,
  insertSpaces,
  trimTrailingWhitespace,
  insertFinalNewline,
  trimFinalNewlines,
  applyChanges,
}: z.infer<typeof schema>): Promise<string> {
  const client = getLSPClient();
  if (!client) {
    throw new Error("LSP client not initialized");
  }

  // Convert to absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);

  // Check if file exists
  await fs.access(absolutePath);

  // Convert to file URI
  const fileUri = pathToFileURL(absolutePath).toString();

  // Read the file content
  const content = await fs.readFile(absolutePath, "utf-8");

  // Open the document in LSP
  client.openDocument(fileUri, content);

  try {
    // Wait a bit for LSP to process the document
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Prepare formatting options
    const options: FormattingOptions = {
      tabSize,
      insertSpaces,
      trimTrailingWhitespace,
      insertFinalNewline,
      trimFinalNewlines,
    };

    // Get formatting edits
    const edits = await client.formatDocument(fileUri, options);

    if (edits.length === 0) {
      return `No formatting changes needed for ${filePath}`;
    }

    // Sort edits by position (reverse order for applying)
    const sortedEdits = edits.sort((a, b) => {
      const lineDiff = b.range.start.line - a.range.start.line;
      if (lineDiff !== 0) return lineDiff;
      return b.range.start.character - a.range.start.character;
    });

    // Format the result
    let result = `Formatting changes for ${filePath}:\n\n`;

    // Show each edit
    for (const edit of sortedEdits) {
      result += formatTextEdit(edit, content) + "\n";
    }

    result += `\nTotal changes: ${edits.length}`;

    // Apply changes if requested
    if (applyChanges) {
      const formattedContent = applyTextEdits(content, edits);
      await fs.writeFile(absolutePath, formattedContent, "utf-8");
      result += "\n\n✓ Changes applied to file";
    } else {
      result += "\n\n(Use applyChanges: true to apply these changes)";
    }

    return result;
  } finally {
    // Close the document
    client.closeDocument(fileUri);
  }
}

export const lspFormatDocumentTool: ToolDef<typeof schema> = {
  name: "lsmcp_format_document",
  description:
    "Format an entire document using the language server's formatting provider",
  schema,
  execute: async (args) => {
    return handleFormatDocument(args);
  },
};
