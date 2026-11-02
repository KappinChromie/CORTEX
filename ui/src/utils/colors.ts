import type { Node } from '../types';
import { clampStarRadius } from './renderRules';

export function getNodeColor(node: Node): string {
  if (node.kind === 'project') {
    if (node.is_generic_root) {
      return '#64748b'; // Slate gray for generic root star
    }
    return '#a855f7'; // Purple for projects
  }

  if (node.kind === 'persona') {
    return '#f43f5e'; // Rose pink for agent persona
  }

  if (node.kind === 'topic') {
    if (node.subkind === 'category') {
      return '#06b6d4'; // Cyan for category nebula anchors
    }
    return '#475569'; // Dimmer slate for tags
  }

  if (node.kind === 'tool') {
    return '#38bdf8'; // Technical cyan
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
  tier: 'hot' | 'warm' | 'dormant' | 'root';
  coreColor: string;
  coronaColor: string;
  percentile: number;
  lastActiveFormatted: string;
}

/**
 * Computes activity temperature relative to this dataset:
 * Ranks stars by last-activity recency percentile:
 * - Top >= 0.70: Hot Electric Blue-White
 * - Middle 0.30 - 0.70: Warm Amber / Gold
 * - Lowest < 0.30: Dim Crimson Red
 * - Generic Root: Dim Slate Gray
 */
export function computeStarColorProfiles(stars: Node[]): Map<string, StarColorProfile> {
  const map = new Map<string, StarColorProfile>();
  const nonRootStars = stars.filter((s) => !s.is_generic_root);

  const starTimes = nonRootStars.map((star) => {
    const ts = star.last_active_at || star.modified_at || star.created_at;
    const timeMs = ts ? new Date(ts).getTime() : 0;
    return { star, timeMs };
  });

  // Sort ascending (oldest first, newest last)
  starTimes.sort((a, b) => a.timeMs - b.timeMs);

  const n = starTimes.length;
  for (let i = 0; i < n; i++) {
    const { star, timeMs } = starTimes[i];
    const percentile = n > 1 ? i / (n - 1) : 0.5;

    let tier: 'hot' | 'warm' | 'dormant';
    let coreColor: string;
    let coronaColor: string;

    if (percentile >= 0.7) {
      tier = 'hot';
      coreColor = '#f0f9ff'; // Blue-white core
      coronaColor = '#38bdf8'; // Electric blue corona
    } else if (percentile >= 0.3) {
      tier = 'warm';
      coreColor = '#fffbeb'; // Amber-white core
      coronaColor = '#f59e0b'; // Warm amber corona
    } else {
      tier = 'dormant';
      coreColor = '#991b1b'; // Deep crimson core
      coronaColor = '#ef4444'; // Red corona
    }

    const lastActiveFormatted =
      timeMs > 0
        ? new Date(timeMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
        : 'No recorded activity';

    map.set(star.id, {
      tier,
      coreColor,
      coronaColor,
      percentile,
      lastActiveFormatted,
    });
  }

  // Generic root stars
  for (const star of stars) {
    if (star.is_generic_root) {
      map.set(star.id, {
        tier: 'root',
        coreColor: '#64748b',
        coronaColor: '#475569',
        percentile: 0,
        lastActiveFormatted: 'Generic Home Root (Unaffiliated)',
      });
    }
  }

  return map;
}

/**
 * Returns star color profile with fallback
 */
export function getStarColorProfile(
  star: Node,
  profilesMap?: Map<string, StarColorProfile>
): StarColorProfile {
  if (profilesMap && profilesMap.has(star.id)) {
    return profilesMap.get(star.id)!;
  }

  if (star.is_generic_root) {
    return {
      tier: 'root',
      coreColor: '#64748b',
      coronaColor: '#475569',
      percentile: 0,
      lastActiveFormatted: 'Generic Home Root',
    };
  }

  return {
    tier: 'warm',
    coreColor: '#fffbeb',
    coronaColor: '#f59e0b',
    percentile: 0.5,
    lastActiveFormatted: 'Active',
  };
}

/**
 * Extracts human-readable project basename from path or title
 */
export function getProjectBasename(title: string, path?: string): string {
  const p = path || title;
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = norm.split('/');
  const base = parts[parts.length - 1];
  return base || title;
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
      return 6.5; // Category anchors are prominent
    }
    return 2.2; // Tags are small
  }
  if (node.kind === 'conversation' || node.kind === 'session') {
    // Planets: prominent at overview
    return 6.5 + Math.min(3.5, Math.sqrt(node.degree) * 1.2);
  }
  if (node.kind === 'artifact' || node.kind === 'memory' || node.kind === 'task') {
    // Moons: smaller
    return 3.5 + Math.min(2.5, Math.sqrt(node.degree));
  }
  if (node.kind === 'skill') {
    return 3.5 + Math.min(2.5, Math.sqrt(node.degree));
  }
  if (node.kind === 'tool') {
    return 4.5 + Math.min(2.5, Math.sqrt(node.degree) * 0.8);
  }
  return 2.5 + Math.min(2.0, Math.sqrt(node.degree) * 0.5);
}
