export type TrendSourceRegion = "global" | "domestic";

export type TrendSourceKind =
  | "reddit"
  | "rss"
  | "youtube"
  | "fmkorea"
  | "dcinside"
  | "nate-pann"
  | "mock";

export interface TrendCandidate {
  id: string;
  title: string;
  summary: string;
  operatorSummary: string;
  contentAngle: string;
  media: {
    hasMedia: boolean;
    imageUrls: string[];
    analysisPolicy: "text_only" | "vision_on_demand";
  };
  sourceKind: TrendSourceKind;
  sourceRegion: TrendSourceRegion;
  sourceLabel: string;
  sourceUrl?: string;
  captionMode?: "manual" | "asr" | "none";
  score: number;
  metrics?: {
    upvoteRatio?: number;
    upvotes?: number;
    comments?: number;
    likes?: number;
    views?: number;
    subscribers?: number;
    breakoutRatioPercent?: number;
  };
  fitReason: string;
}

export interface TrendDiscoveryRequest {
  regions: TrendSourceRegion[];
  limit: number;
  timeWindow: "24h" | "3d";
}

export interface TrendDiscoveryResult {
  generatedAt: string;
  candidates: TrendCandidate[];
  globalCandidates: TrendCandidate[];
  domesticCandidates: TrendCandidate[];
  sourceDebug: Array<{
    sourceId: string;
    region: TrendSourceRegion;
    count: number;
    status: "ok" | "fallback" | "error";
    message?: string;
  }>;
}

export interface YouTubeBreakoutDiscoveryRequest {
  country: string;
  period: "24h" | "3d" | "7d";
  breakoutRatioPercent: number;
  categoryId: string;
  requireCaptions?: boolean;
  subscriberRange?:
    | "all"
    | "0_10k"
    | "10k_50k"
    | "50k_100k"
    | "100k_200k"
    | "200k_300k"
    | "300k_500k"
    | "500k_plus";
  limit?: number;
}

export interface YouTubeBreakoutDiscoveryResult {
  generatedAt: string;
  request: {
    country: string;
    period: "24h" | "3d" | "7d";
    breakoutRatioPercent: number;
    categoryId: string;
    requireCaptions: boolean;
    subscriberRange:
      | "all"
      | "0_10k"
      | "10k_50k"
      | "50k_100k"
      | "100k_200k"
      | "200k_300k"
      | "300k_500k"
      | "500k_plus";
    limit: number;
  };
  candidates: TrendCandidate[];
  sourceDebug: {
    sourceId: string;
    count: number;
    status: "ok" | "fallback" | "error";
    message?: string;
  };
}

export interface YouTubeCandidateAnalysisRequest {
  title: string;
  summary?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  views?: number;
  subscribers?: number;
  breakoutRatioPercent?: number;
  comments?: number;
  likes?: number;
}

export interface YouTubeCandidateAnalysisResult {
  source: "claude" | "openrouter" | "openai" | "mock";
  analysis: string;
  contextSummary?: string;
  transcriptEvidence?: string[];
  contextDebug?: string[];
  references?: Array<{
    type: "news" | "wiki" | "community";
    title: string;
    url: string;
    source?: string;
    publishedAt?: string;
    snippet?: string;
  }>;
  error?: string;
}

export interface YouTubeTranscriptProbeRequest {
  sourceUrl?: string;
  language?: "ko" | "en";
}

export interface YouTubeTranscriptProbeResult {
  ok: boolean;
  captionMode: "manual" | "asr" | "none";
  evidenceCount: number;
  reasonCode:
    | "ok"
    | "no_video_id"
    | "no_caption_tracks"
    | "no_base_url"
    | "player_only_caption"
    | "watch_http_error"
    | "watch_fetch_error"
    | "player_response_missing"
    | "player_parse_error"
    | "transcript_http_error"
    | "transcript_fetch_error"
    | "transcript_empty"
    | "filtered_out"
    | "unknown";
  reasonMessage: string;
  debug?: string[];
}
