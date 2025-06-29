import {
  getCompilerOptionsFromTsConfig,
  Node,
  Project,
  type SourceFile,
} from "ts-morph";
import { err, ok, type Result } from "neverthrow";

export interface RenameRequest {
  filePath: string;
  line: number;
  symbolName: string;
  newName: string;
  renameInComments?: boolean;
  renameInStrings?: boolean;
}

export interface RenameSuccess {
  message: string;
  changedFiles: {
    filePath: string;
    changes: {
      line: number;
      column: number;
      oldText: string;
      newText: string;
    }[];
  }[];
}

/**
 * プロジェクトを作成または取得
 */
export function createProject(tsConfigPath?: string): Project {
  if (tsConfigPath) {
    const { errors } = getCompilerOptionsFromTsConfig(tsConfigPath);
    if (errors.length > 0) {
      throw new Error(
        `Failed to read tsconfig: ${
          errors
            .map((e) => {
              const messageText = e.getMessageText();
              return typeof messageText === "string"
                ? messageText
                : messageText.getMessageText();
            })
            .join(", ")
        }`,
      );
    }
    return new Project({
      tsConfigFilePath: tsConfigPath, // Specify `tsConfigFilePath` instead of `compilerOptions` to load files
      skipAddingFilesFromTsConfig: false,
    });
  }

  return new Project({
    skipAddingFilesFromTsConfig: false,
  });
}

/**
 * ファイルパスと行番号、シンボル名を指定してシンボルのリネームを実行
 */
export async function renameSymbol(
  project: Project,
  request: RenameRequest,
): Promise<Result<RenameSuccess, string>> {
  try {
    // ソースファイルを取得
    const sourceFile = project.getSourceFile(request.filePath);
    if (!sourceFile) {
      return err(`File not found: ${request.filePath}`);
    }

    // 指定された行のシンボルを探す
    let node: Node | undefined;
    try {
      node = findSymbolAtLine(sourceFile, request.line, request.symbolName);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }

    if (!node) {
      return err(
        `Symbol "${request.symbolName}" not found at line ${
          String(
            request.line,
          )
        }`,
      );
    }

    // リネーム前の状態を記録
    const beforeStates = captureFileStates(project);

    // リネームを実行
    if (Node.isIdentifier(node)) {
      node.rename(request.newName, {
        renameInComments: request.renameInComments || false,
        renameInStrings: request.renameInStrings || false,
      });
    } else if (hasRenameMethod(node)) {
      const renameableNode = node as Node & {
        rename: (
          newName: string,
          options?: { renameInComments?: boolean; renameInStrings?: boolean },
        ) => void;
      };
      renameableNode.rename(request.newName, {
        renameInComments: request.renameInComments || false,
        renameInStrings: request.renameInStrings || false,
      });
    } else {
      return err(`Cannot rename node of type ${node.getKindName()}`);
    }

    // 変更を検出
    const changedFiles = detectChanges(project, beforeStates);

    // プロジェクトを保存
    await project.save();

    return ok({
      message:
        `Successfully renamed symbol "${request.symbolName}" to "${request.newName}"`,
      changedFiles,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 指定された行とシンボル名に一致するノードを探す
 */
function findSymbolAtLine(
  sourceFile: SourceFile,
  line: number,
  symbolName: string,
): Node | undefined {
  const candidateNodes: Node[] = [];

  sourceFile.forEachDescendant((node) => {
    const startLine = sourceFile.getLineAndColumnAtPos(node.getStart()).line;

    // 指定された行から始まるノードのみをチェック
    if (line === startLine) {
      // 識別子の場合
      if (Node.isIdentifier(node) && node.getText() === symbolName) {
        // 親が名前付きノードの場合は、親ノードを優先
        const parent = node.getParent();
        if (hasGetNameMethod(parent)) {
          try {
            const namedParent = parent as Node & { getName: () => string };
            if (namedParent.getName() === symbolName) {
              // 親ノードを使用（重複を避けるため）
              if (!candidateNodes.some((n) => n === parent)) {
                candidateNodes.push(parent);
              }
              return; // 識別子自体は追加しない
            }
          } catch {
            // getName()が使えない場合は識別子を使用
          }
        }
        candidateNodes.push(node);
      }

      // 名前付きノードの場合（クラス、関数、変数など）
      if (hasGetNameMethod(node)) {
        try {
          const namedNode = node as Node & { getName: () => string };
          if (namedNode.getName() === symbolName) {
            candidateNodes.push(node);
          }
        } catch {
          // getName()が使えないノードは無視
        }
      }

      // 変数宣言の場合
      if (Node.isVariableDeclaration(node)) {
        const nameNode = node.getNameNode();
        if (Node.isIdentifier(nameNode) && nameNode.getText() === symbolName) {
          candidateNodes.push(node); // 変数宣言ノードを使用
        }
      }
    }
  });

  // 重複を除去（同じシンボルを表す異なるノードタイプを統合）
  const uniqueNodes = candidateNodes.filter((node) => {
    // 同じ位置から始まる他のノードがある場合、より具体的なノードを優先
    const nodeStart = node.getStart();
    const duplicates = candidateNodes.filter((n) => n.getStart() === nodeStart);

    if (duplicates.length > 1) {
      // 名前付きノード（クラス、関数など）を優先
      const namedNodes = duplicates.filter(
        (n) => hasGetNameMethod(n) || Node.isVariableDeclaration(n),
      );
      if (namedNodes.length > 0) {
        return namedNodes[0] === node;
      }
    }

    return true;
  });

  // まだ複数の候補がある場合、同じ行の異なる位置にある可能性
  if (uniqueNodes.length > 1) {
    // 列位置でソートして、同じ列位置のものだけをチェック
    const firstNodeCol = sourceFile.getLineAndColumnAtPos(
      uniqueNodes[0].getStart(),
    ).column;
    const sameColumnNodes = uniqueNodes.filter(
      (n) =>
        sourceFile.getLineAndColumnAtPos(n.getStart()).column === firstNodeCol,
    );

    if (sameColumnNodes.length > 1) {
      throw new Error(
        `Multiple occurrences of symbol "${symbolName}" found on line ${
          String(
            line,
          )
        }. Please be more specific.`,
      );
    }

    // 異なる列位置の場合は最初の出現を使用
    return uniqueNodes[0];
  }

  return uniqueNodes[0];
}

/**
 * 全ソースファイルの現在の状態をキャプチャ
 */
function captureFileStates(project: Project): Map<string, string> {
  const states = new Map<string, string>();
  for (const sourceFile of project.getSourceFiles()) {
    states.set(sourceFile.getFilePath(), sourceFile.getFullText());
  }
  return states;
}

/**
 * ファイルの変更を検出して詳細を返す
 */
function detectChanges(
  project: Project,
  beforeStates: Map<string, string>,
): RenameSuccess["changedFiles"] {
  const changedFiles: RenameSuccess["changedFiles"] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const beforeText = beforeStates.get(filePath);
    const afterText = sourceFile.getFullText();

    if (beforeText && beforeText !== afterText) {
      const changes = diffTexts(sourceFile, beforeText, afterText);
      if (changes.length > 0) {
        changedFiles.push({
          filePath,
          changes,
        });
      }
    }
  }

  return changedFiles;
}

/**
 * テキストの差分を検出（簡易版）
 */
function diffTexts(
  _sourceFile: SourceFile,
  beforeText: string,
  afterText: string,
): { line: number; column: number; oldText: string; newText: string }[] {
  const changes: {
    line: number;
    column: number;
    oldText: string;
    newText: string;
  }[] = [];

  const beforeLines = beforeText.split("\n");
  const afterLines = afterText.split("\n");

  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
    const beforeLine = beforeLines[i] || "";
    const afterLine = afterLines[i] || "";

    if (beforeLine !== afterLine) {
      // 簡易的に行全体を変更として記録
      changes.push({
        line: i + 1,
        column: 1,
        oldText: beforeLine,
        newText: afterLine,
      });
    }
  }

  return changes;
}

/**
 * ノードがrename()メソッドを持っているかチェック
 */
function hasRenameMethod(node: Node): boolean {
  return (
    Node.isClassDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isVariableDeclaration(node)
  );
}

/**
 * ノードがgetName()メソッドを持っているかチェック
 */
function hasGetNameMethod(node: Node): boolean {
  return (
    Node.isClassDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isPropertyDeclaration(node) ||
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  );
}

/**
 * プロジェクトにソースファイルを追加
 */
export function addSourceFile(project: Project, filePath: string): SourceFile {
  return project.addSourceFileAtPath(filePath);
}

/**
 * プロジェクトに複数のソースファイルを追加
 */
export function addSourceFiles(project: Project, glob: string): SourceFile[] {
  return project.addSourceFilesAtPaths(glob);
}
