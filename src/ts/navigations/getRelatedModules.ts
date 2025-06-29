import { type Project } from "ts-morph";
import { err, ok, type Result } from "neverthrow";
import { isAbsolute, relative, resolve } from "path";
import { resolveModulePath } from "../utils/moduleResolution.ts";

export interface GetRelatedModulesRequest {
  filePath: string;
  rootDir: string;
}

export interface RelatedModule {
  path: string;
  relationship: "imports" | "imported-by" | "re-exports" | "re-exported-by";
  symbols?: string[]; // Specific symbols imported/exported
}

export interface GetRelatedModulesSuccess {
  message: string;
  targetFile: string;
  relatedModules: RelatedModule[];
  stats: {
    totalImports: number;
    totalImportedBy: number;
    totalReExports: number;
    totalReExportedBy: number;
  };
}

export function getRelatedModules(
  project: Project,
  request: GetRelatedModulesRequest,
): Result<GetRelatedModulesSuccess, string> {
  try {
    const absolutePath = isAbsolute(request.filePath)
      ? request.filePath
      : resolve(request.rootDir, request.filePath);

    // Get or add the target file
    let sourceFile = project.getSourceFile(absolutePath);
    if (!sourceFile) {
      try {
        sourceFile = project.addSourceFileAtPath(absolutePath);
      } catch (error) {
        return err(
          `Failed to load file ${request.filePath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const relatedModules: RelatedModule[] = [];
    const targetFilePath = sourceFile.getFilePath();

    // 1. Find direct imports (files this file imports)
    const importDeclarations = sourceFile.getImportDeclarations();
    for (const importDecl of importDeclarations) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const resolvedModule = resolveModulePath(
        targetFilePath,
        moduleSpecifier,
        project,
      );

      if (resolvedModule) {
        const namedImports = importDecl.getNamedImports();
        const symbols = namedImports.map((imp) => imp.getName());

        relatedModules.push({
          path: relative(request.rootDir, resolvedModule),
          relationship: "imports",
          symbols: symbols.length > 0 ? symbols : undefined,
        });
      }
    }

    // 2. Find re-exports (files this file re-exports from)
    const exportDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDeclarations) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (moduleSpecifier) {
        const resolvedModule = resolveModulePath(
          targetFilePath,
          moduleSpecifier,
          project,
        );

        if (resolvedModule) {
          const namedExports = exportDecl.getNamedExports();
          const symbols = namedExports.map((exp) => exp.getName());

          relatedModules.push({
            path: relative(request.rootDir, resolvedModule),
            relationship: "re-exports",
            symbols: symbols.length > 0 ? symbols : undefined,
          });
        }
      }
    }

    // 3. Find files that import this file
    // We need to check all source files in the project
    const allSourceFiles = project.getSourceFiles();

    for (const otherFile of allSourceFiles) {
      if (otherFile === sourceFile) continue;

      // Check imports
      const imports = otherFile.getImportDeclarations();
      for (const importDecl of imports) {
        const moduleSpecifier = importDecl.getModuleSpecifierValue();
        const resolvedModule = resolveModulePath(
          otherFile.getFilePath(),
          moduleSpecifier,
          project,
        );

        if (resolvedModule === targetFilePath) {
          const namedImports = importDecl.getNamedImports();
          const symbols = namedImports.map((imp) => imp.getName());

          relatedModules.push({
            path: relative(request.rootDir, otherFile.getFilePath()),
            relationship: "imported-by",
            symbols: symbols.length > 0 ? symbols : undefined,
          });
        }
      }

      // Check re-exports
      const exports = otherFile.getExportDeclarations();
      for (const exportDecl of exports) {
        const moduleSpecifier = exportDecl.getModuleSpecifierValue();
        if (moduleSpecifier) {
          const resolvedModule = resolveModulePath(
            otherFile.getFilePath(),
            moduleSpecifier,
            project,
          );

          if (resolvedModule === targetFilePath) {
            const namedExports = exportDecl.getNamedExports();
            const symbols = namedExports.map((exp) => exp.getName());

            relatedModules.push({
              path: relative(request.rootDir, otherFile.getFilePath()),
              relationship: "re-exported-by",
              symbols: symbols.length > 0 ? symbols : undefined,
            });
          }
        }
      }
    }

    // Calculate stats
    const stats = {
      totalImports: relatedModules.filter((m) =>
        m.relationship === "imports"
      ).length,
      totalImportedBy: relatedModules.filter((m) =>
        m.relationship === "imported-by"
      ).length,
      totalReExports:
        relatedModules.filter((m) => m.relationship === "re-exports").length,
      totalReExportedBy:
        relatedModules.filter((m) => m.relationship === "re-exported-by")
          .length,
    };

    return ok({
      message: `Found ${relatedModules.length} related modules`,
      targetFile: relative(request.rootDir, targetFilePath),
      relatedModules,
      stats,
    });
  } catch (error) {
    return err(
      `Failed to analyze related modules: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (import.meta.vitest) {
  const { describe, it, expect } = await import("vitest");
  const { createTestProject } = await import(
    "../test-utils/createTestProject.ts"
  );

  describe("getRelatedModules", () => {
    it("should find modules that a file imports", () => {
      const project = createTestProject();

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

      const result = getRelatedModules(project, {
        filePath: "/project/src/index.ts",
        rootDir: "/project",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { relatedModules, stats } = result.value;

      expect(stats.totalImports).toBe(2);
      expect(stats.totalImportedBy).toBe(0);

      const imports = relatedModules.filter((m) =>
        m.relationship === "imports"
      );
      expect(imports).toHaveLength(2);
      expect(imports.map((m) => m.path).sort()).toEqual([
        "src/config.ts",
        "src/utils/helper.ts",
      ]);
    });

    it("should find modules that import a file", () => {
      const project = createTestProject();

      // Create test files
      project.createSourceFile(
        "/project/src/utils/shared.ts",
        `
export const CONSTANT = 42;
export function sharedFunction() {
  return "shared";
}
      `,
      );

      project.createSourceFile(
        "/project/src/moduleA.ts",
        `
import { CONSTANT } from "./utils/shared.ts";
export const a = CONSTANT;
      `,
      );

      project.createSourceFile(
        "/project/src/moduleB.ts",
        `
import { sharedFunction } from "./utils/shared.ts";
export const b = sharedFunction();
      `,
      );

      const result = getRelatedModules(project, {
        filePath: "/project/src/utils/shared.ts",
        rootDir: "/project",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { relatedModules, stats } = result.value;

      expect(stats.totalImports).toBe(0);
      expect(stats.totalImportedBy).toBe(2);

      const importedBy = relatedModules.filter((m) =>
        m.relationship === "imported-by"
      );
      expect(importedBy).toHaveLength(2);
      expect(importedBy.map((m) => m.path).sort()).toEqual([
        "src/moduleA.ts",
        "src/moduleB.ts",
      ]);

      // Check that specific symbols are tracked
      const moduleA = importedBy.find((m) => m.path === "src/moduleA.ts");
      expect(moduleA?.symbols).toEqual(["CONSTANT"]);

      const moduleB = importedBy.find((m) => m.path === "src/moduleB.ts");
      expect(moduleB?.symbols).toEqual(["sharedFunction"]);
    });

    it("should find re-export relationships", () => {
      const project = createTestProject();

      // Create test files
      project.createSourceFile(
        "/project/src/core/feature.ts",
        `
export const feature = "feature";
export const helper = "helper";
      `,
      );

      project.createSourceFile(
        "/project/src/index.ts",
        `
export { feature } from "./core/feature.ts";
      `,
      );

      project.createSourceFile(
        "/project/src/barrel.ts",
        `
export { feature as renamedFeature } from "./core/feature.ts";
      `,
      );

      // Test from the perspective of feature.ts
      const result1 = getRelatedModules(project, {
        filePath: "/project/src/core/feature.ts",
        rootDir: "/project",
      });

      expect(result1.isOk()).toBe(true);
      if (result1.isErr()) return;

      const reExportedBy = result1.value.relatedModules.filter((m) =>
        m.relationship === "re-exported-by"
      );
      expect(reExportedBy).toHaveLength(2);
      expect(reExportedBy.map((m) => m.path).sort()).toEqual([
        "src/barrel.ts",
        "src/index.ts",
      ]);

      // Test from the perspective of index.ts
      const result2 = getRelatedModules(project, {
        filePath: "/project/src/index.ts",
        rootDir: "/project",
      });

      expect(result2.isOk()).toBe(true);
      if (result2.isErr()) return;

      const reExports = result2.value.relatedModules.filter((m) =>
        m.relationship === "re-exports"
      );
      expect(reExports).toHaveLength(1);
      expect(reExports[0].path).toBe("src/core/feature.ts");
    });

    it("should handle circular dependencies", () => {
      const project = createTestProject();

      // Create circular dependency
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
import { a } from "./a.ts";
export const b = "b" + a;
      `,
      );

      const result = getRelatedModules(project, {
        filePath: "/project/src/a.ts",
        rootDir: "/project",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { relatedModules } = result.value;

      // a.ts imports b.ts
      const imports = relatedModules.filter((m) =>
        m.relationship === "imports"
      );
      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe("src/b.ts");

      // a.ts is imported by b.ts
      const importedBy = relatedModules.filter((m) =>
        m.relationship === "imported-by"
      );
      expect(importedBy).toHaveLength(1);
      expect(importedBy[0].path).toBe("src/b.ts");
    });

    it("should handle files with no relationships", () => {
      const project = createTestProject();

      project.createSourceFile(
        "/project/src/isolated.ts",
        `
export const isolated = "I am alone";
      `,
      );

      const result = getRelatedModules(project, {
        filePath: "/project/src/isolated.ts",
        rootDir: "/project",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;

      const { relatedModules, stats } = result.value;

      expect(relatedModules).toHaveLength(0);
      expect(stats.totalImports).toBe(0);
      expect(stats.totalImportedBy).toBe(0);
      expect(stats.totalReExports).toBe(0);
      expect(stats.totalReExportedBy).toBe(0);
    });
  });
}
