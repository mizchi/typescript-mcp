// FIXME later
import {
  Node,
  type Project,
  type SourceFile,
  type Symbol,
  ts,
  type Type,
} from "ts-morph";
import { err, ok, type Result } from "neverthrow";

export interface GetTypeSignatureRequest {
  moduleName: string;
  typeName: string;
  filePath?: string; // Optional context file for resolving relative imports
}

export interface Definition {
  filePath: string;
  line: number;
  column: number;
  kind: string; // e.g., "Type alias", "Interface", "Class", etc.
  name?: string; // The name at this definition location
  originalName?: string; // For aliases, the name of the original definition
  importedFrom?: string; // Module path if this is an imported type
}

export interface TypeSignature {
  kind: "function" | "class" | "interface" | "type" | "variable";
  // For functions
  functionSignatures?: FunctionSignature[];
  // For types/interfaces/classes
  typeDefinition?: string;
  properties?: PropertyInfo[];
  methods?: MethodInfo[];
  // Common
  typeParameters?: string[];
  definitions?: Definition[];
}

export interface FunctionSignature {
  parameters: ParameterInfo[];
  returnType: string;
  typeParameters?: string[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
}

export interface MethodInfo {
  name: string;
  signatures: FunctionSignature[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

export interface GetTypeSignatureSuccess {
  message: string;
  typeName: string;
  signature: TypeSignature;
  documentation?: string;
  relatedTypes?: Definition[]; // Related types found in the signature
}

/**
 * Helper function to simplify type names by removing import paths
 */
function simplifyTypeName(typeName: string): string {
  // Remove import("...") wrapper and get just the type name
  return typeName.replace(/import\("[^"]+"\)\./g, "");
}

/**
 * Find related types used in signatures and track their definitions
 */
function findRelatedTypes(
  sourceFile: SourceFile,
  signature: TypeSignature,
): Definition[] {
  const relatedTypes: Definition[] = [];
  const processedTypes = new Set<string>();

  // Helper to find type info from the source file
  const findTypeInfo = (typeName: string): Definition | undefined => {
    if (processedTypes.has(typeName)) return;
    processedTypes.add(typeName);

    // Look for imports in the source file
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const namedImports = imp.getNamedImports();
      for (const named of namedImports) {
        if (
          named.getName() === typeName ||
          named.getAliasNode()?.getText() === typeName
        ) {
          const moduleSpecifier = imp.getModuleSpecifierValue();

          // Try to resolve the actual type definition
          const project = sourceFile.getProject();
          let targetFile: SourceFile | undefined;

          if (moduleSpecifier.startsWith(".")) {
            // Resolve relative import
            const currentDir = sourceFile.getDirectoryPath();
            const resolvedPath = moduleSpecifier.replace(
              /^\.\//,
              currentDir + "/",
            );
            targetFile = project.getSourceFile(resolvedPath + ".ts") ||
              project.getSourceFile(resolvedPath + ".tsx") ||
              project.getSourceFile(resolvedPath + "/index.ts");
          }

          if (targetFile) {
            // Find the type declaration in the target file
            const typeAlias = targetFile.getTypeAlias(typeName);
            const interfaceDecl = targetFile.getInterface(typeName);
            const classDecl = targetFile.getClass(typeName);

            const decl = typeAlias || interfaceDecl || classDecl;
            if (decl) {
              const start = decl.getStart();
              const { line, column } = targetFile.getLineAndColumnAtPos(start);

              return {
                filePath: targetFile.getFilePath(),
                line,
                column,
                kind: typeAlias
                  ? "Type alias"
                  : interfaceDecl
                  ? "Interface"
                  : "Class",
                name: typeName,
                importedFrom: moduleSpecifier,
              };
            }
          }

          // Even if we can't resolve the file, record the import
          return {
            filePath: moduleSpecifier,
            line: 1,
            column: 1,
            kind: "Import",
            name: typeName,
            importedFrom: moduleSpecifier,
          };
        }
      }
    }

    return undefined;
  };

  // Extract type names from signature
  const typeNames = new Set<string>();

  // Process function signatures
  if (signature.functionSignatures) {
    for (const funcSig of signature.functionSignatures) {
      // Extract from return type
      const returnTypeMatch = funcSig.returnType.match(
        /\b([A-Z][a-zA-Z0-9]*)\b/g,
      );
      if (returnTypeMatch) {
        returnTypeMatch.forEach((t) => typeNames.add(t));
      }

      // Extract from parameters
      for (const param of funcSig.parameters) {
        const paramTypeMatch = param.type.match(/\b([A-Z][a-zA-Z0-9]*)\b/g);
        if (paramTypeMatch) {
          paramTypeMatch.forEach((t) => typeNames.add(t));
        }
      }
    }
  }

  // Process type names
  for (const typeName of typeNames) {
    // Skip built-in types
    if (
      [
        "String",
        "Number",
        "Boolean",
        "Array",
        "Object",
        "Promise",
        "Date",
        "Error",
        "Function",
      ].includes(typeName)
    ) {
      continue;
    }

    const typeInfo = findTypeInfo(typeName);
    if (typeInfo) {
      relatedTypes.push(typeInfo);
    }
  }

  return relatedTypes;
}

/**
 * Extract definitions from a symbol, including aliases
 */
function extractDefinitions(
  symbol: Symbol,
  requestedName?: string,
): Definition[] {
  const definitions: Definition[] = [];

  // Get the original symbol (not aliased)
  const actualSymbol = symbol.getAliasedSymbol() || symbol;
  const originalName = actualSymbol.getName();

  // Add definitions from the actual symbol
  const declarations = actualSymbol.getDeclarations();
  for (const decl of declarations) {
    const sourceFile = decl.getSourceFile();
    const start = decl.getStart();
    const { line, column } = sourceFile.getLineAndColumnAtPos(start);

    let kind = "Unknown";
    let name = originalName;

    if (Node.isFunctionDeclaration(decl)) {
      kind = "Function";
      name = decl.getName() || originalName;
    } else if (Node.isMethodDeclaration(decl)) {
      kind = "Method";
      name = decl.getName() || originalName;
    } else if (Node.isClassDeclaration(decl)) {
      kind = "Class";
      name = decl.getName() || originalName;
    } else if (Node.isInterfaceDeclaration(decl)) {
      kind = "Interface";
      name = decl.getName() || originalName;
    } else if (Node.isTypeAliasDeclaration(decl)) {
      kind = "Type alias";
      name = decl.getName() || originalName;
    } else if (Node.isVariableDeclaration(decl)) {
      kind = "Variable";
      name = decl.getName() || originalName;
    } else if (Node.isPropertySignature(decl)) {
      kind = "Property";
      name = decl.getName() || originalName;
    } else if (Node.isMethodSignature(decl)) {
      kind = "Method signature";
      name = decl.getName() || originalName;
    } else if (Node.isExportSpecifier(decl)) {
      kind = "Export";
      // For export specifiers, getName() returns the original name
      name = decl.getName();
      // Check if there's an alias
      const aliasNode = decl.getAliasNode();
      if (aliasNode) {
        // This is an aliased export, so the name we see is different
        name = aliasNode.getText();
      }
    } else if (Node.isImportSpecifier(decl)) {
      kind = "Import";
      name = decl.getName();
    }

    definitions.push({
      filePath: sourceFile.getFilePath(),
      line,
      column,
      kind,
      name,
    });
  }

  // If this is an alias, also add the alias declaration (but skip temporary files)
  if (symbol.getAliasedSymbol() && symbol !== actualSymbol) {
    const aliasDeclarations = symbol.getDeclarations();
    const aliasName = symbol.getName();

    for (const decl of aliasDeclarations) {
      const sourceFile = decl.getSourceFile();
      const filePath = sourceFile.getFilePath();

      // Skip temporary analysis files
      if (filePath.includes("temp_type_analysis.ts")) continue;

      const start = decl.getStart();
      const { line, column } = sourceFile.getLineAndColumnAtPos(start);

      let declName = aliasName;

      // Get the actual name from the declaration if possible
      if (Node.isExportSpecifier(decl)) {
        // For aliased exports, get the alias name if it exists
        const aliasNode = decl.getAliasNode();
        if (aliasNode) {
          declName = aliasNode.getText();
        } else {
          declName = decl.getName();
        }
      } else if (Node.isImportSpecifier(decl)) {
        // For aliased imports, get the alias name if it exists
        const aliasNode = decl.getAliasNode();
        if (aliasNode) {
          declName = aliasNode.getText();
        } else {
          declName = decl.getName();
        }
      } else if (Node.isTypeAliasDeclaration(decl)) {
        declName = decl.getName() || aliasName;
      }

      definitions.push({
        filePath,
        line,
        column,
        kind: "Alias",
        name: declName,
        originalName: originalName,
      });
    }
  }

  // Also check if this symbol is re-exported with different names
  // This is important for cases like: export { User as BaseUser }
  if (requestedName && requestedName !== originalName) {
    // Find all export declarations that might export this symbol
    for (const decl of actualSymbol.getDeclarations()) {
      const sourceFile = decl.getSourceFile();

      // Look for export declarations in the same file
      const exportDeclarations = sourceFile.getExportDeclarations();
      for (const exportDecl of exportDeclarations) {
        const namedExports = exportDecl.getNamedExports();
        for (const namedExport of namedExports) {
          // Check if this export references our symbol
          if (namedExport.getName() === originalName) {
            const aliasNode = namedExport.getAliasNode();
            if (aliasNode && aliasNode.getText() === requestedName) {
              // Found an export that aliases our symbol with the requested name
              const start = namedExport.getStart();
              const { line, column } = sourceFile.getLineAndColumnAtPos(start);

              definitions.push({
                filePath: sourceFile.getFilePath(),
                line,
                column,
                kind: "Alias",
                name: requestedName,
                originalName: originalName,
              });
            }
          }
        }
      }
    }
  }

  return definitions;
}

/**
 * Extract function signatures
 */
function extractFunctionSignatures(
  type: Type,
  contextNode: Node,
): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];
  const callSignatures = type.getCallSignatures();

  for (const sig of callSignatures) {
    // Get parameters
    const parameters: ParameterInfo[] = sig
      .getParameters()
      .map((param: any) => {
        const paramDeclarations = param.getDeclarations();

        let isOptional = false;
        let defaultValue: string | undefined;
        let paramTypeText = "unknown";

        // Check if parameter declaration has optional or default value
        if (paramDeclarations && paramDeclarations.length > 0) {
          const firstDecl = paramDeclarations[0];
          if (Node.isParameterDeclaration(firstDecl)) {
            const paramDecl = firstDecl;
            isOptional = paramDecl.hasQuestionToken() ||
              paramDecl.hasInitializer();

            const initializer = paramDecl.getInitializer();
            if (initializer) {
              defaultValue = initializer.getText();
            }

            // Get type from parameter
            const typeNode = paramDecl.getTypeNode();
            if (typeNode) {
              paramTypeText = typeNode.getText();
            } else {
              paramTypeText = paramDecl.getType().getText();
            }
          } else {
            // For non-parameter declarations, use the declaration's type
            const declType = firstDecl.getType();
            paramTypeText = declType.getText();
          }
        } else {
          // Fallback to checking symbol flags
          const symbol = param.compilerSymbol;
          isOptional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;

          // Try to get type text from the type checker
          const paramType = param.getTypeAtLocation(contextNode);
          paramTypeText = paramType.getText();
        }

        return {
          name: param.getName(),
          type: simplifyTypeName(paramTypeText),
          optional: isOptional,
          defaultValue,
        };
      });

    // Get return type
    const returnType = sig.getReturnType();

    // Get type parameters
    const typeParams = sig.getTypeParameters();
    const typeParamStrings = typeParams.length > 0
      ? typeParams.map((t: any) => {
        const constraint = t.getConstraint();
        if (constraint) {
          const symbol = t.getSymbol();
          const name = symbol ? symbol.getName() : "T";
          return `${name} extends ${
            simplifyTypeName(
              constraint.getText(),
            )
          }`;
        }
        const symbol = t.getSymbol();
        return symbol ? (symbol as Symbol).getName() : "T";
      })
      : undefined;

    signatures.push({
      parameters,
      returnType: simplifyTypeName(returnType.getText()),
      typeParameters: typeParamStrings,
    });
  }

  return signatures;
}

/**
 * Extract properties from a type
 */
function extractProperties(type: Type, contextNode: Node): PropertyInfo[] {
  const properties: PropertyInfo[] = [];
  const allProperties = type.getProperties();

  for (const prop of allProperties) {
    const propName = prop.getName();

    // Skip private properties and constructor
    if (
      propName.startsWith("_") ||
      propName.startsWith("#") ||
      propName === "constructor"
    ) {
      continue;
    }

    const propDeclarations = prop.getDeclarations();
    if (!propDeclarations || propDeclarations.length === 0) {
      // For interfaces and types, we might not have declarations
      // Try to get the type directly
      const propType = prop.getTypeAtLocation(contextNode);
      const callSignatures = propType.getCallSignatures();

      // Skip if it's a method
      if (callSignatures.length > 0) continue;

      const isOptional =
        ((prop as any).compilerSymbol.flags & ts.SymbolFlags.Optional) !== 0;

      properties.push({
        name: propName,
        type: simplifyTypeName(propType.getText()),
        optional: isOptional,
        readonly: false,
      });
      continue;
    }

    const firstDecl = propDeclarations[0];
    const propType = prop.getTypeAtLocation(firstDecl);
    const callSignatures = propType.getCallSignatures();

    // Skip if it's a method
    if (callSignatures.length > 0) continue;

    const isOptional =
      ((prop as any).compilerSymbol.flags & ts.SymbolFlags.Optional) !== 0;
    const isReadonly = false; // ts-morph doesn't expose readonly flag easily

    properties.push({
      name: propName,
      type: simplifyTypeName(propType.getText()),
      optional: isOptional,
      readonly: isReadonly,
    });
  }

  return properties;
}

/**
 * Extract methods from a type
 */
function extractMethods(type: Type, contextNode: Node): MethodInfo[] {
  const methods: MethodInfo[] = [];
  const allProperties = type.getProperties();

  for (const prop of allProperties) {
    const propName = prop.getName();

    // Skip private properties and constructor
    if (
      propName.startsWith("_") ||
      propName.startsWith("#") ||
      propName === "constructor"
    ) {
      continue;
    }

    const propDeclarations = prop.getDeclarations();
    let propType;
    let nodeForSignature = contextNode;

    if (!propDeclarations || propDeclarations.length === 0) {
      // For interfaces and types, we might not have declarations
      propType = prop.getTypeAtLocation(contextNode);
    } else {
      const firstDecl = propDeclarations[0];
      propType = prop.getTypeAtLocation(firstDecl);
      nodeForSignature = firstDecl;
    }

    const callSignatures = propType.getCallSignatures();

    // Only include if it's a method
    if (callSignatures.length > 0) {
      const signatures = extractFunctionSignatures(propType, nodeForSignature);
      methods.push({
        name: propName,
        signatures,
      });
    }
  }

  return methods;
}

/**
 * Get detailed signature information for a specific type (function, class, interface, type alias, etc.)
 */
export function getTypeSignature(
  project: Project,
  request: GetTypeSignatureRequest,
): Result<GetTypeSignatureSuccess, string> {
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
      `import { ${request.typeName} } from "${request.moduleName}";`;

    const tempFileName = request.filePath
      ? request.filePath.replace(/\.[^.]+$/, "_temp_type_analysis.ts")
      : "temp_type_analysis.ts";

    let sourceFile;
    try {
      sourceFile = project.createSourceFile(tempFileName, importPath, {
        overwrite: true,
      });
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

    // Get the named import
    const namedImports = importDecl.getNamedImports();
    const typeImport = namedImports.find(
      (i) => i.getName() === request.typeName,
    );

    if (!typeImport) {
      sourceFile.delete();
      return err(
        `Type "${request.typeName}" not found in module "${request.moduleName}"`,
      );
    }

    const symbol = typeImport.getSymbol();
    if (!symbol) {
      sourceFile.delete();
      return err(`Failed to get symbol for type: ${request.typeName}`);
    }

    const actualSymbol = symbol.getAliasedSymbol() || symbol;

    // Get the declarations
    const declarations = actualSymbol.getDeclarations();
    if (declarations.length === 0) {
      sourceFile.delete();
      return err(`No declarations found for type: ${request.typeName}`);
    }

    // Extract definitions including aliases
    const definitions = extractDefinitions(symbol, request.typeName);

    // Also look for the export in the source module that exports this with the requested name
    let moduleFile = project.getSourceFile(request.moduleName);
    if (!moduleFile && request.filePath) {
      // Try to resolve relative import
      const contextDir = request.filePath.substring(
        0,
        request.filePath.lastIndexOf("/"),
      );
      const modulePath = request.moduleName.replace(/^\.\//, "");
      const resolvedPath = contextDir + "/" + modulePath;
      moduleFile = project.getSourceFile(resolvedPath);
    }

    if (moduleFile) {
      // Look for export declarations
      const exportDecls = moduleFile.getExportDeclarations();
      for (const exportDecl of exportDecls) {
        const namedExports = exportDecl.getNamedExports();
        for (const namedExport of namedExports) {
          const exportAlias = namedExport.getAliasNode();
          if (exportAlias && exportAlias.getText() === request.typeName) {
            // This is the export we're looking for
            const start = namedExport.getStart();
            const { line, column } = moduleFile.getLineAndColumnAtPos(start);

            definitions.push({
              filePath: moduleFile.getFilePath(),
              line,
              column,
              kind: "Alias",
              name: request.typeName,
              originalName: namedExport.getName(),
            });
          }
        }
      }
    }

    const firstDecl = declarations[0];
    const type = actualSymbol.getTypeAtLocation(firstDecl);

    // Determine the kind and extract appropriate information
    let signature: TypeSignature;

    // Check if it's a function
    const callSignatures = type.getCallSignatures();
    if (
      callSignatures.length > 0 &&
      !Node.isClassDeclaration(firstDecl) &&
      !Node.isInterfaceDeclaration(firstDecl)
    ) {
      // It's a function or function-like
      signature = {
        kind: "function",
        functionSignatures: extractFunctionSignatures(type, firstDecl),
        definitions,
      };
    } // Check if it's a class
    else if (Node.isClassDeclaration(firstDecl)) {
      const typeParams = firstDecl.getTypeParameters();
      const typeParamStrings = typeParams.length > 0
        ? typeParams.map((p: any) => {
          const constraint = p.getConstraint();
          return constraint
            ? `${p.getName()} extends ${
              simplifyTypeName(
                constraint.getText(),
              )
            }`
            : p.getName();
        })
        : undefined;

      // For classes, get the instance type
      let instanceType = type;
      // If we have a constructor type, get the instance type
      const constructSignatures = type.getConstructSignatures();
      if (constructSignatures.length > 0) {
        instanceType = constructSignatures[0].getReturnType();
      }

      signature = {
        kind: "class",
        properties: extractProperties(instanceType, firstDecl),
        methods: extractMethods(instanceType, firstDecl),
        typeParameters: typeParamStrings,
        definitions,
      };
    } // Check if it's an interface
    else if (Node.isInterfaceDeclaration(firstDecl)) {
      const typeParams = firstDecl.getTypeParameters();
      const typeParamStrings = typeParams.length > 0
        ? typeParams.map((p: any) => {
          const constraint = p.getConstraint();
          return constraint
            ? `${p.getName()} extends ${
              simplifyTypeName(
                constraint.getText(),
              )
            }`
            : p.getName();
        })
        : undefined;

      // For interfaces, use the declaration's type directly
      const interfaceType = firstDecl.getType();

      signature = {
        kind: "interface",
        properties: extractProperties(interfaceType, firstDecl),
        methods: extractMethods(interfaceType, firstDecl),
        typeParameters: typeParamStrings,
        definitions,
      };
    } // Check if it's a type alias
    else if (Node.isTypeAliasDeclaration(firstDecl)) {
      const typeParams = firstDecl.getTypeParameters();
      const typeParamStrings = typeParams.length > 0
        ? typeParams.map((p: any) => {
          const constraint = p.getConstraint();
          return constraint
            ? `${p.getName()} extends ${
              simplifyTypeName(
                constraint.getText(),
              )
            }`
            : p.getName();
        })
        : undefined;

      signature = {
        kind: "type",
        typeDefinition: simplifyTypeName(firstDecl.getType().getText()),
        typeParameters: typeParamStrings,
        definitions,
      };
    } // Otherwise it's a variable
    else {
      signature = {
        kind: "variable",
        typeDefinition: simplifyTypeName(type.getText()),
        definitions,
      };
    }

    // Get documentation
    const symbolDeclarations = actualSymbol.getDeclarations();
    let jsDocComment = "";

    if (symbolDeclarations.length > 0) {
      const firstDeclaration = symbolDeclarations[0];
      // Try to get JSDoc comment text from various node types
      const jsDocableNode = firstDeclaration as any;
      if (jsDocableNode.getJsDocs) {
        const jsDocs = jsDocableNode.getJsDocs();
        if (jsDocs.length > 0) {
          jsDocComment = jsDocs[0].getComment() || "";
          if (
            typeof jsDocComment === "object" && jsDocComment !== null &&
            "text" in jsDocComment
          ) {
            jsDocComment = (jsDocComment as any).text;
          }
        }
      }
    }

    const jsDocs = actualSymbol.getJsDocTags();
    const jsDocTags = jsDocs.length > 0
      ? jsDocs
        .map((tag: any) => {
          const tagName = tag.getName();
          const tagText = typeof tag.getText === "function"
            ? (Array.isArray(tag.getText())
              ? tag.getText().map((t: any) =>
                typeof t === "object" ? t.text || "" : t
              ).join(" ")
              : tag.getText())
            : "";
          return `@${tagName} ${tagText}`;
        })
        .join("\n")
      : "";

    const documentation = jsDocComment
      ? (jsDocTags ? `${jsDocComment}\n${jsDocTags}` : jsDocComment)
      : (jsDocTags || undefined);

    // Clean up temporary file
    sourceFile.delete();

    // Find related types - use the source file where the type is actually declared
    const declSourceFile = firstDecl.getSourceFile();
    const relatedTypes = findRelatedTypes(declSourceFile, signature);

    return ok({
      message: `Found signature for ${signature.kind} "${request.typeName}"`,
      typeName: request.typeName,
      signature,
      documentation,
      relatedTypes: relatedTypes.length > 0 ? relatedTypes : undefined,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

if (import.meta.vitest) {
  const { describe, expect, it } = await import("vitest");
  const { Project } = await import("ts-morph");

  describe("getTypeSignature", () => {
    it("should get signature for ok function from neverthrow", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
          esModuleInterop: true,
          skipLibCheck: false,
        },
      });

      const result = getTypeSignature(project, {
        moduleName: "neverthrow",
        typeName: "ok",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { typeName, signature } = result.value;

        expect(typeName).toBe("ok");
        expect(signature.kind).toBe("function");
        expect(signature.functionSignatures).toBeDefined();
        expect(signature.functionSignatures!.length).toBeGreaterThan(0);

        // Check that signatures have the expected structure
        for (const sig of signature.functionSignatures!) {
          expect(sig.parameters).toBeDefined();
          expect(sig.returnType).toBeDefined();
          expect(sig.returnType).toContain("Ok");
          expect(sig.typeParameters).toBeDefined();
        }
      }
    });

    it("should handle non-existent function", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
        },
      });

      const result = getTypeSignature(project, {
        moduleName: "neverthrow",
        typeName: "nonExistentFunction",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/not found|no declarations found/i);
      }
    });

    it("should get detailed parameter information", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
        },
      });

      // Create a test module with a function that has various parameter types
      const testModule = project.createSourceFile(
        "test-functions.ts",
        `
      export function testFunction<T extends string>(
        required: string,
        optional?: number,
        withDefault: boolean = true,
        ...rest: T[]
      ): { result: string; count: number } {
        return { result: required, count: rest.length };
      }
      
      export const arrowFunction = <T>(items: T[], predicate: (item: T) => boolean): T[] => {
        return items.filter(predicate);
      };
      `,
      );

      const result = getTypeSignature(project, {
        moduleName: "./test-functions.ts",
        typeName: "testFunction",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(signature.kind).toBe("function");
        expect(signature.functionSignatures).toBeDefined();
        expect(signature.functionSignatures!).toHaveLength(1);

        const sig = signature.functionSignatures![0];
        expect(sig.typeParameters).toBeDefined();
        expect(sig.typeParameters).toContainEqual("T extends string");

        // Check parameters
        expect(sig.parameters).toHaveLength(4);

        const [required, optional, withDefault, rest] = sig.parameters;

        expect(required.name).toBe("required");
        expect(required.type).toBe("string");
        expect(required.optional).toBe(false);

        expect(optional.name).toBe("optional");
        expect(optional.type).toBe("number");
        expect(optional.optional).toBe(true);

        expect(withDefault.name).toBe("withDefault");
        expect(withDefault.type).toBe("boolean");
        expect(withDefault.defaultValue).toBe("true");

        expect(rest.name).toBe("rest");
        expect(rest.type).toContain("T[]");

        // Check return type
        expect(sig.returnType).toBe("{ result: string; count: number; }");
      }

      // Test arrow function
      const arrowResult = getTypeSignature(project, {
        moduleName: "./test-functions.ts",
        typeName: "arrowFunction",
      });

      expect(arrowResult.isOk()).toBe(true);
      if (arrowResult.isOk()) {
        const { signature } = arrowResult.value;
        // Arrow functions are detected as functions, not variables
        expect(signature.kind).toBe("function");
        expect(signature.functionSignatures).toBeDefined();
        expect(signature.functionSignatures!).toHaveLength(1);

        const sig = signature.functionSignatures![0];
        expect(sig.typeParameters).toBeDefined();
        expect(sig.typeParameters).toContainEqual("T");
        expect(sig.returnType).toBe("T[]");
      }

      // Clean up
      testModule.delete();
    });

    it("should handle function overloads", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
        },
      });

      // Create a test module with overloaded functions
      const testModule = project.createSourceFile(
        "test-overloads.ts",
        `
      export function overloaded(x: string): string;
      export function overloaded(x: number): number;
      export function overloaded(x: boolean): boolean;
      export function overloaded(x: string | number | boolean): string | number | boolean {
        return x;
      }
      `,
      );

      const result = getTypeSignature(project, {
        moduleName: "./test-overloads.ts",
        typeName: "overloaded",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(signature.kind).toBe("function");
        expect(signature.functionSignatures).toBeDefined();

        // Should have 3 overload signatures (not the implementation)
        expect(signature.functionSignatures!.length).toBeGreaterThanOrEqual(3);

        // Check each overload
        const stringOverload = signature.functionSignatures!.find(
          (s: any) =>
            s.parameters[0]?.type === "string" && s.returnType === "string",
        );
        expect(stringOverload).toBeDefined();

        const numberOverload = signature.functionSignatures!.find(
          (s: any) =>
            s.parameters[0]?.type === "number" && s.returnType === "number",
        );
        expect(numberOverload).toBeDefined();

        const booleanOverload = signature.functionSignatures!.find(
          (s: any) =>
            s.parameters[0]?.type === "boolean" && s.returnType === "boolean",
        );
        expect(booleanOverload).toBeDefined();
      }

      // Clean up
      testModule.delete();
    });

    it("should extract definitions including aliases", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
        },
      });

      // Create a test module with type aliases
      const testModule = project.createSourceFile(
        "test-aliases.ts",
        `
      export interface BaseUser {
        id: number;
        name: string;
      }
      
      export type User = BaseUser & {
        email: string;
      };
      
      export type AdminUser = User & {
        permissions: string[];
      };
      `,
      );

      const result = getTypeSignature(project, {
        moduleName: "./test-aliases.ts",
        typeName: "AdminUser",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(signature.kind).toBe("type");
        expect(signature.definitions).toBeDefined();
        expect(signature.definitions!.length).toBeGreaterThan(0);

        // Should have at least one definition
        const def = signature.definitions![0];
        expect(def.filePath).toContain("test-aliases.ts");
        expect(def.kind).toBe("Type alias");
        expect(def.line).toBeGreaterThan(0);
        expect(def.column).toBeGreaterThan(0);
        expect(def.name).toBe("AdminUser");
      }

      // Clean up
      testModule.delete();
    });

    it("should simplify type names", () => {
      const project = new Project({
        compilerOptions: {
          moduleResolution: 100, // Bundler
          esModuleInterop: true,
        },
      });

      const result = getTypeSignature(project, {
        moduleName: "neverthrow",
        typeName: "ok",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(signature.kind).toBe("function");
        expect(signature.functionSignatures).toBeDefined();

        // Check that return types don't contain import paths
        for (const sig of signature.functionSignatures!) {
          expect(sig.returnType).not.toContain('import("');
          expect(sig.returnType).toContain("Ok<");

          // Check parameters don't contain import paths
          for (const param of sig.parameters) {
            expect(param.type).not.toContain('import("');
          }
        }
      }
    });

    it("should handle type parameters in functions", () => {
      const project = new Project();

      project.createSourceFile(
        "test.ts",
        `
          export function identity<T>(value: T): T {
            return value;
          }
          
          export function map<T, U>(array: T[], fn: (item: T) => U): U[] {
            return array.map(fn);
          }
        `,
        { overwrite: true },
      );

      const result = getTypeSignature(project, {
        moduleName: "./test",
        typeName: "map",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(signature.functionSignatures![0].typeParameters).toEqual([
          "T",
          "U",
        ]);
      }
    });

    it("should handle export specifiers with aliases", () => {
      const project = new Project();

      project.createSourceFile(
        "lib.ts",
        `
          export class Database {
            connect(): void {}
          }
          
          export const DB_VERSION = "1.0.0";
        `,
        { overwrite: true },
      );

      project.createSourceFile(
        "index.ts",
        `
          export { Database as DB, DB_VERSION as VERSION } from "./lib";
        `,
        { overwrite: true },
      );

      const result = getTypeSignature(project, {
        moduleName: "./index",
        typeName: "DB",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(signature.kind).toBe("class");
      }
    });

    it("should extract documentation from JSDoc comments", () => {
      const project = new Project();

      project.createSourceFile(
        "test.ts",
        `
          /**
           * Calculates the sum of two numbers
           * @param a First number
           * @param b Second number
           * @returns The sum of a and b
           */
          export function add(a: number, b: number): number {
            return a + b;
          }
        `,
        { overwrite: true },
      );

      const result = getTypeSignature(project, {
        moduleName: "./test",
        typeName: "add",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { documentation } = result.value;
        expect(documentation).toBeDefined();
        expect(documentation).toContain("Calculates the sum");
      }
    });

    it("should handle unknown symbol kinds", () => {
      const project = new Project();

      // Create a file with a const assertion
      project.createSourceFile(
        "test.ts",
        `
          export const config = {
            name: "test",
            value: 42
          } as const;
        `,
        { overwrite: true },
      );

      const result = getTypeSignature(project, {
        moduleName: "./test",
        typeName: "config",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { signature } = result.value;
        expect(["variable", "const", "unknown"]).toContain(signature.kind);
      }
    });
  });
}
