#!/usr/bin/env node

import {
  BaseMcpServer,
  StdioServerTransport,
  readJsonFile,
  debug,
  type ToolDef,
} from "./_mcplib.ts";
import { moveFileTool } from "../ts/tools/tsMoveFile.ts";
import { moveDirectoryTool } from "../ts/tools/tsMoveDirectory.ts";
import { getModuleSymbolsTool } from "../ts/tools/tsGetModuleSymbols.ts";
import { getTypeInModuleTool } from "../ts/tools/tsGetTypeInModule.ts";
import { getSymbolsInScopeTool } from "../ts/tools/tsGetSymbolsInScope.ts";
import { searchSymbolsTool } from "../ts/tools/tsSearchSymbols.ts";
import { findImportCandidatesTool } from "../ts/tools/tsFindImportCandidates.ts";
import { lspGetHoverTool } from "../lsp/tools/lspGetHover.ts";
import { lspFindReferencesTool } from "../lsp/tools/lspFindReferences.ts";
import { lspGetDefinitionsTool } from "../lsp/tools/lspGetDefinitions.ts";
import { lspGetDiagnosticsTool } from "../lsp/tools/lspGetDiagnostics.ts";
import { lspRenameSymbolTool } from "../lsp/tools/lspRenameSymbol.ts";
import { lspDeleteSymbolTool } from "../lsp/tools/lspDeleteSymbol.ts";
import { lspGetDocumentSymbolsTool } from "../lsp/tools/lspGetDocumentSymbols.ts";
import { lspGetCompletionTool } from "../lsp/tools/lspGetCompletion.ts";
import { lspGetSignatureHelpTool } from "../lsp/tools/lspGetSignatureHelp.ts";
import { lspFormatDocumentTool } from "../lsp/tools/lspFormatDocument.ts";
import { lspGetCodeActionsTool } from "../lsp/tools/lspGetCodeActions.ts";
import { listToolsTool } from "./tools/listTools.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "child_process";
import { initialize as initializeLSPClient } from "../lsp/lspClient.ts";
import { formatError, ErrorContext } from "./utils/errorHandler.ts";
import { LanguageMappingConfig, setGlobalLanguageMapping } from "../lsp/languageMapping.ts";

// Use LSP mode when LSP_COMMAND is provided or FORCE_LSP is set
const USE_LSP: boolean = process.env.LSP_COMMAND != null || process.env.FORCE_LSP === "true";
debug(`[typescript-mcp] Starting TypeScript MCP server, USE_LSP: ${USE_LSP}, LSP_COMMAND: ${process.env.LSP_COMMAND}`);

// Define tools based on configuration
const tools: ToolDef<any>[] = [
  listToolsTool, // Help tool to list all available tools
  
  // Only include TypeScript-specific tools when not in forced LSP mode
  ...(process.env.FORCE_LSP !== "true"
    ? [
        moveFileTool,
        moveDirectoryTool,
        getModuleSymbolsTool,
        getTypeInModuleTool,
        getSymbolsInScopeTool,
        searchSymbolsTool,
        findImportCandidatesTool,
        // WIP: does not work yet correctly
        // getModuleGraphTool,
        // getRelatedModulesTool,
      ]
    : []),
  
  // LSP tools (only when LSP_COMMAND is set or FORCE_LSP is true)
  ...(USE_LSP
    ? [
        lspGetHoverTool,
        lspFindReferencesTool,
        lspGetDefinitionsTool,
        lspGetDiagnosticsTool,
        lspRenameSymbolTool,
        lspDeleteSymbolTool,
        lspGetDocumentSymbolsTool,
        lspGetCompletionTool,
        lspGetSignatureHelpTool,
        lspFormatDocumentTool,
        lspGetCodeActionsTool,
      ]
    : []),
];

function getTypescriptInfo(): {
  version: string;
  path: string;
} | null {
  try {
    // Resolve TypeScript module path
    const tsPath = import.meta.resolve("typescript");
    const tsUrl = new URL(tsPath);
    const tsFilePath = tsUrl.pathname;

    // Find the package.json for TypeScript
    let currentPath = path.dirname(tsFilePath);
    while (currentPath !== path.dirname(currentPath)) {
      const packageJsonPath = path.join(currentPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = readJsonFile(packageJsonPath) as {
          name?: string;
          version?: string;
        } | null;
        if (packageJson?.name === "typescript" && packageJson.version) {
          return {
            version: packageJson.version,
            path: currentPath,
          };
        }
      }
      currentPath = path.dirname(currentPath);
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  try {
    // Project root is always the current working directory
    // TODO: When MCP adds client cwd support, use that
    const projectRoot = process.cwd();

    // Start MCP server
    const serverName = process.env.FORCE_LSP === "true" 
      ? "lsp" 
      : "typescript";
    const serverDescription = process.env.FORCE_LSP === "true"
      ? "Language Server Protocol tools for MCP" 
      : "TypeScript refactoring and analysis tools for MCP";
      
    // Configure language mappings if provided
    const languageMappingStr = process.env.LANGUAGE_MAPPING;
    if (languageMappingStr) {
      const mappings = LanguageMappingConfig.parseFromString(languageMappingStr);
      const config = LanguageMappingConfig.createWithDefaults(); // Start with TypeScript defaults
      config.addMappings(mappings); // Add custom mappings
      setGlobalLanguageMapping(config);
      debug(`Configured ${mappings.length} custom language mappings`);
    }

    const server = new BaseMcpServer({
      name: serverName,
      version: "1.0.0",
      description: serverDescription,
      capabilities: {
        tools: true,
      },
    });
    
    server.setDefaultRoot(projectRoot);
    server.registerTools(tools);

    // Initialize LSP if LSP_COMMAND is provided
    if (USE_LSP && process.env.LSP_COMMAND) {
      // Parse LSP command
      const parts = process.env.LSP_COMMAND.split(" ");
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
          language: "typescript",
          details: { command: process.env.LSP_COMMAND }
        };
        throw new Error(formatError(error, context));
      }
      
      try {
        await initializeLSPClient(projectRoot, lspProcess, "typescript");
        debug(`[lsp] Initialized LSP client: ${process.env.LSP_COMMAND}`);
      } catch (error) {
        const context: ErrorContext = {
          operation: "LSP client initialization",
          language: "typescript",
          details: { command: process.env.LSP_COMMAND }
        };
        throw new Error(formatError(error, context));
      }
    }

    // Connect transport and start server
    const transport = new StdioServerTransport();
    await server.getServer().connect(transport);
    
    debug("TypeScript Refactoring MCP Server running on stdio");
    debug(`Project root: ${projectRoot}`);

    // Display TypeScript information
    const tsInfo = getTypescriptInfo();
    if (tsInfo) {
      debug(
        `Detected typescript path: ${tsInfo.path} version: ${tsInfo.version}`
      );
    } else {
      debug("Warning: TypeScript not detected in current project");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});