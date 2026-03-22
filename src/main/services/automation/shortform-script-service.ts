import { spawn } from "node:child_process";
import type {
  ShortformScriptDraft,
  ShortformScriptResult
} from "../../../common/types/automation";
import { SettingsRepository } from "../storage/settings-repository";

const SCRIPT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    titleOptions: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" }
    },
    hook: { type: "string" },
    narration: { type: "string" },
    callToAction: { type: "string" }
  },
  required: ["titleOptions", "hook", "narration", "callToAction"]
});

export class ShortformScriptService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async generateTrendSummary(input: {
    title: string;
    body?: string;
    sourceLabel?: string;
  }): Promise<string> {
    const settings = this.settingsRepository.get();
    const scriptProvider = settings.scriptProvider ?? "openrouter_api";
    const executablePath = settings.claudeExecutablePath?.trim();
    const openRouterApiKey = settings.openRouterApiKey?.trim();
    const openRouterModel = settings.openRouterModel?.trim() || "openai/gpt-4o-mini";
    const openAiApiKey = settings.openAiApiKey?.trim();
    const openAiModel = settings.openAiModel?.trim() || "gpt-5-mini";
    const fallbackSummary = input.body?.trim() || input.title;

    try {
      if (scriptProvider === "openrouter_api" && openRouterApiKey) {
        return await this.runOpenRouterSummary(openRouterApiKey, openRouterModel, input);
      }

      if (scriptProvider === "openai_api" && openAiApiKey) {
        return await this.runOpenAISummary(openAiApiKey, openAiModel, input);
      }

      if (scriptProvider !== "mock" && executablePath) {
        return await this.runClaudeSummary(executablePath, input);
      }
    } catch {
      return fallbackSummary;
    }

    return fallbackSummary;
  }

  async generateDraft(selection: string, revisionRequest?: string): Promise<ShortformScriptResult> {
    const settings = this.settingsRepository.get();
    const scriptProvider = settings.scriptProvider ?? "openrouter_api";
    const executablePath = settings.claudeExecutablePath?.trim();
    const openRouterApiKey = settings.openRouterApiKey?.trim();
    const openRouterModel = settings.openRouterModel?.trim() || "openai/gpt-4o-mini";
    const openAiApiKey = settings.openAiApiKey?.trim();
    const openAiModel = settings.openAiModel?.trim() || "gpt-5-mini";

    if (scriptProvider === "openrouter_api" && openRouterApiKey) {
      try {
        const draft = await this.runOpenRouter(
          openRouterApiKey,
          openRouterModel,
          selection,
          revisionRequest
        );
        return {
          source: "openrouter",
          draft
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.buildMockDraft(selection),
          error: error instanceof Error ? error.message : "Unknown OpenRouter generation error"
        };
      }
    }

    if (scriptProvider === "openai_api" && openAiApiKey) {
      try {
        const draft = await this.runOpenAI(
          openAiApiKey,
          openAiModel,
          selection,
          revisionRequest
        );
        return {
          source: "openai",
          draft
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.buildMockDraft(selection),
          error: error instanceof Error ? error.message : "Unknown OpenAI generation error"
        };
      }
    }

    if (scriptProvider === "mock") {
      return {
        source: "mock",
        draft: this.buildMockDraft(selection),
        error: "Script provider is set to mock."
      };
    }

    if (!executablePath) {
      return {
        source: "mock",
        draft: this.buildMockDraft(selection),
        error:
          scriptProvider === "claude_cli"
            ? "Claude executable path is not configured."
            : scriptProvider === "openai_api"
              ? "No OpenAI API key configured, and Claude executable path is not configured."
              : "No OpenRouter API key configured, and Claude executable path is not configured."
      };
    }

    const prompt = [
      "You are a Korean shortform content strategist.",
      "Generate a concise JSON response for a shortform script draft.",
      `Selected topic: ${selection}`,
      "Audience: Korean social media users.",
      "Style: curiosity-driven, viral, high-retention but not spammy.",
      "Return Korean output for all fields except keep brand names as-is.",
      revisionRequest ? `Revision request: ${revisionRequest}` : ""
    ].join("\n");

    try {
      const stdout = await this.runClaudePrint(executablePath, prompt);
      const parsed = JSON.parse(stdout.trim()) as ShortformScriptDraft;

      if (
        !parsed.titleOptions?.length ||
        !parsed.hook ||
        !parsed.narration ||
        !parsed.callToAction
      ) {
        throw new Error("Incomplete Claude draft payload");
      }

      return {
        source: "claude",
        draft: parsed
      };
    } catch (error) {
      return {
        source: "mock",
        draft: this.buildMockDraft(selection),
        error: error instanceof Error ? error.message : "Unknown Claude generation error"
      };
    }
  }

  private runClaudePrint(executablePath: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        executablePath,
        ["-p", prompt, "--output-format", "json", "--json-schema", SCRIPT_SCHEMA],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        }
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }

        const errorMessage = stderr.trim() || stdout.trim() || `Claude exited with code ${code}`;
        reject(new Error(errorMessage));
      });
    });
  }

  private async runClaudeSummary(
    executablePath: string,
    input: { title: string; body?: string; sourceLabel?: string }
  ): Promise<string> {
    const prompt = [
      "You are a Korean shortform trend editor.",
      "Summarize the following candidate in one concise Korean sentence for an operator shortlist.",
      "Focus on what happened, not on why it is viral.",
      "Do not mention that it came from Reddit or a community unless it matters.",
      `Title: ${input.title}`,
      `Body: ${input.body ?? ""}`,
      `Source: ${input.sourceLabel ?? ""}`
    ].join("\n");

    const stdout = await this.runClaudePrint(executablePath, prompt);
    return stdout.trim().replace(/^["']|["']$/g, "");
  }

  private async runOpenRouter(
    apiKey: string,
    model: string,
    selection: string,
    revisionRequest?: string
  ): Promise<ShortformScriptDraft> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Aaron-Kim33/mellowcat-claude-v2",
        "X-Title": "MellowCat Claude"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a Korean shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction."
          },
          {
            role: "user",
            content: [
              `Selected topic: ${selection}`,
              "Audience: Korean social media users.",
              "Style: curiosity-driven, viral, high-retention but not spammy.",
              "Return Korean output for all fields except keep brand names as-is.",
              revisionRequest ? `Revision request: ${revisionRequest}` : "",
              'titleOptions must be an array with 2 or 3 strings.'
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      error?: {
        message?: string;
      };
    };

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenRouter returned empty content");
    }

    const parsed = JSON.parse(content) as ShortformScriptDraft;
    if (
      !parsed.titleOptions?.length ||
      !parsed.hook ||
      !parsed.narration ||
      !parsed.callToAction
    ) {
      throw new Error("OpenRouter returned incomplete draft payload");
    }

    return parsed;
  }

  private async runOpenRouterSummary(
    apiKey: string,
    model: string,
    input: { title: string; body?: string; sourceLabel?: string }
  ): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Aaron-Kim33/mellowcat-claude-v2",
        "X-Title": "MellowCat Claude"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a Korean shortform trend editor. Return one concise Korean sentence explaining what the content is about for an operator shortlist. Focus on what happened, not why it is viral."
          },
          {
            role: "user",
            content: [
              `Title: ${input.title}`,
              `Body: ${input.body ?? ""}`,
              `Source: ${input.sourceLabel ?? ""}`
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      error?: {
        message?: string;
      };
    };

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenRouter returned empty summary");
    }

    return content.replace(/^["']|["']$/g, "");
  }

  private async runOpenAI(
    apiKey: string,
    model: string,
    selection: string,
    revisionRequest?: string
  ): Promise<ShortformScriptDraft> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a Korean shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction."
          },
          {
            role: "user",
            content: [
              `Selected topic: ${selection}`,
              "Audience: Korean social media users.",
              "Style: curiosity-driven, viral, high-retention but not spammy.",
              "Return Korean output for all fields except keep brand names as-is.",
              revisionRequest ? `Revision request: ${revisionRequest}` : "",
              'titleOptions must be an array with 2 or 3 strings.'
            ].join("\n")
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "shortform_script",
            schema: JSON.parse(SCRIPT_SCHEMA),
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errorText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      error?: {
        message?: string;
      };
    };

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const content = payload.output_text?.trim();
    if (!content) {
      throw new Error("OpenAI returned empty content");
    }

    const parsed = JSON.parse(content) as ShortformScriptDraft;
    if (
      !parsed.titleOptions?.length ||
      !parsed.hook ||
      !parsed.narration ||
      !parsed.callToAction
    ) {
      throw new Error("OpenAI returned incomplete draft payload");
    }

    return parsed;
  }

  private async runOpenAISummary(
    apiKey: string,
    model: string,
    input: { title: string; body?: string; sourceLabel?: string }
  ): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a Korean shortform trend editor. Return one concise Korean sentence explaining what the content is about for an operator shortlist. Focus on what happened, not why it is viral."
          },
          {
            role: "user",
            content: [
              `Title: ${input.title}`,
              `Body: ${input.body ?? ""}`,
              `Source: ${input.sourceLabel ?? ""}`
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errorText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      error?: {
        message?: string;
      };
    };

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const content = payload.output_text?.trim();
    if (!content) {
      throw new Error("OpenAI returned empty summary");
    }

    return content.replace(/^["']|["']$/g, "");
  }

  private buildMockDraft(selection: string): ShortformScriptDraft {
    return {
      titleOptions: [
        `${selection} Korean reinterpretation`,
        `${selection} why everyone suddenly cares`
      ],
      hook:
        "People thought this was minor, but Korean viewers latch onto a completely different tension point.",
      narration:
        "Open with the surprise, reinterpret it for Korean viewers immediately, then end on a curiosity gap that makes the next clip feel necessary.",
      callToAction: "Would this work on you, or is the internet overreacting again?"
    };
  }
}
