import { describe, expect, it } from "vitest";
import {
  formatTypeSignature,
  type FormatTypeSignatureInput,
} from "./signatureFormatter.ts";
import type { Definition } from "./navigations/getTypeSignature.ts";

describe("signatureFormatter", () => {
  describe("formatTypeSignature", () => {
    it("should format a simple function signature", () => {
      const input: FormatTypeSignatureInput = {
        message: "Type signature for myFunction",
        signature: {
          kind: "function",
          functionSignatures: [
            {
              parameters: [
                { name: "x", type: "number", optional: false },
                { name: "y", type: "string", optional: false },
              ],
              returnType: "boolean",
            },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("Type signature for myFunction");
      expect(result).toContain("📝 Function Signatures:");
      expect(result).toContain("(x: number, y: string): boolean");
    });

    it("should format function with optional parameters and defaults", () => {
      const input: FormatTypeSignatureInput = {
        message: "Function with optionals",
        signature: {
          kind: "function",
          functionSignatures: [
            {
              parameters: [
                { name: "name", type: "string", optional: false },
                { name: "age", type: "number", optional: true },
                {
                  name: "active",
                  type: "boolean",
                  optional: false,
                  defaultValue: "true",
                },
              ],
              returnType: "void",
            },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain(
        "(name: string, age?: number, active: boolean = true): void",
      );
    });

    it("should format function with type parameters", () => {
      const input: FormatTypeSignatureInput = {
        message: "Generic function",
        signature: {
          kind: "function",
          functionSignatures: [
            {
              typeParameters: ["T", "U extends string"],
              parameters: [
                { name: "value", type: "T", optional: false },
                { name: "key", type: "U", optional: false },
              ],
              returnType: "T & { key: U }",
            },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain(
        "<T, U extends string>(value: T, key: U): T & { key: U }",
      );
    });

    it("should format function overloads", () => {
      const input: FormatTypeSignatureInput = {
        message: "Overloaded function",
        signature: {
          kind: "function",
          functionSignatures: [
            {
              parameters: [{ name: "x", type: "string", optional: false }],
              returnType: "string",
            },
            {
              parameters: [{ name: "x", type: "number", optional: false }],
              returnType: "number",
            },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("Overload 1:");
      expect(result).toContain("(x: string): string");
      expect(result).toContain("Overload 2:");
      expect(result).toContain("(x: number): number");
    });

    it("should format type definition", () => {
      const input: FormatTypeSignatureInput = {
        message: "Type alias",
        signature: {
          kind: "type",
          typeDefinition: "{ id: number; name: string; active?: boolean }",
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("📋 Type Definition:");
      expect(result).toContain(
        "Type: { id: number; name: string; active?: boolean }",
      );
    });

    it("should format type with type parameters", () => {
      const input: FormatTypeSignatureInput = {
        message: "Generic type",
        signature: {
          kind: "type",
          typeDefinition: "{ value: T; next?: Node<T> }",
          typeParameters: ["T"],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("Type Parameters: <T>");
      expect(result).toContain("Type: { value: T; next?: Node<T> }");
    });

    it("should format interface definition", () => {
      const input: FormatTypeSignatureInput = {
        message: "Interface User",
        signature: {
          kind: "interface",
          properties: [
            { name: "id", type: "number", optional: false, readonly: false },
            { name: "name", type: "string", optional: false, readonly: false },
            { name: "email", type: "string", optional: true, readonly: false },
          ],
          methods: [
            {
              name: "greet",
              signatures: [
                {
                  parameters: [{
                    name: "greeting",
                    type: "string",
                    optional: false,
                  }],
                  returnType: "void",
                },
              ],
            },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("📐 Interface Definition:");
      expect(result).toContain("Properties:");
      expect(result).toContain("id: number");
      expect(result).toContain("name: string");
      expect(result).toContain("email?: string");
      expect(result).toContain("Methods:");
      expect(result).toContain("greet(greeting: string): void");
    });

    it("should format class definition", () => {
      const input: FormatTypeSignatureInput = {
        message: "Class Calculator",
        signature: {
          kind: "class",
          properties: [
            {
              name: "result",
              type: "number",
              optional: false,
              readonly: false,
            },
          ],
          methods: [
            {
              name: "add",
              signatures: [
                {
                  parameters: [
                    { name: "a", type: "number", optional: false },
                    { name: "b", type: "number", optional: false },
                  ],
                  returnType: "number",
                },
              ],
            },
            {
              name: "multiply",
              signatures: [
                {
                  typeParameters: ["T extends number"],
                  parameters: [
                    { name: "values", type: "T[]", optional: false },
                  ],
                  returnType: "T",
                },
              ],
            },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("🏗️ Class Definition:");
      expect(result).toContain("Properties:");
      expect(result).toContain("result: number");
      expect(result).toContain("Methods:");
      expect(result).toContain("add(a: number, b: number): number");
      expect(result).toContain("multiply<T extends number>(values: T[]): T");
    });

    it("should format variable type", () => {
      const input: FormatTypeSignatureInput = {
        message: "Variable config",
        signature: {
          kind: "variable",
          typeDefinition: "{ port: number; host: string }",
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("📦 Variable Type:");
      expect(result).toContain("Type: { port: number; host: string }");
    });

    it("should include definitions when provided", () => {
      const definitions: Definition[] = [
        {
          kind: "Interface",
          filePath: "/project/src/types.ts",
          line: 10,
          column: 1,
          name: "User",
        },
        {
          kind: "Alias",
          filePath: "/project/src/aliases.ts",
          line: 5,
          column: 1,
          name: "UserID",
          originalName: "number",
        },
      ];

      const input: FormatTypeSignatureInput = {
        message: "Type with definitions",
        signature: {
          kind: "type",
          typeDefinition: "User",
          definitions,
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("📍 Definitions:");
      expect(result).toContain("Interface: src/types.ts:10:1 (User)");
      expect(result).toContain("Alias: src/aliases.ts:5:1 (UserID) → number");
    });

    it("should include related types when provided", () => {
      const relatedTypes: Definition[] = [
        {
          kind: "Type",
          filePath: "/project/src/models.ts",
          line: 20,
          column: 1,
          name: "BaseModel",
        },
        {
          kind: "Interface",
          filePath: "/project/node_modules/@types/node/index.d.ts",
          line: 100,
          column: 1,
          name: "EventEmitter",
          importedFrom: "events",
        },
      ];

      const input: FormatTypeSignatureInput = {
        message: "Type with related types",
        signature: {
          kind: "class",
          properties: [],
        },
        relatedTypes,
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("🔗 Related Types:");
      expect(result).toContain("Type: src/models.ts:20:1 (BaseModel)");
      expect(result).toContain(
        'Interface: node_modules/@types/node/index.d.ts:100:1 (EventEmitter) from "events"',
      );
    });

    it("should include documentation when provided", () => {
      const input: FormatTypeSignatureInput = {
        message: "Documented function",
        signature: {
          kind: "function",
          functionSignatures: [
            {
              parameters: [],
              returnType: "void",
            },
          ],
        },
        documentation:
          "This function does something very important.\n\n@example\n  doSomething();",
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("📖 Documentation:");
      expect(result).toContain("This function does something very important.");
      expect(result).toContain("@example");
      expect(result).toContain("doSomething();");
    });

    it("should handle interface with type parameters", () => {
      const input: FormatTypeSignatureInput = {
        message: "Generic interface",
        signature: {
          kind: "interface",
          typeParameters: ["T", "K extends keyof T"],
          properties: [
            { name: "value", type: "T", optional: false, readonly: false },
            { name: "key", type: "K", optional: false, readonly: false },
          ],
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("Type Parameters: <T, K extends keyof T>");
      expect(result).toContain("value: T");
      expect(result).toContain("key: K");
    });

    it("should handle empty signatures gracefully", () => {
      const input: FormatTypeSignatureInput = {
        message: "Empty signature",
        signature: {
          kind: "unknown" as any,
        },
        root: "/project",
      };

      const result = formatTypeSignature(input);

      expect(result).toContain("Empty signature");
      expect(result).not.toContain("📝");
      expect(result).not.toContain("📋");
      expect(result).not.toContain("📐");
      expect(result).not.toContain("🏗️");
      expect(result).not.toContain("📦");
    });
  });
});
