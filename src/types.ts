export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

/** Metadata extracted from a note's frontmatter and file stats. */
export interface NoteMeta {
  /** Vault-relative path including extension, e.g. "projects/my-note.md" */
  path: string;
  /** File name without extension, e.g. "my-note" */
  name: string;
  /** Parsed YAML frontmatter key-value pairs */
  frontmatter: Record<string, unknown>;
  /** Merged tag list from frontmatter and inline #tags (no # prefix) */
  tags: string[];
  created?: Date;
  modified?: Date;
}

/** Full note content including body and raw source. */
export interface NoteContent extends NoteMeta {
  /** Markdown body with frontmatter stripped */
  body: string;
  /** Original full file content */
  raw: string;
}

/** A single match from a full-text or backlink search. */
export interface SearchMatch {
  /** Vault-relative path */
  path: string;
  /** File name without extension */
  name: string;
  /** 1–3 surrounding context lines */
  excerpt: string;
  /** 1-indexed line number of the match */
  lineNumber: number;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

/** Folder info including note count. */
export interface FolderInfo {
  /** Vault-relative path, e.g. "projects/2025" */
  path: string;
  /** Folder name only, e.g. "2025" */
  name: string;
  noteCount: number;
}
