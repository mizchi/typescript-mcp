import { z } from "zod";
import type { ToolDef } from "../_mcplib.ts";

const schema = z.object({
  category: z.enum(["lsp", "all"]).optional().default("all")
    .describe("Filter tools by category (lsp or all)"),
});

interface ToolInfo {
  name: string;
  description: string;
  category: "lsp";
  requiresLSP: boolean;
}

// Define LSP-only tools
const LSP_TOOLS_REGISTRY: ToolInfo[] = [
  {
    name: "lsp_get_hover",
    description: "Get hover information (type signature, documentation) using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_find_references",
    description: "Find all references to symbol across the codebase using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_definitions",
    description: "Get the definition(s) of a symbol using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_diagnostics",
    description: "Get diagnostics (errors, warnings) for a file using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_rename_symbol",
    description: "Rename a symbol across the codebase using Language Server Protocol",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_delete_symbol",
    description: "Delete a symbol and optionally all its references using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_document_symbols",
    description: "Get all symbols (functions, classes, variables, etc.) in a document using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_workspace_symbols",
    description: "Search for symbols across the entire workspace using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_completion",
    description: "Get code completion suggestions at a specific position using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_signature_help",
    description: "Get signature help (parameter hints) for function calls using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_get_code_actions",
    description: "Get available code actions (quick fixes, refactorings, etc.) using LSP",
    category: "lsp",
    requiresLSP: true,
  },
  {
    name: "lsp_format_document",
    description: "Format an entire document using the language server's formatting provider",
    category: "lsp",
    requiresLSP: true,
  },
];

function formatToolsList(tools: ToolInfo[]): string {
  let result = `# Available MCP Tools\n\n`;
  
  result += "## 🌐 LSP Tools (Language Server Protocol)\n";
  result += "These tools work with any language that has an LSP server.\n";
  result += "Make sure the appropriate LSP server is installed and running for your language.\n\n";
  
  tools.forEach(tool => {
    result += `### ${tool.name}\n`;
    result += `${tool.description}\n\n`;
  });
  
  result += "## 💡 Tips\n";
  result += "- All tools use the Language Server Protocol (LSP)\n";
  result += "- These tools work with any programming language that has LSP support\n";
  result += "- Get help for any tool: use the tool with no parameters to see its schema\n";
  
  return result;
}

export const listToolsLSPTool: ToolDef<typeof schema> = {
  name: "list_tools",
  description: "List all available LSP-based MCP tools",
  schema,
  execute: async () => {
    return formatToolsList(LSP_TOOLS_REGISTRY);
  },
};