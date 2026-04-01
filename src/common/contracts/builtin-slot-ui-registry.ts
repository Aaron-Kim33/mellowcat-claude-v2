import type { MCPSlotId, MCPSlotUiSchema } from "../types/mcp-contract";

const BUILTIN_INPUT_UI: MCPSlotUiSchema = {
  slot: "input",
  title: "자료 수집",
  description: "커뮤니티와 소스에서 후보를 모으고 다음 단계로 넘길 주제를 고릅니다.",
  fields: [
    {
      id: "telegramBotToken",
      label: "텔레그램 봇 토큰",
      type: "secret",
      width: "half"
    },
    {
      id: "telegramAdminChatId",
      label: "관리자 채팅 ID",
      type: "text",
      width: "half"
    },
    {
      id: "trendWindow",
      label: "트렌드 조회 범위",
      type: "select",
      width: "half",
      options: [
        { label: "최근 24시간", value: "24h" },
        { label: "최근 3일", value: "3d" }
      ]
    },
    {
      id: "candidateTitle",
      label: "제목",
      type: "text",
      required: true
    },
    {
      id: "candidateSourceLabel",
      label: "출처 라벨",
      type: "text"
    },
    {
      id: "candidateSummary",
      label: "요약",
      type: "textarea",
      required: true,
      width: "full"
    },
    {
      id: "candidateSourceUrl",
      label: "원문 링크",
      type: "text",
      width: "half"
    },
    {
      id: "candidateFitReason",
      label: "선정 이유",
      type: "text",
      width: "half"
    }
  ],
  actions: [
    { id: "save_telegram_config", label: "텔레그램 설정 저장", kind: "secondary" },
    { id: "sync_telegram", label: "텔레그램 동기화", kind: "secondary" },
    { id: "add_candidate", label: "후보 추가", kind: "secondary" },
    { id: "attach_files", label: "파일 첨부", kind: "secondary" },
    { id: "save_checkpoint_1", label: "checkpoint-1 저장", kind: "primary" }
  ]
};

const BUILTIN_PROCESS_UI: MCPSlotUiSchema = {
  slot: "process",
  title: "자료 가공",
  description:
    "/shortlist에서 제시된 후보 중 하나를 골라서 요약본과 스크립트 초안을 승인하기 전까지 다듬는 단계입니다.",
  fields: [
    { id: "selectedCandidateId", label: "기준 후보", type: "select", required: true },
    { id: "headline", label: "대표 제목", type: "text", required: true },
    {
      id: "processedSummary",
      label: "가공 요약",
      type: "textarea",
      required: true,
      width: "full"
    },
    {
      id: "titleOptions",
      label: "제목 후보",
      type: "textarea",
      required: true,
      width: "full"
    },
    { id: "hook", label: "훅", type: "textarea", required: true },
    { id: "callToAction", label: "CTA", type: "textarea" },
    {
      id: "narration",
      label: "내레이션",
      type: "textarea",
      required: true,
      width: "full"
    },
    {
      id: "reviewNotes",
      label: "검토 메모",
      type: "textarea",
      width: "full"
    }
  ],
  actions: [{ id: "save_checkpoint_2", label: "checkpoint-2 저장", kind: "primary" }]
};

const BUILTIN_CREATE_UI: MCPSlotUiSchema = {
  slot: "create",
  title: "소재 생성",
  description: "영상 파일과 메타데이터를 묶어 업로드 가능한 제작 단위로 만듭니다.",
  fields: [
    {
      id: "videoFilePath",
      label: "영상 파일 경로",
      type: "text",
      required: true,
      width: "full"
    },
    {
      id: "thumbnailFilePath",
      label: "썸네일 파일 경로",
      type: "text",
      width: "full"
    },
    {
      id: "publishTitle",
      label: "업로드 제목",
      type: "text",
      required: true,
      width: "full"
    },
    {
      id: "publishDescription",
      label: "설명",
      type: "textarea",
      width: "full"
    },
    {
      id: "hashtags",
      label: "해시태그",
      type: "text",
      width: "full"
    },
    {
      id: "productionNotes",
      label: "제작 메모",
      type: "textarea",
      width: "full"
    }
  ],
  actions: [{ id: "save_checkpoint_3", label: "checkpoint-3 저장", kind: "primary" }]
};

const BUILTIN_OUTPUT_YOUTUBE_UI: MCPSlotUiSchema = {
  slot: "output",
  title: "유튜브 연결과 업로드",
  description:
    "배포 슬롯에서 바로 연결 상태를 확인하고 업로드를 실행할 수 있습니다.",
  fields: [
    {
      id: "youtubeOAuthClientId",
      label: "OAuth Client ID",
      type: "text",
      required: true,
      placeholder: "1234567890-xxxx.apps.googleusercontent.com",
      width: "full"
    },
    {
      id: "youtubeOAuthClientSecret",
      label: "OAuth Client Secret",
      type: "secret",
      required: true,
      placeholder: "GOCSPX-...",
      width: "full"
    },
    {
      id: "youtubeOAuthRedirectPort",
      label: "리디렉션 포트",
      type: "text",
      placeholder: "45123",
      width: "half"
    }
  ],
  actions: [
    { id: "save_youtube_config", label: "유튜브 설정 저장", kind: "secondary" },
    { id: "refresh_youtube_status", label: "유튜브 상태 새로고침", kind: "secondary" },
    { id: "connect_youtube", label: "유튜브 연결", kind: "primary" },
    { id: "disconnect_youtube", label: "연결 해제", kind: "danger" },
    { id: "upload_last_package", label: "유튜브에 업로드", kind: "primary" }
  ]
};

const BUILTIN_SLOT_UI_REGISTRY: Partial<Record<MCPSlotId, MCPSlotUiSchema>> = {
  input: BUILTIN_INPUT_UI,
  process: BUILTIN_PROCESS_UI,
  create: BUILTIN_CREATE_UI,
  output: BUILTIN_OUTPUT_YOUTUBE_UI
};

export function getBuiltinSlotUiSchema(slot: MCPSlotId): MCPSlotUiSchema | undefined {
  return BUILTIN_SLOT_UI_REGISTRY[slot];
}
