/**
 * useSoundEngine — Web Audio API synthesis for premium creative tool interactions.
 *
 * All sounds are generated procedurally — no external audio files.
 * Tonal palette is based on D major / B minor intervals to harmonize
 * with the ambient soundtrack (D, F#, A, B, E — warm, open, intimate).
 *
 * Design philosophy:
 *   - Warm, not clinical — triangle waves + low-pass filtering over pure sine
 *   - Layered — each sound has a fundamental + harmonic + body for depth
 *   - Organic — subtle randomization in pitch/timing for human feel
 *   - Proportional — bigger actions = richer sounds, micro-interactions = whispers
 *
 * v3: Cohesive D-major palette, Karplus-Strong plucks for key moments,
 *     richer envelopes, thinking loop with gentle breathing.
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
  | 'stageComplete'  // AHA moment — gentle guitar-like arpeggio
  | 'hover'          // Magnetic attraction — subtle tooltip/hover
  | 'select'         // Confirmatory selection (persona, preset, etc.)
  | 'delete'         // Removal/clear confirmation
  | 'notify'         // Notification ping
  | 'expand'         // Section/accordion expand
  | 'collapse'       // Section/accordion collapse
  | 'whoosh'         // Fast transition / page switch animation
  | 'drop'           // Item dropped/attached (image drop, file attach)
  | 'connect'        // AI connection established — warm ascending
  | 'connectFail';   // Connection failed — gentle low warning

// ── D major / B minor reference frequencies ──
// D3=146.83 E3=164.81 F#3=185.00 G3=196.00 A3=220.00 B3=246.94
// D4=293.66 E4=329.63 F#4=369.99 A4=440.00 B4=493.88
// D5=587.33 F#5=739.99 A5=880.00

// ── Singleton AudioContext + compressor ──

let ctx: AudioContext | null = null;
let compressor: DynamicsCompressorNode | null = null;

function getAudio(): { ctx: AudioContext; out: AudioNode } {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 15;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return { ctx, out: compressor! };
}

// ── Tone helper: oscillator with envelope → destination ──

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

function createLPF(ac: AudioContext, dest: AudioNode, freq: number, q = 0.7): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

// ── Mini Karplus-Strong pluck for UI sounds ──
// Creates a short plucked-string texture (guitar harmonic feel)
function playPluck(ac: AudioContext, dest: AudioNode, freq: number, vol: number, duration = 0.4, brightness = 0.4, delay = 0) {
  const sampleRate = ac.sampleRate;
  const periodSamples = Math.round(sampleRate / freq);
  const totalSamples = Math.round(sampleRate * duration);
  const buffer = ac.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  // Initialize delay line with shaped noise burst
  const delayLine = new Float32Array(periodSamples);
  for (let i = 0; i < periodSamples; i++) {
    delayLine[i] = (Math.random() * 2 - 1) * Math.exp(-i / (periodSamples * 0.25));
  }

  const dampingFactor = 0.994 + brightness * 0.005;
  let readIdx = 0;
  for (let i = 0; i < totalSamples; i++) {
    const nextIdx = (readIdx + 1) % periodSamples;
    const filtered = (delayLine[readIdx] + delayLine[nextIdx]) * 0.5 * dampingFactor;
    data[i] = filtered;
    delayLine[readIdx] = filtered;
    readIdx = nextIdx;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const env = ac.createGain();
  const startTime = ac.currentTime + delay;
  env.gain.setValueAtTime(vol, startTime);
  env.gain.setValueAtTime(vol, startTime + duration * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 600 + brightness * 2500;
  lpf.Q.value = 0.3;

  source.connect(lpf);
  lpf.connect(env);
  env.connect(dest);
  source.start(startTime);
  source.stop(startTime + duration + 0.01);
}

// ── Sound definitions ──

type SoundFn = (vol: number) => void;

const sounds: Record<SoundType, SoundFn> = {

  // ── Launch: Warm ascending D-A interval — like pressing "go" on something meaningful ──
  // Two layered plucked notes with a sine undertone for body
  launch(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.55;
    const lpf = createLPF(ac, g, 2200);
    g.connect(out);

    // D4 → A4 rising interval (perfect fifth — confident, open)
    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, attack: 0.004, hold: 0.03, release: 0.08, gain: 0.035 });
    playTone(ac, lpf, t, { type: 'sine', freq: 293.66, attack: 0.004, hold: 0.025, release: 0.06, gain: 0.02 }); // body
    playTone(ac, lpf, t, { type: 'triangle', freq: 440, delay: 0.06, attack: 0.004, hold: 0.035, release: 0.10, gain: 0.028 });
    playTone(ac, lpf, t, { type: 'sine', freq: 440, delay: 0.06, attack: 0.004, hold: 0.03, release: 0.08, gain: 0.015 }); // body
    // Subtle pluck texture on second note
    playPluck(ac, lpf, 440, vol * 0.012, 0.25, 0.3, 0.06);
  },

  // ── Stop: Gentle descending A→D — settling back down ──
  stop(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.5;
    const lpf = createLPF(ac, g, 1400);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 440, freqEnd: 330, sweepDuration: 0.10, attack: 0.004, hold: 0.04, release: 0.10, gain: 0.035 });
    playTone(ac, lpf, t, { type: 'sine', freq: 293.66, delay: 0.02, attack: 0.006, hold: 0.03, release: 0.08, gain: 0.015 });
  },

  // ── Click: Soft wooden tap — like touching warm lacquered wood ──
  click(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2000);
    g.connect(out);

    // Fundamental tap on D
    playTone(ac, lpf, t, { type: 'triangle', freq: 587.33, freqEnd: 500, sweepDuration: 0.012, attack: 0.001, hold: 0.005, release: 0.025, gain: 0.025 });
    // Warm body thud
    playTone(ac, lpf, t, { type: 'sine', freq: 146.83, attack: 0.001, hold: 0.004, release: 0.020, gain: 0.015 });
  },

  // ── Tab: Tiny string touch — like a fingertip brushing a guitar string ──
  tab(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    // Tiny pluck texture
    playPluck(ac, lpf, 739.99, vol * 0.008, 0.12, 0.25);
    playTone(ac, lpf, t, { type: 'sine', freq: 739.99, attack: 0.001, hold: 0.006, release: 0.025, gain: 0.012 });
  },

  // ── Navigate: Smooth slide between two harmonics — like a finger sliding on strings ──
  navigate(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    // D4 → F#4 slide (major third — warm, resolved)
    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, freqEnd: 369.99, sweepDuration: 0.05, attack: 0.003, hold: 0.015, release: 0.06, gain: 0.022 });
    // Harmonic shimmer
    playTone(ac, lpf, t, { type: 'sine', freq: 587.33, freqEnd: 739.99, sweepDuration: 0.05, delay: 0.008, attack: 0.003, hold: 0.01, release: 0.04, gain: 0.010 });
  },

  // ── Open: Rising breath — D→A with soft noise wash ──
  open(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2400);
    g.connect(out);

    // Warm rising tone
    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, freqEnd: 440, sweepDuration: 0.10, attack: 0.006, hold: 0.04, release: 0.12, gain: 0.030 });
    // Gentle harmonic fill
    playTone(ac, lpf, t, { type: 'sine', freq: 440, freqEnd: 587.33, sweepDuration: 0.09, delay: 0.02, attack: 0.006, hold: 0.03, release: 0.08, gain: 0.015 });
    // Soft pluck accent
    playPluck(ac, lpf, 587.33, vol * 0.006, 0.2, 0.2, 0.04);
  },

  // ── Close: Falling breath — A→D, settling ──
  close(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2000);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 440, freqEnd: 293.66, sweepDuration: 0.08, attack: 0.005, hold: 0.03, release: 0.10, gain: 0.025 });
    playTone(ac, lpf, t, { type: 'sine', freq: 329.63, delay: 0.01, attack: 0.004, hold: 0.02, release: 0.06, gain: 0.012 });
  },

  // ── Success: D→F#→A arpeggio — warm major triad, understated triumph ──
  success(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    // D4
    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, attack: 0.003, hold: 0.03, release: 0.08, gain: 0.035 });
    playTone(ac, lpf, t, { type: 'sine', freq: 293.66, attack: 0.003, hold: 0.025, release: 0.06, gain: 0.018 });
    // F#4
    playTone(ac, lpf, t, { type: 'triangle', freq: 369.99, delay: 0.06, attack: 0.003, hold: 0.03, release: 0.08, gain: 0.030 });
    // A4
    playTone(ac, lpf, t, { type: 'triangle', freq: 440, delay: 0.12, attack: 0.003, hold: 0.04, release: 0.12, gain: 0.028 });
    playTone(ac, lpf, t, { type: 'sine', freq: 440, delay: 0.12, attack: 0.003, hold: 0.035, release: 0.10, gain: 0.014 });
  },

  // ── Error: B→Bb (chromatic descent) — slightly dissonant, but gentle ──
  error(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const lpf = createLPF(ac, g, 500);
    g.connect(out);

    // Low B with chromatic slip to Bb — unsettled
    playTone(ac, lpf, t, { type: 'triangle', freq: 246.94, freqEnd: 233.08, sweepDuration: 0.10, attack: 0.004, hold: 0.05, release: 0.10, gain: 0.045 });
    // Sub-bass thud
    playTone(ac, lpf, t, { type: 'sine', freq: 123.47, attack: 0.003, hold: 0.04, release: 0.08, gain: 0.025 });
  },

  // ── Reset: D5 → D4 falling octave — clear restart ──
  reset(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 587.33, freqEnd: 293.66, sweepDuration: 0.15, attack: 0.005, hold: 0.06, release: 0.14, gain: 0.045 });
    playTone(ac, lpf, t, { type: 'sine', freq: 739.99, freqEnd: 369.99, sweepDuration: 0.13, delay: 0.01, attack: 0.005, hold: 0.04, release: 0.10, gain: 0.020 });
  },

  // ── Toggle: Quick pluck — like flicking a guitar string ──
  toggle(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    playPluck(ac, lpf, 587.33, vol * 0.010, 0.15, 0.35);
    playTone(ac, lpf, t, { type: 'sine', freq: 587.33, freqEnd: 659.25, sweepDuration: 0.02, attack: 0.001, hold: 0.008, release: 0.028, gain: 0.018 });
  },

  // ── Typing: Deep warm thud — wooden keyboard on a quiet desk ──
  typing(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;

    // Very warm low-pass — only deep body
    const lpf = createLPF(ac, out, 500, 0.5);
    g.connect(lpf);

    // Randomize around D scale tones for organic feel
    const baseFreqs = [146.83, 164.81, 185.00, 196.00, 220.00];
    const freq = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];
    const drift = (Math.random() - 0.5) * 15; // subtle pitch humanization

    playTone(ac, g, t, { type: 'triangle', freq: freq + drift, freqEnd: (freq + drift) * 0.90, sweepDuration: 0.018, attack: 0.001, hold: 0.008, release: 0.032, gain: 0.020 });
    // Sub-thud body
    playTone(ac, g, t, { type: 'sine', freq: 73 + Math.random() * 40, attack: 0.001, hold: 0.005, release: 0.022, gain: 0.010 });
  },

  // ── Stage Complete: Gentle guitar arpeggio — D→F#→A→D5 ──
  // Like the resolution at the end of a phrase in Futile Devices
  stageComplete(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.4;
    const lpf = createLPF(ac, g, 3000);
    g.connect(out);

    // Plucked arpeggio — D major rising
    const notes = [293.66, 369.99, 440, 587.33]; // D4, F#4, A4, D5
    notes.forEach((freq, i) => {
      const delay = i * 0.09; // 90ms between notes — unhurried
      playPluck(ac, lpf, freq, vol * 0.015, 0.5 + i * 0.15, 0.3 + i * 0.05, delay);
      // Soft sine undertone for warmth
      playTone(ac, lpf, t, {
        type: 'sine', freq, delay,
        attack: 0.005, hold: 0.03 + i * 0.01, release: 0.12 + i * 0.04,
        gain: 0.018 - i * 0.002
      });
    });
    // Final high D5 ring — let it sustain a bit longer
    playTone(ac, lpf, t, {
      type: 'sine', freq: 587.33, delay: 0.27,
      attack: 0.008, hold: 0.06, release: 0.25,
      gain: 0.010, detune: 3 // barely sharp — shimmer
    });
  },

  // ── Hover: Barely-there harmonic whisper ──
  hover(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 3500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'sine', freq: 880, freqEnd: 940, sweepDuration: 0.015, attack: 0.002, hold: 0.004, release: 0.018, gain: 0.008 });
  },

  // ── Select: Soft confirmatory pluck + tone — like picking a string ──
  select(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    playPluck(ac, lpf, 440, vol * 0.010, 0.2, 0.35);
    playTone(ac, lpf, t, { type: 'sine', freq: 440, attack: 0.002, hold: 0.010, release: 0.035, gain: 0.020 });
    // Gentle fifth above for confirmation color
    playTone(ac, lpf, t, { type: 'sine', freq: 659.25, delay: 0.012, attack: 0.002, hold: 0.008, release: 0.028, gain: 0.010 });
  },

  // ── Delete: Low descending sweep — B→E (falling fourth) ──
  delete(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 700);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 246.94, freqEnd: 164.81, sweepDuration: 0.12, attack: 0.004, hold: 0.04, release: 0.10, gain: 0.045 });
    playTone(ac, lpf, t, { type: 'sine', freq: 185, freqEnd: 110, sweepDuration: 0.10, delay: 0.01, attack: 0.004, hold: 0.03, release: 0.08, gain: 0.020 });
  },

  // ── Notify: Single warm ping on A5 ──
  notify(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    playPluck(ac, lpf, 880, vol * 0.012, 0.3, 0.4);
    playTone(ac, lpf, t, { type: 'sine', freq: 880, attack: 0.002, hold: 0.025, release: 0.12, gain: 0.030 });
  },

  // ── Expand: Rising D→A open fifth — space opening up ──
  expand(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, freqEnd: 440, sweepDuration: 0.08, attack: 0.004, hold: 0.03, release: 0.08, gain: 0.030 });
    playTone(ac, lpf, t, { type: 'sine', freq: 369.99, freqEnd: 587.33, sweepDuration: 0.08, delay: 0.01, attack: 0.004, hold: 0.025, release: 0.06, gain: 0.015 });
  },

  // ── Collapse: Falling A→D — folding back ──
  collapse(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2200);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 440, freqEnd: 293.66, sweepDuration: 0.07, attack: 0.004, hold: 0.025, release: 0.06, gain: 0.028 });
  },

  // ── Whoosh: Soft filtered noise sweep — like turning a page in a quiet room ──
  whoosh(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    // Tonal sweep for body
    playTone(ac, lpf, t, { type: 'triangle', freq: 220, freqEnd: 587.33, sweepDuration: 0.06, attack: 0.003, hold: 0.008, release: 0.04, gain: 0.014 });
    // Higher harmonic for air
    playTone(ac, lpf, t, { type: 'sine', freq: 329.63, freqEnd: 659.25, sweepDuration: 0.05, delay: 0.008, attack: 0.003, hold: 0.006, release: 0.035, gain: 0.008 });
  },

  // ── Drop: Item landed — warm impact + settle + ring ──
  drop(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol;
    const lpf = createLPF(ac, g, 2500);
    g.connect(out);

    // Impact (D4 falling)
    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, freqEnd: 220, sweepDuration: 0.03, attack: 0.002, hold: 0.012, release: 0.05, gain: 0.060 });
    // Settle bounce (F#4)
    playTone(ac, lpf, t, { type: 'sine', freq: 369.99, delay: 0.04, attack: 0.002, hold: 0.008, release: 0.04, gain: 0.030 });
    // Plucked confirmation ring (A4)
    playPluck(ac, lpf, 440, vol * 0.012, 0.3, 0.35, 0.07);
    playTone(ac, lpf, t, { type: 'sine', freq: 440, delay: 0.07, attack: 0.003, hold: 0.015, release: 0.08, gain: 0.025 });
  },

  // ── Connect: Warm ascending D→A→D5 — connection established ──
  connect(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const lpf = createLPF(ac, g, 2800);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 293.66, attack: 0.003, hold: 0.025, release: 0.06, gain: 0.030 });
    playTone(ac, lpf, t, { type: 'triangle', freq: 440, delay: 0.08, attack: 0.003, hold: 0.030, release: 0.08, gain: 0.025 });
    playPluck(ac, lpf, 587.33, vol * 0.010, 0.3, 0.35, 0.16);
    playTone(ac, lpf, t, { type: 'sine', freq: 587.33, delay: 0.16, attack: 0.003, hold: 0.035, release: 0.10, gain: 0.020 });
  },

  // ── ConnectFail: Low B → chromatic descent — something didn't work ──
  connectFail(vol) {
    const { ctx: ac, out } = getAudio();
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.value = vol * 0.45;
    const lpf = createLPF(ac, g, 700);
    g.connect(out);

    playTone(ac, lpf, t, { type: 'triangle', freq: 246.94, freqEnd: 220, sweepDuration: 0.10, attack: 0.003, hold: 0.04, release: 0.10, gain: 0.035 });
    playTone(ac, lpf, t, { type: 'sine', freq: 146.83, delay: 0.02, attack: 0.005, hold: 0.03, release: 0.06, gain: 0.018 });
  },
};

// ── Loop system: repeating sound patterns (e.g. "thinking") ──

interface ActiveLoop {
  intervalId: ReturnType<typeof setInterval>;
  masterGain: GainNode;
  iteration: number;
  startTime: number;
}

const activeLoops = new Map<string, ActiveLoop>();

/** Play the "thinking" pattern — gentle breathing pulse with organic pitch drift
 *  Like distant guitar harmonics ringing slowly — intimate, not mechanical */
function playThinkingPattern(ac: AudioContext, dest: AudioNode, vol: number, iteration: number) {
  const t = ac.currentTime;
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 900;
  lpf.Q.value = 0.4;
  lpf.connect(dest);

  // Alternate between two notes from D major — creates gentle breathing motion
  const noteSet = [
    [293.66, 329.63],  // D4 → E4
    [329.63, 369.99],  // E4 → F#4
    [369.99, 440],     // F#4 → A4
    [440, 493.88],     // A4 → B4
  ];
  const pair = noteSet[iteration % noteSet.length];
  const freq = pair[0] + (Math.random() - 0.5) * 5; // tiny humanization

  // Very soft sustained tone — barely there
  playTone(ac, lpf, t, {
    type: 'sine', freq, freqEnd: pair[1],
    sweepDuration: 1.2, // slow glide between notes
    attack: 0.15, hold: 0.6, release: 0.8,
    gain: vol * 0.004,
  });
}

/**
 * Start a repeating sound loop.
 * 'thinking' — gentle breathing harmonic pulse every 2.5s with progressive fade.
 */
export function startSoundLoop(name: string) {
  if (localStorage.getItem('sound_enabled') === 'false') return;
  if (activeLoops.has(name)) return; // already running

  const { ctx: ac, out } = getAudio();
  const volStr = localStorage.getItem('sound_volume');
  const baseVol = volStr ? Math.max(0, Math.min(1, parseFloat(volStr))) : 0.5;

  // Master gain for this loop (for progressive fade)
  const loopMasterGain = ac.createGain();
  loopMasterGain.gain.value = baseVol;
  loopMasterGain.connect(out);

  const startTime = Date.now();

  // Play immediately, then repeat
  try { playThinkingPattern(ac, loopMasterGain, 1.0, 0); } catch { /* silent */ }

  const intervalId = setInterval(() => {
    if (localStorage.getItem('sound_enabled') === 'false') {
      stopSoundLoop(name);
      return;
    }

    const loop = activeLoops.get(name);
    if (!loop) return;

    loop.iteration++;

    // Progressive volume fade: 100% -> 25% over ~90 seconds (longer fade for less intrusiveness)
    const elapsed = (Date.now() - loop.startTime) / 1000;
    const fadeFactor = Math.max(0.25, 1.0 - (elapsed / 90) * 0.75);

    try {
      loop.masterGain.gain.setValueAtTime(baseVol * fadeFactor, ac.currentTime);
      playThinkingPattern(ac, loop.masterGain, fadeFactor, loop.iteration);
    } catch {
      stopSoundLoop(name);
    }
  }, 2500); // Every 2.5 seconds — slightly slower for breathing feel

  activeLoops.set(name, {
    intervalId,
    masterGain: loopMasterGain,
    iteration: 0,
    startTime,
  });
}

/** Stop a sound loop with gentle fade-out */
export function stopSoundLoop(name: string) {
  const loop = activeLoops.get(name);
  if (!loop) return;

  clearInterval(loop.intervalId);

  // Gentle fade out over 400ms
  try {
    const { ctx: ac } = getAudio();
    const now = ac.currentTime;
    loop.masterGain.gain.setValueAtTime(loop.masterGain.gain.value, now);
    loop.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    // Disconnect after fade
    setTimeout(() => {
      try { loop.masterGain.disconnect(); } catch { /* already disconnected */ }
    }, 500);
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
