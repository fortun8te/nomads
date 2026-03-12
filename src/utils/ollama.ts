// Ollama routing:
//   Default: Wayfarer proxy (localhost:8889/ollama/...) → remote Ollama
//   "local:" prefix: direct to localhost:11434 (no proxy needed, same-origin)
// Wayfarer handles: CORS bypass, streaming, duplicate-header tolerance
import { tokenTracker } from './tokenStats';

const WAYFARER_OLLAMA = 'http://localhost:8889/ollama';
const LOCAL_OLLAMA = 'http://localhost:11434';

/** Strip "local:" prefix and return [cleanModel, apiBase] */
export function resolveModel(model: string): [string, string] {
  if (model.startsWith('local:')) {
    return [model.slice(6), LOCAL_OLLAMA];
  }
  return [model, WAYFARER_OLLAMA];
}

export function getOllamaHost(): string {
  return WAYFARER_OLLAMA;
}

export function getLocalOllamaHost(): string {
  return LOCAL_OLLAMA;
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
    const { model = 'qwen3.5:9b', temperature = 0.7, images, onChunk, onComplete, onError, signal } = options;
    const [cleanModel, apiBase] = resolveModel(model);

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    let fullResponse = '';

    tokenTracker.startCall(cleanModel);

    let timeoutId: NodeJS.Timeout | undefined;
    try {
      // Create a timeout signal that aborts after 300s (5 min) if no signal provided
      let fetchSignal = signal;
      if (!signal) {
        const controller = new AbortController();
        fetchSignal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), 300000);
      }

      const response = await fetch(`${apiBase}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: cleanModel,
          prompt: fullPrompt,
          stream: true,
          temperature,
          top_p: 0.9,
          ...(images && images.length > 0 ? { images } : {}),
        }),
        signal: fetchSignal,
      });

      // Clear timeout once fetch connection is established
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = undefined; }

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
                tokenTracker.tick(json.response);
              }

              // Thinking tokens (GLM-4.7, Qwen3, etc.) — model is reasoning internally.
              // Don't add to fullResponse (we only want the final answer),
              // but tick so the UI shows "thinking" instead of "loading model".
              if (json.thinking) {
                tokenTracker.tickThinking(json.thinking);
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
            tokenTracker.tick(json.response);
          }
          if (json.thinking) {
            tokenTracker.tickThinking(json.thinking);
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
      if (timeoutId) clearTimeout(timeoutId);
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
