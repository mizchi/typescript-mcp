import {
  Position,
  Location,
  Diagnostic,
  Hover,
  Definition,
  DocumentUri,
  integer,
  MarkupContent,
  MarkedString,
  WorkspaceEdit,
  TextEdit,
  Range,
  DocumentSymbol,
  SymbolInformation,
  CompletionItem,
  CompletionList,
  SignatureHelp,
  CodeAction,
  Command,
  FormattingOptions,
} from "vscode-languageserver-types";
import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

// LSP Message types
export interface LSPMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// LSP Protocol types
export interface TextDocumentIdentifier {
  uri: DocumentUri;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

export interface PublishDiagnosticsParams {
  uri: DocumentUri;
  diagnostics: Diagnostic[];
}

export interface ReferenceContext {
  includeDeclaration: boolean;
}

export interface ReferenceParams extends TextDocumentPositionParams {
  context: ReferenceContext;
}

export interface ClientCapabilities {
  textDocument?: {
    synchronization?: {
      dynamicRegistration?: boolean;
      willSave?: boolean;
      willSaveWaitUntil?: boolean;
      didSave?: boolean;
    };
    publishDiagnostics?: {
      relatedInformation?: boolean;
    };
    definition?: {
      linkSupport?: boolean;
    };
    references?: Record<string, unknown>;
    hover?: {
      contentFormat?: string[];
    };
    completion?: {
      completionItem?: {
        snippetSupport?: boolean;
      };
    };
    documentSymbol?: {
      hierarchicalDocumentSymbolSupport?: boolean;
    };
  };
}

export interface InitializeParams {
  processId: number | null;
  clientInfo?: {
    name: string;
    version?: string;
  };
  locale?: string;
  rootPath?: string | null;
  rootUri: DocumentUri | null;
  capabilities: ClientCapabilities;
  initializationOptions?: any;
}

export interface InitializeResult {
  capabilities: {
    textDocumentSync?: number;
    hoverProvider?: boolean;
    definitionProvider?: boolean;
    referencesProvider?: boolean;
    [key: string]: unknown;
  };
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export interface TextDocumentItem {
  uri: DocumentUri;
  languageId: string;
  version: integer;
  text: string;
}

export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: integer;
}

export interface TextDocumentContentChangeEvent {
  text: string;
}

export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface DidCloseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
}

// Workspace Edit types
export interface ApplyWorkspaceEditParams {
  label?: string;
  edit: WorkspaceEdit;
}

export interface ApplyWorkspaceEditResponse {
  applied: boolean;
  failureReason?: string;
  failedChange?: integer;
}

// Type aliases
export type HoverResult = Hover | null;
export type DefinitionResult = Definition | Location | Location[] | null;
export type ReferencesResult = Location[] | null;
export type DocumentSymbolResult = DocumentSymbol[] | SymbolInformation[] | null;
export type WorkspaceSymbolResult = SymbolInformation[] | null;
export type CompletionResult = CompletionItem[] | CompletionList | null;
export type SignatureHelpResult = SignatureHelp | null;
export type CodeActionResult = (Command | CodeAction)[] | null;
export type FormattingResult = TextEdit[] | null;

// Hover contents types
export type HoverContents =
  | string
  | MarkedString
  | MarkupContent
  | (string | MarkedString | MarkupContent)[];

export interface LSPClientState {
  process: ChildProcess | null;
  messageId: number;
  responseHandlers: Map<number | string, (response: LSPMessage) => void>;
  buffer: string;
  contentLength: number;
  diagnostics: Map<string, Diagnostic[]>;
  eventEmitter: EventEmitter;
  rootPath: string;
  languageId: string;
}

export interface LSPClientConfig {
  rootPath: string;
  process: ChildProcess;
  languageId?: string; // Default: "typescript"
  clientName?: string; // Default: "lsp-client"
  clientVersion?: string; // Default: "0.1.0"
}

export type LSPClient = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  openDocument: (uri: string, text: string, languageId?: string) => void;
  closeDocument: (uri: string) => void;
  updateDocument: (uri: string, text: string, version: number) => void;
  isDocumentOpen: (uri: string) => boolean;
  findReferences: (uri: string, position: Position) => Promise<Location[]>;
  getDefinition: (
    uri: string,
    position: Position
  ) => Promise<Location | Location[]>;
  getHover: (uri: string, position: Position) => Promise<HoverResult>;
  getDiagnostics: (uri: string) => Diagnostic[];
  getDocumentSymbols: (uri: string) => Promise<DocumentSymbol[] | SymbolInformation[]>;
  getWorkspaceSymbols: (query: string) => Promise<SymbolInformation[]>;
  getCompletion: (uri: string, position: Position) => Promise<CompletionItem[]>;
  resolveCompletionItem: (item: CompletionItem) => Promise<CompletionItem>;
  getSignatureHelp: (uri: string, position: Position) => Promise<SignatureHelp | null>;
  getCodeActions: (uri: string, range: Range, context?: { diagnostics?: Diagnostic[] }) => Promise<(Command | CodeAction)[]>;
  formatDocument: (uri: string, options: FormattingOptions) => Promise<TextEdit[]>;
  formatRange: (uri: string, range: Range, options: FormattingOptions) => Promise<TextEdit[]>;
  prepareRename: (uri: string, position: Position) => Promise<Range | null>;
  rename: (uri: string, position: Position, newName: string) => Promise<WorkspaceEdit | null>;
  applyEdit: (edit: WorkspaceEdit, label?: string) => Promise<ApplyWorkspaceEditResponse>;
  sendRequest: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => boolean;
  waitForDiagnostics: (fileUri: string, timeout?: number) => Promise<Diagnostic[]>;
};