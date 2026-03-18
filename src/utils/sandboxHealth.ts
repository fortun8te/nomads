/**
 * Sandbox Health Manager — monitors Docker sandbox container lifecycle,
 * health checks, and auto-recovery. Updates tabManager machine status
 * when sandbox health changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabManager } from './tabManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SANDBOX_API = 'http://localhost:8080';
const VNC_WS_URL = 'ws://localhost:5901';
const MACHINE_ID = 'local-sandbox';
const DEFAULT_POLL_MS = 10_000;
const HEALTH_TIMEOUT_MS = 3_000;
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxStatus {
  containerId?: string;
  running: boolean;
  healthy: boolean;
  uptime?: number; // seconds
  lastHealthCheck?: number;
  browserReady: boolean;
  vncReady: boolean;
  memoryUsageMB?: number;
  error?: string;
}

export type HealthEventType = 'statusChanged' | 'healthCheck' | 'autoRestart' | 'error';

export type HealthCallback = (event: { type: HealthEventType; status: SandboxStatus }) => void;

// ---------------------------------------------------------------------------
// SandboxHealthManager class
// ---------------------------------------------------------------------------

export class SandboxHealthManager {
  private status: SandboxStatus = {
    running: false,
    healthy: false,
    browserReady: false,
    vncReady: false,
  };

  private listeners: Map<HealthEventType, Set<HealthCallback>> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt: number | null = null;

  // ---- Event system -------------------------------------------------------

  on(event: HealthEventType, callback: HealthCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: HealthEventType, callback: HealthCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(type: HealthEventType): void {
    const payload = { type, status: { ...this.status } };
    this.listeners.get(type)?.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[SandboxHealth] listener error on "${type}":`, err);
      }
    });
  }

  // ---- Health check -------------------------------------------------------

  async checkHealth(): Promise<SandboxStatus> {
    const prevHealthy = this.status.healthy;
    const prevRunning = this.status.running;

    let browserReady = false;
    let vncReady = false;
    let running = false;
    let healthy = false;
    let error: string | undefined;

    // Check the sandbox HTTP API
    try {
      const res = await fetch(`${SANDBOX_API}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (res.ok) {
        const data = await res.json();
        running = true;
        browserReady = data.status === 'ok';
        healthy = browserReady;
      } else {
        running = true; // server is responding, just not healthy
        error = `Health endpoint returned ${res.status}`;
      }
    } catch (err) {
      running = false;
      browserReady = false;
      error = err instanceof Error ? err.message : String(err);
    }

    // Check VNC WebSocket availability with a quick open/close
    try {
      vncReady = await this.probeVnc();
    } catch {
      vncReady = false;
    }

    // Track uptime from first successful check
    if (running && !this.startedAt) {
      this.startedAt = Date.now();
    }
    if (!running) {
      this.startedAt = null;
    }

    this.status = {
      containerId: this.status.containerId,
      running,
      healthy,
      uptime: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : undefined,
      lastHealthCheck: Date.now(),
      browserReady,
      vncReady,
      memoryUsageMB: this.status.memoryUsageMB, // preserved from previous check
      error,
    };

    this.emit('healthCheck');

    // Emit statusChanged if the core state flipped
    if (prevHealthy !== this.status.healthy || prevRunning !== this.status.running) {
      this.emit('statusChanged');
    }

    return { ...this.status };
  }

  // ---- VNC probe ----------------------------------------------------------

  private probeVnc(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 2000);

      try {
        const ws = new WebSocket(VNC_WS_URL);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };

        ws.onclose = () => {
          // If close fires before open, connection failed
        };
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  // ---- Monitoring ---------------------------------------------------------

  startMonitoring(intervalMs: number = DEFAULT_POLL_MS): void {
    if (this.pollTimer !== null) return; // already monitoring

    // Do an immediate check
    this.checkHealth();

    this.pollTimer = setInterval(() => {
      this.checkHealth();
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  get isMonitoring(): boolean {
    return this.pollTimer !== null;
  }

  // ---- Auto-restart -------------------------------------------------------

  async autoRestart(): Promise<boolean> {
    this.emit('autoRestart');

    // Attempt to wake the sandbox by hitting the health endpoint repeatedly.
    // If the sandbox is a Docker container that auto-restarts, this may be
    // enough. For manual Docker restart, callers should use `docker restart`
    // externally. We try up to 3 pings spaced 2s apart.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${SANDBOX_API}/health`, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok') {
            await this.checkHealth();
            return true;
          }
        }
      } catch {
        // Sandbox still down, wait and retry
      }

      if (attempt < 2) {
        await delay(2000);
      }
    }

    // Final health check to update status
    await this.checkHealth();

    if (!this.status.healthy) {
      this.status.error = 'Auto-restart failed: sandbox did not respond after 3 attempts';
      this.emit('error');
    }

    return this.status.healthy;
  }

  // ---- Wait for ready -----------------------------------------------------

  async waitForReady(timeoutMs: number = DEFAULT_READY_TIMEOUT_MS): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.checkHealth();
      if (status.healthy && status.browserReady) {
        return true;
      }
      await delay(READY_POLL_MS);
    }

    return false;
  }

  // ---- Status accessor ----------------------------------------------------

  getStatus(): SandboxStatus {
    return { ...this.status };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let singletonHealth: SandboxHealthManager | null = null;

export function getSandboxHealthManager(): SandboxHealthManager {
  if (!singletonHealth) {
    singletonHealth = new SandboxHealthManager();
  }
  return singletonHealth;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseSandboxHealthReturn {
  status: SandboxStatus;
  isHealthy: boolean;
  isMonitoring: boolean;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  checkNow: () => Promise<SandboxStatus>;
  restart: () => Promise<boolean>;
}

export function useSandboxHealth(): UseSandboxHealthReturn {
  const healthRef = useRef<SandboxHealthManager>(getSandboxHealthManager());
  const health = healthRef.current;
  const { manager } = useTabManager();

  const [status, setStatus] = useState<SandboxStatus>(() => health.getStatus());
  const [monitoring, setMonitoring] = useState(() => health.isMonitoring);

  useEffect(() => {
    const onStatusChanged: HealthCallback = ({ status: newStatus }) => {
      setStatus({ ...newStatus });

      // Update tabManager machine status for the local sandbox
      if (newStatus.healthy) {
        manager.updateMachineStatus(MACHINE_ID, 'online');
      } else if (newStatus.running && !newStatus.healthy) {
        manager.updateMachineStatus(MACHINE_ID, 'busy');
      } else {
        manager.updateMachineStatus(MACHINE_ID, 'offline');
      }
    };

    const onHealthCheck: HealthCallback = ({ status: newStatus }) => {
      setStatus({ ...newStatus });
    };

    const onError: HealthCallback = ({ status: newStatus }) => {
      setStatus({ ...newStatus });
    };

    health.on('statusChanged', onStatusChanged);
    health.on('healthCheck', onHealthCheck);
    health.on('error', onError);

    // Start monitoring on mount if not already running
    if (!health.isMonitoring) {
      health.startMonitoring();
      setMonitoring(true);
    }

    return () => {
      health.off('statusChanged', onStatusChanged);
      health.off('healthCheck', onHealthCheck);
      health.off('error', onError);

      // Stop monitoring on unmount
      health.stopMonitoring();
      setMonitoring(false);
    };
  }, [health, manager]);

  const startMonitoring = useCallback(() => {
    health.startMonitoring();
    setMonitoring(true);
  }, [health]);

  const stopMonitoring = useCallback(() => {
    health.stopMonitoring();
    setMonitoring(false);
  }, [health]);

  const checkNow = useCallback(() => {
    return health.checkHealth();
  }, [health]);

  const restart = useCallback(() => {
    return health.autoRestart();
  }, [health]);

  return {
    status,
    isHealthy: status.healthy,
    isMonitoring: monitoring,
    startMonitoring,
    stopMonitoring,
    checkNow,
    restart,
  };
}
