import { findLinesContaining } from "./findLinesContaining.ts";

/**
 * Result type for line resolution operations
 */
export type LineResolutionResult =
  | { success: true; lineIndex: number }
  | { success: false; error: string };

/**
 * Resolves a line parameter to a line index
 * @param fullText Full text content
 * @param lineParam Line number (1-based) or string to match
 * @returns Resolution result with line index (0-based) or error
 */
export function resolveLineParameter(
  fullText: string,
  lineParam: number | string,
): LineResolutionResult {
  const lines = fullText.split("\n");

  if (typeof lineParam === "number") {
    const lineIndex = lineParam - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return {
        success: false,
        error:
          `Invalid line number: ${lineParam}. File has ${lines.length} lines.`,
      };
    }
    return { success: true, lineIndex };
  }

  // String search
  const matchingIndices = findLinesContaining(fullText, lineParam);

  if (matchingIndices.length === 0) {
    return {
      success: false,
      error: `No line found containing: "${lineParam}"`,
    };
  }

  if (matchingIndices.length > 1) {
    const lineNumbers = matchingIndices.map((i) => i + 1).join(", ");
    return {
      success: false,
      error:
        `Multiple lines found containing "${lineParam}". Found on lines: ${lineNumbers}. Please be more specific or use a line number.`,
    };
  }

  return { success: true, lineIndex: matchingIndices[0] };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("resolveLineParameter", () => {
    it("should resolve line number to 0-based index", () => {
      const fullText = `line 1
line 2
line 3`;

      const result = resolveLineParameter(fullText, 2);
      expect(result).toEqual({ success: true, lineIndex: 1 });
    });

    it("should resolve string match to line index", () => {
      const fullText = `const foo = 1;
const bar = 2;
const baz = 3;`;

      const result = resolveLineParameter(fullText, "bar = 2");
      expect(result).toEqual({ success: true, lineIndex: 1 });
    });

    it("should return error for invalid line number", () => {
      const fullText = `line 1`;

      const result1 = resolveLineParameter(fullText, 0);
      expect(result1).toEqual({
        success: false,
        error: "Invalid line number: 0. File has 1 lines.",
      });

      const result2 = resolveLineParameter(fullText, 10);
      expect(result2).toEqual({
        success: false,
        error: "Invalid line number: 10. File has 1 lines.",
      });
    });

    it("should return error if string not found", () => {
      const fullText = `const foo = 1;`;

      const result = resolveLineParameter(fullText, "not found");
      expect(result).toEqual({
        success: false,
        error: 'No line found containing: "not found"',
      });
    });

    it("should return error for multiple matches", () => {
      const fullText = `const foo = 1;
const foo2 = 2;`;

      const result = resolveLineParameter(fullText, "foo");
      expect(result).toEqual({
        success: false,
        error:
          'Multiple lines found containing "foo". Found on lines: 1, 2. Please be more specific or use a line number.',
      });
    });
  });
}
