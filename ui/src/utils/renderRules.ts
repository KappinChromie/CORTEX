import * as THREE from 'three';
import type { Node, Edge } from '../types';

export type EdgeStyle = 'hidden' | 'orbit_ring' | 'curved_arc';
export type LinksMode = 'off' | 'strong' | 'all';

/**
 * Checks whether edge endpoints are finite, distinct, and within galaxy sanity bounds.
 * Discards any edge longer than maxChordLength (default 1100).
 */
export function isEdgeGeometryValid(
  p1: [number, number, number] | THREE.Vector3,
  p2: [number, number, number] | THREE.Vector3,
  sanityLimit: number = 2500.0,
  maxChordLength: number = 1100.0
): boolean {
  const x1 = Array.isArray(p1) ? p1[0] : p1.x;
  const y1 = Array.isArray(p1) ? p1[1] : p1.y;
  const z1 = Array.isArray(p1) ? p1[2] : p1.z;

  const x2 = Array.isArray(p2) ? p2[0] : p2.x;
  const y2 = Array.isArray(p2) ? p2[1] : p2.y;
  const z2 = Array.isArray(p2) ? p2[2] : p2.z;

  if (
    !Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(z1) ||
    !Number.isFinite(x2) || !Number.isFinite(y2) || !Number.isFinite(z2)
  ) {
    return false;
  }

  const d1Sq = x1 * x1 + y1 * y1 + z1 * z1;
  const d2Sq = x2 * x2 + y2 * y2 + z2 * z2;
  const limitSq = sanityLimit * sanityLimit;

  if (d1Sq > limitSq || d2Sq > limitSq) {
    return false;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const distSq = dx * dx + dy * dy + dz * dz;

  // Between 0.01 and maxChordLength^2
  return distSq >= 0.01 && distSq <= maxChordLength * maxChordLength;
}

/**
 * Computes deterministic quadratic bezier arc control point between p1 and p2.
 * - Upward/outward cosmic bridge arching gracefully into 3D space.
 * - Height clamped to [12.0, 65.0].
 * - Deterministic hash jitter to prevent overlapping paths.
 */
export function computeArcControlPoint(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  fromId: string,
  toId: string
): THREE.Vector3 {
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const chord = new THREE.Vector3().subVectors(p2, p1);
  const chordLen = chord.length();

  if (chordLen < 1e-4) {
    return mid.clone().add(new THREE.Vector3(0, 10, 0));
  }

  const chordDir = chord.clone().normalize();

  // Compute perpendicular arch vector
  const worldUp = new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3().crossVectors(chordDir, worldUp);
  if (normal.length() < 0.05) {
    normal = new THREE.Vector3().crossVectors(chordDir, new THREE.Vector3(0, 0, 1));
  }
  normal.normalize();

  let archDir = new THREE.Vector3().crossVectors(normal, chordDir).normalize();
  if (archDir.y < 0) {
    archDir.negate();
  }

  // Slight outward push from galaxy center
  const midNorm = mid.length() > 1.0 ? mid.clone().normalize() : new THREE.Vector3(0, 1, 0);
  archDir.addScaledVector(midNorm, 0.3).normalize();

  // Deterministic subtle elevation jitter
  let h = 2166136261;
  const str = `${fromId}:${toId}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const jitter = ((Math.abs(h) % 100) / 100.0) * 0.15 + 0.92;
  const arcHeight = Math.min(65.0, Math.max(12.0, chordLen * 0.16 * jitter));

  return mid.clone().add(archDir.multiplyScalar(arcHeight));
}

/**
 * Evaluates visibility and style of an edge:
 * - Skill-to-category (skill_topic) and tag edges hidden by default; visible only when endpoint is active.
 * - Project-to-planet (project_session, project_task) rendered as orbit rings in solar mode.
 * - Artifact-to-conversation: parent-child containment, visible only on hover/select.
 * - RelatedSkill: intra-nebula wiring, visible only on hover/select or in 'all' mode.
 * - Tool usage: sits between systems, visible only on hover/select or in 'all' mode.
 * - LinksMode 'off': no unselected cross-system arcs.
 * - LinksMode 'strong': top 30 cross-system links.
 * - LinksMode 'all': up to 400 visible links.
 */
export function evaluateEdgeStyle(
  edge: Edge,
  nodesById: Map<string, Node>,
  hoveredNodeId?: string | null,
  selectedNodeId?: string | null,
  isHybridMode: boolean = true,
  linksMode: LinksMode = 'strong',
  isTopStrongLink: boolean = false
): EdgeStyle {
  const isEndpointActive =
    hoveredNodeId === edge.from ||
    hoveredNodeId === edge.to ||
    selectedNodeId === edge.from ||
    selectedNodeId === edge.to;

  // 1. SkillTopic edges (skill-to-category/tag)
  if (edge.kind === 'skill_topic') {
    return isEndpointActive ? 'curved_arc' : 'hidden';
  }

  // 2. Tag edges
  const fromNode = nodesById.get(edge.from);
  const toNode = nodesById.get(edge.to);
  const fromIsTag = fromNode?.kind === 'topic' && fromNode.subkind === 'tag';
  const toIsTag = toNode?.kind === 'topic' && toNode.subkind === 'tag';
  if (fromIsTag || toIsTag) {
    return isEndpointActive ? 'curved_arc' : 'hidden';
  }

  // 3. Project-planet relationships: rendered as orbital rings in hybrid view
  if (
    isHybridMode &&
    (edge.kind === 'project_session' || edge.kind === 'project_task')
  ) {
    return 'orbit_ring';
  }

  // 4. Artifact-to-conversation: parent-child moon links, shown only when endpoint active
  if (edge.kind === 'artifact_conversation') {
    return isEndpointActive ? 'curved_arc' : 'hidden';
  }

  // If an endpoint is active, always show as highlighted CurvedArc
  if (isEndpointActive) {
    return 'curved_arc';
  }

  // 5. Inactive edges: check LinksMode
  switch (linksMode) {
    case 'off':
      return 'hidden';
    case 'strong': {
      // Intra-nebula skill edges and tool hubs are hidden by default in Strong mode
      if (edge.kind === 'related_skill') return 'hidden';
      const involvesTool =
        edge.kind === 'uses_tool' ||
        fromNode?.kind === 'tool' ||
        toNode?.kind === 'tool';
      if (involvesTool) return 'hidden';

      return isTopStrongLink ? 'curved_arc' : 'hidden';
    }
    case 'all':
      return 'curved_arc';
  }
}

/**
 * Computes ranking weights for cross-system edges:
 * Returns a set of edge indices that qualify as top strong links (capped at maxStrong, default 30).
 */
export function computeStrongLinks(
  edges: Edge[],
  nodesById: Map<string, Node>,
  maxStrong: number = 30
): Set<number> {
  const scored: { index: number; score: number }[] = [];

  for (let idx = 0; idx < edges.length; idx++) {
    const edge = edges[idx];
    if (
      edge.kind === 'skill_topic' ||
      edge.kind === 'project_session' ||
      edge.kind === 'project_task' ||
      edge.kind === 'artifact_conversation' ||
      edge.kind === 'related_skill'
    ) {
      continue;
    }

    const fromNode = nodesById.get(edge.from);
    const toNode = nodesById.get(edge.to);

    const fromIsTag = fromNode?.kind === 'topic' && fromNode.subkind === 'tag';
    const toIsTag = toNode?.kind === 'topic' && toNode.subkind === 'tag';
    if (fromIsTag || toIsTag) continue;

    const isTool =
      edge.kind === 'uses_tool' ||
      fromNode?.kind === 'tool' ||
      toNode?.kind === 'tool';
    if (isTool) continue;

    let score = edge.weight || 1.0;
    if (fromNode) score += fromNode.importance * 5.0;
    if (toNode) score += toNode.importance * 5.0;

    scored.push({ index: idx, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const strongSet = new Set<number>();
  for (let i = 0; i < Math.min(maxStrong, scored.length); i++) {
    strongSet.add(scored[i].index);
  }

  return strongSet;
}

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

export function selectVisibleLabels(
  candidates: ScreenLabelCandidate[],
  maxLabels: number = 25
): ScreenLabelCandidate[] {
  const bestById = new Map<string, ScreenLabelCandidate>();
  for (const cand of candidates) {
    const existing = bestById.get(cand.id);
    if (!existing || cand.priority > existing.priority) {
      bestById.set(cand.id, cand);
    }
  }

  const list = Array.from(bestById.values());
  list.sort((a, b) => b.priority - a.priority);

  const accepted: ScreenLabelCandidate[] = [];

  for (const cand of list) {
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

      if (
        candLeft < accRight + 6.0 &&
        candRight > accLeft - 6.0 &&
        candTop < accBottom + 6.0 &&
        candBottom > accTop - 6.0
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
