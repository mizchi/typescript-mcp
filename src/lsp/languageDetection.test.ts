import { describe, it, expect } from "vitest";
import { getLanguageIdFromPath } from "./languageDetection.ts";

describe("getLanguageIdFromPath", () => {
  it("should detect TypeScript files", () => {
    expect(getLanguageIdFromPath("/path/to/file.ts")).toBe("typescript");
    expect(getLanguageIdFromPath("file.tsx")).toBe("typescriptreact");
    expect(getLanguageIdFromPath("/path/to/file.mts")).toBe("typescript");
    expect(getLanguageIdFromPath("file.cts")).toBe("typescript");
  });

  it("should detect JavaScript files", () => {
    expect(getLanguageIdFromPath("/path/to/file.js")).toBe("javascript");
    expect(getLanguageIdFromPath("file.jsx")).toBe("javascriptreact");
    expect(getLanguageIdFromPath("/path/to/file.mjs")).toBe("javascript");
    expect(getLanguageIdFromPath("file.cjs")).toBe("javascript");
  });

  it("should detect F# files", () => {
    expect(getLanguageIdFromPath("/path/to/file.fs")).toBe("fsharp");
    expect(getLanguageIdFromPath("file.fsx")).toBe("fsharp");
    expect(getLanguageIdFromPath("/path/to/file.fsi")).toBe("fsharp");
  });

  it("should detect Python files", () => {
    expect(getLanguageIdFromPath("/path/to/file.py")).toBe("python");
    expect(getLanguageIdFromPath("file.pyw")).toBe("python");
    expect(getLanguageIdFromPath("file.pyi")).toBe("python");
  });

  it("should detect other language files", () => {
    expect(getLanguageIdFromPath("file.rs")).toBe("rust");
    expect(getLanguageIdFromPath("file.go")).toBe("go");
    expect(getLanguageIdFromPath("file.java")).toBe("java");
    expect(getLanguageIdFromPath("file.cs")).toBe("csharp");
    expect(getLanguageIdFromPath("file.rb")).toBe("ruby");
    expect(getLanguageIdFromPath("file.cpp")).toBe("cpp");
    expect(getLanguageIdFromPath("file.c")).toBe("c");
  });

  it("should detect special filenames", () => {
    expect(getLanguageIdFromPath("/path/to/Dockerfile")).toBe("dockerfile");
    expect(getLanguageIdFromPath("Makefile")).toBe("makefile");
    expect(getLanguageIdFromPath("/path/to/Gemfile")).toBe("ruby");
    expect(getLanguageIdFromPath("gulpfile.js")).toBe("javascript");
  });

  it("should return plaintext for unknown extensions", () => {
    expect(getLanguageIdFromPath("file.unknown")).toBe("plaintext");
    expect(getLanguageIdFromPath("file")).toBe("plaintext");
    expect(getLanguageIdFromPath("/path/to/file.xyz")).toBe("plaintext");
  });

  it("should handle case-insensitive extensions", () => {
    expect(getLanguageIdFromPath("file.TS")).toBe("typescript");
    expect(getLanguageIdFromPath("file.PY")).toBe("python");
    expect(getLanguageIdFromPath("FILE.RS")).toBe("rust");
  });
});