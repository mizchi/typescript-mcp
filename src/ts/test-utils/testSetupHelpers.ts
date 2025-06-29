/**
 * Common test setup helpers for TypeScript tools
 */
import { Project, SourceFile } from "ts-morph";
import { vi } from "vitest";

export interface TestSetupResult {
  project: Project;
  testFile: SourceFile;
}

/**
 * Create a test project with source file and mock project cache
 */
export async function createTestProjectWithMocks(
  sourceContent: string,
  filePath: string = "/project/test.ts",
): Promise<TestSetupResult> {
  const { Project } = await import("ts-morph");
  const projectCacheMock = await import("../projectCache.ts");

  const project = new Project({
    useInMemoryFileSystem: true,
  });

  const testFile = project.createSourceFile(
    filePath,
    sourceContent.trim(),
  );

  await testFile.save();

  // Mock the project cache functions
  vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
  vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh).mockReturnValue(
    testFile,
  );

  return { project, testFile };
}

/**
 * Get test dependencies dynamically
 */
export async function getTestDependencies() {
  const tsMorph = await import("ts-morph");
  return {
    Project: tsMorph.Project,
  };
}
