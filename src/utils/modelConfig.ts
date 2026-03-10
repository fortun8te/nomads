// Model configuration for different stages
// Maps each stage to the optimal model from local Ollama
//
// Model roster:
//   qwen3.5:9b             (6.6GB, 9B) — default for all stages
//   qwen3.5:0.8b           (530MB, 0.8B) — fast option for HTML gen
//   lfm2.5-thinking:latest (730MB, 1.2B) — grunt work: page compression, memory archiving
//
// Research pipeline model assignments (hardcoded in researchAgents.ts):
//   Page compression:     lfm2.5-thinking:latest
//   Research synthesis:   qwen3.5:9b
//   Orchestrator:         qwen3.5:9b
//   Reflection agent:     qwen3.5:9b

export const MODEL_CONFIG = {
  // Research Phase 1 (desire analysis) — needs deep strategic thinking
  research: 'qwen3.5:9b',

  // Objection handling — strategic copy angles
  objections: 'qwen3.5:9b',

  // Creative direction — competitive positioning
  taste: 'qwen3.5:9b',

  // Ad generation — creative writing + HTML generation
  make: 'qwen3.5:9b',

  // Evaluation — analytical reasoning
  test: 'qwen3.5:9b',

  // Memory archiving — lightweight consolidation
  memories: 'lfm2.5-thinking:latest',

  // Visual intelligence — competitor screenshots + creative evaluation
  vision: 'minicpm-v:8b',

  // Default fallback
  default: 'qwen3.5:9b',
} as const;

export function getModelForStage(stageName: string): string {
  return MODEL_CONFIG[stageName as keyof typeof MODEL_CONFIG] || MODEL_CONFIG.default;
}
