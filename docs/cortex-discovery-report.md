# System

- **Operating System:** Windows 10 Home (Version 10.0.19045, Build 19045, 64-bit)
- **Shell:** PowerShell 5.1 (Version 5.1.19041.7802)
- **User Home Directory:** `C:\Users\luche`
- **Antigravity Version:** 2.28.2 (Product Version: `2.28.2.0`, Google; Binary: `C:\Users\luche\AppData\Local\Programs\antigravity\Antigravity.exe`)

---

# Hermes

### 1. Installation Details
- **Binary Path:** `C:\Users\luche\AppData\Local\hermes\bin\hermes.exe`
- **Version:** `Hermes Agent v0.22.5 (2026.9.24) · stable · local bf0203a794a0`
- **Install Method:** `git` (cloned to `C:\Users\luche\AppData\Local\hermes\hermes-agent`)
- **Python Runtime:** Python 3.14.9 (`C:\Users\luche\AppData\Local\hermes\tools\python-3.14.9+20261021-win32-x64\python.exe`)
- **OpenAI SDK:** 2.24.0
- **CLI Commands Overview (`hermes --help`):**
  - Core/Execution: `chat`, `model`, `moa`, `fallback`, `resume`, `pause`, `status`, `verify`, `doctor`, `dump`, `debug`
  - Sessions & History: `sessions` (list, browse, rename), `logs` (agent.log, errors.log, follow), `checkpoints`
  - Workspaces & Tools: `worktree`, `project`, `tools`, `mcp`, `skills`, `bundles`, `plugins`, `curator`
  - Live Platforms & Networking: `gateway`, `proxy`, `webhook`, `cron`, `peer`, `portal`, `kanban`, `dashboard`
  - Configuration & Memory: `config` (view, edit, set), `memory` (setup, status, off, reset), `auth`, `secrets`

### 2. Home and Configuration Directories
On Windows, Hermes evaluates `HERMES_HOME` via `_platform_default_hermes_home` in `hermes_constants.py`:
- **Active Home Directory:** `C:\Users\luche\AppData\Local\hermes` (since `HERMES_HOME` is unset)
- **Secondary / Legacy Profile Directory:** `C:\Users\luche\.hermes`
- **Configuration File:** `C:\Users\luche\AppData\Local\hermes\config.yaml`
- **Secrets File:** `C:\Users\luche\AppData\Local\hermes\.env`
- **XDG Config Paths:** Not used on Windows; configuration and data reside directly in `%LOCALAPPDATA%\hermes`.

#### Directory Tree (3 Levels Deep): `C:\Users\luche\AppData\Local\hermes`
*(Excluding internal Python/Git vendor trees `tools/` and package cache `cache/` for clarity; summary noted below)*

```
C:\Users\luche\AppData\Local\hermes/
├── [Dir]  audio_cache/                  (0 files, 2026-11-01 01:40)
├── [Dir]  backups/                      (0 files, 2026-11-01 01:41)
├── [Dir]  bin/                          (2026-11-01 01:42)
│   └── [File] hermes.exe                (91,648 B, 2026-11-01 01:42)
├── [Dir]  cron/                         (0 files, 2026-11-01 17:49)
├── [Dir]  gateway-service/              (0 files, 2026-11-01 01:45)
├── [Dir]  hermes-agent/                 (Git repository clone, 2026-11-01 01:46)
│   ├── [Dir]  agent/                    (Core agent Python code)
│   ├── [Dir]  hermes_cli/               (CLI subcommands & dispatch)
│   ├── [Dir]  tools/                    (Tool definitions & implementations)
│   ├── [Dir]  plugins/                  (Plugin catalog and loader)
│   └── [File] AGENTS.md                 (13,245 B, 2026-11-01 01:46)
├── [Dir]  hooks/                        (0 files, 2026-11-01 01:40)
├── [Dir]  images/                       (0 files, 2026-11-01 01:24)
├── [Dir]  image_cache/                  (0 files, 2026-11-01 01:40)
├── [Dir]  kanban/                       (0 files, 2026-11-01 01:46)
├── [Dir]  logs/                         (2026-11-01 17:46)
│   ├── [File] agent.log                 (24,534 B, 2026-11-01 17:49)
│   ├── [File] errors.log                (0 B, 2026-11-01 01:46)
│   ├── [File] gateway.log               (1,248 B, 2026-11-01 17:11)
│   ├── [Dir]  curator/                  (0 files, 2026-11-01 01:46)
│   └── [Dir]  update_receipts/          (3 files, ~4 KB, 2026-11-01 01:46)
├── [Dir]  memories/                     (0 files, 2026-11-01 01:40) [Target folder for MEMORY.md and USER.md]
├── [Dir]  pairing/                      (0 files, 2026-11-01 01:40)
├── [Dir]  pending_messages/             (0 files, 2026-11-01 01:46)
├── [Dir]  platforms/                    (0 files, 2026-11-01 01:46)
├── [Dir]  plugins/                      (0 files, 2026-11-01 01:46)
├── [Dir]  runtime/                      (0 files, 2026-11-01 02:14)
├── [Dir]  sessions/                     (0 files, 2026-11-01 01:40) [Sessions stored in state.db]
├── [Dir]  skills/                       (261 markdown files across 11 category folders, 2026-11-01 17:11)
│   ├── [Dir]  apple/                    (5 skills)
│   ├── [Dir]  autonomous-ai-agents/     (4 skills)
│   ├── [Dir]  creative/                 (12 skills)
│   ├── [Dir]  devops/                   (1 skill)
│   ├── [Dir]  email/                    (2 skills)
│   ├── [Dir]  media/                    (3 skills)
│   ├── [Dir]  note-taking/              (1 skill: obsidian)
│   ├── [Dir]  productivity/             (13 skills: google-workspace, notion, etc.)
│   ├── [Dir]  research/                 (4 skills: llm-wiki, arxiv, etc.)
│   ├── [Dir]  social-media/             (1 skill)
│   └── [Dir]  software-development/     (11 skills)
├── [Dir]  state/                        (2026-11-01 17:49)
│   ├── [File] gateway.heartbeat         (0 B, 2026-11-01 17:49)
│   ├── [File] dashboard_clients.heartbeat (0 B, 2026-11-01 17:49)
│   └── [File] gateway.lifecycle.json    (142 B, 2026-11-01 17:49)
├── [File] config.yaml                   (17,848 B, 2026-11-01 02:14)
├── [File] .env                          (29,176 B, 2026-11-01 02:09) [REDACTED SECRETS]
├── [File] SOUL.md                       (667 B, 2026-11-01 01:40)
├── [File] state.db                      (520,192 B, 2026-11-01 17:11)
├── [File] state.db-wal                  (1,013,552 B, 2026-11-01 17:11)
├── [File] state.db-shm                  (32,768 B, 2026-11-01 17:11)
├── [File] kanban.db                     (118,784 B, 2026-11-01 01:46)
├── [File] kanban.db-wal                 (0 B, 2026-11-01 17:49)
├── [File] kanban.db-shm                 (32,768 B, 2026-11-01 17:49)
├── [File] projects.db                   (45,056 B, 2026-11-01 01:46)
├── [File] models_dev_cache.json         (5,963,857 B, 2026-11-01 15:27)
└── [File] provider_models_cache.json    (11,719 B, 2026-11-01 17:49)
```

#### Directory Tree (3 Levels Deep): `C:\Users\luche\.hermes`
```
C:\Users\luche\.hermes/
└── [Dir] skills/
    ├── [Dir] gepeto/
    │   ├── [File] .pinokio-managed.json (143 B, 2026-09-01 19:00)
    │   └── [File] SKILL.md              (42,241 B, 2026-09-01 19:00)
    └── [Dir] pinokio/
        ├── [File] .pinokio-managed.json (146 B, 2026-09-01 18:50)
        └── [File] SKILL.md              (20,908 B, 2026-09-01 18:50)
```

### 3. Configured Memory Provider
Checked via `hermes memory status` and `C:\Users\luche\AppData\Local\hermes\config.yaml`:
- **Current Active Provider:** `(none — built-in only)`
- **Built-in Memory Status:**
  - Memory injection: `enabled ✓`
  - User profile: `enabled ✓`
  - Memory tool: `enabled ✓`
- **Installed Provider Plugins Available in Catalog:** `byterover` (API key / local), `retaindb` (API key / local). Neither is currently enabled.
- **Exact Configuration Settings (`config.yaml`):**
  ```yaml
  memory:
    memory_enabled: true
    user_profile_enabled: true
    prefetch_spill_enabled: false
    memory_char_limit: 2200
    user_char_limit: 1375
    nudge_interval: 10
  ```
- No custom provider config files (e.g. `hwiki.json`) exist.

### 4. Hermes Memory Storage Inventory
| Storage Role | Absolute Path | File Count | Total Size | Format | Most Recent Modification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Built-in Markdown Memory** | `C:\Users\luche\AppData\Local\hermes\memories\` | 0 files | 0 B | Plain text markdown (split by `\n§\n`) | 2026-11-01 01:40:41 (dir created; `MEMORY.md` / `USER.md` not yet instantiated) |
| **Agent Personality / System Persona** | `C:\Users\luche\AppData\Local\hermes\SOUL.md` | 1 file | 667 B | Markdown plain text | 2026-11-01 01:40:41 |
| **Session History & Message DB** | `C:\Users\luche\AppData\Local\hermes\state.db` (+ wal/shm) | 3 files | 1,566,512 B | SQLite 3 (43 tables + FTS5 index) | 2026-11-01 17:11:13 |
| **Kanban / Task Coordination DB** | `C:\Users\luche\AppData\Local\hermes\kanban.db` (+ wal/shm) | 3 files | 151,552 B | SQLite 3 (8 tables) | 2026-11-01 17:49:47 |
| **Projects Registry DB** | `C:\Users\luche\AppData\Local\hermes\projects.db` | 1 file | 45,056 B | SQLite 3 (4 tables) | 2026-11-01 01:46:54 |
| **File-Based Sessions Folder** | `C:\Users\luche\AppData\Local\hermes\sessions\` | 0 files | 0 B | N/A (Empty; sessions persist in `state.db`) | 2026-11-01 01:40:41 |
| **System & Gateway Activity Logs** | `C:\Users\luche\AppData\Local\hermes\logs\` | 11 files | ~30 KB | Plain text log files (`agent.log`, `gateway.log`) and JSON receipts | 2026-11-01 17:49:22 |
| **Installed Procedural Skills** | `C:\Users\luche\AppData\Local\hermes\skills\` | 261 `.md` files | ~1.82 MB | Markdown files with YAML frontmatter | 2026-11-01 17:11:13 |
| **User Profile Skills** | `C:\Users\luche\.hermes\skills\` | 2 `.md` files | 63,149 B | Markdown files with YAML frontmatter | 2026-09-01 19:00:11 |

### 5. SQLite Database Schemas (No Row Data)

#### A. `state.db` (43 Tables)
Tables present: `async_delegations`, `compression_locks`, `conversation_generations`, `delivery_obligations`, `gateway_heartbeats`, `gateway_hygiene_state`, `gateway_routing`, `hosted_room_events`, `hosted_room_links`, `hosted_room_peer_reservations`, `hosted_room_policy_cursors`, `hosted_room_policy_events`, `hosted_room_policy_publications`, `hosted_room_policy_threads`, `hosted_room_policy_transcript`, `hosted_room_policy_transcript_state`, `hosted_room_policy_watermarks`, `hosted_room_remote_runs`, `hosted_room_retired_ids`, `hosted_room_revoked_grants`, `hosted_rooms`, `messages`, `messages_fts`, `messages_fts_config`, `messages_fts_data`, `messages_fts_docsize`, `messages_fts_idx`, `messages_fts_trigram`, `messages_fts_trigram_config`, `messages_fts_trigram_data`, `messages_fts_trigram_docsize`, `messages_fts_trigram_idx`, `runtime_epoch`, `schema_version`, `session_admissions`, `session_model_usage`, `session_turn_leases`, `sessions`, `sqlite_sequence`, `state_meta`, `system_prompts`, `worker_executions`, `worker_receipts`.

Key Schemas:
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    runtime_revision INTEGER NOT NULL DEFAULT 0,
    runtime_generation INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    created_source TEXT,
    user_id TEXT,
    session_key TEXT,
    chat_id TEXT,
    chat_type TEXT,
    thread_id TEXT,
    display_name TEXT,
    origin_json TEXT,
    expiry_finalized INTEGER DEFAULT 0,
    model TEXT,
    model_config TEXT,
    system_prompt TEXT,
    system_prompt_hash TEXT,
    parent_session_id TEXT,
    started_at REAL NOT NULL,
    ended_at REAL,
    end_reason TEXT,
    message_count INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    cwd TEXT,
    git_branch TEXT,
    git_repo_root TEXT,
    git_metadata_generation INTEGER NOT NULL DEFAULT 0,
    billing_provider TEXT,
    billing_base_url TEXT,
    billing_mode TEXT,
    estimated_cost_usd REAL,
    actual_cost_usd REAL,
    cost_status TEXT,
    cost_source TEXT,
    pricing_version TEXT,
    title TEXT,
    title_source TEXT,
    last_activity_at REAL,
    last_activity_description TEXT,
    last_activity_provenance TEXT,
    api_call_count INTEGER DEFAULT 0,
    handoff_state TEXT,
    handoff_platform TEXT,
    handoff_error TEXT,
    compression_failure_cooldown_until REAL,
    compression_failure_error TEXT,
    compression_fallback_streak INTEGER NOT NULL DEFAULT 0,
    compression_ineffective_count INTEGER NOT NULL DEFAULT 0,
    compression_recovery_deadline REAL,
    compression_overload_streak INTEGER NOT NULL DEFAULT 0,
    profile_name TEXT,
    transport_profile TEXT,
    rewind_count INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    auto_archived INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    last_read_at REAL,
    tool_names TEXT,
    transcript_revision INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id),
    FOREIGN KEY (system_prompt_hash) REFERENCES system_prompts(hash)
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT,
    tool_calls_json TEXT,
    tool_call_id TEXT,
    name TEXT,
    created_at REAL NOT NULL,
    turn_index INTEGER NOT NULL DEFAULT 0,
    sequence INTEGER NOT NULL DEFAULT 0,
    token_count INTEGER DEFAULT 0
);

CREATE TABLE session_model_usage (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    billing_provider TEXT NOT NULL DEFAULT '',
    billing_base_url TEXT NOT NULL DEFAULT '',
    billing_mode TEXT NOT NULL DEFAULT '',
    task TEXT NOT NULL DEFAULT '',
    api_call_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    actual_cost_usd REAL NOT NULL DEFAULT 0,
    cost_status TEXT,
    cost_source TEXT,
    first_seen REAL,
    last_seen REAL,
    PRIMARY KEY (session_id, model, billing_provider, billing_base_url, billing_mode, task)
);

CREATE TABLE system_prompts (
    hash TEXT PRIMARY KEY,
    prompt TEXT NOT NULL
);

CREATE TABLE state_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

#### B. `kanban.db` (8 Tables)
Tables present: `kanban_notify_subs`, `sqlite_sequence`, `task_attachments`, `task_comments`, `task_events`, `task_links`, `task_runs`, `tasks`.

Key Schemas:
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    assignee TEXT,
    status TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    workspace_kind TEXT NOT NULL DEFAULT 'scratch',
    workspace_path TEXT,
    branch_name TEXT,
    project_id TEXT,
    claim_lock TEXT,
    claim_expires INTEGER,
    tenant TEXT,
    result TEXT,
    idempotency_key TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    worker_pid INTEGER
);

CREATE TABLE task_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    profile TEXT,
    step_key TEXT,
    status TEXT NOT NULL,
    claim_lock TEXT,
    claim_expires INTEGER,
    worker_pid INTEGER,
    worker_started_at INTEGER,
    max_runtime_seconds INTEGER,
    last_heartbeat_at INTEGER,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    outcome TEXT,
    summary TEXT,
    metadata TEXT,
    error TEXT
);

CREATE TABLE task_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    run_id INTEGER,
    kind TEXT NOT NULL,
    payload TEXT,
    created_at INTEGER NOT NULL
);
```

#### C. `projects.db` (4 Tables)
Tables present: `discovered_repos`, `project_folders`, `project_meta`, `projects`.

Key Schemas:
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    default_branch TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
);

CREATE TABLE project_folders (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    folder_path TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, folder_path)
);

CREATE TABLE discovered_repos (
    repo_path TEXT PRIMARY KEY,
    discovered_at INTEGER NOT NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);
```

### 6. Obsidian Vaults Check
- Searched user profile, documents, projects, and desktop.
- **Obsidian App Data:** Not installed (`%APPDATA%\obsidian` does not exist).
- **Vaults Found (`.obsidian` directories):** None found.
- **Overlap with Hermes:** Zero overlap. Hermes's built-in `obsidian` skill defaults to checking `$OBSIDIAN_VAULT_PATH` or `~/Documents/Obsidian Vault`, neither of which exists on this machine.

### 7. Memory Format: Frontmatter and [[Wikilinks]]
- **Built-in Memory (`MEMORY.md` / `USER.md`):**
  - Does **not** use YAML frontmatter and does **not** use `[[wikilinks]]`.
  - The internal store engine (`MemoryStore` in `tools/memory_tool_store.py`) stores entries as plain text items joined by an entry delimiter: `\n§\n` (Unicode `\u00A7` section mark).
  - Storage is strictly character-budgeted (2,200 chars for `MEMORY.md`, 1,375 chars for `USER.md`).
- **Skills and Knowledge Base Plugins:**
  - Skills use standard YAML frontmatter for identity and metadata.
  - The `llm-wiki` and `obsidian` skills explicitly prescribe and index markdown files with YAML frontmatter and bidirectional `[[wikilinks]]`.

#### Sample 1: `C:\Users\luche\AppData\Local\hermes\skills\note-taking\obsidian\SKILL.md`
```markdown
---
name: obsidian
description: Read, search, create, and edit notes in the Obsidian vault.
version: 1.0.0
author: Teknium (teknium1), Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Obsidian, Notes, Markdown, Vault]
    related_skills: []
---

# Obsidian Vault

Use this skill for filesystem-first Obsidian vault work: reading notes, listing notes, searching note files, creating notes, appending content, and adding wikilinks.

## Vault path

Use a known or resolved vault path before calling file tools.

The documented vault-path convention is the `OBSIDIAN_VAULT_PATH` environment variable, for example from `${HERMES_HOME:-~/.hermes}/.env`. If it is unset, use `~/Documents/Obsidian Vault`.
```

#### Sample 2: `C:\Users\luche\AppData\Local\hermes\skills\research\llm-wiki\SKILL.md`
```markdown
---
name: llm-wiki
description: "Karpathy's LLM Wiki: build/query interlinked markdown KB."
version: 2.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [wiki, knowledge-base, research, notes, markdown, rag-alternative]
    category: research
    related_skills: [obsidian, arxiv]
---

# Karpathy's LLM Wiki

Build and maintain a persistent, compounding knowledge base as interlinked markdown files.
Based on Andrej Karpathy's LLM Wiki pattern.

Unlike traditional RAG (which rediscovers knowledge from scratch per query), the wiki
compiles knowledge once and keeps it current. Cross-references are already there.
Contradictions have already been flagged. Synthesis reflects everything ingested.

## When This Skill Activates

Use this skill when the user:
- Asks to create, build, or start a wiki or knowledge base
```

### 8. Live Activity Tracking
- **Execution Logs:** `C:\Users\luche\AppData\Local\hermes\logs\agent.log` logs runtime operations with ISO timestamps, log levels, and session identifiers (e.g. `CLI cleanup calling memory shutdown for session local-... with 0 message(s)`).
- **SQLite Database WAL Writes:** When turns, tool calls, and model tokens are committed, SQLite transactions immediately modify `C:\Users\luche\AppData\Local\hermes\state.db-wal`.
- **Memory File Mutation:** When the built-in memory tool runs, entries are written via `atomic_write_text(path, ENTRY_DELIMITER.join(entries), tmp_prefix=".mem_")`. File modification times (`LastWriteTime`) update immediately upon flush.
- **Heartbeat & Lifecycle Files:** Active gateway and dashboard processes touch `state/gateway.heartbeat` and write state deltas to `state/gateway.lifecycle.json`.

### 9. Extensibility: APIs, MCP Servers, Hooks, and Plugins
- **Hook Lifecycle System (`hermes hooks`):** Supports 46 fine-grained lifecycle hooks.
  - Tool execution events: `pre_tool_call` and `post_tool_call` (supports tool matchers, e.g. matcher `memory` specifically filters memory updates).
  - Session lifecycle events: `on_session_start`, `on_session_end`, `on_session_finalize`, `on_session_reset`, `on_session_delete`.
  - Stream events: `on_stream_start`, `on_stream_delta`, `on_stream_end`.
  - Compaction & delegation: `post_compaction`, `subagent_start`, `subagent_stop`.
- **Hook Dispatch Transports:**
  1. *Outbound Webhooks:* Configured in `config.yaml` under `hooks.outbound: [{url: "http://localhost:PORT/events", events: ["post_tool_call"], matcher: "memory"}]`. Dispatches non-blocking HTTP POST payloads with JSON metadata.
  2. *Shell Hooks:* Executables invoked per hook event with consent allowlist in `shell-hooks-allowlist.json`.
  3. *In-Process Python Plugins:* Direct subscription via `PluginManager._subscribe_event()`.
- **MCP Server Capabilities:**
  - Client mode: Hermes connects to external MCP servers (`hermes mcp add`).
  - Server mode: Hermes can expose its own tools as an MCP server via the `mcp-serve` plugin (`hermes plugins install mcp-serve`).
- **Web API & Dashboard:** Hermes includes an integrated web server on port 9119 (`hermes dashboard`) with session and configuration management.

---

# Antigravity

### 1. Directory Tree (3 Levels Deep): `C:\Users\luche\.gemini\antigravity`
Total directories: 11 top-level; Total files at root: 6

```
C:\Users\luche\.gemini\antigravity/
├── [Dir]  annotations/                  (11 files, ~1.1 KB, 2026-11-01 17:48)
│   └── *.pbtxt                          (Plain text ASCII protobuf annotation configs)
├── [Dir]  bin/                          (agy CLI wrapper scripts, 2026-10-29 15:12)
├── [Dir]  brain/                        (23 subdirectories, 20,160 files total, 2026-11-01 17:48)
│   ├── <conversation-uuid>/             (22 active conversation directories)
│   │   ├── [Dir] .system_generated/     (step outputs, logs, transcripts)
│   │   ├── [Dir] .user_uploaded/        (files supplied by user during chat)
│   │   ├── [Dir] scratch/               (temporary files created during tasks)
│   │   └── *.md / *.metadata.json       (user-facing markdown artifacts & metadata)
│   └── [Dir] tempmediaStorage/          (Empty directory, 2026-10-31 18:32)
├── [Dir]  builtin/                      (2026-10-29 15:12)
│   └── [Dir] skills/                    (7 built-in skill bundles with SKILL.md)
├── [Dir]  cache/                        (2026-10-24 12:43)
├── [Dir]  conversations/                (26 files, 0 subdirectories, 2026-11-01 17:48)
│   ├── <conversation-uuid>.db           (22 SQLite databases storing conversation steps)
│   ├── <conversation-uuid>.db-wal       (Active WAL journals)
│   └── <conversation-uuid>.db-shm       (Shared memory files)
├── [Dir]  crashes/                      (1 file: crash_27124_....log, 0 B, 2026-11-01 17:14)
├── [Dir]  knowledge/                    (1 file, 0 subdirectories, 2026-08-18 21:43)
│   └── [File] knowledge.lock            (0 B, 2026-08-18 21:43)
├── [Dir]  lib/                          (Node helper packages, 2026-10-13 00:44)
├── [Dir]  presence/                     (10 lock files: <uuid>.lock, 0 B, 2026-11-01 17:48)
├── [Dir]  scratch/                      (8/18/2026 21:56)
│   └── [Dir] snake-ai-simulation/       (HTML/JS demo project, 2026-08-18 22:22)
├── [File] agyhub_summaries_proto.pb     (12,561 B, 2026-11-01 17:53) [Structured binary protobuf]
├── [File] antigravity_state.pbtxt       (1,099 B, 2026-10-30 15:01) [ASCII text protobuf]
├── [File] conversation_summaries.db     (5,664,768 B, 2026-11-01 17:54) [SQLite 3 DB + FTS5 index]
├── [File] conversation_summaries.db-shm (32,768 B, 2026-11-01 17:53)
├── [File] conversation_summaries.db-wal (32 B, 2026-11-01 17:53)
└── [File] installation_id               (36 B, 2026-08-18 21:43) [Plain text UUID]
```

### 2. Status of Target Directories
| Directory Name | Existence | Entry / File Counts | File Types Present | Nature (Plain text / Binary / Encrypted) | Oldest Mod Date | Newest Mod Date |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`conversations/`** | **Present** | 26 files (0 subdirs, 0 empty) | `.db` (22), `.db-wal` (2), `.db-shm` (2) | Structured binary (SQLite 3, entropy ~2.84; protobuf blobs stored in table columns). **Not encrypted**. | 2026-08-18 22:24:02 | 2026-11-01 17:58:15 |
| **`brain/`** | **Present** | 23 subdirectories (1 empty), 0 top-level files; 20,160 nested files | `.txt` (15,790), `.jsonl` (1,910), `.json` (1,135), `.log` (1,066), `.png` (178), `.jpg` (30), `.ts` (22), `.md` (10), `.js` (8), `.py` (7), no ext (4) | Overwhelmingly plain text (`.txt`, `.jsonl`, `.json`, `.log`, `.md`, `.ts`). Images are standard binary PNG/JPG. **Not encrypted**. | 2026-08-18 21:59:17 | 2026-11-01 17:48:37 |
| **`knowledge/`** | **Present** | 1 file, 0 subdirectories | `.lock` (1) | Plain text empty lock file (`knowledge.lock`, 0 bytes). | 2026-08-18 21:43:19 | 2026-08-18 21:43:19 |
| **`implicit/`** | **Not found** | N/A | N/A | Not found on machine. | N/A | N/A |
| **`context_state/`**| **Not found** | N/A | N/A | Not found on machine. | N/A | N/A |
| **`html_artifacts/`**| **Not found**| N/A | N/A | Not found on machine. | N/A | N/A |
| **`playground/`** | **Not found** | N/A | N/A | Not found on machine. | N/A | N/A |

### 3. Knowledge Directory Details
- **Knowledge Items:** None present.
- **Contents:** Exactly one file: `C:\Users\luche\.gemini\antigravity\knowledge\knowledge.lock` (size: 0 bytes, modified: 2026-08-18 21:43:19).
- No metadata files or subfolders exist inside `knowledge/`.

### 4. Brain Populated Conversation Structure
Populated conversation folders in `brain/` correspond 1:1 with conversation UUIDs.
Example: `C:\Users\luche\.gemini\antigravity\brain\cf30326b-cc15-4b85-b4fa-f5c82f9007d7`

#### File and Directory Listing:
```
cf30326b-cc15-4b85-b4fa-f5c82f9007d7/
├── [Dir]  .agents/
│   └── agents/file-writer/agent.md
├── [Dir]  .system_generated/
│   ├── logs/
│   │   ├── transcript.jsonl
│   │   └── transcript_full.jsonl
│   ├── steps/
│   │   └── <step_id>/output.txt
│   └── tasks/
│       └── <task_id>.log
├── [Dir]  .user_uploaded/
├── [Dir]  scratch/
├── [File] implementation_plan.md               (17,783 B)
├── [File] implementation_plan.md.metadata.json (459 B)
├── [File] task.md                              (54,344 B)
├── [File] task.md.metadata.json                (214 B)
├── [File] walkthrough.md                       (19,397 B)
└── [File] walkthrough.md.metadata.json         (194 B)
```

#### Sample Artifact Metadata (`task.md.metadata.json`):
```json
{
  "summary": "Task tracker for Phase 1 of the multiplayer business/economy game build. Covers all files to be created across infrastructure, server, and client.",
  "updatedAt": "2026-09-13T02:07:33.241921600Z"
}
```

#### Sample Markdown Artifact (`task.md`):
```markdown
# Phase 1 Task Tracker — Auth + Persistence + Basic Clicker

## Infrastructure & Shared ✅
- [x] `docker-compose.yml`
- [x] `docker-compose.override.yml`
- [x] `.env.example`
- [x] `README.md`
- [x] `shared/package.json`
- [x] `shared/tsconfig.json`
- [x] `shared/types.ts`

## Server ✅
- [x] `server/package.json`
- [x] `server/tsconfig.json`
- [x] `server/Dockerfile`
- [x] `server/src/server.ts`
- [x] `server/src/app.ts`
- [x] `server/src/db/pool.ts`
- [x] `server/src/db/migrations/001_initial.sql`
- [x] `server/src/db/migrate.ts`
- [x] `server/src/services/sessionService.ts`
- [x] `server/src/services/authService.ts`
- [x] `server/src/services/balanceService.ts`
- [x] `server/src/services/clickService.ts`
- [x] `server/src/middleware/auth.ts`
- [x] `server/src/middleware/rateLimiter.ts`
- [x] `server/src/api/authRouter.ts`
- [x] `server/src/api/clickRouter.ts`
- [x] `server/src/sockets/index.ts`
- [x] `server/src/engine/tickEngine.ts`
```

### 5. MCP Configuration (`mcp_config.json`)
- **File Path:** `C:\Users\luche\.gemini\config\mcp_config.json`
- **File Size:** 0 bytes (empty file)
- **Configured Servers:** None. (0 configured MCP servers)

### 6. Project-Level Agent Memory Search
Searched `C:\Users\luche\Documents\projects` and user profile directories:
- **Discovered Locations:**
  1. `C:\Users\luche\.agents` (Contains `skills/gepeto/SKILL.md` and `skills/pinokio/SKILL.md`)
  2. `C:\Users\luche\AppData\Local\hermes\hermes-agent\AGENTS.md` (Standard project instruction file)
  3. Antigravity Brain Sessions:
     - `C:\Users\luche\.gemini\antigravity\brain\cf30326b-cc15-4b85-b4fa-f5c82f9007d7\.agents\agents\file-writer\agent.md`
     - `C:\Users\luche\.gemini\antigravity\brain\ef59e2d6-26bd-4e7f-8a7c-5782a039b70f\.agents\agents\city_builder\agent.md`
  4. Project-specific notes:
     - `C:\Users\luche\Documents\projects\0WEBSITEGAME`: `noteforagent.md`, `task.md`, `DEPLOYMENT.md`, `README.md`
     - `C:\Users\luche\Documents\projects\00000000\brickbuilder`: `brick-game-master-spec.md`, `DECISIONS.md`, `QUESTIONS.md`, `CHANGELOG.md`
     - `C:\Users\luche\Documents\projects\00000000\selffightingNN`: `DECISIONS.md`, `README.md`
     - `C:\Users\luche\Documents\projects\greg`: `gregnewmemory.txt`, `greg.txt`

#### Structure of Most Relevant Project Memory Folder (`0WEBSITEGAME`):
```
0WEBSITEGAME/
├── noteforagent.md      (Agent coordination notes)
├── task.md              (Active checklist and status)
├── DEPLOYMENT.md        (Deployment manual)
├── docker-compose.yml   (Environment specification)
└── README.md            (Architecture overview)
```

### 7. Agent Memory and Context Mechanisms in This Session
The Antigravity agent uses the following memory and context sources in this active session:
1. **Built-in Procedural Skills:** Injected into system prompt from:
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\agy-customizations\SKILL.md`
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\antigravity_guide\SKILL.md`
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\automation\SKILL.md`
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\generative_ui\SKILL.md`
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\migrate-workflows\SKILL.md`
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\plugin\SKILL.md`
   - `C:\Users\luche\.gemini\antigravity\builtin\skills\ui-plugin-navigation\SKILL.md`
2. **Conversation Step History & Transcripts:**
   - Active session database: `C:\Users\luche\.gemini\antigravity\conversations\7c63c7bf-cd00-4f4a-a99f-064034155966.db` (+ `.db-wal`)
   - Active transcript logs: `C:\Users\luche\.gemini\antigravity\brain\7c63c7bf-cd00-4f4a-a99f-064034155966\.system_generated\logs\transcript.jsonl` (compact JSONL) and `transcript_full.jsonl`
   - Step output captures: `.../brain/7c63c7bf-cd00-4f4a-a99f-064034155966/.system_generated/steps/<step_id>/output.txt`
3. **Artifact Memory:**
   - Persisted markdown artifacts and accompanying metadata stored in:
     `C:\Users\luche\.gemini\antigravity\brain\7c63c7bf-cd00-4f4a-a99f-064034155966/`
4. **Knowledge Items:**
   - Path `~/.gemini/antigravity/knowledge/` is checked on launch; none currently exist on disk.
5. **Project Rules & Workflows:**
   - Workspace rules (`.agents/rules/` or `.gemini/rules/`) are supported by discovery; none defined in current working directory.
   - Workflows: Migrated to modern skills architecture.

### 8. Live Activity Logging and Event Taps for Antigravity
1. **Streaming Step Log (`transcript.jsonl`):**
   - Each conversation writes real-time JSONL entries to `brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.
   - Each record contains: `step_index`, `source`, `type` (`USER_INPUT`, `PLANNER_RESPONSE`), `status`, `created_at` timestamp, `tool_calls` with arguments, and reasoning thoughts.
   - Tapping method: A filesystem watcher (such as `notify` in Rust) watching `transcript.jsonl` provides an immediate, low-latency live event feed of agent thinking and tool usage.
2. **SQLite WAL Activity:**
   - `conversations/<conversation-id>.db-wal` records disk writes on every turn transaction.
   - `conversation_summaries.db-wal` updates whenever conversation titles, step counts, previews, or FTS indexes change.
3. **Artifact File Watching:**
   - Watch `brain/<conversation-id>/*.md` for user-facing plan and memory updates.
4. **Direct Hooks/APIs:**
   - Antigravity does not expose a local outbound webhook mechanism for arbitrary external clients; the filesystem stream (`transcript.jsonl` + SQLite WAL) is the official and most reliable mechanism to tap live activity.

---

# Cross-checks

### 1. Git Repository Association
- **Inside Git Repositories:**
  - `C:\Users\luche\AppData\Local\hermes\hermes-agent` is a git repository (`.git` exists).
- **Not in Git Repositories:**
  - `C:\Users\luche\AppData\Local\hermes` (Hermes home root) is **not** a git repository.
  - `C:\Users\luche\AppData\Local\hermes\memories` is **not** a git repository.
  - `C:\Users\luche\.hermes` is **not** a git repository.
  - `C:\Users\luche\.gemini\antigravity` is **not** a git repository.
  - `C:\Users\luche\.gemini\config` is **not** a git repository.
  - `C:\Users\luche\.agents` is **not** a git repository.
  - Current workspace (`c:\Users\luche\Documents\projects\00000000\Cortex`) is **not** a git repository.

### 2. Markdown Note Counts and Largest Files
- **Total Markdown Files Across Discovered Sources:** 2,908 files
  - *Hermes Home (`AppData/Local/hermes`):* 2,769 markdown files (261 in `skills/`, 2,507 inside `hermes-agent/` repository, 1 root `SOUL.md`).
  - *Hermes Profile (`~/.hermes`):* 2 markdown files (`gepeto/SKILL.md`, `pinokio/SKILL.md`).
  - *Agents Profile (`~/.agents`):* 2 markdown files (`gepeto/SKILL.md`, `pinokio/SKILL.md`).
  - *Antigravity (`~/.gemini/antigravity`):* 30 markdown files (10 artifacts in `brain/`, 20 in `builtin/skills/`).
  - *User Projects (`C:\Users\luche\Documents\projects`):* 105 markdown files (excluding `node_modules`, `.git`, `.venv`).
- **Largest Single Markdown File:**
  - Overall: `C:\Users\luche\AppData\Local\hermes\hermes-agent\optional-skills\mlops\training\unsloth\references\llms-full.md` (1,077,327 bytes)
  - Within User Projects: `C:\Users\luche\Documents\projects\00000000\Chess bot\stockfish\stockfish\wiki\Regression-Tests.md` (313,551 bytes)
  - Within Curated Skills: `C:\Users\luche\AppData\Local\hermes\skills\creative\ascii-video\references\effects.md` (72,928 bytes)
  - Within Agent Artifacts: `C:\Users\luche\.gemini\antigravity\brain\cf30326b-cc15-4b85-b4fa-f5c82f9007d7\task.md` (54,344 bytes)

### 3. Symlink and Junction Verification
- Evaluated all discovered paths (`~/.gemini/antigravity`, `AppData\Local\hermes`, `~/.hermes`, `~/.agents`, `~/.gemini/config`) for NTFS reparse points, junction points, and symlinks.
- **Result:** 0 symlinks or junctions found. All discovered directories and configuration files are standard, physical filesystem entries.

---

# Surprises and uncertainties

### Surprises (Contradictions with Spec Expectations)
1. **Antigravity Conversations Format:**
   - *Expectation:* The Cortex spec and community reports stated that Antigravity stores conversations as encrypted, unreadable Protocol Buffer (`.pb`) files in `conversations/`.
   - *Discovery:* On this machine (Antigravity v2.28.2), `conversations/` does **not** contain `.pb` files. It contains SQLite `.db` databases (`<uuid>.db`). The database has an entropy of ~2.84, confirming it is unencrypted structured SQLite data. Inside the database, conversation turns are stored as protobuf records in a `steps` table alongside metadata tables (`trajectory_meta`, `executor_metadata`).
   - *Impact for Cortex:* Cortex does not need to reverse-engineer an encrypted file container. It can read conversation metadata and step statuses directly via SQLite, and read step contents either from the decoded FTS tables in `conversation_summaries.db` or directly from `brain/<uuid>/.system_generated/logs/transcript.jsonl`.
2. **Hermes Windows Home Directory Location:**
   - *Expectation:* Hermes was expected to store its configuration and home in `~/.hermes` or `$HERMES_HOME`.
   - *Discovery:* On Windows, Hermes defaults to `%LOCALAPPDATA%\hermes` (`C:\Users\luche\AppData\Local\hermes`). The directory `~/.hermes` only contains two skills (`gepeto` and `pinokio`), while all databases, configs, logs, and skills reside in `%LOCALAPPDATA%\hermes`.
   - *Impact for Cortex:* The Hermes adapter must check `%LOCALAPPDATA%\hermes` on Windows before falling back to `~/.hermes`.
3. **Hermes Built-in Memory Delimiter:**
   - *Expectation:* The spec anticipated that Hermes's built-in memory files might use YAML frontmatter or `[[wikilinks]]`.
   - *Discovery:* Built-in memory files (`MEMORY.md` and `USER.md`) do not use frontmatter or wikilinks. They are plain-text note arrays joined by `\n§\n` (Unicode `\u00A7` section mark). Frontmatter and `[[wikilinks]]` are introduced solely when using external wiki skills (`llm-wiki`) or external plugins.
   - *Impact for Cortex:* Cortex's Hermes adapter must support the `\n§\n` delimiter when parsing native `MEMORY.md` files.
4. **Missing Antigravity Directories:**
   - *Expectation:* The spec listed `implicit/`, `context_state/`, `html_artifacts/`, and `playground/` as potential directories under `~/.gemini/antigravity/`.
   - *Discovery:* None of these four directories exist on disk.
5. **Empty Knowledge Items:**
   - *Expectation:* Knowledge Items might populate `~/.gemini/antigravity/knowledge/`.
   - *Discovery:* `knowledge/` contains only `knowledge.lock` (0 bytes). No knowledge items are persisted there.
6. **Zero-Byte MCP Configuration:**
   - `mcp_config.json` exists at `C:\Users\luche\.gemini\config\mcp_config.json` but is completely empty (0 bytes).
7. **Obsidian Absence:**
   - No Obsidian installation or vaults (`.obsidian` directories) exist on the system.

### Uncertainties
1. **Dynamic Instantiation of `MEMORY.md`:**
   - Because no memories have been added in Hermes on this installation, `memories/` is currently empty. While the exact read/write contract was verified from the source code (`tools/memory_tool_store.py`), the live behavior of concurrent compaction could not be observed on a pre-populated file.
2. **Internal Protobuf Schema of SQLite Step BLOBs:**
   - In `conversations/<uuid>.db`, the `steps.step_payload` and `steps.metadata` columns contain binary protobuf BLOBs. In accordance with the strict read-only and no-decryption rules, these BLOBs were confirmed to be unencrypted structured binary, but their specific .proto schema definitions were not decoded.

### Errors Encountered and Redacted
1. **ModuleNotFoundError during Python home discovery:**
   - *Command:* Executing Python script from root directory without PYTHONPATH set.
   - *Error:* `ModuleNotFoundError: No module named 'agent'`
   - *Resolution:* Configured `PYTHONPATH` to point to `C:\Users\luche\AppData\Local\hermes\hermes-agent`.
2. **Ruamel YAML Import Failure with System Python:**
   - *Command:* Running hook inspection script with system Python.
   - *Error:* `ModuleNotFoundError: No module named 'ruamel'`
   - *Resolution:* Executed script using Hermes's managed venv runtime at `C:\Users\luche\AppData\Local\hermes\installs\7be0870b7f13ae68\environments\8de20f3e35394b8583d88bfb52f98231\venv\Scripts\python.exe`.
3. **PowerShell Argument Parsing with Quote Stripping:**
   - *Command:* Passing inline Python script as CLI arguments in PowerShell.
   - *Error:* `SyntaxError: unterminated string literal / invalid syntax`
   - *Resolution:* Piped scripts through standard input (`$script | python`) to avoid shell quotation mangling.
