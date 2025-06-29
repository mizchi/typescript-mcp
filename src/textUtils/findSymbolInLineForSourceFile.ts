import { type SourceFile } from "ts-morph";
import { findSymbolPosition } from "./findSymbolPosition.ts";

/**
 * Finds the column position of a symbol in a specific line of a SourceFile
 * @param sourceFile The source file
 * @param lineNumber The line number (1-based)
 * @param symbolName The symbol name to find
 * @param index The occurrence index to find (0-based, default: 0)
 * @returns Object with line text and column position (1-based) or throws an error
 */
export function findSymbolInLineForSourceFile(
  sourceFile: SourceFile,
  lineNumber: number,
  symbolName: string,
  index = 0,
): { lineText: string; column: number } {
  const fullText = sourceFile.getFullText();
  const lines = fullText.split("\n");
  const lineIndex = lineNumber - 1; // Convert to 0-based

  const result = findSymbolPosition(fullText, lineIndex, symbolName, index);

  if (!result.success) {
    throw new Error(result.error);
  }

  return {
    lineText: lines[lineIndex],
    column: result.characterIndex + 1, // Convert to 1-based column
  };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { Project } = await import("ts-morph");

  describe("findSymbolInLineForSourceFile", () => {
    it("should find symbol and return column position", () => {
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const foo = 1;
function bar() {
  return foo + 2;
}`,
      );

      const result = findSymbolInLineForSourceFile(sourceFile, 1, "foo");
      expect(result).toEqual({
        lineText: "const foo = 1;",
        column: 7,
      });
    });

    it("should find specific occurrence", () => {
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const foo = foo + foo;`,
      );

      const result = findSymbolInLineForSourceFile(sourceFile, 1, "foo", 2);
      expect(result).toEqual({
        lineText: "const foo = foo + foo;",
        column: 19,
      });
    });

    it("should throw on symbol not found", () => {
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const foo = 1;`,
      );

      expect(() => findSymbolInLineForSourceFile(sourceFile, 1, "bar")).toThrow(
        'Symbol "bar" not found on line 1',
      );
    });
  });
}
