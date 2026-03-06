/**
 * Freepik Image Generator Client
 *
 * Calls the freepik_server.py backend (port 8890) which automates
 * Freepik Pikaso via Playwright. Streams NDJSON progress events
 * for real-time UI feedback (including server busy warnings).
 *
 * Usage:
 *   const result = await generateImage({
 *     prompt: 'A sleek cologne ad with dark background',
 *     model: 'nano-banana-2',
 *     onProgress: (msg) => setProgress(msg),
 *     onWarning: (msg) => console.warn(msg),
 *     onEtaUpdate: (secs) => setEta(secs),
 *   });
 */

const FREEPIK_SERVER = 'http://localhost:8890';

export interface GenerateImageResult {
  imageBase64: string;
  success: boolean;
  error?: string;
}

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;  // '1:1' | '9:16' | '16:9' | '4:5' | etc.
  referenceImages?: string[];  // base64 images (data URLs or raw base64)
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onWarning?: (message: string) => void;
  onEtaUpdate?: (seconds: number) => void;
}

/**
 * Generate an image via Freepik Pikaso.
 * Streams progress updates from the backend server.
 */
export async function generateImage(
  opts: GenerateImageOptions
): Promise<GenerateImageResult> {
  const {
    prompt,
    model = 'nano-banana-2',
    aspectRatio = '1:1',
    referenceImages = [],
    signal,
    onProgress,
    onWarning,
    onEtaUpdate,
  } = opts;

  try {
    // Health check with retry (server may be auto-starting)
    let serverReady = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const health = await fetch(`${FREEPIK_SERVER}/api/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (health.ok) { serverReady = true; break; }
      } catch {
        // Not ready yet
      }
      if (attempt < 2) {
        onProgress?.('Waiting for Freepik server to start...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (!serverReady) {
      return {
        imageBase64: '',
        success: false,
        error: 'Freepik server not reachable. It should auto-start with the dev server — try again in a few seconds.',
      };
    }

    onProgress?.('Connecting to Freepik server...');

    const response = await fetch(`${FREEPIK_SERVER}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model,
        aspect_ratio: aspectRatio,
        reference_images: referenceImages,
      }),
      signal,
    });

    if (!response.ok) {
      return {
        imageBase64: '',
        success: false,
        error: `Server error: ${response.status} ${response.statusText}`,
      };
    }

    // Stream NDJSON events
    const reader = response.body?.getReader();
    if (!reader) {
      return { imageBase64: '', success: false, error: 'No response stream' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let result: GenerateImageResult = {
      imageBase64: '',
      success: false,
      error: 'No result received',
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          switch (event.type) {
            case 'progress':
              onProgress?.(event.message);
              break;
            case 'warning':
              onWarning?.(event.message);
              onProgress?.(event.message);
              break;
            case 'eta_update':
              onEtaUpdate?.(event.seconds);
              break;
            case 'complete':
              result = {
                imageBase64: event.image_base64,
                success: event.success,
              };
              break;
            case 'error':
              result = {
                imageBase64: '',
                success: false,
                error: event.message,
              };
              break;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    return result;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { imageBase64: '', success: false, error: 'Cancelled' };
    }
    return {
      imageBase64: '',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check if the Freepik server is running and ready
 */
export async function checkServerStatus(): Promise<boolean> {
  try {
    const resp = await fetch(`${FREEPIK_SERVER}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
