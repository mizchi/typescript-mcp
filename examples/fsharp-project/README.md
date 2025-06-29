# Fsharp Example

Install `fsautocomplete`

https://github.com/ionide/FsAutoComplete

## How to use

```bash
claude mcp add fsharp npx -- -y @mizchi/lsmcp -l fsharp --bin "fsautocomplete --adaptive-lsp-server-enabled"
```

## Develop

```bash
pnpm build # build dist/lsmcp.js
claude --mcp-config=.mcp.json
```

```json
{
  "mcpServers": {
    "fsharp": {
      "command": "node",
      "args": [
        "../../dist/lsmcp.js",
        "--bin",
        "fsautocomplete --adaptive-lsp-server-enabled"
      ]
    }
  }
}
```
