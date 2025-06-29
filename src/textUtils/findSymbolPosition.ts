import { findSymbolOccurrences } from "./findSymbolOccurrences.ts";

/**
 * Result type for symbol position operations
 */
export type SymbolPositionResult =
  | { success: true; lineIndex: number; characterIndex: number }
  | { success: false; error: string };

/**
 * Finds the position of a symbol on a specific line
 * @param fullText Full text content
 * @param lineIndex Line index (0-based)
 * @param symbolName Symbol to find
 * @param symbolIndex Occurrence index (0-based, default: 0)
 * @returns Symbol position result
 */
export function findSymbolPosition(
  fullText: string,
  lineIndex: number,
  symbolName: string,
  symbolIndex = 0,
): SymbolPositionResult {
  const lines = fullText.split("\n");

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return {
      success: false,
      error: `Invalid line number: ${
        lineIndex + 1
      }. File has ${lines.length} lines.`,
    };
  }

  const lineText = lines[lineIndex];
  const occurrences = findSymbolOccurrences(lineText, symbolName);

  if (occurrences.length === 0) {
    return {
      success: false,
      error: `Symbol "${symbolName}" not found on line ${lineIndex + 1}`,
    };
  }

  if (symbolIndex < 0 || symbolIndex >= occurrences.length) {
    return {
      success: false,
      error:
        `Symbol "${symbolName}" only appears ${occurrences.length} time(s) on line ${
          lineIndex + 1
        }, but index ${symbolIndex} was requested`,
    };
  }

  return {
    success: true,
    lineIndex,
    characterIndex: occurrences[symbolIndex],
  };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findSymbolPosition", () => {
    it("should find symbol position on line", () => {
      const fullText = `const foo = 1;
const bar = 2;`;

      const result = findSymbolPosition(fullText, 0, "foo");
      expect(result).toEqual({
        success: true,
        lineIndex: 0,
        characterIndex: 6,
      });
    });

    it("should find specific occurrence", () => {
      const fullText = `const foo = foo + foo;`;

      const result = findSymbolPosition(fullText, 0, "foo", 2);
      expect(result).toEqual({
        success: true,
        lineIndex: 0,
        characterIndex: 18,
      });
    });

    it("should return error for invalid line", () => {
      const fullText = `const foo = 1;`;

      const result = findSymbolPosition(fullText, 5, "foo");
      expect(result).toEqual({
        success: false,
        error: "Invalid line number: 6. File has 1 lines.",
      });
    });

    it("should return error if symbol not found", () => {
      const fullText = `const foo = 1;`;

      const result = findSymbolPosition(fullText, 0, "bar");
      expect(result).toEqual({
        success: false,
        error: 'Symbol "bar" not found on line 1',
      });
    });

    it("should return error for invalid occurrence index", () => {
      const fullText = `const foo = 1;`;

      const result = findSymbolPosition(fullText, 0, "foo", 1);
      expect(result).toEqual({
        success: false,
        error:
          'Symbol "foo" only appears 1 time(s) on line 1, but index 1 was requested',
      });
    });
  });
}
