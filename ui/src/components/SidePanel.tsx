import React from 'react';
import type { Node, Edge } from '../types';
import { X, ExternalLink, Calendar, GitFork, Copy, Check } from 'lucide-react';
import { getNodeColor } from '../utils/colors';

interface SidePanelProps {
  node: Node | null;
  nodesById: Map<string, Node>;
  neighbors: string[];
  edges: Edge[];
  onClose: () => void;
  onSelectNode: (node: Node) => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  node,
  nodesById,
  neighbors,
  edges,
  onClose,
  onSelectNode,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!node) return null;

  const nodeColor = getNodeColor(node);

  const copyPath = () => {
    if (node.path) {
      navigator.clipboard.writeText(node.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Find incoming/outgoing edge types for neighbors
  const neighborEdges = neighbors.map((neighborId) => {
    const neighborNode = nodesById.get(neighborId);
    const edge = edges.find(
      (e) =>
        (e.from === node.id && e.to === neighborId) ||
        (e.to === node.id && e.from === neighborId)
    );
    return {
      neighborId,
      neighborNode,
      kind: edge?.kind || 'connected',
    };
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        right: 16,
        bottom: 16,
        width: 380,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '12px',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span
              style={{
                backgroundColor: nodeColor,
                color: '#fff',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              {node.kind}
            </span>
            <span
              style={{
                backgroundColor: 'rgba(51, 65, 85, 0.8)',
                color: '#94a3b8',
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '999px',
              }}
            >
              {node.source_id}
            </span>
            {node.pinned && (
              <span
                style={{
                  backgroundColor: '#eab308',
                  color: '#000',
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '999px',
                }}
              >
                PINNED
              </span>
            )}
          </div>
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: '#f8fafc',
              margin: 0,
              lineHeight: 1.3,
              wordBreak: 'break-word',
            }}
          >
            {node.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.1)',
            }}
          >
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
              Connected Links
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>
              {node.degree}
            </div>
          </div>
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.1)',
            }}
          >
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
              Access Count
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8' }}>
              {node.access_count}
            </div>
          </div>
        </div>

        {/* Path Info */}
        {node.path && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>FILE PATH</span>
              <button
                onClick={copyPath}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? '#10b981' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '10px',
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.7)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#cbd5e1',
                wordBreak: 'break-all',
                border: '1px solid rgba(148, 163, 184, 0.1)',
              }}
            >
              {node.path}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Calendar size={12} />
            <span>TEMPORAL DATA</span>
          </div>
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div>
              Created:{' '}
              <span style={{ color: '#e2e8f0' }}>
                {node.created_at
                  ? new Date(node.created_at).toLocaleString()
                  : 'File mtime fallback'}
              </span>
            </div>
            <div>
              Last Active:{' '}
              <span style={{ color: '#e2e8f0' }}>
                {node.last_active_at
                  ? new Date(node.last_active_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
                  : node.modified_at
                  ? new Date(node.modified_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
                  : 'N/A'}
              </span>
            </div>
            {node.kind === 'project' && (
              <div>
                Activity Date:{' '}
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                  {node.last_active_at || node.modified_at
                    ? new Date(node.last_active_at || node.modified_at!).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
                    : 'No recorded activity'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Preview Content */}
        {node.body_preview && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: 6,
              }}
            >
              PREVIEW (REDACTED)
            </div>
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.7)',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.5,
                color: '#cbd5e1',
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                border: '1px solid rgba(148, 163, 184, 0.1)',
              }}
            >
              {node.body_preview}
            </div>
          </div>
        )}

        {/* Neighbors List */}
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <GitFork size={12} />
            <span>CONNECTED NEIGHBORS ({neighbors.length})</span>
          </div>
          {neighbors.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
              No connected neighbors
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {neighborEdges.map(({ neighborId, neighborNode, kind }) => (
                <div
                  key={neighborId}
                  onClick={() => neighborNode && onSelectNode(neighborNode)}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.7)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: neighborNode ? 'pointer' : 'default',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (neighborNode) e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.9)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.7)';
                  }}
                >
                  <div style={{ overflow: 'hidden', paddingRight: 8 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: neighborNode ? '#38bdf8' : '#94a3b8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {neighborNode ? neighborNode.title : neighborId}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {kind} • {neighborNode?.kind || 'unknown'}
                    </div>
                  </div>
                  {neighborNode && <ExternalLink size={14} color="#64748b" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
