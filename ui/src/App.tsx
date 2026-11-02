import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  EnrichedGraphSnapshot,
  Node,
  NodeKind,
  ViewMode,
  DataSource,
} from './types';
import { WebLayoutEngine } from './layouts/webLayout';
import { GraphCanvas3D } from './components/GraphCanvas3D';
import { HeaderBar } from './components/HeaderBar';
import { FilterBar } from './components/FilterBar';
import { SidePanel } from './components/SidePanel';
import { SourceHealthPanel } from './components/SourceHealthPanel';
import type { QualityLevel } from './components/PostProcessingManager';
import { Loader2, AlertCircle } from 'lucide-react';

const webLayout = new WebLayoutEngine();

export const App: React.FC = () => {
  const [data, setData] = useState<EnrichedGraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>('LIVE');
  const [frameAllTrigger, setFrameAllTrigger] = useState(0);
  const [resetViewTrigger, setResetViewTrigger] = useState(0);

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [currentMode, setCurrentMode] = useState<ViewMode>('hybrid');
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [quality, setQuality] = useState<QualityLevel>('medium');
  const [fpsStats, setFpsStats] = useState<{ fps: number; frameTimeMs: number }>({
    fps: 60,
    frameTimeMs: 16.6,
  });

  // Section B rendering controls
  const [isOrbitAnimating, setIsOrbitAnimating] = useState<boolean>(true);
  const [isOrbitRingsVisible, setIsOrbitRingsVisible] = useState<boolean>(true);
  const [isStarGlowVisible, setIsStarGlowVisible] = useState<boolean>(true);

  // Section C declutter & filter state
  const [isAmbientEnabled, setIsAmbientEnabled] = useState<boolean>(true);
  const [enabledKinds, setEnabledKinds] = useState<Record<NodeKind, boolean>>({
    project: true,
    conversation: true,
    session: true,
    artifact: true,
    task: true,
    memory: true,
    persona: true,
    skill: true,
    topic: true,
    tool: true,
  });
  const [showTags, setShowTags] = useState<boolean>(false); // Tags hidden by default

  // Section C neighborhood isolation state
  const [isolatedState, setIsolatedState] = useState<{
    centerNodeId: string;
    hops: 1 | 2;
  } | null>(null);

  // Section C camera control mode
  const [cameraControlMode, setCameraControlMode] = useState<'orbit' | 'fly'>('orbit');

  // Load snapshot from Tauri backend, static public json, or fallback
  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // 1. Attempt native Tauri IPC call
      const res = await invoke<EnrichedGraphSnapshot>('get_graph_snapshot');
      setData(res);
      setDataSource('LIVE');
    } catch (ipcErr) {
      console.warn('Tauri IPC unavailable (running in web browser or mock mode):', ipcErr);
      // 2. Fall back to static snapshot.json if available
      try {
        const resp = await fetch('/snapshot.json');
        if (resp.ok) {
          const json = await resp.json();
          setData(json);
          setDataSource('SNAPSHOT');
          return;
        }
      } catch (fetchErr) {
        console.warn('Fetch /snapshot.json failed:', fetchErr);
      }
      // 3. Fall back to synthetic mock data
      setData(createFallbackMock());
      setDataSource('DEMO');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFrameAll = useCallback(() => {
    setFrameAllTrigger((prev) => prev + 1);
  }, []);

  const handleResetView = useCallback(() => {
    setResetViewTrigger((prev) => prev + 1);
  }, []);

  // Listen for keyboard hotkeys (F for Frame All, Esc for clearing isolation/selection, C for camera mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'f' || e.key === 'F') {
        handleFrameAll();
      } else if (e.key === 'Escape') {
        setIsolatedState(null);
        setSelectedNode(null);
      } else if (e.key === 'c' || e.key === 'C') {
        setCameraControlMode((prev) => (prev === 'orbit' ? 'fly' : 'orbit'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFrameAll]);

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

  // Count items per kind across all snapshot nodes
  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!data?.snapshot.nodes) return counts;
    for (const node of data.snapshot.nodes) {
      if (node.kind === 'topic' && node.subkind === 'tag') {
        counts['tag'] = (counts['tag'] || 0) + 1;
      } else {
        counts[node.kind] = (counts[node.kind] || 0) + 1;
      }
    }
    return counts;
  }, [data]);

  // Filter visible nodes based on active Kind chips, Ambient toggle, and Tag visibility
  const visibleNodes = useMemo(() => {
    if (!data?.snapshot.nodes) return [];
    return data.snapshot.nodes.filter((node) => {
      // Master Ambient layer check
      if (node.is_ambient && !isAmbientEnabled) return false;
      // Kind chips filter
      if (!enabledKinds[node.kind]) return false;
      // Tags hidden by default
      if (node.kind === 'topic' && node.subkind === 'tag') {
        return showTags;
      }
      if (node.hidden_by_default && !showTags) {
        return false;
      }
      return true;
    });
  }, [data, isAmbientEnabled, enabledKinds, showTags]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  // Edges connecting visible nodes
  const visibleEdges = useMemo(() => {
    if (!data?.snapshot.edges) return [];
    return data.snapshot.edges.filter(
      (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)
    );
  }, [data, visibleNodeIds]);

  // Set of node IDs in active neighborhood isolation
  const isolatedNodeIds = useMemo(() => {
    if (!isolatedState || !data) return undefined;
    const set = new Set<string>();
    set.add(isolatedState.centerNodeId);

    const hop1 = data.neighbors[isolatedState.centerNodeId] || [];
    for (const id of hop1) set.add(id);

    if (isolatedState.hops === 2) {
      for (const id1 of hop1) {
        const hop2 = data.neighbors[id1] || [];
        for (const id2 of hop2) set.add(id2);
      }
    }
    return set;
  }, [isolatedState, data]);

  // Center node title for isolation banner
  const isolatedCenterNodeTitle = useMemo(() => {
    if (!isolatedState) return undefined;
    return nodesById.get(isolatedState.centerNodeId)?.title;
  }, [isolatedState, nodesById]);

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

  // Detailed breakdown of hidden nodes for the header tooltip
  const hiddenBreakdown = useMemo(() => {
    if (!data?.snapshot.nodes) return [];
    let tagsCount = 0;
    let ambientCount = 0;
    let defaultHiddenCount = 0;
    const kindCounts: Record<string, number> = {};

    for (const node of data.snapshot.nodes) {
      if (node.is_ambient && !isAmbientEnabled) {
        ambientCount++;
        continue;
      }
      if (!enabledKinds[node.kind]) {
        kindCounts[node.kind] = (kindCounts[node.kind] || 0) + 1;
        continue;
      }
      if (node.kind === 'topic' && node.subkind === 'tag') {
        if (!showTags) tagsCount++;
        continue;
      }
      if (node.hidden_by_default && !showTags) {
        defaultHiddenCount++;
        continue;
      }
    }

    const items: string[] = [];
    if (tagsCount > 0) items.push(`${tagsCount} tags hidden by filter`);
    if (ambientCount > 0) items.push(`${ambientCount} ambient nodes hidden by Ambient toggle`);
    if (defaultHiddenCount > 0) items.push(`${defaultHiddenCount} nodes hidden by default`);
    for (const [k, c] of Object.entries(kindCounts)) {
      items.push(`${c} ${k} nodes hidden by filter`);
    }
    return items;
  }, [data, isAmbientEnabled, enabledKinds, showTags]);

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
        nodes={visibleNodes}
        edgesCount={visibleEdges.length}
        sharedProjectsCount={data?.snapshot.shared_projects.length || 0}
        scanTimeMs={scanTimeMs}
        onSelectNode={setSelectedNode}
        onToggleHealth={() => setIsHealthOpen((prev) => !prev)}
        isHealthOpen={isHealthOpen}
        dataSource={dataSource}
        totalNodesCount={data?.snapshot.nodes.length || 0}
        visibleNodesCount={visibleNodes.length}
        hiddenBreakdown={hiddenBreakdown}
        quality={quality}
        onToggleQuality={() =>
          setQuality((prev) => (prev === 'low' ? 'medium' : prev === 'medium' ? 'high' : 'low'))
        }
        fpsStats={fpsStats}
        onFrameAll={handleFrameAll}
        onResetView={handleResetView}
      />

      {/* Top Sub-Bar: Kind Filter Chips & Isolation HUD */}
      <FilterBar
        isAmbientEnabled={isAmbientEnabled}
        onToggleAmbient={() => setIsAmbientEnabled((prev) => !prev)}
        enabledKinds={enabledKinds}
        onToggleKind={(kind) =>
          setEnabledKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))
        }
        showTags={showTags}
        onToggleTags={() => setShowTags((prev) => !prev)}
        kindCounts={kindCounts}
        isolatedState={isolatedState}
        isolatedCenterNodeTitle={isolatedCenterNodeTitle}
        onClearIsolation={() => setIsolatedState(null)}
      />

      {/* Main 3D Canvas */}
      {data && (
        <GraphCanvas3D
          nodes={visibleNodes}
          edges={visibleEdges}
          webPositions={positions}
          hybridLayout={data.hybrid_layout || {}}
          currentMode={currentMode}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          hoveredNode={hoveredNode}
          onHoverNode={setHoveredNode}
          frameAllTrigger={frameAllTrigger}
          resetViewTrigger={resetViewTrigger}
          cameraControlMode={cameraControlMode}
          isOrbitAnimating={isOrbitAnimating}
          isOrbitRingsVisible={isOrbitRingsVisible}
          isStarGlowVisible={isStarGlowVisible}
          quality={quality}
          onFrameStats={(fps, frameTimeMs) => setFpsStats({ fps, frameTimeMs })}
          onDoubleClickNode={(node, shiftKey) => {
            setIsolatedState({
              centerNodeId: node.id,
              hops: shiftKey ? 2 : 1,
            });
          }}
          dimmedNodeIds={isolatedNodeIds}
          onClearIsolation={() => setIsolatedState(null)}
        />
      )}

      {/* Floating HUD Controls (Bottom Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Controls row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '10px',
            padding: '6px 10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {/* Camera Mode Toggle */}
          <button
            onClick={() => setCameraControlMode((prev) => (prev === 'orbit' ? 'fly' : 'orbit'))}
            title="Toggle between Orbit Controls and Free-Fly WASD camera (Hotkey: C)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              backgroundColor:
                cameraControlMode === 'fly'
                  ? 'rgba(16, 185, 129, 0.25)'
                  : 'rgba(51, 65, 85, 0.5)',
              border: `1px solid ${
                cameraControlMode === 'fly' ? '#10b981' : 'rgba(148, 163, 184, 0.2)'
              }`,
              borderRadius: '6px',
              color: cameraControlMode === 'fly' ? '#34d399' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <span>{cameraControlMode === 'fly' ? '✈ Free-Fly (WASD)' : '👁 Orbit Camera'}</span>
          </button>

          {/* Solar system toggles (when in hybrid mode) */}
          {currentMode === 'hybrid' && (
            <>
              <div
                style={{
                  width: 1,
                  height: 16,
                  backgroundColor: 'rgba(148, 163, 184, 0.2)',
                }}
              />

              {/* Orbital Animation Play/Pause */}
              <button
                onClick={() => setIsOrbitAnimating((prev) => !prev)}
                title={isOrbitAnimating ? 'Pause planetary orbits' : 'Resume planetary orbits'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 8px',
                  backgroundColor: isOrbitAnimating
                    ? 'rgba(139, 92, 246, 0.25)'
                    : 'rgba(51, 65, 85, 0.5)',
                  border: `1px solid ${
                    isOrbitAnimating ? '#8b5cf6' : 'rgba(148, 163, 184, 0.2)'
                  }`,
                  borderRadius: '6px',
                  color: isOrbitAnimating ? '#c084fc' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span>{isOrbitAnimating ? '⏸ Orbits' : '▶ Paused'}</span>
              </button>

              {/* Orbit Rings Toggle */}
              <button
                onClick={() => setIsOrbitRingsVisible((prev) => !prev)}
                title="Toggle visible orbit rings"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 8px',
                  backgroundColor: isOrbitRingsVisible
                    ? 'rgba(99, 102, 241, 0.25)'
                    : 'rgba(51, 65, 85, 0.5)',
                  border: `1px solid ${
                    isOrbitRingsVisible ? '#6366f1' : 'rgba(148, 163, 184, 0.2)'
                  }`,
                  borderRadius: '6px',
                  color: isOrbitRingsVisible ? '#818cf8' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span>{isOrbitRingsVisible ? '◎ Rings' : '○ Rings Off'}</span>
              </button>

              {/* Star Glow Toggle */}
              <button
                onClick={() => setIsStarGlowVisible((prev) => !prev)}
                title="Toggle stellar glow aura"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 8px',
                  backgroundColor: isStarGlowVisible
                    ? 'rgba(234, 179, 8, 0.2)'
                    : 'rgba(51, 65, 85, 0.5)',
                  border: `1px solid ${
                    isStarGlowVisible ? '#eab308' : 'rgba(148, 163, 184, 0.2)'
                  }`,
                  borderRadius: '6px',
                  color: isStarGlowVisible ? '#facc15' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span>{isStarGlowVisible ? '✦ Glow' : '✧ Glow Off'}</span>
              </button>
            </>
          )}
        </div>

        {/* Free-Fly instructions badge */}
        {cameraControlMode === 'fly' && (
          <div
            style={{
              fontSize: '10px',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              padding: '4px 8px',
              color: '#6ee7b7',
              boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
            }}
          >
            Drag to look · WASD move · Q/E up/down · Shift boost · C orbit mode
          </div>
        )}
      </div>

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
      is_ambient: false,
      is_generic_root: false,
      timestamp_source: 'metadata',
      hidden_by_default: false,
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
      is_ambient: false,
      is_generic_root: false,
      timestamp_source: 'transcript',
      hidden_by_default: false,
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
      is_ambient: false,
      is_generic_root: true,
      timestamp_source: 'session_db',
      hidden_by_default: false,
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
      is_ambient: true,
      is_generic_root: false,
      hidden_by_default: false,
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
      is_ambient: true,
      is_generic_root: false,
      hidden_by_default: false,
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
      is_ambient: true,
      is_generic_root: false,
      hidden_by_default: false,
      metadata: {},
    },
    {
      id: 'hermes:soul',
      source_id: 'hermes',
      kind: 'persona',
      title: 'Hermes Agent SOUL',
      body_preview: 'Hermes identity and persona specification.',
      tags: ['soul', 'identity', 'hermes', 'persona'],
      degree: 1,
      access_count: 1,
      pinned: true,
      importance: 0.9,
      freshness: 1.0,
      is_ambient: true,
      is_generic_root: false,
      subkind: 'persona',
      hidden_by_default: false,
      metadata: { type: 'personality' },
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
    hybrid_layout: {
      'project:cortex': {
        role: 'star',
        base_position: [0, 0, 0],
      },
      'conversation:antigravity-1': {
        role: 'planet',
        base_position: [0, 0, 0],
        orbit: {
          parent_id: 'project:cortex',
          radius: 65,
          inclination: 0.1,
          ascending_node: 0.5,
          phase: 0.0,
          angular_speed: 0.22,
        },
      },
      'session:hermes-main': {
        role: 'planet',
        base_position: [0, 0, 0],
        orbit: {
          parent_id: 'project:cortex',
          radius: 110,
          inclination: -0.15,
          ascending_node: 1.2,
          phase: 2.1,
          angular_speed: -0.16,
        },
      },
      'tool:read_file': {
        role: 'tool_hub',
        base_position: [40, 15, -30],
      },
      'skill:antigravity-guide': {
        role: 'nebula_item',
        base_position: [500, 100, 200],
      },
      'skill:hermes-skills': {
        role: 'nebula_item',
        base_position: [520, 80, 240],
      },
    },
  };
}
