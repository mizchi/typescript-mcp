import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProjectCache,
  findProjectForFile,
  getOrCreateProject,
  getProjectCacheSize,
} from "./projectCache.ts";
import { join } from "path";

describe("project_cache", () => {
  beforeEach(() => {
    clearProjectCache();
  });

  it("should cache projects by tsconfig", async () => {
    // First call should create a new project
    const project1 = await getOrCreateProject(
      join(process.cwd(), "tests/fixtures/00-rename"),
    );
    expect(getProjectCacheSize()).toBe(1);

    // Second call with same directory should return cached project
    const project2 = await getOrCreateProject(
      join(process.cwd(), "tests/fixtures/00-rename"),
    );
    expect(project1).toBe(project2);
    expect(getProjectCacheSize()).toBe(1);
  });

  it("should create different projects for different tsconfigs", async () => {
    // Different directories with different tsconfigs
    const project1 = await getOrCreateProject(
      join(process.cwd(), "tests/fixtures/00-rename"),
    );
    const project2 = await getOrCreateProject(
      join(process.cwd(), "tests/fixtures/01-move"),
    );

    expect(project1).not.toBe(project2);
    expect(getProjectCacheSize()).toBe(2);
  });

  it("should handle directories without tsconfig", async () => {
    // Create a project for a directory without tsconfig
    const project1 = await getOrCreateProject("/tmp");
    expect(getProjectCacheSize()).toBe(1);

    // Another directory without tsconfig should reuse the same default project
    const project2 = await getOrCreateProject("/var");
    expect(project1).toBe(project2);
    expect(getProjectCacheSize()).toBe(1);
  });

  it("should find parent tsconfig", async () => {
    // When starting from a subdirectory, it should find parent tsconfig
    const project1 = await getOrCreateProject(process.cwd());
    const project2 = await getOrCreateProject(
      join(process.cwd(), "src/utils"),
    );

    // Both should use the same root tsconfig
    expect(project1).toBe(project2);
    expect(getProjectCacheSize()).toBe(1);
  });

  describe("findProjectForFile", () => {
    it("should find project for a file path", async () => {
      const filePath = join(process.cwd(), "src/utils/project_cache.ts");
      // Pre-create project to ensure it's cached
      await getOrCreateProject(process.cwd());
      const project = findProjectForFile(filePath);

      expect(project).toBeDefined();
      expect(getProjectCacheSize()).toBe(1);
    });

    it("should use same project for files in same directory", async () => {
      const file1 = join(process.cwd(), "src/commands/move_file.ts");
      const file2 = join(process.cwd(), "src/commands/rename_symbol.ts");

      // Pre-create project to ensure it's cached
      await getOrCreateProject(process.cwd());
      const project1 = findProjectForFile(file1);
      const project2 = findProjectForFile(file2);

      expect(project1).toBe(project2);
      expect(getProjectCacheSize()).toBe(1);
    });

    it("should handle relative paths", async () => {
      const relativePath = "src/utils/project_cache.ts";
      const absolutePath = join(process.cwd(), relativePath);

      // Pre-create project to ensure it's cached
      await getOrCreateProject(process.cwd());
      const project1 = findProjectForFile(relativePath);
      const project2 = findProjectForFile(absolutePath);

      expect(project1).toBe(project2);
      expect(getProjectCacheSize()).toBe(1);
    });

    it("should create default project when no cached project exists", () => {
      const filePath = "/some/random/path/file.ts";
      const project = findProjectForFile(filePath);

      expect(project).toBeDefined();
      expect(getProjectCacheSize()).toBe(1);
    });
  });
});
