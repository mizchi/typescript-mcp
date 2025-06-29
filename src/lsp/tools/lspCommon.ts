import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { pathToFileURL } from "url";
import { getLSPClient } from "../lspClient.ts";
import { resolveLineParameter } from "../../textUtils/resolveLineParameter.ts";
import { formatError, ErrorContext } from "../../mcp/utils/errorHandler.ts";

// Common schema shapes for LSP tools
export const filePathShape = {
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path (relative to root)"),
};

export const lineParameterShape = {
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),
};

export const symbolNameShape = {
  symbolName: z.string().describe("Name of the symbol"),
};

export const characterShape = {
  character: z.number().describe("Character position in the line (0-based)"),
};

// Common file operations
export async function prepareFileContext(
  root: string,
  filePath: string
): Promise<{
  absolutePath: string;
  fileUri: string;
  content: string;
}> {
  // Convert to absolute path
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);

  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch (error) {
    const context: ErrorContext = {
      operation: "file access",
      filePath: path.relative(root, absolutePath)
    };
    throw new Error(formatError(error, context));
  }

  // Convert to file URI
  const fileUri = pathToFileURL(absolutePath).toString();

  // Read the file content
  try {
    const content = await fs.readFile(absolutePath, "utf-8");
    return { absolutePath, fileUri, content };
  } catch (error) {
    const context: ErrorContext = {
      operation: "file read",
      filePath: path.relative(root, absolutePath)
    };
    throw new Error(formatError(error, context));
  }
}

// Common LSP client operations
export async function withLSPDocument<T>(
  fileUri: string,
  content: string,
  operation: () => Promise<T>,
  language?: string
): Promise<T> {
  const client = getLSPClient();
  if (!client) {
    const context: ErrorContext = {
      operation: "LSP document operation",
      language
    };
    throw new Error(formatError(new Error("LSP client not initialized. Ensure the language server is started."), context));
  }

  // Open the document in LSP with language ID if provided
  client.openDocument(fileUri, content, language);

  try {
    // Wait a bit for LSP to process the document
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Execute the operation
    return await operation();
  } finally {
    // Close the document
    client.closeDocument(fileUri);
  }
}

// Common line resolution
export function resolveLineOrThrow(
  content: string,
  line: string | number,
  filePath: string
): number {
  const resolveResult = resolveLineParameter(content, line);
  
  if (!resolveResult.success) {
    const context: ErrorContext = {
      operation: "line resolution",
      filePath,
      details: { line, error: resolveResult.error }
    };
    throw new Error(formatError(new Error(`Failed to resolve line: ${resolveResult.error}`), context));
  }
  
  return resolveResult.lineIndex;
}