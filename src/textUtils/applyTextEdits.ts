import { TextEdit } from "vscode-languageserver-types";

/**
 * Apply text edits to a document content.
 * Edits should be sorted in reverse order (last to first) before applying.
 */
export function applyTextEdits(content: string, edits: TextEdit[]): string {
  // Sort edits in reverse order
  const sortedEdits = [...edits].sort((a, b) => {
    const lineDiff = b.range.start.line - a.range.start.line;
    if (lineDiff !== 0) return lineDiff;
    return b.range.start.character - a.range.start.character;
  });

  let lines = content.split("\n");

  for (const edit of sortedEdits) {
    const startLine = edit.range.start.line;
    const startChar = edit.range.start.character;
    const endLine = edit.range.end.line;
    const endChar = edit.range.end.character;

    // Handle single line edit
    if (startLine === endLine) {
      const line = lines[startLine] || "";
      lines[startLine] = line.substring(0, startChar) +
        edit.newText +
        line.substring(endChar);
    } else {
      // Handle multi-line edit
      const startLineText = lines[startLine] || "";
      const endLineText = lines[endLine] || "";

      // Create the new content
      const newContent = startLineText.substring(0, startChar) +
        edit.newText +
        endLineText.substring(endChar);

      // Replace the lines
      lines.splice(
        startLine,
        endLine - startLine + 1,
        ...newContent.split("\n"),
      );
    }
  }

  return lines.join("\n");
}
