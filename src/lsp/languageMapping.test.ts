import { describe, it, expect } from "vitest";
import { LanguageMappingConfig } from "./languageMapping.ts";

describe("LanguageMappingConfig", () => {
  it("should match files with glob patterns", () => {
    const config = new LanguageMappingConfig([
      { pattern: "*.rs", languageId: "rust" },
      { pattern: "**/*.py", languageId: "python" },
      { pattern: "src/**/*.go", languageId: "go" },
    ]);

    expect(config.getLanguageId("main.rs")).toBe("rust");
    expect(config.getLanguageId("lib/util.py")).toBe("python");
    expect(config.getLanguageId("src/cmd/main.go")).toBe("go");
    expect(config.getLanguageId("test.txt")).toBe(null);
  });

  it("should respect priority (first match wins)", () => {
    const config = new LanguageMappingConfig([
      { pattern: "**/*.ts", languageId: "typescript" },
      { pattern: "test/*.ts", languageId: "typescript-test" },
    ]);

    // First pattern matches, so it wins
    expect(config.getLanguageId("test/example.ts")).toBe("typescript");

    // Add specific pattern with higher priority
    config.addMapping("test/*.ts", "typescript-test");
    expect(config.getLanguageId("test/example.ts")).toBe("typescript-test");
  });

  it("should parse from string format", () => {
    const mappings = LanguageMappingConfig.parseFromString(
      "*.rs:rust,**/*.py:python,src/**/*.go:go"
    );

    expect(mappings).toEqual([
      { pattern: "*.rs", languageId: "rust" },
      { pattern: "**/*.py", languageId: "python" },
      { pattern: "src/**/*.go", languageId: "go" },
    ]);
  });

  it("should handle empty or invalid string format", () => {
    expect(LanguageMappingConfig.parseFromString("")).toEqual([]);
    expect(LanguageMappingConfig.parseFromString("invalid")).toEqual([]);
    expect(LanguageMappingConfig.parseFromString("missing:")).toEqual([]);
    expect(LanguageMappingConfig.parseFromString(":languageonly")).toEqual([]);
  });

  it("should parse from JSON format", () => {
    const json = JSON.stringify([
      { pattern: "*.rs", languageId: "rust" },
      { pattern: "**/*.py", languageId: "python" },
    ]);

    const mappings = LanguageMappingConfig.parseFromJSON(json);
    expect(mappings).toEqual([
      { pattern: "*.rs", languageId: "rust" },
      { pattern: "**/*.py", languageId: "python" },
    ]);
  });

  it("should handle invalid JSON", () => {
    expect(LanguageMappingConfig.parseFromJSON("invalid json")).toEqual([]);
    expect(LanguageMappingConfig.parseFromJSON("{}")).toEqual([]);
    expect(LanguageMappingConfig.parseFromJSON('{"not": "array"}')).toEqual([]);
  });

  it("should create with TypeScript defaults", () => {
    const config = LanguageMappingConfig.createWithDefaults();
    
    expect(config.getLanguageId("app.ts")).toBe("typescript");
    expect(config.getLanguageId("component.tsx")).toBe("typescriptreact");
    expect(config.getLanguageId("script.js")).toBe("javascript");
    expect(config.getLanguageId("component.jsx")).toBe("javascriptreact");
    expect(config.getLanguageId("main.rs")).toBe(null);
  });

  it("should handle complex glob patterns", () => {
    const config = new LanguageMappingConfig([
      { pattern: "packages/*/src/**/*.ts", languageId: "typescript-monorepo" },
      { pattern: "**/__tests__/**/*.js", languageId: "javascript-test" },
      { pattern: "{src,lib}/**/*.py", languageId: "python-source" },
    ]);

    expect(config.getLanguageId("packages/app/src/index.ts")).toBe("typescript-monorepo");
    expect(config.getLanguageId("modules/__tests__/util.test.js")).toBe("javascript-test");
    expect(config.getLanguageId("src/models/user.py")).toBe("python-source");
    expect(config.getLanguageId("lib/helpers/format.py")).toBe("python-source");
  });
});