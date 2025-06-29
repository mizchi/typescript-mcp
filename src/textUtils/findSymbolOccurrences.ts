/**
 * Finds all occurrences of a symbol within a line
 * @param lineText The text of the line
 * @param symbolName The symbol to find
 * @returns Array of character indices where the symbol appears
 */
export function findSymbolOccurrences(
  lineText: string,
  symbolName: string,
): number[] {
  const occurrences: number[] = [];
  let searchIndex = 0;

  let foundIndex = lineText.indexOf(symbolName, searchIndex);
  while (foundIndex !== -1) {
    occurrences.push(foundIndex);
    searchIndex = foundIndex + 1;
    foundIndex = lineText.indexOf(symbolName, searchIndex);
  }

  return occurrences;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findSymbolOccurrences", () => {
    it("should find single occurrence", () => {
      const result = findSymbolOccurrences("const foo = 1;", "foo");
      expect(result).toEqual([6]);
    });

    it("should find multiple occurrences", () => {
      const result = findSymbolOccurrences("const foo = foo + foo;", "foo");
      expect(result).toEqual([6, 12, 18]);
    });

    it("should return empty array if symbol not found", () => {
      const result = findSymbolOccurrences("const bar = 1;", "foo");
      expect(result).toEqual([]);
    });

    it("should handle overlapping occurrences", () => {
      const result = findSymbolOccurrences("aaaa", "aa");
      expect(result).toEqual([0, 1, 2]);
    });
  });
}
