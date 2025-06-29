import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LSMCP_PATH = path.join(__dirname, "../dist/lsmcp.js");

describe("lsmcp --include option", () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Create temporary directory
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-include-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Create a minimal tsconfig.json to make it a TypeScript project
    await fs.writeFile(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "es2020",
            module: "commonjs",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
          },
        },
        null,
        2,
      ),
    );
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function runLsmcp(
    args: string[],
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      const proc = spawn("node", [LSMCP_PATH, ...args], {
        cwd: tmpDir,
        env: {
          ...process.env,
        } as Record<string, string>,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({ stdout, stderr, code });
      });

      proc.on("error", () => {
        resolve({ stdout, stderr, code: -1 });
      });
    });
  }

  it("should get diagnostics for single file", async () => {
    // Skip test if lsmcp.js is not built
    try {
      await fs.access(LSMCP_PATH);
    } catch {
      console.log(
        "Skipping test: dist/lsmcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    // Create a TypeScript file with an error
    await fs.writeFile(
      path.join(tmpDir, "error.ts"),
      `
const x: number = "string"; // Type error
console.log(x);
`,
    );

    const result = await runLsmcp(["--include", "error.ts"]);

    expect(result.code).toBe(1); // Should exit with error code
    expect(result.stdout).toContain(
      "Type 'string' is not assignable to type 'number'",
    );
    expect(result.stdout).toContain("error.ts");
  });

  it("should get diagnostics for multiple files with pattern", async () => {
    // Skip test if lsmcp.js is not built
    try {
      await fs.access(LSMCP_PATH);
    } catch {
      console.log(
        "Skipping test: dist/lsmcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    // Create src directory
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });

    // Create files with errors
    await fs.writeFile(
      path.join(tmpDir, "src/file1.ts"),
      `
const a: string = 123; // Type error
`,
    );

    await fs.writeFile(
      path.join(tmpDir, "src/file2.ts"),
      `
function greet(name: string) {
  return "Hello, " + name;
}
greet(456); // Type error
`,
    );

    // Create a file without errors
    await fs.writeFile(
      path.join(tmpDir, "src/clean.ts"),
      `
export function add(a: number, b: number): number {
  return a + b;
}
`,
    );

    const result = await runLsmcp(["--include", "src/*.ts"]);

    expect(result.code).toBe(1); // Should exit with error code
    expect(result.stdout).toContain("Found 3 files matching pattern");
    expect(result.stdout).toContain("file1.ts");
    expect(result.stdout).toContain("file2.ts");
    expect(result.stdout).toContain(
      "Type 'number' is not assignable to type 'string'",
    );
    expect(result.stdout).toContain(
      "Argument of type 'number' is not assignable to parameter of type 'string'",
    );
  });

  it("should handle recursive pattern", async () => {
    // Skip test if lsmcp.js is not built
    try {
      await fs.access(LSMCP_PATH);
    } catch {
      console.log(
        "Skipping test: dist/lsmcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    // Create nested directories
    await fs.mkdir(path.join(tmpDir, "src/components"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "src/utils"), { recursive: true });

    // Create files in different directories
    await fs.writeFile(
      path.join(tmpDir, "src/index.ts"),
      `
const x: boolean = "false"; // Type error
`,
    );

    await fs.writeFile(
      path.join(tmpDir, "src/components/Button.ts"),
      `
export const Button = (label: number) => { // Intentional wrong type
  return label.toUpperCase(); // Error: toUpperCase doesn't exist on number
};
`,
    );

    await fs.writeFile(
      path.join(tmpDir, "src/utils/helper.ts"),
      `
export function identity<T>(value: T): T {
  return value;
}
`,
    );

    const result = await runLsmcp(["--include", "src/**/*.ts"]);

    expect(result.code).toBe(1); // Should exit with error code
    expect(result.stdout).toContain("Found 3 files matching pattern");
    expect(result.stdout).toContain(
      "Type 'string' is not assignable to type 'boolean'",
    );
    expect(result.stdout).toContain(
      "Property 'toUpperCase' does not exist on type 'number'",
    );
  });

  it("should exit with code 0 when no errors found", async () => {
    // Skip test if lsmcp.js is not built
    try {
      await fs.access(LSMCP_PATH);
    } catch {
      console.log(
        "Skipping test: dist/lsmcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    // Create a clean TypeScript file
    await fs.writeFile(
      path.join(tmpDir, "clean.ts"),
      `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
`,
    );

    const result = await runLsmcp(["--include", "clean.ts"]);

    expect(result.code).toBe(0); // Should exit successfully
    expect(result.stdout).toContain("No diagnostics found");
  });

  it("should handle pattern with no matches", async () => {
    // Skip test if lsmcp.js is not built
    try {
      await fs.access(LSMCP_PATH);
    } catch {
      console.log(
        "Skipping test: dist/lsmcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    const result = await runLsmcp(["--include", "nonexistent/**/*.ts"]);

    expect(result.code).toBe(1); // Should exit with error code
    expect(result.stderr).toContain("No files found matching pattern");
  });

  it("should only support TypeScript/JavaScript", async () => {
    // Skip test if lsmcp.js is not built
    try {
      await fs.access(LSMCP_PATH);
    } catch {
      console.log(
        "Skipping test: dist/lsmcp.js not found. Run 'pnpm build' first.",
      );
      return;
    }

    const result = await runLsmcp(["-l", "rust", "--include", "**/*.rs"]);

    expect(result.code).toBe(1); // Should exit with error code
    expect(result.stderr).toContain(
      "--include option is currently only supported for TypeScript/JavaScript",
    );
  });
});
