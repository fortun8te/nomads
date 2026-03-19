/**
 * workingMemory — In-memory task state manager.
 *
 * Provides TaskRegistry: a singleton in-memory map of active tasks.
 * Each TaskState holds all runtime context for one agent run.
 *
 * Note: this is intentionally in-RAM only (fast, no I/O).
 * Persistence to IndexedDB is handled by contextManager.ts.
 */

import type { WorkingMemory } from './contextManager';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface PhasePlan {
  phases: Array<{
    id: number;
    name: string;
    steps: Array<{ agent: string; do: string }>;
    est: string;
    output?: string;
    needs: number[];
  }>;
  checkpoints: number[];
  totalEst: string;
  outputFormat: string;
}

export type TaskStatus =
  | 'planning'
  | 'running'
  | 'paused'
  | 'checkpointing'
  | 'complete'
  | 'failed';

export interface TaskState {
  taskId: string;
  description: string;
  classification: string; // e.g. DIRECT | MEDIUM | COMPLEX
  status: TaskStatus;
  currentPhase: number;
  currentStep: number;
  totalSteps: number;
  plan: PhasePlan | null;
  workingMemory: WorkingMemory;
  startedAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────
// ID generator
// ─────────────────────────────────────────────────────────────

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────
// TaskRegistry
// ─────────────────────────────────────────────────────────────

/**
 * In-memory registry of all active agent tasks.
 *
 * Lifecycle:
 *   create() → update() (many times) → complete() | fail()
 *
 * The registry never persists to disk — use contextManager.recoverState()
 * to rebuild from IndexedDB after a crash.
 */
export class TaskRegistry {
  private readonly _tasks = new Map<string, TaskState>();

  /**
   * Create and register a new task. Returns the initial TaskState.
   */
  create(description: string, classification: string): TaskState {
    const taskId = generateTaskId();
    const now = Date.now();

    const workingMemory: WorkingMemory = {
      taskId,
      userRequest: description,
      currentPhase: 0,
      currentStep: 0,
      completed: { phases: [], steps: [] },
      keyFacts: {},
      decisions: [],
      files: {},
      errors: [],
    };

    const state: TaskState = {
      taskId,
      description,
      classification,
      status: 'planning',
      currentPhase: 0,
      currentStep: 0,
      totalSteps: 0,
      plan: null,
      workingMemory,
      startedAt: now,
      updatedAt: now,
    };

    this._tasks.set(taskId, state);
    return state;
  }

  /**
   * Return the TaskState for a given taskId, or undefined if not found.
   */
  get(taskId: string): TaskState | undefined {
    return this._tasks.get(taskId);
  }

  /**
   * Apply a partial patch to an existing task and bump updatedAt.
   * Silently no-ops if the taskId does not exist.
   */
  update(taskId: string, patch: Partial<TaskState>): void {
    const existing = this._tasks.get(taskId);
    if (!existing) return;

    this._tasks.set(taskId, {
      ...existing,
      ...patch,
      taskId,          // never allow taskId to be patched away
      updatedAt: Date.now(),
    });
  }

  /**
   * Return all tasks currently in the registry.
   */
  list(): TaskState[] {
    return Array.from(this._tasks.values());
  }

  /**
   * Mark a task as complete.
   */
  complete(taskId: string): void {
    this.update(taskId, { status: 'complete' });
  }

  /**
   * Mark a task as failed, recording the error in workingMemory.
   */
  fail(taskId: string, error: string): void {
    const existing = this._tasks.get(taskId);
    if (!existing) return;

    const updatedWm: WorkingMemory = {
      ...existing.workingMemory,
      errors: [...existing.workingMemory.errors, error],
    };

    this.update(taskId, { status: 'failed', workingMemory: updatedWm });
  }

  /**
   * Returns the most recently updated non-complete, non-failed task,
   * or undefined if there are no active tasks.
   */
  getActive(): TaskState | undefined {
    const active = Array.from(this._tasks.values()).filter(
      t => t.status !== 'complete' && t.status !== 'failed',
    );

    if (active.length === 0) return undefined;

    // Most recently updated first
    return active.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
}

// ─────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────

/** Global singleton — import this everywhere you need task management. */
export const taskRegistry = new TaskRegistry();
