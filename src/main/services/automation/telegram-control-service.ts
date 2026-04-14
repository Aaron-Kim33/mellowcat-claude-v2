import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  AutomationJobSnapshot,
  ShortformScriptCategory,
  ShortformWorkflowConfig,
  ShortformScriptDraft,
  TelegramControlStatus
} from "../../../common/types/automation";
import type {
  GeneratedMediaPackageManifest,
  SceneScriptDocument
} from "../../../common/types/media-generation";
import type { TrendCandidate } from "../../../common/types/trend";
import { PathService } from "../system/path-service";
import { ProductionPackageService } from "./production-package-service";
import { ShortformScriptService } from "./shortform-script-service";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
import { TrendDiscoveryService } from "./trend-discovery-service";
import { CheckpointWorkflowService } from "./checkpoint-workflow-service";
import { YouTubeAuthService } from "./youtube-auth-service";

interface TelegramControlStateFile {
  updateOffset?: number;
  processedCallbackIds?: string[];
  telegramOutputLanguage?: "en" | "ko";
  lastEventAt?: string;
  lastDispatchAt?: string;
  lastCallbackData?: string;
  lastDraftSource?: "claude" | "openrouter" | "openai" | "mock";
  lastDraftError?: string;
  lastDraft?: ShortformScriptDraft;
  lastScriptCategory?: ShortformScriptCategory;
  lastRevisionRequest?: string;
  lastPackagePath?: string;
  activeCandidates?: TrendCandidate[];
  allGlobalCandidates?: TrendCandidate[];
  allDomesticCandidates?: TrendCandidate[];
  globalCandidateCount?: number;
  domesticCandidateCount?: number;
  trendSourceDebug?: TelegramControlStatus["trendSourceDebug"];
  activeJob?: AutomationJobSnapshot;
  selectedCandidateId?: string;
  selectedCandidateSelection?: string;
}

export class TelegramControlService {
  private pollTimer?: NodeJS.Timeout;
  private syncInFlight = false;
  private readonly debugInstanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(
    private readonly workflowConfigService: ShortformWorkflowConfigService,
    private readonly pathService: PathService,
    private readonly trendDiscoveryService: TrendDiscoveryService,
    private readonly shortformScriptService: ShortformScriptService,
    private readonly productionPackageService: ProductionPackageService,
    private readonly checkpointWorkflowService: CheckpointWorkflowService,
    private readonly youTubeAuthService: YouTubeAuthService
  ) {}

  startPolling(): void {
    if (this.pollTimer) {
      this.appendDebugLog(`startPolling skipped instance=${this.debugInstanceId} reason=already_started`);
      return;
    }

    this.appendDebugLog(`startPolling started instance=${this.debugInstanceId} pid=${process.pid}`);

    this.pollTimer = setInterval(() => {
      if (this.syncInFlight) {
        return;
      }

      void this.syncUpdates();
    }, 4000);
  }

  getStatus(): TelegramControlStatus {
    const workflowConfig = this.workflowConfigService.get();
    const state = this.readState();
    return this.toStatus(workflowConfig, state);
  }

  async syncUpdates(): Promise<TelegramControlStatus> {
    if (this.syncInFlight) {
      this.appendDebugLog(`syncUpdates skipped instance=${this.debugInstanceId} reason=in_flight`);
      return this.getStatus();
    }

    this.syncInFlight = true;
    const workflowConfig = this.workflowConfigService.get();
    const botToken = workflowConfig.telegramBotToken?.trim();
    const chatId = workflowConfig.telegramAdminChatId?.trim();

    if (!botToken || !chatId) {
      this.syncInFlight = false;
      return this.getStatus();
    }

    const state = this.readState();
    this.appendDebugLog(
      `syncUpdates start instance=${this.debugInstanceId} pid=${process.pid} offset=${state.updateOffset ?? 0}`
    );

    try {
      const requestOffset = state.updateOffset ?? 0;
      const requestUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${requestOffset}&timeout=0&ts=${Date.now()}`;
      const requestBody = new URLSearchParams({
        offset: `${requestOffset}`,
        timeout: "0"
      });
      this.appendDebugLog(
        `getUpdates request instance=${this.debugInstanceId} url=${requestUrl.replace(botToken, "***")} body=${requestBody.toString()}`
      );
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-store"
        },
        body: requestBody.toString()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        result?: Array<{
          update_id: number;
          message?: {
            chat?: { id?: number };
            text?: string;
          };
          callback_query?: {
            id: string;
            data?: string;
            message?: {
              chat?: { id?: number };
            };
          };
        }>;
        description?: string;
      };

      if (!payload.ok) {
        throw new Error(payload.description ?? "Unknown Telegram API error");
      }

      const resultIds = (payload.result ?? []).map((item) => item.update_id);
      this.appendDebugLog(
        `getUpdates response instance=${this.debugInstanceId} count=${resultIds.length} first=${resultIds[0] ?? "none"} last=${resultIds.at(-1) ?? "none"}`
      );

      let nextOffset = state.updateOffset ?? 0;
      let nextState = state;
      let lastProcessingError: string | undefined;

      for (const update of payload.result ?? []) {
        nextOffset = update.update_id + 1;
        try {
          const messageText = update.message?.text?.trim();
          const callback = update.callback_query;

          if (messageText) {
            this.appendDebugLog(`incoming message update_id=${update.update_id} chat_id=${update.message?.chat?.id ?? ""} text=${JSON.stringify(messageText)}`);
            if (`${update.message?.chat?.id ?? ""}` !== chatId) {
              continue;
            }

            nextState = await this.handleTextCommand(
              botToken,
              chatId,
              nextState,
              messageText
            );
            continue;
          }

          if (!callback?.data) {
            continue;
          }

          this.appendDebugLog(`incoming callback update_id=${update.update_id} chat_id=${callback.message?.chat?.id ?? ""} callback_id=${callback.id} data=${JSON.stringify(callback.data)}`);
          if (`${callback.message?.chat?.id ?? ""}` !== chatId) {
            continue;
          }

          if (nextState.processedCallbackIds?.includes(callback.id)) {
            continue;
          }

          nextState = await this.handleCallback(
            botToken,
            chatId,
            nextState,
            callback.id,
            callback.data
          );
        } catch (error) {
          this.appendDebugLog(
            `update processing error update_id=${update.update_id} error=${JSON.stringify(
              error instanceof Error ? error.message : "Unknown Telegram update error."
            )}`
          );
          lastProcessingError =
            error instanceof Error ? error.message : "Unknown Telegram update error.";
        } finally {
          nextState = {
            ...nextState,
            updateOffset: nextOffset
          };
          this.writeState(nextState);
        }
      }

      const status = this.toStatus(workflowConfig, nextState);
      if (lastProcessingError) {
        this.appendDebugLog(
          `syncUpdates end instance=${this.debugInstanceId} offset=${nextState.updateOffset ?? 0} status=error error=${JSON.stringify(lastProcessingError)}`
        );
        return {
          ...status,
          state: "error",
          message: `Telegram sync failed: ${lastProcessingError}`
        };
      }

      this.appendDebugLog(
        `syncUpdates end instance=${this.debugInstanceId} offset=${nextState.updateOffset ?? 0} status=ok`
      );
      return status;
    } catch (error) {
      this.appendDebugLog(
        `syncUpdates fatal instance=${this.debugInstanceId} error=${JSON.stringify(
          error instanceof Error ? error.message : "Telegram sync failed."
        )}`
      );
      return {
        ...this.toStatus(workflowConfig, state),
        state: "error",
        message:
          error instanceof Error
            ? `Telegram sync failed: ${error.message}`
            : "Telegram sync failed."
      };
    } finally {
      this.syncInFlight = false;
    }
  }

  async sendMockShortlist(): Promise<TelegramControlStatus> {
    this.appendDebugLog("sendMockShortlist invoked");
    return this.dispatchTrendShortlist();
  }

  private async dispatchTrendShortlist(): Promise<TelegramControlStatus> {
    this.appendDebugLog("dispatchTrendShortlist invoked");
    const workflowConfig = this.workflowConfigService.get();
    const currentState = this.readState();
    const language = this.resolveTelegramLanguage(workflowConfig, currentState);
    const now = new Date().toISOString();
    const trendResult = await this.trendDiscoveryService.discoverCandidates({
      regions: ["global", "domestic"],
      limit: 4,
      timeWindow: workflowConfig.trendWindow ?? "24h"
    });
    const shouldUseAiSummary = workflowConfig.inputAiSummaryEnabled !== false;
    const enrichedGlobalCandidates = shouldUseAiSummary
      ? await this.enrichShortlistSummaries(trendResult.globalCandidates, 2)
      : trendResult.globalCandidates;
    const enrichedDomesticCandidates = shouldUseAiSummary
      ? await this.enrichShortlistSummaries(trendResult.domesticCandidates, 2)
      : trendResult.domesticCandidates;
    const shortlistSelection = this.buildNumberedShortlist(
      language,
      enrichedGlobalCandidates,
      enrichedDomesticCandidates
    );
    const nextState: TelegramControlStateFile = {
      processedCallbackIds: currentState.processedCallbackIds ?? [],
      telegramOutputLanguage: language,
      lastEventAt: now,
      lastDispatchAt: now,
      lastPackagePath: undefined,
      activeCandidates: shortlistSelection.combinedCandidates,
      allGlobalCandidates: enrichedGlobalCandidates,
      allDomesticCandidates: enrichedDomesticCandidates,
      globalCandidateCount: enrichedGlobalCandidates.length,
      domesticCandidateCount: enrichedDomesticCandidates.length,
      trendSourceDebug: trendResult.sourceDebug,
      activeJob: {
        id: this.createJobId(now),
        title: "Trend shortlist for Korean shortform review",
        stage: "shortlisted",
        createdAt: now,
        updatedAt: now
      }
    };

    if (nextState.activeJob) {
      this.checkpointWorkflowService.writeInputCheckpoint({
        job: nextState.activeJob,
        request: {
          regions: ["global", "domestic"],
          limit: 4,
          timeWindow: workflowConfig.trendWindow ?? "24h"
        },
        candidates: shortlistSelection.combinedCandidates,
        sourceDebug: trendResult.sourceDebug
      });
    }

    if (workflowConfig.telegramBotToken?.trim() && workflowConfig.telegramAdminChatId?.trim()) {
      try {
        await this.sendTelegramShortlist(
          workflowConfig.telegramBotToken.trim(),
          workflowConfig.telegramAdminChatId.trim(),
          nextState.activeJob?.id ?? this.createJobId(now),
          language,
          shortlistSelection
        );
      } catch (error) {
        this.writeState(nextState);

        return {
          ...this.toStatus(workflowConfig, nextState),
          state: "error",
          message:
            error instanceof Error
              ? `Telegram send failed: ${error.message}`
              : "Telegram send failed."
        };
      }
    }

    this.writeState(nextState);

    return {
      ...this.toStatus(workflowConfig, nextState),
      message:
        workflowConfig.telegramBotToken?.trim() && workflowConfig.telegramAdminChatId?.trim()
          ? this.t(language, "shortlistSent")
          : this.t(language, "shortlistPreparedLocal")
    };
  }

  private toStatus(
    workflowConfig: ShortformWorkflowConfig,
    state: TelegramControlStateFile
  ): TelegramControlStatus {
    const botTokenConfigured = Boolean(workflowConfig.telegramBotToken?.trim());
    const adminChatIdConfigured = Boolean(workflowConfig.telegramAdminChatId?.trim());
    const configured = botTokenConfigured && adminChatIdConfigured;
    const transport = configured ? "telegram" : "mock";

    return {
      configured,
      botTokenConfigured,
      adminChatIdConfigured,
      transport,
      state: state.activeJob ? "running" : configured ? "configured" : "idle",
      message: state.activeJob
        ? this.getStageMessage(state.activeJob, state)
        : configured
          ? "Telegram control is configured and ready."
          : "Add Telegram bot token and admin chat id to start the shortform assistant.",
      lastEventAt: state.lastEventAt,
      lastDispatchAt: state.lastDispatchAt,
      lastCallbackData: state.lastCallbackData,
      lastDraftSource: state.lastDraftSource,
      lastDraftError: state.lastDraftError,
      lastPackagePath: state.lastPackagePath,
      trendSourceDebug: state.trendSourceDebug,
      activeJob: state.activeJob
    };
  }

  private async sendTelegramShortlist(
    botToken: string,
    chatId: string,
    activeJobId: string,
    language: "en" | "ko",
    shortlist: {
      combinedCandidates: TrendCandidate[];
      globalLines: string[];
      domesticLines: string[];
      globalCount: number;
      domesticCount: number;
    }
  ): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: [
          this.t(language, "shortlistTitle"),
          "",
          this.t(language, "shortlistIntro"),
          "",
          this.formatSectionTitle(language, "global", Math.min(2, shortlist.globalCount), shortlist.globalCount),
          ...shortlist.globalLines,
          "",
          this.formatSectionTitle(language, "domestic", Math.min(2, shortlist.domesticCount), shortlist.domesticCount),
          ...shortlist.domesticLines,
          "",
          this.t(language, "shortlistPickPrompt"),
          this.t(language, "shortlistMorePrompt")
        ].join("\n"),
        reply_markup: {
          inline_keyboard: [
            [
              { text: this.t(language, "selectOne"), callback_data: `shortlist:select:${activeJobId}:1` },
              { text: this.t(language, "selectTwo"), callback_data: `shortlist:select:${activeJobId}:2` }
            ],
            [
              { text: this.t(language, "selectThree"), callback_data: `shortlist:select:${activeJobId}:3` },
              { text: this.t(language, "selectFour"), callback_data: `shortlist:select:${activeJobId}:4` }
            ],
            [
              { text: this.t(language, "refresh"), callback_data: `shortlist:refresh:${activeJobId}` }
            ]
          ]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { ok?: boolean; description?: string };

    if (!payload.ok) {
      throw new Error(payload.description ?? "Unknown Telegram API error");
    }
  }

  private async sendTelegramScriptReview(
    botToken: string,
    chatId: string,
    jobId: string,
    language: "en" | "ko",
    selection: string,
    draft: ShortformScriptDraft,
    context?: {
      title?: string;
      summary?: string;
      revisionRequest?: string;
    }
  ): Promise<void> {
    const draftLabel =
      selection === "revised" ? this.t(language, "revisedScriptDraft") : this.formatCandidateDraftLabel(language, selection);

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: [
          `${draftLabel}`,
          ...(context?.title
            ? [
                "",
                `${this.t(language, "selectedTopic")}: ${context.title}`
              ]
            : []),
          ...(context?.summary
            ? [
                `${this.t(language, "selectedSummary")}: ${context.summary}`
              ]
            : []),
          ...(context?.revisionRequest
            ? [
                `${this.t(language, "revisionRequest")}: ${context.revisionRequest}`
              ]
            : []),
          "",
          this.t(language, "titleIdeas"),
          ...draft.titleOptions.map((item, index) => `${index + 1}. ${item}`),
          "",
          this.t(language, "hook"),
          `"${draft.hook}"`,
          "",
          this.t(language, "narrationDraft"),
          draft.narration,
          "",
          this.t(language, "cta"),
          `"${draft.callToAction}"`
        ].join("\n"),
        reply_markup: {
          inline_keyboard: [
            draft.titleOptions.map((item, index) => ({
              text: this.formatTitleChoiceLabel(language, index, item),
              callback_data: `script:title:${jobId}:${index}`
            })),
            [
              { text: this.t(language, "approve"), callback_data: `script:approve:${jobId}` },
              { text: this.t(language, "revise"), callback_data: `script:revise:${jobId}` }
            ],
            [{ text: this.t(language, "reject"), callback_data: `script:reject:${jobId}` }]
          ]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { ok?: boolean; description?: string };

    if (!payload.ok) {
      throw new Error(payload.description ?? "Unknown Telegram API error");
    }
  }

  private async sendTelegramCategoryPicker(
    botToken: string,
    chatId: string,
    jobId: string,
    language: "en" | "ko",
    selection: string,
    context?: {
      title?: string;
      summary?: string;
    }
  ): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: [
          language === "ko" ? "스크립트 장르 선택" : "Choose script category",
          ...(context?.title ? ["", `${this.t(language, "selectedTopic")}: ${context.title}`] : []),
          ...(context?.summary ? [`${this.t(language, "selectedSummary")}: ${context.summary}`] : []),
          "",
          language === "ko"
            ? "이 후보를 어떤 프롬프트 위주로 작성할지 골라주세요."
            : "Pick which prompt style should be used for this story."
        ].join("\n"),
        reply_markup: {
          inline_keyboard: [
            [
              { text: language === "ko" ? "무서운썰" : "Scary story", callback_data: `script:category:${jobId}:${selection}:horror` },
              { text: language === "ko" ? "연애썰" : "Romance story", callback_data: `script:category:${jobId}:${selection}:romance` }
            ],
            [
              { text: language === "ko" ? "실화/커뮤썰" : "Community/real story", callback_data: `script:category:${jobId}:${selection}:community` }
            ]
          ]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { ok?: boolean; description?: string };
    if (!payload.ok) {
      throw new Error(payload.description ?? "Unknown Telegram API error");
    }
  }

  private async handleCallback(
    botToken: string,
    chatId: string,
    currentState: TelegramControlStateFile,
    callbackId: string,
    callbackData: string
  ): Promise<TelegramControlStateFile> {
    const now = new Date().toISOString();
    const language = this.resolveTelegramLanguage(
      this.workflowConfigService.get(),
      currentState
    );
    let nextState: TelegramControlStateFile = {
      ...currentState,
      lastEventAt: now,
      lastCallbackData: callbackData,
      processedCallbackIds: [
        ...(currentState.processedCallbackIds ?? []).slice(-19),
        callbackId
      ]
    };

    if (callbackData.startsWith("shortlist:select:")) {
      const [, , jobId, selection = "?"] = callbackData.split(":");

      if (currentState.activeJob?.id && currentState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "shortlistInactive"));
        return nextState;
      }

      nextState = {
        ...nextState,
        selectedCandidateSelection: selection,
        selectedCandidateId: currentState.activeCandidates?.[Number(selection) - 1]?.id,
        lastDraft: undefined,
        lastDraftSource: undefined,
        lastDraftError: undefined,
        lastScriptCategory: undefined,
        activeJob: currentState.activeJob
          ? {
              ...currentState.activeJob,
              title: this.resolveSelectedCandidateTitle(currentState.activeCandidates, selection),
              stage: "awaiting_script_category",
              updatedAt: now
            }
          : {
              id: this.createJobId(now),
              title: this.resolveSelectedCandidateTitle(currentState.activeCandidates, selection),
              stage: "awaiting_script_category",
              createdAt: now,
              updatedAt: now
            }
      };
      await this.sendTelegramCategoryPicker(
        botToken,
        chatId,
        nextState.activeJob?.id ?? jobId,
        language,
        selection,
        {
          title: nextState.activeJob?.title,
          summary: this.localizeCandidateSummary(
            currentState.activeCandidates?.[Number(selection) - 1] ?? {
              id: "selected",
              title: nextState.activeJob?.title ?? "",
              summary: nextState.activeJob?.title ?? "",
              operatorSummary: "",
              contentAngle: "",
              media: {
                hasMedia: false,
                imageUrls: [],
                analysisPolicy: "text_only"
              },
              sourceKind: "mock",
              sourceRegion: "global",
              sourceLabel: "",
              score: 0,
              fitReason: ""
            },
            language
          )
        }
      );
      await this.answerCallbackQuery(botToken, callbackId, language === "ko" ? "장르를 골라주세요." : "Choose a script category.");
      return nextState;
    }

    if (callbackData.startsWith("script:category:")) {
      const [, , jobId, selection = "?", category = "community"] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const normalizedCategory = this.normalizeScriptCategory(category);
      const draftResult = await this.shortformScriptService.generateDraft(
        nextState.activeJob?.title ?? `Candidate ${selection} for Korean shortform review`,
        undefined,
        normalizedCategory
      );
      nextState = {
        ...nextState,
        lastDraftSource: draftResult.source,
        lastDraftError: draftResult.error,
        lastDraft: draftResult.draft,
        lastScriptCategory: normalizedCategory,
        lastPackagePath: undefined,
        activeJob: nextState.activeJob
          ? {
              ...nextState.activeJob,
              stage: "awaiting_review",
              updatedAt: now
            }
          : undefined
      };
      if (nextState.activeJob) {
        this.checkpointWorkflowService.writeProcessCheckpoint({
          job: nextState.activeJob,
          selectedCandidateId: nextState.selectedCandidateId,
          selectedCandidate: currentState.activeCandidates?.find((candidate) => candidate.id === nextState.selectedCandidateId),
          draft: draftResult.draft,
          scriptCategory: normalizedCategory,
          source: draftResult.source,
          error: draftResult.error
        });
      }
      await this.sendTelegramScriptReview(
        botToken,
        chatId,
        nextState.activeJob?.id ?? jobId,
        language,
        selection,
        draftResult.draft,
        {
          title: nextState.activeJob?.title,
          summary: this.localizeCandidateSummary(
            currentState.activeCandidates?.find((candidate) => candidate.id === nextState.selectedCandidateId) ?? {
              id: "selected",
              title: nextState.activeJob?.title ?? "",
              summary: nextState.activeJob?.title ?? "",
              operatorSummary: "",
              contentAngle: "",
              media: {
                hasMedia: false,
                imageUrls: [],
                analysisPolicy: "text_only"
              },
              sourceKind: "mock",
              sourceRegion: "global",
              sourceLabel: "",
              score: 0,
              fitReason: ""
            },
            language
          )
        }
      );
      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko" ? "선택한 장르로 스크립트를 생성했습니다." : "Generated a draft for that category."
      );
      return nextState;
    }

    if (callbackData.startsWith("script:approve:")) {
      const [, , jobId] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      nextState = {
        ...nextState,
        activeJob: nextState.activeJob
          ? {
              ...nextState.activeJob,
              stage: "approved",
              updatedAt: now
            }
          : undefined,
        lastPackagePath: undefined
      };

      if (nextState.activeJob) {
        this.checkpointWorkflowService.markProcessCheckpointApproved(nextState.activeJob.id);
      }

      await this.sendTelegramActionMessage(
        botToken,
        chatId,
        language === "ko"
          ? "스크립트 승인이 완료되었습니다. 준비가 되면 여기서 바로 3번 소재 생성을 실행할 수 있습니다."
          : "Script approval is complete. When you're ready, you can start Slot 03 create right here.",
        [
          [
            {
              text: language === "ko" ? "3번 소재 생성 실행" : "Run Slot 03 create",
              callback_data: `create:run:${jobId}`
            }
          ]
        ]
      );
    }

    if (callbackData.startsWith("script:title:")) {
      const [, , jobId, rawIndex = "-1"] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const selectedIndex = Number(rawIndex);
      const currentDraft = nextState.lastDraft;
      const titleOptions = currentDraft?.titleOptions ?? [];
      if (!currentDraft || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= titleOptions.length) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "선택할 수 없는 제목입니다." : "That title option is no longer available."
        );
        return nextState;
      }

      const reorderedTitles = [
        titleOptions[selectedIndex],
        ...titleOptions.filter((_, index) => index !== selectedIndex)
      ];

      nextState = {
        ...nextState,
        lastDraft: {
          ...currentDraft,
          titleOptions: reorderedTitles
        }
      };

      if (nextState.activeJob) {
        this.checkpointWorkflowService.selectProcessCheckpointTitle(nextState.activeJob.id, selectedIndex);
      }

      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko"
          ? `대표 제목을 ${selectedIndex + 1}번으로 선택했습니다.`
          : `Selected title option ${selectedIndex + 1}.`
      );
      return nextState;
    }

    if (callbackData.startsWith("create:scene-list:")) {
      const [, , jobId] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const packagePath =
        nextState.lastPackagePath?.trim() || this.pathService.getAutomationPackagePath(jobId);
      if (!packagePath || !fs.existsSync(packagePath)) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "패키지를 찾을 수 없습니다." : "Package was not found."
        );
        return nextState;
      }

      await this.sendCreateSceneListMessage(botToken, chatId, language, jobId, packagePath);
      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko" ? "씬 목록을 보냈습니다." : "Scene list sent."
      );
      return nextState;
    }

    if (callbackData.startsWith("create:scene:")) {
      const [, , jobId, sceneArg] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const sceneIndex = Number.parseInt(sceneArg ?? "", 10);
      if (!Number.isFinite(sceneIndex) || sceneIndex <= 0) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "씬 번호를 확인해 주세요." : "Please check the scene index."
        );
        return nextState;
      }

      const packagePath =
        nextState.lastPackagePath?.trim() || this.pathService.getAutomationPackagePath(jobId);
      if (!packagePath || !fs.existsSync(packagePath)) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "패키지를 찾을 수 없습니다." : "Package was not found."
        );
        return nextState;
      }

      await this.sendCreateSceneDetailMessage(
        botToken,
        chatId,
        language,
        jobId,
        packagePath,
        sceneIndex
      );
      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko" ? `씬 ${sceneIndex} 정보를 보냈습니다.` : `Scene ${sceneIndex} details sent.`
      );
      return nextState;
    }

    if (callbackData.startsWith("create:run:")) {
      const [, , jobId, approvalStep] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      if (!nextState.activeJob) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "활성 작업이 없습니다." : "No active job was found."
        );
        return nextState;
      }

      if (approvalStep !== "confirm") {
        const readiness = this.productionPackageService.getCreateReadiness(jobId);
        const readinessLines = readiness.items.map((item) =>
          `${item.ok ? "✅" : "⚠️"} ${item.label}: ${item.detail}`
        );
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          [
            language === "ko"
              ? "3번 소재 생성을 시작하기 전 최종 확인이 필요합니다."
              : "Final confirmation is required before Slot 03 create starts.",
            "",
            ...readinessLines,
            "",
            language === "ko"
              ? "아래 확인 버튼을 누르면 실제 생성이 시작됩니다."
              : "Tap confirm below to actually start generation."
          ].join("\n"),
          [
            [
              {
                text: language === "ko" ? "확인 후 생성 시작" : "Confirm and start create",
                callback_data: `create:run:${jobId}:confirm`
              }
            ]
          ]
        );
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "확인 버튼을 누르면 생성이 시작됩니다." : "Tap confirm to start create."
        );
        return nextState;
      }

      const activeJob = nextState.activeJob;

      nextState = {
        ...nextState,
        activeJob: {
          ...activeJob,
          stage: "packaging",
          updatedAt: now
        }
      };

      try {
        const snapshot = await this.productionPackageService.runCreatePipeline(jobId);
        const packagePath =
          snapshot.resolvedPackagePath ??
          this.pathService.getAutomationJobPath(jobId);

        nextState = {
          ...nextState,
          activeJob: {
            ...activeJob,
            stage: "ready",
            updatedAt: now
          },
          lastPackagePath: packagePath
        };

        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `3번 소재 생성을 완료했습니다.\n\nPath: ${packagePath}`
            : `Slot 03 create finished.\n\nPath: ${packagePath}`
        );
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          language === "ko"
            ? "4번 업로드 대상을 골라주세요."
            : "Choose where to publish Slot 04.",
          [
            [
              {
                text: language === "ko" ? "유튜브 영상 업로드" : "Upload as YouTube video",
                callback_data: `upload:run:${jobId}:video`
              }
            ],
            [
              {
                text: language === "ko" ? "유튜브 쇼츠 업로드" : "Upload as YouTube Shorts",
                callback_data: `upload:run:${jobId}:shorts`
              }
            ]
          ]
        );
      } catch (error) {
        nextState = {
          ...nextState,
          activeJob: {
            ...activeJob,
            stage: "error",
            updatedAt: now
          }
        };

        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `3번 소재 생성에 실패했습니다.\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Slot 03 create failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    if (callbackData.startsWith("create:rerender:")) {
      const [, , jobId, sceneArg = "", approvalStep] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const sceneIndexes = this.parseSceneIndexes(sceneArg);
      if (sceneIndexes.length === 0) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "씬 번호를 확인해 주세요." : "Please check scene indexes."
        );
        return nextState;
      }

      if (approvalStep !== "confirm") {
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          [
            language === "ko"
              ? "선택 씬 재렌더를 시작하기 전 최종 확인이 필요합니다."
              : "Final confirmation is required before selected-scene re-render.",
            "",
            `${language === "ko" ? "대상 씬" : "Target scenes"}: ${sceneIndexes.join(", ")}`,
            "",
            language === "ko"
              ? "확인을 누르면 선택한 씬만 다시 렌더하고 최종 영상을 재합성합니다."
              : "Press confirm to re-render only selected scenes and compose the final video again."
          ].join("\n"),
          [
            [
              {
                text: language === "ko" ? "확인 후 재렌더" : "Confirm re-render",
                callback_data: `create:rerender:${jobId}:${sceneArg}:confirm`
              }
            ]
          ]
        );
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "확인 버튼을 눌러 재렌더를 시작하세요." : "Tap confirm to start re-render."
        );
        return nextState;
      }

      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko"
          ? `씬 ${sceneIndexes.join(", ")} 재렌더를 시작합니다.`
          : `Starting re-render for scenes ${sceneIndexes.join(", ")}.`
      );

      try {
        const snapshot = await this.productionPackageService.rerenderCreateScenes(
          jobId,
          sceneIndexes
        );
        const packagePath =
          snapshot.resolvedPackagePath ?? this.pathService.getAutomationPackagePath(jobId);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `선택 씬 재렌더 완료\n\nScene: ${sceneIndexes.join(", ")}\nPath: ${packagePath}`
            : `Selected-scene re-render finished.\n\nScenes: ${sceneIndexes.join(", ")}\nPath: ${packagePath}`
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `선택 씬 재렌더 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Selected-scene re-render failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return nextState;
    }

    if (callbackData.startsWith("create:refresh-assets:")) {
      const [, , jobId, sceneArg = "", approvalStep] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const sceneIndexes = this.parseSceneIndexes(sceneArg);
      if (sceneIndexes.length === 0) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "씬 번호를 확인해 주세요." : "Please check scene indexes."
        );
        return nextState;
      }

      if (approvalStep !== "confirm") {
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          [
            language === "ko"
              ? "선택 씬의 자산 재검색을 시작하기 전 최종 확인이 필요합니다."
              : "Final confirmation is required before selected-scene asset refresh.",
            "",
            `${language === "ko" ? "대상 씬" : "Target scenes"}: ${sceneIndexes.join(", ")}`
          ].join("\n"),
          [[
            {
              text: language === "ko" ? "확인 후 자산 재검색" : "Confirm asset refresh",
              callback_data: `create:refresh-assets:${jobId}:${sceneArg}:confirm`
            }
          ]]
        );
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "확인 버튼을 눌러 진행하세요." : "Tap confirm to continue."
        );
        return nextState;
      }

      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko"
          ? `씬 ${sceneIndexes.join(", ")} 자산 재검색을 시작합니다.`
          : `Starting asset refresh for scenes ${sceneIndexes.join(", ")}.`
      );
      try {
        await this.productionPackageService.refreshCreateAssets(jobId, sceneIndexes);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `자산 재검색 완료\n\nScene: ${sceneIndexes.join(", ")}`
            : `Asset refresh finished.\n\nScenes: ${sceneIndexes.join(", ")}`
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `자산 재검색 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Asset refresh failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return nextState;
    }

    if (callbackData.startsWith("create:refresh-voice:")) {
      const [, , jobId, approvalStep] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      if (approvalStep !== "confirm") {
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          language === "ko"
            ? "더빙을 다시 생성할까요? (음성/TTS 재호출)"
            : "Re-generate voiceover now? (calls TTS again)",
          [[
            {
              text: language === "ko" ? "확인 후 더빙 재생성" : "Confirm voice refresh",
              callback_data: `create:refresh-voice:${jobId}:confirm`
            }
          ]]
        );
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "확인 버튼을 눌러 진행하세요." : "Tap confirm to continue."
        );
        return nextState;
      }

      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko" ? "더빙 재생성을 시작합니다." : "Starting voiceover refresh."
      );
      try {
        await this.productionPackageService.refreshCreateVoiceover(jobId);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko" ? "더빙 재생성을 완료했습니다." : "Voiceover refresh finished."
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `더빙 재생성 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Voiceover refresh failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return nextState;
    }

    if (callbackData.startsWith("create:refresh-subtitles:")) {
      const [, , jobId, approvalStep] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      if (approvalStep !== "confirm") {
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          language === "ko"
            ? "자막 파일(SRT/ASS)을 다시 생성할까요?"
            : "Refresh subtitle files (SRT/ASS) now?",
          [[
            {
              text: language === "ko" ? "확인 후 자막 재생성" : "Confirm subtitle refresh",
              callback_data: `create:refresh-subtitles:${jobId}:confirm`
            }
          ]]
        );
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "확인 버튼을 눌러 진행하세요." : "Tap confirm to continue."
        );
        return nextState;
      }

      await this.answerCallbackQuery(
        botToken,
        callbackId,
        language === "ko" ? "자막 재생성을 시작합니다." : "Starting subtitle refresh."
      );
      try {
        await this.productionPackageService.refreshCreateSubtitles(jobId);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko" ? "자막 재생성을 완료했습니다." : "Subtitle refresh finished."
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `자막 재생성 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Subtitle refresh failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return nextState;
    }

    if (callbackData.startsWith("upload:run:")) {
      const [, , jobId, publishTarget = "video"] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      const packagePath =
        nextState.lastPackagePath?.trim() || this.pathService.getAutomationPackagePath(jobId);

      if (!packagePath || !fs.existsSync(packagePath)) {
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko" ? "업로드할 패키지를 찾지 못했습니다." : "Package path for upload was not found."
        );
        return nextState;
      }

      try {
        this.youTubeAuthService.setPublishTarget(
          packagePath,
          publishTarget === "shorts" ? "shorts" : "video"
        );
        await this.answerCallbackQuery(
          botToken,
          callbackId,
          language === "ko"
            ? publishTarget === "shorts"
              ? "유튜브 쇼츠 업로드를 시작합니다."
              : "유튜브 영상 업로드를 시작합니다."
            : publishTarget === "shorts"
              ? "Starting YouTube Shorts upload."
              : "Starting YouTube video upload."
        );
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? publishTarget === "shorts"
              ? "유튜브 쇼츠 업로드를 진행합니다."
              : "유튜브 영상 업로드를 진행합니다."
            : publishTarget === "shorts"
              ? "Uploading to YouTube Shorts."
              : "Uploading to YouTube video."
        );
        await this.youTubeAuthService.uploadPackage(packagePath);
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `4번 업로드에 실패했습니다.\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Slot 04 upload failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return nextState;
    }

    if (callbackData.startsWith("script:revise:")) {
      const [, , jobId] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      nextState = {
        ...nextState,
        lastRevisionRequest: undefined,
        activeJob: nextState.activeJob
          ? {
              ...nextState.activeJob,
              stage: "awaiting_revision_input",
              updatedAt: now
            }
          : undefined
      };
      await this.sendTelegramText(
        botToken,
        chatId,
        this.t(language, "revisePrompt")
      );
    }

    if (callbackData.startsWith("script:reject:")) {
      const [, , jobId] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      nextState = {
        ...nextState,
        activeJob: nextState.activeJob
          ? {
              ...nextState.activeJob,
              stage: "rejected",
              updatedAt: now
            }
          : undefined
      };

      await this.sendTelegramText(
        botToken,
        chatId,
        this.t(language, "scriptRejected")
      );
    }

    if (callbackData.startsWith("shortlist:refresh:")) {
      const [, , jobId] = callbackData.split(":");
      if (currentState.activeJob?.id && currentState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "shortlistInactive"));
        return nextState;
      }

      await this.sendTelegramShortlist(
        botToken,
        chatId,
        currentState.activeJob?.id ?? jobId,
        language,
        this.buildNumberedShortlist(
          language,
          (currentState.activeCandidates ?? []).filter((candidate) => candidate.sourceRegion === "global"),
          (currentState.activeCandidates ?? []).filter((candidate) => candidate.sourceRegion === "domestic")
        )
      );
    }

    await this.answerCallbackQuery(botToken, callbackId, this.t(language, "received"));
    return nextState;
  }

  private async handleTextCommand(
    botToken: string,
    chatId: string,
    currentState: TelegramControlStateFile,
    messageText: string
  ): Promise<TelegramControlStateFile> {
    const normalized = messageText.toLowerCase();
    this.appendDebugLog(`handleTextCommand text=${JSON.stringify(normalized)}`);
    const workflowConfig = this.workflowConfigService.get();
    const language = this.resolveTelegramLanguage(workflowConfig, currentState);

    if (normalized === "/shortlist") {
      const status = await this.dispatchTrendShortlist();
      return this.readStateWithFallback(status, currentState);
    }

    if (currentState.activeJob?.stage === "awaiting_revision_input" && !normalized.startsWith("/")) {
      const revisionRequest = messageText.trim();
      const draftResult = await this.shortformScriptService.generateDraft(
        currentState.activeJob.title,
        revisionRequest,
        currentState.lastScriptCategory ?? "community"
      );
      const nextState: TelegramControlStateFile = {
        ...currentState,
        lastEventAt: new Date().toISOString(),
        lastRevisionRequest: revisionRequest,
        lastDraftSource: draftResult.source,
        lastDraftError: draftResult.error,
        lastDraft: draftResult.draft,
        activeJob: {
          ...currentState.activeJob,
          stage: "awaiting_review",
          updatedAt: new Date().toISOString()
        }
      };
        if (nextState.activeJob) {
          this.checkpointWorkflowService.writeProcessCheckpoint({
            job: nextState.activeJob,
            selectedCandidateId: currentState.activeCandidates?.find(
              (candidate) => candidate.title === currentState.activeJob?.title
            )?.id,
            selectedCandidate: currentState.activeCandidates?.find(
              (candidate) => candidate.title === currentState.activeJob?.title
            ),
            draft: draftResult.draft,
            scriptCategory: currentState.lastScriptCategory ?? "community",
            revisionRequest,
            source: draftResult.source,
            error: draftResult.error
          });
        }
      this.writeState(nextState);
      await this.sendTelegramScriptReview(
        botToken,
        chatId,
        currentState.activeJob.id,
        language,
        "revised",
        draftResult.draft,
        {
          title: currentState.activeJob.title,
          revisionRequest
        }
      );
      return nextState;
    }

    if (normalized === "/lang ko" || normalized === "/lang en") {
      const nextLanguage: "en" | "ko" = normalized.endsWith("ko") ? "ko" : "en";
      this.workflowConfigService.set({ telegramOutputLanguage: nextLanguage });
      const nextState = {
        ...currentState,
        telegramOutputLanguage: nextLanguage
      };
      this.writeState(nextState);
      await this.sendTelegramText(botToken, chatId, this.t(nextLanguage, "languageChanged"));
      return nextState;
    }

    if (normalized === "/status") {
      const status = this.toStatus(workflowConfig, currentState);
      await this.sendTelegramText(
        botToken,
        chatId,
        [
          this.t(language, "statusTitle"),
          "",
          `${this.t(language, "state")}: ${status.state}`,
          `${this.t(language, "transport")}: ${status.transport}`,
          `${this.t(language, "currentLanguage")}: ${language}`,
          `${this.t(language, "lastCallback")}: ${status.lastCallbackData ?? this.t(language, "noneYet")}`,
          `${this.t(language, "lastDraftSource")}: ${status.lastDraftSource ?? this.t(language, "noneYet")}`,
          `${this.t(language, "lastPackagePath")}: ${status.lastPackagePath ?? this.t(language, "notCreatedYet")}`,
          `${this.t(language, "globalCandidates")}: ${currentState.globalCandidateCount ?? 0}`,
          `${this.t(language, "domesticCandidates")}: ${currentState.domesticCandidateCount ?? 0}`,
          ...((currentState.trendSourceDebug ?? []).map(
            (item) =>
              `${item.sourceId}: ${item.count} (${item.status}${item.message ? `, ${item.message}` : ""})`
          )),
          `${this.t(language, "message")}: ${status.message}`
        ].join("\n")
      );
      return currentState;
    }

    if (normalized === "/more_global") {
      await this.sendTrendListByRegion(botToken, chatId, currentState, "global", language);
      return currentState;
    }

    if (normalized === "/more_domestic") {
      await this.sendTrendListByRegion(botToken, chatId, currentState, "domestic", language);
      return currentState;
    }

    if (normalized === "/upload_video" || normalized === "/upload_shorts") {
      const publishTarget = normalized === "/upload_shorts" ? "shorts" : "video";
      const activeJobId = currentState.activeJob?.id?.trim();
      const packagePath = this.resolveRecentPackagePath(
        currentState.lastPackagePath?.trim(),
        activeJobId
      );

      if (!packagePath || !fs.existsSync(packagePath)) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "업로드할 최근 패키지를 찾지 못했습니다. 먼저 3번 소재 생성을 완료해 주세요."
            : "No recent package was found for upload. Finish Slot 03 create first."
        );
        return currentState;
      }

      const packageJobId = path.basename(packagePath);
      const nextState: TelegramControlStateFile = {
        ...currentState,
        lastPackagePath: packagePath,
        activeJob:
          currentState.activeJob && currentState.activeJob.id === packageJobId
            ? currentState.activeJob
            : {
                id: packageJobId,
                title: currentState.activeJob?.title ?? "Latest package",
                stage: currentState.activeJob?.stage ?? "ready",
                createdAt: currentState.activeJob?.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
      };

      try {
        this.youTubeAuthService.setPublishTarget(packagePath, publishTarget);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? publishTarget === "shorts"
              ? "최근 패키지로 유튜브 쇼츠 업로드를 시작합니다."
              : "최근 패키지로 유튜브 영상 업로드를 시작합니다."
            : publishTarget === "shorts"
              ? "Starting YouTube Shorts upload from the latest package."
              : "Starting YouTube video upload from the latest package."
        );
        await this.youTubeAuthService.uploadPackage(packagePath);
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `업로드에 실패했습니다.\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Upload failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return nextState;
    }

    if (normalized === "/create_status") {
      const activeJobId = currentState.activeJob?.id?.trim();
      if (!activeJobId) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "활성 작업이 없습니다. 먼저 /shortlist 로 후보를 고르고 승인까지 진행해 주세요."
            : "No active job found. Start with /shortlist and finish script approval first."
        );
        return currentState;
      }

      const readiness = this.productionPackageService.getCreateReadiness(activeJobId);
      const readinessLines = readiness.items.map((item) =>
        `${item.ok ? "✅" : "⚠️"} ${item.label}: ${item.detail}`
      );
      await this.sendTelegramText(
        botToken,
        chatId,
        [
          language === "ko" ? "Slot 03 생성 준비 상태" : "Slot 03 create readiness",
          "",
          ...readinessLines,
          "",
          readiness.canRun
            ? language === "ko"
              ? "준비 완료: /create_run 으로 시작할 수 있습니다."
              : "Ready: use /create_run to start."
            : language === "ko"
              ? "아직 준비가 부족합니다. 위 항목을 먼저 채워주세요."
              : "Not ready yet. Complete the missing items above."
        ].join("\n")
      );
      return currentState;
    }

    if (normalized === "/create_run") {
      const activeJobId = currentState.activeJob?.id?.trim();
      if (!activeJobId) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "활성 작업이 없습니다. 먼저 /shortlist 후 승인까지 완료해 주세요."
            : "No active job found. Run /shortlist and finish approval first."
        );
        return currentState;
      }

      await this.sendTelegramActionMessage(
        botToken,
        chatId,
        language === "ko"
          ? "3번 소재 생성을 시작하려면 아래 버튼을 눌러주세요."
          : "Tap the button below to start Slot 03 create.",
        [[
          {
            text: language === "ko" ? "3번 소재 생성 실행" : "Run Slot 03 create",
            callback_data: `create:run:${activeJobId}`
          }
        ]]
      );
      return currentState;
    }

    if (normalized === "/create_progress") {
      const activeJobId = currentState.activeJob?.id?.trim();
      const packagePath = currentState.lastPackagePath?.trim()
        || (activeJobId ? this.pathService.getAutomationPackagePath(activeJobId) : undefined);

      if (!packagePath || !fs.existsSync(packagePath)) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "확인할 생성 패키지가 없습니다. 먼저 3번 생성을 실행해 주세요."
            : "No creation package found yet. Run Slot 03 create first."
        );
        return currentState;
      }

      const progressPath = path.join(packagePath, "create-progress.json");
      if (!fs.existsSync(progressPath)) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `진행 로그 파일이 아직 없습니다.\n\nPath: ${packagePath}`
            : `No progress log file yet.\n\nPath: ${packagePath}`
        );
        return currentState;
      }

      try {
        const progress = JSON.parse(
          fs.readFileSync(progressPath, "utf-8")
        ) as {
          stage?: string;
          status?: string;
          detail?: string;
          updatedAt?: string;
        };
        const sceneCount = this.resolveSceneCount(packagePath);
        const rerenderKeyboard =
          activeJobId && sceneCount > 0
            ? [
                ...this.buildRerenderInlineKeyboard(language, activeJobId, sceneCount),
                [
                  {
                    text: language === "ko" ? "씬별 자산 보기" : "View scene assets",
                    callback_data: `create:scene-list:${activeJobId}`
                  }
                ]
              ]
            : undefined;
        await this.sendTelegramActionMessage(
          botToken,
          chatId,
          [
            language === "ko" ? "Slot 03 생성 진행 상태" : "Slot 03 create progress",
            "",
            `${language === "ko" ? "단계" : "Stage"}: ${progress.stage ?? "-"}`,
            `${language === "ko" ? "상태" : "Status"}: ${progress.status ?? "-"}`,
            `${language === "ko" ? "상세" : "Detail"}: ${progress.detail ?? "-"}`,
            `${language === "ko" ? "갱신 시각" : "Updated"}: ${progress.updatedAt ?? "-"}`,
            `${language === "ko" ? "패키지" : "Package"}: ${packagePath}`,
            ...(sceneCount > 0
              ? [
                  "",
                  language === "ko"
                    ? `씬 개수: ${sceneCount} (아래 버튼으로 부분 재렌더 가능)`
                    : `Scene count: ${sceneCount} (use buttons below for partial re-render)`
                ]
              : [])
          ].join("\n"),
          rerenderKeyboard
        );
      } catch {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "진행 로그를 읽는 중 오류가 발생했습니다."
            : "Failed to read the progress log."
        );
      }
      return currentState;
    }

    if (normalized.startsWith("/create_rerender")) {
      const activeJobId = currentState.activeJob?.id?.trim();
      if (!activeJobId) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "활성 작업이 없습니다. 먼저 /shortlist 후 승인까지 완료해 주세요."
            : "No active job found. Run /shortlist and finish approval first."
        );
        return currentState;
      }

      const sceneArg = messageText.replace(/^\/create_rerender/i, "").trim();
      if (!sceneArg) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "사용법: /create_rerender 1,3\n\n지정한 씬만 다시 렌더하고 최종 영상을 재합성합니다."
            : "Usage: /create_rerender 1,3\n\nRe-renders selected scenes and composes the final video again."
        );
        return currentState;
      }

      const sceneIndexes = this.parseSceneIndexes(sceneArg);
      if (sceneIndexes.length === 0) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "씬 번호를 인식하지 못했습니다. 예: /create_rerender 1,3"
            : "Could not parse scene indexes. Example: /create_rerender 1,3"
        );
        return currentState;
      }

      try {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `선택한 씬(${sceneIndexes.join(", ")})을 재렌더하고 최종 합성을 시작합니다.`
            : `Starting selected-scene re-render (${sceneIndexes.join(", ")}) and final composition.`
        );
        const snapshot = await this.productionPackageService.rerenderCreateScenes(
          activeJobId,
          sceneIndexes
        );
        const packagePath =
          snapshot.resolvedPackagePath ?? this.pathService.getAutomationPackagePath(activeJobId);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `선택 씬 재렌더를 완료했습니다.\n\nScene: ${sceneIndexes.join(", ")}\nPath: ${packagePath}`
            : `Selected-scene re-render finished.\n\nScenes: ${sceneIndexes.join(", ")}\nPath: ${packagePath}`
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `선택 씬 재렌더에 실패했습니다.\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Selected-scene re-render failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return currentState;
    }

    if (normalized === "/create_scenes") {
      const activeJobId = currentState.activeJob?.id?.trim();
      const packagePath = currentState.lastPackagePath?.trim()
        || (activeJobId ? this.pathService.getAutomationPackagePath(activeJobId) : undefined);
      if (!activeJobId || !packagePath || !fs.existsSync(packagePath)) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "확인할 생성 패키지가 없습니다. 먼저 3번 생성을 실행해 주세요."
            : "No creation package found yet. Run Slot 03 create first."
        );
        return currentState;
      }

      await this.sendCreateSceneListMessage(botToken, chatId, language, activeJobId, packagePath);
      return currentState;
    }

    if (normalized.startsWith("/create_refresh_assets")) {
      const activeJobId = currentState.activeJob?.id?.trim();
      if (!activeJobId) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "활성 작업이 없습니다. 먼저 /shortlist 후 승인까지 완료해 주세요."
            : "No active job found. Run /shortlist and finish approval first."
        );
        return currentState;
      }
      const sceneArg = messageText.replace(/^\/create_refresh_assets/i, "").trim();
      const sceneIndexes = this.parseSceneIndexes(sceneArg);
      if (sceneIndexes.length === 0) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "사용법: /create_refresh_assets 1,3"
            : "Usage: /create_refresh_assets 1,3"
        );
        return currentState;
      }
      try {
        await this.productionPackageService.refreshCreateAssets(activeJobId, sceneIndexes);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `자산 재검색 완료\n\nScene: ${sceneIndexes.join(", ")}`
            : `Asset refresh finished.\n\nScenes: ${sceneIndexes.join(", ")}`
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `자산 재검색 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Asset refresh failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return currentState;
    }

    if (normalized === "/create_refresh_voice") {
      const activeJobId = currentState.activeJob?.id?.trim();
      if (!activeJobId) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "활성 작업이 없습니다. 먼저 /shortlist 후 승인까지 완료해 주세요."
            : "No active job found. Run /shortlist and finish approval first."
        );
        return currentState;
      }
      try {
        await this.productionPackageService.refreshCreateVoiceover(activeJobId);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko" ? "더빙 재생성을 완료했습니다." : "Voiceover refresh finished."
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `더빙 재생성 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Voiceover refresh failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return currentState;
    }

    if (normalized === "/create_refresh_subtitles") {
      const activeJobId = currentState.activeJob?.id?.trim();
      if (!activeJobId) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? "활성 작업이 없습니다. 먼저 /shortlist 후 승인까지 완료해 주세요."
            : "No active job found. Run /shortlist and finish approval first."
        );
        return currentState;
      }
      try {
        await this.productionPackageService.refreshCreateSubtitles(activeJobId);
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko" ? "자막 재생성을 완료했습니다." : "Subtitle refresh finished."
        );
      } catch (error) {
        await this.sendTelegramText(
          botToken,
          chatId,
          language === "ko"
            ? `자막 재생성 실패\n\n${error instanceof Error ? error.message : "알 수 없는 오류"}`
            : `Subtitle refresh failed.\n\n${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
      return currentState;
    }

    if (normalized === "/help") {
      await this.sendTelegramText(
        botToken,
        chatId,
        [
          this.t(language, "commandsTitle"),
          "",
          this.t(language, "helpShortlist"),
          this.t(language, "helpMoreGlobal"),
          this.t(language, "helpMoreDomestic"),
          this.t(language, "helpCreateStatus"),
          this.t(language, "helpCreateRun"),
          this.t(language, "helpCreateProgress"),
          this.t(language, "helpCreateScenes"),
          this.t(language, "helpCreateRerender"),
          this.t(language, "helpCreateRefreshAssets"),
          this.t(language, "helpCreateRefreshVoice"),
          this.t(language, "helpCreateRefreshSubtitles"),
          this.t(language, "helpUploadVideo"),
          this.t(language, "helpUploadShorts"),
          this.t(language, "helpStatus"),
          this.t(language, "helpLang"),
          this.t(language, "helpHelp")
        ].join("\n")
      );
      return currentState;
    }

    return currentState;
  }

  private async sendTelegramText(
    botToken: string,
    chatId: string,
    text: string
  ): Promise<void> {
    await this.sendTelegramActionMessage(botToken, chatId, text);
  }

  private async sendTelegramActionMessage(
    botToken: string,
    chatId: string,
    text: string,
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
  ): Promise<void> {
    this.appendDebugLog(
      `sendTelegramActionMessage text=${JSON.stringify(text.slice(0, 120))}${text.length > 120 ? "..." : ""}`
    );
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(inlineKeyboard
          ? {
              reply_markup: {
                inline_keyboard: inlineKeyboard
              }
            }
          : {})
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  private async sendTelegramPhotoActionMessage(
    botToken: string,
    chatId: string,
    photo:
      | { kind: "url"; value: string }
      | { kind: "buffer"; value: Buffer; filename: string; mimeType: string },
    caption: string,
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
  ): Promise<void> {
    const payloadForm = new FormData();
    payloadForm.append("chat_id", chatId);
    payloadForm.append("caption", this.clampText(caption, 1000));
    if (inlineKeyboard) {
      payloadForm.append(
        "reply_markup",
        JSON.stringify({
          inline_keyboard: inlineKeyboard
        })
      );
    }

    if (photo.kind === "url") {
      payloadForm.append("photo", photo.value);
    } else {
      payloadForm.append(
        "photo",
        new Blob([photo.value], { type: photo.mimeType }),
        photo.filename
      );
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: payloadForm
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  private async answerCallbackQuery(
    botToken: string,
    callbackId: string,
    text: string
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        callback_query_id: callbackId,
        text
      })
    });
  }

  private getStageMessage(
    job: AutomationJobSnapshot,
    state?: TelegramControlStateFile
  ): string {
    const candidateSummary =
      typeof state?.globalCandidateCount === "number" || typeof state?.domesticCandidateCount === "number"
        ? ` Global ${state?.globalCandidateCount ?? 0} / Domestic ${state?.domesticCandidateCount ?? 0}.`
        : "";
      switch (job.stage) {
        case "awaiting_script_category":
          return `Script category selection is waiting in Telegram for ${job.title}.${candidateSummary}`;
        case "awaiting_revision_input":
          return `Revision feedback is waiting in Telegram for ${job.title}.${candidateSummary}`;
      case "awaiting_review":
        return `Script review is waiting in Telegram for ${job.title}.${candidateSummary}`;
      case "approved":
        return `Script approved for ${job.title}. Packaging can start next.${candidateSummary}`;
      case "ready":
        return `Production package is ready for ${job.title}.${candidateSummary}`;
      case "rejected":
        return `Script rejected for ${job.title}. Send a new shortlist or revise the concept.${candidateSummary}`;
      default:
        return `Active job: ${job.title} (${job.stage}).${candidateSummary}`;
    }
  }

  private readStateWithFallback(
    status: TelegramControlStatus,
    fallbackState: TelegramControlStateFile
  ): TelegramControlStateFile {
    try {
      return this.readState();
    } catch {
      return {
        ...fallbackState,
        lastEventAt: new Date().toISOString(),
        activeJob: status.activeJob
      };
    }
  }

  private resolveSelectedCandidateTitle(
    candidates: TrendCandidate[] | undefined,
    selection: string
  ): string {
    const index = Number(selection) - 1;
    const candidate = Number.isNaN(index) ? undefined : candidates?.[index];
    return candidate?.title ?? `Selected candidate ${selection} for Korean shortform review`;
  }

  private async enrichShortlistSummaries(
    candidates: TrendCandidate[],
    limit: number
  ): Promise<TrendCandidate[]> {
    if (candidates.length === 0) {
      return candidates;
    }

    const topCandidates = candidates.slice(0, limit);
    const enrichedTop = await Promise.all(
      topCandidates.map(async (candidate) => {
        const summary = await this.shortformScriptService.generateTrendSummary({
          title: candidate.title,
          body: candidate.summary,
          sourceLabel: candidate.sourceLabel
        });

        return {
          ...candidate,
          summary
        };
      })
    );

    return [...enrichedTop, ...candidates.slice(limit)];
  }

  private buildNumberedShortlist(
    language: "en" | "ko",
    globalCandidates: TrendCandidate[],
    domesticCandidates: TrendCandidate[]
  ): {
    combinedCandidates: TrendCandidate[];
    globalLines: string[];
    domesticLines: string[];
    globalCount: number;
    domesticCount: number;
  } {
    const topGlobal = this.pickDiverseCandidates(globalCandidates, 2);
    const topDomestic = this.pickDiverseCandidates(domesticCandidates, 2);
    const combinedCandidates = [...topGlobal, ...topDomestic];

    const formatCandidateLines = (
      candidates: TrendCandidate[],
      startIndex: number
    ): string[] => {
      if (candidates.length === 0) {
        return ["- No candidates found yet"];
      }

      return candidates.flatMap((candidate, index) => [
        `${startIndex + index}. ${candidate.title}`,
        `   ${this.t(language, "summary")}: ${this.localizeCandidateSummary(candidate, language)}`
      ]);
    };

    return {
      combinedCandidates,
      globalLines: formatCandidateLines(topGlobal, 1),
      domesticLines: formatCandidateLines(topDomestic, 1 + topGlobal.length),
      globalCount: globalCandidates.length,
      domesticCount: domesticCandidates.length
    };
  }

  private async sendTrendListByRegion(
    botToken: string,
    chatId: string,
    state: TelegramControlStateFile,
    region: "global" | "domestic",
    language: "en" | "ko"
  ): Promise<void> {
    const regionCandidates =
      region === "global"
        ? state.allGlobalCandidates ?? (state.activeCandidates ?? []).filter((candidate) => candidate.sourceRegion === "global")
        : state.allDomesticCandidates ?? (state.activeCandidates ?? []).filter((candidate) => candidate.sourceRegion === "domestic");

    if (regionCandidates.length === 0) {
      await this.sendTelegramText(
        botToken,
        chatId,
        region === "global"
          ? this.t(language, "noMoreGlobal")
          : this.t(language, "noMoreDomestic")
      );
      return;
    }

    const title =
      region === "global" ? this.t(language, "moreGlobalTitle") : this.t(language, "moreDomesticTitle");

    await this.sendTelegramText(
      botToken,
      chatId,
      [
        title,
        "",
        ...regionCandidates.map((candidate, index) =>
          [
            `${index + 1}. ${candidate.title}`,
            `${this.t(language, "quickTake")}: ${this.localizeOperatorSummary(candidate, language)}`,
            `${this.t(language, "shortformAngle")}: ${this.localizeContentAngle(candidate.contentAngle, language)}`,
            `${this.t(language, "source")}: ${candidate.sourceLabel} | ${this.t(language, "score")}: ${candidate.score}`
          ].join("\n")
        )
      ].join("\n\n")
    );
  }

  private pickDiverseCandidates(candidates: TrendCandidate[], limit: number): TrendCandidate[] {
    const realCandidates = candidates.filter((candidate) => !this.isFallbackCandidate(candidate));
    const candidatePool = realCandidates.length >= limit ? realCandidates : candidates;

    if (candidatePool.length <= limit) {
      return candidatePool;
    }

    const selected: TrendCandidate[] = [];
    const seenSources = new Set<string>();

    for (const candidate of candidatePool) {
      if (selected.length >= limit) {
        break;
      }

      if (seenSources.has(candidate.sourceKind)) {
        continue;
      }

      selected.push(candidate);
      seenSources.add(candidate.sourceKind);
    }

    if (selected.length < limit) {
      for (const candidate of candidatePool) {
        if (selected.length >= limit) {
          break;
        }

        if (selected.some((item) => item.id === candidate.id)) {
          continue;
        }

        selected.push(candidate);
      }
    }

    return selected;
  }

  private isFallbackCandidate(candidate: TrendCandidate): boolean {
    if (candidate.sourceKind === "mock") {
      return true;
    }

    if (candidate.sourceKind === "rss" && !candidate.sourceUrl) {
      return true;
    }

    return false;
  }

  private readState(): TelegramControlStateFile {
    const filePath = this.pathService.getAutomationStatePath("telegram-control.json");
    const directory = path.dirname(filePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      const initialState: TelegramControlStateFile = {
        processedCallbackIds: []
      };
      fs.writeFileSync(filePath, JSON.stringify(initialState, null, 2), "utf-8");
      return initialState;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TelegramControlStateFile;
      return {
        processedCallbackIds: [],
        ...parsed
      };
    } catch {
      return {
        processedCallbackIds: []
      };
    }
  }

  private writeState(nextState: TelegramControlStateFile): void {
    const filePath = this.pathService.getAutomationStatePath("telegram-control.json");
    const currentState = this.readState();
    const mergedState: TelegramControlStateFile = {
      ...currentState,
      ...nextState,
      updateOffset: nextState.updateOffset ?? currentState.updateOffset,
      processedCallbackIds: nextState.processedCallbackIds ?? currentState.processedCallbackIds ?? []
    };
    fs.writeFileSync(filePath, JSON.stringify(mergedState, null, 2), "utf-8");
    this.appendDebugLog(
      `writeState instance=${this.debugInstanceId} offset=${mergedState.updateOffset ?? 0} job=${mergedState.activeJob?.id ?? ""} stage=${mergedState.activeJob?.stage ?? ""}`
    );
  }

  private appendDebugLog(message: string): void {
    try {
      const filePath = this.pathService.getAutomationStatePath("telegram-debug.log");
      const line = `[${new Date().toISOString()}] ${message}${os.EOL}`;
      fs.appendFileSync(filePath, line, "utf-8");
    } catch {
      // Ignore debug logging failures.
    }
  }

  private createJobId(isoDate: string): string {
    const date = new Date(isoDate);
    const pad = (value: number) => value.toString().padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    return `job-${year}${month}${day}-${hour}${minute}${second}`;
  }

  private resolveTelegramLanguage(
    workflowConfig: ShortformWorkflowConfig,
    state: TelegramControlStateFile
  ): "en" | "ko" {
    return state.telegramOutputLanguage ?? workflowConfig.telegramOutputLanguage ?? "ko";
  }

  private formatSectionTitle(
    language: "en" | "ko",
    region: "global" | "domestic",
    showing: number,
    total: number
  ): string {
    if (language === "ko") {
      return region === "global"
        ? `글로벌 후보 (${showing}개 표시 / 전체 ${total}개)`
        : `국내 커뮤니티 후보 (${showing}개 표시 / 전체 ${total}개)`;
    }

    return region === "global"
      ? `Global picks (showing ${showing} of ${total})`
      : `Korean community picks (showing ${showing} of ${total})`;
  }

  private formatCandidateDraftLabel(language: "en" | "ko", selection: string): string {
    return language === "ko" ? `후보 ${selection} 초안` : `Candidate ${selection} draft`;
  }

  private localizeOperatorSummary(candidate: TrendCandidate, language: "en" | "ko"): string {
    if (language === "en") {
      return candidate.operatorSummary;
    }

    const summary = candidate.operatorSummary.trim();
    if (summary.includes("Entertainment or fandom comparison")) {
      return "국내에서 팬덤 반응과 댓글 전쟁으로 번지기 쉬운 연예·팬덤 비교 이슈입니다.";
    }
    if (summary.includes("Live event or crowd-control issue")) {
      return "현장 혼란이나 통제 이슈를 반응형 시사 숏폼으로 재구성하기 좋은 주제입니다.";
    }
    if (summary.includes("Class tension or everyday life commentary")) {
      return "계층 갈등이나 생활 밀착형 의견 분열을 만들기 쉬운 주제입니다.";
    }
    if (summary.includes("strong reaction and comment potential in Korea")) {
      return "국내 반응과 댓글 전환 가능성이 큰 커뮤니티 이슈입니다.";
    }

    if (candidate.sourceKind === "reddit") {
      return "레딧에서 반응이 큰 1인칭 사연형 이슈로, 한국식 숏폼 문법으로 재해석하기 좋습니다.";
    }

    if (candidate.sourceKind === "rss") {
      return "빠르게 요약해 한국형 반응 숏폼으로 만들기 쉬운 글로벌 이슈입니다.";
    }

    if (candidate.sourceRegion === "domestic") {
      return "국내 커뮤니티에서 반응이 확인된 이슈로, 한국형 숏폼 주제로 확장하기 좋습니다.";
    }

    return candidate.operatorSummary;
  }

  private localizeCandidateSummary(candidate: TrendCandidate, language: "en" | "ko"): string {
    if (language === "en") {
      return candidate.summary || candidate.operatorSummary;
    }

    if (/[가-힣]/.test(candidate.summary)) {
      return candidate.summary;
    }

    const text = `${candidate.title} ${candidate.summary}`.toLowerCase();

    if (text.includes("salary") || text.includes("highest paid") || text.includes("coworker")) {
      return "이직 제안을 계기로 회사에서 큰 연봉 인상을 받았지만, 팀 내 최고 연봉자라는 사실을 동료들에게 숨기고 있다는 사연입니다.";
    }

    if (text.includes("cheat") || text.includes("partner") || text.includes("married") || text.includes("ex")) {
      return "오랜 연애와 결혼 생활 끝에 외도를 알게 된 작성자가 큰 상실감 속에서 조언을 구하는 사연입니다.";
    }

    if (text.includes("tifu") || text.includes("said my ex")) {
      return "순간의 말실수나 민망한 사건이 관계 문제로 번질 수 있는 상황을 다룬 사연입니다.";
    }

    if (candidate.sourceKind === "reddit") {
      return "해외 커뮤니티에서 크게 반응을 얻은 1인칭 사연형 글로, 감정선과 반전 포인트를 살린 숏폼으로 풀기 좋습니다.";
    }

    if (candidate.title.includes("방탄") || candidate.title.includes("싸이") || candidate.title.includes("아이브") || candidate.title.includes("엑소")) {
      return "가수나 팬덤 규모 차이를 비교하며 반응이 갈리는 글로, 팬덤 반응과 수치 비교를 중심으로 풀 수 있는 이슈입니다.";
    }

    if (candidate.title.includes("공연") || candidate.title.includes("출입") || candidate.title.includes("광화문")) {
      return "공연장이나 행사 현장에서 발생한 입장 혼란 이슈로, 현장 반응과 책임 공방을 중심으로 정리하기 좋은 글입니다.";
    }

    if (candidate.sourceRegion === "domestic") {
      return "국내 커뮤니티에서 반응이 붙은 이슈로, 사건 맥락과 댓글 반응을 함께 묶어 숏폼으로 만들기 좋습니다.";
    }

    return candidate.summary || candidate.operatorSummary;
  }

  private localizeContentAngle(value: string, language: "en" | "ko"): string {
    if (language === "en") {
      return value;
    }

    const tokenMap: Record<string, string> = {
      "salary reveal": "연봉 공개",
      "status gap": "지위 격차",
      "comment-bait reaction": "댓글 유도 반응",
      "relationship betrayal": "연인 배신",
      "emotional fallout": "감정 후폭풍",
      "viewer debate": "시청자 찬반",
      "office tension": "직장 긴장감",
      "hidden hierarchy": "숨은 서열",
      "fandom comparison": "팬덤 비교",
      "chart or crowd gap": "차트·관객수 격차",
      "heated reaction clip": "과열 반응 클립",
      "live-event confusion recap": "현장 혼란 요약",
      "blame angle": "책임 공방",
      "fast reaction summary": "빠른 반응 정리",
      "relationship commentary": "연애 해설",
      "gender-friction angle": "성별 갈등 각도",
      "opinion split": "의견 분열",
      "community recap": "커뮤니티 요약",
      "Korean reaction summary": "한국 반응 요약",
      "debate framing": "논쟁 프레이밍"
    };

    return value
      .split("/")
      .map((part) => tokenMap[part.trim()] ?? part.trim())
      .join(" / ");
  }

  private localizeFitReason(value: string, language: "en" | "ko"): string {
    if (language === "en") {
      return value;
    }

    if (value.includes("High engagement, first-person storytelling")) {
      return "반응이 높고 1인칭 서사 구조라 한국 시청자용으로 현지화하기 쉽습니다.";
    }
    if (value.includes("Clear visual structure")) {
      return "구조가 명확해서 빠르게 재작성하기 좋고, 매일 후보를 안정적으로 확보하는 데 유리합니다.";
    }
    if (value.includes("Fallback domestic candidate")) {
      return "실시간 국내 커뮤니티 수집이 불가능할 때를 대비한 대체 후보입니다.";
    }
    if (value.includes("Strong first-person story format")) {
      return "1인칭 서사 구조가 강하고 반응 비율이 높아 한국형 숏폼으로 재해석하기 좋습니다.";
    }
    if (value.includes("High local engagement and clear emotional angle")) {
      return "국내 반응이 높고 감정선이 분명해서 한국형 숏폼 서사로 바꾸기 좋습니다.";
    }
    if (value.includes("Already proven in a high-traffic Korean community")) {
      return "이미 트래픽이 큰 국내 커뮤니티에서 검증된 이슈라, 높은 호기심형 숏폼으로 전환될 가능성이 큽니다.";
    }

    return value;
  }

  private formatTitleChoiceLabel(language: "en" | "ko", index: number, title: string): string {
    const prefix = language === "ko" ? `${index + 1}번` : `Title ${index + 1}`;
    const compactTitle = title.length > 22 ? `${title.slice(0, 22)}...` : title;
    return `${prefix} ${compactTitle}`.trim();
  }

  private normalizeScriptCategory(value: string): ShortformScriptCategory {
    if (value === "horror" || value === "romance") {
      return value;
    }

    return "community";
  }

  private parseSceneIndexes(input: string): number[] {
    return Array.from(
      new Set(
        input
          .split(",")
          .map((token) => Number.parseInt(token.trim(), 10))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    ).sort((a, b) => a - b);
  }

  private resolveSceneCount(packagePath: string): number {
    try {
      const manifestPath = path.join(packagePath, "asset-manifest.json");
      if (!fs.existsSync(manifestPath)) {
        return 0;
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        scenes?: Array<unknown>;
      };
      return Array.isArray(manifest.scenes) ? manifest.scenes.length : 0;
    } catch {
      return 0;
    }
  }

  private buildRerenderInlineKeyboard(
    language: "en" | "ko",
    jobId: string,
    sceneCount: number
  ): Array<Array<{ text: string; callback_data: string }>> {
    const presets: Array<{ label: string; csv: string }> = [];
    const allScenes = Array.from({ length: sceneCount }, (_value, index) => index + 1);
    if (sceneCount >= 1) {
      presets.push({
        label: language === "ko" ? "씬 1" : "Scene 1",
        csv: "1"
      });
    }
    if (sceneCount >= 2) {
      presets.push({
        label: language === "ko" ? "씬 1,2" : "Scene 1,2",
        csv: "1,2"
      });
    }
    if (sceneCount >= 3) {
      presets.push({
        label: language === "ko" ? "씬 1,2,3" : "Scene 1,2,3",
        csv: "1,2,3"
      });
    }
    if (sceneCount >= 4) {
      presets.push({
        label: language === "ko" ? "씬 3,4" : "Scene 3,4",
        csv: "3,4"
      });
    }
    presets.push({
      label: language === "ko" ? "전체 재렌더" : "Re-render all",
      csv: allScenes.join(",")
    });

    const rerenderRows = presets.map((preset) => [
      {
        text: preset.label,
        callback_data: `create:rerender:${jobId}:${preset.csv}`
      }
    ]);
    const maintenanceRows: Array<Array<{ text: string; callback_data: string }>> = [];
    if (sceneCount >= 1) {
      const assetCsv = sceneCount >= 2 ? "1,2" : "1";
      maintenanceRows.push([
        {
          text: language === "ko" ? `자산 재검색(${assetCsv})` : `Refresh assets (${assetCsv})`,
          callback_data: `create:refresh-assets:${jobId}:${assetCsv}`
        }
      ]);
    }
    maintenanceRows.push(
      [
        {
          text: language === "ko" ? "더빙 재생성" : "Refresh voiceover",
          callback_data: `create:refresh-voice:${jobId}`
        }
      ],
      [
        {
          text: language === "ko" ? "자막 재생성" : "Refresh subtitles",
          callback_data: `create:refresh-subtitles:${jobId}`
        }
      ]
    );

    return [...rerenderRows, ...maintenanceRows];
  }

  private async sendCreateSceneListMessage(
    botToken: string,
    chatId: string,
    language: "en" | "ko",
    jobId: string,
    packagePath: string
  ): Promise<void> {
    const manifest = this.readCreateManifest(packagePath);
    if (!manifest || !Array.isArray(manifest.scenes) || manifest.scenes.length === 0) {
      await this.sendTelegramText(
        botToken,
        chatId,
        language === "ko"
          ? "씬 자산 정보를 찾을 수 없습니다. 먼저 3번 생성을 완료해 주세요."
          : "No scene asset data was found. Complete Slot 03 create first."
      );
      return;
    }

    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    for (let index = 0; index < manifest.scenes.length; index += 2) {
      const left = manifest.scenes[index];
      const right = manifest.scenes[index + 1];
      const row: Array<{ text: string; callback_data: string }> = [
        {
          text: language === "ko" ? `씬 ${left.sceneIndex}` : `Scene ${left.sceneIndex}`,
          callback_data: `create:scene:${jobId}:${left.sceneIndex}`
        }
      ];
      if (right) {
        row.push({
          text: language === "ko" ? `씬 ${right.sceneIndex}` : `Scene ${right.sceneIndex}`,
          callback_data: `create:scene:${jobId}:${right.sceneIndex}`
        });
      }
      rows.push(row);
    }

    await this.sendTelegramActionMessage(
      botToken,
      chatId,
      [
        language === "ko" ? "씬별 사용 자산" : "Scene assets",
        `${language === "ko" ? "작업" : "Job"}: ${jobId}`,
        `${language === "ko" ? "총 씬" : "Total scenes"}: ${manifest.scenes.length}`,
        "",
        language === "ko"
          ? "확인할 씬을 눌러 상세(사용 영상 URL/출처/재검색 버튼)를 보세요."
          : "Tap a scene to inspect the selected video URL/source and quick actions."
      ].join("\n"),
      rows
    );
  }

  private async sendCreateSceneDetailMessage(
    botToken: string,
    chatId: string,
    language: "en" | "ko",
    jobId: string,
    packagePath: string,
    sceneIndex: number
  ): Promise<void> {
    const manifest = this.readCreateManifest(packagePath);
    if (!manifest) {
      await this.sendTelegramText(
        botToken,
        chatId,
        language === "ko"
          ? "asset-manifest.json을 찾을 수 없습니다."
          : "asset-manifest.json was not found."
      );
      return;
    }
    const scene = manifest.scenes.find((item) => item.sceneIndex === sceneIndex);
    if (!scene) {
      await this.sendTelegramText(
        botToken,
        chatId,
        language === "ko"
          ? `씬 ${sceneIndex} 정보를 찾을 수 없습니다.`
          : `Scene ${sceneIndex} was not found.`
      );
      return;
    }

    const script = this.readSceneScript(packagePath);
    const scriptScene = script?.scenes?.find((item) => item.sceneNo === sceneIndex);
    const selectedAsset = scene.selectedAsset;
    const sourceUrl = selectedAsset?.sourceUrl?.trim();
    const previewUrl = sourceUrl ? this.clampText(sourceUrl, 220) : "-";
    const localPath = selectedAsset?.localPath?.trim() || "-";
    const provider = selectedAsset?.provider ?? "-";
    const attribution = selectedAsset?.attributionLabel ?? "-";
    const resolution =
      selectedAsset?.width && selectedAsset?.height
        ? `${selectedAsset.width}x${selectedAsset.height}`
        : "-";
    const assetDuration =
      typeof selectedAsset?.durationSec === "number"
        ? `${selectedAsset.durationSec}s`
        : "-";
    const sceneText = scriptScene?.text?.trim() || "-";
    const searchQuery = scriptScene?.assetSearchQuery?.trim() || "-";
    const motion = scriptScene?.motion ?? scene.motion ?? "-";
    const durationSec = scene.trim?.sourceEndSec && scene.trim?.sourceStartSec !== undefined
      ? Math.max(1, scene.trim.sourceEndSec - scene.trim.sourceStartSec)
      : undefined;
    const detailsText = [
      language === "ko" ? `씬 ${sceneIndex} 상세` : `Scene ${sceneIndex} details`,
      "",
      `${language === "ko" ? "검색 키워드" : "Search query"}: ${searchQuery}`,
      `${language === "ko" ? "모션" : "Motion"}: ${motion}`,
      `${language === "ko" ? "길이" : "Duration"}: ${durationSec ? `${durationSec}s` : "-"}`,
      `${language === "ko" ? "자산 공급자" : "Asset provider"}: ${provider}`,
      `${language === "ko" ? "출처 표시" : "Attribution"}: ${attribution}`,
      `${language === "ko" ? "해상도" : "Resolution"}: ${resolution}`,
      `${language === "ko" ? "원본 길이" : "Source duration"}: ${assetDuration}`,
      `${language === "ko" ? "로컬 파일" : "Local file"}: ${localPath}`,
      `${language === "ko" ? "원본 URL" : "Source URL"}: ${previewUrl}`,
      "",
      `${language === "ko" ? "내레이션" : "Narration"}: ${this.clampText(sceneText, 180)}`
    ].join("\n");
    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [
      [
        {
          text: language === "ko" ? "이 씬 자산 재검색" : "Refresh this scene asset",
          callback_data: `create:refresh-assets:${jobId}:${sceneIndex}`
        }
      ],
      [
        {
          text: language === "ko" ? "이 씬 재렌더" : "Re-render this scene",
          callback_data: `create:rerender:${jobId}:${sceneIndex}`
        }
      ],
      [
        {
          text: language === "ko" ? "씬 목록으로" : "Back to scene list",
          callback_data: `create:scene-list:${jobId}`
        }
      ]
    ];

    const decodedDataImage = this.decodeDataImageSource(sourceUrl);
    const absoluteLocalPath = selectedAsset?.localPath?.trim()
      ? path.isAbsolute(selectedAsset.localPath)
        ? selectedAsset.localPath
        : path.join(packagePath, selectedAsset.localPath)
      : "";

    try {
      if (decodedDataImage) {
        await this.sendTelegramPhotoActionMessage(
          botToken,
          chatId,
          {
            kind: "buffer",
            value: decodedDataImage.buffer,
            filename: `scene-${sceneIndex}.${decodedDataImage.extension}`,
            mimeType: decodedDataImage.mimeType
          },
          detailsText,
          keyboard
        );
        return;
      }

      if (absoluteLocalPath && fs.existsSync(absoluteLocalPath)) {
        await this.sendTelegramPhotoActionMessage(
          botToken,
          chatId,
          {
            kind: "buffer",
            value: fs.readFileSync(absoluteLocalPath),
            filename: path.basename(absoluteLocalPath),
            mimeType: this.resolveMimeTypeFromPath(absoluteLocalPath)
          },
          detailsText,
          keyboard
        );
        return;
      }

      if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        await this.sendTelegramPhotoActionMessage(
          botToken,
          chatId,
          { kind: "url", value: sourceUrl },
          detailsText,
          keyboard
        );
        return;
      }
    } catch {
      // Fallback to text message when photo upload/preview fails.
    }

    await this.sendTelegramActionMessage(
      botToken,
      chatId,
      detailsText,
      keyboard
    );
  }

  private decodeDataImageSource(
    sourceUrl: string | undefined
  ): { buffer: Buffer; mimeType: string; extension: string } | undefined {
    if (!sourceUrl || !sourceUrl.startsWith("data:image/")) {
      return undefined;
    }

    const splitIndex = sourceUrl.indexOf(",");
    if (splitIndex <= 0) {
      return undefined;
    }

    const header = sourceUrl.slice(0, splitIndex).toLowerCase();
    if (!header.includes(";base64")) {
      return undefined;
    }

    const mimeMatch = /^data:(image\/[a-z0-9.+-]+);base64$/i.exec(sourceUrl.slice(0, splitIndex));
    const mimeType = mimeMatch?.[1] ?? "image/png";
    const encoded = sourceUrl.slice(splitIndex + 1);

    try {
      const buffer = Buffer.from(encoded, "base64");
      if (!buffer.length) {
        return undefined;
      }
      return {
        buffer,
        mimeType,
        extension: this.extensionFromMimeType(mimeType)
      };
    } catch {
      return undefined;
    }
  }

  private extensionFromMimeType(mimeType: string): string {
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
      return "jpg";
    }
    if (mimeType.includes("webp")) {
      return "webp";
    }
    return "png";
  }

  private resolveMimeTypeFromPath(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".jpg" || extension === ".jpeg") {
      return "image/jpeg";
    }
    if (extension === ".webp") {
      return "image/webp";
    }
    return "image/png";
  }

  private readCreateManifest(packagePath: string): GeneratedMediaPackageManifest | undefined {
    try {
      const manifestPath = path.join(packagePath, "asset-manifest.json");
      if (!fs.existsSync(manifestPath)) {
        return undefined;
      }
      return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as GeneratedMediaPackageManifest;
    } catch {
      return undefined;
    }
  }

  private readSceneScript(packagePath: string): SceneScriptDocument | undefined {
    try {
      const sceneScriptPath = path.join(packagePath, "scene-script.json");
      if (!fs.existsSync(sceneScriptPath)) {
        return undefined;
      }
      return JSON.parse(fs.readFileSync(sceneScriptPath, "utf-8")) as SceneScriptDocument;
    } catch {
      return undefined;
    }
  }

  private resolveRecentPackagePath(
    preferredPath?: string,
    activeJobId?: string
  ): string | undefined {
    const preferredCandidates = [
      preferredPath?.trim(),
      activeJobId?.trim() ? this.pathService.getAutomationPackagePath(activeJobId.trim()) : undefined
    ].filter((value): value is string => Boolean(value));

    for (const candidate of preferredCandidates) {
      if (this.isUploadPackagePath(candidate)) {
        return candidate;
      }
    }

    return this.findLatestUploadPackagePath();
  }

  private isUploadPackagePath(packagePath: string): boolean {
    if (!packagePath || !fs.existsSync(packagePath)) {
      return false;
    }
    try {
      return fs.statSync(packagePath).isDirectory() &&
        fs.existsSync(path.join(packagePath, "youtube-upload-request.json"));
    } catch {
      return false;
    }
  }

  private findLatestUploadPackagePath(): string | undefined {
    const rootPath = this.pathService.getAutomationPackagesRootPath();
    if (!fs.existsSync(rootPath)) {
      return undefined;
    }

    const candidates = fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const packagePath = path.join(rootPath, entry.name);
        const uploadRequestPath = path.join(packagePath, "youtube-upload-request.json");
        if (!fs.existsSync(uploadRequestPath)) {
          return null;
        }

        const markerPaths = [
          uploadRequestPath,
          path.join(packagePath, "asset-manifest.json"),
          path.join(packagePath, "checkpoint-3", "checkpoint.json"),
          path.join(packagePath, "job.json")
        ];
        const latestTouchedAt = markerPaths
          .map((markerPath) => {
            try {
              return fs.existsSync(markerPath) ? fs.statSync(markerPath).mtimeMs : 0;
            } catch {
              return 0;
            }
          })
          .reduce((max, current) => Math.max(max, current), 0);

        return { packagePath, latestTouchedAt };
      })
      .filter((item): item is { packagePath: string; latestTouchedAt: number } => Boolean(item))
      .sort((left, right) => right.latestTouchedAt - left.latestTouchedAt);

    return candidates[0]?.packagePath;
  }

  private clampText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(1, maxLength - 3))}...`;
  }

  private t(language: "en" | "ko", key: string): string {
    const ko: Record<string, string> = {
      shortlistTitle: "MellowCat 트렌드 후보",
      shortlistIntro: "오늘 한국형 숏폼으로 발전시키기 좋은 후보들입니다.",
      summary: "요약",
      shortlistPickPrompt: "다음으로 발전시킬 각도를 아래 버튼에서 골라주세요.",
      shortlistMorePrompt: "더 보려면 /more_global 또는 /more_domestic 를 입력하세요.",
      shortlistSent: "트렌드 후보를 텔레그램으로 보냈습니다.",
      shortlistPreparedLocal: "트렌드 후보를 로컬에서 준비했습니다. 실제 전송을 하려면 텔레그램 설정을 넣어주세요.",
      selectOne: "1번 선택",
      selectTwo: "2번 선택",
      selectThree: "3번 선택",
      selectFour: "4번 선택",
      refresh: "새로고침",
      revisedScriptDraft: "수정된 스크립트 초안",
      titleIdeas: "제목 아이디어",
      hook: "훅",
      narrationDraft: "내레이션 초안",
      cta: "CTA",
      approve: "승인",
      revise: "수정",
      reject: "거절",
      packageReady: "제작 패키지가 준비되었습니다.",
      packageMissing: "스크립트는 승인됐지만 제작 패키지는 생성되지 않았습니다.",
      scriptRejected: "스크립트를 거절했습니다. 다른 각도로 다시 시도하려면 새 후보를 받아보세요.",
      selectedTopic: "선택한 주제",
      selectedSummary: "주제 요약",
      revisionRequest: "수정 요청",
      revisePrompt: "원하는 방향을 요청해주세요.",
      shortlistInactive: "이 후보 목록은 더 이상 활성 상태가 아닙니다.",
      reviewInactive: "이 검토 항목은 더 이상 활성 상태가 아닙니다.",
      received: "반영됐습니다",
      languageChanged: "텔레그램 출력 언어를 한국어로 변경했습니다.",
      statusTitle: "MellowCat 상태",
      state: "상태",
      transport: "전송 방식",
      currentLanguage: "현재 언어",
      lastCallback: "마지막 콜백",
      lastDraftSource: "마지막 초안 소스",
      lastPackagePath: "마지막 패키지 경로",
      globalCandidates: "글로벌 후보 수",
      domesticCandidates: "국내 후보 수",
      message: "메시지",
      noneYet: "아직 없음",
      notCreatedYet: "아직 생성되지 않음",
      commandsTitle: "MellowCat 명령어",
      helpShortlist: "/shortlist - 새 트렌드 후보 보내기",
      helpMoreGlobal: "/more_global - 글로벌 후보 더 보기",
      helpMoreDomestic: "/more_domestic - 국내 커뮤니티 후보 더 보기",
      helpCreateStatus: "/create_status - 3번 생성 준비 상태 확인",
      helpCreateRun: "/create_run - 3번 생성 실행 버튼 받기",
      helpCreateProgress: "/create_progress - 3번 생성 진행 상태 확인",
      helpCreateScenes: "/create_scenes - 씬별 사용 영상/자산 보기",
      helpCreateRerender: "/create_rerender 1,3 - 선택 씬만 재렌더 후 재합성",
      helpCreateRefreshAssets: "/create_refresh_assets 1,3 - 선택 씬 자산만 재검색",
      helpCreateRefreshVoice: "/create_refresh_voice - 더빙만 재생성",
      helpCreateRefreshSubtitles: "/create_refresh_subtitles - 자막 파일만 재생성",
      helpUploadVideo: "/upload_video - 최근 패키지를 유튜브 영상으로 업로드",
      helpUploadShorts: "/upload_shorts - 최근 패키지를 유튜브 쇼츠로 업로드",
      helpStatus: "/status - 현재 상태 보기",
      helpLang: "/lang ko|en - 출력 언어 변경",
      helpHelp: "/help - 명령어 목록 보기",
      noMoreGlobal: "지금은 추가 글로벌 후보가 없습니다.",
      noMoreDomestic: "지금은 추가 국내 커뮤니티 후보가 없습니다.",
      moreGlobalTitle: "글로벌 후보 더 보기",
      moreDomesticTitle: "국내 커뮤니티 후보 더 보기",
      quickTake: "빠른 요약",
      shortformAngle: "숏폼 각도",
      source: "출처",
      score: "점수",
      whyMadeCut: "추천 이유"
    };

    const en: Record<string, string> = {
      shortlistTitle: "MellowCat Trend Shortlist",
      shortlistIntro: "Here are the strongest candidates to turn into Korean shortform content today.",
      summary: "Summary",
      shortlistPickPrompt: "Tap a button below to pick the angle you want to develop next.",
      shortlistMorePrompt: "Use /more_global or /more_domestic to see more candidates.",
      shortlistSent: "Trend shortlist sent to Telegram with inline selection buttons.",
      shortlistPreparedLocal: "Trend shortlist prepared locally. Add Telegram settings to send it for real.",
      selectOne: "Select 1",
      selectTwo: "Select 2",
      selectThree: "Select 3",
      selectFour: "Select 4",
      refresh: "Refresh",
      revisedScriptDraft: "Revised script draft",
      titleIdeas: "Title ideas",
      hook: "Hook",
      narrationDraft: "Narration draft",
      cta: "CTA",
      approve: "Approve",
      revise: "Revise",
      reject: "Reject",
      packageReady: "Production package ready.",
      packageMissing: "Script approved, but no production package was created.",
      scriptRejected: "Script rejected. Send a new shortlist when you want to try another angle.",
      selectedTopic: "Selected topic",
      selectedSummary: "Topic summary",
      revisionRequest: "Revision request",
      revisePrompt: "Tell me the direction you want.",
      shortlistInactive: "This shortlist is no longer active.",
      reviewInactive: "This review is no longer active.",
      received: "Received",
      languageChanged: "Telegram output language changed to English.",
      statusTitle: "MellowCat Status",
      state: "State",
      transport: "Transport",
      currentLanguage: "Current language",
      lastCallback: "Last callback",
      lastDraftSource: "Last draft source",
      lastPackagePath: "Last package path",
      globalCandidates: "Global candidates",
      domesticCandidates: "Domestic candidates",
      message: "Message",
      noneYet: "None yet",
      notCreatedYet: "Not created yet",
      commandsTitle: "MellowCat Commands",
      helpShortlist: "/shortlist - send a fresh trend shortlist",
      helpMoreGlobal: "/more_global - show more global candidates",
      helpMoreDomestic: "/more_domestic - show more Korean community candidates",
      helpCreateStatus: "/create_status - check Slot 03 create readiness",
      helpCreateRun: "/create_run - get the Slot 03 create launch button",
      helpCreateProgress: "/create_progress - check Slot 03 create progress",
      helpCreateScenes: "/create_scenes - inspect scene-by-scene selected assets",
      helpCreateRerender: "/create_rerender 1,3 - re-render selected scenes and re-compose",
      helpCreateRefreshAssets: "/create_refresh_assets 1,3 - refresh assets for selected scenes",
      helpCreateRefreshVoice: "/create_refresh_voice - refresh voiceover only",
      helpCreateRefreshSubtitles: "/create_refresh_subtitles - refresh subtitle files only",
      helpUploadVideo: "/upload_video - upload the latest package as a YouTube video",
      helpUploadShorts: "/upload_shorts - upload the latest package as YouTube Shorts",
      helpStatus: "/status - show the current assistant status",
      helpLang: "/lang ko|en - switch output language",
      helpHelp: "/help - show this command list",
      noMoreGlobal: "No additional global candidates are available right now.",
      noMoreDomestic: "No additional Korean community candidates are available right now.",
      moreGlobalTitle: "More Global Candidates",
      moreDomesticTitle: "More Korean Community Candidates",
      quickTake: "Quick take",
      shortformAngle: "Shortform angle",
      source: "Source",
      score: "Score",
      whyMadeCut: "Why this made the cut"
    };

    return (language === "ko" ? ko : en)[key] ?? key;
  }
}

