import { spawn } from "node:child_process";
import type {
  ShortformScriptDraft,
  WorkflowAiConnectionRef,
  WorkflowAiProvider
} from "../../../common/types/automation";
import type {
  ScenePlanDocument,
  ScenePlanRequest
} from "../../../common/types/media-generation";
import { SettingsRepository } from "../storage/settings-repository";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";

const SCENE_PLAN_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    schemaVersion: { type: "number", enum: [1] },
    generatedAt: { type: "string" },
    totalDurationSec: { type: "number" },
    language: { type: "string", enum: ["ko"] },
    scenes: {
      type: "array",
      minItems: 3,
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          startSec: { type: "number" },
          endSec: { type: "number" },
          durationSec: { type: "number" },
          text: { type: "string" },
          keywords: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: { type: "string" }
          },
          visualIntent: { type: "string" }
        },
        required: [
          "index",
          "startSec",
          "endSec",
          "durationSec",
          "text",
          "keywords",
          "visualIntent"
        ]
      }
    }
  },
  required: ["schemaVersion", "generatedAt", "totalDurationSec", "language", "scenes"]
});

export class ScenePlanService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly workflowConfigService: ShortformWorkflowConfigService
  ) {}

  async generateScenePlan(
    draft: ShortformScriptDraft,
    headline?: string
  ): Promise<{
    source: "claude" | "openrouter" | "openai" | "mock";
    document: ScenePlanDocument;
    error?: string;
  }> {
    const workflowConfig = this.workflowConfigService.get();
    const request = this.buildRequest(draft, workflowConfig, headline);
    const settings = this.settingsRepository.get();
    const createAiGenerationEnabled = workflowConfig.createAiGenerationEnabled === true;
    const aiConnection = this.resolveAiConnection(
      settings,
      workflowConfig.createAiConnection ?? workflowConfig.processAiConnection ?? "connection_1"
    );
    const provider =
      workflowConfig.createAiProvider ??
      aiConnection.provider ??
      workflowConfig.processAiProvider ??
      workflowConfig.scriptProvider ??
      "openrouter_api";
    const prompt = this.buildPrompt(request);
    const executablePath = settings.claudeExecutablePath?.trim();
    const openRouterApiKey =
      aiConnection.openRouterApiKey?.trim() || workflowConfig.openRouterApiKey?.trim();
    const openRouterModel =
      this.normalizeOpenRouterModel(
        workflowConfig.createAiModel?.trim() || workflowConfig.processAiModel?.trim(),
        aiConnection.openRouterModel?.trim() ||
          workflowConfig.openRouterModel?.trim() ||
          "anthropic/claude-sonnet-4.6"
      );
    const openAiApiKey =
      aiConnection.openAiApiKey?.trim() || workflowConfig.openAiApiKey?.trim();
    const openAiModel =
      this.normalizeOpenAiModel(
        workflowConfig.createAiModel?.trim() || workflowConfig.processAiModel?.trim(),
        aiConnection.openAiModel?.trim() ||
          workflowConfig.openAiModel?.trim() ||
          "gpt-5.4-mini"
      );

    if (!createAiGenerationEnabled) {
      return {
        source: "mock",
        document: this.createMockPlan(request),
        error: "AI scene planning is disabled for the create slot."
      };
    }

    try {
      if (provider === "openrouter_api" && openRouterApiKey) {
        return {
          source: "openrouter",
          document: await this.runOpenRouter(openRouterApiKey, openRouterModel, prompt)
        };
      }

      if (provider === "openai_api" && openAiApiKey) {
        return {
          source: "openai",
          document: await this.runOpenAI(openAiApiKey, openAiModel, prompt)
        };
      }

      if (provider !== "mock" && executablePath) {
        return {
          source: "claude",
          document: await this.runClaude(executablePath, prompt)
        };
      }
    } catch (error) {
      return {
        source: "mock",
        document: this.createMockPlan(request),
        error: error instanceof Error ? error.message : "Scene plan generation failed."
      };
    }

    return {
      source: "mock",
      document: this.createMockPlan(request),
      error: "No valid AI provider credentials were available for scene planning."
    };
  }

  buildRequest(
    draft: ShortformScriptDraft,
    workflowConfig: ReturnType<ShortformWorkflowConfigService["get"]>,
    headline?: string
  ): ScenePlanRequest {
    const targetDurationSec =
      typeof workflowConfig.createTargetDurationSec === "number" &&
      Number.isFinite(workflowConfig.createTargetDurationSec) &&
      workflowConfig.createTargetDurationSec > 0
        ? workflowConfig.createTargetDurationSec
        : 60;
    const minimumSceneCount =
      typeof workflowConfig.createMinimumSceneCount === "number" &&
      Number.isFinite(workflowConfig.createMinimumSceneCount) &&
      workflowConfig.createMinimumSceneCount > 0
        ? workflowConfig.createMinimumSceneCount
        : 3;

    return {
      language: "ko",
      targetDurationSec,
      minimumSceneCount,
      sceneWordTarget: { min: 15, max: 20 },
      sceneCharacterTarget: { min: 30, max: 40 },
      keywordCountPerScene: { min: 2, max: 3 },
      source: {
        headline: headline?.trim() || draft.titleOptions[0] || "Untitled shortform",
        summary: draft.hook,
        narration: draft.narration,
        hook: draft.hook,
        callToAction: draft.callToAction
      }
    };
  }

  buildPrompt(request: ScenePlanRequest): string {
    return [
      "You are a scene planner for Korean shortform video production.",
      "Return strict JSON only.",
      "Analyze the provided Korean script and split it into independent scenes.",
      `Keep the total duration under ${request.targetDurationSec} seconds.`,
      `Generate at least ${request.minimumSceneCount} scenes.`,
      `Each scene should target about ${request.sceneWordTarget.min}-${request.sceneWordTarget.max} words or ${request.sceneCharacterTarget.min}-${request.sceneCharacterTarget.max} Korean characters.`,
      "The exact number of scenes should depend on the information density of the script.",
      "Each scene must include:",
      "- index",
      "- startSec",
      "- endSec",
      "- durationSec",
      "- text (Korean narration for that scene)",
      `- keywords (an array of ${request.keywordCountPerScene.min} to ${request.keywordCountPerScene.max} short English keywords)`,
      "- visualIntent (one short English phrase describing the visual direction)",
      "Do not change the meaning of the original script.",
      "Compress naturally for a 60-second short.",
      "Timeline must be continuous from 0 seconds with no gaps or overlaps.",
      "Use this JSON schema exactly:",
      SCENE_PLAN_SCHEMA,
      "",
      `Headline: ${request.source.headline}`,
      `Summary: ${request.source.summary}`,
      `Hook: ${request.source.hook ?? ""}`,
      `Narration: ${request.source.narration}`,
      `CTA: ${request.source.callToAction ?? ""}`
    ].join("\n");
  }

  createMockPlan(request: ScenePlanRequest): ScenePlanDocument {
    const narration = request.source.narration
      .split(/(?<=[.!?。！？])\s+|\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const rawChunks = narration.length > 0 ? narration : [request.source.summary];
    const normalizedChunks = rawChunks.slice(0, Math.max(request.minimumSceneCount, rawChunks.length));
    const perSceneDuration = Math.max(
      6,
      Math.floor(request.targetDurationSec / Math.max(normalizedChunks.length, request.minimumSceneCount))
    );

    const scenes = normalizedChunks.map((text, index) => {
      const startSec = index * perSceneDuration;
      const endSec = startSec + perSceneDuration;
      return {
        index: index + 1,
        startSec,
        endSec,
        durationSec: perSceneDuration,
        text,
        keywords: ["story", "emotion", "shortform"].slice(
          0,
          request.keywordCountPerScene.max
        ),
        visualIntent: "social shortform b-roll"
      };
    });

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      totalDurationSec: scenes.at(-1)?.endSec ?? 0,
      language: "ko",
      scenes
    };
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

  private runClaude(executablePath: string, prompt: string): Promise<ScenePlanDocument> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        executablePath,
        ["-p", prompt, "--output-format", "json", "--json-schema", SCENE_PLAN_SCHEMA],
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
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `Claude exited with code ${code}`));
          return;
        }

        try {
          resolve(this.parseScenePlan(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async runOpenRouter(
    apiKey: string,
    model: string,
    prompt: string
  ): Promise<ScenePlanDocument> {
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
              "You are a Korean shortform scene planner. Return strict JSON only for the provided schema."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenRouter returned empty scene plan");
    }

    return this.parseScenePlan(content);
  }

  private async runOpenAI(
    apiKey: string,
    model: string,
    prompt: string
  ): Promise<ScenePlanDocument> {
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
              "You are a Korean shortform scene planner. Return strict JSON only for the provided schema."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "scene_plan",
            schema: JSON.parse(SCENE_PLAN_SCHEMA),
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      error?: { message?: string };
    };

    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }

    if (!payload.output_text?.trim()) {
      throw new Error("OpenAI returned empty scene plan");
    }

    return this.parseScenePlan(payload.output_text);
  }

  private normalizeOpenRouterModel(requestedModel: string | undefined, fallbackModel: string): string {
    const validModels = new Set([
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.4-nano",
      "google/gemini-3.1-pro",
      "google/gemini-3.1-flash-lite",
      "google/gemini-3.1-flash-live",
      "anthropic/claude-opus-4.6",
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-haiku-4.5"
    ]);

    if (requestedModel && validModels.has(requestedModel)) {
      return requestedModel;
    }

    return fallbackModel;
  }

  private normalizeOpenAiModel(requestedModel: string | undefined, fallbackModel: string): string {
    const validModels = new Set(["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]);

    if (requestedModel && validModels.has(requestedModel)) {
      return requestedModel;
    }

    return fallbackModel;
  }

  private parseScenePlan(raw: string): ScenePlanDocument {
    const parsed = JSON.parse(this.extractJsonObject(raw)) as ScenePlanDocument;

    if (!parsed.scenes?.length || parsed.language !== "ko") {
      throw new Error("Scene plan payload is incomplete.");
    }

    return parsed;
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
}
