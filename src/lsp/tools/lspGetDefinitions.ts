import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { readFileSync } from "fs";
import path from "path";
import { getActiveClient } from "../lspClient.ts";
import { parseLineNumber } from "../../textUtils/parseLineNumber.ts";
import { findSymbolInLine } from "../../textUtils/findSymbolInLine.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the symbol (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),
  symbolName: z.string().describe("Name of the symbol to get definitions for"),
  before: z
    .number()
    .optional()
    .describe("Number of lines to show before the definition"),
  after: z
    .number()
    .optional()
    .describe("Number of lines to show after the definition"),
});

type GetDefinitionsRequest = z.infer<typeof schema>;

interface Definition {
  filePath: string;
  line: number;
  column: number;
  symbolName: string;
  preview: string;
}

interface GetDefinitionsSuccess {
  message: string;
  definitions: Definition[];
}

// LSP definition/location types
interface Location {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

type DefinitionResult = Location | Location[] | null;

/**
 * Gets definitions for a TypeScript symbol using LSP
 */
async function getDefinitionsWithLSP(
  request: GetDefinitionsRequest,
): Promise<Result<GetDefinitionsSuccess, string>> {
  try {
    const client = getActiveClient();

    // Read file content
    const absolutePath = path.resolve(request.root, request.filePath);
    const fileContent = readFileSync(absolutePath, "utf-8");
    const fileUri = `file://${absolutePath}`;

    // Parse line number
    const lines = fileContent.split("\n");
    const lineResult = parseLineNumber(fileContent, request.line);
    if ("error" in lineResult) {
      return err(`${lineResult.error} in ${request.filePath}`);
    }

    const targetLine = lineResult.lineIndex;

    // Find symbol position in line
    const lineText = lines[targetLine];
    const symbolResult = findSymbolInLine(lineText, request.symbolName);
    if ("error" in symbolResult) {
      return err(`${symbolResult.error} on line ${targetLine + 1}`);
    }

    const symbolPosition = symbolResult.characterIndex;

    // Open document in LSP
    client.openDocument(fileUri, fileContent);

    // Give LSP server time to process the document
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    // Get definition
    const result = (await client.getDefinition(fileUri, {
      line: targetLine,
      character: symbolPosition,
    })) as DefinitionResult;

    // Normalize result to array
    const locations = result ? (Array.isArray(result) ? result : [result]) : [];

    // Convert LSP locations to our Definition format
    const definitions: Definition[] = [];
    const contextBefore = request.before || 2;
    const contextAfter = request.after || 2;

    for (const location of locations) {
      const defPath = location.uri.replace("file://", "");
      const defContent = readFileSync(defPath, "utf-8");
      const defLines = defContent.split("\n");

      // Get the text at the definition location
      const startLine = location.range.start.line;
      const startCol = location.range.start.character;
      const defLineText = defLines[startLine] || "";

      // Try to extract the symbol text from the line
      let symbolName = "";

      // Simple heuristic to find identifier boundaries
      const identifierPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
      let match;
      while ((match = identifierPattern.exec(defLineText)) !== null) {
        if (
          match.index <= startCol &&
          startCol < match.index + match[0].length
        ) {
          symbolName = match[0];
          break;
        }
      }

      // If no symbol found, use the requested symbol name
      if (!symbolName) {
        symbolName = request.symbolName;
      }

      // Create preview with context
      const previewLines: string[] = [];
      for (
        let i = Math.max(0, startLine - contextBefore);
        i <= Math.min(defLines.length - 1, startLine + contextAfter);
        i++
      ) {
        previewLines.push(`${i + 1}: ${defLines[i]}`);
      }
      const preview = previewLines.join("\n");

      definitions.push({
        filePath: path.relative(request.root, defPath),
        line: startLine + 1, // Convert to 1-based
        column: startCol + 1, // Convert to 1-based
        symbolName,
        preview,
      });
    }

    return ok({
      message: `Found ${definitions.length} definition${
        definitions.length === 1 ? "" : "s"
      } for "${request.symbolName}"`,
      definitions,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export const lspGetDefinitionsTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_definitions",
  description: "Get the definition(s) of a symbol using LSP",
  schema,
  execute: async (args: z.infer<typeof schema>) => {
    const result = await getDefinitionsWithLSP(args);
    if (result.isOk()) {
      const messages = [result.value.message];

      if (result.value.definitions.length > 0) {
        for (const def of result.value.definitions) {
          messages.push(
            `\n${def.filePath}:${def.line}:${def.column} - ${def.symbolName}\n${def.preview}`,
          );
        }
      }

      return messages.join("\n\n");
    } else {
      throw new Error(result.error);
    }
  },
};

if (import.meta.vitest) {
  const { describe, it, expect, beforeAll, afterAll } = import.meta.vitest;
  const { setupLSPForTest, teardownLSPForTest } = await import(
    "../testHelpers.ts"
  );
  const { default: path } = await import("path");

  describe("lspGetDefinitionsTool", () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    beforeAll(async () => {
      await setupLSPForTest(root);
    });

    afterAll(async () => {
      await teardownLSPForTest();
    });

    it("should have correct tool definition", () => {
      expect(lspGetDefinitionsTool.name).toBe("lsmcp_get_definitions");
      expect(lspGetDefinitionsTool.description).toContain("definition");
      expect(lspGetDefinitionsTool.schema).toBeDefined();
    });

    it("should find definition of an exported symbol", async () => {
      // Using the example connected.ts file which imports from "./scratch"
      const result = await lspGetDefinitionsTool.execute({
        root,
        filePath: "examples/typescript/connected.ts",
        line: 1, // export line
        symbolName: "x",
      });

      expect(result).toContain("Found");
      expect(result).toContain("definition");
    });

    it.skip("should find definition of a type in the same project", async () => {
      // The types.ts file has Value type used in getValue function
      const result = await lspGetDefinitionsTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 10, // getValue function that returns Value type
        symbolName: "Value",
      });

      expect(result).toContain("Found");
    });

    it.skip("should handle string line matching", async () => {
      const result = await lspGetDefinitionsTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: "ValueWithOptional",
        symbolName: "ValueWithOptional",
      });

      expect(result).toContain("ValueWithOptional");
    });

    it("should handle symbol not found on line", async () => {
      await expect(
        lspGetDefinitionsTool.execute({
          root,
          filePath: "examples/typescript/types.ts",
          line: 1,
          symbolName: "nonexistent",
        }),
      ).rejects.toThrow('Symbol "nonexistent" not found on line');
    });

    it("should handle line not found", async () => {
      await expect(
        lspGetDefinitionsTool.execute({
          root,
          filePath: "examples/typescript/types.ts",
          line: "nonexistent line",
          symbolName: "Value",
        }),
      ).rejects.toThrow('Line containing "nonexistent line" not found');
    });

    it("should handle file not found", async () => {
      await expect(
        lspGetDefinitionsTool.execute({
          root,
          filePath: "nonexistent.ts",
          line: 1,
          symbolName: "test",
        }),
      ).rejects.toThrow();
    });

    it.skip("should handle no definition found for built-in symbols", async () => {
      const result = await lspGetDefinitionsTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 11, // The return statement line
        symbolName: "v",
        before: 2,
        after: 2,
      });

      // Local variable might have definition or might not, depending on LSP
      expect(result).toContain("Found");
      expect(result).toContain("definition");
    });
  });
}
