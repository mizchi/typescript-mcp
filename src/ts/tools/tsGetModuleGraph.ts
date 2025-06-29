import { z } from "zod";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { Project } from "ts-morph";
import {
  getModuleGraph,
  type GetModuleGraphSuccess,
} from "../navigations/getModuleGraph.ts";

type FileNode = GetModuleGraphSuccess["graph"]["files"][0];
type GraphStats = GetModuleGraphSuccess["graph"]["stats"];
type Graph = GetModuleGraphSuccess["graph"];

const paramsSchema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  entryPoints: z
    .array(z.string())
    .describe(
      "Entry point files to start analysis from (relative or absolute paths)",
    ),
  useMermaid: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include Mermaid diagram visualization"),
});

function createProject() {
  return new Project({
    compilerOptions: {
      target: 99, // ESNext
      module: 99, // ESNext
      moduleResolution: 2, // Node
      allowJs: true,
      skipLibCheck: true,
      strict: false,
    },
    skipFileDependencyResolution: true,
  });
}

function formatCircularDependencies(
  circularDependencies: string[][],
): string[] {
  if (circularDependencies.length === 0) return [];

  return [
    `⚠️  Circular Dependencies Detected:`,
    ...circularDependencies.map(
      (cycle, i) => `  ${i + 1}. ${cycle.join(" → ")}`,
    ),
    "",
  ];
}

function topologicalSort(files: FileNode[]) {
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(filePath: string): void {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const file = fileMap.get(filePath);
    if (file) {
      // Visit dependencies first (post-order traversal)
      file.imports.forEach((importPath) => {
        visit(importPath);
      });
      sorted.push(filePath);
    }
  }

  // Start from entry points
  const entryPoints = files.filter((f) => f.importedBy.length === 0);
  entryPoints.forEach((entry) => {
    visit(entry.path);
  });

  // Add any remaining files (disconnected components)
  files.forEach((file) => {
    visit(file.path);
  });

  return { sorted, fileMap };
}

function getImporterLevels(
  file: FileNode,
  processed: Set<string>,
  levels: Map<string, number>,
): number[] {
  return file.importedBy
    .filter((importer) => processed.has(importer))
    .map((importer) => levels.get(importer) ?? 0);
}

function calculateSingleFileLevel(
  filePath: string,
  fileMap: Map<string, FileNode>,
  levels: Map<string, number>,
  processed: Set<string>,
): number {
  const cachedLevel = levels.get(filePath);
  if (cachedLevel !== undefined) return cachedLevel;

  const file = fileMap.get(filePath);
  if (!file || file.importedBy.length === 0) {
    levels.set(filePath, 0);
    return 0;
  }

  const importerLevels = getImporterLevels(file, processed, levels);
  const level = importerLevels.length > 0 ? Math.min(...importerLevels) + 1 : 0;

  levels.set(filePath, level);
  return level;
}

function calculateFileLevels(sorted: string[], fileMap: Map<string, FileNode>) {
  const levels = new Map<string, number>();
  const processed = new Set<string>();

  sorted.forEach((filePath) => {
    processed.add(filePath);
    calculateSingleFileLevel(filePath, fileMap, levels, processed);
  });

  return levels;
}

function formatDependencyTree(
  sorted: string[],
  fileMap: Map<string, FileNode>,
): string[] {
  const lines: string[] = [`🌳 Module Dependency Tree (Topological Order):`];
  const levels = calculateFileLevels(sorted, fileMap);

  sorted.forEach((filePath) => {
    const level = levels.get(filePath) ?? 0;
    const file = fileMap.get(filePath);
    if (!file) return; // Skip if file not found

    const indent = "  ".repeat(level);
    const arrow = level > 0 ? "└─ " : "";
    const exportInfo = formatExportInfo(file.exportedSymbols);
    lines.push(`${indent}${arrow}${filePath}${exportInfo}`);
  });

  lines.push("");
  return lines;
}

function formatExportInfo(exportedSymbols: string[]): string {
  if (exportedSymbols.length === 0) return "";

  const preview = exportedSymbols.slice(0, 3).join(", ");
  const hasMore = exportedSymbols.length > 3 ? "..." : "";
  return ` (exports: ${preview}${hasMore})`;
}

function formatMostImportedFiles(files: FileNode[]): string[] {
  const mostImported = files
    .filter((f) => f.importedBy.length > 0)
    .sort((a, b) => b.importedBy.length - a.importedBy.length)
    .slice(0, 5);

  if (mostImported.length === 0) return [];

  return [
    `📥 Most Imported Files:`,
    ...mostImported.map(
      (file) =>
        `  - ${file.path} (imported by ${file.importedBy.length} files)`,
    ),
  ];
}

function createNodeId(path: string): string {
  return path.replace(/[^\w]/g, "_").replace(/__+/g, "_");
}

function generateMermaidDiagram(graph: Graph): string[] {
  const lines: string[] = [
    "",
    "📊 Mermaid Dependency Graph:",
    "```mermaid",
    "graph TD",
  ];

  // Add nodes with labels
  const nodeDefinitions = graph.files.map((file) => {
    const nodeId = createNodeId(file.path);
    const label = file.path.split("/").pop() || file.path;
    return `    ${nodeId}["${label}"]`;
  });
  lines.push(...nodeDefinitions);

  // Add edges
  const edges = graph.files.flatMap((file) => {
    const fromId = createNodeId(file.path);
    return file.imports.map((importPath) => {
      const toId = createNodeId(importPath);
      return `    ${fromId} --> ${toId}`;
    });
  });
  lines.push(...edges);

  // Highlight circular dependencies
  if (graph.stats.circularDependencies.length > 0) {
    lines.push("");
    lines.push("    %% Circular dependencies are highlighted");

    graph.stats.circularDependencies.forEach((cycle, idx) => {
      lines.push(
        `    classDef circular${idx} fill:#f96,stroke:#333,stroke-width:4px;`,
      );
      cycle.slice(0, -1).forEach((filePath) => {
        const nodeId = createNodeId(filePath);
        lines.push(`    class ${nodeId} circular${idx};`);
      });
    });
  }

  lines.push("```");
  return lines;
}

function formatGraphHeader(stats: GraphStats): string[] {
  return [
    `📊 Module Graph Analysis`,
    `Found ${stats.totalFiles} files with ${stats.totalImports} imports and ${stats.totalExports} exports\n`,
  ];
}

function buildGraphAnalysis(graph: Graph, useMermaid: boolean): string[] {
  const lines: string[] = [];

  // Header
  lines.push(...formatGraphHeader(graph.stats));

  // Circular dependencies
  lines.push(...formatCircularDependencies(graph.stats.circularDependencies));

  // Topological sort
  const { sorted, fileMap } = topologicalSort(graph.files);

  // Display dependency tree
  lines.push(...formatDependencyTree(sorted, fileMap));

  // Most imported files
  lines.push(...formatMostImportedFiles(graph.files));

  // Add Mermaid graph visualization if requested
  if (useMermaid) {
    lines.push(...generateMermaidDiagram(graph));
  }

  return lines;
}

function handleGetModuleGraph(
  args: z.infer<typeof paramsSchema>,
): Promise<string> {
  const project = createProject();
  const result = getModuleGraph(project, {
    rootDir: args.root,
    entryPoints: args.entryPoints,
  });

  if (result.isErr()) {
    throw new Error(result.error);
  }

  const { graph } = result.value;
  const lines = buildGraphAnalysis(graph, args.useMermaid);
  return Promise.resolve(lines.join("\n"));
}

export const getModuleGraphTool: ToolDef<typeof paramsSchema> = {
  name: "lsmcp_get_module_graph",
  description:
    "Analyze the module dependency graph of a TypeScript/JavaScript project",
  schema: paramsSchema,
  execute: handleGetModuleGraph,
};
