/**
 * AppShell — Dark sidebar + white content layout
 *
 * Fixed sidebar (~282px) with animated gradient background
 * 3D rendered nav icons, keyboard shortcuts
 * White main content area with rounded left corners
 */

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { useAmbientSound } from '../hooks/useAmbientSound';
import { MakeStudio } from './MakeStudio';
import { Dashboard } from './Dashboard';
import { SettingsModal } from './SettingsModal';
import { BrandHubDrawer } from './BrandHubDrawer';
import { NomadIcon } from './NomadIcon';
import { SidebarGradient } from './SidebarGradient';
import { MeshGradient } from '@paper-design/shaders-react';
import { AgentPanel } from './AgentPanel';
import { BGPattern } from './BGPattern';
import { EtherealBG } from './EtherealBG';
import { healthMonitor, type ServiceStatus } from '../utils/healthMonitor';
import { ollamaService } from '../utils/ollama';
import { glassCard } from '../styles/tokens';
import { GlassFilter } from './LiquidGlass';
import { ComputerViewSimplified } from './ComputerViewSimplified';
import { ResponseStream } from './ResponseStream';

export type AppView = 'make' | 'research' | 'test' | 'computer' | 'agent';

// ── 3D rendered nav icons ──
function NavIcon({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} width={42} height={42} className="rounded-[10px] object-cover" draggable={false} />;
}

// Glow colors extracted from each icon's dominant color
const NAV_GLOW: Record<AppView, string> = {
  research: '59, 130, 246',   // blue
  make:     '43, 121, 255',   // blue
  test:     '34, 197, 94',    // green
  agent:    '148, 190, 210',  // silver-blue
  computer: '247, 89, 93',    // red
};

const NAV_ITEMS: Array<{
  key: AppView;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  group?: 'core' | 'tools';
}> = [
  { key: 'research',  label: 'Research',  shortcut: 'R', icon: <NavIcon src="/icons/research.png" alt="Research" />, group: 'core' },
  { key: 'make',      label: 'Make',      shortcut: 'M', icon: <NavIcon src="/icons/make.png" alt="Make" />, group: 'core' },
  { key: 'test',      label: 'Test',      shortcut: 'T', icon: <NavIcon src="/icons/test.png" alt="Test" />, group: 'core' },
  { key: 'agent',     label: 'Neuro',     shortcut: 'A', icon: <NavIcon src="/icons/agent.png" alt="Neuro" />, group: 'tools' },
  { key: 'computer',  label: 'Computer',  shortcut: 'C', icon: <NavIcon src="/icons/computer.png" alt="Computer" />, group: 'tools' },
];


export function AppShell() {
  // Randomize ambient gradient transform + speed per page load
  const ambientRng = useRef({
    rotation: Math.random() * 360,
    tx: (Math.random() - 0.5) * 60,
    ty: (Math.random() - 0.5) * 60,
    speed: 0.15 + Math.random() * 0.1, // 0.15–0.25 (ambient is slower)
  });

  const [activeView, setActiveView] = useState<AppView>(() => {
    const saved = localStorage.getItem('nomad-last-view') as AppView | null;
    return saved && ['make', 'research', 'test', 'computer', 'agent'].includes(saved) ? saved : 'agent';
  });
  const [pulsingView, setPulsingView] = useState<AppView | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBrandHub, setShowBrandHub] = useState(false);
  const [_showGreeting] = useState(false); // greeting overlay removed
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [_healthState, setHealthState] = useState<Record<string, ServiceStatus>>({});
  const { systemStatus, currentCycle, campaign, clearCampaign } = useCampaign();
  const { isDarkMode } = useTheme();
  const { play } = useSoundEngine();
  const { ambientEnabled, toggleAmbient } = useAmbientSound();

  const isRunning = systemStatus === 'running';
  const sidebarExpanded = !sidebarCollapsed;

  // Keyframe injection is handled by SidebarGradient component

  // Health monitor
  useEffect(() => {
    healthMonitor.start();
    ollamaService.startupCheck();
    const unsubscribe = healthMonitor.onStatusChange((name, _old, newStatus) => {
      setHealthState(prev => ({ ...prev, [name]: newStatus }));
    });
    healthMonitor.checkAll().then(snapshot => {
      const state: Record<string, ServiceStatus> = {};
      for (const [name, svc] of Object.entries(snapshot)) {
        state[name] = svc.status;
      }
      setHealthState(state);
    });
    return () => { unsubscribe(); healthMonitor.stop(); };
  }, []);


  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const map: Record<string, AppView> = { r: 'research', m: 'make', t: 'test', c: 'computer', a: 'agent' };
      const view = map[e.key.toLowerCase()];
      if (view && view !== activeView) { play('navigate'); setActiveView(view); }
      if (e.key.toLowerCase() === 'b') { play('open'); setShowBrandHub(true); }
      if (e.key.toLowerCase() === 's' && e.shiftKey) { play('open'); setShowSettings(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeView, play]);

  // Cross-component view switch
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent).detail as AppView;
      if (view) setActiveView(view);
    };
    window.addEventListener('nomad-switch-view', handler);
    return () => window.removeEventListener('nomad-switch-view', handler);
  }, []);

  // Brand Hub open event
  useEffect(() => {
    const handler = () => setShowBrandHub(true);
    window.addEventListener('nomad-open-brand-hub', handler);
    return () => window.removeEventListener('nomad-open-brand-hub', handler);
  }, []);

  return (
    <div className={`flex relative ${isDarkMode ? 'bg-black' : 'bg-white'}`} style={{ height: '100dvh', overflow: 'visible' }}>
      {/* Hidden SVG filter definitions for liquid glass */}
      <GlassFilter />
      {/* Glow border effect for nav buttons */}
      <style>{`
        .nomad-nav-btn {
          position: relative;
        }
        .nomad-nav-btn::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 16px;
          background: radial-gradient(
            120px 120px at var(--x, 50%) var(--y, 50%),
            var(--glow-color, rgba(43, 121, 255, 0.35)),
            transparent 100%
          );
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          padding: 2px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .nomad-nav-btn:hover::before {
          opacity: 1;
        }
      `}</style>

      {/* ══ SIDEBAR — overflow visible so gradient bleeds behind main content rounded corners ══ */}
      <aside
        className="h-full flex flex-col shrink-0 z-30 relative"
        onPointerMove={(e) => {
          // Update glow position on all nav buttons relative to each button
          const buttons = e.currentTarget.querySelectorAll('.nomad-nav-btn') as NodeListOf<HTMLElement>;
          buttons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            btn.style.setProperty('--x', `${e.clientX - rect.left}px`);
            btn.style.setProperty('--y', `${e.clientY - rect.top}px`);
          });
        }}
        style={{
          width: sidebarExpanded ? 282 : 70,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        {/* ── Sidebar Gradient (SVG filter-based) ── */}
        <SidebarGradient />

        {/* Logo — clickable for greeting + collapse toggle */}
        <div className={`relative z-10 flex items-center pt-5 pb-6 ${sidebarExpanded ? 'px-5' : 'justify-center px-0'}`}>
          <button
            onClick={() => { play('open'); }}
            className={`flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0 ${sidebarExpanded ? 'text-left' : 'justify-center'}`}
          >
            <NomadIcon size={20} animated={isRunning} className="text-white/80 shrink-0" />
            {sidebarExpanded && (
              <span className="text-[13px] font-semibold text-white/90 tracking-[0.15em] whitespace-nowrap">NOMAD</span>
            )}
          </button>
          {sidebarExpanded && (
            <button
              onClick={() => { play('toggle'); setSidebarCollapsed(c => !c); }}
              title={sidebarCollapsed ? 'Pin sidebar open' : 'Collapse sidebar'}
              className="ml-auto text-white/20 hover:text-white/60 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {sidebarCollapsed
                  ? <><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></>
                  : <><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></>
                }
              </svg>
            </button>
          )}
        </div>

        {/* ── Main Nav ── */}
        <nav className={`relative z-10 flex flex-col gap-1 mt-0 py-2 rounded-[16px] ${sidebarExpanded ? 'px-3 mx-2' : 'px-1.5 mx-1'}`} style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
        }}>
          {sidebarExpanded && (
            <span className="text-[8px] font-semibold tracking-[0.2em] uppercase px-3.5 pt-0.5 pb-1" style={{ color: 'rgba(255,255,255,0.15)' }}>
              Pipeline
            </span>
          )}
          {NAV_ITEMS.filter(i => (i.group || 'core') === 'core').map(({ key, label, shortcut, icon }) => {
            const active = activeView === key;
            const glow = NAV_GLOW[key];
            const isPulsing = pulsingView === key;
            return (
              <motion.button
                key={key}
                onClick={() => {
                  if (!active) play('navigate');
                  setActiveView(key); localStorage.setItem('nomad-last-view', key);
                  setPulsingView(key);
                  setTimeout(() => setPulsingView(null), 600);
                }}
                whileHover={{ scale: 1.01, x: sidebarExpanded ? 1 : 0 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`nomad-nav-btn group relative flex items-center rounded-[14px] transition-all ${
                  sidebarExpanded ? 'gap-3.5 px-3.5 py-3 text-left w-full' : 'justify-center p-1.5 mx-auto'
                } ${
                  active
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/75'
                }`}
                style={active ? {
                  background: `rgba(${glow}, 0.08)`,
                  border: `1px solid rgba(${glow}, 0.12)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px rgba(${glow}, 0.1)`,
                } : {
                  border: '1px solid transparent',
                }}
              >
                {/* Pulse glow on click */}
                {isPulsing && (
                  <motion.div
                    className="absolute inset-0 rounded-[14px] pointer-events-none"
                    initial={{ opacity: 0.5, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.3 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ boxShadow: `0 0 30px rgba(${glow}, 0.5), 0 0 60px rgba(${glow}, 0.2)` }}
                  />
                )}
                {active && sidebarExpanded && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: `rgba(${glow}, 0.8)` }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <div className="shrink-0">
                  {icon}
                </div>
                {sidebarExpanded ? (
                  <>
                    <span className="text-[14px] font-medium tracking-[0.01em] flex-1">{label}</span>
                    <kbd className="text-[9.5px] text-white/15 font-mono font-light">{shortcut}</kbd>
                  </>
                ) : (
                  <span className="absolute left-full ml-3 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50" style={{ background: 'rgba(0,0,0,0.85)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {label}
                  </span>
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* ── Tools Nav Group ── */}
        <nav className={`relative z-10 flex flex-col gap-1 mt-4 py-2 rounded-[16px] ${sidebarExpanded ? 'px-3 mx-2' : 'px-1.5 mx-1'}`} style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
        }}>
          {sidebarExpanded && (
            <span className="text-[8px] font-semibold tracking-[0.2em] uppercase px-3.5 pt-0.5 pb-1" style={{ color: 'rgba(255,255,255,0.15)' }}>
              Tools
            </span>
          )}
          {NAV_ITEMS.filter(i => i.group === 'tools').map(({ key, label, shortcut, icon }) => {
            const active = activeView === key;
            const glow = NAV_GLOW[key];
            const isPulsing = pulsingView === key;
            return (
              <motion.button
                key={key}
                onClick={() => {
                  if (!active) play('navigate');
                  setActiveView(key); localStorage.setItem('nomad-last-view', key);
                  setPulsingView(key);
                  setTimeout(() => setPulsingView(null), 600);
                }}
                whileHover={{ scale: 1.01, x: sidebarExpanded ? 1 : 0 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`nomad-nav-btn group relative flex items-center rounded-[14px] transition-all ${
                  sidebarExpanded ? 'gap-3.5 px-3.5 py-3 text-left w-full' : 'justify-center p-1.5 mx-auto'
                } ${
                  active
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/75'
                }`}
                style={active ? {
                  background: `rgba(${glow}, 0.08)`,
                  border: `1px solid rgba(${glow}, 0.12)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px rgba(${glow}, 0.1)`,
                } : {
                  border: '1px solid transparent',
                }}
              >
                {isPulsing && (
                  <motion.div
                    className="absolute inset-0 rounded-[14px] pointer-events-none"
                    initial={{ opacity: 0.5, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.3 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ boxShadow: `0 0 30px rgba(${glow}, 0.5), 0 0 60px rgba(${glow}, 0.2)` }}
                  />
                )}
                {active && sidebarExpanded && (
                  <motion.div
                    layoutId="nav-indicator-tools"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: `rgba(${glow}, 0.8)` }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <div className="shrink-0">
                  {icon}
                </div>
                {sidebarExpanded ? (
                  <>
                    <span className="text-[14px] font-medium tracking-[0.01em] flex-1">{label}</span>
                    <kbd className="text-[9.5px] text-white/15 font-mono font-light">{shortcut}</kbd>
                  </>
                ) : (
                  <span className="absolute left-full ml-3 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50" style={{ background: 'rgba(0,0,0,0.85)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {label}
                  </span>
                )}
              </motion.button>
            );
          })}
        </nav>

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Bottom section — separated: debug health + settings button ── */}
        <div className={`relative z-10 ${sidebarExpanded ? 'mx-3' : 'mx-1.5'} mb-4 flex flex-col gap-2`}>
          {/* Settings button — one clean full-width button */}
          <button
            onClick={() => { play('open'); setShowSettings(true); }}
            className="nomad-glass-btn flex items-center w-full"
            style={{
              borderRadius: 14,
              padding: sidebarExpanded ? '10px 14px' : '10px 0',
              justifyContent: sidebarExpanded ? 'flex-start' : 'center',
              gap: 10,
            }}
            title="Settings (Shift+S)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            {sidebarExpanded && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Settings</span>
                <div className="flex items-center gap-1.5">
                  {/* Ambient toggle inline */}
                  <span
                    onClick={(e) => { e.stopPropagation(); toggleAmbient(); play('toggle'); }}
                    className="transition-opacity hover:opacity-80 cursor-pointer p-0.5"
                    title={ambientEnabled ? 'Ambient sound on' : 'Ambient sound off'}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: ambientEnabled ? 'rgba(43,121,255,0.5)' : 'rgba(255,255,255,0.12)' }}>
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      {ambientEnabled && <><path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M19.07 4.93a10 10 0 010 14.14" /></>}
                      {!ambientEnabled && <line x1="23" y1="9" x2="17" y2="15" />}
                    </svg>
                  </span>
                  <kbd className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.1)' }}>Shift+S</kbd>
                </div>
              </div>
            )}
          </button>

          {/* Brand + Reset — compact line */}
          {campaign && sidebarExpanded && (
            <div className="flex items-center gap-1.5 px-2">
              <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: isRunning ? '#2B79FF' : 'rgba(255,255,255,0.15)' }} />
              <span className="text-[9px] text-white/20 font-medium truncate flex-1">{campaign.brand}</span>
              <button
                onClick={() => { play('reset'); clearCampaign(); }}
                className="text-[8px] text-white/12 hover:text-white/35 transition-colors"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ══ AMBIENT GRADIENT — full-viewport bleed, dark mode only ══ */}
      {isDarkMode && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 10, overflow: 'hidden' }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -40,
              transform: `rotate(${ambientRng.current.rotation}deg) translate(${ambientRng.current.tx}px, ${ambientRng.current.ty}px)`,
            }}
          >
            <MeshGradient
              colors={['#000000', '#050510', '#0a1628', '#0d1f3c', '#2B79FF']}
              speed={ambientRng.current.speed}
              distortion={0.4}
              swirl={0.15}
              grainMixer={0.0}
              grainOverlay={0.0}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0.06,
              }}
            />
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <main
        className={`flex-1 flex flex-col overflow-hidden z-20 relative ${
          isDarkMode ? 'rounded-l-[20px] mt-2' : 'bg-white'
        }`}
        style={{
          ...(isDarkMode ? { background: 'linear-gradient(180deg, rgba(10, 10, 14, 0.94) 0%, rgba(8, 12, 20, 0.96) 100%)' } : {}),
          border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : 'none',
          boxShadow: isDarkMode
            ? '0 8px 40px rgba(0,0,0,0.5), -4px 0 20px rgba(43,121,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)'
            : 'none',
        }}
      >
        {/* Background layers */}
        {isDarkMode && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-l-[20px]" style={{ zIndex: 0 }}>
            <EtherealBG />
            <BGPattern variant="dots" mask="fade-edges" />
          </div>
        )}

        {/* Top bar */}
        <div className={`relative flex items-center h-12 shrink-0 border-b overflow-hidden ${isDarkMode ? 'rounded-tl-[20px] px-7' : 'px-5'} ${
          isDarkMode ? 'border-white/[0.08] bg-transparent' : 'border-zinc-100 bg-white/80 backdrop-blur-sm'
        }`} style={{ zIndex: 1 }}>
          <div className="flex items-center gap-3 flex-1">
            {campaign && (
              <span className={`text-[13px] font-semibold ${isDarkMode ? 'text-white/[0.85]' : 'text-[#414243]'}`}>{campaign.brand}</span>
            )}
            {isRunning && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: isDarkMode ? 'rgba(43, 121, 255, 0.12)' : 'rgba(43, 121, 255, 0.08)',
                  color: '#2B79FF',
                }}
              >Running</span>
            )}
          </div>
          {/* Frosted glass settings button */}
          <button
            onClick={() => { play('open'); setShowSettings(true); }}
            title="Settings (Shift+S)"
            className="nomad-glass-btn flex items-center justify-center w-8 h-8"
            style={{
              borderRadius: 10,
              color: isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
        </div>

        {/* View content */}
        <div className="flex-1 flex flex-col overflow-hidden relative min-h-0" style={{ zIndex: 1 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12 }}
              className="flex-1 flex flex-col overflow-hidden min-h-0"
            >
              {activeView === 'research' && <Dashboard embedded />}
              {activeView === 'make' && <MakeStudio />}
              {activeView === 'test' && <TestView />}
              {activeView === 'computer' && <ComputerViewSimplified />}
              {activeView === 'agent' && <AgentPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <SettingsModal isOpen={showSettings} onClose={() => { play('close'); setShowSettings(false); }} isRunning={isRunning} />
      <BrandHubDrawer
        isOpen={showBrandHub}
        onClose={() => { play('close'); setShowBrandHub(false); }}
        brandDNA={currentCycle?.brandDNA}
        personas={currentCycle?.personas}
        creativeStrategy={currentCycle?.creativeStrategy}
        presetBrand={campaign?.presetData?.brand}
        presetAudience={campaign?.presetData?.audience}
        presetProduct={campaign?.presetData?.product}
        presetCompetitive={campaign?.presetData?.competitive}
        presetStrategy={campaign?.presetData?.strategy}
        presetMessaging={campaign?.presetData?.messaging}
        presetPersonas={campaign?.presetData?.personas}
      />
    </div>
  );
}

// ── Test View ──

function TestView() {
  const { currentCycle } = useCampaign();
  const { isDarkMode } = useTheme();
  const testOutput = currentCycle?.stages?.test?.agentOutput;
  const testComplete = currentCycle?.stages?.test?.status === 'complete';
  const isRunning = currentCycle?.stages?.test?.status === 'in-progress';

  return (
    <div className={`h-full flex items-center justify-center p-8 overflow-y-auto ${isDarkMode ? 'bg-transparent' : 'bg-zinc-50'}`}>
      {testComplete && testOutput ? (
        <div className={`max-w-3xl w-full p-8 ${glassCard(isDarkMode)}`}>
          <h2 className={`text-[14px] font-semibold mb-4 ${isDarkMode ? 'text-white/[0.85]' : 'text-[#414243]'}`}>Test Results</h2>
          <div className={`font-mono text-[12px] whitespace-pre-wrap leading-relaxed ${isDarkMode ? 'text-white/[0.55]' : 'text-zinc-600'}`}>
            {isRunning ? (
              <ResponseStream
                textStream={testOutput}
                mode="typewriter"
                speed={25}
                characterChunkSize={1}
                className={`text-[12px] leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-white/[0.55]' : 'text-zinc-600'}`}
              />
            ) : (
              testOutput
            )}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className={`w-16 h-16 mx-auto rounded-2xl border border-dashed flex items-center justify-center mb-4 ${
            isDarkMode ? 'border-white/[0.08] bg-white/[0.03]' : 'border-zinc-200 bg-white'
          }`}>
            <NomadIcon size={24} className={isDarkMode ? 'text-white/[0.30]' : 'text-zinc-300'} />
          </div>
          <p className={`text-[12px] ${isDarkMode ? 'text-white/[0.55]' : 'text-zinc-500'}`}>No test results yet</p>
          <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-white/[0.30]' : 'text-zinc-400'}`}>Run the full pipeline to evaluate ad concepts</p>
        </div>
      )}
    </div>
  );
}
