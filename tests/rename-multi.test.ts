import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  renameSymbol,
} from "../src/ts/commands/renameSymbol.ts";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { parseRenameComments } from "./helpers/extract-ops.ts";
import { globSync } from "fs";

const MULTI_FILE_FIXTURES_DIR = path.join(
  __dirname,
  "fixtures/02-rename-multi",
);

describe("rename multi-file", () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory with random hash
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(MULTI_FILE_FIXTURES_DIR, `tmp-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup tmp directory
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  // Find all directories in the multi-file fixtures directory
  const testDirs = globSync("*.input", { cwd: MULTI_FILE_FIXTURES_DIR });
  const testCases = testDirs.map((dir) => path.basename(dir, ".input"));

  testCases.forEach((testName) => {
    it(`should rename ${testName}`, async () => {
      const inputDir = path.join(MULTI_FILE_FIXTURES_DIR, `${testName}.input`);
      const expectedDir = path.join(
        MULTI_FILE_FIXTURES_DIR,
        `${testName}.expected`,
      );

      // Copy all input files to tmp directory
      const inputFiles = globSync("**/*.{ts,tsx,json}", { cwd: inputDir });
      for (const file of inputFiles) {
        const srcFile = path.join(inputDir, file);
        const destFile = path.join(tmpDir, file);
        await fs.mkdir(path.dirname(destFile), { recursive: true });
        await fs.copyFile(srcFile, destFile);
      }

      // Find the file with @rename comment
      let renameOperation = null;
      let renameFilePath = null;

      for (const file of inputFiles) {
        const filePath = path.join(tmpDir, file);
        const operations = await parseRenameComments(filePath);
        if (operations.length > 0) {
          expect(operations.length).toBe(1);
          renameOperation = operations[0];
          renameFilePath = filePath;
          break;
        }
      }

      expect(renameOperation).not.toBeNull();
      expect(renameFilePath).not.toBeNull();

      // Create project with tsconfig in the tmp directory
      const project = createProject(path.join(tmpDir, "tsconfig.json"));

      // Run rename
      const result = await renameSymbol(project, {
        filePath: renameFilePath!,
        line: renameOperation!.line,
        symbolName: renameOperation!.symbolName,
        newName: renameOperation!.newName,
        renameInComments: false,
        renameInStrings: true,
      });

      if (result.isErr()) {
        console.error("Rename failed:", result.error);
        console.error("Details:", {
          filePath: renameFilePath,
          line: renameOperation!.line,
          symbolName: renameOperation!.symbolName,
          newName: renameOperation!.newName,
        });
      }
      expect(result.isOk()).toBe(true);

      // Compare all files with expected output
      for (const file of inputFiles) {
        const actualFile = path.join(tmpDir, file);
        const expectedFile = path.join(expectedDir, file);
        const actualContent = await fs.readFile(actualFile, "utf-8");
        const expectedContent = await fs.readFile(expectedFile, "utf-8");

        if (actualContent.trim() !== expectedContent.trim()) {
          console.log(`File ${file} mismatch:`);
          console.log("Actual:", actualContent);
          console.log("Expected:", expectedContent);
        }

        expect(actualContent.trim()).toBe(expectedContent.trim());
      }
    });
  });
});
