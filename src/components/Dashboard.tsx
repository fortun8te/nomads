import { useState, useEffect } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useTheme } from '../context/ThemeContext';
import { CampaignSelector } from './CampaignSelector';
import { ControlPanel } from './ControlPanel';
import { CycleTimeline } from './CycleTimeline';
import { StagePanel } from './StagePanel';
import { QuestionModal } from './QuestionModal';
import { WayfayerPlusPanel } from './WayfayerPlusPanel';
import {
  getResearchModelConfig, getResearchLimits, getBrainTemperature, setBrainTemperature,
  getAllBrainTempDefaults, RESEARCH_PRESETS, applyResearchPreset, getActiveResearchPreset
} from '../utils/modelConfig';
import type { ResearchDepthPreset } from '../utils/modelConfig';
import { getVisionModel, VISION_MODEL_OPTIONS } from '../utils/modelConfig';
import type { StageName, Campaign, Cycle } from '../types';

interface DashboardProps {
  embedded?: boolean;
}

export function Dashboard({ embedded = false }: DashboardProps) {
  const { systemStatus, error, currentCycle, cycles, campaign, pendingQuestion, answerQuestion, clearCampaign } = useCampaign();
  const { isDarkMode } = useTheme();
  const isRunning = systemStatus === 'running';
  const [selectedStage, setSelectedStage] = useState<StageName | null>(null);
  const [viewingCycleIdx, setViewingCycleIdx] = useState<number | null>(null); // null = follow currentCycle

  // Keep viewingCycleIdx pointing at the latest cycle when running
  useEffect(() => {
    if (isRunning) setViewingCycleIdx(null); // always follow live cycle when running
  }, [isRunning]);

  // The cycle to display in the right panel
  // When idle, show the last completed cycle (not the empty state with WayfayerPlusPanel)
  const displayedCycle = viewingCycleIdx !== null
    ? cycles[viewingCycleIdx] ?? currentCycle
    : currentCycle ?? (cycles.length > 0 ? cycles[cycles.length - 1] : null);

  useEffect(() => {
    if (currentCycle) {
      setSelectedStage(currentCycle.currentStage);
    }
  }, [currentCycle?.currentStage]);

  return (
    <div className={`${embedded ? 'flex-1' : 'h-screen'} flex flex-col overflow-hidden ${isDarkMode ? 'bg-transparent text-white/[0.85]' : 'bg-zinc-50 text-zinc-900'}`}>
      {!embedded && <ControlPanel />}

      {!campaign ? (
        <div className="flex-1 flex items-center justify-center overflow-y-auto p-6">
          <div className="max-w-2xl w-full">
            <CampaignSelector />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* ── LEFT PANEL ── */}
          <LeftPanel
            campaign={campaign}
            isDark={isDarkMode}
            cycles={cycles}
            displayedCycle={displayedCycle}
            viewingCycleIdx={viewingCycleIdx}
            onSelectCycleIdx={setViewingCycleIdx}
            onClear={clearCampaign}
            selectedStage={selectedStage}
            onSelectStage={setSelectedStage}
          />

          {/* ── RIGHT PANEL ── */}
          <div className={`flex-1 flex flex-col min-h-0 min-w-0 border-l ${isDarkMode ? 'border-white/[0.08]' : 'border-black/[0.06]'}`}>
            {error && (
              <div className={`flex-shrink-0 px-5 py-2 flex items-center gap-2 text-xs border-b ${
                isDarkMode ? 'bg-red-950/20 border-red-900/30 text-red-400' : 'bg-red-50 border-red-100 text-red-600'
              }`}>
                <span className="font-semibold">Error</span>
                <span className="opacity-70">{error}</span>
              </div>
            )}
            {displayedCycle ? (
              <StagePanel
                cycle={displayedCycle}
                isRunning={isRunning && displayedCycle.id === currentCycle?.id}
                isDarkMode={isDarkMode}
                viewStage={selectedStage}
              />
            ) : (
              <StartScreen isDarkMode={isDarkMode} />
            )}
          </div>
        </div>
      )}

      {pendingQuestion && (
        <QuestionModal question={pendingQuestion} onAnswer={answerQuestion} isDarkMode={isDarkMode} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// LeftPanel
// ══════════════════════════════════════════════════════

function LeftPanel({
  campaign, isDark, cycles, displayedCycle, viewingCycleIdx, onSelectCycleIdx,
  onClear, selectedStage, onSelectStage,
}: {
  campaign: Campaign;
  isDark: boolean;
  cycles: Cycle[];
  displayedCycle: Cycle | null;
  viewingCycleIdx: number | null;
  onSelectCycleIdx: (idx: number | null) => void;
  onClear: () => void;
  selectedStage: StageName | null;
  onSelectStage: (s: StageName) => void;
}) {
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

  const selectCls = `w-full text-[11px] font-medium rounded-md px-2 py-1.5 outline-none cursor-pointer transition-colors ${
    isDark ? 'text-white/[0.55] bg-white/[0.04] border border-white/[0.08]' : 'text-zinc-600 bg-zinc-50 border border-black/[0.06]'
  }`;
  const divider = isDark ? 'border-white/[0.08]' : 'border-black/[0.06]';
  const labelCls = isDark ? 'text-white/[0.30]' : 'text-zinc-400';
  const sliderTrack = isDark ? '#1f1f23' : '#e4e4e7';

  const p = campaign.presetData;
  const brandName = p?.brand?.name || campaign.brand;
  const colorStr = typeof p?.brand?.colors === 'string' ? p.brand.colors : '';
  const hexColors = colorStr.match(/#[0-9A-Fa-f]{6}/g) || [];
  const completed = cycles.filter((c: Cycle) => c.status === 'complete');

  return (
    <div className={`w-60 flex-shrink-0 flex flex-col overflow-hidden ${isDark ? 'bg-transparent' : 'bg-white'}`}>


      {/* ── Brand header ── */}
      <div className={`flex-shrink-0 px-4 py-3 border-b ${divider}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {hexColors.length > 0 && (
              <div className="flex -space-x-0.5 flex-shrink-0">
                {hexColors.slice(0, 3).map((c: string, i: number) => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
            <span className={`text-[12px] font-semibold truncate ${isDark ? 'text-white/[0.85]' : 'text-zinc-900'}`}>{brandName}</span>
          </div>
          <button onClick={onClear} className={`text-[10px] flex-shrink-0 transition-colors ml-2 ${isDark ? 'text-white/[0.15] hover:text-white/[0.55]' : 'text-zinc-300 hover:text-zinc-500'}`}>
            Switch
          </button>
        </div>
        {p?.brand?.positioning && (
          <p className={`text-[10px] mt-0.5 line-clamp-1 ${labelCls}`}>{p.brand.positioning}</p>
        )}
        <p className={`text-[10px] mt-0.5 ${isDark ? 'text-white/[0.15]' : 'text-zinc-300'}`}>
          {completed.length === 0 ? 'No cycles yet' : `${completed.length} cycle${completed.length !== 1 ? 's' : ''} done`}
        </p>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Presets */}
        <div className={`px-3 py-3 border-b ${divider}`}>
          <span className={`text-[9px] uppercase font-semibold tracking-wider px-1 ${labelCls}`}>Depth</span>
          <div className="flex flex-col gap-0.5 mt-1.5">
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
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all ${
                    isActive
                      ? isDark ? 'bg-white/[0.08] text-white/[0.85]' : 'bg-zinc-800 text-white'
                      : isDark ? 'text-white/[0.30] hover:bg-white/[0.04] hover:text-white/[0.55]' : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] font-medium leading-none">{preset.label}</span>
                    {isActive && (
                      <span className={`text-[9px] leading-none ${isDark ? 'text-white/[0.55]' : 'text-zinc-400'}`}>
                        {preset.limits.maxIterations} iter · {preset.limits.minSources} src
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] font-mono leading-none tabular-nums ${isActive ? (isDark ? 'text-white/[0.55]' : 'text-zinc-400') : 'opacity-40'}`}>{preset.time}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Models */}
        <div className={`px-3 py-3 border-b ${divider}`}>
          <span className={`text-[9px] uppercase font-semibold tracking-wider px-1 ${labelCls}`}>Models</span>
          <div className="mt-1.5 space-y-1.5">
            <div>
              <span className={`text-[9px] block mb-0.5 ${labelCls}`}>Brain</span>
              <select value={models.orchestrator} onChange={(e) => { setModels(p => ({ ...p, orchestrator: e.target.value })); save('research_model', e.target.value); }} className={selectCls}>
                {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <span className={`text-[9px] block mb-0.5 ${labelCls}`}>Compression</span>
              <select value={models.compression} onChange={(e) => { setModels(p => ({ ...p, compression: e.target.value })); save('compression_model', e.target.value); }} className={selectCls}>
                {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <VisionModelSelector selectCls={selectCls} labelCls={labelCls} />
          </div>

          {/* Advanced */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-1.5 mt-2 text-[9px] font-medium transition-colors ${labelCls} hover:text-zinc-400`}
          >
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
              className={`transition-transform duration-150 ${showAdvanced ? 'rotate-90' : ''}`}
            ><path d="M9 18l6-6-6-6" /></svg>
            Advanced
          </button>

          {showAdvanced && (
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] ${labelCls}`}>Default Temp</span>
                  <span className={`text-[9px] font-mono ${isDark ? 'text-white/[0.55]' : 'text-zinc-500'}`}>{temperature.toFixed(1)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.1" value={temperature}
                  onChange={(e) => { const v = parseFloat(e.target.value); setTemperature(v); save('research_temperature', String(v)); }}
                  className="w-full h-0.5 rounded-full appearance-none cursor-pointer accent-zinc-400 mt-0.5"
                  style={{ background: sliderTrack }}
                />
              </div>
              <div className={`text-[9px] uppercase tracking-wider font-semibold ${labelCls}`}>All Models</div>
              {modelRoles.filter(r => r.id !== 'orchestrator' && r.id !== 'compression').map(role => (
                <div key={role.id}>
                  <span className={`text-[9px] block mb-0.5 ${labelCls}`}>{role.label}</span>
                  <select value={models[role.id]} onChange={(e) => { setModels(p => ({ ...p, [role.id]: e.target.value })); save(role.storageKey, e.target.value); }} className={selectCls}>
                    {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              <div className={`text-[9px] uppercase tracking-wider font-semibold ${labelCls}`}>Intensity</div>
              {intensityFields.map(field => (
                <div key={field.id}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] ${labelCls}`}>{field.label}</span>
                    <span className={`text-[9px] font-mono ${isDark ? 'text-white/[0.55]' : 'text-zinc-500'}`}>
                      {field.isFloat ? (intensity[field.id] as number).toFixed(2) : intensity[field.id]}
                    </span>
                  </div>
                  <input type="range" min={field.min} max={field.max} step={field.step} value={intensity[field.id]}
                    onChange={(e) => {
                      const v = field.isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                      setIntensity(p => ({ ...p, [field.id]: v }));
                      save(field.storageKey, String(v));
                    }}
                    className="w-full h-0.5 rounded-full appearance-none cursor-pointer accent-zinc-400 mt-0.5"
                    style={{ background: sliderTrack }}
                  />
                </div>
              ))}
              <div className={`text-[9px] uppercase tracking-wider font-semibold ${labelCls}`}>Brain Temps</div>
              {brainIds.map(id => (
                <div key={id}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] ${labelCls}`}>{brainNames[id] || id}</span>
                    <span className={`text-[9px] font-mono ${isDark ? 'text-white/[0.30]' : 'text-zinc-500'}`}>{brainTemps[id]?.toFixed(1)}</span>
                  </div>
                  <input type="range" min="0" max="1.5" step="0.05" value={brainTemps[id] ?? 0.7}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setBrainTemps(p => ({ ...p, [id]: v }));
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

        {/* Brand DNA link */}
        {(p?.brand?.name || campaign.brand) && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('nomad-open-brand-hub'))}
            className={`w-full px-4 py-2.5 border-b ${divider} flex items-center gap-2 transition-colors text-left ${
              isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-zinc-50'
            }`}
          >
            <span className={`text-[11px] font-medium flex-1 ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>Brand DNA</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={isDark ? 'rgba(255,255,255,0.15)' : '#d4d4d8'} strokeWidth="2.5" strokeLinecap="round">
              <path d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </button>
        )}


        {/* Pipeline stages */}
        {displayedCycle && (
          <div className={`px-3 py-3`}>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className={`text-[9px] uppercase font-semibold tracking-wider ${labelCls}`}>Pipeline</span>
              {cycles.length > 1 && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => {
                      const cur = viewingCycleIdx ?? cycles.length - 1;
                      if (cur > 0) onSelectCycleIdx(cur - 1);
                    }}
                    disabled={(viewingCycleIdx ?? cycles.length - 1) === 0}
                    className={`w-4 h-4 flex items-center justify-center rounded transition-colors disabled:opacity-20 ${isDark ? 'text-white/[0.30] hover:text-white/[0.55]' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >
                    <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <span className={`text-[9px] font-mono tabular-nums ${isDark ? 'text-white/[0.30]' : 'text-zinc-400'}`}>
                    {(viewingCycleIdx ?? cycles.length - 1) + 1}/{cycles.length}
                  </span>
                  <button
                    onClick={() => {
                      const cur = viewingCycleIdx ?? cycles.length - 1;
                      if (cur < cycles.length - 1) onSelectCycleIdx(cur + 1);
                      else onSelectCycleIdx(null); // snap back to live
                    }}
                    disabled={viewingCycleIdx === null}
                    className={`w-4 h-4 flex items-center justify-center rounded transition-colors disabled:opacity-20 ${isDark ? 'text-white/[0.30] hover:text-white/[0.55]' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >
                    <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                  {viewingCycleIdx !== null && (
                    <button
                      onClick={() => onSelectCycleIdx(null)}
                      title="Back to live"
                      className={`ml-0.5 text-[8px] font-medium px-1 py-0.5 rounded transition-colors ${isDark ? 'text-white/[0.30] hover:text-white/[0.55] bg-white/[0.04]' : 'text-zinc-400 hover:text-zinc-600 bg-zinc-100'}`}
                    >live</button>
                  )}
                </div>
              )}
            </div>
            <CycleTimeline
              cycle={displayedCycle}
              selectedStage={selectedStage}
              onSelectStage={onSelectStage}
              vertical
            />
          </div>
        )}
      </div>

    </div>
  );
}

// ── Vision model picker (used in LeftPanel Models section) ──
function VisionModelSelector({ selectCls, labelCls }: { selectCls: string; labelCls: string }) {
  const [vm, setVm] = useState(getVisionModel());
  return (
    <div>
      <span className={`text-[9px] block mb-0.5 ${labelCls}`}>Vision</span>
      <select
        value={vm}
        onChange={(e) => {
          setVm(e.target.value);
          localStorage.setItem('vision_model', e.target.value);
        }}
        className={selectCls}
      >
        {VISION_MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Ready Screen — campaign loaded, no cycles yet ──

function StartScreen({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto p-6 gap-6">
      <div className="text-center space-y-1">
        <p className={`text-[12px] font-mono ${isDarkMode ? 'text-white/[0.30]' : 'text-zinc-400'}`}>Ready</p>
        <p className={`text-[11px] ${isDarkMode ? 'text-white/[0.15]' : 'text-zinc-300'}`}>Select a preset to begin</p>
      </div>
      <div className="w-full max-w-xl">
        <WayfayerPlusPanel />
      </div>
    </div>
  );
}
