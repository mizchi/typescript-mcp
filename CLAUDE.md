You are a TypeScript/MCP expert developing the lsmcp tool - a unified Language Service MCP for multi-language support.

Given a URL, use read_url_content_as_markdown and summary contents.

## Tool Usage Guidelines

### TypeScript/JavaScript Projects (`--language typescript`)

When working with TypeScript projects, use these specialized tools:

| Task                           | Tool                           | Description                                    |
| ------------------------------ | ------------------------------ | ---------------------------------------------- |
| Find symbols                   | `lsmcp_search_symbols`         | Fast project-wide symbol search                |
| Get type info                  | `lsmcp_get_type_at_symbol`     | Detailed type information using Compiler API   |
| See module exports             | `lsmcp_get_module_symbols`     | List all exports from a module                 |
| Rename symbols                 | `lsmcp_rename_symbol`          | Semantic rename with import updates            |
| Move files                     | `lsmcp_move_file`              | Move with automatic import updates             |
| Find import candidates         | `lsmcp_find_import_candidates` | Suggest where to import symbols from           |

### All Languages (via LSP)

For any language with LSP support:

| Task                    | Tool                      | Description                        |
| ----------------------- | ------------------------- | ---------------------------------- |
| Find references         | `lsp_find_references`     | Find all usages of a symbol        |
| Go to definition        | `lsp_get_definitions`     | Jump to symbol definition          |
| Check errors            | `lsp_get_diagnostics`     | Get errors and warnings            |
| Rename symbols          | `lsp_rename_symbol`       | Rename across project              |
| Get hover info          | `lsp_get_hover`           | Documentation and type info        |
| Format code             | `lsp_format_document`     | Format according to language rules |

## Project Goal

Provide unified Language Server Protocol (LSP) features as Model Context Protocol (MCP) tools for multiple programming languages, with advanced TypeScript support via Compiler API.

## Key Features

- 🌍 **Multi-Language Support** - Built-in TypeScript/JavaScript, extensible to any language via LSP
- 🔍 **Semantic Code Analysis** - Go to definition, find references, type information
- ♻️ **Intelligent Refactoring** - Rename symbols, move files, with automatic import updates
- 🔧 **Flexible Configuration** - Use with any LSP server via `--bin` option
- 🤖 **AI-Optimized** - Designed for LLMs with line and symbol-based interfaces
- ⚡ **Fast Symbol Search** - Project-wide symbol index with real-time file watching
- 🎯 **Smart Import Suggestions** - Find and suggest import candidates with relative paths

## Development Stack

- pnpm: Package manager
- typescript: Core language
- ts-morph: TypeScript AST manipulation
- tsdown: Rolldown-based bundler
- @modelcontextprotocol/sdk: MCP implementation
- vscode-languageserver-protocol: LSP client implementation

## Coding Rules

- file: snake_case
- add `.ts` extensions to import. eg. `import {} from "./x.ts"` for deno compatibility.

## Git Workflow

When working with this project:

1. **Commit message format**: Use conventional commits (feat:, fix:, docs:, etc.)
2. **Branch naming**: Use descriptive names like `fix/issue-name` or `feat/feature-name`
3. **Pull requests**: Target the main branch with clear descriptions

## Code Modification Workflow

When modifying code in this project:

### 1. Development Commands

```bash
# Build the project
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck     # Using tsgo (faster)

# Linting
pnpm lint          # Run with --quiet flag
```

### 2. Testing Strategy

- Unit tests are located alongside source files using Vitest's in-source testing
- Integration tests are in the `tests/` directory
- Run specific tests: `pnpm test -- path/to/test.ts`
- Run tests matching pattern: `pnpm test -- -t "pattern"`

### 3. Code Quality Checks

Before committing, always run:

1. `pnpm typecheck` - Ensure no TypeScript errors
2. `pnpm lint` - Check for linting issues
3. `pnpm test` - Verify all tests pass

### 4. Refactoring Guidelines

- Use TypeScript MCP tools for semantic refactoring
- Maintain snake_case for filenames
- Always include `.ts` extension in imports
- Follow existing patterns in the codebase

## Directory Patterns

```
dist/               # Build output directory
  lsmcp.js         # Main unified LSP MCP CLI executable
  typescript-mcp.js # TypeScript-specific MCP server executable
  generic-lsp-mcp.js # Generic LSP MCP server executable

src/
  lsp/             # LSP client implementation
    tools/         # LSP-based MCP tools
    lspClient.ts   # LSP client core
    lspTypes.ts    # TypeScript types for LSP

  ts/              # TypeScript Compiler API and ts-morph
    commands/      # Operations with side effects (move, rename, delete)
    navigations/   # Read-only analysis operations
    tools/         # TypeScript MCP tool implementations
    projectCache.ts # Project instance caching

  mcp/             # MCP server implementations
    _mcplib.ts     # Generic MCP server library
    typescript-mcp.ts # TypeScript MCP server
    lsmcp.ts       # Main unified LSP MCP CLI (outputs as lsmcp.js)
    generic-lsp-mcp.ts # Generic LSP MCP server
    utils/         # MCP utility modules
      errorHandler.ts # Error handling with context
      languageSupport.ts # Language detection and support
      languageInit.ts # Language-specific initialization

  fsharp/          # F# specific implementations
    fsharpInit.ts  # F# language server initialization

  textUtils/       # Text manipulation utilities

tests/             # Integration tests
  mcp-client.test.ts
  mcp-integration.test.ts
  move_file.test.ts
  rename.test.ts

.claude/           # Claude-specific configuration
  commands/        # Custom command definitions
  settings.json    # Permissions configuration
```

## Architecture Overview

### MCP Server Library (`_mcplib.ts`)

The project uses a generic MCP server library that provides:

- `BaseMcpServer` class for common server functionality
- Automatic permission generation from tool definitions
- `debug()` function for stderr output (required for MCP protocol)
- Configuration file helpers for `.mcp.json` and `.claude/settings.json`

### TypeScript Project Management

- Uses `ts-morph` for TypeScript AST manipulation
- Project instances are cached for performance
- Supports both tsconfig-based and default projects
- File dependency resolution is disabled by default for performance

### Tool Implementation Pattern

Each tool follows this structure:

```typescript
export const toolNameTool: ToolDef<typeof schema> = {
  name: "tool_name",
  description: "Tool description",
  schema: z.object({
    /* parameters */
  }),
  execute: async (args) => {
    // Implementation
    return resultString;
  },
};
```

### Common Utilities

- `src/ts/utils/moduleResolution.ts` - Shared module path resolution logic
- `src/ts/utils/symbolNavigation.ts` - Common helpers for finding nodes and symbols
- `src/ts/utils/toolHandlers.ts` - Shared tool preparation and context setup
- `src/mcp/languageServerInit.ts` - Unified language server initialization

## Implementation Notes

### Line-based Interface Design

AI はワードカウントが苦手なので、LSP の Line Character ではなく、一致する行と、一致するコードでインターフェースを調整する必要があります。すべてのツールは以下の方式を採用:

- `line`: 行番号（1-based）または行内の文字列マッチング
- `symbolName`: シンボル名での指定
- Character offset は使用しない

### Symbol Index Architecture

- ファイル変更を自動検知して更新
- プロジェクト全体のシンボルを高速検索
- ts-morph のプロジェクトインスタンスをキャッシュ

## Tool Categories

### TypeScript-specific Tools (Compiler API)

These tools use TypeScript Compiler API directly and are only available with `--language typescript`:

- `lsmcp_move_file`, `lsmcp_move_directory` - Move with import updates
- `lsmcp_rename_symbol`, `lsmcp_delete_symbol` - Semantic refactoring using TypeScript Compiler API
- `lsmcp_get_type_at_symbol`, `lsmcp_get_module_symbols` - Advanced type analysis
- `lsmcp_search_symbols`, `lsmcp_find_import_candidates` - Fast symbol indexing
- `lsmcp_get_symbols_in_scope` - Scope-aware symbol analysis

### LSP-based Tools (All Languages)

These tools work with any language that has an LSP server:

- `lsp_get_hover`, `lsp_find_references`, `lsp_get_definitions` - Navigation and information
- `lsp_get_diagnostics` - Error checking and warnings
- `lsp_rename_symbol`, `lsp_delete_symbol` - Refactoring operations
- `lsp_get_document_symbols`, `lsp_get_workspace_symbols` - Symbol listing
- `lsp_get_completion`, `lsp_get_signature_help` - Code completion
- `lsp_get_code_actions`, `lsp_format_document` - Code fixes and formatting

Note: When using `--language typescript`, both LSP and TypeScript-specific tools are available.

## Recent Changes (2025-01-29)

1. **TypeScript Tool Consolidation**
   - Removed duplicate TypeScript tools (`ts_find_references`, `ts_get_definitions`, `ts_get_diagnostics`, `ts_rename_symbol`, `ts_delete_symbol`)
   - LSP tools now handle all reference/definition/diagnostic operations
   - TypeScript-specific tools only appear with `--language typescript`

2. **F# Language Support**
   - Moved F#-specific initialization to `src/fsharp/` directory
   - Created modular language initialization system

3. **Test Performance Optimization**
   - Fixed LSP process pool to use direct `node_modules/.bin/` paths
   - Added test categorization: `test:ts`, `test:lsp`, `test:mcp`

## Recent Changes (2025-01-27)

1. **Added Python MCP Tests**

   - `tests/python-mcp.test.ts` - Comprehensive Python MCP server tests
   - `tests/python-lsmcp.test.ts` - Python language detection and lsmcp integration tests

2. **Code Duplication Refactoring**

   - Extracted common `resolveModulePath` function to `src/ts/utils/moduleResolution.ts`
   - Created shared navigation helpers in `src/ts/utils/symbolNavigation.ts`
   - Unified tool handlers with `src/ts/utils/toolHandlers.ts`
   - Consolidated language server initialization in `src/mcp/languageServerInit.ts`

3. **Multi-language Support Improvements**
   - Added `--include` option for batch diagnostics with glob patterns
   - Enhanced language detection for Python, Go, Java, and other languages
   - Improved error handling and user feedback

## Current Status

### Supported Languages

- **TypeScript/JavaScript** - Full support with advanced features
- **Other Languages** - Via LSP with `--bin` option:
  - Rust (`rust-analyzer`)
  - Python (`pylsp`)
  - Go (`gopls`)
  - C/C++ (`clangd`)
  - Java (`jdtls`)
  - Ruby (`solargraph`)

### Installation

```bash
# TypeScript/JavaScript
claude mcp add npx -- -y @mizchi/lsmcp --language=typescript

# Other languages
claude mcp add npx -- -y @mizchi/lsmcp --bin="rust-analyzer"  # Rust
claude mcp add npx -- -y @mizchi/lsmcp --bin="pylsp"          # Python
```

## TODO

- [ ] Multi Project support
- [ ] Extract function refactoring
- [ ] Add Java MCP tests
- [ ] Enhanced error recovery for LSP communication
- [x] Fix MCP client tests for move_file and delete_symbol ✅ 2025-01-13
- [x] Add Python MCP tests ✅ 2025-01-26
- [x] Refactor code duplication ✅ 2025-01-26
- [x] Unified lsmcp CLI for all languages ✅ 2025-01-27

## LICENSE

MIT

