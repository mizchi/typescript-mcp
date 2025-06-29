import { dirname, join, resolve } from "path";
import { existsSync } from "fs";
import { type Project } from "ts-morph";

/**
 * Resolve a module path from an import specifier with ts-morph Project support
 * @param fromFile The file containing the import
 * @param moduleSpecifier The import path (e.g., "./foo", "../bar", "react")
 * @param project The ts-morph Project instance
 * @returns The resolved file path or null if not found
 */
export function resolveModulePath(
  fromFile: string,
  moduleSpecifier: string,
  project: Project,
): string | null {
  // Skip external modules
  if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
    return null;
  }

  const fromDir = dirname(fromFile);
  const resolvedPath = resolve(fromDir, moduleSpecifier);

  // Try with TypeScript extensions
  const extensions = [".ts", ".tsx", ".d.ts", ".js", ".jsx"];

  // Helper function to try to get or add a source file
  const tryGetOrAddSourceFile = (filePath: string): string | null => {
    let sourceFile = project.getSourceFile(filePath);
    if (!sourceFile) {
      // Try to add the file if it exists on disk
      try {
        if (existsSync(filePath)) {
          // Use addSourceFileAtPath which handles tsconfig exclusions better
          sourceFile = project.addSourceFileAtPath(filePath);
        }
      } catch {
        // Ignore errors - file might be excluded by tsconfig
      }
    }
    return sourceFile ? sourceFile.getFilePath() : null;
  };

  // First try the path as-is (if it already has an extension)
  const result = tryGetOrAddSourceFile(resolvedPath);
  if (result) return result;

  // Try adding extensions
  for (const ext of extensions) {
    const pathWithExt = resolvedPath + ext;
    const result = tryGetOrAddSourceFile(pathWithExt);
    if (result) return result;
  }

  // Try index files
  for (const ext of extensions) {
    const indexPath = join(resolvedPath, `index${ext}`);
    const result = tryGetOrAddSourceFile(indexPath);
    if (result) return result;
  }

  return null;
}
