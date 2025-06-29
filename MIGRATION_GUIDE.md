# TypeScript MCP Tools Migration Guide

This guide documents the migration from TypeScript-specific tools to LSP-based alternatives.

## Overview

We are gradually migrating TypeScript-specific tools that use the TypeScript Compiler API to LSP-based tools that work with any language server. This provides better language independence while maintaining most functionality.

## Migration Status

### ✅ Already Removed (Use LSP alternatives)

1. **`ts_rename_symbol` → `lsp_rename_symbol`**
   - Full functionality maintained
   - Works across all files in the project
   - Parameter change: `oldName` → `target`

2. **`ts_delete_symbol` → `lsp_delete_symbol`**
   - Full functionality maintained
   - Can delete symbols and their references

3. **`ts_get_diagnostics` → `lsp_get_diagnostics`**
   - Full functionality maintained
   - Returns errors and warnings for files

4. **`ts_find_references` → `lsp_find_references`**
   - Full functionality maintained
   - Finds all references across the codebase

5. **`ts_get_definitions` → `lsp_get_definitions`**
   - Full functionality maintained
   - Jump to symbol definitions

6. **`get_type_at_symbol` → `lsp_get_hover`**
   - Full functionality maintained
   - Get type information and documentation
   - Parameter change: `symbolName` → `target`

7. **All TypeScript-specific tools**
   - `move_file` - No LSP equivalent
   - `move_directory` - No LSP equivalent
   - `get_module_symbols` - Use `lsp_get_document_symbols`
   - `get_type_in_module` - Use `lsp_get_hover`
   - `get_symbols_in_scope` - Use `lsp_get_completion`
   - `search_symbols` - Use `lsp_get_workspace_symbols`
   - `find_import_candidates` - No direct LSP equivalent

## All TypeScript-specific Tools Have Been Removed

As of the latest version, all TypeScript-specific tools that use the TypeScript Compiler API have been removed in favor of LSP-based alternatives. This provides better language independence and consistency across different language servers.

## Migration Examples

### Example 1: Type Information

**Before (TypeScript-specific):**
```javascript
await callTool({
  name: "get_type_at_symbol",
  arguments: {
    root: "/project",
    filePath: "src/index.ts",
    line: 10,
    symbolName: "myFunction"
  }
});
```

**After (LSP):**
```javascript
await callTool({
  name: "lsp_get_hover",
  arguments: {
    root: "/project",
    filePath: "src/index.ts",
    line: 10,
    target: "myFunction"
  }
});
```

### Example 2: Symbol Search

**Before (TypeScript-specific):**
```javascript
await callTool({
  name: "search_symbols",
  arguments: {
    root: "/project",
    query: "User",
    exact: true,
    includeNonExported: false
  }
});
```

**After (LSP - with limitations):**
```javascript
await callTool({
  name: "lsp_get_workspace_symbols",
  arguments: {
    root: "/project",
    query: "User"
  }
});
```

## Recommendations

1. **For new projects**: Use LSP tools for better language independence
2. **For existing TypeScript projects**: 
   - Continue using TypeScript-specific tools for features not available in LSP
   - Gradually migrate to LSP tools where functionality is equivalent
3. **For mixed-language projects**: Use LSP tools exclusively

## Configuration

To force LSP-only mode (disable TypeScript-specific tools):
```bash
FORCE_LSP=true npm start
```

To use both TypeScript-specific and LSP tools:
```bash
LSP_COMMAND="typescript-language-server --stdio" npm start
```