import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VaultService } from "./services/vault.js";
import { registerAllTools } from "./tools/index.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

export function createServer(vaultPath: string): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const vault = new VaultService(vaultPath);
  registerAllTools(server, vault);

  return server;
}
