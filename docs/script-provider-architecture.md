# Script Provider Architecture

## Why This Exists

The shortform assistant product should not depend on a single model runtime.

Right now, script generation can use Claude CLI. That is useful, but it creates a business risk:

- credits may run out
- a user may not use Claude
- some users may prefer OpenAI or another API provider

So the product should separate:

- messenger workflow control
- script generation provider

## Design Goal

Keep Telegram flow stable while allowing the generation engine to swap between providers.

## Recommended Providers

### 1. `claude_cli`

Use local Claude Code CLI in non-interactive print mode.

Good for:

- users already inside the Claude ecosystem
- local workflows
- fast prototyping

Weakness:

- tied to Claude billing and auth state

### 2. `openai_api`

Use an API key and a structured JSON call for shortform draft generation.

Good for:

- predictable server-side style generation
- easier entitlement by product plan later
- no dependency on local Claude subscription

Weakness:

- requires separate API billing

### 3. `mock`

Use deterministic local fallback output.

Good for:

- testing
- onboarding
- demos

Weakness:

- not real generation

## Service Boundary

`telegram-control-mcp` should not know how a provider works internally.

It should only ask for:

- a shortform draft
- the provider source
- any failure message

## Suggested Interface

```ts
type ScriptProviderId = "claude_cli" | "openai_api" | "mock";

interface ShortformScriptDraft {
  titleOptions: string[];
  hook: string;
  narration: string;
  callToAction: string;
}

interface ShortformScriptResult {
  source: "claude" | "mock";
  draft: ShortformScriptDraft;
  error?: string;
}

interface ScriptGenerationProvider {
  id: ScriptProviderId;
  getStatus(): Promise<{
    configured: boolean;
    available: boolean;
    message?: string;
  }>;
  generateDraft(selection: string): Promise<ShortformScriptResult>;
}
```

## Recommended Runtime Composition

Shortform script service becomes an orchestrator:

1. choose provider from settings
2. try selected provider
3. if it fails, either:
   - fallback to mock
   - or fallback to a secondary provider

## Settings Direction

Future settings should include:

- `scriptProvider`
- `openaiApiKey`
- `openaiModel`
- `claudeExecutablePath`

Example:

```json
{
  "scriptProvider": "openai_api",
  "openaiModel": "gpt-5.4-mini",
  "claudeExecutablePath": "C:\\Users\\User\\.local\\bin\\claude.exe"
}
```

## Product Implication

This makes the product stronger than a Claude-only launcher.

The launcher can remain Claude-first, but the sellable shortform assistant becomes provider-flexible.

That is better for:

- customer onboarding
- billing resilience
- future hosted execution

## Recommended Next Step

1. add `scriptProvider` to app settings
2. refactor `ShortformScriptService` into provider-backed architecture
3. implement `mock` provider
4. move current Claude CLI logic into `claude-cli-provider`
5. then add `openai-api-provider`
