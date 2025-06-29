# Language Support Matrix

This document describes which MCP tools are available for each language.

## Tool Categories

### 1. TypeScript-Specific Tools (TypeScript/JavaScript only)

These tools use the TypeScript Compiler API and are **only** available for TypeScript and JavaScript:

| Tool | Description | Available for |
|------|-------------|---------------|
| `lsmcp_move_file` | Move files and update all imports | TS/JS only |
| `lsmcp_move_directory` | Move directories and update all imports | TS/JS only |
| `lsmcp_get_module_symbols` | Get exported symbols from modules | TS/JS only |
| `lsmcp_get_type_in_module` | Get detailed type signatures from modules | TS/JS only |
| `lsmcp_get_symbols_in_scope` | Get all visible symbols at a location | TS/JS only |
| `lsmcp_get_type_at_symbol` | Get type information for symbols | TS/JS only |
| `lsmcp_get_module_graph` | Get module dependency graph | TS/JS only |
| `lsmcp_get_related_modules` | Get related modules for a file | TS/JS only |

### 2. LSP-Based Tools (All languages with LSP support)

These tools use the Language Server Protocol and are available for **any language** with an LSP server:

| Tool | Description | LSP Method | Availability |
|------|-------------|------------|--------------|
| `lsmcp_find_references` | Find all references to a symbol | `textDocument/references` | All LSP servers |
| `lsmcp_get_definitions` | Go to definition | `textDocument/definition` | All LSP servers |
| `lsmcp_get_diagnostics` | Get errors and warnings | `textDocument/publishDiagnostics` | All LSP servers |
| `lsmcp_get_hover` | Get hover information | `textDocument/hover` | All LSP servers |
| `lsmcp_rename_symbol` | Rename symbols across files | `textDocument/rename` | Most LSP servers |
| `lsmcp_delete_symbol` | Delete symbols and all references | `textDocument/rename` + refs | Most LSP servers |
| `lsmcp_get_document_symbols` | Get symbols in a document | `textDocument/documentSymbol` | Most LSP servers |
| `lsmcp_get_workspace_symbols` | Search symbols in workspace | `workspace/symbol` | Most LSP servers |
| `lsmcp_get_completion` | Get code completions | `textDocument/completion` | Most LSP servers |
| `lsmcp_get_signature_help` | Get function signatures | `textDocument/signatureHelp` | Most LSP servers |
| `lsmcp_get_code_actions` | Get available code actions | `textDocument/codeAction` | Some LSP servers |
| `lsmcp_format_document` | Format document | `textDocument/formatting` | Some LSP servers |

## Language-Specific Support

### TypeScript/JavaScript
- **All tools available** (both TypeScript-specific and LSP-based)
- Built-in support without external LSP server
- Advanced refactoring capabilities

### Other Languages (via --bin option)
- **Only LSP-based tools available**
- Requires external LSP server
- Tool availability depends on LSP server capabilities

Example configurations:

```bash
# Rust
lsmcp --bin "rust-analyzer"

# Python
lsmcp --bin "pylsp"

# Go
lsmcp --bin "gopls"

# C/C++
lsmcp --bin "clangd"

# Java
lsmcp --bin "jdtls"
```

## Error Messages

When attempting to use TypeScript-specific tools with other languages, you will receive clear error messages:

```
Error: Tool 'lsmcp_move_file' is only available for TypeScript/JavaScript.
Available tools for your language (via LSP):
- lsmcp_find_references
- lsmcp_get_definitions
- lsmcp_get_hover
...
```

## Checking LSP Server Capabilities

To check which tools are available for your LSP server, use:

```bash
lsmcp --bin "your-lsp-server" --list-tools
```

This will show which LSP methods your server supports and which tools are available.