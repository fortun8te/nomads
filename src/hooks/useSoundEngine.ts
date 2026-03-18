/**
 * useSoundEngine — Web Audio API synthesis for clean SaaS interaction sounds.
 *
 * All sounds are generated procedurally — no external audio files.
 * Sonic palette is based on A-major intervals (A, C#, E) for cohesion.
 * Uses exponential envelopes for natural decay + master compressor for polish.
 *
 * v2: Added typing, stageComplete (AHA), and thinking loop system.
 */

import { useCallback, useRef } from 'react';

export type SoundType =
  | 'launch'         // Run Pipeline, Go/Generate
  | 'stop'           // Stop pipeline, cancel
  | 'click'          // Generic meaningful button press
  | 'tab'            // Tab switch (nav, drawer tabs)
  | 'navigate'       // Main nav (Research / Make / Test)
  | 'open'           // Drawer / modal open
  | 'close'          // Drawer / modal close
  | 'success'        // Completion chime
  | 'error'          // Error notification
  | 'reset'          // Reset action
  | 'toggle'         // Toggle on/off
  | 'typing'         // Warm mellow keyboard tick
  | 'stageComplete'  // AHA moment arpeggio
  | 'hover'          // Magnetic attraction — subtle tooltip/hover
  | 'select'         // Confirmatory selection (persona, preset, etc.)
  | 'delete'         // Removal/clear confirmation
  | 'notify'         // Notification ping
  | 'expand'         // Section/accordion expand
  | 'collapse'       // Section/accordion collapse
  | 'whoosh'         // Fast transition / page switch animation
  | 'drop'           // Item dropped/attached (image drop, file attach)
  | 'connect'        // Bluetooth-style pairing chime (AI connection established)
  | 'connectFail';   // Connection failed — low warning tone

// ── Singleton AudioContext + compressor ──

let ctx: AudioContext | null = null;
let compressor: DynamicsCompressorNode | null = null;

function getAudio(): { ctx: AudioContext; out: AudioNode } {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 20;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.15;
    compressor.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return { ctx, out: compressor! };
}

// ── Tone helper: oscillator → gain envelope → destination ──

interface ToneOpts {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  sweepDuration?: number;
  delay?: number;       // seconds offset from t
  attack: number;       // seconds
  hold: number;         // seconds
  release: number;      // seconds
  gain: number;         // 0-1
  detune?: number;      // cents
}

function playTone(ac: AudioContext, dest: AudioNode, t: number, opts: ToneOpts) {
  const start = t + (opts.delay || 0);
  const osc = ac.createOscillator();
  const env = ac.createGain();

  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, start);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      opts.freqEnd,
      start + (opts.sweepDuration || opts.attack + opts.hold)
    );
  }

  // Envelope: linear attack → hold → exponential release
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(opts.gain, start + opts.attack);
  env.gain.setValueAtTime(opts.gain, start + opts.attack + opts.hold);
  env.gain.exponentialRampToValueAtTime(0.0001, start + opts.attack + opts.hold + opts.release);

  osc.connect(env);
  env.connect(dest);
  osc.start(start);
  osc.stop(start + opts.attack + opts.hold + opts.release + 0.01);
}

// ── Filter helper ──

function createLPF(ac: AudioContext, dest: AudioNode, freq: number): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = 0.7;
  f.connect(dest);
  return f;
}

// ── Sound definitions ──

type SoundFn = (vol: number) => void;

const sounds: Record<SoundType, SoundFn> = {

  // ── Launch: Soft confirmation — single clean tone ──
  launch(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.6;
    const lpf = createLPF(ac, g, 2000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 440, freqEnd: 520, sweepDuration: 0.08, attack: 0.005, hold: 0.04, release: 0.08, gain: 0.03 });
    playTone(ac, lpf, t, { type: 'sine', freq: 660, delay: 0.06, attack: 0.004, hold: 0.03, release: 0.06, gain: 0.015 });
  },

  // ── Stop: Single soft descending tone ──
  stop(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.6;
    const lpf = createLPF(ac, g, 1500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 480, freqEnd: 360, sweepDuration: 0.08, attack: 0.004, hold: 0.04, release: 0.08, gain: 0.04 });
  },

  // ── Click: Soft tactile tap — like touching glass ──
  click(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    // Soft thud with tiny bright edge
    playTone(ac, lpf, t, { type: 'sine', freq: 600, freqEnd: 500, sweepDuration: 0.015, attack: 0.001, hold: 0.006, release: 0.025, gain: 0.03 });
    playTone(ac, lpf, t, { type: 'triangle', freq: 180, attack: 0.001, hold: 0.004, release: 0.018, gain: 0.015 });
  },

  // ── Tab: Minimal air switch — barely audible ──
  tab(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 800, freqEnd: 900, sweepDuration: 0.02, attack: 0.002, hold: 0.008, release: 0.03, gain: 0.02 });
  },

  // ── Navigate: Soft glass slide — premium feel ──
  navigate(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3500);
    g.connect(out);

    // Soft tone with gentle harmonic
    playTone(ac, lpf, t, { type: 'sine', freq: 600, freqEnd: 720, sweepDuration: 0.04, attack: 0.003, hold: 0.015, release: 0.05, gain: 0.025 });
    playTone(ac, lpf, t, { type: 'sine', freq: 900, delay: 0.01, attack: 0.003, hold: 0.01, release: 0.04, gain: 0.012 });
  },

  // ── Open: Soft rising breath — like a drawer sliding ──
  open(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 350, freqEnd: 500, sweepDuration: 0.08, attack: 0.005, hold: 0.04, release: 0.10, gain: 0.035 });
    playTone(ac, lpf, t, { type: 'sine', freq: 500, freqEnd: 650, sweepDuration: 0.07, delay: 0.015, attack: 0.005, hold: 0.03, release: 0.08, gain: 0.018 });
  },

  // ── Close: Soft falling breath ──
  close(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 500, freqEnd: 350, sweepDuration: 0.06, attack: 0.004, hold: 0.03, release: 0.08, gain: 0.03 });
  },

  // ── Success: Two quick tones — understated confirmation ──
  success(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 520, attack: 0.004, hold: 0.04, release: 0.08, gain: 0.04 });
    playTone(ac, lpf, t, { type: 'sine', freq: 660, delay: 0.07, attack: 0.004, hold: 0.04, release: 0.10, gain: 0.03 });
  },

  // ── Error: Single low thud ──
  error(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 400);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 260, freqEnd: 220, sweepDuration: 0.08, attack: 0.003, hold: 0.05, release: 0.08, gain: 0.05 });
  },

  // ── Reset: Descending octave sweep ──
  reset(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    g.connect(out);

    playTone(ac, g, t, { type: 'sine', freq: 659, freqEnd: 330, sweepDuration: 0.14, attack: 0.005, hold: 0.08, release: 0.12, gain: 0.07 });
    playTone(ac, g, t, { type: 'sine', freq: 831, freqEnd: 415, sweepDuration: 0.12, delay: 0.01, attack: 0.005, hold: 0.06, release: 0.10, gain: 0.03 });
  },

  // ── Toggle: Minimal switch tick ──
  toggle(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 700, freqEnd: 800, sweepDuration: 0.015, attack: 0.001, hold: 0.008, release: 0.025, gain: 0.025 });
  },

  // ── Typing: Deep mellow keyboard thud — tiktok-trendy warm tactile feel ──
  typing(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;

    // Low-pass filter at 600Hz to cut brightness — warm only
    const lpf = createLPF(ac, out, 600);
    g.connect(lpf);

    // Randomize pitch between 200-400Hz for deep organic feel
    const freq = 200 + Math.random() * 200;
    playTone(ac, g, t, { type: 'sine', freq, freqEnd: freq * 0.88, sweepDuration: 0.02, attack: 0.001, hold: 0.010, release: 0.035, gain: 0.025 });
    // Deep body thud (lower harmonic)
    playTone(ac, g, t, { type: 'triangle', freq: 100 + Math.random() * 100, attack: 0.001, hold: 0.006, release: 0.025, gain: 0.012 });
  },

  // ── Stage Complete: Clean double-ping — task done, not a celebration ──
  stageComplete(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 600, attack: 0.003, hold: 0.03, release: 0.06, gain: 0.04 });
    playTone(ac, lpf, t, { type: 'sine', freq: 750, delay: 0.08, attack: 0.003, hold: 0.04, release: 0.10, gain: 0.03 });
  },

  // ── Hover: Barely-there whisper — ultra subtle ──
  hover(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 4000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 900, freqEnd: 1000, sweepDuration: 0.015, attack: 0.002, hold: 0.005, release: 0.02, gain: 0.01 });
  },

  // ── Select: Soft confirm tap — single subtle tone ──
  select(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 650, freqEnd: 720, sweepDuration: 0.025, attack: 0.002, hold: 0.012, release: 0.035, gain: 0.025 });
    playTone(ac, lpf, t, { type: 'sine', freq: 900, delay: 0.015, attack: 0.002, hold: 0.008, release: 0.03, gain: 0.012 });
  },

  // ── Delete: Soft descending whomp — confirmation of removal ──
  delete(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 800);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 440, freqEnd: 220, sweepDuration: 0.10, attack: 0.004, hold: 0.04, release: 0.10, gain: 0.06 });
    playTone(ac, lpf, t, { type: 'triangle', freq: 330, freqEnd: 165, sweepDuration: 0.10, attack: 0.004, hold: 0.03, release: 0.08, gain: 0.025 });
  },

  // ── Notify: Single soft ping ──
  notify(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 880, attack: 0.002, hold: 0.03, release: 0.10, gain: 0.04 });
  },

  // ── Expand: Soft rising breath — section opening ──
  expand(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    g.connect(out);

    playTone(ac, g, t, { type: 'sine', freq: 523, freqEnd: 784, sweepDuration: 0.08, attack: 0.005, hold: 0.04, release: 0.08, gain: 0.04 });
    playTone(ac, g, t, { type: 'sine', freq: 659, freqEnd: 988, sweepDuration: 0.08, delay: 0.01, attack: 0.005, hold: 0.03, release: 0.07, gain: 0.02 });
  },

  // ── Collapse: Soft falling breath — section closing ──
  collapse(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    g.connect(out);

    playTone(ac, g, t, { type: 'sine', freq: 784, freqEnd: 523, sweepDuration: 0.07, attack: 0.004, hold: 0.03, release: 0.06, gain: 0.035 });
  },

  // ── Whoosh: Soft air movement — like a page turning ──
  whoosh(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    // Gentle sweep — more breath than whoosh
    playTone(ac, lpf, t, { type: 'sine', freq: 250, freqEnd: 800, sweepDuration: 0.06, attack: 0.003, hold: 0.01, release: 0.05, gain: 0.018 });
    playTone(ac, lpf, t, { type: 'sine', freq: 400, freqEnd: 600, sweepDuration: 0.04, delay: 0.01, attack: 0.003, hold: 0.008, release: 0.04, gain: 0.01 });
  },

  // ── Drop: Item landed/attached — satisfying plop ──
  drop(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    g.connect(out);

    // Impact
    playTone(ac, g, t, { type: 'sine', freq: 440, freqEnd: 330, sweepDuration: 0.03, attack: 0.002, hold: 0.015, release: 0.06, gain: 0.08 });
    // Settle bounce
    playTone(ac, g, t, { type: 'sine', freq: 554, delay: 0.04, attack: 0.002, hold: 0.01, release: 0.04, gain: 0.04 });
    // Confirmation ring
    playTone(ac, g, t, { type: 'sine', freq: 659, delay: 0.07, attack: 0.003, hold: 0.02, release: 0.08, gain: 0.035 });
  },

  // ── Connect: Two quick ascending pings ──
  connect(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 550, attack: 0.003, hold: 0.03, release: 0.06, gain: 0.035 });
    playTone(ac, lpf, t, { type: 'sine', freq: 700, delay: 0.1, attack: 0.003, hold: 0.04, release: 0.08, gain: 0.03 });
  },

  // ── ConnectFail: Single low tone ──
  connectFail(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 800);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 350, freqEnd: 280, sweepDuration: 0.08, attack: 0.003, hold: 0.04, release: 0.08, gain: 0.04 });
  },
};

// ── Loop system: repeating sound patterns (e.g. "thinking" ba-ba-ba) ──

interface ActiveLoop {
  intervalId: ReturnType<typeof setInterval>;
  masterGain: GainNode;
  iteration: number;
  startTime: number;
}

const activeLoops = new Map<string, ActiveLoop>();

/** Play the "thinking" pattern — soft ambient pulse, not melodic pips */
function playThinkingPattern(ac: AudioContext, dest: AudioNode, vol: number) {
  const t = ac.currentTime;
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 1200;
  lpf.Q.value = 0.5;
  lpf.connect(dest);
  // Very subtle pulse — barely audible
  playTone(ac, lpf, t, {
    type: 'sine', freq: 300, freqEnd: 330, sweepDuration: 0.06,
    attack: 0.01, hold: 0.03, release: 0.10, gain: vol * 0.006,
  });
}

/**
 * Start a repeating sound loop.
 * Currently supports 'thinking' — ba-ba-ba-ba pattern every 2s with progressive fade.
 */
export function startSoundLoop(name: string) {
  if (localStorage.getItem('sound_enabled') === 'false') return;
  if (activeLoops.has(name)) return; // already running

  const { ctx: ac, out } = getAudio();
  const volStr = localStorage.getItem('sound_volume');
  const baseVol = volStr ? Math.max(0, Math.min(1, parseFloat(volStr))) : 0.5;

  // Master gain for this loop (for progressive fade)
  const masterGain = ac.createGain();
  masterGain.gain.value = baseVol;
  masterGain.connect(out);

  const startTime = Date.now();

  // Play immediately, then repeat
  try { playThinkingPattern(ac, masterGain, 1.0); } catch { /* silent */ }

  const intervalId = setInterval(() => {
    if (localStorage.getItem('sound_enabled') === 'false') {
      stopSoundLoop(name);
      return;
    }

    const loop = activeLoops.get(name);
    if (!loop) return;

    loop.iteration++;

    // Progressive volume fade: 100% → 30% over ~60 seconds
    const elapsed = (Date.now() - loop.startTime) / 1000;
    const fadeFactor = Math.max(0.3, 1.0 - (elapsed / 60) * 0.7);

    try {
      loop.masterGain.gain.setValueAtTime(baseVol * fadeFactor, ac.currentTime);
      playThinkingPattern(ac, loop.masterGain, fadeFactor);
    } catch {
      stopSoundLoop(name);
    }
  }, 2000);

  activeLoops.set(name, {
    intervalId,
    masterGain,
    iteration: 0,
    startTime,
  });
}

/** Stop a sound loop with quick fade-out */
export function stopSoundLoop(name: string) {
  const loop = activeLoops.get(name);
  if (!loop) return;

  clearInterval(loop.intervalId);

  // Quick fade out over 200ms
  try {
    const { ctx: ac } = getAudio();
    const now = ac.currentTime;
    loop.masterGain.gain.setValueAtTime(loop.masterGain.gain.value, now);
    loop.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    // Disconnect after fade
    setTimeout(() => {
      try { loop.masterGain.disconnect(); } catch { /* already disconnected */ }
    }, 300);
  } catch { /* silent */ }

  activeLoops.delete(name);
}

// ── Hook ──

export function useSoundEngine() {
  const lastTypingRef = useRef<number>(0);

  const play = useCallback((type: SoundType) => {
    if (localStorage.getItem('sound_enabled') === 'false') return;

    // Debounce typing at 65ms
    if (type === 'typing') {
      const now = Date.now();
      if (now - lastTypingRef.current < 65) return;
      lastTypingRef.current = now;
    }

    const volStr = localStorage.getItem('sound_volume');
    const volume = volStr ? Math.max(0, Math.min(1, parseFloat(volStr))) : 0.5;

    try {
      sounds[type](volume);
    } catch {
      // AudioContext can fail in some environments — fail silently
    }
  }, []);

  const startLoop = useCallback((name: string) => {
    startSoundLoop(name);
  }, []);

  const stopLoop = useCallback((name: string) => {
    stopSoundLoop(name);
  }, []);

  return { play, startLoop, stopLoop };
}

// ── Standalone play (for non-React contexts) ──

export function playSound(type: SoundType) {
  if (localStorage.getItem('sound_enabled') === 'false') return;
  const volStr = localStorage.getItem('sound_volume');
  const volume = volStr ? Math.max(0, Math.min(1, parseFloat(volStr))) : 0.5;
  try {
    sounds[type](volume);
  } catch {
    // silent
  }
}
