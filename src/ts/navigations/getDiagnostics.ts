import { DiagnosticCategory, type Project } from "ts-morph";
import { err, ok, type Result } from "neverthrow";

export interface GetDiagnosticsRequest {
  filePaths: string[];
}

export interface Diagnostic {
  filePath: string;
  line: number;
  column: number;
  message: string;
  category: string;
  code: number;
  length: number;
}

export interface GetDiagnosticsSuccess {
  message: string;
  diagnostics: Diagnostic[];
  fileCount: number;
}

function categoryToString(category: DiagnosticCategory): string {
  switch (category) {
    case DiagnosticCategory.Error:
      return "error";
    case DiagnosticCategory.Warning:
      return "warning";
    case DiagnosticCategory.Suggestion:
      return "suggestion";
    case DiagnosticCategory.Message:
      return "message";
    default:
      return "unknown";
  }
}

export function getDiagnostics(
  project: Project,
  request: GetDiagnosticsRequest,
): Result<GetDiagnosticsSuccess, string> {
  if (request.filePaths.length === 0) {
    return err("No file paths provided");
  }

  try {
    const results: Diagnostic[] = [];
    let processedFiles = 0;
    const allDiagnostics: any[] = [];

    for (const filePath of request.filePaths) {
      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) {
        // Skip files that are not found
        continue;
      }

      processedFiles++;

      // Get pre-emit diagnostics for this specific file
      const diagnostics = sourceFile.getPreEmitDiagnostics();
      allDiagnostics.push(...diagnostics);

      for (const diagnostic of diagnostics) {
        const diagSourceFile = diagnostic.getSourceFile();

        // Skip diagnostics from other files (e.g., imported modules)
        if (diagSourceFile && diagSourceFile.getFilePath() !== filePath) {
          continue;
        }

        const start = diagnostic.getStart();
        const length = diagnostic.getLength() || 0;
        const category = diagnostic.getCategory();
        const categoryStr = categoryToString(category);

        let line = 1;
        let column = 1;

        if (start !== undefined && diagSourceFile) {
          const lineAndCol = diagSourceFile.getLineAndColumnAtPos(start);
          line = lineAndCol.line;
          column = lineAndCol.column;
        }

        results.push({
          filePath: diagSourceFile?.getFilePath() || filePath,
          line,
          column,
          message: (() => {
            const messageText = diagnostic.getMessageText();
            return typeof messageText === "string"
              ? messageText
              : messageText.getMessageText();
          })(),
          category: categoryStr,
          code: diagnostic.getCode(),
          length,
        });
      }
    }

    if (processedFiles === 0) {
      return err("No valid source files found");
    }

    // Use ts-morph's built-in formatting for the message
    const message = allDiagnostics.length > 0
      ? project.formatDiagnosticsWithColorAndContext(allDiagnostics)
      : `No diagnostics found in ${String(processedFiles)} file${
        processedFiles === 1 ? "" : "s"
      }.`;

    return ok({
      message,
      diagnostics: results,
      fileCount: processedFiles,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

if (import.meta.vitest) {
  const { test, describe, expect } = import.meta.vitest;
  const { Project } = await import("ts-morph");

  describe("getDiagnostics", () => {
    test("should find type errors", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99, // ESNext
          strict: true,
        },
      });

      project.createSourceFile(
        "/src/main.ts",
        `const x: string = 123; // Type error
function greet(name: string) {
  return "Hello, " + name;
}
greet(456); // Type error`,
      );

      const result = getDiagnostics(project, {
        filePaths: ["/src/main.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { diagnostics, message } = result.value;
        expect(diagnostics).toHaveLength(2);

        // Check that message contains formatted diagnostics
        expect(message).toContain("main.ts");
        expect(message).toContain(
          "Type 'number' is not assignable to type 'string'",
        );

        // First error: string = 123
        expect(diagnostics[0].line).toBe(1);
        expect(diagnostics[0].category).toBe("error");
        expect(diagnostics[0].message).toContain(
          "Type 'number' is not assignable to type 'string'",
        );

        // Second error: greet(456)
        expect(diagnostics[1].line).toBe(5);
        expect(diagnostics[1].category).toBe("error");
        expect(diagnostics[1].message).toContain(
          "Argument of type 'number' is not assignable to parameter of type 'string'",
        );
      }
    });

    test("should find unused variable warnings", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99, // ESNext
          noUnusedLocals: true,
        },
      });

      project.createSourceFile(
        "/src/utils.ts",
        `const unusedVar = 42;
export function useThis() {
  return "used";
}`,
      );

      const result = getDiagnostics(project, {
        filePaths: ["/src/utils.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { diagnostics } = result.value;
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].message).toContain(
          "'unusedVar' is declared but its value is never read",
        );
      }
    });

    test("should handle files with no diagnostics", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99, // ESNext
        },
      });

      project.createSourceFile(
        "/src/clean.ts",
        `export function add(a: number, b: number): number {
  return a + b;
}

console.log(add(1, 2));`,
      );

      const result = getDiagnostics(project, {
        filePaths: ["/src/clean.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { diagnostics, message } = result.value;
        expect(diagnostics).toHaveLength(0);
        expect(message).toBe("No diagnostics found in 1 file.");
      }
    });

    test("should find missing imports", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99, // ESNext
          moduleResolution: 2, // NodeJs
        },
      });

      project.createSourceFile(
        "/src/missing-import.ts",
        `import { nonExistent } from "./does-not-exist.ts";

console.log(nonExistent);`,
      );

      const result = getDiagnostics(project, {
        filePaths: ["/src/missing-import.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { diagnostics } = result.value;
        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics[0].category).toBe("error");
      }
    });

    test("should return error for non-existent file", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
      });

      const result = getDiagnostics(project, {
        filePaths: ["/src/nonexistent.ts"],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain("No valid source files found");
      }
    });

    test("should handle syntax errors", () => {
      const project = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          target: 99, // ESNext
        },
      });

      project.createSourceFile(
        "/src/syntax-error.ts",
        `function broken( {
  return "missing closing paren";
}`,
      );

      const result = getDiagnostics(project, {
        filePaths: ["/src/syntax-error.ts"],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const { diagnostics } = result.value;
        expect(diagnostics.length).toBeGreaterThan(0);
        expect(diagnostics[0].category).toBe("error");
        // TypeScript reports this as a missing implementation error
        expect(diagnostics[0].message.toLowerCase()).toContain(
          "function implementation",
        );
      }
    });
  });
}
