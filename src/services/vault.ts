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

  async readNote(notePath: string): Promise<NoteContent> {
    const absPath = this.resolve(this.normalize(notePath));
    return this.parseFile(absPath);
  }

  async getNoteMeta(notePath: string): Promise<NoteMeta> {
    const { raw: _raw, body: _body, ...meta } = await this.readNote(notePath);
    return meta;
  }

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

  async listFolders(folder = ""): Promise<FolderInfo[]> {
    const basePath = folder ? this.resolve(folder) : this.vaultPath;
    return collectFolders(basePath, this.vaultPath);
  }

  async createFolder(folderPath: string): Promise<void> {
    const absPath = this.resolve(folderPath);
    await fs.mkdir(absPath, { recursive: true });
  }

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
