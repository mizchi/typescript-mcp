# TypeScript MCP Tools Migration Guide

This guide documents the migration from TypeScript-specific tools to LSP-based alternatives.

## Overview

We are gradually migrating TypeScript-specific tools that use the TypeScript Compiler API to LSP-based tools that work with any language server. This provides better language independence while maintaining most functionality.

## Migration Status

### ✅ Already Migrated

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

### 🔄 Partial Migration Available

These tools have LSP alternatives but with some feature differences:

1. **`search_symbols` → `lsp_get_workspace_symbols`**
   - TypeScript version features:
     - Pre-built index for faster search
     - File watching for real-time updates
     - Prefix match, exact match, and regex filtering
     - Distinguish between exported and non-exported symbols
   - LSP version limitations:
     - May be slower for large projects
     - Limited filtering options
     - Depends on language server implementation

2. **`get_symbols_in_scope` → `lsp_get_completion`**
   - TypeScript version features:
     - Get all symbols visible at a specific location
     - Detailed categorization (Value/Type/Namespace)
     - Option to exclude built-ins
   - LSP version limitations:
     - Primarily designed for code completion
     - May not return all visible symbols
     - Less detailed categorization

3. **`get_module_symbols` → `lsp_get_document_symbols`**
   - TypeScript version features:
     - Extract only exported symbols from a module
     - Categorize by types/interfaces/classes/functions
   - LSP version limitations:
     - Returns all symbols in the document
     - May require filtering for exports only

### ❌ No Direct LSP Alternative

These tools provide TypeScript-specific functionality not available in standard LSP:

1. **`move_file`**
   - Moves files and automatically updates all import statements
   - No standard LSP equivalent

2. **`move_directory`**
   - Moves directories and updates all TypeScript imports
   - No standard LSP equivalent

3. **`find_import_candidates`**
   - Fast search for import candidates with relative path calculation
   - LSP code actions provide limited import suggestions

4. **`get_type_in_module`**
   - Get detailed type signatures from a specific module
   - More detailed than what LSP hover provides

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