import { z } from "zod";

// Common schema shapes used across tools
export const commonSchemas = {
  root: z.string().describe("Root directory for resolving relative paths"),

  filePath: z
    .string()
    .describe("File path (relative to root)"),

  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),

  symbolName: z.string().describe("Name of the symbol"),

  character: z.number().describe("Character position in the line (0-based)"),

  symbolIndex: z
    .number()
    .default(0)
    .describe(
      "Index of the symbol occurrence if it appears multiple times on the line (0-based)",
    ),

  before: z
    .number()
    .default(0)
    .describe("Number of lines to show before the definition"),

  after: z
    .number()
    .default(0)
    .describe("Number of lines to show after the definition"),
} as const;

// Create common schema combinations
export const fileLocationSchema = z.object({
  root: commonSchemas.root,
  filePath: commonSchemas.filePath,
});

export const fileLineLocationSchema = z.object({
  root: commonSchemas.root,
  filePath: commonSchemas.filePath,
  line: commonSchemas.line,
});

export const symbolLocationSchema = z.object({
  root: commonSchemas.root,
  filePath: commonSchemas.filePath,
  line: commonSchemas.line,
  symbolName: commonSchemas.symbolName,
});

export const symbolLocationWithIndexSchema = z.object({
  root: commonSchemas.root,
  filePath: commonSchemas.filePath,
  line: commonSchemas.line,
  symbolName: commonSchemas.symbolName,
  symbolIndex: commonSchemas.symbolIndex,
});

export const definitionContextSchema = z.object({
  root: commonSchemas.root,
  filePath: commonSchemas.filePath,
  line: commonSchemas.line,
  symbolName: commonSchemas.symbolName,
  before: commonSchemas.before,
  after: commonSchemas.after,
});
