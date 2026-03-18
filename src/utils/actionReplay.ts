/**
 * Action Replay — Record and replay browser automation actions.
 *
 * Records actions during browser sessions, persists them to IndexedDB,
 * and replays them through sandboxService with speed control + pause/resume.
 */

import { useState, useCallback, useRef } from 'react';
import { get, set, del } from 'idb-keyval';
import { sandboxService } from './sandboxService';

// ── Types ──

export interface RecordedAction {
  id: number;
  type: 'click' | 'scroll' | 'type' | 'press_key' | 'navigate' | 'wait';
  params: Record<string, any>;
  screenshotB64?: string;
  pageUrl?: string;
  pageTitle?: string;
  timestamp: number;
  duration?: number;
}

export interface ActionRecording {
  id: string;
  name: string;
  description?: string;
  actions: RecordedAction[];
  startUrl: string;
  createdAt: number;
  totalDuration: number;
}

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'completed' | 'error';
export type ReplayEventType = 'started' | 'stepExecuted' | 'paused' | 'resumed' | 'completed' | 'error';

export type ReplayCallback = (event: {
  type: ReplayEventType;
  stepIndex: number;
  action?: RecordedAction;
  error?: string;
}) => void;

// ── Storage (IndexedDB via idb-keyval) ──

const RECORDINGS_INDEX_KEY = 'replay-index';
const recordingKey = (id: string) => `replay-${id}`;

export async function saveRecording(recording: ActionRecording): Promise<void> {
  await set(recordingKey(recording.id), recording);
  const index: string[] = (await get(RECORDINGS_INDEX_KEY)) || [];
  if (!index.includes(recording.id)) {
    index.push(recording.id);
    await set(RECORDINGS_INDEX_KEY, index);
  }
}

export async function loadRecording(id: string): Promise<ActionRecording | null> {
  return (await get(recordingKey(id))) || null;
}

export async function listRecordings(): Promise<ActionRecording[]> {
  const index: string[] = (await get(RECORDINGS_INDEX_KEY)) || [];
  const recordings: ActionRecording[] = [];
  for (const id of index) {
    const rec = await get<ActionRecording>(recordingKey(id));
    if (rec) recordings.push(rec);
  }
  return recordings;
}

export async function deleteRecording(id: string): Promise<void> {
  await del(recordingKey(id));
  const index: string[] = (await get(RECORDINGS_INDEX_KEY)) || [];
  await set(RECORDINGS_INDEX_KEY, index.filter(i => i !== id));
}

// ── ActionRecorder ──

export class ActionRecorder {
  private recording: boolean = false;
  private actions: RecordedAction[] = [];
  private name: string = '';
  private startUrl: string = '';
  private startTime: number = 0;
  private nextId: number = 1;

  startRecording(name: string, startUrl: string): void {
    this.recording = true;
    this.actions = [];
    this.name = name;
    this.startUrl = startUrl;
    this.startTime = Date.now();
    this.nextId = 1;
  }

  recordAction(action: Omit<RecordedAction, 'id' | 'timestamp'>): void {
    if (!this.recording) return;
    this.actions.push({
      ...action,
      id: this.nextId++,
      timestamp: Date.now(),
    });
  }

  stopRecording(): ActionRecording {
    this.recording = false;
    const now = Date.now();
    const rec: ActionRecording = {
      id: `rec-${this.startTime}-${Math.random().toString(36).slice(2, 8)}`,
      name: this.name,
      actions: this.actions,
      startUrl: this.startUrl,
      createdAt: this.startTime,
      totalDuration: now - this.startTime,
    };
    this.actions = [];
    return rec;
  }

  isRecording(): boolean {
    return this.recording;
  }
}

// ── ActionPlayer ──

export class ActionPlayer {
  private recording: ActionRecording | null = null;
  private status: ReplayStatus = 'idle';
  private currentStep: number = 0;
  private speed: number = 1;
  private listeners: Map<ReplayEventType, Set<ReplayCallback>> = new Map();
  private abortController: AbortController | null = null;
  private pausePromise: { resolve: () => void; promise: Promise<void> } | null = null;

  load(recording: ActionRecording): void {
    this.recording = recording;
    this.status = 'idle';
    this.currentStep = 0;
  }

  async play(options?: { speed?: number; startFromStep?: number }): Promise<void> {
    if (!this.recording) throw new Error('No recording loaded');

    this.speed = options?.speed ?? 1;
    this.currentStep = options?.startFromStep ?? 0;
    this.status = 'playing';
    this.abortController = new AbortController();

    this.emit('started', this.currentStep);

    const actions = this.recording.actions;

    for (let i = this.currentStep; i < actions.length; i++) {
      // Check abort
      if (this.abortController.signal.aborted) {
        this.status = 'idle';
        return;
      }

      // Handle pause
      if (this.status === 'paused') {
        await this.waitForResume();
        if (this.abortController.signal.aborted) {
          this.status = 'idle';
          return;
        }
      }

      this.currentStep = i;
      const action = actions[i];

      // Delay between actions based on timing gaps and speed
      if (i > 0) {
        const gap = action.timestamp - actions[i - 1].timestamp;
        const delay = Math.max(50, gap / this.speed);
        // Cap delay at 5 seconds (even at 1x, skip huge gaps)
        await this.sleep(Math.min(delay, 5000));
        if (this.abortController.signal.aborted) {
          this.status = 'idle';
          return;
        }
      }

      try {
        await this.executeRecordedAction(action);
        this.emit('stepExecuted', i, action);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.status = 'error';
        this.emit('error', i, action, msg);
        return;
      }
    }

    this.status = 'completed';
    this.emit('completed', this.currentStep);
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.status = 'paused';
    this.pausePromise = createDeferredPromise();
    this.emit('paused', this.currentStep);
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'playing';
    this.pausePromise?.resolve();
    this.pausePromise = null;
    this.emit('resumed', this.currentStep);
  }

  stop(): void {
    this.abortController?.abort();
    this.pausePromise?.resolve(); // unblock if paused
    this.pausePromise = null;
    this.status = 'idle';
    this.currentStep = 0;
  }

  on(_event: ReplayEventType, cb: ReplayCallback): void {
    if (!this.listeners.has(_event)) this.listeners.set(_event, new Set());
    this.listeners.get(_event)!.add(cb);
  }

  off(_event: ReplayEventType, cb: ReplayCallback): void {
    this.listeners.get(_event)?.delete(cb);
  }

  getStatus(): ReplayStatus {
    return this.status;
  }

  getCurrentStep(): number {
    return this.currentStep;
  }

  // ── Private ──

  private emit(type: ReplayEventType, stepIndex: number, action?: RecordedAction, error?: string): void {
    const event = { type, stepIndex, action, error };
    this.listeners.get(type)?.forEach(cb => cb(event));
  }

  private async waitForResume(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise.promise;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      // If aborted during sleep, resolve immediately
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
  }

  private async executeRecordedAction(action: RecordedAction): Promise<void> {
    const { type, params } = action;
    switch (type) {
      case 'click':
        if (params.index != null) {
          await sandboxService.click(params.index);
        } else if (params.x != null && params.y != null) {
          await sandboxService.clickCoords(params.x, params.y);
        }
        break;
      case 'scroll':
        await sandboxService.scroll(params.direction || 'down', params.amount || 500);
        break;
      case 'type':
        if (params.index != null && params.text != null) {
          await sandboxService.input(params.index, params.text, params.pressEnter || false);
        }
        break;
      case 'press_key':
        if (params.key) {
          await sandboxService.pressKey(params.key);
        }
        break;
      case 'navigate':
        if (params.url) {
          await sandboxService.navigate(params.url);
        }
        break;
      case 'wait':
        await this.sleep((params.ms || 1000) / this.speed);
        break;
    }
  }
}

// ── Helpers ──

function createDeferredPromise(): { resolve: () => void; promise: Promise<void> } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { resolve, promise };
}

// ── React Hook ──

export function useActionReplay() {
  const recorderRef = useRef(new ActionRecorder());
  const playerRef = useRef(new ActionPlayer());

  const [isRecording, setIsRecording] = useState(false);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [recordings, setRecordings] = useState<ActionRecording[]>([]);

  const startRecording = useCallback((name: string, startUrl: string) => {
    recorderRef.current.startRecording(name, startUrl);
    setIsRecording(true);
  }, []);

  const recordAction = useCallback((action: Omit<RecordedAction, 'id' | 'timestamp'>) => {
    recorderRef.current.recordAction(action);
  }, []);

  const stopRecording = useCallback((): ActionRecording => {
    const rec = recorderRef.current.stopRecording();
    setIsRecording(false);
    return rec;
  }, []);

  const play = useCallback(async (recording: ActionRecording, options?: { speed?: number }) => {
    const player = playerRef.current;
    player.load(recording);
    setTotalSteps(recording.actions.length);
    setCurrentStep(0);
    setReplayStatus('playing');

    // Wire up status updates
    const onStep: ReplayCallback = (e) => {
      setCurrentStep(e.stepIndex + 1);
    };
    const onStatus: ReplayCallback = (e) => {
      if (e.type === 'completed') setReplayStatus('completed');
      else if (e.type === 'error') setReplayStatus('error');
      else if (e.type === 'paused') setReplayStatus('paused');
      else if (e.type === 'resumed') setReplayStatus('playing');
    };

    player.on('stepExecuted', onStep);
    player.on('completed', onStatus);
    player.on('error', onStatus);
    player.on('paused', onStatus);
    player.on('resumed', onStatus);

    try {
      await player.play(options);
    } finally {
      player.off('stepExecuted', onStep);
      player.off('completed', onStatus);
      player.off('error', onStatus);
      player.off('paused', onStatus);
      player.off('resumed', onStatus);
    }
  }, []);

  const pause = useCallback(() => {
    playerRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    playerRef.current.resume();
  }, []);

  const stop = useCallback(() => {
    playerRef.current.stop();
    setReplayStatus('idle');
    setCurrentStep(0);
  }, []);

  const loadRecordings = useCallback(async () => {
    const recs = await listRecordings();
    setRecordings(recs);
  }, []);

  const removeRecording = useCallback(async (id: string) => {
    await deleteRecording(id);
    setRecordings(prev => prev.filter(r => r.id !== id));
  }, []);

  return {
    // Recording
    isRecording,
    startRecording,
    recordAction,
    stopRecording,

    // Playback
    replayStatus,
    currentStep,
    totalSteps,
    play,
    pause,
    resume,
    stop,

    // Library
    recordings,
    loadRecordings,
    deleteRecording: removeRecording,
  };
}
