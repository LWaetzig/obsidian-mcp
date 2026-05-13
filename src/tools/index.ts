/**
 * Tool registry barrel.
 *
 * Aggregates all MCP tool domains — notes, search, and folders — into a
 * single `registerAllTools` call. To add a new domain (e.g. templates,
 * canvas), create a file in this directory, export a `register*Tools`
 * function, and add it below.
 *
 * @packageDocumentation
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultService } from "../services/vault.js";
import { registerNoteTools } from "./notes.js";
import { registerSearchTools } from "./search.js";
import { registerFolderTools } from "./folders.js";

/** Register all available MCP tools on the server. */
export function registerAllTools(server: McpServer, vault: VaultService): void {
  registerNoteTools(server, vault);
  registerSearchTools(server, vault);
  registerFolderTools(server, vault);
}
