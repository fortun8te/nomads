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
      const { model = 'mistral', signal, onChunk } = options || {};
      setIsLoading(true);
      setError(null);
      setOutput('');

      try {
        const result = await ollamaService.generateStream(prompt, systemPrompt, {
          model,
          signal,
          onChunk: (chunk) => {
            onChunk?.(chunk);
            setOutput((prev) => prev + chunk);
          },
          onError: (err) => setError(err.message),
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
      const { model = 'qwen3:8b', signal, onChunk, onError } = options || {};
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

  return {
    isConnected,
    isLoading,
    error,
    output,
    generate,
    generateWithCallback,
    checkConnection,
  };
}
