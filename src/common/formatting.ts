import { Location, Range } from "vscode-languageserver-types";

/**
 * Format a location for display
 */
export function formatLocation(location: Location): string {
  if (!location.range) {
    return location.uri;
  }
  const line = location.range.start.line + 1;
  const char = location.range.start.character + 1;
  return `${location.uri}:${line}:${char}`;
}

/**
 * Format a range for display
 */
export function formatRange(range: Range | undefined | null): string {
  if (!range) {
    return "unknown range";
  }
  const startLine = range.start.line + 1;
  const startChar = range.start.character + 1;
  const endLine = range.end.line + 1;
  const endChar = range.end.character + 1;

  if (startLine === endLine) {
    return `${startLine}:${startChar}-${endChar}`;
  }
  return `${startLine}:${startChar} - ${endLine}:${endChar}`;
}

/**
 * Format file path relative to root
 */
export function formatFilePath(absolutePath: string, root: string): string {
  if (absolutePath.startsWith(root)) {
    // Remove root, handling both trailing slash and no trailing slash
    const offset = root.endsWith("/") ? root.length : root.length + 1;
    return absolutePath.slice(offset);
  }
  return absolutePath;
}

/**
 * Truncate text for display
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...";
}

/**
 * Format code snippet with line numbers
 */
export function formatCodeSnippet(
  lines: string[],
  startLine: number,
  highlightLine?: number,
): string {
  return lines
    .map((line, index) => {
      const lineNum = startLine + index;
      const prefix = highlightLine === lineNum ? "→ " : "  ";
      return `${prefix}${lineNum}: ${line}`;
    })
    .join("\n");
}
