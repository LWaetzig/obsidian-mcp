# obsidian-mcp

An MCP (Model Context Protocol) client that gives AI assistants direct access to your Obsidian vault. Read, write, search, and navigate notes using natural language — with any MCP-compatible client.

## Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Client Setup](#client-setup)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code-cli)
  - [Cursor](#cursor)
  - [VS Code (GitHub Copilot, Cline, Continue)](#vs-code)
  - [Zed](#zed)
  - [Ollama (via mcphost)](#ollama-via-mcphost)
- [Available Tools](#available-tools)
- [Security](#security)
- [Extending](#extending)

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- An **Obsidian vault** (a folder of `.md` files — no Obsidian app required at runtime)

---

## Installation

You don't run the server manually — your AI client (Claude Desktop, Cursor, etc.) launches it automatically when it starts. All you need to do is build the project once and point your client's config at the output file.

**1. Clone and build:**

```bash
git clone <repo-url> obsidian-mcp
cd obsidian-mcp
npm install
npm run build
```

This produces `dist/index.js` — the file every client config will reference.

**2. Find your vault path.** This is the folder Obsidian opens as your vault, e.g. `/Users/yourname/Documents/MyVault`.

**3. Follow the setup for your client below.** Each config tells the client:
- where the built file is (`dist/index.js`)
- what vault to use (`OBSIDIAN_VAULT_PATH`)

---

## Client Setup

All clients use **stdio transport** — the server runs as a local subprocess on your machine. No hosting required.

---

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

Quit and relaunch Claude Desktop. A hammer icon (🔨) in the chat input confirms the server is connected.

---

### Claude Code (CLI)

Register the server with the `claude mcp add` command:

```bash
claude mcp add obsidian \
  node /absolute/path/to/obsidian-mcp/dist/index.js \
  -e OBSIDIAN_VAULT_PATH=/path/to/your/vault
```

Verify it's registered:

```bash
claude mcp list
```

The tools are now available in any Claude Code session.

---

### Cursor

Open **Settings → Cursor Settings → MCP** (or edit `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

Restart Cursor. The tools appear automatically in Cursor's AI chat and Composer.

---

### VS Code

VS Code supports MCP servers through several extensions. Configuration goes in `.vscode/mcp.json` (project-scoped) or your user `settings.json` (global).

#### GitHub Copilot (VS Code 1.99+)

Create `.vscode/mcp.json` in your project, or add to **User Settings (JSON)**:

```json
{
  "servers": {
    "obsidian": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

In GitHub Copilot Chat, switch to **Agent mode** (`@workspace`) — the obsidian tools will be available automatically.

#### Cline

Open Cline's settings panel → **MCP Servers** → **Add Server** → paste:

```json
{
  "obsidian": {
    "command": "node",
    "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
    "env": {
      "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
    }
  }
}
```

#### Continue

Edit `~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "obsidian",
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
      }
    }
  ]
}
```

---

### Zed

Edit `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "obsidian": {
      "command": {
        "path": "node",
        "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
        "env": {
          "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
        }
      }
    }
  }
}
```

The tools are available in Zed's AI Assistant panel.

---

### Ollama (via mcphost)

Ollama doesn't support MCP natively. Use [mcphost](https://github.com/mark3labs/mcphost) as a bridge — it wraps any MCP server and connects it to a local Ollama model.

**1. Install mcphost:**

```bash
go install github.com/mark3labs/mcphost@latest
```

**2. Create a config file** (`~/.mcphost/config.json`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp/dist/index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "/path/to/your/vault"
      }
    }
  }
}
```

**3. Start a chat session** with any Ollama model:

```bash
mcphost --model ollama:qwen2.5:14b
```

> Tool-use quality depends heavily on the model. Recommended: `qwen2.5:14b`, `llama3.1:8b`, `mistral-nemo`. Models need to support function/tool calling to use MCP tools reliably.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `obsidian_list_notes` | List notes in the vault, optionally filtered to a folder. Paginated. |
| `obsidian_read_note` | Read the full content of a note by vault-relative path. |
| `obsidian_create_note` | Create a new note with optional YAML frontmatter. |
| `obsidian_update_note` | Overwrite an existing note's content and frontmatter. |
| `obsidian_append_to_note` | Append content to a note (creates it if missing). |
| `obsidian_delete_note` | Permanently delete a note. |
| `obsidian_move_note` | Move or rename a note to a new path. |
| `obsidian_get_note_metadata` | Read only the frontmatter and tags, without loading the body. |
| `obsidian_search_notes` | Full-text search across all notes (case-insensitive). |
| `obsidian_search_by_tag` | Find all notes with a specific `#tag`. |
| `obsidian_get_backlinks` | Find all notes that `[[link]]` to a given note. |
| `obsidian_list_folders` | List folders in the vault with note counts. |
| `obsidian_create_folder` | Create a new folder (parents created automatically). |

All tools accept a `response_format` parameter: `"markdown"` (default, human-readable) or `"json"` (structured, for programmatic use).

### Example prompts

```
"Summarise everything in my projects folder"
"Create a note called 'Meeting Notes 2025-04-11' with today's agenda"
"Find all notes tagged #todo and list what's incomplete"
"What notes link back to my 'Home' note?"
"Search for anything mentioning the Q2 launch"
"Append '- [ ] Follow up with design team' to my Daily Note"
```

---

## Security

- **Path traversal protection** — all paths are validated to stay within `OBSIDIAN_VAULT_PATH`
- **Symlink protection** — symlinks inside the vault that point outside it are blocked
- **File size limit** — notes larger than 5 MB are rejected to prevent memory exhaustion
- **Response size limit** — responses are truncated at 25,000 characters with a clear notice
- **No network access** — the server reads and writes local files only; no outbound requests

---

## Extending

The codebase is modular by design. To add a new set of tools:

1. Create `src/tools/my-feature.ts` and export a `registerMyFeatureTools(server, vault)` function
2. Add it to `src/tools/index.ts`:

```typescript
import { registerMyFeatureTools } from './my-feature.js';

export function registerAllTools(server: McpServer, vault: VaultService): void {
  registerNoteTools(server, vault);
  registerSearchTools(server, vault);
  registerFolderTools(server, vault);
  registerMyFeatureTools(server, vault);  // ← add this
}
```

3. Run `npm run build`

To add vault capabilities (e.g. reading canvas files, template expansion), extend `VaultService` in `src/services/vault.ts` and call the new methods from your tool handlers.
