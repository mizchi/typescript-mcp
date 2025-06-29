import { z } from "zod";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { Project } from "ts-morph";
import { getRelatedModules } from "../navigations/getRelatedModules.ts";

const paramsSchema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z.string().describe("Target file path (relative or absolute)"),
});

export const getRelatedModulesTool: ToolDef<typeof paramsSchema> = {
  name: "lsmcp_get_related_modules",
  description:
    "Get all modules related to a specific file (imports, imported by, re-exports, re-exported by)",
  schema: paramsSchema,
  execute: (args) => {
    // Create a fresh project for analysis without tsconfig exclusions
    const project = new Project({
      compilerOptions: {
        allowJs: true,
        skipLibCheck: true,
        strict: false,
      },
      skipFileDependencyResolution: true,
    });

    const result = getRelatedModules(project, {
      filePath: args.filePath,
      rootDir: args.root,
    });

    if (result.isErr()) {
      throw new Error(result.error);
    }

    const { targetFile, relatedModules, stats } = result.value;
    const lines: string[] = [];

    lines.push(`📂 Related Modules for: ${targetFile}`);
    lines.push(`Found ${relatedModules.length} related modules\n`);

    // Group by relationship type
    const imports = relatedModules.filter((m) => m.relationship === "imports");
    const importedBy = relatedModules.filter(
      (m) => m.relationship === "imported-by",
    );
    const reExports = relatedModules.filter(
      (m) => m.relationship === "re-exports",
    );
    const reExportedBy = relatedModules.filter(
      (m) => m.relationship === "re-exported-by",
    );

    // Show imports
    if (imports.length > 0) {
      lines.push(`📥 Imports (${imports.length}):`);
      imports.forEach((module) => {
        const symbolInfo = module.symbols && module.symbols.length > 0
          ? ` { ${module.symbols.join(", ")} }`
          : "";
        lines.push(`  - ${module.path}${symbolInfo}`);
      });
      lines.push("");
    }

    // Show imported by
    if (importedBy.length > 0) {
      lines.push(`📤 Imported By (${importedBy.length}):`);
      importedBy.forEach((module) => {
        const symbolInfo = module.symbols && module.symbols.length > 0
          ? ` { ${module.symbols.join(", ")} }`
          : "";
        lines.push(`  - ${module.path}${symbolInfo}`);
      });
      lines.push("");
    }

    // Show re-exports
    if (reExports.length > 0) {
      lines.push(`🔄 Re-exports From (${reExports.length}):`);
      reExports.forEach((module) => {
        const symbolInfo = module.symbols && module.symbols.length > 0
          ? ` { ${module.symbols.join(", ")} }`
          : "";
        lines.push(`  - ${module.path}${symbolInfo}`);
      });
      lines.push("");
    }

    // Show re-exported by
    if (reExportedBy.length > 0) {
      lines.push(`🔄 Re-exported By (${reExportedBy.length}):`);
      reExportedBy.forEach((module) => {
        const symbolInfo = module.symbols && module.symbols.length > 0
          ? ` { ${module.symbols.join(", ")} }`
          : "";
        lines.push(`  - ${module.path}${symbolInfo}`);
      });
      lines.push("");
    }

    // Add summary
    lines.push(`📊 Summary:`);
    lines.push(`  - Direct imports: ${stats.totalImports}`);
    lines.push(`  - Imported by: ${stats.totalImportedBy}`);
    lines.push(`  - Re-exports from: ${stats.totalReExports}`);
    lines.push(`  - Re-exported by: ${stats.totalReExportedBy}`);

    // Add Mermaid graph
    lines.push("");
    lines.push("📊 Dependency Graph:");
    lines.push("```mermaid");
    lines.push("graph TD");

    // Create node IDs
    const createNodeId = (path: string) => {
      return path.replace(/[^\w]/g, "_").replace(/__+/g, "_");
    };

    // Add central node
    const targetId = createNodeId(targetFile);
    lines.push(`    ${targetId}["${targetFile}"]:::target`);

    // Add related nodes and edges
    relatedModules.forEach((module) => {
      const moduleId = createNodeId(module.path);
      lines.push(`    ${moduleId}["${module.path}"]`);

      switch (module.relationship) {
        case "imports":
          lines.push(`    ${targetId} --> ${moduleId}`);
          break;
        case "imported-by":
          lines.push(`    ${moduleId} --> ${targetId}`);
          break;
        case "re-exports":
          lines.push(`    ${targetId} -.->|re-exports| ${moduleId}`);
          break;
        case "re-exported-by":
          lines.push(`    ${moduleId} -.->|re-exports| ${targetId}`);
          break;
      }
    });

    // Style the target node
    lines.push(`    classDef target fill:#f9f,stroke:#333,stroke-width:4px;`);

    lines.push("```");

    return Promise.resolve(lines.join("\n"));
  },
};
