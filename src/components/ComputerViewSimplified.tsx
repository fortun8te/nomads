/**
 * ComputerViewSimplified -- Full-screen layout with side-by-side computer + activity panels
 *
 * Layout:
 * - Top 36px: tab bar (machine tabs, health dots)
 * - Center: computer view (~70%) + activity panel (~30%) side by side
 * - Bottom 36px: task details left, controls right
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ActionSidebarCompact } from './ActionSidebarCompact';
import { ComputerDesktop } from './ComputerDesktop';
import { ErrorBoundary } from './ErrorBoundary';
import { EtherealBG } from './EtherealBG';
import { desktopBus } from '../utils/desktopBus';
import { checkInfrastructure, type InfrastructureHealth } from '../config/infrastructure';
import type { AgentState } from './ActionSidebarCompact';
import { vfs, vfsReady, generateSessionId, getSessionSuffix } from '../utils/sessionFileSystem';

/** Neuro icon inline SVG for the bottom bar */
function NeuroIcon({ size = 14 }: { size?: number }) {
  return (
    <img src="/neuro-icon-40.png" alt="" style={{ width: size, height: size, minWidth: size, minHeight: size, borderRadius: '50%', opacity: 0.75, flexShrink: 0 }} />
  );
}

/** Morphing square/circle animation for loading states */
function LoadingMorph({ size = 10, color = '#3b82f6' }: { size?: number; color?: string }) {
  return (
    <motion.div
      style={{ width: size, height: size, background: color, flexShrink: 0 }}
      animate={{ borderRadius: ['15%', '50%', '15%'], rotate: [0, 180, 360] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

const MACHINE_ACCENTS = [
  {
    hex: '#2B79FF',
    glow: 'rgba(43,121,255,0.14)',
    dim: 'rgba(43,121,255,0.06)',
    screenBg: 'linear-gradient(145deg, rgba(8,12,28,0.97) 0%, rgba(6,14,30,0.97) 50%, rgba(8,12,24,0.97) 100%)',
  },
  {
    hex: '#D0D0D0',
    glow: 'rgba(210,210,210,0.10)',
    dim: 'rgba(210,210,210,0.04)',
    screenBg: 'linear-gradient(145deg, rgba(11,11,13,0.97) 0%, rgba(10,10,12,0.97) 50%, rgba(11,11,13,0.97) 100%)',
  },
  {
    hex: '#888888',
    glow: 'rgba(140,140,140,0.10)',
    dim: 'rgba(140,140,140,0.04)',
    screenBg: 'linear-gradient(145deg, rgba(10,10,10,0.98) 0%, rgba(8,8,8,0.98) 50%, rgba(10,10,10,0.98) 100%)',
  },
];
const MAX_MACHINES = 3;

interface Machine {
  id: string;
  label: string;
  accentIdx: number;
}

// -- Health dots with hover tooltip --
function HealthDots({ health }: { health: InfrastructureHealth }) {
  const [hovered, setHovered] = useState(false);
  const dot = (ok: boolean | null) => ok === null ? 'rgba(255,255,255,0.25)' : ok ? '#22c55e' : '#ef4444';
  const mark = (ok: boolean | null) => ok ? '\u2713' : '\u2717';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot(health.ollama), flexShrink: 0 }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot(health.wayfarer), flexShrink: 0 }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot(health.searxng), flexShrink: 0 }} />
      </div>
      {hovered && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, padding: '4px 8px', borderRadius: 6,
          background: 'rgba(10,10,14,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 500,
          color: 'rgba(255,255,255,0.65)', zIndex: 100, pointerEvents: 'none',
        }}>
          Ollama {mark(health.ollama)} &nbsp;|&nbsp; Browser {mark(health.wayfarer)} &nbsp;|&nbsp; Search {mark(health.searxng)}
        </div>
      )}
    </div>
  );
}

export function ComputerViewSimplified() {
  const [initialId] = useState(() => generateSessionId());
  const [machines, setMachines] = useState<Machine[]>(() => [
    { id: initialId, label: `Computer ${getSessionSuffix(initialId)}`, accentIdx: 0 },
  ]);
  const [activeMachineId, setActiveMachineId] = useState(initialId);
  const [agentState, setAgentState] = useState<AgentState>({ phase: 'idle', message: '', steps: [] });
  const [humanControl, setHumanControl] = useState(false);
  const [computerExpanded, setComputerExpanded] = useState(true);

  const handleExpandComputer = useCallback(() => {
    setComputerExpanded(true);
  }, []);

  // VFS init
  useEffect(() => {
    vfsReady().then(() => {
      vfs.initSession(initialId);
      vfs.initComputer(initialId, initialId);
    });
  }, [initialId]);

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const isActive = agentState.phase !== 'idle' && agentState.phase !== 'done' && agentState.phase !== 'error';
    if (isActive && !elapsedRef.current) {
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else if (!isActive && elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [agentState.phase]);

  useEffect(() => {
    if (agentState.phase === 'planning') setElapsed(0);
  }, [agentState.phase]);

  // Infrastructure health polling
  const [health, setHealth] = useState<InfrastructureHealth | null>(null);
  useEffect(() => {
    checkInfrastructure().then(setHealth).catch(() => {});
    const id = setInterval(() => { checkInfrastructure().then(setHealth).catch(() => {}); }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Agent state from desktopBus
  useEffect(() => {
    return desktopBus.subscribe((event) => {
      if (event.type === 'agent_status') {
        setAgentState(prev => ({ ...prev, phase: event.phase as AgentState['phase'], message: event.message, stepIndex: event.stepIndex, totalSteps: event.totalSteps }));
      } else if (event.type === 'agent_plan') {
        setAgentState(prev => ({
          ...prev,
          plan: event.steps.map(s => ({ instruction: s.instruction, highStakes: s.highStakes ?? false })),
          steps: event.steps.map(s => ({ instruction: s.instruction, highStakes: s.highStakes ?? false, status: 'pending' as const })),
        }));
      } else if (event.type === 'agent_step_start') {
        setAgentState(prev => ({
          ...prev,
          steps: prev.steps.map((s, i) => i === event.stepIndex ? { ...s, status: 'running' as const } : s),
        }));
      } else if (event.type === 'agent_step_done') {
        setAgentState(prev => ({
          ...prev,
          steps: prev.steps.map((s, i) => i === event.stepIndex ? { ...s, status: event.success ? 'done' as const : 'failed' as const, result: event.result } : s),
        }));
      }
    });
  }, []);

  // Machine management
  const addMachine = useCallback(() => {
    if (machines.length >= MAX_MACHINES) return;
    const newId = generateSessionId();
    setMachines(prev => [...prev, { id: newId, label: `Computer ${getSessionSuffix(newId)}`, accentIdx: prev.length }]);
    setActiveMachineId(newId);
    vfs.initSession(newId);
    vfs.initComputer(newId, newId);
  }, [machines.length]);

  const removeMachine = useCallback((id: string) => {
    if (machines.length === 1) return;
    setMachines(prev => {
      const next = prev.filter(m => m.id !== id);
      if (activeMachineId === id) setActiveMachineId(next[0].id);
      return next;
    });
  }, [activeMachineId, machines.length]);

  const activeMachine = machines.find(m => m.id === activeMachineId);
  const accent = MACHINE_ACCENTS[activeMachine?.accentIdx ?? 0];

  // Progress bar state
  const isAgentActive = agentState.phase !== 'idle' && agentState.phase !== 'done' && agentState.phase !== 'error';
  const runningIdx = agentState.steps.findIndex(s => s.status === 'running');
  const currentStepIndex = agentState.stepIndex ?? (runningIdx >= 0 ? runningIdx : 0);
  const totalSteps = agentState.totalSteps ?? agentState.steps.length;
  const currentStepDescription = isAgentActive
    ? (agentState.message || (runningIdx >= 0 ? agentState.steps[runningIdx].instruction : 'Working...'))
    : agentState.phase === 'done' ? 'Task completed'
    : agentState.phase === 'error' ? 'Task failed'
    : 'Ready';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000', position: 'relative', overflow: 'hidden' }}>
      {/* Gradient background */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <EtherealBG color={accent.dim} />
      </div>

      {/* Content over gradient */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Top bar (36px) ── */}
        <div style={{
          height: 36, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 12px',
          background: 'rgba(10,10,14,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Left: machine tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {machines.map((machine) => {
              const a = MACHINE_ACCENTS[machine.accentIdx];
              const isActive = activeMachineId === machine.id;
              return (
                <motion.div key={machine.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: a.hex, display: 'inline-block', opacity: isActive ? 1 : 0.35, flexShrink: 0 }} />
                  <button
                    onClick={() => setActiveMachineId(machine.id)}
                    style={{
                      fontSize: 10, fontWeight: 500, padding: '4px 8px', borderRadius: 6,
                      background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                      color: isActive ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.30)',
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                    title={`Switch to ${machine.label}`}
                  >
                    {machine.label}
                  </button>
                  {machines.length > 1 && (
                    <button
                      onClick={() => removeMachine(machine.id)}
                      style={{ padding: 2, color: 'rgba(255,255,255,0.18)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.40)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.18)')}
                      title={`Remove ${machine.label}`}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6l-12 12M6 6l12 12" /></svg>
                    </button>
                  )}
                </motion.div>
              );
            })}
            {machines.length < MAX_MACHINES && (
              <button
                onClick={addMachine}
                title="Add computer"
                style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, transition: 'all 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            )}
          </div>

          {/* Right: health dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {health && <HealthDots health={health} />}
          </div>
        </div>

        {/* ── Main area: computer + activity side by side ── */}
        <div style={{ flex: 1, display: 'flex', gap: 8, padding: 8, minHeight: 0 }}>

          {/* Computer view -- expandable/collapsible */}
          {computerExpanded && (
            <div style={{
              flex: 7, display: 'flex', flexDirection: 'column',
              background: accent.screenBg,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.04)',
              boxShadow: `0 4px 24px rgba(0,0,0,0.3), 0 0 60px ${accent.glow}`,
              minWidth: 0,
              position: 'relative',
            }}>
              {/* Computer header bar */}
              <div style={{
                height: 28, flexShrink: 0,
                display: 'flex', alignItems: 'center', padding: '0 12px',
                background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                gap: 8,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent.hex, opacity: 0.6, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeMachine?.label}</span>
                {/* Collapse button */}
                <button
                  onClick={() => setComputerExpanded(false)}
                  title="Collapse computer view"
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              </div>
              {/* Desktop content */}
              <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
                {activeMachine && <ComputerDesktop sessionId={activeMachine.id} computerId={activeMachine.id} humanControl={humanControl} onHumanControlChange={setHumanControl} />}
              </div>
            </div>
          )}

          {/* Activity panel -- takes full width when computer is collapsed */}
          <div style={{
            flex: computerExpanded ? 3 : 1, display: 'flex', flexDirection: 'column',
            minHeight: 0, minWidth: 280, maxWidth: computerExpanded ? 380 : '100%',
          }}>
            <ErrorBoundary>
              <ActionSidebarCompact
                machineId={activeMachine?.id || 'default'}
                onComputerTask={(goal) => {
                  setAgentState({ phase: 'planning', message: 'Planning...', steps: [] });
                  desktopBus.emit({ type: 'run_goal', goal });
                }}
                agentState={agentState}
                onExpandComputer={handleExpandComputer}
              />
            </ErrorBoundary>
          </div>
        </div>

        {/* ── Bottom bar (36px) ── */}
        <div style={{
          height: 36, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 16px',
          background: 'rgba(10,10,14,0.80)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Left: task details */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: isAgentActive ? '#3b82f6' : agentState.phase === 'done' ? '#22c55e' : agentState.phase === 'error' ? '#ef4444' : 'rgba(255,255,255,0.15)',
              ...(isAgentActive ? { animation: '_nomad_pulse 2s infinite' } : {}),
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentStepDescription}
            </span>
            {totalSteps > 0 && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {currentStepIndex + 1}/{totalSteps}
              </span>
            )}
          </div>
          {/* Right: controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </span>
            <button
              onClick={() => setHumanControl(prev => !prev)}
              style={{
                fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                background: humanControl ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)',
                color: humanControl ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.3)',
                border: `1px solid ${humanControl ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)'}`,
                lineHeight: '14px', letterSpacing: '0.03em', whiteSpace: 'nowrap', transition: 'all 0.15s ease',
              }}
              title={humanControl ? 'Release control back to AI' : 'Take manual control'}
            >
              {humanControl ? 'Release' : 'Take Control'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
