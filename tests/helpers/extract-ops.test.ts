import { describe, expect, it } from "vitest";
import {
  parseRenameCommentsFromContent,
  removeRenameComments,
} from "./extract-ops.ts";

describe("extract-ops", () => {
  describe("parseRenameCommentsFromContent", () => {
    it("should parse single @rename comment", () => {
      const content = `const foo = 1; // @rename foo bar
console.log(foo);
export { foo };`;

      const operations = parseRenameCommentsFromContent(content);

      expect(operations).toHaveLength(1);
      expect(operations[0]).toEqual({
        line: 1,
        symbolName: "foo",
        newName: "bar",
      });
    });

    it("should parse multiple @rename comments", () => {
      const content = `// Multiple operations
const foo1 = 1; // @rename foo1 bar1

function foo2(x: number): number { // @rename foo2 bar2
  return x * 2;
}

class MyClass { // @rename MyClass YourClass
  constructor() {}
}`;

      const operations = parseRenameCommentsFromContent(content);

      expect(operations).toHaveLength(3);
      expect(operations[0]).toEqual({
        line: 2,
        symbolName: "foo1",
        newName: "bar1",
      });
      expect(operations[1]).toEqual({
        line: 4,
        symbolName: "foo2",
        newName: "bar2",
      });
      expect(operations[2]).toEqual({
        line: 8,
        symbolName: "MyClass",
        newName: "YourClass",
      });
    });

    it("should handle various whitespace formats", () => {
      const content = `const a = 1; //@rename a b
const c = 2; //   @rename   c   d  
const e = 3; // @rename e f extra text ignored`;

      const operations = parseRenameCommentsFromContent(content);

      expect(operations).toHaveLength(3);
      expect(operations[0]).toEqual({ line: 1, symbolName: "a", newName: "b" });
      expect(operations[1]).toEqual({ line: 2, symbolName: "c", newName: "d" });
      expect(operations[2]).toEqual({ line: 3, symbolName: "e", newName: "f" });
    });

    it("should return empty array when no @rename comments found", () => {
      const content = `const foo = 1;
// regular comment
console.log(foo);`;

      const operations = parseRenameCommentsFromContent(content);

      expect(operations).toHaveLength(0);
    });
  });

  describe("removeRenameComments", () => {
    it("should remove standalone @rename comment lines", () => {
      const content = `const foo = 1;
// @rename foo bar
console.log(foo);`;

      const result = removeRenameComments(content);

      expect(result).toBe(`const foo = 1;
console.log(foo);`);
    });

    it("should keep inline @rename comments", () => {
      const content = `const foo = 1; // @rename foo bar
console.log(foo);`;

      const result = removeRenameComments(content);

      expect(result).toBe(`const foo = 1; // @rename foo bar
console.log(foo);`);
    });

    it("should handle multiple comment formats", () => {
      const content = `// Regular comment
// @rename foo bar
const foo = 1; // @rename foo bar inline
  // @rename baz qux  
console.log(foo);`;

      const result = removeRenameComments(content);

      expect(result).toBe(`// Regular comment
const foo = 1; // @rename foo bar inline
console.log(foo);`);
    });
  });
});
