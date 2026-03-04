import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useOllamaStatus } from '../context/OllamaContext';

export function OllamaConnectionManager() {
  const { isDarkMode } = useTheme();
  const { isConnected, isDiscovering } = useOllamaStatus();
  const [showSetup, setShowSetup] = useState(false);

  // Show nothing if connected or still discovering
  if (isConnected || isDiscovering) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 right-4 max-w-sm rounded-lg border shadow-lg p-4 z-40 ${
      isDarkMode
        ? 'bg-[#0d0d0d] border-orange-700/50'
        : 'bg-orange-50 border-orange-200'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`text-lg ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
          ⚠️
        </div>

        <div className="flex-1">
          <h3 className={`font-mono text-sm font-bold ${
            isDarkMode ? 'text-orange-400' : 'text-orange-700'
          }`}>
            Ollama Not Connected
          </h3>

          <p className={`font-mono text-xs mt-2 ${
            isDarkMode ? 'text-orange-300' : 'text-orange-600'
          }`}>
            Couldn't find Ollama. Make sure it's running locally.
          </p>

              <button
                onClick={() => setShowSetup(!showSetup)}
                className={`mt-3 w-full px-3 py-1.5 rounded font-mono text-xs uppercase tracking-widest transition-colors ${
                  isDarkMode
                    ? 'bg-orange-900/50 text-orange-400 hover:bg-orange-900'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                {showSetup ? 'Hide Setup' : 'Setup Instructions'}
              </button>

              {showSetup && (
                <div className={`mt-3 p-3 rounded font-mono text-xs space-y-2 ${
                  isDarkMode ? 'bg-black/30' : 'bg-white/50'
                }`}>
                  <p className={isDarkMode ? 'text-orange-300' : 'text-orange-700'}>
                    <strong>Option 1: Install Ollama</strong>
                  </p>
                  <p className={isDarkMode ? 'text-orange-200' : 'text-orange-600'}>
                    1. Download from <code>ollama.ai</code><br/>
                    2. Install and run <code>ollama serve</code> in terminal<br/>
                    3. Reload this page
                  </p>

                  <p className={`mt-3 ${isDarkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                    <strong>Option 2: Custom Host</strong>
                  </p>
                  <p className={isDarkMode ? 'text-orange-200' : 'text-orange-600'}>
                    If Ollama is on another machine, check Settings → Ollama Host and update the address.
                  </p>

                  <p className={`mt-3 ${isDarkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                    <strong>Common URLs:</strong>
                  </p>
                  <code className={isDarkMode ? 'text-orange-100' : 'text-orange-700'}>
                    localhost:11434<br/>
                    127.0.0.1:11434<br/>
                    Tailscale IP:11434
                  </code>
                </div>
              )}
            </>
          )}
        </div>

        <button
          onClick={() => setShowSetup(false)}
          className={`text-lg transition-opacity hover:opacity-50 ${
            isDarkMode ? 'text-orange-500' : 'text-orange-600'
          }`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
