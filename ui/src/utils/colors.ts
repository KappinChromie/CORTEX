import type { Node } from '../types';

export function getNodeColor(node: Node): string {
  if (node.kind === 'project') {
    if (node.is_generic_root) {
      return '#64748b'; // Dimmer slate gray for generic root stars
    }
    return '#a855f7'; // Purple for projects (shared star anchors)
  }

  if (node.kind === 'topic') {
    if (node.subkind === 'category') {
      return '#06b6d4'; // Cyan for first-class Category nebula anchors
    }
    return '#475569'; // Dimmer slate for tags
  }

  if (node.kind === 'tool') {
    return '#38bdf8'; // Cyan
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
    if (node.is_generic_root) {
      return 5.5; // Generic root star is smaller and dimmer
    }
    // Star size by activity (conversation and step counts / degree / access_count)
    return 8.0 + Math.min(12.0, Math.sqrt(node.degree) * 2.5 + (node.access_count > 0 ? Math.log2(node.access_count + 1) * 2.0 : 0));
  }
  if (node.kind === 'topic') {
    if (node.subkind === 'category') {
      return 6.0; // Category anchors are prominent
    }
    return 2.2; // Tags are small
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
    return 4.2 + Math.min(3.0, Math.sqrt(node.degree) * 0.8);
  }
  return 2.5 + Math.min(2.5, Math.sqrt(node.degree) * 0.5);
}
