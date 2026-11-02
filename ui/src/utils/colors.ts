import type { Node } from '../types';
import { clampStarRadius } from './renderRules';

export function getNodeColor(node: Node): string {
  if (node.kind === 'project') {
    if (node.is_generic_root) {
      return '#64748b'; // Dimmer slate gray for generic root stars
    }
    return '#a855f7'; // Purple for projects (shared star anchors)
  }

  if (node.kind === 'persona') {
    return '#f43f5e'; // Rose pink for agent persona/config
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

export interface StarColorProfile {
  coreColor: string;
  coronaColor: string;
  tier: 'hot' | 'warm' | 'dormant' | 'root';
}

/**
 * Returns emissive core and corona colors based on activity color temperature:
 * - Hot white-blue: highly active (degree >= 8 or access_count >= 3)
 * - Warm orange / amber: moderate activity (degree >= 2)
 * - Dim deep red: dormant (degree <= 1)
 * - Dim slate gray: generic root project
 */
export function getStarColorProfile(star: Node): StarColorProfile {
  if (star.is_generic_root) {
    return {
      coreColor: '#94a3b8',
      coronaColor: '#475569',
      tier: 'root',
    };
  }
  if (star.degree >= 8 || star.access_count >= 3) {
    return {
      coreColor: '#f0f9ff',
      coronaColor: '#38bdf8', // Electric white-blue
      tier: 'hot',
    };
  }
  if (star.degree >= 2) {
    return {
      coreColor: '#fffbeb',
      coronaColor: '#f59e0b', // Warm amber / orange
      tier: 'warm',
    };
  }
  return {
    coreColor: '#fee2e2',
    coronaColor: '#ef4444', // Dim red
    tier: 'dormant',
  };
}

export function getNodeSize(node: Node): number {
  if (node.kind === 'project') {
    return clampStarRadius(node.degree, node.access_count, node.is_generic_root);
  }
  if (node.kind === 'persona') {
    return 4.5;
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
