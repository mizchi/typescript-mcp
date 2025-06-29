import { type Project } from "ts-morph";
import { err, ok, type Result } from "neverthrow";
import { isAbsolute, relative, resolve } from "path";
import { resolveModulePath } from "../utils/moduleResolution.ts";

export interface ModuleNode {
  filePath: string;
  imports: string[];
  exports: string[];
  exportedSymbols: string[];
  importedFrom: string[];
}

export interface ModuleGraph {
  nodes: Map<string, ModuleNode>;
  rootFiles: string[];
  entryPoints: string[];
}

export interface GetModuleGraphRequest {
  rootDir: string;
  entryPoints: string[]; // Absolute or relative file paths to start analysis from
}

export interface GetModuleGraphSuccess {
  message: string;
  graph: {
    files: {
      path: string;
      imports: string[];
      exports: string[];
      exportedSymbols: string[];
      importedBy: string[];
    }[];
    stats: {
      totalFiles: number;
      totalImports: number;
      totalExports: number;
      circularDependencies: string[][];
    };
  };
}

export function getModuleGraph(
  project: Project,
  request: GetModuleGraphRequest,
): Result<GetModuleGraphSuccess, string> {
  try {
    const graph: ModuleGraph = {
      nodes: new Map(),
      rootFiles: [],
      entryPoints: [],
    };

    // Resolve entry points to absolute paths
    const resolvedEntryPoints: string[] = [];
    for (const entryPoint of request.entryPoints) {
      const absolutePath = isAbsolute(entryPoint)
        ? entryPoint
        : resolve(request.rootDir, entryPoint);

      // Add the file to the project if it doesn't exist
      let sourceFile = project.getSourceFile(absolutePath);
      if (!sourceFile) {
        try {
          sourceFile = project.addSourceFileAtPath(absolutePath);
        } catch (error) {
          return err(
            `Failed to add entry point ${entryPoint}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      resolvedEntryPoints.push(sourceFile.getFilePath());
      graph.entryPoints.push(sourceFile.getFilePath());
    }

    // Build dependency graph starting from entry points
    const visited = new Set<string>();
    const queue = [...resolvedEntryPoints];

    while (queue.length > 0) {
      const filePath = queue.shift()!;
      if (visited.has(filePath)) continue;
      visited.add(filePath);

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) continue;

      const node: ModuleNode = {
        filePath,
        imports: [],
        exports: [],
        exportedSymbols: [],
        importedFrom: [],
      };

      // Collect imports
      const importDeclarations = sourceFile.getImportDeclarations();
      for (const importDecl of importDeclarations) {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        const resolvedModule = resolveModulePath(
          filePath,
          moduleSpecifier,
          project,
        );
        if (resolvedModule) {
          node.imports.push(resolvedModule);
          // Add to queue for processing
          if (!visited.has(resolvedModule)) {
            queue.push(resolvedModule);
          }
        }
      }

      // Collect exports (re-exports)
      const exportDeclarations = sourceFile.getExportDeclarations();
      for (const exportDecl of exportDeclarations) {
        const moduleSpecifier = exportDecl.getModuleSpecifierValue();
        if (moduleSpecifier) {
          const resolvedModule = resolveModulePath(
            filePath,
            moduleSpecifier,
            project,
          );
          if (resolvedModule) {
            node.exports.push(resolvedModule);
            // Add to queue for processing
            if (!visited.has(resolvedModule)) {
              queue.push(resolvedModule);
            }
          }
        }
      }

      // Collect exported symbols
      const exportedSymbols = sourceFile.getExportSymbols();
      for (const symbol of exportedSymbols) {
        node.exportedSymbols.push(symbol.getName());
      }

      graph.nodes.set(filePath, node);
    }

    // Second pass: build reverse dependencies (importedFrom)
    for (const [filePath, node] of graph.nodes) {
      for (const importPath of node.imports) {
        const importedNode = graph.nodes.get(importPath);
        if (importedNode) {
          importedNode.importedFrom.push(filePath);
        }
      }
    }

    // Find entry points (files not imported by any other file)
    for (const [filePath, node] of graph.nodes) {
      if (node.importedFrom.length === 0) {
        graph.entryPoints.push(filePath);
      }
    }

    // Detect circular dependencies
    const circularDeps = detectCircularDependencies(graph);

    // Calculate stats
    let totalImports = 0;
    let totalExports = 0;
    for (const node of graph.nodes.values()) {
      totalImports += node.imports.length;
      totalExports += node.exportedSymbols.length;
    }

    // Convert to output format
    const files = Array.from(graph.nodes.values()).map((node) => ({
      path: relative(request.rootDir, node.filePath),
      imports: node.imports.map((p) => relative(request.rootDir, p)),
      exports: node.exports.map((p) => relative(request.rootDir, p)),
      exportedSymbols: node.exportedSymbols,
      importedBy: node.importedFrom.map((p) => relative(request.rootDir, p)),
    }));

    return ok({
      message: `Analyzed module graph: ${graph.nodes.size} files`,
      graph: {
        files,
        stats: {
          totalFiles: graph.nodes.size,
          totalImports,
          totalExports,
          circularDependencies: circularDeps.map((cycle) =>
            cycle.map((p) => relative(request.rootDir, p))
          ),
        },
      },
    });
  } catch (error) {
    return err(
      `Failed to analyze module graph: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function detectCircularDependencies(graph: ModuleGraph): string[][] {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];

  function dfs(filePath: string, path: string[]): void {
    visited.add(filePath);
    recursionStack.add(filePath);
    path.push(filePath);

    const node = graph.nodes.get(filePath);
    if (node) {
      for (const importPath of node.imports) {
        if (!visited.has(importPath)) {
          dfs(importPath, [...path]);
        } else if (recursionStack.has(importPath)) {
          // Found a cycle
          const cycleStart = path.indexOf(importPath);
          if (cycleStart !== -1) {
            const cycle = path.slice(cycleStart);
            cycle.push(importPath); // Complete the cycle

            // Check if this cycle is already recorded (in any rotation)
            const isNewCycle = !cycles.some((existingCycle) =>
              areCyclesEqual(cycle, existingCycle)
            );

            if (isNewCycle) {
              cycles.push(cycle);
            }
          }
        }
      }
    }

    recursionStack.delete(filePath);
  }

  // Start DFS from all nodes
  for (const filePath of graph.nodes.keys()) {
    if (!visited.has(filePath)) {
      dfs(filePath, []);
    }
  }

  return cycles;
}

function areCyclesEqual(cycle1: string[], cycle2: string[]): boolean {
  if (cycle1.length !== cycle2.length) return false;

  // Find the starting point of cycle1 in cycle2
  const start = cycle2.indexOf(cycle1[0]);
  if (start === -1) return false;

  // Check if cycles are the same (considering rotation)
  for (let i = 0; i < cycle1.length - 1; i++) {
    const idx1 = i;
    const idx2 = (start + i) % (cycle2.length - 1);
    if (cycle1[idx1] !== cycle2[idx2]) {
      return false;
    }
  }

  return true;
}

if (import.meta.vitest) {
  const { describe, it, expect } = await import("vitest");
  const { Project } = await import("ts-morph");

  describe("getModuleGraph", () => {
    it("should analyze a simple module graph", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99,
          module: 99,
        },
      });

      // Create test files
      project.createSourceFile(
        "/project/src/index.ts",
        `
import { helper } from "./utils/helper.ts";
import { config } from "./config.ts";

export function main() {
  return helper() + config.value;
}
      `,
      );

      project.createSourceFile(
        "/project/src/utils/helper.ts",
        `
export function helper() {
  return "helper";
}
      `,
      );

      project.createSourceFile(
        "/project/src/config.ts",
        `
export const config = {
  value: 42
};
      `,
      );

      const result = getModuleGraph(project, {
        rootDir: "/project",
        entryPoints: ["/project/src/index.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { graph } = result.value;

      expect(graph.stats.totalFiles).toBe(3);
      expect(graph.stats.totalImports).toBe(2);
      expect(graph.stats.totalExports).toBe(3); // main, helper, config
      expect(graph.stats.circularDependencies).toHaveLength(0);

      // Check specific file relationships
      const indexFile = graph.files.find((f) => f.path === "src/index.ts");
      expect(indexFile).toBeDefined();
      expect(indexFile?.imports).toHaveLength(2);
      expect(indexFile?.importedBy).toHaveLength(0); // It's an entry point

      const helperFile = graph.files.find((f) =>
        f.path === "src/utils/helper.ts"
      );
      expect(helperFile).toBeDefined();
      expect(helperFile?.importedBy).toContain("src/index.ts");
    });

    it("should detect circular dependencies", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99,
          module: 99,
        },
      });

      // Create circular dependency: a -> b -> c -> a
      project.createSourceFile(
        "/project/src/a.ts",
        `
import { b } from "./b.ts";
export const a = "a" + b;
      `,
      );

      project.createSourceFile(
        "/project/src/b.ts",
        `
import { c } from "./c.ts";
export const b = "b" + c;
      `,
      );

      project.createSourceFile(
        "/project/src/c.ts",
        `
import { a } from "./a.ts";
export const c = "c" + a;
      `,
      );

      const result = getModuleGraph(project, {
        rootDir: "/project",
        entryPoints: ["/project/src/a.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { graph } = result.value;

      expect(graph.stats.circularDependencies).toHaveLength(1);
      const cycle = graph.stats.circularDependencies[0];
      expect(cycle).toHaveLength(4); // a -> b -> c -> a
      expect(cycle[0]).toBe(cycle[3]); // Cycle completes
    });

    it("should only include files reachable from entry points", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99,
          module: 99,
        },
      });

      project.createSourceFile(
        "/project/src/entry.ts",
        `
import { helper } from "./helper.ts";
export const entry = helper();
    `,
      );
      project.createSourceFile(
        "/project/src/helper.ts",
        `export const helper = () => "helper";`,
      );
      project.createSourceFile(
        "/project/src/unreachable.ts",
        `export const unreachable = "not imported";`,
      );

      const result = getModuleGraph(project, {
        rootDir: "/project",
        entryPoints: ["/project/src/entry.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { graph } = result.value;

      expect(graph.stats.totalFiles).toBe(2); // Only entry.ts and helper.ts
      expect(graph.files.map((f) => f.path).sort()).toEqual([
        "src/entry.ts",
        "src/helper.ts",
      ]);
    });

    it("should handle re-exports correctly", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99,
          module: 99,
        },
      });

      project.createSourceFile(
        "/project/src/core.ts",
        `export const core = "core";`,
      );

      project.createSourceFile(
        "/project/src/index.ts",
        `export { core } from "./core.ts";`,
      );

      const result = getModuleGraph(project, {
        rootDir: "/project",
        entryPoints: ["/project/src/index.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { graph } = result.value;

      const indexFile = graph.files.find((f) => f.path === "src/index.ts");
      expect(indexFile?.exports).toContain("src/core.ts");
    });
  });
}
