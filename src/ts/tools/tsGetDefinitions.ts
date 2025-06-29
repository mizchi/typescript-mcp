import { z } from "zod";
import path from "path";
import { goToDefinition } from "../navigations/goToDefinition.ts";
import {
  getOrCreateProject,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
import { resolveLineParameterForSourceFile as resolveLineParameter } from "../../textUtils/resolveLineParameterForSourceFile.ts";
import { findSymbolInLine } from "../../textUtils/findSymbolInLine.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { definitionContextSchema } from "../../common/schemas.ts";

const schema = definitionContextSchema;

interface GetDefinitionsResult {
  message: string;
  symbol: {
    name: string;
    kind: string;
  };
  definitions: {
    filePath: string;
    line: number;
    column: number;
    lineText: string;
  }[];
}

async function handleGetDefinitions(
  params: z.infer<typeof schema>
): Promise<GetDefinitionsResult> {
  const { root, filePath, line, symbolName } = params;
  
  // Always treat paths as relative to root
  const absolutePath = path.join(root, filePath);
  
  // Get or create project based on the file path
  const project = await getOrCreateProject(absolutePath);
  
  // Ensure the source file is loaded in the project with fresh content
  const sourceFile = getOrCreateSourceFileWithRefresh(absolutePath);
  
  // Resolve line parameter
  const resolvedLine = resolveLineParameter(sourceFile, line);
  
  // Get the line content
  const lines = sourceFile.getFullText().split("\n");
  const lineContent = lines[resolvedLine - 1];
  
  // Find the symbol position in the line
  const symbolResult = findSymbolInLine(lineContent, symbolName);
  
  if ("error" in symbolResult) {
    throw new Error(symbolResult.error);
  }
  
  const column = symbolResult.characterIndex + 1; // Convert to 1-based
  
  // Find definition using the column position
  const result = goToDefinition(project, {
    filePath: absolutePath,
    line: resolvedLine,
    column,
  });

  if (result.isErr()) {
    throw new Error(result.error);
  }

  return result.value;
}

function formatGetDefinitionsResult(
  result: GetDefinitionsResult,
  root: string,
  options?: { before?: number; after?: number }
): string {
  const { message, definitions, symbol } = result;

  // Format the output
  const output = [
    message,
    `Symbol: ${symbol.name} (${symbol.kind})`,
    "",
    "Definitions:",
  ];

  for (const def of definitions) {
    const relativePath = path.relative(root, def.filePath);
    output.push(
      `  ${relativePath}:${def.line}:${def.column} - ${def.lineText}`
    );

    // Add context lines if requested
    if (options?.before || options?.after) {
      const defSourceFile = getOrCreateSourceFileWithRefresh(def.filePath);
      const fullText = defSourceFile.getFullText();
      const lines = fullText.split("\n");

      const startLine = Math.max(0, def.line - 1 - (options.before || 0));
      const endLine = Math.min(lines.length, def.line + (options.after || 0));

      if (options.before && startLine < def.line - 1) {
        output.push("");
        for (let i = startLine; i < def.line - 1; i++) {
          output.push(`    ${i + 1}: ${lines[i]}`);
        }
      }

      // Show the definition line with arrow
      output.push(`  → ${def.line}: ${lines[def.line - 1]}`);

      if (options.after && def.line < endLine) {
        for (let i = def.line; i < endLine; i++) {
          output.push(`    ${i + 1}: ${lines[i]}`);
        }
      }
    }
  }

  return output.join("\n");
}

export const getDefinitionsTool: ToolDef<typeof schema> = {
  name: "ts_get_definitions",
  description: "Get the definition(s) of a TypeScript symbol",
  schema,
  execute: async ({ root, filePath, line, symbolName, before, after }) => {
    const result = await handleGetDefinitions({
      root,
      filePath,
      line,
      symbolName,
      before,
      after,
    });
    return Promise.resolve(
      formatGetDefinitionsResult(result, root, { before, after })
    );
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("get_definitions", () => {
    describe("formatGetDefinitionsResult", () => {
      it("should format single definition", () => {
        const result: GetDefinitionsResult = {
          message: "Found 1 definition for 'MyComponent'",
          symbol: {
            name: "MyComponent",
            kind: "function",
          },
          definitions: [
            {
              filePath: "/project/src/components/MyComponent.tsx",
              line: 5,
              column: 17,
              lineText: "export function MyComponent() {",
            },
          ],
        };

        const formatted = formatGetDefinitionsResult(result, "/project");
        expect(formatted).toMatchInlineSnapshot(`
          "Found 1 definition for 'MyComponent'
          Symbol: MyComponent (function)

          Definitions:
            src/components/MyComponent.tsx:5:17 - export function MyComponent() {"
        `);
      });

      it("should format multiple definitions", () => {
        const result: GetDefinitionsResult = {
          message: "Found 2 definitions for 'User'",
          symbol: {
            name: "User",
            kind: "interface",
          },
          definitions: [
            {
              filePath: "/project/src/types/user.ts",
              line: 3,
              column: 18,
              lineText: "export interface User {",
            },
            {
              filePath: "/project/src/models/user.ts",
              line: 10,
              column: 14,
              lineText: "export class User implements IUser {",
            },
          ],
        };

        const formatted = formatGetDefinitionsResult(result, "/project");
        expect(formatted).toMatchInlineSnapshot(`
          "Found 2 definitions for 'User'
          Symbol: User (interface)

          Definitions:
            src/types/user.ts:3:18 - export interface User {
            src/models/user.ts:10:14 - export class User implements IUser {"
        `);
      });

      it("should format with no definitions", () => {
        const result: GetDefinitionsResult = {
          message: "No definition found for 'unknownSymbol'",
          symbol: {
            name: "unknownSymbol",
            kind: "unknown",
          },
          definitions: [],
        };

        const formatted = formatGetDefinitionsResult(result, "/project");
        expect(formatted).toMatchInlineSnapshot(`
          "No definition found for 'unknownSymbol'
          Symbol: unknownSymbol (unknown)

          Definitions:"
        `);
      });

      it("should handle type alias definitions", () => {
        const result: GetDefinitionsResult = {
          message: "Found 1 definition for 'UserID'",
          symbol: {
            name: "UserID",
            kind: "type alias",
          },
          definitions: [
            {
              filePath: "/project/src/types/index.ts",
              line: 7,
              column: 13,
              lineText: "export type UserID = string;",
            },
          ],
        };

        const formatted = formatGetDefinitionsResult(result, "/project");
        expect(formatted).toMatchInlineSnapshot(`
          "Found 1 definition for 'UserID'
          Symbol: UserID (type alias)

          Definitions:
            src/types/index.ts:7:13 - export type UserID = string;"
        `);
      });
    });
  });
}
