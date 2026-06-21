// OpenRouter-routed model presets. These names are what get passed straight
// through to OpenRouter's /v1/chat/completions. The provider is fixed to
// "OpenRouter" so the backend uses the OpenRouter base URL with the user's key.
export interface ModelPreset {
  id: string;
  label: string;
  hint: string;
}

export const OPENROUTER_MODELS: ModelPreset[] = [
  { id: "openrouter/owl-alpha", label: "owl-alpha", hint: "default" },
  { id: "openai/gpt-4o-mini", label: "gpt-4o-mini", hint: "fast / cheap" },
  { id: "openai/gpt-4o", label: "gpt-4o", hint: "balanced" },
  { id: "anthropic/claude-3.5-sonnet", label: "claude-3.5-sonnet", hint: "reasoning" },
  { id: "anthropic/claude-3.5-haiku", label: "claude-3.5-haiku", hint: "fast claude" },
  { id: "deepseek/deepseek-chat", label: "deepseek-chat", hint: "low cost" },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "llama-3.1-70b", hint: "open weights" },
  { id: "google/gemini-flash-1.5", label: "gemini-flash-1.5", hint: "fast google" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "qwen-2.5-72b", hint: "alt" },
];

export const DEFAULT_MODEL = "openrouter/owl-alpha";
export const PROVIDER = "OpenRouter";

/** Provider string the backend expects for local Ollama models. */
export const OLLAMA_PROVIDER = "Ollama";

/** Build a model preset for a locally-installed Ollama model. */
export function ollamaPreset(modelName: string): ModelPreset {
  return { id: modelName, label: modelName, hint: "local" };
}

/**
 * Resolve the backend provider for a selected model id. Ollama model names are
 * passed straight through (they are never part of the OpenRouter preset list),
 * everything else is routed via OpenRouter.
 */
export function providerForModel(modelId: string, ollamaModels: string[]): string {
  return ollamaModels.includes(modelId) ? OLLAMA_PROVIDER : PROVIDER;
}
