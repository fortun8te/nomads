import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { useAmbientSound } from '../hooks/useAmbientSound';
import { ollamaService } from '../utils/ollama';
import { MODEL_CONFIG, getResearchModelConfig } from '../utils/modelConfig';
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

// All Ollama calls go through Wayfayer proxy (handles CORS + streaming)
const OLLAMA_PROXY = 'http://localhost:8889/ollama';

interface OllamaModel {
  name: string;
  size: number;
  loaded: boolean;
}

function OllamaModelControl({ isDarkMode }: { isDarkMode: boolean }) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    const allModels: OllamaModel[] = [];

    try {
      const [tagsResp, psResp] = await Promise.all([
        fetch(`${OLLAMA_PROXY}/api/tags`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${OLLAMA_PROXY}/api/ps`, { signal: AbortSignal.timeout(8000) }),
      ]);
      const tags = tagsResp.ok ? await tagsResp.json() : { models: [] };
      const ps = psResp.ok ? await psResp.json() : { models: [] };
      const loadedNames = new Set((ps.models || []).map((m: any) => m.name));
      for (const m of (tags.models || [])) {
        allModels.push({ name: m.name, size: m.size || 0, loaded: loadedNames.has(m.name) });
      }
    } catch (err) {
      setError(`Ollama: ${err instanceof Error ? err.message : 'unreachable'} — is Wayfayer running?`);
    }

    setModels(allModels);
    setRefreshing(false);
  };

  useEffect(() => { refresh(); }, []);

  const loadModel = async (m: OllamaModel) => {
    setLoading(m.name);
    try {
      await fetch(`${OLLAMA_PROXY}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name, prompt: '', keep_alive: '10m' }),
        signal: AbortSignal.timeout(120000),
      });
      await refresh();
    } catch (err) {
      console.error('Load failed:', err);
    }
    setLoading(null);
  };

  const unloadModel = async (m: OllamaModel) => {
    setLoading(m.name);
    try {
      await fetch(`${OLLAMA_PROXY}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.name, keep_alive: 0 }),
        signal: AbortSignal.timeout(10000),
      });
      await refresh();
    } catch (err) {
      console.error('Unload failed:', err);
    }
    setLoading(null);
  };

  const killAll = async () => {
    setLoading('all');
    const loaded = models.filter(m => m.loaded);
    for (const m of loaded) {
      try {
        await fetch(`${OLLAMA_PROXY}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m.name, keep_alive: 0 }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
    }
    await refresh();
    setLoading(null);
  };

  const loadedCount = models.filter(m => m.loaded).length;

  // Map model → stages from config
  const modelStages = (name: string): string[] => {
    return Object.entries(MODEL_CONFIG)
      .filter(([, v]) => v === name)
      .map(([k]) => k);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
  };

  return (
    <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Ollama Models
          {!refreshing && models.length > 0 && (
            <span className={`ml-1.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
              {loadedCount}/{models.length} loaded
            </span>
          )}
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          className={`text-[9px] px-1.5 py-0.5 rounded ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
        >
          {refreshing ? '...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className={`text-[10px] mb-2 px-2 py-1 rounded ${isDarkMode ? 'text-red-400 bg-red-500/10' : 'text-red-600 bg-red-50'}`}>
          {error}
        </p>
      )}

      {models.length === 0 && !refreshing && (
        <p className={`text-[10px] mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
          No models found. Check Ollama is running.
        </p>
      )}

      <div className="space-y-1.5 mb-2.5">
        {models.map(m => {
          const stages = modelStages(m.name);
          return (
            <div key={m.name} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${isDarkMode ? 'bg-zinc-800/60' : 'bg-zinc-50'}`}>
              {/* Status dot */}
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.loaded ? 'bg-green-500' : 'bg-zinc-500/40'}`} />
              {/* Model info */}
              <div className="flex-1 min-w-0">
                <div className={`text-[10px] font-medium truncate ${isDarkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  {m.name}
                  {formatSize(m.size) && <span className={`ml-1 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{formatSize(m.size)}</span>}
                </div>
                {stages.length > 0 && (
                  <div className={`text-[8px] truncate ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {stages.join(', ')}
                  </div>
                )}
              </div>
              {/* Load/Unload button */}
              <button
                onClick={() => m.loaded ? unloadModel(m) : loadModel(m)}
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

      {/* Kill all (only show when something is loaded) */}
      {loadedCount > 0 && (
        <button
          onClick={killAll}
          disabled={loading !== null}
          className={`w-full px-3 py-2 rounded-xl text-[10px] font-medium transition-all ${
            isDarkMode
              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
              : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
          } ${loading === 'all' ? 'opacity-50 cursor-wait' : ''}`}
        >
          {loading === 'all' ? 'Killing...' : 'Kill all loaded'}
        </button>
      )}
    </div>
  );
}

export function SettingsModal({ isOpen, onClose, isRunning }: SettingsModalProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const { play } = useSoundEngine();
  const { ambientEnabled, toggleAmbient } = useAmbientSound();
  const [tab, setTab] = useState<'settings' | 'debug'>('settings');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(50);
  const [ollamaHost, setOllamaHost] = useState('');
  const [wayfayerHost, setWayfayerHost] = useState('');
  const [maxResearchTime, setMaxResearchTime] = useState('10');
  const [maxIterations, setMaxIterations] = useState('3');
  const [pipelineMode, setPipelineMode] = useState<'auto' | 'interactive'>('interactive');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [streamTestOutput, setStreamTestOutput] = useState<string | null>(null);
  const [streamTesting, setStreamTesting] = useState(false);
  const [adCacheStatus, setAdCacheStatus] = useState<string>('');
  const [adCacheProgress, setAdCacheProgress] = useState<string>('');
  const [adCacheRunning, setAdCacheRunning] = useState(false);
  const [adCacheInfo, setAdCacheInfo] = useState<AdLibraryCache | null>(null);
  const adCacheAbortRef = useRef<AbortController | null>(null);
  // Research model settings
  const [researchModel, setResearchModel] = useState('');
  const [compressionModel, setCompressionModel] = useState('');
  const [researchTemp, setResearchTemp] = useState(0.7);
  const [researchMaxCtx, setResearchMaxCtx] = useState(8192);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [debugTests, setDebugTests] = useState<DebugTest[]>([
    { name: 'Ollama Connection', status: 'pending', message: 'Not tested' },
    { name: 'Ollama Models', status: 'pending', message: 'Not tested' },
    { name: 'Wayfayer (Web Research)', status: 'pending', message: 'Not tested' },
  ]);

  useEffect(() => {
    // Sound settings
    const savedSound = localStorage.getItem('sound_enabled');
    setSoundEnabled(savedSound !== 'false');
    const savedVol = localStorage.getItem('sound_volume');
    setSoundVolume(savedVol ? Math.round(parseFloat(savedVol) * 100) : 50);

    setOllamaHost('localhost:8889/ollama → 100.74.135.83:11435');
    localStorage.removeItem('ollama_host');
    const savedWayfayer = localStorage.getItem('wayfayer_host');
    setWayfayerHost(savedWayfayer || 'http://localhost:8889');
    const savedTime = localStorage.getItem('max_research_time_minutes');
    setMaxResearchTime(savedTime || '45');
    const savedIter = localStorage.getItem('max_research_iterations');
    setMaxIterations(savedIter || '15');
    const savedMode = localStorage.getItem('pipeline_mode');
    setPipelineMode((savedMode as 'auto' | 'interactive') || 'interactive');
    // Load research model settings
    const rc = getResearchModelConfig();
    setResearchModel(rc.orchestratorModel);
    setCompressionModel(rc.compressionModel);
    setResearchTemp(rc.temperature);
    setResearchMaxCtx(rc.maxContext);
    // Fetch available models from Ollama
    fetch(`${OLLAMA_PROXY}/api/tags`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then(data => setAvailableModels((data.models || []).map((m: any) => m.name)))
      .catch(() => {});
    // Load ad library cache status
    getAdLibraryCache().then(cache => setAdCacheInfo(cache));
  }, []);

  const fetchWithTimeout = (url: string, timeout = 10000) => {
    return Promise.race([
      fetch(url, { method: 'GET' }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const response = (await fetchWithTimeout(`${OLLAMA_PROXY}/api/tags`, 10000)) as Response;
      setConnectionStatus(response.ok ? 'success' : 'error');
    } catch {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const saveResearchSettings = () => {
    localStorage.setItem('wayfayer_host', wayfayerHost);
    localStorage.setItem('max_research_time_minutes', maxResearchTime);
    localStorage.setItem('max_research_iterations', maxIterations);
  };

  const runDebugTests = async () => {
    setDebugTests([
      { name: 'Ollama Connection', status: 'testing', message: 'Connecting...' },
      { name: 'Ollama Models', status: 'testing', message: 'Checking...' },
      { name: 'Wayfayer (Web Research)', status: 'testing', message: 'Testing...' },
    ]);

    try {
      const ollamaResp = (await fetchWithTimeout(`${OLLAMA_PROXY}/api/tags`, 10000)) as Response;
      if (ollamaResp.ok) {
        const data = await ollamaResp.json();
        const modelCount = data.models?.length || 0;
        // Also check which are loaded
        let loadedCount = 0;
        try {
          const psResp = (await fetchWithTimeout(`${OLLAMA_PROXY}/api/ps`, 5000)) as Response;
          if (psResp.ok) {
            const psData = await psResp.json();
            loadedCount = psData.models?.length || 0;
          }
        } catch {}
        setDebugTests((prev) => [
          { ...prev[0], status: 'success', message: `Remote OK — ${modelCount} models, ${loadedCount} loaded` },
          { name: 'Ollama Models', status: 'success', message: data.models?.map((m: any) => m.name).join(', ') || 'None' },
          prev[2],
        ]);
      } else {
        setDebugTests((prev) => [
          { ...prev[0], status: 'error', message: `Error: ${ollamaResp.status}` },
          { name: 'Ollama Models', status: 'error', message: 'Skipped' },
          prev[2],
        ]);
      }
    } catch (err: unknown) {
      setDebugTests((prev) => [
        { ...prev[0], status: 'error', message: `${err instanceof Error ? err.message : 'Unknown error'}` },
        { name: 'Ollama Models', status: 'error', message: 'Skipped' },
        prev[2],
      ]);
    }

    try {
      const wfHost = localStorage.getItem('wayfayer_host') || 'http://localhost:8889';
      const wayfayerResp = (await fetchWithTimeout(`${wfHost}/health`, 5000)) as Response;
      if (wayfayerResp.ok) {
        const testResp = await fetch(`${wfHost}/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', num_results: 1 }),
          signal: AbortSignal.timeout(15000),
        });
        if (testResp.ok) {
          const data = await testResp.json();
          setDebugTests((prev) => [
            prev[0], prev[1],
            { ...prev[2], status: 'success', message: `Online — ${data.meta?.success || 0}/${data.meta?.total || 0} pages in ${(data.meta?.elapsed || 0).toFixed(1)}s` },
          ]);
        } else {
          setDebugTests((prev) => [
            prev[0], prev[1],
            { ...prev[2], status: 'success', message: 'Health OK, research endpoint returned error' },
          ]);
        }
      } else {
        setDebugTests((prev) => [
          prev[0], prev[1],
          { ...prev[2], status: 'error', message: `Error: ${wayfayerResp.status}` },
        ]);
      }
    } catch (err: unknown) {
      setDebugTests((prev) => [
        prev[0], prev[1],
        { ...prev[2], status: 'error', message: `${err instanceof Error ? err.message : 'Unavailable'} — is Wayfayer running?` },
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className={`pointer-events-auto w-[440px] rounded-2xl overflow-hidden ${
          isDarkMode
            ? 'bg-zinc-900 shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)]'
            : 'bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]'
        }`}>

          {/* Header */}
          <div className={`px-6 py-4 flex items-center justify-between ${
            isDarkMode ? 'border-b border-zinc-800/80' : 'border-b border-zinc-100'
          }`}>
            <h2 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-zinc-900'}`}>
              Settings
            </h2>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDarkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className={`px-6 pt-3 ${isDarkMode ? '' : ''}`}>
            <div className={`inline-flex rounded-xl p-1 ${isDarkMode ? 'bg-zinc-800/60' : 'bg-zinc-100/80'}`}>
              <button
                onClick={() => setTab('settings')}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  tab === 'settings'
                    ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
                    : isDarkMode ? 'text-zinc-400 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                General
              </button>
              <button
                onClick={() => setTab('debug')}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  tab === 'debug'
                    ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
                    : isDarkMode ? 'text-zinc-400 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                Debug
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-5 max-h-[32rem] overflow-y-auto">
            {tab === 'settings' ? (
              <>
                {/* Theme */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[13px] font-medium ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Appearance</p>
                    <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{isDarkMode ? 'Dark mode' : 'Light mode'}</p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={`relative w-10 h-[22px] rounded-full transition-colors ${isDarkMode ? 'bg-blue-500' : 'bg-zinc-300'}`}
                  >
                    <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${isDarkMode ? 'left-[22px]' : 'left-[3px]'}`} />
                  </button>
                </div>

                {/* Sound */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[13px] font-medium ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Sound</p>
                    <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{soundEnabled ? 'Enabled' : 'Muted'}</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      localStorage.setItem('sound_enabled', String(next));
                      if (next) play('toggle');
                    }}
                    className={`relative w-10 h-[22px] rounded-full transition-colors ${soundEnabled ? 'bg-blue-500' : isDarkMode ? 'bg-zinc-600' : 'bg-zinc-300'}`}
                  >
                    <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${soundEnabled ? 'left-[22px]' : 'left-[3px]'}`} />
                  </button>
                </div>
                {soundEnabled && (
                  <div className="flex items-center gap-3 mt-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#71717a' : '#a1a1aa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={soundVolume}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setSoundVolume(v);
                        localStorage.setItem('sound_volume', String(v / 100));
                      }}
                      onMouseUp={() => play('click')}
                      className="flex-1 h-1 accent-blue-500 cursor-pointer"
                    />
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? '#71717a' : '#a1a1aa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  </div>
                )}

                {/* Ambient Sound */}
                <div className="flex items-center justify-between mt-3">
                  <div>
                    <p className={`text-[13px] font-medium ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Ambient Sound</p>
                    <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Subtle background drone</p>
                  </div>
                  <button
                    onClick={() => { toggleAmbient(); play('toggle'); }}
                    className={`relative w-10 h-[22px] rounded-full transition-colors ${ambientEnabled ? 'bg-blue-500' : isDarkMode ? 'bg-zinc-600' : 'bg-zinc-300'}`}
                  >
                    <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${ambientEnabled ? 'left-[22px]' : 'left-[3px]'}`} />
                  </button>
                </div>

                {/* Pipeline Mode */}
                <div className={`pt-4 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[13px] font-medium mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Pipeline mode</p>
                  <div className={`inline-flex rounded-xl p-1 w-full ${isDarkMode ? 'bg-zinc-800/60' : 'bg-zinc-100/80'}`}>
                    <button
                      onClick={() => { setPipelineMode('auto'); localStorage.setItem('pipeline_mode', 'auto'); }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                        pipelineMode === 'auto'
                          ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
                          : isDarkMode ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      Full auto
                    </button>
                    <button
                      onClick={() => { setPipelineMode('interactive'); localStorage.setItem('pipeline_mode', 'interactive'); }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                        pipelineMode === 'interactive'
                          ? isDarkMode ? 'bg-zinc-700 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm'
                          : isDarkMode ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      Interactive
                    </button>
                  </div>
                  <p className={`text-[11px] mt-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {pipelineMode === 'auto'
                      ? 'Runs the full pipeline without interruption.'
                      : 'Pauses at checkpoints to ask for your direction.'}
                  </p>
                  {isRunning && (
                    <p className="text-[11px] mt-1 text-amber-500 font-medium">
                      Takes effect on next cycle.
                    </p>
                  )}
                </div>

                {/* Research Models */}
                <div className={`pt-4 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[13px] font-medium mb-3 ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Research models</p>
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Research model</label>
                      <select
                        value={researchModel}
                        onChange={(e) => {
                          setResearchModel(e.target.value);
                          localStorage.setItem('research_model', e.target.value);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs transition-colors ${
                          isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        } border outline-none`}
                      >
                        {availableModels.length > 0 ? availableModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        )) : <option value={researchModel}>{researchModel}</option>}
                      </select>
                      <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Council brains, orchestrator, synthesis
                      </p>
                    </div>
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Compression model</label>
                      <select
                        value={compressionModel}
                        onChange={(e) => {
                          setCompressionModel(e.target.value);
                          localStorage.setItem('compression_model', e.target.value);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs transition-colors ${
                          isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        } border outline-none`}
                      >
                        {availableModels.length > 0 ? availableModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        )) : <option value={compressionModel}>{compressionModel}</option>}
                      </select>
                      <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        Page compression (fast, small model)
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Temperature</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={Math.round(researchTemp * 10)}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) / 10;
                              setResearchTemp(v);
                              localStorage.setItem('research_temperature', String(v));
                            }}
                            className="flex-1 h-1 accent-blue-500 cursor-pointer"
                          />
                          <span className={`text-[11px] font-mono w-6 text-right ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{researchTemp.toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Max context</label>
                        <select
                          value={researchMaxCtx}
                          onChange={(e) => {
                            const v = parseInt(e.target.value);
                            setResearchMaxCtx(v);
                            localStorage.setItem('research_max_context', String(v));
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs transition-colors ${
                            isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                          } border outline-none`}
                        >
                          {[2048, 4096, 8192, 16384, 32768].map(v => (
                            <option key={v} value={v}>{v.toLocaleString()}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Connections */}
                <div className={`pt-4 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[13px] font-medium mb-3 ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Connections</p>

                  <div className="space-y-3">
                    <div>
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Ollama</label>
                      <input
                        type="text"
                        value={ollamaHost}
                        onChange={(e) => { setOllamaHost(e.target.value); setConnectionStatus('idle'); }}
                        className={`w-full px-3 py-2 rounded-xl text-xs transition-colors ${
                          isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 text-zinc-700 focus:border-zinc-300'
                        } border outline-none`}
                        placeholder="http://localhost:11435"
                      />
                    </div>
                    <button
                      onClick={testConnection}
                      disabled={testingConnection}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        testingConnection
                          ? isDarkMode ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400'
                          : connectionStatus === 'success'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : connectionStatus === 'error'
                          ? 'bg-red-500/10 text-red-500 border border-red-500/20'
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
                        className={`w-full px-3 py-2 rounded-xl text-xs transition-colors ${
                          isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300 focus:border-zinc-600' : 'bg-zinc-50 border-zinc-200 text-zinc-700 focus:border-zinc-300'
                        } border outline-none`}
                        placeholder="http://localhost:8889"
                      />
                    </div>
                  </div>
                </div>

                {/* Research Limits */}
                <div className={`pt-4 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[13px] font-medium mb-3 ${isDarkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Research limits</p>
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1">
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Time limit</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={maxResearchTime}
                          onChange={(e) => setMaxResearchTime(e.target.value)}
                          min="1" max="120"
                          className={`w-20 px-3 py-2 rounded-xl text-xs transition-colors ${
                            isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                          } border outline-none`}
                        />
                        <span className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>min</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className={`block text-[11px] font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Max iterations</label>
                      <input
                        type="number"
                        value={maxIterations}
                        onChange={(e) => setMaxIterations(e.target.value)}
                        min="1" max="50"
                        className={`w-20 px-3 py-2 rounded-xl text-xs transition-colors ${
                          isDarkMode ? 'bg-zinc-800 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        } border outline-none`}
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveResearchSettings}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isDarkMode ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    Save
                  </button>
                  <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Applies to new campaigns.
                  </p>
                </div>

                {/* Version */}
                <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[11px] ${isDarkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    NOMADS v1.1
                  </p>
                </div>
              </>
            ) : (
              /* Debug Tab */
              <div className="space-y-3">
                <button
                  onClick={runDebugTests}
                  className={`w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isDarkMode
                      ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  Run all tests
                </button>

                {debugTests.map((test, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border ${
                    test.status === 'success'
                      ? isDarkMode ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
                      : test.status === 'error'
                      ? isDarkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'
                      : isDarkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${
                          test.status === 'success'
                            ? isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                            : test.status === 'error'
                            ? isDarkMode ? 'text-red-400' : 'text-red-700'
                            : isDarkMode ? 'text-zinc-300' : 'text-zinc-700'
                        }`}>
                          {test.name}
                        </p>
                        <p className={`text-[11px] mt-0.5 break-words ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {test.message}
                        </p>
                      </div>
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                        test.status === 'success'
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : test.status === 'error'
                          ? 'bg-red-500/20 text-red-500'
                          : test.status === 'testing'
                          ? 'bg-blue-500/20 text-blue-500 animate-spin'
                          : isDarkMode ? 'bg-zinc-700 text-zinc-500' : 'bg-zinc-200 text-zinc-400'
                      }`}>
                        {test.status === 'success' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                        {test.status === 'error' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>}
                        {test.status === 'testing' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83" /></svg>}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Streaming test */}
                <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Stream test
                  </p>
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
                            model: 'lfm2.5-thinking:latest',
                            onChunk: (chunk) => {
                              acc += chunk;
                              setStreamTestOutput(acc);
                            },
                          }
                        );
                        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                        setStreamTestOutput(prev => `${prev}\n\n--- ${elapsed}s ---`);
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
                    {streamTesting ? 'Streaming from lfm2.5...' : 'Test streaming (lfm2.5 say hi)'}
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

                {/* Ad Library Pre-Analysis */}
                <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    Ad Library Analysis
                  </p>
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
                            (done, total, current) => {
                              setAdCacheProgress(`${done}/${total} analyzed · ${current}`);
                            },
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
                        onClick={async () => {
                          await clearAdLibraryCache();
                          setAdCacheInfo(null);
                          setAdCacheStatus('Cache cleared');
                        }}
                        className={`px-3 py-2.5 rounded-xl text-xs font-medium ${isDarkMode ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-zinc-700/50' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 border border-zinc-200'}`}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Ollama Model Control */}
                <OllamaModelControl isDarkMode={isDarkMode} />

                <div className={`pt-3 border-t ${isDarkMode ? 'border-zinc-800/60' : 'border-zinc-100'}`}>
                  <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
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
