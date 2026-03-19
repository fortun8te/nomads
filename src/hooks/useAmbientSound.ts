/**
 * useAmbientSound — Generative ambient soundtrack
 *
 * Procedurally generated using Web Audio API — no external files.
 *
 * Inspired by the mood of intimate acoustic recordings — warm guitar-like
 * plucked harmonics, soft atmospheric pads with slow breathing, delicate
 * suspended intervals, and gentle melancholic textures. Think late-night
 * creative sessions, low lamplight, quiet concentration.
 *
 * Layers:
 *   1. Warm pad (low strings — cello-like sustained tones with slow LFO)
 *   2. Breathing harmonic bed (Dsus2/Aadd9 — open, suspended, slightly sad)
 *   3. Plucked guitar harmonics (Karplus-Strong synthesis — gentle finger-picked notes)
 *   4. Soft convolution-style reverb tail (filtered noise with very long decay)
 *   5. Occasional high harmonic whispers (natural harmonics on guitar strings)
 *
 * Key: D major / B minor — warm, nostalgic, slightly melancholic
 * Tempo: None — everything breathes freely
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'nomad-ambient-on';

// ── Audio state ──
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isPlaying = false;
const nodes: (AudioNode | AudioBufferSourceNode)[] = [];
let pluckInterval: ReturnType<typeof setInterval> | null = null;
let harmonicInterval: ReturnType<typeof setInterval> | null = null;
let driftInterval: ReturnType<typeof setInterval> | null = null;

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;

    // Master compressor — gentle glue, not squash
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    masterGain.connect(comp);
    comp.connect(audioCtx.destination);
    nodes.push(comp);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return { ctx: audioCtx, master: masterGain! };
}

// ── Karplus-Strong plucked string synthesis ──
// Creates a realistic plucked guitar harmonic sound
function createPluck(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  vol: number,
  brightness: number = 0.5, // 0-1: dark to bright
  duration: number = 3.0
) {
  const sampleRate = ctx.sampleRate;
  const periodSamples = Math.round(sampleRate / freq);
  const totalSamples = Math.round(sampleRate * duration);
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  // Initialize delay line with filtered noise burst (the "pluck")
  const delayLine = new Float32Array(periodSamples);
  for (let i = 0; i < periodSamples; i++) {
    // Shaped noise burst — more energy in early samples for attack character
    const attackShape = Math.exp(-i / (periodSamples * 0.3));
    delayLine[i] = (Math.random() * 2 - 1) * attackShape;
  }

  // Karplus-Strong loop with adjustable damping
  const dampingFactor = 0.996 + brightness * 0.003; // 0.996 - 0.999
  let readIdx = 0;
  for (let i = 0; i < totalSamples; i++) {
    const nextIdx = (readIdx + 1) % periodSamples;
    // Low-pass average filter (the core of K-S)
    const filtered = (delayLine[readIdx] + delayLine[nextIdx]) * 0.5 * dampingFactor;
    data[i] = filtered;
    delayLine[readIdx] = filtered;
    readIdx = nextIdx;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Gentle envelope to avoid clicks
  const env = ctx.createGain();
  const now = ctx.currentTime;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(vol, now + 0.003); // near-instant attack
  env.gain.setValueAtTime(vol, now + duration * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  // Warm low-pass filter
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 800 + brightness * 2000;
  lpf.Q.value = 0.4;

  source.connect(lpf);
  lpf.connect(env);
  env.connect(dest);
  source.start(now);
  source.stop(now + duration + 0.01);

  // Don't track these in nodes[] — they self-clean
  return source;
}

// ── Warm oscillator helper ──
function createWarmOsc(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  vol: number,
  detune = 0,
  filterFreq = 0
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.value = vol;

  if (filterFreq > 0) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.5;
    osc.connect(filter);
    filter.connect(gain);
    nodes.push(filter);
  } else {
    osc.connect(gain);
  }
  gain.connect(dest);
  osc.start();
  nodes.push(osc, gain);
  return { osc, gain };
}

// ── LFO helper ──
function createLFO(ctx: AudioContext, rate: number, amount: number, target: AudioParam) {
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = rate;
  lfoGain.gain.value = amount;
  lfo.connect(lfoGain);
  lfoGain.connect(target);
  lfo.start();
  nodes.push(lfo, lfoGain);
}

function startAmbient() {
  if (isPlaying) return;
  const { ctx, master } = getCtx();

  // Clean previous
  cleanup();

  // ── Reverb send bus (simulated with filtered noise + delay) ──
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.15;
  const reverbLPF = ctx.createBiquadFilter();
  reverbLPF.type = 'lowpass';
  reverbLPF.frequency.value = 1200;
  reverbLPF.Q.value = 0.3;
  reverbGain.connect(reverbLPF);
  reverbLPF.connect(master);
  nodes.push(reverbGain, reverbLPF);

  // ══════════════════════════════════════════════════════
  // Layer 1: Warm low pad — like a distant cello section
  // D2 (73.42Hz) + A2 (110Hz) — open fifth, warm and grounding
  // ══════════════════════════════════════════════════════
  const padFreqs = [73.42, 110];
  padFreqs.forEach((freq, i) => {
    // Use triangle wave for warmer, more organic tone than sine
    const pad = createWarmOsc(ctx, master, freq, 'triangle', 0.018, (i - 0.5) * 3, 180);
    // Very slow breathing — inhale/exhale feel (0.04-0.06 Hz = 17-25 second cycles)
    createLFO(ctx, 0.04 + i * 0.018, pad.gain.gain.value * 0.5, pad.gain.gain);
    // Subtle pitch drift for organic feel
    createLFO(ctx, 0.008 + i * 0.005, 1.5, pad.osc.detune);
  });

  // ══════════════════════════════════════════════════════
  // Layer 2: Harmonic bed — Dsus2/Aadd9 voicing
  // D3(146.83) A3(220) E4(329.63) — open, suspended, intimate
  // These are the "guitar strings ringing" undertone
  // ══════════════════════════════════════════════════════
  const chordFreqs = [146.83, 220, 329.63]; // D3, A3, E4 — Dsus2 voicing
  chordFreqs.forEach((freq, i) => {
    // Very quiet sine tones — like sympathetic string resonance
    const voice = createWarmOsc(ctx, master, freq, 'sine', 0.006, (i - 1) * 5, 500);
    // Each voice breathes independently — creates gentle motion
    createLFO(ctx, 0.025 + i * 0.012, voice.gain.gain.value * 0.7, voice.gain.gain);
    // Slow detuning drift — nothing stays perfectly in tune (organic)
    createLFO(ctx, 0.01 + i * 0.007, 2.5, voice.osc.detune);
  });

  // Add a high sustained harmonic — B4 (493.88) — the "sad" note (sixth of D)
  const sadNote = createWarmOsc(ctx, master, 493.88, 'sine', 0.003, 0, 800);
  createLFO(ctx, 0.02, sadNote.gain.gain.value * 0.8, sadNote.gain.gain);
  createLFO(ctx, 0.006, 3, sadNote.osc.detune);

  // ══════════════════════════════════════════════════════
  // Layer 3: Filtered noise texture — soft room tone / tape hiss
  // Much warmer than typical white noise — more like vintage recording atmosphere
  // ══════════════════════════════════════════════════════
  const bufferSize = ctx.sampleRate * 4;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  // Brown noise (integrated white noise) — warmer, more natural
  let lastSample = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    lastSample = (lastSample + (0.02 * white)) / 1.02;
    data[i] = lastSample * 3.5; // Normalize
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  // Bandpass centered low — warm room tone, not hiss
  const noiseBPF = ctx.createBiquadFilter();
  noiseBPF.type = 'bandpass';
  noiseBPF.frequency.value = 400;
  noiseBPF.Q.value = 0.4;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.008;

  noise.connect(noiseBPF);
  noiseBPF.connect(noiseGain);
  noiseGain.connect(master);
  noise.start();
  nodes.push(noise, noiseBPF, noiseGain);

  // Slowly modulate noise filter for movement
  createLFO(ctx, 0.035, 150, noiseBPF.frequency);

  // ══════════════════════════════════════════════════════
  // Layer 4: Plucked guitar harmonics (Karplus-Strong)
  // Random gentle plucks from a D major / B minor palette
  // Like someone absent-mindedly plucking open strings nearby
  // ══════════════════════════════════════════════════════
  // D major scale harmonics — natural guitar harmonic frequencies
  const pluckNotes = [
    293.66, // D4
    329.63, // E4
    369.99, // F#4
    440.00, // A4
    493.88, // B4
    587.33, // D5
    659.25, // E5
    739.99, // F#5
  ];

  pluckInterval = setInterval(() => {
    if (!isPlaying || !audioCtx || audioCtx.state !== 'running') return;
    if (Math.random() > 0.30) return; // 30% chance per tick — sparse

    const freq = pluckNotes[Math.floor(Math.random() * pluckNotes.length)];
    // Vary brightness and volume for natural feel
    const brightness = 0.15 + Math.random() * 0.35; // mostly dark, occasionally brighter
    const vol = 0.008 + Math.random() * 0.012; // quiet range
    const duration = 2.5 + Math.random() * 3.0; // 2.5-5.5 seconds of ring

    try {
      createPluck(ctx, reverbGain, freq, vol, brightness, duration);
    } catch {
      // silent
    }
  }, 4000); // Every 4 seconds, check

  // ══════════════════════════════════════════════════════
  // Layer 5: High natural harmonics — very quiet, rare
  // Like the 12th/7th fret harmonics that ring when you're not trying
  // ══════════════════════════════════════════════════════
  const harmonicFreqs = [
    1174.66, // D6 (12th fret harmonic of D string)
    1318.51, // E6
    880.00,  // A5 (12th fret harmonic of A string)
    987.77,  // B5
    1479.98, // F#6
  ];

  harmonicInterval = setInterval(() => {
    if (!isPlaying || !audioCtx || audioCtx.state !== 'running') return;
    if (Math.random() > 0.20) return; // 20% chance — rare and precious

    const freq = harmonicFreqs[Math.floor(Math.random() * harmonicFreqs.length)];

    try {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const lpf = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.value = freq + (Math.random() - 0.5) * 4; // tiny pitch drift
      lpf.type = 'lowpass';
      lpf.frequency.value = 2000;
      lpf.Q.value = 0.3;
      env.gain.value = 0;

      osc.connect(lpf);
      lpf.connect(env);
      env.connect(reverbGain);

      const now = ctx.currentTime;
      const vol = 0.002 + Math.random() * 0.003;
      const fadeIn = 0.3 + Math.random() * 0.5;
      const sustain = 1.0 + Math.random() * 2.0;
      const fadeOut = 2.0 + Math.random() * 3.0;

      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(vol, now + fadeIn);
      env.gain.setValueAtTime(vol, now + fadeIn + sustain);
      env.gain.exponentialRampToValueAtTime(0.0001, now + fadeIn + sustain + fadeOut);

      osc.start(now);
      osc.stop(now + fadeIn + sustain + fadeOut + 0.05);
    } catch {
      // silent
    }
  }, 6000); // Every 6 seconds, check

  // ══════════════════════════════════════════════════════
  // Layer 6: Slow harmonic drift — pad notes that evolve
  // One note at a time, long crossfades, creates gentle motion
  // ══════════════════════════════════════════════════════
  const driftNotes = [
    { freq: 146.83, name: 'D3' },
    { freq: 164.81, name: 'E3' },
    { freq: 220.00, name: 'A3' },
    { freq: 246.94, name: 'B3' },
    { freq: 293.66, name: 'D4' },
  ];
  let lastDriftIdx = -1;

  driftInterval = setInterval(() => {
    if (!isPlaying || !audioCtx || audioCtx.state !== 'running') return;

    // Pick a different note than last time
    let idx = Math.floor(Math.random() * driftNotes.length);
    if (idx === lastDriftIdx) idx = (idx + 1) % driftNotes.length;
    lastDriftIdx = idx;

    const note = driftNotes[idx];

    try {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const lpf = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.value = note.freq;
      osc.detune.value = (Math.random() - 0.5) * 6;
      lpf.type = 'lowpass';
      lpf.frequency.value = 300;
      lpf.Q.value = 0.5;
      env.gain.value = 0;

      osc.connect(lpf);
      lpf.connect(env);
      env.connect(master);

      const now = ctx.currentTime;
      const vol = 0.005 + Math.random() * 0.004;
      const fadeIn = 3.0 + Math.random() * 2.0;
      const sustain = 4.0 + Math.random() * 4.0;
      const fadeOut = 4.0 + Math.random() * 3.0;

      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(vol, now + fadeIn);
      env.gain.setValueAtTime(vol, now + fadeIn + sustain);
      env.gain.exponentialRampToValueAtTime(0.0001, now + fadeIn + sustain + fadeOut);

      osc.start(now);
      osc.stop(now + fadeIn + sustain + fadeOut + 0.05);
    } catch {
      // silent
    }
  }, 12000); // Every 12 seconds — slow, deliberate evolution

  // ── Fade in over 6 seconds (slow, gentle arrival) ──
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 6);

  isPlaying = true;
}

function cleanup() {
  nodes.forEach(n => {
    try {
      if ('stop' in n && typeof (n as unknown as OscillatorNode).stop === 'function') {
        (n as unknown as OscillatorNode).stop();
      }
      n.disconnect();
    } catch {}
  });
  nodes.length = 0;
  if (pluckInterval) { clearInterval(pluckInterval); pluckInterval = null; }
  if (harmonicInterval) { clearInterval(harmonicInterval); harmonicInterval = null; }
  if (driftInterval) { clearInterval(driftInterval); driftInterval = null; }
}

function stopAmbient() {
  if (!isPlaying || !audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(0, now + 3.5); // Longer fade out

  setTimeout(() => {
    cleanup();
    isPlaying = false;
  }, 4000);
}

export function useAmbientSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });
  const initializedRef = useRef(false);

  useEffect(() => {
    if (enabled) {
      const start = () => {
        startAmbient();
        initializedRef.current = true;
      };
      if (audioCtx && audioCtx.state === 'running') {
        start();
      } else {
        const handler = () => { start(); document.removeEventListener('click', handler); };
        document.addEventListener('click', handler, { once: true });
        return () => document.removeEventListener('click', handler);
      }
    } else {
      if (initializedRef.current) stopAmbient();
    }
  }, [enabled]);

  useEffect(() => {
    return () => { stopAmbient(); };
  }, []);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  return { ambientEnabled: enabled, toggleAmbient: toggle };
}
