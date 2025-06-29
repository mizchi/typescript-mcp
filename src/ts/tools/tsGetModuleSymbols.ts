import { z } from "zod";
import path from "path";
import { getModuleSymbols } from "../navigations/getModuleSymbols.ts";
import { findProjectForFile } from "../projectCache.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  moduleName: z
    .string()
    .describe("The module to analyze (e.g., 'neverthrow', './local-module')"),
  filePath: z
    .string()
    .optional()
    .describe("Context file for resolving relative imports"),
});

interface ModuleSymbol {
  name: string;
  kind: string;
}

interface GetModuleSymbolsResult {
  message: string;
  symbols: {
    types: ModuleSymbol[];
    interfaces: ModuleSymbol[];
    classes: ModuleSymbol[];
    functions: ModuleSymbol[];
    variables: ModuleSymbol[];
    others: ModuleSymbol[];
  };
}

function handleGetModuleSymbols({
  root,
  moduleName,
  filePath,
}: z.infer<typeof schema>): GetModuleSymbolsResult {
  const project = findProjectForFile(
    filePath ? path.join(root, filePath) : root,
  );

  // Get module symbols
  const result = getModuleSymbols(project, {
    moduleName,
    filePath: filePath ? path.join(root, filePath) : undefined,
  });

  if (result.isErr()) {
    throw new Error(result.error);
  }

  return result.value;
}

function formatGetModuleSymbolsResult(
  result: GetModuleSymbolsResult,
): string {
  const { message, symbols } = result;

  // Format the output
  const output = [message, ""];

  // Add symbols by category
  if (symbols.types.length > 0) {
    output.push(`📋 Types: ${symbols.types.map((s) => s.name).join(", ")}`);
  }
  if (symbols.interfaces.length > 0) {
    output.push(
      `📐 Interfaces: ${symbols.interfaces.map((s) => s.name).join(", ")}`,
    );
  }
  if (symbols.classes.length > 0) {
    output.push(`🏗️ Classes: ${symbols.classes.map((s) => s.name).join(", ")}`);
  }
  if (symbols.functions.length > 0) {
    output.push(
      `⚡ Functions: ${symbols.functions.map((s) => s.name).join(", ")}`,
    );
  }
  if (symbols.variables.length > 0) {
    output.push(
      `📦 Variables: ${symbols.variables.map((s) => s.name).join(", ")}`,
    );
  }
  if (symbols.others.length > 0) {
    output.push(`❓ Others: ${symbols.others.map((s) => s.name).join(", ")}`);
  }

  return output.join("\n");
}

export const getModuleSymbolsTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_module_symbols",
  description:
    "Get all exported symbols from a TypeScript/JavaScript module without detailed signatures",
  schema,
  execute: (args) => {
    const result = handleGetModuleSymbols(args);
    return Promise.resolve(formatGetModuleSymbolsResult(result));
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("get_module_symbols", () => {
    describe("formatGetModuleSymbolsResult", () => {
      it("should format module with all symbol types", () => {
        const result: GetModuleSymbolsResult = {
          message: "Found 10 exported symbols in module 'my-utils'",
          symbols: {
            types: [
              { name: "UserID", kind: "TypeAlias" },
              { name: "Config", kind: "TypeAlias" },
            ],
            interfaces: [
              { name: "IUser", kind: "Interface" },
              { name: "IProduct", kind: "Interface" },
            ],
            classes: [
              { name: "UserService", kind: "Class" },
              { name: "ProductService", kind: "Class" },
            ],
            functions: [
              { name: "createUser", kind: "Function" },
              { name: "deleteUser", kind: "Function" },
            ],
            variables: [
              { name: "DEFAULT_CONFIG", kind: "Variable" },
              { name: "API_URL", kind: "Variable" },
            ],
            others: [],
          },
        };

        expect(formatGetModuleSymbolsResult(result)).toMatchInlineSnapshot(`
          "Found 10 exported symbols in module 'my-utils'

          📋 Types: UserID, Config
          📐 Interfaces: IUser, IProduct
          🏗️ Classes: UserService, ProductService
          ⚡ Functions: createUser, deleteUser
          📦 Variables: DEFAULT_CONFIG, API_URL"
        `);
      });

      it("should format module with only some symbol types", () => {
        const result: GetModuleSymbolsResult = {
          message: "Found 3 exported symbols in module 'react'",
          symbols: {
            types: [{ name: "FC", kind: "TypeAlias" }],
            interfaces: [],
            classes: [],
            functions: [
              { name: "useState", kind: "Function" },
              { name: "useEffect", kind: "Function" },
            ],
            variables: [],
            others: [],
          },
        };

        expect(formatGetModuleSymbolsResult(result)).toMatchInlineSnapshot(`
          "Found 3 exported symbols in module 'react'

          📋 Types: FC
          ⚡ Functions: useState, useEffect"
        `);
      });

      it("should format module with no symbols", () => {
        const result: GetModuleSymbolsResult = {
          message: "No exported symbols found in module 'empty-module'",
          symbols: {
            types: [],
            interfaces: [],
            classes: [],
            functions: [],
            variables: [],
            others: [],
          },
        };

        expect(formatGetModuleSymbolsResult(result)).toMatchInlineSnapshot(`
          "No exported symbols found in module 'empty-module'
          "
        `);
      });

      it("should format module with other symbol types", () => {
        const result: GetModuleSymbolsResult = {
          message: "Found 2 exported symbols in module 'special'",
          symbols: {
            types: [],
            interfaces: [],
            classes: [],
            functions: [],
            variables: [],
            others: [
              { name: "namespace", kind: "Namespace" },
              { name: "enum", kind: "Enum" },
            ],
          },
        };

        expect(formatGetModuleSymbolsResult(result)).toMatchInlineSnapshot(`
          "Found 2 exported symbols in module 'special'

          ❓ Others: namespace, enum"
        `);
      });

      it("should handle long symbol lists", () => {
        const result: GetModuleSymbolsResult = {
          message: "Found many exported symbols in module 'large-lib'",
          symbols: {
            types: [],
            interfaces: [],
            classes: [],
            functions: Array.from({ length: 10 }, (_, i) => ({
              name: `func${i}`,
              kind: "Function",
            })),
            variables: [],
            others: [],
          },
        };

        expect(formatGetModuleSymbolsResult(result)).toMatchInlineSnapshot(`
          "Found many exported symbols in module 'large-lib'

          ⚡ Functions: func0, func1, func2, func3, func4, func5, func6, func7, func8, func9"
        `);
      });
    });
  });
}
