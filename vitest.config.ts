import { defineConfig } from "vitest/config";

const isCI = process.env.CI === "true";
const isIntegration = process.env.TEST_TYPE === "integration";

export default defineConfig({
  test: {
    includeSource: ["src/**/*.ts"],
    // Use different pool strategies for CI and local development
    pool: isCI ? "forks" : "threads",
    silent: true,
    poolOptions: {
      threads: {
        // Use more threads for better parallelization
        singleThread: false,
        minThreads: 2,
        maxThreads: 4,
      },
      forks: {
        singleFork: false, // Allow multiple processes for better parallelization
        minThreads: 1,
        maxThreads: isCI ? 4 : 2,
      },
    },
    // Increase concurrent test execution
    maxConcurrency: isCI ? 10 : 5,
    // Only use global setup for integration tests
    globalSetup: isIntegration ? "./tests/globalSetup.ts" : undefined,
    // Different timeouts for unit vs integration tests
    testTimeout: isIntegration ? 30000 : 5000, // 30s for integration, 5s for unit
    hookTimeout: isIntegration ? 30000 : 5000,
    // Add hanging process reporter in CI to debug test hanging
    reporters: isCI ? ["default", "hanging-process"] : ["default"],
    // Force exit after tests complete in CI
    teardownTimeout: isCI ? 5000 : undefined,
  },
});
