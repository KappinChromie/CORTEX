import React from 'react';
import type { ViewMode } from '../types';
import { Orbit, Share2, Clock } from 'lucide-react';

interface ViewModeSwitchProps {
  currentMode: ViewMode;
  onChangeMode: (mode: ViewMode) => void;
}

export const ViewModeSwitch: React.FC<ViewModeSwitchProps> = ({
  currentMode,
  onChangeMode,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: '8px',
        padding: '3px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        gap: '4px',
      }}
    >
      {/* Web Mode (Active) */}
      <button
        onClick={() => onChangeMode('web')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: currentMode === 'web' ? '#2563eb' : 'transparent',
          color: currentMode === 'web' ? '#ffffff' : '#94a3b8',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <Share2 size={14} />
        <span>Web (3D Force)</span>
      </button>

      {/* Hybrid Mode (Disabled Stub) */}
      <button
        disabled
        title="Solar-system orbit hybrid layout (Next Milestone)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'transparent',
          color: '#64748b',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'not-allowed',
          opacity: 0.6,
        }}
      >
        <Orbit size={14} />
        <span>Hybrid (Solar System)</span>
        <span
          style={{
            fontSize: '9px',
            backgroundColor: '#475569',
            color: '#cbd5e1',
            padding: '1px 4px',
            borderRadius: '4px',
          }}
        >
          M2
        </span>
      </button>

      {/* Timeline Mode (Disabled Stub) */}
      <button
        disabled
        title="Chronological timeline layout (Next Milestone)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'transparent',
          color: '#64748b',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'not-allowed',
          opacity: 0.6,
        }}
      >
        <Clock size={14} />
        <span>Timeline</span>
        <span
          style={{
            fontSize: '9px',
            backgroundColor: '#475569',
            color: '#cbd5e1',
            padding: '1px 4px',
            borderRadius: '4px',
          }}
        >
          M2
        </span>
      </button>
    </div>
  );
};
