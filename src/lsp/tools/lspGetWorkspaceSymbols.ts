import { z } from "zod";
import { SymbolInformation, SymbolKind } from "vscode-languageserver-types";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { getLSPClient } from "../lspClient.ts";
import { fileURLToPath } from "url";

const schemaShape = {
  query: z.string().describe(
    "Search query for symbols (e.g., class name, function name)",
  ),
  root: z.string().describe("Root directory for resolving relative paths")
    .optional(),
};

const schema = z.object(schemaShape);

function getSymbolKindName(kind: SymbolKind): string {
  const symbolKindNames: Record<SymbolKind, string> = {
    [SymbolKind.File]: "File",
    [SymbolKind.Module]: "Module",
    [SymbolKind.Namespace]: "Namespace",
    [SymbolKind.Package]: "Package",
    [SymbolKind.Class]: "Class",
    [SymbolKind.Method]: "Method",
    [SymbolKind.Property]: "Property",
    [SymbolKind.Field]: "Field",
    [SymbolKind.Constructor]: "Constructor",
    [SymbolKind.Enum]: "Enum",
    [SymbolKind.Interface]: "Interface",
    [SymbolKind.Function]: "Function",
    [SymbolKind.Variable]: "Variable",
    [SymbolKind.Constant]: "Constant",
    [SymbolKind.String]: "String",
    [SymbolKind.Number]: "Number",
    [SymbolKind.Boolean]: "Boolean",
    [SymbolKind.Array]: "Array",
    [SymbolKind.Object]: "Object",
    [SymbolKind.Key]: "Key",
    [SymbolKind.Null]: "Null",
    [SymbolKind.EnumMember]: "EnumMember",
    [SymbolKind.Struct]: "Struct",
    [SymbolKind.Event]: "Event",
    [SymbolKind.Operator]: "Operator",
    [SymbolKind.TypeParameter]: "TypeParameter",
  };
  return symbolKindNames[kind] || "Unknown";
}

function formatSymbolInformation(
  symbol: SymbolInformation,
  root?: string,
): string {
  const kind = getSymbolKindName(symbol.kind);
  const deprecated = symbol.deprecated ? " (deprecated)" : "";
  const container = symbol.containerName ? ` in ${symbol.containerName}` : "";

  // Convert file URI to relative path if possible
  let filePath = symbol.location.uri;
  try {
    const absolutePath = fileURLToPath(symbol.location.uri);
    if (root) {
      // Make path relative to root
      filePath = absolutePath.startsWith(root + "/")
        ? absolutePath.substring(root.length + 1)
        : absolutePath;
    } else {
      filePath = absolutePath;
    }
  } catch {
    // Keep original URI if conversion fails
  }

  return `${symbol.name} [${kind}]${deprecated}${container}
  File: ${filePath}
  Range: ${symbol.location.range.start.line + 1}:${
    symbol.location.range.start.character + 1
  } - ${symbol.location.range.end.line + 1}:${
    symbol.location.range.end.character + 1
  }`;
}

async function handleGetWorkspaceSymbols({
  query,
  root,
}: z.infer<typeof schema>): Promise<string> {
  const client = getLSPClient();
  if (!client) {
    throw new Error("LSP client not initialized");
  }

  // Get workspace symbols
  const symbols = await client.getWorkspaceSymbols(query);

  if (symbols.length === 0) {
    return `No symbols found matching "${query}"`;
  }

  // Sort symbols by file and then by line number
  const sortedSymbols = symbols.sort((a, b) => {
    const fileCompare = a.location.uri.localeCompare(b.location.uri);
    if (fileCompare !== 0) return fileCompare;

    const lineCompare = a.location.range.start.line -
      b.location.range.start.line;
    if (lineCompare !== 0) return lineCompare;

    return a.location.range.start.character - b.location.range.start.character;
  });

  // Format the symbols
  let result = `Found ${symbols.length} symbol(s) matching "${query}":\n\n`;

  let currentFile = "";
  for (const symbol of sortedSymbols) {
    // Add file header when switching files
    if (symbol.location.uri !== currentFile) {
      currentFile = symbol.location.uri;
      let displayPath = currentFile;
      try {
        const absolutePath = fileURLToPath(currentFile);
        displayPath = root && absolutePath.startsWith(root + "/")
          ? absolutePath.substring(root.length + 1)
          : absolutePath;
      } catch {
        // Keep original URI
      }
      result += `\n=== ${displayPath} ===\n\n`;
    }

    result += formatSymbolInformation(symbol, root) + "\n\n";
  }

  return result.trim();
}

export const lspGetWorkspaceSymbolsTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_workspace_symbols",
  description:
    "Search for symbols (classes, functions, variables, etc.) across the entire workspace using LSP",
  schema,
  execute: async (args) => {
    return handleGetWorkspaceSymbols(args);
  },
};
