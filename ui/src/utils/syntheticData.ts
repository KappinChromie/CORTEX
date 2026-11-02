import type { EnrichedGraphSnapshot, Node, Edge, HybridNodeLayout } from '../types';

export function generateSynthetic10kSnapshot(): EnrichedGraphSnapshot {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const hybridLayout: Record<string, HybridNodeLayout> = {};

  const numNodes = 10000;
  const numStars = 100;
  const planetsPerStar = 30;

  // 1. Generate 100 Star Systems (Projects)
  for (let s = 0; s < numStars; s++) {
    const starId = `synth:project:${s}`;
    const goldenAngle = s * 2.399963;
    const r = Math.sqrt(s + 1) * 85.0;
    const starPos: [number, number, number] = [
      r * Math.cos(goldenAngle),
      ((s % 11) - 5) * 8.0,
      r * Math.sin(goldenAngle),
    ];

    nodes.push({
      id: starId,
      source_id: s % 2 === 0 ? 'antigravity' : 'hermes',
      kind: 'project',
      title: `System-${s}`,
      body_preview: `Synthetic star system workspace #${s}`,
      access_count: 10 + (s % 50),
      pinned: false,
      degree: planetsPerStar,
      importance: 0.8,
      freshness: 0.9,
      is_ambient: false,
      is_generic_root: false,
      tags: ['project'],
      created_at: '2026-09-01T00:00:00Z',
      last_active_at: '2026-11-01T00:00:00Z',
      modified_at: '2026-11-01T00:00:00Z',
      timestamp_source: 'derived_children',
      hidden_by_default: false,
      metadata: {},
    });

    hybridLayout[starId] = {
      role: 'star',
      base_position: starPos,
      orbit: undefined,
    };
  }

  // 2. Generate Planets orbiting each Star
  let planetCount = 0;
  for (let s = 0; s < numStars; s++) {
    const starId = `synth:project:${s}`;
    for (let p = 0; p < planetsPerStar; p++) {
      if (nodes.length >= numNodes - 2000) break;
      const planetId = `synth:conv:${planetCount++}`;
      const radius = 60.0 + p * 12.0;
      const speed = (0.3 + (p % 5) * 0.15) * (p % 2 === 0 ? 1 : -1);

      nodes.push({
        id: planetId,
        source_id: s % 2 === 0 ? 'antigravity' : 'hermes',
        kind: 'conversation',
        title: `Conv-${planetCount}`,
        body_preview: `Synthetic conversation item #${planetCount}`,
        access_count: 1 + (p % 10),
        pinned: false,
        degree: 2,
        importance: 0.6,
        freshness: 0.8,
        is_ambient: false,
        is_generic_root: false,
        tags: ['conversation'],
        created_at: '2026-09-15T00:00:00Z',
        last_active_at: '2026-10-25T00:00:00Z',
        modified_at: '2026-10-25T00:00:00Z',
        timestamp_source: 'transcript',
        hidden_by_default: false,
        metadata: {},
      });

      edges.push({
        from: planetId,
        to: starId,
        kind: 'project_session',
        weight: 1.0,
      });

      hybridLayout[planetId] = {
        role: 'planet',
        base_position: [0, 0, 0],
        orbit: {
          parent_id: starId,
          radius,
          angular_speed: speed,
          phase: (p * 0.7) % (Math.PI * 2),
          inclination: (((p % 7) - 3) * 0.04),
          ascending_node: (p * 0.5) % Math.PI,
        },
      };
    }
  }

  // 3. Fill remaining with skills, tools, and topics (Nebulae)
  const remaining = numNodes - nodes.length;
  for (let i = 0; i < remaining; i++) {
    const id = `synth:ambient:${i}`;
    const kind = i % 5 === 0 ? 'tool' : i % 3 === 0 ? 'skill' : 'topic';
    const subkind = kind === 'topic' ? (i % 20 === 0 ? 'category' : 'tag') : undefined;
    const isAmbient = true;

    const angle = (i * 0.1) % (Math.PI * 2);
    const r = 1100.0 + (i % 50) * 8.0;
    const pos: [number, number, number] = [
      r * Math.cos(angle),
      ((i % 21) - 10) * 15.0,
      r * Math.sin(angle),
    ];

    nodes.push({
      id,
      source_id: 'shared',
      kind,
      subkind,
      title: `${kind}-${i}`,
      body_preview: `Synthetic ambient ${kind} #${i}`,
      access_count: 1,
      pinned: false,
      degree: 1,
      importance: 0.4,
      freshness: 0.5,
      is_ambient: isAmbient,
      is_generic_root: false,
      tags: [kind],
      hidden_by_default: kind === 'topic' && subkind === 'tag',
      metadata: {},
    });

    hybridLayout[id] = {
      role: kind === 'tool' ? 'tool_hub' : subkind === 'category' ? 'nebula_anchor' : 'nebula_item',
      base_position: pos,
      orbit: undefined,
    };
  }

  const positions: Record<string, [number, number, number]> = {};
  for (const [id, layout] of Object.entries(hybridLayout)) {
    positions[id] = layout.base_position;
  }

  const neighbors: Record<string, string[]> = {};
  for (const node of nodes) {
    neighbors[node.id] = [];
  }
  for (const edge of edges) {
    neighbors[edge.from]?.push(edge.to);
    neighbors[edge.to]?.push(edge.from);
  }

  return {
    snapshot: {
      nodes,
      edges,
      events: [],
      sources: [
        {
          source_id: 'synthetic',
          name: 'Synthetic Generator',
          status: 'ok',
          version: '10k',
          base_path: 'memory://synthetic',
          warnings: [],
          items_scanned: nodes.length,
          scan_duration_ms: 10,
        },
      ],
      timestamp_stats: {
        real_timestamp_count: 3100,
        fallback_timestamp_count: 0,
        earliest_date: '2026-09-01T00:00:00Z',
        latest_date: '2026-11-01T00:00:00Z',
      },
      shared_projects: ['System-0', 'System-10', 'System-20'],
    },
    hybrid_layout: hybridLayout,
    positions,
    neighbors,
  };
}
