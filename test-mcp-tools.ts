#!/usr/bin/env ts-node
// Test MCP list_tools for different language modes

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testLanguageMode(language: string, lspCommand?: string) {
  console.log(`\n=== Testing ${language.toUpperCase()} mode ===`);
  
  const args: string[] = [path.join(__dirname, "dist/lsmcp.js"), "-l", language];
  if (lspCommand) {
    args.push("--bin", lspCommand);
  }
  
  const transport = new StdioClientTransport({
    command: "node",
    args,
    env: process.env,
  });

  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    console.log("Connected to MCP server");
    
    // Call list_tools
    const result = await client.callTool({
      name: "list_tools",
      arguments: {}
    });
    
    const text = result.content[0].text;
    
    // Check what tools are listed
    const hasTypeScriptTools = text.includes("TypeScript Tools");
    const hasLSPTools = text.includes("LSP Tools");
    const hasMoveFile = text.includes("move_file");
    const hasGetModuleSymbols = text.includes("get_module_symbols");
    
    console.log(`- Has TypeScript Tools section: ${hasTypeScriptTools}`);
    console.log(`- Has LSP Tools section: ${hasLSPTools}`);
    console.log(`- Has move_file (TS-specific): ${hasMoveFile}`);
    console.log(`- Has get_module_symbols (TS-specific): ${hasGetModuleSymbols}`);
    
    // Print first 500 chars of output
    console.log("\nFirst 500 chars of output:");
    console.log(text.substring(0, 500) + "...");
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

async function main() {
  console.log("Testing list_tools output for different language modes...");
  
  // Test TypeScript mode
  await testLanguageMode("typescript");
  
  // Test F# mode  
  await testLanguageMode("fsharp");
  
  // Test Rust mode
  await testLanguageMode("rust");
}

main().catch(console.error);