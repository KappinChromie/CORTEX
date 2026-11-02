<USER_REQUEST>
Cortex Round 3: fixes + visual overhaul. Read docs/ADDENDUM.md and your Round 2 report first. All earlier safety rules still apply (read-only DBs, never read .env or secrets, redaction, nothing written to agent folders, no real user data in fixtures or commits). Commit after each numbered section. Do NOT build the timeline UI, live events/webhooks, the MCP server, health analysis, or editing. After Section 4, STOP and report.

1. TRUST AND CORRECTNESS FIXES
1.1 Data-source badge: replace the two states with three: "LIVE" (loaded through Tauri IPC), "SNAPSHOT" (static export of a real scan, used in browser dev mode), and "DEMO" (hardcoded mock). Add a tooltip explaining each. Confirm and report that `npm run tauri:dev` shows LIVE on this machine, and state exactly how you verified it.
1.2 Tighten src-tauri/capabilities/default.json back to windows: ["main"] (remove the "*" wildcard) and confirm IPC still works. Grant only the permissions the app actually uses.
1.3 Network audit: Cortex must make zero outbound network requests at runtime. Set a strict Content-Security-Policy in Tauri (default-src 'self'; no remote scripts, fonts, textures, or images), bundle every asset locally, and report any remote URL found in the source or built bundle and its removal.
1.4 Memory classification: SOUL.md is a persona/config document, not a memory. Add a kind or subkind for it (for example Persona) and make Memory nodes come ONLY from MEMORY.md / USER.md entries or equivalent real memory stores. Expected Memory count today: 0. Reconcile the report's contradictory statement about MEMORY.md appearing among mtime fallbacks, and update the timestamp coverage numbers.
1.5 "Showing X of Y nodes": add a tooltip listing what is hidden and why (for example "252 tags hidden by filter").

2. RENDERING BUGS
2.1 Label garbling: labels overlap and render as garbled text. Find the root cause (duplicate labels at the same position, a billboard drawn twice, depth or transparency sorting, or a label for both star and hover). Fix it so each node has at most one label. Use a crisp text approach (SDF text such as troika-three-text, or HTML overlay labels via drei <Html> with occlusion off), with a text-shadow or outline for readability.
2.2 Label policy: stars always labeled (fade by distance); planets labeled only when the camera is within a threshold distance of their star; category anchors labeled in the nebula; hovered and selected nodes always labeled. Cap visible labels (for example 40) with simple screen-space collision avoidance, preferring higher-importance nodes.
2.3 Star scale: star size must be clamped relative to camera distance so one star can never fill the screen at the default view. The default and "Frame all" camera positions must show the whole galaxy with every system distinguishable. Fix the initial camera framing to use the bounding sphere of all visible nodes.
2.4 Edges: hide skill-to-category edges (377) and tag edges by default; show them only for the hovered or selected node. Draw project-planet relationships as orbit rings, not lines. Draw cross-system edges (tool usage, shared artifacts) as thin, low-opacity curved arcs with additive blending and distance-based fade. The default view must not look like a hairball.

3. VISUAL OVERHAUL (art direction, not just function)
- Stars: emissive core with a soft corona/halo (shader or additive sprite), slow pulsing, color temperature by activity (hot white-blue = very active, warm orange = moderate, dim red = dormant). The generic-root star is dim and clearly distinct.
- Planets: shaded spheres (subtle diffuse lighting from their star) with a thin atmosphere rim glow. Color family by source (Antigravity blue, Hermes orange, shared purple) with slight hue variation per node. Moons are smaller and brighter.
- Tool hubs: a distinct geometry (small ring or station shape) so they read differently from planets.
- Skill nebula: render as soft, glowing particle clouds per category rather than hundreds of identical discs. Individual skills appear as points that brighten on hover; the category anchor is labeled.
- Orbit rings: very faint, fading, brighter for the hovered system.
- Background: deep-space gradient, two-layer parallax starfield, a few soft nebula clouds (low-opacity noise shader) tinted by the dominant source colors, and distance fog so far systems fade into the dark.
- Post-processing: bloom (tuned so labels stay readable), subtle vignette. Use @react-three/postprocessing or an equivalent, with all effects behind a Quality setting: Low / Medium / High, auto-chosen from measured frame time, user-overridable.
- UI: translucent glass panels with backdrop blur, one clean font bundled locally, a restrained accent palette, a polished inspector panel and tooltips.
- Motion: camera flights with ease-in-out and damping; hover gives a gentle scale-up and a ring pulse, never a snap. Selected node gets a persistent highlight ring.
- Keep 60fps on the real graph at Medium quality. Report frame times per quality level, plus the synthetic 10k graph at Low.

4. VISUAL QA LOOP (required)
Capture screenshots in docs/screenshots/: (a) galaxy overview at default framing, (b) one system close-up with orbits and labels, (c) the skill nebula, (d) a hovered/selected node with its inspector, (e) web mode, (f) each Quality level. LOOK at your own screenshots and critique them honestly against this list: is anything overlapping, garbled, oversized, invisible, or hairball-like? Fix at least the top three problems you find and re-capture. Include before/after pairs for what you fixed in the report. If you cannot capture screenshots, say so and describe how you verified visuals instead.

TESTS
Add tests for: label dedupe and cap logic, star-size clamping, camera framing math, edge-visibility rules, Memory classification (SOUL.md is not Memory), and CSP presence. Run cargo test --workspace, cargo clippy --workspace, and the UI build, and fix failures.

REPORT WHEN DONE
1. Fixes: badge states and how LIVE was verified, capability tightening, CSP/network audit results, Memory reclassification with updated counts, and the root cause of the label bug.
2. Visual changes made, with screenshots and the before/after pairs from Section 4.
3. Measured frame times per quality level (real graph, and synthetic 10k at Low).
4. Anything wrong or impossible, and questions for me. Then stop.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-01T19:39:50-06:00.
</ADDITIONAL_METADATA>