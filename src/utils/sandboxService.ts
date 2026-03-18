/**
 * Sandbox Service — TypeScript client for the Docker sandbox API (port 8080).
 * Provides browser control + DOM element indexing.
 */

const SANDBOX_API = 'http://localhost:8080';

export interface ElementInfo {
  index: number;
  tag: string;
  text: string;
  href: string;
  type: string;
  placeholder: string;
  ariaLabel: string;
  role: string;
  rect: { x: number; y: number; w: number; h: number };
}

export interface PageInfo {
  error: string | null;
  title: string;
  url: string;
  scroll_y: number;
  page_height: number;
}

export interface ViewResult extends PageInfo {
  elements: ElementInfo[];
  pageText: string;
}

export interface ScreenshotResult extends PageInfo {
  image_base64: string;
}

async function post<T = PageInfo>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${SANDBOX_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Sandbox API ${path}: ${res.status}`);
  return res.json();
}

export const sandboxService = {
  /** Check if sandbox is running and responsive. */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${SANDBOX_API}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  },

  /** Navigate to URL. */
  async navigate(url: string): Promise<PageInfo> {
    return post('/browser/navigate', { url });
  },

  /** Inject element IDs, return interactive elements + page text. */
  async view(): Promise<ViewResult> {
    return post<ViewResult>('/browser/view');
  },

  /** Click element by index number. */
  async click(index: number): Promise<PageInfo> {
    return post('/browser/click', { index });
  },

  /** Click at pixel coordinates. */
  async clickCoords(x: number, y: number): Promise<PageInfo> {
    return post('/browser/click', { x, y });
  },

  /** Type text into element by index. */
  async input(index: number, text: string, pressEnter = false): Promise<PageInfo> {
    return post('/browser/input', { index, text, press_enter: pressEnter });
  },

  /** Scroll page. */
  async scroll(direction: 'up' | 'down' = 'down', amount = 500): Promise<PageInfo> {
    return post('/browser/scroll', { direction, amount });
  },

  /** Press keyboard key. */
  async pressKey(key: string): Promise<PageInfo> {
    return post('/browser/press_key', { key });
  },

  /** Go back. */
  async back(): Promise<PageInfo> {
    return post('/browser/back');
  },

  /** Go forward. */
  async forward(): Promise<PageInfo> {
    return post('/browser/forward');
  },

  /** Take screenshot (fallback). */
  async screenshot(quality = 60): Promise<ScreenshotResult> {
    return post<ScreenshotResult>('/browser/screenshot', { quality });
  },

  /** Execute JavaScript on page. */
  async consoleExec(js: string): Promise<{ error: string | null; result: string | null }> {
    return post('/browser/console_exec', { js });
  },

  /** Format elements for LLM prompt. */
  formatElements(elements: ElementInfo[]): string {
    return elements.map(el => {
      const tag = el.tag.toUpperCase();
      const text = el.text.slice(0, 60);
      const placeholder = el.placeholder;
      const type = el.type;
      const role = el.role;

      if (tag === 'INPUT') {
        let desc = `INPUT[${type}]`;
        if (placeholder) desc += ` placeholder="${placeholder}"`;
        if (text) desc += ` value="${text}"`;
        return `[${el.index}] ${desc}`;
      }
      if (tag === 'TEXTAREA') {
        let desc = 'TEXTAREA';
        if (placeholder) desc += ` placeholder="${placeholder}"`;
        return `[${el.index}] ${desc}`;
      }
      if (tag === 'SELECT') {
        return `[${el.index}] SELECT${text ? ` selected="${text}"` : ''}`;
      }
      if (tag === 'A') {
        return `[${el.index}] LINK "${text}"`;
      }
      if (tag === 'BUTTON' || role === 'button') {
        return `[${el.index}] BUTTON "${text}"`;
      }
      let desc = tag;
      if (role) desc += `[${role}]`;
      if (text) desc += ` "${text}"`;
      return `[${el.index}] ${desc}`;
    }).join('\n');
  },

  /** VNC WebSocket URL. */
  get vncUrl(): string {
    return 'ws://localhost:5901';
  },
};
