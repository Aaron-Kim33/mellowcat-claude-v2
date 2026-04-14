import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ManualInputCandidateDraft } from "@common/types/slot-workflow";
import type {
  YouTubeBreakoutDiscoveryResult,
  YouTubeCandidateAnalysisResult
} from "@common/types/trend";
import { getMcpRuntimeContract, listMcpRuntimeContracts } from "../../../common/contracts/mcp-contract-registry";
import { useAppStore } from "../../store/app-store";

type FieldValues = Record<string, string>;

type CheckpointCandidate = {
  id: string;
  title: string;
  summary: string;
  sourceLabel?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
};

type YouTubePreviewCandidate = {
  id: string;
  title: string;
  summary: string;
  sourceLabel?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  videoId?: string;
  views?: number;
  subscribers?: number;
  breakoutRatioPercent?: number;
  comments?: number;
  likes?: number;
  captionMode?: "manual" | "asr" | "none";
};

type CandidateAnalysisState = {
  status: "idle" | "loading" | "done" | "error";
  result?: YouTubeCandidateAnalysisResult;
};

type ProcessCheckpointPayload = {
  selectedCandidateId?: string;
  summary?: { headline?: string; body?: string };
  scriptDraft?: {
    titleOptions?: string[];
    hook?: string;
    narration?: string;
    callToAction?: string;
  };
  review?: {
    notes?: string;
    ideaStrategy?: "pattern_remix" | "comment_gap" | "series_ip";
    lengthMode?: "auto" | "shortform" | "longform";
    draftMode?: "auto_generate" | "manual_polish";
  };
};

function toCandidate(values: FieldValues): ManualInputCandidateDraft | undefined {
  const title = (values.candidateTitle ?? "").trim();
  const summary = (values.candidateSummary ?? "").trim();
  if (!title || !summary) {
    return undefined;
  }

  return {
    id: `manual-${Date.now()}`,
    title,
    summary,
    operatorSummary: summary,
    sourceLabel: (values.candidateSourceLabel ?? "").trim() || "Manual",
    sourceUrl: (values.candidateSourceUrl ?? "").trim() || undefined,
    fitReason: (values.candidateFitReason ?? "").trim() || undefined,
    sourceKind: "mock",
    sourceRegion: "domestic",
    contentAngle: "manual_input"
  };
}

function parseCheckpointCandidates(payload: unknown): CheckpointCandidate[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const raw = (payload as { candidates?: Array<Record<string, unknown>> }).candidates;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, index) => {
      const media = item.media as { imageUrls?: unknown } | undefined;
      const imageUrls = Array.isArray(media?.imageUrls) ? media?.imageUrls : [];
      const thumbnailUrl = imageUrls.find(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      );

      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : `candidate-${index + 1}`,
        title: typeof item.title === "string" ? item.title : "",
        summary:
          typeof item.summary === "string"
            ? item.summary
            : typeof item.operatorSummary === "string"
              ? item.operatorSummary
              : "",
        sourceLabel: typeof item.sourceLabel === "string" ? item.sourceLabel : undefined,
        sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : undefined,
        thumbnailUrl
      };
    })
    .filter((item) => item.title.trim() && item.summary.trim());
}

function extractYouTubeVideoId(sourceUrl?: string, fallbackId?: string): string | undefined {
  if (sourceUrl) {
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
      // ignore malformed url and fallback below
    }
  }

  const breakoutMatch = fallbackId?.match(/^youtube-breakout-(.+)$/);
  if (breakoutMatch?.[1]) {
    return breakoutMatch[1];
  }

  return undefined;
}

function resolveThumbnailUrl(candidate: {
  media?: { imageUrls?: string[] };
  sourceUrl?: string;
  id?: string;
}): string | undefined {
  const explicit = candidate.media?.imageUrls?.find((url) => typeof url === "string" && url.trim());
  if (explicit) {
    return explicit;
  }
  const videoId = extractYouTubeVideoId(candidate.sourceUrl, candidate.id);
  if (!videoId) {
    return undefined;
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function getActionClass(kind: "primary" | "secondary" | "danger"): string {
  if (kind === "primary") {
    return "primary-button";
  }
  if (kind === "danger") {
    return "danger-button";
  }
  return "secondary-button";
}

function formatMetricNumber(value?: number): string {
  if (!Number.isFinite(value) || value === undefined || value < 0) {
    return "-";
  }
  return Math.round(value).toLocaleString();
}

function formatPerformanceRatio(value?: number): string {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return "-";
  }
  return `x${(value / 100).toFixed(1)}`;
}

export function CrawlingPage() {
  const {
    installed,
    settings,
    workflowConfig,
    workflowJobSnapshot,
    createReadiness,
    telegramStatus,
    saveWorkflowConfig,
    sendMockShortlist,
    discoverYouTubeBreakoutCandidates,
    analyzeYouTubeCandidate,
    refreshTelegramStatus,
    refreshWorkflowJobSnapshot,
    refreshCreateReadiness,
    runCreatePipeline,
    saveManualInputCheckpoint,
    saveManualProcessCheckpoint,
    generateProcessDraft
  } = useAppStore();
  const isKorean = settings?.launcherLanguage === "ko";
  const copy = useMemo(
    () => ({
      eyebrow: isKorean ? "크롤링" : "Crawling",
      title: isKorean ? "크롤링 작업 공간" : "Crawling workspace",
      subtitle: isKorean
        ? "/shortlist부터 생성 전(후보 선택/가공 승인)까지를 런처에서 진행합니다."
        : "Handle /shortlist through pre-create approval (candidate selection and processing) in the launcher.",
      moduleLabel: isKorean ? "크롤링 모듈" : "Crawling module",
      noDescription: isKorean ? "모듈 설명이 제공되지 않았습니다." : "No module description was provided.",
      emptyState: isKorean ? "input 슬롯 크롤링 MCP가 없습니다." : "No input-slot crawling MCP is available.",
      defaultSectionTitle: isKorean ? "크롤링 설정" : "Crawler settings",
      telegramSaved: isKorean ? "텔레그램 크롤링 설정을 저장했습니다." : "Telegram crawling settings saved.",
      telegramSynced: isKorean ? "텔레그램 상태를 동기화했습니다." : "Telegram state synced.",
      shortlistRan: isKorean ? "shortlist를 불러왔습니다." : "Shortlist fetched.",
      candidateRequired: isKorean
        ? "최소 1개 이상의 후보 제목과 요약이 필요합니다."
        : "Add at least one candidate title and summary first.",
      candidateQueued: isKorean ? "후보를 큐에 추가했습니다." : "Candidate added to queue.",
      checkpointOneSaved: isKorean ? "checkpoint-1에 저장했습니다." : "checkpoint-1 was saved.",
      checkpointTwoSaved: isKorean ? "checkpoint-2에 저장했습니다." : "checkpoint-2 was saved.",
      processDraftGenerate: isKorean ? "메모 제출 · AI 가공" : "Submit notes · AI refine",
      processDraftGenerating: isKorean ? "메모 내용을 바탕으로 스크립트를 AI가 가공 중입니다..." : "AI is refining your memo into a script...",
      processDraftGenerated: isKorean ? "AI 가공이 완료되었습니다. 결과를 확인하고 checkpoint-2를 저장하세요." : "AI refinement completed. Review and save checkpoint-2.",
      processDraftFailedPrefix: isKorean ? "스크립트 자동 생성에 실패했습니다." : "Auto script generation failed.",
      checkpointTwoApproved: isKorean ? "승인 완료 (approved)" : "Approved",
      checkpointTwoPending: isKorean ? "승인 대기" : "Pending approval",
      processRequired: isKorean
        ? "먼저 메모를 제출해 AI 가공 결과를 만든 뒤 checkpoint-2를 저장해 주세요."
        : "Submit notes for AI refinement first, then save checkpoint-2.",
      createNeedApproval: isKorean
        ? "checkpoint-2가 승인되어야 3번 생성 실행이 가능합니다."
        : "checkpoint-2 must be approved before Slot 03 create can run.",
      runCreate: isKorean ? "3번 생성 실행" : "Run Slot 03 create",
      createRunning: isKorean ? "3번 생성 파이프라인을 실행 중입니다..." : "Running Slot 03 create pipeline...",
      createDone: isKorean ? "3번 생성을 완료했습니다." : "Slot 03 create finished.",
      createFailedPrefix: isKorean ? "3번 생성 실행에 실패했습니다." : "Slot 03 create failed.",
      createReadinessReady: isKorean
        ? "3번 생성 준비가 완료되었습니다."
        : "Slot 03 readiness checks passed.",
      createReadinessBlockedPrefix: isKorean ? "3번 생성 차단:" : "Slot 03 blocked:",
      actionNotReady: isKorean
        ? "아직 연결되지 않은 액션입니다: {actionId}"
        : "This action is not wired yet: {actionId}",
      breakoutRatioInvalid: isKorean
        ? "구독자 대비 조회수 %는 0보다 큰 숫자로 입력해 주세요."
        : "Enter a valid breakout ratio percent greater than 0.",
      breakoutFetchDone: isKorean ? "유튜브 비율 후보를 불러왔습니다." : "Loaded YouTube breakout candidates.",
      breakoutFetchEmpty: isKorean
        ? "조건에 맞는 유튜브 후보가 없어 fallback 샘플을 표시합니다."
        : "No live candidates matched the filter; showing fallback sample.",
      checkpointOneMustSaveFirst: isKorean
        ? "유튜브 조회 후보는 checkpoint-1 저장 후에만 2번 가공 단계에서 사용할 수 있습니다."
        : "YouTube fetched candidates become available in Slot 02 only after saving checkpoint-1.",
      breakoutPreviewTitle: isKorean ? "유튜브 비율 후보 미리보기" : "YouTube breakout preview",
      breakoutPreviewHint: isKorean
        ? "후보 조회 결과를 확인한 뒤 checkpoint-1 저장으로 바로 넘길 수 있습니다."
        : "Review fetched candidates, then save checkpoint-1 directly.",
      queuedCandidates: isKorean ? "큐에 수집된 후보" : "Queued candidates",
      shortlistCandidates: isKorean ? "shortlist 후보" : "Shortlist candidates",
      attachments: isKorean ? "첨부 파일" : "Attachments",
      telegramState: isKorean ? "텔레그램 상태" : "Telegram status",
      runShortlist: isKorean ? "/shortlist 실행" : "Run /shortlist",
      refreshJob: isKorean ? "작업 새로고침" : "Refresh job",
      stageLabel: isKorean ? "현재 단계" : "Current stage",
      jobIdLabel: "Job ID",
      processSection: isKorean ? "후보 선택 · 스크립트 가공" : "Candidate select · Script process",
      selectedCandidate: isKorean ? "선택 후보" : "Selected candidate",
      headline: isKorean ? "대표 제목" : "Headline",
      summary: isKorean ? "가공 요약" : "Processed summary",
      titleOptions: isKorean ? "제목 후보(줄바꿈)" : "Title options (newline)",
      hook: isKorean ? "훅" : "Hook",
      narration: isKorean ? "내레이션" : "Narration",
      callToAction: "CTA",
      ideaStrategy: isKorean ? "소재 전략" : "Idea strategy",
      ideaStrategyHint: isKorean
        ? "AI가 어떤 방식으로 아이디어를 가공할지 선택합니다."
        : "Choose how AI should reshape this candidate into a script.",
      lengthMode: isKorean ? "분량 모드" : "Length mode",
      lengthModeHint: isKorean
        ? "auto는 설정된 길이를 기준으로 롱폼/숏폼을 자동 판단합니다."
        : "Auto infers longform/shortform from configured target duration.",
      lengthModeAuto: isKorean ? "공통(auto)" : "Common (auto)",
      lengthModeShortform: isKorean ? "숏폼" : "Shortform",
      lengthModeLongform: isKorean ? "롱폼" : "Longform",
      ideaStrategyCommentGap: isKorean ? "댓글 갭형 (반응/논쟁 중심)" : "Comment gap (reaction-led)",
      ideaStrategyPatternRemix: isKorean
        ? "패턴 리믹스형 (구조 차용 + 새 소재)"
        : "Pattern remix (format transfer)",
      ideaStrategySeriesIp: isKorean ? "시리즈 IP형 (후속 편 확장)" : "Series IP (episode-ready)",
      reviewNotes: isKorean ? "검토 메모" : "Review notes",
      saveCheckpointTwo: isKorean ? "checkpoint-2 저장" : "Save checkpoint-2",
      noShortlistYet: isKorean ? "아직 shortlist 후보가 없습니다." : "No shortlist candidates yet.",
      breakoutOpenVideo: isKorean ? "영상 보기" : "Watch video",
      breakoutPreviewVideo: isKorean ? "선택 영상 미리보기" : "Selected video preview",
      breakoutNoThumbnail: isKorean ? "썸네일 없음" : "No thumbnail",
      breakoutNoVideo: isKorean ? "영상 주소를 찾지 못했습니다." : "Video URL was not found.",
      breakoutViews: isKorean ? "조회수" : "Views",
      breakoutSubscribers: isKorean ? "구독자" : "Subscribers",
      breakoutPerformance: isKorean ? "성과지표" : "Performance",
      breakoutAnalyze: isKorean ? "AI 분석" : "AI analysis",
      breakoutAnalyzing: isKorean ? "분석 중..." : "Analyzing...",
      breakoutAnalysisError: isKorean ? "AI 분석에 실패했습니다." : "AI analysis failed.",
      breakoutAnalysisPanel: isKorean ? "AI 분석 결과" : "AI analysis",
      breakoutLoadMore: isKorean ? "더보기" : "Load more",
      processNotebook: isKorean ? "메모장 (자유 작성)" : "Memo pad (free-form)",
      processNotebookHint: isKorean
        ? "키워드, 문장, 구조, 바라는 톤을 자유롭게 적으면 AI가 유튜브 스크립트로 재가공합니다."
        : "Write any keywords, lines, structure, or tone directions here. AI will refine them into a YouTube-ready script.",
      processNotebookRequired: isKorean
        ? "메모장을 채워야 AI 가공을 실행할 수 있습니다."
        : "Memo pad cannot be empty before AI refinement.",
      processResultTitle: isKorean ? "AI 가공 결과" : "AI refined result",
      processResultEmpty: isKorean
        ? "아직 AI 가공 결과가 없습니다. 메모를 제출해 결과를 만들어 주세요."
        : "No refined script yet. Submit memo notes to generate one.",
      processResultHeadline: isKorean ? "대표 제목" : "Headline",
      processResultSummary: isKorean ? "요약" : "Summary",
      processResultTitleOptions: isKorean ? "제목 후보" : "Title options",
      processResultHook: isKorean ? "훅" : "Hook",
      processResultNarration: isKorean ? "내레이션" : "Narration",
      processResultCta: "CTA",
      breakoutContextPanel: isKorean ? "참고 정보" : "Reference context",
      breakoutNoReferences: isKorean ? "참고 자료를 찾지 못했습니다." : "No references found."
    }),
    [isKorean]
  );

  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [queuedCandidates, setQueuedCandidates] = useState<ManualInputCandidateDraft[]>([]);
  const [discoveredCandidates, setDiscoveredCandidates] = useState<ManualInputCandidateDraft[]>([]);
  const [discoveryResult, setDiscoveryResult] = useState<YouTubeBreakoutDiscoveryResult | undefined>();
  const [visiblePreviewCount, setVisiblePreviewCount] = useState(10);
  const [candidateAnalysisById, setCandidateAnalysisById] = useState<
    Record<string, CandidateAnalysisState>
  >({});
  const [analysisViewTab, setAnalysisViewTab] = useState<"analysis" | "evidence">("analysis");
  const [activePreviewCandidateId, setActivePreviewCandidateId] = useState<string>("");
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string }>>([]);
  const [processCandidateId, setProcessCandidateId] = useState("");
  const [processHeadline, setProcessHeadline] = useState("");
  const [processSummary, setProcessSummary] = useState("");
  const [processTitleOptions, setProcessTitleOptions] = useState("");
  const [processHook, setProcessHook] = useState("");
  const [processNarration, setProcessNarration] = useState("");
  const [processCallToAction, setProcessCallToAction] = useState("");
  const [processIdeaStrategy, setProcessIdeaStrategy] = useState<
    "pattern_remix" | "comment_gap" | "series_ip"
  >("comment_gap");
  const [processLengthMode, setProcessLengthMode] = useState<"auto" | "shortform" | "longform">(
    "auto"
  );
  const [processReviewNotes, setProcessReviewNotes] = useState("");
  const [processDraftBusy, setProcessDraftBusy] = useState(false);
  const [createPipelineBusy, setCreatePipelineBusy] = useState(false);
  const [message, setMessage] = useState("");
  const activeJobId = workflowJobSnapshot?.job?.jobId ?? telegramStatus?.activeJob?.id;
  const activeJobStage = workflowJobSnapshot?.job?.currentStage ?? telegramStatus?.activeJob?.stage ?? "-";
  const hydratedProcessKeyRef = useRef("");
  const processCheckpoint = workflowJobSnapshot?.checkpoints?.[2];
  const processReviewStatus =
    ((processCheckpoint?.payload as { review?: { status?: "pending" | "approved" } } | undefined)?.review
      ?.status ??
      "pending");
  const checkpointTwoApproved = processReviewStatus === "approved" || activeJobStage === "approved";
  const activeCreateReadiness = createReadiness?.jobId === activeJobId ? createReadiness : undefined;
  const createReadinessBlocker = activeCreateReadiness?.items.find((item) => !item.ok);
  const checkpointCandidates = useMemo(
    () => parseCheckpointCandidates(workflowJobSnapshot?.checkpoints?.[1]?.payload),
    [workflowJobSnapshot?.checkpoints]
  );
  const hasUnsavedYouTubeCandidates =
    selectedModuleId === "youtube-breakout-crawler-mcp" && discoveredCandidates.length > 0;
  const processCandidates = useMemo(() => {
    if (!hasUnsavedYouTubeCandidates) {
      return checkpointCandidates;
    }
    return discoveredCandidates
      .map((candidate, index) => ({
        id: candidate.id?.trim() || `youtube-breakout-staged-${index + 1}`,
        title: candidate.title,
        summary: candidate.summary,
        sourceLabel: candidate.sourceLabel,
        sourceUrl: candidate.sourceUrl
      }))
      .filter((candidate) => candidate.title.trim() && candidate.summary.trim());
  }, [checkpointCandidates, discoveredCandidates, hasUnsavedYouTubeCandidates]);
  const youtubePreviewCandidates = useMemo<YouTubePreviewCandidate[]>(
    () =>
      (discoveryResult?.candidates ?? []).map((candidate) => {
        const thumbnailUrl = resolveThumbnailUrl(candidate);
        const videoId = extractYouTubeVideoId(candidate.sourceUrl, candidate.id);
        return {
          id: candidate.id,
          title: candidate.title,
          summary: candidate.summary,
          sourceLabel: candidate.sourceLabel,
          sourceUrl: candidate.sourceUrl,
          thumbnailUrl,
          videoId,
          views: candidate.metrics?.views,
          subscribers: candidate.metrics?.subscribers,
          breakoutRatioPercent: candidate.metrics?.breakoutRatioPercent,
          comments: candidate.metrics?.comments,
          likes: candidate.metrics?.likes,
          captionMode: candidate.captionMode ?? "none"
        };
      }),
    [discoveryResult?.candidates]
  );
  const processPreviewCandidates = useMemo<YouTubePreviewCandidate[]>(
    () =>
      processCandidates.map((candidate) => {
        const videoId = extractYouTubeVideoId(candidate.sourceUrl, candidate.id);
        return {
          id: candidate.id,
          title: candidate.title,
          summary: candidate.summary,
          sourceLabel: candidate.sourceLabel,
          sourceUrl: candidate.sourceUrl,
          thumbnailUrl:
            candidate.thumbnailUrl ||
            (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined),
          videoId
        };
      }),
    [processCandidates]
  );
  const previewCandidates =
    youtubePreviewCandidates.length > 0 ? youtubePreviewCandidates : processPreviewCandidates;
  const activePreviewCandidate =
    previewCandidates.find((candidate) => candidate.id === activePreviewCandidateId) ??
    previewCandidates[0];
  const visiblePreviewCandidates = youtubePreviewCandidates.slice(0, visiblePreviewCount);
  const activeCandidateAnalysis = activePreviewCandidate
    ? candidateAnalysisById[activePreviewCandidate.id]
    : undefined;
  const activeAnalysisReferences = activeCandidateAnalysis?.result?.references ?? [];
  const knowledgeReferences = activeAnalysisReferences
    .filter((reference) => reference.type === "news" || reference.type === "wiki")
    .slice(0, 3);
  const communityReferences = activeAnalysisReferences
    .filter((reference) => reference.type === "community")
    .slice(0, 3);
  const groupedDisplayReferences = [
    ...knowledgeReferences.map((reference) => ({
      ...reference,
      source: `${isKorean ? "뉴스/위키" : "News/Wiki"} · ${reference.source ?? reference.type}`
    })),
    ...communityReferences.map((reference) => ({
      ...reference,
      source: `${isKorean ? "커뮤니티" : "Community"} · ${reference.source ?? reference.type}`
    }))
  ];

  const inputContracts = useMemo(
    () =>
      listMcpRuntimeContracts().filter((contract) => contract.slot === "input" && contract.slotUi?.input),
    []
  );
  const installedInputContracts = useMemo(
    () =>
      inputContracts.filter((contract) => installed.some((record) => record.id === contract.id)),
    [inputContracts, installed]
  );
  const moduleOptions = useMemo(() => {
    const installedSet = new Set(installedInputContracts.map((contract) => contract.id));
    return inputContracts.filter(
      (contract) => contract.builtinAvailable || installedSet.has(contract.id)
    );
  }, [inputContracts, installedInputContracts]);

  useEffect(() => {
    if (moduleOptions.length === 0) {
      setSelectedModuleId("");
      return;
    }
    const preferred = workflowConfig?.inputModuleId;
    if (preferred && moduleOptions.some((item) => item.id === preferred)) {
      setSelectedModuleId(preferred);
      return;
    }
    if (moduleOptions.some((item) => item.id === selectedModuleId)) {
      return;
    }
    setSelectedModuleId(moduleOptions[0].id);
  }, [moduleOptions, selectedModuleId, workflowConfig?.inputModuleId]);

  useEffect(() => {
    setFieldValues((current) => ({
      ...current,
      trendWindow: workflowConfig?.trendWindow ?? current.trendWindow ?? "24h",
      telegramBotToken: workflowConfig?.telegramBotToken ?? current.telegramBotToken ?? "",
      telegramAdminChatId: workflowConfig?.telegramAdminChatId ?? current.telegramAdminChatId ?? "",
      youtubeDataApiKey: workflowConfig?.youtubeDataApiKey ?? current.youtubeDataApiKey ?? "",
      youtubeCountry: current.youtubeCountry ?? "KR",
      youtubeBreakoutPeriod: current.youtubeBreakoutPeriod ?? "24h",
      youtubeBreakoutRatioPercent: current.youtubeBreakoutRatioPercent ?? "120",
      youtubeRequireCaptions:
        current.youtubeRequireCaptions ??
        (workflowConfig?.youtubeRequireCaptions ? "on" : "off") ??
        "off",
      youtubeSubscriberRange: current.youtubeSubscriberRange ?? "all",
      youtubeBreakoutLimit:
        current.youtubeBreakoutLimit &&
        ["10", "20", "30", "50"].includes(current.youtubeBreakoutLimit)
          ? current.youtubeBreakoutLimit
          : "10",
      youtubeCategoryId: current.youtubeCategoryId ?? "all"
    }));
  }, [
    workflowConfig?.telegramAdminChatId,
    workflowConfig?.telegramBotToken,
    workflowConfig?.trendWindow,
    workflowConfig?.youtubeDataApiKey,
    workflowConfig?.youtubeRequireCaptions
  ]);

  useEffect(() => {
    if (workflowConfig?.processIdeaStrategy === "pattern_remix") {
      setProcessIdeaStrategy("pattern_remix");
      return;
    }
    if (workflowConfig?.processIdeaStrategy === "series_ip") {
      setProcessIdeaStrategy("series_ip");
      return;
    }
    if (workflowConfig?.processIdeaStrategy === "comment_gap") {
      setProcessIdeaStrategy("comment_gap");
    }
  }, [workflowConfig?.processIdeaStrategy]);

  useEffect(() => {
    if (workflowConfig?.processLengthMode === "shortform") {
      setProcessLengthMode("shortform");
      return;
    }
    if (workflowConfig?.processLengthMode === "longform") {
      setProcessLengthMode("longform");
      return;
    }
    setProcessLengthMode("auto");
  }, [workflowConfig?.processLengthMode]);

  useEffect(() => {
    setVisiblePreviewCount(10);
  }, [youtubePreviewCandidates.length]);

  useEffect(() => {
    if (previewCandidates.length === 0) {
      setActivePreviewCandidateId("");
      return;
    }
    if (previewCandidates.some((candidate) => candidate.id === activePreviewCandidateId)) {
      return;
    }
    setActivePreviewCandidateId(previewCandidates[0].id);
  }, [activePreviewCandidateId, previewCandidates]);

  const isInformationalMessage = (value: string): boolean =>
    value === copy.telegramSaved ||
    value === copy.telegramSynced ||
    value === copy.shortlistRan ||
    value === copy.candidateQueued ||
    value.startsWith(copy.breakoutFetchDone) ||
    value.startsWith(copy.breakoutFetchEmpty) ||
    value === copy.checkpointOneSaved ||
    value === copy.checkpointTwoSaved ||
    value === copy.processDraftGenerating ||
    value === copy.processDraftGenerated ||
    value === copy.createRunning ||
    value === copy.createDone;

  useEffect(() => {
    if (!activeJobId) {
      return;
    }
    void refreshWorkflowJobSnapshot(activeJobId);
    void refreshCreateReadiness(activeJobId);
  }, [activeJobId, refreshCreateReadiness, refreshWorkflowJobSnapshot]);

  useEffect(() => {
    const checkpointTwo = workflowJobSnapshot?.checkpoints?.[2];
    const hydrateKey = `${activeJobId ?? "none"}:${checkpointTwo?.updatedAt ?? "none"}`;
    if (hydrateKey === hydratedProcessKeyRef.current) {
      return;
    }
    hydratedProcessKeyRef.current = hydrateKey;

    const processPayload = checkpointTwo?.payload as ProcessCheckpointPayload | undefined;
    if (processPayload?.scriptDraft) {
      setProcessCandidateId(processPayload.selectedCandidateId ?? "");
      setProcessHeadline(processPayload.summary?.headline ?? "");
      setProcessSummary(processPayload.summary?.body ?? "");
      setProcessTitleOptions((processPayload.scriptDraft.titleOptions ?? []).join("\n"));
      setProcessHook(processPayload.scriptDraft.hook ?? "");
      setProcessNarration(processPayload.scriptDraft.narration ?? "");
      setProcessCallToAction(processPayload.scriptDraft.callToAction ?? "");
      setProcessReviewNotes(processPayload.review?.notes ?? "");
      if (processPayload.review?.ideaStrategy === "pattern_remix") {
        setProcessIdeaStrategy("pattern_remix");
      } else if (processPayload.review?.ideaStrategy === "series_ip") {
        setProcessIdeaStrategy("series_ip");
      } else if (processPayload.review?.ideaStrategy === "comment_gap") {
        setProcessIdeaStrategy("comment_gap");
      }
      if (processPayload.review?.lengthMode === "shortform") {
        setProcessLengthMode("shortform");
      } else if (processPayload.review?.lengthMode === "longform") {
        setProcessLengthMode("longform");
      } else if (processPayload.review?.lengthMode === "auto") {
        setProcessLengthMode("auto");
      }
      return;
    }

    if (processCandidates.length > 0) {
      const first = processCandidates[0];
      setProcessCandidateId(first.id);
      setProcessHeadline(first.title);
      setProcessSummary(first.summary);
      setProcessTitleOptions("");
      setProcessHook("");
      setProcessNarration("");
      setProcessCallToAction("");
      setProcessReviewNotes("");
    }
  }, [activeJobId, processCandidates, workflowJobSnapshot?.checkpoints?.[2]?.updatedAt]);

  const selectedInputUi = selectedModuleId
    ? getMcpRuntimeContract(selectedModuleId)?.slotUi?.input
    : undefined;

  const selectedProcessCandidate = processCandidates.find((item) => item.id === processCandidateId);
  const hasGeneratedProcessDraft =
    processTitleOptions.trim().length > 0 ||
    processHook.trim().length > 0 ||
    processNarration.trim().length > 0 ||
    processCallToAction.trim().length > 0;

  const setField = (fieldId: string, value: string) => {
    setFieldValues((current) => ({
      ...current,
      [fieldId]: value
    }));
  };

  const handleRunShortlist = async () => {
    setMessage("");
    await sendMockShortlist();
    await refreshTelegramStatus();
    const nextJobId = useAppStore.getState().telegramStatus?.activeJob?.id;
    if (nextJobId) {
      await refreshWorkflowJobSnapshot(nextJobId);
    }
    setMessage(copy.shortlistRan);
  };

  const handleSaveProcessCheckpoint = async () => {
    if (!activeJobId) {
      setMessage(copy.noShortlistYet);
      return;
    }

    const payload = workflowJobSnapshot?.checkpoints?.[2]?.payload as ProcessCheckpointPayload | undefined;
    const checkpointDraft = payload?.scriptDraft;

    const titleOptions = processTitleOptions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const effectiveTitleOptions =
      titleOptions.length > 0 ? titleOptions : (checkpointDraft?.titleOptions ?? []).filter(Boolean);
    const effectiveHeadline =
      processHeadline.trim() || payload?.summary?.headline?.trim() || selectedProcessCandidate?.title || "";
    const effectiveSummary =
      processSummary.trim() || payload?.summary?.body?.trim() || selectedProcessCandidate?.summary || "";
    const effectiveHook = processHook.trim() || checkpointDraft?.hook?.trim() || "";
    const effectiveNarration = processNarration.trim() || checkpointDraft?.narration?.trim() || "";
    const effectiveCallToAction =
      processCallToAction.trim() || checkpointDraft?.callToAction?.trim() || "";
    if (
      !effectiveHeadline ||
      !effectiveSummary ||
      !effectiveHook ||
      !effectiveNarration ||
      effectiveTitleOptions.length === 0
    ) {
      setMessage(copy.processRequired);
      return;
    }

    await saveManualProcessCheckpoint({
      jobId: activeJobId,
      title: effectiveHeadline,
      selectedCandidateId: processCandidateId || undefined,
      headline: effectiveHeadline,
      summary: effectiveSummary,
      draft: {
        titleOptions: effectiveTitleOptions,
        hook: effectiveHook,
        narration: effectiveNarration,
        callToAction: effectiveCallToAction
      },
      reviewNotes: processReviewNotes.trim() || undefined
    });
    await refreshWorkflowJobSnapshot(activeJobId);
    await refreshCreateReadiness(activeJobId);
    setMessage(copy.checkpointTwoSaved);
  };

  const handleGenerateProcessDraft = async () => {
    if (!activeJobId) {
      setMessage(copy.noShortlistYet);
      return;
    }
    if (checkpointCandidates.length === 0) {
      setMessage(copy.noShortlistYet);
      return;
    }

    if (!processReviewNotes.trim()) {
      setMessage(copy.processNotebookRequired);
      return;
    }

    setProcessDraftBusy(true);
    setMessage(copy.processDraftGenerating);
    try {
      const candidate = processCandidates.find(
        (item) => item.id === (processCandidateId || checkpointCandidates[0]?.id)
      );
      const sourceDraft = {
        headline: candidate?.title?.trim() || processHeadline.trim() || undefined,
        summary: candidate?.summary?.trim() || processSummary.trim() || undefined,
        titleOptions: processTitleOptions
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        hook: processHook.trim() || undefined,
        narration: processNarration.trim() || undefined,
        callToAction: processCallToAction.trim() || undefined,
        operatorMemo: processReviewNotes.trim()
      };
      await saveWorkflowConfig({
        processIdeaStrategy,
        processLengthMode,
        processDraftMode: "manual_polish"
      });
      await generateProcessDraft({
        jobId: activeJobId,
        selectedCandidateId: processCandidateId || checkpointCandidates[0]?.id,
        scriptCategory: "community",
        ideaStrategy: processIdeaStrategy,
        lengthMode: processLengthMode,
        draftMode: "manual_polish",
        sourceDraft,
        revisionRequest: processReviewNotes.trim()
      });
      await refreshWorkflowJobSnapshot(activeJobId);
      await refreshCreateReadiness(activeJobId);
      setMessage(copy.processDraftGenerated);
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        setMessage(`${copy.processDraftFailedPrefix} ${error.message}`);
      } else {
        setMessage(copy.processDraftFailedPrefix);
      }
    } finally {
      setProcessDraftBusy(false);
    }
  };

  const handleAnalyzeYouTubeCandidate = async (candidate: YouTubePreviewCandidate) => {
    setAnalysisViewTab("analysis");
    setCandidateAnalysisById((current) => ({
      ...current,
      [candidate.id]: {
        status: "loading"
      }
    }));

    try {
      const result = await analyzeYouTubeCandidate({
        title: candidate.title,
        summary: candidate.summary,
        sourceLabel: candidate.sourceLabel,
        sourceUrl: candidate.sourceUrl,
        views: candidate.views,
        subscribers: candidate.subscribers,
        breakoutRatioPercent: candidate.breakoutRatioPercent,
        comments: candidate.comments,
        likes: candidate.likes
      });
      setCandidateAnalysisById((current) => ({
        ...current,
        [candidate.id]: {
          status: "done",
          result
        }
      }));
    } catch (error) {
      setCandidateAnalysisById((current) => ({
        ...current,
        [candidate.id]: {
          status: "error",
          result: {
            source: "mock",
            analysis:
              error instanceof Error && error.message.trim()
                ? `${copy.breakoutAnalysisError}\n${error.message}`
                : copy.breakoutAnalysisError
          }
        }
      }));
    }
  };

  const handleRunCreateFromCrawling = async () => {
    if (!activeJobId) {
      setMessage(copy.noShortlistYet);
      return;
    }

    if (!checkpointTwoApproved) {
      setMessage(copy.createNeedApproval);
      return;
    }

    setCreatePipelineBusy(true);
    setMessage(copy.createRunning);
    try {
      await runCreatePipeline(activeJobId);
      await refreshWorkflowJobSnapshot(activeJobId);
      await refreshCreateReadiness(activeJobId);
      await refreshTelegramStatus();
      setMessage(copy.createDone);
    } catch (error) {
      if (error instanceof Error && error.message.trim()) {
        setMessage(`${copy.createFailedPrefix} ${error.message}`);
      } else {
        setMessage(copy.createFailedPrefix);
      }
    } finally {
      setCreatePipelineBusy(false);
    }
  };

  const runAction = async (actionId: string) => {
    setMessage("");

    if (actionId === "save_telegram_config") {
      await saveWorkflowConfig({
        trendWindow: fieldValues.trendWindow === "3d" ? "3d" : "24h",
        telegramBotToken: fieldValues.telegramBotToken?.trim() || undefined,
        telegramAdminChatId: fieldValues.telegramAdminChatId?.trim() || undefined
      });
      setMessage(copy.telegramSaved);
      return;
    }

    if (actionId === "sync_telegram") {
      await refreshTelegramStatus();
      setMessage(copy.telegramSynced);
      return;
    }

    if (actionId === "attach_files") {
      attachInputRef.current?.click();
      return;
    }

    if (actionId === "add_candidate") {
      const candidate = toCandidate(fieldValues);
      if (!candidate) {
        setMessage(copy.candidateRequired);
        return;
      }
      setQueuedCandidates((current) => [...current, candidate]);
      setField("candidateTitle", "");
      setField("candidateSummary", "");
      setField("candidateSourceLabel", "");
      setField("candidateSourceUrl", "");
      setField("candidateFitReason", "");
      setMessage(copy.candidateQueued);
      return;
    }

    if (actionId === "fetch_youtube_breakouts") {
      const breakoutRatioPercent = Number.parseFloat(fieldValues.youtubeBreakoutRatioPercent ?? "");
      if (!Number.isFinite(breakoutRatioPercent) || breakoutRatioPercent <= 0) {
        setMessage(copy.breakoutRatioInvalid);
        return;
      }
      const breakoutLimit = Math.min(
        Math.max(Number.parseInt(fieldValues.youtubeBreakoutLimit ?? "10", 10) || 10, 10),
        50
      );

      await saveWorkflowConfig({
        youtubeDataApiKey: fieldValues.youtubeDataApiKey?.trim() || undefined,
        youtubeRequireCaptions: fieldValues.youtubeRequireCaptions === "on"
      });

      const result = await discoverYouTubeBreakoutCandidates({
        country: (fieldValues.youtubeCountry ?? "KR").toUpperCase(),
        period:
          fieldValues.youtubeBreakoutPeriod === "7d"
            ? "7d"
            : fieldValues.youtubeBreakoutPeriod === "3d"
              ? "3d"
              : "24h",
        breakoutRatioPercent,
        categoryId: fieldValues.youtubeCategoryId ?? "all",
        subscriberRange:
          fieldValues.youtubeSubscriberRange === "0_10k" ||
          fieldValues.youtubeSubscriberRange === "10k_50k" ||
          fieldValues.youtubeSubscriberRange === "50k_100k" ||
          fieldValues.youtubeSubscriberRange === "100k_200k" ||
          fieldValues.youtubeSubscriberRange === "200k_300k" ||
          fieldValues.youtubeSubscriberRange === "300k_500k" ||
          fieldValues.youtubeSubscriberRange === "500k_plus"
            ? fieldValues.youtubeSubscriberRange
            : "all",
        requireCaptions: fieldValues.youtubeRequireCaptions === "on",
        limit: breakoutLimit
      });

      const mappedCandidates: ManualInputCandidateDraft[] = result.candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        summary: candidate.summary,
        operatorSummary: candidate.operatorSummary,
        contentAngle: candidate.contentAngle,
        sourceLabel: candidate.sourceLabel,
        sourceKind: candidate.sourceKind,
        sourceRegion: candidate.sourceRegion,
        sourceUrl: candidate.sourceUrl,
        fitReason: candidate.fitReason
      }));

      setDiscoveredCandidates(mappedCandidates);
      setDiscoveryResult(result);
      setActivePreviewCandidateId(result.candidates[0]?.id ?? "");
      setCandidateAnalysisById({});
      if (mappedCandidates.length > 0) {
        const first = mappedCandidates[0];
        setProcessCandidateId(first.id ?? "");
        setProcessHeadline(first.title ?? "");
        setProcessSummary(first.summary ?? "");
        setProcessTitleOptions("");
        setProcessHook("");
        setProcessNarration("");
        setProcessCallToAction("");
        setProcessReviewNotes("");
      }
      const debugMessage = result.sourceDebug.message?.trim();
      if (result.sourceDebug.status === "ok") {
        setMessage(debugMessage ? `${copy.breakoutFetchDone} ${debugMessage}` : copy.breakoutFetchDone);
      } else {
        setMessage(debugMessage ? `${copy.breakoutFetchEmpty} ${debugMessage}` : copy.breakoutFetchEmpty);
      }
      return;
    }

    if (actionId === "save_checkpoint_1") {
      const currentCandidate = toCandidate(fieldValues);
      const aggregateCandidates = [
        ...discoveredCandidates,
        ...queuedCandidates,
        ...(currentCandidate ? [currentCandidate] : [])
      ];
      const uniqueById = new Map<string, ManualInputCandidateDraft>();
      aggregateCandidates.forEach((candidate, index) => {
        const key = candidate.id?.trim() || `${candidate.title.trim()}::${candidate.summary.trim()}::${index}`;
        uniqueById.set(key, candidate);
      });
      const candidates = Array.from(uniqueById.values());
      if (candidates.length === 0) {
        setMessage(copy.candidateRequired);
        return;
      }

      const shouldStartNewJob =
        selectedModuleId === "youtube-breakout-crawler-mcp" && discoveredCandidates.length > 0;

      await saveManualInputCheckpoint({
        jobId: shouldStartNewJob ? undefined : activeJobId,
        title: candidates[0]?.title ?? (isKorean ? "수동 크롤링 입력" : "Manual crawl input"),
        request: {
          regions: ["global", "domestic"],
          limit: 10,
          timeWindow: fieldValues.trendWindow === "3d" ? "3d" : "24h"
        },
        candidates,
        attachmentPaths: attachments.map((item) => item.path)
      });
      setQueuedCandidates([]);
      setDiscoveredCandidates([]);
      setDiscoveryResult(undefined);
      const savedJobId = useAppStore.getState().workflowJobSnapshot?.job?.jobId;
      if (savedJobId) {
        await refreshWorkflowJobSnapshot(savedJobId);
        await refreshCreateReadiness(savedJobId);
      }
      setMessage(copy.checkpointOneSaved);
      return;
    }

    setMessage(copy.actionNotReady.replace("{actionId}", actionId));
  };

  return (
    <section className="page crawling-page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
        </div>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void handleRunShortlist()}>
            {copy.runShortlist}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!activeJobId}
            onClick={() => activeJobId && void refreshWorkflowJobSnapshot(activeJobId)}
          >
            {copy.refreshJob}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>{copy.moduleLabel}</span>
          <select
            className="text-input"
            value={selectedModuleId}
            onChange={(event) => setSelectedModuleId(event.target.value)}
          >
            {moduleOptions.map((module) => (
              <option key={module.id} value={module.id}>
                {module.name}
              </option>
            ))}
          </select>
        </div>
        {selectedInputUi && <p className="subtle">{selectedInputUi.description ?? copy.noDescription}</p>}
        <div className="meta-list">
          <div>
            <strong>{copy.jobIdLabel}</strong>
            <span>{activeJobId ?? "-"}</span>
          </div>
          <div>
            <strong>{copy.stageLabel}</strong>
            <span>{activeJobStage}</span>
          </div>
          <div>
            <strong>{copy.telegramState}</strong>
            <span>{telegramStatus?.state ?? (isKorean ? "대기 중" : "idle")}</span>
          </div>
        </div>
        {message && (
          <p
            className={
              isInformationalMessage(message)
                ? "subtle"
                : "warning-text"
            }
          >
            {message}
          </p>
        )}
      </div>

      {!selectedInputUi ? (
        <div className="card">
          <p className="subtle">{copy.emptyState}</p>
        </div>
      ) : (
        <div className="card">
          <h3>{selectedInputUi.title ?? copy.defaultSectionTitle}</h3>
          <div
            className={
              selectedModuleId === "youtube-breakout-crawler-mcp"
                ? "form-grid crawling-input-grid"
                : "form-grid"
            }
          >
            {selectedInputUi.fields.map((field) => {
              const className = field.width === "half" ? "field" : "field field-span-2";
              const value = fieldValues[field.id] ?? "";
              const commonProps = {
                className: "text-input",
                value,
                onChange: (
                  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
                ) => setField(field.id, event.target.value)
              };

              if (field.type === "textarea") {
                return (
                  <label key={field.id} className={className}>
                    <span>{field.label}</span>
                    <textarea {...commonProps} className="text-input textarea-input" />
                  </label>
                );
              }

              if (field.type === "select") {
                return (
                  <label key={field.id} className={className}>
                    <span>{field.label}</span>
                    <select {...commonProps}>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (field.type === "secret") {
                return (
                  <label key={field.id} className={className}>
                    <span>{field.label}</span>
                    <input {...commonProps} type="password" placeholder={field.placeholder} />
                  </label>
                );
              }

              return (
                <label key={field.id} className={className}>
                  <span>{field.label}</span>
                  <input {...commonProps} type="text" placeholder={field.placeholder} />
                </label>
              );
            })}
          </div>
          {selectedModuleId === "youtube-breakout-crawler-mcp" ? (
            <div className="crawling-inline-toggle">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={fieldValues.youtubeRequireCaptions === "on"}
                  onChange={(event) =>
                    setField("youtubeRequireCaptions", event.target.checked ? "on" : "off")
                  }
                />
                <span>{isKorean ? "자막 필수 (원문/ASR 없으면 제외)" : "Require captions (exclude if none)"}</span>
              </label>
            </div>
          ) : null}

          {selectedInputUi.actions.length > 0 && (
            <div className="button-row">
              {selectedInputUi.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={getActionClass(action.kind)}
                  onClick={() => void runAction(action.id)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <input
            ref={attachInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length === 0) {
                return;
              }
              setAttachments((current) => [
                ...current,
                ...files.map((file) => {
                  const fileWithPath = file as File & { path?: string };
                  return {
                    name: file.name,
                    path: fileWithPath.path ?? file.name
                  };
                })
              ]);
            }}
          />

          <div className="meta-list">
            <div>
              <strong>{copy.queuedCandidates}</strong>
              <span>{queuedCandidates.length}</span>
            </div>
            <div>
              <strong>{copy.breakoutPreviewTitle}</strong>
              <span>{discoveredCandidates.length}</span>
            </div>
            <div>
              <strong>{copy.shortlistCandidates}</strong>
              <span>{processCandidates.length}</span>
            </div>
            <div>
              <strong>{copy.attachments}</strong>
              <span>{attachments.length}</span>
            </div>
          </div>

          {discoveredCandidates.length > 0 && (
            <div className="workflow-slot-preview">
              <strong>{copy.breakoutPreviewTitle}</strong>
              <span className="subtle">
                {copy.breakoutPreviewHint}
                {discoveryResult
                  ? ` (${discoveryResult.request.country} · ${discoveryResult.request.period} · ${discoveryResult.request.breakoutRatioPercent}% · ${discoveryResult.request.subscriberRange} · ${discoveryResult.request.categoryId} · ${discoveryResult.request.limit})`
                  : ""}
              </span>
              <div className="youtube-breakout-gallery">
                {visiblePreviewCandidates.map((candidate) => (
                  <article
                    key={candidate.id}
                    className={`youtube-breakout-card ${
                      activePreviewCandidate?.id === candidate.id ? "active" : ""
                    }`}
                    onClick={() => setActivePreviewCandidateId(candidate.id)}
                  >
                    <div className="youtube-breakout-thumb">
                      {candidate.thumbnailUrl ? (
                        <img
                          src={candidate.thumbnailUrl}
                          alt={candidate.title}
                          loading="lazy"
                          onError={(event) => {
                            const image = event.currentTarget;
                            if (image.dataset.retry === "1") {
                              image.style.display = "none";
                              return;
                            }
                            image.dataset.retry = "1";
                            const fallbackId =
                              candidate.videoId ?? extractYouTubeVideoId(candidate.sourceUrl, candidate.id);
                            if (fallbackId) {
                              image.src = `https://i.ytimg.com/vi/${fallbackId}/hqdefault.jpg`;
                            } else {
                              image.style.display = "none";
                            }
                          }}
                        />
                      ) : (
                        <div className="youtube-breakout-thumb-fallback">{copy.breakoutNoThumbnail}</div>
                      )}
                    </div>
                    <strong>{candidate.title}</strong>
                    <span className="subtle">{candidate.summary}</span>
                    <span className="subtle">{candidate.sourceLabel ?? "YouTube"}</span>
                    <div className="youtube-breakout-metrics">
                      <div>
                        <span>{copy.breakoutViews}</span>
                        <strong>{formatMetricNumber(candidate.views)}</strong>
                      </div>
                      <div>
                        <span>{copy.breakoutSubscribers}</span>
                        <strong>{formatMetricNumber(candidate.subscribers)}</strong>
                      </div>
                      <div>
                        <span>{copy.breakoutPerformance}</span>
                        <strong>{formatPerformanceRatio(candidate.breakoutRatioPercent)}</strong>
                      </div>
                    </div>
                    <div className="youtube-breakout-badges">
                      <span
                        className={`caption-mode-pill ${
                          candidate.captionMode === "manual"
                            ? "manual"
                            : candidate.captionMode === "asr"
                              ? "asr"
                              : "none"
                        }`}
                      >
                        {candidate.captionMode === "manual"
                          ? isKorean
                            ? "자막: 원문"
                            : "Captions: manual"
                          : candidate.captionMode === "asr"
                            ? isKorean
                              ? "자막: ASR"
                              : "Captions: ASR"
                            : isKorean
                              ? "자막 없음"
                              : "No captions"}
                      </span>
                    </div>
                    <div className="youtube-breakout-actions">
                      {candidate.sourceUrl ? (
                        <a
                          className="inline-link"
                          href={candidate.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {copy.breakoutOpenVideo}
                        </a>
                      ) : (
                        <span className="subtle">{copy.breakoutNoVideo}</span>
                      )}
                      <button
                        type="button"
                        className="secondary-button slim"
                        disabled={candidateAnalysisById[candidate.id]?.status === "loading"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActivePreviewCandidateId(candidate.id);
                          void handleAnalyzeYouTubeCandidate(candidate);
                        }}
                      >
                        {candidateAnalysisById[candidate.id]?.status === "loading"
                          ? copy.breakoutAnalyzing
                          : copy.breakoutAnalyze}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {youtubePreviewCandidates.length > visiblePreviewCount ? (
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setVisiblePreviewCount((current) =>
                        Math.min(current + 10, youtubePreviewCandidates.length)
                      )
                    }
                  >
                    {copy.breakoutLoadMore}
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {hasUnsavedYouTubeCandidates && (
            <p className="warning-text">{copy.checkpointOneMustSaveFirst}</p>
          )}
        </div>
      )}

      <div className="card">
        <div className="settings-row">
          <h3>{copy.processSection}</h3>
          <span className={`workflow-slot-status ${checkpointTwoApproved ? "ready" : "waiting"}`}>
            {checkpointTwoApproved ? copy.checkpointTwoApproved : copy.checkpointTwoPending}
          </span>
        </div>
        {processCandidates.length === 0 ? (
          <p className="subtle">{copy.noShortlistYet}</p>
        ) : (
          <>
            <div className="crawling-process-top-grid">
              {activePreviewCandidate ? (
                <div className="crawling-process-preview">
                  <strong>{copy.breakoutPreviewVideo}</strong>
                  {activePreviewCandidate.thumbnailUrl ? (
                    <img
                      className="youtube-breakout-player-image"
                      src={activePreviewCandidate.thumbnailUrl}
                      alt={activePreviewCandidate.title}
                      loading="lazy"
                      onError={(event) => {
                        const image = event.currentTarget;
                        if (image.dataset.retry === "1") {
                          image.style.display = "none";
                          return;
                        }
                        image.dataset.retry = "1";
                        const fallbackId =
                          activePreviewCandidate.videoId ??
                          extractYouTubeVideoId(activePreviewCandidate.sourceUrl, activePreviewCandidate.id);
                        if (fallbackId) {
                          image.src = `https://i.ytimg.com/vi/${fallbackId}/hqdefault.jpg`;
                        } else {
                          image.style.display = "none";
                        }
                      }}
                    />
                  ) : (
                    <p className="subtle">{copy.breakoutNoThumbnail}</p>
                  )}
                  {activePreviewCandidate.sourceUrl ? (
                    <a
                      className="primary-button"
                      href={activePreviewCandidate.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.breakoutOpenVideo}
                    </a>
                  ) : (
                    <p className="subtle">{copy.breakoutNoVideo}</p>
                  )}
                  <button
                    type="button"
                    className="secondary-button slim"
                    disabled={!activePreviewCandidate || activeCandidateAnalysis?.status === "loading"}
                    onClick={() => void handleAnalyzeYouTubeCandidate(activePreviewCandidate)}
                  >
                    {activeCandidateAnalysis?.status === "loading"
                      ? copy.breakoutAnalyzing
                      : copy.breakoutAnalyze}
                  </button>
                  {activeCandidateAnalysis ? (
                    <div className="youtube-breakout-analysis-panel">
                      <div className="youtube-breakout-analysis-header">
                        <strong>{copy.breakoutAnalysisPanel}</strong>
                        <div className="analysis-tab-row">
                          <button
                            type="button"
                            className={`secondary-button slim ${
                              analysisViewTab === "analysis" ? "active-tab" : ""
                            }`}
                            onClick={() => setAnalysisViewTab("analysis")}
                          >
                            {isKorean ? "분석 1·2·3" : "Analysis 1·2·3"}
                          </button>
                          <button
                            type="button"
                            className={`secondary-button slim ${
                              analysisViewTab === "evidence" ? "active-tab" : ""
                            }`}
                            onClick={() => setAnalysisViewTab("evidence")}
                          >
                            {isKorean ? "자막 근거 인용" : "Transcript Evidence"}
                          </button>
                        </div>
                      </div>
                      {analysisViewTab === "analysis" ? (
                        <p className="subtle youtube-breakout-analysis-text">
                          {activeCandidateAnalysis.status === "loading"
                            ? copy.breakoutAnalyzing
                            : activeCandidateAnalysis.result?.analysis ?? copy.breakoutAnalysisError}
                        </p>
                      ) : (
                        <div className="analysis-evidence-panel">
                          {activeCandidateAnalysis.result?.transcriptEvidence?.length ? (
                            <ul className="analysis-evidence-list">
                              {activeCandidateAnalysis.result.transcriptEvidence.map((line, index) => (
                                <li key={`ev-${index}`}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="subtle">
                              {isKorean
                                ? "자막 근거를 찾지 못했습니다. (원문/ASR 자막 없음)"
                                : "No transcript evidence found (manual/ASR captions unavailable)."}
                            </p>
                          )}
                        </div>
                      )}
                      {activeCandidateAnalysis.status !== "loading" ? (
                        <div className="youtube-breakout-analysis-context">
                          <strong>{copy.breakoutContextPanel}</strong>
                          {activeCandidateAnalysis.result?.contextSummary ? (
                            <p className="subtle">{activeCandidateAnalysis.result.contextSummary}</p>
                          ) : null}
                          {knowledgeReferences.length > 0 || communityReferences.length > 0 ? (
                            
                                <ul className="analysis-reference-list">
                                  {groupedDisplayReferences.map((reference) => (
                                <li key={`${reference.type}:${reference.url}`}>
                                  <a href={reference.url} target="_blank" rel="noreferrer">
                                    {reference.title}
                                  </a>
                                  <span className="subtle">
                                    {` · ${reference.source ?? reference.type}${
                                      reference.publishedAt ? ` · ${reference.publishedAt}` : ""
                                    }`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="subtle">{copy.breakoutNoReferences}</p>
                          )}
                          {activeCandidateAnalysis.result?.contextDebug?.length ? (
                            <details className="analysis-debug-details">
                              <summary>Context debug</summary>
                              <ul className="analysis-debug-list">
                                {activeCandidateAnalysis.result.contextDebug.map((line, index) => (
                                  <li key={`debug-${index}`}>{line}</li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="crawling-process-preview">
                  <strong>{copy.breakoutPreviewVideo}</strong>
                  <p className="subtle">{copy.breakoutNoVideo}</p>
                </div>
              )}

              <label className="memo-note">
                <div className="memo-note-header">
                  <strong>{copy.processNotebook}</strong>
                </div>
                <textarea
                  className="memo-note-input"
                  value={processReviewNotes}
                  onChange={(event) => setProcessReviewNotes(event.target.value)}
                />
                <span className="subtle memo-note-hint">{copy.processNotebookHint}</span>
              </label>
            </div>

            <div className="form-grid">
              <label className="field field-span-2">
                <span>{copy.selectedCandidate}</span>
                <select
                  className="text-input"
                  value={processCandidateId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setProcessCandidateId(nextId);
                    const found = processCandidates.find((item) => item.id === nextId);
                    if (found) {
                      setProcessHeadline(found.title);
                      setProcessSummary(found.summary);
                      setProcessTitleOptions("");
                      setProcessHook("");
                      setProcessNarration("");
                      setProcessCallToAction("");
                      setProcessReviewNotes("");
                    }
                    setActivePreviewCandidateId(nextId);
                  }}
                >
                  {processCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
                {selectedProcessCandidate ? (
                  <span className="subtle">
                    {selectedProcessCandidate.sourceLabel ? `${selectedProcessCandidate.sourceLabel} · ` : ""}
                    {selectedProcessCandidate.summary}
                  </span>
                ) : null}
              </label>

              <label className="field field-span-2">
                <span>{copy.ideaStrategy}</span>
                <select
                  className="text-input"
                  value={processIdeaStrategy}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "pattern_remix" || nextValue === "series_ip") {
                      setProcessIdeaStrategy(nextValue);
                      return;
                    }
                    setProcessIdeaStrategy("comment_gap");
                  }}
                >
                  <option value="comment_gap">{copy.ideaStrategyCommentGap}</option>
                  <option value="pattern_remix">{copy.ideaStrategyPatternRemix}</option>
                  <option value="series_ip">{copy.ideaStrategySeriesIp}</option>
                </select>
                <span className="subtle">{copy.ideaStrategyHint}</span>
              </label>

              <label className="field field-span-2">
                <span>{copy.lengthMode}</span>
                <select
                  className="text-input"
                  value={processLengthMode}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "shortform" || nextValue === "longform") {
                      setProcessLengthMode(nextValue);
                      return;
                    }
                    setProcessLengthMode("auto");
                  }}
                >
                  <option value="auto">{copy.lengthModeAuto}</option>
                  <option value="shortform">{copy.lengthModeShortform}</option>
                  <option value="longform">{copy.lengthModeLongform}</option>
                </select>
                <span className="subtle">{copy.lengthModeHint}</span>
              </label>
            </div>

            <div className="process-result-panel">
              <div className="settings-row">
                <strong>{copy.processResultTitle}</strong>
              </div>
              {hasGeneratedProcessDraft ? (
                <div className="form-grid">
                  <label className="field field-span-2">
                    <span>{copy.processResultHeadline}</span>
                    <textarea className="text-input result-readonly" value={processHeadline} readOnly rows={2} />
                  </label>
                  <label className="field field-span-2">
                    <span>{copy.processResultSummary}</span>
                    <textarea className="text-input result-readonly" value={processSummary} readOnly rows={4} />
                  </label>
                  <label className="field field-span-2">
                    <span>{copy.processResultTitleOptions}</span>
                    <textarea
                      className="text-input result-readonly"
                      value={processTitleOptions}
                      readOnly
                      rows={4}
                    />
                  </label>
                  <label className="field field-span-2">
                    <span>{copy.processResultHook}</span>
                    <textarea className="text-input result-readonly" value={processHook} readOnly rows={3} />
                  </label>
                  <label className="field field-span-2">
                    <span>{copy.processResultNarration}</span>
                    <textarea className="text-input result-readonly" value={processNarration} readOnly rows={8} />
                  </label>
                  <label className="field field-span-2">
                    <span>{copy.processResultCta}</span>
                    <textarea className="text-input result-readonly" value={processCallToAction} readOnly rows={2} />
                  </label>
                </div>
              ) : (
                <p className="subtle">{copy.processResultEmpty}</p>
              )}
            </div>
          </>
        )}

        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={!activeJobId || processCandidates.length === 0 || processDraftBusy || hasUnsavedYouTubeCandidates}
            onClick={() => void handleGenerateProcessDraft()}
          >
            {copy.processDraftGenerate}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!activeJobId || processCandidates.length === 0 || hasUnsavedYouTubeCandidates}
            onClick={() => void handleSaveProcessCheckpoint()}
          >
            {copy.saveCheckpointTwo}
          </button>
          <button
            type="button"
            className="primary-button pack"
            disabled={!activeJobId || !checkpointTwoApproved || createPipelineBusy}
            onClick={() => void handleRunCreateFromCrawling()}
          >
            {copy.runCreate}
          </button>
        </div>
        {activeCreateReadiness ? (
          <p className={activeCreateReadiness.canRun ? "subtle" : "warning-text"}>
            {activeCreateReadiness.canRun
              ? copy.createReadinessReady
              : `${copy.createReadinessBlockedPrefix} ${createReadinessBlocker?.label ?? "-"} · ${
                  createReadinessBlocker?.detail ?? "-"
                }`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
