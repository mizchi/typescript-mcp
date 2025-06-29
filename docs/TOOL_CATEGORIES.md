# Tool Categories

## TypeScript-Only Tools

These tools use the TypeScript Compiler API directly and are **only available for TypeScript/JavaScript projects**. They cannot be used with other languages.

### Why TypeScript-specific?

These tools leverage TypeScript's powerful compiler API to provide features that go beyond what standard LSP offers:

- **Type information at runtime**: Get detailed type signatures and relationships
- **Module resolution**: Follow TypeScript's complex module resolution logic
- **AST manipulation**: Direct access to the TypeScript AST for precise refactoring
- **Symbol indexing**: Fast project-wide symbol search with caching

### TypeScript-Only Tools List

1. **ts_find_references** - Find all references (TypeScript Compiler API version)
   - More accurate than LSP version
   - Includes type information

2. **ts_get_definitions** - Go to definition (TypeScript Compiler API version)
   - Direct access to TypeScript's definition resolution

3. **ts_get_diagnostics** - Get diagnostics (TypeScript Compiler API version)
   - Direct access to TypeScript's diagnostic system

4. **ts_rename_symbol** - Rename symbols (TypeScript Compiler API version)
   - More reliable for complex refactoring

5. **ts_delete_symbol** - Delete symbols and references (TypeScript Compiler API version)
   - Handles import cleanup automatically

6. **get_symbols_in_scope** - Get all symbols visible at a specific location
   - Uses TypeScript's type checker to understand scope and visibility
   - Can filter by symbol type (Variable, Function, Class, etc.)
   - Excludes built-in types by default (includeBuiltins: false)

7. **get_module_symbols** - Get all exported symbols from a module
   - Resolves module paths using TypeScript's module resolution
   - Shows all exports without detailed signatures

8. **get_type_in_module** - Get detailed type information for a specific export
   - Provides full type signatures and documentation
   - Resolves complex types and generics

9. **get_type_at_symbol** - Get type information at a specific location
   - Shows inferred types for variables
   - Displays function signatures and return types

10. **search_symbols** - Fast project-wide symbol search
    - Uses a pre-built index for performance
    - Supports partial matching and filtering by kind

11. **find_import_candidates** - Find potential imports for a symbol
    - Suggests both relative and package imports
    - Calculates optimal import paths

12. **move_file** / **move_directory** - Move files with import updates
    - Updates all import/export statements across the project
    - Handles complex re-exports and barrel files

## LSP-Based Tools

These tools work with any language that has an LSP server. They provide standard IDE features across all supported languages.

### Available for All Languages

1. **lsp_get_hover** - Get hover information (documentation, types)
2. **lsp_find_references** - Find all references to a symbol
3. **lsp_get_definitions** - Go to definition
4. **lsp_get_diagnostics** - Get errors and warnings
5. **lsp_rename_symbol** - Rename across the codebase
6. **lsp_delete_symbol** - Delete a symbol and all references
7. **lsp_get_document_symbols** - List all symbols in a file
8. **lsp_get_workspace_symbols** - Search symbols project-wide
9. **lsp_get_completion** - Get code completion suggestions
10. **lsp_get_signature_help** - Get parameter hints
11. **lsp_get_code_actions** - Get available quick fixes
12. **lsp_format_document** - Format code

### Language Support Requirements

To use LSP tools with a language:
1. Install the language's LSP server
2. Run lsmcp with the appropriate language flag or binary path
3. The LSP server must support the requested feature

See [Language Support Matrix](./LANGUAGE_SUPPORT_MATRIX.md) for feature availability by language.

## Choosing the Right Tool

### Use TypeScript tools when:
- Working with TypeScript/JavaScript projects
- You need type information beyond what LSP provides
- You need fast symbol search or import suggestions
- You're doing complex refactoring (moving files, deleting symbols)

### Use LSP tools when:
- Working with any language other than TypeScript
- You need standard IDE features (hover, go to definition)
- You want consistent behavior across languages
- You need code completion or formatting

## Examples

### TypeScript-specific example:
```typescript
// Get all symbols in scope (TypeScript only)
lsmcp_get_symbols_in_scope({
  filePath: "src/index.ts",
  line: 10,
  includeBuiltins: false,  // Exclude DOM/Node built-ins
  meaning: "Variable"      // Only show variables
})
```

### LSP example (works with any language):
```typescript
// Find references (works with any language)
lsp_find_references({
  filePath: "src/main.rs",
  line: 15,
  character: 10
})
```