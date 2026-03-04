function getOllamaHost(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('ollama_host');
    if (saved) return saved;
  }
  return import.meta.env.VITE_OLLAMA_HOST || 'http://localhost:11434';
}

// Auto-discover Ollama by trying common locations
export async function discoverOllama(): Promise<string | null> {
  const candidates = [
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://100.74.135.83:11434', // Tailscale
    'http://ollama:11434', // Docker
  ];

  console.debug('[Ollama] Auto-discovering Ollama at:', candidates);

  for (const host of candidates) {
    try {
      const response = await Promise.race([
        fetch(`${host}/api/tags`, { method: 'GET' }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        ),
      ]);

      if (response.ok) {
        console.debug('[Ollama] Found Ollama at:', host);
        return host;
      }
    } catch (e) {
      console.debug('[Ollama] Not at', host);
    }
  }

  console.debug('[Ollama] No Ollama found at any candidate location');
  return null;
}

function getOllamaApi(): string {
  return `${getOllamaHost()}/api/generate`;
}

export interface OllamaOptions {
  model?: string;
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
}

export const ollamaService = {
  async checkConnection(): Promise<boolean> {
    try {
      const host = getOllamaHost();
      console.debug('[Ollama] Checking connection to:', host);
      const response = await fetch(`${host}/api/tags`, {
        method: 'GET',
      });
      console.debug('[Ollama] Connection check:', response.ok ? 'OK' : 'FAILED');
      return response.ok;
    } catch (e) {
      console.error('[Ollama] Connection error:', e);
      return false;
    }
  },

  async testConnection(): Promise<{ success: boolean; message: string; response?: string }> {
    try {
      const host = getOllamaHost();
      console.debug('[Ollama] Testing connection with minimal prompt...');

      const response = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral',
          prompt: 'Respond with exactly: YES',
          stream: false,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Ollama] Test failed:', response.status, error);
        return {
          success: false,
          message: `HTTP ${response.status}: ${error}`,
        };
      }

      const data = await response.json() as { response?: string };
      const responseText = data.response || '';
      console.debug('[Ollama] Test response:', responseText);

      const success = responseText.toLowerCase().includes('yes');
      return {
        success,
        message: success ? '✅ Connection OK! Ollama is responding.' : '⚠️ Ollama responded but unexpected answer.',
        response: responseText,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Ollama] Test connection error:', msg);
      return {
        success: false,
        message: `❌ Connection failed: ${msg}`,
      };
    }
  },

  async generateStream(
    prompt: string,
    systemPrompt: string,
    options: OllamaOptions = {}
  ): Promise<string> {
    const { model = 'glm-4.7-flash:q4_K_M', onChunk, onComplete, onError, signal } = options;

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    let fullResponse = '';
    const startTime = Date.now();

    console.debug('[Ollama] Generate request:', {
      model,
      host: getOllamaHost(),
      promptLength: prompt.length,
      systemPromptLength: systemPrompt.length,
    });

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
          temperature: 0.7,
          top_p: 0.9,
        }),
        signal,
      });

      console.debug('[Ollama] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Ollama] API error:', response.status, response.statusText, errorText);
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}. ${errorText || 'Check server connection'}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body from Ollama. The server may not support streaming.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;
      let tokenCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.debug('[Ollama] Stream complete. Total chunks:', chunkCount, 'Total tokens:', tokenCount);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              if (json.response) {
                fullResponse += json.response;
                chunkCount++;
                tokenCount += json.response.length;
                console.debug('[Ollama] Chunk', chunkCount, '- tokens:', json.response.length);
                onChunk?.(json.response);
              }
            } catch (e) {
              console.warn('[Ollama] JSON parse error on line:', line.substring(0, 50));
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
            chunkCount++;
            tokenCount += json.response.length;
            console.debug('[Ollama] Final chunk -', json.response.length, 'tokens');
            onChunk?.(json.response);
          }
        } catch (e) {
          console.warn('[Ollama] Final buffer parse error');
        }
      }

      const duration = Date.now() - startTime;
      console.debug('[Ollama] Generation complete:', {
        duration: `${duration}ms`,
        totalTokens: tokenCount,
        totalChunks: chunkCount,
        responseLength: fullResponse.length,
      });

      onComplete?.();
      return fullResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Ollama] Generation error after', duration, 'ms:', err.message);
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
