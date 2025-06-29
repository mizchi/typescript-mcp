import { z } from "zod";
import {
  CompletionItem,
  CompletionItemKind,
} from "vscode-languageserver-types";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { getLSPClient } from "../lspClient.ts";
import {
  prepareFileContext,
  resolveLineOrThrow,
  withLSPDocument,
} from "./lspCommon.ts";
import { commonSchemas } from "../../common/schemas.ts";

const schema = z.object({
  root: commonSchemas.root,
  filePath: commonSchemas.filePath,
  line: commonSchemas.line,
  target: z.string().describe("Text at the position to get completions for")
    .optional(),
  resolve: z.boolean().describe(
    "Whether to resolve completion items for additional details like auto-imports",
  ).optional().default(false),
  includeAutoImport: z.boolean().describe(
    "Whether to include auto-import suggestions",
  ).optional().default(false),
});

function getCompletionItemKindName(kind?: CompletionItemKind): string {
  if (!kind) return "Unknown";

  const kindNames: Record<CompletionItemKind, string> = {
    [CompletionItemKind.Text]: "Text",
    [CompletionItemKind.Method]: "Method",
    [CompletionItemKind.Function]: "Function",
    [CompletionItemKind.Constructor]: "Constructor",
    [CompletionItemKind.Field]: "Field",
    [CompletionItemKind.Variable]: "Variable",
    [CompletionItemKind.Class]: "Class",
    [CompletionItemKind.Interface]: "Interface",
    [CompletionItemKind.Module]: "Module",
    [CompletionItemKind.Property]: "Property",
    [CompletionItemKind.Unit]: "Unit",
    [CompletionItemKind.Value]: "Value",
    [CompletionItemKind.Enum]: "Enum",
    [CompletionItemKind.Keyword]: "Keyword",
    [CompletionItemKind.Snippet]: "Snippet",
    [CompletionItemKind.Color]: "Color",
    [CompletionItemKind.File]: "File",
    [CompletionItemKind.Reference]: "Reference",
    [CompletionItemKind.Folder]: "Folder",
    [CompletionItemKind.EnumMember]: "EnumMember",
    [CompletionItemKind.Constant]: "Constant",
    [CompletionItemKind.Struct]: "Struct",
    [CompletionItemKind.Event]: "Event",
    [CompletionItemKind.Operator]: "Operator",
    [CompletionItemKind.TypeParameter]: "TypeParameter",
  };

  return kindNames[kind] || "Unknown";
}

function formatCompletionItem(
  item: CompletionItem,
  showImportInfo: boolean = false,
): string {
  const kind = getCompletionItemKindName(item.kind);
  let result = `${item.label} [${kind}]`;

  if (item.detail) {
    result += `\n${item.detail}`;
  }

  if (item.documentation) {
    const doc = typeof item.documentation === "string"
      ? item.documentation
      : item.documentation.value;
    if (doc) {
      // Truncate long documentation
      const maxDocLength = 200;
      const truncatedDoc = doc.length > maxDocLength
        ? doc.substring(0, maxDocLength) + "..."
        : doc;
      result += `\n\n${truncatedDoc}`;
    }
  }

  // Show auto-import information if available
  if (
    showImportInfo && item.additionalTextEdits &&
    item.additionalTextEdits.length > 0
  ) {
    const importEdits = item.additionalTextEdits.filter((edit) => {
      // Check if the edit is likely an import statement
      const editText = edit.newText;
      return editText.includes("import") || editText.includes("from");
    });

    if (importEdits.length > 0) {
      result += "\n[Auto-import available]";
      for (const edit of importEdits) {
        result += `\n  ${edit.newText.trim()}`;
      }
    }
  }

  return result;
}

async function handleGetCompletion({
  root,
  filePath,
  line,
  target,
  resolve,
  includeAutoImport,
}: z.infer<typeof schema>): Promise<string> {
  const { fileUri, content } = await prepareFileContext(root, filePath);
  const lineIndex = resolveLineOrThrow(content, line, filePath);

  // Determine character position
  const lines = content.split("\n");
  const lineText = lines[lineIndex];
  let character = lineText.length; // Default to end of line

  if (target) {
    // Find the position after the target text
    const targetIndex = lineText.indexOf(target);
    if (targetIndex !== -1) {
      character = targetIndex + target.length;
    }
  }

  return withLSPDocument(fileUri, content, async () => {
    const client = getLSPClient();
    if (!client) {
      throw new Error("LSP client not initialized");
    }

    // Get completions
    const completions = await client.getCompletion(fileUri, {
      line: lineIndex,
      character,
    });

    if (completions.length === 0) {
      return `No completions available at ${filePath}:${lineIndex + 1}:${
        character + 1
      }`;
    }

    // Sort completions by relevance (sortText if available, otherwise by label)
    const sortedCompletions = completions.sort((a, b) => {
      if (a.sortText && b.sortText) {
        return a.sortText.localeCompare(b.sortText);
      }
      return a.label.localeCompare(b.label);
    });

    // Take top 20 completions
    const topCompletions = sortedCompletions.slice(0, 20);

    // Resolve completion items if requested
    const resolvedCompletions = resolve
      ? await Promise.all(
        topCompletions.map(async (item) => {
          try {
            return await client.resolveCompletionItem(item);
          } catch {
            // If resolve fails, return the original item
            return item;
          }
        }),
      )
      : topCompletions;

    // Filter for auto-import completions if requested
    const finalCompletions = includeAutoImport
      ? resolvedCompletions.filter((item) => {
        // Include items that have additionalTextEdits (likely imports) or are from external modules
        return (item.additionalTextEdits &&
          item.additionalTextEdits.length > 0) ||
          (item.detail &&
            (item.detail.includes("import") || item.detail.includes("from")));
      })
      : resolvedCompletions;

    if (finalCompletions.length === 0) {
      const message = includeAutoImport
        ? `No auto-import completions available at ${filePath}:${
          lineIndex + 1
        }:${character + 1}`
        : `No completions available at ${filePath}:${lineIndex + 1}:${
          character + 1
        }`;
      return message;
    }

    // Format the completions
    let result = `Completions at ${filePath}:${lineIndex + 1}:${
      character + 1
    }:\n\n`;

    for (const item of finalCompletions) {
      result += formatCompletionItem(item, resolve) + "\n\n";
    }

    if (completions.length > finalCompletions.length) {
      result += `... and ${
        completions.length - finalCompletions.length
      } more completions`;
    }

    return result.trim();
  });
}

export const lspGetCompletionTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_completion",
  description:
    "Get code completion suggestions at a specific position in a file using LSP",
  schema,
  execute: async (args) => {
    return handleGetCompletion(args);
  },
};
