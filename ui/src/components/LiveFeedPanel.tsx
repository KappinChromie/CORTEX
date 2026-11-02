import React, { useState } from 'react';
import type { Event } from '../types';
import { Activity, ChevronDown, ChevronUp, Trash2, Zap, Radio } from 'lucide-react';

interface LiveFeedPanelProps {
  events: Event[];
  onSelectNode: (nodeId: string) => void;
  onClear: () => void;
  onEmitTestEvent?: () => void;
}

export const LiveFeedPanel: React.FC<LiveFeedPanelProps> = ({
  events,
  onSelectNode,
  onClear,
  onEmitTestEvent,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  const getEventBadgeColor = (kind: string) => {
    switch (kind.toLowerCase()) {
      case 'toolcalled':
      case 'tool_called':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'sessionstarted':
      case 'session_start':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'sessionended':
      case 'session_end':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'messagesent':
      case 'message_sent':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-sm w-full font-mono text-xs select-none pointer-events-auto">
      {/* Collapsed Trigger Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border border-slate-700/80 rounded-lg shadow-xl backdrop-blur-md cursor-pointer hover:border-cyan-500/50 transition-all"
      >
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
          </span>
          <span className="text-slate-200 font-semibold tracking-wider flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            LIVE FEED
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-cyan-300 border border-slate-700">
            {events.length}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Expanded Feed Container */}
      {isOpen && (
        <div className="mt-1 bg-slate-950/95 border border-slate-700/80 rounded-lg shadow-2xl backdrop-blur-lg overflow-hidden flex flex-col max-h-80">
          {/* Action Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-400">
            <span>Recent Activity ({events.length} events)</span>
            <div className="flex items-center space-x-2">
              {onEmitTestEvent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEmitTestEvent();
                  }}
                  title="Emit Simulated Live Event"
                  className="px-2 py-0.5 rounded bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-400 border border-cyan-800/50 flex items-center gap-1 transition-colors"
                >
                  <Zap className="w-3 h-3 text-cyan-300" /> Test Pulse
                </button>
              )}
              {events.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  title="Clear feed"
                  className="p-1 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Event List */}
          <div className="overflow-y-auto p-2 space-y-1.5 flex-1 divide-y divide-slate-800/40">
            {events.length === 0 ? (
              <div className="py-6 text-center text-slate-500 italic flex flex-col items-center gap-1">
                <Activity className="w-5 h-5 text-slate-600 opacity-60" />
                <span>Listening for agent activity...</span>
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => ev.node_id && onSelectNode(ev.node_id)}
                  className={`pt-1.5 first:pt-0 group flex flex-col gap-0.5 rounded px-1.5 py-1 transition-colors ${
                    ev.node_id
                      ? 'cursor-pointer hover:bg-slate-800/60'
                      : 'cursor-default opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold uppercase ${
                          ev.source_id === 'hermes'
                            ? 'bg-amber-950/40 text-amber-400 border-amber-800/50'
                            : 'bg-cyan-950/40 text-cyan-400 border-cyan-800/50'
                        }`}
                      >
                        {ev.source_id}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded border text-[9px] ${getEventBadgeColor(
                          ev.kind
                        )}`}
                      >
                        {ev.kind}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">{formatTime(ev.ts)}</span>
                  </div>

                  <p className="text-[11px] text-slate-300 group-hover:text-cyan-200 line-clamp-2 leading-relaxed">
                    {ev.detail}
                  </p>

                  {ev.node_id && (
                    <span className="text-[9px] text-slate-500 group-hover:text-cyan-400 truncate">
                      → {ev.node_id}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
