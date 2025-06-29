# lsmcp - Language Service MCP

**LSP for headless AI Agents**

> ⚠️ **This project is under active development.** APIs and features may change without notice.

A unified MCP (Model Context Protocol) server that provides advanced code manipulation and analysis capabilities for multiple programming languages through Language Server Protocol integration.

## Features

- 🌍 **Multi-Language Support** - Built-in TypeScript/JavaScript, extensible to any language via LSP
- 🔍 **Semantic Code Analysis** - Go to definition, find references, type information
- ♻️ **Intelligent Refactoring** - Rename symbols, move files, with automatic import updates
- 🔧 **Flexible Configuration** - Use with any LSP server via `--bin` option
- 🤖 **AI-Optimized** - Designed for LLMs with line and symbol-based interfaces
- ⚡ **Fast Symbol Search** - Project-wide symbol index with real-time file watching
- 🎯 **Smart Import Suggestions** - Find and suggest import candidates with relative paths
- 🐛 **Debug Support** - DAP integration for debugging with breakpoints, step execution, and variable inspection

See [Language Support Matrix](docs/LANGUAGE_SUPPORT_MATRIX.md) for detailed information about available tools for each language.

See [Tool Categories](docs/TOOL_CATEGORIES.md) for the difference between TypeScript-specific and LSP-based tools.

## Motivation

While AI assistants like Claude can see errors in the IDE, they cannot perform semantic refactorings such as Go to Definition or Rename without proper tooling.

This project provides AI with functionality equivalent to Language Server Protocol (LSP) features. Since LLMs are not good at precise position tracking, we provide these features through line numbers and symbol names instead of character offsets.

## Quick Start

### 1. Install Language Server

<details>
<summary>Language Server Installation Guide</summary>

| Language              | Install Command                                                             | LSP Binary                   |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| TypeScript/JavaScript | `npm add typescript typescript-language-server`                             | `typescript-language-server` |
| Rust                  | `rustup component add rust-analyzer`                                        | `rust-analyzer`              |
| Python                | `pip install python-lsp-server`                                             | `pylsp`                      |
| Go                    | Download from [releases](https://github.com/golang/tools/tree/master/gopls) | `gopls`                      |
| C/C++                 | `apt install clangd` or `brew install llvm`                                 | `clangd`                     |
| Java                  | Download from [eclipse.org](https://download.eclipse.org/jdtls/)            | `jdtls`                      |
| Ruby                  | `gem install solargraph`                                                    | `solargraph`                 |

</details>

### 2. Add MCP Server

```bash
# TypeScript/JavaScript
claude mcp add typescript npx -- -y @mizchi/lsmcp --language=typescript

# Other languages (use --bin with LSP command)
claude mcp add rust npx -- -y @mizchi/lsmcp --bin="rust-analyzer" # Rust
claude mcp add python npx -- -y @mizchi/lsmcp --bin="pylsp"       # Python
claude mcp add go npx -- -y @mizchi/lsmcp --bin="gopls"           # Go
```

### 3. Start Claude

```bash
claude
```

## Manual Configuration

<details>
<summary>MCP Server Configuration (.mcp.json)</summary>

```json
{
  "mcpServers": {
    "lsmcp": {
      "command": "npx",
      "args": ["-y", "@mizchi/lsmcp", "--language", "typescript"]
    }
  }
}
```

For other languages, use the `--bin` option:

```json
{
  "mcpServers": {
    "rust": {
      "command": "npx",
      "args": ["-y", "@mizchi/lsmcp", "--bin", "rust-analyzer"]
    }
  }
}
```

</details>

<details>
<summary>Permissions Setup (.claude/settings.json)</summary>

```json
{
  "permissions": {
    "allow": [
      // Allow all lsmcp tools
      "mcp__lsmcp__lsmcp_*",
      // TypeScript-specific server (when using --language typescript)
      "mcp__typescript__lsmcp_*"
    ],
    "deny": []
  }
}
```

</details>

## Usage

### Command Line Options

```bash
# TypeScript/JavaScript (built-in support)
npx @mizchi/lsmcp --language typescript

# Other languages via LSP server
npx @mizchi/lsmcp --bin rust-analyzer
npx @mizchi/lsmcp --bin "deno lsp"  # Multi-word commands

# Specify project root
npx @mizchi/lsmcp --project-root /path/to/project

# Debug mode
npx @mizchi/lsmcp --verbose
```

### Batch Operations

Check diagnostics for multiple files:

```bash
# Check all TypeScript files
lsmcp --include "src/**/*.ts"

# Check specific patterns
lsmcp --include "src/**/*.ts" --include "test/**/*.ts"

# Exclude patterns
lsmcp --include "**/*.ts" --exclude "node_modules/**"
```

### Environment Variables

```bash
# Use custom LSP command
export LSP_COMMAND="my-custom-lsp --stdio"
npx @mizchi/lsmcp
```

## CRITICAL: Tool Usage Priority for Refactoring

**When performing refactoring operations on TypeScript/JavaScript code, ALWAYS use lsmcp MCP tools instead of the default Edit/Write tools.**

For example:

- ✅ Use `lsmcp_rename_symbol` for renaming
- ❌ Don't use Edit/MultiEdit/Write for refactoring
- ✅ Use `lsmcp_move_file` for moving files
- ❌ Don't use Bash(mv) or Write

These tools understand the semantic structure of your code and will update all references automatically.

## Available Tools

### TypeScript/JavaScript Enhanced Tools

In addition to standard LSP tools, TypeScript/JavaScript projects have access to:

- **lsmcp_move_file** - Move files and update all import statements
- **lsmcp_move_directory** - Move directories and update all imports
- **lsmcp_delete_symbol** - Delete symbols and all their references
- **lsmcp_rename_symbol** - Rename across entire codebase
- **lsmcp_get_type_at_symbol** - Get detailed type information
- **lsmcp_get_module_symbols** - List all exports from a module
- **lsmcp_search_symbols** - Fast project-wide symbol search
- **lsmcp_find_import_candidates** - Find and suggest imports

### Standard LSP Tools

All languages support these LSP-based tools:

- **lsmcp_get_hover** - Get documentation and type info
- **lsmcp_get_definitions** - Go to definition
- **lsmcp_find_references** - Find all references
- **lsmcp_get_diagnostics** - Get errors and warnings
- **lsmcp_get_document_symbols** - List symbols in file
- **lsmcp_get_workspace_symbols** - Search project symbols
- **lsmcp_rename_symbol** - Rename (LSP-based)
- **lsmcp_get_completion** - Get code completions
- **lsmcp_get_signature_help** - Get function signatures
- **lsmcp_format_document** - Format code
- **lsmcp_get_code_actions** - Get available fixes

See [Tool Reference](docs/TOOL_REFERENCE.md) for detailed documentation.

## AI Assistant Integration

For best results with AI assistants, include this context:

```markdown
I have lsmcp MCP server connected, which provides LSP-based code intelligence tools.

Available tools:

- lsmcp_find_references - Find all usages of a symbol
- lsmcp_get_definitions - Jump to definition
- lsmcp_rename_symbol - Rename across project
- lsmcp_get_diagnostics - Get errors/warnings
  [... other tools based on your language ...]

Please use these tools to explore the codebase and perform refactoring operations.
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

See [CLAUDE.md](CLAUDE.md) for development guidelines.

## Troubleshooting

<details>
<summary>Common Issues</summary>

### LSP Server Not Found

```
Error: LSP server for typescript not found
```

**Solution**: Install the language server:

```bash
npm add typescript typescript-language-server
```

### Permission Denied

```
Error: Permission denied for tool 'lsmcp_rename_symbol'
```

**Solution**: Update `.claude/settings.json` to allow lsmcp tools.

### Empty Diagnostics

If `lsmcp_get_diagnostics` returns empty results:

1. Ensure the language server is running: `ps aux | grep language-server`
2. Check for tsconfig.json or equivalent config file
3. Try opening the file first with `lsmcp_get_hover`

### Debugging

Enable verbose logging:

```bash
npx @mizchi/lsmcp --verbose
```

Check language server output:

```bash
# Run language server directly
typescript-language-server --stdio
```

</details>

## License

MIT - See [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
