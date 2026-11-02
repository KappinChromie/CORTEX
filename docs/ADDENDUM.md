# Cortex Spec Addendum: Machine Ground Truth & M0/M1 Guidance

*This document captures real-world ground truth discovered on this machine (see `docs/cortex-discovery-report.md`). Where this addendum conflicts with the original spec, **this addendum wins**.*

---

## 1. Antigravity (v2.28.2)
- **Conversations Storage:** `conversations/` holds SQLite `<uuid>.db` files, not raw `.pb` files. Support `.db`. If a `.pb` file is encountered, skip it and raise an adapter health warning. Do **NOT** decode internal protobuf BLOBs.
- **Reading Data:**
  - Read `brain/<uuid>/*.md` plus `*.md.metadata.json` (`summary`, `updatedAt`).
  - Read `brain/<uuid>/.system_generated/logs/transcript.jsonl` (`step_index`, `source`, `type`, `status`, `created_at`, `tool_calls`).
  - Read `conversation_summaries.db` (discover the schema at runtime; use `title`, `preview`, `step_count`, `workspace_uris`, `last_modified_time`).
- **File Exclusions:**
  - Do **NOT** index `brain/*/.system_generated/steps/*/output.txt` (~15,000 files). Count them only.
  - Skip `annotations/*.pbtxt`, `cache/`, `lib/`, `crashes/`, `presence/`.
- **Skills & Knowledge:**
  - Read `builtin/skills/*/SKILL.md`.
  - `knowledge/` is empty here (contains only `knowledge.lock`), but gracefully support Knowledge Items if they appear.

---

## 2. Hermes Agent (v0.22.5)
- **Home Resolution Order:**
  1. `$HERMES_HOME` (if set)
  2. `%LOCALAPPDATA%\hermes` (default on Windows)
  3. `~/.hermes` (fallback / secondary)
  - Also read `~/.hermes/skills` and `~/.agents/skills`.
  - Configured provider is `none (built-in only)`.
- **Sources to Ingest:**
  - `state.db` (tables: `sessions`, `messages` — read-only)
  - `projects.db` (tables: `projects`, `project_folders`)
  - `kanban.db` (tables: `tasks`, `task_links`, `task_runs`)
  - `skills/**/SKILL.md` (YAML frontmatter, including `metadata.hermes.related_skills` and tags)
  - `SOUL.md` (personality/system prompt)
  - `memories/MEMORY.md` and `USER.md`: Currently empty. When present, split on `\n§\n`, creating one Memory node per entry. No frontmatter or wikilinks in these.
- **Exclusions:**
  - **EXCLUDE:** `hermes-agent/` (its 2,507 markdown files are source code documentation), `tools/`, `installs/`, `cache/`, `node_modules`, `.git`, `.venv`.

---

## 3. Generic Markdown Vault
- Keep the generic markdown-vault adapter as an optional source: users can point at any folder later.
- Obsidian is not installed on this machine; do not assume default Obsidian paths exist.

---

## 4. Graph Construction & Relations
The graph is built from **structured relations**, not wikilinks:
- **Nodes:**
  - `Project`
  - `Session` (Hermes)
  - `Conversation` (Antigravity)
  - `Skill`
  - `Topic` (skill category/tag)
  - `Artifact`
  - `Task`
  - `Memory`
  - `Tool` (aggregated by name and capped to top 50 to avoid hairballs)
- **Edges:**
  - `Session` / `Conversation` -> `Project` (via `cwd`, `git_repo_root`, or workspace path)
  - `Session` -> parent `Session`
  - `Session` -> `Tool` (`tool_names`)
  - `Skill` -> `Skill` (`related_skills`)
  - `Skill` -> `Topic`
  - `Artifact` -> `Conversation`
  - `Task` -> `Project`
  - `Task` -> `Task` (`task_links`)
  - `Memory` -> `Session` (when known)
- **Cross-Agent Project Merging:**
  - Normalize project paths (case-folding, slash normalization, drive letters, trailing slash removal) so a project path used by both Hermes and Antigravity becomes **ONE shared `Project` node**.
  - Projects are the shared anchor stars connecting multi-agent activity.
  - If Antigravity does not expose a workspace path directly in conversation summaries, search `transcript.jsonl` and metadata for workspace paths.

---

## 5. Safety and Privacy (Strict)
- Never read `.env`, auth files, or secrets.
- Open every SQLite database **READ-ONLY** (`rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | SQLITE_OPEN_URI`).
- Never checkpoint WAL on source databases.
- Set busy timeout (`PRAGMA busy_timeout = 5000;`) and retry on `SQLITE_BUSY` (agents may be active concurrently).
- Store only short previews (max 300 characters) of message or transcript text in Cortex's own DB, passed through a redaction filter (API keys, bearer tokens, passwords, sensitive patterns). Full text is loaded on demand.
- Cortex's own data lives strictly in the Tauri app data directory (`cortex-store.db`), **never** inside agent folders. Cortex writes **nothing** to agent directories.
- Never commit real user data. Test fixtures must be synthetic.

---

## 6. Performance
- Async and incremental scanning keyed by `(path, mtime, size)`.
- Skip files larger than 5 MB. Cap markdown body reads at 256 KB.
- Full first scan of the machine should finish in under 10 seconds.

---

## 7. Layout Architecture
- Layouts must be **pluggable**.
- Define a layout interface in the UI:
  - Input: `nodes`, `edges`, and per-node timestamps.
  - Output: 3D position `[x, y, z]` per node ID.
- View-mode switch: `"hybrid"` (default/planned), `"web"` (active 3D force-directed), `"timeline"` (planned).
- For M0/M1: implement `"web"` (3D force-directed) active; stub `"hybrid"` and `"timeline"` as disabled options.
- Keep node identity and rendering stable across layout modes to enable transition animations.

---

## 8. Timestamps & Temporal Data
- Every node receives `created_at` and `last_active_at` where available:
  - Hermes: `sessions.started_at`, `sessions.last_activity_at`, `messages.created_at`, `tasks.created_at`, `tasks.completed_at`.
  - Antigravity: `transcript.jsonl` `created_at`, artifact metadata `updatedAt`, `conversation_summaries.last_modified_time`.
  - Fallback: file filesystem `LastWriteTime`.
- Store a lightweight `events` table (`ts`, `node_id`, `kind`) in Cortex store for session starts, message sends, task completions, artifact updates, etc.
- Track real timestamps vs. file-mtime fallbacks and min/max date ranges.
