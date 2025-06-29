import { describe, expect, it } from "vitest";
import {
  formatCodeSnippet,
  formatFilePath,
  formatLocation,
  formatRange,
  truncateText,
} from "./formatting.ts";
import { Location, Range } from "vscode-languageserver-types";

describe("formatting", () => {
  describe("formatLocation", () => {
    it("should format location with 1-based line and character", () => {
      const location: Location = {
        uri: "file:///path/to/file.ts",
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 10 },
        },
      };
      const result = formatLocation(location);
      expect(result).toBe("file:///path/to/file.ts:1:6");
    });

    it("should handle multi-line locations", () => {
      const location: Location = {
        uri: "file:///test.ts",
        range: {
          start: { line: 10, character: 0 },
          end: { line: 15, character: 20 },
        },
      };
      const result = formatLocation(location);
      expect(result).toBe("file:///test.ts:11:1");
    });
  });

  describe("formatRange", () => {
    it("should format single-line range", () => {
      const range: Range = {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 20 },
      };
      const result = formatRange(range);
      expect(result).toBe("6:11-21");
    });

    it("should format multi-line range", () => {
      const range: Range = {
        start: { line: 5, character: 10 },
        end: { line: 8, character: 15 },
      };
      const result = formatRange(range);
      expect(result).toBe("6:11 - 9:16");
    });

    it("should handle zero-width range", () => {
      const range: Range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      };
      const result = formatRange(range);
      expect(result).toBe("1:1-1");
    });
  });

  describe("formatFilePath", () => {
    it("should return relative path when file is under root", () => {
      const absolutePath = "/project/src/components/Button.tsx";
      const root = "/project";
      const result = formatFilePath(absolutePath, root);
      expect(result).toBe("src/components/Button.tsx");
    });

    it("should return absolute path when file is not under root", () => {
      const absolutePath = "/other/path/file.ts";
      const root = "/project";
      const result = formatFilePath(absolutePath, root);
      expect(result).toBe("/other/path/file.ts");
    });

    it("should handle root with trailing slash", () => {
      const absolutePath = "/project/src/index.ts";
      const root = "/project/";
      const result = formatFilePath(absolutePath, root);
      expect(result).toBe("src/index.ts");
    });
  });

  describe("truncateText", () => {
    it("should not truncate text shorter than max length", () => {
      const text = "short text";
      const result = truncateText(text, 20);
      expect(result).toBe("short text");
    });

    it("should truncate text longer than max length", () => {
      const text = "This is a very long text that needs to be truncated";
      const result = truncateText(text, 20);
      expect(result).toBe("This is a very long ...");
    });

    it("should use default max length of 50", () => {
      const text = "a".repeat(60);
      const result = truncateText(text);
      expect(result).toBe("a".repeat(50) + "...");
    });

    it("should handle empty string", () => {
      const result = truncateText("", 10);
      expect(result).toBe("");
    });
  });

  describe("formatCodeSnippet", () => {
    it("should format code snippet with line numbers", () => {
      const lines = ["const x = 1;", "const y = 2;", "console.log(x + y);"];
      const result = formatCodeSnippet(lines, 10);
      expect(result).toBe(
        "  10: const x = 1;\n  11: const y = 2;\n  12: console.log(x + y);",
      );
    });

    it("should highlight specified line", () => {
      const lines = ["function test() {", "  return 42;", "}"];
      const result = formatCodeSnippet(lines, 5, 6);
      expect(result).toBe("  5: function test() {\n→ 6:   return 42;\n  7: }");
    });

    it("should handle empty lines", () => {
      const lines = ["", "const x = 1;", ""];
      const result = formatCodeSnippet(lines, 1);
      expect(result).toBe("  1: \n  2: const x = 1;\n  3: ");
    });

    it("should work with single line", () => {
      const lines = ["const x = 1;"];
      const result = formatCodeSnippet(lines, 100, 100);
      expect(result).toBe("→ 100: const x = 1;");
    });
  });
});
