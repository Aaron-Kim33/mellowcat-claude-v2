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
  sourceKind: TrendSourceKind;
  sourceRegion: TrendSourceRegion;
  sourceLabel: string;
  sourceUrl?: string;
  score: number;
  metrics?: {
    upvoteRatio?: number;
    upvotes?: number;
    comments?: number;
    views?: number;
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
