import { err, ok, Result } from "neverthrow";

export type ToolError = {
  error: string;
  details?: unknown;
};

export type ToolResult<T> = Result<T, ToolError>;

/**
 * Create a success result
 */
export function toolOk<T>(value: T): ToolResult<T> {
  return ok(value);
}

/**
 * Create an error result
 */
export function toolErr(error: string, details?: unknown): ToolResult<never> {
  return err({ error, details });
}

/**
 * Handle async operations with proper error handling
 */
export async function tryCatch<T>(
  operation: () => Promise<T>,
  errorMessage: string,
): Promise<ToolResult<T>> {
  try {
    const result = await operation();
    return toolOk(result);
  } catch (error) {
    return toolErr(errorMessage, error);
  }
}

/**
 * Format error for user display
 */
export function formatError(error: ToolError): string {
  if (error.details && error.details instanceof Error) {
    return `${error.error}: ${error.details.message}`;
  }
  return error.error;
}
