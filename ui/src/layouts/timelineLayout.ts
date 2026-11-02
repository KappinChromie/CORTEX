import type { LayoutEngine, Node, Edge, TimestampStats, ViewMode } from '../types';

export interface TimelineOptions {
  compressGaps?: boolean;
  cylinderRadius?: number;
  timelineLength?: number;
}

export interface ActivityHistogramBucket {
  timestamp: number;
  dateStr: string;
  count: number;
  agentCounts: Record<string, number>;
}

export class TimelineLayoutEngine implements LayoutEngine {
  id: ViewMode = 'timeline';
  name = '3D Cylindrical Timeline';
  description = 'Time extends along X axis; project lanes form cylindrical coordinates in YZ plane';

  compute(
    nodes: Node[],
    _edges: Edge[],
    timestamps: TimestampStats,
    _precomputed?: Record<string, [number, number, number]>,
    options?: TimelineOptions
  ): Map<string, [number, number, number]> {
    const positions = new Map<string, [number, number, number]>();

    const timelineLength = options?.timelineLength ?? 1600;
    const cylinderRadius = options?.cylinderRadius ?? 110;
    const compressGaps = options?.compressGaps ?? false;

    // 1. Determine Time Range
    let minTime = timestamps.earliest_date ? new Date(timestamps.earliest_date).getTime() : 0;
    let maxTime = timestamps.latest_date ? new Date(timestamps.latest_date).getTime() : 0;

    // Scan all nodes for valid timestamps
    const nodeTimes: Map<string, number> = new Map();
    for (const node of nodes) {
      const tsStr = node.created_at || node.last_active_at || node.modified_at;
      if (tsStr) {
        const t = new Date(tsStr).getTime();
        if (!isNaN(t)) {
          nodeTimes.set(node.id, t);
          if (minTime === 0 || t < minTime) minTime = t;
          if (maxTime === 0 || t > maxTime) maxTime = t;
        }
      }
    }

    if (minTime === 0) minTime = Date.now() - 30 * 24 * 3600 * 1000;
    if (maxTime === 0 || maxTime <= minTime) maxTime = minTime + 24 * 3600 * 1000;

    // 2. Identify Project Lanes in YZ plane
    const projectNodes = nodes.filter((n) => n.kind === 'project');
    const projectLanes = new Map<string, number>();

    projectNodes.forEach((p, idx) => {
      projectLanes.set(p.id, idx);
    });

    // Plus 1 lane for unaffiliated and 1 for undated
    const unaffiliatedLaneIdx = projectNodes.length;
    const totalLanes = Math.max(1, projectNodes.length + 1);

    // Compute YZ coordinates for each lane around cylinder
    const laneCoords = new Map<number, [number, number]>();
    for (let l = 0; l <= totalLanes; l++) {
      const angle = (l / totalLanes) * 2 * Math.PI;
      laneCoords.set(l, [
        cylinderRadius * Math.cos(angle),
        cylinderRadius * Math.sin(angle),
      ]);
    }

    // 3. Map parent project for non-project nodes
    const nodeToProject = new Map<string, string>();
    for (const edge of _edges) {
      if (edge.kind === 'project_session' || edge.kind === 'project_task') {
        if (projectLanes.has(edge.to)) nodeToProject.set(edge.from, edge.to);
        else if (projectLanes.has(edge.from)) nodeToProject.set(edge.to, edge.from);
      }
    }

    // Optional Non-linear Gap Compression
    let timeMapper = (t: number): number => {
      const norm = (t - minTime) / (maxTime - minTime || 1);
      return (norm - 0.5) * timelineLength;
    };

    if (compressGaps) {
      // Gather unique sorted active days
      const sortedTimes = Array.from(new Set(nodeTimes.values())).sort((a, b) => a - b);
      if (sortedTimes.length > 1) {
        const gapThreshold = 24 * 3600 * 1000; // 24 hours
        let compressedTotal = 0;
        const segmentOffsets = new Map<number, number>();

        for (let i = 0; i < sortedTimes.length; i++) {
          if (i === 0) {
            segmentOffsets.set(sortedTimes[0], 0);
          } else {
            const rawGap = sortedTimes[i] - sortedTimes[i - 1];
            const effectiveGap = rawGap > gapThreshold ? gapThreshold : rawGap;
            compressedTotal += effectiveGap;
            segmentOffsets.set(sortedTimes[i], compressedTotal);
          }
        }

        if (compressedTotal > 0) {
          timeMapper = (t: number): number => {
            // Find closest lower segment
            let closest = sortedTimes[0];
            for (const st of sortedTimes) {
              if (st <= t) closest = st;
              else break;
            }
            const base = segmentOffsets.get(closest) || 0;
            const extra = Math.min(gapThreshold, t - closest);
            const compNorm = (base + extra) / compressedTotal;
            return (compNorm - 0.5) * timelineLength;
          };
        }
      }
    }

    // 4. Place Nodes in 3D Space
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const t = nodeTimes.get(node.id);

      if (t !== undefined) {
        // Timestamped node
        const x = timeMapper(t);

        // Determine lane
        let laneIdx = unaffiliatedLaneIdx;
        if (node.kind === 'project') {
          laneIdx = projectLanes.get(node.id) ?? unaffiliatedLaneIdx;
        } else {
          const parentProj = nodeToProject.get(node.id);
          if (parentProj && projectLanes.has(parentProj)) {
            laneIdx = projectLanes.get(parentProj)!;
          }
        }

        const [baseY, baseZ] = laneCoords.get(laneIdx) || [0, 0];

        // Small radial displacement based on node kind (moons slightly off project lane)
        let radialJitter = 0;
        let angleOffset = 0;
        if (node.kind === 'session' || node.kind === 'conversation') {
          radialJitter = 4.0;
        } else if (node.kind === 'artifact' || node.kind === 'memory' || node.kind === 'task') {
          radialJitter = 12.0;
          angleOffset = ((i % 8) / 8) * 2 * Math.PI;
        }

        const finalY = baseY + radialJitter * Math.cos(angleOffset);
        const finalZ = baseZ + radialJitter * Math.sin(angleOffset);

        positions.set(node.id, [x, finalY, finalZ]);
      } else {
        // Undated node (ambient skills, tools, configs): place in Undated Lane at far left
        const undatedX = -timelineLength * 0.58;
        const undatedAngle = (i / Math.max(1, nodes.length)) * 2 * Math.PI;
        const undatedRadius = cylinderRadius * 1.25;

        positions.set(node.id, [
          undatedX,
          undatedRadius * Math.cos(undatedAngle),
          undatedRadius * Math.sin(undatedAngle),
        ]);
      }
    }

    return positions;
  }
}

/**
 * Computes an activity histogram across hours/days for the timeline scrubber.
 */
export function computeActivityHistogram(
  nodes: Node[],
  bucketSizeMs: number = 3600 * 1000 * 6 // 6-hour buckets
): ActivityHistogramBucket[] {
  const buckets: Map<number, ActivityHistogramBucket> = new Map();

  for (const node of nodes) {
    const tsStr = node.created_at || node.last_active_at || node.modified_at;
    if (!tsStr) continue;
    const time = new Date(tsStr).getTime();
    if (isNaN(time)) continue;

    const bucketKey = Math.floor(time / bucketSizeMs) * bucketSizeMs;
    let b = buckets.get(bucketKey);
    if (!b) {
      b = {
        timestamp: bucketKey,
        dateStr: new Date(bucketKey).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        count: 0,
        agentCounts: {},
      };
      buckets.set(bucketKey, b);
    }
    b.count += 1;
    const src = node.source_id || 'unknown';
    b.agentCounts[src] = (b.agentCounts[src] || 0) + 1;
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}
