/**
 * Tool registry barrel.
 *
 * To add a new domain (e.g. templates, canvas), create a new file in this
 * directory, export a `register*Tools(server, vault)` function, and add it
 * to the `registerAllTools` call below.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultService } from "../services/vault.js";
import { registerNoteTools } from "./notes.js";
import { registerSearchTools } from "./search.js";
import { registerFolderTools } from "./folders.js";

export function registerAllTools(server: McpServer, vault: VaultService): void {
  registerNoteTools(server, vault);
  registerSearchTools(server, vault);
  registerFolderTools(server, vault);
}
