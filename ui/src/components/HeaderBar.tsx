import React, { useState } from 'react';
import type { ViewMode, Node, DataSource, LinksMode } from '../types';
import { ViewModeSwitch } from './ViewModeSwitch';
import { Search, Activity, Sparkles, Focus, RotateCcw, Share2 } from 'lucide-react';

interface HeaderBarProps {
  currentMode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
  nodes: Node[];
  edgesCount: number;
  sharedProjectsCount: number;
  scanTimeMs: number;
  onSelectNode: (node: Node) => void;
  onToggleHealth: () => void;
  isHealthOpen: boolean;
  dataSource: DataSource;
  totalNodesCount: number;
  visibleNodesCount: number;
  hiddenBreakdown?: string[];
  quality?: 'low' | 'medium' | 'high';
  onToggleQuality?: () => void;
  fpsStats?: { fps: number; frameTimeMs: number };
  onFrameAll: () => void;
  onResetView: () => void;
  linksMode?: LinksMode;
  onChangeLinksMode?: (mode: LinksMode) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentMode,
  onChangeMode,
  nodes,
  edgesCount,
  sharedProjectsCount,
  scanTimeMs,
  onSelectNode,
  onToggleHealth,
  isHealthOpen,
  dataSource,
  totalNodesCount,
  visibleNodesCount,
  hiddenBreakdown,
  quality,
  onToggleQuality,
  fpsStats,
  onFrameAll,
  onResetView,
  linksMode,
  onChangeLinksMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const searchResults = searchQuery.trim()
    ? nodes
        .filter(
          (n) =>
            n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.kind.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        .slice(0, 8)
    : [];

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 40,
        color: '#f8fafc',
      }}
    >
      {/* Brand & Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 12px rgba(139, 92, 246, 0.5)',
            }}
          >
            <Sparkles size={16} color="#ffffff" />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '0.05em' }}>
              CORTEX
            </span>
            <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 6 }}>
              Agent Brain Observatory
            </span>
          </div>
        </div>

        {/* Three-State Data Source Badge */}
        {(() => {
          const cfg = {
            LIVE: {
              label: 'LIVE',
              color: '#34d399',
              bg: 'rgba(16, 185, 129, 0.18)',
              border: 'rgba(16, 185, 129, 0.4)',
              tooltip: 'LIVE: Connected via native Tauri IPC to local agent databases (state.db, kanban.db, etc.)',
            },
            SNAPSHOT: {
              label: 'SNAPSHOT',
              color: '#38bdf8',
              bg: 'rgba(14, 165, 233, 0.18)',
              border: 'rgba(14, 165, 233, 0.4)',
              tooltip: 'SNAPSHOT: Static JSON export of real machine scan, used in browser dev mode outside Tauri',
            },
            DEMO: {
              label: 'DEMO',
              color: '#fbbf24',
              bg: 'rgba(245, 158, 11, 0.18)',
              border: 'rgba(245, 158, 11, 0.4)',
              tooltip: 'DEMO: Synthetic fallback mock data when neither Tauri IPC nor snapshot.json is available',
            },
          }[dataSource] || {
            label: dataSource,
            color: '#94a3b8',
            bg: 'rgba(100, 116, 139, 0.18)',
            border: 'rgba(100, 116, 139, 0.4)',
            tooltip: 'Unknown data source',
          };

          return (
            <div
              title={cfg.tooltip}
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                padding: '3px 8px',
                borderRadius: '12px',
                backgroundColor: cfg.bg,
                color: cfg.color,
                border: `1px solid ${cfg.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'help',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: cfg.color,
                  boxShadow: `0 0 6px ${cfg.color}`,
                }}
              />
              {cfg.label}
            </div>
          );
        })()}

        {/* Showing X of Y nodes counter with breakdown tooltip */}
        <span
          title={
            hiddenBreakdown && hiddenBreakdown.length > 0
              ? `${totalNodesCount - visibleNodesCount} nodes hidden:\n` +
                hiddenBreakdown.map((b) => `• ${b}`).join('\n')
              : 'All nodes currently visible'
          }
          style={{
            fontSize: '11px',
            backgroundColor: 'rgba(51, 65, 85, 0.6)',
            color: '#38bdf8',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            fontWeight: 500,
            cursor: 'help',
          }}
        >
          Showing {visibleNodesCount} of {totalNodesCount} nodes
        </span>

        {/* Edges stats */}
        <span
          style={{
            fontSize: '11px',
            backgroundColor: 'rgba(51, 65, 85, 0.6)',
            color: '#a855f7',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid rgba(168, 85, 247, 0.2)',
          }}
        >
          {edgesCount} edges
        </span>

        {sharedProjectsCount > 0 && (
          <span
            style={{
              fontSize: '11px',
              backgroundColor: 'rgba(234, 179, 8, 0.15)',
              color: '#eab308',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}
          >
            ★ {sharedProjectsCount} shared projects
          </span>
        )}

        {/* Frame All Button */}
        <button
          onClick={onFrameAll}
          title="Fit camera to all nodes (Hotkey: F)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            backgroundColor: 'rgba(51, 65, 85, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(71, 85, 105, 0.8)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.6)')}
        >
          <Focus size={12} color="#38bdf8" />
          <span>Frame all (F)</span>
        </button>

        {/* Reset View Button */}
        <button
          onClick={onResetView}
          title="Reset camera to default view"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            backgroundColor: 'rgba(51, 65, 85, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: '6px',
            color: '#e2e8f0',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(71, 85, 105, 0.8)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.6)')}
        >
          <RotateCcw size={12} color="#94a3b8" />
          <span>Reset view</span>
        </button>

        {/* Quality Level Selector & Performance HUD */}
        {quality && (
          <button
            onClick={onToggleQuality}
            title={`Quality: ${quality.toUpperCase()} (${
              fpsStats ? `${fpsStats.frameTimeMs.toFixed(1)}ms / ${fpsStats.fps}fps` : ''
            })\nClick to cycle: LOW (no post-processing) -> MEDIUM (crisp bloom) -> HIGH (bloom + vignette)`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px',
              backgroundColor:
                quality === 'high'
                  ? 'rgba(168, 85, 247, 0.2)'
                  : quality === 'medium'
                  ? 'rgba(56, 189, 248, 0.2)'
                  : 'rgba(100, 116, 139, 0.2)',
              border: `1px solid ${
                quality === 'high'
                  ? 'rgba(168, 85, 247, 0.4)'
                  : quality === 'medium'
                  ? 'rgba(56, 189, 248, 0.4)'
                  : 'rgba(100, 116, 139, 0.4)'
              }`,
              borderRadius: '6px',
              color:
                quality === 'high'
                  ? '#c084fc'
                  : quality === 'medium'
                  ? '#38bdf8'
                  : '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Activity size={12} />
            <span>
              {quality.toUpperCase()}
              {fpsStats ? ` · ${fpsStats.frameTimeMs.toFixed(0)}ms` : ''}
            </span>
          </button>
        )}

        {/* Links Control: Off / Strong (default) / All */}
        {linksMode && onChangeLinksMode && (
          <button
            onClick={() => {
              const next: LinksMode =
                linksMode === 'strong' ? 'all' : linksMode === 'all' ? 'off' : 'strong';
              onChangeLinksMode(next);
            }}
            title={`Links: ${linksMode.toUpperCase()}\nClick to cycle:\n• STRONG (default): Top 30 cross-system links (tool hubs hidden)\n• ALL: Up to 400 visible links\n• OFF: Faint orbit rings only`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px',
              backgroundColor:
                linksMode === 'strong'
                  ? 'rgba(56, 189, 248, 0.2)'
                  : linksMode === 'all'
                  ? 'rgba(168, 85, 247, 0.2)'
                  : 'rgba(100, 116, 139, 0.2)',
              border: `1px solid ${
                linksMode === 'strong'
                  ? 'rgba(56, 189, 248, 0.4)'
                  : linksMode === 'all'
                  ? 'rgba(168, 85, 247, 0.4)'
                  : 'rgba(100, 116, 139, 0.4)'
              }`,
              borderRadius: '6px',
              color:
                linksMode === 'strong'
                  ? '#38bdf8'
                  : linksMode === 'all'
                  ? '#c084fc'
                  : '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Share2 size={12} />
            <span>Links: {linksMode.toUpperCase()}</span>
          </button>
        )}
      </div>

      {/* Center: Search with instant dropdown */}
      <div style={{ position: 'relative', width: 280 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            border: `1px solid ${isSearchFocused ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
            borderRadius: '8px',
            padding: '4px 10px',
            gap: 8,
            transition: 'border-color 0.2s',
          }}
        >
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search nodes, skills, tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: '12px',
              width: '100%',
            }}
          />
        </div>

        {/* Dropdown results */}
        {isSearchFocused && searchResults.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 40,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.96)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 100,
            }}
          >
            {searchResults.map((n) => (
              <div
                key={n.id}
                onMouseDown={() => {
                  onSelectNode(n);
                  setSearchQuery('');
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.5)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{n.title}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{n.kind}</div>
                </div>
                <div
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: '#94a3b8',
                  }}
                >
                  deg {n.degree}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Pluggable View Mode Switch + Health Panel Trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ViewModeSwitch currentMode={currentMode} onChangeMode={onChangeMode} />

        <button
          onClick={onToggleHealth}
          title="Source Health & Re-scan"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            backgroundColor: isHealthOpen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(51, 65, 85, 0.5)',
            border: `1px solid ${isHealthOpen ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
            borderRadius: '8px',
            color: isHealthOpen ? '#38bdf8' : '#f8fafc',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Activity size={14} color={isHealthOpen ? '#38bdf8' : '#94a3b8'} />
          <span>Health ({scanTimeMs}ms)</span>
        </button>
      </div>
    </div>
  );
};
