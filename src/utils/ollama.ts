// All Ollama calls route through the Wayfarer proxy to avoid CORS issues.
// Wayfarer (localhost:8889) forwards to the remote Ollama instance.
import { tokenTracker } from './tokenStats';

const WAYFARER_HOST = 'http://localhost:8889';

function getOllamaApi(): string {
  return `${WAYFARER_HOST}/ollama/api/generate`;
}

// Keep getOllamaHost for the Settings modal connection test
export function getOllamaHost(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('ollama_host');
    if (saved) return saved;
  }
  return import.meta.env.VITE_OLLAMA_HOST || 'http://localhost:11434';
}

export interface OllamaOptions {
  model?: string;
  temperature?: number;
  images?: string[];  // base64-encoded images (no data: prefix), for vision models like minicpm-v
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export const ollamaService = {
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${getOllamaHost()}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async generateStream(
    prompt: string,
    systemPrompt: string,
    options: OllamaOptions = {}
  ): Promise<string> {
    const { model = 'glm-4.7-flash:q4_K_M', temperature = 0.7, images, onChunk, onComplete, onError, signal } = options;

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    let fullResponse = '';

    tokenTracker.startCall();

    try {
      const response = await fetch(getOllamaApi(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          stream: true,
          temperature,
          top_p: 0.9,
          ...(images && images.length > 0 ? { images } : {}),
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama API error:', response.status, response.statusText, errorText);
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}. ${errorText || 'Check server connection'}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body from Ollama. The server may not support streaming.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);

              // Response tokens — the actual model output
              if (json.response) {
                fullResponse += json.response;
                onChunk?.(json.response);
                tokenTracker.tick();
              }

              // Thinking tokens (GLM-4.7, Qwen3, etc.) — model is reasoning internally.
              // Don't add to fullResponse (we only want the final answer),
              // but tick so the UI shows "thinking" instead of "loading model".
              if (json.thinking) {
                tokenTracker.tickThinking();
              }

              if (json.done) {
                tokenTracker.endCall(json.eval_count, json.eval_duration);
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer);
          if (json.response) {
            fullResponse += json.response;
            onChunk?.(json.response);
            tokenTracker.tick();
          }
          if (json.thinking) {
            tokenTracker.tickThinking();
          }
          if (json.done) {
            tokenTracker.endCall(json.eval_count, json.eval_duration);
          }
        } catch {
          // Ignore
        }
      }

      onComplete?.();
      return fullResponse;
    } catch (error) {
      tokenTracker.endCall(); // mark as done even on error
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  },

  async generate(
    prompt: string,
    systemPrompt: string,
    model: string = 'mistral'
  ): Promise<string> {
    return this.generateStream(prompt, systemPrompt, { model });
  },
};
