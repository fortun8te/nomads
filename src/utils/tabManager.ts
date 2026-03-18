import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowserTab {
  id: string;
  machineId: string;
  sessionId: string | null;
  url: string;
  title: string;
  status: 'loading' | 'ready' | 'error' | 'closed';
  screenshotB64?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface Machine {
  id: string;
  name: string;
  type: 'sandbox' | 'wayfarer';
  baseUrl: string;
  vncUrl?: string;
  status: 'online' | 'offline' | 'busy';
  maxTabs: number;
}

export interface TabManagerState {
  machines: Machine[];
  tabs: BrowserTab[];
  activeTabId: string | null;
  activeMachineId: string | null;
}

export type TabManagerEvent =
  | 'tabCreated'
  | 'tabClosed'
  | 'tabSwitched'
  | 'tabUpdated'
  | 'machineAdded'
  | 'machineRemoved'
  | 'stateChanged';

export type TabManagerCallback = (payload: unknown) => void;

// ---------------------------------------------------------------------------
// TabManager class
// ---------------------------------------------------------------------------

export class TabManager {
  private machines: Map<string, Machine> = new Map();
  private tabs: Map<string, BrowserTab> = new Map();
  private activeTabId: string | null = null;
  private activeMachineId: string | null = null;
  private listeners: Map<TabManagerEvent, Set<TabManagerCallback>> = new Map();

  // ---- Event system -------------------------------------------------------

  on(event: TabManagerEvent, callback: TabManagerCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: TabManagerEvent, callback: TabManagerCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: TabManagerEvent, payload?: unknown): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[TabManager] listener error on "${event}":`, err);
      }
    });
    // Every mutation also fires a generic stateChanged so the React hook
    // can re-render with a single listener.
    if (event !== 'stateChanged') {
      this.listeners.get('stateChanged')?.forEach((cb) => {
        try {
          cb(this.getState());
        } catch (err) {
          console.error('[TabManager] stateChanged listener error:', err);
        }
      });
    }
  }

  // ---- Machine management -------------------------------------------------

  addMachine(machine: Machine): Machine {
    if (this.machines.has(machine.id)) {
      throw new Error(`Machine "${machine.id}" already registered`);
    }
    this.machines.set(machine.id, { ...machine });

    if (this.activeMachineId === null) {
      this.activeMachineId = machine.id;
    }

    this.emit('machineAdded', machine);
    return machine;
  }

  removeMachine(machineId: string): void {
    if (!this.machines.has(machineId)) return;

    // Close every tab belonging to this machine
    const tabsToClose = this.getTabsByMachine(machineId);
    for (const tab of tabsToClose) {
      this.closeTab(tab.id);
    }

    this.machines.delete(machineId);

    // If the removed machine was active, switch to the first remaining one
    if (this.activeMachineId === machineId) {
      const remaining = Array.from(this.machines.keys());
      this.activeMachineId = remaining.length > 0 ? remaining[0] : null;
    }

    this.emit('machineRemoved', { machineId });
  }

  getMachine(machineId: string): Machine | undefined {
    const m = this.machines.get(machineId);
    return m ? { ...m } : undefined;
  }

  getMachines(): Machine[] {
    return Array.from(this.machines.values()).map((m) => ({ ...m }));
  }

  updateMachineStatus(machineId: string, status: Machine['status']): void {
    const machine = this.machines.get(machineId);
    if (!machine) return;
    machine.status = status;
    this.emit('stateChanged', this.getState());
  }

  // ---- Tab management -----------------------------------------------------

  createTab(machineId: string, url = 'about:blank'): BrowserTab {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new Error(`Machine "${machineId}" not found`);
    }

    const machineTabs = this.getTabsByMachine(machineId);
    if (machineTabs.length >= machine.maxTabs) {
      throw new Error(
        `Machine "${machineId}" has reached its tab limit (${machine.maxTabs})`
      );
    }

    const now = Date.now();
    const tab: BrowserTab = {
      id: generateId(),
      machineId,
      sessionId: null,
      url,
      title: url === 'about:blank' ? 'New Tab' : url,
      status: url === 'about:blank' ? 'ready' : 'loading',
      createdAt: now,
      lastActiveAt: now,
    };

    this.tabs.set(tab.id, tab);

    // Auto-switch to the newly created tab
    this.activeTabId = tab.id;
    this.activeMachineId = machineId;

    this.emit('tabCreated', { ...tab });
    return { ...tab };
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    tab.status = 'closed';
    this.tabs.delete(tabId);

    // If the closed tab was active, pick the most-recently-active sibling
    if (this.activeTabId === tabId) {
      const siblings = this.getTabsByMachine(tab.machineId);
      if (siblings.length > 0) {
        siblings.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
        this.activeTabId = siblings[0].id;
      } else {
        this.activeTabId = null;
      }
    }

    this.emit('tabClosed', { tabId, machineId: tab.machineId });
  }

  switchTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab "${tabId}" not found`);
    }
    if (tab.status === 'closed') {
      throw new Error(`Tab "${tabId}" is closed`);
    }

    const previousTabId = this.activeTabId;
    this.activeTabId = tabId;
    this.activeMachineId = tab.machineId;
    tab.lastActiveAt = Date.now();

    this.emit('tabSwitched', {
      previousTabId,
      newTabId: tabId,
      machineId: tab.machineId,
    });
  }

  updateTab(
    tabId: string,
    updates: Partial<Pick<BrowserTab, 'url' | 'title' | 'status' | 'screenshotB64' | 'sessionId'>>
  ): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab "${tabId}" not found`);
    }

    if (updates.url !== undefined) tab.url = updates.url;
    if (updates.title !== undefined) tab.title = updates.title;
    if (updates.status !== undefined) tab.status = updates.status;
    if (updates.screenshotB64 !== undefined) tab.screenshotB64 = updates.screenshotB64;
    if (updates.sessionId !== undefined) tab.sessionId = updates.sessionId;

    tab.lastActiveAt = Date.now();

    this.emit('tabUpdated', { tabId, updates });
  }

  getActiveTab(): BrowserTab | null {
    if (!this.activeTabId) return null;
    const tab = this.tabs.get(this.activeTabId);
    return tab ? { ...tab } : null;
  }

  getTab(tabId: string): BrowserTab | undefined {
    const t = this.tabs.get(tabId);
    return t ? { ...t } : undefined;
  }

  getTabsByMachine(machineId: string): BrowserTab[] {
    return Array.from(this.tabs.values())
      .filter((t) => t.machineId === machineId)
      .map((t) => ({ ...t }));
  }

  getAllTabs(): BrowserTab[] {
    return Array.from(this.tabs.values()).map((t) => ({ ...t }));
  }

  // ---- State snapshot ------------------------------------------------------

  getState(): TabManagerState {
    return {
      machines: this.getMachines(),
      tabs: this.getAllTabs(),
      activeTabId: this.activeTabId,
      activeMachineId: this.activeMachineId,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Default machines
// ---------------------------------------------------------------------------

const DEFAULT_SANDBOX_MACHINE: Machine = {
  id: 'local-sandbox',
  name: 'Local Sandbox',
  type: 'sandbox',
  baseUrl: 'http://localhost:8080',
  vncUrl: 'ws://localhost:5901',
  status: 'offline',
  maxTabs: 8,
};

const DEFAULT_WAYFARER_MACHINE: Machine = {
  id: 'local-wayfarer',
  name: 'Wayfarer',
  type: 'wayfarer',
  baseUrl: 'http://localhost:8889',
  status: 'offline',
  maxTabs: 4,
};

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let singletonManager: TabManager | null = null;

function getTabManager(): TabManager {
  if (!singletonManager) {
    singletonManager = new TabManager();
    singletonManager.addMachine(DEFAULT_SANDBOX_MACHINE);
    singletonManager.addMachine(DEFAULT_WAYFARER_MACHINE);
  }
  return singletonManager;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseTabManagerReturn {
  state: TabManagerState;
  manager: TabManager;
  machines: Machine[];
  tabs: BrowserTab[];
  activeTab: BrowserTab | null;
  createTab: (machineId: string, url?: string) => BrowserTab;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateTab: (
    tabId: string,
    updates: Partial<Pick<BrowserTab, 'url' | 'title' | 'status' | 'screenshotB64' | 'sessionId'>>
  ) => void;
  addMachine: (machine: Machine) => Machine;
  removeMachine: (machineId: string) => void;
}

export function useTabManager(): UseTabManagerReturn {
  const managerRef = useRef<TabManager>(getTabManager());
  const mgr = managerRef.current;

  const [state, setState] = useState<TabManagerState>(() => mgr.getState());

  useEffect(() => {
    const onChange = (newState: unknown) => {
      setState(newState as TabManagerState);
    };
    mgr.on('stateChanged', onChange);
    // Sync in case state changed between render and effect
    setState(mgr.getState());
    return () => {
      mgr.off('stateChanged', onChange);
    };
  }, [mgr]);

  const createTab = useCallback(
    (machineId: string, url?: string) => mgr.createTab(machineId, url),
    [mgr]
  );
  const closeTab = useCallback((tabId: string) => mgr.closeTab(tabId), [mgr]);
  const switchTab = useCallback((tabId: string) => mgr.switchTab(tabId), [mgr]);
  const updateTab = useCallback(
    (
      tabId: string,
      updates: Partial<Pick<BrowserTab, 'url' | 'title' | 'status' | 'screenshotB64' | 'sessionId'>>
    ) => mgr.updateTab(tabId, updates),
    [mgr]
  );
  const addMachine = useCallback(
    (machine: Machine) => mgr.addMachine(machine),
    [mgr]
  );
  const removeMachine = useCallback(
    (machineId: string) => mgr.removeMachine(machineId),
    [mgr]
  );

  return {
    state,
    manager: mgr,
    machines: state.machines,
    tabs: state.tabs,
    activeTab: state.tabs.find((t) => t.id === state.activeTabId) ?? null,
    createTab,
    closeTab,
    switchTab,
    updateTab,
    addMachine,
    removeMachine,
  };
}
