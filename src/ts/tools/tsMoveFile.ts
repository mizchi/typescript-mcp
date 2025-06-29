import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { err, ok, type Result } from "neverthrow";
import { moveFile } from "../commands/moveFile.ts";
import {
  findProjectForFile,
  getOrCreateSourceFileWithRefresh,
} from "../projectCache.ts";
import type { ToolDef } from "../../mcp/_mcplib.ts";

const schemaShape = {
  root: z.string().describe("Root directory for resolving relative paths"),
  oldPath: z.string().describe("Current file path (relative to root)"),
  newPath: z.string().describe("New file path (relative to root)"),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Overwrite the destination file if it exists"),
};

const schema = z.object(schemaShape);

interface MoveFileResult {
  message: string;
  changedFiles: string[];
}

async function handleMoveFile({
  root,
  oldPath,
  newPath,
  overwrite,
}: z.infer<typeof schema>): Promise<Result<MoveFileResult, string>> {
  // Always treat paths as relative to root
  const absoluteOldPath = path.join(root, oldPath);
  const absoluteNewPath = path.join(root, newPath);

  const project = findProjectForFile(absoluteOldPath);

  // Ensure the source file is loaded in the project with fresh content
  const sourceFileResult = (() => {
    try {
      getOrCreateSourceFileWithRefresh(absoluteOldPath);
      return ok(undefined);
    } catch {
      return err(`File not found: ${absoluteOldPath}`);
    }
  })();

  if (sourceFileResult.isErr()) {
    return err(sourceFileResult.error);
  }

  // Load all TypeScript/JavaScript files in the project directory to ensure imports are resolved
  const rootDir = root;

  // Try to add source files from the root directory
  try {
    const files = await fs.readdir(rootDir, {
      recursive: true,
      withFileTypes: true,
    });
    for (const file of files) {
      if (
        file.isFile() &&
        (file.name.endsWith(".ts") || file.name.endsWith(".tsx") ||
          file.name.endsWith(".js") || file.name.endsWith(".jsx"))
      ) {
        const filePath = path.join(file.path, file.name);
        if (!project.getSourceFile(filePath)) {
          try {
            project.addSourceFileAtPath(filePath);
          } catch {
            // Ignore errors for files that can't be added
          }
        }
      }
    }
  } catch {
    // If recursive readdir fails, try just the immediate directory
    try {
      const files = await fs.readdir(rootDir);
      for (const file of files) {
        if (
          file.endsWith(".ts") || file.endsWith(".tsx") ||
          file.endsWith(".js") || file.endsWith(".jsx")
        ) {
          const filePath = path.join(rootDir, file);
          if (!project.getSourceFile(filePath)) {
            try {
              project.addSourceFileAtPath(filePath);
            } catch {
              // Ignore errors for files that can't be added
            }
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  // Perform the move
  const result = moveFile(project, {
    oldFilename: absoluteOldPath,
    newFilename: absoluteNewPath,
    overwrite,
  });

  if (result.isErr()) {
    return err(result.error);
  }

  // Save all changes
  await project.save();

  return ok(result.value);
}

async function analyzeImportChanges(
  file: string,
  oldPath: string,
  newPath: string,
): Promise<Result<string[], string>> {
  const contentResult = await fs
    .readFile(file, "utf-8")
    .then((content) => ok(content))
    .catch((error: unknown) =>
      err(error instanceof Error ? error.message : String(error))
    );

  if (contentResult.isErr()) {
    return ok([`    Import statements updated`]);
  }

  const lines = contentResult.value.split("\n");

  // Find lines with import statements that reference the moved file
  const importRegex = /(?:import|from|require)\s*\(?['"`]([^'"`]+)['"`]\)?/g;

  const importChanges = lines.flatMap((line, i) => {
    const lineNum = i + 1;
    const matches: string[] = [];
    let match;

    while ((match = importRegex.exec(line)) !== null) {
      const importPath = match[1];
      const fileDir = path.dirname(file);
      const resolvedNewPath = path.resolve(fileDir, importPath);
      const normalizedNewPath = path.normalize(newPath);

      if (
        resolvedNewPath === normalizedNewPath ||
        importPath.includes(path.basename(newPath, path.extname(newPath)))
      ) {
        const relativeOldPath = path
          .relative(fileDir, oldPath)
          .replace(/\\/g, "/");
        const oldLine = line.replace(
          importPath,
          relativeOldPath.startsWith(".")
            ? relativeOldPath
            : "./" + relativeOldPath,
        );

        if (oldLine !== line) {
          matches.push(
            `    @@ -${String(lineNum)},1 +${String(lineNum)},1 @@`,
            `    - ${oldLine}`,
            `    + ${line}`,
          );
        }
      }
    }
    return matches;
  });

  return ok(
    importChanges.length > 0
      ? importChanges
      : [`    Import statements updated`],
  );
}

async function formatMoveFileResult(
  result: MoveFileResult,
  oldPath: string,
  newPath: string,
  root: string,
): Promise<Result<string, string>> {
  const { message, changedFiles } = result;

  const output = [
    `${message}. Updated imports in ${String(changedFiles.length)} file(s).`,
    "",
    "Changes:",
  ];

  // Extract the relative paths for import matching
  const oldRelativePath = path.relative(root, oldPath);
  const newRelativePath = path.relative(root, newPath);

  // Process each changed file
  const fileResults = await Promise.all(
    changedFiles.map(async (file) => {
      if (file === oldPath) {
        // This is the moved file itself
        return ok([`  File moved: ${oldRelativePath} → ${newRelativePath}`]);
      }

      const relativePath = path.relative(root, file);
      const importAnalysis = await analyzeImportChanges(file, oldPath, newPath);

      if (importAnalysis.isErr()) {
        return err(importAnalysis.error);
      }

      return ok([`  ${relativePath}:`, ...importAnalysis.value]);
    }),
  );

  // Check if any file processing failed
  for (const fileResult of fileResults) {
    if (fileResult.isErr()) {
      return err(fileResult.error);
    }
    output.push(...fileResult.value);
  }

  return ok(output.join("\n"));
}

export const moveFileTool: ToolDef<typeof schema> = {
  name: "lsmcp_move_file",
  description:
    "Move a TypeScript/JavaScript file to a new location and update all import statements",
  schema,
  execute: async (args) => {
    const result = await handleMoveFile(args);
    if (result.isErr()) {
      throw new Error(result.error);
    }

    const absoluteOldPath = path.join(args.root, args.oldPath);
    const absoluteNewPath = path.join(args.root, args.newPath);
    const formattedResult = await formatMoveFileResult(
      result.value,
      absoluteOldPath,
      absoluteNewPath,
      args.root,
    );

    if (formattedResult.isErr()) {
      throw new Error(formattedResult.error);
    }

    return formattedResult.value;
  },
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("move_file", () => {
    describe("formatMoveFileResult", () => {
      it("should format successful move with no import updates", async () => {
        const result: MoveFileResult = {
          message: "Moved file from 'src/old.ts' to 'src/new.ts'",
          changedFiles: ["/project/src/old.ts"],
        };

        const formatted = await formatMoveFileResult(
          result,
          "/project/src/old.ts",
          "/project/src/new.ts",
          "/project",
        );

        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Moved file from 'src/old.ts' to 'src/new.ts'. Updated imports in 1 file(s).",
          );
          expect(formatted.value).toMatch(
            "File moved: src/old.ts → src/new.ts",
          );
        }
      });

      it("should format successful move with single import update", async () => {
        const result: MoveFileResult = {
          message: "Moved file from 'utils/helper.ts' to 'lib/helper.ts'",
          changedFiles: ["/project/utils/helper.ts", "/project/src/index.ts"],
        };

        const formatted = await formatMoveFileResult(
          result,
          "/project/utils/helper.ts",
          "/project/lib/helper.ts",
          "/project",
        );

        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Moved file from 'utils/helper.ts' to 'lib/helper.ts'. Updated imports in 2 file(s).",
          );
          expect(formatted.value).toMatch(
            "File moved: utils/helper.ts → lib/helper.ts",
          );
          expect(formatted.value).toMatch("src/index.ts:");
        }
      });

      it("should format successful move with multiple import updates", async () => {
        const result: MoveFileResult = {
          message: "Moved file from 'components/Button.tsx' to 'ui/Button.tsx'",
          changedFiles: [
            "/project/components/Button.tsx",
            "/project/src/App.tsx",
            "/project/src/pages/Home.tsx",
            "/project/src/pages/About.tsx",
            "/project/src/components/Form.tsx",
          ],
        };

        const formatted = await formatMoveFileResult(
          result,
          "/project/components/Button.tsx",
          "/project/ui/Button.tsx",
          "/project",
        );

        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Moved file from 'components/Button.tsx' to 'ui/Button.tsx'. Updated imports in 5 file(s).",
          );
          expect(formatted.value).toMatch(
            "File moved: components/Button.tsx → ui/Button.tsx",
          );
          expect(formatted.value).toMatch("src/App.tsx:");
          expect(formatted.value).toMatch("src/pages/Home.tsx:");
          expect(formatted.value).toMatch("src/pages/About.tsx:");
          expect(formatted.value).toMatch("src/components/Form.tsx:");
        }
      });

      it("should format move to different directory", async () => {
        const result: MoveFileResult = {
          message: "Moved file from 'src/utils/math.ts' to 'lib/math/index.ts'",
          changedFiles: [
            "/project/src/utils/math.ts",
            "/project/src/calculator.ts",
            "/project/src/statistics.ts",
          ],
        };

        const formatted = await formatMoveFileResult(
          result,
          "/project/src/utils/math.ts",
          "/project/lib/math/index.ts",
          "/project",
        );

        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Moved file from 'src/utils/math.ts' to 'lib/math/index.ts'. Updated imports in 3 file(s).",
          );
          expect(formatted.value).toMatch(
            "File moved: src/utils/math.ts → lib/math/index.ts",
          );
          expect(formatted.value).toMatch("src/calculator.ts:");
          expect(formatted.value).toMatch("src/statistics.ts:");
        }
      });

      it("should format rename within same directory", async () => {
        const result: MoveFileResult = {
          message: "Moved file from 'types/user.ts' to 'types/User.ts'",
          changedFiles: [
            "/project/types/user.ts",
            "/project/src/models/user.model.ts",
            "/project/src/services/auth.service.ts",
            "/project/src/api/users.api.ts",
          ],
        };

        const formatted = await formatMoveFileResult(
          result,
          "/project/types/user.ts",
          "/project/types/User.ts",
          "/project",
        );

        expect(formatted.isOk()).toBe(true);
        if (formatted.isOk()) {
          expect(formatted.value).toMatch(
            "Moved file from 'types/user.ts' to 'types/User.ts'. Updated imports in 4 file(s).",
          );
          expect(formatted.value).toMatch(
            "File moved: types/user.ts → types/User.ts",
          );
          expect(formatted.value).toMatch("src/models/user.model.ts:");
          expect(formatted.value).toMatch("src/services/auth.service.ts:");
          expect(formatted.value).toMatch("src/api/users.api.ts:");
        }
      });
    });
  });
}
