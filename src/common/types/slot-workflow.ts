export type WorkflowSlot = "input" | "process" | "create" | "output";

export type WorkflowSlotMode = "auto" | "manual";

export type WorkflowCheckpointStatus =
  | "idle"
  | "ready"
  | "running"
  | "awaiting_input"
  | "completed"
  | "error";

export interface WorkflowCheckpointEnvelope<TPayload = Record<string, unknown>> {
  schemaVersion: 1;
  jobId: string;
  slot: WorkflowSlot;
  mode: WorkflowSlotMode;
  status: WorkflowCheckpointStatus;
  createdAt: string;
  updatedAt: string;
  sourceCheckpoint: string | null;
  attachments: string[];
  payload: TPayload;
}

export interface WorkflowJobRecord {
  schemaVersion: 1;
  jobId: string;
  workflowId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  currentStage: string;
  packagePath?: string;
}

export interface WorkflowJobSnapshot {
  job: WorkflowJobRecord | null;
  resolvedPackagePath?: string | null;
  checkpoints: Partial<Record<1 | 2 | 3 | 4, WorkflowCheckpointEnvelope>>;
}

export interface CreateReadinessItem {
  id:
    | "job"
    | "checkpoint_2"
    | "approval"
    | "pexels"
    | "tts"
    | "ffmpeg";
  label: string;
  ok: boolean;
  detail: string;
}

export interface CreateReadinessSnapshot {
  jobId?: string;
  canRun: boolean;
  items: CreateReadinessItem[];
}

export interface ManualInputCandidateDraft {
  id?: string;
  title: string;
  summary: string;
  operatorSummary?: string;
  contentAngle?: string;
  sourceLabel?: string;
  sourceKind?: "reddit" | "rss" | "youtube" | "fmkorea" | "dcinside" | "nate-pann" | "mock";
  sourceRegion?: "global" | "domestic";
  sourceUrl?: string;
  fitReason?: string;
}

export interface ManualInputCheckpointPayload {
  jobId?: string;
  title?: string;
  request?: {
    regions?: Array<"global" | "domestic">;
    limit?: number;
    timeWindow?: "24h" | "3d";
    discoveryMode?: "shortform_story" | "news_card";
    focusCategory?: "all" | "world" | "breaking" | "china";
  };
  candidates: ManualInputCandidateDraft[];
  attachmentPaths?: string[];
}

export interface ManualProcessCheckpointPayload {
  jobId: string;
  title?: string;
  selectedCandidateId?: string;
  headline: string;
  summary: string;
  draft: {
    titleOptions: string[];
    hook: string;
    narration: string;
    callToAction: string;
  };
  reviewNotes?: string;
}

export interface AutoProcessDraftPayload {
  jobId: string;
  selectedCandidateId?: string;
  scriptCategory?: "horror" | "romance" | "community";
  ideaStrategy?: "pattern_remix" | "comment_gap" | "series_ip";
  lengthMode?: "auto" | "shortform" | "longform";
  draftMode?: "auto_generate" | "manual_polish";
  sourceDraft?: {
    headline?: string;
    summary?: string;
    titleOptions?: string[];
    hook?: string;
    narration?: string;
    callToAction?: string;
    operatorMemo?: string;
  };
  revisionRequest?: string;
}

export interface ProcessCheckpointReviewState {
  status?: "pending" | "approved";
  notes?: string;
  selectedTitleIndex?: number;
  selectedTitle?: string;
  scriptCategory?: "horror" | "romance" | "community";
  ideaStrategy?: "pattern_remix" | "comment_gap" | "series_ip";
  lengthMode?: "auto" | "shortform" | "longform";
  draftMode?: "auto_generate" | "manual_polish";
}

export interface ManualCreateCheckpointPayload {
  jobId: string;
  title?: string;
  videoFilePath?: string;
  thumbnailFilePath?: string;
  metadata: {
    title: string;
    description: string;
    hashtags: string[];
  };
  notes?: string;
}

export interface ManualOutputCheckpointPayload {
  jobId: string;
  title?: string;
  videoFilePath?: string;
  thumbnailFilePath?: string;
  scheduledPublishAt?: string;
  metadata: {
    title: string;
    description: string;
    hashtags: string[];
    categoryId: string;
    privacyStatus: "private" | "unlisted" | "public";
    selfDeclaredMadeForKids: boolean;
  };
  result?: {
    status: "draft" | "uploaded" | "error";
    videoId?: string;
    videoUrl?: string;
    message?: string;
  };
}
