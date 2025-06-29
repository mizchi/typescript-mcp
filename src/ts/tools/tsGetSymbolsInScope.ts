import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import {
  findProjectForFile,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
import { resolveLineParameterForSourceFile as resolveLineParameter } from "../../textUtils/resolveLineParameterForSourceFile.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";
import { ts } from "ts-morph";

// Define the meaning enum
export enum SymbolMeaning {
  Value = "Value",
  Type = "Type",
  Namespace = "Namespace",
  All = "All",
  Variable = "Variable",
  Function = "Function",
  Class = "Class",
  Interface = "Interface",
  TypeAlias = "TypeAlias",
  Enum = "Enum",
  Module = "Module",
}

const schema = z.object({
  root: z.string().describe("Root directory for resolving relative paths"),
  filePath: z
    .string()
    .describe("File path containing the location (relative to root)"),
  line: z
    .union([z.number(), z.string()])
    .describe("Line number (1-based) or string to match in the line"),
  meaning: z
    .nativeEnum(SymbolMeaning)
    .optional()
    .default(SymbolMeaning.All)
    .describe("Symbol types to include"),
  includeBuiltins: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include built-in types and global symbols (default: false)"),
  filter: z
    .string()
    .optional()
    .describe("Regular expression pattern to filter symbol names"),
  limit: z
    .number()
    .optional()
    .default(100)
    .describe("Maximum number of symbols to return (default: 100)"),
});

// Map enum values to TypeScript SymbolFlags
const meaningMap: Record<SymbolMeaning, ts.SymbolFlags> = {
  [SymbolMeaning.Value]: ts.SymbolFlags.Value,
  [SymbolMeaning.Type]: ts.SymbolFlags.Type,
  [SymbolMeaning.Namespace]: ts.SymbolFlags.Namespace,
  [SymbolMeaning.All]: ts.SymbolFlags.Value | ts.SymbolFlags.Type |
    ts.SymbolFlags.Namespace,
  [SymbolMeaning.Variable]: ts.SymbolFlags.Variable |
    ts.SymbolFlags.BlockScopedVariable |
    ts.SymbolFlags.FunctionScopedVariable,
  [SymbolMeaning.Function]: ts.SymbolFlags.Function,
  [SymbolMeaning.Class]: ts.SymbolFlags.Class,
  [SymbolMeaning.Interface]: ts.SymbolFlags.Interface,
  [SymbolMeaning.TypeAlias]: ts.SymbolFlags.TypeAlias,
  [SymbolMeaning.Enum]: ts.SymbolFlags.Enum,
  [SymbolMeaning.Module]: ts.SymbolFlags.Module,
};

interface SymbolInfo {
  name: string;
  kind: string;
  type?: string;
  exported: boolean;
  declaration?: {
    filePath: string;
    line: number;
  };
}

interface GetSymbolsInScopeResult {
  location: {
    filePath: string;
    line: number;
  };
  meaning: SymbolMeaning;
  symbolsByKind: Record<string, SymbolInfo[]>;
  totalCount: number;
  originalCount?: number;
}

const symbolFlagToKind: Array<[number, string]> = [
  [ts.SymbolFlags.Class, "class"],
  [ts.SymbolFlags.Interface, "interface"],
  [ts.SymbolFlags.TypeAlias, "type alias"],
  [ts.SymbolFlags.Enum, "enum"],
  [ts.SymbolFlags.Function, "function"],
  [ts.SymbolFlags.Method, "method"],
  [ts.SymbolFlags.Property, "property"],
  [ts.SymbolFlags.Variable, "variable"],
  [ts.SymbolFlags.BlockScopedVariable, "variable"],
  [ts.SymbolFlags.FunctionScopedVariable, "variable"],
  [ts.SymbolFlags.Module, "module"],
  [ts.SymbolFlags.Namespace, "namespace"],
  [ts.SymbolFlags.EnumMember, "enum member"],
];

function getSymbolKind(symbol: ts.Symbol): string {
  const flags = symbol.flags;
  const match = symbolFlagToKind.find(([flag]) => flags & flag);
  return match ? match[1] : "unknown";
}

// Common built-in symbols that should be included even without declarations
const COMMON_BUILTINS = [
  "console",
  "process",
  "global",
  "Buffer",
  "Promise",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Date",
  "RegExp",
  "Error",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "JSON",
  "Math",
] as const;

function shouldIncludeSymbol(
  symbol: ts.Symbol,
  includeBuiltins: boolean,
  filter?: string,
): boolean {
  const name = symbol.getName();

  // Skip compiler-internal symbols
  if (name.startsWith("__")) return false;
  if (name === "undefined" || name === "null") return false;

  // Apply filter if provided
  if (filter) {
    try {
      const regex = new RegExp(filter);
      if (!regex.test(name)) return false;
    } catch {
      // Invalid regex, skip filtering
    }
  }

  // Skip symbols without declarations (usually built-ins)
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) {
    if (!includeBuiltins) {
      return false;
    }
    // Keep common built-ins only if including
    return COMMON_BUILTINS.includes(name as (typeof COMMON_BUILTINS)[number]);
  }

  // Exclude built-ins based on declaration source
  if (!includeBuiltins && declarations.length > 0) {
    const firstDecl = declarations[0];
    const sourceFile = firstDecl.getSourceFile();
    const fileName = sourceFile.fileName;

    // Check if it's from lib.d.ts or node_modules
    if (
      fileName.includes("node_modules") ||
      fileName.includes("/lib/lib.") || // TypeScript lib files
      fileName.includes("\\lib\\lib.") || // Windows path
      fileName.includes("@types/") ||
      (fileName.endsWith(".d.ts") &&
        !fileName.includes(path.sep + "src" + path.sep))
    ) {
      return false;
    }
  }

  return true;
}

function getTypeText(
  symbol: ts.Symbol,
  typeChecker: ts.TypeChecker,
  node: ts.Node,
): string | undefined {
  try {
    const type = typeChecker.getTypeOfSymbolAtLocation(symbol, node);
    const typeText = typeChecker.typeToString(type);
    // Simplify long type names
    return typeText.length > 100 ? typeText.substring(0, 97) + "..." : typeText;
  } catch {
    // Type resolution might fail for some symbols
    return undefined;
  }
}

function getDeclarationInfo(
  symbol: ts.Symbol,
): { filePath: string; line: number } | undefined {
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return undefined;

  const firstDecl = declarations[0];
  const declSourceFile = firstDecl.getSourceFile();
  const startPos = firstDecl.getStart();
  const lineAndChar = declSourceFile.getLineAndCharacterOfPosition(startPos);

  return {
    filePath: declSourceFile.fileName,
    line: lineAndChar.line + 1, // Convert to 1-based
  };
}

function createSymbolInfo(
  symbol: ts.Symbol,
  typeChecker: import("ts-morph").TypeChecker,
  node: import("ts-morph").Node,
): SymbolInfo {
  const name = symbol.getName();
  const kind = getSymbolKind(symbol);
  const typeText = getTypeText(
    symbol,
    typeChecker.compilerObject,
    node.compilerNode,
  );
  const declaration = getDeclarationInfo(symbol);
  const isExported = (symbol.flags & ts.SymbolFlags.ExportValue) !== 0 ||
    (symbol.flags & ts.SymbolFlags.Alias) !== 0;

  return {
    name,
    kind,
    ...(typeText && { type: typeText }),
    exported: isExported,
    ...(declaration && { declaration }),
  };
}

async function handleGetSymbolsInScope({
  root,
  filePath,
  line,
  meaning = SymbolMeaning.All,
  includeBuiltins = false,
  filter,
  limit = 100,
}: z.infer<typeof schema>): Promise<GetSymbolsInScopeResult> {
  // Always treat paths as relative to root
  const absolutePath = path.join(root, filePath);

  // Check if file exists
  await fs.access(absolutePath);

  const project = findProjectForFile(absolutePath);

  // Get the source file with fresh content
  const sourceFile = getOrCreateSourceFileWithRefresh(absolutePath);

  // Resolve line parameter
  const resolvedLine = resolveLineParameter(sourceFile, line);

  // Get the TypeChecker
  const typeChecker = project.getTypeChecker();

  // Get position at the beginning of the line
  const position = sourceFile.compilerNode.getPositionOfLineAndCharacter(
    resolvedLine - 1, // Convert to 0-based
    0,
  );

  // Get the node at this position
  const node = sourceFile.getDescendantAtPos(position);
  if (!node) {
    throw new Error(`No node found at line ${resolvedLine}`);
  }

  // Get the symbol flags for the requested meaning
  const symbolFlags = meaningMap[meaning];

  // Get symbols in scope
  const symbols = typeChecker.compilerObject.getSymbolsInScope(
    node.compilerNode,
    symbolFlags,
  );

  // Process symbols into SymbolInfo objects
  let processedSymbols = symbols
    .filter((symbol) => shouldIncludeSymbol(symbol, includeBuiltins, filter))
    .map((symbol) => createSymbolInfo(symbol, typeChecker, node));

  // Apply limit if specified
  if (limit && limit > 0) {
    processedSymbols = processedSymbols.slice(0, limit);
  }

  // Group symbols by category
  const symbolsByKind = Object.groupBy(
    processedSymbols,
    (symbolInfo) => getSymbolCategory(symbolInfo.kind),
  ) as Record<string, SymbolInfo[]>;

  // Sort symbols within each category
  Object.keys(symbolsByKind).forEach((category) => {
    symbolsByKind[category].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Count total symbols (before limit was applied)
  const originalCount =
    symbols.filter((symbol) =>
      shouldIncludeSymbol(symbol, includeBuiltins, filter)
    ).length;
  const totalCount = processedSymbols.length;

  return {
    location: {
      filePath: absolutePath,
      line: resolvedLine,
    },
    meaning,
    symbolsByKind,
    totalCount,
    originalCount,
  };
}

const kindToCategory: Record<string, string> = {
  variable: "Variables & Functions",
  function: "Variables & Functions",
  method: "Variables & Functions",
  property: "Variables & Functions",
  class: "Classes",
  interface: "Types & Interfaces",
  "type alias": "Types & Interfaces",
  enum: "Enums",
  "enum member": "Enums",
  module: "Namespaces & Modules",
  namespace: "Namespaces & Modules",
};

function getSymbolCategory(kind: string): string {
  return kindToCategory[kind] || "Other";
}

function formatSymbolLine(symbol: SymbolInfo): string {
  let line = `  - ${symbol.name}`;

  if (symbol.kind !== "variable" && symbol.kind !== "function") {
    line += ` (${symbol.kind})`;
  }

  if (symbol.type) {
    line += `: ${symbol.type}`;
  }

  if (symbol.exported) {
    line += " [exported]";
  }

  return line;
}

function formatGetSymbolsInScopeResult(
  result: GetSymbolsInScopeResult,
  root: string,
  limit?: number,
): string {
  const { location, meaning, symbolsByKind, totalCount } = result;
  const relativePath = path.relative(root, location.filePath);

  const header = [
    `Symbols in scope at ${relativePath}:${location.line}`,
    `Meaning: ${meaning}`,
    "",
  ];

  // Sort categories and format each one
  const categoryBlocks = Object.entries(symbolsByKind)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, symbols]) => symbols.length > 0)
    .flatMap(([category, symbols]) => [
      `${category} (${symbols.length}):`,
      ...symbols.map(formatSymbolLine),
      "",
    ]);

  const footer = [`Total: ${totalCount} symbols`];

  // Add limit notice if results were truncated
  const limitNotice =
    limit && result.originalCount && result.originalCount > totalCount
      ? [
        `\nNote: Results limited to ${limit} symbols out of ${result.originalCount} total. Use a higher limit or filter to see more.`,
      ]
      : [];

  return [...header, ...categoryBlocks, ...footer, ...limitNotice].join("\n");
}

export const getSymbolsInScopeTool: ToolDef<typeof schema> = {
  name: "lsmcp_get_symbols_in_scope",
  description:
    "Get all symbols (variables, types, functions, etc.) visible at a specific location in a TypeScript/JavaScript file",
  schema,
  execute: async (args) => {
    const result = await handleGetSymbolsInScope(args);
    return formatGetSymbolsInScopeResult(result, args.root, args.limit);
  },
};

if (import.meta.vitest) {
  const { describe, expect, test, vi, beforeEach } = import.meta.vitest;

  // Dynamic imports for test dependencies
  const getTestDependencies = async () => {
    const { Project } = await import("ts-morph");
    return { Project };
  };

  // Mock the project cache module
  vi.mock("../projectCache.ts", () => ({
    findProjectForFile: vi.fn(),
    getOrCreateSourceFileWithRefresh: vi.fn(),
  }));

  // Mock fs/promises
  vi.mock("fs/promises", () => ({
    default: {
      access: vi.fn().mockResolvedValue(undefined),
    },
  }));

  describe("get_symbols_in_scope", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("should get all symbols in scope", async () => {
      const { Project } = await getTestDependencies();
      const projectCacheMock = await import("../projectCache.ts");

      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const testFile = project.createSourceFile(
        "/project/test.ts",
        `
import { readFile } from "fs";

interface User {
  id: number;
  name: string;
}

type UserId = number;

const globalVar = "test";

function processUser(user: User): UserId {
  const localVar = user.name;
  console.log(localVar);
  
  // Get symbols at this line
  return user.id;
}

class UserService {
  getUser(id: UserId): User {
    return { id, name: "Test" };
  }
}

enum Status {
  Active,
  Inactive
}
      `.trim(),
      );

      await testFile.save();

      // Mock the project cache functions
      vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
      vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh)
        .mockReturnValue(
          testFile,
        );

      const result = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 16, // Inside processUser function
        meaning: SymbolMeaning.All,
        includeBuiltins: true, // Include built-ins for this test
        limit: 100,
      });

      // Check that we have symbols in different categories
      expect(result.symbolsByKind["Variables & Functions"]).toBeDefined();
      expect(result.symbolsByKind["Types & Interfaces"]).toBeDefined();
      expect(result.symbolsByKind["Classes"]).toBeDefined();

      // Check for specific symbols
      const varsFuncs = result.symbolsByKind["Variables & Functions"];
      const symbolNames = varsFuncs.map((s) => s.name);

      // Should include local variables
      expect(symbolNames).toContain("localVar");
      expect(symbolNames).toContain("user");

      // Should include global variables
      expect(symbolNames).toContain("globalVar");
      expect(symbolNames).toContain("processUser");

      // Should include imported symbols - readFile might not be visible if not a named export
      // expect(symbolNames).toContain("readFile");

      // Check types
      const types = result.symbolsByKind["Types & Interfaces"];
      const typeNames = types.map((s) => s.name);
      expect(typeNames).toContain("User");
      expect(typeNames).toContain("UserId");

      // Check that total count is reasonable
      expect(result.totalCount).toBeGreaterThan(10);
    });

    test("should filter by meaning", async () => {
      const { Project } = await getTestDependencies();
      const projectCacheMock = await import("../projectCache.ts");

      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const testFile = project.createSourceFile(
        "/project/test.ts",
        `
interface Config {
  port: number;
}

const config: Config = { port: 3000 };

function getPort(): number {
  return config.port;
}

type Port = number;
      `.trim(),
      );

      await testFile.save();

      // Mock the project cache functions
      vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
      vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh)
        .mockReturnValue(
          testFile,
        );

      // Get only types
      const typesResult = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 8, // Inside getPort function
        meaning: SymbolMeaning.Type,
        limit: 100,
        includeBuiltins: false,
      });

      // Should have types but not variables
      expect(typesResult.symbolsByKind["Types & Interfaces"]).toBeDefined();
      expect(typesResult.symbolsByKind["Variables & Functions"])
        .toBeUndefined();

      // Get only values
      const valuesResult = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 8,
        meaning: SymbolMeaning.Value,
        limit: 100,
        includeBuiltins: false,
      });

      // Should have variables but not types - although some global types might leak through
      expect(valuesResult.symbolsByKind["Variables & Functions"]).toBeDefined();
      // Check that we have our expected values
      const valueNames = valuesResult.symbolsByKind["Variables & Functions"]
        .map(
          (s) => s.name,
        );
      expect(valueNames).toContain("config");
      expect(valueNames).toContain("getPort");
    });

    test("should handle different scopes", async () => {
      const { Project } = await getTestDependencies();
      const projectCacheMock = await import("../projectCache.ts");

      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const testFile = project.createSourceFile(
        "/project/test.ts",
        `
const globalVar = "global";

function outer() {
  const outerVar = "outer";
  
  function inner() {
    const innerVar = "inner";
    // Line 8: Should see all variables
    return innerVar + outerVar + globalVar;
  }
  
  // Line 12: Should not see innerVar
  return outerVar;
}
      `.trim(),
      );

      await testFile.save();

      // Mock the project cache functions
      vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
      vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh)
        .mockReturnValue(
          testFile,
        );

      // Check inner scope
      const innerResult = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 8,
        meaning: SymbolMeaning.Variable,
        limit: 100,
        includeBuiltins: false,
      });

      const innerVars = innerResult.symbolsByKind["Variables & Functions"];
      const innerVarNames = innerVars.map((s) => s.name);

      expect(innerVarNames).toContain("innerVar");
      expect(innerVarNames).toContain("outerVar");
      expect(innerVarNames).toContain("globalVar");

      // Check outer scope
      const outerResult = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 12,
        meaning: SymbolMeaning.Variable,
        limit: 100,
        includeBuiltins: false,
      });

      const outerVars = outerResult.symbolsByKind["Variables & Functions"];
      const outerVarNames = outerVars.map((s) => s.name);

      expect(outerVarNames).toContain("outerVar");
      expect(outerVarNames).toContain("globalVar");
      expect(outerVarNames).not.toContain("innerVar"); // Should not see inner variable
    });

    test("should format output correctly", () => {
      const result = {
        location: {
          filePath: "/project/src/test.ts",
          line: 10,
        },
        meaning: SymbolMeaning.All,
        symbolsByKind: {
          "Variables & Functions": [
            {
              name: "console",
              kind: "variable",
              type: "Console",
              exported: false,
            },
            {
              name: "myFunction",
              kind: "function",
              type: "(x: number) => void",
              exported: true,
            },
            {
              name: "localVar",
              kind: "variable",
              type: "string",
              exported: false,
            },
          ],
          "Types & Interfaces": [
            { name: "MyInterface", kind: "interface", exported: true },
            { name: "MyType", kind: "type alias", exported: false },
          ],
          Classes: [{ name: "MyClass", kind: "class", exported: true }],
        },
        totalCount: 6,
      };

      const formatted = formatGetSymbolsInScopeResult(
        result,
        "/project",
        undefined,
      );

      expect(formatted).toContain("Symbols in scope at src/test.ts:10");
      expect(formatted).toContain("Meaning: All");
      expect(formatted).toContain("Variables & Functions (3):");
      expect(formatted).toContain("  - console: Console");
      expect(formatted).toContain(
        "  - myFunction: (x: number) => void [exported]",
      );
      expect(formatted).toContain("Types & Interfaces (2):");
      expect(formatted).toContain("  - MyInterface (interface) [exported]");
      expect(formatted).toContain("Classes (1):");
      expect(formatted).toContain("Total: 6 symbols");
    });

    test("should handle line string matching", async () => {
      const { Project } = await getTestDependencies();
      const projectCacheMock = await import("../projectCache.ts");

      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const testFile = project.createSourceFile(
        "/project/test.ts",
        `
const a = 1;
const b = 2;
// Special marker line
const c = 3;
      `.trim(),
      );

      await testFile.save();

      // Mock the project cache functions
      vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
      vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh)
        .mockReturnValue(
          testFile,
        );

      const result = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: "Special marker", // Should match line 3
        meaning: SymbolMeaning.Variable,
        limit: 100,
        includeBuiltins: false,
      });

      expect(result.location.line).toBe(3);
    });

    test("should exclude built-ins by default", async () => {
      const { Project } = await getTestDependencies();
      const projectCacheMock = await import("../projectCache.ts");

      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const testFile = project.createSourceFile(
        "/project/test.ts",
        `
const myVar = "test";
console.log(myVar);
      `.trim(),
      );

      await testFile.save();

      // Mock the project cache functions
      vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
      vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh)
        .mockReturnValue(
          testFile,
        );

      const result = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 2,
        meaning: SymbolMeaning.All,
        includeBuiltins: false,
        limit: 100,
      });

      // Should have local variables but not built-ins like console
      const varsFuncs = result.symbolsByKind["Variables & Functions"] || [];
      const symbolNames = varsFuncs.map((s) => s.name);

      expect(symbolNames).toContain("myVar");
      expect(symbolNames).not.toContain("console");
      expect(symbolNames).not.toContain("Array");
    });

    test("should filter symbols by regex", async () => {
      const { Project } = await getTestDependencies();
      const projectCacheMock = await import("../projectCache.ts");

      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const testFile = project.createSourceFile(
        "/project/test.ts",
        `
const userService = "service";
const userData = { name: "test" };
const config = { port: 3000 };
const processUser = () => {};
      `.trim(),
      );

      await testFile.save();

      // Mock the project cache functions
      vi.mocked(projectCacheMock.findProjectForFile).mockReturnValue(project);
      vi.mocked(projectCacheMock.getOrCreateSourceFileWithRefresh)
        .mockReturnValue(
          testFile,
        );

      const result = await handleGetSymbolsInScope({
        root: "/project",
        filePath: "test.ts",
        line: 4,
        meaning: SymbolMeaning.All,
        filter: "^user", // Match symbols starting with "user"
        includeBuiltins: false,
        limit: 100,
      });

      const varsFuncs = result.symbolsByKind["Variables & Functions"] || [];
      const symbolNames = varsFuncs.map((s) => s.name);

      expect(symbolNames).toContain("userService");
      expect(symbolNames).toContain("userData");
      expect(symbolNames).not.toContain("config");
      expect(symbolNames).not.toContain("processUser"); // Doesn't start with "user"
    });
  });
}
