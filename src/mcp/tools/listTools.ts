import { z } from "zod";
import type { ToolDef } from "../_mcplib.ts";

const schema = z.object({
  category: z.enum(["typescript", "lsp", "all"]).optional().default("all")
    .describe("Filter tools by category (typescript, lsp, or all)"),
});

interface ToolInfo {
  name: string;
  description: string;
  category: "typescript" | "lsp";
  requiresLSP: boolean;
}

// Define all available tools with their metadata
const TOOLS_REGISTRY: ToolInfo[] = [
  // TypeScript tools (using Compiler API) - All removed in favor of LSP tools
  
  // LSP tools (using Language Server Protocol)
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

function formatToolsList(tools: ToolInfo[], category: string): string {
  const filteredTools = category === "all" 
    ? tools 
    : tools.filter(t => t.category === category);

  let result = `# Available MCP Tools (${category})\n\n`;
  
  // Group by category
  const typescript = filteredTools.filter(t => t.category === "typescript");
  const lsp = filteredTools.filter(t => t.category === "lsp");
  
  // Always show TypeScript section header if viewing typescript or all categories
  if (category === "all" || category === "typescript") {
    result += "## 🔧 TypeScript Tools (Compiler API)\n";
    if (typescript.length > 0) {
      result += "These tools use the TypeScript Compiler API directly and don't require an LSP server.\n\n";
      typescript.forEach(tool => {
        result += `### ${tool.name}\n`;
        result += `${tool.description}\n\n`;
      });
    } else {
      result += "All TypeScript-specific tools have been removed in favor of LSP-based alternatives.\n";
      result += "See MIGRATION_GUIDE.md for details.\n\n";
    }
  }
  
  if (lsp.length > 0 && (category === "all" || category === "lsp")) {
    result += "## 🌐 LSP Tools (Language Server Protocol)\n";
    result += "These tools require a running Language Server.\n";
    result += "Make sure the appropriate LSP server is installed for your language.\n\n";
    lsp.forEach(tool => {
      result += `### ${tool.name}\n`;
      result += `${tool.description}\n\n`;
    });
  }
  
  result += "## 💡 Tips\n";
  if (category === "lsp" || lsp.length > 0) {
    result += "- Use LSP tools for IDE-like features (completions, formatting, etc.)\n";
    result += "- Get help for any tool: use the tool with no parameters to see its schema\n";
  } else {
    result += "- All TypeScript-specific tools have been migrated to LSP\n";
    result += "- Use --language flag with appropriate LSP server for language support\n";
  }
  
  return result;
}

export const listToolsTool: ToolDef<typeof schema> = {
  name: "list_tools",
  description: "List all available MCP tools with descriptions and categories",
  schema,
  execute: async ({ category = "all" }) => {
    return formatToolsList(TOOLS_REGISTRY, category);
  },
};

// Create a function to generate language-specific list tools
export function createLanguageListTool(
  language: string,
  displayName: string
): ToolDef<typeof schema> {
  // Create language-specific tools registry
  const languageTools: ToolInfo[] = [
    // LSP tools (using Language Server Protocol)
    {
      name: `${language}_get_hover`,
      description: `Get hover information (type signature, documentation) for ${displayName} using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_find_references`,
      description: `Find all references to a ${displayName} symbol across the codebase using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_definitions`,
      description: `Get the definition(s) of a ${displayName} symbol using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_diagnostics`,
      description: `Get ${displayName} diagnostics (errors, warnings) for a file using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_rename_symbol`,
      description: `Rename a ${displayName} symbol across the codebase using Language Server Protocol`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_delete_symbol`,
      description: `Delete a ${displayName} symbol and optionally all its references using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_document_symbols`,
      description: `Get all symbols in a ${displayName} document using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_workspace_symbols`,
      description: `Search for symbols across the entire ${displayName} workspace using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_completion`,
      description: `Get code completion suggestions in a ${displayName} file using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_signature_help`,
      description: `Get signature help for ${displayName} function calls using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_get_code_actions`,
      description: `Get available code actions for ${displayName} code using LSP`,
      category: "lsp",
      requiresLSP: true,
    },
    {
      name: `${language}_format_document`,
      description: `Format a ${displayName} document using the language server's formatting provider`,
      category: "lsp",
      requiresLSP: true,
    },
  ];

  return {
    name: `${language}_list_tools`,
    description: `List all available ${displayName} MCP tools with descriptions and categories`,
    schema,
    execute: async ({ category = "all" }) => {
      return formatLanguageToolsList(languageTools, category, displayName);
    },
  };
}

// Format tools list for language-specific tools
function formatLanguageToolsList(tools: ToolInfo[], category: string, displayName: string): string {
  const filteredTools = category === "all" 
    ? tools 
    : tools.filter(t => t.category === category);

  if (filteredTools.length === 0) {
    return `No tools found for category: ${category}`;
  }

  let result = `# Available ${displayName} MCP Tools (${category})\n\n`;
  
  // All language-specific tools are LSP tools
  if (filteredTools.length > 0 && (category === "all" || category === "lsp")) {
    result += `## 🌐 ${displayName} LSP Tools (Language Server Protocol)\n`;
    result += "These tools require a running Language Server.\n";
    result += `Make sure the appropriate LSP server is installed for ${displayName}.\n\n`;
    filteredTools.forEach(tool => {
      result += `### ${tool.name}\n`;
      result += `${tool.description}\n\n`;
    });
  }
  
  result += "## 💡 Tips\n";
  result += `- All ${displayName} tools use the Language Server Protocol (LSP)\n`;
  result += "- Get help for any tool: use the tool with no parameters to see its schema\n";
  result += `- Make sure your ${displayName} LSP server is properly installed and running\n`;
  
  return result;
}

// Also export for use in other modules
export { TOOLS_REGISTRY };