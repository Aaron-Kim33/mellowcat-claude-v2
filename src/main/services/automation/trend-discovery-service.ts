import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import iconv from "iconv-lite";
import { load } from "cheerio";
import type {
  TrendCandidate,
  TrendDiscoveryRequest,
  TrendDiscoveryResult
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
      };
    }>;
  };
};

const REDDIT_SUBREDDITS = [
  "TrueOffMyChest",
  "tifu",
  "confession",
  "relationship_advice",
  "AmItheAsshole"
] as const;

const REDDIT_USER_AGENT = "MellowCatTrendDiscovery/0.1";
const HTML_HEADERS = {
  "User-Agent": REDDIT_USER_AGENT
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

  private createGlobalRedditAdapter(): TrendAdapter {
    return {
      id: "reddit-global",
      region: "global",
      fetchCandidates: async (request) => {
        try {
          const batches = await Promise.all(
            REDDIT_SUBREDDITS.map((subreddit) =>
              this.fetchRedditSubredditCandidates(subreddit, request.timeWindow)
            )
          );
          const candidates = batches.flat().sort((left, right) => right.score - left.score);

          if (candidates.length > 0) {
            return {
              candidates: candidates.slice(0, 5),
              status: "ok" as const
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
          message: "Reddit live fetch returned no candidates. Using fallback seed."
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
            candidates: this.pickDiverseTopCandidates(candidates, 5),
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
    timeWindow: "24h" | "3d"
  ): Promise<TrendCandidate[]> {
    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/top.json?raw_json=1&limit=15&t=${
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
      .filter((post) => post.is_self !== false)
      .filter((post) => !post.over_18)
      .filter((post) => (post.created_utc ?? 0) >= minCreatedUtc)
      .filter((post) => (post.upvote_ratio ?? 0) >= 0.9)
      .filter((post) => {
        const length = post.selftext?.trim().length ?? 0;
        return length >= 500 && length <= 1000;
      })
      .map((post) => {
        const summary = this.buildRedditSummary(post.selftext ?? "");
        return {
          id: `reddit-${post.id}`,
          title: post.title ?? "Untitled Reddit story",
          summary,
          operatorSummary: this.buildRedditOperatorSummary(post.title ?? "", summary),
          contentAngle: this.buildRedditContentAngle(post.title ?? "", post.selftext ?? ""),
          media: this.buildMediaMetadata(),
          sourceKind: "reddit" as const,
          sourceRegion: "global" as const,
          sourceLabel: `r/${post.subreddit ?? subreddit}`,
          sourceUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
          score: this.calculateRedditScore({
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
            "Strong first-person story format with high approval ratio and enough detail for a Korean shortform rewrite."
        };
      });
  }

  private buildRedditSummary(selftext: string): string {
    const compact = selftext.replace(/\s+/g, " ").trim();
    return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
  }

  private buildRedditOperatorSummary(title: string, summary: string): string {
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
    title?: string;
    created_utc?: number;
    ups?: number;
    num_comments?: number;
    upvote_ratio?: number;
    selftext?: string;
  }): number {
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
      upvotes + comments + ratio + lengthFit + recencyBoost + hookFit + discussionDensity
    );
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

    return candidates.slice(0, 5);
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

    return candidates.slice(0, 5);
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

    return candidates.slice(0, 5);
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
