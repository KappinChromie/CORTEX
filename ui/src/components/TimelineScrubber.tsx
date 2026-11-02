import React, { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Eye, EyeOff, Sparkles, Clock } from 'lucide-react';
import type { ActivityHistogramBucket } from '../layouts/timelineLayout';

interface TimelineScrubberProps {
  minTime: number;
  maxTime: number;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number; // 1, 10, 100, 1000, 5000
  histogram: ActivityHistogramBucket[];
  hideAmbient: boolean;
  compressGaps: boolean;
  onTimeChange: (time: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onToggleHideAmbient: () => void;
  onToggleCompressGaps: () => void;
  onResetToStart: () => void;
}

const SPEEDS = [1, 10, 100, 1000, 5000];

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  minTime,
  maxTime,
  currentTime,
  isPlaying,
  playbackSpeed,
  histogram,
  hideAmbient,
  compressGaps,
  onTimeChange,
  onTogglePlay,
  onSpeedChange,
  onToggleHideAmbient,
  onToggleCompressGaps,
  onResetToStart,
}) => {
  const animRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());

  // Animation loop when playing
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    lastTickRef.current = performance.now();

    const loop = (now: number) => {
      const deltaSec = (now - lastTickRef.current) / 1000.0;
      lastTickRef.current = now;

      // 1 real second = playbackSpeed * (e.g. 1 hour = 3600s)
      const simDeltaMs = deltaSec * playbackSpeed * 60 * 1000;
      const nextTime = currentTime + simDeltaMs;

      if (nextTime >= maxTime) {
        onTimeChange(maxTime);
        onTogglePlay(); // pause at end
      } else {
        onTimeChange(nextTime);
        animRef.current = requestAnimationFrame(loop);
      }
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, playbackSpeed, currentTime, maxTime, onTimeChange, onTogglePlay]);

  const progressPercent = Math.max(
    0,
    Math.min(100, ((currentTime - minTime) / (maxTime - minTime || 1)) * 100)
  );

  const maxBucketCount = Math.max(1, ...histogram.map((b) => b.count));

  const formatDisplayDate = (t: number) => {
    try {
      const d = new Date(t);
      return `${d.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-4xl bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md px-4 py-2.5 font-mono select-none pointer-events-auto">
      {/* Top Header: Current Simulated Time & Options */}
      <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
        <div className="flex items-center space-x-2">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-cyan-300">{formatDisplayDate(currentTime)}</span>
          <span className="text-slate-500 text-[10px]">
            ({Math.round(progressPercent)}% elapsed)
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[11px]">
          {/* Hide Ambient Toggle */}
          <button
            onClick={onToggleHideAmbient}
            title="Toggle hiding ambient nodes (skills, tools) during replay"
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              hideAmbient
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-700/60'
                : 'bg-slate-800/60 text-slate-400 border-slate-700'
            }`}
          >
            {hideAmbient ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>Hide Ambient</span>
          </button>

          {/* Compress Idle Gaps Toggle */}
          <button
            onClick={onToggleCompressGaps}
            title="Compress long idle periods without activity"
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              compressGaps
                ? 'bg-purple-950/60 text-purple-300 border-purple-700/60'
                : 'bg-slate-800/60 text-slate-400 border-slate-700'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Compress Gaps</span>
          </button>
        </div>
      </div>

      {/* Histogram & Progress Slider Track */}
      <div className="relative w-full h-8 flex items-end bg-slate-950/60 rounded border border-slate-800 px-1 overflow-hidden group cursor-pointer">
        {/* Activity Histogram Bars */}
        <div className="absolute inset-0 flex items-end px-1 gap-[2px] opacity-40 pointer-events-none">
          {histogram.map((bucket, idx) => {
            const hPercent = (bucket.count / maxBucketCount) * 100;
            const isPassed = bucket.timestamp <= currentTime;
            return (
              <div
                key={idx}
                style={{ height: `${Math.max(12, hPercent)}%` }}
                className={`flex-1 min-w-[2px] rounded-t transition-colors ${
                  isPassed ? 'bg-cyan-400' : 'bg-slate-600'
                }`}
                title={`${bucket.dateStr}: ${bucket.count} items`}
              />
            );
          })}
        </div>

        {/* Progress Fill Bar */}
        <div
          className="absolute left-0 bottom-0 top-0 bg-cyan-500/15 pointer-events-none"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Scrubber Thumb / Needle */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-cyan-400 shadow-[0_0_8px_#38bdf8] pointer-events-none"
          style={{ left: `${progressPercent}%` }}
        />

        {/* Invisible Range Input for Interactive Scrubbing */}
        <input
          type="range"
          min={minTime}
          max={maxTime}
          step={60000} // 1 minute resolution
          value={currentTime}
          onChange={(e) => onTimeChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
        />
      </div>

      {/* Bottom Controls: Playback buttons & Speed selector */}
      <div className="flex items-center justify-between mt-2 pt-1">
        <div className="flex items-center space-x-2">
          {/* Reset to Start */}
          <button
            onClick={onResetToStart}
            title="Reset playback to earliest record"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            className={`flex items-center gap-1 px-3 py-1 rounded font-semibold text-xs transition-colors ${
              isPlaying
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Replay
              </>
            )}
          </button>
        </div>

        {/* Speed Selector */}
        <div className="flex items-center space-x-1 text-xs">
          <FastForward className="w-3.5 h-3.5 text-slate-500 mr-1" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                playbackSpeed === s
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
