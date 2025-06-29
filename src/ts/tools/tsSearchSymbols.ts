import { z } from "zod";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { commonSchemas } from "../../common/schemas.ts";
import { getOrCreateProject } from "../projectCache.ts";
import { ProjectSymbolIndexer } from "../symbolIndex.ts";
import { MCPToolError } from "../../common/mcpErrors.ts";

const schema = z.object({
  root: commonSchemas.root,
  query: z.string().describe("Symbol name to search for (prefix match)"),
  exact: z.boolean().optional().default(false).describe(
    "Whether to match exactly",
  ),
  includeNonExported: z.boolean().optional().default(false).describe(
    "Include non-exported symbols",
  ),
  kinds: z.array(z.string()).optional().describe(
    "Filter by symbol kinds (Function, Class, Interface, etc.)",
  ),
  limit: z.number().optional().default(50).describe(
    "Maximum number of results",
  ),
  buildIndex: z.boolean().optional().default(false).describe(
    "Force rebuild of symbol index",
  ),
});

// Cache for symbol indexers (now managed by file watchers)
const indexerCache = new Map<string, ProjectSymbolIndexer>();

async function getOrCreateIndexer(
  root: string,
  forceRebuild: boolean = false,
): Promise<ProjectSymbolIndexer> {
  let indexer = indexerCache.get(root);

  // If forcing rebuild, dispose of the old indexer
  if (indexer && forceRebuild) {
    indexer.dispose();
    indexerCache.delete(root);
    indexer = undefined;
  }

  // Create new indexer if needed
  if (!indexer) {
    const project = await getOrCreateProject(root);
    indexer = new ProjectSymbolIndexer(project, root);

    // Build index with file watching enabled
    await indexer.buildIndex(undefined, true);

    // Cache it
    indexerCache.set(root, indexer);
  }

  return indexer;
}

// Export for test cleanup
export function disposeAllIndexers(): void {
  for (const indexer of indexerCache.values()) {
    indexer.dispose();
  }
  indexerCache.clear();
}

// Clean up indexers on process exit (only in non-test environments)
if (!process.env.VITEST && !process.env.NODE_ENV?.includes("test")) {
  process.on("exit", () => {
    for (const indexer of indexerCache.values()) {
      indexer.dispose();
    }
  });

  // Also handle SIGTERM and SIGINT
  const cleanup = () => {
    for (const indexer of indexerCache.values()) {
      indexer.dispose();
    }
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}

export const searchSymbolsTool: ToolDef<typeof schema> = {
  name: "lsmcp_search_symbols",
  description:
    "Search for symbols across the entire project using a pre-built index (fast)",
  schema,
  execute: async (
    { root, query, exact, includeNonExported, kinds, limit, buildIndex },
  ) => {
    try {
      const indexer = await getOrCreateIndexer(root, buildIndex);

      const results = indexer.searchSymbols(query, {
        exact,
        includeNonExported,
        kinds,
        limit,
      });

      if (results.length === 0) {
        return `No symbols found matching "${query}"`;
      }

      // Group results by file
      const byFile = new Map<string, typeof results>();
      for (const result of results) {
        const fileResults = byFile.get(result.filePath) || [];
        fileResults.push(result);
        byFile.set(result.filePath, fileResults);
      }

      // Format results
      let output = `Found ${results.length} symbols matching "${query}":\n\n`;

      for (const [filePath, fileResults] of byFile) {
        output += `📄 ${filePath}\n`;
        for (const symbol of fileResults) {
          const exported = symbol.isExported ? "✓" : " ";
          output +=
            `  ${exported} ${symbol.name} [${symbol.kind}] - line ${symbol.line}\n`;
          if (symbol.documentation) {
            output += `    ${symbol.documentation.split("\n")[0]}\n`;
          }
        }
        output += "\n";
      }

      // Add statistics
      const stats = indexer.getStats();
      output +=
        `\n📊 Index stats: ${stats.totalSymbols} symbols, ${stats.totalModules} modules`;
      output += `\n⏱️  Last updated: ${stats.lastUpdated.toISOString()}`;

      return output;
    } catch (error) {
      throw new MCPToolError(
        error instanceof Error ? error.message : String(error),
        "SEARCH_SYMBOLS_ERROR",
        [
          "Check if the project path is correct",
          "Try rebuilding the index with buildIndex: true",
        ],
        ["find_references", "get_definitions"],
      );
    }
  },
};
