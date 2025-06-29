import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addSourceFile,
  createProject,
  renameSymbol,
} from "../src/ts/commands/renameSymbol.ts";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { parseRenameComments } from "./helpers/extract-ops.ts";
import { globSync } from "fs";

const FIXTURES_DIR = path.join(__dirname, "fixtures/00-rename");

describe("rename", () => {
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

  // Find all .input.ts files in the fixtures directory
  const inputFiles = globSync("*.input.ts", { cwd: FIXTURES_DIR });
  const testCases = inputFiles.map((file) => path.basename(file, ".input.ts"));

  testCases.forEach((testName) => {
    it(`should rename ${testName}`, async () => {
      // Copy input file to tmp directory
      const inputFile = path.join(FIXTURES_DIR, `${testName}.input.ts`);
      const tmpFile = path.join(tmpDir, `${testName}.ts`);
      await fs.copyFile(inputFile, tmpFile);

      // Parse rename operations from @rename comments
      const operations = await parseRenameComments(tmpFile);
      expect(operations.length).toBe(1);

      // Create project and run rename
      const project = createProject();
      addSourceFile(project, tmpFile);

      const op = operations[0];
      const result = await renameSymbol(project, {
        filePath: tmpFile,
        line: op.line,
        symbolName: op.symbolName,
        newName: op.newName,
        renameInComments: false,
        renameInStrings: true,
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        console.error("Rename failed:", result.error);
      }

      // Compare with expected output
      const actualContent = await fs.readFile(tmpFile, "utf-8");
      const expectedFile = path.join(FIXTURES_DIR, `${testName}.expected.ts`);
      const expectedContent = await fs.readFile(expectedFile, "utf-8");

      expect(actualContent.trim()).toBe(expectedContent.trim());
    });
  });
});
