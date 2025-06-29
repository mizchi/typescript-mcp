import { readdir } from "fs/promises";
import { join } from "path";
import { debug } from "../mcp/_mcplib.ts";
import { debugLog } from "../mcp/utils/errorHandler.ts";

type SendRequestFunction = <T = unknown>(method: string, params?: unknown) => Promise<T>;
type SendNotificationFunction = (method: string, params?: unknown) => void;

/**
 * Find F# project files in a directory
 */
export async function findFSharpProjectFiles(dir: string): Promise<string[]> {
  const projectFiles: string[] = [];
  
  async function search(currentDir: string, depth: number = 0): Promise<void> {
    if (depth > 3) return; // Limit search depth
    
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".fsproj")) {
          projectFiles.push(join(currentDir, entry.name));
        } else if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          await search(join(currentDir, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Ignore errors (e.g., permission denied)
    }
  }
  
  await search(dir);
  return projectFiles;
}

/**
 * Initialize F# specific settings
 */
export async function initializeFSharp(projectRoot: string): Promise<void> {
  // Check for F# project files
  const projectFiles = await findFSharpProjectFiles(projectRoot);
  if (projectFiles.length === 0) {
    debug("[lsp] No .fsproj files found in project root");
  } else {
    debug(`[lsp] Found ${projectFiles.length} F# project file(s): ${projectFiles.join(", ")}`);
  }
}

/**
 * Get F# LSP server command
 */
export function getFSharpLSPCommand(): string {
  return "fsautocomplete";
}

/**
 * Get F# initialization options for LSP
 */
export function getFSharpInitializationOptions(): unknown {
  return {
    AutomaticWorkspaceInit: true,
  };
}

/**
 * Post-initialization setup for F# LSP
 */
export async function postInitializeFSharp(
  sendRequest: SendRequestFunction,
  sendNotification: SendNotificationFunction,
  rootPath: string
): Promise<void> {
  debugLog(`Executing F# specific initialization...`);
  
  // Send workspace/didChangeConfiguration to ensure settings are applied
  debugLog(`Sending F# configuration...`);
  sendNotification("workspace/didChangeConfiguration", {
    settings: {
      FSharp: {
        AutomaticWorkspaceInit: true,
        workspacePath: rootPath,
        enableAdaptiveLspServer: true,
      },
    },
  });

  // Use fsharp/workspacePeek to discover projects
  debugLog(`Discovering F# projects with fsharp/workspacePeek...`);
  try {
    const peekResult = await sendRequest<{
      found: Array<{ uri: string; kind: string }>;
    }>("fsharp/workspacePeek", {
      directory: rootPath,
      deep: 10,
      excludedDirs: [
        ".git",
        "node_modules",
        "bin",
        "obj",
        "paket-files",
        "packages",
      ],
    });

    debugLog(`Found projects:`, JSON.stringify(peekResult, null, 2));

    if (peekResult && peekResult.found && peekResult.found.length > 0) {
      // Load discovered projects using fsharp/workspaceLoad
      const projectUris = peekResult.found.map((p: { uri: string }) => p.uri);
      debugLog(
        `Loading F# projects with fsharp/workspaceLoad:`,
        projectUris
      );

      await sendRequest("fsharp/workspaceLoad", {
        textDocuments: projectUris,
      });

      // Give the F# server time to load the projects
      debugLog(`Waiting for F# projects to load...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      debugLog(`No F# projects found in workspace`);
    }
  } catch (err) {
    debugLog(`Failed to load F# workspace: ${err}`);
    // Fallback to old method
    try {
      const files = await readdir(rootPath);
      const fsprojFile = files.find((f) => f.endsWith(".fsproj"));
      if (fsprojFile) {
        const projectUri = `file://${join(rootPath, fsprojFile)}`;
        debugLog(
          `Fallback: Loading F# project with fsharp/loadProject: ${projectUri}`
        );
        sendNotification("fsharp/loadProject", { projectUri });
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (err2) {
      debugLog(`Fallback also failed: ${err2}`);
    }
  }
}