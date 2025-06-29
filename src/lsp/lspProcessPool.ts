import { type ChildProcess, spawn } from "node:child_process";
import { createLSPClient, type LSPClient } from "./lspClient.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface PooledLSPClient {
  client: LSPClient;
  process: ChildProcess;
  refCount: number;
}

interface LSPProcessPoolState {
  pool: Map<string, PooledLSPClient>;
  initPromises: Map<string, Promise<PooledLSPClient>>;
}

// Create the singleton state
const poolState: LSPProcessPoolState = {
  pool: new Map(),
  initPromises: new Map(),
};

async function createClient(root: string): Promise<PooledLSPClient> {
  const useNativePreview = process.env.USE_TSGO === "true";

  // Use direct node_modules/.bin path to avoid npx overhead
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tsLangServerPath = path.join(
    __dirname,
    "../../node_modules/.bin/typescript-language-server",
  );
  const tsgoPath = path.join(
    __dirname,
    "../../node_modules/.bin/@typescript/native-preview",
  );

  const command = useNativePreview
    ? [tsgoPath, "--", "--lsp", "--stdio"]
    : [tsLangServerPath, "--stdio"];

  const lspProcess = spawn(command[0], command.slice(1), {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const client = createLSPClient({
    rootPath: root,
    process: lspProcess,
    languageId: "typescript",
  });

  await client.start();

  return {
    client,
    process: lspProcess,
    refCount: 1,
  };
}

async function cleanup(pooledClient: PooledLSPClient): Promise<void> {
  try {
    await pooledClient.client.stop();
  } catch {
    // Ignore errors during cleanup
  }
}

async function acquire(root: string): Promise<PooledLSPClient> {
  // Check if we already have a client for this root
  const existing = poolState.pool.get(root);
  if (existing) {
    existing.refCount++;
    return existing;
  }

  // Check if initialization is already in progress
  const initPromise = poolState.initPromises.get(root);
  if (initPromise) {
    return initPromise;
  }

  // Create initialization promise
  const promise = createClient(root);
  poolState.initPromises.set(root, promise);

  try {
    const pooledClient = await promise;
    poolState.pool.set(root, pooledClient);
    return pooledClient;
  } finally {
    poolState.initPromises.delete(root);
  }
}

async function release(root: string): Promise<void> {
  const pooledClient = poolState.pool.get(root);
  if (!pooledClient) {
    return;
  }

  pooledClient.refCount--;
  if (pooledClient.refCount <= 0) {
    // Remove from pool and cleanup
    poolState.pool.delete(root);
    await cleanup(pooledClient);
  }
}

async function shutdown(): Promise<void> {
  const cleanupPromises: Promise<void>[] = [];

  for (const [root, pooledClient] of poolState.pool.entries()) {
    poolState.pool.delete(root);
    cleanupPromises.push(cleanup(pooledClient));
  }

  await Promise.all(cleanupPromises);
}

// Export the pool interface
export const lspProcessPool = {
  acquire,
  release,
  shutdown,
};
