/**
 * Language support utilities for MCP servers
 */

export interface ToolAvailability {
  typescriptOnly: string[];
  lspBased: string[];
}

export const TOOL_AVAILABILITY: ToolAvailability = {
  typescriptOnly: [
    "lsmcp_move_file",
    "lsmcp_move_directory",
    "lsmcp_delete_symbol",
    "lsmcp_get_module_symbols",
    "lsmcp_get_type_in_module",
    "lsmcp_get_symbols_in_scope",
    "lsmcp_get_type_at_symbol",
    "lsmcp_get_module_graph",
    "lsmcp_get_related_modules",
  ],
  lspBased: [
    "lsmcp_find_references",
    "lsmcp_get_definitions",
    "lsmcp_get_diagnostics",
    "lsmcp_get_hover",
    "lsmcp_rename_symbol",
    "lsmcp_get_document_symbols",
    "lsmcp_get_workspace_symbols",
    "lsmcp_get_completion",
    "lsmcp_get_signature_help",
    "lsmcp_get_code_actions",
    "lsmcp_format_document",
  ],
};

export function getUnavailableToolError(
  toolName: string,
  currentLanguage: string,
  availableTools: string[],
): string {
  const isTypescriptOnly = TOOL_AVAILABILITY.typescriptOnly.includes(toolName);

  if (isTypescriptOnly) {
    return `Error: Tool '${toolName}' is only available for TypeScript/JavaScript.

This tool uses the TypeScript Compiler API and cannot be used with other languages.

Available tools for ${currentLanguage} (via LSP):
${availableTools.map((t) => `  - ${t}`).join("\n")}

For TypeScript-specific features with other languages, consider:
- Using language-specific refactoring tools
- Using your IDE's built-in refactoring features`;
  }

  return `Error: Tool '${toolName}' is not available for ${currentLanguage}.

Your LSP server may not support this feature.

Available tools for ${currentLanguage}:
${availableTools.map((t) => `  - ${t}`).join("\n")}`;
}

export function getLanguageFromLSPCommand(lspCommand: string): string {
  // Extract language from common LSP server names
  const lspMap: Record<string, string> = {
    "rust-analyzer": "Rust",
    "pylsp": "Python",
    "pyright": "Python",
    "gopls": "Go",
    "clangd": "C/C++",
    "jdtls": "Java",
    "typescript-language-server": "TypeScript",
    "deno": "TypeScript/Deno",
    "vscode-html-language-server": "HTML",
    "vscode-css-language-server": "CSS",
    "vscode-json-language-server": "JSON",
    "lua-language-server": "Lua",
    "solargraph": "Ruby",
    "rls": "Rust",
    "hls": "Haskell",
    "omnisharp": "C#",
    "fsautocomplete": "F#",
    "fsharp-language-server": "F#",
  };

  const command = lspCommand.split(" ")[0];
  const baseName = command.split("/").pop() || command;

  for (const [key, value] of Object.entries(lspMap)) {
    if (baseName.includes(key)) {
      return value;
    }
  }

  return "your language";
}
