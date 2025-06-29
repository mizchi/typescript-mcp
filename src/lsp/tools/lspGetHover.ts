import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { getActiveClient } from "../lspClient.ts";
import { parseLineNumber } from "../../textUtils/parseLineNumber.ts";
import { findSymbolInLine } from "../../textUtils/findSymbolInLine.ts";
import { findTargetInFile } from "../../textUtils/findTargetInFile.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { readFileSync } from "fs";
import path from "path";

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the symbol (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line")
    .optional(),
  character: z
    .number()
    .describe("Character position in the line (0-based)")
    .optional(),
  target: z.string().describe("Text to find and get hover information for")
    .optional(),
});

type GetHoverRequest = z.infer<typeof schema>;

/**
 * LSP Hover response types
 */
interface MarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

type MarkedString = string | { language: string; value: string };

interface HoverResult {
  contents: MarkedString | MarkedString[] | MarkupContent;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

interface GetHoverSuccess {
  message: string;
  hover: {
    contents: string;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  } | null;
}

/**
 * Helper to handle hover request when line is not provided
 */
async function getHoverWithoutLine(
  request: GetHoverRequest,
): Promise<Result<GetHoverSuccess, string>> {
  try {
    const client = getActiveClient();

    // Read file content
    const absolutePath = path.resolve(request.root, request.filePath);
    const fileContent = readFileSync(absolutePath, "utf-8");
    const fileUri = `file://${absolutePath}`;
    const lines = fileContent.split("\n");

    // Find target text in file
    const targetResult = findTargetInFile(lines, request.target || "");
    if ("error" in targetResult) {
      return err(`${targetResult.error} in ${request.filePath}`);
    }

    const { lineIndex: targetLine, characterIndex: symbolPosition } =
      targetResult;

    // Open document in LSP
    client.openDocument(fileUri, fileContent);
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    // Get hover info
    const result = (await client.getHover(fileUri, {
      line: targetLine,
      character: symbolPosition,
    })) as HoverResult | null;

    return formatHoverResult(result, request, targetLine, symbolPosition);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Format hover result into GetHoverSuccess
 */
function formatHoverResult(
  result: HoverResult | null,
  request: GetHoverRequest,
  targetLine: number,
  symbolPosition: number,
): Result<GetHoverSuccess, string> {
  if (!result) {
    return ok({
      message: `No hover information available${
        request.target ? ` for "${request.target}"` : ""
      } at ${request.filePath}:${targetLine + 1}:${symbolPosition + 1}`,
      hover: null,
    });
  }

  // Format hover contents
  const formattedContents = formatHoverContents(result.contents);

  // Format range - if not available, specify all lines
  let range;
  if (result.range) {
    range = {
      start: {
        line: result.range.start.line + 1,
        character: result.range.start.character + 1,
      },
      end: {
        line: result.range.end.line + 1,
        character: result.range.end.character + 1,
      },
    };
  } else {
    // If range is null, specify all lines
    const absolutePath = path.resolve(request.root, request.filePath);
    const fileContent = readFileSync(absolutePath, "utf-8");
    const lines = fileContent.split("\n");
    range = {
      start: {
        line: 1,
        character: 1,
      },
      end: {
        line: lines.length,
        character: lines[lines.length - 1]?.length || 0,
      },
    };
  }

  return ok({
    message: `Hover information for ${
      request.target ? `"${request.target}" at ` : ""
    }${request.filePath}:${targetLine + 1}:${symbolPosition + 1}`,
    hover: {
      contents: formattedContents,
      range,
    },
  });
}

/**
 * Gets hover information for a TypeScript symbol using LSP
 */
async function getHover(
  request: GetHoverRequest,
): Promise<Result<GetHoverSuccess, string>> {
  // If line is not provided, we need to find the target text
  if (request.line === undefined) {
    return getHoverWithoutLine(request);
  }

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

    // Determine character position
    let symbolPosition: number;
    if (request.character !== undefined) {
      // Use provided character position
      symbolPosition = request.character;
    } else if (request.target) {
      // Find symbol position in line
      const lineText = lines[targetLine];
      const symbolResult = findSymbolInLine(lineText, request.target);
      if ("error" in symbolResult) {
        return err(`${symbolResult.error} on line ${targetLine + 1}`);
      }
      symbolPosition = symbolResult.characterIndex;
    } else {
      // Default to beginning of line if neither character nor target is provided
      symbolPosition = 0;
    }

    // Open document in LSP
    client.openDocument(fileUri, fileContent);

    // Give LSP server time to process the document
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    // Get hover info
    const result = (await client.getHover(fileUri, {
      line: targetLine,
      character: symbolPosition,
    })) as HoverResult | null;

    return formatHoverResult(result, request, targetLine, symbolPosition);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Formats hover contents from various LSP formats to a string
 */
function formatHoverContents(
  contents: MarkedString | MarkedString[] | MarkupContent,
): string {
  if (typeof contents === "string") {
    return contents;
  } else if (Array.isArray(contents)) {
    return contents
      .map((content: MarkedString) => {
        if (typeof content === "string") {
          return content;
        } else {
          return content.value;
        }
      })
      .join("\n");
  } else if (typeof contents === "object" && contents && "value" in contents) {
    return (contents as MarkupContent).value;
  }
  return "";
}

export const lspGetHoverTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_hover",
  description:
    "Get hover information (type signature, documentation) for a symbol using LSP",
  schema,
  execute: async (args: z.infer<typeof schema>) => {
    const result = await getHover(args);
    if (result.isOk()) {
      const messages = [result.value.message];
      if (result.value.hover) {
        messages.push(result.value.hover.contents);
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

  describe("lspGetHoverTool", () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    beforeAll(async () => {
      await setupLSPForTest(root);
    });

    afterAll(async () => {
      await teardownLSPForTest();
    });

    it("should have correct tool definition", () => {
      expect(lspGetHoverTool.name).toBe("lsmcp_get_hover");
      expect(lspGetHoverTool.description).toContain("hover information");
      expect(lspGetHoverTool.schema.shape).toBeDefined();
      expect(lspGetHoverTool.schema.shape.root).toBeDefined();
      expect(lspGetHoverTool.schema.shape.filePath).toBeDefined();
      expect(lspGetHoverTool.schema.shape.line).toBeDefined();
      expect(lspGetHoverTool.schema.shape.target).toBeDefined();
    });

    it("should get hover information for a type", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 1,
        target: "Value",
      });

      expect(result).toContain('Hover information for "Value"');
      expect(result).toContain("type Value");
    });

    it("should get hover information using line string match", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: "ValueWithOptional",
        target: "ValueWithOptional",
      });

      expect(result).toContain("type ValueWithOptional");
      expect(result).toContain("o?: string");
    });

    it("should get hover information for a function", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 10,
        target: "getValue",
      });

      expect(result).toContain("function getValue");
      expect(result).toContain("Value");
    });

    it("should handle no hover information gracefully", async () => {
      await expect(
        lspGetHoverTool.execute({
          root,
          filePath: "examples/typescript/types.ts",
          line: 3, // Empty line
          target: "v",
        }),
      ).rejects.toThrow('Symbol "v" not found');
    });

    it("should handle non-existent symbol error", async () => {
      await expect(
        lspGetHoverTool.execute({
          root,
          filePath: "examples/typescript/types.ts",
          line: 1,
          target: "NonExistentSymbol",
        }),
      ).rejects.toThrow('Symbol "NonExistentSymbol" not found');
    });

    it("should handle non-existent file error", async () => {
      await expect(
        lspGetHoverTool.execute({
          root,
          filePath: "examples/typescript/does-not-exist.ts",
          line: 1,
          target: "something",
        }),
      ).rejects.toThrow("ENOENT");
    });

    it("should handle line string not found error", async () => {
      await expect(
        lspGetHoverTool.execute({
          root,
          filePath: "examples/typescript/types.ts",
          line: "NonExistentLine",
          target: "something",
        }),
      ).rejects.toThrow('Line containing "NonExistentLine" not found');
    });

    it("should get hover information without line specified", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        target: "Value",
      });

      expect(result).toContain('Hover information for "Value"');
      expect(result).toContain("type Value");
    });
  });

  // @typescript/native-preview
  describe("lspGetHoverTool with fresh LSP instance", () => {
    const root = path.resolve(import.meta.dirname, "../../..");

    beforeAll(async () => {
      await setupLSPForTest(root);
    });

    afterAll(async () => {
      await teardownLSPForTest();
    });

    it("should get hover for property in object type", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 2,
        target: "v",
      });

      expect(result).toContain("(property) v: string");
    });

    it("should get hover for optional property", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 7,
        target: "o",
      });

      expect(result).toContain("(property) o?: string");
    });

    it("should get hover for return statement", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 11,
        target: "return",
      });

      expect(result).toContain("return");
    });

    it("should find first occurrence when target appears multiple times", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        target: "string",
      });

      // Should find the first "string" in the file
      expect(result).toContain("string");
    });

    it("should handle complex target search without line", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        target: "getValue",
      });

      expect(result).toContain("function getValue(): Value");
    });

    it("should return hover with range information", async () => {
      const result = await lspGetHoverTool.execute({
        root,
        filePath: "examples/typescript/types.ts",
        line: 5,
        target: "ValueWithOptional",
      });

      // The result should contain hover information
      expect(result).toBeTruthy();
      expect(result).toContain("Hover information");
      expect(result).toContain("ValueWithOptional");
    });
  });
}
