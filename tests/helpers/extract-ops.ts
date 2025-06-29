import fs from "fs/promises";

export interface RenameOperation {
  line: number;
  symbolName: string;
  newName: string;
}

/**
 * Parse @rename comments from a file
 * Format: // @rename oldName newName
 * @param filePath Path to the file to parse
 * @returns Array of rename operations found in the file
 */
export async function parseRenameComments(
  filePath: string,
): Promise<RenameOperation[]> {
  const content = await fs.readFile(filePath, "utf-8");
  return parseRenameCommentsFromContent(content);
}

/**
 * Parse @rename comments from content string
 * Format: // @rename oldName newName
 * @param content File content to parse
 * @returns Array of rename operations found in the content
 */
export function parseRenameCommentsFromContent(
  content: string,
): RenameOperation[] {
  const lines = content.split("\n");
  const operations: RenameOperation[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/\/\/\s*@rename\s+(\S+)\s+(\S+)/);
    if (match) {
      operations.push({
        line: index + 1, // 1-based line numbers
        symbolName: match[1],
        newName: match[2],
      });
    }
  });

  return operations;
}

/**
 * Extract expected content from a file by removing @rename comments
 * @param filePath Path to the file
 * @returns File content without @rename comments
 */
export async function getExpectedContent(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return removeRenameComments(content);
}

/**
 * Remove @rename comments from content
 * @param content File content
 * @returns Content without @rename comments
 */
export function removeRenameComments(content: string): string {
  const lines = content.split("\n");

  // Remove lines that contain only @rename comments
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    return !trimmed.match(/^\/\/\s*@rename\s+\S+\s+\S+\s*$/);
  });

  return filteredLines.join("\n");
}
