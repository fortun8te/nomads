/**
 * useAmbientSound — Generative ambient soundtrack
 *
 * Procedurally generated using Web Audio API — no external files.
 * Creates a layered ambient soundscape:
 *   - Deep sub-bass pad (A1)
 *   - Mid-range harmonic shimmer (A3, C#4, E4)
 *   - Soft high sparkle notes that drift in/out
 *   - Filtered noise texture for "air"
 *   - Slow evolving modulation
 *
 * Toggle on/off, persists preference to localStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'nomad-ambient-on';

// ── Audio state ──
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isPlaying = false;
const nodes: AudioNode[] = [];
let sparkleInterval: ReturnType<typeof setInterval> | null = null;

function getCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;

    // Master compressor for glue
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    masterGain.connect(comp);
    comp.connect(audioCtx.destination);
    nodes.push(comp);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return { ctx: audioCtx, master: masterGain! };
}

function createOsc(ctx: AudioContext, dest: AudioNode, freq: number, type: OscillatorType, vol: number, detune = 0, filterFreq = 0) {
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
    filter.Q.value = 0.7;
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

  // ── Layer 1: Deep sub-bass pad (A1 = 55Hz) ──
  const sub = createOsc(ctx, master, 55, 'sine', 0.035, 0, 120);
  createLFO(ctx, 0.06, sub.gain.gain.value * 0.4, sub.gain.gain);

  // ── Layer 2: Mid-range harmonic chord (A3, C#4, E4) ──
  // Very quiet, filtered, gives warmth
  const chordFreqs = [220, 277.18, 329.63]; // A3, C#4, E4
  chordFreqs.forEach((freq, i) => {
    const voice = createOsc(ctx, master, freq, 'sine', 0.008, (i - 1) * 4, 400);
    // Each voice breathes at slightly different rate
    createLFO(ctx, 0.04 + i * 0.015, voice.gain.gain.value * 0.6, voice.gain.gain);
  });

  // ── Layer 3: High shimmer (E5, A5) — very quiet, slowly fading ──
  const shimmerFreqs = [659.25, 880];
  shimmerFreqs.forEach((freq, i) => {
    const shimmer = createOsc(ctx, master, freq, 'sine', 0.003, i * 6, 1200);
    createLFO(ctx, 0.03 + i * 0.02, shimmer.gain.gain.value * 0.8, shimmer.gain.gain);
    // Slow pitch drift for ethereal quality
    createLFO(ctx, 0.015, 2, shimmer.osc.detune);
  });

  // ── Layer 4: Filtered noise texture ("air") ──
  const bufferSize = ctx.sampleRate * 2;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const noiseBandpass = ctx.createBiquadFilter();
  noiseBandpass.type = 'bandpass';
  noiseBandpass.frequency.value = 800;
  noiseBandpass.Q.value = 0.3;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.006;

  noise.connect(noiseBandpass);
  noiseBandpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start();
  nodes.push(noise, noiseBandpass, noiseGain);

  // Modulate noise filter for movement
  createLFO(ctx, 0.07, 300, noiseBandpass.frequency);

  // ── Layer 5: Sparkle notes — random high pings every few seconds ──
  const sparkleNotes = [1318.5, 1567.98, 1760, 2093, 2637]; // E6, G6, A6, C7, E7
  sparkleInterval = setInterval(() => {
    if (!isPlaying || !audioCtx || audioCtx.state !== 'running') return;
    if (Math.random() > 0.4) return; // 40% chance per tick

    const freq = sparkleNotes[Math.floor(Math.random() * sparkleNotes.length)];
    const sparkOsc = ctx.createOscillator();
    const sparkGain = ctx.createGain();
    const sparkFilter = ctx.createBiquadFilter();

    sparkOsc.type = 'sine';
    sparkOsc.frequency.value = freq + (Math.random() - 0.5) * 20;
    sparkFilter.type = 'lowpass';
    sparkFilter.frequency.value = 3000;
    sparkGain.gain.value = 0;

    sparkOsc.connect(sparkFilter);
    sparkFilter.connect(sparkGain);
    sparkGain.connect(master);

    const now = ctx.currentTime;
    sparkGain.gain.setValueAtTime(0, now);
    sparkGain.gain.linearRampToValueAtTime(0.004 + Math.random() * 0.003, now + 0.1);
    sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 2 + Math.random() * 2);

    sparkOsc.start(now);
    sparkOsc.stop(now + 4);
  }, 3000);

  // Fade in over 4 seconds
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 4);

  isPlaying = true;
}

function cleanup() {
  nodes.forEach(n => { try { if ('stop' in n) (n as OscillatorNode).stop(); n.disconnect(); } catch {} });
  nodes.length = 0;
  if (sparkleInterval) { clearInterval(sparkleInterval); sparkleInterval = null; }
}

function stopAmbient() {
  if (!isPlaying || !audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(0, now + 2.5);

  setTimeout(() => {
    cleanup();
    isPlaying = false;
  }, 2800);
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
