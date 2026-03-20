/**
 * soundEngine.ts — Imperative Web Audio API sound engine
 *
 * Pure synthesis — no external audio files.
 * Tonal palette: D major / B minor for harmonic consistency with the ambient layer.
 *
 * All functions gracefully no-op if Web Audio API is unavailable or sound is disabled.
 */

// ── Storage keys ──
const LS_ENABLED = 'sound_enabled';
const LS_VOLUME  = 'sound_volume';

// ── Singleton AudioContext ──
let _ctx: AudioContext | null = null;
let _master: GainNode | null = null;
let _compressor: DynamicsCompressorNode | null = null;

function getCtx(): { ac: AudioContext; out: AudioNode } | null {
  try {
    if (typeof AudioContext === 'undefined' && typeof (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext === 'undefined') {
      return null;
    }
    if (!_ctx || _ctx.state === 'closed') {
      const AC = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
      _ctx = new AC();
      _master = _ctx.createGain();
      _master.gain.value = getMasterVolume();
      _compressor = _ctx.createDynamicsCompressor();
      _compressor.threshold.value = -18;
      _compressor.knee.value = 15;
      _compressor.ratio.value = 6;
      _compressor.attack.value = 0.003;
      _compressor.release.value = 0.2;
      _master.connect(_compressor);
      _compressor.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return { ac: _ctx, out: _master! };
  } catch {
    return null;
  }
}

function isEnabled(): boolean {
  try { return localStorage.getItem(LS_ENABLED) !== 'false'; } catch { return true; }
}

function getMasterVolume(): number {
  try {
    const v = localStorage.getItem(LS_VOLUME);
    return v ? Math.max(0, Math.min(1, parseFloat(v))) : 0.5;
  } catch { return 0.5; }
}

// ── Low-level tone helper ──
interface ToneParams {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  sweepDuration?: number;
  delay?: number;
  attack: number;
  hold: number;
  release: number;
  gain: number;
  detune?: number;
}

function tone(ac: AudioContext, dest: AudioNode, t: number, p: ToneParams) {
  const start = t + (p.delay || 0);
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = p.type;
  osc.frequency.setValueAtTime(p.freq, start);
  if (p.detune) osc.detune.setValueAtTime(p.detune, start);
  if (p.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      p.freqEnd,
      start + (p.sweepDuration ?? p.attack + p.hold)
    );
  }
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(p.gain, start + p.attack);
  env.gain.setValueAtTime(p.gain, start + p.attack + p.hold);
  env.gain.exponentialRampToValueAtTime(0.0001, start + p.attack + p.hold + p.release);
  osc.connect(env);
  env.connect(dest);
  osc.start(start);
  osc.stop(start + p.attack + p.hold + p.release + 0.01);
}

function lpf(ac: AudioContext, dest: AudioNode, freq: number, q = 0.7): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

// ── Public API ──

/** Play a raw tone. Useful for custom sounds. */
export function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3
): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = volume * getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol;
    g.connect(out);
    tone(ac, g, ac.currentTime, {
      type, freq,
      attack: 0.004, hold: duration * 0.7, release: duration * 0.3,
      gain: 0.8,
    });
  } catch { /* silent */ }
}

/** Subtle mechanical click — 800 Hz sine burst, ~3 ms */
export function playClick(): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol;
    const f = lpf(ac, g, 2000);
    g.connect(out);
    tone(ac, f, ac.currentTime, { type: 'sine', freq: 800, freqEnd: 700, sweepDuration: 0.005, attack: 0.001, hold: 0.002, release: 0.012, gain: 0.022 });
    tone(ac, f, ac.currentTime, { type: 'sine', freq: 200, attack: 0.001, hold: 0.002, release: 0.008, gain: 0.010 });
  } catch { /* silent */ }
}

/** Message sent — soft ascending C5 → E5 chime (80 ms each) */
export function playSend(): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const f = lpf(ac, g, 3000);
    g.connect(out);
    const t = ac.currentTime;
    // C5 = 523.25 Hz
    tone(ac, f, t, { type: 'triangle', freq: 523.25, attack: 0.004, hold: 0.04, release: 0.08, gain: 0.030 });
    tone(ac, f, t, { type: 'sine',     freq: 523.25, attack: 0.004, hold: 0.035, release: 0.06, gain: 0.015 });
    // E5 = 659.25 Hz
    tone(ac, f, t, { type: 'triangle', freq: 659.25, delay: 0.08, attack: 0.004, hold: 0.04, release: 0.10, gain: 0.025 });
    tone(ac, f, t, { type: 'sine',     freq: 659.25, delay: 0.08, attack: 0.004, hold: 0.035, release: 0.08, gain: 0.012 });
  } catch { /* silent */ }
}

/** Response arrived — gentle descending E5 → C5 */
export function playReceive(): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol * 0.40;
    const f = lpf(ac, g, 2800);
    g.connect(out);
    const t = ac.currentTime;
    // E5 → C5
    tone(ac, f, t, { type: 'triangle', freq: 659.25, freqEnd: 523.25, sweepDuration: 0.14, attack: 0.004, hold: 0.05, release: 0.10, gain: 0.028 });
    tone(ac, f, t, { type: 'sine',     freq: 523.25, delay: 0.06,  attack: 0.005, hold: 0.04, release: 0.08, gain: 0.014 });
  } catch { /* silent */ }
}

/** Thinking loop — gentle pulsing breathing tone. Returns a stop handle. */
let _thinkingHandle: ReturnType<typeof setInterval> | null = null;
let _thinkingGain: GainNode | null = null;

export function playThinking(): void {
  if (!isEnabled()) return;
  if (_thinkingHandle !== null) return; // already running
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();

  try {
    const masterG = ac.createGain();
    masterG.gain.value = vol;
    masterG.connect(out);
    _thinkingGain = masterG;

    let iter = 0;
    const startTime = Date.now();
    const noteSet = [
      [293.66, 329.63],
      [329.63, 369.99],
      [369.99, 440],
      [440,    493.88],
    ] as const;

    const fire = () => {
      if (!_ctx || _ctx.state !== 'running') return;
      const pair = noteSet[iter % noteSet.length];
      const elapsed = (Date.now() - startTime) / 1000;
      const fadeFactor = Math.max(0.25, 1.0 - (elapsed / 90) * 0.75);
      try {
        const f = lpf(ac, masterG, 900, 0.4);
        tone(ac, f, ac.currentTime, {
          type: 'sine',
          freq: pair[0] + (Math.random() - 0.5) * 4,
          freqEnd: pair[1],
          sweepDuration: 1.2,
          attack: 0.15, hold: 0.6, release: 0.8,
          gain: 0.004 * fadeFactor,
        });
      } catch { /* silent */ }
      iter++;
    };

    fire();
    _thinkingHandle = setInterval(fire, 2500);
  } catch { /* silent */ }
}

/** Stop the thinking loop with a gentle fade */
export function stopThinking(): void {
  if (_thinkingHandle !== null) {
    clearInterval(_thinkingHandle);
    _thinkingHandle = null;
  }
  if (_thinkingGain && _ctx) {
    try {
      const now = _ctx.currentTime;
      _thinkingGain.gain.setValueAtTime(_thinkingGain.gain.value, now);
      _thinkingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      const g = _thinkingGain;
      setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, 500);
    } catch { /* silent */ }
  }
  _thinkingGain = null;
}

/** Short descending tone — agent stopped */
export function playStop(): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const f = lpf(ac, g, 1600);
    g.connect(out);
    const t = ac.currentTime;
    tone(ac, f, t, { type: 'triangle', freq: 440, freqEnd: 293.66, sweepDuration: 0.12, attack: 0.004, hold: 0.04, release: 0.10, gain: 0.030 });
    tone(ac, f, t, { type: 'sine',     freq: 293.66, delay: 0.02,   attack: 0.005, hold: 0.03, release: 0.07, gain: 0.014 });
  } catch { /* silent */ }
}

/** 3-note ascending completion chime — D5 → F#5 → A5 */
export function playSuccess(): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol * 0.40;
    const f = lpf(ac, g, 3200);
    g.connect(out);
    const t = ac.currentTime;
    // D5 = 587.33, F#5 = 739.99, A5 = 880
    tone(ac, f, t, { type: 'triangle', freq: 587.33, attack: 0.003, hold: 0.03, release: 0.08, gain: 0.032 });
    tone(ac, f, t, { type: 'sine',     freq: 587.33, attack: 0.003, hold: 0.025, release: 0.06, gain: 0.016 });
    tone(ac, f, t, { type: 'triangle', freq: 739.99, delay: 0.07,  attack: 0.003, hold: 0.03, release: 0.08, gain: 0.028 });
    tone(ac, f, t, { type: 'triangle', freq: 880.00, delay: 0.14,  attack: 0.003, hold: 0.04, release: 0.12, gain: 0.024 });
    tone(ac, f, t, { type: 'sine',     freq: 880.00, delay: 0.14,  attack: 0.003, hold: 0.035, release: 0.10, gain: 0.012 });
  } catch { /* silent */ }
}

/** Low dissonant tone — error state */
export function playError(): void {
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;
  const vol = getMasterVolume();
  try {
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const f = lpf(ac, g, 500);
    g.connect(out);
    const t = ac.currentTime;
    tone(ac, f, t, { type: 'triangle', freq: 246.94, freqEnd: 220, sweepDuration: 0.10, attack: 0.004, hold: 0.05, release: 0.12, gain: 0.045 });
    tone(ac, f, t, { type: 'sine',     freq: 123.47, attack: 0.003, hold: 0.04, release: 0.08, gain: 0.025 });
  } catch { /* silent */ }
}

/** Set master volume (0-1). Persists to localStorage. */
export function setVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(LS_VOLUME, String(clamped)); } catch { /* silent */ }
  if (_master && _ctx) {
    try { _master.gain.setValueAtTime(clamped, _ctx.currentTime); } catch { /* silent */ }
  }
}

/** Enable or disable all sounds. Persists to localStorage. */
export function setEnabled(enabled: boolean): void {
  try { localStorage.setItem(LS_ENABLED, enabled ? 'true' : 'false'); } catch { /* silent */ }
  if (!enabled) {
    stopThinking();
    stopAmbient();
  }
}

export function getSoundEnabled(): boolean {
  return isEnabled();
}

// ── Ambient drone system ──
// Layered oscillators: deep bass ~55 Hz + harmonic ~110 Hz + subtle ~220 Hz
// with slow LFO modulation for "space" feel. Very low volume (0.02-0.04).

let _ambientNodes: AudioNode[] = [];
let _ambientMaster: GainNode | null = null;
let _ambientRunning = false;

export function startAmbient(): void {
  if (_ambientRunning) return;
  if (!isEnabled()) return;
  const r = getCtx();
  if (!r) return;
  const { ac, out } = r;

  try {
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(out);
    _ambientMaster = master;
    _ambientNodes = [master];

    const addOsc = (freq: number, vol: number, detune = 0, filterFreq = 200, lfoRate = 0.05, lfoAmount = 0.4) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filt = ac.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = filterFreq;
      filt.Q.value = 0.5;
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.value = vol;
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(master);
      osc.start();

      // Slow LFO for breathing modulation
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = lfoRate;
      lfoGain.gain.value = lfoAmount * vol;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      _ambientNodes.push(osc, gain, filt, lfo, lfoGain);
    };

    // Deep bass ~55 Hz (A1) — grounding sub-drone
    addOsc(55.00, 0.04, 0,    180, 0.04, 0.3);
    // Harmonic ~110 Hz (A2) — warm presence
    addOsc(110.00, 0.025, 3,  250, 0.06, 0.25);
    // Subtle ~220 Hz (A3) — air
    addOsc(220.00, 0.012, -2, 400, 0.08, 0.35);
    // Very faint ~165 Hz (E3) — adds cosmic "open fifth" quality
    addOsc(164.81, 0.008, 6,  350, 0.035, 0.2);

    // Fade in over 4 seconds
    master.gain.setValueAtTime(0, ac.currentTime);
    master.gain.linearRampToValueAtTime(1, ac.currentTime + 4);

    _ambientRunning = true;
  } catch { /* silent */ }
}

export function stopAmbient(): void {
  if (!_ambientRunning || !_ambientMaster || !_ctx) return;

  const master = _ambientMaster;
  const nodes = [..._ambientNodes];
  const ac = _ctx;

  try {
    const now = ac.currentTime;
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 3);
  } catch { /* silent */ }

  setTimeout(() => {
    nodes.forEach(n => {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          (n as OscillatorNode).stop();
        }
        n.disconnect();
      } catch { /* already gone */ }
    });
  }, 3200);

  _ambientNodes = [];
  _ambientMaster = null;
  _ambientRunning = false;
}

export function isAmbientRunning(): boolean {
  return _ambientRunning;
}
