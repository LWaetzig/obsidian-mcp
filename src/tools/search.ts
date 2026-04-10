import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VaultService } from "../services/vault.js";
import { errorResponse } from "../utils/errors.js";
import { formatSearchResults, formatNoteList } from "../utils/format.js";
import { MAX_PAGE_SIZE } from "../constants.js";
import { sharedPagination, sharedResponseFormat } from "./shared.js";

export function registerSearchTools(
  server: McpServer,
  vault: VaultService,
): void {
  // MARK: FULL-TEXT SEARCH

  server.registerTool(
    "obsidian_search_notes",
    {
      title: "Search Notes",
      description: `Full-text search across all notes in the vault.

Case-insensitive substring match over note bodies and frontmatter. Returns
matching excerpts with up to one line of surrounding context.

Args:
  - query (string): Search string (case-insensitive, minimum 1 character)
  - limit (number): Max results per page, 1–${MAX_PAGE_SIZE} (default: 20)
  - offset (number): Pagination offset (default: 0)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Paginated list of matches — file path, line number, and context excerpt.

Examples:
  - Find meeting notes about Q2: query="Q2 meeting"
  - Find all TODO items: query="- [ ]"`,
      inputSchema: z.object({
        query: z
          .string()
          .min(1, "Query must not be empty")
          .describe("Search string"),
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
    async ({ query, limit, offset, response_format }) => {
      try {
        const result = await vault.searchContent(query, limit, offset);
        return {
          content: [
            {
              type: "text",
              text: formatSearchResults(result, query, response_format),
            },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );

  // MARK: SEARCH BY TAG

  server.registerTool(
    "obsidian_search_by_tag",
    {
      title: "Search Notes by Tag",
      description: `Find all notes that have a specific tag.

Searches both inline tags (#tagname in the body) and frontmatter tag arrays.
The # prefix is optional — "project" and "#project" are equivalent.

Args:
  - tag (string): Tag to search for (with or without # prefix)
  - limit (number): Max results per page, 1–${MAX_PAGE_SIZE} (default: 20)
  - offset (number): Pagination offset (default: 0)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Paginated list of notes that carry the specified tag.

Examples:
  - All notes tagged "project": tag="project"
  - All notes tagged "#meeting": tag="#meeting"`,
      inputSchema: z.object({
        tag: z
          .string()
          .min(1, "Tag must not be empty")
          .describe("Tag to search for (# prefix optional)"),
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
    async ({ tag, limit, offset, response_format }) => {
      try {
        const result = await vault.searchByTag(tag, limit, offset);
        const label = tag.startsWith("#") ? tag : `#${tag}`;

        if (result.total === 0) {
          return {
            content: [
              { type: "text", text: `No notes found with tag ${label}` },
            ],
          };
        }

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

  // MARK: BACKLINKS

  server.registerTool(
    "obsidian_get_backlinks",
    {
      title: "Get Backlinks",
      description: `Find all notes that link to a given note using Obsidian wiki-link syntax.

Matches [[note-name]], [[folder/note-name]], and aliased links [[note|alias]].
The search is case-insensitive. The target note itself is excluded from results.

Args:
  - path (string): Vault-relative path of the note to find backlinks for
  - limit (number): Max results per page, 1–${MAX_PAGE_SIZE} (default: 20)
  - offset (number): Pagination offset (default: 0)
  - response_format: 'markdown' | 'json' (default: 'markdown')

Returns: Paginated list of notes containing wiki-links to the target note,
with the matching line and surrounding context.`,
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe("Vault-relative path of the target note"),
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
    async ({ path, limit, offset, response_format }) => {
      try {
        const result = await vault.getBacklinks(path, limit, offset);

        if (result.total === 0) {
          return {
            content: [
              { type: "text", text: `No backlinks found for: ${path}` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatSearchResults(result, path, response_format),
            },
          ],
        };
      } catch (err) {
        return errorResponse(err);
      }
    },
  );
}
