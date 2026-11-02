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
      {/* Hybrid Mode (Default Mode) */}
      <button
        onClick={() => onChangeMode('hybrid')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: currentMode === 'hybrid' ? '#8b5cf6' : 'transparent',
          color: currentMode === 'hybrid' ? '#ffffff' : '#94a3b8',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <Orbit size={14} />
        <span>Hybrid (Solar System)</span>
      </button>

      {/* Web Mode (Selectable) */}
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

      {/* Timeline Mode */}
      <button
        onClick={() => onChangeMode('timeline')}
        title="Chronological 3D cylindrical timeline"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: currentMode === 'timeline' ? '#06b6d4' : 'transparent',
          color: currentMode === 'timeline' ? '#ffffff' : '#94a3b8',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <Clock size={14} />
        <span>Timeline</span>
      </button>
    </div>
  );
};
