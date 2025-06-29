import { describe, expect, it } from "vitest";
import { applyTextEdits } from "./applyTextEdits.ts";
import { TextEdit } from "vscode-languageserver-types";

describe("applyTextEdits", () => {
  it("should apply single line edit", () => {
    const content = "Hello world!";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 11 },
        },
        newText: "TypeScript",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("Hello TypeScript!");
  });

  it("should apply multiple edits on same line", () => {
    const content = "const x = 1; const y = 2;";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 7 },
        },
        newText: "a",
      },
      {
        range: {
          start: { line: 0, character: 19 },
          end: { line: 0, character: 20 },
        },
        newText: "b",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("const a = 1; const b = 2;");
  });

  it("should apply multi-line edit", () => {
    const content = `line 1
line 2
line 3
line 4`;
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 1, character: 5 },
          end: { line: 2, character: 5 },
        },
        newText: "modified",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe(`line 1
line modified3
line 4`);
  });

  it("should handle deletion (empty newText)", () => {
    const content = "Hello beautiful world!";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 16 },
        },
        newText: "",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("Hello world!");
  });

  it("should handle insertion (zero-width range)", () => {
    const content = "Hello world!";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 5 },
        },
        newText: " beautiful",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("Hello beautiful world!");
  });

  it("should handle multiple edits in reverse order", () => {
    const content = `function test() {
  return 42;
}`;
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 9 },
          end: { line: 0, character: 13 },
        },
        newText: "calculate",
      },
      {
        range: {
          start: { line: 1, character: 9 },
          end: { line: 1, character: 11 },
        },
        newText: "100",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe(`function calculate() {
  return 100;
}`);
  });

  it("should handle newline insertion", () => {
    const content = "line1line2";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 5 },
        },
        newText: "\n",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("line1\nline2");
  });

  it("should handle replacement across multiple lines", () => {
    const content = `const x = {
  a: 1,
  b: 2,
  c: 3
};`;
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 10 },
          end: { line: 4, character: 1 },
        },
        newText: "[1, 2, 3]",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("const x = [1, 2, 3];");
  });

  it("should handle empty content", () => {
    const content = "";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        newText: "Hello",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("Hello");
  });

  it("should handle edits at end of file", () => {
    const content = "Hello";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 5 },
        },
        newText: " World",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("Hello World");
  });

  it("should preserve other lines when editing", () => {
    const content = `line 1
line 2
line 3`;
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 6 },
        },
        newText: "modified",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe(`line 1
modified
line 3`);
  });

  it("should handle overlapping edits by applying in reverse order", () => {
    const content = "abcdefghijk";
    const edits: TextEdit[] = [
      {
        range: {
          start: { line: 0, character: 2 },
          end: { line: 0, character: 5 },
        },
        newText: "X",
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 9 },
        },
        newText: "Y",
      },
    ];

    const result = applyTextEdits(content, edits);
    expect(result).toBe("abXfgYjk");
  });
});
