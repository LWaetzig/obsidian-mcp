#!/usr/bin/env node
import fs from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function validateVaultPath(vaultPath: string): Promise<void> {
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(vaultPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`OBSIDIAN_VAULT_PATH does not exist: ${vaultPath}`);
    }
    throw err;
  }
  if (!stat.isDirectory()) {
    throw new Error(`OBSIDIAN_VAULT_PATH is not a directory: ${vaultPath}`);
  }
}

async function main(): Promise<void> {
  const vaultPath = process.env["OBSIDIAN_VAULT_PATH"];

  if (!vaultPath) {
    console.error(
      "ERROR: OBSIDIAN_VAULT_PATH environment variable is required.",
    );
    console.error("");
    console.error("Usage:");
    console.error(
      "  OBSIDIAN_VAULT_PATH=/path/to/vault npx obsidian-mcp-server",
    );
    console.error("");
    console.error("Claude Desktop config example:");
    console.error("  {");
    console.error('    "mcpServers": {');
    console.error('      "obsidian": {');
    console.error('        "command": "npx",');
    console.error('        "args": ["obsidian-mcp-server"],');
    console.error(
      '        "env": { "OBSIDIAN_VAULT_PATH": "/path/to/your/vault" }',
    );
    console.error("      }");
    console.error("    }");
    console.error("  }");
    process.exit(1);
  }

  await validateVaultPath(vaultPath);

  const server = createServer(vaultPath);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Obsidian MCP server running — vault: ${vaultPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
