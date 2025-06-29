import { Node, type Project, ts } from "ts-morph";
import { err, ok, type Result } from "neverthrow";

export interface PositionRequest {
  filePath: string;
  line: number;
  column: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
}

export interface LocationInfo {
  filePath: string;
  line: number;
  column: number;
  text: string;
  lineText: string;
}

/**
 * Common helper to find a node and its symbol at a given position
 */
export function findNodeAndSymbolAtPosition(
  project: Project,
  request: PositionRequest,
): Result<{ node: Node; symbol: any; symbolInfo: SymbolInfo }, string> {
  const sourceFile = project.getSourceFile(request.filePath);
  if (!sourceFile) {
    return err(`File not found: ${request.filePath}`);
  }

  // Find the position
  const position = sourceFile.compilerNode.getPositionOfLineAndCharacter(
    request.line - 1,
    request.column - 1,
  );

  const node = sourceFile.getDescendantAtPos(position);
  if (!node) {
    return err(
      `No node found at position ${String(request.line)}:${
        String(request.column)
      }`,
    );
  }

  const symbol = node.getSymbol();
  if (!symbol) {
    return err(
      `No symbol found at position ${String(request.line)}:${
        String(request.column)
      }`,
    );
  }

  const symbolName = symbol.getName();
  const symbolKind = node.getKindName();

  return ok({
    node,
    symbol,
    symbolInfo: {
      name: symbolName,
      kind: symbolKind,
    },
  });
}

/**
 * Get an identifier node from a node
 */
export function getIdentifierFromNode(node: Node): Node | null {
  return Node.isIdentifier(node)
    ? node
    : node.getFirstDescendantByKind(ts.SyntaxKind.Identifier) || null;
}

/**
 * Extract location information from a node
 */
export function extractLocationInfo(node: Node): LocationInfo {
  const sourceFile = node.getSourceFile();
  const start = node.getStart();
  const startLineAndCol = sourceFile.getLineAndColumnAtPos(start);

  // Get line text
  const fullText = sourceFile.getFullText();
  const lines = fullText.split("\n");
  const lineText = lines[startLineAndCol.line - 1] || "";

  return {
    filePath: sourceFile.getFilePath(),
    line: startLineAndCol.line,
    column: startLineAndCol.column,
    text: node.getText(),
    lineText: lineText.trim(),
  };
}
