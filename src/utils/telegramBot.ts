/**
 * telegramBot — Full Telegram Bot API client with send + receive + polling.
 *
 * Reads bot token from VITE_TELEGRAM_BOT_TOKEN env var via infrastructure config.
 * Supports:
 *   - send_message: push text to a chat
 *   - send_notification: formatted alert with title/body
 *   - get_updates: long-poll for incoming messages (remote commands)
 *   - set_webhook / delete_webhook (if needed later)
 *
 * Uses native fetch() only. No npm packages.
 */

import { INFRASTRUCTURE } from '../config/infrastructure';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface IncomingCommand {
  chatId: number;
  text: string;
  from: string;
  timestamp: number;
  messageId: number;
}

// ─────────────────────────────────────────────────────────────
// Core API client
// ─────────────────────────────────────────────────────────────

function getToken(): string {
  return INFRASTRUCTURE.telegramBotToken || '';
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getToken()}/${method}`;
}

async function callApi<T>(
  method: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<TelegramApiResponse<T>> {
  const token = getToken();
  if (!token) {
    return { ok: false, description: 'VITE_TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    // Combine user signal with a timeout (60s for long-polling getUpdates, 15s otherwise)
    const isLongPoll = method === 'getUpdates' && typeof body.timeout === 'number' && body.timeout > 0;
    const timeoutMs = isLongPoll ? ((body.timeout as number) + 10) * 1000 : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); return { ok: false, description: 'Cancelled' }; }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let resp: Response;
    try {
      resp = await fetch(apiUrl(method), {
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

    return (await resp.json()) as TelegramApiResponse<T>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, description: `Network error: ${msg}` };
  }
}

// ─────────────────────────────────────────────────────────────
// Send operations
// ─────────────────────────────────────────────────────────────

/**
 * Send a plain text message to a Telegram chat.
 */
export async function sendMessage(
  text: string,
  chatId?: string | number,
  options?: {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    silent?: boolean;
    signal?: AbortSignal;
  },
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const targetChat = chatId || INFRASTRUCTURE.telegramChatId;
  if (!targetChat) {
    return { ok: false, error: 'No chat ID. Set VITE_TELEGRAM_CHAT_ID or pass chatId.' };
  }

  const body: Record<string, unknown> = {
    chat_id: targetChat,
    text,
    disable_web_page_preview: true,
  };
  if (options?.parseMode) body.parse_mode = options.parseMode;
  if (options?.silent) body.disable_notification = true;

  const result = await callApi<TelegramMessage>('sendMessage', body, options?.signal);

  if (!result.ok) {
    console.error('[telegramBot] sendMessage failed:', result.description);
    return { ok: false, error: result.description };
  }

  return { ok: true, messageId: result.result?.message_id };
}

/**
 * Send a formatted notification (title + body).
 * Uses HTML parse mode for clean formatting.
 */
export async function sendNotification(
  title: string,
  body: string,
  chatId?: string | number,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const html = `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;
  const result = await sendMessage(html, chatId, { parseMode: 'HTML', signal });
  return result;
}

/**
 * Send a reminder notification.
 */
export async function sendReminder(
  reminderText: string,
  chatId?: string | number,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  return sendNotification('Reminder', reminderText, chatId, signal);
}

// ─────────────────────────────────────────────────────────────
// Receive operations (polling)
// ─────────────────────────────────────────────────────────────

let _lastUpdateId = 0;

/**
 * Fetch new messages from Telegram (long polling).
 * Returns commands received since the last call.
 */
export async function getUpdates(
  timeoutSec = 0,
  signal?: AbortSignal,
): Promise<IncomingCommand[]> {
  const body: Record<string, unknown> = {
    offset: _lastUpdateId + 1,
    timeout: timeoutSec,
    allowed_updates: ['message'],
  };

  const result = await callApi<TelegramUpdate[]>('getUpdates', body, signal);

  if (!result.ok || !result.result) {
    return [];
  }

  const commands: IncomingCommand[] = [];

  for (const update of result.result) {
    _lastUpdateId = Math.max(_lastUpdateId, update.update_id);

    if (update.message?.text) {
      commands.push({
        chatId: update.message.chat.id,
        text: update.message.text,
        from: update.message.from?.username || update.message.from?.first_name || 'unknown',
        timestamp: update.message.date * 1000,
        messageId: update.message.message_id,
      });
    }
  }

  return commands;
}

// ─────────────────────────────────────────────────────────────
// Polling loop for background receive
// ─────────────────────────────────────────────────────────────

type CommandHandler = (cmd: IncomingCommand) => void;

let _pollActive = false;
let _pollAbort: AbortController | null = null;
let _handlers: CommandHandler[] = [];

/**
 * Start background polling for incoming Telegram messages.
 * Calls registered handlers for each new message.
 * Returns a cleanup function to stop polling.
 */
export function startPolling(handler: CommandHandler): () => void {
  _handlers.push(handler);

  if (!_pollActive) {
    _pollActive = true;
    _pollAbort = new AbortController();
    pollLoop(_pollAbort.signal);
  }

  return () => {
    _handlers = _handlers.filter(h => h !== handler);
    if (_handlers.length === 0) {
      stopPolling();
    }
  };
}

export function stopPolling(): void {
  _pollActive = false;
  if (_pollAbort) {
    _pollAbort.abort();
    _pollAbort = null;
  }
  _handlers = [];
}

async function pollLoop(signal: AbortSignal): Promise<void> {
  while (_pollActive && !signal.aborted) {
    try {
      const commands = await getUpdates(30, signal);
      for (const cmd of commands) {
        for (const handler of _handlers) {
          try {
            handler(cmd);
          } catch (err) {
            console.error('[telegramBot] Handler error:', err);
          }
        }
      }
    } catch (err) {
      if (signal.aborted) break;
      console.warn('[telegramBot] Poll error, retrying in 5s:', err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Bot info
// ─────────────────────────────────────────────────────────────

/**
 * Verify bot token is valid. Returns bot username on success.
 */
export async function getMe(): Promise<{ ok: boolean; username?: string; error?: string }> {
  const result = await callApi<TelegramUser>('getMe', {});
  if (!result.ok) {
    return { ok: false, error: result.description };
  }
  return { ok: true, username: result.result?.username };
}

/**
 * Check if Telegram bot is configured and reachable.
 */
export async function isConfigured(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const info = await getMe();
  return info.ok;
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parse a natural-language time expression into milliseconds from now.
 * Supports: "5 minutes", "2 hours", "30 seconds", "1 day", "1.5 hours"
 */
export function parseTimeExpression(expr: string): number | null {
  const match = expr.match(/(\d+(?:\.\d+)?)\s*(s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?)/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('s')) return value * 1000;
  if (unit.startsWith('m')) return value * 60 * 1000;
  if (unit.startsWith('h')) return value * 60 * 60 * 1000;
  if (unit.startsWith('d')) return value * 24 * 60 * 60 * 1000;

  return null;
}
