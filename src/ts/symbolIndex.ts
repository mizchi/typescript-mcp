import { Node, Project, SourceFile, SyntaxKind } from "ts-morph";
import { existsSync, FSWatcher, watch } from "fs";
import { dirname, join, relative } from "path";
import { glob } from "glob";
import { debug } from "../mcp/_mcplib.ts";

export interface SymbolInfo {
  name: string;
  kind: string;
  filePath: string;
  line: number;
  character: number;
  isExported: boolean;
  moduleName?: string;
  documentation?: string;
}

export interface SymbolIndex {
  symbols: Map<string, SymbolInfo[]>;
  modules: Map<string, string[]>; // module path -> exported symbol names
  lastUpdated: Date;
}

export class ProjectSymbolIndexer {
  private index: SymbolIndex;
  private project: Project;
  private rootPath: string;
  private watchers: Map<string, FSWatcher> = new Map();
  private watchedDirs: Set<string> = new Set();
  private updateQueue: Map<string, { eventType: string; timestamp: number }> =
    new Map();
  private updateTimer: NodeJS.Timeout | null = null;
  private readonly UPDATE_DELAY_MS = 100; // Debounce delay in milliseconds

  constructor(project: Project, rootPath: string) {
    this.project = project;
    this.rootPath = rootPath;
    this.index = {
      symbols: new Map(),
      modules: new Map(),
      lastUpdated: new Date(),
    };
  }

  /**
   * Build or rebuild the symbol index for the entire project
   */
  async buildIndex(
    includePatterns: string[] = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    enableWatch: boolean = true,
  ): Promise<void> {
    // Always disable file watching in test environment
    if (
      process.env.NODE_ENV === "test" || process.env.VITEST ||
      process.env.CI === "true"
    ) {
      enableWatch = false;
    }

    debug("Building project symbol index...");
    const startTime = Date.now();

    // Clear existing index
    this.index.symbols.clear();
    this.index.modules.clear();

    // Find all source files
    const files: string[] = [];
    for (const pattern of includePatterns) {
      const matches = await glob(pattern, {
        cwd: this.rootPath,
        ignore: ["**/node_modules/**", "**/dist/**", "**/*.d.ts"],
        absolute: false,
      });
      files.push(...matches);
    }

    debug(`Found ${files.length} files to index`);

    // Process each file
    for (const file of files) {
      const filePath = join(this.rootPath, file);
      if (existsSync(filePath)) {
        try {
          const sourceFile = this.project.addSourceFileAtPath(filePath);
          this.indexSourceFile(sourceFile);
        } catch (error) {
          debug(`Error indexing file ${file}: ${error}`);
        }
      }
    }

    this.index.lastUpdated = new Date();
    const duration = Date.now() - startTime;
    debug(
      `Symbol index built in ${duration}ms. Total symbols: ${this.index.symbols.size}`,
    );

    // Set up file watchers if enabled
    if (enableWatch) {
      this.setupFileWatchers();
    }
  }

  /**
   * Index a single source file
   */
  private indexSourceFile(sourceFile: SourceFile): void {
    const filePath = relative(this.rootPath, sourceFile.getFilePath());
    const exportedSymbols: string[] = [];

    // Get all exported symbols
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
      exportedSymbols.push(name);

      for (const declaration of declarations) {
        const symbolInfo = this.createSymbolInfo(
          declaration,
          name,
          filePath,
          true,
        );
        if (symbolInfo) {
          this.addSymbolToIndex(symbolInfo);
        }
      }
    }

    // Store module exports
    if (exportedSymbols.length > 0) {
      this.index.modules.set(filePath, exportedSymbols);
    }

    // Also index top-level non-exported symbols for workspace-wide search
    sourceFile.forEachChild((node) => {
      if (this.isDeclarationNode(node)) {
        const symbol = node.getSymbol();
        if (symbol && !exportedSymbols.includes(symbol.getName())) {
          const symbolInfo = this.createSymbolInfo(
            node,
            symbol.getName(),
            filePath,
            false,
          );
          if (symbolInfo) {
            this.addSymbolToIndex(symbolInfo);
          }
        }
      }
    });
  }

  /**
   * Create symbol information from a node
   */
  private createSymbolInfo(
    node: Node,
    name: string,
    filePath: string,
    isExported: boolean,
  ): SymbolInfo | null {
    const sourceFile = node.getSourceFile();
    const start = node.getStart();
    const pos = sourceFile.getLineAndColumnAtPos(start);

    const symbolInfo: SymbolInfo = {
      name,
      kind: this.getSymbolKind(node),
      filePath,
      line: pos.line,
      character: pos.column,
      isExported,
    };

    // Add documentation if available
    const symbol = node.getSymbol();
    if (symbol) {
      const jsDocTags = symbol.getJsDocTags();
      if (jsDocTags.length > 0) {
        symbolInfo.documentation = jsDocTags
          .map((tag) => `${tag.getName()}: ${tag.getText()}`)
          .join("\n");
      }
    }

    return symbolInfo;
  }

  /**
   * Get the kind of symbol from a node
   */
  private getSymbolKind(node: Node): string {
    switch (node.getKind()) {
      case SyntaxKind.FunctionDeclaration:
      case SyntaxKind.FunctionExpression:
      case SyntaxKind.ArrowFunction:
      case SyntaxKind.MethodDeclaration:
        return "Function";
      case SyntaxKind.ClassDeclaration:
      case SyntaxKind.ClassExpression:
        return "Class";
      case SyntaxKind.InterfaceDeclaration:
        return "Interface";
      case SyntaxKind.TypeAliasDeclaration:
        return "TypeAlias";
      case SyntaxKind.EnumDeclaration:
        return "Enum";
      case SyntaxKind.VariableDeclaration:
        return "Variable";
      case SyntaxKind.PropertyDeclaration:
      case SyntaxKind.PropertySignature:
        return "Property";
      case SyntaxKind.ModuleDeclaration:
        return "Module";
      default:
        return "Unknown";
    }
  }

  /**
   * Check if a node is a declaration
   */
  private isDeclarationNode(node: Node): boolean {
    const kind = node.getKind();
    return (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.ClassDeclaration ||
      kind === SyntaxKind.InterfaceDeclaration ||
      kind === SyntaxKind.TypeAliasDeclaration ||
      kind === SyntaxKind.EnumDeclaration ||
      kind === SyntaxKind.VariableStatement ||
      kind === SyntaxKind.ModuleDeclaration
    );
  }

  /**
   * Add a symbol to the index
   */
  private addSymbolToIndex(symbolInfo: SymbolInfo): void {
    const existing = this.index.symbols.get(symbolInfo.name) || [];
    existing.push(symbolInfo);
    this.index.symbols.set(symbolInfo.name, existing);
  }

  /**
   * Search for symbols by name (prefix match)
   */
  searchSymbols(query: string, options?: {
    exact?: boolean;
    includeNonExported?: boolean;
    kinds?: string[];
    limit?: number;
  }): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    const { exact = false, includeNonExported = false, kinds, limit = 50 } =
      options || {};

    for (const [name, symbols] of this.index.symbols) {
      if (exact ? name === query : name.startsWith(query)) {
        for (const symbol of symbols) {
          if (!includeNonExported && !symbol.isExported) continue;
          if (kinds && !kinds.includes(symbol.kind)) continue;

          results.push(symbol);
          if (results.length >= limit) {
            return results;
          }
        }
      }
    }

    return results;
  }

  /**
   * Get all exported symbols from a module
   */
  getModuleExports(modulePath: string): string[] {
    return this.index.modules.get(modulePath) || [];
  }

  /**
   * Find symbols that could be imported for a given name
   */
  findImportCandidates(symbolName: string): SymbolInfo[] {
    return this.searchSymbols(symbolName, {
      exact: true,
      includeNonExported: false,
    });
  }

  /**
   * Get the current index
   */
  getIndex(): SymbolIndex {
    return this.index;
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalSymbols: number;
    totalModules: number;
    lastUpdated: Date;
    symbolsByKind: Map<string, number>;
    watchedDirectories: number;
  } {
    const symbolsByKind = new Map<string, number>();

    for (const symbols of this.index.symbols.values()) {
      for (const symbol of symbols) {
        const count = symbolsByKind.get(symbol.kind) || 0;
        symbolsByKind.set(symbol.kind, count + 1);
      }
    }

    return {
      totalSymbols: this.index.symbols.size,
      totalModules: this.index.modules.size,
      lastUpdated: this.index.lastUpdated,
      symbolsByKind,
      watchedDirectories: this.watchedDirs.size,
    };
  }

  /**
   * Set up file system watchers for automatic index updates
   */
  private setupFileWatchers(): void {
    // Clear existing watchers
    this.clearWatchers();

    // Get all directories containing source files
    const dirsToWatch = new Set<string>();

    for (const [filePath] of this.index.modules) {
      const dir = dirname(join(this.rootPath, filePath));
      dirsToWatch.add(dir);
    }

    // Also watch the root directory
    dirsToWatch.add(this.rootPath);

    // Set up watchers for each directory
    for (const dir of dirsToWatch) {
      if (!existsSync(dir)) continue;

      try {
        const watcher = watch(
          dir,
          { recursive: false },
          (eventType, filename) => {
            if (!filename) return;

            // Check if the file matches our patterns
            const fullPath = join(dir, filename);
            const relativePath = relative(this.rootPath, fullPath);

            if (this.shouldIndexFile(relativePath)) {
              debug(`File ${eventType}: ${relativePath}`);
              this.handleFileChange(fullPath, eventType);
            }
          },
        );

        this.watchers.set(dir, watcher);
        this.watchedDirs.add(dir);
      } catch (error) {
        debug(`Failed to watch directory ${dir}: ${error}`);
      }
    }

    debug(`Set up file watchers for ${this.watchedDirs.size} directories`);
  }

  /**
   * Check if a file should be indexed based on include patterns
   */
  private shouldIndexFile(relativePath: string): boolean {
    const extensions = [".ts", ".tsx", ".js", ".jsx"];
    return extensions.some((ext) => relativePath.endsWith(ext)) &&
      !relativePath.includes("node_modules") &&
      !relativePath.includes("dist") &&
      !relativePath.endsWith(".d.ts");
  }

  /**
   * Handle file change events with debouncing
   */
  private handleFileChange(filePath: string, eventType: string): void {
    // Add to update queue
    this.updateQueue.set(filePath, { eventType, timestamp: Date.now() });

    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Set new timer to process queued updates
    this.updateTimer = setTimeout(() => {
      this.processUpdateQueue();
    }, this.UPDATE_DELAY_MS);
  }

  /**
   * Process all queued file updates
   */
  private processUpdateQueue(): void {
    if (this.updateQueue.size === 0) return;

    debug(`Processing ${this.updateQueue.size} queued file updates`);
    const startTime = Date.now();

    // Group updates by type to optimize processing
    const updates = Array.from(this.updateQueue.entries());
    const toRemove: string[] = [];
    const toUpdate: string[] = [];

    for (const [filePath, { eventType }] of updates) {
      const relativePath = relative(this.rootPath, filePath);

      if (eventType === "rename") {
        // File deleted or renamed
        toRemove.push(relativePath);

        // If file still exists, it was renamed (not deleted)
        if (existsSync(filePath)) {
          toUpdate.push(filePath);
        }
      } else if (eventType === "change") {
        // File modified - only update if not already scheduled for removal
        if (!toRemove.includes(relativePath)) {
          toUpdate.push(filePath);
        }
      }
    }

    // Process removals first
    for (const relativePath of toRemove) {
      this.removeFileFromIndex(relativePath);
    }

    // Then process updates
    for (const filePath of toUpdate) {
      this.updateFileInIndex(filePath);
    }

    // Clear the queue
    this.updateQueue.clear();
    this.updateTimer = null;

    const duration = Date.now() - startTime;
    debug(`Processed file updates in ${duration}ms`);
  }

  /**
   * Remove a file from the index
   */
  private removeFileFromIndex(relativePath: string): void {
    // Remove from modules
    this.index.modules.delete(relativePath);

    // Remove symbols from this file
    for (const [symbolName, symbols] of this.index.symbols) {
      const filtered = symbols.filter((s) => s.filePath !== relativePath);
      if (filtered.length === 0) {
        this.index.symbols.delete(symbolName);
      } else if (filtered.length !== symbols.length) {
        this.index.symbols.set(symbolName, filtered);
      }
    }

    this.index.lastUpdated = new Date();
    debug(`Removed file from index: ${relativePath}`);
  }

  /**
   * Update a single file in the index
   */
  private updateFileInIndex(filePath: string): void {
    try {
      const relativePath = relative(this.rootPath, filePath);

      // Remove old entries
      this.removeFileFromIndex(relativePath);

      // Remove the source file from the project to clear any cached content
      const existingSourceFile = this.project.getSourceFile(filePath);
      if (existingSourceFile) {
        this.project.removeSourceFile(existingSourceFile);
      }

      // Re-add and index the file with fresh content
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      this.indexSourceFile(sourceFile);

      this.index.lastUpdated = new Date();
      debug(`Updated file in index: ${relativePath}`);
    } catch (error) {
      debug(`Error updating file ${filePath}: ${error}`);
    }
  }

  /**
   * Clear all file watchers
   */
  private clearWatchers(): void {
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchedDirs.clear();
  }

  /**
   * Dispose of the indexer and clean up resources
   */
  dispose(): void {
    // Clear any pending updates
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    this.updateQueue.clear();

    // Clear watchers and index
    this.clearWatchers();
    this.index.symbols.clear();
    this.index.modules.clear();
  }
}
