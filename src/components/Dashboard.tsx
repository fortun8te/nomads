import { useState, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { CampaignSelector } from './CampaignSelector';
import { ControlPanel } from './ControlPanel';
import { CycleTimeline } from './CycleTimeline';
import { StagePanel } from './StagePanel';
import { QuestionModal } from './QuestionModal';
import {
  getResearchModelConfig, getResearchLimits, getBrainTemperature, setBrainTemperature,
  getAllBrainTempDefaults, RESEARCH_PRESETS, applyResearchPreset, getActiveResearchPreset
} from '../utils/modelConfig';
import type { ResearchDepthPreset } from '../utils/modelConfig';
import type { StageName, Campaign, Cycle } from '../types';

interface DashboardProps {
  embedded?: boolean;
}

export function Dashboard({ embedded = false }: DashboardProps) {
  const { systemStatus, error, currentCycle, cycles, campaign, pendingQuestion, answerQuestion } = useCampaign();
  const { clearCampaign, startCycle, stopCycle } = useCampaign() as any;
  const { isDarkMode } = useTheme();
  const isRunning = systemStatus === 'running';
  const [selectedStage, setSelectedStage] = useState<StageName | null>(null);

  useEffect(() => {
    if (currentCycle) {
      setSelectedStage(currentCycle.currentStage);
    }
  }, [currentCycle?.currentStage]);

  return (
    <div className={`${embedded ? 'flex-1 overflow-y-auto' : 'min-h-screen'} ${isDarkMode ? 'bg-transparent text-white' : 'bg-transparent text-zinc-900'}`}>
      {!embedded && <ControlPanel />}

      <div className="max-w-7xl mx-auto px-6 py-5">
        {/* Error banner */}
        {error && (
          <div className={`rounded-xl p-4 mb-5 flex items-start gap-3 ${
            isDarkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
          }`}>
            <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>Error</span>
            <span className={`text-xs ${isDarkMode ? 'text-red-300/80' : 'text-red-700'}`}>{error}</span>
          </div>
        )}

        {!campaign ? (
          /* ── No campaign: full-width selector ── */
          <div className="max-w-3xl mx-auto">
            <CampaignSelector />
          </div>
        ) : (
          /* ── Campaign loaded: sidebar + pipeline ── */
          <div className="grid grid-cols-12 gap-5">
            {/* Left — unified side panel */}
            <div className="col-span-3">
              <SidePanel
                campaign={campaign}
                isDark={isDarkMode}
                cycles={cycles}
                onClear={clearCampaign}
                onStart={startCycle}
                onStop={stopCycle}
                isRunning={isRunning}
                hasCycle={!!currentCycle}
              />
            </div>

            {/* Right — pipeline output */}
            <div className="col-span-9 space-y-3">
              {currentCycle ? (
                <>
                  <CycleTimeline cycle={currentCycle} selectedStage={selectedStage} onSelectStage={setSelectedStage} />
                  <StagePanel cycle={currentCycle} isRunning={isRunning} isDarkMode={isDarkMode} viewStage={selectedStage} />
                </>
              ) : (
                <div className={`rounded-2xl p-20 text-center ${
                  isDarkMode ? 'bg-zinc-900/30' : 'bg-zinc-50/30'
                }`}>
                  <p className={`text-[13px] font-medium ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`}>
                    Ready to run
                  </p>
                  <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-zinc-700' : 'text-zinc-300/70'}`}>
                    Press Start to begin the research pipeline
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {pendingQuestion && (
        <QuestionModal question={pendingQuestion} onAnswer={answerQuestion} isDarkMode={isDarkMode} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// SidePanel — one unified card, no stacked borders
// ══════════════════════════════════════════════════════

function SidePanel({ campaign, isDark, cycles, onClear, onStart, onStop, isRunning, hasCycle }: {
  campaign: Campaign;
  isDark: boolean;
  cycles: Cycle[];
  onClear: () => void;
  onStart: () => void;
  onStop: () => void;
  isRunning: boolean;
  hasCycle: boolean;
}) {
  // ── Research config state ──
  const config = getResearchModelConfig();
  const limits = getResearchLimits();
  const [activePreset, setActivePreset] = useState<ResearchDepthPreset | 'custom'>(getActiveResearchPreset());
  const [models, setModels] = useState({
    orchestrator: config.orchestratorModel,
    researcherSynthesis: config.researcherSynthesisModel,
    compression: config.compressionModel,
    reflection: config.reflectionModel,
    desireLayer: config.desireLayerModel,
    personaSynthesis: config.personaSynthesisModel,
    councilBrain: config.councilBrainModel,
  });
  const [temperature, setTemperature] = useState(config.temperature);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [intensity, setIntensity] = useState({
    maxIterations: limits.maxIterations,
    minIterations: limits.minIterations,
    coverageThreshold: limits.coverageThreshold,
    minSources: limits.minSources,
    maxResearchersPerIteration: limits.maxResearchersPerIteration,
    maxTimeMinutes: limits.maxTimeMinutes,
    parallelCompressionCount: limits.parallelCompressionCount,
  });

  const brainDefaults = getAllBrainTempDefaults();
  const brainIds = Object.keys(brainDefaults);
  const [brainTemps, setBrainTemps] = useState<Record<string, number>>(() => {
    const temps: Record<string, number> = {};
    brainIds.forEach(id => { temps[id] = getBrainTemperature(id); });
    return temps;
  });

  const save = (key: string, val: string) => localStorage.setItem(key, val);

  const modelOptions = [
    { value: 'qwen3.5:9b', label: 'Qwen 3.5 9B' },
    { value: 'qwen3.5:35b', label: 'Qwen 3.5 35B' },
    { value: 'local:qwen3.5:9b', label: 'Qwen 9B Local' },
    { value: 'local:qwen3.5:35b', label: 'Qwen 35B Local' },
    { value: 'gpt-oss:20b', label: 'GPT-OSS 20B' },
    { value: 'lfm2.5-thinking:latest', label: 'LFM 2.5' },
    { value: 'qwen3.5:0.8b', label: 'Qwen 0.8B' },
  ];

  const modelRoles: { id: keyof typeof models; storageKey: string; label: string }[] = [
    { id: 'orchestrator', storageKey: 'research_model', label: 'Orchestrator' },
    { id: 'researcherSynthesis', storageKey: 'researcher_synthesis_model', label: 'Synthesis' },
    { id: 'compression', storageKey: 'compression_model', label: 'Compression' },
    { id: 'reflection', storageKey: 'reflection_model', label: 'Reflection' },
    { id: 'desireLayer', storageKey: 'desire_layer_model', label: 'Desire Analysis' },
    { id: 'personaSynthesis', storageKey: 'persona_synthesis_model', label: 'Persona' },
    { id: 'councilBrain', storageKey: 'council_brain_model', label: 'Council' },
  ];

  const intensityFields: { id: keyof typeof intensity; storageKey: string; label: string; min: number; max: number; step: number; isFloat?: boolean }[] = [
    { id: 'maxIterations', storageKey: 'max_research_iterations', label: 'Max Iterations', min: 3, max: 250, step: 1 },
    { id: 'minIterations', storageKey: 'min_research_iterations', label: 'Min Iterations', min: 1, max: 50, step: 1 },
    { id: 'coverageThreshold', storageKey: 'coverage_target', label: 'Coverage Target', min: 0.5, max: 1.0, step: 0.005, isFloat: true },
    { id: 'minSources', storageKey: 'min_research_sources', label: 'Min Sources', min: 5, max: 600, step: 5 },
    { id: 'maxResearchersPerIteration', storageKey: 'max_researchers_per_iteration', label: 'Agents / Iter', min: 1, max: 10, step: 1 },
    { id: 'maxTimeMinutes', storageKey: 'max_research_time_minutes', label: 'Max Time (min)', min: 5, max: 3000, step: 5 },
    { id: 'parallelCompressionCount', storageKey: 'parallel_compression_count', label: 'Parallel Compress', min: 1, max: 8, step: 1 },
  ];

  const brainNames: Record<string, string> = {
    desire: 'Desire', persuasion: 'Persuasion', offer: 'Offer',
    creative: 'Creative', avatar: 'Avatar', contrarian: 'Contrarian', visual: 'Visual',
  };

  // ── Styling ──
  const selectCls = `w-full text-[11px] font-medium rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors ${
    isDark ? 'text-zinc-300 bg-zinc-800 border border-zinc-700' : 'text-[#414243] bg-zinc-50/80 border border-zinc-100 focus:border-zinc-300'
  }`;
  const divider = isDark ? 'border-zinc-800/60' : 'border-zinc-100/60';
  const labelCls = isDark ? 'text-zinc-500' : 'text-zinc-400';
  const sliderTrack = isDark ? '#27272a' : '#e4e4e7';

  // ── Brand data ──
  const p = campaign.presetData;
  const brandName = p?.brand?.name || campaign.brand;
  const colorStr = typeof p?.brand?.colors === 'string' ? p.brand.colors : '';
  const hexColors = colorStr.match(/#[0-9A-Fa-f]{6}/g) || [];
  const completed = cycles.filter((c: Cycle) => c.status === 'complete');

  return (
    <div className={`rounded-2xl overflow-hidden ${
      isDark
        ? 'bg-zinc-900 border border-zinc-800/60'
        : 'bg-white border border-zinc-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
    }`}>
      {/* ── Campaign header ── */}
      <div className={`px-4 py-3.5 border-b ${divider}`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-[13px] font-semibold tracking-tight ${isDark ? 'text-zinc-100' : 'text-[#414243]'}`}>
            {brandName}
          </h2>
          <button
            onClick={onClear}
            className={`text-[10px] font-medium transition-colors ${isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-300 hover:text-zinc-500'}`}
          >
            Switch
          </button>
        </div>
        {p?.brand?.positioning && (
          <p className={`text-[11px] mt-0.5 line-clamp-2 ${labelCls}`}>
            {p.brand.positioning}
          </p>
        )}
      </div>

      {/* ── Research depth presets ── */}
      <div className={`px-4 py-3 border-b ${divider}`}>
        <div className="grid grid-cols-5 gap-1">
          {RESEARCH_PRESETS.map(preset => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  applyResearchPreset(preset.id);
                  setActivePreset(preset.id);
                  setIntensity({
                    maxIterations: preset.limits.maxIterations,
                    minIterations: preset.limits.minIterations,
                    coverageThreshold: preset.limits.coverageThreshold,
                    minSources: preset.limits.minSources,
                    maxResearchersPerIteration: preset.limits.maxResearchersPerIteration,
                    maxTimeMinutes: preset.limits.maxTimeMinutes,
                    parallelCompressionCount: preset.limits.parallelCompressionCount,
                  });
                }}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-1 transition-all text-center ${
                  isActive
                    ? isDark ? 'bg-zinc-700 text-white ring-1 ring-zinc-600' : 'bg-[#414243] text-white shadow-sm'
                    : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700/60' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                }`}
                title={`${preset.label} — ${preset.description}`}
              >
                <span className="text-[10px] font-bold leading-none">{preset.shortLabel}</span>
                <span className={`text-[8px] leading-none ${isActive ? 'opacity-80' : 'opacity-50'}`}>{preset.time}</span>
              </button>
            );
          })}
        </div>
        {activePreset !== 'custom' && (() => {
          const ap = RESEARCH_PRESETS.find(pr => pr.id === activePreset);
          if (!ap) return null;
          return (
            <p className={`mt-1.5 text-[9px] leading-relaxed line-clamp-1 ${labelCls}`}>
              {ap.description} · {ap.limits.maxIterations} iter · {ap.limits.minSources} sources
            </p>
          );
        })()}
      </div>

      {/* ── Model selects ── */}
      <div className={`px-4 py-3 border-b ${divider} space-y-2`}>
        <div>
          <span className={`text-[10px] font-medium block mb-1 ${labelCls}`}>Brain</span>
          <select
            value={models.orchestrator}
            onChange={(e) => { setModels(prev => ({ ...prev, orchestrator: e.target.value })); save('research_model', e.target.value); }}
            className={selectCls}
          >
            {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <span className={`text-[10px] font-medium block mb-1 ${labelCls}`}>Compression</span>
          <select
            value={models.compression}
            onChange={(e) => { setModels(prev => ({ ...prev, compression: e.target.value })); save('compression_model', e.target.value); }}
            className={selectCls}
          >
            {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 text-[10px] font-medium pt-0.5 transition-colors ${labelCls} hover:${isDark ? 'text-zinc-300' : 'text-zinc-600'}`}
        >
          <svg
            width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            className={`transition-transform duration-150 ${showAdvanced ? 'rotate-90' : ''}`}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          Advanced
        </button>

        {showAdvanced && (
          <div className="space-y-2.5 pt-1">
            {/* Global Temperature */}
            <div>
              <div className="flex items-center justify-between">
                <span className={`text-[9px] ${labelCls}`}>Default Temp</span>
                <span className={`text-[9px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.1" value={temperature}
                onChange={(e) => { const v = parseFloat(e.target.value); setTemperature(v); save('research_temperature', String(v)); }}
                className="w-full h-0.5 rounded-full appearance-none cursor-pointer accent-zinc-400 mt-0.5"
                style={{ background: sliderTrack }}
              />
            </div>

            {/* Model Roles */}
            <div className={`text-[9px] uppercase tracking-wider font-semibold pt-1 ${labelCls}`}>Model Roles</div>
            {modelRoles
              .filter(r => r.id !== 'orchestrator' && r.id !== 'compression')
              .map(role => (
                <div key={role.id}>
                  <span className={`text-[9px] block mb-0.5 ${labelCls}`}>{role.label}</span>
                  <select
                    value={models[role.id]}
                    onChange={(e) => { setModels(prev => ({ ...prev, [role.id]: e.target.value })); save(role.storageKey, e.target.value); }}
                    className={selectCls}
                  >
                    {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}

            {/* Research Intensity */}
            <div className={`text-[9px] uppercase tracking-wider font-semibold pt-1 ${labelCls}`}>Research Intensity</div>
            {intensityFields.map(field => (
              <div key={field.id}>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] ${labelCls}`}>{field.label}</span>
                  <span className={`text-[9px] font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {field.isFloat ? (intensity[field.id] as number).toFixed(2) : intensity[field.id]}
                  </span>
                </div>
                <input
                  type="range" min={field.min} max={field.max} step={field.step} value={intensity[field.id]}
                  onChange={(e) => {
                    const v = field.isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                    setIntensity(prev => ({ ...prev, [field.id]: v }));
                    save(field.storageKey, String(v));
                  }}
                  className="w-full h-0.5 rounded-full appearance-none cursor-pointer accent-zinc-400 mt-0.5"
                  style={{ background: sliderTrack }}
                />
              </div>
            ))}

            {/* Brain Temperatures */}
            <div className={`text-[9px] uppercase tracking-wider font-semibold pt-1 ${labelCls}`}>Brain Temperatures</div>
            {brainIds.map(id => (
              <div key={id}>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] ${labelCls}`}>{brainNames[id] || id}</span>
                  <span className={`text-[9px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>{brainTemps[id]?.toFixed(1)}</span>
                </div>
                <input
                  type="range" min="0" max="1.5" step="0.05" value={brainTemps[id] ?? 0.7}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setBrainTemps(prev => ({ ...prev, [id]: v }));
                    setBrainTemperature(id, v);
                  }}
                  className="w-full h-0.5 rounded-full appearance-none cursor-pointer accent-zinc-400 mt-0.5"
                  style={{ background: sliderTrack }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Brand DNA link ── */}
      {(p?.brand?.name || campaign.brand) && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('nomad-open-brand-hub'))}
          className={`w-full px-4 py-3 border-b ${divider} flex items-center gap-2.5 transition-colors text-left ${
            isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-50/50'
          }`}
        >
          {hexColors.length > 0 && (
            <div className="flex -space-x-1">
              {hexColors.slice(0, 4).map((c: string, i: number) => (
                <div key={i} className="w-3.5 h-3.5 rounded-full border-2 border-white" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
          <span className={`text-[11px] font-medium flex-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Brand DNA
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#52525b' : '#d4d4d8'} strokeWidth="2.5" strokeLinecap="round">
            <path d="M7 17L17 7M17 7H7M17 7V17" />
          </svg>
        </button>
      )}

      {/* ── History count ── */}
      <div className={`px-4 py-2.5 ${!isRunning && !hasCycle ? `border-b ${divider}` : ''}`}>
        <span className={`text-[11px] ${isDark ? 'text-zinc-600' : 'text-zinc-300'}`}>
          {completed.length === 0 ? 'No completed cycles' : `${completed.length} completed cycle${completed.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Start Research button ── */}
      {!isRunning && !hasCycle && (
        <div className="px-4 py-3">
          <button
            onClick={onStart}
            className={`w-full py-2.5 rounded-xl text-[12px] font-semibold tracking-wide transition-all ${
              isDark
                ? 'bg-white/10 text-white/90 hover:bg-white/15 border border-white/10'
                : 'bg-[#414243] text-white hover:bg-[#333435] shadow-sm'
            }`}
          >
            Start Research
          </button>
        </div>
      )}

      {/* ── Stop Research button ── */}
      {isRunning && (
        <div className="px-4 py-3">
          <button
            onClick={onStop}
            className={`w-full py-2.5 rounded-xl text-[12px] font-semibold tracking-wide transition-all flex items-center justify-center gap-2 ${
              isDark
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full animate-pulse bg-red-500" />
            Stop Research
          </button>
        </div>
      )}
    </div>
  );
}
