import * as THREE from 'three';
import type { Node, Edge } from '../types';

export type EdgeStyle = 'hidden' | 'orbit_ring' | 'curved_arc';

/**
 * Evaluates visibility and style of an edge:
 * - Skill-to-category (skill_topic) and tag edges hidden by default; visible only when endpoint is active.
 * - Project-to-planet (project_session, project_task) rendered as orbit rings in solar mode, not straight lines.
 * - Cross-system edges (uses_tool, related_skill, artifact_conversation) rendered as curved arcs.
 */
export function evaluateEdgeStyle(
  edge: Edge,
  nodesById: Map<string, Node>,
  hoveredNodeId?: string | null,
  selectedNodeId?: string | null,
  isHybridMode: boolean = true
): EdgeStyle {
  const isEndpointActive =
    hoveredNodeId === edge.from ||
    hoveredNodeId === edge.to ||
    selectedNodeId === edge.from ||
    selectedNodeId === edge.to;

  // 1. SkillTopic edges (377 edges between skills and category/tag)
  if (edge.kind === 'skill_topic') {
    return isEndpointActive ? 'curved_arc' : 'hidden';
  }

  // 2. Edges connecting to tags
  const fromNode = nodesById.get(edge.from);
  const toNode = nodesById.get(edge.to);
  const fromIsTag = fromNode?.kind === 'topic' && fromNode.subkind === 'tag';
  const toIsTag = toNode?.kind === 'topic' && toNode.subkind === 'tag';

  if (fromIsTag || toIsTag) {
    return isEndpointActive ? 'curved_arc' : 'hidden';
  }

  // 3. Project-planet relationships: handled via orbital rings in hybrid view
  if (
    isHybridMode &&
    (edge.kind === 'project_session' || edge.kind === 'project_task')
  ) {
    return 'orbit_ring';
  }

  // 4. Cross-system and tool usage edges
  return 'curved_arc';
}

/**
 * Clamps visual star radius to ensure no single star ever dominates or fills the screen.
 * Clamped strictly between 5.5 and 11.0 units.
 */
export function clampStarRadius(
  degree: number = 0,
  accessCount: number = 0,
  isGenericRoot: boolean = false
): number {
  if (isGenericRoot) return 5.5;
  const degFactor = Math.sqrt(degree) * 1.0;
  const accessFactor = accessCount > 0 ? Math.log2(accessCount + 1) * 0.8 : 0;
  const raw = 5.5 + degFactor + accessFactor;
  return Math.min(11.0, Math.max(5.5, raw));
}

/**
 * Computes bounding sphere and optimal camera framing distance to comfortably fit all visible nodes.
 */
export function computeBoundingSphereFraming(
  points: [number, number, number][],
  fovDegrees: number = 50
): { center: THREE.Vector3; radius: number; distance: number } | null {
  if (points.length === 0) return null;

  const box = new THREE.Box3();
  for (const p of points) {
    box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
  }

  const center = new THREE.Vector3();
  box.getCenter(center);

  let maxDistSq = 0;
  for (const p of points) {
    const dx = p[0] - center.x;
    const dy = p[1] - center.y;
    const dz = p[2] - center.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > maxDistSq) maxDistSq = distSq;
  }

  const radius = Math.sqrt(maxDistSq) + 40.0;
  const fovRad = (fovDegrees * Math.PI) / 180;
  const distance = Math.max(250.0, radius / Math.sin(fovRad / 2));

  return { center, radius, distance };
}

export interface ScreenLabelCandidate {
  id: string;
  node: Node;
  screenX: number;
  screenY: number;
  worldPos: [number, number, number];
  cameraDist: number;
  priority: number;
  width: number;
  height: number;
  isStar: boolean;
  isCategory: boolean;
  isPlanet: boolean;
}

/**
 * Selects and caps visible labels using screen-space collision avoidance.
 * Maximum visible labels capped at `maxLabels` (default 40).
 */
export function selectVisibleLabels(
  candidates: ScreenLabelCandidate[],
  maxLabels: number = 40
): ScreenLabelCandidate[] {
  // Deduplicate by node ID, taking highest priority
  const bestById = new Map<string, ScreenLabelCandidate>();
  for (const cand of candidates) {
    const existing = bestById.get(cand.id);
    if (!existing || cand.priority > existing.priority) {
      bestById.set(cand.id, cand);
    }
  }

  // Sort descending by priority
  const sorted = Array.from(bestById.values()).sort(
    (a, b) => b.priority - a.priority
  );

  const accepted: ScreenLabelCandidate[] = [];

  for (const cand of sorted) {
    if (accepted.length >= maxLabels) break;

    const candLeft = cand.screenX - cand.width * 0.5;
    const candRight = cand.screenX + cand.width * 0.5;
    const candTop = cand.screenY - cand.height * 0.5;
    const candBottom = cand.screenY + cand.height * 0.5;

    let collides = false;
    for (const acc of accepted) {
      const accLeft = acc.screenX - acc.width * 0.5;
      const accRight = acc.screenX + acc.width * 0.5;
      const accTop = acc.screenY - acc.height * 0.5;
      const accBottom = acc.screenY + acc.height * 0.5;

      // 2D AABB overlap with 4px margin
      if (
        candLeft < accRight + 4.0 &&
        candRight > accLeft - 4.0 &&
        candTop < accBottom + 4.0 &&
        candBottom > accTop - 4.0
      ) {
        collides = true;
        break;
      }
    }

    if (!collides) {
      accepted.push(cand);
    }
  }

  return accepted;
}
