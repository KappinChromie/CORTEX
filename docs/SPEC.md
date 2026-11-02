# Cortex: Agent Brain Observatory

*Working title. Product and technical spec, v0.1. Written to be handed to a coding agent.*

## 1. Vision

Cortex is a desktop app that lets you **see and manage an AI agent's brain**. It reads the memory, knowledge, and activity of agents such as **Hermes Agent** and **Google Antigravity**, merges them into one graph, and renders that graph as a living, explorable **solar system / galaxy**.

Obsidian's graph view is a flat, static tangle with no sense of time, importance, or live activity. Cortex keeps the best part of the Obsidian ecosystem, open plain-markdown files with `[[wikilinks]]`, and replaces the viewing experience with something purpose-built for agent memory:

- **Live:** watch the agent recall and write memories in real time.
- **Temporal:** memories age, fade, and strengthen. Scrub through time to replay how the brain grew.
- **Multi-agent:** one view across several agents and projects.
- **Actionable:** edit, merge, pin, or delete memories, and find stale, duplicate, or contradictory ones.

## 2. Goals and non-goals

**Goals**

1. Read-only visualization of Hermes and Antigravity memory works end to end first.
2. A plug-in adapter system so adding a new agent (Claude Code, Codex, OpenClaw, and so on) means writing one Rust module.
3. Smooth rendering of 50,000+ nodes.
4. Everything local. No cloud, no telemetry, no accounts.
5. Safe editing: never corrupt the agent's memory, and every write is undoable.

**Non-goals (v1)**

- Replacing the agent's own memory system or retrieval. Cortex is an observatory and control panel, not a memory provider.
- Running or orchestrating agents.
- Mobile or web versions.
- Cloud sync.

## 3. What we know about the data sources

Be honest about certainty here. The agent building this must treat everything marked *unverified* as something to discover on a real machine, not assume.

### 3.1 Hermes Agent (Nous Research)

- Supports pluggable **memory providers**, and several community plugins keep memory as a **folder of markdown files with wikilinks** (for example hwiki, Basic Memory, moss-brain, Cashew). An Obsidian vault is a valid memory store.
- Documentation recommends a dedicated vault folder such as `Agent Memory/` or `Hermes/` containing files like `MEMORY.md` and session summaries.
- Some providers add an index (SQLite FTS5) or a graph file (for example an edges JSON).
- *Unverified:* the exact layout of Hermes's own home directory (`~/.hermes`) and built-in memory files. The Hermes adapter must **discover** this rather than hardcode it, and must let the user point at any folder.

### 3.2 Google Antigravity

- Data directory: `~/.gemini/antigravity/` (on Windows, under the user profile).
- Observed structure from user reports: `conversations/` (`.pb` files), `brain/<conversation-id>/` (artifacts, logs, overview files), `knowledge/` (Knowledge Items, plus a lock file), `implicit/`, `context_state/`, `mcp_config.json`, `html_artifacts/`.
- Project-level memory can also appear as markdown (for example a `.agents/` directory with memory-bank files and `SKILL.md` skills).
- **Important caveats:**
  - The `.pb` conversation files are Protocol Buffers and reportedly **encrypted or otherwise unreadable**. Do not depend on parsing them in v1.
  - Users report that `brain/` subdirectories and `knowledge/` are frequently **empty** because persistence is buggy in some versions.
  - The layout is undocumented and may change between versions.
- Therefore the Antigravity adapter must be **defensive**: read what is readable (markdown artifacts, Knowledge Items, rules, skills, MCP config), tolerate empty or missing folders, and report adapter health in the UI instead of failing.

### 3.3 Generic markdown vault (the universal fallback)

Any folder of `.md` files with frontmatter and `[[wikilinks]]`, including an Obsidian vault. This is the adapter every other agent can use immediately, and it is the first one to build.

## 4. Architecture

Tauri 2 app. Rust owns all data, indexing, and logic. The frontend only renders and sends commands.

```
cortex/
├── crates/
│   ├── cortex-model/      # Unified data types (Node, Edge, Event, Source)
│   ├── cortex-adapters/   # One module per agent; implements SourceAdapter
│   │   ├── markdown_vault.rs
│   │   ├── hermes.rs
│   │   └── antigravity.rs
│   ├── cortex-store/      # SQLite (rusqlite, WAL) + optional embeddings
│   ├── cortex-graph/      # petgraph build, clustering, decay scoring, orbit assignment
│   ├── cortex-watch/      # notify-based file watcher, debounced event stream
│   └── cortex-edit/       # Safe write operations, git snapshots, undo
├── src-tauri/             # Tauri shell: commands + events (thin)
└── ui/                    # TypeScript + React + three.js (react-three-fiber)
```

**Design rule:** all core logic lives in the crates, not in `src-tauri`. The Tauri layer should be thin enough that the UI could be swapped later.

### 4.1 Data flow

1. Adapters scan their sources and emit normalized `Node`, `Edge`, and `Event` records.
2. `cortex-store` persists them in SQLite, with incremental updates keyed by file path and content hash.
3. `cortex-graph` computes derived data: clusters, importance, decay, orbit parameters.
4. The UI requests a graph snapshot, then subscribes to live deltas over Tauri events.
5. `cortex-watch` feeds file changes back into step 1.

## 5. Unified data model

```rust
struct Node {
    id: NodeId,            // stable: hash of (source_id, canonical_path_or_key)
    source_id: SourceId,   // which agent/vault produced it
    kind: NodeKind,        // Project, Topic, Entity, Memory, Skill, Rule,
                           // KnowledgeItem, Conversation, Artifact, Tool
    title: String,
    body_preview: String,  // first ~500 chars; full text read on demand
    path: Option<PathBuf>,
    tags: Vec<String>,
    created_at: Option<DateTime>,
    modified_at: Option<DateTime>,
    last_accessed_at: Option<DateTime>,  // from agent events if available
    access_count: u32,
    pinned: bool,
    // derived (computed by cortex-graph):
    importance: f32,       // 0..1
    freshness: f32,        // 0..1, decays over time
    cluster_id: Option<ClusterId>,
}

struct Edge {
    from: NodeId,
    to: NodeId,
    kind: EdgeKind,        // Wikilink, Backlink, Contains, Mentions,
                           // DerivedFrom, SemanticNeighbor, CoAccessed
    weight: f32,
}

struct Event {
    ts: DateTime,
    source_id: SourceId,
    node_id: Option<NodeId>,
    kind: EventKind,       // Read, Write, Created, Deleted, Recalled, ToolCall
    session_id: Option<String>,
}
```

### 5.1 Adapter trait

```rust
trait SourceAdapter: Send + Sync {
    fn id(&self) -> SourceId;
    fn detect(&self) -> DetectResult;                  // found? where? what version?
    fn scan(&self, ctx: &ScanCtx) -> Result<ScanOutput>; // full or incremental
    fn watch_paths(&self) -> Vec<PathBuf>;
    fn health(&self) -> AdapterHealth;                  // OK / Degraded(reason) / Missing
    fn live_events(&self) -> Option<EventStream>;       // optional
}
```

Every adapter must return partial results plus warnings instead of erroring out when something is unreadable.

## 6. Graph intelligence (the Rust-heavy core)

### 6.1 Edges

- **Explicit:** wikilinks, markdown links, folder containment, frontmatter references (`project:`, `related:`).
- **Inferred (optional, off by default):** semantic neighbors from local embeddings. Use a small local model via `fastembed` or `ort`. Must never send data off the machine.
- **Behavioral:** co-access edges. Two nodes recalled in the same session get a weak edge.

### 6.2 Clustering

Community detection (Louvain first, Leiden later) over the combined graph. Each cluster becomes a **star system**. Name clusters with the highest-importance node by default.

### 6.3 Importance and decay

- `importance` = weighted blend of: inbound link count, access count, pinned status, node kind weight, and recency.
- `freshness` = exponential decay from `max(modified_at, last_accessed_at)`, with a configurable half-life (default 30 days). Accessing a node resets and strengthens it. Pinned nodes do not decay.
- All formulas are configurable and unit-tested.

### 6.4 Health analysis

Detect and surface: orphan notes (no links), duplicates (near-identical text), stale facts (high age, low access), broken wikilinks, oversized notes, and conflicting memories (same entity, divergent claims, via simple heuristics first, optional local LLM later).

## 7. Visualization

### 7.1 The solar-system mapping

| Concept | Visual |
| --- | --- |
| Cluster / project | **Star system**, with a glowing star at the center |
| Topic or entity | **Planet** orbiting the star |
| Individual memory / fact | **Moon** orbiting a planet |
| Skills / rules / tools | Distinct shapes (rings, stations) so they read differently from memories |
| Importance | Body size |
| Freshness | Brightness and color warmth (fresh = bright, old = dim and cool) |
| Age / decay | Orbit radius drifts outward over time |
| Link between bodies | Faint beam; thickness = weight |
| Pinned | Gold halo |
| Agent source | Color family per agent (Hermes, Antigravity, others) |

Orbits are computed analytically from the node's parameters, so no per-frame physics simulation is needed for the system view. That keeps it fast.

### 7.2 Three zoom levels

1. **Galaxy:** all star systems laid out with a force-directed layout, with edges between systems drawn as faint trails. Use instanced rendering.
2. **System:** one star with its planets and moons in orbit.
3. **Body:** a detail panel for a single memory: full text, metadata, backlinks, history, and edit controls.

Transitions between levels are animated camera flights.

### 7.3 Live activity

- When the agent reads or writes a node, that body **pulses** and a light pulse travels along the links it touched.
- A "live feed" side panel lists events as they arrive. Click one to fly to the node.
- A toggle for "follow the agent" lets the camera track the most recent activity.

### 7.4 Time

- A bottom **timeline scrubber** replays graph growth: nodes appear when created and fade as they decay.
- Playback speed control, plus markers for large events (big imports, deletions).

### 7.5 Other panels

- **Search:** fuzzy and full text (SQLite FTS5), results highlight in the 3D view.
- **Filters:** by agent, kind, tag, date range, freshness.
- **Health view:** the list from 6.4, with one-click fly-to.
- **Source status:** each adapter shows OK, Degraded, or Missing with a reason (essential for Antigravity's flaky persistence).
- **2D fallback:** a flat graph mode for low-power machines and accessibility.

### 7.6 Performance targets

- 60 FPS at 10,000 nodes, 30 FPS at 50,000 on a mid-range laptop GPU.
- Cold start to first render under 3 seconds for a 10,000-note vault (cached index).
- Incremental update after a file change reflected on screen within 500 ms.
- Techniques: instanced meshes, level-of-detail by camera distance, hide labels beyond a threshold, precompute orbit parameters in Rust.

## 8. Editing and control (v2 scope, designed in from the start)

- Edit a memory's text and metadata from the detail panel.
- Pin or unpin, merge two nodes (with a diff preview), delete, or move between projects.
- Create a link by dragging from one body to another, which inserts a `[[wikilink]]` into the file.
- Bulk actions from the Health view (for example, archive all stale nodes).

**Safety rules (non-negotiable)**

1. Cortex writes only to folders the user has explicitly marked **writable** per source. Default is read-only.
2. Before any write, snapshot the file (git commit if the vault is a repo, otherwise a copy in `.cortex/history/`).
3. Every write is undoable from an in-app history.
4. Never write to Antigravity's `.pb` or any binary or encrypted file.
5. Detect concurrent modification by the agent (compare content hash before writing) and refuse with a clear message.

## 9. Tauri API surface

**Commands (UI to Rust)**

- `list_sources()`, `add_source(config)`, `remove_source(id)`, `rescan(source_id)`
- `get_graph_snapshot(filters)` returning nodes, edges, clusters, and orbit params
- `get_node(id)` returning full body, backlinks, and history
- `search(query, filters)`
- `get_timeline(range)` and `get_health_report()`
- `update_node(id, patch)`, `merge_nodes(a, b)`, `delete_node(id)`, `undo(op_id)`
- `get_settings()` and `set_settings()`

**Events (Rust to UI)**

- `graph:delta` (added, changed, removed nodes and edges)
- `agent:event` (a single Read/Write/Recall event)
- `source:health` (adapter state changed)
- `index:progress`

Define these as shared, typed structs and generate TypeScript types from them (`ts-rs` or `specta`) so the two sides cannot drift.

## 10. Tech stack

- **Rust:** `tauri 2`, `tokio`, `rusqlite` (with FTS5), `petgraph`, `notify`, `serde`, `gray_matter` or `serde_yaml` (frontmatter), `pulldown-cmark` (markdown), `ignore` (fast directory walking), `git2` (snapshots), `ts-rs` or `specta`, optional `fastembed`.
- **Frontend:** TypeScript, React, `@react-three/fiber`, `three`, `zustand` (state), Tailwind.
- **Tooling:** `cargo test`, `clippy`, `rustfmt`, Vitest, GitHub Actions for builds on macOS, Windows, and Linux.

## 11. Milestones

**M0: Skeleton (1 to 2 days).** Cargo workspace, Tauri shell, shared types, a hello-world command and event round trip.

**M1: Vault to graph.** `markdown_vault` adapter, SQLite store, wikilink parsing, `get_graph_snapshot`, and a basic 3D force-directed view. *Exit test:* open an Obsidian vault and see its graph.

**M2: Solar system.** Clustering, importance and decay scoring, orbit assignment, the three zoom levels, and search.

**M3: Live.** File watcher, incremental indexing, `graph:delta`, pulse animations, and the live feed panel.

**M4: Real agents.** Hermes adapter (discovery-based) and Antigravity adapter (defensive), adapter health UI, per-agent colors, and a source setup wizard.

**M5: Time and health.** Timeline scrubber, health analysis view, and the 2D fallback.

**M6: Control.** Safe editing, snapshots, undo, merge, and linking by drag.

**M7: Polish.** Performance pass, packaging, settings, onboarding, and documentation.

## 12. Testing

- **Adapters:** fixture folders for each source, including deliberately broken ones (empty `brain/` dirs, missing `knowledge/`, malformed frontmatter, huge files, symlink loops).
- **Graph:** unit tests for decay math, clustering stability, and orbit assignment determinism (same input gives the same layout).
- **Watcher:** simulated rapid file changes to verify debouncing and no lost updates.
- **Safety:** tests that prove no write occurs outside writable folders and that undo restores exact bytes.
- **Performance:** a synthetic generator for 10k, 50k, and 100k node vaults, with benchmarks tracked in CI.

## 13. Risks and open questions

1. **Antigravity's format is undocumented and unstable.** Mitigation: defensive adapter, health reporting, and a fixtures-first approach. If someone reverse-engineers the `.pb` files later, add it as a new adapter version.
2. **Hermes's on-disk layout varies by memory provider.** Mitigation: user-selected folder plus auto-detect for known providers.
3. **Live "agent read" events may not be available** for every agent. Mitigation: fall back to file access times and modification events, and optionally offer a tiny MCP server or plugin that agents can call to report reads.
4. **Privacy.** Agent memory can contain secrets. Mitigation: local only, a redaction option for display, and clear scoping of what is indexed.
5. **Scope creep.** The editing features and embeddings are the easiest places to lose months. Ship M1 to M4 first.
6. **Open questions for the owner:** Which OS do you use? Does your Hermes use a specific memory plugin? Do you want Claude Code supported in v1? Should semantic embeddings be in v1 or later?

## 14. Starter prompt for the coding agent

> You are building **Cortex**, a Tauri 2 desktop app (Rust core, TypeScript + React + three.js UI) that visualizes AI agent memory as an interactive solar system. Read the attached spec fully before writing code. Rules: (1) all logic lives in Rust crates, `src-tauri` stays thin; (2) generate TypeScript types from Rust structs; (3) never assume file layouts marked *unverified* in the spec, so build discovery and health reporting; (4) default to read-only, and implement writes only in M6 with snapshots and undo; (5) work milestone by milestone, and after each one run `cargo test`, `cargo clippy`, and the UI build, then summarize what works and what is next. Start with **M0 and M1 only**. When finished with M1, stop and report before continuing.
