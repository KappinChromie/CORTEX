import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { Node, Edge } from '../types';
import { getNodeColor, getNodeSize } from '../utils/colors';

interface GraphCanvas3DProps {
  nodes: Node[];
  edges: Edge[];
  positions: Map<string, [number, number, number]>;
  selectedNode: Node | null;
  onSelectNode: (node: Node | null) => void;
  hoveredNode: Node | null;
  onHoverNode: (node: Node | null) => void;
  frameAllTrigger: number;
}

// Camera controller that smoothly animates camera to selected node or frames all nodes
function CameraController({
  selectedNode,
  positions,
  frameAllTrigger,
  nodes,
}: {
  selectedNode: Node | null;
  positions: Map<string, [number, number, number]>;
  frameAllTrigger: number;
  nodes: Node[];
}) {
  const { camera } = useThree();
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  const targetLookAt = useRef<THREE.Vector3 | null>(null);

  // Focus on selected node
  useEffect(() => {
    if (selectedNode) {
      const pos = positions.get(selectedNode.id);
      if (pos) {
        targetLookAt.current = new THREE.Vector3(pos[0], pos[1], pos[2]);
        targetCamPos.current = new THREE.Vector3(pos[0], pos[1] + 35, pos[2] + 90);
      }
    }
  }, [selectedNode, positions]);

  // Frame all visible nodes on trigger
  useEffect(() => {
    if (frameAllTrigger > 0 && nodes.length > 0) {
      const box = new THREE.Box3();
      for (const node of nodes) {
        const pos = positions.get(node.id);
        if (pos) {
          box.expandByPoint(new THREE.Vector3(pos[0], pos[1], pos[2]));
        }
      }

      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 200);

        const perspCam = camera as THREE.PerspectiveCamera;
        const fov = (perspCam.fov || 50) * (Math.PI / 180);
        let dist = (maxDim / 2 / Math.tan(fov / 2)) * 1.35;
        dist = Math.max(dist, 250);

        targetLookAt.current = center;
        targetCamPos.current = new THREE.Vector3(center.x, center.y + dist * 0.25, center.z + dist);
      }
    }
  }, [frameAllTrigger, nodes, positions, camera]);

  useFrame(() => {
    if (targetCamPos.current && targetLookAt.current) {
      camera.position.lerp(targetCamPos.current, 0.08);
      camera.lookAt(targetLookAt.current);

      if (camera.position.distanceTo(targetCamPos.current) < 1.0) {
        targetCamPos.current = null;
        targetLookAt.current = null;
      }
    }
  });

  return null;
}

// Nodes layer with instanced mesh rendering
function NodesLayer({
  nodes,
  positions,
  selectedNode,
  hoveredNode,
  onSelectNode,
  onHoverNode,
}: {
  nodes: Node[];
  positions: Map<string, [number, number, number]>;
  selectedNode: Node | null;
  hoveredNode: Node | null;
  onSelectNode: (node: Node | null) => void;
  onHoverNode: (node: Node | null) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Update instance matrices and colors whenever data, layout, or hover/selection changes
  useEffect(() => {
    if (!meshRef.current || nodes.length === 0) return;
    const mesh = meshRef.current;
    mesh.count = nodes.length;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = positions.get(node.id) || [0, 0, 0];
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;

      const baseRadius = getNodeSize(node);
      const scaleMult = isSelected ? 1.7 : isHovered ? 1.35 : 1.0;
      const radius = baseRadius * scaleMult;

      tempPos.set(pos[0], pos[1], pos[2]);
      tempScale.set(radius, radius, radius);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      mesh.setMatrixAt(i, tempMatrix);

      const baseHex = getNodeColor(node);
      tempColor.set(baseHex);
      if (isSelected) {
        tempColor.offsetHSL(0, 0, 0.3);
      } else if (isHovered) {
        tempColor.offsetHSL(0, 0, 0.15);
      }
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [nodes, positions, selectedNode, hoveredNode, tempMatrix, tempPos, tempScale, tempQuat, tempColor]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[sphereGeo, undefined, Math.max(1, nodes.length)]}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < nodes.length) {
          onSelectNode(nodes[e.instanceId]);
        }
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < nodes.length) {
          document.body.style.cursor = 'pointer';
          onHoverNode(nodes[e.instanceId]);
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
        onHoverNode(null);
      }}
    >
      <meshStandardMaterial roughness={0.3} metalness={0.2} toneMapped={false} />
    </instancedMesh>
  );
}

// Edges layer with faint line segments
function EdgesLayer({
  edges,
  positions,
}: {
  edges: Edge[];
  positions: Map<string, [number, number, number]>;
}) {
  const lineGeometry = useMemo(() => {
    const points: number[] = [];
    for (const edge of edges) {
      const p1 = positions.get(edge.from);
      const p2 = positions.get(edge.to);
      if (p1 && p2) {
        points.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [edges, positions]);

  return (
    <lineSegments geometry={lineGeometry}>
      <lineBasicMaterial color="#334155" transparent opacity={0.25} depthWrite={false} />
    </lineSegments>
  );
}

export const GraphCanvas3D: React.FC<GraphCanvas3DProps> = ({
  nodes,
  edges,
  positions,
  selectedNode,
  onSelectNode,
  hoveredNode,
  onHoverNode,
  frameAllTrigger,
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        backgroundColor: '#030712',
        overflow: 'hidden',
      }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <Canvas
        camera={{ position: [0, 150, 750], fov: 50, near: 0.1, far: 8000 }}
        onPointerMissed={() => onSelectNode(null)}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[200, 300, 400]} intensity={1.2} />
        <pointLight position={[-200, -200, -300]} intensity={0.8} />

        {/* Space background stars */}
        <Stars
          radius={1600}
          depth={200}
          count={4500}
          factor={4}
          saturation={0.5}
          fade
          speed={0.5}
        />

        <CameraController
          selectedNode={selectedNode}
          positions={positions}
          frameAllTrigger={frameAllTrigger}
          nodes={nodes}
        />

        <NodesLayer
          nodes={nodes}
          positions={positions}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          onSelectNode={onSelectNode}
          onHoverNode={onHoverNode}
        />

        <EdgesLayer edges={edges} positions={positions} />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.8}
          zoomSpeed={1.2}
          minDistance={10}
          maxDistance={5000}
        />
      </Canvas>

      {/* Floating Hover Tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#f8fafc',
            pointerEvents: 'none',
            zIndex: 60,
            maxWidth: 260,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: getNodeColor(hoveredNode),
              }}
            />
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600 }}>
              {hoveredNode.kind}
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, marginTop: 2 }}>{hoveredNode.title}</div>
          {hoveredNode.degree > 0 && (
            <div style={{ fontSize: '10px', color: '#38bdf8', marginTop: 4 }}>
              {hoveredNode.degree} connections
            </div>
          )}
        </div>
      )}
    </div>
  );
};
