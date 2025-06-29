/**
 * Simple test project creation helper
 */
import { Project } from "ts-morph";

/**
 * Create a test project with default compiler options
 */
export function createTestProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ESNext
      module: 99, // ESNext
    },
  });
}
