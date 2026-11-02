import React from 'react';
import type { NodeKind } from '../types';
import { Layers, X } from 'lucide-react';

interface FilterBarProps {
  isAmbientEnabled: boolean;
  onToggleAmbient: () => void;
  enabledKinds: Record<NodeKind, boolean>;
  onToggleKind: (kind: NodeKind) => void;
  showTags: boolean;
  onToggleTags: () => void;
  kindCounts: Record<string, number>;
  isolatedState: { centerNodeId: string; hops: number } | null;
  isolatedCenterNodeTitle?: string;
  onClearIsolation: () => void;
}

const KIND_COLORS: Record<string, string> = {
  project: '#a855f7',
  conversation: '#0284c7',
  session: '#ea580c',
  artifact: '#ec4899',
  task: '#10b981',
  memory: '#f59e0b',
  skill: '#6366f1',
  topic: '#06b6d4',
  tag: '#64748b',
  tool: '#38bdf8',
};

const KINDS_ORDER: { kind: NodeKind; label: string }[] = [
  { kind: 'project', label: 'Project' },
  { kind: 'conversation', label: 'Conversation' },
  { kind: 'session', label: 'Session' },
  { kind: 'artifact', label: 'Artifact' },
  { kind: 'task', label: 'Task' },
  { kind: 'memory', label: 'Memory' },
  { kind: 'skill', label: 'Skill' },
  { kind: 'topic', label: 'Category' },
  { kind: 'tool', label: 'Tool' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  isAmbientEnabled,
  onToggleAmbient,
  enabledKinds,
  onToggleKind,
  showTags,
  onToggleTags,
  kindCounts,
  isolatedState,
  isolatedCenterNodeTitle,
  onClearIsolation,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 56,
        left: 0,
        right: 0,
        height: 38,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 35,
        color: '#f8fafc',
        fontSize: '11px',
      }}
    >
      {/* Left: Master Ambient Layer Toggle + Kind Filter Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
        {/* Master Ambient Layer Toggle */}
        <button
          onClick={onToggleAmbient}
          title="Toggle ambient layer (Skills, Categories, Tags, Tools)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            backgroundColor: isAmbientEnabled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(51, 65, 85, 0.4)',
            border: `1px solid ${isAmbientEnabled ? '#38bdf8' : 'rgba(148, 163, 184, 0.2)'}`,
            borderRadius: '6px',
            color: isAmbientEnabled ? '#38bdf8' : '#64748b',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Layers size={13} />
          <span>Ambient Layer</span>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: isAmbientEnabled ? '#38bdf8' : '#64748b',
            }}
          />
        </button>

        <div
          style={{
            width: 1,
            height: 16,
            backgroundColor: 'rgba(148, 163, 184, 0.2)',
            margin: '0 2px',
          }}
        />

        {/* Kind Chips */}
        {KINDS_ORDER.map(({ kind, label }) => {
          const isEnabled = enabledKinds[kind];
          const count = kindCounts[kind] || 0;
          const color = KIND_COLORS[kind] || '#94a3b8';

          return (
            <button
              key={kind}
              onClick={() => onToggleKind(kind)}
              title={`Toggle ${label} nodes`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 7px',
                backgroundColor: isEnabled ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.5)',
                border: `1px solid ${isEnabled ? color : 'rgba(148, 163, 184, 0.15)'}`,
                borderRadius: '5px',
                color: isEnabled ? '#f8fafc' : '#64748b',
                fontSize: '11px',
                fontWeight: isEnabled ? 600 : 400,
                cursor: 'pointer',
                opacity: isEnabled ? 1 : 0.55,
                transition: 'all 0.15s',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: color,
                }}
              />
              <span>{label}</span>
              <span style={{ fontSize: '10px', color: isEnabled ? color : '#64748b', opacity: 0.85 }}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Tags chip (hidden by default) */}
        <button
          onClick={onToggleTags}
          title="Toggle taxonomy tags (hidden by default)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 7px',
            backgroundColor: showTags ? 'rgba(71, 85, 105, 0.6)' : 'rgba(15, 23, 42, 0.5)',
            border: `1px solid ${showTags ? '#94a3b8' : 'rgba(148, 163, 184, 0.15)'}`,
            borderRadius: '5px',
            color: showTags ? '#f8fafc' : '#64748b',
            fontSize: '11px',
            fontWeight: showTags ? 600 : 400,
            cursor: 'pointer',
            opacity: showTags ? 1 : 0.55,
            transition: 'all 0.15s',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#64748b',
            }}
          />
          <span>Tags</span>
          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
            {kindCounts['tag'] || 0}
          </span>
        </button>
      </div>

      {/* Right: Active Isolation Alert Banner if neighborhood is isolated */}
      {isolatedState && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(234, 179, 8, 0.15)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: '6px',
            padding: '2px 8px',
            color: '#facc15',
            fontWeight: 500,
          }}
        >
          <span>
            Isolated {isolatedState.hops}-hop neighborhood of{' '}
            <strong>{isolatedCenterNodeTitle || 'Node'}</strong>
          </span>
          <button
            onClick={onClearIsolation}
            title="Restore full view (Esc)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              backgroundColor: 'rgba(234, 179, 8, 0.25)',
              border: 'none',
              borderRadius: '4px',
              color: '#fef08a',
              cursor: 'pointer',
              padding: '1px 5px',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            <span>Restore (Esc)</span>
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
};
