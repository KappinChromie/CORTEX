import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  EnrichedGraphSnapshot,
  Node,
  ViewMode,
} from './types';
import { WebLayoutEngine } from './layouts/webLayout';
import { GraphCanvas3D } from './components/GraphCanvas3D';
import { HeaderBar } from './components/HeaderBar';
import { SidePanel } from './components/SidePanel';
import { SourceHealthPanel } from './components/SourceHealthPanel';
import { Loader2, AlertCircle } from 'lucide-react';

const webLayout = new WebLayoutEngine();

export const App: React.FC = () => {
  const [data, setData] = useState<EnrichedGraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [currentMode, setCurrentMode] = useState<ViewMode>('web');
  const [isHealthOpen, setIsHealthOpen] = useState(false);

  // Load snapshot from Tauri backend or fallback
  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Attempt Tauri IPC call
      const res = await invoke<EnrichedGraphSnapshot>('get_graph_snapshot');
      setData(res);
    } catch (err) {
      console.warn('Tauri invoke failed or running outside Tauri desktop container:', err);
      // Provide fallback mock dataset for standalone browser development
      setData(createFallbackMock());
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRescan = async () => {
    try {
      setIsScanning(true);
      const res = await invoke<EnrichedGraphSnapshot>('rescan');
      setData(res);
    } catch (err) {
      console.error('Rescan failed:', err);
      // In mock mode, simply simulate a refresh
      setTimeout(() => {
        setIsScanning(false);
      }, 500);
      return;
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  // Lookup map of nodes by ID for fast neighbor resolution
  const nodesById = useMemo(() => {
    const map = new Map<string, Node>();
    if (data?.snapshot.nodes) {
      for (const node of data.snapshot.nodes) {
        map.set(node.id, node);
      }
    }
    return map;
  }, [data]);

  // Compute 3D positions using active layout engine (pluggable)
  const positions = useMemo(() => {
    if (!data?.snapshot) return new Map<string, [number, number, number]>();
    return webLayout.compute(
      data.snapshot.nodes,
      data.snapshot.edges,
      data.snapshot.timestamp_stats,
      data.positions
    );
  }, [data]);

  // Neighbors of currently selected node
  const selectedNeighbors = useMemo(() => {
    if (!selectedNode || !data) return [];
    if (data.neighbors && data.neighbors[selectedNode.id]) {
      return data.neighbors[selectedNode.id];
    }
    // Fallback: derive from edges
    const set = new Set<string>();
    for (const edge of data.snapshot.edges) {
      if (edge.from === selectedNode.id) set.add(edge.to);
      if (edge.to === selectedNode.id) set.add(edge.from);
    }
    return Array.from(set);
  }, [selectedNode, data]);

  // Calculate total scan time from sources
  const scanTimeMs = useMemo(() => {
    if (!data?.snapshot.sources) return 0;
    return data.snapshot.sources.reduce((acc, s) => acc + (s.scan_duration_ms || 0), 0);
  }, [data]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        backgroundColor: '#030712',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <HeaderBar
        currentMode={currentMode}
        onChangeMode={setCurrentMode}
        nodes={data?.snapshot.nodes || []}
        edgesCount={data?.snapshot.edges.length || 0}
        sharedProjectsCount={data?.snapshot.shared_projects.length || 0}
        scanTimeMs={scanTimeMs}
        onSelectNode={setSelectedNode}
        onToggleHealth={() => setIsHealthOpen((prev) => !prev)}
        isHealthOpen={isHealthOpen}
      />

      {/* Main 3D Canvas */}
      {data && (
        <GraphCanvas3D
          nodes={data.snapshot.nodes}
          edges={data.snapshot.edges}
          positions={positions}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          hoveredNode={hoveredNode}
          onHoverNode={setHoveredNode}
        />
      )}

      {/* Side Inspector Panel */}
      <SidePanel
        node={selectedNode}
        nodesById={nodesById}
        neighbors={selectedNeighbors}
        edges={data?.snapshot.edges || []}
        onClose={() => setSelectedNode(null)}
        onSelectNode={setSelectedNode}
      />

      {/* Adapter Source Health Panel */}
      <SourceHealthPanel
        sources={data?.snapshot.sources || []}
        onRescan={handleRescan}
        isScanning={isScanning}
        isOpen={isHealthOpen}
        onClose={() => setIsHealthOpen(false)}
      />

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#030712',
            zIndex: 100,
            gap: 16,
          }}
        >
          <Loader2 size={36} color="#38bdf8" className="animate-spin" />
          <div style={{ fontSize: 16, fontWeight: 500, color: '#94a3b8' }}>
            Observing agent memory neural web...
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(239, 68, 68, 0.9)',
            padding: '12px 20px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 100,
            color: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            onClick={loadSnapshot}
            style={{
              marginLeft: 12,
              padding: '4px 10px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default App;

// Helper to create fallback mock data for browser dev testing outside Tauri
function createFallbackMock(): EnrichedGraphSnapshot {
  const nodes: Node[] = [
    {
      id: 'project:cortex',
      source_id: 'shared',
      kind: 'project',
      title: 'Cortex',
      body_preview: 'Cortex Agent Brain Observatory repository and workspace',
      path: 'c:\\users\\luche\\documents\\projects\\00000000\\cortex',
      tags: ['workspace', 'shared', 'rust', 'react'],
      degree: 12,
      access_count: 5,
      pinned: true,
      importance: 0.9,
      freshness: 0.95,
      metadata: {},
      created_at: '2026-11-01T17:00:00Z',
    },
    {
      id: 'conversation:antigravity-1',
      source_id: 'antigravity',
      kind: 'conversation',
      title: 'Cortex Discovery & Implementation',
      body_preview: 'Autonomous session building Cortex agent brain observatory graph and UI.',
      tags: ['conversation', 'antigravity'],
      degree: 4,
      access_count: 1,
      pinned: false,
      importance: 0.8,
      freshness: 0.9,
      metadata: {},
      created_at: '2026-11-01T17:30:00Z',
    },
    {
      id: 'session:hermes-main',
      source_id: 'hermes',
      kind: 'session',
      title: 'Hermes User Assistant Session',
      body_preview: 'Interactive Hermes session running in root directory.',
      tags: ['session', 'hermes'],
      degree: 5,
      access_count: 1,
      pinned: false,
      importance: 0.7,
      freshness: 0.85,
      metadata: {},
      created_at: '2026-11-01T15:00:00Z',
    },
    {
      id: 'skill:hermes-skills',
      source_id: 'hermes',
      kind: 'skill',
      title: 'hermes-skills',
      body_preview: 'Skill for creating and executing agent abilities.',
      tags: ['agent-customization', 'skills'],
      degree: 6,
      access_count: 1,
      pinned: false,
      importance: 0.6,
      freshness: 0.7,
      metadata: {},
    },
    {
      id: 'skill:antigravity-guide',
      source_id: 'antigravity',
      kind: 'skill',
      title: 'antigravity-guide',
      body_preview: 'Comprehensive guide and reference for Google Antigravity IDE and CLI.',
      tags: ['guide', 'customization'],
      degree: 4,
      access_count: 1,
      pinned: false,
      importance: 0.6,
      freshness: 0.7,
      metadata: {},
    },
    {
      id: 'tool:read_file',
      source_id: 'antigravity',
      kind: 'tool',
      title: 'read_file',
      body_preview: 'Core filesystem inspection tool.',
      tags: ['tool', 'io'],
      degree: 8,
      access_count: 12,
      pinned: false,
      importance: 0.5,
      freshness: 0.6,
      metadata: {},
    },
  ];

  return {
    snapshot: {
      nodes,
      edges: [
        {
          from: 'conversation:antigravity-1',
          to: 'project:cortex',
          kind: 'project_session',
          weight: 1.0,
        },
        {
          from: 'session:hermes-main',
          to: 'project:cortex',
          kind: 'project_session',
          weight: 1.0,
        },
        {
          from: 'conversation:antigravity-1',
          to: 'tool:read_file',
          kind: 'uses_tool',
          weight: 1.0,
        },
        {
          from: 'conversation:antigravity-1',
          to: 'skill:antigravity-guide',
          kind: 'related_skill',
          weight: 1.0,
        },
        {
          from: 'session:hermes-main',
          to: 'skill:hermes-skills',
          kind: 'related_skill',
          weight: 1.0,
        },
      ],
      events: [],
      sources: [
        {
          source_id: 'antigravity',
          name: 'Antigravity',
          status: 'ok',
          version: '2.28.2',
          base_path: 'C:\\Users\\luche\\.gemini\\antigravity',
          warnings: [],
          items_scanned: 80,
          scan_duration_ms: 120,
        },
        {
          source_id: 'hermes',
          name: 'Hermes Agent',
          status: 'ok',
          version: '0.9.0',
          base_path: 'C:\\Users\\luche\\.hermes',
          warnings: [],
          items_scanned: 65,
          scan_duration_ms: 85,
        },
      ],
      timestamp_stats: {
        real_timestamp_count: 24,
        fallback_timestamp_count: 371,
        earliest_date: '2026-08-19',
        latest_date: '2026-11-02',
      },
      shared_projects: ['c:\\users\\luche\\documents\\projects\\00000000\\cortex'],
    },
    neighbors: {
      'project:cortex': ['conversation:antigravity-1', 'session:hermes-main'],
      'conversation:antigravity-1': ['project:cortex', 'tool:read_file', 'skill:antigravity-guide'],
      'session:hermes-main': ['project:cortex', 'skill:hermes-skills'],
      'tool:read_file': ['conversation:antigravity-1'],
      'skill:antigravity-guide': ['conversation:antigravity-1'],
      'skill:hermes-skills': ['session:hermes-main'],
    },
    positions: {},
  };
}
