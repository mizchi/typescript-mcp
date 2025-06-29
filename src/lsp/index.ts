// Main LSP client exports
export {
  createLSPClient,
  type DefinitionResult,
  getActiveClient,
  getLSPClient,
  type HoverContents,
  type HoverResult,
  initialize,
  type LSPClient,
  type LSPClientConfig,
  type ReferencesResult,
  shutdown,
} from "./lspClient.ts";
