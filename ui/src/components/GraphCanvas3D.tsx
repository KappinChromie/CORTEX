import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Node, Edge, ViewMode, HybridNodeLayout } from '../types';
import {
  getNodeColor,
  getNodeSize,
  getStarColorProfile,
  computeStarColorProfiles,
  getProjectBasename,
} from '../utils/colors';
import { evaluateHybridPositions, generateOrbitRingsGeometry } from '../layouts/hybridLayout';
import {
  evaluateEdgeStyle,
  computeBoundingSphereFraming,
  selectVisibleLabels,
  computeStrongLinks,
  computeArcControlPoint,
  isEdgeGeometryValid,
  type ScreenLabelCandidate,
  type LinksMode,
} from '../utils/renderRules';
import { PostProcessingManager, type QualityLevel } from './PostProcessingManager';
import { PerformanceCollector, type PerformanceStats } from './PerformanceOverlay';

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
  linksMode?: LinksMode;
  quality: QualityLevel;
  onFrameStats?: (fps: number, frameTimeMs: number) => void;
  onPerformanceStats?: (stats: PerformanceStats) => void;
  totalNodesCount?: number;
  onDoubleClickNode?: (node: Node, shiftKey: boolean) => void;
  dimmedNodeIds?: Set<string>;
  onClearIsolation?: () => void;
}

// Camera controller that frames project stars and anchors centered and as large as possible
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

  const applyBoundingSphereFraming = useCallback((immediate: boolean = false) => {
    if (nodes.length === 0) return;
    const pts: [number, number, number][] = [];

    // Focus on project stars and anchors to keep systems centered and large
    for (const node of nodes) {
      if (node.kind === 'project' || (node.kind === 'topic' && node.subkind === 'category')) {
        const pos = positionsRef.current.get(node.id);
        if (pos) pts.push(pos);
      }
    }
    // Fallback to all nodes if no stars found
    if (pts.length === 0) {
      for (const node of nodes) {
        const pos = positionsRef.current.get(node.id);
        if (pos) pts.push(pos);
      }
    }
    if (pts.length === 0) return;

    const perspCam = camera as THREE.PerspectiveCamera;
    const framing = computeBoundingSphereFraming(pts, perspCam.fov || 50);
    if (framing) {
      targetLookAt.current = framing.center;
      targetCamPos.current = new THREE.Vector3(
        framing.center.x,
        framing.center.y + framing.distance * 0.32,
        framing.center.z + framing.distance * 0.88
      );

      if (immediate) {
        camera.position.copy(targetCamPos.current);
        camera.lookAt(targetLookAt.current);
        targetCamPos.current = null;
        targetLookAt.current = null;
      }
    }
  }, [nodes, positionsRef, camera]);

  // Initial camera framing on mount
  useEffect(() => {
    if (!hasInitiallyFramed.current && nodes.length > 0) {
      let count = 0;
      for (const n of nodes) {
        if (positionsRef.current.has(n.id)) count++;
      }
      if (count > 0) {
        if (!selectedNode) {
          applyBoundingSphereFraming(true);
        }
        hasInitiallyFramed.current = true;
      }
    }
  }, [nodes, positionsRef, applyBoundingSphereFraming, selectedNode]);

  // Focus on selected node
  useEffect(() => {
    if (selectedNode) {
      const pos = positionsRef.current.get(selectedNode.id);
      if (pos) {
        targetLookAt.current = new THREE.Vector3(pos[0], pos[1], pos[2]);
        let dist = 65;
        if (selectedNode.kind === 'project') {
          dist = Math.max(140, getNodeSize(selectedNode) * 10);
        } else if (selectedNode.kind === 'topic' && selectedNode.subkind === 'category') {
          dist = 240; // Frame skill nebula cloud
        } else if (selectedNode.kind === 'tool') {
          dist = 85;
        } else {
          dist = Math.max(50, getNodeSize(selectedNode) * 6.0);
        }
        targetCamPos.current = new THREE.Vector3(pos[0], pos[1] + dist * 0.35, pos[2] + dist * 0.95);
        camera.position.copy(targetCamPos.current);
        camera.lookAt(targetLookAt.current);
      }
    }
  }, [selectedNode, positionsRef, camera]);

  // Reset view & Frame all triggers
  useEffect(() => {
    if (resetViewTrigger > 0 || frameAllTrigger > 0) {
      applyBoundingSphereFraming(false);
    }
  }, [resetViewTrigger, frameAllTrigger, applyBoundingSphereFraming]);

  useFrame((_, delta) => {
    if (targetCamPos.current && targetLookAt.current) {
      const t = Math.min(1.0, delta * 6.0);
      camera.position.lerp(targetCamPos.current, t);
      camera.lookAt(targetLookAt.current);

      if (camera.position.distanceTo(targetCamPos.current) < 0.5) {
        targetCamPos.current = null;
        targetLookAt.current = null;
      }
    }
  });

  return null;
}

// First-person fly controls
function FreeFlyController({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const keys = useRef<{ [k: string]: boolean }>({});

  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const speed = 240 * delta;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const side = new THREE.Vector3().crossVectors(dir, camera.up).normalize();

    if (keys.current['w']) camera.position.addScaledVector(dir, speed);
    if (keys.current['s']) camera.position.addScaledVector(dir, -speed);
    if (keys.current['a']) camera.position.addScaledVector(side, -speed);
    if (keys.current['d']) camera.position.addScaledVector(side, speed);
    if (keys.current['q'] || keys.current['e']) {
      camera.position.y += (keys.current['e'] ? 1 : -1) * speed;
    }
  });

  return null;
}

// Instanced Spheres Layer for Planets, Moons, Category Anchors, and Personas
// (Stars are rendered exclusively via StarGlowLayer as emissive luminous bodies)
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
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 24, 24), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Exclude tools, skills, and project stars (stars are handled by StarGlowLayer)
  const sphereNodes = useMemo(
    () => nodes.filter((n) => n.kind !== 'tool' && n.kind !== 'skill' && n.kind !== 'project'),
    [nodes]
  );

  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (!meshRef.current || sphereNodes.length === 0) return;
    const mesh = meshRef.current;
    mesh.count = sphereNodes.length;

    for (let i = 0; i < sphereNodes.length; i++) {
      const node = sphereNodes[i];
      const pos = positionsRef.current.get(node.id) || [0, 0, 0];
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isDimmed = dimmedNodeIds && dimmedNodeIds.size > 0 && !dimmedNodeIds.has(node.id);

      const baseRadius = getNodeSize(node);
      const scaleMult = isSelected ? 1.55 : isHovered ? 1.25 : 1.0;
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
        tempColor.offsetHSL(0, 0, 0.25);
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
      args={[sphereGeo, undefined, Math.max(1, sphereNodes.length)]}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < sphereNodes.length) {
          onSelectNode(sphereNodes[e.instanceId]);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < sphereNodes.length && onDoubleClickNode) {
          onDoubleClickNode(sphereNodes[e.instanceId], e.shiftKey);
        }
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < sphereNodes.length) {
          document.body.style.cursor = 'pointer';
          onHoverNode(sphereNodes[e.instanceId]);
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
        onHoverNode(null);
      }}
    >
      <meshStandardMaterial roughness={0.35} metalness={0.25} toneMapped={false} />
    </instancedMesh>
  );
}

// Technical station torus for Tool nodes rotating slowly
function ToolHubsLayer({
  tools,
  positionsRef,
  selectedNode,
  hoveredNode,
  onSelectNode,
  onHoverNode,
  dimmedNodeIds,
}: {
  tools: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  selectedNode: Node | null;
  hoveredNode: Node | null;
  onSelectNode: (node: Node | null) => void;
  onHoverNode: (node: Node | null) => void;
  dimmedNodeIds?: Set<string>;
}) {
  const torusGeo = useMemo(() => new THREE.TorusGeometry(1, 0.32, 12, 28), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!meshRef.current || tools.length === 0) return;
    const mesh = meshRef.current;
    mesh.count = tools.length;
    const time = state.clock.getElapsedTime();

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      const pos = positionsRef.current.get(tool.id) || [0, 0, 0];
      const isSelected = selectedNode?.id === tool.id;
      const isHovered = hoveredNode?.id === tool.id;
      const isDimmed = dimmedNodeIds && dimmedNodeIds.size > 0 && !dimmedNodeIds.has(tool.id);

      const baseRadius = getNodeSize(tool);
      const scaleMult = isSelected ? 1.6 : isHovered ? 1.3 : 1.0;
      const radius = (isDimmed ? baseRadius * 0.75 : baseRadius * scaleMult) * 0.9;

      tempPos.set(pos[0], pos[1], pos[2]);
      tempScale.set(radius, radius, radius);

      tempQuat.setFromEuler(new THREE.Euler(0.4, time * 0.6 + i * 0.2, time * 0.3 + i * 0.1));
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      mesh.setMatrixAt(i, tempMatrix);

      tempColor.set('#06b6d4');
      if (isDimmed) {
        tempColor.lerp(new THREE.Color('#1e293b'), 0.85);
      } else if (isSelected) {
        tempColor.set('#38bdf8');
      } else if (isHovered) {
        tempColor.set('#67e8f9');
      }
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  if (tools.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[torusGeo, undefined, Math.max(1, tools.length)]}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < tools.length) {
          onSelectNode(tools[e.instanceId]);
        }
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined && e.instanceId < tools.length) {
          document.body.style.cursor = 'pointer';
          onHoverNode(tools[e.instanceId]);
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
        onHoverNode(null);
      }}
    >
      <meshStandardMaterial
        roughness={0.25}
        metalness={0.7}
        emissive="#0891b2"
        emissiveIntensity={0.25}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

// Skill nebula: glowing particle dust clouds per category anchor
function SkillNebulaLayer({
  skills,
  positionsRef,
}: {
  skills: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
}) {
  const pointsGeo = useMemo(() => {
    const pts: number[] = [];
    const colors: number[] = [];

    const palette = [
      new THREE.Color('#818cf8'),
      new THREE.Color('#6366f1'),
      new THREE.Color('#a855f7'),
      new THREE.Color('#38bdf8'),
    ];

    for (let idx = 0; idx < skills.length; idx++) {
      const skill = skills[idx];
      const pos = positionsRef.current.get(skill.id) || [0, 0, 0];
      const baseCol = palette[idx % palette.length];

      // Center anchor particle
      pts.push(pos[0], pos[1], pos[2]);
      colors.push(baseCol.r, baseCol.g, baseCol.b);

      // Surrounding volumetric micro-particles for glowing cloud appearance
      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2 + (idx * 0.5);
        const r = 10.0 + ((idx * 7 + j * 13) % 15);
        const dx = Math.cos(angle) * r;
        const dy = Math.sin(angle * 1.5) * (r * 0.4);
        const dz = Math.sin(angle) * r;

        pts.push(pos[0] + dx, pos[1] + dy, pos[2] + dz);
        const c = baseCol.clone().offsetHSL(0, 0, 0.1);
        colors.push(c.r, c.g, c.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [skills, positionsRef]);

  const particleTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.25, 'rgba(199, 210, 254, 0.85)');
      grad.addColorStop(0.65, 'rgba(99, 102, 241, 0.3)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  if (skills.length === 0) return null;

  return (
    <points geometry={pointsGeo}>
      <pointsMaterial
        size={26}
        sizeAttenuation
        map={particleTexture}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexColors
      />
    </points>
  );
}

// Star luminous cores and glowing pulsating coronas with relative percentile color temperature
// (Unified rendering: eliminates duplicate standard sphere and inner white artifact)
function StarGlowLayer({
  nodes,
  positionsRef,
  isStarGlowVisible,
  onSelectNode,
  onHoverNode,
}: {
  nodes: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  isStarGlowVisible: boolean;
  onSelectNode: (node: Node | null) => void;
  onHoverNode: (node: Node | null) => void;
}) {
  const coronaGeo = useMemo(() => new THREE.SphereGeometry(1, 28, 28), []);
  const coreGeo = useMemo(() => new THREE.SphereGeometry(1, 28, 28), []);
  const starNodes = useMemo(() => nodes.filter((n) => n.kind === 'project'), [nodes]);

  // Compute relative activity temperature percentile profiles for all stars
  const profilesMap = useMemo(() => computeStarColorProfiles(starNodes), [starNodes]);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();
    const pulse = 1.0 + Math.sin(time * 1.6) * 0.08;
    const children = groupRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as THREE.Group;
      const baseScale = child.userData.baseScale || 1.0;
      const s = baseScale * pulse;
      if (child.children[0]) {
        child.children[0].scale.set(s, s, s);
      }
    }
  });

  if (!isStarGlowVisible) return null;

  return (
    <group ref={groupRef}>
      {starNodes.map((star) => {
        const pos = positionsRef.current.get(star.id) || [0, 0, 0];
        const profile = getStarColorProfile(star, profilesMap);
        const baseSize = getNodeSize(star);
        const coronaScale = baseSize * (star.is_generic_root ? 1.5 : 2.2);

        return (
          <group
            key={`star-system-${star.id}`}
            position={[pos[0], pos[1], pos[2]]}
            userData={{ baseScale: coronaScale }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(star);
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
              onHoverNode(star);
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'default';
              onHoverNode(null);
            }}
          >
            {/* Outer pulsating corona halo */}
            <mesh geometry={coronaGeo} scale={[coronaScale, coronaScale, coronaScale]}>
              <meshBasicMaterial
                color={profile.coronaColor}
                transparent
                opacity={star.is_generic_root ? 0.14 : 0.35}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            {/* Central luminous stellar core (clean single surface without nested white mark) */}
            <mesh geometry={coreGeo} scale={[baseSize, baseSize, baseSize]}>
              <meshBasicMaterial color={profile.coreColor} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// Selection and Hover highlight rings
function SelectionRingLayer({
  selectedNode,
  hoveredNode,
  positionsRef,
}: {
  selectedNode: Node | null;
  hoveredNode: Node | null;
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
}) {
  const ringGeo = useMemo(() => new THREE.RingGeometry(1.2, 1.45, 32), []);
  const selectMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );
  const hoverMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#f8fafc',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  const selectMeshRef = useRef<THREE.Mesh>(null);
  const hoverMeshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (selectMeshRef.current && selectedNode) {
      const pos = positionsRef.current.get(selectedNode.id);
      if (pos) {
        selectMeshRef.current.position.set(pos[0], pos[1], pos[2]);
        const size = getNodeSize(selectedNode) * (1.6 + Math.sin(time * 3.0) * 0.08);
        selectMeshRef.current.scale.set(size, size, size);
        selectMeshRef.current.lookAt(camera.position);
      }
    }

    if (hoverMeshRef.current && hoveredNode && hoveredNode.id !== selectedNode?.id) {
      const pos = positionsRef.current.get(hoveredNode.id);
      if (pos) {
        hoverMeshRef.current.position.set(pos[0], pos[1], pos[2]);
        const size = getNodeSize(hoveredNode) * (1.45 + Math.sin(time * 4.0) * 0.06);
        hoverMeshRef.current.scale.set(size, size, size);
        hoverMeshRef.current.lookAt(camera.position);
      }
    }
  });

  return (
    <group>
      {selectedNode && (
        <mesh ref={selectMeshRef} geometry={ringGeo} material={selectMat} />
      )}
      {hoveredNode && hoveredNode.id !== selectedNode?.id && (
        <mesh ref={hoverMeshRef} geometry={ringGeo} material={hoverMat} />
      )}
    </group>
  );
}

// Orbit rings layer: concentric planetary paths, clear and luminous near camera
function OrbitRingsLayer({
  nodes,
  hybridLayout,
  positionsRef,
  isOrbitRingsVisible,
  currentMode,
  hoveredNode,
  selectedNode,
}: {
  nodes: Node[];
  hybridLayout: Record<string, HybridNodeLayout>;
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  isOrbitRingsVisible: boolean;
  currentMode: ViewMode;
  hoveredNode: Node | null;
  selectedNode: Node | null;
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

  const isSystemActive = useMemo(() => {
    const active = hoveredNode || selectedNode;
    if (!active) return false;
    if (active.kind === 'project') return true;
    return !!hybridLayout[active.id]?.orbit?.parent_id;
  }, [hoveredNode, selectedNode, hybridLayout]);

  if (!isOrbitRingsVisible || currentMode !== 'hybrid') return null;

  return (
    <lineSegments geometry={lineGeo}>
      <lineBasicMaterial
        color="#818cf8"
        transparent
        opacity={isSystemActive ? 0.75 : 0.32}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

// Legible Labels Layer adhering to policy:
// - Min 12px font size with dark translucent backing
// - Human-readable project basenames
// - "Unaffiliated (home folder)" for generic roots
// - Clean category count suffixes
// - Up to 25 labels at default overview with collision avoidance
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
    if (frameCount.current % 3 !== 0) return;

    const candidates: ScreenLabelCandidate[] = [];
    const camPos = camera.position;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const pos = positionsRef.current.get(node.id);
      if (!pos) continue;

      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isStar = node.kind === 'project';
      const isCat = node.kind === 'topic' && node.subkind === 'category';
      const isPlanet = node.kind === 'conversation' || node.kind === 'session';
      const isMoon = node.kind === 'artifact' || node.kind === 'task' || node.kind === 'memory';

      // Label Policy:
      // - Hovered / Selected: always
      // - Stars: always
      // - Category anchor: always
      // - Planet: when camera is within 260 units of parent star
      // - Moons: ONLY on hover or select
      let eligible = isSelected || isHovered || isStar || isCat;

      if (!eligible && isPlanet) {
        const parentId = hybridLayout[node.id]?.orbit?.parent_id;
        if (parentId) {
          const starPos = positionsRef.current.get(parentId);
          if (starPos) {
            const distToStar = camPos.distanceTo(
              new THREE.Vector3(starPos[0], starPos[1], starPos[2])
            );
            if (distToStar < 260.0) {
              eligible = true;
            }
          }
        }
      }

      if (!eligible || (isMoon && !isSelected && !isHovered)) continue;

      const v = new THREE.Vector3(pos[0], pos[1] + (isStar ? 12 : 6), pos[2]);
      const cameraDist = camPos.distanceTo(v);
      v.project(camera);

      if (v.z < -1 || v.z > 1) continue;
      if (v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;

      const sx = (v.x * 0.5 + 0.5) * size.width;
      const sy = (-v.y * 0.5 + 0.5) * size.height;

      // Suppress labels behind top header/filter bar (top 100px) or side panel
      if (sy < 100 || sy > size.height - 40 || sx < 30 || sx > size.width - 30) continue;
      if (selectedNode && sx > size.width - 400) continue;

      const titleLen = (node.title || '').length;
      const width = Math.min(220, Math.max(80, titleLen * 8 + 24));
      const height = 28;

      const priority =
        (isSelected ? 5000 : 0) +
        (isHovered ? 2500 : 0) +
        (isStar ? 500 : 0) +
        (isCat ? 300 : 0) +
        (isPlanet ? 150 : 0) +
        node.importance * 100 +
        node.degree * 5;

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

    // Cap at 25 visible labels at overview with collision avoidance
    const accepted = selectVisibleLabels(candidates, 25);
    setVisibleLabels(accepted);
  });

  return (
    <group>
      {visibleLabels.map((cand) => {
        const { node, worldPos, cameraDist, isStar, isCategory: isCat } = cand;
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;

        const opacity = isSelected || isHovered
          ? 1.0
          : isStar
          ? Math.max(0.45, Math.min(1.0, 1.25 - cameraDist / 2000))
          : 0.92;

        let displayText = node.title;
        let countSuffix = '';

        if (node.kind === 'project') {
          if (node.is_generic_root) {
            displayText = 'Unaffiliated (home folder)';
          } else {
            displayText = getProjectBasename(node.title, node.path);
          }
        } else if (node.kind === 'topic' && node.subkind === 'category') {
          const match = node.title.match(/^(\d+)\s+(.*)$/);
          if (match) {
            displayText = match[2];
            countSuffix = ` (${match[1]})`;
          } else {
            displayText = node.title;
            if (node.degree > 0) {
              countSuffix = ` (${node.degree})`;
            }
          }
        }

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
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              fontSize: isSelected || isHovered ? '13px' : isStar ? '13px' : '12px',
              fontWeight: isStar ? 700 : 600,
              opacity,
              color: isSelected
                ? '#38bdf8'
                : isHovered
                ? '#f8fafc'
                : isStar
                ? '#f1f5f9'
                : isCat
                ? '#38bdf8'
                : '#94a3b8',
              backgroundColor: isSelected || isHovered
                ? 'rgba(15, 23, 42, 0.95)'
                : 'rgba(15, 23, 42, 0.85)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: `1px solid ${
                isSelected
                  ? 'rgba(56, 189, 248, 0.7)'
                  : isHovered
                  ? 'rgba(248, 250, 252, 0.5)'
                  : 'rgba(148, 163, 184, 0.25)'
              }`,
              textShadow: '0 1px 3px rgba(0,0,0,0.95)',
              boxShadow: isSelected || isHovered ? '0 0 12px rgba(56, 189, 248, 0.35)' : '0 2px 6px rgba(0,0,0,0.5)',
              letterSpacing: '0.02em',
            }}
          >
            <span>{isCat ? `§ ${displayText}` : displayText}</span>
            {countSuffix && (
              <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 4 }}>
                {countSuffix}
              </span>
            )}
          </Html>
        );
      })}
    </group>
  );
}

// Edges Layer: Real-time animated arcs pinned to moving planets each frame
// Supports LinksMode: Off / Strong (top 30 links, tool hubs hidden) / All (up to 400 links)
function EdgesLayer({
  edges,
  nodes,
  positionsRef,
  hoveredNode,
  selectedNode,
  currentMode,
  linksMode = 'strong',
}: {
  edges: Edge[];
  nodes: Node[];
  positionsRef: React.MutableRefObject<Map<string, [number, number, number]>>;
  hoveredNode: Node | null;
  selectedNode: Node | null;
  currentMode: ViewMode;
  linksMode?: LinksMode;
}) {
  const nodesById = useMemo(() => {
    const map = new Map<string, Node>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  // Compute top 30 strong links
  const strongLinksSet = useMemo(() => {
    return computeStrongLinks(edges, nodesById, 30);
  }, [edges, nodesById]);

  // Fixed pre-allocated geometries for fluid 60fps updates without garbage collection
  const normalGeoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());
  const faintGeoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());
  const highlightGeoRef = useRef<THREE.BufferGeometry>(new THREE.BufferGeometry());

  // Buffer capacity: up to 400 arcs * 16 vertices * 3 coords = 19,200 floats
  const normalBuffer = useMemo(() => new Float32Array(400 * 16 * 3), []);
  const faintBuffer = useMemo(() => new Float32Array(400 * 16 * 3), []);
  const highlightBuffer = useMemo(() => new Float32Array(100 * 16 * 3), []);

  useEffect(() => {
    normalGeoRef.current.setAttribute(
      'position',
      new THREE.BufferAttribute(normalBuffer, 3).setUsage(THREE.DynamicDrawUsage)
    );
    faintGeoRef.current.setAttribute(
      'position',
      new THREE.BufferAttribute(faintBuffer, 3).setUsage(THREE.DynamicDrawUsage)
    );
    highlightGeoRef.current.setAttribute(
      'position',
      new THREE.BufferAttribute(highlightBuffer, 3).setUsage(THREE.DynamicDrawUsage)
    );
  }, [normalBuffer, faintBuffer, highlightBuffer]);

  useFrame(() => {
    const activeId = hoveredNode?.id || selectedNode?.id;
    let normalIdx = 0;
    let faintIdx = 0;
    let highlightIdx = 0;
    let visibleCount = 0;
    const maxVisibleArcs = linksMode === 'all' ? 400 : 30;

    for (let i = 0; i < edges.length; i++) {
      if (visibleCount >= maxVisibleArcs && !activeId) break;

      const edge = edges[i];
      const isTopStrong = strongLinksSet.has(i);

      const style = evaluateEdgeStyle(
        edge,
        nodesById,
        hoveredNode?.id,
        selectedNode?.id,
        currentMode === 'hybrid',
        linksMode,
        isTopStrong
      );

      if (style !== 'curved_arc') continue;

      // Current live positions each frame
      const p1 = positionsRef.current.get(edge.from);
      const p2 = positionsRef.current.get(edge.to);
      if (!p1 || !p2) continue;

      // Sanitize: verify finite and within 2500 unit galaxy bounds
      if (!isEdgeGeometryValid(p1, p2, 2500)) continue;

      const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
      const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
      const chordLen = v1.distanceTo(v2);
      const isFarApart = chordLen > 1100.0;

      // Compute deterministic outward control point
      const ctrl = computeArcControlPoint(v1, v2, edge.from, edge.to);

      const isHighlight =
        activeId && (edge.from === activeId || edge.to === activeId);

      // Generate 8 segments along quadratic bezier
      let prevX = v1.x;
      let prevY = v1.y;
      let prevZ = v1.z;

      for (let s = 1; s <= 8; s++) {
        const t = s / 8;
        const mt = 1 - t;
        const curX = mt * mt * v1.x + 2 * mt * t * ctrl.x + t * t * v2.x;
        const curY = mt * mt * v1.y + 2 * mt * t * ctrl.y + t * t * v2.y;
        const curZ = mt * mt * v1.z + 2 * mt * t * ctrl.z + t * t * v2.z;

        if (isHighlight && highlightIdx + 6 <= highlightBuffer.length) {
          highlightBuffer[highlightIdx++] = prevX;
          highlightBuffer[highlightIdx++] = prevY;
          highlightBuffer[highlightIdx++] = prevZ;
          highlightBuffer[highlightIdx++] = curX;
          highlightBuffer[highlightIdx++] = curY;
          highlightBuffer[highlightIdx++] = curZ;
        } else if (!isHighlight && isFarApart && faintIdx + 6 <= faintBuffer.length) {
          faintBuffer[faintIdx++] = prevX;
          faintBuffer[faintIdx++] = prevY;
          faintBuffer[faintIdx++] = prevZ;
          faintBuffer[faintIdx++] = curX;
          faintBuffer[faintIdx++] = curY;
          faintBuffer[faintIdx++] = curZ;
        } else if (!isHighlight && !isFarApart && normalIdx + 6 <= normalBuffer.length) {
          normalBuffer[normalIdx++] = prevX;
          normalBuffer[normalIdx++] = prevY;
          normalBuffer[normalIdx++] = prevZ;
          normalBuffer[normalIdx++] = curX;
          normalBuffer[normalIdx++] = curY;
          normalBuffer[normalIdx++] = curZ;
        }

        prevX = curX;
        prevY = curY;
        prevZ = curZ;
      }

      visibleCount++;
    }

    // Update draw ranges
    normalGeoRef.current.setDrawRange(0, normalIdx / 3);
    const normAttr = normalGeoRef.current.getAttribute('position') as THREE.BufferAttribute;
    if (normAttr) normAttr.needsUpdate = true;

    faintGeoRef.current.setDrawRange(0, faintIdx / 3);
    const faintAttr = faintGeoRef.current.getAttribute('position') as THREE.BufferAttribute;
    if (faintAttr) faintAttr.needsUpdate = true;

    highlightGeoRef.current.setDrawRange(0, highlightIdx / 3);
    const hlAttr = highlightGeoRef.current.getAttribute('position') as THREE.BufferAttribute;
    if (hlAttr) hlAttr.needsUpdate = true;
  });

  return (
    <group>
      {/* Thin subtle ambient cross-system links */}
      <lineSegments geometry={normalGeoRef.current}>
        <lineBasicMaterial
          color="#818cf8"
          transparent
          opacity={0.11}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Very faint, gently curved lines for far-apart cross-galaxy connections in Links: All mode */}
      <lineSegments geometry={faintGeoRef.current}>
        <lineBasicMaterial
          color="#818cf8"
          transparent
          opacity={0.038}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Bright highlighted links for active hovered or selected node */}
      <lineSegments geometry={highlightGeoRef.current}>
        <lineBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.88}
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
  linksMode = 'strong',
  quality,
  onFrameStats,
  onPerformanceStats,
  totalNodesCount,
  onDoubleClickNode,
  dimmedNodeIds,
  onClearIsolation,
}) => {
  const [, setMousePos] = useState({ x: 0, y: 0 });

  const toolNodes = useMemo(() => nodes.filter((n) => n.kind === 'tool'), [nodes]);
  const skillNodes = useMemo(() => nodes.filter((n) => n.kind === 'skill'), [nodes]);

  const positionsRef = useRef<Map<string, [number, number, number]>>(new Map());
  const simTime = useRef<number>(0);

  const isTransitioning = useRef<boolean>(false);
  const transitionStart = useRef<number>(0);
  const fromPositions = useRef<Map<string, [number, number, number]>>(new Map());

  const prevMode = useRef<ViewMode>(currentMode);
  useEffect(() => {
    if (prevMode.current !== currentMode) {
      isTransitioning.current = true;
      transitionStart.current = performance.now();
      fromPositions.current = new Map(positionsRef.current);
      prevMode.current = currentMode;
    }
  }, [currentMode]);

  const updatePositions = (delta: number) => {
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
        transitionFactor = elapsed * elapsed * (3 - 2 * elapsed);
      }
    }

    if (currentMode === 'hybrid') {
      const currentSimTime = simTime.current;
      const hybridPos = evaluateHybridPositions(nodes, hybridLayout, currentSimTime);
      for (const [id, pos] of hybridPos.entries()) {
        positionsRef.current.set(id, pos);
      }

      if (isTransitioning.current) {
        for (const [id, toPos] of positionsRef.current.entries()) {
          const fromPos = fromPositions.current.get(id);
          if (fromPos) {
            positionsRef.current.set(id, [
              fromPos[0] + (toPos[0] - fromPos[0]) * transitionFactor,
              fromPos[1] + (toPos[1] - fromPos[1]) * transitionFactor,
              fromPos[2] + (toPos[2] - fromPos[2]) * transitionFactor,
            ]);
          }
        }
      }
    } else {
      for (const node of nodes) {
        const toPos = webPositions.get(node.id) || [0, 0, 0];
        if (isTransitioning.current) {
          const fromPos = fromPositions.current.get(node.id);
          if (fromPos) {
            positionsRef.current.set(node.id, [
              fromPos[0] + (toPos[0] - fromPos[0]) * transitionFactor,
              fromPos[1] + (toPos[1] - fromPos[1]) * transitionFactor,
              fromPos[2] + (toPos[2] - fromPos[2]) * transitionFactor,
            ]);
          } else {
            positionsRef.current.set(node.id, toPos);
          }
        } else {
          positionsRef.current.set(node.id, toPos);
        }
      }
    }
  };

  const SceneUpdater = () => {
    useFrame((_, delta) => {
      updatePositions(delta);
    });
    return null;
  };

  return (
    <div
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <Canvas
        camera={{ position: [0, 220, 950], fov: 50, near: 0.1, far: 10000 }}
        onPointerMissed={() => {
          onSelectNode(null);
          if (onClearIsolation) onClearIsolation();
        }}
      >
        <fogExp2 attach="fog" args={['#030712', 0.00032]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[200, 400, 300]} intensity={0.75} />
        <pointLight position={[0, 0, 0]} intensity={1.4} distance={2500} decay={1.5} />

        {/* Deep starfield layers */}
        <Stars
          radius={2000}
          depth={300}
          count={3500}
          factor={4}
          saturation={0.5}
          fade
          speed={0.3}
        />
        <Stars
          radius={900}
          depth={150}
          count={1200}
          factor={6}
          saturation={0.7}
          fade
          speed={0.7}
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

        {/* Selection & Hover Highlight Rings */}
        <SelectionRingLayer
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          positionsRef={positionsRef}
        />

        {/* Planets, Moons, Category Anchors, Persona Spheres */}
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

        {/* Tool Hubs: Rotating technical toruses */}
        <ToolHubsLayer
          tools={toolNodes}
          positionsRef={positionsRef}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          onSelectNode={onSelectNode}
          onHoverNode={onHoverNode}
          dimmedNodeIds={dimmedNodeIds}
        />

        {/* Skill Nebula: Volumetric glowing dust clouds */}
        <SkillNebulaLayer
          skills={skillNodes}
          positionsRef={positionsRef}
        />

        {/* Stars Layer: Self-luminous cores with color temperature & corona halos */}
        <StarGlowLayer
          nodes={nodes}
          positionsRef={positionsRef}
          isStarGlowVisible={isStarGlowVisible}
          onSelectNode={onSelectNode}
          onHoverNode={onHoverNode}
        />

        {/* Orbit Rings: Concentric planetary paths */}
        <OrbitRingsLayer
          nodes={nodes}
          hybridLayout={hybridLayout}
          positionsRef={positionsRef}
          isOrbitRingsVisible={isOrbitRingsVisible}
          currentMode={currentMode}
          hoveredNode={hoveredNode}
          selectedNode={selectedNode}
        />

        {/* Links Layer: Real-time animated arcs pinned to planets */}
        <EdgesLayer
          edges={edges}
          nodes={nodes}
          positionsRef={positionsRef}
          hoveredNode={hoveredNode}
          selectedNode={selectedNode}
          currentMode={currentMode}
          linksMode={linksMode}
        />

        {/* Labels Layer: Human-readable project basenames, 12px min, collision avoided */}
        <LabelsLayer
          nodes={nodes}
          positionsRef={positionsRef}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          hybridLayout={hybridLayout}
        />

        {cameraControlMode === 'orbit' && (
          <OrbitControls
            enableDamping
            dampingFactor={0.06}
            rotateSpeed={0.55}
            zoomSpeed={0.8}
            minDistance={20}
            maxDistance={3500}
          />
        )}

        <PostProcessingManager quality={quality} onFrameStats={onFrameStats} />
        <PerformanceCollector
          onStats={onPerformanceStats || (() => {})}
          visibleNodesCount={nodes.length}
          totalNodesCount={totalNodesCount || nodes.length}
          quality={quality}
        />
      </Canvas>
    </div>
  );
};
