// Ollama routing:
//   Default: Wayfayer proxy (localhost:8889/ollama/...) → remote Ollama
//   "local:" prefix: direct to the configured endpoint (bypasses proxy)
// Wayfayer handles: CORS bypass, streaming, duplicate-header tolerance
//
// Endpoint is configurable via Settings → getOllamaEndpoint() (localStorage).
// Retry logic: 3 attempts with 2s delay for transient network failures.
// Health check: ollamaService.healthCheck() returns detailed status.

import { tokenTracker } from './tokenStats';
import { getOllamaEndpoint } from './modelConfig';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DIRECT_OLLAMA = 'http://100.74.135.83:11440';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ─────────────────────────────────────────────────────────────
// Connection state — shared across the app
// ─────────────────────────────────────────────────────────────

export type OllamaConnectionStatus = 'unknown' | 'connected' | 'disconnected';

export interface OllamaHealthResult {
  status: OllamaConnectionStatus;
  endpoint: string;
  latencyMs: number;
  modelCount?: number;
  loadedModels?: string[];
  error?: string;
}

let _connectionStatus: OllamaConnectionStatus = 'unknown';
let _lastHealthResult: OllamaHealthResult | null = null;

type ConnectionListener = (status: OllamaConnectionStatus, result: OllamaHealthResult) => void;
const _listeners = new Set<ConnectionListener>();

function notifyListeners(status: OllamaConnectionStatus, result: OllamaHealthResult) {
  _connectionStatus = status;
  _lastHealthResult = result;
  for (const cb of _listeners) {
    try { cb(status, result); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Strip "local:" prefix and return [cleanModel, apiBase] */
function resolveModel(model: string): [string, string] {
  if (model.startsWith('local:')) {
    return [model.slice(6), DIRECT_OLLAMA];
  }
  return [model, getOllamaEndpoint()];
}

/** Sleep for ms (cancellable via signal) */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/** Check if an error is retryable (network / transient server errors) */
function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network failures
    if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('econnreset')) return true;
    // Server overloaded / temporarily unavailable
    if (msg.includes('503') || msg.includes('502') || msg.includes('429')) return true;
  }
  return false;
}

/** Returns the currently configured Ollama endpoint (delegates to modelConfig) */
export function getOllamaHost(): string {
  return getOllamaEndpoint();
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface OllamaOptions {
  model?: string;
  temperature?: number;
  top_p?: number;        // nucleus sampling (default 0.9)
  num_predict?: number;  // max tokens to generate (caps output length)
  images?: string[];     // base64-encoded images (no data: prefix), for vision models
  think?: boolean;       // Enable/disable thinking (default: model's default)
  onChunk?: (chunk: string) => void;
  onThink?: (chunk: string) => void;  // thinking/reasoning tokens (Qwen3.5 27b+)
  onComplete?: () => void;
  onError?: (error: Error) => void;
  signal?: AbortSignal;
  keep_alive?: string;   // e.g. "30m" — keep model loaded in VRAM
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

export const ollamaService = {
  /** Quick connectivity check — returns true if Ollama responds */
  async checkConnection(): Promise<boolean> {
    try {
      const endpoint = getOllamaEndpoint();
      const response = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Detailed health check — returns endpoint, latency, model count, loaded models.
   * Tries the configured endpoint first; if it fails, tries the direct Tailscale IP
   * as fallback (useful when Wayfayer is down).
   */
  async healthCheck(): Promise<OllamaHealthResult> {
    const endpoint = getOllamaEndpoint();
    const result = await probeEndpoint(endpoint);
    if (result.status === 'connected') {
      notifyListeners('connected', result);
      return result;
    }

    // Fallback: try direct Ollama if the configured endpoint is the proxy
    if (!endpoint.includes(DIRECT_OLLAMA)) {
      const fallback = await probeEndpoint(DIRECT_OLLAMA);
      if (fallback.status === 'connected') {
        fallback.error = `Primary endpoint (${endpoint}) unreachable; fell back to direct (${DIRECT_OLLAMA}). Note: direct may be blocked by browser CORS.`;
        notifyListeners('connected', fallback);
        return fallback;
      }
    }

    notifyListeners('disconnected', result);
    return result;
  },

  /** Subscribe to connection status changes */
  onConnectionChange(cb: ConnectionListener): () => void {
    _listeners.add(cb);
    return () => _listeners.delete(cb);
  },

  /** Get the last known connection status without making a request */
  getConnectionStatus(): OllamaConnectionStatus { return _connectionStatus; },
  getLastHealthResult(): OllamaHealthResult | null { return _lastHealthResult; },

  /**
   * Run a startup connectivity test. Called once on app init.
   * Logs result but does not throw.
   */
  async startupCheck(): Promise<void> {
    const result = await this.healthCheck();
    if (result.status === 'connected') {
      console.log(`[ollama] Connected to ${result.endpoint} (${result.latencyMs}ms, ${result.modelCount ?? '?'} models)`);
    } else {
      console.warn(`[ollama] Cannot reach Ollama at ${result.endpoint}: ${result.error}`);
    }
  },

  async generateStream(
    prompt: string,
    systemPrompt: string,
    options: OllamaOptions = {}
  ): Promise<string> {
    const { model = 'qwen3.5:9b', temperature = 0.7, top_p = 0.9, num_predict, images, think = false, onChunk, onThink, onComplete, onError, signal, keep_alive } = options;
    const [cleanModel, apiBase] = resolveModel(model);

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;

    // Retry wrapper for transient failures
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let fullResponse = '';
      tokenTracker.startCall(cleanModel);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
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
            top_p,
            ...(num_predict ? { num_predict } : {}),
            ...(keep_alive ? { keep_alive } : {}),
            ...(images && images.length > 0 ? { images } : {}),
            ...(think !== undefined ? { think } : {}),
          }),
          signal: fetchSignal,
        });

        // Clear timeout once fetch connection is established
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = undefined; }

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Ollama API error:', response.status, response.statusText, errorText);
          const httpErr = new Error(
            response.status === 404
              ? `Model "${cleanModel}" not found on Ollama server. Pull it first with: ollama pull ${cleanModel}`
              : `Ollama API error: ${response.status} ${response.statusText}. ${errorText || 'Check server connection'}`
          );
          // 404 (model not found) is not retryable
          if (response.status === 404) {
            tokenTracker.endCall();
            onError?.(httpErr);
            throw httpErr;
          }
          throw httpErr;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body from Ollama. The server may not support streaming.');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Idle timeout: abort if no data received for 30 seconds
        const STREAM_IDLE_TIMEOUT_MS = 30_000;
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const idleController = new AbortController();

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            idleController.abort();
            reader.cancel().catch(() => {});
          }, STREAM_IDLE_TIMEOUT_MS);
        };

        // Start the idle timer (covers initial model loading silence)
        resetIdleTimer();

        // Also listen for external abort to clean up
        const onExternalAbort = () => {
          if (idleTimer) clearTimeout(idleTimer);
          reader.cancel().catch(() => {});
        };
        signal?.addEventListener('abort', onExternalAbort, { once: true });

        try {
        while (true) {
          if (idleController.signal.aborted) {
            throw new Error('No response from model — no data received for 30 seconds. Check Ollama connection and model status.');
          }

          const { done, value } = await reader.read();
          if (done) break;

          // Data received — reset the idle timer
          resetIdleTimer();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const json = JSON.parse(line);

                // Response tokens
                if (json.response) {
                  fullResponse += json.response;
                  onChunk?.(json.response);
                  tokenTracker.tick(json.response);
                }

                // Thinking tokens
                if (json.thinking) {
                  tokenTracker.tickThinking(json.thinking);
                  onThink?.(json.thinking);
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
        } finally {
          if (idleTimer) clearTimeout(idleTimer);
          signal?.removeEventListener('abort', onExternalAbort);
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
              onThink?.(json.thinking);
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
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on user abort
        if (signal?.aborted) {
          onError?.(lastError);
          throw lastError;
        }

        // Retry if transient and we have attempts left
        if (isRetryable(error) && attempt < MAX_RETRIES) {
          console.warn(`[ollama] Attempt ${attempt}/${MAX_RETRIES} failed (${lastError.message}), retrying in ${RETRY_DELAY_MS}ms...`);
          await sleep(RETRY_DELAY_MS, signal);
          continue;
        }

        // Final attempt or non-retryable: enhance error message
        const finalError = new Error(
          lastError.message.includes('Failed to fetch')
            ? `Cannot reach Ollama at ${apiBase}. Is the server running? Check Settings > Connection.`
            : lastError.message
        );
        onError?.(finalError);
        throw finalError;
      }
    }

    // Should never reach here, but TypeScript needs it
    const fallbackErr = lastError ?? new Error('Ollama request failed after retries');
    onError?.(fallbackErr);
    throw fallbackErr;
  },

  async generate(
    prompt: string,
    systemPrompt: string,
    model: string = 'qwen3.5:9b'
  ): Promise<string> {
    return this.generateStream(prompt, systemPrompt, { model });
  },
};

// ─────────────────────────────────────────────────────────────
// Internal: probe a single endpoint
// ─────────────────────────────────────────────────────────────

async function probeEndpoint(endpoint: string): Promise<OllamaHealthResult> {
  const start = performance.now();
  try {
    const tagsResp = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const latency = Math.round(performance.now() - start);

    if (!tagsResp.ok) {
      return { status: 'disconnected', endpoint, latencyMs: latency, error: `HTTP ${tagsResp.status}` };
    }

    const data = await tagsResp.json();
    const modelCount = data.models?.length ?? 0;

    // Try to get loaded models
    let loadedModels: string[] = [];
    try {
      const psResp = await fetch(`${endpoint}/api/ps`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (psResp.ok) {
        const psData = await psResp.json();
        loadedModels = (psData.models || []).map((m: { name: string }) => m.name);
      }
    } catch { /* non-critical */ }

    return { status: 'connected', endpoint, latencyMs: latency, modelCount, loadedModels };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'disconnected', endpoint, latencyMs: latency, error: msg };
  }
}
