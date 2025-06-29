import { Node, type Project, type Symbol, ts } from "ts-morph";
import { err, ok, type Result } from "neverthrow";

export interface GetModuleSymbolsRequest {
  moduleName: string;
  filePath?: string; // Optional context file for resolving relative imports
}

export interface ModuleSymbol {
  name: string;
  kind: "type" | "interface" | "class" | "function" | "variable" | "other";
}

export interface GetModuleSymbolsSuccess {
  message: string;
  moduleName: string;
  symbols: {
    types: ModuleSymbol[];
    interfaces: ModuleSymbol[];
    classes: ModuleSymbol[];
    functions: ModuleSymbol[];
    variables: ModuleSymbol[];
    others: ModuleSymbol[];
  };
  totalSymbols: number;
}

/**
 * Get all exported symbols from a module without resolving their signatures
 */
export function getModuleSymbols(
  project: Project,
  request: GetModuleSymbolsRequest,
): Result<GetModuleSymbolsSuccess, string> {
  try {
    // For relative imports, ensure the source file is fresh
    if (request.moduleName.startsWith(".") && request.filePath) {
      const contextFile = project.getSourceFile(request.filePath);
      if (contextFile) {
        void contextFile.refreshFromFileSystem();
        contextFile.forgetDescendants();
      }

      // Also refresh the target module file
      const contextDir = request.filePath.substring(
        0,
        request.filePath.lastIndexOf("/"),
      );
      const modulePath = request.moduleName.replace(/^\.\//, "");
      const resolvedPath = contextDir + "/" + modulePath;
      const targetFile = project.getSourceFile(resolvedPath) ||
        project.getSourceFile(resolvedPath + ".ts");
      if (targetFile) {
        void targetFile.refreshFromFileSystem();
        targetFile.forgetDescendants();
      }
    }

    // Create a temporary source file that imports the module
    const importPath =
      `import * as moduleExports from "${request.moduleName}";`;

    const tempFileName = request.filePath
      ? request.filePath.replace(/\.[^.]+$/, "_temp_module_analysis.ts")
      : "temp_module_analysis.ts";

    let sourceFile;
    try {
      sourceFile = project.createSourceFile(
        tempFileName,
        importPath,
        { overwrite: true },
      );
    } catch (error) {
      return err(
        `Failed to create source file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Get the import declaration
    const importDecl = sourceFile.getImportDeclaration(request.moduleName);
    if (!importDecl) {
      sourceFile.delete();
      return err(`Failed to import module: ${request.moduleName}`);
    }

    const namespaceImport = importDecl.getNamespaceImport();
    if (!namespaceImport) {
      sourceFile.delete();
      return err(
        `Failed to get namespace import for module: ${request.moduleName}`,
      );
    }

    const symbol = namespaceImport.getSymbol();
    if (!symbol) {
      sourceFile.delete();
      return err(`Failed to get symbol for module: ${request.moduleName}`);
    }

    const aliasedSymbol = symbol.getAliasedSymbol();
    if (!aliasedSymbol) {
      sourceFile.delete();
      return err(
        `Module not found or cannot be resolved: ${request.moduleName}`,
      );
    }

    // Get all exports
    const exportSymbols = aliasedSymbol.getExports();

    // Check if the module actually exists by checking if it has any declarations
    const aliasedDeclarations = aliasedSymbol.getDeclarations();
    if (aliasedDeclarations.length === 0 && exportSymbols.length === 0) {
      // This is likely a non-existent module
      sourceFile.delete();
      return err(`Module not found or has no exports: ${request.moduleName}`);
    }

    // Categorize symbols
    const categorizedSymbols = {
      types: [] as ModuleSymbol[],
      interfaces: [] as ModuleSymbol[],
      classes: [] as ModuleSymbol[],
      functions: [] as ModuleSymbol[],
      variables: [] as ModuleSymbol[],
      others: [] as ModuleSymbol[],
    };

    let totalSymbols = 0;

    exportSymbols.forEach((exportSymbol) => {
      const exportName = exportSymbol.getName();
      const moduleSymbol = analyzeSymbol(exportName, exportSymbol);

      if (moduleSymbol) {
        totalSymbols++;
        switch (moduleSymbol.kind) {
          case "type":
            categorizedSymbols.types.push(moduleSymbol);
            break;
          case "interface":
            categorizedSymbols.interfaces.push(moduleSymbol);
            break;
          case "class":
            categorizedSymbols.classes.push(moduleSymbol);
            break;
          case "function":
            categorizedSymbols.functions.push(moduleSymbol);
            break;
          case "variable":
            categorizedSymbols.variables.push(moduleSymbol);
            break;
          default:
            categorizedSymbols.others.push(moduleSymbol);
        }
      }
    });

    // Clean up temporary file
    sourceFile.delete();

    return ok({
      message:
        `Found ${totalSymbols} symbols in module "${request.moduleName}"`,
      moduleName: request.moduleName,
      symbols: categorizedSymbols,
      totalSymbols,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Analyze a symbol and determine its kind
 */
function analyzeSymbol(name: string, symbol: Symbol): ModuleSymbol | null {
  // Handle aliased symbols (re-exports)
  const actualSymbol = symbol.getAliasedSymbol() || symbol;

  // Check symbol flags to determine the kind
  const compilerSymbol = actualSymbol.compilerSymbol;
  const flags = compilerSymbol.getFlags();

  if (flags) {
    if (flags & ts.SymbolFlags.TypeAlias) {
      return { name, kind: "type" };
    }
    if (flags & ts.SymbolFlags.Interface) {
      return { name, kind: "interface" };
    }
    if (flags & ts.SymbolFlags.Class) {
      return { name, kind: "class" };
    }
    if (flags & ts.SymbolFlags.Function) {
      return { name, kind: "function" };
    }
    if (
      flags & ts.SymbolFlags.Variable ||
      flags & ts.SymbolFlags.BlockScopedVariable
    ) {
      // Check if it's actually a function assigned to a variable
      const declarations = actualSymbol.getDeclarations();
      if (declarations.length > 0) {
        const type = actualSymbol.getTypeAtLocation(declarations[0]);
        if (type.getCallSignatures().length > 0) {
          return { name, kind: "function" };
        }
      }
      return { name, kind: "variable" };
    }
  }

  // If we can't determine the kind from flags, check declarations
  const declarations = actualSymbol.getDeclarations();
  if (declarations.length > 0) {
    const firstDecl = declarations[0];

    if (Node.isTypeAliasDeclaration(firstDecl)) {
      return { name, kind: "type" };
    }
    if (Node.isInterfaceDeclaration(firstDecl)) {
      return { name, kind: "interface" };
    }
    if (Node.isClassDeclaration(firstDecl)) {
      return { name, kind: "class" };
    }
    if (Node.isFunctionDeclaration(firstDecl)) {
      return { name, kind: "function" };
    }
    if (Node.isVariableDeclaration(firstDecl)) {
      // Check if it's a function
      const type = actualSymbol.getTypeAtLocation(firstDecl);
      if (type.getCallSignatures().length > 0) {
        return { name, kind: "function" };
      }
      return { name, kind: "variable" };
    }
    if (Node.isModuleDeclaration(firstDecl)) {
      // Could be a namespace that also exports a type
      const moduleSymbol = firstDecl.getSymbol();
      if (moduleSymbol) {
        const typeExport = moduleSymbol.getExport(name);
        if (typeExport) {
          const typeDeclarations = typeExport.getDeclarations();
          if (
            typeDeclarations.length > 0 &&
            Node.isTypeAliasDeclaration(typeDeclarations[0])
          ) {
            return { name, kind: "type" };
          }
        }
      }
    }
  }

  return { name, kind: "other" };
}

if (import.meta.vitest) {
  const { describe, expect, it } = await import("vitest");
  const { Project } = await import("ts-morph");

  describe("getModuleSymbols", () => {
    it("should get symbols from neverthrow module", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
          esModuleInterop: true,
          skipLibCheck: false,
        },
      });

      const result = getModuleSymbols(project, {
        moduleName: "neverthrow",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { symbols, totalSymbols } = result.value;

        // Check that we found symbols
        expect(totalSymbols).toBeGreaterThan(0);

        // Check specific symbols we know should exist
        const resultType = symbols.types.find((t) => t.name === "Result");
        expect(resultType).toBeDefined();

        const okClass = symbols.classes.find((c) => c.name === "Ok");
        expect(okClass).toBeDefined();

        const errClass = symbols.classes.find((c) => c.name === "Err");
        expect(errClass).toBeDefined();

        const okFunction = symbols.functions.find((f) => f.name === "ok");
        expect(okFunction).toBeDefined();

        const errFunction = symbols.functions.find((f) => f.name === "err");
        expect(errFunction).toBeDefined();
      }
    });

    it("should handle non-existent module", () => {
      const project = new Project();

      const result = getModuleSymbols(project, {
        moduleName: "non-existent-module-xyz",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain("Module not found");
      }
    });

    it("should categorize different symbol types correctly", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
        },
      });

      // Create a test module
      const testModule = project.createSourceFile(
        "test-module.ts",
        `
      export type MyType<T> = T | null;
      export interface MyInterface {
        prop: string;
        method(): void;
      }
      export class MyClass {
        constructor(public value: string) {}
        getValue(): string { return this.value; }
      }
      export function myFunction(x: number): string {
        return x.toString();
      }
      export const myVariable = 42;
      export const myObject = { key: "value" };
      export const myArrowFunction = (x: number) => x * 2;
      `,
      );

      // Create a file that imports from the test module
      const importFile = project.createSourceFile(
        "import-test.ts",
        `import * as testExports from "./test-module.ts";`,
      );

      const result = getModuleSymbols(project, {
        moduleName: "./test-module.ts",
        filePath: "import-test.ts",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { symbols } = result.value;

        // Check type
        expect(symbols.types).toHaveLength(1);
        expect(symbols.types[0].name).toBe("MyType");
        expect(symbols.types[0].kind).toBe("type");

        // Check interface
        expect(symbols.interfaces).toHaveLength(1);
        expect(symbols.interfaces[0].name).toBe("MyInterface");
        expect(symbols.interfaces[0].kind).toBe("interface");

        // Check class
        expect(symbols.classes).toHaveLength(1);
        expect(symbols.classes[0].name).toBe("MyClass");
        expect(symbols.classes[0].kind).toBe("class");

        // Check functions
        expect(symbols.functions.map((f) => f.name)).toContain("myFunction");
        expect(symbols.functions.map((f) => f.name)).toContain(
          "myArrowFunction",
        );

        // Check variables
        expect(symbols.variables.map((v) => v.name)).toContain("myVariable");
        expect(symbols.variables.map((v) => v.name)).toContain("myObject");
      }

      // Clean up
      testModule.delete();
      importFile.delete();
    });
  });
}
