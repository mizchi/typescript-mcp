import { describe, expect, it } from "vitest";
import { formatError, toolErr, toolOk, tryCatch } from "./errorHandling.ts";

describe("errorHandling", () => {
  describe("toolOk", () => {
    it("should create a success result", () => {
      const result = toolOk("success");
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result._unsafeUnwrap()).toBe("success");
    });

    it("should work with complex objects", () => {
      const data = { id: 1, name: "test" };
      const result = toolOk(data);
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(data);
    });
  });

  describe("toolErr", () => {
    it("should create an error result", () => {
      const result = toolErr("error message");
      expect(result.isErr()).toBe(true);
      expect(result.isOk()).toBe(false);
      expect(result._unsafeUnwrapErr()).toEqual({ error: "error message" });
    });

    it("should include details when provided", () => {
      const details = { code: "ERR_001", context: "test" };
      const result = toolErr("error message", details);
      expect(result._unsafeUnwrapErr()).toEqual({
        error: "error message",
        details,
      });
    });
  });

  describe("tryCatch", () => {
    it("should return success result for successful operations", async () => {
      const operation = async () => "success";
      const result = await tryCatch(operation, "Operation failed");
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe("success");
    });

    it("should return error result for failed operations", async () => {
      const error = new Error("Test error");
      const operation = async () => {
        throw error;
      };
      const result = await tryCatch(operation, "Operation failed");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toEqual({
        error: "Operation failed",
        details: error,
      });
    });

    it("should handle non-Error thrown values", async () => {
      const operation = async () => {
        throw "string error";
      };
      const result = await tryCatch(operation, "Operation failed");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toEqual({
        error: "Operation failed",
        details: "string error",
      });
    });
  });

  describe("formatError", () => {
    it("should format error with Error details", () => {
      const error = {
        error: "Operation failed",
        details: new Error("Detailed error message"),
      };
      const formatted = formatError(error);
      expect(formatted).toBe("Operation failed: Detailed error message");
    });

    it("should return error message when no details", () => {
      const error = { error: "Operation failed" };
      const formatted = formatError(error);
      expect(formatted).toBe("Operation failed");
    });

    it("should return error message for non-Error details", () => {
      const error = { error: "Operation failed", details: { code: 123 } };
      const formatted = formatError(error);
      expect(formatted).toBe("Operation failed");
    });
  });
});
