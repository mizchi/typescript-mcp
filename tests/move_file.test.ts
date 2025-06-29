import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { moveFile } from "../src/ts/commands/moveFile.ts";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { parseMoveComments } from "./helpers/extract-move-ops.ts";

const FIXTURES_DIR = path.join(__dirname, "fixtures/01-move");

describe("moveFile", () => {
  describe("fixture-based tests", () => {
    let tmpDir: string;

    beforeEach(async () => {
      // Create temporary directory with random hash
      const hash = randomBytes(8).toString("hex");
      tmpDir = path.join(FIXTURES_DIR, `tmp-${hash}`);
      await fs.mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      // Cleanup tmp directory
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("should move simple.ts file", async () => {
      const inputPath = path.join(FIXTURES_DIR, "simple.input.ts");
      const operations = await parseMoveComments(inputPath);
      expect(operations.length).toBe(1);

      const project = new Project({
        skipFileDependencyResolution: true,
      });

      // Copy input file to temp directory
      const originalPath = path.join(tmpDir, "simple.ts");
      await fs.copyFile(inputPath, originalPath);
      project.addSourceFileAtPath(originalPath);

      // Perform the move
      const newPath = path.join(tmpDir, "simple-renamed.ts");
      moveFile(project, {
        oldFilename: originalPath,
        newFilename: newPath,
      });

      // Save changes
      await project.save();

      // Verify old file doesn't exist
      await expect(fs.access(originalPath)).rejects.toThrow();

      // Verify new file exists with correct content
      const newContent = await fs.readFile(newPath, "utf-8");
      expect(newContent).toContain("export const foo");
      expect(newContent).toContain("export function hello");
    });

    it("should move declaration file", async () => {
      const inputPath = path.join(FIXTURES_DIR, "declaration.input.d.ts");
      const operations = await parseMoveComments(inputPath);
      expect(operations.length).toBe(1);

      const project = new Project({
        skipFileDependencyResolution: true,
      });

      // Copy input file to temp directory
      const originalPath = path.join(tmpDir, "types.d.ts");
      await fs.copyFile(inputPath, originalPath);
      project.addSourceFileAtPath(originalPath);

      // Perform the move
      const newPath = path.join(tmpDir, "global.d.ts");
      moveFile(project, {
        oldFilename: originalPath,
        newFilename: newPath,
      });

      // Save changes
      await project.save();

      // Verify old file doesn't exist
      await expect(fs.access(originalPath)).rejects.toThrow();

      // Verify new file exists
      const newContent = await fs.readFile(newPath, "utf-8");
      expect(newContent).toContain('declare module "my-module"');
    });
  });

  describe("unit tests", () => {
    let tmpDir: string;
    let project: Project;

    beforeEach(async () => {
      // Create temporary directory with random hash
      const hash = randomBytes(8).toString("hex");
      tmpDir = path.join(__dirname, `tmp-${hash}`);
      await fs.mkdir(tmpDir, { recursive: true });

      project = new Project({
        skipFileDependencyResolution: true,
      });
    });

    afterEach(async () => {
      // Cleanup tmp directory
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("should move a file to a new location", async () => {
      const oldPath = path.join(tmpDir, "old.ts");
      const newPath = path.join(tmpDir, "new.ts");

      // Create a source file with some content
      await fs.writeFile(oldPath, `export const foo = "bar";`);
      project.addSourceFileAtPath(oldPath);

      // Move the file
      const result = moveFile(project, {
        oldFilename: oldPath,
        newFilename: newPath,
      });

      expect(result.isOk()).toBe(true);

      // Save changes
      await project.save();

      // Verify old file doesn't exist
      await expect(fs.access(oldPath)).rejects.toThrow();

      // Verify new file exists with correct content
      const newContent = await fs.readFile(newPath, "utf-8");
      expect(newContent).toBe(`export const foo = "bar";`);
    });

    it("should move a file to a different directory", async () => {
      const subDir = path.join(tmpDir, "subdir");
      await fs.mkdir(subDir, { recursive: true });

      const oldPath = path.join(tmpDir, "source.ts");
      const newPath = path.join(subDir, "moved.ts");

      // Create a source file
      await fs.writeFile(oldPath, `export function test() { return true; }`);
      project.addSourceFileAtPath(oldPath);

      // Move the file
      const result = moveFile(project, {
        oldFilename: oldPath,
        newFilename: newPath,
      });

      expect(result.isOk()).toBe(true);

      // Save changes
      await project.save();

      // Verify old file doesn't exist
      await expect(fs.access(oldPath)).rejects.toThrow();

      // Verify new file exists
      const newContent = await fs.readFile(newPath, "utf-8");
      expect(newContent).toBe(`export function test() { return true; }`);
    });

    it("should update import statements when moving a file", async () => {
      const libPath = path.join(tmpDir, "lib.ts");
      const indexPath = path.join(tmpDir, "index.ts");
      const newLibPath = path.join(tmpDir, "utils", "lib.ts");

      // Create utils directory
      await fs.mkdir(path.join(tmpDir, "utils"), { recursive: true });

      // Create files
      await fs.writeFile(libPath, `export const helper = () => "help";`);
      await fs.writeFile(
        indexPath,
        `import { helper } from "./lib";\n\nconsole.log(helper());`,
      );

      project.addSourceFileAtPath(libPath);
      project.addSourceFileAtPath(indexPath);

      // Move the file
      moveFile(project, {
        oldFilename: libPath,
        newFilename: newLibPath,
      });

      // Save changes
      await project.save();

      // Verify import was updated
      const indexContent = await fs.readFile(indexPath, "utf-8");
      expect(indexContent).toContain(`import { helper } from "./utils/lib"`);
    });

    it("should return error when source file doesn't exist", () => {
      const oldPath = path.join(tmpDir, "non-existent.ts");
      const newPath = path.join(tmpDir, "new.ts");

      const result = moveFile(project, {
        oldFilename: oldPath,
        newFilename: newPath,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(`Source file not found: ${oldPath}`);
      }
    });

    it("should handle moving TypeScript declaration files", async () => {
      const oldPath = path.join(tmpDir, "types.d.ts");
      const newPath = path.join(tmpDir, "global.d.ts");

      // Create a declaration file
      await fs.writeFile(
        oldPath,
        `declare module "my-module" {\n  export function test(): void;\n}`,
      );
      project.addSourceFileAtPath(oldPath);

      // Move the file
      const result = moveFile(project, {
        oldFilename: oldPath,
        newFilename: newPath,
      });

      expect(result.isOk()).toBe(true);

      // Save changes
      await project.save();

      // Verify file was moved
      await expect(fs.access(oldPath)).rejects.toThrow();
      const newContent = await fs.readFile(newPath, "utf-8");
      expect(newContent).toContain(`declare module "my-module"`);
    });
  });
});
