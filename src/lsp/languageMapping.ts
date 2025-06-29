import micromatch from "micromatch";
import path from "path";

export interface LanguageMapping {
  pattern: string;  // Glob pattern like "*.rs", "**/*.{ts,tsx}", "src/**/*.py"
  languageId: string;  // VSCode language ID
}

export class LanguageMappingConfig {
  private mappings: LanguageMapping[] = [];
  
  constructor(mappings?: LanguageMapping[]) {
    if (mappings) {
      this.mappings = mappings;
    }
  }
  
  /**
   * Add a language mapping
   */
  addMapping(pattern: string, languageId: string): void {
    // Add new mappings at the beginning for higher priority
    this.mappings.unshift({ pattern, languageId });
  }
  
  /**
   * Add multiple mappings
   */
  addMappings(mappings: LanguageMapping[]): void {
    // Add new mappings at the beginning for higher priority
    this.mappings.unshift(...mappings);
  }
  
  /**
   * Get language ID for a file path using glob patterns
   */
  getLanguageId(filePath: string): string | null {
    // Normalize the file path for consistent matching
    const normalizedPath = path.normalize(filePath);
    
    // Check each mapping in order (first match wins)
    for (const mapping of this.mappings) {
      if (micromatch.isMatch(normalizedPath, mapping.pattern)) {
        return mapping.languageId;
      }
    }
    
    return null;
  }
  
  /**
   * Get all configured mappings
   */
  getMappings(): LanguageMapping[] {
    return [...this.mappings];
  }
  
  /**
   * Create a config with default TypeScript/JavaScript mappings
   */
  static createWithDefaults(): LanguageMappingConfig {
    const config = new LanguageMappingConfig();
    
    // Only include TypeScript/JavaScript by default since this is typescript-mcp
    config.addMappings([
      { pattern: "**/*.ts", languageId: "typescript" },
      { pattern: "**/*.tsx", languageId: "typescriptreact" },
      { pattern: "**/*.mts", languageId: "typescript" },
      { pattern: "**/*.cts", languageId: "typescript" },
      { pattern: "**/*.js", languageId: "javascript" },
      { pattern: "**/*.jsx", languageId: "javascriptreact" },
      { pattern: "**/*.mjs", languageId: "javascript" },
      { pattern: "**/*.cjs", languageId: "javascript" },
    ]);
    
    return config;
  }
  
  /**
   * Parse language mappings from command line format
   * Format: "pattern:languageId,pattern:languageId"  
   * Supports glob patterns with wildcards
   */
  static parseFromString(mappingString: string): LanguageMapping[] {
    if (!mappingString) return [];
    
    const mappings: LanguageMapping[] = [];
    const pairs = mappingString.split(',');
    
    for (const pair of pairs) {
      const [pattern, languageId] = pair.split(':');
      if (pattern && languageId) {
        mappings.push({
          pattern: pattern.trim(),
          languageId: languageId.trim()
        });
      }
    }
    
    return mappings;
  }
  
  /**
   * Parse from JSON format (for config files)
   * Format: [{"pattern": "*.rs", "languageId": "rust"}, ...]
   */
  static parseFromJSON(json: string): LanguageMapping[] {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => 
          typeof item.pattern === 'string' && 
          typeof item.languageId === 'string'
        );
      }
    } catch {
      // Invalid JSON
    }
    return [];
  }
}

// Global instance for the application
let globalConfig: LanguageMappingConfig | null = null;

export function getGlobalLanguageMapping(): LanguageMappingConfig {
  if (!globalConfig) {
    globalConfig = LanguageMappingConfig.createWithDefaults();
  }
  return globalConfig;
}

export function setGlobalLanguageMapping(config: LanguageMappingConfig): void {
  globalConfig = config;
}