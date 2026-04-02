import { spawn } from "node:child_process";
import type {
  WorkflowAiConnectionRef,
  ShortformScriptCategory,
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

  async generateDraft(
    selection: string,
    revisionRequest?: string,
    scriptCategory: ShortformScriptCategory = "community"
  ): Promise<ShortformScriptResult> {
    const settings = this.settingsRepository.get();
    const workflowConfig = this.workflowConfigService.get();
    const desiredLanguage = this.resolveDraftLanguage(settings, workflowConfig);
    const backgroundSubtitleMode =
      workflowConfig.createModuleId === "background-subtitle-composer-mcp";
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
        draft: this.buildLocalizedTemplateDraft(
          selection,
          revisionRequest,
          desiredLanguage,
          backgroundSubtitleMode
        ),
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
          desiredLanguage,
          backgroundSubtitleMode,
          scriptCategory
        );
        return {
          source: "openrouter",
          draft
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.buildLocalizedMockDraft(selection, desiredLanguage, backgroundSubtitleMode),
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
          desiredLanguage,
          backgroundSubtitleMode,
          scriptCategory
        );
        return {
          source: "openai",
          draft
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.buildLocalizedMockDraft(selection, desiredLanguage, backgroundSubtitleMode),
          error: error instanceof Error ? error.message : "Unknown OpenAI generation error"
        };
      }
    }

    if (scriptProvider === "mock") {
      return {
        source: "mock",
        draft: this.buildLocalizedMockDraft(selection, desiredLanguage, backgroundSubtitleMode),
        error: "Script provider is set to mock."
      };
    }

    if (!executablePath) {
      return {
        source: "mock",
        draft: this.buildLocalizedMockDraft(selection, desiredLanguage, backgroundSubtitleMode),
        error:
          scriptProvider === "claude_cli"
            ? "Claude executable path is not configured."
            : scriptProvider === "openai_api"
              ? "No OpenAI API key configured, and Claude executable path is not configured."
              : "No OpenRouter API key configured, and Claude executable path is not configured."
      };
    }

    const prompt = this.buildClaudeDraftPrompt(
      selection,
      revisionRequest,
      desiredLanguage,
      backgroundSubtitleMode
      ,
      scriptCategory
    );

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
        draft: this.buildLocalizedMockDraft(selection, desiredLanguage, backgroundSubtitleMode),
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
    desiredLanguage: "ko" | "en" = "ko",
    backgroundSubtitleMode = false,
    scriptCategory: ShortformScriptCategory = "community"
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
            content: this.buildDraftSystemPrompt(desiredLanguage, backgroundSubtitleMode, scriptCategory)
          },
          {
            role: "user",
            content: this.buildDraftUserPrompt(
              selection,
              revisionRequest,
              desiredLanguage,
              backgroundSubtitleMode,
              scriptCategory
            )
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
    desiredLanguage: "ko" | "en" = "ko",
    backgroundSubtitleMode = false,
    scriptCategory: ShortformScriptCategory = "community"
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
            content: this.buildDraftSystemPrompt(desiredLanguage, backgroundSubtitleMode, scriptCategory)
          },
          {
            role: "user",
            content: this.buildDraftUserPrompt(
              selection,
              revisionRequest,
              desiredLanguage,
              backgroundSubtitleMode,
              scriptCategory
            )
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

  private buildLocalizedMockDraft(
    selection: string,
    language: "ko" | "en",
    backgroundSubtitleMode = false
  ): ShortformScriptDraft {
    if (language === "en") {
      return this.buildMockDraft(selection);
    }

    if (backgroundSubtitleMode) {
      return {
        titleOptions: [
          `${selection} 결국 이렇게 흘러갔습니다`,
          `${selection} 사람들이 끝까지 보게 되는 이유`
        ],
        hook: "이 이야기는 시작보다, 중간에 밝혀지는 감정선 때문에 더 오래 남습니다.",
        narration:
          "처음 상황을 짧게 던진 뒤, 화자가 왜 그때 그렇게 버텼는지 감정선을 따라가듯 풀어주고, 마지막에는 아직 정리되지 않은 여운이 남게 마무리합니다.",
        callToAction: "여기서 여러분이라면 어떤 선택을 했을지 댓글로 남겨주세요."
      };
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
    language: "ko" | "en",
    backgroundSubtitleMode = false
  ): ShortformScriptDraft {
    if (language === "en") {
      return this.buildTemplateDraft(selection, revisionRequest);
    }

    if (backgroundSubtitleMode) {
      const revisionLine = revisionRequest?.trim()
        ? `수정 방향: ${revisionRequest.trim()}`
        : "수정 방향: 감정선이 보이게 짧은 문장 위주로 다시 정리합니다.";

      return {
        titleOptions: [
          `${selection} 이 장면에서 다들 멈췄다`,
          `${selection} 끝까지 듣게 되는 사연`
        ],
        hook: `${selection}의 시작보다, 그 뒤에 이어지는 감정이 더 크게 남는 이야기입니다.`,
        narration: [
          "첫 문장은 바로 상황을 던지고,",
          "이후 문장들은 한 줄씩 읽혀도 이해되게 짧게 이어갑니다.",
          "설명보다 감정 변화와 여운이 남는 장면을 우선합니다.",
          revisionLine
        ].join(" "),
        callToAction: "이 이야기에서 가장 이해됐던 감정이 무엇이었는지 댓글로 남겨주세요."
      };
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

  private buildClaudeDraftPrompt(
    selection: string,
    revisionRequest: string | undefined,
    desiredLanguage: "ko" | "en",
    backgroundSubtitleMode: boolean,
    scriptCategory: ShortformScriptCategory
  ): string {
    return [
      this.buildDraftSystemPrompt(desiredLanguage, backgroundSubtitleMode, scriptCategory),
      this.buildDraftUserPrompt(selection, revisionRequest, desiredLanguage, backgroundSubtitleMode, scriptCategory)
    ].join("\n");
  }

  private buildDraftSystemPrompt(
    desiredLanguage: "ko" | "en",
    backgroundSubtitleMode: boolean,
    scriptCategory: ShortformScriptCategory
  ): string {
    if (desiredLanguage === "ko" && backgroundSubtitleMode) {
      return [
        "You are a Korean shortform writer specialized in story-driven background subtitle videos.",
        "Return strict JSON only with keys: titleOptions, hook, narration, callToAction.",
        "All values must be written in natural Korean.",
        "The narration must read well as Korean subtitles and Korean TTS.",
        "The titleOptions quality matters as much as the narration quality.",
        "Do not copy the source title verbatim.",
        "Each title must feel like a Korean shortform title, not a summary heading.",
        "This is not a summary task. It is an adaptation task for a high-retention Korean shortform script.",
        "You may reorganize the order of events, compress details, and rewrite sentences so the story lands harder in shortform.",
        "Prefer short spoken sentences with strong emotional continuity and clear escalation.",
        "Write like a real person is telling a gripping story out loud, not like an article is being summarized.",
        "The first line must create immediate tension or curiosity.",
        "Every later line must either deepen emotion, add a strange detail, or sharpen the conflict.",
        "Avoid vague filler, generic commentary, abstract recap language, and distant explanation.",
        "Do not use English phrases or English CTA lines unless a proper noun must remain in English.",
        this.buildEnhancedCategorySystemHint(scriptCategory)
      ].join(" ");
    }

    return desiredLanguage === "ko"
      ? [
          "You are a Korean shortform content strategist.",
          "Return strict JSON only with keys: titleOptions, hook, narration, callToAction.",
          "All values must be written in natural Korean.",
          "Do not mix in English slogans, English hooks, or English CTA lines.",
          "The titleOptions quality matters as much as the narration quality.",
          "Do not copy the source title verbatim.",
          "Each title must feel like a Korean shortform title, not a summary heading.",
          this.buildCategorySystemHint(scriptCategory)
        ].join(" ")
      : "You are an English shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction.";
  }

  private buildDraftUserPrompt(
    selection: string,
    revisionRequest: string | undefined,
    desiredLanguage: "ko" | "en",
    backgroundSubtitleMode: boolean,
    scriptCategory: ShortformScriptCategory
  ): string {
    if (desiredLanguage === "ko" && backgroundSubtitleMode) {
      return [
        `Selected topic: ${selection}`,
        "Audience: Korean social media users.",
        "Format: background-subtitle story short.",
        "Write for a listener who is reading subtitles on top of a static or looping background.",
        "titleOptions must be an array with exactly 3 Korean strings.",
        this.buildEnhancedTitleInstruction(scriptCategory),
        "Return natural Korean output for all fields.",
        "Narration rules:",
        "- hook: exactly one sharp opening line.",
        "- narration: 6 to 10 short spoken sentences.",
        "- each sentence should feel readable in subtitles and natural in Korean TTS.",
        "- the script should feel adapted and dramatized for retention, not summarized like a recap.",
        "- do not say '이 사건은', '네티즌들은', '요약하면', '정리하면', or other summary-anchor phrases.",
        "- do not explain from a distance. Tell it as if you are pulling the listener into the moment.",
        "- make the middle build by stacking specific details, reactions, or emotional shifts.",
        "- end with an aftertaste, twist, or emotional sting instead of a flat explanation.",
        "Good direction example: '처음엔 그냥 이상한 줄 알았는데, 그때부터 하나씩 소름 돋는 일이 이어졌어요.'",
        "Bad direction example: '이 사건은 한 온라인 커뮤니티에서 화제가 된 글로, 여러 반응이 이어졌습니다.'",
        this.buildEnhancedCategoryUserPrompt(scriptCategory),
        revisionRequest ? `Revision request: ${revisionRequest}` : "",
      ].join("\n");
    }

    return [
      `Selected topic: ${selection}`,
      desiredLanguage === "ko"
        ? "Audience: Korean social media users."
        : "Audience: English-speaking social media users.",
      "Style: curiosity-driven, viral, high-retention but not spammy.",
      desiredLanguage === "ko"
        ? "Return natural Korean output for all fields. Do not use English phrases or English CTA sentences unless a brand name must remain in English."
        : "Return natural English output for all fields.",
      ...(desiredLanguage === "ko" ? [this.buildTitleInstruction(scriptCategory)] : []),
      ...(desiredLanguage === "ko" ? [this.buildCategoryUserPrompt(scriptCategory)] : []),
      revisionRequest ? `Revision request: ${revisionRequest}` : "",
      "titleOptions must be an array with 2 or 3 strings."
    ].join("\n");
  }

  private buildTitleInstruction(scriptCategory: ShortformScriptCategory): string {
    const categoryHint =
      scriptCategory === "horror"
        ? "Use dread, unease, and a chilling reveal."
        : scriptCategory === "romance"
          ? "Use relationship tension, emotional reversal, regret, or catharsis."
          : "Use incident impact, absurdity, anger point, twist, or eerie realism.";

    return [
      "Write exactly 3 title ideas in Korean.",
      "Each title should be about 12 to 28 Korean characters when possible.",
      "The 3 titles must clearly differ in angle: one situation-led, one emotion/reversal-led, and one comment-bait or curiosity-led.",
      categoryHint,
      "Ban generic filler patterns like '한눈에 정리', '진짜 이유', '왜 다들', '사람들이 몰린 이유', '요약', '정리'.",
      "Do not sound like a news headline, blog title, or article summary.",
      "Do not repeat the same noun phrase or ending across all three titles.",
      "Prefer native Korean shortform phrasing that feels clickable but not cheap."
    ].join("\n");
  }

  private buildCategorySystemHint(scriptCategory: ShortformScriptCategory): string {
    switch (scriptCategory) {
      case "horror":
        return "Write with realistic dread, short lines, and lingering unease. Avoid fantasy, purple prose, or campy horror tropes.";
      case "romance":
        return "Write like a real relationship story told by a close friend. Keep it conversational, emotionally readable, and grounded.";
      default:
        return "Write like a real community or true-story recap told naturally by a person, not like a news anchor or article summary.";
    }
  }

  private buildCategoryUserPrompt(scriptCategory: ShortformScriptCategory): string {
    switch (scriptCategory) {
      case "horror":
        return [
          "Write a shortform scary-story narration.",
          "It must feel realistic, like a real event told quietly to a friend.",
          "No news style, no novel style, no theatrical prose.",
          "Use short rhythmic Korean sentences that work as subtitles.",
          "Start immediately with something eerie or off-putting.",
          "Let the unease pile up one detail at a time.",
          "End with lingering discomfort rather than a neat explanation.",
          "Avoid fantasy, childish twists, English-heavy wording, hard-to-pronounce tokens, symbols, and repetitive phrasing.",
          "Replace digits or English words with Korean-friendly spoken phrasing when possible.",
          "Output a final-ready script that fits one shortform clip.",
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      case "romance":
        return [
          "Write a shortform romance-story narration.",
          "It should sound like a friend telling a real dating story.",
          "Use casual, realistic Korean speech.",
          "Do not make it cheesy or overly dramatic.",
          "Use short subtitle-friendly sentences.",
          "Open with a line that immediately makes people curious.",
          "Explain the relationship and situation quickly, then show emotional change in the middle.",
          "End with one of: twist, regret, catharsis, or emptiness.",
          "Avoid hard-to-pronounce English, symbols, emojis, and slangy abbreviations.",
          "Keep it natural and directly understandable on first listen.",
          "Output a final-ready script that fits one shortform clip.",
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      default:
        return [
          "Write a shortform community/real-story narration.",
          "It should feel like I personally organized and retold the story, not like I am reading a forum post aloud.",
          "Use natural, plain Korean speech with immersion but not broadcast-style exaggeration.",
          "Start with a strong hook that stops the scroll.",
          "Explain the background briefly and clearly at the start.",
          "Let curiosity grow as the incident unfolds.",
          "End with one of: twist, absurdity, anger point, or eerie aftertaste.",
          "Keep sentences short and subtitle-friendly.",
          "Avoid hard-to-pronounce English, symbols, or meme-heavy wording.",
          "Compress for shortform length but preserve important details.",
          "Output a final-ready script that fits one shortform clip.",
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
    }
  }

  private buildEnhancedTitleInstruction(scriptCategory: ShortformScriptCategory): string {
    const categoryHint =
      scriptCategory === "horror"
        ? "Use dread, unease, and a chilling reveal."
        : scriptCategory === "romance"
          ? "Use relationship tension, emotional reversal, regret, or catharsis."
          : "Use incident impact, absurdity, anger point, twist, or eerie realism.";

    return [
      "Write exactly 3 title ideas in Korean.",
      "Each title should be about 12 to 28 Korean characters when possible.",
      "The 3 titles must clearly differ in angle: one situation-led, one emotion/reversal-led, and one comment-bait or curiosity-led.",
      categoryHint,
      "Ban generic filler patterns like '한눈에 정리', '진짜 이유', '왜 다들', '사람들이 몰린 이유', '요약', '정리'.",
      "Do not sound like a news headline, blog title, or article summary.",
      "Do not repeat the same noun phrase or ending across all three titles.",
      "Prefer native Korean shortform phrasing that feels clickable but not cheap."
    ].join("\n");
  }

  private buildEnhancedCategorySystemHint(scriptCategory: ShortformScriptCategory): string {
    switch (scriptCategory) {
      case "horror":
        return "Write with realistic dread, short lines, and lingering unease. Avoid fantasy, purple prose, or campy horror tropes.";
      case "romance":
        return "Write like a real relationship story told by a close friend. Keep it conversational, emotionally readable, grounded, and not cheesy.";
      default:
        return "Write like a real community or true-story retelling told naturally by a person, not like a news anchor, recap thread, or article summary.";
    }
  }

  private buildEnhancedCategoryUserPrompt(scriptCategory: ShortformScriptCategory): string {
    switch (scriptCategory) {
      case "horror":
        return [
          "Write a shortform scary-story narration.",
          "It must feel realistic, like a real event told quietly to a friend.",
          "No news style, no novel style, no theatrical prose.",
          "Use short rhythmic Korean sentences that work as subtitles.",
          "Open immediately with the weirdest or creepiest moment instead of explaining the background first.",
          "Then fill in only the minimum context needed to follow the story.",
          "Let the unease pile up one detail at a time.",
          "End with lingering discomfort rather than a neat explanation.",
          "Avoid fantasy, childish twists, English-heavy wording, hard-to-pronounce tokens, symbols, and repetitive phrasing.",
          "Replace digits or English words with Korean-friendly spoken phrasing when possible.",
          "Output a final-ready script that fits one shortform clip.",
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      case "romance":
        return [
          "Write a shortform romance-story narration.",
          "It should sound like a friend telling a real dating story.",
          "Use casual, realistic Korean speech.",
          "Do not make it cheesy or overly dramatic.",
          "Use short subtitle-friendly sentences.",
          "Open with a line that immediately makes people curious or uneasy about the relationship.",
          "Explain the relationship and situation quickly, then show emotional change in the middle.",
          "Make the listener feel the shift in mood, not just the facts.",
          "End with one of: twist, regret, catharsis, or emptiness.",
          "Avoid hard-to-pronounce English, symbols, emojis, and slangy abbreviations.",
          "Keep it natural and directly understandable on first listen.",
          "Output a final-ready script that fits one shortform clip.",
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      default:
        return [
          "Write a shortform community/real-story narration.",
          "It should feel like I personally organized and retold the story, not like I am reading a forum post aloud.",
          "Use natural, plain Korean speech with immersion but not broadcast-style exaggeration.",
          "Start with the strongest hook first, even if that means not following the original order exactly.",
          "You are allowed to adapt and rearrange details to improve retention as long as the core meaning stays intact.",
          "Explain the background briefly and clearly once the hook lands.",
          "Let curiosity grow as the incident unfolds.",
          "End with one of: twist, absurdity, anger point, or eerie aftertaste.",
          "Keep sentences short and subtitle-friendly.",
          "Avoid hard-to-pronounce English, symbols, or meme-heavy wording.",
          "Compress for shortform length but preserve important details.",
          "Do not sound like a recap account or forum summary bot.",
          "Output a final-ready script that fits one shortform clip.",
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
    }
  }
}
