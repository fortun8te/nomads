/**
 * ComputerViewSimplified — Single-machine computer use interface
 *
 * AI-first: the VNC browser agent is the primary focus.
 * - Single computer by default (add more via + tab)
 * - Each machine has a distinct accent color so you can tell them apart
 * - Right sidebar: activity log + instruction input
 * - Liquid glass styling + gradient background
 */

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { WayfayerPlusPanel, type WayfayerPlusPanelHandle } from './WayfayerPlusPanel';
import { ActionSidebarCompact } from './ActionSidebarCompact';
import { ComputerDesktop } from './ComputerDesktop';
import { EtherealBG } from './EtherealBG';

// Fixed 3-slot palette: blue → red → black
const MACHINE_ACCENTS = [
  {
    hex: '#2B79FF',
    glow: 'rgba(43,121,255,0.14)',
    dim:  'rgba(43,121,255,0.06)',
    screenBg: 'linear-gradient(145deg, rgba(8,12,28,0.97) 0%, rgba(6,14,30,0.97) 50%, rgba(8,12,24,0.97) 100%)',
    gradientColors: ['#000000', '#030308', '#060e1a', '#091828', '#1a4fcc'],
  },
  {
    hex: '#D0D0D0',
    glow: 'rgba(210,210,210,0.10)',
    dim:  'rgba(210,210,210,0.04)',
    screenBg: 'linear-gradient(145deg, rgba(11,11,13,0.97) 0%, rgba(10,10,12,0.97) 50%, rgba(11,11,13,0.97) 100%)',
    gradientColors: ['#000000', '#060608', '#0c0c10', '#101014', '#1c1c22'],
  },
  {
    hex: '#888888',
    glow: 'rgba(140,140,140,0.10)',
    dim:  'rgba(140,140,140,0.04)',
    screenBg: 'linear-gradient(145deg, rgba(10,10,10,0.98) 0%, rgba(8,8,8,0.98) 50%, rgba(10,10,10,0.98) 100%)',
    gradientColors: ['#000000', '#040404', '#080808', '#0d0d0d', '#1a1a1a'],
  },
];
const MAX_MACHINES = 3;

interface Machine {
  id: string;
  label: string;
  accentIdx: number;
}

export function ComputerViewSimplified() {
  const [machines, setMachines] = useState<Machine[]>([
    { id: 'machine-1', label: 'Computer 1', accentIdx: 0 },
  ]);
  const [activeMachineId, setActiveMachineId] = useState('machine-1');
  const [computerStep, setComputerStep] = useState<string | null>(null);
  const wayfayerRef = useRef<WayfayerPlusPanelHandle>(null);

  const addMachine = useCallback(() => {
    if (machines.length >= MAX_MACHINES) return;
    const newId = `machine-${Date.now()}`;
    const newLabel = `Computer ${machines.length + 1}`;
    const accentIdx = machines.length; // slot 0→blue, 1→red, 2→black
    setMachines(prev => [...prev, { id: newId, label: newLabel, accentIdx }]);
    setActiveMachineId(newId);
  }, [machines.length]);

  const removeMachine = useCallback((id: string) => {
    if (machines.length === 1) return;
    setMachines(prev => {
      const next = prev.filter(m => m.id !== id);
      if (activeMachineId === id) setActiveMachineId(next[0].id);
      return next;
    });
  }, [activeMachineId, machines]);

  const activeMachine = machines.find(m => m.id === activeMachineId);
  const accent = MACHINE_ACCENTS[activeMachine?.accentIdx ?? 0];

  return (
    <div className="h-full flex flex-col bg-black relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <EtherealBG color={accent.dim} />
      </div>

      {/* Content */}
      <div className="relative flex flex-col h-full z-10">
        <div className="flex flex-1 overflow-hidden min-h-0 justify-center items-center px-4 pb-4 pt-6 relative">

          {/* Floating tab bar — top-left, above the computer screen */}
          <div className="absolute top-4 left-4 z-20">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(15,15,20,0.70) 0%, rgba(20,20,30,0.60) 100%)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              }}
            >
              {machines.map((machine) => {
                const a = MACHINE_ACCENTS[machine.accentIdx];
                const isActive = activeMachineId === machine.id;
                return (
                  <motion.div
                    key={machine.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1"
                  >
                    {/* Color dot */}
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: a.hex,
                      opacity: isActive ? 1 : 0.4,
                      flexShrink: 0,
                    }} />
                    <button
                      onClick={() => setActiveMachineId(machine.id)}
                      className="text-[10px] font-medium rounded-lg transition-all px-1.5 py-0.5"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                        color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.38)',
                        transition: 'all 0.15s ease',
                      }}
                      title={`Switch to ${machine.label}`}
                      aria-label={`Switch to ${machine.label}${isActive ? ' (currently active)' : ''}`}
                      data-role="machine-tab"
                      data-machine-id={machine.id}
                      aria-selected={isActive}
                    >
                      {machine.label}
                    </button>
                    {machines.length > 1 && (
                      <button
                        onClick={() => removeMachine(machine.id)}
                        className="p-0.5 transition-colors"
                        style={{ color: 'rgba(255,255,255,0.20)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.20)')}
                        title={`Remove ${machine.label}`}
                        aria-label={`Remove ${machine.label}`}
                        data-role="machine-tab-close"
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 6l-12 12M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </motion.div>
                );
              })}
              {machines.length < MAX_MACHINES && (
                <button
                  onClick={addMachine}
                  title="Add computer"
                  className="p-1 rounded-lg"
                  style={{ color: 'rgba(255,255,255,0.28)', transition: 'all 0.15s ease' }}
                  onMouseEnter={e => { (e.currentTarget.style.color = 'rgba(255,255,255,0.55)'); (e.currentTarget.style.background = 'rgba(255,255,255,0.06)'); }}
                  onMouseLeave={e => { (e.currentTarget.style.color = 'rgba(255,255,255,0.28)'); (e.currentTarget.style.background = 'transparent'); }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3 items-stretch" style={{ maxWidth: 1474, width: '100%', maxHeight: '100%' }}>
            {/* VNC Screen — accent color changes per machine */}
            <div
              className="flex-1 relative overflow-hidden rounded-xl"
              style={{
                aspectRatio: '16 / 9',
                maxWidth: 1188,
                background: accent.screenBg,
                border: `1px solid rgba(255,255,255,0.08)`,
                boxShadow: [
                  '0 0 0 1px rgba(255,255,255,0.03)',
                  '0 8px 40px rgba(0,0,0,0.55)',
                  `0 0 60px ${accent.glow}`,
                  `0 0 120px ${accent.dim}`,
                ].join(', '),
                transition: 'box-shadow 0.6s ease',
              }}
            >
              {activeMachine && (
                <>
                  <WayfayerPlusPanel
                    ref={wayfayerRef}
                    standalone
                    onAddMachine={addMachine}
                    gradientColors={accent.gradientColors}
                    onStepChange={setComputerStep}
                  />
                  <ComputerDesktop />
                </>
              )}
            </div>

            {/* Right sidebar */}
            <ActionSidebarCompact
              machineId={activeMachine?.id || 'machine-1'}
              onComputerTask={(goal) => wayfayerRef.current?.runTask(goal)}
              computerStep={computerStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
