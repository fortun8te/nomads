// Model configuration for different stages
// Maps each stage to the optimal model from local Ollama
//
// Model roster:
//   glm-4.7-flash:q4_K_M  (19GB, 30B) — strategist: orchestration, reflection, analysis
//   qwen3.5:9b             (6.6GB, 9B) — creative: synthesis, ad generation, evaluation
//   lfm2.5-thinking:latest         (730MB, 1.2B) — grunt work: page compression, memory archiving
//
// Research pipeline model assignments (hardcoded in researchAgents.ts):
//   Page compression:     lfm2.5-thinking:latest  (fast, good enough for fact extraction)
//   Research synthesis:   qwen3.5:9b       (needs strategic thinking for insights)
//   Orchestrator:         glm-4.7-flash    (decides what to research next)
//   Reflection agent:     glm-4.7-flash    (finds blind spots, pushes for AHA moments)

export const MODEL_CONFIG = {
  // Research Phase 1 (desire analysis) — needs deep strategic thinking
  research: 'glm-4.7-flash:q4_K_M',

  // Objection handling — strategic copy angles
  objections: 'glm-4.7-flash:q4_K_M',

  // Creative direction — competitive positioning
  taste: 'glm-4.7-flash:q4_K_M',

  // Ad generation — creative writing + concepts (GLM for better brand understanding)
  make: 'glm-4.7-flash:q4_K_M',

  // Evaluation — analytical reasoning
  test: 'qwen3.5:9b',

  // Memory archiving — lightweight consolidation
  memories: 'lfm2.5-thinking:latest',

  // Visual intelligence — competitor screenshots + creative evaluation
  vision: 'minicpm-v:8b',

  // Default fallback
  default: 'glm-4.7-flash:q4_K_M',
} as const;

export function getModelForStage(stageName: string): string {
  return MODEL_CONFIG[stageName as keyof typeof MODEL_CONFIG] || MODEL_CONFIG.default;
}
