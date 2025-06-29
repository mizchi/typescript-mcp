import { z } from "zod";
import path from "path";
import {
  getTypeSignature,
  type TypeSignature,
} from "../navigations/getTypeSignature.ts";
import { findProjectForFile } from "../projectCache.ts";
import {
  formatTypeSignature,
  type FormatTypeSignatureInput,
} from "../signatureFormatter.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  moduleName: z
    .string()
    .describe("The module containing the type (e.g., 'neverthrow', './utils')"),
  typeName: z.string().describe("The name of the type to analyze"),
  filePath: z
    .string()
    .optional()
    .describe("Context file for resolving relative imports"),
});

type GetTypeInModuleResult = FormatTypeSignatureInput;

function handleGetTypeInModule({
  root,
  moduleName,
  typeName,
  filePath,
}: z.infer<typeof schema>): GetTypeInModuleResult {
  const project = findProjectForFile(
    filePath ? path.join(root, filePath) : root,
  );

  // Get type signature
  const result = getTypeSignature(project, {
    moduleName,
    typeName,
    filePath: filePath ? path.join(root, filePath) : undefined,
  });

  if (result.isErr()) {
    throw new Error(result.error);
  }

  const { message, signature, documentation, relatedTypes } = result.value;

  return {
    message,
    signature,
    documentation,
    relatedTypes,
    root,
  };
}

export { formatTypeSignature as formatGetTypeInModuleResult };

export const getTypeInModuleTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_type_in_module",
  description:
    "Get detailed signature information for a specific type (function, class, interface, type alias, etc.) from a module",
  schema,
  execute: (args) => {
    const result = handleGetTypeInModule(args);
    return Promise.resolve(formatTypeSignature(result));
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("get_type_in_module", () => {
    describe("formatGetTypeInModuleResult", () => {
      it("should format function signature", () => {
        const signature: TypeSignature = {
          kind: "function",
          functionSignatures: [
            {
              parameters: [
                { name: "a", type: "number", optional: false },
                { name: "b", type: "number", optional: false },
              ],
              returnType: "number",
            },
          ],
        };

        const result: GetTypeInModuleResult = {
          message: "Found type 'add' in module 'math-utils'",
          signature,
          root: "/project",
        };

        expect(formatTypeSignature(result)).toMatchInlineSnapshot(`
"Found type 'add' in module 'math-utils'

📝 Function Signatures:
  (a: number, b: number): number"
        `);
      });

      it("should format function with multiple overloads", () => {
        const signature: TypeSignature = {
          kind: "function",
          functionSignatures: [
            {
              parameters: [{ name: "value", type: "string", optional: false }],
              returnType: "string",
            },
            {
              parameters: [{ name: "value", type: "number", optional: false }],
              returnType: "number",
            },
          ],
        };

        const result: GetTypeInModuleResult = {
          message: "Found type 'identity' in module 'utils'",
          signature,
          root: "/project",
        };

        expect(formatTypeSignature(result)).toMatchInlineSnapshot(`
"Found type 'identity' in module 'utils'

📝 Function Signatures:

Overload 1:
  (value: string): string

Overload 2:
  (value: number): number"
        `);
      });

      it("should format type alias", () => {
        const signature: TypeSignature = {
          kind: "type",
          typeDefinition: "string | number | boolean",
        };

        const result: GetTypeInModuleResult = {
          message: "Found type 'Primitive' in module 'types'",
          signature,
          root: "/project",
        };

        expect(formatTypeSignature(result)).toMatchInlineSnapshot(`
"Found type 'Primitive' in module 'types'

📋 Type Definition:
  Type: string | number | boolean"
        `);
      });

      it("should format interface", () => {
        const signature: TypeSignature = {
          kind: "interface",
          properties: [
            { name: "id", type: "number", optional: false, readonly: false },
            { name: "name", type: "string", optional: false, readonly: false },
            { name: "email", type: "string", optional: true, readonly: false },
          ],
        };

        const result: GetTypeInModuleResult = {
          message: "Found type 'User' in module 'models'",
          signature,
          root: "/project",
        };

        expect(formatTypeSignature(result)).toMatchInlineSnapshot(`
"Found type 'User' in module 'models'

📐 Interface Definition:

  Properties:
    id: number
    name: string
    email?: string"
        `);
      });

      it("should format class with methods", () => {
        const signature: TypeSignature = {
          kind: "class",
          properties: [
            { name: "name", type: "string", optional: false, readonly: false },
          ],
          methods: [
            {
              name: "greet",
              signatures: [
                {
                  parameters: [],
                  returnType: "void",
                },
              ],
            },
            {
              name: "setName",
              signatures: [
                {
                  parameters: [{
                    name: "name",
                    type: "string",
                    optional: false,
                  }],
                  returnType: "void",
                },
              ],
            },
          ],
        };

        const result: GetTypeInModuleResult = {
          message: "Found type 'Person' in module 'entities'",
          signature,
          root: "/project",
        };

        expect(formatTypeSignature(result)).toMatchInlineSnapshot(`
"Found type 'Person' in module 'entities'

🏗️ Class Definition:

  Properties:
    name: string

  Methods:
    greet(): void
    setName(name: string): void"
        `);
      });

      it("should format with documentation", () => {
        const signature: TypeSignature = {
          kind: "function",
          functionSignatures: [
            {
              parameters: [{ name: "str", type: "string", optional: false }],
              returnType: "string",
            },
          ],
        };

        const result: GetTypeInModuleResult = {
          message: "Found type 'capitalize' in module 'string-utils'",
          signature,
          documentation: "Capitalizes the first letter of a string",
          root: "/project",
        };

        expect(formatTypeSignature(result)).toMatchInlineSnapshot(`
"Found type 'capitalize' in module 'string-utils'

📖 Documentation:
Capitalizes the first letter of a string

📝 Function Signatures:
  (str: string): string"
        `);
      });
    });
  });
}
