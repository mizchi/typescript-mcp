import { defineConfig } from "vitest/config";

const isCI = process.env.CI === "true";

export default defineConfig({
  test: {
    includeSource: ["src/**/*.ts"],
    // Use different pool strategies for CI and local development
    pool: isCI ? "forks" : "threads",
    silent: true,
    poolOptions: {
      threads: {
        // Use single thread in local to avoid Claude Code interference
        singleThread: !isCI,
        // Allow more threads in CI
        minThreads: isCI ? 2 : 1,
        maxThreads: isCI ? 4 : 1,
      },
      forks: {
        singleFork: true, // Run all tests in a single process in CI
      },
    },
    // Limit concurrent test execution for LSP tests
    maxConcurrency: isCI ? 5 : 1,
    // Disable global setup for TypeScript tests
    // globalSetup: "./tests/globalSetup.ts",
    // Increase timeout for LSP-heavy tests
    testTimeout: isCI ? 60000 : 30000, // 60 seconds in CI, 30 seconds locally
    hookTimeout: isCI ? 60000 : 30000, // 60 seconds in CI, 30 seconds locally
    // Add hanging process reporter in CI to debug test hanging
    reporters: isCI ? ["default", "hanging-process"] : ["default"],
    // Force exit after tests complete in CI
    teardownTimeout: isCI ? 5000 : undefined,
  },
});
