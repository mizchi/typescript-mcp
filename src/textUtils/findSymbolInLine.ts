import { findSymbolOccurrences } from "./findSymbolOccurrences.ts";

/**
 * Finds the position of a symbol within a line
 * @param lineText The text of the line
 * @param symbolName The symbol to find
 * @param symbolIndex Optional index if symbol appears multiple times (0-based)
 * @returns Character index or error message
 */
export function findSymbolInLine(
  lineText: string,
  symbolName: string,
  symbolIndex = 0,
): { characterIndex: number } | { error: string } {
  const occurrences = findSymbolOccurrences(lineText, symbolName);

  if (occurrences.length === 0) {
    return { error: `Symbol "${symbolName}" not found` };
  }

  if (symbolIndex < 0 || symbolIndex >= occurrences.length) {
    return {
      error:
        `Symbol "${symbolName}" occurrence ${symbolIndex} not found (only ${occurrences.length} occurrences)`,
    };
  }

  return { characterIndex: occurrences[symbolIndex] };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findSymbolInLine", () => {
    it("should find symbol at first occurrence by default", () => {
      const result = findSymbolInLine("const foo = foo + foo;", "foo");
      expect(result).toEqual({ characterIndex: 6 });
    });

    it("should find symbol at specific index", () => {
      const result = findSymbolInLine("const foo = foo + foo;", "foo", 2);
      expect(result).toEqual({ characterIndex: 18 });
    });

    it("should return error if symbol not found", () => {
      const result = findSymbolInLine("const bar = 1;", "foo");
      expect(result).toEqual({ error: 'Symbol "foo" not found' });
    });

    it("should return error for invalid index", () => {
      const result = findSymbolInLine("const foo = 1;", "foo", 1);
      expect(result).toEqual({
        error: 'Symbol "foo" occurrence 1 not found (only 1 occurrences)',
      });
    });
  });
}
