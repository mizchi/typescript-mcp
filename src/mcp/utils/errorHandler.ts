import { debug } from "../_mcplib.ts";

export interface ErrorContext {
  operation: string;
  language?: string;
  filePath?: string;
  symbolName?: string;
  details?: Record<string, unknown>;
}

export interface FormattedError {
  title: string;
  reason: string;
  solution?: string;
  debugInfo?: string;
}

export class MCPError extends Error {
  constructor(
    public readonly formatted: FormattedError,
    public readonly context?: ErrorContext,
  ) {
    super(formatted.title);
    this.name = "MCPError";
  }

  toString(): string {
    const parts = [this.formatted.title];

    if (this.formatted.reason) {
      parts.push(`Reason: ${this.formatted.reason}`);
    }

    if (this.formatted.solution) {
      parts.push(`Solution: ${this.formatted.solution}`);
    }

    if (this.formatted.debugInfo && process.env.DEBUG) {
      parts.push(`Debug: ${this.formatted.debugInfo}`);
    }

    return parts.join("\n");
  }
}

export function formatError(error: unknown, context?: ErrorContext): string {
  if (error instanceof MCPError) {
    return error.toString();
  }

  if (error instanceof Error) {
    const formatted = handleKnownError(error, context);
    if (formatted) {
      return new MCPError(formatted, context).toString();
    }

    // Unknown error
    const debugInfo = process.env.DEBUG ? error.stack : undefined;
    return new MCPError({
      title: `Error: ${error.message}`,
      reason: "An unexpected error occurred",
      solution: "Check the error message for details",
      debugInfo,
    }, context).toString();
  }

  return String(error);
}

function handleKnownError(
  error: Error,
  context?: ErrorContext,
): FormattedError | null {
  const message = error.message.toLowerCase();

  // LSP server not found (but not file not found)
  if (
    (message.includes("command not found") || message.includes("enoent")) &&
    !context?.filePath
  ) {
    const language = context?.language || "unknown";
    return {
      title: `LSP server for ${language} not found`,
      reason: "The language server is not installed or not in PATH",
      solution: getLSPInstallSolution(language),
    };
  }

  // LSP server startup failed
  if (
    message.includes("lsp server exited") || message.includes("failed to start")
  ) {
    return {
      title: "LSP server failed to start",
      reason: "The language server crashed during initialization",
      solution:
        "Check the language server logs for errors. Try running the server command manually to diagnose issues.",
    };
  }

  // File not found
  if (
    message.includes("enoent") || message.includes("no such file") ||
    message.includes("file not found")
  ) {
    const filePath = context?.filePath || "unknown";
    return {
      title: `File not found: ${filePath}`,
      reason: "The specified file does not exist",
      solution:
        "Check the file path and ensure it exists. Use relative paths from the project root.",
    };
  }

  // Symbol not found
  if (
    message.includes("symbol not found") ||
    message.includes("could not find symbol")
  ) {
    const symbolName = context?.symbolName || "unknown";
    return {
      title: `Symbol not found: ${symbolName}`,
      reason: "The specified symbol does not exist at the given location",
      solution:
        "Ensure the symbol name is spelled correctly and exists at the specified line. Try using code completion to find the correct symbol.",
    };
  }

  // TypeScript project errors
  if (
    message.includes("no tsconfig") || message.includes("typescript project")
  ) {
    return {
      title: "TypeScript project configuration error",
      reason: "Could not find or load tsconfig.json",
      solution:
        "Ensure tsconfig.json exists in the project root or a parent directory. Run 'tsc --init' to create one.",
    };
  }

  // Tool not supported
  if (message.includes("not supported") || message.includes("not available")) {
    const language = context?.language || "unknown";
    const operation = context?.operation || "operation";
    return {
      title: `${operation} not supported for ${language}`,
      reason:
        `The language server for ${language} does not support this operation`,
      solution:
        "Check the language server documentation for supported features",
    };
  }

  // Timeout errors
  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      title: "Operation timed out",
      reason: "The language server did not respond in time",
      solution:
        "Try again. If the problem persists, restart the language server or increase the timeout.",
    };
  }

  // Permission errors
  if (message.includes("permission denied") || message.includes("eacces")) {
    return {
      title: "Permission denied",
      reason: "Insufficient permissions to perform the operation",
      solution:
        "Check file permissions and ensure you have write access to the project directory",
    };
  }

  return null;
}

function getLSPInstallSolution(language: string): string {
  const installCommands: Record<string, string> = {
    typescript: "npm install -g typescript typescript-language-server",
    javascript: "npm install -g typescript typescript-language-server",
    python: "pip install python-lsp-server[all]",
    rust: "rustup component add rust-analyzer",
    go: "go install golang.org/x/tools/gopls@latest",
    java: "Download from https://download.eclipse.org/jdtls/",
    "c++": "Install clangd from https://clangd.llvm.org/installation",
    c: "Install clangd from https://clangd.llvm.org/installation",
    ruby: "gem install solargraph",
    php: "composer global require felixfbecker/language-server",
    lua:
      "Install lua-language-server from https://github.com/LuaLS/lua-language-server",
    zig: "zig build -Drelease-safe in zls repository",
    haskell: "Install haskell-language-server via ghcup",
    scala: "coursier install metals",
    kotlin: "Download kotlin-language-server from GitHub releases",
    swift: "Build sourcekit-lsp from source",
    dart: "Included with Dart SDK",
    elixir: "mix archive.install hex elixir_ls",
    clojure: "Download clojure-lsp from GitHub releases",
    julia: "julia -e 'using Pkg; Pkg.add(\"LanguageServer\")'",
    ocaml: "opam install ocaml-lsp-server",
    fsharp: "dotnet tool install --global fsautocomplete",
    csharp: "Install omnisharp-roslyn",
    vb: "Install omnisharp-roslyn",
    perl: "cpan Perl::LanguageServer",
    r: "install.packages('languageserver')",
    nim: "nimble install nimlsp",
    crystal: "Install crystalline from GitHub releases",
    v: "v install vls",
    moonbit: "moon update && moon install",
    deno: "Deno LSP is built into Deno",
  };

  const command = installCommands[language.toLowerCase()];
  if (command) {
    return `Install it with: ${command}`;
  }

  return `Check the documentation for ${language} language server installation instructions`;
}

export function debugLog(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG) {
    debug(`[DEBUG] ${message}`, ...args);
  }
}

export function wrapError(operation: string, context?: Partial<ErrorContext>) {
  return (error: unknown): never => {
    const fullContext: ErrorContext = {
      operation,
      ...context,
    };

    const formatted = formatError(error, fullContext);
    throw new Error(formatted);
  };
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("errorHandler", () => {
    describe("formatError", () => {
      it("should format LSP server not found error", () => {
        const error = new Error("command not found: rust-analyzer");
        const context: ErrorContext = {
          operation: "LSP startup",
          language: "rust",
        };

        const formatted = formatError(error, context);
        expect(formatted).toContain("LSP server for rust not found");
        expect(formatted).toContain("rustup component add rust-analyzer");
      });

      it("should format file not found error", () => {
        const error = new Error("ENOENT: no such file or directory");
        const context: ErrorContext = {
          operation: "file read",
          filePath: "src/test.ts",
        };

        const formatted = formatError(error, context);
        expect(formatted).toContain("File not found: src/test.ts");
        expect(formatted).toContain("Check the file path");
      });

      it("should format symbol not found error", () => {
        const error = new Error("Could not find symbol 'foo'");
        const context: ErrorContext = {
          operation: "find references",
          symbolName: "foo",
        };

        const formatted = formatError(error, context);
        expect(formatted).toContain("Symbol not found: foo");
        expect(formatted).toContain("spelled correctly");
      });

      it("should format timeout error", () => {
        const error = new Error("Operation timed out");
        const formatted = formatError(error);

        expect(formatted).toContain("Operation timed out");
        expect(formatted).toContain("Try again");
      });

      it("should format unknown error with debug info when DEBUG is set", () => {
        process.env.DEBUG = "true";
        const error = new Error("Unknown error");
        const formatted = formatError(error);

        expect(formatted).toContain("Unknown error");
        expect(formatted).toContain("unexpected error");

        delete process.env.DEBUG;
      });
    });

    describe("MCPError", () => {
      it("should format error with all fields", () => {
        const error = new MCPError({
          title: "Test Error",
          reason: "Something went wrong",
          solution: "Try this fix",
        });

        const str = error.toString();
        expect(str).toContain("Test Error");
        expect(str).toContain("Reason: Something went wrong");
        expect(str).toContain("Solution: Try this fix");
      });
    });
  });
}
