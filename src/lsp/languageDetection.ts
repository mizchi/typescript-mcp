import path from "path";
import { getGlobalLanguageMapping } from "./languageMapping.ts";

/**
 * Get the LSP language identifier from a file path
 * First checks configured mappings, then falls back to built-in detection
 */
export function getLanguageIdFromPath(filePath: string): string {
  // First, check configured mappings
  const mapping = getGlobalLanguageMapping();
  const mappedId = mapping.getLanguageId(filePath);
  if (mappedId) {
    return mappedId;
  }

  // Fall back to built-in detection for common cases
  const ext = path.extname(filePath).toLowerCase();

  const extensionMap: Record<string, string> = {
    // TypeScript/JavaScript
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".mts": "typescript",
    ".cts": "typescript",

    // Python
    ".py": "python",
    ".pyw": "python",
    ".pyx": "python",
    ".pyi": "python",

    // Rust
    ".rs": "rust",

    // Go
    ".go": "go",

    // Java
    ".java": "java",

    // C/C++
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".hh": "cpp",

    // C#
    ".cs": "csharp",
    ".csx": "csharp",

    // F#
    ".fs": "fsharp",
    ".fsx": "fsharp",
    ".fsi": "fsharp",
    ".ml": "ocaml",
    ".mli": "ocaml",

    // Ruby
    ".rb": "ruby",
    ".rake": "ruby",
    ".gemspec": "ruby",

    // PHP
    ".php": "php",
    ".phtml": "php",
    ".php3": "php",
    ".php4": "php",
    ".php5": "php",
    ".phps": "php",

    // Swift
    ".swift": "swift",

    // Kotlin
    ".kt": "kotlin",
    ".kts": "kotlin",

    // Scala
    ".scala": "scala",
    ".sc": "scala",

    // Haskell
    ".hs": "haskell",
    ".lhs": "haskell",

    // Lua
    ".lua": "lua",

    // Shell
    ".sh": "shellscript",
    ".bash": "shellscript",
    ".zsh": "shellscript",
    ".fish": "shellscript",

    // PowerShell
    ".ps1": "powershell",
    ".psm1": "powershell",
    ".psd1": "powershell",

    // HTML/XML
    ".html": "html",
    ".htm": "html",
    ".xhtml": "html",
    ".xml": "xml",
    ".xsl": "xml",
    ".xslt": "xml",

    // CSS
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",

    // JSON/YAML
    ".json": "json",
    ".jsonc": "jsonc",
    ".json5": "json5",
    ".yaml": "yaml",
    ".yml": "yaml",

    // Markdown
    ".md": "markdown",
    ".markdown": "markdown",
    ".mdown": "markdown",
    ".mkd": "markdown",
    ".mdx": "mdx",

    // Vue
    ".vue": "vue",

    // Svelte
    ".svelte": "svelte",

    // Others
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".dart": "dart",
    ".elm": "elm",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hrl": "erlang",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".cljc": "clojure",
    ".r": "r",
    ".R": "r",
    ".jl": "julia",
    ".nim": "nim",
    ".nims": "nim",
    ".zig": "zig",
    ".v": "vlang",
    ".vb": "vb",
    ".vbs": "vbscript",
    ".pas": "pascal",
    ".pp": "pascal",
    ".d": "d",
    ".groovy": "groovy",
    ".gradle": "groovy",
  };

  // Check for special filenames
  const basename = path.basename(filePath).toLowerCase();
  const filenameMap: Record<string, string> = {
    "dockerfile": "dockerfile",
    "makefile": "makefile",
    "rakefile": "ruby",
    "gemfile": "ruby",
    "vagrantfile": "ruby",
    "gulpfile.js": "javascript",
    "gruntfile.js": "javascript",
  };

  if (filenameMap[basename]) {
    return filenameMap[basename];
  }

  return extensionMap[ext] || "plaintext";
}
