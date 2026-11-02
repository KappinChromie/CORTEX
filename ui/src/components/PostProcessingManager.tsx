import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

export type QualityLevel = 'low' | 'medium' | 'high';

interface PostProcessingManagerProps {
  quality: QualityLevel;
  onFrameStats?: (fps: number, frameTimeMs: number) => void;
}

export const PostProcessingManager: React.FC<PostProcessingManagerProps> = ({
  quality,
  onFrameStats,
}) => {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const vignettePassRef = useRef<ShaderPass | null>(null);

  // Frame timing accumulators
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const frameTimeSumRef = useRef<number>(0);

  useEffect(() => {
    if (quality === 'low') {
      composerRef.current = null;
      bloomPassRef.current = null;
      vignettePassRef.current = null;
      return;
    }

    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 1. Unreal Bloom Pass
    // Medium: Subtle bloom that preserves label crispness
    // High: Rich celestial glow
    const strength = quality === 'high' ? 0.95 : 0.55;
    const radius = quality === 'high' ? 0.55 : 0.35;
    const threshold = quality === 'high' ? 0.75 : 0.82;

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      strength,
      radius,
      threshold
    );
    composer.addPass(bloomPass);
    bloomPassRef.current = bloomPass;

    // 2. Subtle Vignette Pass on High quality
    if (quality === 'high') {
      const vignettePass = new ShaderPass(VignetteShader);
      vignettePass.uniforms['offset'].value = 1.15;
      vignettePass.uniforms['darkness'].value = 1.1;
      composer.addPass(vignettePass);
      vignettePassRef.current = vignettePass;
    }

    composerRef.current = composer;

    return () => {
      composer.dispose();
      composerRef.current = null;
    };
  }, [gl, scene, camera, size, quality]);

  // Keep composer size in sync with viewport resize
  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.setSize(size.width, size.height);
    }
  }, [size]);

  // Render loop with custom priority (1 = takes over canvas rendering)
  useFrame((_, delta) => {
    const now = performance.now();
    const frameTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    frameCountRef.current++;
    frameTimeSumRef.current += frameTime;

    if (frameCountRef.current >= 30) {
      const avgFrameTime = frameTimeSumRef.current / frameCountRef.current;
      const fps = Math.round(1000 / Math.max(1, avgFrameTime));
      onFrameStats?.(fps, avgFrameTime);
      frameCountRef.current = 0;
      frameTimeSumRef.current = 0;
    }

    if (quality !== 'low' && composerRef.current) {
      composerRef.current.render(delta);
    }
  }, quality === 'low' ? 0 : 1);

  return null;
};
