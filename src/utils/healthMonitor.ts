/**
 * Health Monitor — Continuous heartbeat system for all services
 * Polls Wayfayer, SearXNG, and Ollama at regular intervals.
 * Ollama endpoint is read dynamically from getOllamaEndpoint() on each check.
 */
import { getOllamaEndpoint } from './modelConfig';
import { INFRASTRUCTURE } from '../config/infrastructure';

export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  name: string;
  url: string;
  status: ServiceStatus;
  lastCheck: number;
  latencyMs: number;
  consecutiveFailures: number;
  lastError?: string;
}

export type HealthSnapshot = Record<string, ServiceHealth>;
type StatusChangeCallback = (name: string, oldStatus: ServiceStatus, newStatus: ServiceStatus) => void;

const POLL_INTERVAL = 30_000; // 30s
const DEGRADED_THRESHOLD = 2; // consecutive failures before "degraded"
const DOWN_THRESHOLD = 4;     // consecutive failures before "down"

/** Static services — ollama is dynamic (resolved at check time) */
const STATIC_SERVICES: Array<{ name: string; url: string; probe: string }> = [
  { name: 'wayfayer', url: INFRASTRUCTURE.wayfarerUrl, probe: '/health' },
  { name: 'searxng', url: INFRASTRUCTURE.searxngUrl, probe: '/healthz' },
];

class HealthMonitor {
  private services: Map<string, ServiceHealth> = new Map();
  private probes: Map<string, string> = new Map();
  /** Services whose probe URL is resolved dynamically each check */
  private dynamicServices: Set<string> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<StatusChangeCallback> = new Set();

  constructor() {
    // Static services
    for (const svc of STATIC_SERVICES) {
      this.services.set(svc.name, {
        name: svc.name,
        url: svc.url,
        status: 'unknown',
        lastCheck: 0,
        latencyMs: 0,
        consecutiveFailures: 0,
      });
      this.probes.set(svc.name, `${svc.url}${svc.probe}`);
    }

    // Ollama — dynamic endpoint
    const ollamaUrl = getOllamaEndpoint();
    this.services.set('ollama', {
      name: 'ollama',
      url: ollamaUrl,
      status: 'unknown',
      lastCheck: 0,
      latencyMs: 0,
      consecutiveFailures: 0,
    });
    this.probes.set('ollama', `${ollamaUrl}/api/tags`);
    this.dynamicServices.add('ollama');
  }

  onStatusChange(cb: StatusChangeCallback) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(name: string, oldStatus: ServiceStatus, newStatus: ServiceStatus) {
    for (const cb of this.listeners) {
      try { cb(name, oldStatus, newStatus); } catch { /* ignore */ }
    }
  }

  async checkService(name: string): Promise<ServiceHealth> {
    const svc = this.services.get(name);
    if (!svc) throw new Error(`Unknown service: ${name}`);

    // Re-resolve dynamic endpoints (user may have changed settings)
    if (this.dynamicServices.has(name)) {
      if (name === 'ollama') {
        const endpoint = getOllamaEndpoint();
        svc.url = endpoint;
        this.probes.set(name, `${endpoint}/api/tags`);
      }
    }

    const probeUrl = this.probes.get(name)!;
    const start = performance.now();
    const oldStatus = svc.status;

    try {
      const resp = await fetch(probeUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const latency = Math.round(performance.now() - start);

      if (resp.ok) {
        svc.status = 'healthy';
        svc.consecutiveFailures = 0;
        svc.latencyMs = latency;
        svc.lastError = undefined;
      } else {
        svc.consecutiveFailures++;
        svc.latencyMs = latency;
        svc.lastError = `HTTP ${resp.status}`;
        svc.status = svc.consecutiveFailures >= DOWN_THRESHOLD ? 'down'
          : svc.consecutiveFailures >= DEGRADED_THRESHOLD ? 'degraded'
          : 'healthy';
      }
    } catch (err) {
      svc.consecutiveFailures++;
      svc.latencyMs = Math.round(performance.now() - start);
      svc.lastError = String(err);
      svc.status = svc.consecutiveFailures >= DOWN_THRESHOLD ? 'down'
        : svc.consecutiveFailures >= DEGRADED_THRESHOLD ? 'degraded'
        : svc.status === 'unknown' ? 'down' : svc.status;
    }

    svc.lastCheck = Date.now();

    if (oldStatus !== svc.status) {
      this.notify(name, oldStatus, svc.status);
    }

    return { ...svc };
  }

  async checkAll(): Promise<HealthSnapshot> {
    const names = Array.from(this.services.keys());
    await Promise.allSettled(names.map(n => this.checkService(n)));
    return this.getSnapshot();
  }

  getSnapshot(): HealthSnapshot {
    const snapshot: HealthSnapshot = {};
    for (const [name, svc] of this.services) {
      snapshot[name] = { ...svc };
    }
    return snapshot;
  }

  getService(name: string): ServiceHealth | undefined {
    const svc = this.services.get(name);
    return svc ? { ...svc } : undefined;
  }

  isAllHealthy(): boolean {
    for (const svc of this.services.values()) {
      if (svc.status !== 'healthy') return false;
    }
    return true;
  }

  start() {
    if (this.intervalId) return;
    // Initial check immediately
    this.checkAll();
    this.intervalId = setInterval(() => this.checkAll(), POLL_INTERVAL);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

// Singleton
export const healthMonitor = new HealthMonitor();
