/**
 * MCP server factory.
 *
 * Wires together the {@link VaultService} and the tool registry,
 * returning a configured server ready to accept a transport connection.
 *
 * @packageDocumentation
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VaultService } from "./services/vault.js";
import { registerAllTools } from "./tools/index.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

/**
 * Create and configure the MCP server for the given vault path.
 *
 * Instantiates a {@link VaultService} for the vault, registers all MCP tool
 * handlers, and returns the server ready to be connected to a transport.
 *
 * @param vaultPath - Absolute path to the Obsidian vault directory.
 * @returns A configured {@link McpServer} instance.
 *
 * @example
 * ```ts
 * const server = createServer("/path/to/vault");
 * await server.connect(new StdioServerTransport());
 * ```
 */
export function createServer(vaultPath: string): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const vault = new VaultService(vaultPath);
  registerAllTools(server, vault);

  return server;
}
