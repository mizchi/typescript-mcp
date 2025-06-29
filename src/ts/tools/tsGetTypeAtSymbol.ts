import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import {
  findProjectForFile,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
import { resolveLineParameterForSourceFile as resolveLineParameter } from "../../textUtils/resolveLineParameterForSourceFile.ts";
import { findSymbolInLineForSourceFile as findSymbolInLine } from "../../textUtils/findSymbolInLineForSourceFile.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { type Node, type SourceFile, type Symbol, ts } from "ts-morph";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the symbol (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),
  symbolName: z
    .string()
    .describe("Name of the symbol to get type information for"),
  symbolIndex: z
    .number()
    .optional()
    .default(0)
    .describe(
      "Index of the symbol occurrence if it appears multiple times on the line (0-based)",
    ),
});

interface GetTypeAtSymbolResult {
  symbol: {
    name: string;
    kind: string;
  };
  type: string;
  documentation?: string;
  location: {
    filePath: string;
    line: number;
    column: number;
  };
}

const symbolFlagToKind: Array<[number, string]> = [
  [ts.SymbolFlags.Function, "function"],
  [ts.SymbolFlags.Method, "method"],
  [ts.SymbolFlags.Class, "class"],
  [ts.SymbolFlags.Interface, "interface"],
  [ts.SymbolFlags.TypeAlias, "type alias"],
  [ts.SymbolFlags.Variable, "variable"],
  [ts.SymbolFlags.Property, "property"],
  [ts.SymbolFlags.BlockScopedVariable, "variable"],
  [ts.SymbolFlags.FunctionScopedVariable, "variable"],
  [ts.SymbolFlags.Enum, "enum"],
  [ts.SymbolFlags.EnumMember, "enum member"],
];

function getSymbolKind(flags: ts.SymbolFlags): string {
  const match = symbolFlagToKind.find(([flag]) => flags & flag);
  return match ? match[1] : "unknown";
}

function getSymbolDocumentation(symbol: Symbol): string | undefined {
  const jsDocTags = symbol.getJsDocTags();
  if (jsDocTags.length === 0) return undefined;

  return jsDocTags
    .map((tag) => {
      const tagName = tag.getName();
      const tagTextParts = tag.getText();
      // getText() returns SymbolDisplayPart[] which we need to join
      const textContent = tagTextParts
        .map((part) => part.text)
        .join("")
        .trim();
      return textContent ? `@${tagName} ${textContent}` : `@${tagName}`;
    })
    .join("\n");
}

async function validateAndGetSourceFile(
  root: string,
  filePath: string,
): Promise<{
  absolutePath: string;
  sourceFile: SourceFile;
}> {
  const absolutePath = path.join(root, filePath);
  await fs.access(absolutePath);
  findProjectForFile(absolutePath);
  return {
    absolutePath,
    sourceFile: getOrCreateSourceFileWithRefresh(absolutePath),
  };
}

function getNodeAtPosition(
  sourceFile: SourceFile,
  line: number,
  column: number,
): Node {
  const position = sourceFile.compilerNode.getPositionOfLineAndCharacter(
    line - 1, // Convert to 0-based
    column - 1, // Convert to 0-based
  );

  const node = sourceFile.getDescendantAtPos(position);
  if (!node) {
    throw new Error(
      `No node found at position ${String(line)}:${String(column)}`,
    );
  }
  return node;
}

function getSymbolFromNode(
  node: Node,
  symbolName: string,
  line: number,
  column: number,
): Symbol {
  const symbol = node.getSymbol();
  if (!symbol) {
    throw new Error(
      `No symbol found for "${symbolName}" at ${String(line)}:${
        String(column)
      }`,
    );
  }
  return symbol;
}

async function handleGetTypeAtSymbol({
  root,
  filePath,
  line,
  symbolName,
  symbolIndex = 0,
}: z.infer<typeof schema>): Promise<GetTypeAtSymbolResult> {
  // Validate file and get source file
  const { absolutePath, sourceFile } = await validateAndGetSourceFile(
    root,
    filePath,
  );

  // Resolve line parameter
  const resolvedLine = resolveLineParameter(sourceFile, line);

  // Find the symbol in the line and get column position
  const { column } = findSymbolInLine(
    sourceFile,
    resolvedLine,
    symbolName,
    symbolIndex,
  );

  // Get the node at the position
  const node = getNodeAtPosition(sourceFile, resolvedLine, column);

  // Get symbol information
  const symbol = getSymbolFromNode(node, symbolName, resolvedLine, column);

  // Get type information
  const type = node.getType();
  const typeText = type.getText(node);

  // Get documentation and kind
  const documentation = getSymbolDocumentation(symbol);
  const kind = getSymbolKind(symbol.compilerSymbol.flags);

  return {
    symbol: {
      name: symbol.getName(),
      kind,
    },
    type: typeText,
    documentation,
    location: {
      filePath: absolutePath,
      line: resolvedLine,
      column,
    },
  };
}

function formatGetTypeAtSymbolResult(
  result: GetTypeAtSymbolResult,
  root: string,
): string {
  const { symbol, type, documentation, location } = result;
  const relativePath = path.relative(root, location.filePath);

  const output = [
    `Type information for "${symbol.name}" (${symbol.kind})`,
    `Location: ${relativePath}:${location.line}:${location.column}`,
    "",
    `Type: ${type}`,
  ];

  if (documentation) {
    output.push("");
    output.push("Documentation:");
    output.push(documentation);
  }

  return output.join("\n");
}

export const getTypeAtSymbolTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_type_at_symbol",
  description:
    "Get type information for a TypeScript/JavaScript symbol at a specific location",
  schema,
  execute: async (args) => {
    const result = await handleGetTypeAtSymbol(args);
    return formatGetTypeAtSymbolResult(result, args.root);
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("get_type_at_symbol", () => {
    describe("formatGetTypeAtSymbolResult", () => {
      it("should format type information for a variable", () => {
        const result: GetTypeAtSymbolResult = {
          symbol: {
            name: "count",
            kind: "variable",
          },
          type: "number",
          location: {
            filePath: "/project/src/utils.ts",
            line: 10,
            column: 7,
          },
        };

        expect(formatGetTypeAtSymbolResult(result, "/project"))
          .toMatchInlineSnapshot(`
          "Type information for "count" (variable)
          Location: src/utils.ts:10:7

          Type: number"
        `);
      });

      it("should format type information for a function", () => {
        const result: GetTypeAtSymbolResult = {
          symbol: {
            name: "calculateSum",
            kind: "function",
          },
          type: "(a: number, b: number) => number",
          location: {
            filePath: "/project/src/math.ts",
            line: 5,
            column: 17,
          },
        };

        expect(formatGetTypeAtSymbolResult(result, "/project"))
          .toMatchInlineSnapshot(`
          "Type information for "calculateSum" (function)
          Location: src/math.ts:5:17

          Type: (a: number, b: number) => number"
        `);
      });

      it("should format type information with documentation", () => {
        const result: GetTypeAtSymbolResult = {
          symbol: {
            name: "User",
            kind: "interface",
          },
          type: "User",
          documentation:
            "@description Represents a user in the system\n@since 1.0.0",
          location: {
            filePath: "/project/src/types/user.ts",
            line: 3,
            column: 18,
          },
        };

        expect(formatGetTypeAtSymbolResult(result, "/project"))
          .toMatchInlineSnapshot(`
          "Type information for "User" (interface)
          Location: src/types/user.ts:3:18

          Type: User

          Documentation:
          @description Represents a user in the system
          @since 1.0.0"
        `);
      });

      it("should format type information for a complex type", () => {
        const result: GetTypeAtSymbolResult = {
          symbol: {
            name: "config",
            kind: "variable",
          },
          type: "{ apiUrl: string; timeout: number; retries: number; }",
          location: {
            filePath: "/project/src/config.ts",
            line: 15,
            column: 7,
          },
        };

        expect(formatGetTypeAtSymbolResult(result, "/project"))
          .toMatchInlineSnapshot(`
          "Type information for "config" (variable)
          Location: src/config.ts:15:7

          Type: { apiUrl: string; timeout: number; retries: number; }"
        `);
      });

      it("should format type information for a method", () => {
        const result: GetTypeAtSymbolResult = {
          symbol: {
            name: "getName",
            kind: "method",
          },
          type: "() => string",
          location: {
            filePath: "/project/src/models/Person.ts",
            line: 20,
            column: 3,
          },
        };

        expect(formatGetTypeAtSymbolResult(result, "/project"))
          .toMatchInlineSnapshot(`
          "Type information for "getName" (method)
          Location: src/models/Person.ts:20:3

          Type: () => string"
        `);
      });

      it("should format type information for a type alias", () => {
        const result: GetTypeAtSymbolResult = {
          symbol: {
            name: "UserID",
            kind: "type alias",
          },
          type: "string",
          location: {
            filePath: "/project/src/types/index.ts",
            line: 1,
            column: 13,
          },
        };

        expect(formatGetTypeAtSymbolResult(result, "/project"))
          .toMatchInlineSnapshot(`
          "Type information for "UserID" (type alias)
          Location: src/types/index.ts:1:13

          Type: string"
        `);
      });
    });
  });
}
