import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { discoverOllama } from '../utils/ollama';

interface OllamaContextType {
  host: string | null;
  isConnected: boolean;
  isDiscovering: boolean;
}

const OllamaContext = createContext<OllamaContextType>({
  host: null,
  isConnected: false,
  isDiscovering: true,
});

export function OllamaProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(true);

  useEffect(() => {
    const discover = async () => {
      console.debug('[OllamaContext] Starting discovery...');
      setIsDiscovering(true);

      const discoveredHost = await discoverOllama();

      if (discoveredHost) {
        setHost(discoveredHost);
        setIsConnected(true);
        localStorage.setItem('ollama_host', discoveredHost);
        console.debug('[OllamaContext] Connected to:', discoveredHost);
      } else {
        // Check if there's a saved host
        const saved = localStorage.getItem('ollama_host');
        if (saved) {
          setHost(saved);
        }
        setIsConnected(false);
        console.debug('[OllamaContext] Not connected');
      }

      setIsDiscovering(false);
    };

    discover();
  }, []);

  return (
    <OllamaContext.Provider value={{ host, isConnected, isDiscovering }}>
      {children}
    </OllamaContext.Provider>
  );
}

export function useOllamaStatus() {
  return useContext(OllamaContext);
}
