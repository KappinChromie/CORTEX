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
}

// Camera controller that smoothly animates camera to selected node
function CameraController({
  selectedNode,
  positions,
}: {
  selectedNode: Node | null;
  positions: Map<string, [number, number, number]>;
}) {
  const { camera } = useThree();
  const targetPos = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (selectedNode) {
      const pos = positions.get(selectedNode.id);
      if (pos) {
        targetPos.current = new THREE.Vector3(pos[0], pos[1], pos[2]);
      }
    } else {
      targetPos.current = null;
    }
  }, [selectedNode, positions]);

  useFrame(() => {
    if (targetPos.current) {
      const desiredCamPos = targetPos.current
        .clone()
        .add(new THREE.Vector3(0, 40, 100));
      camera.position.lerp(desiredCamPos, 0.05);
      camera.lookAt(targetPos.current);
    }
  });

  return null;
}

// Nodes layer with instanced meshes or individual meshes
function NodesLayer({
  nodes,
  positions,
  selectedNode,
  onSelectNode,
  onHoverNode,
}: {
  nodes: Node[];
  positions: Map<string, [number, number, number]>;
  selectedNode: Node | null;
  onSelectNode: (node: Node | null) => void;
  onHoverNode: (node: Node | null) => void;
}) {
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

  return (
    <group>
      {nodes.map((node) => {
        const pos = positions.get(node.id) || [0, 0, 0];
        const isSelected = selectedNode?.id === node.id;
        const color = getNodeColor(node);
        const radius = getNodeSize(node);

        return (
          <mesh
            key={node.id}
            position={pos}
            geometry={sphereGeo}
            scale={[
              isSelected ? radius * 1.5 : radius,
              isSelected ? radius * 1.5 : radius,
              isSelected ? radius * 1.5 : radius,
            ]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(node);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
              onHoverNode(node);
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'default';
              onHoverNode(null);
            }}
          >
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isSelected ? 0.8 : 0.3}
              roughness={0.3}
              metalness={0.2}
            />
          </mesh>
        );
      })}
    </group>
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3)
    );
    return geo;
  }, [edges, positions]);

  return (
    <lineSegments geometry={lineGeometry}>
      <lineBasicMaterial
        color="#475569"
        transparent
        opacity={0.25}
        depthWrite={false}
      />
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
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#090d16',
        overflow: 'hidden',
      }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <Canvas
        camera={{ position: [0, 150, 600], fov: 50, near: 0.1, far: 5000 }}
        onPointerMissed={() => onSelectNode(null)}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[200, 300, 400]} intensity={1.2} />
        <pointLight position={[-200, -200, -300]} intensity={0.8} />

        {/* Space background stars */}
        <Stars
          radius={1200}
          depth={150}
          count={4000}
          factor={4}
          saturation={0.5}
          fade
          speed={0.5}
        />

        <CameraController
          selectedNode={selectedNode}
          positions={positions}
        />

        <NodesLayer
          nodes={nodes}
          positions={positions}
          selectedNode={selectedNode}
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
          maxDistance={3000}
        />
      </Canvas>

      {/* Floating Hover Tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: 'fixed',
            left: mousePos.x + 16,
            top: mousePos.y + 16,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            color: '#f8fafc',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '8px',
            padding: '8px 12px',
            pointerEvents: 'none',
            fontSize: '12px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            maxWidth: '280px',
          }}
        >
          <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: 2 }}>
            {hoveredNode.title}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '11px' }}>
            Kind: <span style={{ color: '#e2e8f0' }}>{hoveredNode.kind}</span> | Source:{' '}
            <span style={{ color: '#e2e8f0' }}>{hoveredNode.source_id}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: 2 }}>
            Connected links: <span style={{ color: '#f59e0b' }}>{hoveredNode.degree}</span>
          </div>
        </div>
      )}
    </div>
  );
};
