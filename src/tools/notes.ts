import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultService } from "../services/vault.js";
import { ResponseFormat } from "../types.js";
import { errorResponse } from "../utils/errors.js";
import {
  formatNoteContent,
  formatNoteMeta,
  formatNoteList,
} from "../utils/format.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { sharedPagination, sharedResponseFormat } from "./shared.js";

export function registerNoteTools(
  server: McpServer,
  vault: VaultService,
): void {
  // MARK: LIST NOTES

  server.registerTool(
    "obsidian_list_notes",
    {
      title: "List Notes",
      description: `List markdown notes in the Obsidian vault, optionally scoped to a folder.

Returns note paths, names, tags, and modification dates. Results are paginated.

Args:
  - folder (string, optional): Vault-relative folder to list (default: vault root)
  - limit (number): Max results per page, 1–${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - offset (number): Pagination offset (default: 0)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Paginated list with total, count, has_more, and next_offset.`,
      inputSchema: z.object({
        folder: z
          .string()
          .optional()
          .describe('Vault-relative folder path, e.g. "projects"'),
        ...sharedPagination,
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ folder, limit, offset, response_format }) => {
      try {
        const result = await vault.listNotes(folder, limit, offset);
        return {
          content: [
            { type: "text", text: formatNoteList(result, response_format) },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: READ NOTE

  server.registerTool(
    "obsidian_read_note",
    {
      title: "Read Note",
      description: `Read the full content of an Obsidian note by its vault-relative path.

Accepts paths with or without the .md extension. Returns the note body, parsed
frontmatter, all tags (inline and frontmatter), and file timestamps.

Args:
  - path (string): Vault-relative path, e.g. "projects/my-note" or "projects/my-note.md"
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Full note content with frontmatter, body, tags, and file metadata.`,
      inputSchema: z.object({
        path: z.string().min(1).describe("Vault-relative path to the note"),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path, response_format }) => {
      try {
        const note = await vault.readNote(path);
        return {
          content: [
            { type: "text", text: formatNoteContent(note, response_format) },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: CREATE NOTE

  server.registerTool(
    "obsidian_create_note",
    {
      title: "Create Note",
      description: `Create a new Obsidian note. Fails by default if the note already exists.

Parent folders are created automatically. Frontmatter is serialized as YAML at the
top of the file. Use overwrite=true to replace an existing note.

Args:
  - path (string): Vault-relative path for the new note, e.g. "projects/new-idea"
  - body (string): Markdown content for the note body
  - frontmatter (object, optional): Key-value pairs to include as YAML frontmatter
  - overwrite (boolean): Replace the note if it already exists (default: false)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Metadata of the created note.

Errors:
  - "Note already exists" if the note exists and overwrite=false`,
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("Vault-relative path for the new note"),
        body: z.string().describe("Markdown content for the note body"),
        frontmatter: z
          .record(z.unknown())
          .optional()
          .describe("YAML frontmatter key-value pairs"),
        overwrite: z
          .boolean()
          .default(false)
          .describe("Replace the note if it already exists"),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ path, body, frontmatter, overwrite, response_format }) => {
      try {
        if (!overwrite) {
          try {
            await vault.getNoteMeta(path);
            return errorResponse(
              new Error(
                `Note already exists: ${path}. Use overwrite=true to replace it, ` +
                  "or use obsidian_update_note to overwrite intentionally.",
              ),
            );
          } catch (e) {
            // ENOENT = note does not exist → good, proceed
            if (!(e instanceof Error && e.message.startsWith("Note not found")))
              throw e;
          }
        }

        const meta = await vault.writeNote(path, body, frontmatter);
        return {
          content: [
            {
              type: "text",
              text: `Note created.\n\n${formatNoteMeta(meta, response_format)}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: UPDATE NOTE

  server.registerTool(
    "obsidian_update_note",
    {
      title: "Update Note",
      description: `Overwrite the full content of an existing Obsidian note.

Replaces the entire note including frontmatter. Use obsidian_append_to_note to
add content non-destructively. Creates the note if it does not exist.

Args:
  - path (string): Vault-relative path to the note
  - body (string): New markdown body content
  - frontmatter (object, optional): New frontmatter (replaces existing frontmatter)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Updated note metadata.`,
      inputSchema: z.object({
        path: z.string().min(1).describe("Vault-relative path to the note"),
        body: z.string().describe("New markdown content for the note body"),
        frontmatter: z
          .record(z.unknown())
          .optional()
          .describe(
            "New YAML frontmatter — replaces existing frontmatter entirely",
          ),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path, body, frontmatter, response_format }) => {
      try {
        const meta = await vault.writeNote(path, body, frontmatter);
        return {
          content: [
            {
              type: "text",
              text: `Note updated.\n\n${formatNoteMeta(meta, response_format)}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: APPEND TO NOTE

  server.registerTool(
    "obsidian_append_to_note",
    {
      title: "Append to Note",
      description: `Append content to the end of a note. Creates the note if it does not exist.

A newline separator is inserted automatically if the existing content does not
end with one. Useful for daily notes, logs, and running task lists.

Args:
  - path (string): Vault-relative path to the note
  - content (string): Markdown content to append
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Updated note metadata.`,
      inputSchema: z.object({
        path: z.string().min(1).describe("Vault-relative path to the note"),
        content: z.string().describe("Content to append to the note"),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ path, content, response_format }) => {
      try {
        const meta = await vault.appendToNote(path, content);
        return {
          content: [
            {
              type: "text",
              text: `Content appended.\n\n${formatNoteMeta(meta, response_format)}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: DELETE NOTE

  server.registerTool(
    "obsidian_delete_note",
    {
      title: "Delete Note",
      description: `Permanently delete an Obsidian note from the vault.

This action removes the file from disk and cannot be undone (unless the vault
uses a version-control system). Does NOT update backlinks in other notes.

Args:
  - path (string): Vault-relative path to the note

Returns: Confirmation message.

Errors:
  - "Note not found" if the file does not exist`,
      inputSchema: z.object({
        path: z.string().min(1).describe("Vault-relative path to the note"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ path }) => {
      try {
        await vault.deleteNote(path);
        return { content: [{ type: "text", text: `Note deleted: ${path}` }] };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: MOVE / RENAME NOTE

  server.registerTool(
    "obsidian_move_note",
    {
      title: "Move or Rename Note",
      description: `Move or rename an Obsidian note to a new vault-relative path.

Parent folders at the destination are created automatically. Does NOT update
[[wikilinks]] that point to the old path in other notes.

Args:
  - from_path (string): Current vault-relative path
  - to_path (string): New vault-relative path
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Metadata of the note at its new path.

Errors:
  - "Source note not found" if from_path does not exist`,
      inputSchema: z.object({
        from_path: z.string().min(1).describe("Current vault-relative path"),
        to_path: z.string().min(1).describe("New vault-relative path"),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ from_path, to_path, response_format }) => {
      try {
        const meta = await vault.moveNote(from_path, to_path);
        return {
          content: [
            {
              type: "text",
              text: `Note moved to ${to_path}.\n\n${formatNoteMeta(meta, response_format)}`,
            },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: GET NOTE METADATA

  server.registerTool(
    "obsidian_get_note_metadata",
    {
      title: "Get Note Metadata",
      description: `Read only the frontmatter metadata of a note, without returning its full body.

More efficient than obsidian_read_note when you only need tags, dates, or custom
frontmatter fields.

Args:
  - path (string): Vault-relative path to the note
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Note path, name, frontmatter key-value pairs, tags, and timestamps.`,
      inputSchema: z.object({
        path: z.string().min(1).describe("Vault-relative path to the note"),
        response_format: sharedResponseFormat,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path, response_format }) => {
      try {
        const meta = await vault.getNoteMeta(path);
        return {
          content: [
            { type: "text", text: formatNoteMeta(meta, response_format) },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );
}
