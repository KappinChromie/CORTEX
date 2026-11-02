import json
import math
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("ui/public/snapshot.json", "r", encoding="utf-8") as f:
    data = json.load(f)

snapshot = data.get("snapshot", data)
nodes = {n["id"]: n for n in snapshot["nodes"]}
edges = snapshot.get("edges", [])
layout = data.get("hybrid_layout", {})

print(f"Total Nodes: {len(nodes)}, Total Edges: {len(edges)}, Layout Entries: {len(layout)}")

# Edge categories
edge_counts = {}
for e in edges:
    kind = e.get("kind", "unknown")
    edge_counts[kind] = edge_counts.get(kind, 0) + 1

print("\nEdge counts by kind:")
for k, v in sorted(edge_counts.items()):
    print(f"  {k:25}: {v}")

print("\n--- INVESTIGATING ENDPOINTS & DISTANCES ---")
missing_pos = []
zero_endpoints = []
huge_distance = []
nan_inf = []

distances = []
edge_details = []

for e in edges:
    src_id = e["from"]
    tgt_id = e["to"]
    kind = e.get("kind", "unknown")

    src_node = nodes.get(src_id)
    tgt_node = nodes.get(tgt_id)

    src_pos = None
    tgt_pos = None

    if src_id in layout:
        src_pos = layout[src_id].get("base_position")
    if tgt_id in layout:
        tgt_pos = layout[tgt_id].get("base_position")

    if not src_pos or not tgt_pos:
        missing_pos.append((e, src_id if not src_pos else None, tgt_id if not tgt_pos else None))
        continue

    # Check for NaN / Inf
    if any(math.isnan(x) or math.isinf(x) for x in src_pos + tgt_pos):
        nan_inf.append((e, src_pos, tgt_pos))
        continue

    # Check for (0, 0, 0)
    src_is_zero = all(abs(x) < 1e-4 for x in src_pos)
    tgt_is_zero = all(abs(x) < 1e-4 for x in tgt_pos)
    if src_is_zero or tgt_is_zero:
        zero_endpoints.append((e, src_id if src_is_zero else None, tgt_id if tgt_is_zero else None, src_pos, tgt_pos))

    dx = src_pos[0] - tgt_pos[0]
    dy = src_pos[1] - tgt_pos[1]
    dz = src_pos[2] - tgt_pos[2]
    dist = math.sqrt(dx*dx + dy*dy + dz*dz)
    distances.append(dist)

    if dist > 1500:
        huge_distance.append((dist, e, src_pos, tgt_pos))

    edge_details.append({
        "kind": kind,
        "from": src_id,
        "to": tgt_id,
        "src_kind": src_node["kind"] if src_node else "missing",
        "tgt_kind": tgt_node["kind"] if tgt_node else "missing",
        "from_is_ambient": src_node.get("is_ambient", False) if src_node else False,
        "to_is_ambient": tgt_node.get("is_ambient", False) if tgt_node else False,
        "dist": dist,
        "src_pos": src_pos,
        "tgt_pos": tgt_pos
    })

print(f"Missing position edges: {len(missing_pos)}")
for e, s, t in missing_pos[:10]:
    print(f"  Missing: {e['kind']} (from: {s}, to: {t})")

print(f"Endpoints at (0,0,0): {len(zero_endpoints)}")
for e, s, t, sp, tp in zero_endpoints[:10]:
    print(f"  Zero: {e['kind']} from {e['from']} to {e['to']}")

print(f"Huge distance (>1500) edges: {len(huge_distance)}")
huge_distance.sort(key=lambda x: -x[0])
for dist, e, sp, tp in huge_distance[:15]:
    src_title = nodes.get(e['from'], {}).get('title', e['from'])
    tgt_title = nodes.get(e['to'], {}).get('title', e['to'])
    print(f"  Dist {dist:7.1f}: {e['kind']:20} '{src_title}' -> '{tgt_title}' | src: {[round(x,1) for x in sp]} | tgt: {[round(x,1) for x in tp]}")

# Check which edges are currently marked as curved_arc in default view by evaluateEdgeStyle
default_curved = []
for ed in edge_details:
    kind = ed["kind"]
    if kind == "skill_topic":
        continue
    if ed["src_kind"] == "topic" and nodes.get(ed["from"], {}).get("subkind") == "tag":
        continue
    if ed["tgt_kind"] == "topic" and nodes.get(ed["to"], {}).get("subkind") == "tag":
        continue
    if kind in ("project_session", "project_task"):
        continue
    default_curved.append(ed)

print(f"\nEdges showing by DEFAULT as curved_arc in current evaluateEdgeStyle: {len(default_curved)}")
curved_by_kind = {}
for ed in default_curved:
    curved_by_kind[ed["kind"]] = curved_by_kind.get(ed["kind"], 0) + 1
for k, v in sorted(curved_by_kind.items()):
    print(f"  {k:25}: {v}")

# Sample some of these curved arcs
print("\nSample default curved arcs with longest distances:")
default_curved.sort(key=lambda x: -x["dist"])
for ed in default_curved[:10]:
    print(f"  Dist {ed['dist']:7.1f}: {ed['kind']:18} {ed['from']:35} -> {ed['to']:30}")
