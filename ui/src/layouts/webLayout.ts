import type { LayoutEngine, Node, Edge, TimestampStats } from '../types';

export class WebLayoutEngine implements LayoutEngine {
  id = 'web' as const;
  name = '3D Force Web';
  description = '3D force-directed relational network clustering nodes by agent and degree';

  compute(
    nodes: Node[],
    _edges: Edge[],
    _timestamps: TimestampStats,
    precomputed?: Record<string, [number, number, number]>
  ): Map<string, [number, number, number]> {
    const positions = new Map<string, [number, number, number]>();

    // If backend provided precomputed coordinates, use them directly
    if (precomputed && Object.keys(precomputed).length > 0) {
      for (const [id, pos] of Object.entries(precomputed)) {
        positions.set(id, pos);
      }
      return positions;
    }

    // Fallback: Fibonacci golden-ratio spherical shell layout
    const n = nodes.length;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    nodes.forEach((node, i) => {
      const theta = 2 * Math.PI * (i / goldenRatio);
      const phi = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * ((i + 0.5) / n))));

      let radius = 200;
      switch (node.kind) {
        case 'project':
          radius = 120 + Math.min(50, node.degree * 4);
          break;
        case 'session':
        case 'conversation':
          radius = 260 + (i % 5) * 20;
          break;
        case 'artifact':
        case 'memory':
          radius = 340 + (i % 6) * 20;
          break;
        case 'task':
          radius = 400 + (i % 4) * 25;
          break;
        case 'skill':
        case 'topic':
          radius = 500 + (i % 8) * 25;
          break;
        case 'tool':
          radius = 600 + (i % 3) * 20;
          break;
      }

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi) * 0.75;
      const z = radius * Math.sin(phi) * Math.sin(theta);

      positions.set(node.id, [x, y, z]);
    });

    return positions;
  }
}
