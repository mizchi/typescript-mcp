import { Node, type Project, type SourceFile, SyntaxKind } from "ts-morph";
import { err, ok, type Result } from "neverthrow";

type RemovableNode = Node & { remove(): void };

export interface DeleteSymbolRequest {
  filePath: string;
  line: number;
  symbolName: string;
  removeReferences?: boolean;
}

export interface DeleteSymbolSuccess {
  message: string;
  removedFromFiles: string[];
}

function validateSourceFile(
  project: Project,
  filePath: string,
): Result<SourceFile, string> {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    return err(`File not found: ${filePath}`);
  }
  return ok(sourceFile);
}

function removeVariableDeclaration(declaration: Node): void {
  const variableStatement = declaration.getFirstAncestorByKind(
    SyntaxKind.VariableStatement,
  );

  if (!variableStatement || !Node.isVariableStatement(variableStatement)) {
    return;
  }

  const declarations = variableStatement.getDeclarations();
  if (declarations.length === 1) {
    // If this is the only declaration, remove the entire statement
    variableStatement.remove();
  } else {
    // Otherwise, just remove this specific declaration
    if (isRemovableNode(declaration)) {
      declaration.remove();
    }
  }
}

function isDeclarationKind(node: Node): boolean {
  return (
    Node.isClassDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isVariableDeclaration(node)
  );
}

function isPropertyOrMethodKind(node: Node): boolean {
  return (
    Node.isMethodDeclaration(node) ||
    Node.isPropertyDeclaration(node)
  );
}

function isRemovableNode(node: Node): node is RemovableNode {
  return isDeclarationKind(node) || isPropertyOrMethodKind(node);
}

function removeDeclaration(declaration: Node): Result<void, string> {
  if (Node.isVariableDeclaration(declaration)) {
    removeVariableDeclaration(declaration);
    return ok(undefined);
  }

  if (isRemovableNode(declaration)) {
    declaration.remove();
    return ok(undefined);
  }

  return err(`Cannot remove node of type ${declaration.getKindName()}`);
}

/**
 * ファイルパスと行番号、シンボル名を指定してシンボルを削除
 */
export async function deleteSymbol(
  project: Project,
  request: DeleteSymbolRequest,
): Promise<Result<DeleteSymbolSuccess, string>> {
  try {
    // Validate source file
    const sourceFileResult = validateSourceFile(project, request.filePath);
    if (sourceFileResult.isErr()) {
      return err(sourceFileResult.error);
    }
    const sourceFile = sourceFileResult.value;

    // Find symbol node
    const node = findSymbolAtLine(sourceFile, request.line, request.symbolName);
    if (!node) {
      return err(
        `Symbol "${request.symbolName}" not found at line ${
          String(request.line)
        }`,
      );
    }

    // Get declaration node
    const declaration = getDeclarationNode(node);
    if (!declaration) {
      return err(`Cannot find declaration for symbol "${request.symbolName}"`);
    }

    const removedFromFiles: string[] = [];
    const nodesToRemove: Array<{ node: Node; isDeclaration: boolean }> = [];

    // First, collect all references if requested
    if (request.removeReferences !== false) {
      // Find all references to the symbol
      const referencedSymbols = project
        .getLanguageService()
        .findReferencesAtPosition(sourceFile, node.getStart());

      if (referencedSymbols) {
        for (const referencedSymbol of referencedSymbols) {
          for (const reference of referencedSymbol.getReferences()) {
            const refSourceFile = reference.getSourceFile();
            const refNode = reference.getNode();

            // Check if this is the declaration
            const isDecl = refNode === node ||
              refNode.getParent() === declaration;

            nodesToRemove.push({ node: refNode, isDeclaration: isDecl });

            if (!removedFromFiles.includes(refSourceFile.getFilePath())) {
              removedFromFiles.push(refSourceFile.getFilePath());
            }
          }
        }
      }
    } else {
      // Only remove the declaration
      nodesToRemove.push({ node: declaration, isDeclaration: true });
      removedFromFiles.push(sourceFile.getFilePath());
    }

    // Sort nodes by position in reverse order (remove from bottom to top)
    nodesToRemove.sort((a, b) => b.node.getStart() - a.node.getStart());

    // Remove each node
    for (const { node: nodeToRemove, isDeclaration } of nodesToRemove) {
      if (isDeclaration) {
        // Remove the declaration
        const removeResult = removeDeclaration(declaration);
        if (removeResult.isErr()) {
          return err(removeResult.error);
        }
      } else {
        // Remove the reference
        const parent = nodeToRemove.getParent();

        // Special case: if this is the only thing in a return statement, remove the return
        if (Node.isReturnStatement(parent)) {
          parent.remove();
        } else if (Node.isExpressionStatement(parent)) {
          // If it's an expression statement, remove the whole statement
          parent.remove();
        } else {
          // For other cases, we need more context
          // This is a simplified approach - in reality, we'd need more sophisticated handling
          continue;
        }
      }
    }

    // Save the project
    await project.save();

    return ok({
      message: `Successfully removed symbol "${request.symbolName}"`,
      removedFromFiles,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

function isNodeInLineRange(
  node: Node,
  sourceFile: SourceFile,
  line: number,
): boolean {
  const startLine = sourceFile.getLineAndColumnAtPos(node.getStart()).line;
  const endLine = sourceFile.getLineAndColumnAtPos(node.getEnd()).line;
  return line >= startLine && line <= endLine;
}

function checkIdentifierNode(node: Node, symbolName: string): Node | undefined {
  if (Node.isIdentifier(node) && node.getText() === symbolName) {
    return node;
  }
  return undefined;
}

function checkNamedNode(node: Node, symbolName: string): Node | undefined {
  if (!hasGetNameMethod(node)) {
    return undefined;
  }

  try {
    if (node.getName() === symbolName) {
      return node;
    }
  } catch {
    // getName() not available for this node
  }
  return undefined;
}

function checkVariableDeclaration(
  node: Node,
  symbolName: string,
): Node | undefined {
  if (!Node.isVariableDeclaration(node)) {
    return undefined;
  }

  const nameNode = node.getNameNode();
  if (Node.isIdentifier(nameNode) && nameNode.getText() === symbolName) {
    return nameNode;
  }
  return undefined;
}

function checkNodeAtLine(
  node: Node,
  sourceFile: SourceFile,
  line: number,
  symbolName: string,
): Node | undefined {
  if (!isNodeInLineRange(node, sourceFile, line)) {
    return undefined;
  }

  return (
    checkIdentifierNode(node, symbolName) ||
    checkNamedNode(node, symbolName) ||
    checkVariableDeclaration(node, symbolName)
  );
}

/**
 * 指定された行とシンボル名に一致するノードを探す
 */
function findSymbolAtLine(
  sourceFile: SourceFile,
  line: number,
  symbolName: string,
): Node | undefined {
  let foundNode: Node | undefined;

  sourceFile.forEachDescendant((node) => {
    if (foundNode) return;

    const matchedNode = checkNodeAtLine(node, sourceFile, line, symbolName);
    if (matchedNode) {
      foundNode = matchedNode;
    }
  });

  return foundNode;
}

/**
 * Get the declaration node from any node
 */
function getDeclarationNode(node: Node): Node | undefined {
  if (Node.isIdentifier(node)) {
    const parent = node.getParent();
    if (Node.isVariableDeclaration(parent)) {
      return parent;
    }
    if (hasGetNameMethod(parent) && isDeclarationNode(parent)) {
      return parent;
    }
  }

  if (isDeclarationNode(node)) {
    return node;
  }

  return undefined;
}

/**
 * Check if node is a declaration node
 */
function isDeclarationNode(node: Node): boolean {
  return isDeclarationKind(node);
}

type NamedNode = Node & { getName(): string | undefined };

function isAccessorKind(node: Node): boolean {
  return (
    Node.isGetAccessorDeclaration(node) ||
    Node.isSetAccessorDeclaration(node)
  );
}

/**
 * Check if node has getName method
 */
function hasGetNameMethod(node: Node): node is NamedNode {
  return (
    isDeclarationKind(node) ||
    isPropertyOrMethodKind(node) ||
    isAccessorKind(node)
  );
}
