import { getOrCreateProject } from "../projectCache.ts";
import { join } from "node:path";

export async function moveDirectory(
  rootPath: string,
  sourcePath: string,
  targetPath: string,
  options?: { overwrite?: boolean },
): Promise<{
  success: boolean;
  movedFiles: string[];
  error?: string;
}> {
  try {
    const project = await getOrCreateProject(rootPath);

    // Convert absolute paths to relative paths if needed
    const sourceRelative = sourcePath.startsWith(rootPath)
      ? sourcePath.slice(rootPath.length + 1)
      : sourcePath;
    const targetRelative = targetPath.startsWith(rootPath)
      ? targetPath.slice(rootPath.length + 1)
      : targetPath;

    // Add all source files in the directory tree to ensure directory is created
    const absoluteSourcePath = join(rootPath, sourceRelative);
    project.addSourceFilesAtPaths([
      join(absoluteSourcePath, "**/*.ts"),
      join(absoluteSourcePath, "**/*.tsx"),
      join(absoluteSourcePath, "**/*.js"),
      join(absoluteSourcePath, "**/*.jsx"),
    ]);

    // Also add all files that might import from this directory
    project.addSourceFilesAtPaths([
      join(rootPath, "**/*.ts"),
      join(rootPath, "**/*.tsx"),
      join(rootPath, "**/*.js"),
      join(rootPath, "**/*.jsx"),
    ]);

    const directory = project.getDirectory(absoluteSourcePath);

    if (!directory) {
      return {
        success: false,
        movedFiles: [],
        error: `Directory not found: ${sourceRelative}`,
      };
    }

    // Get all source files in the directory before moving
    const descendantFiles = directory.getDescendantSourceFiles();

    // For ts-morph, we need to provide the full absolute path for the move operation
    const absoluteTargetPath = join(rootPath, targetRelative);

    // Handle overwrite case first if needed
    if (options?.overwrite) {
      const existingTargetDir = project.getDirectory(absoluteTargetPath);
      if (existingTargetDir) {
        // Delete existing directory immediately
        existingTargetDir.deleteImmediatelySync();
      }
    }

    // Use moveImmediatelySync which handles file system operations
    try {
      directory.moveImmediatelySync(absoluteTargetPath);
    } catch (error) {
      // If error is due to parent directory not existing, create it and retry
      if (error instanceof Error && error.message.includes("ENOENT")) {
        // Create parent directory structure using ts-morph's FileSystem
        const fileSystem = project.getFileSystem();
        const targetParentPath = absoluteTargetPath.substring(
          0,
          absoluteTargetPath.lastIndexOf("/"),
        );
        fileSystem.mkdirSync(targetParentPath);
        // Retry the move
        directory.moveImmediatelySync(absoluteTargetPath);
      } else {
        throw error;
      }
    }

    // Save all changes to update imports
    await project.save();

    // Get new paths after move
    const movedFiles = descendantFiles.map((file) => file.getFilePath());

    return {
      success: true,
      movedFiles,
    };
  } catch (error) {
    return {
      success: false,
      movedFiles: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
