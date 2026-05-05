import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import iconv from "iconv-lite";
import { load } from "cheerio";
import type {
  NewsKnowledgeDiscoveryRequest,
  NewsKnowledgeDiscoveryResult,
  TrendCandidate,
  TrendDiscoveryRequest,
  TrendDiscoveryResult,
  YouTubeBreakoutDiscoveryRequest,
  YouTubeBreakoutDiscoveryResult
} from "../../../common/types/trend";

type TrendAdapter = {
  id: string;
  region: "global" | "domestic";
  fetchCandidates: (request: TrendDiscoveryRequest) => Promise<{
    candidates: TrendCandidate[];
    status: "ok" | "fallback" | "error";
    message?: string;
  }>;
};

type RedditListingResponse = {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        selftext?: string;
        permalink?: string;
        subreddit?: string;
        created_utc?: number;
        ups?: number;
        num_comments?: number;
        upvote_ratio?: number;
        over_18?: boolean;
        is_self?: boolean;
        url?: string;
        domain?: string;
      };
    }>;
  };
};

type RedditPostData = NonNullable<
  NonNullable<NonNullable<RedditListingResponse["data"]>["children"]>[number]["data"]
>;

type YouTubeApiVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      categoryId?: string;
      thumbnails?: {
        maxres?: { url?: string };
        standard?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    statistics?: {
      viewCount?: string | number;
      likeCount?: string | number;
      commentCount?: string | number;
    };
  }>;
  error?: {
    message?: string;
  };
};

type YouTubeApiChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
    statistics?: {
      subscriberCount?: string | number;
    };
  }>;
  error?: {
    message?: string;
  };
};

type YouTubeApiErrorPayload = {
  error?: {
    message?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
};

type TrendFocusCategory = "all" | "world" | "breaking" | "china";

type NewsKnowledgeSource = {
  id: NewsKnowledgeDiscoveryRequest["sourceGroup"];
  label: string;
  site: string;
  region: "domestic" | "global";
};

const NEWS_KNOWLEDGE_SOURCES: NewsKnowledgeSource[] = [
  { id: "mbc", label: "MBC", site: "imnews.imbc.com", region: "domestic" },
  { id: "sbs", label: "SBS", site: "news.sbs.co.kr", region: "domestic" },
  { id: "kbs", label: "KBS", site: "news.kbs.co.kr", region: "domestic" },
  { id: "yonhap", label: "Yonhap", site: "yna.co.kr", region: "domestic" },
  { id: "bbc", label: "BBC", site: "bbc.com", region: "global" },
  { id: "reuters", label: "Reuters", site: "reuters.com", region: "global" },
  { id: "ap", label: "AP", site: "apnews.com", region: "global" }
];

const NEWS_KNOWLEDGE_CATEGORY_TERMS: Record<NewsKnowledgeDiscoveryRequest["category"], string[]> = {
  all: ["news", "latest", "이슈"],
  world: ["world", "geopolitics", "international", "세계", "국제", "정세"],
  breaking: ["breaking", "urgent", "developing", "속보", "긴급"],
  china: ["china", "chinese", "beijing", "taiwan", "중국", "시진핑", "대만"],
  economy: ["economy", "market", "trade", "경제", "무역", "환율"],
  tech: ["technology", "ai", "science", "기술", "인공지능", "과학"]
};

const REDDIT_SHORTFORM_SUBREDDITS = [
  "TrueOffMyChest",
  "tifu",
  "confession",
  "relationship_advice",
  "AmItheAsshole"
] as const;
const REDDIT_NEWS_CARD_SUBREDDITS = [
  "worldnews",
  "news",
  "China",
  "technology",
  "science",
  "economics",
  "geopolitics",
  "business",
  "OutOfTheLoop"
] as const;
const REDDIT_NEWS_TRUST_BONUS: Record<string, number> = {
  worldnews: 10,
  news: 10,
  technology: 8,
  science: 8,
  economics: 7,
  geopolitics: 7,
  business: 6,
  outoftheloop: 5
};

const REDDIT_USER_AGENT = "MellowCatTrendDiscovery/0.1";
const HTML_HEADERS = {
  "User-Agent": REDDIT_USER_AGENT
};
const YOUTUBE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

type RedditDiscoveryMode = "shortform_story" | "news_card";

const REDDIT_FOCUS_KEYWORDS: Record<Exclude<TrendFocusCategory, "all">, string[]> = {
  world: [
    "world",
    "global",
    "geopolit",
    "foreign policy",
    "diplom",
    "sanction",
    "war",
    "conflict",
    "nato",
    "united nations",
    "세계",
    "정세",
    "국제",
    "외교"
  ],
  breaking: [
    "breaking",
    "urgent",
    "developing",
    "just in",
    "alert",
    "속보",
    "긴급",
    "실시간"
  ],
  china: [
    "china",
    "chinese",
    "beijing",
    "ccp",
    "xi jinping",
    "hong kong",
    "taiwan",
    "xinjiang",
    "tibet",
    "중국",
    "시진핑",
    "홍콩",
    "대만",
    "중화"
  ]
};

export class TrendDiscoveryService {
  private readonly adapters: TrendAdapter[];

  constructor() {
    this.adapters = [
      this.createGlobalRedditAdapter(),
      this.createGlobalRssAdapter(),
      this.createDomesticCommunityAdapter()
    ];
  }

  async discoverCandidates(
    request: TrendDiscoveryRequest = {
      regions: ["global", "domestic"],
      limit: 3,
      timeWindow: "24h"
    }
  ): Promise<TrendDiscoveryResult> {
    const batches = await Promise.all(
      this.adapters.map(async (adapter) => ({
        adapter,
        result: await adapter.fetchCandidates(request)
      }))
    );

    const allCandidates = batches
      .flatMap((batch) => batch.result.candidates)
      .filter((candidate) => request.regions.includes(candidate.sourceRegion));

    const rankCandidates = (candidates: TrendCandidate[]) =>
      [...candidates].sort((left, right) => {
        const leftMockPenalty = left.sourceKind === "mock" ? 1 : 0;
        const rightMockPenalty = right.sourceKind === "mock" ? 1 : 0;
        if (leftMockPenalty !== rightMockPenalty) {
          return leftMockPenalty - rightMockPenalty;
        }

        return right.score - left.score;
      });

    const globalCandidates = rankCandidates(
      allCandidates.filter((candidate) => candidate.sourceRegion === "global")
    );
    const domesticCandidates = rankCandidates(
      allCandidates.filter((candidate) => candidate.sourceRegion === "domestic")
    );
    const candidates = rankCandidates(allCandidates).slice(0, request.limit);

    return {
      generatedAt: new Date().toISOString(),
      candidates,
      globalCandidates,
      domesticCandidates,
      sourceDebug: batches.map((batch) => ({
        sourceId: batch.adapter.id,
        region: batch.adapter.region,
        count: batch.result.candidates.length,
        status: batch.result.status,
        message: batch.result.message
      }))
    };
  }

  async discoverNewsKnowledgeCandidates(
    request: NewsKnowledgeDiscoveryRequest
  ): Promise<NewsKnowledgeDiscoveryResult> {
    const normalizedRequest = this.normalizeNewsKnowledgeRequest(request);
    const sources = this.resolveNewsKnowledgeSources(normalizedRequest);
    const perSourceLimit = Math.max(3, Math.ceil(normalizedRequest.limit / Math.max(sources.length, 1)) + 2);

    const batches = await Promise.all(
      sources.map(async (source) => {
        try {
          const candidates = await this.fetchNewsKnowledgeSourceCandidates(
            source,
            normalizedRequest,
            perSourceLimit
          );
          return {
            source,
            candidates,
            status: "ok" as const,
            message: `query=${this.buildNewsKnowledgeSearchQuery(source, normalizedRequest)}`
          };
        } catch (error) {
          return {
            source,
            candidates: [] as TrendCandidate[],
            status: "error" as const,
            message: error instanceof Error ? error.message : "Unknown news fetch error"
          };
        }
      })
    );

    const unique = new Map<string, TrendCandidate>();
    batches
      .flatMap((batch) => batch.candidates)
      .sort((left, right) => right.score - left.score)
      .forEach((candidate) => {
        const key = `${candidate.sourceUrl ?? candidate.id}:${candidate.title}`.toLowerCase();
        if (!unique.has(key)) {
          unique.set(key, candidate);
        }
      });

    const candidates = Array.from(unique.values()).slice(0, normalizedRequest.limit);
    const fallbackCandidates =
      candidates.length > 0 ? [] : this.buildNewsKnowledgeFallbackCandidates(normalizedRequest);
    const finalCandidates = candidates.length > 0 ? candidates : fallbackCandidates;

    return {
      generatedAt: new Date().toISOString(),
      request: normalizedRequest,
      candidates: finalCandidates,
      globalCandidates: finalCandidates.filter((candidate) => candidate.sourceRegion === "global"),
      domesticCandidates: finalCandidates.filter((candidate) => candidate.sourceRegion === "domestic"),
      sourceDebug: batches.map((batch) => ({
        sourceId: `news-${batch.source.id}`,
        region: batch.source.region,
        count: batch.candidates.length,
        status: batch.status,
        message: batch.message
      }))
    };
  }

  async discoverYouTubeBreakoutCandidates(
    request: YouTubeBreakoutDiscoveryRequest,
    apiKey?: string
  ): Promise<YouTubeBreakoutDiscoveryResult> {
    const normalizedCountry = (request.country || "KR").trim().toUpperCase();
    const normalizedPeriod =
      request.period === "7d" ? "7d" : request.period === "3d" ? "3d" : "24h";
    const normalizedRatio = Math.max(1, Number.parseFloat(`${request.breakoutRatioPercent || 0}`) || 120);
    const normalizedCategory = (request.categoryId || "all").trim() || "all";
    const requireCaptions = request.requireCaptions === true;
    const normalizedSubscriberRange = this.normalizeYouTubeSubscriberRange(request.subscriberRange);
    const subscriberBand = this.resolveSubscriberBand(normalizedSubscriberRange);
    const normalizedLimit = Math.min(Math.max(request.limit ?? 10, 1), 50);
    const requestInfo: YouTubeBreakoutDiscoveryResult["request"] = {
      country: normalizedCountry,
      period: normalizedPeriod,
      breakoutRatioPercent: normalizedRatio,
      categoryId: normalizedCategory,
      requireCaptions,
      subscriberRange: normalizedSubscriberRange,
      limit: normalizedLimit
    };

    const cutoff = this.resolveYouTubePeriodCutoff(normalizedPeriod);
    const sourceId = "youtube-data-api-v3";
    const effectiveApiKey = apiKey?.trim();
    const fetchSampleSize = 50;

    if (!effectiveApiKey) {
      return {
        generatedAt: new Date().toISOString(),
        request: requestInfo,
        candidates: this.buildYouTubeBreakoutFallbackCandidatesReadable(requestInfo),
        sourceDebug: {
          sourceId,
          count: 1,
          status: "fallback",
          message:
            "YouTube Data API key is missing. Enter a key in the crawling module and retry."
        }
      };
    }

    try {
      const videoQuery = new URLSearchParams({
        part: "snippet,statistics",
        chart: "mostPopular",
        regionCode: normalizedCountry,
        maxResults: String(fetchSampleSize),
        key: effectiveApiKey
      });
      if (normalizedCategory !== "all") {
        videoQuery.set("videoCategoryId", normalizedCategory);
      }

      const videosResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videoQuery.toString()}`, {
        headers: HTML_HEADERS
      });
      if (!videosResponse.ok) {
        throw new Error(
          await this.extractYouTubeApiError(
            videosResponse,
            `YouTube videos HTTP ${videosResponse.status}`
          )
        );
      }

      const videosPayload = (await videosResponse.json()) as YouTubeApiVideosResponse;
      if (videosPayload.error?.message) {
        throw new Error(`YouTube videos API: ${videosPayload.error.message}`);
      }
      const videos = videosPayload.items ?? [];
      const channelIds = Array.from(
        new Set(
          videos
            .map((video) => video.snippet?.channelId?.trim())
            .filter((channelId): channelId is string => Boolean(channelId))
        )
      );

      const channelMeta = new Map<string, { subscribers: number; title?: string }>();
      for (let index = 0; index < channelIds.length; index += 50) {
        const chunk = channelIds.slice(index, index + 50);
        const channelQuery = new URLSearchParams({
          part: "snippet,statistics",
          id: chunk.join(","),
          key: effectiveApiKey
        });
        const channelsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?${channelQuery.toString()}`,
          { headers: HTML_HEADERS }
        );
        if (!channelsResponse.ok) {
          throw new Error(
            await this.extractYouTubeApiError(
              channelsResponse,
              `YouTube channels HTTP ${channelsResponse.status}`
            )
          );
        }
        const channelsPayload = (await channelsResponse.json()) as YouTubeApiChannelsResponse;
        if (channelsPayload.error?.message) {
          throw new Error(`YouTube channels API: ${channelsPayload.error.message}`);
        }
        for (const channel of channelsPayload.items ?? []) {
          const channelId = channel.id?.trim();
          if (!channelId) {
            continue;
          }
          channelMeta.set(channelId, {
            subscribers: this.parseNumericValue(channel.statistics?.subscriberCount),
            title: channel.snippet?.title?.trim() || undefined
          });
        }
      }

      const rankedCandidates = videos
        .map((video) => {
          const videoId = video.id?.trim();
          const title = video.snippet?.title?.trim();
          const channelId = video.snippet?.channelId?.trim();
          if (!videoId || !title || !channelId) {
            return null;
          }

          const publishedAtRaw = video.snippet?.publishedAt?.trim();
          const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : undefined;
          const isPublishedAtValid = publishedAt && Number.isFinite(publishedAt.getTime());

          const views = this.parseNumericValue(video.statistics?.viewCount);
          const comments = this.parseNumericValue(video.statistics?.commentCount);
          const likes = this.parseNumericValue(video.statistics?.likeCount);
          const channel = channelMeta.get(channelId);
          const subscribers = channel?.subscribers ?? 0;
          if (views <= 0) {
            return null;
          }

          const hasSubscriberCount = subscribers > 0;
          const ratioPercent = hasSubscriberCount ? (views / subscribers) * 100 : 0;
          if (subscriberBand) {
            if (!hasSubscriberCount) {
              return null;
            }
            if (subscribers < subscriberBand.min) {
              return null;
            }
            if (typeof subscriberBand.max === "number" && subscribers > subscriberBand.max) {
              return null;
            }
          }

          const channelTitle =
            channel?.title || video.snippet?.channelTitle?.trim() || "YouTube Channel";
          const isTopicChannel = /\s-\sTopic$/i.test(channelTitle);
          if (isTopicChannel) {
            return null;
          }
          const ratioText = `${ratioPercent.toFixed(1)}%`;
          const publishedAtMs = isPublishedAtValid ? publishedAt.getTime() : null;
          const recencyBonus =
            publishedAtMs !== null && publishedAtMs >= cutoff.getTime() ? 8 : 0;
          const summaryText = hasSubscriberCount
            ? `Views ${views.toLocaleString()} / Subscribers ${subscribers.toLocaleString()} (${ratioText}) breakout.`
            : `Views ${views.toLocaleString()} / Subscribers hidden (ratio unavailable).`;
          const operatorSummaryText = `${title} · ${summaryText}`;
          const sourceLabel = `${channelTitle} · ${normalizedCountry}`;
          const fitReasonText = hasSubscriberCount
            ? `View/subscriber ratio reached ${ratioText}, making it a strong short-form breakout candidate.`
            : "Subscriber data is hidden, so this was included as a high-view live fallback candidate.";
          const normalizedOperatorSummary = `${title} - ${summaryText}`;
          const normalizedSourceLabel = `${channelTitle} - ${normalizedCountry}`;

          const thumbnailUrl =
            video.snippet?.thumbnails?.maxres?.url?.trim() ||
            video.snippet?.thumbnails?.standard?.url?.trim() ||
            video.snippet?.thumbnails?.high?.url?.trim() ||
            video.snippet?.thumbnails?.medium?.url?.trim() ||
            video.snippet?.thumbnails?.default?.url?.trim() ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          const candidate = {
            id: `youtube-breakout-${videoId}`,
            title,
            summary: summaryText,
            operatorSummary: operatorSummaryText,
            contentAngle: "high view-to-subscriber breakout / reaction-first retell",
            media: this.buildMediaMetadata([thumbnailUrl]),
            sourceKind: "youtube" as const,
            sourceRegion: normalizedCountry === "KR" ? ("domestic" as const) : ("global" as const),
            sourceLabel: `${channelTitle} · ${normalizedCountry}`,
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            score: Math.round(
              Math.min(ratioPercent, 400) * 0.55 +
                Math.min(comments / 300, 20) +
                Math.min(likes / 600, 20) +
                Math.min(views / 200000, 25) +
                recencyBonus
            ),
            metrics: {
              views,
              comments,
              likes,
              subscribers: hasSubscriberCount ? subscribers : undefined,
              breakoutRatioPercent: hasSubscriberCount ? Number(ratioPercent.toFixed(2)) : undefined
            },
            fitReason: `구독자 대비 조회수 ${ratioText}로 확산력이 높아 숏폼 리프레이밍 후보로 적합합니다.`
          } as TrendCandidate;
          candidate.operatorSummary = normalizedOperatorSummary;
          candidate.sourceLabel = normalizedSourceLabel;
          candidate.fitReason = fitReasonText;
          return { candidate, ratioPercent };
        })
        .filter(
          (item): item is { candidate: TrendCandidate; ratioPercent: number } => Boolean(item)
        )
        .sort((left, right) => right.candidate.score - left.candidate.score);

      const strictCandidates = rankedCandidates.filter(
        (item) => item.ratioPercent >= normalizedRatio
      );
      const strictCandidateIds = new Set(strictCandidates.map((item) => item.candidate.id));
      const candidatePool =
        strictCandidates.length >= normalizedLimit
          ? strictCandidates
          : [
              ...strictCandidates,
              ...rankedCandidates.filter((item) => !strictCandidateIds.has(item.candidate.id))
            ];
      const candidates = await this.applyCaptionAvailabilityFilter(
        candidatePool,
        normalizedLimit,
        requireCaptions,
        normalizedCountry
      );

      if (candidates.length > 0) {
        const usedRelaxedFill = strictCandidates.length < candidates.length;
        const captionFilterNote = requireCaptions
          ? ` Caption filter kept ${candidates.length} candidate(s).`
          : "";
        return {
          generatedAt: new Date().toISOString(),
          request: requestInfo,
          candidates,
          sourceDebug: {
            sourceId,
            count: candidates.length,
            status: "ok",
            message: usedRelaxedFill
              ? `Live candidates fetched. Ratio filter ${normalizedRatio.toFixed(
                  0
                )}% was too strict, so additional ranked videos were included.${captionFilterNote}`
              : `Live candidates fetched from YouTube Data API v3.${captionFilterNote}`
          }
        };
      }
      if (requireCaptions) {
        return {
          generatedAt: new Date().toISOString(),
          request: requestInfo,
          candidates: this.buildYouTubeBreakoutFallbackCandidatesReadable(requestInfo),
          sourceDebug: {
            sourceId,
            count: 1,
            status: "fallback",
            message:
              "Caption-required filter removed all live videos (manual/ASR tracks missing or transcript text unusable)."
          }
        };
      }
      return {
        generatedAt: new Date().toISOString(),
        request: requestInfo,
        candidates: this.buildYouTubeBreakoutFallbackCandidatesReadable(requestInfo),
        sourceDebug: {
          sourceId,
          count: 1,
          status: "fallback",
          message:
            "No live candidates were parsed from API response. Check API quota/permissions and retry."
        }
      };
    } catch (error) {
      return {
        generatedAt: new Date().toISOString(),
        request: requestInfo,
        candidates: this.buildYouTubeBreakoutFallbackCandidatesReadable(requestInfo),
        sourceDebug: {
          sourceId,
          count: 1,
          status: "fallback",
          message: error instanceof Error ? error.message : "Unknown YouTube breakout error"
        }
      };
    }
  }

  private normalizeNewsKnowledgeRequest(
    request: NewsKnowledgeDiscoveryRequest
  ): NewsKnowledgeDiscoveryResult["request"] {
    const region =
      request.region === "domestic" || request.region === "global" ? request.region : "all";
    const period =
      request.period === "7d" ? "7d" : request.period === "3d" ? "3d" : "24h";
    const category =
      request.category === "world" ||
      request.category === "breaking" ||
      request.category === "china" ||
      request.category === "economy" ||
      request.category === "tech"
        ? request.category
        : "all";
    const sourceGroup =
      request.sourceGroup === "domestic_major" ||
      request.sourceGroup === "global_major" ||
      request.sourceGroup === "mbc" ||
      request.sourceGroup === "sbs" ||
      request.sourceGroup === "kbs" ||
      request.sourceGroup === "yonhap" ||
      request.sourceGroup === "bbc" ||
      request.sourceGroup === "reuters" ||
      request.sourceGroup === "ap"
        ? request.sourceGroup
        : "all";
    const limit = Math.min(Math.max(request.limit ?? 15, 3), 30);
    const query = request.query?.trim() || undefined;
    return { region, period, category, sourceGroup, limit, query };
  }

  private resolveNewsKnowledgeSources(
    request: NewsKnowledgeDiscoveryResult["request"]
  ): NewsKnowledgeSource[] {
    let sources = NEWS_KNOWLEDGE_SOURCES;
    if (request.region !== "all") {
      sources = sources.filter((source) => source.region === request.region);
    }
    if (request.sourceGroup === "domestic_major") {
      sources = sources.filter((source) => source.region === "domestic");
    } else if (request.sourceGroup === "global_major") {
      sources = sources.filter((source) => source.region === "global");
    } else if (request.sourceGroup !== "all") {
      sources = sources.filter((source) => source.id === request.sourceGroup);
    }
    return sources.length > 0 ? sources : NEWS_KNOWLEDGE_SOURCES;
  }

  private buildNewsKnowledgeSearchQuery(
    source: NewsKnowledgeSource,
    request: NewsKnowledgeDiscoveryResult["request"]
  ): string {
    const terms = request.query
      ? [request.query]
      : NEWS_KNOWLEDGE_CATEGORY_TERMS[request.category] ?? NEWS_KNOWLEDGE_CATEGORY_TERMS.all;
    const when = request.period === "7d" ? "7d" : request.period === "3d" ? "3d" : "1d";
    return `${terms.join(" OR ")} site:${source.site} when:${when}`;
  }

  private async fetchNewsKnowledgeSourceCandidates(
    source: NewsKnowledgeSource,
    request: NewsKnowledgeDiscoveryResult["request"],
    limit: number
  ): Promise<TrendCandidate[]> {
    const query = new URLSearchParams({
      q: this.buildNewsKnowledgeSearchQuery(source, request),
      hl: request.region === "global" ? "en" : "ko",
      gl: request.region === "global" ? "US" : "KR",
      ceid: request.region === "global" ? "US:en" : "KR:ko"
    });
    const response = await fetch(`https://news.google.com/rss/search?${query.toString()}`, {
      headers: HTML_HEADERS
    });
    if (!response.ok) {
      throw new Error(`Google News RSS HTTP ${response.status}`);
    }
    const xml = await response.text();
    const $ = load(xml, { xmlMode: true });
    const candidates: TrendCandidate[] = [];
    $("item").each((index, element) => {
      if (candidates.length >= limit) {
        return false;
      }
      const node = $(element);
      const rawTitle = node.find("title").first().text().trim();
      const link = node.find("link").first().text().trim();
      const pubDate = node.find("pubDate").first().text().trim();
      const description = this.stripHtmlText(node.find("description").first().text());
      const sourceName = node.find("source").first().text().trim() || source.label;
      const title = this.normalizeGoogleNewsTitle(rawTitle, sourceName);
      if (!title || !link) {
        return;
      }
      const publishedAt = pubDate ? new Date(pubDate) : undefined;
      const recencyScore =
        publishedAt && Number.isFinite(publishedAt.getTime())
          ? Math.max(0, 30 - Math.floor((Date.now() - publishedAt.getTime()) / 3600000))
          : 8;
      const categoryBonus = request.category === "breaking" ? 10 : request.category === "china" ? 8 : 5;
      const summary = description || `${sourceName} latest coverage selected for knowledge short/card news.`;
      candidates.push({
        id: `news-knowledge-${source.id}-${this.slugify(title)}-${index + 1}`,
        title,
        summary,
        operatorSummary: `${sourceName} - ${summary}`,
        contentAngle: `knowledge explainer / ${request.category} / source-backed rewrite`,
        media: this.buildMediaMetadata(),
        sourceKind: "rss",
        sourceRegion: source.region,
        sourceLabel: sourceName,
        sourceUrl: link,
        score: recencyScore + categoryBonus + Math.max(0, 20 - index),
        metrics: {},
        fitReason:
          "Trusted news-source candidate for a knowledge-channel script, useful for short-form explainers and card news."
      });
      return undefined;
    });
    return candidates;
  }

  private normalizeGoogleNewsTitle(title: string, sourceName: string): string {
    const trimmed = title.trim();
    if (!trimmed) {
      return "";
    }
    const suffix = ` - ${sourceName}`;
    return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length).trim() : trimmed;
  }

  private stripHtmlText(value: string): string {
    if (!value.trim()) {
      return "";
    }
    return load(value).text().replace(/\s+/g, " ").trim();
  }

  private buildNewsKnowledgeFallbackCandidates(
    request: NewsKnowledgeDiscoveryResult["request"]
  ): TrendCandidate[] {
    return [
      {
        id: `news-knowledge-fallback-${request.category}-${request.period}`,
        title: `News knowledge sample (${request.category}, ${request.period})`,
        summary:
          "Live news RSS did not return candidates. Check the network connection or loosen source/category filters.",
        operatorSummary:
          "Fallback sample for validating the news knowledge crawler workflow when live RSS is unavailable.",
        contentAngle: "news knowledge fallback / source filter sanity check",
        media: this.buildMediaMetadata(),
        sourceKind: "rss",
        sourceRegion: request.region === "global" ? "global" : "domestic",
        sourceLabel: "News Knowledge Fallback",
        sourceUrl: "https://news.google.com/",
        score: 10,
        metrics: {},
        fitReason:
          "Fallback candidate for pipeline verification when trusted news-source discovery is unavailable."
      }
    ];
  }

  private createGlobalRedditAdapter(): TrendAdapter {
    return {
      id: "reddit-global",
      region: "global",
      fetchCandidates: async (request) => {
        const discoveryMode = this.resolveRedditDiscoveryMode(request);
        const focusCategory = this.resolveRedditFocusCategory(request);
        const subreddits = this.resolveRedditSubreddits(request);
        try {
          const batches = await Promise.all(
            subreddits.map((subreddit) =>
              this.fetchRedditSubredditCandidates(
                subreddit,
                request.timeWindow,
                discoveryMode,
                focusCategory
              )
            )
          );
          const candidates = batches.flat().sort((left, right) => right.score - left.score);

          if (candidates.length > 0) {
            return {
              candidates: candidates.slice(0, 12),
              status: "ok" as const,
              message: `mode=${discoveryMode} / focus=${focusCategory} / subs=${subreddits.join(",")}`
            };
          }
        } catch {
          // Fall back to local seed candidates when Reddit is unavailable.
        }

        return {
          candidates: [
            {
              id: "reddit-fallback-01",
              title: "Unexpected daily habit story with strong retention hook",
              summary:
                "A Reddit-style first-person story that can be reframed into a Korean curiosity short.",
              operatorSummary:
                "A first-person confession-style story with strong emotional stakes and clear retell potential.",
              contentAngle:
                "confession retell / twist reveal / audience judgment",
              media: this.buildMediaMetadata(),
              sourceKind: "reddit",
              sourceRegion: "global",
              sourceLabel: "Reddit Hot Fallback",
              score: 35,
              metrics: {
                upvoteRatio: 0.96,
                upvotes: 18400,
                comments: 1300
              },
              fitReason:
                "High engagement, first-person storytelling, easy to localize for Korean viewers."
            }
        ],
          status: "fallback" as const,
          message: `Reddit live fetch returned no candidates. Using fallback seed. mode=${discoveryMode} / focus=${focusCategory}`
        };
      }
    };
  }

  private createGlobalRssAdapter(): TrendAdapter {
    return {
      id: "rss-global",
      region: "global",
      fetchCandidates: async () => ({
        candidates: [
          {
            id: "rss-shorts-02",
            title: "Global shortform format trend with an easy Korean angle",
            summary:
              "A repeatable shortform concept that can be repackaged with a stronger Korean hook.",
            operatorSummary:
              "A broad format trend that can be localized into a Korean reaction or explainer short.",
            contentAngle:
              "format remix / Korean reaction angle / curiosity-led storytelling",
            media: this.buildMediaMetadata(),
            sourceKind: "rss",
            sourceRegion: "global",
            sourceLabel: "Global Creator Feed",
            score: 32,
            metrics: {
              views: 120000
            },
            fitReason:
              "Clear visual structure, good for fast rewriting, and useful for daily shortlist volume."
          }
        ],
        status: "fallback" as const,
        message: "Static RSS seed until a live feed is connected."
      })
    };
  }

  private resolveRedditDiscoveryMode(request: TrendDiscoveryRequest): RedditDiscoveryMode {
    return request.discoveryMode === "news_card" ? "news_card" : "shortform_story";
  }

  private resolveRedditSubreddits(request: TrendDiscoveryRequest): string[] {
    const rawCustom = request.redditSubreddits
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (rawCustom && rawCustom.length > 0) {
      return [...new Set(rawCustom)];
    }
    const mode = this.resolveRedditDiscoveryMode(request);
    if (mode !== "news_card") {
      return [...REDDIT_SHORTFORM_SUBREDDITS];
    }
    const focusCategory = this.resolveRedditFocusCategory(request);
    if (focusCategory === "all") {
      return [...REDDIT_NEWS_CARD_SUBREDDITS];
    }
    if (focusCategory === "world") {
      return ["worldnews", "geopolitics", "news", "economics", "business"];
    }
    if (focusCategory === "breaking") {
      return ["news", "worldnews", "OutOfTheLoop", "geopolitics"];
    }
    return ["China", "worldnews", "geopolitics", "news", "technology"];
  }

  private resolveRedditFocusCategory(request: TrendDiscoveryRequest): TrendFocusCategory {
    return request.focusCategory === "world" ||
      request.focusCategory === "breaking" ||
      request.focusCategory === "china"
      ? request.focusCategory
      : "all";
  }

  private matchesRedditPostType(
    post: RedditPostData | undefined,
    mode: RedditDiscoveryMode
  ): boolean {
    if (!post) {
      return false;
    }
    if (mode === "news_card") {
      return post.is_self === false;
    }
    return post.is_self !== false;
  }

  private matchesRedditQualityGate(
    post: RedditPostData | undefined,
    mode: RedditDiscoveryMode
  ): boolean {
    const ratio = post?.upvote_ratio ?? 0;
    const comments = post?.num_comments ?? 0;
    const upvotes = post?.ups ?? 0;
    const selfTextLength = post?.selftext?.trim().length ?? 0;

    if (mode === "news_card") {
      return ratio >= 0.72 && comments >= 20 && upvotes >= 120;
    }
    return ratio >= 0.9 && selfTextLength >= 500 && selfTextLength <= 1000;
  }

  private resolveRedditSourceUrl(
    post: RedditPostData | undefined
  ): string | undefined {
    const link = post?.url?.trim();
    if (link && /^https?:\/\//i.test(link)) {
      return link;
    }
    if (post?.permalink) {
      return `https://www.reddit.com${post.permalink}`;
    }
    return undefined;
  }

  private createDomesticCommunityAdapter(): TrendAdapter {
    return {
      id: "domestic-community",
      region: "domestic",
      fetchCandidates: async (request) => {
        const candidates: TrendCandidate[] = [];
        const messages: string[] = [];

        try {
          const fmKoreaCandidates = await this.fetchFmKoreaBestCandidates(request.timeWindow);
          candidates.push(...fmKoreaCandidates);
          messages.push(`fmkorea:${fmKoreaCandidates.length}`);
        } catch (error) {
          messages.push(`fmkorea:error:${error instanceof Error ? error.message : "unknown"}`);
        }

        try {
          const pannCandidates = await this.fetchPannRankingCandidates(request.timeWindow);
          candidates.push(...pannCandidates);
          messages.push(`pann:${pannCandidates.length}`);
        } catch (error) {
          messages.push(`pann:error:${error instanceof Error ? error.message : "unknown"}`);
        }

        try {
          const dcCandidates = await this.fetchDcHitGalleryCandidates(request.timeWindow);
          candidates.push(...dcCandidates);
          messages.push(`dc:${dcCandidates.length}`);
        } catch (error) {
          messages.push(`dc:error:${error instanceof Error ? error.message : "unknown"}`);
        }

        if (candidates.length > 0) {
          return {
            candidates: this.pickDiverseTopCandidates(candidates, 12),
            status: "ok" as const,
            message: messages.join(" | ")
          };
        }

        return {
          candidates: [
            {
              id: "domestic-community-fallback-03",
              title: "Korean community topic with strong comment velocity",
              summary:
                "A community-driven story format tuned for local reactions and discussion bait.",
              operatorSummary:
                "Fallback domestic issue placeholder while live Korean community parsing is unavailable.",
              contentAngle:
                "community outrage / reaction commentary / local issue framing",
              media: this.buildMediaMetadata(),
              sourceKind: "mock",
              sourceRegion: "domestic",
              sourceLabel: "Domestic community fallback",
              score: 24,
              metrics: {
                comments: 420,
                views: 56000
              },
              fitReason: "Fallback domestic candidate while live community adapters are unavailable."
            }
          ],
          status: "fallback" as const,
          message: messages.join(" | ") || "No live domestic candidates found."
        };
      }
    };
  }

  private async fetchRedditSubredditCandidates(
    subreddit: string,
    timeWindow: "24h" | "3d",
    mode: RedditDiscoveryMode,
    focusCategory: TrendFocusCategory
  ): Promise<TrendCandidate[]> {
    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/top.json?raw_json=1&limit=30&t=${
        timeWindow === "24h" ? "day" : "week"
      }`,
      {
        headers: HTML_HEADERS
      }
    );

    if (!response.ok) {
      throw new Error(`Reddit HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RedditListingResponse;
    const minCreatedUtc =
      Date.now() / 1000 - (timeWindow === "24h" ? 24 * 60 * 60 : 3 * 24 * 60 * 60);

    return (payload.data?.children ?? [])
      .map((entry) => entry.data)
      .filter((post): post is NonNullable<typeof post> => Boolean(post?.id && post.title))
      .filter((post) => this.matchesRedditPostType(post, mode))
      .filter((post) => !post.over_18)
      .filter((post) => (post.created_utc ?? 0) >= minCreatedUtc)
      .filter((post) => this.matchesRedditQualityGate(post, mode))
      .filter((post) => this.matchesRedditFocusCategory(post, focusCategory, mode))
      .map((post) => {
        const summary = this.buildRedditSummary(post.selftext ?? "", mode, post.domain);
        const sourceUrl = this.resolveRedditSourceUrl(post);
        return {
          id: `reddit-${post.id}`,
          title: post.title ?? "Untitled Reddit story",
          summary,
          operatorSummary: this.buildRedditOperatorSummary(post.title ?? "", summary, mode),
          contentAngle: this.buildRedditContentAngle(post.title ?? "", post.selftext ?? ""),
          media: this.buildMediaMetadata(),
          sourceKind: "reddit" as const,
          sourceRegion: "global" as const,
          sourceLabel: `r/${post.subreddit ?? subreddit}`,
          sourceUrl,
          score: this.calculateRedditScore({
            subreddit: post.subreddit ?? subreddit,
            mode,
            focusCategory,
            title: post.title,
            created_utc: post.created_utc,
            ups: post.ups,
            num_comments: post.num_comments,
            upvote_ratio: post.upvote_ratio,
            selftext: post.selftext
          }),
          metrics: {
            upvoteRatio: post.upvote_ratio,
            upvotes: post.ups,
            comments: post.num_comments
          },
          fitReason:
            mode === "news_card"
              ? `News-card profile: high signal subreddit, recent reaction volume, and ${focusCategory === "all" ? "external-source compatibility" : `${focusCategory} angle relevance`}.`
              : "Strong first-person story format with high approval ratio and enough detail for a Korean shortform rewrite."
        };
      });
  }

  private matchesRedditFocusCategory(
    post: RedditPostData,
    focusCategory: TrendFocusCategory,
    mode: RedditDiscoveryMode
  ): boolean {
    if (focusCategory === "all" || mode !== "news_card") {
      return true;
    }

    const title = post.title?.toLowerCase() ?? "";
    const body = post.selftext?.toLowerCase() ?? "";
    const domain = post.domain?.toLowerCase() ?? "";
    const subreddit = post.subreddit?.toLowerCase() ?? "";
    const joined = `${title} ${body} ${domain} ${subreddit}`;
    const keywords = REDDIT_FOCUS_KEYWORDS[focusCategory];
    const matchedByKeyword = keywords.some((keyword) => joined.includes(keyword));

    if (matchedByKeyword) {
      return true;
    }
    if (focusCategory === "world") {
      return subreddit === "worldnews" || subreddit === "geopolitics" || subreddit === "news";
    }
    if (focusCategory === "breaking") {
      const recencyHours = post.created_utc
        ? (Date.now() / 1000 - post.created_utc) / 3600
        : Number.POSITIVE_INFINITY;
      const comments = post.num_comments ?? 0;
      return recencyHours <= 12 && comments >= 80;
    }
    return subreddit.includes("china");
  }

  private buildRedditSummary(selftext: string, mode: RedditDiscoveryMode, domain?: string): string {
    if (mode === "news_card") {
      const sourceHint = domain ? `Source domain: ${domain}.` : "";
      const compactNews = selftext.replace(/\s+/g, " ").trim();
      if (compactNews.length === 0) {
        return `${sourceHint} Community reaction potential detected from a news-oriented subreddit.`.trim();
      }
      return compactNews.length > 140 ? `${compactNews.slice(0, 137)}...` : compactNews;
    }
    const compact = selftext.replace(/\s+/g, " ").trim();
    return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
  }

  private buildRedditOperatorSummary(
    title: string,
    summary: string,
    mode: RedditDiscoveryMode
  ): string {
    if (mode === "news_card") {
      return `${title}. ${summary || "News-driven community reaction candidate with clear card-news remix potential."}`;
    }
    return `${title}. ${summary || "A high-retention personal story candidate from Reddit."}`;
  }

  private buildRedditContentAngle(title: string, body: string): string {
    const text = `${title} ${body}`.toLowerCase();
    if (text.includes("salary") || text.includes("money")) {
      return "salary reveal / status gap / comment-bait reaction";
    }
    if (text.includes("cheat") || text.includes("partner") || text.includes("ex")) {
      return "relationship betrayal / emotional fallout / viewer debate";
    }
    if (text.includes("coworker") || text.includes("office") || text.includes("team")) {
      return "office drama / secret status gap / hidden truth reveal";
    }
    return "first-person confession / twist reveal / audience judgment";
  }

  private calculateRedditScore(post: {
    subreddit?: string;
    mode: RedditDiscoveryMode;
    focusCategory: TrendFocusCategory;
    title?: string;
    created_utc?: number;
    ups?: number;
    num_comments?: number;
    upvote_ratio?: number;
    selftext?: string;
  }): number {
    const focusBoost = this.calculateRedditFocusBoost(post);
    if (post.mode === "news_card") {
      const upvotes = Math.min((post.ups ?? 0) / 350, 26);
      const comments = Math.min((post.num_comments ?? 0) / 20, 22);
      const ratio = Math.round((post.upvote_ratio ?? 0) * 16);
      const recencyHours = post.created_utc ? (Date.now() / 1000 - post.created_utc) / 3600 : 999;
      const recency = recencyHours <= 12 ? 18 : recencyHours <= 24 ? 12 : recencyHours <= 72 ? 6 : 2;
      const discussionDensity = Math.min(
        (((post.num_comments ?? 0) / Math.max(post.ups ?? 1, 1)) * 140),
        12
      );
      const sourceTrust =
        REDDIT_NEWS_TRUST_BONUS[(post.subreddit ?? "").toLowerCase()] ?? 0;
      const hookFit = this.calculateShortformHookScore(post.title ?? "", post.selftext ?? "") * 0.5;
      return Math.round(
        upvotes + comments + ratio + recency + discussionDensity + sourceTrust + hookFit + focusBoost
      );
    }

    const upvotes = Math.min((post.ups ?? 0) / 250, 40);
    const comments = Math.min((post.num_comments ?? 0) / 15, 25);
    const ratio = Math.round((post.upvote_ratio ?? 0) * 25);
    const length = post.selftext?.trim().length ?? 0;
    const lengthFit = length >= 650 && length <= 900 ? 12 : 6;
    const recencyBoost =
      post.created_utc && Date.now() / 1000 - post.created_utc <= 24 * 60 * 60 ? 8 : 3;
    const hookFit = this.calculateShortformHookScore(post.title ?? "", post.selftext ?? "");
    const discussionDensity = Math.min(
      (((post.num_comments ?? 0) / Math.max(post.ups ?? 1, 1)) * 120),
      10
    );
    return Math.round(
      upvotes + comments + ratio + lengthFit + recencyBoost + hookFit + discussionDensity + focusBoost * 0.5
    );
  }

  private calculateRedditFocusBoost(post: {
    subreddit?: string;
    focusCategory: TrendFocusCategory;
    title?: string;
    selftext?: string;
  }): number {
    if (post.focusCategory === "all") {
      return 0;
    }

    const joined = `${post.title ?? ""} ${post.selftext ?? ""} ${post.subreddit ?? ""}`.toLowerCase();
    const keywords = REDDIT_FOCUS_KEYWORDS[post.focusCategory];
    const hits = keywords.reduce((count, keyword) => (joined.includes(keyword) ? count + 1 : count), 0);

    if (post.focusCategory === "china") {
      const subredditBonus = (post.subreddit ?? "").toLowerCase().includes("china") ? 8 : 0;
      return Math.min(18, hits * 5 + subredditBonus);
    }
    if (post.focusCategory === "breaking") {
      return Math.min(14, hits * 4);
    }
    return Math.min(12, hits * 3);
  }

  private async fetchPannRankingCandidates(timeWindow: "24h" | "3d"): Promise<TrendCandidate[]> {
    const pannPath = timeWindow === "24h" ? "d" : "w";
    const response = await fetch(`https://pann.nate.com/talk/ranking/${pannPath}`, {
      headers: HTML_HEADERS
    });

    if (!response.ok) {
      throw new Error(`Pann HTTP ${response.status}`);
    }

    const html = await this.readHtml(response, "pann");
    const text = this.htmlToText(html);
    this.writeDebugSnapshot("pann", html, text);
    const $ = load(html);
    const candidates: TrendCandidate[] = [];
    $("ul.post_wrap > li").each((_, element) => {
      const title = $(element).find("dd.txt a").first().text().trim();
      const href = $(element).find("dd.txt a").first().attr("href");
      const countText = $(element).find("dd.info .count").text();
      const recommendText = $(element).find("dd.info .rcm").text();
      const replyText = $(element).find("dt .cmt").text();
      const views = this.extractNumber(countText);
      const recommends = this.extractNumber(recommendText);
      const comments = this.extractNumber(replyText);

      if (!title || views < 8000 || (comments < 20 && recommends < 50)) {
        return;
      }

      candidates.push({
        id: `pann-${this.slugify(title)}`,
        title,
        summary: "Nate Pann ranking topic with strong local reaction signals and comment volume.",
        operatorSummary: this.buildDomesticOperatorSummary(title),
        contentAngle: this.buildDomesticContentAngle(title),
        media: this.buildMediaMetadata(),
        sourceKind: "nate-pann",
        sourceRegion: "domestic",
        sourceLabel: `Nate Pann ${timeWindow === "24h" ? "Daily" : "Weekly"} Ranking`,
        sourceUrl: href ? `https://pann.nate.com${href}` : undefined,
        score: this.calculateDomesticScore({ title, views, comments, recommends }),
        metrics: {
          views,
          comments
        },
        fitReason:
          "High local engagement and clear emotional angle that can be reframed into a Korean shortform narrative."
      });
    });

    return candidates.slice(0, 10);
  }

  private async fetchFmKoreaBestCandidates(timeWindow: "24h" | "3d"): Promise<TrendCandidate[]> {
    const response = await fetch("https://m.fmkorea.com/index.php?mid=best", {
      headers: HTML_HEADERS
    });

    if (!response.ok) {
      throw new Error(`FMKorea HTTP ${response.status}`);
    }

    const html = await this.readHtml(response, "fmkorea");
    const text = this.htmlToText(html);
    this.writeDebugSnapshot("fmkorea", html, text);
    const $ = load(html);
    const candidates: TrendCandidate[] = [];
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    if (timeWindow === "3d") {
      minDate.setDate(minDate.getDate() - 2);
    }

    const seen = new Set<string>();
    $("a[href*='document_srl='], a[href*='/best/']").each((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href");
      const title = anchor.text().replace(/\s+/g, " ").trim();

      if (!href || !title || title.length < 6) {
        return;
      }

      const documentIdMatch = href.match(/document_srl=(\d+)|\/best\/(\d+)/);
      const documentId = documentIdMatch?.[1] ?? documentIdMatch?.[2];
      if (!documentId || seen.has(documentId)) {
        return;
      }

      const containerText = anchor.closest("li, article, .fm_best_item, .li, .wrap, .rd").text();
      const publishedAt = this.parseFmKoreaDate(containerText);
      if (publishedAt && publishedAt < minDate) {
        return;
      }

      const views = this.extractNumber(this.extractMetric(containerText, ["조회", "조회 수", "조회수"]));
      const recommends = this.extractNumber(this.extractMetric(containerText, ["추천", "추천 수", "추천수", "포텐"]));
      const comments = this.extractNumber(this.extractMetric(containerText, ["댓글", "댓글 수", "댓글수"]));

      if (views < 20000 && recommends < 80 && comments < 60) {
        return;
      }

      seen.add(documentId);
      const resolvedUrl = href.startsWith("http")
        ? href
        : href.startsWith("/")
          ? `https://m.fmkorea.com${href}`
          : `https://m.fmkorea.com/${href.replace(/^\/+/, "")}`;

      candidates.push({
        id: `fmkorea-${documentId}`,
        title,
        summary: "FMKorea best topic with proven local traction and strong reaction potential.",
        operatorSummary: this.buildDomesticOperatorSummary(title),
        contentAngle: this.buildDomesticContentAngle(title),
        media: this.buildMediaMetadata(),
        sourceKind: "fmkorea",
        sourceRegion: "domestic",
        sourceLabel: "FMKorea Best",
        sourceUrl: resolvedUrl,
        score: this.calculateDomesticScore({ title, views, comments, recommends }),
        metrics: {
          views,
          comments
        },
        fitReason:
          "Already active in a high-traffic Korean community and suitable for fast reaction-based shortform framing."
      });
    });

    return candidates.slice(0, 10);
  }

  private async fetchDcHitGalleryCandidates(timeWindow: "24h" | "3d"): Promise<TrendCandidate[]> {
    const response = await fetch("https://gall.dcinside.com/board/lists/?id=hit", {
      headers: HTML_HEADERS
    });

    if (!response.ok) {
      throw new Error(`DC HTTP ${response.status}`);
    }

    const html = await this.readHtml(response, "dc");
    const text = this.htmlToText(html);
    this.writeDebugSnapshot("dc", html, text);
    const $ = load(html);
    const candidates: TrendCandidate[] = [];
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    if (timeWindow === "3d") {
      minDate.setDate(minDate.getDate() - 2);
    }

    $("tr.ub-content.us-post").each((_, element) => {
      const title = $(element).find("td.gall_tit a").last().text().trim();
      const href = $(element).find("td.gall_tit a").last().attr("href");
      const dateText = $(element).find("td.gall_date").attr("title") ?? $(element).find("td.gall_date").text();
      const views = this.extractNumber($(element).find("td.gall_count").text());
      const recommends = this.extractNumber($(element).find("td.gall_recommend").text());
      const comments = this.extractNumber($(element).find("td.gall_tit .reply_num").text());
      const publishedAt = this.parseDcDate(dateText);

      if (!title || !publishedAt || publishedAt < minDate || views < 30000 || recommends < 40) {
        return;
      }

      candidates.push({
        id: `dc-${this.slugify(title)}`,
        title,
        summary: "DC hit gallery topic with proven community traction and strong retell potential.",
        operatorSummary: this.buildDomesticOperatorSummary(title),
        contentAngle: this.buildDomesticContentAngle(title),
        media: this.buildMediaMetadata(),
        sourceKind: "dcinside",
        sourceRegion: "domestic",
        sourceLabel: "DC Hit Gallery",
        sourceUrl: href ? `https://gall.dcinside.com${href}` : undefined,
        score: this.calculateDomesticScore({ title, views, comments, recommends }),
        metrics: {
          views,
          comments
        },
        fitReason:
          "Already proven in a high-traffic Korean community and likely to convert into high-curiosity shortform framing."
      });
    });

    return candidates.slice(0, 10);
  }

  private calculateDomesticScore(input: {
    title?: string;
    views: number;
    comments: number;
    recommends: number;
  }): number {
    const views = Math.min(input.views / 2500, 35);
    const comments = Math.min(input.comments / 8, 30);
    const recommends = Math.min(input.recommends / 10, 25);
    const commentVelocity = Math.min(
      (input.comments / Math.max(input.views, 1)) * 2500,
      12
    );
    const recommendationStrength = Math.min(
      (input.recommends / Math.max(input.views, 1)) * 4000,
      8
    );
    const hookFit = this.calculateShortformHookScore(input.title ?? "");
    return Math.round(
      views + comments + recommends + commentVelocity + recommendationStrength + hookFit
    );
  }

  private calculateShortformHookScore(title: string, body = ""): number {
    const text = `${title} ${body}`.toLowerCase();
    let score = 0;

    if (title.length >= 8 && title.length <= 42) {
      score += 3;
    }

    if (/\d/.test(title)) {
      score += 2;
    }

    if (/[!?]/.test(title)) {
      score += 2;
    }

    const highRetentionPatterns = [
      "salary",
      "coworker",
      "boss",
      "team",
      "partner",
      "cheat",
      "husband",
      "wife",
      "boyfriend",
      "girlfriend",
      "concert",
      "fandom",
      "bts",
      "psy",
      "event",
      "caught",
      "secret",
      "lying",
      "ex",
      "revenge",
      "money",
      "debt",
      "wedding",
      "drama",
      "confession",
      "연봉",
      "회사",
      "직장",
      "남친",
      "여친",
      "남편",
      "아내",
      "바람",
      "공연",
      "팬",
      "방탄",
      "아이브",
      "싸이",
      "출입",
      "마감",
      "논란",
      "충격",
      "실화",
      "비밀",
      "폭로",
      "배신",
      "집",
      "돈"
    ];

    const emotionalPatterns = [
      "i ",
      "my ",
      "me ",
      "am i",
      "tifu",
      "aita",
      "hurt",
      "broken",
      "lost",
      "angry",
      "억울",
      "화남",
      "울",
      "답답",
      "소름",
      "충격"
    ];

    if (highRetentionPatterns.some((pattern) => text.includes(pattern))) {
      score += 4;
    }

    if (emotionalPatterns.some((pattern) => text.includes(pattern))) {
      score += 3;
    }

    return Math.min(score, 10);
  }

  private pickDiverseTopCandidates(
    candidates: TrendCandidate[],
    limit: number
  ): TrendCandidate[] {
    const sorted = [...candidates].sort((left, right) => right.score - left.score);
    const selected: TrendCandidate[] = [];
    const seenSources = new Set<string>();

    for (const candidate of sorted) {
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
      for (const candidate of sorted) {
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

  private buildMediaMetadata(
    imageUrls: string[] = [],
    analysisPolicy: "text_only" | "vision_on_demand" = "text_only"
  ): TrendCandidate["media"] {
    return {
      hasMedia: imageUrls.length > 0,
      imageUrls,
      analysisPolicy
    };
  }

  private buildDomesticOperatorSummary(title: string): string {
    if (title.includes("방탄") || title.includes("싸이") || title.includes("아이브") || title.includes("엑소")) {
      return "Entertainment or fandom comparison topic with strong reaction and comment potential in Korea.";
    }
    if (title.includes("공연") || title.includes("광화문") || title.includes("출입")) {
      return "Live event or crowd-control issue that can be reframed as a reaction-based current-affairs short.";
    }
    if (title.includes("돈") || title.includes("집")) {
      return "Class tension or everyday life commentary likely to split viewer opinion.";
    }
    return "Korean community issue with enough reaction signals to test as a shortform commentary angle.";
  }

  private buildDomesticContentAngle(title: string): string {
    if (title.includes("방탄") || title.includes("싸이") || title.includes("아이브") || title.includes("엑소")) {
      return "fandom comparison / chart or crowd gap / heated reaction clip";
    }
    if (title.includes("공연") || title.includes("광화문") || title.includes("출입")) {
      return "live-event confusion recap / blame angle / fast reaction summary";
    }
    if (title.includes("연애") || title.includes("남자") || title.includes("여자")) {
      return "relationship commentary / gender-friction angle / opinion split";
    }
    return "community recap / Korean reaction summary / debate framing";
  }

  private resolveYouTubePeriodCutoff(period: "24h" | "3d" | "7d"): Date {
    const now = Date.now();
    const offsetHours = period === "7d" ? 7 * 24 : period === "3d" ? 3 * 24 : 24;
    return new Date(now - offsetHours * 60 * 60 * 1000);
  }

  private normalizeYouTubeSubscriberRange(
    value: YouTubeBreakoutDiscoveryRequest["subscriberRange"]
  ):
    | "all"
    | "0_10k"
    | "10k_50k"
    | "50k_100k"
    | "100k_200k"
    | "200k_300k"
    | "300k_500k"
    | "500k_plus" {
    const allowed = new Set([
      "all",
      "0_10k",
      "10k_50k",
      "50k_100k",
      "100k_200k",
      "200k_300k",
      "300k_500k",
      "500k_plus"
    ]);
    return value && allowed.has(value) ? value : "all";
  }

  private resolveSubscriberBand(
    value:
      | "all"
      | "0_10k"
      | "10k_50k"
      | "50k_100k"
      | "100k_200k"
      | "200k_300k"
      | "300k_500k"
      | "500k_plus"
  ): { min: number; max?: number } | undefined {
    switch (value) {
      case "0_10k":
        return { min: 0, max: 10_000 };
      case "10k_50k":
        return { min: 10_000, max: 50_000 };
      case "50k_100k":
        return { min: 50_000, max: 100_000 };
      case "100k_200k":
        return { min: 100_000, max: 200_000 };
      case "200k_300k":
        return { min: 200_000, max: 300_000 };
      case "300k_500k":
        return { min: 300_000, max: 500_000 };
      case "500k_plus":
        return { min: 500_000 };
      default:
        return undefined;
    }
  }

  private async applyCaptionAvailabilityFilter(
    candidatePool: Array<{ candidate: TrendCandidate; ratioPercent: number }>,
    limit: number,
    requireCaptions: boolean,
    country: string
  ): Promise<TrendCandidate[]> {
    if (!requireCaptions) {
      return candidatePool.slice(0, limit).map((item) => ({
        ...item.candidate,
        captionMode: item.candidate.captionMode ?? "none"
      }));
    }

    const preferredLanguage = country === "KR" ? "ko" : "en";
    const filtered: TrendCandidate[] = [];
    const maxProbe = Math.min(candidatePool.length, Math.max(limit * 5, limit));
    for (let index = 0; index < maxProbe; index += 1) {
      if (filtered.length >= limit) {
        break;
      }
      const candidate = candidatePool[index]?.candidate;
      if (!candidate?.sourceUrl) {
        continue;
      }
      const videoId = this.extractYouTubeVideoId(candidate.sourceUrl);
      if (!videoId) {
        continue;
      }
      const captionMode = await this.inspectYouTubeCaptionMode(videoId, preferredLanguage);
      if (captionMode === "none") {
        continue;
      }
      filtered.push({
        ...candidate,
        captionMode
      });
    }
    return filtered;
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

  private async inspectYouTubeCaptionAvailability(
    videoId: string,
    preferredLanguage: "ko" | "en"
  ): Promise<{ mode: "manual" | "asr" | "none"; usable: boolean }> {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    try {
      const response = await fetch(watchUrl, {
        headers: {
          "Accept-Language": preferredLanguage === "ko" ? "ko-KR,ko;q=0.9,en;q=0.6" : "en-US,en;q=0.9",
          ...YOUTUBE_HEADERS
        }
      });
      if (!response.ok) {
        return { mode: "none", usable: false };
      }
      const html = await response.text();
      const jsonText = this.extractYouTubePlayerResponseJson(html);
      if (!jsonText) {
        return { mode: "none", usable: false };
      }
      const payload = JSON.parse(jsonText) as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{
              languageCode?: string;
              kind?: string;
              vssId?: string;
              baseUrl?: string;
            }>;
          };
        };
      };
      const tracks = payload.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length === 0) {
        return { mode: "none", usable: false };
      }
      const languageTracks = tracks.filter((track) => track.languageCode === preferredLanguage);
      const pool = languageTracks.length > 0 ? languageTracks : tracks;
      const manualTrack = pool.find((track) => !this.isAsrTrack(track));
      const asrTrack = pool.find((track) => this.isAsrTrack(track));
      const selectedTrack = manualTrack ?? asrTrack;
      const mode: "manual" | "asr" | "none" =
        selectedTrack && !this.isAsrTrack(selectedTrack)
          ? "manual"
          : selectedTrack && this.isAsrTrack(selectedTrack)
            ? "asr"
            : "none";
      if (!selectedTrack?.baseUrl || mode === "none") {
        return { mode, usable: false };
      }

      const captionUrls = this.buildYouTubeCaptionCandidateUrls(selectedTrack.baseUrl);
      for (const captionUrl of captionUrls) {
        const captionResponse = await fetch(captionUrl, {
          headers: this.buildYouTubeCaptionHeaders(preferredLanguage, watchUrl)
        });
        if (!captionResponse.ok) {
          if (captionResponse.status === 429) {
            break;
          }
          continue;
        }
        const content = await captionResponse.text();
        const transcript = this.parseYouTubeCaptionContent(content);
        if (transcript.length > 0) {
          return { mode, usable: true };
        }
      }
      return { mode, usable: false };
    } catch {
      return { mode: "none", usable: false };
    }
  }

  private async inspectYouTubeCaptionMode(
    videoId: string,
    preferredLanguage: "ko" | "en"
  ): Promise<"manual" | "asr" | "none"> {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    try {
      const response = await fetch(watchUrl, {
        headers: {
          "Accept-Language": preferredLanguage === "ko" ? "ko-KR,ko;q=0.9,en;q=0.6" : "en-US,en;q=0.9",
          ...YOUTUBE_HEADERS
        }
      });
      if (!response.ok) {
        return "none";
      }
      const html = await response.text();
      const jsonText = this.extractYouTubePlayerResponseJson(html);
      if (!jsonText) {
        return "none";
      }
      const payload = JSON.parse(jsonText) as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: Array<{
              languageCode?: string;
              kind?: string;
              vssId?: string;
              baseUrl?: string;
            }>;
          };
        };
      };
      const tracks = payload.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length === 0) {
        return "none";
      }
      const languageTracks = tracks.filter((track) => track.languageCode === preferredLanguage);
      const pool = languageTracks.length > 0 ? languageTracks : tracks;
      const manualTrack = pool.find((track) => !this.isAsrTrack(track));
      if (manualTrack) {
        return "manual";
      }
      const asrTrack = pool.find((track) => this.isAsrTrack(track));
      if (asrTrack) {
        return "asr";
      }
      return "none";
    } catch {
      return "none";
    }
  }

  private extractYouTubePlayerResponseJson(html: string): string | undefined {
    const marker = "ytInitialPlayerResponse";
    const markerIndex = html.indexOf(marker);
    if (markerIndex >= 0) {
      const start = html.indexOf("{", markerIndex);
      if (start >= 0) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < html.length; index += 1) {
          const char = html[index];
          if (inString) {
            if (escaped) {
              escaped = false;
              continue;
            }
            if (char === "\\") {
              escaped = true;
              continue;
            }
            if (char === "\"") {
              inString = false;
            }
            continue;
          }
          if (char === "\"") {
            inString = true;
            continue;
          }
          if (char === "{") {
            depth += 1;
            continue;
          }
          if (char === "}") {
            depth -= 1;
            if (depth === 0) {
              return html.slice(start, index + 1);
            }
          }
        }
      }
    }

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

  private isAsrTrack(track: { kind?: string; vssId?: string }): boolean {
    return track.kind === "asr" || track.vssId?.includes(".asr") === true;
  }

  private parseYouTubeCaptionXml(xml: string): string {
    const lines: string[] = [];
    const textMatches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)];
    const paragraphMatches = [...xml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const rawChunks = [...textMatches, ...paragraphMatches].map((match) => match[1] ?? "");

    for (const chunk of rawChunks) {
      const normalized = this.decodeHtmlEntities(chunk)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (normalized) {
        lines.push(normalized);
      }
      if (lines.length >= 200) {
        break;
      }
    }

    return lines.join(" ").trim();
  }

  private parseYouTubeCaptionVtt(vtt: string): string {
    const lines = vtt
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith("WEBVTT"))
      .filter((line) => !line.startsWith("NOTE"))
      .filter((line) => !/^\d+$/.test(line))
      .filter((line) => !/^\d{1,2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?\.\d{3}/.test(line))
      .map((line) => line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);
    return lines.join(" ").trim();
  }

  private parseYouTubeCaptionContent(content: string): string {
    const xml = this.parseYouTubeCaptionXml(content);
    if (xml.length > 0) {
      return xml;
    }
    return this.parseYouTubeCaptionVtt(content);
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => {
        const parsed = Number.parseInt(code, 10);
        return Number.isFinite(parsed) ? String.fromCharCode(parsed) : "";
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
        const parsed = Number.parseInt(code, 16);
        return Number.isFinite(parsed) ? String.fromCharCode(parsed) : "";
      });
  }

  private ensureYouTubeCaptionSrv3Url(baseUrl: string): string {
    try {
      const parsed = new URL(baseUrl);
      parsed.searchParams.set("fmt", "srv3");
      return parsed.toString();
    } catch {
      if (baseUrl.includes("fmt=")) {
        return baseUrl.replace(/([?&])fmt=[^&]*/i, "$1fmt=srv3");
      }
      return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=srv3`;
    }
  }

  private ensureYouTubeCaptionVttUrl(baseUrl: string): string {
    try {
      const parsed = new URL(baseUrl);
      parsed.searchParams.set("fmt", "vtt");
      return parsed.toString();
    } catch {
      if (baseUrl.includes("fmt=")) {
        return baseUrl.replace(/([?&])fmt=[^&]*/i, "$1fmt=vtt");
      }
      return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=vtt`;
    }
  }

  private buildYouTubeCaptionCandidateUrls(baseUrl: string): string[] {
    const urls = [baseUrl, this.ensureYouTubeCaptionSrv3Url(baseUrl), this.ensureYouTubeCaptionVttUrl(baseUrl)];
    return Array.from(new Set(urls));
  }

  private buildYouTubeCaptionHeaders(
    preferredLanguage: "ko" | "en",
    watchUrl: string
  ): Record<string, string> {
    return {
      "Accept-Language": preferredLanguage === "ko" ? "ko-KR,ko;q=0.9,en;q=0.6" : "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
      Referer: watchUrl,
      Origin: "https://www.youtube.com"
    };
  }

  private parseNumericValue(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === "string") {
      const normalized = value.replace(/[^0-9.]/g, "");
      const parsed = Number.parseFloat(normalized);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 0;
  }

  private async extractYouTubeApiError(
    response: Response,
    fallbackMessage: string
  ): Promise<string> {
    try {
      const payload = (await response.json()) as YouTubeApiErrorPayload;
      const detail =
        payload.error?.errors?.[0]?.message ??
        payload.error?.errors?.[0]?.reason ??
        payload.error?.message;
      if (detail) {
        return `${fallbackMessage}: ${detail}`;
      }
    } catch {
      // ignore parse failure and return fallback below
    }
    return fallbackMessage;
  }

  private buildYouTubeBreakoutFallbackCandidatesReadable(
    request: YouTubeBreakoutDiscoveryResult["request"]
  ): TrendCandidate[] {
    const ratioText = `${request.breakoutRatioPercent.toFixed(0)}%`;
    return [
      {
        id: `youtube-breakout-fallback-${request.country.toLowerCase()}-${request.period}`,
        title: `YouTube breakout sample (${request.country}, ${ratioText}+)`,
        summary: `Live fetch failed or no videos matched filter. country=${request.country}, period=${request.period}, category=${request.categoryId}.`,
        operatorSummary: `Fallback sample returned because breakout candidates were unavailable for the configured filter (${ratioText}).`,
        contentAngle: "youtube breakout fallback / filter sanity check",
        media: this.buildMediaMetadata(),
        sourceKind: "youtube",
        sourceRegion: request.country === "KR" ? "domestic" : "global",
        sourceLabel: "YouTube Breakout Fallback",
        sourceUrl: `https://www.youtube.com/feed/trending?gl=${request.country}`,
        score: 20,
        metrics: {
          views: 100000,
          comments: 500
        },
        fitReason:
          "Fallback candidate for pipeline verification when live YouTube discovery is unavailable."
      }
    ];
  }

  private buildYouTubeBreakoutFallbackCandidates(
    request: YouTubeBreakoutDiscoveryResult["request"]
  ): TrendCandidate[] {
    const ratioText = `${request.breakoutRatioPercent.toFixed(0)}%`;
    return [
      {
        id: `youtube-breakout-fallback-${request.country.toLowerCase()}-${request.period}`,
        title: `구독자 대비 조회수 ${ratioText} 이상 영상 샘플 (${request.country})`,
        summary:
          `라이브 조회가 실패하거나 필터 조건이 강해서 샘플 후보를 표시합니다. 국가=${request.country}, 기간=${request.period}, 카테고리=${request.categoryId}.`,
        operatorSummary:
          `구독자 대비 조회수 기준(${ratioText})으로 필터링한 유튜브 후보를 불러오지 못해 fallback 샘플을 반환했습니다.`,
        contentAngle: "youtube breakout fallback / filter sanity check",
        media: this.buildMediaMetadata(),
        sourceKind: "youtube",
        sourceRegion: request.country === "KR" ? "domestic" : "global",
        sourceLabel: "YouTube Breakout Fallback",
        sourceUrl: `https://www.youtube.com/feed/trending?gl=${request.country}`,
        score: 20,
        metrics: {
          views: 100000,
          comments: 500
        },
        fitReason:
          "필터 파이프라인 검증용 fallback 후보입니다. 실시간 API 연결 시 실제 영상 후보로 대체됩니다."
      }
    ];
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  private extractNumber(value: string): number {
    const match = value.replaceAll(",", "").match(/\d+/);
    return Number.parseInt(match?.[0] ?? "0", 10);
  }

  private parseDcDate(value: string): Date | undefined {
    const normalized = value.trim();
    const full = normalized.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (full) {
      return new Date(`${full[1]}-${full[2]}-${full[3]}T00:00:00`);
    }

    const short = normalized.match(/(\d{2})\.(\d{2})\.(\d{2})/);
    if (short) {
      const year = Number.parseInt(short[1], 10) + 2000;
      return new Date(`${year}-${short[2]}-${short[3]}T00:00:00`);
    }

    return undefined;
  }

  private parseFmKoreaDate(value: string): Date | undefined {
    const full = value.match(/(20\d{2})[.\-/](\d{2})[.\-/](\d{2})/);
    if (full) {
      return new Date(`${full[1]}-${full[2]}-${full[3]}T00:00:00`);
    }

    const short = value.match(/(\d{2})[.\-/](\d{2})\s+(\d{2}):(\d{2})/);
    if (short) {
      const year = new Date().getFullYear();
      return new Date(`${year}-${short[1]}-${short[2]}T${short[3]}:${short[4]}:00`);
    }

    return undefined;
  }

  private extractMetric(value: string, labels: string[]): string {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = value.match(new RegExp(`${escaped}\\s*[:]?\\s*([0-9,]+)`));
      if (match?.[1]) {
        return match[1];
      }
    }

    return "";
  }

  private async readHtml(response: Response, source: "pann" | "dc" | "fmkorea"): Promise<string> {
    const buffer = await response.arrayBuffer();
    const bytes = Buffer.from(buffer);
    const candidates: string[] = [];
    const asciiHead = bytes.subarray(0, 4096).toString("latin1").toLowerCase();
    const charsetMatch = asciiHead.match(/charset\s*=\s*["']?\s*([a-z0-9_-]+)/i);
    const declaredCharset = charsetMatch?.[1];

    try {
      const debugDir = path.join(
        app.getPath("userData"),
        "mellowcat-vault",
        "automation",
        "debug"
      );
      fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(path.join(debugDir, `${source}-bytes.bin`), bytes);
    } catch {
      // ignore raw byte debug failures
    }

    if (declaredCharset?.includes("utf-8")) {
      return bytes.toString("utf-8");
    }

    if (declaredCharset?.includes("euc-kr") || declaredCharset?.includes("cp949")) {
      try {
        return iconv.decode(bytes, "cp949");
      } catch {
        // ignore
      }
    }

    try {
      candidates.push(bytes.toString("utf-8"));
    } catch {
      // ignore
    }

    if (candidates.length === 0) {
      try {
        candidates.push(iconv.decode(bytes, "cp949"));
      } catch {
        // ignore
      }
    }

    if (candidates.length === 0) {
      try {
        candidates.push(iconv.decode(bytes, "euc-kr"));
      } catch {
        // ignore
      }
    }

    if (candidates.length === 0) {
      return bytes.toString("latin1");
    }

    return candidates.sort((left, right) => this.scoreDecodedText(right) - this.scoreDecodedText(left))[0];
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|h5|h6|span|a)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, "\"")
      .replace(/\r/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, "\n")
      .trim();
  }

  private scoreDecodedText(value: string): number {
    const koreanMatches = value.match(/[가-힣]/g)?.length ?? 0;
    const replacementChars = value.match(/�/g)?.length ?? 0;
    const mojibakeHints = value.match(/[ã�â€œ€]/g)?.length ?? 0;
    return koreanMatches * 3 - replacementChars * 5 - mojibakeHints * 2;
  }

  private writeDebugSnapshot(source: "pann" | "dc" | "fmkorea", html: string, text: string): void {
    try {
      const debugDir = path.join(
        app.getPath("userData"),
        "mellowcat-vault",
        "automation",
        "debug"
      );
      fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(path.join(debugDir, `${source}-raw.html`), html, "utf-8");
      fs.writeFileSync(path.join(debugDir, `${source}-text.txt`), text, "utf-8");
    } catch {
      // Debug snapshot failure should never break discovery.
    }
  }
}
