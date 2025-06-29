import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "lsmcp": "src/mcp/lsmcp.ts",
    "typescript-mcp": "src/mcp/typescript-mcp.ts",
    "generic-lsp-mcp": "src/mcp/generic-lsp-mcp.ts",
  },
  define: {
    "import.meta.vitest": "undefined",
  },
});
