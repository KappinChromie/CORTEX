import React, { useState } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Copy,
  Check,
  Shield,
  Folder,
  Radio,
  Sliders,
  Terminal,
} from 'lucide-react';
import type { QualityLevel } from './PostProcessingManager';

export interface AppSettings {
  scan_on_launch: boolean;
  enable_watchers: boolean;
  enable_hermes_hook: boolean;
  hermes_hook_port: number;
  hermes_hook_secret?: string;
  quality: QualityLevel;
  show_perf_overlay: boolean;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'hermes' | 'paths'>('general');

  if (!isOpen) return null;

  const hookSnippet = `hooks:
  outbound:
    - name: "cortex"
      url: "http://127.0.0.1:${localSettings.hermes_hook_port}/events"
      events:
        - on_session_start
        - on_session_end
        - post_tool_call
        - subagent_start
        - subagent_stop
      ${localSettings.hermes_hook_secret ? `secret: "${localSettings.hermes_hook_secret}"` : '# secret: ""'}`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(hookSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md font-mono select-none pointer-events-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <SettingsIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100 tracking-wide">CORTEX SETTINGS</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/30 text-xs">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> General & Live
          </button>
          <button
            onClick={() => setActiveTab('hermes')}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'hermes'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" /> Connect Hermes
          </button>
          <button
            onClick={() => setActiveTab('paths')}
            className={`py-2.5 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'paths'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" /> Data Paths
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Scan on launch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                <div>
                  <div className="font-semibold text-slate-200">Scan on Application Launch</div>
                  <div className="text-[11px] text-slate-400">
                    Automatically perform fresh discovery across agent databases on startup.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.scan_on_launch}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, scan_on_launch: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-800 border-slate-700"
                />
              </div>

              {/* Live File Watchers */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                <div>
                  <div className="font-semibold text-slate-200">Live File Watchers</div>
                  <div className="text-[11px] text-slate-400">
                    Watch transcript.jsonl, memories, and agent logs with ~250ms debounced tailing.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.enable_watchers}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, enable_watchers: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-800 border-slate-700"
                />
              </div>

              {/* Quality Preset */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200">Graphics Quality Preset</div>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as QualityLevel[]).map((q) => (
                    <button
                      key={q}
                      onClick={() => setLocalSettings({ ...localSettings, quality: q })}
                      className={`flex-1 py-1.5 rounded uppercase font-bold text-center border transition-all ${
                        localSettings.quality === q
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-slate-800/40 text-slate-400 border-slate-700/60 hover:text-slate-200'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Performance HUD Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                <div>
                  <div className="font-semibold text-slate-200">In-App Performance Overlay</div>
                  <div className="text-[11px] text-slate-400">
                    Display real-time rolling avg, p95 frame times, and draw calls (shortcut: ` key).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.show_perf_overlay}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, show_perf_overlay: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-slate-800 border-slate-700"
                />
              </div>
            </div>
          )}

          {activeTab === 'hermes' && (
            <div className="space-y-4">
              {/* Enable Hook Server */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800">
                <div>
                  <div className="font-semibold text-slate-200">Hermes Outbound Webhook Listener</div>
                  <div className="text-[11px] text-slate-400">
                    Accept live HTTP event notifications on loopback address 127.0.0.1.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.enable_hermes_hook}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, enable_hermes_hook: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-amber-500 focus:ring-0 bg-slate-800 border-slate-700"
                />
              </div>

              {/* Port & Secret */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                  <label className="text-[11px] text-slate-400">Listener Port</label>
                  <input
                    type="number"
                    value={localSettings.hermes_hook_port}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        hermes_hook_port: parseInt(e.target.value) || 47821,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-100"
                  />
                </div>

                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                  <label className="text-[11px] text-slate-400">HMAC-SHA256 Shared Secret</label>
                  <input
                    type="text"
                    value={localSettings.hermes_hook_secret || ''}
                    placeholder="Leave empty for unauthenticated"
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        hermes_hook_secret: e.target.value || undefined,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-100"
                  />
                </div>
              </div>

              {/* Setup Instructions & Copy Snippet */}
              <div className="p-3.5 rounded-lg bg-slate-950/80 border border-amber-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" /> Add to ~/.hermes/config.yaml
                  </span>
                  <button
                    onClick={handleCopySnippet}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
                  >
                    {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSnippet ? 'Copied!' : 'Copy Config'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded bg-slate-900/90 text-slate-300 text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
                  {hookSnippet}
                </pre>
                <div className="text-[11px] text-slate-400 flex items-start gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Non-blocking architecture: Hermes uses a fire-and-forget queue with a daemon
                    worker. If Cortex is offline or unreachable, Hermes will never hang or block.
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'paths' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">Antigravity Agent Root</div>
                <div className="text-slate-200 select-all font-mono">
                  %USERPROFILE%\.gemini\antigravity
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">Hermes Agent Root</div>
                <div className="text-slate-200 select-all font-mono">%USERPROFILE%\.hermes</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">Cortex SQLite Store</div>
                <div className="text-slate-200 select-all font-mono">
                  %APPDATA%\com.cortex.app\cortex-store.db
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">Cortex Settings File</div>
                <div className="text-slate-200 select-all font-mono">
                  %APPDATA%\com.cortex.app\settings.json
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-950/50 space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
