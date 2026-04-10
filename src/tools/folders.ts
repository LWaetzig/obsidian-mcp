import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultService } from "../services/vault.js";
import { errorResponse } from "../utils/errors.js";
import { formatFolderList } from "../utils/format.js";
import { sharedResponseFormat } from "./shared.js";

export function registerFolderTools(
  server: McpServer,
  vault: VaultService,
): void {
  // MARK: LIST FOLDERS

  server.registerTool(
    "obsidian_list_folders",
    {
      title: "List Folders",
      description: `List all folders in the vault (or a subfolder), with note counts.

Hidden directories (those starting with .) such as .obsidian and .trash are
automatically excluded.

Args:
  - folder (string, optional): Vault-relative path to list subfolders of (default: vault root)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: List of folders with vault-relative paths, names, and note counts.`,
      inputSchema: z.object({
        folder: z
          .string()
          .optional()
          .describe(
            "Vault-relative folder to list subfolders of (default: vault root)",
          ),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ folder, response_format }) => {
      try {
        const folders = await vault.listFolders(folder);
        return {
          content: [
            { type: "text", text: formatFolderList(folders, response_format) },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: CREATE FOLDER

  server.registerTool(
    "obsidian_create_folder",
    {
      title: "Create Folder",
      description: `Create a new folder in the vault. Parent folders are created as needed.

Creating a folder that already exists is a no-op (idempotent).

Args:
  - path (string): Vault-relative path for the new folder, e.g. "projects/2025"

Returns: Confirmation message.`,
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("Vault-relative path for the new folder"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path }) => {
      try {
        await vault.createFolder(path);
        return { content: [{ type: "text", text: `Folder created: ${path}` }] };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );
}
