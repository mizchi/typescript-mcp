/**
 * Language initialization utilities
 */

import { debug } from "../_mcplib.ts";
import {
  getFSharpLSPCommand,
  initializeFSharp,
} from "../../fsharp/fsharpInit.ts";

/**
 * Language configuration
 */
export interface LanguageConfig {
  name: string;
  lspCommand: string;
  extensions: string[];
  initialize?: (projectRoot: string) => Promise<void>;
}

/**
 * Supported language configurations
 */
const languageConfigs: Record<string, LanguageConfig> = {
  fsharp: {
    name: "F#",
    lspCommand: getFSharpLSPCommand(),
    extensions: [".fs", ".fsx", ".fsi"],
    initialize: initializeFSharp,
  },
  rust: {
    name: "Rust",
    lspCommand: "rust-analyzer",
    extensions: [".rs"],
  },
  python: {
    name: "Python",
    lspCommand: "pylsp",
    extensions: [".py", ".pyw", ".pyx", ".pyi"],
  },
  go: {
    name: "Go",
    lspCommand: "gopls",
    extensions: [".go"],
  },
  csharp: {
    name: "C#",
    lspCommand: "omnisharp",
    extensions: [".cs", ".csx"],
  },
};

/**
 * Get language configuration
 */
export function getLanguageConfig(
  language: string,
): LanguageConfig | undefined {
  return languageConfigs[language.toLowerCase()];
}

/**
 * Get LSP command for a language
 */
export function getLSPCommandForLanguage(language: string): string | undefined {
  const config = getLanguageConfig(language);
  return config?.lspCommand;
}

/**
 * Initialize language-specific settings
 */
export async function initializeLanguage(
  language: string,
  projectRoot: string,
): Promise<void> {
  const config = getLanguageConfig(language);
  if (config?.initialize) {
    debug(`[lsp] Initializing ${config.name} specific settings`);
    await config.initialize(projectRoot);
  }
}

/**
 * Get supported languages
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(languageConfigs);
}
