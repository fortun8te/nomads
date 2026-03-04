import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { BUILD_INFO } from '../constants/buildInfo';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DebugTest {
  name: string;
  status: 'pending' | 'testing' | 'success' | 'error';
  message: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { isDarkMode, toggleTheme } = useTheme();
  const [tab, setTab] = useState<'settings' | 'debug'>('settings');
  const [ollamaHost, setOllamaHost] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [debugTests, setDebugTests] = useState<DebugTest[]>([
    { name: 'Ollama API Tags', status: 'pending', message: 'Not tested' },
    { name: 'Ollama Generation (Minimal)', status: 'pending', message: 'Not tested - will send "Respond with: YES"' },
    { name: 'Web Search (DuckDuckGo)', status: 'pending', message: 'Not tested' },
  ]);

  useEffect(() => {
    // Load saved Ollama host from localStorage
    const saved = localStorage.getItem('ollama_host');
    setOllamaHost(saved || 'http://100.74.135.83:11434');
  }, []);

  // Fetch with timeout (10s for remote connections)
  const fetchWithTimeout = (url: string, timeout = 10000, options?: RequestInit) => {
    return Promise.race([
      fetch(url, options || { method: 'GET' }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const response = (await fetchWithTimeout(`${ollamaHost}/api/tags`, 10000)) as Response;
      if (response.ok) {
        setConnectionStatus('success');
        localStorage.setItem('ollama_host', ollamaHost);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setConnectionStatus('error');
      }
    } catch {
      setConnectionStatus('error');
    } finally {
      setTestingConnection(false);
    }
  };

  const runDebugTests = async () => {
    setDebugTests([
      { name: 'Ollama API Tags', status: 'testing', message: 'Connecting...' },
      { name: 'Ollama Generation (Minimal)', status: 'testing', message: 'Sending minimal prompt...' },
      { name: 'Web Search (DuckDuckGo)', status: 'testing', message: 'Testing...' },
    ]);

    // Test 1: Ollama API Tags (check if server is up)
    try {
      const ollamaResp = (await fetchWithTimeout(`${ollamaHost}/api/tags`, 10000)) as Response;
      if (ollamaResp.ok) {
        const models = await ollamaResp.json();
        const modelCount = models.models?.length || 0;
        const modelNames = models.models?.map((m: any) => m.name).join(', ') || 'None';
        setDebugTests((prev) => [
          { ...prev[0], status: 'success', message: `Connected (${modelCount} models): ${modelNames}` },
          { name: 'Ollama Generation (Minimal)', status: 'testing', message: 'Sending minimal prompt...' },
          prev[2],
        ]);

        // Test 2: Ollama Generation with minimal prompt
        try {
          const genResp = (await fetchWithTimeout(`${ollamaHost}/api/generate`, 15000, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'mistral',
              prompt: 'Respond with exactly: YES',
              stream: false,
              temperature: 0,
            }),
          })) as Response;

          if (genResp.ok) {
            const genData = await genResp.json() as { response?: string };
            const response = genData.response || '';
            const success = response.toLowerCase().includes('yes');
            setDebugTests((prev) => [
              prev[0],
              { ...prev[1], status: success ? 'success' : 'error', message: success ? `✓ Generated: "${response.trim()}"` : `✗ Unexpected: "${response.trim()}"` },
              prev[2],
            ]);
          } else {
            const errorText = await genResp.text();
            setDebugTests((prev) => [
              prev[0],
              { ...prev[1], status: 'error', message: `HTTP ${genResp.status}: ${errorText}` },
              prev[2],
            ]);
          }
        } catch (genErr: unknown) {
          setDebugTests((prev) => [
            prev[0],
            { ...prev[1], status: 'error', message: `Generation failed: ${genErr instanceof Error ? genErr.message : 'Unknown error'}` },
            prev[2],
          ]);
        }
      } else {
        setDebugTests((prev) => [
          { ...prev[0], status: 'error', message: `API Error: ${ollamaResp.status}` },
          { name: 'Ollama Generation (Minimal)', status: 'error', message: 'Skipped - server not responding' },
          prev[2],
        ]);
      }
    } catch (err: unknown) {
      setDebugTests((prev) => [
        { ...prev[0], status: 'error', message: `${err instanceof Error ? err.message : 'Unknown error'}` },
        { name: 'Ollama Generation (Minimal)', status: 'error', message: 'Skipped - connection failed' },
        prev[2],
      ]);
    }

    // Test 2: Web Search API
    try {
      const searchResp = (await fetchWithTimeout('https://api.duckduckgo.com/?q=test&format=json', 10000)) as Response;
      if (searchResp.ok) {
        setDebugTests((prev) => [
          prev[0],
          prev[1],
          { ...prev[2], status: 'success', message: 'DuckDuckGo API working' },
        ]);
      } else {
        setDebugTests((prev) => [
          prev[0],
          prev[1],
          { ...prev[2], status: 'error', message: `Error: ${searchResp.status}` },
        ]);
      }
    } catch (err: unknown) {
      setDebugTests((prev) => [
        prev[0],
        prev[1],
        { ...prev[2], status: 'error', message: `${err instanceof Error ? err.message : 'Unavailable'}` },
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className={`pointer-events-auto w-96 ${
          isDarkMode
            ? 'bg-[#0d0d0d] border-zinc-800'
            : 'bg-white border-zinc-200'
        } border rounded-lg shadow-2xl`}>

          {/* Header */}
          <div className={`px-6 py-4 border-b ${
            isDarkMode ? 'border-zinc-800' : 'border-zinc-200'
          } flex items-center justify-between`}>
            <h2 className={`font-mono text-sm font-bold uppercase tracking-widest ${
              isDarkMode ? 'text-white' : 'text-black'
            }`}>
              Settings
            </h2>
            <button
              onClick={onClose}
              className={`font-mono text-lg hover:opacity-50 transition-opacity ${
                isDarkMode ? 'text-zinc-500' : 'text-zinc-400'
              }`}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <button
              onClick={() => setTab('settings')}
              className={`flex-1 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                tab === 'settings'
                  ? isDarkMode ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-black'
                  : isDarkMode ? 'text-zinc-500 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Settings
            </button>
            <button
              onClick={() => setTab('debug')}
              className={`flex-1 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                tab === 'debug'
                  ? isDarkMode ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-black'
                  : isDarkMode ? 'text-zinc-500 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Debug
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
            {tab === 'settings' ? (
              <>
                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <label className={`font-mono text-xs uppercase tracking-widest ${
                    isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                  }`}>
                    Theme
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${
                      isDarkMode ? 'text-zinc-500' : 'text-zinc-500'
                    }`}>
                      {isDarkMode ? 'Dark' : 'Light'}
                    </span>
                    <button
                      onClick={toggleTheme}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        isDarkMode
                          ? 'bg-white'
                          : 'bg-black'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                        isDarkMode
                          ? 'right-0.5 bg-black'
                          : 'left-0.5 bg-white'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Ollama Connection */}
                <div className={`pt-4 border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                  <label className={`block font-mono text-xs uppercase tracking-widest mb-2 ${
                    isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                  }`}>
                    Ollama Host
                  </label>
                  <input
                    type="text"
                    value={ollamaHost}
                    onChange={(e) => {
                      setOllamaHost(e.target.value);
                      setConnectionStatus('idle');
                    }}
                    className={`w-full px-3 py-2 rounded font-mono text-xs mb-2 ${
                      isDarkMode
                        ? 'bg-zinc-900 border-zinc-700 text-white'
                        : 'bg-white border-zinc-200 text-black'
                    } border transition-colors`}
                    placeholder="http://localhost:11434"
                  />
                  <button
                    onClick={testConnection}
                    disabled={testingConnection}
                    className={`w-full px-3 py-1.5 rounded font-mono text-xs uppercase tracking-widest transition-colors ${
                      testingConnection
                        ? (isDarkMode ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
                        : connectionStatus === 'success'
                        ? (isDarkMode ? 'bg-green-900 text-green-400' : 'bg-green-100 text-green-700')
                        : connectionStatus === 'error'
                        ? (isDarkMode ? 'bg-red-900 text-red-400' : 'bg-red-100 text-red-700')
                        : (isDarkMode ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-zinc-100 text-black hover:bg-zinc-200')
                    }`}
                  >
                    {testingConnection ? 'Testing...' : connectionStatus === 'success' ? '✓ Connected' : connectionStatus === 'error' ? '✗ Failed' : 'Test Connection'}
                  </button>
                </div>

                {/* Version */}
                <div className={`pt-2 border-t ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                  <p className={`font-mono text-xs ${
                    isDarkMode ? 'text-zinc-600' : 'text-zinc-400'
                  }`}>
                    Ad Creative Agent {BUILD_INFO.displayVersion}
                  </p>
                  <p className={`font-mono text-xs mt-1 ${
                    isDarkMode ? 'text-zinc-700' : 'text-zinc-500'
                  }`}>
                    Build #{BUILD_INFO.buildNumber}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Debug Tab */}
                <div className="space-y-3">
                  <button
                    onClick={runDebugTests}
                    className={`w-full px-3 py-2 rounded font-mono text-xs uppercase tracking-widest transition-colors ${
                      isDarkMode
                        ? 'bg-blue-900 text-blue-400 hover:bg-blue-800'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    Run All Tests
                  </button>

                  {debugTests.map((test, idx) => (
                    <div key={idx} className={`p-3 rounded border ${
                      test.status === 'success'
                        ? isDarkMode ? 'bg-green-950 border-green-700' : 'bg-green-50 border-green-200'
                        : test.status === 'error'
                        ? isDarkMode ? 'bg-red-950 border-red-700' : 'bg-red-50 border-red-200'
                        : isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-50 border-zinc-200'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className={`font-mono text-xs font-bold ${
                            test.status === 'success'
                              ? isDarkMode ? 'text-green-400' : 'text-green-700'
                              : test.status === 'error'
                              ? isDarkMode ? 'text-red-400' : 'text-red-700'
                              : isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                          }`}>
                            {test.name}
                          </p>
                          <p className={`font-mono text-xs mt-1 break-words ${
                            isDarkMode ? 'text-zinc-400' : 'text-zinc-600'
                          }`}>
                            {test.message}
                          </p>
                        </div>
                        <div className={`text-lg ${
                          test.status === 'success'
                            ? isDarkMode ? 'text-green-400' : 'text-green-600'
                            : test.status === 'error'
                            ? isDarkMode ? 'text-red-400' : 'text-red-600'
                            : isDarkMode ? 'text-zinc-500' : 'text-zinc-400'
                        }`}>
                          {test.status === 'success' && '✓'}
                          {test.status === 'error' && '✗'}
                          {test.status === 'testing' && '⟳'}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className={`pt-2 border-t text-xs font-mono ${isDarkMode ? 'border-zinc-800 text-zinc-500' : 'border-zinc-200 text-zinc-600'}`}>
                    <p>Search: DuckDuckGo API (free, no setup)</p>
                    <p className={`mt-1 p-2 rounded ${isDarkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                      Rate limit: 30 req/min • Public API
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className={`px-6 py-3 border-t ${
            isDarkMode ? 'border-zinc-800' : 'border-zinc-200'
          } flex justify-end`}>
            <button
              onClick={onClose}
              className={`font-mono text-xs uppercase tracking-widest px-4 py-1.5 rounded transition-colors ${
                isDarkMode
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-black text-white hover:bg-zinc-800'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
