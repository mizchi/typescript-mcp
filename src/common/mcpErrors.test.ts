import { describe, expect, it } from "vitest";
import { CommonErrors, MCPToolError } from "./mcpErrors.ts";

describe("mcpErrors", () => {
  describe("MCPToolError", () => {
    it("should create error with basic properties", () => {
      const error = new MCPToolError("Test error", "TEST_ERROR");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.name).toBe("MCPToolError");
      expect(error.suggestions).toEqual([]);
      expect(error.relatedTools).toEqual([]);
    });

    it("should create error with suggestions and related tools", () => {
      const suggestions = ["Try this", "Or try that"];
      const relatedTools = ["tool1", "tool2"];
      const error = new MCPToolError(
        "Test error",
        "TEST_ERROR",
        suggestions,
        relatedTools,
      );
      expect(error.suggestions).toEqual(suggestions);
      expect(error.relatedTools).toEqual(relatedTools);
    });

    describe("format", () => {
      it("should format basic error", () => {
        const error = new MCPToolError("Test error", "TEST_ERROR");
        const formatted = error.format();
        expect(formatted).toContain("❌ Error: Test error");
        expect(formatted).toContain("Code: TEST_ERROR");
      });

      it("should format error with suggestions", () => {
        const error = new MCPToolError(
          "Test error",
          "TEST_ERROR",
          ["Fix issue A", "Check configuration B"],
        );
        const formatted = error.format();
        expect(formatted).toContain("💡 Suggestions:");
        expect(formatted).toContain("• Fix issue A");
        expect(formatted).toContain("• Check configuration B");
      });

      it("should format error with related tools", () => {
        const error = new MCPToolError(
          "Test error",
          "TEST_ERROR",
          [],
          ["alternative_tool", "backup_tool"],
        );
        const formatted = error.format();
        expect(formatted).toContain("🔧 Alternative tools you can try:");
        expect(formatted).toContain("• alternative_tool");
        expect(formatted).toContain("• backup_tool");
      });

      it("should format error with all properties", () => {
        const error = new MCPToolError(
          "Complete error",
          "COMPLETE_ERROR",
          ["Suggestion 1", "Suggestion 2"],
          ["tool_a", "tool_b"],
        );
        const formatted = error.format();
        expect(formatted).toContain("❌ Error: Complete error");
        expect(formatted).toContain("Code: COMPLETE_ERROR");
        expect(formatted).toContain("💡 Suggestions:");
        expect(formatted).toContain("🔧 Alternative tools you can try:");
      });
    });
  });

  describe("CommonErrors", () => {
    describe("LSP_NOT_RUNNING", () => {
      it("should create LSP not running error", () => {
        const error = CommonErrors.LSP_NOT_RUNNING();
        expect(error.code).toBe("LSP_NOT_RUNNING");
        expect(error.message).toContain("LSP server is not running");
        expect(error.suggestions).toHaveLength(3);
        expect(error.relatedTools).toHaveLength(2);
      });
    });

    describe("FILE_NOT_FOUND", () => {
      it("should create file not found error", () => {
        const error = CommonErrors.FILE_NOT_FOUND("/path/to/missing.ts");
        expect(error.code).toBe("FILE_NOT_FOUND");
        expect(error.message).toContain("/path/to/missing.ts");
        expect(error.suggestions).toHaveLength(3);
      });
    });

    describe("INVALID_LINE_NUMBER", () => {
      it("should create invalid line number error with number", () => {
        const error = CommonErrors.INVALID_LINE_NUMBER(100, 50);
        expect(error.code).toBe("INVALID_LINE_NUMBER");
        expect(error.message).toContain("100");
        expect(error.message).toContain("50 lines");
        expect(error.suggestions[2]).toContain("1-50");
      });

      it("should create invalid line number error with string", () => {
        const error = CommonErrors.INVALID_LINE_NUMBER("unknown line", 25);
        expect(error.message).toContain("unknown line");
        expect(error.message).toContain("25 lines");
      });
    });

    describe("SYMBOL_NOT_FOUND", () => {
      it("should create symbol not found error without line", () => {
        const error = CommonErrors.SYMBOL_NOT_FOUND("myFunction");
        expect(error.code).toBe("SYMBOL_NOT_FOUND");
        expect(error.message).toBe('Symbol "myFunction" not found');
        expect(error.relatedTools).toContain("find_references");
      });

      it("should create symbol not found error with line", () => {
        const error = CommonErrors.SYMBOL_NOT_FOUND("myVariable", 42);
        expect(error.message).toBe('Symbol "myVariable" not found on line 42');
      });
    });

    describe("RESPONSE_TOO_LARGE", () => {
      it("should create response too large error", () => {
        const error = CommonErrors.RESPONSE_TOO_LARGE(50000, 25000);
        expect(error.code).toBe("RESPONSE_TOO_LARGE");
        expect(error.message).toContain("50000 tokens");
        expect(error.message).toContain("25000 tokens");
        expect(error.suggestions).toHaveLength(4);
      });
    });

    describe("PARAMETER_REQUIRED", () => {
      it("should create parameter required error without description", () => {
        const error = CommonErrors.PARAMETER_REQUIRED("filePath");
        expect(error.code).toBe("PARAMETER_REQUIRED");
        expect(error.message).toContain("filePath");
        expect(error.suggestions[0]).toContain(
          "filePath parameter is required",
        );
      });

      it("should create parameter required error with description", () => {
        const error = CommonErrors.PARAMETER_REQUIRED(
          "root",
          "The root directory path is required to resolve relative paths",
        );
        expect(error.suggestions[0]).toBe(
          "The root directory path is required to resolve relative paths",
        );
      });
    });
  });
});
