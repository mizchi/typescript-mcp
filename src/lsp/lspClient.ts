import { EventEmitter } from "events";
import { Position, Location, Diagnostic, WorkspaceEdit, DocumentSymbol, SymbolInformation, CompletionItem, SignatureHelp, CodeAction, Command, Range, TextEdit, FormattingOptions } from "vscode-languageserver-types";
import { ChildProcess } from "child_process";
import {
  LSPMessage,
  TextDocumentPositionParams,
  PublishDiagnosticsParams,
  ReferenceParams,
  InitializeParams,
  InitializeResult,
  DidOpenTextDocumentParams,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  HoverResult,
  DefinitionResult,
  ReferencesResult,
  HoverContents,
  LSPClientState,
  LSPClientConfig,
  LSPClient,
  ApplyWorkspaceEditParams,
  ApplyWorkspaceEditResponse,
  DocumentSymbolResult,
  WorkspaceSymbolResult,
  CompletionResult,
  SignatureHelpResult,
  CodeActionResult,
  FormattingResult,
} from "./lspTypes.ts";
import { debug } from "../mcp/_mcplib.ts";
import { formatError, debugLog, ErrorContext } from "../mcp/utils/errorHandler.ts";

// Re-export types for backward compatibility
export type {
  HoverResult,
  DefinitionResult,
  ReferencesResult,
  HoverContents,
  LSPClientConfig,
  LSPClient,
};

// Global state for active client
let activeClient: LSPClient | null = null;

/**
 * Set the active LSP client (for testing purposes)
 * @param client The LSP client to set as active
 */
export function setActiveClient(client: LSPClient | null): void {
  activeClient = client;
}

/**
 * Get the active LSP client
 * @returns The active LSP client or undefined if not initialized
 */
export function getLSPClient(): LSPClient | undefined {
  return activeClient ?? undefined;
}

/**
 * Initialize a global LSP client with the given process
 * @param rootPath The root path of the project
 * @param process The LSP server process
 * @param languageId The language ID (default: "typescript")
 * @returns The initialized LSP client
 */
export async function initialize(
  rootPath: string,
  process: ChildProcess,
  languageId: string = "typescript"
): Promise<LSPClient> {
  // Stop existing client if any
  if (activeClient) {
    await activeClient.stop().catch(() => {});
  }

  // Create new client
  activeClient = createLSPClient({
    rootPath,
    process,
    languageId,
  });

  // Start the client
  await activeClient.start();

  return activeClient;
}

/**
 * Get the active LSP client
 * @throws Error if no client is initialized
 * @returns The active LSP client
 */
export function getActiveClient(): LSPClient {
  if (!activeClient) {
    throw new Error("No active LSP client. Call initialize() first.");
  }
  return activeClient;
}

/**
 * Shutdown and clear the active LSP client
 */
export async function shutdown(): Promise<void> {
  if (activeClient) {
    await activeClient.stop().catch(() => {});
    activeClient = null;
  }
}
export function createLSPClient(config: LSPClientConfig): LSPClient {
  const state: LSPClientState = {
    process: config.process,
    messageId: 0,
    responseHandlers: new Map(),
    buffer: "",
    contentLength: -1,
    diagnostics: new Map(),
    eventEmitter: new EventEmitter(),
    rootPath: config.rootPath,
    languageId: config.languageId || "typescript",
  };
  
  // Track open documents
  const openDocuments = new Set<string>();

  function processBuffer(): void {
    while (state.buffer.length > 0) {
      if (state.contentLength === -1) {
        // Look for Content-Length header
        const headerEnd = state.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          return;
        }

        const header = state.buffer.substring(0, headerEnd);
        const contentLengthMatch = header.match(/Content-Length: (\d+)/);
        if (!contentLengthMatch) {
          debug("Invalid LSP header:", header);
          state.buffer = state.buffer.substring(headerEnd + 4);
          continue;
        }

        state.contentLength = parseInt(contentLengthMatch[1], 10);
        state.buffer = state.buffer.substring(headerEnd + 4);
      }

      if (state.buffer.length < state.contentLength) {
        // Wait for more data
        return;
      }

      const messageBody = state.buffer.substring(0, state.contentLength);
      state.buffer = state.buffer.substring(state.contentLength);
      state.contentLength = -1;

      try {
        const message = JSON.parse(messageBody) as LSPMessage;
        handleMessage(message);
      } catch (error) {
        debug("Failed to parse LSP message:", messageBody, error);
      }
    }
  }

  function handleMessage(message: LSPMessage): void {
    if (
      message.id !== undefined &&
      (message.result !== undefined || message.error !== undefined)
    ) {
      // This is a response
      const handler = state.responseHandlers.get(message.id);
      if (handler) {
        handler(message);
        state.responseHandlers.delete(message.id);
      }
    } else if (message.method) {
      // This is a notification or request from server
      if (
        message.method === "textDocument/publishDiagnostics" &&
        message.params
      ) {
        // Store diagnostics for the file
        const params = message.params as PublishDiagnosticsParams;
        state.diagnostics.set(params.uri, params.diagnostics);
        // Emit specific diagnostics event
        state.eventEmitter.emit("diagnostics", params);
      }
      state.eventEmitter.emit("message", message);
    }
  }

  function sendMessage(message: LSPMessage): void {
    if (!state.process) {
      throw new Error("LSP server not started");
    }

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    state.process.stdin?.write(header + content);
  }

  function sendRequest<T = unknown>(
    method: string,
    params?: unknown
  ): Promise<T> {
    const id = ++state.messageId;
    const message: LSPMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      // Set timeout for requests
      const timeout = setTimeout(() => {
        state.responseHandlers.delete(id);
        const context: ErrorContext = {
          operation: method,
          language: state.languageId,
          details: { method, params }
        };
        reject(new Error(formatError(new Error(`Request '${method}' timed out after 30 seconds`), context)));
      }, 30000);
      
      state.responseHandlers.set(id, (response) => {
        clearTimeout(timeout);
        state.responseHandlers.delete(id);
        
        if (response.error) {
          const context: ErrorContext = {
            operation: method,
            language: state.languageId,
            details: { 
              errorCode: response.error.code,
              errorData: response.error.data
            }
          };
          reject(new Error(formatError(new Error(response.error.message), context)));
        } else {
          resolve(response.result as T);
        }
      });

      sendMessage(message);
    });
  }

  function sendNotification(method: string, params?: unknown): void {
    const message: LSPMessage = {
      jsonrpc: "2.0",
      method,
      params,
    };
    sendMessage(message);
  }

  async function initialize(): Promise<void> {
    const initParams: InitializeParams = {
      processId: process.pid,
      clientInfo: {
        name: config.clientName || "lsp-client",
        version: config.clientVersion || "0.1.0",
      },
      locale: "en",
      rootPath: state.rootPath,
      rootUri: `file://${state.rootPath}`,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
          definition: {
            linkSupport: true,
          },
          references: {},
          hover: {
            contentFormat: ["markdown", "plaintext"],
          },
          completion: {
            completionItem: {
              snippetSupport: true,
            },
          },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
        },
      },
      // Add Deno-specific initialization options
      initializationOptions: state.languageId === "deno" ? {
        enable: true,
        lint: true,
        unstable: true,
      } : undefined,
    };

    await sendRequest<InitializeResult>("initialize", initParams);

    // Send initialized notification
    sendNotification("initialized", {});
  }

  async function start(): Promise<void> {
    if (!state.process) {
      throw new Error("No process provided to LSP client");
    }

    let stderrBuffer = "";
    
    state.process.stdout?.on("data", (data: Buffer) => {
      state.buffer += data.toString();
      processBuffer();
    });

    state.process.stderr?.on("data", (data: Buffer) => {
      stderrBuffer += data.toString();
      debugLog("LSP stderr:", data.toString());
    });

    state.process.on("exit", (code) => {
      debugLog(`LSP server exited with code ${code}`);
      state.process = null;
      
      if (code !== 0 && code !== null) {
        const context: ErrorContext = {
          operation: "LSP server process",
          language: state.languageId,
          details: { exitCode: code, stderr: stderrBuffer }
        };
        const error = new Error(`LSP server exited unexpectedly with code ${code}`);
        debug(formatError(error, context));
      }
    });

    state.process.on("error", (error) => {
      debugLog("LSP server error:", error);
      const context: ErrorContext = {
        operation: "LSP server startup",
        language: state.languageId
      };
      debug(formatError(error, context));
    });

    // Initialize the LSP connection with better error handling
    try {
      await initialize();
    } catch (error) {
      const context: ErrorContext = {
        operation: "LSP initialization",
        language: state.languageId
      };
      throw new Error(formatError(error, context));
    }
  }

  function openDocument(uri: string, text: string): void {
    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri,
        languageId: state.languageId,
        version: 1,
        text,
      },
    };
    sendNotification("textDocument/didOpen", params);
    openDocuments.add(uri);
  }

  function closeDocument(uri: string): void {
    const params: DidCloseTextDocumentParams = {
      textDocument: {
        uri,
      },
    };
    sendNotification("textDocument/didClose", params);
    // Also clear diagnostics for this document
    state.diagnostics.delete(uri);
    openDocuments.delete(uri);
  }
  
  function isDocumentOpen(uri: string): boolean {
    return openDocuments.has(uri);
  }

  function updateDocument(uri: string, text: string, version: number): void {
    const params: DidChangeTextDocumentParams = {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text }],
    };
    sendNotification("textDocument/didChange", params);
  }

  async function findReferences(
    uri: string,
    position: Position
  ): Promise<Location[]> {
    const params: ReferenceParams = {
      textDocument: { uri },
      position,
      context: {
        includeDeclaration: true,
      },
    };
    const result = await sendRequest<ReferencesResult>(
      "textDocument/references",
      params
    );
    return result ?? [];
  }

  async function getDefinition(
    uri: string,
    position: Position
  ): Promise<Location | Location[]> {
    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };
    const result = await sendRequest<DefinitionResult>(
      "textDocument/definition",
      params
    );

    if (!result) {
      return [];
    }

    if (Array.isArray(result)) {
      return result;
    }

    // Handle single Location or Definition
    if ("uri" in result) {
      return [result];
    }

    // Handle Definition type (convert to Location)
    if ("range" in result && "uri" in result) {
      return [result as Location];
    }

    return [];
  }

  async function getHover(
    uri: string,
    position: Position
  ): Promise<HoverResult> {
    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };
    const result = await sendRequest<HoverResult>("textDocument/hover", params);
    return result;
  }

  function getDiagnostics(uri: string): Diagnostic[] {
    // In LSP, diagnostics are pushed by the server via notifications
    // We need to retrieve them from our diagnostics storage
    return state.diagnostics.get(uri) || [];
  }

  async function getDocumentSymbols(
    uri: string
  ): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const params = {
      textDocument: { uri }
    };
    const result = await sendRequest<DocumentSymbolResult>(
      "textDocument/documentSymbol",
      params
    );
    return result ?? [];
  }

  async function getWorkspaceSymbols(
    query: string
  ): Promise<SymbolInformation[]> {
    const params = { query };
    const result = await sendRequest<WorkspaceSymbolResult>(
      "workspace/symbol",
      params
    );
    return result ?? [];
  }

  async function getCompletion(
    uri: string,
    position: Position
  ): Promise<CompletionItem[]> {
    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };
    const result = await sendRequest<CompletionResult>(
      "textDocument/completion",
      params
    );
    
    if (!result) {
      return [];
    }
    
    // Handle both CompletionItem[] and CompletionList
    if (Array.isArray(result)) {
      return result;
    } else if ("items" in result) {
      return result.items;
    }
    
    return [];
  }

  async function resolveCompletionItem(
    item: CompletionItem
  ): Promise<CompletionItem> {
    const result = await sendRequest<CompletionItem>(
      "completionItem/resolve",
      item
    );
    return result ?? item;
  }

  async function getSignatureHelp(
    uri: string,
    position: Position
  ): Promise<SignatureHelp | null> {
    const params: TextDocumentPositionParams = {
      textDocument: { uri },
      position,
    };
    const result = await sendRequest<SignatureHelpResult>(
      "textDocument/signatureHelp",
      params
    );
    return result;
  }

  async function getCodeActions(
    uri: string,
    range: Range,
    context?: { diagnostics?: Diagnostic[] }
  ): Promise<(Command | CodeAction)[]> {
    const params = {
      textDocument: { uri },
      range,
      context: context || { diagnostics: [] },
    };
    const result = await sendRequest<CodeActionResult>(
      "textDocument/codeAction",
      params
    );
    return result ?? [];
  }

  async function formatDocument(
    uri: string,
    options: FormattingOptions
  ): Promise<TextEdit[]> {
    const params = {
      textDocument: { uri },
      options,
    };
    const result = await sendRequest<FormattingResult>(
      "textDocument/formatting",
      params
    );
    return result ?? [];
  }

  async function formatRange(
    uri: string,
    range: Range,
    options: FormattingOptions
  ): Promise<TextEdit[]> {
    const params = {
      textDocument: { uri },
      range,
      options,
    };
    const result = await sendRequest<FormattingResult>(
      "textDocument/rangeFormatting",
      params
    );
    return result ?? [];
  }

  async function prepareRename(
    uri: string,
    position: Position
  ): Promise<Range | null> {
    const params = {
      textDocument: { uri },
      position,
    };
    try {
      const result = await sendRequest<Range | { range: Range } | null>(
        "textDocument/prepareRename",
        params
      );
      if (result && "range" in result) {
        return result.range;
      }
      return result;
    } catch {
      // Some LSP servers don't support prepareRename
      return null;
    }
  }

  async function rename(
    uri: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    const params = {
      textDocument: { uri },
      position,
      newName,
    };
    try {
      const result = await sendRequest<WorkspaceEdit>(
        "textDocument/rename",
        params
      );
      return result ?? null;
    } catch (error: any) {
      // Check if this is a TypeScript Native Preview LSP that doesn't support rename
      if (error.message?.includes("Unhandled method") || 
          error.message?.includes("Method not found") ||
          error.code === -32601) {
        debug("LSP server doesn't support rename, will use fallback");
        return null;
      }
      throw error;
    }
  }

  async function applyEdit(
    edit: WorkspaceEdit,
    label?: string
  ): Promise<ApplyWorkspaceEditResponse> {
    const params: ApplyWorkspaceEditParams = {
      edit,
      label,
    };
    const result = await sendRequest<ApplyWorkspaceEditResponse>(
      "workspace/applyEdit",
      params
    );
    return result ?? { applied: false, failureReason: "No response from server" };
  }

  async function stop(): Promise<void> {
    if (state.process) {
      // Send shutdown request
      try {
        await sendRequest("shutdown");
        sendNotification("exit");
      } catch {
        // Ignore errors during shutdown
      }

      // Give it a moment to shut down gracefully
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        if (!state.process.killed) {
          state.process.kill();
        }
      } catch {
        // Ignore errors during process termination
      }
      state.process = null;
    }
  }

  // Helper function to wait for diagnostics
  function waitForDiagnostics(
    fileUri: string,
    timeout: number = 2000
  ): Promise<Diagnostic[]> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      
      const diagnosticsHandler = (params: PublishDiagnosticsParams) => {
        if (params.uri === fileUri) {
          if (timeoutId) clearTimeout(timeoutId);
          state.eventEmitter.off("diagnostics", diagnosticsHandler); // Remove listener
          resolve(params.diagnostics || []);
        }
      };
      
      // Set up timeout
      timeoutId = setTimeout(() => {
        state.eventEmitter.off("diagnostics", diagnosticsHandler); // Remove listener
        reject(new Error(`Timeout waiting for diagnostics for ${fileUri}`));
      }, timeout);
      
      // Listen for diagnostics
      state.eventEmitter.on("diagnostics", diagnosticsHandler);
    });
  }

  return {
    ...state,
    start,
    stop,
    openDocument,
    closeDocument,
    updateDocument,
    isDocumentOpen,
    findReferences,
    getDefinition,
    getHover,
    getDiagnostics,
    getDocumentSymbols,
    getWorkspaceSymbols,
    getCompletion,
    resolveCompletionItem,
    getSignatureHelp,
    getCodeActions,
    formatDocument,
    formatRange,
    prepareRename,
    rename,
    applyEdit,
    sendRequest,
    on: (event: string, listener: (...args: unknown[]) => void) =>
      state.eventEmitter.on(event, listener),
    emit: (event: string, ...args: unknown[]) =>
      state.eventEmitter.emit(event, ...args),
    waitForDiagnostics,
  };
}
