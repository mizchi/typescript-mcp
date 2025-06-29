# TypeScript MCP Server Tests

This directory contains tests for the TypeScript MCP (Model Context Protocol)
server implementation.

## Test Structure

- `mcp-integration.test.ts` - Basic MCP server integration tests
- `mcp-client.test.ts` - Tests for TypeScript-specific MCP tools

## Running Tests

To run all tests:

```bash
pnpm test
```

To run specific test files:

```bash
pnpm test tests/mcp-integration.test.ts
pnpm test tests/mcp-client.test.ts
pnpm test tests/mcp-lsp-integration.test.ts
```

## MCP Client Usage Example

Here's an example of how to use the MCP client with the TypeScript MCP server:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Create transport with server parameters
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/lsmcp.js"],
  env: process.env as Record<string, string>,
});

// Create and connect client
const client = new Client({
  name: "my-client",
  version: "1.0.0",
});

await client.connect(transport);

// List available tools
const response = await client.listTools();
console.log("Available tools:", response.tools.map((t) => t.name));

// Call a tool
const result = await client.callTool({
  name: "get_module_symbols",
  arguments: {
    root: process.cwd(),
    moduleName: "neverthrow",
  },
});

console.log("Tool result:", result.content);

// Clean up
await client.close();
```

## Available Tools

The TypeScript MCP server provides the following tools:

### TypeScript Analysis Tools

- `get_module_symbols` - Get all exported symbols from a module
- `get_type_in_module` - Get detailed type information for a specific symbol
- `get_type_at_symbol` - Get type information at a specific location
- `get_symbols_in_scope` - Get all symbols available at a specific location

### TypeScript Refactoring Tools

- `rename_symbol` - Rename a symbol across the codebase
- `move_file` - Move a file and update all imports
- `move_directory` - Move a directory and update all imports
- `delete_symbol` - Delete a symbol and its references

### LSP Tools (Available in dist/generic-lsp-mcp.js)

- `lsp_get_hover` - Get hover information for a symbol
- `lsp_find_references` - Find all references to a symbol
- `lsp_get_definitions` - Get definition locations for a symbol
- `lsp_get_diagnostics` - Get TypeScript diagnostics for a file

**Note**: LSP tools are provided in a separate MCP server
(`dist/generic-lsp-mcp.js`) and not included in the main TypeScript MCP server.

## Test Environment

The tests create temporary directories for each test case to ensure isolation.
The MCP server is started as a child process and communicates via stdio streams.

## Troubleshooting

If tests fail:

1. Ensure the TypeScript MCP server is built:
   ```bash
   pnpm build
   ```

2. Check that all dependencies are installed:
   ```bash
   pnpm install
   ```

3. For debugging, you can run tests with more verbose output:
   ```bash
   pnpm test -- --reporter=verbose
   ```
