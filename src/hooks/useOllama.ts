import { useState, useCallback } from 'react';
import { ollamaService } from '../utils/ollama';

export function useOllama() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState('');

  const checkConnection = useCallback(async () => {
    try {
      const connected = await ollamaService.checkConnection();
      setIsConnected(connected);
      if (!connected) {
        setError('Cannot connect to Ollama. Using remote Cloudflare tunnel.');
      } else {
        setError(null);
      }
      return connected;
    } catch (err) {
      setIsConnected(false);
      setError('Checking Ollama connection...');
      return false;
    }
  }, []);

  const generate = useCallback(
    async (
      prompt: string,
      systemPrompt: string,
      options?: {
        model?: string;
        signal?: AbortSignal;
        onChunk?: (chunk: string) => void;
      }
    ) => {
      const { model = 'glm-4.7-flash:q4_K_M', signal, onChunk } = options || {};
      console.debug('[useOllama] generate() called', { model, promptLength: prompt.length });
      setIsLoading(true);
      setError(null);
      setOutput('');

      try {
        const result = await ollamaService.generateStream(prompt, systemPrompt, {
          model,
          signal,
          onChunk: (chunk) => {
            console.debug('[useOllama] Chunk received:', chunk.length, 'chars');
            onChunk?.(chunk);
            setOutput((prev) => prev + chunk);
          },
          onError: (err) => setError(err.message),
        });

        console.debug('[useOllama] generate() complete, result length:', result.length);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[useOllama] generate() error:', errorMsg);
        setError(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const generateWithCallback = useCallback(
    async (
      prompt: string,
      systemPrompt: string,
      options?: {
        model?: string;
        signal?: AbortSignal;
        onChunk?: (chunk: string) => void;
        onError?: (error: Error) => void;
      }
    ) => {
      const { model = 'glm-4.7-flash:q4_K_M', signal, onChunk, onError } = options || {};
      setIsLoading(true);
      setError(null);

      try {
        const result = await ollamaService.generateStream(prompt, systemPrompt, {
          model,
          signal,
          onChunk: (chunk) => {
            onChunk?.(chunk);
            setOutput((prev) => prev + chunk);
          },
          onError: (err) => {
            onError?.(err);
            setError(err.message);
          },
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const testConnection = useCallback(async () => {
    console.debug('[useOllama] testConnection() called');
    const result = await ollamaService.testConnection();
    console.debug('[useOllama] testConnection() result:', result);
    return result;
  }, []);

  return {
    isConnected,
    isLoading,
    error,
    output,
    generate,
    generateWithCallback,
    checkConnection,
    testConnection,
  };
}
