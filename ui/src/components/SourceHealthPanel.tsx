import React from 'react';
import type { AdapterHealth } from '../types';
import { Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface SourceHealthPanelProps {
  sources: AdapterHealth[];
  onRescan: () => void;
  isScanning: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export const SourceHealthPanel: React.FC<SourceHealthPanelProps> = ({
  sources,
  onRescan,
  isScanning,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 16,
        width: 360,
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '12px',
        color: '#f8fafc',
        zIndex: 50,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} color="#38bdf8" />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Source Adapters</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onRescan}
            disabled={isScanning}
            style={{
              backgroundColor: isScanning ? '#334155' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: isScanning ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? 'Scanning...' : 'Rescan'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '14px',
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Sources list */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sources.map((src) => {
          const isOk = src.status === 'ok';
          const isDegraded = src.status === 'degraded';

          return (
            <div
              key={src.source_id}
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                borderRadius: '8px',
                padding: '10px 12px',
                border: '1px solid rgba(148, 163, 184, 0.1)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isOk ? (
                    <CheckCircle2 size={16} color="#10b981" />
                  ) : isDegraded ? (
                    <AlertTriangle size={16} color="#f59e0b" />
                  ) : (
                    <XCircle size={16} color="#ef4444" />
                  )}
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#f1f5f9' }}>
                    {src.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: isOk ? '#10b981' : isDegraded ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {src.status}
                </span>
              </div>

              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: 12 }}>
                <span>Scanned: {src.items_scanned} items</span>
                <span>Time: {src.scan_duration_ms} ms</span>
                {src.version && <span>v{src.version}</span>}
              </div>

              {src.warnings.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {src.warnings.map((w, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '10px',
                        color: '#fca5a5',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      [{w.code}] {w.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
