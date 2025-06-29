import fs from "fs/promises";

export interface MoveOperation {
  oldPath: string;
  newPath: string;
}

export async function parseMoveComments(
  filePath: string,
): Promise<MoveOperation[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const operations: MoveOperation[] = [];

  for (const line of lines) {
    // Match @move: oldPath -> newPath
    const match = line.match(/\/\/\s*@move:\s*(.+?)\s*->\s*(.+?)$/);
    if (match) {
      operations.push({
        oldPath: match[1].trim(),
        newPath: match[2].trim(),
      });
    }
  }

  return operations;
}
