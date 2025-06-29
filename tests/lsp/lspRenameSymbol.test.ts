import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";
import { lspRenameSymbolTool } from "../../src/lsp/tools/lspRenameSymbol.ts";
import { ChildProcess, spawn } from "child_process";
import {
  initialize as initializeLSPClient,
  shutdown as shutdownLSPClient,
} from "../../src/lsp/lspClient.ts";

const FIXTURES_DIR = path.join(__dirname, "../fixtures/lsp-rename");

describe("lspRenameSymbol - multi-file rename", () => {
  let lspProcess: ChildProcess;
  let tmpDir: string;

  beforeAll(async () => {
    // Skip test if LSP_COMMAND is not set
    if (!process.env.LSP_COMMAND) {
      console.log("Skipping LSP rename tests: LSP_COMMAND not set");
      return;
    }

    // Create temporary directory with random hash
    const hash = randomBytes(8).toString("hex");
    tmpDir = path.join(FIXTURES_DIR, `tmp-${hash}`);
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

  it("should rename a function across multiple files", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create test files
    const mathFile = path.join(tmpDir, "math.ts");
    const mainFile = path.join(tmpDir, "main.ts");
    const utilFile = path.join(tmpDir, "util.ts");

    await fs.writeFile(
      mathFile,
      `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`,
    );

    await fs.writeFile(
      mainFile,
      `import { add, subtract } from './math';

const result1 = add(5, 3);
const result2 = subtract(10, 4);

console.log('Addition:', result1);
console.log('Subtraction:', result2);

// Use add in a callback
[1, 2, 3].reduce((acc, val) => add(acc, val), 0);
`,
    );

    await fs.writeFile(
      utilFile,
      `import { add } from './math';

export function doubleAdd(a: number, b: number): number {
  return add(add(a, b), add(a, b));
}

export function testAdd() {
  return add(1, 2) === 3;
}
`,
    );

    // Wait for LSP to index the files
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Rename 'add' to 'sum' in math.ts
    const result = await lspRenameSymbolTool.execute({
      root: tmpDir,
      filePath: "math.ts",
      line: 1,
      target: "add",
      newName: "sum",
    });

    expect(result).toContain("Successfully renamed symbol");
    expect(result).toContain("3 file(s)"); // Should update math.ts, main.ts, and util.ts

    // Verify the changes
    const mathContent = await fs.readFile(mathFile, "utf-8");
    const mainContent = await fs.readFile(mainFile, "utf-8");
    const utilContent = await fs.readFile(utilFile, "utf-8");

    // Check math.ts
    expect(mathContent).toContain("export function sum(");
    expect(mathContent).not.toContain("export function add(");

    // Check main.ts
    expect(mainContent).toContain("import { sum, subtract }");
    expect(mainContent).toContain("const result1 = sum(5, 3)");
    expect(mainContent).toContain("sum(acc, val)");
    expect(mainContent).not.toContain("add(5, 3)");
    expect(mainContent).not.toContain("add(acc, val)");

    // Check util.ts
    expect(utilContent).toContain("import { sum }");
    expect(utilContent).toContain("sum(sum(a, b), sum(a, b))");
    expect(utilContent).toContain("return sum(1, 2) === 3");
    expect(utilContent).not.toContain("add(a, b)");
    expect(utilContent).not.toContain("add(1, 2)");
  });

  it("should rename a class and its usages", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create test files
    const userFile = path.join(tmpDir, "user.ts");
    const serviceFile = path.join(tmpDir, "service.ts");
    const testFile = path.join(tmpDir, "test.ts");

    await fs.writeFile(
      userFile,
      `export class User {
  constructor(
    public id: number,
    public name: string,
    public email: string
  ) {}

  getDisplayName(): string {
    return this.name;
  }
}

export type UserData = {
  id: number;
  name: string;
  email: string;
};
`,
    );

    await fs.writeFile(
      serviceFile,
      `import { User, UserData } from './user';

export class UserService {
  private users: User[] = [];

  addUser(data: UserData): User {
    const user = new User(data.id, data.name, data.email);
    this.users.push(user);
    return user;
  }

  findUser(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }
}
`,
    );

    await fs.writeFile(
      testFile,
      `import { User } from './user';
import { UserService } from './service';

describe('User tests', () => {
  it('should create a user', () => {
    const user = new User(1, 'John', 'john@example.com');
    expect(user.getDisplayName()).toBe('John');
  });

  it('should work with UserService', () => {
    const service = new UserService();
    const user: User = service.addUser({
      id: 1,
      name: 'Jane',
      email: 'jane@example.com'
    });
    expect(user).toBeInstanceOf(User);
  });
});
`,
    );

    // Wait for LSP to index the files
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Rename 'User' to 'Person' in user.ts
    const result = await lspRenameSymbolTool.execute({
      root: tmpDir,
      filePath: "user.ts",
      line: 1,
      target: "User",
      newName: "Person",
    });

    expect(result).toContain("Successfully renamed symbol");
    expect(result).toContain("3 file(s)");

    // Verify the changes
    const userContent = await fs.readFile(userFile, "utf-8");
    const serviceContent = await fs.readFile(serviceFile, "utf-8");
    const testContent = await fs.readFile(testFile, "utf-8");

    // Check user.ts
    expect(userContent).toContain("export class Person {");
    expect(userContent).not.toContain("export class User {");

    // Check service.ts
    expect(serviceContent).toContain("import { Person, UserData }");
    expect(serviceContent).toContain("private users: Person[]");
    expect(serviceContent).toContain("new Person(");
    expect(serviceContent).toContain(
      "findUser(id: number): Person | undefined",
    );

    // Check test.ts
    expect(testContent).toContain("import { Person }");
    expect(testContent).toContain("const user = new Person(");
    expect(testContent).toContain("const user: Person = ");
    expect(testContent).toContain("expect(user).toBeInstanceOf(Person)");
  });

  it("should rename an interface across multiple files", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create test files
    const typesFile = path.join(tmpDir, "types.ts");
    const apiFile = path.join(tmpDir, "api.ts");
    const componentFile = path.join(tmpDir, "component.ts");

    await fs.writeFile(
      typesFile,
      `export interface Config {
  apiUrl: string;
  timeout: number;
  retries: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  config: Config;
}
`,
    );

    await fs.writeFile(
      apiFile,
      `import { Config, ApiResponse } from './types';

export class ApiClient {
  constructor(private config: Config) {}

  async get<T>(path: string): Promise<ApiResponse<T>> {
    // Simulated API call
    return {
      data: {} as T,
      status: 200,
      config: this.config
    };
  }

  updateConfig(newConfig: Partial<Config>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export function createDefaultConfig(): Config {
  return {
    apiUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3
  };
}
`,
    );

    await fs.writeFile(
      componentFile,
      `import { Config } from './types';
import { ApiClient, createDefaultConfig } from './api';

export class Component {
  private client: ApiClient;
  private config: Config;

  constructor(config?: Partial<Config>) {
    this.config = { ...createDefaultConfig(), ...config };
    this.client = new ApiClient(this.config);
  }

  getConfig(): Config {
    return this.config;
  }
}
`,
    );

    // Wait for LSP to index the files
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Rename 'Config' to 'Configuration' in types.ts
    const result = await lspRenameSymbolTool.execute({
      root: tmpDir,
      filePath: "types.ts",
      line: 1,
      target: "Config",
      newName: "Configuration",
    });

    expect(result).toContain("Successfully renamed symbol");
    expect(result).toContain("3 file(s)");

    // Verify the changes
    const typesContent = await fs.readFile(typesFile, "utf-8");
    const apiContent = await fs.readFile(apiFile, "utf-8");
    const componentContent = await fs.readFile(componentFile, "utf-8");

    // Check types.ts
    expect(typesContent).toContain("export interface Configuration {");
    expect(typesContent).toContain("config: Configuration;");
    expect(typesContent).not.toContain("export interface Config {");

    // Check api.ts
    expect(apiContent).toContain("import { Configuration, ApiResponse }");
    expect(apiContent).toContain("constructor(private config: Configuration)");
    expect(apiContent).toContain(
      "updateConfig(newConfig: Partial<Configuration>)",
    );
    expect(apiContent).toContain(
      "function createDefaultConfig(): Configuration",
    );

    // Check component.ts
    expect(componentContent).toContain("import { Configuration }");
    expect(componentContent).toContain("private config: Configuration;");
    expect(componentContent).toContain(
      "constructor(config?: Partial<Configuration>)",
    );
    expect(componentContent).toContain("getConfig(): Configuration");
  });

  it("should handle rename without line parameter", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    // Create test files
    const libFile = path.join(tmpDir, "lib.ts");
    const appFile = path.join(tmpDir, "app.ts");

    await fs.writeFile(
      libFile,
      `export function processData(input: string): string {
  return input.toUpperCase();
}

export function validateData(input: string): boolean {
  return input.length > 0;
}
`,
    );

    await fs.writeFile(
      appFile,
      `import { processData, validateData } from './lib';

function main() {
  const input = 'hello world';
  
  if (validateData(input)) {
    const result = processData(input);
    console.log('Processed:', result);
  }
}

main();
`,
    );

    // Wait for LSP to index the files
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Rename 'processData' without specifying line
    const result = await lspRenameSymbolTool.execute({
      root: tmpDir,
      filePath: "lib.ts",
      target: "processData",
      newName: "transformData",
    });

    expect(result).toContain("Successfully renamed symbol");
    expect(result).toContain("2 file(s)");

    // Verify the changes
    const libContent = await fs.readFile(libFile, "utf-8");
    const appContent = await fs.readFile(appFile, "utf-8");

    // Check lib.ts
    expect(libContent).toContain("export function transformData(");
    expect(libContent).not.toContain("processData");

    // Check app.ts
    expect(appContent).toContain("import { transformData, validateData }");
    expect(appContent).toContain("const result = transformData(input)");
    expect(appContent).not.toContain("processData");
  });

  it("should handle errors gracefully", async () => {
    if (!process.env.LSP_COMMAND) {
      return;
    }

    const dummyFile = path.join(tmpDir, "dummy.ts");
    await fs.writeFile(dummyFile, "const x = 42;");

    // Wait for LSP to index the file
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Try to rename a non-existent symbol
    await expect(
      lspRenameSymbolTool.execute({
        root: tmpDir,
        filePath: "dummy.ts",
        line: 1,
        target: "nonExistentSymbol",
        newName: "newName",
      }),
    ).rejects.toThrow(/Symbol "nonExistentSymbol" not found/);

    // Try to rename in a non-existent file
    await expect(
      lspRenameSymbolTool.execute({
        root: tmpDir,
        filePath: "nonexistent.ts",
        target: "x",
        newName: "y",
      }),
    ).rejects.toThrow();
  });
});
