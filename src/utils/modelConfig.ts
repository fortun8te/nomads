// Model configuration for different stages
// Maps each stage to the optimal model from local Ollama
//
// Available models:
//   glm-4.7-flash:q4_K_M  (19GB, 30B params) — best quality, slow
//   gpt-oss:20b            (13GB, 20B params) — good quality, medium
//   lfm-2.5:q4_K_M         (730MB, 1.2B params) — fast, lightweight
//   mistral:latest          (4.4GB) — general purpose

export const MODEL_CONFIG = {
  // Research uses orchestrated system (glm orchestrator + lfm researchers)
  // This is only used as fallback
  research: 'glm-4.7-flash:q4_K_M',

  // Objection handling — needs strategic thinking
  objections: 'glm-4.7-flash:q4_K_M',

  // Creative direction — balanced quality/speed
  taste: 'glm-4.7-flash:q4_K_M',

  // Asset generation — needs creative writing
  make: 'gpt-oss:20b',

  // Testing/evaluation — needs analytical reasoning
  test: 'gpt-oss:20b',

  // Memory consolidation — can be lighter weight
  memories: 'lfm-2.5:q4_K_M',

  // Default fallback
  default: 'glm-4.7-flash:q4_K_M',
} as const;

export function getModelForStage(stageName: string): string {
  return MODEL_CONFIG[stageName as keyof typeof MODEL_CONFIG] || MODEL_CONFIG.default;
}
