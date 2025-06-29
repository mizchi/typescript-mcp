import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../lspClient.ts";
import { lspGetSignatureHelpTool } from "./lspGetSignatureHelp.ts";
import { randomBytes } from "crypto";

describe("lspGetSignatureHelpTool", () => {
  let lspProcess: ChildProcess;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP signature help tests: LSP_COMMAND not set");
      return;
    }

    // Create temporary directory
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(__dirname, `tmp-lsp-sig-help-${hash}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Start TypeScript language server
    const [command, ...args] = process.env.LSP_COMMAND.split(" ");
    lspProcess = spawn(command, args, {
      cwd: tmpDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Initialize LSP client
    await initializeLSPClient(tmpDir, lspProcess, "typescript");
  });

  afterAll(async () => {
    // Cleanup
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    if (lspProcess) {
      await shutdownLSPClient();
      lspProcess.kill();
    }
  });

  it("should get signature help for function calls", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
function greet(name: string, age: number): string {
  return \`Hello \${name}, you are \${age} years old\`;
}

greet("John", 30);
`;
    const filePath = "greet.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: 'greet("John"',
      target: "greet",
    });

    expect(result).toContain("Signature help at");
    expect(result).toContain("greet(name: string, age: number): string");
    expect(result).toContain("Parameters:");
    expect(result).toContain("name: string");
    expect(result).toContain("age: number");
  });

  it("should show active parameter", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
function calculate(a: number, b: number, operation: string): number {
  return 0;
}

calculate(5, 10, "add");
`;
    const filePath = "calculate.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    // Position cursor after first argument
    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: "calculate(5,",
      target: "calculate(5,",
    });

    expect(result).toContain(
      "calculate(a: number, b: number, operation: string): number",
    );
    expect(result).toContain("→"); // Active parameter indicator
  });

  it("should handle methods with overloads", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
interface Calculator {
  add(a: number, b: number): number;
  add(a: string, b: string): string;
}

declare const calc: Calculator;
calc.add(1, 2);
`;
    const filePath = "overloads.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: "calc.add(1,",
      target: "add",
    });

    expect(result).toContain("add(a: number, b: number): number");
    // Should indicate multiple signatures
    expect(result).toMatch(/Signature \d of \d/);
  });

  it("should handle array methods", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
const numbers = [1, 2, 3, 4, 5];
numbers.map(x => x * 2);
`;
    const filePath = "array-methods.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: "numbers.map(",
      target: "map",
    });

    expect(result).toContain("map");
    expect(result).toContain("callbackfn");
  });

  it("should show no signature help when not in function call", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
const x = 42;
const y = x + 10;
`;
    const filePath = "no-function.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: 2,
    });

    expect(result).toContain("No signature help available");
  });

  it("should work with line number", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
function processData(
  data: string[],
  options?: { filter?: boolean; sort?: boolean }
): string[] {
  return data;
}

processData(["a", "b"], { filter: true });
`;
    const filePath = "process-data.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: 9, // Line with processData call
      target: "processData",
    });

    expect(result).toContain("processData");
    expect(result).toContain("data: string[]");
    expect(result).toContain("options?:");
  });

  it("should handle constructor calls", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const testFile = `
class Person {
  constructor(public name: string, public age: number) {}
}

const person = new Person("Alice", 25);
`;
    const filePath = "constructor.ts";
    await fs.writeFile(path.join(tmpDir, filePath), testFile);

    const result = await lspGetSignatureHelpTool.execute({
      root: tmpDir,
      filePath,
      line: 'new Person("Alice"',
      target: "Person",
    });

    expect(result).toContain("Person(name: string, age: number)");
    expect(result).toContain("name: string");
    expect(result).toContain("age: number");
  });
});
