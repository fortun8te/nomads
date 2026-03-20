/**
 * telegramService — Send messages via the Telegram Bot API.
 *
 * Reads bot token and default chat ID from infrastructure config
 * (VITE_TELEGRAM_BOT_TOKEN / VITE_TELEGRAM_CHAT_ID env vars).
 *
 * The Telegram Bot API is a plain HTTPS JSON API — no SDK needed.
 * All calls go from the browser directly to api.telegram.org.
 * Note: the VITE_* env vars are embedded at build time by Vite.
 */

import { INFRASTRUCTURE } from '../config/infrastructure';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface TelegramApiResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
}

interface SendMessageParams {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getTelegramApiUrl(method: string, token: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function getConfig(): { token: string; defaultChatId: string } {
  return {
    token: INFRASTRUCTURE.telegramBotToken,
    defaultChatId: INFRASTRUCTURE.telegramChatId,
  };
}

async function callTelegramApi(
  method: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<TelegramApiResponse> {
  const { token } = getConfig();
  if (!token) {
    return { ok: false, description: 'VITE_TELEGRAM_BOT_TOKEN is not configured' };
  }

  const url = getTelegramApiUrl(method, token);

  try {
    // Combine user signal with a 15s timeout to prevent hanging requests
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); return { ok: false, description: 'Cancelled' }; }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      return { ok: false, description: `HTTP ${resp.status}` };
    }

    const data = (await resp.json()) as TelegramApiResponse;
    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, description: `Network error: ${message}` };
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Send a text message to a Telegram chat.
 *
 * @param text     The message text (plain or HTML/Markdown).
 * @param chatId   Target chat ID. Defaults to VITE_TELEGRAM_CHAT_ID if omitted.
 * @param options  Optional: parse_mode, silent notification.
 * @returns        true on success, false on failure.
 */
export async function sendTelegramMessage(
  text: string,
  chatId?: string,
  options?: {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    silent?: boolean;
    signal?: AbortSignal;
  },
): Promise<boolean> {
  const { defaultChatId } = getConfig();
  const targetChatId = chatId || defaultChatId;

  if (!targetChatId) {
    console.warn('[telegramService] No chat ID — set VITE_TELEGRAM_CHAT_ID or pass chatId explicitly');
    return false;
  }

  const params: SendMessageParams = {
    chat_id: targetChatId,
    text,
    disable_web_page_preview: true,
  };

  if (options?.parseMode) {
    params.parse_mode = options.parseMode;
  }
  if (options?.silent) {
    params.disable_notification = true;
  }

  const result = await callTelegramApi('sendMessage', params as unknown as Record<string, unknown>, options?.signal);

  if (!result.ok) {
    console.error('[telegramService] sendMessage failed:', result.description);
  }

  return result.ok;
}

/**
 * Test whether the bot token is valid and reachable.
 * Uses Telegram's getMe endpoint — returns bot info on success.
 *
 * @returns true if bot token is valid and API is reachable.
 */
export async function testTelegramConnection(): Promise<boolean> {
  const { token } = getConfig();

  if (!token) {
    console.warn('[telegramService] testTelegramConnection: no bot token configured');
    return false;
  }

  const result = await callTelegramApi('getMe', {});

  if (result.ok) {
    console.info('[telegramService] Connection OK:', result.result);
  } else {
    console.warn('[telegramService] Connection failed:', result.description);
  }

  return result.ok;
}

/**
 * Send a message with Markdown formatting.
 * Convenience wrapper around sendTelegramMessage.
 */
export async function sendTelegramMarkdown(
  text: string,
  chatId?: string,
  signal?: AbortSignal,
): Promise<boolean> {
  return sendTelegramMessage(text, chatId, { parseMode: 'HTML', signal });
}
