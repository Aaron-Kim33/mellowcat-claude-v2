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
