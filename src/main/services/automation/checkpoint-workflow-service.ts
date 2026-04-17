import fs from "node:fs";
import path from "node:path";
import type { AutomationJobSnapshot, ShortformScriptDraft } from "../../../common/types/automation";
import type { YouTubeUploadRequest, YouTubeUploadResult } from "../../../common/types/settings";
import type { TrendCandidate, TrendDiscoveryRequest } from "../../../common/types/trend";
import type {
  ManualInputCheckpointPayload,
  ManualCreateCheckpointPayload,
  ManualOutputCheckpointPayload,
  ManualProcessCheckpointPayload,
  ProcessCheckpointReviewState,
  WorkflowCheckpointEnvelope,
  WorkflowCheckpointStatus,
  WorkflowJobRecord,
  WorkflowJobSnapshot,
  WorkflowSlot,
  WorkflowSlotMode
} from "../../../common/types/slot-workflow";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

export class CheckpointWorkflowService {
  constructor(
    private readonly pathService: PathService,
    private readonly fileService: FileService
  ) {}

  writeInputCheckpoint(input: {
    job: AutomationJobSnapshot;
    mode?: WorkflowSlotMode;
    request: TrendDiscoveryRequest;
    candidates: TrendCandidate[];
    sourceDebug?: Array<{
      sourceId: string;
      region: "global" | "domestic";
      count: number;
      status: "ok" | "fallback" | "error";
      message?: string;
    }>;
    selectedCandidateId?: string;
  }): void {
    this.ensureJobRecord(input.job);
    this.writeCheckpoint({
      job: input.job,
      slot: "input",
      checkpointNumber: 1,
      mode: input.mode ?? "auto",
      payload: {
        request: input.request,
        selectedCandidateId: input.selectedCandidateId ?? null,
        candidates: input.candidates,
        sourceDebug: input.sourceDebug ?? []
      }
    });
  }

  writeProcessCheckpoint(input: {
    job: AutomationJobSnapshot;
    mode?: WorkflowSlotMode;
    selectedCandidateId?: string;
    selectedCandidate?: TrendCandidate;
    draft: ShortformScriptDraft;
    scriptCategory?: "horror" | "romance" | "community";
    ideaStrategy?: "pattern_remix" | "comment_gap" | "series_ip";
    lengthMode?: "auto" | "shortform" | "longform";
    draftMode?: "auto_generate" | "manual_polish";
    revisionRequest?: string;
    source: "claude" | "openrouter" | "openai" | "mock";
    error?: string;
  }): void {
    this.ensureJobRecord(input.job);
    this.writeCheckpoint({
      job: input.job,
      slot: "process",
      checkpointNumber: 2,
      mode: input.mode ?? "auto",
      payload: {
        selectedCandidateId: input.selectedCandidateId ?? null,
        summary: input.selectedCandidate
          ? {
              headline: input.selectedCandidate.title,
              body: input.selectedCandidate.summary || input.selectedCandidate.operatorSummary,
              language: "ko"
            }
          : null,
        scriptDraft: input.draft,
        review: {
          status: input.job.stage === "approved" ? "approved" : "pending",
          notes: input.revisionRequest ?? "",
          selectedTitleIndex: 0,
          selectedTitle: input.draft.titleOptions[0] ?? "",
          scriptCategory: input.scriptCategory ?? "community",
          ideaStrategy: input.ideaStrategy ?? "comment_gap",
          lengthMode: input.lengthMode ?? "auto",
          draftMode: input.draftMode ?? "manual_polish"
        },
        generator: {
          source: input.source,
          error: input.error ?? null
        }
      }
    });
  }

  markProcessCheckpointApproved(jobId: string): void {
    const checkpointPath = this.pathService.getAutomationCheckpointPath(jobId, 2);
    const checkpoint = this.tryRead<WorkflowCheckpointEnvelope<{
      review?: ProcessCheckpointReviewState;
    }>>(checkpointPath);

    if (!checkpoint) {
      return;
    }

    this.fileService.writeJsonFile(checkpointPath, {
      ...checkpoint,
      status: "completed",
      updatedAt: new Date().toISOString(),
      payload: {
        ...checkpoint.payload,
        review: {
          ...(checkpoint.payload?.review ?? {}),
          status: "approved"
        }
      }
    });
  }

  selectProcessCheckpointTitle(jobId: string, titleIndex: number): string | null {
    const checkpointPath = this.pathService.getAutomationCheckpointPath(jobId, 2);
    const checkpoint = this.tryRead<WorkflowCheckpointEnvelope<{
      scriptDraft?: ShortformScriptDraft;
      review?: ProcessCheckpointReviewState;
    }>>(checkpointPath);

    const titleOptions = checkpoint?.payload?.scriptDraft?.titleOptions;
    if (!checkpoint || !titleOptions?.length) {
      return null;
    }

    if (titleIndex < 0 || titleIndex >= titleOptions.length) {
      return null;
    }

    const selectedTitle = titleOptions[titleIndex];
    const reorderedTitles = [
      selectedTitle,
      ...titleOptions.filter((_, index) => index !== titleIndex)
    ];

    this.fileService.writeJsonFile(checkpointPath, {
      ...checkpoint,
      updatedAt: new Date().toISOString(),
      payload: {
        ...checkpoint.payload,
        scriptDraft: {
          ...checkpoint.payload.scriptDraft,
          titleOptions: reorderedTitles
        },
        review: {
          ...(checkpoint.payload?.review ?? {}),
          selectedTitleIndex: 0,
          selectedTitle
        }
      }
    });

    return selectedTitle;
  }

  writeCreateCheckpoint(input: {
    job: AutomationJobSnapshot;
    mode?: WorkflowSlotMode;
    packagePath: string;
    draft: ShortformScriptDraft;
    uploadRequest: YouTubeUploadRequest;
    createPayloadOverride?: {
      assetPlan?: {
        ttsRequired?: boolean;
        imageGenerationRequired?: boolean;
        videoCompositionRequired?: boolean;
        thumbnailRequired?: boolean;
      };
      assets?: {
        audio?: Array<{ label: string; path: string; status: "pending" | "ready" }>;
        images?: Array<{ label: string; path: string; status: "pending" | "ready" }>;
        video?: Array<{ label: string; path: string; status: "pending" | "ready" }>;
        thumbnail?: { path: string; status: "pending" | "ready" };
      };
      metadata?: {
        title?: string;
        description?: string;
        hashtags?: string[];
      };
    };
  }): void {
    this.ensureJobRecord(input.job, input.packagePath);
    const packagePath = this.toJobRelativePath(input.job.id, input.packagePath);
    const videoFilePath = this.toJobRelativePath(input.job.id, input.uploadRequest.videoFilePath);
    const thumbnailFilePath = this.toJobRelativePath(input.job.id, input.uploadRequest.thumbnailFilePath);

    const defaultPayload = {
      assetPlan: {
        ttsRequired: true,
        imageGenerationRequired: true,
        videoCompositionRequired: true,
        thumbnailRequired: true
      },
      assets: {
        audio: [] as Array<{ label: string; path: string; status: "pending" | "ready" }>,
        images: [] as Array<{ label: string; path: string; status: "pending" | "ready" }>,
        video: videoFilePath
          ? [
              {
                label: "final-cut",
                path: videoFilePath,
                status: input.uploadRequest.videoFilePath ? "ready" : "pending"
              }
            ]
          : [],
        thumbnail: {
          path: thumbnailFilePath,
          status: input.uploadRequest.thumbnailFilePath ? "ready" : "pending"
        }
      },
      metadata: {
        title: input.uploadRequest.metadata.title,
        description: input.uploadRequest.metadata.description,
        hashtags: input.uploadRequest.metadata.tags,
        titleOptions: input.draft.titleOptions,
        hook: input.draft.hook,
        narration: input.draft.narration,
        callToAction: input.draft.callToAction
      },
      packagePath
    };

    this.writeCheckpoint({
      job: input.job,
      slot: "create",
      checkpointNumber: 3,
      mode: input.mode ?? "auto",
      attachments: [packagePath].filter(Boolean),
      payload: {
        assetPlan: {
          ...defaultPayload.assetPlan,
          ...(input.createPayloadOverride?.assetPlan ?? {})
        },
        assets: {
          ...defaultPayload.assets,
          ...(input.createPayloadOverride?.assets ?? {})
        },
        metadata: {
          ...defaultPayload.metadata,
          ...(input.createPayloadOverride?.metadata ?? {})
        },
        packagePath
      }
    });
  }

  writeOutputCheckpoint(input: {
    job: AutomationJobSnapshot;
    mode?: WorkflowSlotMode;
    uploadRequest: YouTubeUploadRequest;
    uploadResult?: Partial<YouTubeUploadResult>;
  }): void {
    this.ensureJobRecord(input.job);
    this.writeCheckpoint({
      job: input.job,
      slot: "output",
      checkpointNumber: 4,
      mode: input.mode ?? "auto",
      payload: {
        platform: input.uploadRequest.platform,
        publishMode: input.mode ?? "auto",
        request: {
          ...input.uploadRequest,
          videoFilePath: this.toJobRelativePath(input.job.id, input.uploadRequest.videoFilePath),
          thumbnailFilePath: this.toJobRelativePath(input.job.id, input.uploadRequest.thumbnailFilePath)
        },
        result: {
          status: input.uploadResult?.status ?? "pending",
          videoId: input.uploadResult?.videoId ?? null,
          videoUrl: input.uploadResult?.videoUrl ?? null,
          message: input.uploadResult?.message ?? ""
        }
      }
    });
  }

  inspectJob(jobId: string): WorkflowJobSnapshot {
    const job = this.tryRead<WorkflowJobRecord>(this.pathService.getAutomationJobRecordPath(jobId));
    const checkpoints: WorkflowJobSnapshot["checkpoints"] = {};

    for (const checkpointNumber of [1, 2, 3, 4] as const) {
      const checkpoint = this.tryRead<WorkflowCheckpointEnvelope>(
        this.pathService.getAutomationCheckpointPath(jobId, checkpointNumber)
      );
      if (checkpoint) {
        checkpoints[checkpointNumber] = checkpoint;
      }
    }

    return {
      job: job ?? null,
      resolvedPackagePath: job ? this.pathService.getAutomationJobPath(jobId) : null,
      checkpoints
    };
  }

  saveManualInputCheckpoint(input: ManualInputCheckpointPayload): WorkflowJobSnapshot {
    const now = new Date().toISOString();
    const jobId =
      input.jobId?.trim() ||
      `job-${now.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-")}`;
    const primaryCandidate = input.candidates[0];
    const jobTitle = input.title?.trim() || primaryCandidate?.title?.trim() || "Manual input job";
    const existing = this.tryRead<WorkflowJobRecord>(this.pathService.getAutomationJobRecordPath(jobId));
    const job: AutomationJobSnapshot = {
      id: jobId,
      title: jobTitle,
      stage: "shortlisted",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    const candidates: TrendCandidate[] = input.candidates.map((candidate, index) => ({
      id: candidate.id?.trim() || `${jobId}-candidate-${index + 1}`,
      title: candidate.title.trim(),
      summary: candidate.summary.trim(),
      operatorSummary: candidate.operatorSummary?.trim() || candidate.summary.trim(),
      contentAngle: candidate.contentAngle?.trim() || "manual_input",
      media: {
        hasMedia: false,
        imageUrls: [],
        analysisPolicy: "text_only"
      },
      sourceKind: candidate.sourceKind ?? "mock",
      sourceRegion: candidate.sourceRegion ?? "domestic",
      sourceLabel: candidate.sourceLabel?.trim() || "Manual",
      sourceUrl: candidate.sourceUrl?.trim() || undefined,
      score: Math.max(100 - index, 1),
      fitReason: candidate.fitReason?.trim() || "Manual slot input"
    }));
    const attachmentPaths = this.copyCheckpointAttachments(jobId, 1, input.attachmentPaths ?? []);
    const primaryRegion = candidates[0]?.sourceRegion ?? "domestic";

    this.writeInputCheckpoint({
      job,
      mode: "manual",
      request: {
        regions: input.request?.regions ?? [primaryRegion],
        limit: input.request?.limit ?? Math.max(candidates.length, 1),
        timeWindow: input.request?.timeWindow ?? "24h"
      },
      candidates,
      selectedCandidateId: candidates[0]?.id
    });
    const checkpointPath = this.pathService.getAutomationCheckpointPath(jobId, 1);
    const checkpoint = this.tryRead<WorkflowCheckpointEnvelope>(checkpointPath);
    if (checkpoint) {
      this.fileService.writeJsonFile(checkpointPath, {
        ...checkpoint,
        attachments: attachmentPaths,
        updatedAt: now
      });
    }

    return this.inspectJob(jobId);
  }

  saveManualProcessCheckpoint(input: ManualProcessCheckpointPayload): WorkflowJobSnapshot {
    const now = new Date().toISOString();
    const existing = this.tryRead<WorkflowJobRecord>(this.pathService.getAutomationJobRecordPath(input.jobId));
    const checkpointOne = this.tryRead<WorkflowCheckpointEnvelope<{
      candidates?: TrendCandidate[];
      selectedCandidateId?: string | null;
    }>>(this.pathService.getAutomationCheckpointPath(input.jobId, 1));
    const selectedCandidate =
      checkpointOne?.payload?.candidates?.find((candidate) =>
        candidate.id === (input.selectedCandidateId || checkpointOne.payload.selectedCandidateId)
      ) ??
      checkpointOne?.payload?.candidates?.[0];

    const job: AutomationJobSnapshot = {
      id: input.jobId,
      title: input.title?.trim() || existing?.title || selectedCandidate?.title || "Manual process job",
      stage: "approved",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.writeProcessCheckpoint({
      job,
      mode: "manual",
      selectedCandidateId:
        input.selectedCandidateId || checkpointOne?.payload?.selectedCandidateId || selectedCandidate?.id,
      selectedCandidate: selectedCandidate
        ? {
            ...selectedCandidate,
            title: input.headline.trim() || selectedCandidate.title,
            summary: input.summary.trim() || selectedCandidate.summary,
            operatorSummary: input.summary.trim() || selectedCandidate.operatorSummary
          }
        : {
            id: `${input.jobId}-manual-process`,
            title: input.headline.trim(),
            summary: input.summary.trim(),
            operatorSummary: input.summary.trim(),
            contentAngle: "manual_process",
            media: {
              hasMedia: false,
              imageUrls: [],
              analysisPolicy: "text_only"
            },
            sourceKind: "mock",
            sourceRegion: "domestic",
            sourceLabel: "Manual",
            score: 100,
            fitReason: "Manual slot process input"
          },
      draft: {
        titleOptions: input.draft.titleOptions,
        hook: input.draft.hook.trim(),
        narration: input.draft.narration.trim(),
        callToAction: input.draft.callToAction.trim()
      },
      revisionRequest: input.reviewNotes?.trim(),
      source: "mock"
    });

    return this.inspectJob(input.jobId);
  }

  saveManualCreateCheckpoint(input: ManualCreateCheckpointPayload): WorkflowJobSnapshot {
    const now = new Date().toISOString();
    const existing = this.tryRead<WorkflowJobRecord>(this.pathService.getAutomationJobRecordPath(input.jobId));
    const processCheckpoint = this.tryRead<WorkflowCheckpointEnvelope<{
      summary?: { headline?: string; body?: string };
      scriptDraft?: ShortformScriptDraft;
    }>>(this.pathService.getAutomationCheckpointPath(input.jobId, 2));

    const job: AutomationJobSnapshot = {
      id: input.jobId,
      title:
        input.title?.trim() ||
        existing?.title ||
        processCheckpoint?.payload?.summary?.headline ||
        "Manual create job",
      stage: "ready",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    const draft = processCheckpoint?.payload?.scriptDraft ?? {
      titleOptions: [input.metadata.title],
      hook: input.metadata.title,
      narration: input.metadata.description,
      callToAction: input.notes?.trim() || ""
    };

    const normalizedVideoPath = input.videoFilePath?.trim() || "";
    const normalizedThumbnailPath = input.thumbnailFilePath?.trim() || "";
    const normalizedTags = input.metadata.hashtags.map((tag) => tag.trim()).filter(Boolean);

    this.writeCreateCheckpoint({
      job,
      mode: "manual",
      packagePath: this.pathService.getAutomationJobPath(input.jobId),
      draft,
      uploadRequest: {
        platform: "youtube",
        status: "draft",
        videoFilePath: normalizedVideoPath,
        thumbnailFilePath: normalizedThumbnailPath,
        scheduledPublishAt: "",
        metadata: {
          title: input.metadata.title.trim(),
          description: input.metadata.description.trim(),
          tags: normalizedTags,
          categoryId: "22",
          privacyStatus: "private",
          selfDeclaredMadeForKids: false
        }
      }
    });

    const checkpointPath = this.pathService.getAutomationCheckpointPath(input.jobId, 3);
    const checkpoint = this.tryRead<WorkflowCheckpointEnvelope>(checkpointPath);
    if (checkpoint) {
      this.fileService.writeJsonFile(checkpointPath, {
        ...checkpoint,
        payload: {
          ...(checkpoint.payload as Record<string, unknown>),
          notes: input.notes?.trim() || ""
        },
        updatedAt: now
      });
    }

    return this.inspectJob(input.jobId);
  }

  saveManualOutputCheckpoint(input: ManualOutputCheckpointPayload): WorkflowJobSnapshot {
    const now = new Date().toISOString();
    const existing = this.tryRead<WorkflowJobRecord>(this.pathService.getAutomationJobRecordPath(input.jobId));
    const createCheckpoint = this.tryRead<WorkflowCheckpointEnvelope<{
      assets?: {
        video?: Array<{ path?: string }>;
        thumbnail?: { path?: string };
      };
      metadata?: {
        title?: string;
        description?: string;
        hashtags?: string[];
      };
    }>>(this.pathService.getAutomationCheckpointPath(input.jobId, 3));

    const status = input.result?.status ?? "draft";
    const job: AutomationJobSnapshot = {
      id: input.jobId,
      title:
        input.title?.trim() ||
        existing?.title ||
        input.metadata.title.trim() ||
        createCheckpoint?.payload?.metadata?.title ||
        "Manual output job",
      stage: status === "error" ? "error" : "ready",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    const normalizedVideoPath =
      input.videoFilePath?.trim() ||
      createCheckpoint?.payload?.assets?.video?.[0]?.path ||
      "";
    const normalizedThumbnailPath =
      input.thumbnailFilePath?.trim() ||
      createCheckpoint?.payload?.assets?.thumbnail?.path ||
      "";

    this.writeOutputCheckpoint({
      job,
      mode: "manual",
      uploadRequest: {
        platform: "youtube",
        status,
        videoFilePath: normalizedVideoPath,
        thumbnailFilePath: normalizedThumbnailPath,
        scheduledPublishAt: input.scheduledPublishAt?.trim() || "",
        metadata: {
          title: input.metadata.title.trim(),
          description: input.metadata.description.trim(),
          tags: input.metadata.hashtags.map((tag) => tag.trim()).filter(Boolean),
          categoryId: input.metadata.categoryId.trim() || "22",
          privacyStatus: input.metadata.privacyStatus,
          selfDeclaredMadeForKids: input.metadata.selfDeclaredMadeForKids
        }
      },
      uploadResult:
        status === "draft"
          ? undefined
          : {
              ok: status === "uploaded",
              packagePath: this.pathService.getAutomationJobPath(input.jobId),
              requestPath: this.pathService.getAutomationCheckpointPath(input.jobId, 4),
              resultPath: this.pathService.getAutomationCheckpointPath(input.jobId, 4),
              status: status === "uploaded" ? "uploaded" : "error",
              videoId: input.result?.videoId?.trim() || undefined,
              videoUrl: input.result?.videoUrl?.trim() || undefined,
              message: input.result?.message?.trim() || ""
            }
    });

    return this.inspectJob(input.jobId);
  }

  private ensureJobRecord(job: AutomationJobSnapshot, packagePath?: string): void {
    const jobRecordPath = this.pathService.getAutomationJobRecordPath(job.id);
    const existing = this.tryRead<WorkflowJobRecord>(jobRecordPath);
    const next: WorkflowJobRecord = {
      schemaVersion: 1,
      jobId: job.id,
      workflowId: "shortform-telegram-youtube",
      title: job.title,
      createdAt: existing?.createdAt ?? job.createdAt,
      updatedAt: job.updatedAt,
      currentStage: job.stage,
      packagePath: packagePath ? this.toJobRelativePath(job.id, packagePath) : existing?.packagePath
    };

    this.fileService.writeJsonFile(jobRecordPath, next);
    for (const checkpointNumber of [1, 2, 3, 4] as const) {
      this.fileService.ensureDir(
        this.pathService.getAutomationCheckpointAttachmentsPath(job.id, checkpointNumber)
      );
    }
  }

  private writeCheckpoint<TPayload>(input: {
    job: AutomationJobSnapshot;
    slot: WorkflowSlot;
    checkpointNumber: 1 | 2 | 3 | 4;
    mode: WorkflowSlotMode;
    payload: TPayload;
    attachments?: string[];
  }): void {
    const filePath = this.pathService.getAutomationCheckpointPath(input.job.id, input.checkpointNumber);
    const existing = this.tryRead<WorkflowCheckpointEnvelope<TPayload>>(filePath);
    const next: WorkflowCheckpointEnvelope<TPayload> = {
      schemaVersion: 1,
      jobId: input.job.id,
      slot: input.slot,
      mode: input.mode,
      status: this.resolveStatus(input.job.stage),
      createdAt: existing?.createdAt ?? input.job.createdAt,
      updatedAt: input.job.updatedAt,
      sourceCheckpoint:
        input.checkpointNumber === 1 ? null : `checkpoint-${input.checkpointNumber - 1}/checkpoint.json`,
      attachments: input.attachments ?? existing?.attachments ?? [],
      payload: input.payload
    };

    this.fileService.writeJsonFile(filePath, next);
  }

  private resolveStatus(stage: AutomationJobSnapshot["stage"]): WorkflowCheckpointStatus {
    switch (stage) {
      case "idle":
        return "idle";
      case "shortlisted":
      case "selected":
      case "awaiting_review":
      case "awaiting_revision_input":
        return "ready";
      case "scripting":
      case "packaging":
        return "running";
      case "approved":
      case "ready":
        return "completed";
      case "rejected":
        return "awaiting_input";
      case "error":
        return "error";
      default:
        return "ready";
    }
  }

  private tryRead<T>(filePath: string): T | null {
    try {
      return this.fileService.readJsonFile<T>(filePath);
    } catch {
      return null;
    }
  }

  private toJobRelativePath(jobId: string, targetPath?: string): string {
    if (!targetPath) {
      return "";
    }

    const normalizedTarget = path.resolve(targetPath);
    const jobRoot = this.pathService.getAutomationJobPath(jobId);
    const relative = path.relative(jobRoot, normalizedTarget);
    if (!relative.startsWith("..")) {
      return relative.replaceAll("\\", "/");
    }
    return normalizedTarget.replaceAll("\\", "/");
  }

  private copyCheckpointAttachments(
    jobId: string,
    checkpointNumber: 1 | 2 | 3 | 4,
    attachmentPaths: string[]
  ): string[] {
    const attachmentsRoot = this.pathService.getAutomationCheckpointAttachmentsPath(jobId, checkpointNumber);
    this.fileService.ensureDir(attachmentsRoot);

    return attachmentPaths
      .filter((filePath) => filePath.trim())
      .map((filePath, index) => {
        const sourcePath = path.resolve(filePath);
        if (!fs.existsSync(sourcePath)) {
          return null;
        }

        const safeName = path.basename(sourcePath).replace(/[^\w.-]+/g, "_");
        const targetName = `${String(index + 1).padStart(2, "0")}-${safeName}`;
        const targetPath = path.join(attachmentsRoot, targetName);
        fs.cpSync(sourcePath, targetPath, { force: true });
        return this.toJobRelativePath(jobId, targetPath);
      })
      .filter((filePath): filePath is string => Boolean(filePath));
  }
}
