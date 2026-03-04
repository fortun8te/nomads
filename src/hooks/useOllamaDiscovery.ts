import { useEffect, useState } from 'react';
import { discoverOllama } from '../utils/ollama';

export function useOllamaDiscovery() {
  const [discoveredHost, setDiscoveredHost] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(true);

  useEffect(() => {
    const discover = async () => {
      console.debug('[OllamaDiscovery] Starting auto-discovery...');
      setIsDiscovering(true);

      const host = await discoverOllama();

      if (host) {
        console.debug('[OllamaDiscovery] Setting Ollama host to:', host);
        localStorage.setItem('ollama_host', host);
        setDiscoveredHost(host);
      } else {
        console.warn('[OllamaDiscovery] Failed to discover Ollama, falling back to localhost:11434');
        // Fallback to localhost
        localStorage.setItem('ollama_host', 'http://localhost:11434');
        setDiscoveredHost('http://localhost:11434');
      }

      setIsDiscovering(false);
    };

    // Only run if no host is already saved
    const saved = localStorage.getItem('ollama_host');
    if (!saved) {
      discover();
    } else {
      setDiscoveredHost(saved);
      setIsDiscovering(false);
    }
  }, []);

  return { discoveredHost, isDiscovering };
}
