#!/usr/bin/env node

/**
 * Generic LSP MCP Server
 * 
 * Provides MCP tools for any language with LSP support.
 * This server only includes LSP-based tools, not TypeScript-specific tools.
 */

import { parseArgs } from "node:util";
import {
  BaseMcpServer,
  StdioServerTransport,
  debug,
  type ToolDef,
} from "./_mcplib.ts";
import { lspGetHoverTool } from "../lsp/tools/lspGetHover.ts";
import { lspFindReferencesTool } from "../lsp/tools/lspFindReferences.ts";
import { lspGetDefinitionsTool } from "../lsp/tools/lspGetDefinitions.ts";
import { lspGetDiagnosticsTool } from "../lsp/tools/lspGetDiagnostics.ts";
import { lspRenameSymbolTool } from "../lsp/tools/lspRenameSymbol.ts";
import { lspDeleteSymbolTool } from "../lsp/tools/lspDeleteSymbol.ts";
import { lspGetDocumentSymbolsTool } from "../lsp/tools/lspGetDocumentSymbols.ts";
import { lspGetWorkspaceSymbolsTool } from "../lsp/tools/lspGetWorkspaceSymbols.ts";
import { lspGetCompletionTool } from "../lsp/tools/lspGetCompletion.ts";
import { lspGetSignatureHelpTool } from "../lsp/tools/lspGetSignatureHelp.ts";
import { lspFormatDocumentTool } from "../lsp/tools/lspFormatDocument.ts";
import { lspGetCodeActionsTool } from "../lsp/tools/lspGetCodeActions.ts";
import { listToolsTool } from "./tools/listTools.ts";
import { spawn } from "child_process";
import { initialize as initializeLSPClient } from "../lsp/lspClient.ts";
import { getLanguageFromLSPCommand } from "./utils/languageSupport.ts";
import { formatError, ErrorContext } from "./utils/errorHandler.ts";
import { LanguageMappingConfig, setGlobalLanguageMapping } from "../lsp/languageMapping.ts";

// Define LSP-only tools
const tools: ToolDef<any>[] = [
  listToolsTool,
  lspGetHoverTool,
  lspFindReferencesTool,
  lspGetDefinitionsTool,
  lspGetDiagnosticsTool,
  lspRenameSymbolTool,
  lspDeleteSymbolTool,
  lspGetDocumentSymbolsTool,
  lspGetWorkspaceSymbolsTool,
  lspGetCompletionTool,
  lspGetSignatureHelpTool,
  lspFormatDocumentTool,
  lspGetCodeActionsTool,
];

async function main() {
  try {
    // Parse command line arguments
    const { values } = parseArgs({
      options: {
        "lsp-command": {
          type: "string",
        },
      },
      strict: true,
      allowPositionals: false,
    });

    // Project root is always the current working directory
    // TODO: When MCP adds client cwd support, use that
    const projectRoot = process.cwd();

    const lspCommand = values["lsp-command"] || process.env.LSP_COMMAND;
    
    if (!lspCommand) {
      const context: ErrorContext = {
        operation: "LSP server configuration"
      };
      const error = new Error("LSP command is required");
      console.error(formatError(error, context));
      console.error("Usage: generic-lsp-mcp --lsp-command=\"<lsp-server-command>\"");
      console.error("Example: generic-lsp-mcp --lsp-command=\"rust-analyzer\"");
      process.exit(1);
    }

    const detectedLanguage = getLanguageFromLSPCommand(lspCommand);
    
    // Configure language mappings if provided
    const languageMappingStr = process.env.LANGUAGE_MAPPING;
    if (languageMappingStr) {
      const mappings = LanguageMappingConfig.parseFromString(languageMappingStr);
      const config = new LanguageMappingConfig(mappings);
      setGlobalLanguageMapping(config);
      debug(`Configured ${mappings.length} language mappings`);
    }

    // Start MCP server
    const server = new BaseMcpServer({
      name: "generic-lsp",
      version: "1.0.0",
      description: `LSP-based tools for ${detectedLanguage} via MCP`,
      capabilities: {
        tools: true,
      },
    });
    
    server.setDefaultRoot(projectRoot);
    server.registerTools(tools);

    // Initialize LSP client
    const parts = lspCommand.split(" ");
    const command = parts[0];
    const args = parts.slice(1);
    
    let lspProcess;
    try {
      lspProcess = spawn(command, args, {
        cwd: projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      const context: ErrorContext = {
        operation: "LSP server startup",
        language: detectedLanguage,
        details: { command: lspCommand }
      };
      throw new Error(formatError(error, context));
    }
    
    try {
      await initializeLSPClient(projectRoot, lspProcess, detectedLanguage.toLowerCase());
      debug(`[lsp] Initialized LSP client: ${lspCommand}`);
    } catch (error) {
      const context: ErrorContext = {
        operation: "LSP client initialization",
        language: detectedLanguage,
        details: { command: lspCommand }
      };
      throw new Error(formatError(error, context));
    }

    // Connect transport and start server
    const transport = new StdioServerTransport();
    await server.getServer().connect(transport);
    
    debug(`Generic LSP MCP Server running on stdio`);
    debug(`Project root: ${projectRoot}`);
    debug(`LSP command: ${lspCommand}`);
    debug(`Language: ${detectedLanguage}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});