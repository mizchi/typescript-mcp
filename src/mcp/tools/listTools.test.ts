import { describe, expect, it } from "vitest";
import { listToolsTool } from "./listTools.ts";

describe("listToolsTool", () => {
  it("should list all tools by default", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    expect(result).toContain("Available MCP Tools");
    expect(result).toContain("TypeScript Tools (Compiler API)");
    expect(result).toContain("LSP Tools (Language Server Protocol)");

    // Check for some TypeScript tools
    expect(result).toContain("move_file");
    expect(result).toContain("get_module_symbols");
    expect(result).toContain("search_symbols");

    // Check for some LSP tools
    expect(result).toContain("lsp_get_hover");
    expect(result).toContain("lsp_find_references");
    expect(result).toContain("lsp_rename_symbol");
  });

  it("should filter by typescript category", async () => {
    const result = await listToolsTool.execute({ category: "typescript" });

    expect(result).toContain("TypeScript Tools (Compiler API)");
    expect(result).not.toContain("LSP Tools (Language Server Protocol)");

    // Should include TypeScript tools
    expect(result).toContain("move_file");
    expect(result).toContain("get_module_symbols");
    expect(result).toContain("search_symbols");

    // Should not include LSP tools
    expect(result).not.toContain("lsp_get_hover");
    expect(result).not.toContain("lsp_find_references");
  });

  it("should filter by lsp category", async () => {
    const result = await listToolsTool.execute({ category: "lsp" });

    expect(result).not.toContain("TypeScript Tools (Compiler API)");
    expect(result).toContain("LSP Tools (Language Server Protocol)");

    // Should include LSP tools
    expect(result).toContain("lsp_get_hover");
    expect(result).toContain("lsp_find_references");
    expect(result).toContain("lsp_get_completion");

    // Should not include TypeScript tools
    expect(result).not.toContain("### move_file");
    expect(result).not.toContain("### get_module_symbols");
  });

  it("should show all tools when category is 'all'", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    expect(result).toContain("TypeScript Tools (Compiler API)");
    expect(result).toContain("LSP Tools (Language Server Protocol)");

    // Should include both categories
    expect(result).toContain("move_file");
    expect(result).toContain("lsp_find_references");
  });

  it("should include tool descriptions", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    // Check for some descriptions
    expect(result).toContain("Move a TypeScript/JavaScript file");
    expect(result).toContain("Get hover information");
    expect(result).toContain("Search for symbols across the entire project");
  });

  it("should show LSP requirement indicator", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    // Check that LSP tools are under LSP section
    expect(result).toContain("lsp_get_hover");
    expect(result).toContain("lsp_rename_symbol");
  });

  it("should show tips section", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    expect(result).toContain("💡 Tips");
    expect(result).toContain("Use TypeScript tools for fast");
  });

  it("should count tools correctly", async () => {
    const result = await listToolsTool.execute({ category: "typescript" });

    // Should show TypeScript Tools section
    expect(result).toContain("TypeScript Tools (Compiler API)");
  });

  it("should have proper formatting", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    // Check for proper structure
    expect(result).toContain("##"); // Markdown headers
    expect(result).toContain("###"); // Tool headers
    expect(result).toContain("🔧"); // TypeScript emoji
    expect(result).toContain("🌐"); // LSP emoji
  });

  it("should group tools by category", async () => {
    const result = await listToolsTool.execute({ category: "all" });

    // TypeScript tools should come before LSP tools
    const tsIndex = result.indexOf("TypeScript Tools (Compiler API)");
    const lspIndex = result.indexOf("LSP Tools (Language Server Protocol)");

    expect(tsIndex).toBeGreaterThan(-1);
    expect(lspIndex).toBeGreaterThan(-1);
    expect(tsIndex).toBeLessThan(lspIndex);
  });
});
