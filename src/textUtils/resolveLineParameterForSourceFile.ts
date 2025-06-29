import { type SourceFile } from "ts-morph";
import { resolveLineParameter } from "./resolveLineParameter.ts";

/**
 * Resolves a line parameter for a SourceFile (1-based line numbers)
 * @param sourceFile The source file to search in
 * @param lineParam Either a line number (1-based) or a string to match
 * @returns The resolved line number (1-based) or throws an error
 */
export function resolveLineParameterForSourceFile(
  sourceFile: SourceFile,
  lineParam: number | string,
): number {
  const result = resolveLineParameter(sourceFile.getFullText(), lineParam);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.lineIndex + 1; // Convert to 1-based
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { Project } = await import("ts-morph");

  describe("resolveLineParameterForSourceFile", () => {
    it("should resolve line number", () => {
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const foo = 1;
const bar = 2;
const baz = 3;`,
      );

      const result = resolveLineParameterForSourceFile(sourceFile, 2);
      expect(result).toBe(2);
    });

    it("should resolve string match", () => {
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const foo = 1;
const bar = 2;
const baz = 3;`,
      );

      const result = resolveLineParameterForSourceFile(sourceFile, "bar = 2");
      expect(result).toBe(2);
    });

    it("should throw on not found", () => {
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const foo = 1;`,
      );

      expect(() => resolveLineParameterForSourceFile(sourceFile, "not found"))
        .toThrow(
          'No line found containing: "not found"',
        );
    });
  });
}
