import { useState, useEffect, useRef } from 'react';
import { INFRASTRUCTURE } from '../config/infrastructure';
import { useTheme } from '../context/ThemeContext';
import { useCampaign } from '../context/CampaignContext';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { useAmbientSound } from '../hooks/useAmbientSound';
import { ollamaService } from '../utils/ollama';
import { agentCoordinator } from '../utils/agentCoordinator';
import { blackboard } from '../utils/blackboard';
import { storage } from '../utils/storage';
import {
  MODEL_CONFIG,
  MODEL_TIERS,
  type ModelTier,
  getActiveModelTier,
  applyModelTier,
  getOllamaEndpoint,
  setOllamaEndpoint,
  getWorkspacePath,
  setWorkspacePath,
  AGENT_DURATION_OPTIONS,
  type AgentDuration,
  getAgentMaxDuration,
  setAgentMaxDuration,
  runSettingsMigration,
} from '../utils/modelConfig';
import { analyzeAll as analyzeAdLibrary, getCache as getAdLibraryCache, clearCache as clearAdLibraryCache, type AdLibraryCache } from '../utils/adLibraryCache';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRunning?: boolean;
}

interface DebugTest {
  name: string;
  status: 'pending' | 'testing' | 'success' | 'error';
  message: string;
}

// ── Shared UI helpers ────────────────────────────────────────

function Toggle({ enabled, onChange, isDarkMode }: { enabled: boolean; onChange: (v: boolean) => void; isDarkMode: boolean }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
        enabled
          ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
          : isDarkMode ? 'bg-zinc-700' : 'bg-zinc-300'
      }`}
    >
      <span
        className="absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200"
        style={{ left: enabled ? 'calc(100% - 21px)' : '3px' }}
      />
    </button>
  );
}

function SectionHeader({ children, isDarkMode }: { children: React.ReactNode; isDarkMode: boolean }) {
  return (
    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
      {children}
    </p>
  );
}

function SettingRow({ label, hint, isDarkMode, children }: { label: string; hint?: string; isDarkMode: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className={`text-[13px] font-medium ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>{label}</p>
        {hint && <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Divider({ isDarkMode }: { isDarkMode: boolean }) {
  return <div className={`border-t my-1 ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-200/60'}`} />;
}

// ── Ollama Model Control (Debug tab) ─────────────────────────

function OllamaModelControl({ isDarkMode }: { isDarkMode: boolean }) {
  const [models, setModels] = useState<{ name: string; size: number; loaded: boolean }[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proxyUrl = getOllamaEndpoint();

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [tagsResp, psResp] = await Promise.all([
        fetch(`${proxyUrl}/api/tags`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${proxyUrl}/api/ps`, { signal: AbortSignal.timeout(8000) }),
      ]);
      const tags = tagsResp.ok ? await tagsResp.json() : { models: [] };
      const ps = psResp.ok ? await psResp.json() : { models: [] };
      const loadedNames = new Set((ps.models || []).map((m: any) => m.name));
      setModels((tags.models || []).map((m: any) => ({
        name: m.name,
        size: m.size || 0,
        loaded: loadedNames.has(m.name),
      })));
    } catch (err) {
      setError(`Ollama: ${err instanceof Error ? err.message : 'unreachable'} — is Wayfayer running?`);
      setModels([]);
    }
    setRefreshing(false);
  };

  useEffect(() => { refresh(); }, []);

  const toggleModel = async (m: { name: string; loaded: boolean }) => {
    setLoading(m.name);
    try {
      await fetch(`${proxyUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(m.loaded ? { model: m.name, keep_alive: 0 } : { model: m.name, prompt: '', keep_alive: '10m' }),
        signal: AbortSignal.timeout(120000),
      });
      await refresh();
    } catch (err) {
      console.error('Model toggle failed:', err);
    }
    setLoading(null);
  };

  const killAll = async () => {
    setLoading('all');
    for (const m of models.filter(x => x.loaded)) {
      try {
        await fetch(`${proxyUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m.name, keep_alive: 0 }),
          signal: AbortSignal.timeout(10000),
        });
      } catch { /* skip */ }
    }
    await refresh();
    setLoading(null);
  };

  const loadedCount = models.filter(m => m.loaded).length;
  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionHeader isDarkMode={isDarkMode}>
          Ollama Models
          {!refreshing && models.length > 0 && (
            <span className={`ml-1.5 font-normal ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
              {loadedCount}/{models.length} loaded
            </span>
          )}
        </SectionHeader>
        <button onClick={refresh} disabled={refreshing} className={`text-[9px] px-1.5 py-0.5 rounded ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
          {refreshing ? '...' : 'Refresh'}
        </button>
      </div>

      {error && <p className={`text-[10px] mb-2 px-2 py-1 rounded ${isDarkMode ? 'text-red-400 bg-red-500/10' : 'text-red-600 bg-red-50'}`}>{error}</p>}
      {models.length === 0 && !refreshing && <p className={`text-[10px] mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>No models found.</p>}

      <div className="space-y-1.5 mb-2.5">
        {models.map(m => {
          const stages = Object.entries(MODEL_CONFIG).filter(([, v]) => v === m.name).map(([k]) => k);
          return (
            <div key={m.name} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${isDarkMode ? 'bg-zinc-800/60' : 'bg-zinc-50'}`}>
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.loaded ? 'bg-green-500' : 'bg-zinc-500/40'}`} />
              <div className="flex-1 min-w-0">
                <div className={`text-[10px] font-medium truncate ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  {m.name}
                  {formatSize(m.size) && <span className={`ml-1 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{formatSize(m.size)}</span>}
                </div>
                {stages.length > 0 && <div className={`text-[8px] truncate ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{stages.join(', ')}</div>}
              </div>
              <button
                onClick={() => toggleModel(m)}
                disabled={loading !== null}
                className={`text-[9px] px-2 py-1 rounded-md font-medium flex-shrink-0 transition-colors ${
                  loading === m.name ? 'opacity-50 cursor-wait' :
                  m.loaded
                    ? isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'
                    : isDarkMode ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                {loading === m.name ? '...' : m.loaded ? 'Kill' : 'Load'}
              </button>
            </div>
          );
        })}
      </div>

      {loadedCount > 0 && (
        <button
          onClick={killAll}
          disabled={loading !== null}
          className={`w-full px-3 py-2 rounded-xl text-[10px] font-medium transition-all ${
            isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
          } ${loading === 'all' ? 'opacity-50 cursor-wait' : ''}`}
        >
          {loading === 'all' ? 'Killing...' : 'Kill all loaded'}
        </button>
      )}
    </div>
  );
}

// ── Main Settings Modal ──────────────────────────────────────

export function SettingsModal({ isOpen, onClose, isRunning }: SettingsModalProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { stopCycle } = useCampaign();
  const { play } = useSoundEngine();
  const { ambientEnabled, toggleAmbient } = useAmbientSound();
  const [tab, setTab] = useState<'settings' | 'debug'>('settings');

  // Kill / Reset state
  const [killStatus, setKillStatus] = useState<'idle' | 'killing' | 'done'>('idle');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done'>('idle');

  // Connection
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [wayfayerHost, setWayfayerHost] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Models
  const [modelTier, setModelTierState] = useState<ModelTier>('standard');

  // Agent
  const [agentDuration, setAgentDurationState] = useState<AgentDuration>('5h');
  const [workspacePath, setWorkspacePathState] = useState('');
  const [pipelineMode, setPipelineMode] = useState<'auto' | 'interactive'>('interactive');

  // Audio
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(50);

  // Debug
  const [streamTestOutput, setStreamTestOutput] = useState<string | null>(null);
  const [streamTesting, setStreamTesting] = useState(false);
  const [adCacheStatus, setAdCacheStatus] = useState('');
  const [adCacheProgress, setAdCacheProgress] = useState('');
  const [adCacheRunning, setAdCacheRunning] = useState(false);
  const [adCacheInfo, setAdCacheInfo] = useState<AdLibraryCache | null>(null);
  const adCacheAbortRef = useRef<AbortController | null>(null);
  const [debugTests, setDebugTests] = useState<DebugTest[]>([
    { name: 'Ollama Connection', status: 'pending', message: 'Not tested' },
    { name: 'Ollama Models', status: 'pending', message: 'Not tested' },
    { name: 'Wayfayer (Web Research)', status: 'pending', message: 'Not tested' },
  ]);

  // Init
  useEffect(() => {
    runSettingsMigration();

    setOllamaUrl(getOllamaEndpoint());
    const savedWf = localStorage.getItem('wayfayer_host');
    setWayfayerHost(savedWf || INFRASTRUCTURE.wayfarerUrl);

    setModelTierState(getActiveModelTier());

    setAgentDurationState(getAgentMaxDuration());
    setWorkspacePathState(getWorkspacePath());
    const savedMode = localStorage.getItem('pipeline_mode');
    setPipelineMode((savedMode as 'auto' | 'interactive') || 'interactive');

    const savedSound = localStorage.getItem('sound_enabled');
    setSoundEnabled(savedSound !== 'false');
    const savedVol = localStorage.getItem('sound_volume');
    setSoundVolume(savedVol ? Math.round(parseFloat(savedVol) * 100) : 50);

    getAdLibraryCache().then(cache => setAdCacheInfo(cache));
  }, []);

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
      setConnectionStatus(resp.ok ? 'success' : 'error');
    } catch {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const runDebugTests = async () => {
    setDebugTests([
      { name: 'Ollama Connection', status: 'testing', message: 'Connecting...' },
      { name: 'Ollama Models', status: 'testing', message: 'Checking...' },
      { name: 'Wayfayer (Web Research)', status: 'testing', message: 'Testing...' },
    ]);

    const endpoint = getOllamaEndpoint();

    try {
      const ollamaResp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(10000) });
      if (ollamaResp.ok) {
        const data = await ollamaResp.json();
        const modelCount = data.models?.length || 0;
        let loadedCount = 0;
        try {
          const psResp = await fetch(`${endpoint}/api/ps`, { signal: AbortSignal.timeout(5000) });
          if (psResp.ok) { const psData = await psResp.json(); loadedCount = psData.models?.length || 0; }
        } catch { /* skip */ }
        setDebugTests(prev => [
          { ...prev[0], status: 'success', message: `OK — ${modelCount} models, ${loadedCount} loaded` },
          { name: 'Ollama Models', status: 'success', message: data.models?.map((m: any) => m.name).join(', ') || 'None' },
          prev[2],
        ]);
      } else {
        setDebugTests(prev => [
          { ...prev[0], status: 'error', message: `Error: ${ollamaResp.status}` },
          { name: 'Ollama Models', status: 'error', message: 'Skipped' },
          prev[2],
        ]);
      }
    } catch (err: unknown) {
      setDebugTests(prev => [
        { ...prev[0], status: 'error', message: `${err instanceof Error ? err.message : 'Unknown'}` },
        { name: 'Ollama Models', status: 'error', message: 'Skipped' },
        prev[2],
      ]);
    }

    try {
      const wfHost = localStorage.getItem('wayfayer_host') || INFRASTRUCTURE.wayfarerUrl;
      const wfResp = await fetch(`${wfHost}/health`, { signal: AbortSignal.timeout(5000) });
      if (wfResp.ok) {
        const testResp = await fetch(`${wfHost}/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', num_results: 1 }),
          signal: AbortSignal.timeout(15000),
        });
        if (testResp.ok) {
          const data = await testResp.json();
          setDebugTests(prev => [prev[0], prev[1], { ...prev[2], status: 'success', message: `Online — ${data.meta?.success || 0}/${data.meta?.total || 0} pages in ${(data.meta?.elapsed || 0).toFixed(1)}s` }]);
        } else {
          setDebugTests(prev => [prev[0], prev[1], { ...prev[2], status: 'success', message: 'Health OK, research endpoint returned error' }]);
        }
      } else {
        setDebugTests(prev => [prev[0], prev[1], { ...prev[2], status: 'error', message: `Error: ${wfResp.status}` }]);
      }
    } catch (err: unknown) {
      setDebugTests(prev => [prev[0], prev[1], { ...prev[2], status: 'error', message: `${err instanceof Error ? err.message : 'Unavailable'} — is Wayfayer running?` }]);
    }
  };

  if (!isOpen) return null;

  const inputCls = `w-full px-3 py-2 rounded-xl text-xs transition-colors border outline-none ${
    isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 text-zinc-700 focus:border-zinc-300'
  }`;

  const btnCls = (active: boolean) => `flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
    active
      ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
      : isDarkMode ? 'text-zinc-400' : 'text-zinc-500'
  }`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className={`pointer-events-auto w-[460px] rounded-2xl overflow-hidden ${
          isDarkMode
            ? 'bg-[#0a0a0e] shadow-[0_8px_30px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]'
            : 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]'
        }`}>

          {/* Header */}
          <div className={`px-6 py-4 flex items-center justify-between ${isDarkMode ? 'border-b border-zinc-800/60' : 'border-b border-zinc-100'}`}>
            <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>Settings</h2>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-3">
            <div className={`inline-flex rounded-xl p-1 ${isDarkMode ? 'bg-zinc-800/60' : 'bg-zinc-100/80'}`}>
              {(['settings', 'debug'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  tab === t
                    ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
                    : isDarkMode ? 'text-zinc-400 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700'
                }`}>
                  {t === 'settings' ? 'General' : 'Debug'}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 max-h-[36rem] overflow-y-auto">
            {tab === 'settings' ? (
              <div className="space-y-6">

                {/* ── CONNECTION ── */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Connection</SectionHeader>
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Ollama endpoint</label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => { setOllamaUrl(e.target.value); setConnectionStatus('idle'); }}
                        onBlur={() => setOllamaEndpoint(ollamaUrl)}
                        className={inputCls}
                        placeholder="http://localhost:8889/ollama"
                      />
                    </div>
                    <button
                      onClick={testConnection}
                      disabled={testingConnection}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        testingConnection ? isDarkMode ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400'
                        : connectionStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : connectionStatus === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                        : isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {testingConnection ? 'Testing...' : connectionStatus === 'success' ? 'Connected' : connectionStatus === 'error' ? 'Connection failed' : 'Test connection'}
                    </button>
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Wayfayer</label>
                      <input
                        type="text"
                        value={wayfayerHost}
                        onChange={(e) => setWayfayerHost(e.target.value)}
                        onBlur={() => localStorage.setItem('wayfayer_host', wayfayerHost)}
                        className={inputCls}
                        placeholder="http://localhost:8889"
                      />
                    </div>
                  </div>
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* ── MODELS ── */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Models</SectionHeader>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-[11px] font-medium mb-2 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Model tier</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {MODEL_TIERS.map(tier => {
                          const active = modelTier === tier.id;
                          return (
                            <button
                              key={tier.id}
                              onClick={() => {
                                setModelTierState(tier.id);
                                applyModelTier(tier.id);
                                play('click');
                              }}
                              className={`px-2 py-2.5 rounded-xl text-center transition-all ${
                                active
                                  ? isDarkMode ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-700'
                                  : isDarkMode ? 'bg-zinc-800/60 border border-zinc-700/30 text-zinc-400 hover:border-zinc-600' : 'bg-zinc-50 border border-zinc-200 text-zinc-600 hover:border-zinc-300'
                              }`}
                            >
                              <div className="text-[11px] font-semibold">{tier.label}</div>
                              <div className={`text-[9px] mt-0.5 ${active ? isDarkMode ? 'text-blue-400/70' : 'text-blue-600' : isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                                {tier.models[0].replace('qwen3.5:', '')} + {tier.models[1].replace('qwen3.5:', '')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Sets all pipeline model assignments at once.
                      </p>
                    </div>

                  </div>
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* ── AGENT ── */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Agent</SectionHeader>
                  <div className="space-y-4">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Pipeline mode</label>
                      <div className={`inline-flex rounded-xl p-1 w-full ${isDarkMode ? 'bg-zinc-800/60' : 'bg-zinc-100/80'}`}>
                        <button onClick={() => { setPipelineMode('auto'); localStorage.setItem('pipeline_mode', 'auto'); }} className={btnCls(pipelineMode === 'auto')}>Full auto</button>
                        <button onClick={() => { setPipelineMode('interactive'); localStorage.setItem('pipeline_mode', 'interactive'); }} className={btnCls(pipelineMode === 'interactive')}>Interactive</button>
                      </div>
                      <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        {pipelineMode === 'auto' ? 'Runs full pipeline without interruption.' : 'Pauses at checkpoints for direction.'}
                      </p>
                      {isRunning && <p className="text-[10px] mt-0.5 text-blue-500 font-medium">Takes effect on next cycle.</p>}
                    </div>

                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Max duration</label>
                      <select
                        value={agentDuration}
                        onChange={(e) => { const v = e.target.value as AgentDuration; setAgentDurationState(v); setAgentMaxDuration(v); }}
                        className={inputCls}
                      >
                        {AGENT_DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Workspace path</label>
                      <input
                        type="text"
                        value={workspacePath}
                        onChange={(e) => setWorkspacePathState(e.target.value)}
                        onBlur={() => setWorkspacePath(workspacePath)}
                        className={inputCls}
                        placeholder="/path/to/workspace"
                      />
                    </div>
                  </div>
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* ── AUDIO ── */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Audio</SectionHeader>
                  <div className="space-y-3">
                    <SettingRow label="Sound" hint={soundEnabled ? 'Enabled' : 'Muted'} isDarkMode={isDarkMode}>
                      <Toggle enabled={soundEnabled} onChange={(v) => { setSoundEnabled(v); localStorage.setItem('sound_enabled', String(v)); if (v) play('toggle'); }} isDarkMode={isDarkMode} />
                    </SettingRow>
                    {soundEnabled && (
                      <div className="flex items-center gap-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#71717a' : '#a1a1aa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        </svg>
                        <input
                          type="range" min="0" max="100" value={soundVolume}
                          onChange={(e) => { const v = parseInt(e.target.value); setSoundVolume(v); localStorage.setItem('sound_volume', String(v / 100)); }}
                          onMouseUp={() => play('click')}
                          className="flex-1 h-1 accent-blue-500 cursor-pointer"
                        />
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#71717a' : '#a1a1aa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      </div>
                    )}
                    <SettingRow label="Ambient sound" hint="Subtle background drone" isDarkMode={isDarkMode}>
                      <Toggle enabled={ambientEnabled} onChange={() => { toggleAmbient(); play('toggle'); }} isDarkMode={isDarkMode} />
                    </SettingRow>
                  </div>
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* ── ADVANCED ── */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Advanced</SectionHeader>
                  <div className="space-y-3">
                    <SettingRow label="Appearance" hint={isDarkMode ? 'Dark mode' : 'Light mode'} isDarkMode={isDarkMode}>
                      <Toggle enabled={isDarkMode} onChange={() => toggleTheme()} isDarkMode={isDarkMode} />
                    </SettingRow>
                  </div>
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* ── DANGER ZONE ── */}
                <div className={`rounded-xl p-4 border ${isDarkMode ? 'border-red-500/10 bg-red-500/[0.03]' : 'border-red-100 bg-red-50/30'}`}>
                  <SectionHeader isDarkMode={isDarkMode}>Danger Zone</SectionHeader>
                  <div className="space-y-3">

                    {/* Stop All AI */}
                    <div>
                      <button
                        onClick={async () => {
                          setKillStatus('killing');
                          play('click');
                          try {
                            stopCycle();
                            agentCoordinator.reset();
                            blackboard.clear();
                          } catch (err) {
                            console.error('Kill all failed:', err);
                          }
                          setKillStatus('done');
                          setTimeout(() => setKillStatus('idle'), 2500);
                        }}
                        disabled={killStatus === 'killing'}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all border ${
                          killStatus === 'done'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : killStatus === 'killing'
                            ? 'bg-red-500/20 border-red-500/30 text-red-300 cursor-wait opacity-70'
                            : isDarkMode
                            ? 'bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20 hover:border-red-500/40'
                            : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <rect x="8" y="8" width="8" height="8" rx="1" />
                        </svg>
                        {killStatus === 'done' ? 'All processes stopped' : killStatus === 'killing' ? 'Stopping...' : 'Stop All AI'}
                      </button>
                      <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Stops all running research, agents, and workers
                      </p>
                    </div>

                    {/* Clear All Data */}
                    <div>
                      {!clearConfirm ? (
                        <button
                          onClick={() => setClearConfirm(true)}
                          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                            isDarkMode
                              ? 'bg-transparent border-zinc-700/50 text-zinc-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5'
                              : 'bg-transparent border-zinc-200 text-zinc-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                          }`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                          </svg>
                          Clear All Data
                        </button>
                      ) : (
                        <div className={`p-3 rounded-xl border space-y-2.5 ${isDarkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                          <p className={`text-[11px] font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                            Are you sure? This cannot be undone.
                          </p>
                          <p className={`text-[10px] leading-relaxed ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                            Deletes all campaigns, cycles, settings, and cached data. The page will reload.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                setClearStatus('clearing');
                                play('click');
                                try {
                                  stopCycle();
                                  agentCoordinator.reset();
                                  blackboard.clear();
                                  await storage.clear();
                                  const keysToRemove: string[] = [];
                                  for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key) keysToRemove.push(key);
                                  }
                                  for (const key of keysToRemove) {
                                    localStorage.removeItem(key);
                                  }
                                } catch (err) {
                                  console.error('Clear all data failed:', err);
                                }
                                setClearStatus('done');
                                setTimeout(() => window.location.reload(), 500);
                              }}
                              disabled={clearStatus === 'clearing'}
                              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                clearStatus === 'clearing'
                                  ? 'bg-red-500/30 text-red-300 cursor-wait'
                                  : isDarkMode
                                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                  : 'bg-red-100 text-red-600 hover:bg-red-200'
                              }`}
                            >
                              {clearStatus === 'clearing' ? 'Clearing...' : clearStatus === 'done' ? 'Done — reloading...' : 'Yes, delete everything'}
                            </button>
                            <button
                              onClick={() => { setClearConfirm(false); setClearStatus('idle'); }}
                              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                isDarkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
                              }`}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {!clearConfirm && (
                        <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                          Removes all campaigns, research data, and settings
                        </p>
                      )}
                    </div>

                  </div>
                </div>

                {/* Version */}
                <div className={`pt-2 border-t ${isDarkMode ? 'border-zinc-800/40' : 'border-zinc-100'}`}>
                  <p className={`text-[11px] ${isDarkMode ? 'text-zinc-700' : 'text-zinc-400'}`}>NOMADS v1.2</p>
                </div>
              </div>
            ) : (
              /* ── DEBUG TAB ── */
              <div className="space-y-4">
                <button
                  onClick={runDebugTests}
                  className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isDarkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  Run all tests
                </button>

                {debugTests.map((test, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border ${
                    test.status === 'success' ? isDarkMode ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
                    : test.status === 'error' ? isDarkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'
                    : isDarkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${
                          test.status === 'success' ? isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                          : test.status === 'error' ? isDarkMode ? 'text-red-400' : 'text-red-700'
                          : isDarkMode ? 'text-zinc-300' : 'text-zinc-700'
                        }`}>{test.name}</p>
                        <p className={`text-[11px] mt-0.5 break-words ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{test.message}</p>
                      </div>
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                        test.status === 'success' ? 'bg-emerald-500/20 text-emerald-500'
                        : test.status === 'error' ? 'bg-red-500/20 text-red-500'
                        : test.status === 'testing' ? 'bg-blue-500/20 text-blue-500 animate-spin'
                        : isDarkMode ? 'bg-zinc-700 text-zinc-500' : 'bg-zinc-200 text-zinc-400'
                      }`}>
                        {test.status === 'success' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                        {test.status === 'error' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>}
                        {test.status === 'testing' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83" /></svg>}
                      </div>
                    </div>
                  </div>
                ))}

                <Divider isDarkMode={isDarkMode} />

                {/* Stream test */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Stream test</SectionHeader>
                  <button
                    disabled={streamTesting}
                    onClick={async () => {
                      setStreamTesting(true);
                      setStreamTestOutput('');
                      let acc = '';
                      const start = Date.now();
                      try {
                        await ollamaService.generateStream(
                          'Say hi back in one short sentence.',
                          'You are a helpful assistant.',
                          {
                            model: 'qwen3.5:0.8b',
                            onChunk: (chunk) => { acc += chunk; setStreamTestOutput(acc); },
                          }
                        );
                        setStreamTestOutput(prev => `${prev}\n\n--- ${((Date.now() - start) / 1000).toFixed(1)}s ---`);
                      } catch (err) {
                        setStreamTestOutput(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
                      } finally {
                        setStreamTesting(false);
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      streamTesting
                        ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-wait' : 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-wait'
                        : isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700/50' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
                    }`}
                  >
                    {streamTesting ? 'Streaming from qwen3.5:0.8b...' : 'Test streaming (qwen3.5:0.8b say hi)'}
                  </button>
                  {streamTestOutput !== null && (
                    <pre className={`mt-2 p-3 rounded-xl text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto border ${
                      streamTestOutput.startsWith('ERROR')
                        ? isDarkMode ? 'bg-red-500/5 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-200'
                        : isDarkMode ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {streamTestOutput || '...'}
                    </pre>
                  )}
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* Ad Library Pre-Analysis */}
                <div>
                  <SectionHeader isDarkMode={isDarkMode}>Ad Library Analysis</SectionHeader>
                  {adCacheInfo && adCacheInfo.totalAnalyzed > 0 && (
                    <div className={`mb-2 p-2 rounded-lg text-[11px] ${isDarkMode ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {adCacheInfo.totalAnalyzed} ads analyzed · {adCacheInfo.totalFailed} failed · Updated {new Date(adCacheInfo.lastUpdated).toLocaleDateString()}
                    </div>
                  )}
                  {adCacheProgress && (
                    <div className={`mb-2 p-2 rounded-lg text-[11px] font-mono ${isDarkMode ? 'bg-blue-500/5 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                      {adCacheProgress}
                    </div>
                  )}
                  {adCacheStatus && (
                    <div className={`mb-2 p-2 rounded-lg text-[11px] ${
                      adCacheStatus.startsWith('ERROR')
                        ? isDarkMode ? 'bg-red-500/5 text-red-400 border border-red-500/20' : 'bg-red-50 text-red-600 border border-red-200'
                        : isDarkMode ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {adCacheStatus}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={adCacheRunning}
                      onClick={async () => {
                        setAdCacheRunning(true);
                        setAdCacheStatus('');
                        setAdCacheProgress('Starting...');
                        const abort = new AbortController();
                        adCacheAbortRef.current = abort;
                        try {
                          const cache = await analyzeAdLibrary(
                            (done, total, current) => setAdCacheProgress(`${done}/${total} analyzed · ${current}`),
                            abort.signal
                          );
                          setAdCacheInfo(cache);
                          setAdCacheStatus(`Done! ${cache.totalAnalyzed} ads analyzed.`);
                          setAdCacheProgress('');
                        } catch (err) {
                          setAdCacheStatus(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
                        } finally {
                          setAdCacheRunning(false);
                          adCacheAbortRef.current = null;
                        }
                      }}
                      className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        adCacheRunning
                          ? isDarkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-wait' : 'bg-blue-50 text-blue-600 border border-blue-200 cursor-wait'
                          : isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700/50' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
                      }`}
                    >
                      {adCacheRunning ? 'Analyzing...' : adCacheInfo?.totalAnalyzed ? 'Re-analyze All' : 'Pre-analyze Ad Library'}
                    </button>
                    {adCacheRunning && (
                      <button
                        onClick={() => adCacheAbortRef.current?.abort()}
                        className={`px-3 py-2.5 rounded-xl text-xs font-medium ${isDarkMode ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20' : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'}`}
                      >
                        Stop
                      </button>
                    )}
                    {adCacheInfo?.totalAnalyzed && !adCacheRunning ? (
                      <button
                        onClick={async () => { await clearAdLibraryCache(); setAdCacheInfo(null); setAdCacheStatus('Cache cleared'); }}
                        className={`px-3 py-2.5 rounded-xl text-xs font-medium ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-zinc-700/50' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 border border-zinc-200'}`}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <Divider isDarkMode={isDarkMode} />

                {/* Ollama Model Control */}
                <OllamaModelControl isDarkMode={isDarkMode} />

                <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-800/40' : 'border-zinc-100'}`}>
                  <p className={`text-[11px] ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    SearXNG :8888 → Wayfayer :8889 → Full pages
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
