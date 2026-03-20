/**
 * reminderService — Time-based reminders backed by IndexedDB.
 *
 * Storage: idb-keyval under the key 'reminders'.
 * Timing strategy:
 *   - Short reminders (<= 60s remaining): use setTimeout directly.
 *   - Longer reminders: polled every 30 seconds.
 * Call initReminders() once at app mount to surface due reminders.
 */

import { get, set } from 'idb-keyval';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Reminder {
  /** Unique ID returned by scheduleReminder() */
  id: string;
  /** Human-readable reminder text */
  text: string;
  /** Unix timestamp (ms) when this reminder should fire */
  triggerAt: number;
  /** Optional repeat interval in milliseconds. Re-arms after firing if set. */
  repeat?: number;
  /** True once this reminder has been fired at least once */
  triggered?: boolean;
}

// ─────────────────────────────────────────────────────────────
// IDB key
// ─────────────────────────────────────────────────────────────

const IDB_KEY = 'reminders';

// ─────────────────────────────────────────────────────────────
// ID generator
// ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────
// Mutex for reminder store writes
// ─────────────────────────────────────────────────────────────
// All functions that read-modify-write the reminders IDB key must hold this
// lock. Without it, two concurrent scheduleReminder() calls can read the
// same stale list and one entry is silently dropped.

function makeMutex() {
  let _lock: Promise<void> = Promise.resolve();
  return function acquire(): Promise<() => void> {
    let release!: () => void;
    const prev = _lock;
    _lock = new Promise<void>((resolve) => { release = resolve; });
    return prev.then(() => release);
  };
}

const acquireRemindersLock = makeMutex();

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────

/** Timer handles for short reminders — keyed by reminder ID */
const _shortTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Interval handle for the long-reminder poll */
let _pollInterval: ReturnType<typeof setInterval> | null = null;
/** Active onDue callback from initReminders() */
let _onDue: ((r: Reminder) => void) | null = null;

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

async function loadAll(): Promise<Reminder[]> {
  try {
    return (await get<Reminder[]>(IDB_KEY)) ?? [];
  } catch (err) {
    console.warn('[reminderService] loadAll failed:', err);
    return [];
  }
}

async function saveAll(reminders: Reminder[]): Promise<void> {
  try {
    await set(IDB_KEY, reminders);
  } catch (err) {
    console.error('[reminderService] saveAll failed:', err);
    throw err;
  }
}

/** Fire a reminder: call the onDue handler and handle repeat logic. */
async function fireReminder(reminder: Reminder): Promise<void> {
  if (!_onDue) return;

  // Emit the callback outside the lock — it's a user-supplied handler and
  // must not block other reminder writes.
  _onDue(reminder);

  // Mark as triggered — hold the lock for the read-modify-write
  const release = await acquireRemindersLock();
  try {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === reminder.id);
    if (idx < 0) return;

    if (reminder.repeat != null && reminder.repeat > 0) {
      // Re-arm: advance triggerAt by the repeat interval
      all[idx] = {
        ...all[idx],
        triggerAt: reminder.triggerAt + reminder.repeat,
        triggered: true,
      };
      await saveAll(all);
      // Re-schedule the short timer if the new trigger is soon (outside lock is fine)
      armShortTimer(all[idx]);
    } else {
      // One-shot: mark triggered (keep in store for inspection, caller can dismiss)
      all[idx] = { ...all[idx], triggered: true };
      await saveAll(all);
    }
  } finally {
    release();
  }
}

/** Schedule a setTimeout for reminders with <= 60s remaining. */
function armShortTimer(reminder: Reminder): void {
  const msRemaining = reminder.triggerAt - Date.now();
  if (msRemaining > 60_000) return; // handled by poll
  if (msRemaining < 0) return;      // already due — poll will catch it

  // Clear any existing timer for this reminder
  const existing = _shortTimers.get(reminder.id);
  if (existing != null) clearTimeout(existing);

  const handle = setTimeout(() => {
    _shortTimers.delete(reminder.id);
    fireReminder(reminder).catch((err) =>
      console.error('[reminderService] fireReminder error:', err),
    );
  }, Math.max(0, msRemaining));

  _shortTimers.set(reminder.id, handle);
}

/** Check all reminders and fire any that are due. Called on poll tick. */
async function checkDue(): Promise<void> {
  const now = Date.now();
  const all = await loadAll();
  let changed = false;

  for (const reminder of all) {
    if (reminder.triggered && !reminder.repeat) continue;
    if (reminder.triggerAt > now) {
      // Arm short timer if it's coming up within 60s
      armShortTimer(reminder);
      continue;
    }

    // Due — fire it
    await fireReminder(reminder);
    changed = true;
  }

  if (changed) {
    // Reload and re-arm any recurring timers
    const updated = await loadAll();
    for (const r of updated) {
      if (!r.triggered) armShortTimer(r);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Schedule a new reminder.
 *
 * @param text      Human-readable reminder text.
 * @param triggerAt Unix timestamp (ms) when to fire.
 * @param repeat    Optional repeat interval in ms. Re-fires every `repeat` ms after first trigger.
 * @returns         Unique reminder ID.
 */
export function scheduleReminder(
  text: string,
  triggerAt: number,
  repeat?: number,
): string {
  const id = generateId();
  const reminder: Reminder = { id, text, triggerAt, repeat };

  // Persist and arm asynchronously, holding the mutex so concurrent calls
  // don't race on the read-modify-write and silently drop each other's entries.
  acquireRemindersLock()
    .then(async (release) => {
      try {
        const all = await loadAll();
        await saveAll([...all, reminder]);
        armShortTimer(reminder);
      } catch (err) {
        console.error('[reminderService] scheduleReminder error:', err);
      } finally {
        release();
      }
    })
    .catch((err) => console.error('[reminderService] scheduleReminder lock error:', err));

  return id;
}

/**
 * Return all reminders that are currently due (triggerAt <= now, not yet triggered
 * or set to repeat). Useful for checking on demand without a running poll.
 */
export async function getRemindersDue(): Promise<Reminder[]> {
  const now = Date.now();
  const all = await loadAll();
  return all.filter((r) => {
    if (r.triggerAt > now) return false;
    if (r.triggered && !r.repeat) return false;
    return true;
  });
}

/**
 * Dismiss a reminder — marks it as triggered and clears any running timer.
 * If the reminder has a repeat interval, dismissing cancels future firings.
 */
export async function dismissReminder(id: string): Promise<void> {
  // Clear short timer if one is running (safe outside the lock — Map is synchronous)
  const timer = _shortTimers.get(id);
  if (timer != null) {
    clearTimeout(timer);
    _shortTimers.delete(id);
  }

  const release = await acquireRemindersLock();
  try {
    const all = await loadAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return;

    // Remove the repeat interval so it won't re-arm
    all[idx] = { ...all[idx], triggered: true, repeat: undefined };
    await saveAll(all);
  } finally {
    release();
  }
}

/**
 * Remove a reminder entirely from the store.
 */
export async function deleteReminder(id: string): Promise<void> {
  const timer = _shortTimers.get(id);
  if (timer != null) {
    clearTimeout(timer);
    _shortTimers.delete(id);
  }

  const release = await acquireRemindersLock();
  try {
    const all = await loadAll();
    await saveAll(all.filter((r) => r.id !== id));
  } finally {
    release();
  }
}

/**
 * List all reminders (pending and triggered).
 */
export async function listReminders(): Promise<Reminder[]> {
  return loadAll();
}

/**
 * Initialise the reminder system.
 *
 * Call once at app mount. Starts the polling loop and arms short timers
 * for any reminders that are already in the store. Returns a cleanup
 * function — call it on app unmount to clear timers and the poll interval.
 *
 * @param onDue  Called whenever a reminder fires.
 * @returns      Cleanup function.
 */
export function initReminders(onDue: (r: Reminder) => void): () => void {
  _onDue = onDue;

  // Immediate check on mount
  checkDue().catch((err) =>
    console.error('[reminderService] initial checkDue error:', err),
  );

  // Start 30-second poll for long reminders
  if (_pollInterval != null) clearInterval(_pollInterval);
  _pollInterval = setInterval(() => {
    checkDue().catch((err) =>
      console.error('[reminderService] poll checkDue error:', err),
    );
  }, 30_000);

  // Arm short timers for existing stored reminders
  loadAll()
    .then((all) => {
      const now = Date.now();
      for (const r of all) {
        if (r.triggered && !r.repeat) continue;
        if (r.triggerAt > now) armShortTimer(r);
      }
    })
    .catch((err) =>
      console.error('[reminderService] armShortTimer on init error:', err),
    );

  // Return cleanup function
  return () => {
    _onDue = null;
    if (_pollInterval != null) {
      clearInterval(_pollInterval);
      _pollInterval = null;
    }
    for (const handle of _shortTimers.values()) {
      clearTimeout(handle);
    }
    _shortTimers.clear();
  };
}
