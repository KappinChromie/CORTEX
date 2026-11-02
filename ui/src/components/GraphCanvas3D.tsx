import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Node, Edge, ViewMode, HybridNodeLayout } from '../types';
import { getNodeColor, getNodeSize } from '../utils/colors';
import { evaluateHybridPositions, generateOrbitRingsGeometry } from '../layouts/hybridLayout';

interface GraphCanvas3DProps {
  nodes: Node[];
  edges: Edge[];
  webPositions: Map<string, [number, number, number]>;
  hybridLayout: Record<string, HybridNodeLayout>;
  currentMode: ViewMode;
  selectedNode: Node | null;
  onSelectNode: (node: Node | null) => void;
  hoveredNode: Node | null;
  onHoverNode: (node: Node | null) => void;
  frameAllTrigger: number;
  isOrbitAnimating: boolean;
  isOrbitRingsVisible: boolean;
  isStarGlowVisible: boolean;
  onDoubleClickNode?: (node: Node, shiftKey: boolean) => void;
  dimmedNodeIds?: Set<string>;
}

// Camera controller that smoothly animates camera to selected node or frames all nodes
function CameraController({
  selectedNode,
  positionsRef,
  frameAllTrigger,
  nodes,
}: {
  selectedNode: Node | null;
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  frameAllTrigger: number;
  nodes: Node[];
}) {
  const { camera } = useThree();
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  const targetLookAt = useRef<THREE.Vector3 | null>(null);

  // Focus on selected node
  useEffect(() => {
    if (selectedNode) {
      const pos = positionsRef.current.get(selectedNode.id);
      if (pos) {
        targetLookAt.current = new THREE.Vector3(pos[0], pos[1], pos[2]);
        targetCamPos.current = new THREE.Vector3(pos[0], pos[1] + 35, pos[2] + 95);
      }
    }
  }, [selectedNode, positionsRef]);

  // Frame all visible nodes on trigger
  useEffect(() => {
    if (frameAllTrigger > 0 && nodes.length > 0) {
      const box = new THREE.Box3();
      for (const node of nodes) {
        const pos = positionsRef.current.get(node.id);
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
  }, [frameAllTrigger, nodes, positionsRef, camera]);

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

// Nodes layer with instanced mesh rendering and analytical motion
function NodesLayer({
  nodes,
  positionsRef,
  selectedNode,
  hoveredNode,
  onSelectNode,
  onHoverNode,
  onDoubleClickNode,
  dimmedNodeIds,
}: {
  nodes: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  selectedNode: Node | null;
  hoveredNode: Node | null;
  onSelectNode: (node: Node | null) => void;
  onHoverNode: (node: Node | null) => void;
  onDoubleClickNode?: (node: Node, shiftKey: boolean) => void;
  dimmedNodeIds?: Set<string>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);

  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Update instance matrices and colors every frame to support live orbital motion
  useFrame(() => {
    if (!meshRef.current || nodes.length === 0) return;
    const mesh = meshRef.current;
    mesh.count = nodes.length;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = positionsRef.current.get(node.id) || [0, 0, 0];
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isDimmed = dimmedNodeIds && dimmedNodeIds.size > 0 && !dimmedNodeIds.has(node.id);

      const baseRadius = getNodeSize(node);
      const scaleMult = isSelected ? 1.7 : isHovered ? 1.35 : 1.0;
      const radius = isDimmed ? baseRadius * 0.75 : baseRadius * scaleMult;

      tempPos.set(pos[0], pos[1], pos[2]);
      tempScale.set(radius, radius, radius);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      mesh.setMatrixAt(i, tempMatrix);

      const baseHex = getNodeColor(node);
      tempColor.set(baseHex);
      if (isDimmed) {
        tempColor.lerp(new THREE.Color('#1e293b'), 0.85);
      } else if (isSelected) {
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
  });

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
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < nodes.length && onDoubleClickNode) {
          onDoubleClickNode(nodes[e.instanceId], e.shiftKey);
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

// Star Glow halos for Star nodes
function StarGlowLayer({
  nodes,
  hybridLayout,
  positionsRef,
  isStarGlowVisible,
}: {
  nodes: Node[];
  hybridLayout: Record<string, HybridNodeLayout>;
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  isStarGlowVisible: boolean;
}) {
  const glowGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 16), []);
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#c084fc'),
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  if (!isStarGlowVisible) return null;

  const starNodes = nodes.filter(
    (n) => n.kind === 'project' && !n.is_generic_root && hybridLayout[n.id]?.role === 'star'
  );

  return (
    <group>
      {starNodes.map((star) => {
        const pos = positionsRef.current.get(star.id) || [0, 0, 0];
        const size = getNodeSize(star) * 2.2;
        return (
          <mesh
            key={`glow-${star.id}`}
            geometry={glowGeo}
            material={glowMat}
            position={[pos[0], pos[1], pos[2]]}
            scale={[size, size, size]}
          />
        );
      })}
    </group>
  );
}

// Orbit rings layer with faint circular orbits
function OrbitRingsLayer({
  nodes,
  hybridLayout,
  positionsRef,
  isOrbitRingsVisible,
  currentMode,
}: {
  nodes: Node[];
  hybridLayout: Record<string, HybridNodeLayout>;
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  isOrbitRingsVisible: boolean;
  currentMode: ViewMode;
}) {
  const lineGeo = useMemo(() => {
    if (!isOrbitRingsVisible || currentMode !== 'hybrid') {
      return new THREE.BufferGeometry();
    }
    const points = generateOrbitRingsGeometry(nodes, hybridLayout, positionsRef.current);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return geo;
  }, [nodes, hybridLayout, positionsRef, isOrbitRingsVisible, currentMode]);

  if (!isOrbitRingsVisible || currentMode !== 'hybrid') return null;

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial color="#6366f1" transparent opacity={0.16} depthWrite={false} />
    </lineSegments>
  );
}

// Labels layer: shows titles for Stars, Category Anchors, and Hovered/Selected nodes
function LabelsLayer({
  nodes,
  positionsRef,
  selectedNode,
  hoveredNode,
}: {
  nodes: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  selectedNode: Node | null;
  hoveredNode: Node | null;
}) {
  // Star projects and category anchors
  const prominentNodes = useMemo(
    () =>
      nodes.filter(
        (n) =>
          (n.kind === 'project' && !n.is_generic_root) ||
          (n.kind === 'topic' && n.subkind === 'category') ||
          n.id === selectedNode?.id ||
          n.id === hoveredNode?.id
      ),
    [nodes, selectedNode, hoveredNode]
  );

  return (
    <group>
      {prominentNodes.map((node) => {
        const pos = positionsRef.current.get(node.id) || [0, 0, 0];
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const isStar = node.kind === 'project';
        const isCat = node.kind === 'topic' && node.subkind === 'category';

        return (
          <Html
            key={`label-${node.id}`}
            position={[pos[0], pos[1] + (isStar ? 12 : 7), pos[2]]}
            center
            distanceFactor={750}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              fontSize: isSelected || isHovered ? '12px' : isStar ? '11px' : '9px',
              fontWeight: isStar ? 700 : 600,
              color: isSelected
                ? '#38bdf8'
                : isHovered
                ? '#f8fafc'
                : isStar
                ? '#e2e8f0'
                : '#94a3b8',
              backgroundColor: isSelected || isHovered
                ? 'rgba(15, 23, 42, 0.85)'
                : 'rgba(15, 23, 42, 0.5)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: `1px solid ${
                isSelected
                  ? 'rgba(56, 189, 248, 0.5)'
                  : isHovered
                  ? 'rgba(248, 250, 252, 0.3)'
                  : 'rgba(148, 163, 184, 0.15)'
              }`,
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            }}
          >
            {isCat ? `§ ${node.title}` : node.title}
          </Html>
        );
      })}
    </group>
  );
}

// Edges layer with faint line segments
function EdgesLayer({
  edges,
  positionsRef,
}: {
  edges: Edge[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
}) {
  const lineGeometry = useMemo(() => {
    const points: number[] = [];
    for (const edge of edges) {
      const p1 = positionsRef.current.get(edge.from);
      const p2 = positionsRef.current.get(edge.to);
      if (p1 && p2) {
        points.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [edges, positionsRef]);

  return (
    <lineSegments geometry={lineGeometry}>
      <lineBasicMaterial color="#334155" transparent opacity={0.25} depthWrite={false} />
    </lineSegments>
  );
}

export const GraphCanvas3D: React.FC<GraphCanvas3DProps> = ({
  nodes,
  edges,
  webPositions,
  hybridLayout,
  currentMode,
  selectedNode,
  onSelectNode,
  hoveredNode,
  onHoverNode,
  frameAllTrigger,
  isOrbitAnimating,
  isOrbitRingsVisible,
  isStarGlowVisible,
  onDoubleClickNode,
  dimmedNodeIds,
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Current analytical or static positions of nodes
  const positionsRef = useRef<Map<string, [number, number, number]>>(new Map());

  // Simulation time for analytical orbits
  const simTime = useRef<number>(0);

  // Transition state when switching between web and hybrid modes (1-second eased lerp)
  const isTransitioning = useRef<boolean>(false);
  const transitionStart = useRef<number>(0);
  const fromPositions = useRef<Map<string, [number, number, number]>>(new Map());

  // When mode changes, start transition
  const prevMode = useRef<ViewMode>(currentMode);
  useEffect(() => {
    if (prevMode.current !== currentMode) {
      isTransitioning.current = true;
      transitionStart.current = performance.now();
      fromPositions.current = new Map(positionsRef.current);
      prevMode.current = currentMode;
    }
  }, [currentMode]);

  // Main animation loop: updates analytical positions and handles mode transitions
  const updatePositions = (delta: number) => {
    // Advance simulation time only when orbital animation is active and not hovered/selected
    if (isOrbitAnimating && !hoveredNode && !selectedNode) {
      simTime.current += delta * 0.45;
    }

    const now = performance.now();
    let transitionFactor = 1.0;

    if (isTransitioning.current) {
      const elapsed = (now - transitionStart.current) / 1000.0;
      if (elapsed >= 1.0) {
        isTransitioning.current = false;
        transitionFactor = 1.0;
      } else {
        // Smoothstep easing: 3t^2 - 2t^3
        transitionFactor = elapsed * elapsed * (3 - 2 * elapsed);
      }
    }

    if (currentMode === 'hybrid') {
      const targetPos = evaluateHybridPositions(nodes, hybridLayout, simTime.current);
      if (isTransitioning.current) {
        for (const [id, tPos] of targetPos) {
          const fPos = fromPositions.current.get(id) || tPos;
          positionsRef.current.set(id, [
            fPos[0] + (tPos[0] - fPos[0]) * transitionFactor,
            fPos[1] + (tPos[1] - fPos[1]) * transitionFactor,
            fPos[2] + (tPos[2] - fPos[2]) * transitionFactor,
          ]);
        }
      } else {
        positionsRef.current = targetPos;
      }
    } else {
      // Web (3D force) mode
      if (isTransitioning.current) {
        for (const [id, tPos] of webPositions) {
          const fPos = fromPositions.current.get(id) || tPos;
          positionsRef.current.set(id, [
            fPos[0] + (tPos[0] - fPos[0]) * transitionFactor,
            fPos[1] + (tPos[1] - fPos[1]) * transitionFactor,
            fPos[2] + (tPos[2] - fPos[2]) * transitionFactor,
          ]);
        }
      } else {
        positionsRef.current = webPositions;
      }
    }
  };

  function SceneUpdater() {
    useFrame((_, delta) => {
      updatePositions(delta);
    });
    return null;
  }

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
        camera={{ position: [0, 160, 800], fov: 50, near: 0.1, far: 10000 }}
        onPointerMissed={() => onSelectNode(null)}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[300, 400, 500]} intensity={1.3} />
        <pointLight position={[-300, -300, -400]} intensity={0.7} />

        {/* Space background stars */}
        <Stars
          radius={2200}
          depth={250}
          count={5000}
          factor={4}
          saturation={0.5}
          fade
          speed={0.4}
        />

        <SceneUpdater />

        <CameraController
          selectedNode={selectedNode}
          positionsRef={positionsRef}
          frameAllTrigger={frameAllTrigger}
          nodes={nodes}
        />

        <NodesLayer
          nodes={nodes}
          positionsRef={positionsRef}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          onSelectNode={onSelectNode}
          onHoverNode={onHoverNode}
          onDoubleClickNode={onDoubleClickNode}
          dimmedNodeIds={dimmedNodeIds}
        />

        <StarGlowLayer
          nodes={nodes}
          hybridLayout={hybridLayout}
          positionsRef={positionsRef}
          isStarGlowVisible={isStarGlowVisible}
        />

        <OrbitRingsLayer
          nodes={nodes}
          hybridLayout={hybridLayout}
          positionsRef={positionsRef}
          isOrbitRingsVisible={isOrbitRingsVisible}
          currentMode={currentMode}
        />

        <LabelsLayer
          nodes={nodes}
          positionsRef={positionsRef}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
        />

        <EdgesLayer edges={edges} positionsRef={positionsRef} />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          rotateSpeed={0.8}
          zoomSpeed={1.2}
          minDistance={10}
          maxDistance={6000}
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
              {hoveredNode.subkind ? ` · ${hoveredNode.subkind}` : ''}
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
