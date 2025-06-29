import type { SymbolPositionResult } from "./findSymbolPosition.ts";

/**
 * Finds the first occurrence of target text in the file
 * @param fullText Full text content
 * @param target Text to find
 * @returns Position result or error
 */
export function findTextInFile(
  fullText: string,
  target: string,
): SymbolPositionResult {
  const lines = fullText.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const charIndex = lines[lineIndex].indexOf(target);
    if (charIndex !== -1) {
      return {
        success: true,
        lineIndex,
        characterIndex: charIndex,
      };
    }
  }

  return {
    success: false,
    error: `Target text "${target}" not found in file`,
  };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findTextInFile", () => {
    it("should find text in file", () => {
      const fullText = `const foo = 1;
const bar = 2;
const baz = 3;`;

      const result = findTextInFile(fullText, "bar");
      expect(result).toEqual({
        success: true,
        lineIndex: 1,
        characterIndex: 6,
      });
    });

    it("should find text at beginning of file", () => {
      const fullText = `function test() {
  return 42;
}`;

      const result = findTextInFile(fullText, "function");
      expect(result).toEqual({
        success: true,
        lineIndex: 0,
        characterIndex: 0,
      });
    });

    it("should return error if text not found", () => {
      const fullText = `const foo = 1;
const bar = 2;`;

      const result = findTextInFile(fullText, "not found");
      expect(result).toEqual({
        success: false,
        error: 'Target text "not found" not found in file',
      });
    });

    it("should find first occurrence", () => {
      const fullText = `const foo = 1;
const foo = 2;`;

      const result = findTextInFile(fullText, "foo");
      expect(result).toEqual({
        success: true,
        lineIndex: 0,
        characterIndex: 6,
      });
    });
  });
}
