import { z } from "zod";
import { DocumentSymbol, SymbolInformation, SymbolKind } from "vscode-languageserver-types";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { prepareFileContext, withLSPDocument } from "./lspCommon.ts";
import { fileLocationSchema } from "../../common/schemas.ts";
import { formatLocation, formatRange } from "../../common/formatting.ts";
import { getLSPClient } from "../lspClient.ts";

const schema = fileLocationSchema;

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

function formatDocumentSymbol(
  symbol: DocumentSymbol,
  indent: string = ""
): string {
  try {
    const kind = symbol.kind !== undefined ? getSymbolKindName(symbol.kind) : "Unknown";
    const deprecated = symbol.deprecated ? " (deprecated)" : "";
    const name = symbol.name || "Unnamed";
    let result = `${indent}${name} [${kind}]${deprecated}`;
    
    if (symbol.detail) {
      result += ` - ${symbol.detail}`;
    }
    
    if (symbol.range) {
      result += `\n${indent}  Range: ${formatRange(symbol.range)}`;
    }
    
    if (symbol.children && symbol.children.length > 0) {
      result += "\n";
      for (const child of symbol.children) {
        result += "\n" + formatDocumentSymbol(child, indent + "  ");
      }
    }
    
    return result;
  } catch (err) {
    return `${indent}Error formatting symbol: ${err}`;
  }
}

function formatSymbolInformation(symbol: SymbolInformation): string {
  try {
    const kind = symbol.kind !== undefined ? getSymbolKindName(symbol.kind) : "Unknown";
    const deprecated = symbol.deprecated ? " (deprecated)" : "";
    const container = symbol.containerName ? ` in ${symbol.containerName}` : "";
    const name = symbol.name || "Unnamed";
    
    let result = `${name} [${kind}]${deprecated}${container}`;
    if (symbol.location && symbol.location.range) {
      result += `\n  ${formatLocation(symbol.location)}`;
    }
    return result;
  } catch (err) {
    return `Error formatting symbol: ${err}`;
  }
}

async function handleGetDocumentSymbols({
  root,
  filePath,
}: z.infer<typeof schema>): Promise<string> {
  const { fileUri, content } = await prepareFileContext(root, filePath);

  return withLSPDocument(fileUri, content, async () => {
    const client = getLSPClient();
    if (!client) {
      throw new Error("LSP client not initialized");
    }

    // Get document symbols
    const symbols = await client.getDocumentSymbols(fileUri);

    if (symbols.length === 0) {
      return `No symbols found in ${filePath}`;
    }

    // Format the symbols
    let result = `Document symbols in ${filePath}:\n\n`;
    
    // Check if we have DocumentSymbol[] or SymbolInformation[]
    // FSAutoComplete may return DocumentSymbol without some optional properties
    try {
      for (const symbol of symbols) {
        // Check each symbol individually to determine its type
        if ("location" in symbol && symbol.location) {
          // This is a SymbolInformation
          result += formatSymbolInformation(symbol as SymbolInformation) + "\n\n";
        } else if ("range" in symbol || "children" in symbol || "selectionRange" in symbol) {
          // This is a DocumentSymbol
          result += formatDocumentSymbol(symbol as DocumentSymbol) + "\n\n";
        } else {
          // Unknown format, try to format what we can
          const kind = symbol.kind ? getSymbolKindName(symbol.kind) : "Unknown";
          const name = symbol.name || "Unnamed";
          result += `${name} [${kind}]\n\n`;
        }
      }
    } catch (err) {
      // Fallback: just list symbol names
      result += "Error formatting symbols. Raw symbol names:\n";
      for (const symbol of symbols) {
        if (symbol && typeof symbol === 'object' && 'name' in symbol) {
          result += `- ${symbol.name}\n`;
        }
      }
    }

    return result.trim();
  });
}

export const lspGetDocumentSymbolsTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_document_symbols",
  description:
    "Get all symbols (functions, classes, variables, etc.) in a document using LSP",
  schema,
  execute: async (args) => {
    return handleGetDocumentSymbols(args);
  },
};