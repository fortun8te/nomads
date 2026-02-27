// Model configuration for different stages
// Maps each stage to the optimal model from remote Ollama

export const MODEL_CONFIG = {
  // Fast, lightweight model for quick execution
  research: 'lfm2.5-thinking:latest',

  // Creative direction - balanced quality/speed
  taste: 'glm-4.7-flash:q4_K_M',

  // Asset generation - uses GPT model for quality
  make: 'gpt-oss:20b',

  // Testing/evaluation - needs deep reasoning
  test: 'gpt-oss:20b',

  // Memory consolidation - deep learning
  memories: 'lfm2.5-thinking:latest',

  // Default fallback
  default: 'lfm2.5-thinking:latest',
} as const;

export function getModelForStage(stageName: string): string {
  return MODEL_CONFIG[stageName as keyof typeof MODEL_CONFIG] || MODEL_CONFIG.default;
}
