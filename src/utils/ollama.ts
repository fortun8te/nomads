const OLLAMA_HOST = process.env.VITE_OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_API = `${OLLAMA_HOST}/api/generate`;

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
      const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
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
    const { model = 'mistral', onChunk, onComplete, onError, signal } = options;

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    let fullResponse = '';

    try {
      const response = await fetch(OLLAMA_API, {
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
              if (json.response) {
                fullResponse += json.response;
                onChunk?.(json.response);
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
          }
        } catch {
          // Ignore
        }
      }

      onComplete?.();
      return fullResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  },

  async generate(
    prompt: string,
    systemPrompt: string,
    model: string = 'qwen3:8b'
  ): Promise<string> {
    return this.generateStream(prompt, systemPrompt, { model });
  },
};
