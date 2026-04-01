import { spawn } from "node:child_process";
import type {
  WorkflowAiConnectionRef,
  ShortformScriptDraft,
  ShortformScriptResult
} from "../../../common/types/automation";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
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
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly workflowConfigService: ShortformWorkflowConfigService
  ) {}

  async generateTrendSummary(input: {
    title: string;
    body?: string;
    sourceLabel?: string;
  }): Promise<string> {
    const settings = this.settingsRepository.get();
    const workflowConfig = this.workflowConfigService.get();
    const inputConnection = this.resolveAiConnection(
      settings,
      workflowConfig.inputAiConnection ?? "connection_1"
    );
    const scriptProvider =
      workflowConfig.inputAiProvider ??
      inputConnection.provider ??
      workflowConfig.scriptProvider ??
      "openrouter_api";
    const executablePath = settings.claudeExecutablePath?.trim();
    const openRouterApiKey =
      inputConnection.openRouterApiKey?.trim() || workflowConfig.openRouterApiKey?.trim();
    const openRouterModel =
      this.normalizeModelForProvider(
        "openrouter_api",
        workflowConfig.inputAiModel?.trim(),
        inputConnection.openRouterModel?.trim() ||
          workflowConfig.openRouterModel?.trim() ||
          "openai/gpt-5.4-mini"
      );
    const openAiApiKey =
      inputConnection.openAiApiKey?.trim() || workflowConfig.openAiApiKey?.trim();
    const openAiModel =
      this.normalizeModelForProvider(
        "openai_api",
        workflowConfig.inputAiModel?.trim(),
        inputConnection.openAiModel?.trim() ||
          workflowConfig.openAiModel?.trim() ||
          "gpt-5.4-mini"
      );
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
    const workflowConfig = this.workflowConfigService.get();
    const desiredLanguage = this.resolveDraftLanguage(settings, workflowConfig);
    const processAiGenerationEnabled = workflowConfig.processAiGenerationEnabled !== false;
    const processConnection = this.resolveAiConnection(
      settings,
      workflowConfig.processAiConnection ?? "connection_1"
    );
    const scriptProvider =
      workflowConfig.processAiProvider ??
      processConnection.provider ??
      workflowConfig.scriptProvider ??
      "openrouter_api";
    const executablePath = settings.claudeExecutablePath?.trim();
    const openRouterApiKey =
      processConnection.openRouterApiKey?.trim() || workflowConfig.openRouterApiKey?.trim();
    const openRouterModel =
      this.normalizeModelForProvider(
        "openrouter_api",
        workflowConfig.processAiModel?.trim(),
        processConnection.openRouterModel?.trim() ||
          workflowConfig.openRouterModel?.trim() ||
          "openai/gpt-5.4-mini"
      );
    const openAiApiKey =
      processConnection.openAiApiKey?.trim() || workflowConfig.openAiApiKey?.trim();
    const openAiModel =
      this.normalizeModelForProvider(
        "openai_api",
        workflowConfig.processAiModel?.trim(),
        processConnection.openAiModel?.trim() ||
          workflowConfig.openAiModel?.trim() ||
          "gpt-5.4-mini"
      );

    if (!processAiGenerationEnabled) {
      return {
        source: "mock",
        draft: this.buildLocalizedTemplateDraft(selection, revisionRequest, desiredLanguage),
        error: "AI draft generation is disabled for the process slot."
      };
    }

    if (scriptProvider === "openrouter_api" && openRouterApiKey) {
      try {
        const draft = await this.runOpenRouter(
          openRouterApiKey,
          openRouterModel,
          selection,
          revisionRequest,
          desiredLanguage
        );
        return {
          source: "openrouter",
          draft
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.buildLocalizedMockDraft(selection, desiredLanguage),
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
          revisionRequest,
          desiredLanguage
        );
        return {
          source: "openai",
          draft
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.buildLocalizedMockDraft(selection, desiredLanguage),
          error: error instanceof Error ? error.message : "Unknown OpenAI generation error"
        };
      }
    }

    if (scriptProvider === "mock") {
      return {
        source: "mock",
        draft: this.buildLocalizedMockDraft(selection, desiredLanguage),
        error: "Script provider is set to mock."
      };
    }

    if (!executablePath) {
      return {
        source: "mock",
        draft: this.buildLocalizedMockDraft(selection, desiredLanguage),
        error:
          scriptProvider === "claude_cli"
            ? "Claude executable path is not configured."
            : scriptProvider === "openai_api"
              ? "No OpenAI API key configured, and Claude executable path is not configured."
              : "No OpenRouter API key configured, and Claude executable path is not configured."
      };
    }

    const prompt = [
      desiredLanguage === "ko"
        ? "You are a Korean shortform content strategist."
        : "You are an English shortform content strategist.",
      "Generate a concise JSON response for a shortform script draft.",
      `Selected topic: ${selection}`,
      desiredLanguage === "ko"
        ? "Audience: Korean social media users."
        : "Audience: English-speaking social media users.",
      "Style: curiosity-driven, viral, high-retention but not spammy.",
      desiredLanguage === "ko"
        ? "Return natural Korean output for all fields. Do not use English phrases or English CTA sentences unless a brand name must remain in English."
        : "Return natural English output for all fields.",
      revisionRequest ? `Revision request: ${revisionRequest}` : ""
    ].join("\n");

    try {
      const stdout = await this.runClaudePrint(executablePath, prompt);
      const parsed = this.parseAndValidateDraft(stdout.trim(), desiredLanguage, "Claude");

      return {
        source: "claude",
        draft: parsed
      };
    } catch (error) {
      return {
        source: "mock",
        draft: this.buildLocalizedMockDraft(selection, desiredLanguage),
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

  private resolveAiConnection(
    settings: ReturnType<SettingsRepository["get"]>,
    connectionRef: WorkflowAiConnectionRef
  ) {
    if (connectionRef === "connection_2") {
      return {
        provider: settings.secondaryScriptProvider,
        openRouterApiKey: settings.secondaryOpenRouterApiKey,
        openRouterModel: settings.secondaryOpenRouterModel,
        openAiApiKey: settings.secondaryOpenAiApiKey,
        openAiModel: settings.secondaryOpenAiModel
      };
    }

    return {
      provider: settings.scriptProvider,
      openRouterApiKey: settings.openRouterApiKey,
      openRouterModel: settings.openRouterModel,
      openAiApiKey: settings.openAiApiKey,
      openAiModel: settings.openAiModel
    };
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
    revisionRequest?: string,
    desiredLanguage: "ko" | "en" = "ko"
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
              desiredLanguage === "ko"
                ? "You are a Korean shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction. All values must be written in natural Korean. Do not mix in English slogans, English hooks, or English CTA lines."
                : "You are an English shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction."
          },
          {
            role: "user",
            content: [
              `Selected topic: ${selection}`,
              desiredLanguage === "ko"
                ? "Audience: Korean social media users."
                : "Audience: English-speaking social media users.",
              "Style: curiosity-driven, viral, high-retention but not spammy.",
              desiredLanguage === "ko"
                ? "Return natural Korean output for all fields. Do not use English phrases or English CTA sentences unless a brand name must remain in English."
                : "Return natural English output for all fields.",
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

    return this.parseAndValidateDraft(content, desiredLanguage, "OpenRouter");
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
    revisionRequest?: string,
    desiredLanguage: "ko" | "en" = "ko"
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
              desiredLanguage === "ko"
                ? "You are a Korean shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction. All values must be written in natural Korean. Do not mix in English slogans, English hooks, or English CTA lines."
                : "You are an English shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction."
          },
          {
            role: "user",
            content: [
              `Selected topic: ${selection}`,
              desiredLanguage === "ko"
                ? "Audience: Korean social media users."
                : "Audience: English-speaking social media users.",
              "Style: curiosity-driven, viral, high-retention but not spammy.",
              desiredLanguage === "ko"
                ? "Return natural Korean output for all fields. Do not use English phrases or English CTA sentences unless a brand name must remain in English."
                : "Return natural English output for all fields.",
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

    return this.parseAndValidateDraft(content, desiredLanguage, "OpenAI");
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

  private buildLocalizedMockDraft(selection: string, language: "ko" | "en"): ShortformScriptDraft {
    if (language === "en") {
      return this.buildMockDraft(selection);
    }

    return {
      titleOptions: [
        `${selection} 한눈에 정리`,
        `${selection} 사람들이 몰린 진짜 이유`
      ],
      hook: "처음엔 별일 아닌 것처럼 보여도, 사람들이 꽂히는 포인트는 전혀 다를 수 있습니다.",
      narration:
        "핵심 사건을 먼저 짧게 던지고, 사람들이 왜 이 장면에 반응하는지 바로 이어서 설명한 뒤, 다음 이야기가 궁금해지도록 마무리합니다.",
      callToAction: "여러분은 이 상황을 어떻게 보셨는지 댓글로 남겨주세요."
    };
  }

  private buildLocalizedTemplateDraft(
    selection: string,
    revisionRequest: string | undefined,
    language: "ko" | "en"
  ): ShortformScriptDraft {
    if (language === "en") {
      return this.buildTemplateDraft(selection, revisionRequest);
    }

    const revisionLine = revisionRequest?.trim()
      ? `수정 방향: ${revisionRequest.trim()}`
      : "수정 방향: 핵심 사건과 감정선을 짧게 압축합니다.";

    return {
      titleOptions: [
        `${selection} 한눈에 요약`,
        `${selection} 반응 폭발 포인트`,
        `${selection} 왜 다들 이 얘길 하는가`
      ],
      hook: `${selection}에서 사람들이 바로 반응한 포인트만 짧게 짚어드립니다.`,
      narration: [
        `${selection}의 핵심 사건을 한 문장으로 먼저 정리합니다.`,
        "이후 갈등이나 반전 포인트를 짧고 명확하게 이어 붙입니다.",
        revisionLine
      ].join(" "),
      callToAction: "여기서 여러분이라면 어떻게 반응했을지 댓글로 남겨주세요."
    };
  }

  private resolveDraftLanguage(
    settings: ReturnType<SettingsRepository["get"]>,
    workflowConfig: ReturnType<ShortformWorkflowConfigService["get"]>
  ): "ko" | "en" {
    if (settings.launcherLanguage === "ko") {
      return "ko";
    }

    return workflowConfig.telegramOutputLanguage === "en" ? "en" : "ko";
  }

  private parseAndValidateDraft(
    rawContent: string,
    desiredLanguage: "ko" | "en",
    providerName: string
  ): ShortformScriptDraft {
    const parsed = JSON.parse(this.extractJsonObject(rawContent)) as ShortformScriptDraft;

    if (
      !parsed.titleOptions?.length ||
      !parsed.hook ||
      !parsed.narration ||
      !parsed.callToAction
    ) {
      throw new Error(`${providerName} returned incomplete draft payload`);
    }

    if (desiredLanguage === "ko" && !this.isKoreanDraft(parsed)) {
      throw new Error(`${providerName} returned a non-Korean draft while Korean output was required`);
    }

    return parsed;
  }

  private isKoreanDraft(draft: ShortformScriptDraft): boolean {
    const combined = [
      ...draft.titleOptions,
      draft.hook,
      draft.narration,
      draft.callToAction
    ].join(" ");

    const hangulMatches = combined.match(/[가-힣]/g) ?? [];
    return hangulMatches.length >= 8;
  }

  private extractJsonObject(rawContent: string): string {
    const trimmed = rawContent.trim();

    if (trimmed.startsWith("```")) {
      const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return fenced.trim();
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  }

  private normalizeModelForProvider(
    provider: "openrouter_api" | "openai_api",
    requestedModel: string | undefined,
    fallbackModel: string
  ): string {
    const validModels =
      provider === "openrouter_api"
        ? new Set([
            "openai/gpt-5.4",
            "openai/gpt-5.4-mini",
            "openai/gpt-5.4-nano",
            "google/gemini-3.1-pro",
            "google/gemini-3.1-flash-lite",
            "google/gemini-3.1-flash-live",
            "anthropic/claude-opus-4.6",
            "anthropic/claude-sonnet-4.6",
            "anthropic/claude-haiku-4.5"
          ])
        : new Set(["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]);

    if (requestedModel && validModels.has(requestedModel)) {
      return requestedModel;
    }

    return fallbackModel;
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

  private buildTemplateDraft(selection: string, revisionRequest?: string): ShortformScriptDraft {
    const revisionLine = revisionRequest?.trim()
      ? `수정 방향: ${revisionRequest.trim()}`
      : "수정 방향: 핵심 사건과 감정선을 짧게 압축합니다.";

    return {
      titleOptions: [
        `${selection} 한눈에 요약`,
        `${selection} 반응 폭발 포인트`,
        `${selection} 왜 다들 이 얘길 하는가`
      ],
      hook: `${selection}에서 사람들이 바로 반응한 포인트만 짧게 짚어드립니다.`,
      narration: [
        `${selection}의 핵심 사건을 한 문장으로 먼저 정리합니다.`,
        "이후 갈등이나 반전 포인트를 짧고 명확하게 이어 붙입니다.",
        revisionLine
      ].join(" "),
      callToAction: "여기서 여러분이라면 어떻게 반응했을지 댓글로 남겨주세요."
    };
  }
}
