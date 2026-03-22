export type ScriptProviderId = "claude_cli" | "openai_api" | "mock";

export interface ScriptProviderStatus {
  provider: ScriptProviderId;
  configured: boolean;
  available: boolean;
  message?: string;
}
