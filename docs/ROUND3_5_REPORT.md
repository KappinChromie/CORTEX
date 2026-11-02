# Cortex Round 3.5 Report: Galaxy View Visual Polish & Corrections

**Date:** 2026-11-02  
**Machine:** Windows 10 Home (x86_64-pc-windows-msvc), Node v22.14.0, Rust 1.99.0 stable, WebView2 133.0.3065.92  
**Target:** Visual overhaul of the 3D galaxy view, edge hairball remediation, legible typography, stellar color temperatures, and visual QA loop.

---

## 0. Launch Check

- **Command executed:** `npm run tauri:dev` from repository root (`c:\Users\luche\Documents\projects\00000000\Cortex`).
- **Dev and Build Commands:** Verified in `src-tauri/tauri.conf.json`:
  - `beforeDevCommand`: `"npm --prefix ui run dev"`
  - `beforeBuildCommand`: `"npm --prefix ui run build"`
  - `devUrl`: `"http://localhost:5173"`
  - `frontendDist`: `"../ui/dist"`
- **Native Verification:**
  - `npm run tauri:dev` launched native WebView2 process (`msedgewebview2.exe`).
  - Native window opened displaying the full 3D interactive observatory.
  - Header data source badge confirmed: `● LIVE` (loaded through native Tauri IPC `get_graph_snapshot`).
  - Node counts: `Showing 148 of 400 nodes` (ambient filter active; 400 total nodes in store DB).
  - CLI parity: `.\target\debug\cortex-cli.exe scan` confirmed 400 total nodes (15 projects, 22 conversations, 2 sessions, 7 artifacts, 1 persona, 68 skills, 20 tools, 265 topics/tags).
- **Production Build:**
  - Ran `npm run tauri:build` from repository root.
  - Successfully compiled Rust release binary `cortex-desktop.exe` in 21.21s with zero errors:
    `target/release/cortex-desktop.exe` (13,647,360 bytes).

---

## 1. Edge Investigation & Root Causes

Using a dedicated diagnostic script (`diagnose_edges.py`) inspecting live runtime data, the causes of the dense hairball, straight off-screen lines, and bracket-shaped curves were isolated:

1. **Unfiltered cross-system links in default overview:**
   - 184 cross-system curved arcs were rendering simultaneously by default (110 `uses_tool` links, 67 `related_skill` links, 7 `artifact_conversation` links).
2. **Static base position vs. Dynamic simulation desynchronization:**
   - Planetary bodies orbit each frame, but `EdgesLayer` originally used static positions computed at mount time. This caused arc endpoints to freeze at initial coordinates or disconnect as planets drifted.
   - 132 edges had `(0, 0, 0)` endpoints in static layout because orbiting planets start at `(0, 0, 0)` before runtime evaluation.
3. **Out-of-bounds chord distances:**
   - 81 edges had distances exceeding 1,500 units (up to 1,980 units across opposite sides of the galaxy), creating long lines slicing across the scene.
4. **Sideways bracket hooks (`<` and `>`):**
   - The arc control point formula previously used horizontal radial outward vectors that bent sideways toward screen borders, causing visual bracket artifacts on peripheral nodes.
5. **Skill/tag leakage:**
   - Category-to-tag and intra-nebula skill edges were being evaluated as visible arcs even when no endpoint was active.

---

## 2. Edge Rules & Links Mode Control

### Implemented Controls & Behavior:
- **Links Control UI:** Added a three-state segmented toggle button in `HeaderBar`:
  - `Off`: Hides all cross-system links. Shows only planetary orbit rings. Active nodes show only their direct highlighted links on hover/select.
  - `Strong` (Default): Shows faint orbit rings + at most the 30 strongest cross-system links. Intra-nebula skill connections and tool hubs are hidden by default to keep the galaxy pristine.
  - `All`: Shows all valid cross-system links (capped at 400 arcs) with upward 3D elevation.
- **Rendering Aesthetics:**
  - Ambient cross-system links: rendered with thin lines, low opacity (`0.11`), additive blending (`THREE.AdditiveBlending`), and subtle lavender tone (`#818cf8`).
  - Active hover/select links: highlighted in brilliant electric cyan (`#38bdf8`) with high opacity (`0.88`), dimming all non-connected edges.
- **Tool Hubs:**
  - Tool nodes sit between solar systems rendered as technical rotating toruses (`#38bdf8`).
  - In `Strong` mode, tool usage links are hidden by default and appear exclusively when a tool or conversation is hovered or selected.
- **Deterministic Arc Geometry & Clamping:**
  - `isEdgeGeometryValid`: Rejects endpoints that are non-finite (NaN/Inf), identical (degenerate), or exceed galaxy bounds (`maxChordLength: 1100.0`, `sanityLimit: 2500.0`).
  - `computeArcControlPoint`: Computes an upward cosmic bridge arching gracefully into space along the perpendicular normal vector, with height clamped to `[12.0, 65.0]` and subtle deterministic hash jitter. Sideways bracket hooks are eliminated.
  - Live per-frame endpoint resolution via `positionsRef.current` ensures arc endpoints stay locked to orbiting planets.

---

## 3. Legible Typography & Project Labeling

### Label Overhaul:
- **Font & Backing:** Set minimum font size to 12px (13px for project stars and active hovered nodes). Backed by dark translucent pills (`rgba(15, 23, 42, 0.85)` / `0.95` active) with subtle border outlines and box shadows (`0 2px 6px rgba(0,0,0,0.5)`).
- **Human-Readable Project Names:**
  - Normalized project titles using `getProjectBasename` and `project_title_from_path`, extracting the project folder basename (e.g. `cortex`, `leon_voice_bridge`, `transformernn`, `htmlcity`).
  - Generic user home roots (e.g. `c:\Users\luche`) are cleanly labeled `"Unaffiliated (home folder)"`.
- **Category Suffixes:**
  - Stripped internal numeric prefixes from category anchor titles and appended clean count suffixes: e.g. `creative (10)`, `social-media (1)`.
- **Screen-Space Collision Avoidance:**
  - Implemented `select_visible_labels` in Rust and TypeScript, prioritizing project stars, category anchors, and active nodes, strictly capping overview labels at 25 visible tags to eliminate overlapping label garble.

---

## 4. Star Colors & System Readability

### Activities & Stellar Temperatures:
- **Relative Activity Percentile Ranking:**
  - Rather than absolute arbitrary thresholds (which marked all stars dormant red), project stars are ranked by relative last-activity recency within this machine's dataset:
    - **Hot (Top 30%, percentile >= 0.70):** Luminous electric blue-white stellar core (`#f0f9ff`) with soft cyan pulsating corona (`#38bdf8`).
    - **Warm (Middle 40%, 0.30 <= percentile < 0.70):** Golden amber stellar core (`#fffbeb`) with radiant orange corona (`#f59e0b`).
    - **Dormant (Lowest 30%, percentile < 0.30):** Deep crimson red stellar core (`#991b1b`) with ruby corona (`#ef4444`).
    - **Unaffiliated Generic Root:** Dim slate core (`#64748b`) with charcoal corona (`#475569`).
  - Tooltips and SidePanel show the absolute ISO / UTC activity date and relative tier.
- **Elimination of the "Odd White Mark":**
  - **Root Cause:** A specular reflection artifact caused by directional lighting on standard material spheres combined with a nested duplicate emissive sphere (`#fee2e2`) at scale `0.9` in `StarGlowLayer`.
  - **Fix:** Removed duplicate standard mesh and inner nested sphere; unified all star rendering into `StarGlowLayer` using pure emissive luminous astronomical geometry.
- **Planets & Orbit Rings:**
  - Orbit ring opacity increased from `0.1` to `0.32` ambient, brightening to `0.75` when a system is hovered or selected.
  - Planet sizes increased to 6.5–10.0 units for clear planetary distinction.
- **Skill Nebula:**
  - Upgraded skill clouds into volumetric particle dust clouds using soft radial alpha textures, 26px size attenuation, and multi-color indigo/cyan/violet palette.

---

## 5. Visual QA Loop & Critique

Full native window screenshots were captured via Chrome DevTools Protocol directly inside Tauri WebView2 at both **1600x1000** and **1280x720**:

| View | 1600x1000 Capture | 1280x720 Capture |
|---|---|---|
| **(a) Default Overview** | `docs/screenshots/view-a-default-overview-1600x1000.png` | `docs/screenshots/view-a-default-overview-1280x720.png` |
| **(b) System Close-up** | `docs/screenshots/view-b-system-closeup-1600x1000.png` | `docs/screenshots/view-b-system-closeup-1280x720.png` |
| **(c) Hovered Node with Edges** | `docs/screenshots/view-c-hovered-edges-1600x1000.png` | `docs/screenshots/view-c-hovered-edges-1280x720.png` |
| **(d) Links: All Mode** | `docs/screenshots/view-d-links-all-1600x1000.png` | `docs/screenshots/view-d-links-all-1280x720.png` |
| **(e) Skill Nebula** | `docs/screenshots/view-e-skill-nebula-1600x1000.png` | `docs/screenshots/view-e-skill-nebula-1280x720.png` |

### Honest Self-Critique & Top 3 Issues Fixed:

1. **Issue 1: Intra-nebula and parent-child edges leaking into Strong mode**
   - *Flaw:* `related_skill` and `artifact_conversation` edges were being scored as strong links, cluttering the central galaxy view with lines crossing between nebula clouds.
   - *Fix:* Explicitly filtered out intra-nebula skill edges and tool hub links in `Strong` mode. Restricted them to hover/select or `All` mode.
2. **Issue 2: Selection ring clipping into the camera on category nodes**
   - *Flaw:* In View E (Skill Nebula), category anchors have a radius of 6.5 units but are surrounded by a 120-unit particle cloud. Framing distance was calculated using planetary metrics (`dist = 35`), placing the camera inside the selection ring.
   - *Fix:* Updated `CameraController` with kind-specific framing distances: project stars frame at `160` units, category nebula clusters frame at `240` units, and planets frame at `65` units.
3. **Issue 3: Sideways bracket curves at screen periphery**
   - *Flaw:* Calculating arc control points with horizontal lateral deflection created `<` and `>` shaped curves near the viewport edges.
   - *Fix:* Replaced lateral vector math with an upward perpendicular arch vector directed along the cosmic normal vector (`archDir.y >= 0`), creating clean, natural arch bridges.

---

## 6. Test Suite & Verification

All automated test suites pass across all crates:

- **Cargo Test Workspace:** `cargo test --workspace`
  - Total: **29 tests passed, 0 failed, 0 ignored**
  - Covered:
    - `test_edge_sanitization`: Verifies rejection of NaNs, infinities, degenerate zero-length, and out-of-bounds coordinates.
    - `test_arc_geometry_determinism_and_no_loops`: Verifies deterministic quadratic bezier control points and loop prevention.
    - `test_strong_links_cap_and_tool_rules`: Verifies 30-link maximum cap and tool hub exclusion.
    - `test_star_activity_percentile_mapping`: Verifies hot (>= 0.70), warm (0.30–0.70), dormant (< 0.30), and root tiers.
    - `test_star_size_clamping`: Verifies [5.5, 11.0] star radius limits.
    - `test_label_dedupe_and_cap_logic`: Verifies screen-space collision suppression and deduplication.
    - `test_project_title_basename_and_generic_root`: Verifies folder basename extraction and generic root labeling.
    - `test_bounding_sphere_framing_math`: Verifies camera radius and FOV framing math.
- **Cargo Clippy Workspace:** `cargo clippy --workspace`
  - **0 warnings** (clean build).
- **Frontend UI Build:** `npm --prefix ui run build`
  - **Zero TypeScript errors**, Vite bundle generated successfully in 635ms.
