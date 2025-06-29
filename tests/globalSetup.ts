import { lspProcessPool } from "../src/lsp/lspProcessPool";

export function setup() {
  // Pre-warm the LSP process pool can be done here if needed
  console.log("Global setup: LSP process pool ready");
}

export async function teardown() {
  console.log("Global teardown: Shutting down LSP process pool");
  const startTime = Date.now();

  try {
    // Add timeout for shutdown
    await Promise.race([
      lspProcessPool.shutdown(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LSP shutdown timeout")), 15000)
      ),
    ]);

    console.log(
      `Global teardown: LSP process pool shutdown completed in ${
        Date.now() - startTime
      }ms`,
    );
  } catch (error) {
    console.error(
      "Global teardown: Failed to shutdown LSP process pool:",
      error,
    );
    // Force exit in CI to prevent hanging
    if (process.env.CI === "true") {
      process.exit(0);
    }
  }
}
