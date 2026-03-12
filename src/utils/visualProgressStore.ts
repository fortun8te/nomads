/**
 * Visual Progress Store
 * Module-level store for live visual scout events + thumbnails.
 * Works alongside the text stream — stores structured events including base64 screenshots.
 * Components subscribe via useSyncExternalStore pattern.
 */

type Listener = () => void;

export interface VisualSiteEvent {
  url: string;
  status: 'pending' | 'capturing' | 'captured' | 'analyzing' | 'done' | 'error';
  thumbnail?: string; // full base64 JPEG
  findings?: {
    tone?: string;
    colors?: string[];
    layout?: string;
    insight?: string;
  };
  error?: string;
  capturedAt?: number;
}

export interface VisualBatchState {
  batchId: number;
  sites: VisualSiteEvent[];
  synthesisStatus?: 'pending' | 'running' | 'done';
  commonPatterns?: string[];
  visualGaps?: string[];
}

// ─── Internal state ───
const batches: VisualBatchState[] = [];
let batchCounter = 0;
let activeBatchIdx = -1;

// ─── Snapshot cache ───
let snapshotVersion = 0;
let cachedVersion = -1;
let cachedSnapshot: VisualBatchState[] = [];

// ─── Listeners ───
const listeners = new Set<Listener>();

function emit() {
  snapshotVersion++;
  listeners.forEach((l) => l());
}

// ─── Public API ───
export const visualProgressStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): VisualBatchState[] {
    if (cachedVersion !== snapshotVersion) {
      cachedSnapshot = [...batches];
      cachedVersion = snapshotVersion;
    }
    return cachedSnapshot;
  },

  /** Start a new batch for the given URLs */
  startBatch(urls: string[]) {
    const batch: VisualBatchState = {
      batchId: ++batchCounter,
      sites: urls.map((url) => ({ url, status: 'pending' })),
    };
    batches.push(batch);
    activeBatchIdx = batches.length - 1;
    emit();
  },

  /** Mark a site as currently being screenshotted */
  setCapturing(url: string) {
    const batch = batches[activeBatchIdx];
    if (!batch) return;
    const site = batch.sites.find((s) => s.url === url);
    if (site) {
      site.status = 'capturing';
      emit();
    }
  },

  /** Store completed screenshot with thumbnail */
  setCaptured(url: string, thumbnail?: string, error?: string) {
    const batch = batches[activeBatchIdx];
    if (!batch) return;
    const site = batch.sites.find((s) => s.url === url);
    if (site) {
      site.status = error ? 'error' : 'captured';
      site.thumbnail = thumbnail;
      site.error = error;
      site.capturedAt = Date.now();
      emit();
    }
  },

  /** Mark a site as being analyzed by vision model */
  setAnalyzing(url: string) {
    const batch = batches[activeBatchIdx];
    if (!batch) return;
    const site = batch.sites.find((s) => s.url === url);
    if (site) {
      site.status = 'analyzing';
      emit();
    }
  },

  /** Store analysis findings for a site */
  setAnalyzed(url: string, findings: VisualSiteEvent['findings']) {
    const batch = batches[activeBatchIdx];
    if (!batch) return;
    const site = batch.sites.find((s) => s.url === url);
    if (site) {
      site.status = 'done';
      site.findings = findings;
      emit();
    }
  },

  /** Update synthesis status */
  setSynthesisStatus(status: 'pending' | 'running' | 'done', patterns?: string[], gaps?: string[]) {
    const batch = batches[activeBatchIdx];
    if (!batch) return;
    batch.synthesisStatus = status;
    if (patterns) batch.commonPatterns = patterns;
    if (gaps) batch.visualGaps = gaps;
    emit();
  },

  /** Reset all batches (e.g. on new research cycle) */
  reset() {
    batches.length = 0;
    activeBatchIdx = -1;
    batchCounter = 0;
    emit();
  },

  /** Get the most recent batch */
  getActiveBatch(): VisualBatchState | null {
    return batches[activeBatchIdx] ?? null;
  },
};
