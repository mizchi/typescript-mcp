import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { pathToFileURL } from "url";
import {
  CodeAction,
  CodeActionKind,
  Command,
} from "vscode-languageserver-types";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { getLSPClient } from "../lspClient.ts";
import { resolveLineParameter } from "../../textUtils/resolveLineParameter.ts";

const schemaShape = {
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path to get code actions for (relative to root)"),
  startLine: z
    .union([z.number(), z.string()])
    .describe("Start line number (1-based) or string to match"),
  endLine: z
    .union([z.number(), z.string()])
    .describe("End line number (1-based) or string to match")
    .optional(),
  includeKinds: z
    .array(z.string())
    .describe(
      "Filter for specific code action kinds (e.g., 'quickfix', 'refactor')",
    )
    .optional(),
};

const schema = z.object(schemaShape);

function getCodeActionKindName(kind?: string | CodeActionKind): string {
  if (!kind) return "General";

  // Handle common code action kinds
  if (kind === CodeActionKind.QuickFix) return "Quick Fix";
  if (kind === CodeActionKind.Refactor) return "Refactor";
  if (kind === CodeActionKind.RefactorExtract) return "Extract";
  if (kind === CodeActionKind.RefactorInline) return "Inline";
  if (kind === CodeActionKind.RefactorRewrite) return "Rewrite";
  if (kind === CodeActionKind.Source) return "Source";
  if (kind === CodeActionKind.SourceOrganizeImports) return "Organize Imports";
  if (kind === CodeActionKind.SourceFixAll) return "Fix All";

  // For custom kinds, return as-is
  return kind;
}

function isCommand(action: Command | CodeAction): action is Command {
  return "command" in action && typeof action.command === "string";
}

function formatCodeAction(action: Command | CodeAction): string {
  if (isCommand(action)) {
    // Format as command
    let result = `Command: ${action.title}`;
    if (action.command) {
      result += ` (${action.command})`;
    }
    return result;
  } else {
    // Format as code action
    const kind = getCodeActionKindName(action.kind);
    let result = `${action.title} [${kind}]`;

    if (action.isPreferred) {
      result += " ★"; // Preferred action
    }

    if (action.disabled) {
      result += ` (disabled: ${action.disabled.reason})`;
    }

    if (action.diagnostics && action.diagnostics.length > 0) {
      result += `\n  Fixes ${action.diagnostics.length} diagnostic(s)`;
    }

    if (action.command) {
      result += `\n  Command: ${action.command.command}`;
    }

    if (action.edit) {
      const changes = action.edit.changes;
      if (changes) {
        const fileCount = Object.keys(changes).length;
        result += `\n  Edits ${fileCount} file(s)`;
      }
    }

    return result;
  }
}

async function handleGetCodeActions({
  root,
  filePath,
  startLine,
  endLine,
  includeKinds,
}: z.infer<typeof schema>): Promise<string> {
  const client = getLSPClient();
  if (!client) {
    throw new Error("LSP client not initialized");
  }

  // Convert to absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);

  // Check if file exists
  await fs.access(absolutePath);

  // Convert to file URI
  const fileUri = pathToFileURL(absolutePath).toString();

  // Read the file content
  const content = await fs.readFile(absolutePath, "utf-8");

  // Resolve line parameters
  const startResolve = resolveLineParameter(content, startLine);
  if (!startResolve.success) {
    throw new Error(startResolve.error);
  }

  const startLineIndex = startResolve.lineIndex;

  // If endLine is not provided, use the same as startLine
  let endLineIndex = startLineIndex;
  if (endLine !== undefined) {
    const endResolve = resolveLineParameter(content, endLine);
    if (!endResolve.success) {
      throw new Error(endResolve.error);
    }
    endLineIndex = endResolve.lineIndex;
  }

  // Open the document in LSP
  client.openDocument(fileUri, content);

  try {
    // Wait a bit for LSP to process the document
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get diagnostics for the range (to provide context for code actions)
    const diagnostics = client.getDiagnostics(fileUri);
    const rangeDiagnostics = diagnostics.filter((d) => {
      const line = d.range.start.line;
      return line >= startLineIndex && line <= endLineIndex;
    });

    // Get code actions
    const range = {
      start: { line: startLineIndex, character: 0 },
      end: {
        line: endLineIndex,
        character: content.split("\n")[endLineIndex]?.length ?? 0,
      },
    };

    const actions = await client.getCodeActions(fileUri, range, {
      diagnostics: rangeDiagnostics,
    });

    if (actions.length === 0) {
      return `No code actions available for ${filePath}:${startLineIndex + 1}-${
        endLineIndex + 1
      }`;
    }

    // Filter by kinds if specified
    let filteredActions = actions;
    if (includeKinds && includeKinds.length > 0) {
      filteredActions = actions.filter((action) => {
        if (isCommand(action)) {
          // Commands don't have kinds, so exclude them when filtering
          return false;
        }
        return action.kind &&
          includeKinds.some((k) => action.kind?.startsWith(k));
      });
    }

    if (filteredActions.length === 0) {
      return `No code actions matching the specified kinds found for ${filePath}:${
        startLineIndex + 1
      }-${endLineIndex + 1}`;
    }

    // Group actions by kind
    const grouped = new Map<string, (Command | CodeAction)[]>();
    for (const action of filteredActions) {
      const kind = isCommand(action) ? "command" : (action.kind || "general");
      if (!grouped.has(kind)) {
        grouped.set(kind, []);
      }
      grouped.get(kind)!.push(action);
    }

    // Format the code actions
    let result = `Code actions for ${filePath}:${startLineIndex + 1}-${
      endLineIndex + 1
    }:\n\n`;

    for (const [kind, kindActions] of grouped) {
      const kindName = getCodeActionKindName(kind);
      result += `=== ${kindName} ===\n`;

      for (const action of kindActions) {
        result += formatCodeAction(action) + "\n\n";
      }
    }

    return result.trim();
  } finally {
    // Close the document
    client.closeDocument(fileUri);
  }
}

export const lspGetCodeActionsTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_code_actions",
  description:
    "Get available code actions (quick fixes, refactorings, etc.) for a range in a file using LSP",
  schema,
  execute: async (args) => {
    return handleGetCodeActions(args);
  },
};
