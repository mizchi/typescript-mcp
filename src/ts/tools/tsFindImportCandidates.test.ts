import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  disposeAllIndexers,
  findImportCandidatesTool,
} from "./tsFindImportCandidates.ts";

describe("findImportCandidatesTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "test-import-candidates-"));
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await mkdir(join(tmpDir, "src/utils"), { recursive: true });
    await mkdir(join(tmpDir, "src/services"), { recursive: true });
    await mkdir(join(tmpDir, "src/models"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  afterAll(() => {
    // Dispose all indexers after all tests
    disposeAllIndexers();
  });

  it("should find import candidates for a symbol", async () => {
    // Create test files with exports
    await writeFile(
      join(tmpDir, "src/utils/logger.ts"),
      `
export class Logger {
  log(message: string): void {
    console.log(message);
  }
}

export function createLogger(name: string): Logger {
  return new Logger();
}
      `,
    );

    await writeFile(
      join(tmpDir, "src/services/user.ts"),
      `
export interface User {
  id: string;
  name: string;
}

export class UserService {
  getUser(id: string): User | null {
    return null;
  }
}
      `,
    );

    // Find candidates for "Logger"
    const result = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "Logger",
      currentFile: join(tmpDir, "src/index.ts"),
      limit: 10,
    });

    expect(result).toContain('Found 1 import candidates for "Logger"');
    expect(result).toContain("Logger [Class]");
    expect(result).toContain("File: src/utils/logger.ts");
    expect(result).toContain('import { Logger } from "./utils/logger"');
  });

  it("should calculate relative import paths correctly", async () => {
    await writeFile(
      join(tmpDir, "src/models/product.ts"),
      `export interface Product { id: string; }`,
    );

    // From a file in the same directory
    const result1 = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "Product",
      currentFile: join(tmpDir, "src/models/index.ts"),
      limit: 10,
    });
    expect(result1).toContain('import { Product } from "./product"');

    // From a file in a parent directory
    const result2 = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "Product",
      currentFile: join(tmpDir, "src/index.ts"),
      limit: 10,
    });
    expect(result2).toContain('import { Product } from "./models/product"');

    // From a file in a sibling directory
    const result3 = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "Product",
      currentFile: join(tmpDir, "src/services/order.ts"),
      limit: 10,
    });
    expect(result3).toContain('import { Product } from "../models/product"');
  });

  it("should prioritize exact matches and exported symbols", async () => {
    await writeFile(
      join(tmpDir, "src/config.ts"),
      `
export const Config = {};
export class ConfigManager {}
export interface ConfigOptions {}
      `,
    );

    const result = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "Config",
      limit: 10,
    });

    // Should find Config first (exact match)
    expect(result).toContain("Config [Variable]");
  });

  it("should handle no candidates found", async () => {
    const result = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "NonExistentSymbol",
      limit: 10,
    });

    expect(result).toBe('No import candidates found for "NonExistentSymbol"');
  });

  it("should limit results when specified", async () => {
    // Create multiple exports with same name
    for (let i = 0; i < 5; i++) {
      await writeFile(
        join(tmpDir, `src/test${i}.ts`),
        `export class TestClass {}`,
      );
    }

    const result = await findImportCandidatesTool.execute({
      root: tmpDir,
      symbolName: "TestClass",
      limit: 2,
    });

    expect(result).toContain("Found 5 import candidates");
    expect(result).toContain("... and 3 more candidates");

    // Should only show 2 candidates
    const matches = result.match(/TestClass \[Class\]/g) || [];
    expect(matches.length).toBe(2);
  });
});
