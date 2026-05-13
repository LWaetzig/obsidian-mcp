/**
 * Application-wide constants.
 *
 * Adjust `CHARACTER_LIMIT`, `DEFAULT_PAGE_SIZE`, and `MAX_PAGE_SIZE` to tune
 * response sizes and pagination behaviour across all MCP tools.
 *
 * @packageDocumentation
 */

/** Name reported by the MCP server during capability negotiation. */
export const SERVER_NAME = "obsidian-mcp-server";

/** Current semantic version of the MCP server. */
export const SERVER_VERSION = "0.1.0";

/** Maximum characters returned in a single tool response before truncation. */
export const CHARACTER_LIMIT = 25_000;

/** Default page size for paginated list and search results. */
export const DEFAULT_PAGE_SIZE = 20;

/** Upper bound on the `limit` parameter accepted by paginated tools. */
export const MAX_PAGE_SIZE = 100;

/** Maximum file size to read into memory (5 MB). Files larger than this are rejected. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** File extension used to identify Obsidian notes. */
export const NOTE_EXTENSION = ".md";
