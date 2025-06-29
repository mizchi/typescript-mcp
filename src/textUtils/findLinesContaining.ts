/**
 * Finds all line indices containing a specific string
 * @param fullText Full text content
 * @param searchString String to search for
 * @returns Array of line indices (0-based)
 */
export function findLinesContaining(
  fullText: string,
  searchString: string,
): number[] {
  const lines = fullText.split("\n");
  const matchingLines: number[] = [];
  lines.forEach((line, index) => {
    if (line.includes(searchString)) {
      matchingLines.push(index);
    }
  });
  return matchingLines;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findLinesContaining", () => {
    it("should find single line containing search string", () => {
      const fullText = `const foo = 1;
const bar = 2;
const baz = 3;`;

      const result = findLinesContaining(fullText, "bar");
      expect(result).toEqual([1]);
    });

    it("should find multiple lines containing search string", () => {
      const fullText = `const foo = 1;
const foo2 = 2;
const bar = foo;`;

      const result = findLinesContaining(fullText, "foo");
      expect(result).toEqual([0, 1, 2]);
    });

    it("should return empty array if string not found", () => {
      const fullText = `const foo = 1;
const bar = 2;`;

      const result = findLinesContaining(fullText, "baz");
      expect(result).toEqual([]);
    });

    it("should handle empty text", () => {
      const result = findLinesContaining("", "foo");
      expect(result).toEqual([]);
    });
  });
}
