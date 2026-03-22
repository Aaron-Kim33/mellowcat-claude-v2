import fs from "node:fs";
import path from "node:path";
import type {
  AutomationJobSnapshot,
  ShortformScriptDraft,
  TelegramControlStatus
} from "../../../common/types/automation";
import type { TrendCandidate } from "../../../common/types/trend";
import { SettingsRepository } from "../storage/settings-repository";
import { PathService } from "../system/path-service";
import { ProductionPackageService } from "./production-package-service";
import { ShortformScriptService } from "./shortform-script-service";
import { TrendDiscoveryService } from "./trend-discovery-service";

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
  lastPackagePath?: string;
  activeCandidates?: TrendCandidate[];
  allGlobalCandidates?: TrendCandidate[];
  allDomesticCandidates?: TrendCandidate[];
  globalCandidateCount?: number;
  domesticCandidateCount?: number;
  trendSourceDebug?: TelegramControlStatus["trendSourceDebug"];
  activeJob?: AutomationJobSnapshot;
}

export class TelegramControlService {
  private pollTimer?: NodeJS.Timeout;
  private syncInFlight = false;

  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly pathService: PathService,
    private readonly trendDiscoveryService: TrendDiscoveryService,
    private readonly shortformScriptService: ShortformScriptService,
    private readonly productionPackageService: ProductionPackageService
  ) {}

  startPolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      if (this.syncInFlight) {
        return;
      }

      void this.syncUpdates();
    }, 4000);
  }

  getStatus(): TelegramControlStatus {
    const settings = this.settingsRepository.get();
    const state = this.readState();
    return this.toStatus(settings, state);
  }

  async syncUpdates(): Promise<TelegramControlStatus> {
    if (this.syncInFlight) {
      return this.getStatus();
    }

    this.syncInFlight = true;
    const settings = this.settingsRepository.get();
    const botToken = settings.telegramBotToken?.trim();
    const chatId = settings.telegramAdminChatId?.trim();

    if (!botToken || !chatId) {
      this.syncInFlight = false;
      return this.getStatus();
    }

    const state = this.readState();

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=${state.updateOffset ?? 0}&timeout=0`
      );

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

      let nextOffset = state.updateOffset ?? 0;
      let nextState = state;

      for (const update of payload.result ?? []) {
        nextOffset = Math.max(nextOffset, update.update_id + 1);
        const messageText = update.message?.text?.trim();
        const callback = update.callback_query;

        if (messageText) {
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
      }

      const persistedState = {
        ...nextState,
        updateOffset: nextOffset
      };

      if (nextOffset !== (state.updateOffset ?? 0) || nextState !== state) {
        this.writeState(persistedState);
      }

      return this.toStatus(settings, persistedState);
    } catch (error) {
      return {
        ...this.toStatus(settings, state),
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
    return this.dispatchTrendShortlist();
  }

  private async dispatchTrendShortlist(): Promise<TelegramControlStatus> {
    const settings = this.settingsRepository.get();
    const currentState = this.readState();
    const language = this.resolveTelegramLanguage(settings, currentState);
    const now = new Date().toISOString();
    const trendResult = await this.trendDiscoveryService.discoverCandidates({
      regions: ["global", "domestic"],
      limit: 4,
      timeWindow: settings.trendWindow ?? "24h"
    });
    const enrichedGlobalCandidates = await this.enrichShortlistSummaries(
      trendResult.globalCandidates,
      2
    );
    const enrichedDomesticCandidates = await this.enrichShortlistSummaries(
      trendResult.domesticCandidates,
      2
    );
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
        id: `job-${Date.now()}`,
        title: "Trend shortlist for Korean shortform review",
        stage: "shortlisted",
        createdAt: now,
        updatedAt: now
      }
    };

    if (settings.telegramBotToken?.trim() && settings.telegramAdminChatId?.trim()) {
      try {
        await this.sendTelegramShortlist(
          settings.telegramBotToken.trim(),
          settings.telegramAdminChatId.trim(),
          nextState.activeJob?.id ?? `job-${Date.now()}`,
          language,
          shortlistSelection
        );
      } catch (error) {
        this.writeState(nextState);

        return {
          ...this.toStatus(settings, nextState),
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
      ...this.toStatus(settings, nextState),
      message:
        settings.telegramBotToken?.trim() && settings.telegramAdminChatId?.trim()
          ? this.t(language, "shortlistSent")
          : this.t(language, "shortlistPreparedLocal")
    };
  }

  private toStatus(
    settings: ReturnType<SettingsRepository["get"]>,
    state: TelegramControlStateFile
  ): TelegramControlStatus {
    const botTokenConfigured = Boolean(settings.telegramBotToken?.trim());
    const adminChatIdConfigured = Boolean(settings.telegramAdminChatId?.trim());
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
    draft: ShortformScriptDraft
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

  private async handleCallback(
    botToken: string,
    chatId: string,
    currentState: TelegramControlStateFile,
    callbackId: string,
    callbackData: string
  ): Promise<TelegramControlStateFile> {
    const now = new Date().toISOString();
    const language = this.resolveTelegramLanguage(this.settingsRepository.get(), currentState);
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
        activeJob: currentState.activeJob
          ? {
              ...currentState.activeJob,
              title: this.resolveSelectedCandidateTitle(currentState.activeCandidates, selection),
              stage: "awaiting_review",
              updatedAt: now
            }
          : {
              id: `job-${Date.now()}`,
              title: this.resolveSelectedCandidateTitle(currentState.activeCandidates, selection),
              stage: "awaiting_review",
              createdAt: now,
              updatedAt: now
            }
      };

      const draftResult = await this.shortformScriptService.generateDraft(
        nextState.activeJob?.title ?? `Candidate ${selection} for Korean shortform review`
      );
      nextState = {
        ...nextState,
        lastDraftSource: draftResult.source,
        lastDraftError: draftResult.error,
        lastDraft: draftResult.draft,
        lastPackagePath: undefined
      };
      await this.sendTelegramScriptReview(
        botToken,
        chatId,
        nextState.activeJob?.id ?? jobId,
        language,
        selection,
        draftResult.draft
      );
    }

    if (callbackData.startsWith("script:approve:")) {
      const [, , jobId] = callbackData.split(":");
      if (nextState.activeJob?.id && nextState.activeJob.id !== jobId) {
        await this.answerCallbackQuery(botToken, callbackId, this.t(language, "reviewInactive"));
        return nextState;
      }

      let packagePath: string | undefined;
      if (nextState.activeJob && nextState.lastDraft) {
        packagePath = this.productionPackageService.createPackage(
          nextState.activeJob,
          nextState.lastDraft
        );
      }

      nextState = {
        ...nextState,
        activeJob: nextState.activeJob
          ? {
              ...nextState.activeJob,
              stage: packagePath ? "ready" : "approved",
              updatedAt: now
            }
          : undefined,
        lastPackagePath: packagePath
      };

      await this.sendTelegramText(
        botToken,
        chatId,
        packagePath
          ? `${this.t(language, "packageReady")}\n\nPath: ${packagePath}`
          : this.t(language, "packageMissing")
      );
    }

    if (callbackData.startsWith("script:revise:")) {
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
              stage: "awaiting_review",
              updatedAt: now
            }
          : undefined
      };

      const draftResult = await this.shortformScriptService.generateDraft(
        `Revised version of ${nextState.activeJob?.title ?? "selected candidate"}`
      );
      nextState = {
        ...nextState,
        lastDraftSource: draftResult.source,
        lastDraftError: draftResult.error,
        lastDraft: draftResult.draft
      };
      await this.sendTelegramScriptReview(
        botToken,
        chatId,
        nextState.activeJob?.id ?? jobId,
        language,
        "revised",
        draftResult.draft
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
    const settings = this.settingsRepository.get();
    const language = this.resolveTelegramLanguage(settings, currentState);

    if (normalized === "/shortlist") {
      const status = await this.dispatchTrendShortlist();
      return this.readStateWithFallback(status, currentState);
    }

    if (normalized === "/lang ko" || normalized === "/lang en") {
      const nextLanguage: "en" | "ko" = normalized.endsWith("ko") ? "ko" : "en";
      const nextState = {
        ...currentState,
        telegramOutputLanguage: nextLanguage
      };
      this.writeState(nextState);
      await this.sendTelegramText(botToken, chatId, this.t(nextLanguage, "languageChanged"));
      return nextState;
    }

    if (normalized === "/status") {
      const status = this.toStatus(settings, currentState);
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
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
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
    const topGlobal = globalCandidates.slice(0, 2);
    const topDomestic = domesticCandidates.slice(0, 2);
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
    fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2), "utf-8");
  }

  private resolveTelegramLanguage(
    settings: ReturnType<SettingsRepository["get"]>,
    state: TelegramControlStateFile
  ): "en" | "ko" {
    return state.telegramOutputLanguage ?? settings.telegramOutputLanguage ?? "en";
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
