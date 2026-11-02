import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { QualityLevel } from './PostProcessingManager';
import { Activity, X } from 'lucide-react';

export interface PerformanceStats {
  fps: number;
  avgFrameTimeMs: number;
  p95FrameTimeMs: number;
  minFrameTimeMs: number;
  maxFrameTimeMs: number;
  drawCalls: number;
  triangles: number;
  points: number;
  visibleNodes: number;
  totalNodes: number;
  quality: QualityLevel;
}

// In-canvas metrics collector hook/component
export const PerformanceCollector: React.FC<{
  onStats: (stats: PerformanceStats) => void;
  visibleNodesCount: number;
  totalNodesCount: number;
  quality: QualityLevel;
}> = ({ onStats, visibleNodesCount, totalNodesCount, quality }) => {
  const { gl } = useThree();
  const frameTimes = useRef<number[]>([]);
  const lastSampleTime = useRef(performance.now());

  useFrame((_, delta) => {
    if (!(window as any).__cortexGpu) {
      try {
        const ctx = gl.getContext();
        const ext = ctx.getExtension('WEBGL_debug_renderer_info');
        const renderer = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
        const vendor = ext ? ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ctx.getParameter(ctx.VENDOR);
        (window as any).__cortexGpu = `${vendor} - ${renderer}`;
      } catch (e) {
        (window as any).__cortexGpu = 'WebGL Default';
      }
    }

    const ms = delta * 1000.0;
    frameTimes.current.push(ms);
    if (frameTimes.current.length > 120) {
      frameTimes.current.shift();
    }

    const now = performance.now();
    // Update stats every 100ms
    if (now - lastSampleTime.current >= 100 && frameTimes.current.length > 5) {
      lastSampleTime.current = now;

      const samples = [...frameTimes.current].sort((a, b) => a - b);
      const sum = samples.reduce((acc, v) => acc + v, 0);
      const avg = sum / samples.length;
      const p95Idx = Math.floor(samples.length * 0.95);
      const p95 = samples[p95Idx] || avg;
      const min = samples[0] || avg;
      const max = samples[samples.length - 1] || avg;
      const fps = avg > 0 ? Math.round(1000.0 / avg) : 60;

      const stats: PerformanceStats = {
        fps,
        avgFrameTimeMs: parseFloat(avg.toFixed(2)),
        p95FrameTimeMs: parseFloat(p95.toFixed(2)),
        minFrameTimeMs: parseFloat(min.toFixed(2)),
        maxFrameTimeMs: parseFloat(max.toFixed(2)),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        points: gl.info.render.points,
        visibleNodes: visibleNodesCount,
        totalNodes: totalNodesCount,
        quality,
      };

      onStats(stats);
      (window as any).__cortexPerf = stats;
    }
  });

  return null;
};

interface PerformanceOverlayProps {
  stats: PerformanceStats | null;
  isOpen: boolean;
  onClose: () => void;
  quality: QualityLevel;
  onSetQuality: (q: QualityLevel) => void;
  isSynthetic: boolean;
  onToggleSynthetic: (synthetic: boolean) => void;
}

export const PerformanceOverlay: React.FC<PerformanceOverlayProps> = ({
  stats,
  isOpen,
  onClose,
  quality,
  onSetQuality,
  isSynthetic,
  onToggleSynthetic,
}) => {
  if (!isOpen || !stats) return null;

  const fpsColor =
    stats.fps >= 55
      ? 'text-emerald-400'
      : stats.fps >= 30
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        right: 16,
        zIndex: 9999,
        minWidth: 280,
      }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-4 shadow-2xl text-slate-100 font-mono text-xs select-none"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2 font-bold text-sky-400">
          <Activity className="w-4 h-4 text-sky-400" />
          <span>GPU PERFORMANCE</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          title="Close overlay (` key)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">
            Frame Rate
          </span>
          <span className={`text-2xl font-black ${fpsColor}`}>
            {stats.fps}{' '}
            <span className="text-xs font-normal text-slate-500">FPS</span>
          </span>
        </div>

        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] uppercase text-slate-400 block mb-0.5">
            Avg Frame Time
          </span>
          <span className="text-2xl font-black text-slate-200">
            {stats.avgFrameTimeMs}{' '}
            <span className="text-xs font-normal text-slate-500">ms</span>
          </span>
        </div>
      </div>

      <div className="space-y-1.5 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 mb-3 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-400">p95 Frame Time:</span>
          <span className="font-semibold text-slate-200">{stats.p95FrameTimeMs} ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Min / Max:</span>
          <span className="text-slate-300">
            {stats.minFrameTimeMs} / {stats.maxFrameTimeMs} ms
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Draw Calls:</span>
          <span className="font-semibold text-sky-300">{stats.drawCalls}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Triangles:</span>
          <span className="text-slate-300">{stats.triangles.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Points (Nebula):</span>
          <span className="text-slate-300">{stats.points.toLocaleString()}</span>
        </div>
        <div className="flex justify-between border-t border-slate-800/80 pt-1 mt-1">
          <span className="text-slate-400">Nodes Visible:</span>
          <span className="font-semibold text-amber-300">
            {stats.visibleNodes} / {stats.totalNodes}
          </span>
        </div>
      </div>

      {/* Quality selector */}
      <div className="mb-3">
        <span className="text-[10px] uppercase text-slate-400 block mb-1">
          Visual Quality
        </span>
        <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          {(['low', 'medium', 'high'] as QualityLevel[]).map((q) => (
            <button
              key={q}
              onClick={() => onSetQuality(q)}
              className={`py-1 text-[10px] font-semibold uppercase rounded transition-colors ${
                quality === q
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Synthetic 10k Graph toggle */}
      <div className="pt-2 border-t border-slate-800/80">
        <button
          onClick={() => onToggleSynthetic(!isSynthetic)}
          className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            isSynthetic
              ? 'bg-amber-600/90 text-white hover:bg-amber-500'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
          }`}
        >
          <span>{isSynthetic ? '★ Synthetic 10k (Active)' : 'Load Synthetic 10k Graph'}</span>
        </button>
        <span className="text-[9px] text-slate-500 text-center block mt-1">
          Press ` (backtick) to hide overlay
        </span>
      </div>
    </div>
  );
};
