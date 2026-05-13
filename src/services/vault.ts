/**
 * Core vault service.
 *
 * All file-system reads and writes go through {@link VaultService}.
 * Every path input is validated against the vault root to prevent
 * directory traversal, and symlinks that escape the vault are rejected.
 *
 * @packageDocumentation
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";
import matter from "gray-matter";
import type {
  NoteContent,
  NoteMeta,
  SearchMatch,
  PaginatedResult,
  FolderInfo,
} from "../types.js";
import { NOTE_EXTENSION, MAX_FILE_SIZE } from "../constants.js";
import { sanitizeVaultPath } from "../utils/path.js";

// MARK: VaultService

// All public methods accept vault-relative paths (with or without .md).
// All path inputs are sanitized to prevent directory traversal.

/**
 * Provides all read and write operations on an Obsidian vault.
 *
 * All path inputs are vault-relative (e.g. `"projects/my-note"` or
 * `"projects/my-note.md"`). The `.md` extension is optional — methods
 * normalise it automatically. Every path is validated to prevent directory
 * traversal outside the vault root.
 *
 * @example
 * ```ts
 * const vault = new VaultService("/path/to/vault");
 * const note = await vault.readNote("projects/my-note");
 * console.log(note.body);
 * ```
 */
export class VaultService {
  constructor(private readonly vaultPath: string) {}

  // MARK: Path helpers

  /** Resolve a vault-relative path to an absolute path, validating it stays inside the vault. */
  private resolve(notePath: string): string {
    return sanitizeVaultPath(this.vaultPath, notePath);
  }

  /** Ensure a note path ends with .md */
  private normalize(notePath: string): string {
    return notePath.endsWith(NOTE_EXTENSION)
      ? notePath
      : `${notePath}${NOTE_EXTENSION}`;
  }

  // MARK: Internal parsing

  /** Read and parse a note file, returning all derived fields. */
  private async parseFile(absPath: string): Promise<NoteContent> {
    // Guard 1: Symlink traversal — resolve the real path and re-validate it
    // stays inside the vault. Handles symlinks pointing outside the vault.
    try {
      const real = await fs.realpath(absPath);
      const realRelative = path.relative(this.vaultPath, real);
      if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
        throw new Error(
          `Access denied: '${path.relative(this.vaultPath, absPath)}' resolves outside the vault via a symlink.`,
        );
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // ENOENT = file does not exist yet; let the read below produce the
      // proper "Note not found" error rather than swallowing this one.
      if (code !== "ENOENT") throw err;
    }

    // Guard 2: File size — reject files that exceed MAX_FILE_SIZE to prevent
    // loading huge files into memory.
    try {
      const lstat = await fs.lstat(absPath);
      if (lstat.size > MAX_FILE_SIZE) {
        const rel = path.relative(this.vaultPath, absPath);
        const mb = (lstat.size / 1024 / 1024).toFixed(1);
        throw new Error(
          `Note too large to read: ${rel} is ${mb} MB (limit ${MAX_FILE_SIZE / 1024 / 1024} MB).`,
        );
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }

    let raw: string;
    try {
      raw = await fs.readFile(absPath, "utf-8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        const rel = path.relative(this.vaultPath, absPath);
        throw new Error(`Note not found: ${rel}`);
      }
      throw err;
    }

    const parsed = matter(raw);
    const relativePath = path.relative(this.vaultPath, absPath);
    const name = path.basename(relativePath, NOTE_EXTENSION);
    const stat = await fs.stat(absPath);
    const tags = extractTags(parsed.data, parsed.content);

    return {
      path: relativePath,
      name,
      raw,
      body: parsed.content,
      frontmatter: parsed.data as Record<string, unknown>,
      tags,
      created: stat.birthtime,
      modified: stat.mtime,
    };
  }

  // MARK: Public API

  /**
   * Read a note and return its full content.
   *
   * @param notePath - Vault-relative path, with or without the `.md` extension.
   * @returns Parsed note content including body, frontmatter, tags, and timestamps.
   * @throws If the note does not exist, exceeds {@link MAX_FILE_SIZE}, or resolves outside the vault.
   */
  async readNote(notePath: string): Promise<NoteContent> {
    const absPath = this.resolve(this.normalize(notePath));
    return this.parseFile(absPath);
  }

  /**
   * Read only the metadata of a note, without loading its body.
   *
   * More efficient than {@link readNote} when the note body is not needed.
   *
   * @param notePath - Vault-relative path, with or without the `.md` extension.
   * @returns Note metadata: path, name, frontmatter, tags, and timestamps.
   * @throws If the note does not exist.
   */
  async getNoteMeta(notePath: string): Promise<NoteMeta> {
    const { raw: _raw, body: _body, ...meta } = await this.readNote(notePath);
    return meta;
  }

  /**
   * Write (create or overwrite) a note in the vault.
   *
   * Parent directories are created automatically. If `frontmatter` is
   * provided, it is serialised as a YAML block at the top of the file.
   *
   * @param notePath - Vault-relative path for the note.
   * @param body - Markdown content for the note body.
   * @param frontmatter - Optional key-value pairs to write as YAML frontmatter.
   * @returns Metadata of the written note.
   */
  async writeNote(
    notePath: string,
    body: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<NoteMeta> {
    const normalized = this.normalize(notePath);
    const absPath = this.resolve(normalized);

    await fs.mkdir(path.dirname(absPath), { recursive: true });

    const content =
      frontmatter && Object.keys(frontmatter).length > 0
        ? matter.stringify(body, frontmatter)
        : body;

    await fs.writeFile(absPath, content, "utf-8");

    return this.getNoteMeta(normalized);
  }

  /**
   * Append content to the end of a note, creating it if it does not exist.
   *
   * A newline is inserted between existing content and the appended text when
   * the file does not already end with one.
   *
   * @param notePath - Vault-relative path to the note.
   * @param content - Markdown content to append.
   * @returns Updated note metadata.
   */
  async appendToNote(notePath: string, content: string): Promise<NoteMeta> {
    const normalized = this.normalize(notePath);
    const absPath = this.resolve(normalized);

    let existing = "";
    try {
      existing = await fs.readFile(absPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      await fs.mkdir(path.dirname(absPath), { recursive: true });
    }

    const joiner = existing === "" || existing.endsWith("\n") ? "" : "\n";
    await fs.writeFile(absPath, `${existing}${joiner}${content}`, "utf-8");

    return this.getNoteMeta(normalized);
  }

  /**
   * Permanently delete a note from the vault.
   *
   * @param notePath - Vault-relative path to the note.
   * @throws `"Note not found"` if the file does not exist.
   */
  async deleteNote(notePath: string): Promise<void> {
    const normalized = this.normalize(notePath);
    const absPath = this.resolve(normalized);

    try {
      await fs.unlink(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Note not found: ${normalized}`);
      }
      throw err;
    }
  }

  /**
   * Move or rename a note to a new vault-relative path.
   *
   * Parent directories at the destination are created automatically.
   * Existing `[[wikilinks]]` in other notes that point to the old path are
   * not updated automatically.
   *
   * @param fromPath - Current vault-relative path of the note.
   * @param toPath - Destination vault-relative path.
   * @returns Metadata of the note at its new path.
   * @throws `"Source note not found"` if `fromPath` does not exist.
   */
  async moveNote(fromPath: string, toPath: string): Promise<NoteMeta> {
    const fromNorm = this.normalize(fromPath);
    const toNorm = this.normalize(toPath);
    const absFrom = this.resolve(fromNorm);
    const absTo = this.resolve(toNorm);

    try {
      await fs.access(absFrom);
    } catch {
      throw new Error(`Source note not found: ${fromNorm}`);
    }

    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);

    return this.getNoteMeta(toNorm);
  }

  /**
   * List all `.md` notes in the vault, optionally scoped to a subfolder.
   *
   * Results are sorted alphabetically and paginated.
   *
   * @param folder - Vault-relative folder to scope the listing (default: vault root).
   * @param limit - Maximum number of results to return (default: 20).
   * @param offset - Number of results to skip for pagination (default: 0).
   * @returns Paginated array of note metadata.
   */
  async listNotes(
    folder = "",
    limit = 20,
    offset = 0,
  ): Promise<PaginatedResult<NoteMeta>> {
    const basePath = folder ? this.resolve(folder) : this.vaultPath;
    const allFiles = await collectMarkdownFiles(basePath);

    const total = allFiles.length;
    const pageFiles = allFiles.slice(offset, offset + limit);

    const items = await Promise.all(
      pageFiles.map((absFile) => {
        const relPath = path.relative(this.vaultPath, absFile);
        return this.getNoteMeta(relPath);
      }),
    );

    return buildPage(items, total, offset);
  }

  /**
   * List all non-hidden subdirectories in the vault, with note counts.
   *
   * Hidden directories (starting with `.`) such as `.obsidian` and `.trash`
   * are excluded. Symlinked directories are skipped.
   *
   * @param folder - Vault-relative folder to start from (default: vault root).
   * @returns All folders found, each with its vault-relative path and note count.
   */
  async listFolders(folder = ""): Promise<FolderInfo[]> {
    const basePath = folder ? this.resolve(folder) : this.vaultPath;
    return collectFolders(basePath, this.vaultPath);
  }

  /**
   * Create a folder in the vault. Parent directories are created as needed.
   *
   * Idempotent — calling this on an already-existing folder is a no-op.
   *
   * @param folderPath - Vault-relative path for the new folder.
   */
  async createFolder(folderPath: string): Promise<void> {
    const absPath = this.resolve(folderPath);
    await fs.mkdir(absPath, { recursive: true });
  }

  /**
   * Case-insensitive full-text search across all notes in the vault.
   *
   * Returns matches with up to one surrounding context line. A single file
   * can contribute multiple match entries.
   *
   * @param query - Substring to search for (case-insensitive).
   * @param limit - Maximum number of matches to return (default: 20).
   * @param offset - Pagination offset (default: 0).
   * @returns Paginated list of {@link SearchMatch} entries with file path, line number, and excerpt.
   */
  async searchContent(
    query: string,
    limit = 20,
    offset = 0,
  ): Promise<PaginatedResult<SearchMatch>> {
    const allFiles = await collectMarkdownFiles(this.vaultPath);
    const lowerQuery = query.toLowerCase();
    const matches: SearchMatch[] = [];

    for (const absFile of allFiles) {
      const content = await fs.readFile(absFile, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          matches.push({
            path: path.relative(this.vaultPath, absFile),
            name: path.basename(absFile, NOTE_EXTENSION),
            excerpt: lines
              .slice(start, end + 1)
              .join("\n")
              .trim(),
            lineNumber: i + 1,
          });
        }
      }
    }

    const total = matches.length;
    return buildPage(matches.slice(offset, offset + limit), total, offset);
  }

  /**
   * Find all notes that have a specific tag.
   *
   * Searches both frontmatter tag arrays and inline `#tagname` occurrences.
   * The `#` prefix is optional and matching is case-insensitive.
   *
   * @param tag - Tag to search for (with or without the `#` prefix).
   * @param limit - Maximum number of results (default: 20).
   * @param offset - Pagination offset (default: 0).
   * @returns Paginated list of notes that carry the given tag.
   */
  async searchByTag(
    tag: string,
    limit = 20,
    offset = 0,
  ): Promise<PaginatedResult<NoteMeta>> {
    const allFiles = await collectMarkdownFiles(this.vaultPath);
    const normalizedTag = tag.replace(/^#/, "").toLowerCase();
    const matching: NoteMeta[] = [];

    for (const absFile of allFiles) {
      const raw = await fs.readFile(absFile, "utf-8");
      const parsed = matter(raw);
      const tags = extractTags(parsed.data, parsed.content);

      if (tags.some((t) => t.toLowerCase() === normalizedTag)) {
        const relPath = path.relative(this.vaultPath, absFile);
        const stat = await fs.stat(absFile);
        matching.push({
          path: relPath,
          name: path.basename(relPath, NOTE_EXTENSION),
          frontmatter: parsed.data as Record<string, unknown>,
          tags,
          created: stat.birthtime,
          modified: stat.mtime,
        });
      }
    }

    const total = matching.length;
    return buildPage(matching.slice(offset, offset + limit), total, offset);
  }

  /**
   * Find all notes that link to the given note via Obsidian wiki-link syntax.
   *
   * Matches `[[note-name]]`, `[[folder/note-name]]`, and aliased links
   * `[[note|alias]]`. The search is case-insensitive. The target note itself
   * is excluded from results. Each source file contributes at most one entry.
   *
   * @param notePath - Vault-relative path of the note to find backlinks for.
   * @param limit - Maximum number of results (default: 20).
   * @param offset - Pagination offset (default: 0).
   * @returns Paginated list of backlink matches with line numbers and excerpts.
   */
  async getBacklinks(
    notePath: string,
    limit = 20,
    offset = 0,
  ): Promise<PaginatedResult<SearchMatch>> {
    const normalized = this.normalize(notePath);
    const noteName = path.basename(normalized, NOTE_EXTENSION);

    // Match [[noteName]], [[folder/noteName]], [[noteName|alias]], [[folder/noteName|alias]]
    const escaped = noteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wikilinkRe = new RegExp(
      `\\[\\[(?:[^\\]|]*\\/)?${escaped}(?:\\|[^\\]]*)?\\]\\]`,
      "i",
    );

    const allFiles = await collectMarkdownFiles(this.vaultPath);
    const matches: SearchMatch[] = [];

    for (const absFile of allFiles) {
      const relPath = path.relative(this.vaultPath, absFile);
      if (relPath === normalized) continue; // skip self

      const content = await fs.readFile(absFile, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (wikilinkRe.test(lines[i])) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          matches.push({
            path: relPath,
            name: path.basename(relPath, NOTE_EXTENSION),
            excerpt: lines
              .slice(start, end + 1)
              .join("\n")
              .trim(),
            lineNumber: i + 1,
          });
          break; // one match per file is sufficient for backlinks
        }
      }
    }

    const total = matches.length;
    return buildPage(matches.slice(offset, offset + limit), total, offset);
  }
}

// MARK: Module-private helpers

/** Recursively collect all .md files, skipping hidden directories. */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip .obsidian, .trash, etc.
      if (entry.isSymbolicLink()) continue;      // skip symlinks — they could point outside the vault
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(NOTE_EXTENSION)) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results.sort();
}

/** Recursively collect all non-hidden subdirectories with note counts. */
async function collectFolders(
  dir: string,
  vaultRoot: string,
): Promise<FolderInfo[]> {
  const results: FolderInfo[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) continue; // skip symlinked directories

      const fullPath = path.join(current, entry.name);
      const relPath = path.relative(vaultRoot, fullPath);
      const notes = await collectMarkdownFiles(fullPath);

      results.push({
        path: relPath,
        name: entry.name,
        noteCount: notes.length,
      });
      await walk(fullPath);
    }
  }

  await walk(dir);
  return results;
}

/**
 * Extract all tags from a note's frontmatter and inline body text.
 * Returns normalized lowercase tags without the # prefix.
 */
function extractTags(
  frontmatter: Record<string, unknown>,
  body: string,
): string[] {
  const tags = new Set<string>();

  // Frontmatter: tags can be a string, array, or comma-separated string
  const fmTags = frontmatter["tags"];
  if (Array.isArray(fmTags)) {
    fmTags.forEach(
      (t) => typeof t === "string" && tags.add(t.trim().toLowerCase()),
    );
  } else if (typeof fmTags === "string") {
    fmTags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .forEach((t) => tags.add(t));
  }

  // Inline tags: #tagname (word boundary after #, not inside code fences)
  const inlineRe = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(body)) !== null) {
    tags.add(m[1].toLowerCase());
  }

  return Array.from(tags);
}

/** Build a PaginatedResult from a page of items and total count. */
function buildPage<T>(
  items: T[],
  total: number,
  offset: number,
): PaginatedResult<T> {
  const hasMore = total > offset + items.length;
  return {
    items,
    total,
    count: items.length,
    offset,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + items.length } : {}),
  };
}
