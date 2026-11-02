import type { Node } from '../types';

export function getNodeColor(node: Node): string {
  if (node.kind === 'project') {
    return '#a855f7'; // Purple for projects (shared star anchors)
  }

  if (node.kind === 'tool') {
    return '#38bdf8'; // Cyan
  }

  if (node.kind === 'topic') {
    return '#64748b'; // Slate gray
  }

  switch (node.source_id.toLowerCase()) {
    case 'antigravity':
      return '#0284c7'; // Deep Blue
    case 'hermes':
      return '#ea580c'; // Hermes Orange
    case 'shared':
      return '#f59e0b'; // Amber Gold
    default:
      if (node.source_id.startsWith('vault')) {
        return '#10b981'; // Emerald
      }
      return '#94a3b8';
  }
}

export function getNodeSize(node: Node): number {
  if (node.kind === 'project') {
    return 7.0 + Math.min(6.0, Math.sqrt(node.degree) * 2.0);
  }
  if (node.kind === 'conversation' || node.kind === 'session') {
    return 5.0 + Math.min(4.0, Math.sqrt(node.degree) * 1.5);
  }
  if (node.kind === 'artifact' || node.kind === 'memory') {
    return 4.0 + Math.min(3.0, Math.sqrt(node.degree));
  }
  if (node.kind === 'skill') {
    return 3.5 + Math.min(3.0, Math.sqrt(node.degree));
  }
  if (node.kind === 'tool') {
    return 3.0 + Math.min(3.0, Math.sqrt(node.degree) * 0.8);
  }
  return 2.5 + Math.min(2.5, Math.sqrt(node.degree) * 0.5);
}
