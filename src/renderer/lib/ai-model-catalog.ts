import type { WorkflowAiProvider } from "@common/types/automation";

export interface AiModelOption {
  value: string;
  label: string;
}

const OPENAI_MODELS: AiModelOption[] = [
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 nano" }
];

const OPENROUTER_MODELS: AiModelOption[] = [
  { value: "openai/gpt-5.4", label: "OpenAI · GPT-5.4" },
  { value: "openai/gpt-5.4-mini", label: "OpenAI · GPT-5.4 mini" },
  { value: "openai/gpt-5.4-nano", label: "OpenAI · GPT-5.4 nano" },
  { value: "google/gemini-3.1-pro", label: "Google · Gemini 3.1 Pro" },
  { value: "google/gemini-3.1-flash-lite", label: "Google · Gemini 3.1 Flash-Lite" },
  { value: "google/gemini-3.1-flash-live", label: "Google · Gemini 3.1 Flash Live" },
  { value: "anthropic/claude-opus-4.6", label: "Anthropic · Claude Opus 4.6" },
  { value: "anthropic/claude-sonnet-4.6", label: "Anthropic · Claude Sonnet 4.6" },
  { value: "anthropic/claude-haiku-4.5", label: "Anthropic · Claude Haiku 4.5" }
];

const CLAUDE_MODELS: AiModelOption[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
];

const MOCK_MODELS: AiModelOption[] = [{ value: "mock", label: "Mock" }];

export function getAiModelOptions(provider: WorkflowAiProvider): AiModelOption[] {
  if (provider === "openai_api") {
    return OPENAI_MODELS;
  }

  if (provider === "claude_cli") {
    return CLAUDE_MODELS;
  }

  if (provider === "mock") {
    return MOCK_MODELS;
  }

  return OPENROUTER_MODELS;
}

export function getAiModelLabel(provider: WorkflowAiProvider, model?: string): string | undefined {
  if (!model) {
    return undefined;
  }

  const matched = getAiModelOptions(provider).find((option) => option.value === model);
  return matched?.label ?? model;
}

export function getDefaultAiModel(provider: WorkflowAiProvider): string {
  return getAiModelOptions(provider)[0]?.value ?? "mock";
}
