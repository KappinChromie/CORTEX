import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Node, Edge, ViewMode, HybridNodeLayout } from '../types';
import { getNodeColor, getNodeSize } from '../utils/colors';
import { evaluateHybridPositions, generateOrbitRingsGeometry } from '../layouts/hybridLayout';
import {
  evaluateEdgeStyle,
  computeBoundingSphereFraming,
  selectVisibleLabels,
  type ScreenLabelCandidate,
} from '../utils/renderRules';

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
  resetViewTrigger: number;
  cameraControlMode: 'orbit' | 'fly';
  isOrbitAnimating: boolean;
  isOrbitRingsVisible: boolean;
  isStarGlowVisible: boolean;
  onDoubleClickNode?: (node: Node, shiftKey: boolean) => void;
  dimmedNodeIds?: Set<string>;
  onClearIsolation?: () => void;
}

// Camera controller that smoothly animates camera to selected node or frames all nodes using bounding sphere
function CameraController({
  selectedNode,
  positionsRef,
  frameAllTrigger,
  resetViewTrigger,
  nodes,
}: {
  selectedNode: Node | null;
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  frameAllTrigger: number;
  resetViewTrigger: number;
  nodes: Node[];
}) {
  const { camera } = useThree();
  const targetCamPos = useRef<THREE.Vector3 | null>(null);
  const targetLookAt = useRef<THREE.Vector3 | null>(null);
  const hasInitiallyFramed = useRef<boolean>(false);

  const applyBoundingSphereFraming = useCallback(() => {
    if (nodes.length === 0) return;
    const pts: [number, number, number][] = [];
    for (const node of nodes) {
      const pos = positionsRef.current.get(node.id);
      if (pos) pts.push(pos);
    }
    if (pts.length === 0) return;

    const perspCam = camera as THREE.PerspectiveCamera;
    const framing = computeBoundingSphereFraming(pts, perspCam.fov || 50);
    if (framing) {
      targetLookAt.current = framing.center;
      targetCamPos.current = new THREE.Vector3(
        framing.center.x,
        framing.center.y + framing.distance * 0.35,
        framing.center.z + framing.distance * 0.95
      );
    }
  }, [nodes, positionsRef, camera]);

  // Initial camera framing on mount / when node positions arrive
  useEffect(() => {
    if (!hasInitiallyFramed.current && nodes.length > 0) {
      let count = 0;
      for (const n of nodes) {
        if (positionsRef.current.has(n.id)) count++;
      }
      if (count > 0) {
        applyBoundingSphereFraming();
        hasInitiallyFramed.current = true;
      }
    }
  }, [nodes, positionsRef, applyBoundingSphereFraming]);

  // Focus on selected node (search-to-fly or direct selection)
  useEffect(() => {
    if (selectedNode) {
      const pos = positionsRef.current.get(selectedNode.id);
      if (pos) {
        targetLookAt.current = new THREE.Vector3(pos[0], pos[1], pos[2]);
        const dist = Math.max(35, getNodeSize(selectedNode) * 5.0);
        targetCamPos.current = new THREE.Vector3(pos[0], pos[1] + dist * 0.4, pos[2] + dist * 1.2);
      }
    }
  }, [selectedNode, positionsRef]);

  // Reset view & Frame all triggers
  useEffect(() => {
    if (resetViewTrigger > 0 || frameAllTrigger > 0) {
      applyBoundingSphereFraming();
    }
  }, [resetViewTrigger, frameAllTrigger, applyBoundingSphereFraming]);

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

// Free-fly camera controller (WASD + mouse look, Q/E up/down, hold Shift for speed boost)
function FreeFlyController({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree();
  const keysDown = useRef<Record<string, boolean>>({});
  const isMouseDown = useRef<boolean>(false);
  const prevMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    if (!enabled) return;
    euler.current.setFromQuaternion(camera.quaternion);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysDown.current[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 2) {
        isMouseDown.current = true;
        prevMouse.current = { x: e.clientX, y: e.clientY };
      }
    };
    const onMouseUp = () => {
      isMouseDown.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const dx = e.clientX - prevMouse.current.x;
      const dy = e.clientY - prevMouse.current.y;
      prevMouse.current = { x: e.clientX, y: e.clientY };

      euler.current.y -= dx * 0.003;
      euler.current.x = Math.max(-1.4, Math.min(1.4, euler.current.x - dy * 0.003));
      camera.quaternion.setFromEuler(euler.current);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    gl.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      gl.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [enabled, camera, gl]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const isShift = keysDown.current['shift'];
    const speed = (isShift ? 600 : 200) * delta;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    if (keysDown.current['w']) camera.position.addScaledVector(forward, speed);
    if (keysDown.current['s']) camera.position.addScaledVector(forward, -speed);
    if (keysDown.current['d']) camera.position.addScaledVector(right, speed);
    if (keysDown.current['a']) camera.position.addScaledVector(right, -speed);
    if (keysDown.current['e']) camera.position.y += speed;
    if (keysDown.current['q']) camera.position.y -= speed;
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

// Labels layer: shows titles adhering to policy (stars always, planets within proximity, category anchors, hovered/selected)
// with screen-space collision avoidance capped at 40 labels
function LabelsLayer({
  nodes,
  positionsRef,
  selectedNode,
  hoveredNode,
  hybridLayout,
}: {
  nodes: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  selectedNode: Node | null;
  hoveredNode: Node | null;
  hybridLayout: Record<string, HybridNodeLayout>;
}) {
  const { camera, size } = useThree();
  const [visibleLabels, setVisibleLabels] = useState<ScreenLabelCandidate[]>([]);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    // Project and check collision every 3 frames for smooth 60fps performance
    if (frameCount.current % 3 !== 0) return;

    const candidates: ScreenLabelCandidate[] = [];
    const camPos = camera.position;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = positionsRef.current.get(node.id);
      if (!pos) continue;

      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isStar = node.kind === 'project' && !node.is_generic_root;
      const isCat = node.kind === 'topic' && node.subkind === 'category';
      const isPlanet = node.kind === 'conversation' || node.kind === 'session';

      // Label Policy Check:
      // - Hovered / Selected: always
      // - Star: always
      // - Category anchor: always in nebula
      // - Planet: only when camera distance to parent star is < 280
      let eligible = isSelected || isHovered || isStar || isCat;

      if (!eligible && isPlanet) {
        const parentId = hybridLayout[node.id]?.orbit?.parent_id;
        if (parentId) {
          const starPos = positionsRef.current.get(parentId);
          if (starPos) {
            const distToStar = camPos.distanceTo(
              new THREE.Vector3(starPos[0], starPos[1], starPos[2])
            );
            if (distToStar < 280.0) {
              eligible = true;
            }
          }
        }
      }

      if (!eligible) continue;

      // Project 3D position into 2D NDC
      const v = new THREE.Vector3(pos[0], pos[1] + (isStar ? 12 : 6), pos[2]);
      const cameraDist = camPos.distanceTo(v);
      v.project(camera);

      // Must be in front of camera
      if (v.z < -1 || v.z > 1) continue;
      // Bounded within screen with 10% margin
      if (v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;

      const sx = (v.x * 0.5 + 0.5) * size.width;
      const sy = (-v.y * 0.5 + 0.5) * size.height;

      const width = Math.min(180, Math.max(60, node.title.length * 7 + 16));
      const height = 24;

      const priority =
        (isSelected ? 5000 : 0) +
        (isHovered ? 2500 : 0) +
        (isStar ? 400 : 0) +
        (isCat ? 200 : 0) +
        (isPlanet ? 100 : 0) +
        node.importance * 10;

      candidates.push({
        id: node.id,
        node,
        screenX: sx,
        screenY: sy,
        worldPos: pos,
        cameraDist,
        priority,
        width,
        height,
        isStar,
        isCategory: isCat,
        isPlanet,
      });
    }

    const accepted = selectVisibleLabels(candidates, 40);
    setVisibleLabels(accepted);
  });

  return (
    <group>
      {visibleLabels.map((cand) => {
        const { node, worldPos, cameraDist, isStar, isCategory: isCat } = cand;
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;

        // Smooth distance fade for star labels
        const opacity = isSelected || isHovered
          ? 1.0
          : isStar
          ? Math.max(0.35, Math.min(1.0, 1.25 - cameraDist / 1800))
          : 0.9;

        return (
          <Html
            key={`label-${node.id}`}
            position={[worldPos[0], worldPos[1] + (isStar ? 12 : 6), worldPos[2]]}
            center
            distanceFactor={750}
            occlude={false}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              fontSize: isSelected || isHovered ? '12px' : isStar ? '11px' : '9px',
              fontWeight: isStar ? 700 : 600,
              opacity,
              color: isSelected
                ? '#38bdf8'
                : isHovered
                ? '#f8fafc'
                : isStar
                ? '#e2e8f0'
                : isCat
                ? '#38bdf8'
                : '#94a3b8',
              backgroundColor: isSelected || isHovered
                ? 'rgba(15, 23, 42, 0.9)'
                : 'rgba(15, 23, 42, 0.65)',
              padding: '2px 7px',
              borderRadius: '5px',
              border: `1px solid ${
                isSelected
                  ? 'rgba(56, 189, 248, 0.6)'
                  : isHovered
                  ? 'rgba(248, 250, 252, 0.4)'
                  : 'rgba(148, 163, 184, 0.2)'
              }`,
              textShadow: '0 2px 4px rgba(0,0,0,0.9)',
              boxShadow: isSelected || isHovered ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none',
              letterSpacing: '0.02em',
            }}
          >
            {isCat ? `§ ${node.title}` : node.title}
          </Html>
        );
      })}
    </group>
  );
}

// Edges layer: hides skill-to-category and tag hairballs; renders cross-system edges as thin curved arcs
function EdgesLayer({
  edges,
  nodes,
  positionsRef,
  hoveredNode,
  selectedNode,
  currentMode,
}: {
  edges: Edge[];
  nodes: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  hoveredNode: Node | null;
  selectedNode: Node | null;
  currentMode: ViewMode;
}) {
  const nodesById = useMemo(() => {
    const map = new Map<string, Node>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const { normalLinesGeo, highlightLinesGeo } = useMemo(() => {
    const normalPts: number[] = [];
    const highlightPts: number[] = [];

    const activeId = hoveredNode?.id || selectedNode?.id;

    for (const edge of edges) {
      const style = evaluateEdgeStyle(
        edge,
        nodesById,
        hoveredNode?.id,
        selectedNode?.id,
        currentMode === 'hybrid'
      );

      if (style !== 'curved_arc') continue;

      const p1 = positionsRef.current.get(edge.from);
      const p2 = positionsRef.current.get(edge.to);
      if (!p1 || !p2) continue;

      const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
      const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
      const dist = v1.distanceTo(v2);

      const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
      const arcHeight = Math.min(60.0, dist * 0.22);
      mid.y += arcHeight;

      const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);
      const points = curve.getPoints(8);

      const isHighlight =
        activeId && (edge.from === activeId || edge.to === activeId);
      const targetPts = isHighlight ? highlightPts : normalPts;

      for (let j = 0; j < points.length - 1; j++) {
        targetPts.push(
          points[j].x, points[j].y, points[j].z,
          points[j + 1].x, points[j + 1].y, points[j + 1].z
        );
      }
    }

    const nGeo = new THREE.BufferGeometry();
    nGeo.setAttribute('position', new THREE.Float32BufferAttribute(normalPts, 3));

    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute('position', new THREE.Float32BufferAttribute(highlightPts, 3));

    return { normalLinesGeo: nGeo, highlightLinesGeo: hGeo };
  }, [edges, nodesById, positionsRef, hoveredNode, selectedNode, currentMode]);

  return (
    <group>
      {/* Subtle ambient cross-system curved arcs */}
      <lineSegments geometry={normalLinesGeo}>
        <lineBasicMaterial
          color="#818cf8"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Bright highlighted curved arcs for active hovered/selected node */}
      <lineSegments geometry={highlightLinesGeo}>
        <lineBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </group>
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
  resetViewTrigger,
  cameraControlMode,
  isOrbitAnimating,
  isOrbitRingsVisible,
  isStarGlowVisible,
  onDoubleClickNode,
  dimmedNodeIds,
  onClearIsolation,
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
        onPointerMissed={() => {
          onSelectNode(null);
          if (onClearIsolation) onClearIsolation();
        }}
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
          resetViewTrigger={resetViewTrigger}
          nodes={nodes}
        />

        <FreeFlyController enabled={cameraControlMode === 'fly'} />

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
          hybridLayout={hybridLayout}
        />

        <EdgesLayer
          edges={edges}
          nodes={nodes}
          positionsRef={positionsRef}
          hoveredNode={hoveredNode}
          selectedNode={selectedNode}
          currentMode={currentMode}
        />

        <OrbitControls
          enabled={cameraControlMode === 'orbit'}
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
