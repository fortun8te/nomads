/**
 * Sandbox Service — TypeScript client for Docker sandbox API (port 8080).
 * Provides browser control + DOM element indexing + tab management.
 *
 * Architecture:
 *   MachineClient  — instance-based client for a single sandbox machine
 *   MachinePool    — registry of MachineClient instances
 *   sandboxService — backward-compatible proxy that delegates to the default machine
 */

// ── Types ──

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

export interface TabInfo {
  index: number;
  url: string;
  title: string;
  active: boolean;
}

// ── MachineClient ──

export class MachineClient {
  readonly machineId: string;
  readonly baseUrl: string;
  readonly vncWsUrl: string;

  constructor(machineId: string, baseUrl: string, vncWsUrl: string) {
    this.machineId = machineId;
    this.baseUrl = baseUrl;
    this.vncWsUrl = vncWsUrl;
  }

  // ── Internal HTTP helper ──

  private async post<T = PageInfo>(path: string, body?: object): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Sandbox API ${path}: ${res.status}`);
    return res.json();
  }

  // ── Core browser methods ──

  /** Check if sandbox is running and responsive. */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  /** Navigate to URL. */
  async navigate(url: string): Promise<PageInfo> {
    return this.post('/browser/navigate', { url });
  }

  /** Inject element IDs, return interactive elements + page text. */
  async view(): Promise<ViewResult> {
    return this.post<ViewResult>('/browser/view');
  }

  /** Click element by index number. */
  async click(index: number): Promise<PageInfo> {
    return this.post('/browser/click', { index });
  }

  /** Click at pixel coordinates. */
  async clickCoords(x: number, y: number): Promise<PageInfo> {
    return this.post('/browser/click', { x, y });
  }

  /** Type text into element by index. */
  async input(index: number, text: string, pressEnter = false): Promise<PageInfo> {
    return this.post('/browser/input', { index, text, press_enter: pressEnter });
  }

  /** Scroll page. */
  async scroll(direction: 'up' | 'down' = 'down', amount = 500): Promise<PageInfo> {
    return this.post('/browser/scroll', { direction, amount });
  }

  /** Press keyboard key. */
  async pressKey(key: string): Promise<PageInfo> {
    return this.post('/browser/press_key', { key });
  }

  /** Go back. */
  async back(): Promise<PageInfo> {
    return this.post('/browser/back');
  }

  /** Go forward. */
  async forward(): Promise<PageInfo> {
    return this.post('/browser/forward');
  }

  /** Take screenshot (fallback). */
  async screenshot(quality = 60): Promise<ScreenshotResult> {
    return this.post<ScreenshotResult>('/browser/screenshot', { quality });
  }

  /** Execute JavaScript on page. */
  async consoleExec(js: string): Promise<{ error: string | null; result: string | null }> {
    return this.post('/browser/console_exec', { js });
  }

  // ── Tab Management ──

  /** List all open browser tabs. */
  async listTabs(): Promise<TabInfo[]> {
    try {
      return await this.post<TabInfo[]>('/browser/tabs');
    } catch {
      // Fallback: return single tab with current page info
      try {
        const viewData = await this.view();
        return [{ index: 0, url: viewData.url, title: viewData.title, active: true }];
      } catch {
        return [];
      }
    }
  }

  /** Open a new tab with optional URL. */
  async openTab(url?: string): Promise<PageInfo> {
    try {
      return await this.post('/browser/tab/open', { url: url || 'about:blank' });
    } catch {
      // Fallback: use JS window.open
      await this.consoleExec(`window.open("${url || 'about:blank'}", "_blank")`);
      return { error: null, title: '', url: url || 'about:blank', scroll_y: 0, page_height: 0 };
    }
  }

  /** Switch to a tab by index. */
  async switchTab(index: number): Promise<PageInfo> {
    try {
      return await this.post('/browser/tab/switch', { index });
    } catch {
      // Fallback: use keyboard shortcut
      await this.pressKey(`ctrl+${Math.min(index + 1, 9)}`);
      return { error: null, title: '', url: '', scroll_y: 0, page_height: 0 };
    }
  }

  /** Close the current tab. */
  async closeTab(): Promise<PageInfo> {
    try {
      return await this.post('/browser/tab/close');
    } catch {
      await this.pressKey('ctrl+w');
      return { error: null, title: '', url: '', scroll_y: 0, page_height: 0 };
    }
  }

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
  }

  /** VNC WebSocket URL. */
  get vncUrl(): string {
    return this.vncWsUrl;
  }
}

// ── MachinePool ──

export class MachinePool {
  private machines: Map<string, MachineClient> = new Map();
  private defaultId: string | null = null;

  /** Register a new machine. Returns the created MachineClient. */
  register(machineId: string, baseUrl: string, vncWsUrl: string): MachineClient {
    const client = new MachineClient(machineId, baseUrl, vncWsUrl);
    this.machines.set(machineId, client);
    if (this.defaultId === null) {
      this.defaultId = machineId;
    }
    return client;
  }

  /** Get a machine by ID. */
  get(machineId: string): MachineClient | undefined {
    return this.machines.get(machineId);
  }

  /** Get the default machine. Throws if none registered. */
  getDefault(): MachineClient {
    if (this.defaultId === null) {
      throw new Error('MachinePool: no machines registered');
    }
    const client = this.machines.get(this.defaultId);
    if (!client) {
      throw new Error(`MachinePool: default machine "${this.defaultId}" not found`);
    }
    return client;
  }

  /** Get all registered machines. */
  getAll(): MachineClient[] {
    return Array.from(this.machines.values());
  }

  /** Remove a machine by ID. */
  remove(machineId: string): void {
    this.machines.delete(machineId);
    if (this.defaultId === machineId) {
      const remaining = Array.from(this.machines.keys());
      this.defaultId = remaining.length > 0 ? remaining[0] : null;
    }
  }

  /** Set a different machine as the default. */
  setDefault(machineId: string): void {
    if (!this.machines.has(machineId)) {
      throw new Error(`MachinePool: machine "${machineId}" not registered`);
    }
    this.defaultId = machineId;
  }
}

// ── Singleton pool + default machine ──

export const machinePool = new MachinePool();

// Register the default local sandbox machine on module load
machinePool.register('local-sandbox', 'http://localhost:8080', 'ws://localhost:5901');

// ── Backward-compatible sandboxService proxy ──
// Existing code that imports `sandboxService` continues to work unchanged.
// The proxy delegates every property access / method call to machinePool.getDefault().

export const sandboxService: MachineClient = new Proxy({} as MachineClient, {
  get(_target, prop) {
    const defaultMachine = machinePool.getDefault();
    const value = (defaultMachine as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return value.bind(defaultMachine);
    }
    return value;
  },
});
