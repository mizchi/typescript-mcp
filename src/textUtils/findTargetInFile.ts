import { findTextInFile } from "./findTextInFile.ts";

/**
 * Finds the first occurrence of target text across all lines
 * @param lines Array of file lines
 * @param target Text to find
 * @returns Line index and character position or error
 */
export function findTargetInFile(
  lines: string[],
  target: string,
): { lineIndex: number; characterIndex: number } | { error: string } {
  const fullText = lines.join("\n");
  const result = findTextInFile(fullText, target);

  if (!result.success) {
    return { error: result.error };
  }

  return {
    lineIndex: result.lineIndex,
    characterIndex: result.characterIndex,
  };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findTargetInFile", () => {
    it("should find target text in file", () => {
      const lines = ["const foo = 1;", "const bar = 2;", "const baz = 3;"];

      const result = findTargetInFile(lines, "bar");
      expect(result).toEqual({ lineIndex: 1, characterIndex: 6 });
    });

    it("should find target in first line", () => {
      const lines = ["function test() {", "  return 42;", "}"];

      const result = findTargetInFile(lines, "function");
      expect(result).toEqual({ lineIndex: 0, characterIndex: 0 });
    });

    it("should return error if target not found", () => {
      const lines = ["const foo = 1;", "const bar = 2;"];

      const result = findTargetInFile(lines, "not found");
      expect(result).toEqual({
        error: 'Target text "not found" not found in file',
      });
    });
  });
}
