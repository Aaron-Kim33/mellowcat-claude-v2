import { spawn } from "node:child_process";
import type {
  ProcessDraftMode,
  WorkflowAiConnectionRef,
  ScriptLengthMode,
  ShortformIdeaStrategy,
  ShortformScriptCategory,
  ShortformScriptDraft,
  ShortformScriptResult
} from "../../../common/types/automation";
import type {
  YouTubeCandidateAnalysisRequest,
  YouTubeCandidateAnalysisResult
} from "../../../common/types/trend";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
import { SettingsRepository } from "../storage/settings-repository";
import { TrendDiscoveryService } from "./trend-discovery-service";

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

type ProcessSourceDraft = {
  headline?: string;
  summary?: string;
  titleOptions?: string[];
  hook?: string;
  narration?: string;
  callToAction?: string;
  operatorMemo?: string;
};

type CandidateReference = {
  type: "news" | "wiki" | "community";
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
};

type CandidateContext = {
  keywords: string[];
  references: CandidateReference[];
  wikiSummary?: string;
  transcriptExcerpt?: string;
  transcriptEvidence?: string[];
  debug: string[];
};

export class ShortformScriptService {
  private readonly trendDiscoveryService = new TrendDiscoveryService();

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

  async analyzeYouTubeCandidate(
    input: YouTubeCandidateAnalysisRequest
  ): Promise<YouTubeCandidateAnalysisResult> {
    const settings = this.settingsRepository.get();
    const workflowConfig = this.workflowConfigService.get();
    const desiredLanguage = this.resolveDraftLanguage(settings, workflowConfig);
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
    const context = await this.fetchCandidateContext(input, desiredLanguage);
    const prompt = this.buildYouTubeCandidateAnalysisPrompt(input, desiredLanguage, context);
    const contextSummary = this.buildCandidateContextSummary(context, desiredLanguage);

    try {
      if (scriptProvider === "openrouter_api" && openRouterApiKey) {
        const analysis = await this.runOpenRouterCandidateAnalysis(
          openRouterApiKey,
          openRouterModel,
          prompt
        );
        return {
          source: "openrouter",
          analysis: this.normalizeCandidateAnalysisOutput(analysis),
          contextSummary,
          transcriptEvidence: context.transcriptEvidence,
          contextDebug: context.debug,
          references: context.references
        };
      }

      if (scriptProvider === "openai_api" && openAiApiKey) {
        const analysis = await this.runOpenAICandidateAnalysis(
          openAiApiKey,
          openAiModel,
          prompt
        );
        return {
          source: "openai",
          analysis: this.normalizeCandidateAnalysisOutput(analysis),
          contextSummary,
          transcriptEvidence: context.transcriptEvidence,
          contextDebug: context.debug,
          references: context.references
        };
      }

      if (scriptProvider !== "mock" && executablePath) {
        const analysis = await this.runClaudeText(executablePath, prompt);
        return {
          source: "claude",
          analysis: this.normalizeCandidateAnalysisOutput(analysis.trim()),
          contextSummary,
          transcriptEvidence: context.transcriptEvidence,
          contextDebug: context.debug,
          references: context.references
        };
      }
    } catch (error) {
      return {
        source: "mock",
        analysis: this.normalizeCandidateAnalysisOutput(
          this.buildMockYouTubeCandidateAnalysis(input, desiredLanguage)
        ),
        contextSummary,
        transcriptEvidence: context.transcriptEvidence,
        contextDebug: context.debug,
        references: context.references,
        error: error instanceof Error ? error.message : "Unknown analysis error"
      };
    }

    return {
      source: "mock",
      analysis: this.normalizeCandidateAnalysisOutput(
        this.buildMockYouTubeCandidateAnalysis(input, desiredLanguage)
      ),
      contextSummary,
      transcriptEvidence: context.transcriptEvidence,
      contextDebug: context.debug,
      references: context.references
    };
  }

  private normalizeCandidateAnalysisOutput(text: string): string {
    return text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private async fetchCandidateContext(
    input: YouTubeCandidateAnalysisRequest,
    language: "ko" | "en"
  ): Promise<CandidateContext> {
    const keywords = this.extractCandidateKeywords(input);
    const queries = this.buildContextQueries(input, keywords);
    const debug: string[] = [`queries=${queries.join(" | ") || "-"}`];

    const [newsResult, wikiResult, communityResult, transcriptResult] = await Promise.all([
      this.fetchLatestNewsReferences(queries, language).catch((error) => ({
        references: [] as CandidateReference[],
        debug: [`news:error:${error instanceof Error ? error.message : String(error)}`]
      })),
      this.fetchWikipediaContext(queries, language).catch((error) => ({
        summary: undefined,
        reference: undefined,
        debug: [`wiki:error:${error instanceof Error ? error.message : String(error)}`]
      })),
      this.fetchCommunityReferences(queries, language).catch((error) => ({
        references: [] as CandidateReference[],
        debug: [`community:error:${error instanceof Error ? error.message : String(error)}`]
      })),
      this.fetchYouTubeTranscriptContext(input, language).catch((error) => ({
        transcriptExcerpt: undefined,
        transcriptEvidence: undefined,
        debug: [`transcript:error:${error instanceof Error ? error.message : String(error)}`]
      }))
    ]);

    debug.push(...newsResult.debug);
    if (wikiResult?.debug?.length) {
      debug.push(...wikiResult.debug);
    }
    debug.push(...communityResult.debug);
    if (transcriptResult?.debug?.length) {
      debug.push(...transcriptResult.debug);
    }

    const references: CandidateReference[] = [...newsResult.references, ...communityResult.references];
    if (wikiResult?.reference) {
      references.unshift(wikiResult.reference);
    }

    return {
      keywords,
      references,
      wikiSummary: wikiResult?.summary,
      transcriptExcerpt: transcriptResult?.transcriptExcerpt,
      transcriptEvidence: transcriptResult?.transcriptEvidence,
      debug
    };
  }

  private buildContextQueries(
    input: YouTubeCandidateAnalysisRequest,
    keywords: string[]
  ): string[] {
    const fromKeywords = keywords.join(" ").trim();
    const rawTitle = (input.title ?? "").trim();
    const normalizedTitle = rawTitle
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const shorterTitle = normalizedTitle.split(" ").slice(0, 6).join(" ").trim();

    const candidates = [fromKeywords, rawTitle, normalizedTitle, shorterTitle]
      .map((value) => value.trim())
      .filter(Boolean);

    return [...new Set(candidates)];
  }

  private buildCandidateContextSummary(
    context: CandidateContext,
    language: "ko" | "en"
  ): string | undefined {
    if (!context.wikiSummary && context.references.length === 0) {
      return undefined;
    }

    const newsCount = context.references.filter((item) => item.type === "news").length;
    const communityCount = context.references.filter((item) => item.type === "community").length;
    if (language === "en") {
      return [
        context.wikiSummary ? `Wiki brief: ${context.wikiSummary}` : undefined,
        newsCount > 0 ? `Recent related news: ${newsCount} item(s)` : undefined,
        communityCount > 0 ? `Community references: ${communityCount} item(s)` : undefined,
        context.transcriptExcerpt ? "Transcript context: loaded" : undefined
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      context.wikiSummary ? `위키 요약: ${context.wikiSummary}` : undefined,
      newsCount > 0 ? `최근 연관 뉴스: ${newsCount}건` : undefined
    ]
      .filter(Boolean)
      .join("\n");
  }

  private extractCandidateKeywords(input: YouTubeCandidateAnalysisRequest): string[] {
    const seed = [input.title, input.summary ?? "", input.sourceLabel ?? ""]
      .join(" ")
      .toLowerCase();
    const normalized = seed
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return [];
    }

    const stopwords = new Set([
      "the",
      "and",
      "for",
      "with",
      "this",
      "that",
      "from",
      "video",
      "topic",
      "official",
      "music",
      "가사",
      "공식",
      "영상",
      "채널",
      "유튜브"
    ]);

    const tokens = normalized
      .split(" ")
      .filter((token) => token.length >= 2 && !stopwords.has(token));
    const deduped: string[] = [];
    for (const token of tokens) {
      if (!deduped.includes(token)) {
        deduped.push(token);
      }
      if (deduped.length >= 6) {
        break;
      }
    }
    return deduped;
  }

  private async fetchLatestNewsReferences(
    queries: string[],
    language: "ko" | "en"
  ): Promise<{ references: CandidateReference[]; debug: string[] }> {
    const debug: string[] = [];
    if (queries.length === 0) {
      debug.push("news:skip:no_query");
      return { references: [], debug };
    }

    const locale = language === "en" ? "US:en" : "KR:ko";
    const [gl, hl] = locale.split(":");
    for (const query of queries) {
      const windows = ["7d", "30d"] as const;
      for (const window of windows) {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
          `${query} when:${window}`
        )}&hl=${hl}&gl=${gl}&ceid=${locale}`;
        let response: Response;
        try {
          response = await fetch(rssUrl);
        } catch (error) {
          debug.push(
            `news:fetch_error:query=${query}:window=${window}:${
              error instanceof Error ? error.message : String(error)
            }`
          );
          continue;
        }
        if (!response.ok) {
          debug.push(`news:http_${response.status}:query=${query}:window=${window}`);
          continue;
        }
        const xml = await response.text();
        const items = this.parseGoogleNewsRss(xml);
        debug.push(`news:ok:query=${query}:window=${window}:items=${items.length}`);
        if (items.length > 0) {
          return { references: items.slice(0, 5), debug };
        }
      }
    }

    debug.push("news:empty");
    return { references: [], debug };
  }

  private parseGoogleNewsRss(xml: string): CandidateReference[] {
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const references: CandidateReference[] = [];
    for (const itemXml of itemMatches) {
      const title = this.decodeHtmlEntities(this.extractXmlTag(itemXml, "title") ?? "").trim();
      const rawLink = (this.extractXmlTag(itemXml, "link") ?? "").trim();
      const link = this.normalizeGoogleNewsLink(rawLink);
      if (!title || !link) {
        continue;
      }

      const sourceTitle = this.decodeHtmlEntities(
        this.extractXmlTag(itemXml, "source") ?? ""
      ).trim();
      const publishedRaw = this.extractXmlTag(itemXml, "pubDate") ?? "";
      const parsedDate = publishedRaw ? new Date(publishedRaw) : undefined;
      const publishedAt =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString().slice(0, 10)
          : undefined;

      references.push({
        type: "news",
        title: title.replace(/\s*-\s*[^-]+$/, "").trim(),
        url: link,
        source: sourceTitle || "Google News",
        publishedAt
      });
    }

    const deduped: CandidateReference[] = [];
    for (const item of references) {
      if (!deduped.some((existing) => existing.url === item.url)) {
        deduped.push(item);
      }
    }
    return deduped;
  }

  private async fetchYouTubeTranscriptContext(
    input: YouTubeCandidateAnalysisRequest,
    language: "ko" | "en"
  ): Promise<{ transcriptExcerpt?: string; transcriptEvidence?: string[]; debug: string[] }> {
    const debug: string[] = [];
    const videoId = this.extractYouTubeVideoId(input.sourceUrl);
    if (!videoId) {
      debug.push("transcript:skip:no_video_id");
      return { debug };
    }

    const preferredLanguage = language === "ko" ? "ko" : "en";
    const player = await this.fetchYouTubePlayerCaptions(videoId, preferredLanguage, debug);
    if (!player?.captionTracks?.length) {
      debug.push("transcript:empty:no_caption_tracks");
      return { debug };
    }

    const directTrack = this.pickCaptionTrack(player.captionTracks, preferredLanguage, false);
    const asrTrack = this.pickCaptionTrack(player.captionTracks, preferredLanguage, true);
    const selectedTrack = directTrack ?? asrTrack ?? player.captionTracks[0];
    if (!selectedTrack?.baseUrl) {
      debug.push("transcript:empty:no_base_url");
      return { debug };
    }

    const mode =
      selectedTrack.kind === "asr" || selectedTrack.vssId?.includes(".asr") ? "stt_fallback" : "caption";
    const xmlUrl = selectedTrack.baseUrl.includes("fmt=")
      ? selectedTrack.baseUrl
      : `${selectedTrack.baseUrl}&fmt=srv3`;
    let response: Response;
    try {
      response = await fetch(xmlUrl);
    } catch (error) {
      debug.push(`transcript:fetch_error:${error instanceof Error ? error.message : String(error)}`);
      return { debug };
    }
    if (!response.ok) {
      debug.push(`transcript:http_${response.status}`);
      return { debug };
    }
    const xml = await response.text();
    const transcript = this.parseYouTubeCaptionXml(xml);
    if (!transcript) {
      debug.push(`transcript:empty:${mode}`);
      return { debug };
    }

    const excerpt = transcript.slice(0, 2400);
    const transcriptEvidence = this.buildTranscriptEvidenceLines(transcript);
    debug.push(
      `transcript:ok:${mode}:lang=${selectedTrack.languageCode ?? "-"}:chars=${excerpt.length}`
    );
    return { transcriptExcerpt: excerpt, transcriptEvidence, debug };
  }

  private extractYouTubeVideoId(sourceUrl?: string): string | undefined {
    if (!sourceUrl?.trim()) {
      return undefined;
    }
    try {
      const parsed = new URL(sourceUrl);
      const watchId = parsed.searchParams.get("v")?.trim();
      if (watchId) {
        return watchId;
      }
      if (parsed.hostname.includes("youtu.be")) {
        const shortId = parsed.pathname.replaceAll("/", "").trim();
        if (shortId) {
          return shortId;
        }
      }
      const embedMatch = parsed.pathname.match(/\/embed\/([^/?]+)/);
      if (embedMatch?.[1]) {
        return embedMatch[1];
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private async fetchYouTubePlayerCaptions(
    videoId: string,
    preferredLanguage: "ko" | "en",
    debug: string[]
  ): Promise<{
    captionTracks: Array<{
      baseUrl?: string;
      languageCode?: string;
      kind?: string;
      vssId?: string;
      name?: { simpleText?: string };
    }>;
  } | null> {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    let response: Response;
    try {
      response = await fetch(watchUrl, {
        headers: {
          "Accept-Language": preferredLanguage === "ko" ? "ko-KR,ko;q=0.9,en;q=0.6" : "en-US,en;q=0.9"
        }
      });
    } catch (error) {
      debug.push(`transcript:watch_fetch_error:${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    if (!response.ok) {
      debug.push(`transcript:watch_http_${response.status}`);
      return null;
    }
    const html = await response.text();
    const jsonText = this.extractPlayerResponseJson(html);
    if (!jsonText) {
      debug.push("transcript:player_response_missing");
      return null;
    }
    try {
      const parsed = JSON.parse(jsonText) as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{
              baseUrl?: string;
              languageCode?: string;
              kind?: string;
              vssId?: string;
              name?: { simpleText?: string };
            }>;
          };
        };
      };
      const tracks = parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      debug.push(`transcript:tracks=${tracks.length}`);
      return { captionTracks: tracks };
    } catch (error) {
      debug.push(`transcript:player_parse_error:${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private extractPlayerResponseJson(html: string): string | undefined {
    const patterns = [
      /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*var\s+meta/i,
      /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/i,
      /"ytInitialPlayerResponse"\s*:\s*(\{[\s\S]*?\})\s*,\s*"ytInitialData"/i
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    return undefined;
  }

  private pickCaptionTrack(
    tracks: Array<{ baseUrl?: string; languageCode?: string; kind?: string; vssId?: string }>,
    preferredLanguage: "ko" | "en",
    asr: boolean
  ) {
    const languageMatches = tracks.filter((track) => track.languageCode === preferredLanguage);
    const pool = languageMatches.length > 0 ? languageMatches : tracks;
    const picked = pool.find((track) => this.isAsrTrack(track) === asr);
    return picked;
  }

  private isAsrTrack(track: { kind?: string; vssId?: string }): boolean {
    return track.kind === "asr" || track.vssId?.includes(".asr") === true;
  }

  private parseYouTubeCaptionXml(xml: string): string {
    const chunks = xml.match(/<text[\s\S]*?>([\s\S]*?)<\/text>/g) ?? [];
    const lines: string[] = [];
    for (const chunk of chunks) {
      const match = chunk.match(/<text[\s\S]*?>([\s\S]*?)<\/text>/i);
      const text = this.decodeHtmlEntities(match?.[1] ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        lines.push(text);
      }
      if (lines.length >= 120) {
        break;
      }
    }
    return lines.join(" ");
  }

  private buildTranscriptEvidenceLines(transcript: string): string[] {
    const cleaned = transcript
      .split(/[\n。.!?]+/g)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 12);
    const deduped: string[] = [];
    for (const line of cleaned) {
      if (!deduped.some((existing) => existing === line)) {
        deduped.push(line);
      }
      if (deduped.length >= 10) {
        break;
      }
    }
    return deduped;
  }

  private async fetchCommunityReferences(
    queries: string[],
    language: "ko" | "en"
  ): Promise<{ references: CandidateReference[]; debug: string[] }> {
    const debug: string[] = [];
    if (queries.length === 0) {
      debug.push("community:skip:no_query");
      return { references: [], debug };
    }

    const normalizedQueries = queries
      .map((query) => this.normalizeCommunityText(query))
      .filter(Boolean);
    const stopwords = new Set([
      "the",
      "and",
      "for",
      "with",
      "that",
      "this",
      "from",
      "video",
      "topic",
      "official",
      "music",
      "mv",
      "m/v",
      "teaser",
      "shorts",
      "live",
      "cover",
      "lyrics",
      "lyric",
      "reaction",
      "dance",
      "studio",
      "today",
      "issue",
      "story",
      "korea",
      "한국",
      "영상",
      "채널",
      "커뮤니티",
      "이거",
      "그거",
      "진짜",
      "그냥",
      "요약",
      "정리"
    ]);
    const queryTokens = normalizedQueries
      .join(" ")
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => this.isMeaningfulCommunityToken(token, stopwords));
    const tokenSet = new Set(queryTokens);
    if (tokenSet.size === 0) {
      debug.push("community:skip:no_strict_tokens");
      return { references: [], debug };
    }
    const anchorTokens = this.buildCommunityAnchorTokens(normalizedQueries, tokenSet);
    if (anchorTokens.length === 0) {
      debug.push("community:skip:no_anchor_tokens");
      return { references: [], debug };
    }

    const discovered = await this.trendDiscoveryService.discoverCandidates({
      regions: ["global", "domestic"],
      limit: 30,
      timeWindow: "3d"
    });

    const communityKinds = new Set(["reddit", "fmkorea", "dcinside", "nate-pann"]);
    const communityCandidates = discovered.candidates.filter((candidate) =>
      communityKinds.has(candidate.sourceKind)
    );
    const scored = communityCandidates
      .map((candidate) => {
        const text = this.normalizeCommunityText(
          `${candidate.title} ${candidate.summary} ${candidate.operatorSummary}`
        );
        const titleText = this.normalizeCommunityText(candidate.title);
        const phraseMatch = normalizedQueries.some(
          (query) => query.length >= 8 && text.includes(query)
        );
        let anchorHits = 0;
        for (const token of anchorTokens) {
          if (this.communityTokenMatch(text, token)) {
            anchorHits += 1;
          }
        }
        let overlapCount = 0;
        for (const token of tokenSet) {
          if (this.communityTokenMatch(text, token)) {
            overlapCount += 1;
          }
        }
        let titleOverlap = 0;
        for (const token of tokenSet) {
          if (this.communityTokenMatch(titleText, token)) {
            titleOverlap += 1;
          }
        }
        const overlapRatio = overlapCount / tokenSet.size;
        const passed =
          (phraseMatch || (overlapCount >= 2 && overlapRatio >= 0.34)) &&
          anchorHits >= 1 &&
          titleOverlap >= 1;
        const relevanceScore =
          (phraseMatch ? 120 : 0) +
          anchorHits * 32 +
          titleOverlap * 20 +
          overlapCount * 12 +
          overlapRatio * 28 +
          candidate.score * 0.03;
        return {
          candidate,
          overlapCount,
          overlapRatio,
          phraseMatch,
          anchorHits,
          titleOverlap,
          passed,
          relevanceScore
        };
      })
      .filter((item) => item.passed)
      .sort((left, right) => right.relevanceScore - left.relevanceScore)
      .slice(0, 6);

    if (scored.length === 0) {
      debug.push(
        `community:empty:strict_filter:tokens=${tokenSet.size}:anchors=${anchorTokens.length}`
      );
      return { references: [], debug };
    }

    debug.push(
      `community:ok:candidates=${scored.length}:tokens=${tokenSet.size}:anchors=${anchorTokens.length}`
    );
    const references: CandidateReference[] = scored.map(
      ({ candidate, overlapCount, overlapRatio, anchorHits, titleOverlap }) => ({
        type: "community",
        title: candidate.title,
        url: candidate.sourceUrl ?? "",
        source: candidate.sourceLabel || candidate.sourceKind,
        snippet:
          (language === "en" ? candidate.summary : candidate.operatorSummary) +
          ` (anchor ${anchorHits}, title ${titleOverlap}, match ${overlapCount}/${tokenSet.size}, ${Math.round(
            overlapRatio * 100
          )}%)`
      })
    );

    return {
      references: references.filter((item) => item.url.trim().length > 0).slice(0, 3),
      debug
    };
  }

  private normalizeCommunityText(input: string): string {
    return input
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private isMeaningfulCommunityToken(token: string, stopwords: Set<string>): boolean {
    if (!token || stopwords.has(token) || /^\d+$/.test(token)) {
      return false;
    }
    if (this.hasCjk(token)) {
      return token.length >= 2;
    }
    return token.length >= 3;
  }

  private buildCommunityAnchorTokens(normalizedQueries: string[], tokenSet: Set<string>): string[] {
    const anchors: string[] = [];
    for (const query of normalizedQueries) {
      const tokens = query
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
      for (const token of tokens) {
        if (!tokenSet.has(token)) {
          continue;
        }
        if (this.hasCjk(token)) {
          if (token.length >= 3 && !anchors.includes(token)) {
            anchors.push(token);
          }
          continue;
        }
        if (token.length >= 4 && !anchors.includes(token)) {
          anchors.push(token);
        }
      }
    }
    return anchors.slice(0, 8);
  }

  private communityTokenMatch(text: string, token: string): boolean {
    if (!text || !token) {
      return false;
    }
    if (this.hasCjk(token)) {
      return text.includes(token);
    }
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
    return pattern.test(text);
  }

  private hasCjk(text: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
  }

  private async fetchWikipediaContext(
    queries: string[],
    language: "ko" | "en"
  ): Promise<{ summary?: string; reference?: CandidateReference; debug: string[] }> {
    const debug: string[] = [];
    if (queries.length === 0) {
      debug.push("wiki:skip:no_query");
      return { debug };
    }
    const wikiHost = language === "en" ? "en.wikipedia.org" : "ko.wikipedia.org";
    let title: string | undefined;
    let pageUrl: string | undefined;
    let matchedQuery: string | undefined;
    for (const query of queries) {
      const searchUrl = `https://${wikiHost}/w/api.php?action=opensearch&search=${encodeURIComponent(
        query
      )}&limit=1&namespace=0&format=json`;
      let searchResponse: Response;
      try {
        searchResponse = await fetch(searchUrl);
      } catch (error) {
        debug.push(
          `wiki:search_fetch_error:query=${query}:${
            error instanceof Error ? error.message : String(error)
          }`
        );
        continue;
      }
      if (!searchResponse.ok) {
        debug.push(`wiki:search_http_${searchResponse.status}:query=${query}`);
        continue;
      }
      const searchPayload = (await searchResponse.json()) as [string, string[], string[], string[]];
      title = searchPayload?.[1]?.[0];
      pageUrl = searchPayload?.[3]?.[0];
      debug.push(`wiki:search_ok:query=${query}:found=${title ? "yes" : "no"}`);
      if (title && pageUrl) {
        matchedQuery = query;
        break;
      }
    }
    if (!title || !pageUrl) {
      debug.push("wiki:empty");
      return { debug };
    }

    const summaryUrl = `https://${wikiHost}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) {
      debug.push(`wiki:summary_http_${summaryResponse.status}:title=${title}`);
      throw new Error(`Wikipedia summary HTTP ${summaryResponse.status}`);
    }
    const summaryPayload = (await summaryResponse.json()) as {
      extract?: string;
      title?: string;
      content_urls?: {
        desktop?: {
          page?: string;
        };
      };
    };

    const summaryText = (summaryPayload.extract ?? "").trim();
    const referenceTitle = summaryPayload.title?.trim() || title;
    const referenceUrl = summaryPayload.content_urls?.desktop?.page?.trim() || pageUrl;
    debug.push(
      `wiki:summary_ok:title=${referenceTitle}:query=${matchedQuery ?? "-"}:has_extract=${
        summaryText ? "yes" : "no"
      }`
    );

    return {
      summary: summaryText ? summaryText.slice(0, 280) : undefined,
      reference: {
        type: "wiki",
        title: referenceTitle,
        url: referenceUrl,
        source: "Wikipedia"
      },
      debug
    };
  }

  private normalizeGoogleNewsLink(link: string): string {
    if (!link.trim()) {
      return "";
    }
    if (link.startsWith("https://") || link.startsWith("http://")) {
      return link;
    }
    if (link.startsWith("./")) {
      return `https://news.google.com/${link.slice(2)}`;
    }
    if (link.startsWith("/")) {
      return `https://news.google.com${link}`;
    }
    return link;
  }

  private extractXmlTag(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match?.[1];
  }

  private decodeHtmlEntities(input: string): string {
    return input
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  async generateDraft(
    selection: string,
    revisionRequest?: string,
    scriptCategory: ShortformScriptCategory = "community",
    ideaStrategy?: ShortformIdeaStrategy,
    lengthMode?: ScriptLengthMode,
    draftMode?: ProcessDraftMode,
    sourceDraft?: ProcessSourceDraft
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
    const resolvedIdeaStrategy: ShortformIdeaStrategy =
      ideaStrategy ?? workflowConfig.processIdeaStrategy ?? "comment_gap";
    const resolvedLengthMode: ScriptLengthMode =
      lengthMode ?? workflowConfig.processLengthMode ?? "auto";
    const resolvedDraftMode: ProcessDraftMode =
      draftMode ?? workflowConfig.processDraftMode ?? "manual_polish";
    const resolvedNarrativeFormat = this.resolveNarrativeFormat(
      resolvedLengthMode,
      workflowConfig.createTargetDurationSec
    );
    const sanitizedSelection = this.stripBenchmarkMetaFromText(selection, desiredLanguage);
    const sanitizedSourceDraft = this.stripBenchmarkMetaFromSourceDraft(sourceDraft);

    if (!processAiGenerationEnabled) {
      return {
        source: "mock",
        draft: this.sanitizeDraftForYoutube(
          this.buildLocalizedTemplateDraft(
            sanitizedSelection,
            revisionRequest,
            desiredLanguage,
            backgroundSubtitleMode,
            resolvedNarrativeFormat
          ),
          desiredLanguage
        ),
        error: "AI draft generation is disabled for the process slot."
      };
    }

    if (scriptProvider === "openrouter_api" && openRouterApiKey) {
      try {
        const draft = await this.runOpenRouter(
          openRouterApiKey,
          openRouterModel,
          sanitizedSelection,
          revisionRequest,
          desiredLanguage,
          backgroundSubtitleMode,
          scriptCategory,
          resolvedIdeaStrategy,
          resolvedNarrativeFormat,
          resolvedDraftMode,
          sanitizedSourceDraft
        );
        return {
          source: "openrouter",
          draft: this.sanitizeDraftForYoutube(draft, desiredLanguage)
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.sanitizeDraftForYoutube(
            this.buildLocalizedMockDraft(
              sanitizedSelection,
              desiredLanguage,
              backgroundSubtitleMode,
              resolvedNarrativeFormat
            ),
            desiredLanguage
          ),
          error: error instanceof Error ? error.message : "Unknown OpenRouter generation error"
        };
      }
    }

    if (scriptProvider === "openai_api" && openAiApiKey) {
      try {
        const draft = await this.runOpenAI(
          openAiApiKey,
          openAiModel,
          sanitizedSelection,
          revisionRequest,
          desiredLanguage,
          backgroundSubtitleMode,
          scriptCategory,
          resolvedIdeaStrategy,
          resolvedNarrativeFormat,
          resolvedDraftMode,
          sanitizedSourceDraft
        );
        return {
          source: "openai",
          draft: this.sanitizeDraftForYoutube(draft, desiredLanguage)
        };
      } catch (error) {
        return {
          source: "mock",
          draft: this.sanitizeDraftForYoutube(
            this.buildLocalizedMockDraft(
              sanitizedSelection,
              desiredLanguage,
              backgroundSubtitleMode,
              resolvedNarrativeFormat
            ),
            desiredLanguage
          ),
          error: error instanceof Error ? error.message : "Unknown OpenAI generation error"
        };
      }
    }

    if (scriptProvider === "mock") {
      return {
        source: "mock",
        draft: this.sanitizeDraftForYoutube(
          this.buildLocalizedMockDraft(
            sanitizedSelection,
            desiredLanguage,
            backgroundSubtitleMode,
            resolvedNarrativeFormat
          ),
          desiredLanguage
        ),
        error: "Script provider is set to mock."
      };
    }

    if (!executablePath) {
      return {
        source: "mock",
        draft: this.sanitizeDraftForYoutube(
          this.buildLocalizedMockDraft(
            sanitizedSelection,
            desiredLanguage,
            backgroundSubtitleMode,
            resolvedNarrativeFormat
          ),
          desiredLanguage
        ),
        error:
          scriptProvider === "claude_cli"
            ? "Claude executable path is not configured."
            : scriptProvider === "openai_api"
              ? "No OpenAI API key configured, and Claude executable path is not configured."
              : "No OpenRouter API key configured, and Claude executable path is not configured."
      };
    }

    const prompt = this.buildClaudeDraftPrompt(
      sanitizedSelection,
      revisionRequest,
      desiredLanguage,
      backgroundSubtitleMode,
      scriptCategory,
      resolvedIdeaStrategy,
      resolvedNarrativeFormat,
      resolvedDraftMode,
      sanitizedSourceDraft
    );

    try {
      const stdout = await this.runClaudePrint(executablePath, prompt);
      const parsed = this.parseAndValidateDraft(stdout.trim(), desiredLanguage, "Claude");

      return {
        source: "claude",
        draft: this.sanitizeDraftForYoutube(parsed, desiredLanguage)
      };
    } catch (error) {
      return {
        source: "mock",
        draft: this.sanitizeDraftForYoutube(
          this.buildLocalizedMockDraft(
            sanitizedSelection,
            desiredLanguage,
            backgroundSubtitleMode,
            resolvedNarrativeFormat
          ),
          desiredLanguage
        ),
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

  private runClaudeText(executablePath: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, ["-p", prompt], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });

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
          resolve(stdout.trim());
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
    scriptCategory: ShortformScriptCategory = "community",
    ideaStrategy: ShortformIdeaStrategy = "comment_gap",
    narrativeFormat: "shortform" | "longform" = "shortform",
    draftMode: ProcessDraftMode = "auto_generate",
    sourceDraft?: ProcessSourceDraft
  ): Promise<ShortformScriptDraft> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mellowcat.xyz",
        "X-Title": "MellowCat Launcher"
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: this.buildDraftSystemPrompt(
              desiredLanguage,
              backgroundSubtitleMode,
              scriptCategory,
              ideaStrategy,
              narrativeFormat,
              draftMode
            )
          },
          {
            role: "user",
            content: this.buildDraftUserPrompt(
              selection,
              revisionRequest,
              desiredLanguage,
              backgroundSubtitleMode,
              scriptCategory,
              ideaStrategy,
              narrativeFormat,
              draftMode,
              sourceDraft
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
        "HTTP-Referer": "https://mellowcat.xyz",
        "X-Title": "MellowCat Launcher"
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

  private async runOpenRouterCandidateAnalysis(
    apiKey: string,
    model: string,
    prompt: string
  ): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mellowcat.xyz",
        "X-Title": "MellowCat Launcher"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a Korean YouTube benchmark analyst. Keep the answer short, practical, and creator-focused."
          },
          {
            role: "user",
            content: prompt
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
      throw new Error("OpenRouter returned empty candidate analysis");
    }

    return content;
  }

  private async runOpenAI(
    apiKey: string,
    model: string,
    selection: string,
    revisionRequest?: string,
    desiredLanguage: "ko" | "en" = "ko",
    backgroundSubtitleMode = false,
    scriptCategory: ShortformScriptCategory = "community",
    ideaStrategy: ShortformIdeaStrategy = "comment_gap",
    narrativeFormat: "shortform" | "longform" = "shortform",
    draftMode: ProcessDraftMode = "auto_generate",
    sourceDraft?: ProcessSourceDraft
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
            content: this.buildDraftSystemPrompt(
              desiredLanguage,
              backgroundSubtitleMode,
              scriptCategory,
              ideaStrategy,
              narrativeFormat,
              draftMode
            )
          },
          {
            role: "user",
            content: this.buildDraftUserPrompt(
              selection,
              revisionRequest,
              desiredLanguage,
              backgroundSubtitleMode,
              scriptCategory,
              ideaStrategy,
              narrativeFormat,
              draftMode,
              sourceDraft
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

  private async runOpenAICandidateAnalysis(
    apiKey: string,
    model: string,
    prompt: string
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
              "You are a Korean YouTube benchmark analyst. Keep output concise and actionable for shortform creators."
          },
          {
            role: "user",
            content: prompt
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
      throw new Error("OpenAI returned empty candidate analysis");
    }

    return content;
  }

  private buildLocalizedMockDraft(
    selection: string,
    language: "ko" | "en",
    backgroundSubtitleMode = false,
    _narrativeFormat: "shortform" | "longform" = "shortform"
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
    backgroundSubtitleMode = false,
    narrativeFormat: "shortform" | "longform" = "shortform"
  ): ShortformScriptDraft {
    if (language === "en") {
      return this.buildTemplateDraft(selection, revisionRequest, narrativeFormat);
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

  private buildTemplateDraft(
    selection: string,
    revisionRequest?: string,
    _narrativeFormat: "shortform" | "longform" = "shortform"
  ): ShortformScriptDraft {
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
    scriptCategory: ShortformScriptCategory,
    ideaStrategy: ShortformIdeaStrategy,
    narrativeFormat: "shortform" | "longform",
    draftMode: ProcessDraftMode,
    sourceDraft?: ProcessSourceDraft
  ): string {
    return [
      this.buildDraftSystemPrompt(
        desiredLanguage,
        backgroundSubtitleMode,
        scriptCategory,
        ideaStrategy,
        narrativeFormat,
        draftMode
      ),
      this.buildDraftUserPrompt(
        selection,
        revisionRequest,
        desiredLanguage,
        backgroundSubtitleMode,
        scriptCategory,
        ideaStrategy,
        narrativeFormat,
        draftMode,
        sourceDraft
      )
    ].join("\n");
  }

  private buildDraftSystemPrompt(
    desiredLanguage: "ko" | "en",
    backgroundSubtitleMode: boolean,
    scriptCategory: ShortformScriptCategory,
    ideaStrategy: ShortformIdeaStrategy,
    narrativeFormat: "shortform" | "longform",
    draftMode: ProcessDraftMode = "auto_generate"
  ): string {
    const draftModeHint =
      draftMode === "manual_polish"
        ? "Draft mode: manual polish. Refine operator-provided draft fields while preserving core intent and facts. If operator memo exists, treat it as high-priority direction for tone and structure."
        : "Draft mode: auto generate from the selected topic.";

    if (desiredLanguage === "ko" && backgroundSubtitleMode) {
      return [
        narrativeFormat === "longform"
          ? "You are a Korean longform writer specialized in story-driven background subtitle videos."
          : "You are a Korean shortform writer specialized in story-driven background subtitle videos.",
        draftModeHint,
        "Return strict JSON only with keys: titleOptions, hook, narration, callToAction.",
        "All values must be written in natural Korean.",
        "The narration must read well as Korean subtitles and Korean TTS.",
        "The titleOptions quality matters as much as the narration quality.",
        "Do not copy the source title verbatim.",
        "Each title must feel like a Korean shortform title, not a summary heading.",
        "Never output meta instructions, operator directives, or revision request sentences verbatim.",
        narrativeFormat === "longform"
          ? "This is not a summary task. It is an adaptation task for a high-retention Korean longform script."
          : "This is not a summary task. It is an adaptation task for a high-retention Korean shortform script.",
        narrativeFormat === "longform"
          ? "You may reorganize the order of events and expand key beats so the story sustains longer watch time."
          : "You may reorganize the order of events, compress details, and rewrite sentences so the story lands harder in shortform.",
        "Prefer short spoken sentences with strong emotional continuity and clear escalation.",
        "Write like a real person is telling a gripping story out loud, not like an article is being summarized.",
        "The first line must create immediate tension or curiosity.",
        "Every later line must either deepen emotion, add a strange detail, or sharpen the conflict.",
        "Avoid vague filler, generic commentary, abstract recap language, and distant explanation.",
        "Do not use English phrases or English CTA lines unless a proper noun must remain in English.",
        "YouTube-safe wording only: avoid explicit sexual wording (e.g., 섹스, 성행위, 성교) and rewrite into safer phrasing.",
        "Never include benchmark metrics in spoken script text (views, subscribers, percentages, breakout ratio, performance labels). Use them only as internal reference.",
        this.buildEnhancedCategorySystemHint(scriptCategory),
        this.buildIdeaStrategySystemHint(ideaStrategy),
        this.buildNarrativeFormatSystemHint(narrativeFormat)
      ].join(" ");
    }

    return desiredLanguage === "ko"
      ? [
          narrativeFormat === "longform"
            ? "You are a Korean longform content strategist."
            : "You are a Korean shortform content strategist.",
          draftModeHint,
          "Return strict JSON only with keys: titleOptions, hook, narration, callToAction.",
          "All values must be written in natural Korean.",
          "Do not mix in English slogans, English hooks, or English CTA lines.",
          "Never output meta instructions, operator directives, or revision request sentences verbatim.",
          "The titleOptions quality matters as much as the narration quality.",
          "Do not copy the source title verbatim.",
          "Each title must feel like a Korean shortform title, not a summary heading.",
          "Use YouTube-safe wording: avoid explicit sexual words and prefer neutral euphemisms.",
          "Never include benchmark metrics in spoken script text (views, subscribers, percentages, breakout ratio, performance labels). Use them only as internal reference.",
          this.buildCategorySystemHint(scriptCategory),
          this.buildIdeaStrategySystemHint(ideaStrategy),
          this.buildNarrativeFormatSystemHint(narrativeFormat)
        ].join(" ")
      : "You are an English shortform content strategist. Return strict JSON only with keys: titleOptions, hook, narration, callToAction.";
  }

  private buildDraftUserPrompt(
    selection: string,
    revisionRequest: string | undefined,
    desiredLanguage: "ko" | "en",
    backgroundSubtitleMode: boolean,
    scriptCategory: ShortformScriptCategory,
    ideaStrategy: ShortformIdeaStrategy,
    narrativeFormat: "shortform" | "longform",
    draftMode: ProcessDraftMode = "auto_generate",
    sourceDraft?: ProcessSourceDraft
  ): string {
    const sentenceRule =
      narrativeFormat === "longform"
        ? "- narration: 18 to 36 short spoken sentences."
        : "- narration: 6 to 10 short spoken sentences.";
    const sourceTitles = (sourceDraft?.titleOptions ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 5);
    const hasSourceDraft =
      Boolean(sourceDraft?.headline?.trim()) ||
      Boolean(sourceDraft?.summary?.trim()) ||
      sourceTitles.length > 0 ||
      Boolean(sourceDraft?.hook?.trim()) ||
      Boolean(sourceDraft?.narration?.trim()) ||
      Boolean(sourceDraft?.callToAction?.trim()) ||
      Boolean(sourceDraft?.operatorMemo?.trim());
    const manualPolishRule =
      draftMode === "manual_polish"
        ? [
            "Polish mode instructions:",
            "- Refine the operator draft instead of replacing it wholesale.",
            "- Preserve factual core and intended angle.",
            "- If a field is empty, fill it from the selected topic in matching tone.",
            "- Do not invent major new claims that are not implied by source inputs.",
            "- If operatorMemo exists, treat it as the main creative direction and transform it into publish-ready YouTube wording.",
            "- Do not copy operatorMemo or revision request lines directly; rewrite them into natural script sentences.",
            hasSourceDraft
              ? "- Source draft is present. Treat it as the primary material."
              : "- Source draft is missing. Fall back to auto generation."
          ].join("\n")
        : "";
    const sourceDraftSection =
      draftMode === "manual_polish"
        ? [
            "Operator draft input:",
            `- headline: ${sourceDraft?.headline?.trim() || "(empty)"}`,
            `- summary: ${sourceDraft?.summary?.trim() || "(empty)"}`,
            `- titleOptions: ${
              sourceTitles.length > 0 ? sourceTitles.join(" | ") : "(empty)"
            }`,
            `- hook: ${sourceDraft?.hook?.trim() || "(empty)"}`,
            `- narration: ${sourceDraft?.narration?.trim() || "(empty)"}`,
            `- callToAction: ${sourceDraft?.callToAction?.trim() || "(empty)"}`,
            `- operatorMemo: ${sourceDraft?.operatorMemo?.trim() || "(empty)"}`
          ].join("\n")
        : "";

    if (desiredLanguage === "ko" && backgroundSubtitleMode) {
      return [
        `Selected topic: ${selection}`,
        "Audience: Korean social media users.",
        draftMode === "manual_polish"
          ? "Process mode: manual draft + AI polish."
          : "Process mode: auto generation.",
        narrativeFormat === "longform"
          ? "Format: background-subtitle longform storytelling video."
          : "Format: background-subtitle story short.",
        "Write for a listener who is reading subtitles on top of a static or looping background.",
        "titleOptions must be an array with exactly 3 Korean strings.",
        this.buildEnhancedTitleInstruction(scriptCategory),
        "Return natural Korean output for all fields.",
        "Narration rules:",
        "- hook: exactly one sharp opening line.",
        sentenceRule,
        "- each sentence should feel readable in subtitles and natural in Korean TTS.",
        "- the script should feel adapted and dramatized for retention, not summarized like a recap.",
        "- do not say '이 사건은', '네티즌들은', '요약하면', '정리하면', or other summary-anchor phrases.",
        "- do not explain from a distance. Tell it as if you are pulling the listener into the moment.",
        "- make the middle build by stacking specific details, reactions, or emotional shifts.",
        "- end with an aftertaste, twist, or emotional sting instead of a flat explanation.",
        "- avoid explicit sexual wording; use platform-safe neutral phrasing.",
        "- never mention benchmark stats in script text (views, subscribers, percentages, breakout ratio, performance metrics).",
        "Good direction example: '처음엔 그냥 이상한 줄 알았는데, 그때부터 하나씩 소름 돋는 일이 이어졌어요.'",
        "Bad direction example: '이 사건은 한 온라인 커뮤니티에서 화제가 된 글로, 여러 반응이 이어졌습니다.'",
        this.buildEnhancedCategoryUserPrompt(scriptCategory, narrativeFormat),
        this.buildIdeaStrategyUserPrompt(ideaStrategy),
        manualPolishRule,
        sourceDraftSection,
        revisionRequest ? `Revision request: ${revisionRequest}` : "",
      ].join("\n");
    }

    return [
      `Selected topic: ${selection}`,
      desiredLanguage === "ko"
        ? "Audience: Korean social media users."
        : "Audience: English-speaking social media users.",
      draftMode === "manual_polish"
        ? "Process mode: manual draft + AI polish."
        : "Process mode: auto generation.",
      "Style: curiosity-driven, viral, high-retention but not spammy.",
      desiredLanguage === "ko"
        ? "Return natural Korean output for all fields. Do not use English phrases or English CTA sentences unless a brand name must remain in English."
        : "Return natural English output for all fields.",
      "Never mention benchmark stats in script text (views, subscribers, percentages, breakout ratio, performance metrics).",
      manualPolishRule,
      sourceDraftSection,
      ...(desiredLanguage === "ko" ? [this.buildTitleInstruction(scriptCategory)] : []),
      ...(desiredLanguage === "ko"
        ? [this.buildCategoryUserPrompt(scriptCategory, narrativeFormat)]
        : []),
      ...(desiredLanguage === "ko" ? [this.buildIdeaStrategyUserPrompt(ideaStrategy)] : []),
      ...(desiredLanguage === "ko" ? [this.buildNarrativeFormatUserHint(narrativeFormat)] : []),
      revisionRequest ? `Revision request: ${revisionRequest}` : "",
      "titleOptions must be an array with 2 or 3 strings."
    ].join("\n");
  }

  private buildIdeaStrategySystemHint(strategy: ShortformIdeaStrategy): string {
    switch (strategy) {
      case "pattern_remix":
        return "Strategy mode: pattern remix. Extract retention patterns from the source, but rewrite everything into fresh wording and a new structure. Never mimic unique lines.";
      case "series_ip":
        return "Strategy mode: series IP. Write as episode 1 of a repeatable channel format with a stable tone and reusable narrative scaffolding.";
      case "comment_gap":
      default:
        return "Strategy mode: comment gap. Prioritize unresolved questions, disagreement points, and missing context that viewers would argue about in comments.";
    }
  }

  private buildIdeaStrategyUserPrompt(strategy: ShortformIdeaStrategy): string {
    switch (strategy) {
      case "pattern_remix":
        return [
          "Idea strategy: Pattern Remix",
          "- Reverse-engineer why this topic retains attention (hook type, escalation order, ending tension).",
          "- Rebuild with new framing and fresh wording so it is not derivative.",
          "- Keep emotional pace high: hook -> conflict build -> sharper turn -> comment trigger."
        ].join("\n");
      case "series_ip":
        return [
          "Idea strategy: Series IP",
          "- Treat this as a repeatable series episode.",
          "- Keep a stable channel voice and format so future episodes can follow the same skeleton.",
          "- End with a teaser-style closing that naturally leads to the next episode."
        ].join("\n");
      case "comment_gap":
      default:
        return [
          "Idea strategy: Comment Gap",
          "- Find what people are still debating or misunderstanding and make that the core hook.",
          "- Surface one missing context detail in the middle to intensify reactions.",
          "- End with a side-taking question that drives comments without sounding spammy."
        ].join("\n");
    }
  }

  private resolveNarrativeFormat(
    lengthMode: ScriptLengthMode,
    configuredDurationSec?: number
  ): "shortform" | "longform" {
    if (lengthMode === "shortform" || lengthMode === "longform") {
      return lengthMode;
    }

    if (
      typeof configuredDurationSec === "number" &&
      Number.isFinite(configuredDurationSec) &&
      configuredDurationSec >= 90
    ) {
      return "longform";
    }

    return "shortform";
  }

  private buildNarrativeFormatSystemHint(format: "shortform" | "longform"): string {
    if (format === "longform") {
      return "Length mode: longform. Do not compress into a one-minute short. Keep multi-beat progression and sustained tension suitable for multi-minute playback.";
    }
    return "Length mode: shortform. Keep pace tight and compact.";
  }

  private buildNarrativeFormatUserHint(format: "shortform" | "longform"): string {
    if (format === "longform") {
      return [
        "Length mode: longform.",
        "- narration should sustain a multi-minute watch, not a 60-second short.",
        "- keep escalation across multiple beats while staying conversational.",
        "- preserve enough context so the story remains coherent over longer runtime."
      ].join("\n");
    }
    return [
      "Length mode: shortform.",
      "- keep pacing compact and immediate.",
      "- prioritize fast setup, sharp middle escalation, and a quick comment-trigger ending."
    ].join("\n");
  }

  private sanitizeDraftForYoutube(
    draft: ShortformScriptDraft,
    language: "ko" | "en"
  ): ShortformScriptDraft {
    return {
      titleOptions: draft.titleOptions.map((line) => this.sanitizeTextForYoutube(line, language)),
      hook: this.sanitizeTextForYoutube(draft.hook, language),
      narration: this.sanitizeTextForYoutube(draft.narration, language),
      callToAction: this.sanitizeTextForYoutube(draft.callToAction, language)
    };
  }

  private sanitizeTextForYoutube(text: string, language: "ko" | "en"): string {
    let next = text;

    const commonRules: Array<[RegExp, string]> = [
      [/\bsex\b/gi, "sensitive topic"],
      [/\bsexual intercourse\b/gi, "intimate relationship"],
      [/\bsexual act(s)?\b/gi, "sensitive behavior"],
      [/\bexplicit sexual\b/gi, "sensitive"]
    ];

    const koreanRules: Array<[RegExp, string]> = [
      [/섹스/gi, "수위 높은 내용"],
      [/성행위/gi, "민감한 행위"],
      [/성교/gi, "민감한 관계"],
      [/정사/gi, "민감한 관계"],
      [/야한\s?행위/gi, "민감한 행위"]
    ];

    for (const [pattern, replacement] of commonRules) {
      next = next.replace(pattern, replacement);
    }
    if (language === "ko") {
      for (const [pattern, replacement] of koreanRules) {
        next = next.replace(pattern, replacement);
      }
    }

    next = this.stripBenchmarkMetaFromText(next, language);

    return next.replace(/\s{2,}/g, " ").trim();
  }

  private stripBenchmarkMetaFromSourceDraft(
    sourceDraft?: ProcessSourceDraft
  ): ProcessSourceDraft | undefined {
    if (!sourceDraft) {
      return undefined;
    }

    const cleanedTitleOptions = (sourceDraft.titleOptions ?? [])
      .map((item) => this.stripBenchmarkMetaFromText(item, "ko"))
      .map((item) => item.trim())
      .filter(Boolean);

    const cleaned: ProcessSourceDraft = {
      headline: sourceDraft.headline
        ? this.stripBenchmarkMetaFromText(sourceDraft.headline, "ko")
        : undefined,
      summary: sourceDraft.summary
        ? this.stripBenchmarkMetaFromText(sourceDraft.summary, "ko")
        : undefined,
      titleOptions: cleanedTitleOptions.length > 0 ? cleanedTitleOptions : undefined,
      hook: sourceDraft.hook ? this.stripBenchmarkMetaFromText(sourceDraft.hook, "ko") : undefined,
      narration: sourceDraft.narration
        ? this.stripBenchmarkMetaFromText(sourceDraft.narration, "ko")
        : undefined,
      callToAction: sourceDraft.callToAction
        ? this.stripBenchmarkMetaFromText(sourceDraft.callToAction, "ko")
        : undefined,
      operatorMemo: sourceDraft.operatorMemo
        ? this.stripBenchmarkMetaFromText(sourceDraft.operatorMemo, "ko")
        : undefined
    };

    return cleaned;
  }

  private stripBenchmarkMetaFromText(text: string, language: "ko" | "en"): string {
    if (!text.trim()) {
      return text;
    }

    let next = text;
    const benchmarkRules: Array<[RegExp, string]> = [
      [/(조회수|구독자|성과지표|성능지표|퍼포먼스)\s*[:：]\s*[\d,.]+(?:\s*%|[만천억])?/gi, ""],
      [/구독자\s*대비\s*[\d,.]+\s*%/gi, ""],
      [/\(\s*[\d,.]+\s*%\s*\)\s*breakout\.?/gi, ""],
      [/\b(views?|subscribers?|performance ratio|breakout ratio)\s*[:：]\s*[\d,.]+(?:\s*%|[kmb])?/gi, ""],
      [/\bview\/sub ratio\s*[:：]?\s*[\d,.]+\s*%?/gi, ""]
    ];

    for (const [pattern, replacement] of benchmarkRules) {
      next = next.replace(pattern, replacement);
    }

    const metricOnlyLinePattern =
      language === "ko"
        ? /^(조회수|구독자|성과지표|성능지표|구독자 대비|퍼포먼스|views?|subscribers?|performance ratio|breakout ratio)\b/i
        : /^(views?|subscribers?|performance ratio|breakout ratio|조회수|구독자|성과지표)\b/i;

    next = next
      .split(/\r?\n/)
      .map((line) => line.replace(/\s{2,}/g, " ").trim())
      .filter((line) => line && !metricOnlyLinePattern.test(line))
      .join("\n");

    next = next.replace(/^[,:·|/-]+\s*/g, "");
    next = next.replace(/\s{2,}/g, " ").trim();

    return next;
  }

  private buildYouTubeCandidateAnalysisPrompt(
    input: YouTubeCandidateAnalysisRequest,
    language: "ko" | "en",
    context: CandidateContext
  ): string {
    const views = Number.isFinite(input.views) ? Number(input.views) : 0;
    const subscribers = Number.isFinite(input.subscribers) ? Number(input.subscribers) : 0;
    const ratio =
      Number.isFinite(input.breakoutRatioPercent) && Number(input.breakoutRatioPercent) > 0
        ? Number(input.breakoutRatioPercent)
        : subscribers > 0 && views > 0
          ? (views / subscribers) * 100
          : 0;
    const likes = Number.isFinite(input.likes) ? Number(input.likes) : 0;
    const comments = Number.isFinite(input.comments) ? Number(input.comments) : 0;

    const hasTranscript = Boolean(context.transcriptExcerpt?.trim());
    if (language === "en" || language === "ko") {
      return [
        "Analyze this YouTube candidate for content ideation and script planning.",
        language === "ko"
          ? "Write the full answer in natural Korean."
          : "Write the full answer in natural English.",
        hasTranscript
          ? "Transcript is available. Use transcript-aware analysis and provide detailed output."
          : "Transcript is unavailable. Use metadata/context-only analysis.",
        hasTranscript
          ? [
              "Return plain text using this exact structure:",
              "1) Main hook pattern:",
              "2) Reusable remake angle:",
              "3) Risk or caution:",
              "4) Transcript-based scene ideas (up to 5):",
              "   - Scene 1: ...",
              "   - Scene 2: ...",
              "   - Scene 3: ...",
              "   - Scene 4: ... (optional)",
              "   - Scene 5: ... (optional)",
              "5) Recommended opening line options (2):",
              "   - A)",
              "   - B)"
            ].join("\n")
          : [
              "Return exactly 3 lines in plain text:",
              "1) Main hook pattern:",
              "2) Reusable remake angle:",
              "3) Risk or caution:"
            ].join("\n"),
        "Avoid copying transcript verbatim for long spans; summarize/reframe.",
        "Avoid emphasizing benchmark metrics in final wording.",
        `Title: ${input.title}`,
        `Summary: ${input.summary ?? ""}`,
        `Channel: ${input.sourceLabel ?? "YouTube"}`,
        `URL: ${input.sourceUrl ?? ""}`,
        `Views: ${views.toLocaleString()}`,
        `Subscribers: ${subscribers.toLocaleString()}`,
        `Performance ratio (%): ${ratio.toFixed(1)}`,
        `Likes: ${likes.toLocaleString()}`,
        `Comments: ${comments.toLocaleString()}`,
        `Keywords: ${context.keywords.join(", ") || "-"}`,
        hasTranscript
          ? `Transcript excerpt (source-first context): ${context.transcriptExcerpt}`
          : "Transcript excerpt: unavailable",
        context.wikiSummary ? `Wiki brief: ${context.wikiSummary}` : "",
        ...(context.references.length > 0
          ? [
              "Recent references:",
              ...context.references
                .slice(0, 5)
                .map(
                  (item) =>
                    `- [${item.type}] ${item.title} | ${item.source ?? "source"} | ${
                      item.publishedAt ?? "-"
                    } | ${item.url}`
                )
            ]
          : [])
      ].join("\n");
    }

    return [
      "아래 유튜브 후보를 숏폼 벤치마킹 관점에서 분석해줘.",
      "출력은 평문 4줄로만 써줘:",
      "1) 핵심 훅 패턴:",
      "2) 성과가 난 이유:",
      "3) 재활용 가능한 리메이크 각도:",
      "4) 주의할 리스크:",
      `제목: ${input.title}`,
      `요약: ${input.summary ?? ""}`,
      `채널: ${input.sourceLabel ?? "YouTube"}`,
      `URL: ${input.sourceUrl ?? ""}`,
      `조회수: ${views.toLocaleString()}`,
      `구독자: ${subscribers.toLocaleString()}`,
      `성과지표(%): ${ratio.toFixed(1)}`,
      `좋아요: ${likes.toLocaleString()}`,
      `댓글: ${comments.toLocaleString()}`
    ].join("\n");
  }

  private buildMockYouTubeCandidateAnalysis(
    input: YouTubeCandidateAnalysisRequest,
    language: "ko" | "en"
  ): string {
    const views = Number.isFinite(input.views) ? Number(input.views) : 0;
    const subscribers = Number.isFinite(input.subscribers) ? Number(input.subscribers) : 0;
    const ratio =
      Number.isFinite(input.breakoutRatioPercent) && Number(input.breakoutRatioPercent) > 0
        ? Number(input.breakoutRatioPercent)
        : subscribers > 0 && views > 0
          ? (views / subscribers) * 100
          : 0;

    if (language === "en") {
      return [
        "Main hook pattern: conflict-first title with immediate emotional framing.",
        "Reusable remake angle: keep the same conflict skeleton, but localize context and ending question.",
        `Risk or caution: avoid copying wording directly; keep claims verifiable. Current view/sub ratio ${ratio.toFixed(
          1
        )}%.`
      ].join("\n");
    }

    return [
      "핵심 훅 패턴: 갈등 포인트를 제목 첫줄에 박아두는 직진형 훅.",
      `성과가 난 이유: 조회수/구독자 비율이 ${ratio.toFixed(
        1
      )}%로 반응형 소재 가능성이 높음.`,
      "재활용 가능한 리메이크 각도: 같은 갈등 구조를 유지하고 상황/결말 질문만 한국 맥락으로 교체.",
      "주의할 리스크: 문구를 그대로 베끼지 말고 사실관계와 표현 수위를 정리해 재작성."
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
      "Each title should be about 10 to 24 Korean characters when possible.",
      "The 3 titles must clearly differ in angle: one situation-led, one emotion/reversal-led, and one comment-bait or curiosity-led.",
      categoryHint,
      "Ban generic filler patterns like '한눈에 정리', '진짜 이유', '왜 다들', '사람들이 몰린 이유', '요약', '정리'.",
      "Do not sound like a news headline, blog title, or article summary.",
      "Do not repeat the same noun phrase or ending across all three titles.",
      "Prefer native Korean shortform phrasing that feels clickable but not cheap.",
      ...(scriptCategory === "community"
        ? [
            "For community/real-story titles, prefer conflict, hypocrisy, absurdity, or anger points over bland summaries.",
            "Examples of stronger angles: '맞벌이 월 팔백인데 밥으로 싸움', '돈보다 더 정떨어진 한마디', '이 말 듣고 진짜 정 떨어졌어요'."
          ]
        : [])
    ].join("\n");
  }

  private buildCategorySystemHint(scriptCategory: ShortformScriptCategory): string {
    switch (scriptCategory) {
      case "horror":
        return "Write with realistic dread, short lines, lingering unease, and blunt banmal Korean. Avoid fantasy, purple prose, campy horror tropes, polite endings, or a soft explanatory tone.";
      case "romance":
        return "Write like a real relationship story told by a close friend. Keep it conversational, emotionally readable, and grounded.";
      default:
        return "Write like a real community or true-story recap told naturally by a person, not like a news anchor or article summary.";
    }
  }

  private buildCategoryUserPrompt(
    scriptCategory: ShortformScriptCategory,
    narrativeFormat: "shortform" | "longform"
  ): string {
    const runtimeLine =
      narrativeFormat === "longform"
        ? "Output a final-ready script that can sustain a longform video and preserve detail flow."
        : "Output a final-ready script that fits one shortform clip.";
    switch (scriptCategory) {
      case "horror":
        return [
          narrativeFormat === "longform"
            ? "Write a longform scary-story narration."
            : "Write a shortform scary-story narration.",
          "It must feel realistic, like a real event told quietly to a friend.",
          "Use Korean banmal only. Do not use polite endings like 요 or 습니다.",
          "No news style, no novel style, no theatrical prose.",
          "Use short rhythmic Korean sentences that work as subtitles.",
          "Start immediately with something eerie or off-putting.",
          "Let the unease pile up one detail at a time.",
          "End with lingering discomfort rather than a neat explanation.",
          "Avoid fantasy, childish twists, English-heavy wording, hard-to-pronounce tokens, symbols, and repetitive phrasing.",
          "Replace digits or English words with Korean-friendly spoken phrasing when possible.",
          runtimeLine,
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      case "romance":
        return [
          narrativeFormat === "longform"
            ? "Write a longform romance-story narration."
            : "Write a shortform romance-story narration.",
          "It should sound like a friend telling a real dating story.",
          "Use Korean banmal only. Do not use polite endings like 요 or 습니다.",
          "Use casual, realistic Korean speech.",
          "Do not make it cheesy or overly dramatic.",
          "Use short subtitle-friendly sentences.",
          "Open with a line that immediately makes people curious.",
          "Explain the relationship and situation quickly, then show emotional change in the middle.",
          "End with one of: twist, regret, catharsis, or emptiness.",
          "Avoid hard-to-pronounce English, symbols, emojis, and slangy abbreviations.",
          "Keep it natural and directly understandable on first listen.",
          runtimeLine,
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      default:
        return [
          narrativeFormat === "longform"
            ? "Write a longform community/real-story narration."
            : "Write a shortform community/real-story narration.",
          "It should feel like I personally organized and retold the story, not like I am reading a forum post aloud.",
          "Use natural, plain Korean speech with immersion but not broadcast-style exaggeration.",
          "Start with a strong hook that stops the scroll.",
          "Explain the background briefly and clearly at the start.",
          "Let curiosity grow as the incident unfolds.",
          "End with one of: twist, absurdity, anger point, or eerie aftertaste.",
          "Keep sentences short and subtitle-friendly.",
          "Avoid hard-to-pronounce English, symbols, or meme-heavy wording.",
          narrativeFormat === "longform"
            ? "Do not over-compress. Keep important context and escalation flow."
            : "Compress for shortform length but preserve important details.",
          runtimeLine,
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
        return "Write like a real relationship story told by a close friend in blunt banmal Korean. Keep it conversational, emotionally readable, grounded, not cheesy, and never polite or overly nice.";
      default:
        return "Write like a blunt first-person retelling of a real community story, with direct speech, emotional friction, and spoken banmal Korean that sounds like an actual person venting to a friend, not a recap bot.";
    }
  }

  private buildEnhancedCategoryUserPrompt(
    scriptCategory: ShortformScriptCategory,
    narrativeFormat: "shortform" | "longform"
  ): string {
    const runtimeLine =
      narrativeFormat === "longform"
        ? "Output a final-ready script for longform runtime with sustained narrative flow."
        : "Output a final-ready script that fits one shortform clip.";
    switch (scriptCategory) {
      case "horror":
        return [
          narrativeFormat === "longform"
            ? "Write a longform scary-story narration."
            : "Write a shortform scary-story narration.",
          "It must feel realistic, like a real event told quietly to a friend.",
          "Use direct spoken Korean, like someone lowering their voice and saying '근데 그때부터 좀 이상했어요' before telling the rest.",
          "No news style, no novel style, no theatrical prose.",
          "Use short rhythmic Korean sentences that work as subtitles.",
          "Open immediately with the weirdest, creepiest, or most off-feeling moment instead of explaining the background first.",
          "Then fill in only the minimum context needed to follow the story.",
          "Let the unease pile up one detail at a time, like you are remembering what got weirder and weirder.",
          "If a creepy line or sound matters, quote it naturally instead of explaining it blandly.",
          "The middle should make the listener think '잠깐, 이거 진짜 이상한데?'",
          "End with lingering discomfort, 찝찝함, or a small chilling aftertaste rather than a neat explanation.",
          "Avoid fantasy, childish twists, English-heavy wording, hard-to-pronounce tokens, symbols, and repetitive phrasing.",
          "Replace digits or English words with Korean-friendly spoken phrasing when possible.",
          "Good example: '처음엔 그냥 착각인 줄 알았어요. 근데 그 소리가 세 번째 들렸을 때 진짜 소름이 확 돋았어요.'",
          "Bad example: '해당 사연은 한밤중에 발생한 이상 현상을 다루며 공포감을 조성한다.'",
          runtimeLine,
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      case "romance":
        return [
          narrativeFormat === "longform"
            ? "Write a longform romance-story narration."
            : "Write a shortform romance-story narration.",
          "It should sound like a friend telling a real dating story.",
          "Use casual, realistic Korean speech with direct emotional reactions.",
          "Do not make it cheesy or overly dramatic.",
          "Use short subtitle-friendly sentences.",
          "Open with the line, moment, or behavior that made the relationship suddenly feel weird, hurtful, or suspicious.",
          "Explain the relationship and situation quickly, then move fast into the emotional shift.",
          "Make the listener feel the change in mood, disappointment, or 정 떨어짐, not just the facts.",
          "If a line the other person said matters, quote it naturally.",
          "The middle should build with one or two specific moments that make the listener think '아 이건 좀 별론데'.",
          "End with one of: twist, regret, catharsis, emptiness, or a blunt question that invites people to take sides.",
          "Avoid hard-to-pronounce English, symbols, emojis, and slangy abbreviations.",
          "Keep it natural and directly understandable on first listen.",
          "Good example: '근데 그 말 듣는 순간 좀 확 식었어요. 아, 이 사람은 진짜 아니구나 싶더라고요.'",
          "Bad example: '두 사람의 관계는 점차 변화했고 감정선에도 전환점이 생겼다.'",
          runtimeLine,
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
      default:
        return [
          narrativeFormat === "longform"
            ? "Write a longform community/real-story narration."
            : "Write a shortform community/real-story narration.",
          "Make it feel like I am personally telling the story in first-person spoken Korean, not reading a community post aloud.",
          "Use Korean banmal only. Do not use polite endings like 요 or 습니다.",
          "Use direct, lived-in phrasing such as '이러는 거 아님?', '꿈에도 몰랐다', '너무 어이없더라' when it fits naturally.",
          "Use natural, plain Korean speech with immersion, but not broadcast-style exaggeration or article-summary tone.",
          "Start with the strongest conflict, absurdity, or emotionally unfair moment first, even if that means not following the original order exactly.",
          "You are allowed to adapt, compress, and rearrange details to improve retention as long as the core meaning stays intact.",
          "Do not spend too long on background setup. Land the situation fast, then move straight into the line or moment that makes people react.",
          "Show who said what and why it was infuriating, absurd, unfair, creepy, or emotionally jarring.",
          "If a quoted line matters, include it in a natural spoken way instead of paraphrasing it blandly.",
          "The middle should escalate with sharper specifics, emotional reactions, and one extra detail that makes the listener go '와 이건 좀 아닌데'.",
          "End with one of: anger point, absurdity, humiliation, twist, or a question that naturally invites comments.",
          "Keep sentences short, subtitle-friendly, and easy for Korean TTS to read.",
          "Avoid hard-to-pronounce English, symbols, meme-heavy wording, and detached summary phrases.",
          "Do not sound like a recap account, forum summary bot, or counseling article.",
          "Good example: '우린 맞벌이로 합쳐서 팔백이야. 근데 갑자기 나보고 식비를 아껴야 하지 않냐는 거 아님?'",
          "Good example: '돈이 없어서 싸운 게 아니라, 누가 밥 하냐로 엄청 싸웠어.'",
          "Bad example: '해당 사연은 맞벌이 부부의 식비 갈등을 다룬 글로, 많은 반응을 불러왔다.'",
          runtimeLine,
          "Each paragraph should be one or two subtitle lines."
        ].join("\n");
    }
  }
}
