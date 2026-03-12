/**
 * AppShell — Dark sidebar + white content layout
 *
 * Fixed sidebar (~282px) with animated gradient background
 * 3D rendered nav icons, keyboard shortcuts
 * White main content area with rounded left corners
 */

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { useSoundEngine } from '../hooks/useSoundEngine';
import { MakeStudio } from './MakeStudio';
import { Dashboard } from './Dashboard';
import { SettingsModal } from './SettingsModal';
import { BrandHubDrawer } from './BrandHubDrawer';
import { NomadIcon } from './NomadIcon';
import { ShineText } from './ShineText';
import { SidebarGradient } from './SidebarGradient';
import { healthMonitor, type ServiceStatus } from '../utils/healthMonitor';
import { glassCard } from '../styles/tokens';

export type AppView = 'make' | 'research' | 'test';

// ── 3D rendered nav icons ──
function NavIcon({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} width={42} height={42} className="rounded-[10px] object-cover" draggable={false} />;
}

const NAV_ITEMS: Array<{
  key: AppView;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}> = [
  { key: 'research',  label: 'Research',  shortcut: 'R', icon: <NavIcon src="/icons/research.png" alt="Research" /> },
  { key: 'make',      label: 'Make',      shortcut: 'M', icon: <NavIcon src="/icons/make.png" alt="Make" /> },
  { key: 'test',      label: 'Test',      shortcut: 'T', icon: <NavIcon src="/icons/test.png" alt="Test" /> },
];


export function AppShell() {
  const [activeView, setActiveView] = useState<AppView>('research');
  const [showSettings, setShowSettings] = useState(false);
  const [showBrandHub, setShowBrandHub] = useState(false);
  const [, setHealthState] = useState<Record<string, ServiceStatus>>({});
  const { systemStatus, currentCycle, campaign } = useCampaign() as any;
  const { startCycle, stopCycle, clearCampaign } = useCampaign() as any;
  const { isDarkMode } = useTheme();
  const { play } = useSoundEngine();

  const isRunning = systemStatus === 'running';

  // Keyframe injection is handled by SidebarGradient component

  // Health monitor
  useEffect(() => {
    healthMonitor.start();
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

  const handleStartPipeline = useCallback(() => {
    if (campaign) { play('launch'); startCycle(); }
  }, [campaign, startCycle, play]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      const map: Record<string, AppView> = { r: 'research', m: 'make', t: 'test' };
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
    <div className="h-screen flex overflow-hidden bg-black">
      {/* ══ SIDEBAR ══ */}
      <aside
        className="w-[282px] h-full flex flex-col shrink-0 z-30 relative overflow-hidden"
      >
        {/* ── Sidebar Gradient (SVG filter-based) ── */}
        <SidebarGradient />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5 px-5 pt-5 pb-6">
          <NomadIcon size={20} animated={isRunning} className="text-white/80" />
          <span className="text-[13px] font-semibold text-white/90 tracking-[0.15em]">NOMAD</span>
        </div>

        {/* ── Main Nav ── */}
        <nav className="relative z-10 flex flex-col gap-1 px-3 mt-0 mx-2 py-2 rounded-[16px]" style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
        }}>
          {NAV_ITEMS.map(({ key, label, shortcut, icon }) => {
            const active = activeView === key;
            return (
              <motion.button
                key={key}
                onClick={() => { if (!active) play('navigate'); setActiveView(key); }}
                whileHover={{ scale: 1.01, x: 1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`relative flex items-center gap-3.5 rounded-[14px] px-3.5 py-3 transition-all text-left w-full ${
                  active
                    ? 'text-white'
                    : 'text-white/50 hover:text-white/75'
                }`}
                style={active ? {
                  background: 'rgba(255,255,255,0.09)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px rgba(43, 121, 255, 0.06)',
                } : {
                  border: '1px solid transparent',
                }}
              >
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: 'rgba(43, 121, 255, 0.8)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <div className="shrink-0">
                  {icon}
                </div>
                <span className="text-[14px] font-medium tracking-[0.01em] flex-1">{label}</span>
                <kbd className="text-[9.5px] text-white/15 font-mono font-light">{shortcut}</kbd>
              </motion.button>
            );
          })}
        </nav>

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Bottom: Settings ── */}
        <div className="relative z-10 px-3 mb-2">
          <motion.button
            onClick={() => { play('open'); setShowSettings(true); }}
            whileHover={{ scale: 1.02, x: 1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex items-center gap-2.5 rounded-[12px] px-3.5 py-2.5 transition-all text-left w-full text-white/45 hover:text-white/70"
            style={{
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span className="text-[12px] font-medium tracking-[0.01em]">Settings</span>
            <kbd className="ml-auto text-[9px] text-white/15 font-mono font-light">⇧S</kbd>
          </motion.button>
        </div>

        {/* ── Pipeline Controls — fixed height container to prevent layout shift ── */}
        <div className="relative z-10 px-4 mb-4 h-[57px]">
          <AnimatePresence mode="wait">
            {!isRunning && campaign && (
              <motion.button
                key="run"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={handleStartPipeline}
                className="absolute inset-x-4 w-[calc(100%-32px)] flex items-center justify-center h-[49px] rounded-full text-white/95 text-[14px] font-semibold tracking-[0.02em] transition-all hover:text-white group overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(43, 121, 255, 0.08) 50%, rgba(255,255,255,0.10) 100%)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  backdropFilter: 'blur(24px)',
                  boxShadow: `
                    inset 0 1px 0 rgba(255,255,255,0.2),
                    inset 0 -1px 0 rgba(255,255,255,0.05),
                    0 0 40px rgba(43, 121, 255, 0.08),
                    0 0 80px rgba(43, 121, 255, 0.04),
                    0 2px 12px rgba(0,0,0,0.2)
                  `,
                }}
              >
                {/* Animated gradient shimmer inside button */}
                <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 40%, rgba(43, 121, 255, 0.1) 60%, transparent 100%)',
                  animation: 'nomad-btn-shimmer 3s ease-in-out infinite',
                }} />
                <span className="relative z-10">Run Pipeline</span>
              </motion.button>
            )}
            {isRunning && (
              <motion.button
                key="stop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => { play('stop'); stopCycle(); }}
                className="absolute inset-x-4 w-[calc(100%-32px)] flex items-center justify-center h-[49px] rounded-full text-red-400/80 text-[14px] font-medium tracking-[0.01em] transition-all hover:text-red-400"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.12)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.08)',
                }}
              >
                Stop Pipeline
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── Status bar ── */}
        <div className="relative z-10 px-5 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={isRunning ? { backgroundColor: 'rgba(43, 121, 255, 0.8)' } : { backgroundColor: 'rgba(255,255,255,0.15)' }} />
            {isRunning ? (
              <ShineText className="text-[10px] text-white/50 tracking-wide" speed={5}>Running</ShineText>
            ) : (
              <span className="text-[10px] text-white/30 tracking-wide">
                {campaign ? campaign.brand : 'No campaign'}
              </span>
            )}
          </div>
          {campaign && !isRunning && (
            <button
              onClick={() => { play('reset'); clearCampaign(); }}
              className="text-[9px] text-white/15 hover:text-white/40 mt-1 transition-colors tracking-wide"
            >
              Reset
            </button>
          )}
        </div>
      </aside>

      {/* ══ MAIN CONTENT ══ */}
      <main
        className={`flex-1 flex flex-col overflow-hidden rounded-tl-[25px] rounded-bl-[25px] z-20 relative ${
          isDarkMode ? 'bg-zinc-950' : 'bg-white'
        }`}
        style={{ boxShadow: isDarkMode ? 'none' : '0px 0px 20px 2px rgba(255,255,255,0.15)' }}
      >
        {/* ── Figma gradient ellipses — #2B79FF to white, plus-lighter ── */}
        <div className="absolute inset-0 overflow-hidden rounded-tl-[25px] rounded-bl-[25px] pointer-events-none" style={{ zIndex: 0 }}>
          {/* Ellipse 1: Large primary glow — top-left corner (matches Figma 1008px at sidebar junction) */}
          <div
            className="absolute"
            style={{
              top: '-15%',
              left: '-10%',
              width: '80%',
              height: '80%',
              borderRadius: '50%',
              background: isDarkMode
                ? 'radial-gradient(circle, rgba(43, 121, 255, 0.08) 0%, rgba(43, 121, 255, 0.03) 40%, transparent 70%)'
                : 'radial-gradient(circle, rgba(43, 121, 255, 0.05) 0%, rgba(43, 121, 255, 0.015) 40%, transparent 70%)',
              mixBlendMode: 'plus-lighter' as any,
            }}
          />
          {/* Ellipse 2: Secondary glow — offset bottom-right */}
          <div
            className="absolute"
            style={{
              bottom: '-20%',
              right: '-5%',
              width: '70%',
              height: '70%',
              borderRadius: '50%',
              background: isDarkMode
                ? 'radial-gradient(circle, rgba(43, 121, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 40%, transparent 65%)'
                : 'radial-gradient(circle, rgba(43, 121, 255, 0.03) 0%, rgba(255, 255, 255, 0.005) 40%, transparent 65%)',
              mixBlendMode: 'plus-lighter' as any,
            }}
          />
          {/* Ellipse 3: Mid accent — center-left */}
          <div
            className="absolute"
            style={{
              top: '30%',
              left: '-15%',
              width: '50%',
              height: '50%',
              borderRadius: '50%',
              background: isDarkMode
                ? 'radial-gradient(circle, rgba(43, 121, 255, 0.05) 0%, transparent 60%)'
                : 'radial-gradient(circle, rgba(43, 121, 255, 0.025) 0%, transparent 60%)',
              mixBlendMode: 'plus-lighter' as any,
            }}
          />
          {/* Ellipse 4: Tiny bright spot — near top */}
          <div
            className="absolute"
            style={{
              top: '5%',
              left: '15%',
              width: '30%',
              height: '30%',
              borderRadius: '50%',
              background: isDarkMode
                ? 'radial-gradient(circle, rgba(43, 121, 255, 0.07) 0%, rgba(255, 255, 255, 0.015) 30%, transparent 55%)'
                : 'radial-gradient(circle, rgba(43, 121, 255, 0.035) 0%, rgba(255, 255, 255, 0.008) 30%, transparent 55%)',
              mixBlendMode: 'plus-lighter' as any,
              filter: 'blur(20px)',
            }}
          />
          {/* Ellipse 5: Warm counterbalance — bottom-left */}
          <div
            className="absolute"
            style={{
              bottom: '10%',
              left: '20%',
              width: '40%',
              height: '35%',
              borderRadius: '50%',
              background: isDarkMode
                ? 'radial-gradient(circle, rgba(43, 121, 255, 0.04) 0%, rgba(255, 255, 255, 0.008) 35%, transparent 60%)'
                : 'radial-gradient(circle, rgba(43, 121, 255, 0.02) 0%, rgba(255, 255, 255, 0.004) 35%, transparent 60%)',
              mixBlendMode: 'plus-lighter' as any,
            }}
          />
          {/* Ellipse 6: Edge bleed from sidebar (Figma node 526:18 position) */}
          <div
            className="absolute"
            style={{
              top: '-10%',
              left: '-5%',
              width: '45%',
              height: '90%',
              borderRadius: '50%',
              background: isDarkMode
                ? 'radial-gradient(ellipse 80% 80% at 20% 40%, rgba(43, 121, 255, 0.06) 0%, transparent 60%)'
                : 'radial-gradient(ellipse 80% 80% at 20% 40%, rgba(43, 121, 255, 0.03) 0%, transparent 60%)',
              mixBlendMode: 'plus-lighter' as any,
            }}
          />
        </div>

        {/* Top bar */}
        <div className={`relative flex items-center h-12 px-5 shrink-0 border-b rounded-tl-[25px] ${
          isDarkMode ? 'border-zinc-800 bg-transparent' : 'border-zinc-100 bg-white/80 backdrop-blur-sm'
        }`} style={{ zIndex: 1 }}>
          <div className="flex items-center gap-3 flex-1">
            {campaign && (
              <span className={`text-sm font-semibold ${isDarkMode ? 'text-zinc-200' : 'text-[#414243]'}`}>{campaign.brand}</span>
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
        </div>

        {/* View content */}
        <div className="flex-1 flex flex-col overflow-hidden relative" style={{ zIndex: 1 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {activeView === 'research' && <Dashboard embedded />}
              {activeView === 'make' && <MakeStudio />}
              {activeView === 'test' && <TestView />}
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

  return (
    <div className={`h-full flex items-center justify-center p-8 overflow-y-auto ${isDarkMode ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
      {testComplete && testOutput ? (
        <div className={`max-w-3xl w-full p-8 ${glassCard(isDarkMode)}`}>
          <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-zinc-100' : 'text-[#414243]'}`}>Test Results</h2>
          <div className={`font-mono text-xs whitespace-pre-wrap leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
            {testOutput}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className={`w-16 h-16 mx-auto rounded-2xl border border-dashed flex items-center justify-center mb-4 ${
            isDarkMode ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-white'
          }`}>
            <NomadIcon size={24} className={isDarkMode ? 'text-zinc-600' : 'text-zinc-300'} />
          </div>
          <p className={`text-sm ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>No test results yet</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Run the full pipeline to evaluate ad concepts</p>
        </div>
      )}
    </div>
  );
}
