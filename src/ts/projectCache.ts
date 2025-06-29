import {
  ModuleKind,
  ModuleResolutionKind,
  Project,
  ScriptTarget,
} from "ts-morph";
import { dirname, join, resolve } from "path";
import { access } from "fs/promises";

// Cache for projects by tsconfig path
const projectCache = new Map<string, Project>();

// Cache for default project (synchronous access)
let defaultProject: Project | null = null;

// Common configuration constants
const DEFAULT_COMPILER_OPTIONS = {
  allowJs: true,
  target: ScriptTarget.ESNext,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  esModuleInterop: true,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
} as const;

const DEFAULT_PROJECT_OPTIONS = {
  skipFileDependencyResolution: true,
  manipulationSettings: {
    usePrefixAndSuffixTextForRename: true,
  },
} as const;

/**
 * Find the nearest tsconfig.json file starting from the given directory
 */
async function findTsConfig(startPath: string): Promise<string | null> {
  let currentPath = resolve(startPath);

  while (true) {
    const tsconfigPath = join(currentPath, "tsconfig.json");
    try {
      await access(tsconfigPath);
      return tsconfigPath;
    } catch {
      // tsconfig.json not found in this directory
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached root directory
      break;
    }
    currentPath = parentPath;
  }

  return null;
}

/**
 * Get or create a TypeScript project, using cache for the same tsconfig
 */
export async function getOrCreateProject(
  workingDir?: string,
): Promise<Project> {
  const searchPath = workingDir || process.cwd();

  // Find the nearest tsconfig.json
  const tsconfigPath = await findTsConfig(searchPath);

  // Use a special key for projects without tsconfig
  const cacheKey = tsconfigPath || "$$default$$";

  // Check cache first
  const cachedProject = projectCache.get(cacheKey);
  if (cachedProject) {
    return cachedProject;
  }

  // Create new project
  let project: Project;

  if (tsconfigPath) {
    // Create project with tsconfig
    project = new Project({
      ...DEFAULT_PROJECT_OPTIONS,
      tsConfigFilePath: tsconfigPath,
    });
  } else {
    // Create default project without tsconfig
    project = new Project({
      ...DEFAULT_PROJECT_OPTIONS,
      compilerOptions: DEFAULT_COMPILER_OPTIONS,
    });
  }

  // Cache the project
  projectCache.set(cacheKey, project);

  return project;
}

/**
 * Get or create default project synchronously
 * This is used when we need synchronous access to a project
 */
function getOrCreateDefaultProjectSync(): Project {
  if (!defaultProject) {
    defaultProject = new Project({
      ...DEFAULT_PROJECT_OPTIONS,
      compilerOptions: {
        ...DEFAULT_COMPILER_OPTIONS,
        allowImportingTsExtensions: true,
      },
    });
    // Also cache it in the main cache
    projectCache.set("$$default$$", defaultProject);
  }
  return defaultProject;
}

/**
 * Find the appropriate project for a given file path (synchronous)
 * This assumes the project has already been created or uses a default project
 */
export function findProjectForFile(filePath: string): Project {
  const absolutePath = resolve(filePath);

  // For synchronous access, we'll check if there's already a cached project
  // by checking common tsconfig locations
  let currentPath = absolutePath;
  const directory = dirname(absolutePath);
  currentPath = directory;

  while (true) {
    const tsconfigPath = join(currentPath, "tsconfig.json");
    const cachedProject = projectCache.get(tsconfigPath);
    if (cachedProject) {
      return cachedProject;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached root directory
      break;
    }
    currentPath = parentPath;
  }

  // Check if we have a default project cached
  const defaultCached = projectCache.get("$$default$$");
  if (defaultCached) {
    return defaultCached;
  }

  // If no cached project found, create a default one synchronously
  return getOrCreateDefaultProjectSync();
}

/**
 * Clear the project cache
 */
export function clearProjectCache(): void {
  projectCache.clear();
  defaultProject = null;
}

/**
 * Get the current cache size
 */
export function getProjectCacheSize(): number {
  return projectCache.size;
}

/**
 * Get or create a source file with cache clearing
 * This ensures the source file is fresh and its descendants are forgotten
 */
export function getOrCreateSourceFileWithRefresh(
  filePath: string,
): import("ts-morph").SourceFile {
  const project = findProjectForFile(filePath);

  // Try to get existing source file
  let sourceFile = project.getSourceFile(filePath);

  if (sourceFile) {
    // Refresh from file system to get latest content
    void sourceFile.refreshFromFileSystem();
    // Clear cached descendants to ensure fresh analysis
    sourceFile.forgetDescendants();
  } else {
    // Add the file if it doesn't exist
    sourceFile = project.addSourceFileAtPath(filePath);
  }

  return sourceFile;
}
