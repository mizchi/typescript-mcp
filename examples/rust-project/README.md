# Rust Example Project

This example demonstrates how to use lsmcp with Rust projects using rust-analyzer.

## Prerequisites

- rust-analyzer must be installed and available in your PATH
  ```bash
  rustup component add rust-analyzer
  ```

## How to use

```bash
claude mcp add rust npx -- -y @mizchi/lsmcp -l rust --bin "rust-analyzer"
```

## Configuration

The `.mcp.json` file is configured to use rust-analyzer:

```json
{
  "mcpServers": {
    "rust": {
      "command": "node",
      "args": ["../../dist/lsmcp.js", "--bin", "rust-analyzer"]
    }
  }
}
```

## Available LSP Tools

When using lsmcp with rust-analyzer, the following LSP-based tools are available:

- `lsp_get_hover` - Get type information and documentation
- `lsp_find_references` - Find all references to a symbol
- `lsp_get_definitions` - Go to definition
- `lsp_get_diagnostics` - Get compiler errors and warnings
- `lsp_rename_symbol` - Rename symbols across the project
- `lsp_get_document_symbols` - List all symbols in a file
- `lsp_get_completion` - Get code completions
- `lsp_format_document` - Format code using rustfmt
- `lsp_get_code_actions` - Get available code actions and quick fixes

## Testing MCP Tools

1. Build the MCP servers:

```bash
cd ../..
pnpm build
```

2. Test the tools with Claude or any MCP client:

### Basic Commands

```
Use lsp_get_hover on the Calculator struct in src/lib.rs
Use lsp_find_references to find all uses of the greet function
Use lsp_get_diagnostics on src/main.rs
Use lsp_rename_symbol to rename "Calculator" to "Calc" in src/lib.rs
```

### Testing Error Detection

To test error detection, uncomment line 5 in src/main.rs:

```rust
let foo: i32 = "xx";  // This will show a type error
```

Then run:

```
Use lsp_get_diagnostics on src/main.rs
```

You should see a type mismatch error.

### Available Files

- `src/main.rs` - Main entry point demonstrating usage
- `src/lib.rs` - Library with Calculator struct and greet function
- `src/errors.rs` - File with intentional errors for testing diagnostics
- `Cargo.toml` - Project configuration

## Troubleshooting

If diagnostics show 0 errors when there should be errors:

1. Ensure rust-analyzer is installed: `rustup component add rust-analyzer`
2. Check that the Cargo.toml has a valid edition (2015, 2018, or 2021)
3. Try running `cargo check` in the project directory to verify the project compiles
