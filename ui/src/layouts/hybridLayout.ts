import type { HybridNodeLayout, Node } from '../types';

export function computeOrbitalOffset(
  orbit: NonNullable<HybridNodeLayout['orbit']>,
  time: number
): [number, number, number] {
  const theta = orbit.phase + orbit.angular_speed * time;
  const r = orbit.radius;
  const inc = orbit.inclination;
  const asc = orbit.ascending_node;

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosInc = Math.cos(inc);
  const sinInc = Math.sin(inc);
  const cosAsc = Math.cos(asc);
  const sinAsc = Math.sin(asc);

  const x = r * (cosTheta * cosAsc - sinTheta * sinAsc * cosInc);
  const y = r * (sinTheta * sinInc);
  const z = r * (cosTheta * sinAsc + sinTheta * cosAsc * cosInc);

  return [x, y, z];
}

/**
 * Computes all node positions analytically for a given simulation time.
 * Evaluates stars first, then planets, then moons.
 */
export function evaluateHybridPositions(
  nodes: Node[],
  hybridLayout: Record<string, HybridNodeLayout>,
  time: number
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();

  // Pass 1: Stars, ToolHubs, Nebula, Unaffiliated (base positions)
  for (const node of nodes) {
    const layout = hybridLayout[node.id];
    if (!layout) {
      positions.set(node.id, [0, 0, 0]);
      continue;
    }

    if (
      layout.role === 'star' ||
      layout.role === 'tool_hub' ||
      layout.role === 'nebula_anchor' ||
      layout.role === 'nebula_item' ||
      layout.role === 'unaffiliated' ||
      !layout.orbit
    ) {
      positions.set(node.id, layout.base_position);
    }
  }

  // Pass 2: Planets (orbit around stars)
  for (const node of nodes) {
    const layout = hybridLayout[node.id];
    if (layout?.role === 'planet' && layout.orbit?.parent_id) {
      const parentPos = positions.get(layout.orbit.parent_id) || [0, 0, 0];
      const offset = computeOrbitalOffset(layout.orbit, time);
      positions.set(node.id, [
        parentPos[0] + offset[0],
        parentPos[1] + offset[1],
        parentPos[2] + offset[2],
      ]);
    }
  }

  // Pass 3: Moons (orbit around planets or stars)
  for (const node of nodes) {
    const layout = hybridLayout[node.id];
    if (layout?.role === 'moon' && layout.orbit?.parent_id) {
      const parentPos = positions.get(layout.orbit.parent_id) || [0, 0, 0];
      const offset = computeOrbitalOffset(layout.orbit, time);
      positions.set(node.id, [
        parentPos[0] + offset[0],
        parentPos[1] + offset[1],
        parentPos[2] + offset[2],
      ]);
    }
  }

  return positions;
}

/**
 * Generates line segments for orbit rings of all orbiting bodies.
 */
export function generateOrbitRingsGeometry(
  nodes: Node[],
  hybridLayout: Record<string, HybridNodeLayout>,
  positions: Map<string, [number, number, number]>,
  segments = 48
): Float32Array {
  const points: number[] = [];

  for (const node of nodes) {
    const layout = hybridLayout[node.id];
    if (!layout?.orbit?.parent_id) continue;

    const parentPos = positions.get(layout.orbit.parent_id);
    if (!parentPos) continue;

    const r = layout.orbit.radius;
    const inc = layout.orbit.inclination;
    const asc = layout.orbit.ascending_node;

    const cosInc = Math.cos(inc);
    const sinInc = Math.sin(inc);
    const cosAsc = Math.cos(asc);
    const sinAsc = Math.sin(asc);

    let prevX = 0;
    let prevY = 0;
    let prevZ = 0;

    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      const ox = r * (cosTheta * cosAsc - sinTheta * sinAsc * cosInc);
      const oy = r * (sinTheta * sinInc);
      const oz = r * (cosTheta * sinAsc + sinTheta * cosAsc * cosInc);

      const px = parentPos[0] + ox;
      const py = parentPos[1] + oy;
      const pz = parentPos[2] + oz;

      if (s > 0) {
        points.push(prevX, prevY, prevZ, px, py, pz);
      }
      prevX = px;
      prevY = py;
      prevZ = pz;
    }
  }

  return new Float32Array(points);
}
