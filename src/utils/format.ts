import type {
  NoteMeta,
  NoteContent,
  SearchMatch,
  PaginatedResult,
  FolderInfo,
} from "../types.js";
import { ResponseFormat } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

// MARK: Helpers

function fmtDate(d: Date | undefined): string {
  return d ? new Date(d).toLocaleString() : "unknown";
}

function tagList(tags: string[]): string {
  return tags.length > 0 ? tags.map((t) => `#${t}`).join(", ") : "none";
}

/**
 * Truncate a response string to CHARACTER_LIMIT characters, appending a
 * clear notice so the caller knows the output was cut short.
 */
function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const notice =
    `\n\n---\n_Response truncated at ${CHARACTER_LIMIT.toLocaleString()} characters. ` +
    `Use pagination (limit / offset) or narrow your query to see more._`;
  return text.slice(0, CHARACTER_LIMIT - notice.length) + notice;
}

// MARK: NoteMeta

export function formatNoteMeta(note: NoteMeta, format: ResponseFormat): string {
  if (format === ResponseFormat.JSON) return JSON.stringify(note, null, 2);

  const lines = [
    `## ${note.name}`,
    `- **Path**: \`${note.path}\``,
    `- **Tags**: ${tagList(note.tags)}`,
    `- **Modified**: ${fmtDate(note.modified)}`,
  ];

  const fmKeys = Object.keys(note.frontmatter).filter((k) => k !== "tags");
  if (fmKeys.length > 0) {
    lines.push("- **Frontmatter**:");
    for (const k of fmKeys) {
      lines.push(`  - \`${k}\`: ${JSON.stringify(note.frontmatter[k])}`);
    }
  }

  return lines.join("\n");
}

// MARK: NoteContent

export function formatNoteContent(
  note: NoteContent,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) return truncate(JSON.stringify(note, null, 2));

  const header = [
    `# ${note.name}`,
    `> \`${note.path}\` · modified ${fmtDate(note.modified)}`,
  ];

  if (note.tags.length > 0) {
    header.push("", `**Tags**: ${tagList(note.tags)}`);
  }

  return truncate([...header, "", note.body].join("\n"));
}

// MARK: Paginated note list

export function formatNoteList(
  result: PaginatedResult<NoteMeta>,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) return JSON.stringify(result, null, 2);

  const lines = [`# Notes (${result.count} of ${result.total})`, ""];

  for (const n of result.items) {
    const tags = n.tags.length > 0 ? `  ${tagList(n.tags)}` : "";
    lines.push(`- **${n.name}**  \`${n.path}\`${tags}`);
  }

  if (result.has_more) {
    lines.push(
      "",
      `_More results available — use \`offset=${result.next_offset}\` for the next page._`,
    );
  }

  return truncate(lines.join("\n"));
}

// MARK: Search / backlink results

export function formatSearchResults(
  result: PaginatedResult<SearchMatch>,
  label: string,
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) return JSON.stringify(result, null, 2);

  if (result.total === 0) return `No results found for "${label}"`;

  const lines = [
    `# Results for "${label}" (${result.count} of ${result.total})`,
    "",
  ];

  for (const m of result.items) {
    lines.push(
      `### ${m.name} — line ${m.lineNumber}`,
      `> \`${m.path}\``,
      "```",
      m.excerpt,
      "```",
      "",
    );
  }

  if (result.has_more) {
    lines.push(
      `_More results available — use \`offset=${result.next_offset}\` for the next page._`,
    );
  }

  return truncate(lines.join("\n"));
}

// MARK: Folder list

export function formatFolderList(
  folders: FolderInfo[],
  format: ResponseFormat,
): string {
  if (format === ResponseFormat.JSON) return JSON.stringify(folders, null, 2);
  if (folders.length === 0) return "No folders found in vault.";

  const lines = [`# Folders (${folders.length})`, ""];
  for (const f of folders) {
    lines.push(
      `- **${f.name}**  \`${f.path}\`  — ${f.noteCount} note${f.noteCount !== 1 ? "s" : ""}`,
    );
  }

  return lines.join("\n");
}
