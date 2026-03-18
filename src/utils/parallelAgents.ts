/**
 * Parallel Agent Orchestrator — runs multiple plan-act browser agents
 * concurrently across different tabs/machines.
 *
 * Each task is bound to a specific tab (and therefore a specific machine).
 * The orchestrator limits concurrency to the number of available machines
 * and emits granular events for every state change so the UI can stream
 * live progress per task.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { runPlanAct, type PlanActCallbacks, type PlanStep, type ExecutorAction } from './planActAgent';
import { type TabManager, type BrowserTab, type Machine } from './tabManager';
import { getModelForStage } from './modelConfig';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentStep {
  id: number;
  action: string;
  detail: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  reasoning?: string;
  timestamp?: number;
}

export interface AgentTask {
  id: string;
  tabId: string;
  goal: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number; // 0-100
  steps: AgentStep[];
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export type AgentEventType =
  | 'taskCreated'
  | 'taskStarted'
  | 'taskCompleted'
  | 'taskFailed'
  | 'stepStarted'
  | 'stepCompleted'
  | 'stepFailed'
  | 'stateChanged';

export interface AgentEvent {
  type: AgentEventType;
  taskId: string;
  step?: AgentStep;
  timestamp: number;
}

export type AgentEventCallback = (event: AgentEvent) => void;

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── ParallelAgentOrchestrator ──────────────────────────────────────────────

export class ParallelAgentOrchestrator {
  private tabManager: TabManager;
  private tasks: Map<string, AgentTask> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private pausedTasks: Set<string> = new Set();
  private listeners: Map<AgentEventType | '*', Set<AgentEventCallback>> = new Map();
  private maxConcurrency: number;

  constructor(tabManager: TabManager, maxConcurrency?: number) {
    this.tabManager = tabManager;
    // Default concurrency = number of registered machines (typically 2)
    this.maxConcurrency = maxConcurrency ?? (tabManager.getMachines().length || 2);
  }

  // ── Event system (mirrors TabManager pattern) ───────────────────────────

  on(event: AgentEventType | '*', callback: AgentEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: AgentEventType | '*', callback: AgentEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(type: AgentEventType, taskId: string, step?: AgentStep): void {
    const event: AgentEvent = { type, taskId, step, timestamp: Date.now() };

    // Notify specific-event listeners
    this.listeners.get(type)?.forEach((cb) => {
      try { cb(event); } catch (err) {
        console.error(`[ParallelAgents] listener error on "${type}":`, err);
      }
    });

    // Notify wildcard listeners
    this.listeners.get('*')?.forEach((cb) => {
      try { cb(event); } catch (err) {
        console.error('[ParallelAgents] wildcard listener error:', err);
      }
    });

    // Every mutation also fires stateChanged so React hooks can re-render
    if (type !== 'stateChanged') {
      const stateEvent: AgentEvent = { type: 'stateChanged', taskId, timestamp: Date.now() };
      this.listeners.get('stateChanged')?.forEach((cb) => {
        try { cb(stateEvent); } catch (err) {
          console.error('[ParallelAgents] stateChanged listener error:', err);
        }
      });
    }
  }

  // ── Task management ─────────────────────────────────────────────────────

  addTask(tabId: string, goal: string): AgentTask {
    const tab = this.tabManager.getTab(tabId);
    if (!tab) {
      throw new Error(`Tab "${tabId}" not found in TabManager`);
    }

    const task: AgentTask = {
      id: generateId(),
      tabId,
      goal,
      status: 'queued',
      progress: 0,
      steps: [],
    };

    this.tasks.set(task.id, task);
    this.emit('taskCreated', task.id);
    return { ...task };
  }

  getTask(taskId: string): AgentTask | undefined {
    const t = this.tasks.get(taskId);
    return t ? { ...t, steps: [...t.steps] } : undefined;
  }

  getAllTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).map((t) => ({
      ...t,
      steps: [...t.steps],
    }));
  }

  getRunningTasks(): AgentTask[] {
    return this.getAllTasks().filter((t) => t.status === 'running');
  }

  getQueuedTasks(): AgentTask[] {
    return this.getAllTasks().filter((t) => t.status === 'queued');
  }

  // ── Concurrency control ─────────────────────────────────────────────────

  /**
   * Start all queued tasks, respecting max concurrency.
   * Returns a promise that resolves when ALL tasks have finished.
   */
  async start(): Promise<void> {
    const queued = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'queued'
    );

    if (queued.length === 0) return;

    // Semaphore-style: run up to maxConcurrency at a time
    const running: Promise<void>[] = [];
    let idx = 0;

    const runNext = async (): Promise<void> => {
      while (idx < queued.length) {
        const task = queued[idx++];
        if (task.status !== 'queued') continue; // may have been cancelled
        await this.runTask(task.id);
        // When one finishes, the loop picks up the next queued task
      }
    };

    const concurrency = Math.min(this.maxConcurrency, queued.length);
    for (let i = 0; i < concurrency; i++) {
      running.push(runNext());
    }

    await Promise.all(running);
  }

  /**
   * Start a single task by ID. If already running, this is a no-op.
   */
  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'queued') return;
    await this.runTask(taskId);
  }

  // ── Cancel / Pause / Resume ─────────────────────────────────────────────

  cancelTask(taskId: string): void {
    const ac = this.abortControllers.get(taskId);
    if (ac) ac.abort();

    const task = this.tasks.get(taskId);
    if (task && (task.status === 'running' || task.status === 'queued' || task.status === 'paused')) {
      task.status = 'failed';
      task.error = 'Cancelled by user';
      task.completedAt = Date.now();
      this.pausedTasks.delete(taskId);
      this.emit('taskFailed', taskId);
    }
  }

  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return;

    // Signal pause — the run loop checks this flag between actions
    this.pausedTasks.add(taskId);
    task.status = 'paused';
    this.emit('stateChanged', taskId);
  }

  resumeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') return;

    this.pausedTasks.delete(taskId);
    task.status = 'running';
    this.emit('stateChanged', taskId);

    // Re-run from current state (the old runTask promise already resolved
    // or is waiting on the pause gate, depending on implementation).
    // We create a fresh abort controller and restart.
    this.runTask(taskId).catch(() => {});
  }

  // ── Internal: run a single task via runPlanAct ──────────────────────────

  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const tab = this.tabManager.getTab(task.tabId);
    if (!tab) {
      task.status = 'failed';
      task.error = `Tab "${task.tabId}" no longer exists`;
      task.completedAt = Date.now();
      this.emit('taskFailed', taskId);
      return;
    }

    // Mark the machine as busy
    const machine = this.tabManager.getMachine(tab.machineId);
    if (machine) {
      this.tabManager.updateMachineStatus(tab.machineId, 'busy');
    }

    // Set up abort controller
    const ac = new AbortController();
    this.abortControllers.set(taskId, ac);

    task.status = 'running';
    task.startedAt = Date.now();
    task.progress = 0;
    this.emit('taskStarted', taskId);

    // Track steps as planActAgent reports them
    let totalPlanSteps = 0;
    let completedPlanSteps = 0;
    let stepCounter = 0;

    const callbacks: PlanActCallbacks = {
      onPlan: (plan) => {
        totalPlanSteps = plan.steps.length;
        // Sync plan steps into our AgentStep format
        task.steps = plan.steps.map((ps: PlanStep) => ({
          id: ps.step,
          action: 'plan_step',
          detail: ps.description,
          status: ps.status === 'active' ? 'running' as const
            : ps.status === 'done' ? 'done' as const
            : ps.status === 'failed' ? 'failed' as const
            : 'pending' as const,
          timestamp: Date.now(),
        }));
        this.emit('stateChanged', taskId);
      },

      onStepStart: (ps: PlanStep) => {
        const agentStep = task.steps.find((s) => s.id === ps.step);
        if (agentStep) {
          agentStep.status = 'running';
          agentStep.timestamp = Date.now();
          this.emit('stepStarted', taskId, { ...agentStep });
        }
      },

      onAction: (action: ExecutorAction, result: string) => {
        stepCounter++;
        // Append a granular action step
        const actionStep: AgentStep = {
          id: 1000 + stepCounter, // offset to avoid colliding with plan step IDs
          action: action.action,
          detail: result,
          status: 'done',
          reasoning: action.reason,
          timestamp: Date.now(),
        };
        task.steps.push(actionStep);
        this.emit('stepCompleted', taskId, actionStep);
      },

      onStepComplete: (ps: PlanStep) => {
        const agentStep = task.steps.find((s) => s.id === ps.step);
        if (agentStep) {
          agentStep.status = ps.status === 'done' ? 'done' : 'failed';
          agentStep.timestamp = Date.now();

          if (ps.status === 'done') {
            completedPlanSteps++;
            this.emit('stepCompleted', taskId, { ...agentStep });
          } else {
            this.emit('stepFailed', taskId, { ...agentStep });
          }

          // Update progress
          if (totalPlanSteps > 0) {
            task.progress = Math.round((completedPlanSteps / totalPlanSteps) * 100);
          }
          this.emit('stateChanged', taskId);
        }
      },

      onThinking: (_text: string) => {
        // Could emit a thinking event; for now just ensure stateChanged fires
      },

      onDone: (summary: string) => {
        task.status = 'completed';
        task.result = summary;
        task.progress = 100;
        task.completedAt = Date.now();
        this.emit('taskCompleted', taskId);
      },

      onError: (error: string) => {
        task.status = 'failed';
        task.error = error;
        task.completedAt = Date.now();
        this.emit('taskFailed', taskId);
      },
    };

    const plannerModel = getModelForStage('planner');
    const executorModel = getModelForStage('executor');

    try {
      await runPlanAct(
        task.goal,
        plannerModel,
        executorModel,
        callbacks,
        30,       // maxActions
        ac.signal,
      );

      // If runPlanAct returned without calling onDone/onError (e.g. abort)
      if (task.status === 'running') {
        if (ac.signal.aborted) {
          task.status = 'failed';
          task.error = 'Aborted';
          task.completedAt = Date.now();
          this.emit('taskFailed', taskId);
        } else {
          task.status = 'completed';
          task.progress = 100;
          task.completedAt = Date.now();
          this.emit('taskCompleted', taskId);
        }
      }
    } catch (err) {
      if (task.status === 'running') {
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : String(err);
        task.completedAt = Date.now();
        this.emit('taskFailed', taskId);
      }
    } finally {
      this.abortControllers.delete(taskId);

      // Release machine busy status if no other tasks are running on it
      if (machine) {
        const stillRunning = Array.from(this.tasks.values()).some(
          (t) =>
            t.status === 'running' &&
            t.id !== taskId &&
            this.tabManager.getTab(t.tabId)?.machineId === tab.machineId
        );
        if (!stillRunning) {
          this.tabManager.updateMachineStatus(tab.machineId, 'online');
        }
      }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /** Cancel all running tasks and clear state. */
  cancelAll(): void {
    const taskIds = Array.from(this.abortControllers.keys());
    for (const taskId of taskIds) {
      this.cancelTask(taskId);
    }
  }

  /** Remove completed/failed tasks from the list. */
  clearFinished(): void {
    const allIds = Array.from(this.tasks.keys());
    for (const id of allIds) {
      const task = this.tasks.get(id);
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        this.tasks.delete(id);
      }
    }
    this.emit('stateChanged', '');
  }

  /** Set max concurrency (e.g. when machines are added/removed). */
  setMaxConcurrency(n: number): void {
    this.maxConcurrency = Math.max(1, n);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let singletonOrchestrator: ParallelAgentOrchestrator | null = null;

export function getParallelAgentOrchestrator(tabManager: TabManager): ParallelAgentOrchestrator {
  if (!singletonOrchestrator) {
    singletonOrchestrator = new ParallelAgentOrchestrator(tabManager);
  }
  return singletonOrchestrator;
}

// ── React hook ─────────────────────────────────────────────────────────────

export interface UseParallelAgentsReturn {
  tasks: AgentTask[];
  runningCount: number;
  addTask: (tabId: string, goal: string) => AgentTask;
  cancelTask: (taskId: string) => void;
  pauseTask: (taskId: string) => void;
  resumeTask: (taskId: string) => void;
  start: () => void;
  startTask: (taskId: string) => void;
  cancelAll: () => void;
  clearFinished: () => void;
  events: AgentEvent[];
}

const MAX_EVENTS = 200;

export function useParallelAgents(tabManager: TabManager): UseParallelAgentsReturn {
  const orchestratorRef = useRef<ParallelAgentOrchestrator>(
    getParallelAgentOrchestrator(tabManager)
  );
  const orch = orchestratorRef.current;

  const [tasks, setTasks] = useState<AgentTask[]>(() => orch.getAllTasks());
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    const onEvent: AgentEventCallback = (event) => {
      // Update tasks snapshot
      setTasks(orch.getAllTasks());

      // Append event to rolling log (skip stateChanged to avoid noise)
      if (event.type !== 'stateChanged') {
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
        });
      }
    };

    orch.on('*', onEvent);
    // Sync initial state
    setTasks(orch.getAllTasks());

    return () => {
      orch.off('*', onEvent);
    };
  }, [orch]);

  const addTask = useCallback(
    (tabId: string, goal: string) => orch.addTask(tabId, goal),
    [orch]
  );

  const cancelTask = useCallback(
    (taskId: string) => orch.cancelTask(taskId),
    [orch]
  );

  const pauseTask = useCallback(
    (taskId: string) => orch.pauseTask(taskId),
    [orch]
  );

  const resumeTask = useCallback(
    (taskId: string) => orch.resumeTask(taskId),
    [orch]
  );

  const start = useCallback(() => {
    orch.start().catch((err) => {
      console.error('[useParallelAgents] start failed:', err);
    });
  }, [orch]);

  const startTask = useCallback(
    (taskId: string) => {
      orch.startTask(taskId).catch((err) => {
        console.error('[useParallelAgents] startTask failed:', err);
      });
    },
    [orch]
  );

  const cancelAll = useCallback(() => orch.cancelAll(), [orch]);
  const clearFinished = useCallback(() => orch.clearFinished(), [orch]);

  return {
    tasks,
    runningCount: tasks.filter((t) => t.status === 'running').length,
    addTask,
    cancelTask,
    pauseTask,
    resumeTask,
    start,
    startTask,
    cancelAll,
    clearFinished,
    events,
  };
}
