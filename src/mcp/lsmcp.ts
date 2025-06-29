#!/usr/bin/env node
/**
 * lsmcp - Language Service MCP
 * 
 * Main entry point for the lsmcp tool that provides MCP integration
 * for TypeScript/JavaScript (built-in) or any LSP server (via --bin).
 */

import { parseArgs } from "node:util";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { debug } from "./_mcplib.ts";
import { formatError, ErrorContext } from "./utils/errorHandler.ts";

// Parse command line arguments
const { values, positionals } = parseArgs({
  options: {
    language: {
      type: 'string',
      short: 'l',
      description: 'Language to use (typescript, moonbit, rust, etc.)'
    },
    bin: {
      type: 'string',
      description: 'Custom LSP server command (e.g., "deno lsp", "rust-analyzer")'
    },
    include: {
      type: 'string',
      description: 'Glob pattern for files to get diagnostics (e.g., "src/**/*.ts")'
    },
    help: {
      type: 'boolean',
      short: 'h',
      description: 'Show help message'
    },
    list: {
      type: 'boolean',
      description: 'List supported languages'
    },
  },
  allowPositionals: true,
});

function showHelp() {
  console.log(`
🌍 LSMCP - Language Service MCP for Multi-Language Support

Usage:
  lsmcp --language <lang> [options]
  lsmcp --bin <command> [options]

Options:
  -l, --language <lang>  Language to use (required unless --bin is provided)
  --bin <command>        Custom LSP server command (e.g., "deno lsp", "rust-analyzer")
  --include <pattern>    Glob pattern for files to get diagnostics (TypeScript/JS only)
  --list                 List all supported languages
  -h, --help            Show this help message

Examples:
  lsmcp -l typescript          Use TypeScript MCP server
  lsmcp -l rust                Use Rust MCP server
  lsmcp --bin "deno lsp"       Use custom LSP server
  lsmcp --include "src/**/*.ts" -l typescript  Get diagnostics for TypeScript files

Supported Languages:
  - TypeScript/JavaScript (built-in support)
  - Any language via LSP server with --bin option

Environment Variables:
  FORCE_LANGUAGE        Force a specific language (same as -l)
`);
}

async function runLanguageServer(language: string, args: string[] = [], customEnv?: Record<string, string | undefined>) {
  // Only TypeScript MCP server is available now
  if (language !== "typescript" && language !== "javascript") {
    console.error(`Error: Language '${language}' is not supported in this build.`);
    console.error("Only TypeScript/JavaScript is currently supported.");
    console.error("Use --bin option to use custom LSP servers for other languages.");
    process.exit(1);
  }

  // Get the path to the TypeScript server
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const serverPath = join(__dirname, "typescript-mcp.js");

  // Merge environment variables
  const env = customEnv ? { ...process.env, ...customEnv } : process.env;

  if (!existsSync(serverPath)) {
    const context: ErrorContext = {
      operation: "MCP server startup",
      language,
      filePath: serverPath
    };
    const error = new Error(`MCP server not found at ${serverPath}`);
    console.error(formatError(error, context));
    process.exit(1);
  }

  debug(`Starting ${language} MCP server: ${serverPath}`);

  // Forward all arguments to the specific server
  const serverProcess = spawn("node", [serverPath, ...args], {
    stdio: "inherit",
    env,
  });

  serverProcess.on("error", (error) => {
    const context: ErrorContext = {
      operation: "MCP server process",
      language
    };
    console.error(formatError(error, context));
    process.exit(1);
  });

  serverProcess.on("exit", (code) => {
    process.exit(code || 0);
  });
}

async function main() {
  // Show help if requested
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // List languages if requested
  if (values.list) {
    console.log("Supported languages:");
    console.log("  typescript - TypeScript files (.ts, .tsx)");
    console.log("  javascript - JavaScript files (.js, .jsx)");
    console.log("\nFor other languages, use --bin with an LSP server:");
    console.log("  --bin \"rust-analyzer\" for Rust");
    console.log("  --bin \"pylsp\" for Python");
    console.log("  --bin \"gopls\" for Go");
    process.exit(0);
  }


  // Check if custom LSP command is provided
  if (values.bin) {
    debug(`Using custom LSP command: ${values.bin}`);
    // Use generic LSP MCP server for non-TypeScript languages
    const env: Record<string, string | undefined> = { 
      ...process.env, 
      LSP_COMMAND: values.bin
    };
    
    // Get the path to the generic LSP server
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const genericServerPath = join(__dirname, "generic-lsp-mcp.js");
    
    if (!existsSync(genericServerPath)) {
      const context: ErrorContext = {
        operation: "Generic LSP MCP server startup",
        details: { path: genericServerPath }
      };
      const error = new Error(`Generic LSP MCP server not found at ${genericServerPath}`);
      console.error(formatError(error, context));
      process.exit(1);
    }
    
    debug(`Starting generic LSP MCP server: ${genericServerPath}`);
    
    // Forward to generic LSP server
    const serverProcess = spawn("node", [genericServerPath, `--lsp-command=${values.bin}`, ...positionals], {
      stdio: "inherit",
      env,
    });
    
    serverProcess.on("error", (error) => {
      const context: ErrorContext = {
        operation: "Generic LSP MCP server process",
        details: { command: values.bin }
      };
      console.error(formatError(error, context));
      process.exit(1);
    });
    
    serverProcess.on("exit", (code) => {
      process.exit(code || 0);
    });
    
    return;
  }

  // Check if --include option is provided for diagnostics
  if (values.include) {
    debug(`Getting diagnostics for pattern: ${values.include}`);
    
    // For diagnostics, we need to use TypeScript MCP
    const language = values.language || process.env.FORCE_LANGUAGE || "typescript";
    
    if (language !== "typescript" && language !== "javascript") {
      const context: ErrorContext = {
        operation: "diagnostics",
        language,
        details: { option: "--include" }
      };
      const error = new Error("--include option is currently only supported for TypeScript/JavaScript");
      console.error(formatError(error, context));
      process.exit(1);
    }
    
    // Get matching files
    // TODO: When MCP adds client cwd support, use that
    const projectRoot = process.cwd();
    
    // Simple glob pattern matching for TypeScript files
    const files: string[] = [];
    const pattern = values.include;
    
    // Simple implementation for common patterns
    if (pattern.includes("**")) {
      // Recursive search
      const searchDir = pattern.split("**")[0] || ".";
      const extension = pattern.match(/\*\.(\w+)$/)?.[1] || "ts";
      
      async function findFiles(dir: string): Promise<void> {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
              await findFiles(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(`.${extension}`)) {
              files.push(relative(projectRoot, fullPath));
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      }
      
      await findFiles(join(projectRoot, searchDir));
    } else if (pattern.includes("*")) {
      // Single directory search
      const dir = dirname(pattern);
      const extension = pattern.match(/\*\.(\w+)$/)?.[1] || "ts";
      
      try {
        const entries = await readdir(join(projectRoot, dir), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(`.${extension}`)) {
            files.push(join(dir, entry.name));
          }
        }
      } catch {
        // Directory doesn't exist
      }
    } else {
      // Single file
      if (existsSync(join(projectRoot, pattern))) {
        files.push(pattern);
      }
    }
    
    if (files.length === 0) {
      console.error(`No files found matching pattern: ${values.include}`);
      process.exit(1);
    }
    
    console.log(`Found ${files.length} files matching pattern: ${values.include}`);
    console.log("Getting diagnostics...\n");
    
    // Import and use TypeScript diagnostics directly
    const { getDiagnostics } = await import("../ts/navigations/getDiagnostics.ts");
    const { findProjectForFile } = await import("../ts/projectCache.ts");
    
    // Get absolute paths
    const absolutePaths = files.map(f => join(projectRoot, f));
    
    // Find or create project
    const project = findProjectForFile(absolutePaths[0]);
    
    // Ensure all files are loaded
    for (const filePath of absolutePaths) {
      if (!project.getSourceFile(filePath)) {
        project.addSourceFileAtPath(filePath);
      }
    }
    
    // Get diagnostics
    const result = getDiagnostics(project, {
      filePaths: absolutePaths,
    });
    
    if (result.isErr()) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    
    // Output the formatted diagnostics
    console.log(result.value.message);
    
    // Exit with appropriate code
    const hasErrors = result.value.diagnostics.some(d => d.category === "error");
    process.exit(hasErrors ? 1 : 0);
  }

  // Require either --language or --bin option
  const language = values.language || process.env.FORCE_LANGUAGE;

  if (!language && !values.bin) {
    console.error("Error: Either --language or --bin option is required");
    console.error("\nExamples:");
    console.error("  lsmcp --language=typescript");
    console.error("  lsmcp --bin=\"deno lsp\"");
    console.error("\nRun 'lsmcp --help' for more information.");
    process.exit(1);
  }

  if (language) {
    // Validate language
    if (language !== "typescript" && language !== "javascript") {
      console.error(`Error: Only TypeScript/JavaScript are supported with --language`);
      console.error("For other languages, use --bin option with an LSP server");
      process.exit(1);
    }

    // Run the appropriate language server
    await runLanguageServer(language, positionals);
  }
}

// Always run main when this script is executed directly
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});