import React, { useState } from 'react';
import type { ViewMode, Node } from '../types';
import { ViewModeSwitch } from './ViewModeSwitch';
import { Search, Activity, Sparkles } from 'lucide-react';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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

        {/* Live stats pills */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              backgroundColor: 'rgba(51, 65, 85, 0.6)',
              color: '#38bdf8',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.2)',
            }}
          >
            {nodes.length} nodes
          </span>
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
              {sharedProjectsCount} shared projects
            </span>
          )}
          <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 4 }}>
            {scanTimeMs}ms
          </span>
        </div>
      </div>

      {/* Center Layout Mode Switch */}
      <ViewModeSwitch currentMode={currentMode} onChangeMode={onChangeMode} />

      {/* Right Tools (Search + Sources) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              borderRadius: '6px',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              padding: '4px 8px',
              gap: 6,
              width: 220,
            }}
          >
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#f8fafc',
                fontSize: '12px',
                width: '100%',
              }}
            />
          </div>

          {/* Search Dropdown */}
          {isSearchFocused && searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 36,
                right: 0,
                width: 280,
                backgroundColor: 'rgba(15, 23, 42, 0.96)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '8px',
                padding: '4px',
                zIndex: 60,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}
            >
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  onMouseDown={() => {
                    onSelectNode(result);
                    setSearchQuery('');
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.8)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.title}
                  </div>
                  <span
                    style={{
                      fontSize: '9px',
                      backgroundColor: 'rgba(100, 116, 139, 0.3)',
                      color: '#94a3b8',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {result.kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source Health Button */}
        <button
          onClick={onToggleHealth}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: isHealthOpen ? '#1e293b' : 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '6px',
            color: '#f8fafc',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Activity size={14} color="#38bdf8" />
          <span>Sources</span>
        </button>
      </div>
    </div>
  );
};
