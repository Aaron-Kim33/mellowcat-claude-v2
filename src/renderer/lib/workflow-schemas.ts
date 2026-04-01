import type { WorkflowUISchema } from "./workflow-ui-schema";

const YOUTUBE_CATEGORY_OPTIONS = [
  { value: "22", label: "인물/블로그" },
  { value: "24", label: "엔터테인먼트" },
  { value: "25", label: "뉴스/정치" },
  { value: "27", label: "교육" }
] as const;

const DISCOVERY_BASELINE_SECTION = {
  id: "discovery-baseline",
  eyebrow: "발견 · 생성",
  title: "트렌드 수집 기본 기준",
  description:
    "AI 연결과 모델 설정은 이제 설정 탭의 전역 AI 연결에서 관리합니다. 여기에서는 수집 범위와 워크플로 기본 기준만 조정합니다.",
  fields: [
    {
      id: "trendWindow",
      label: "트렌드 조회 범위",
      type: "select",
      options: [
        { label: "최근 24시간", value: "24h" },
        { label: "최근 3일", value: "3d" }
      ]
    }
  ]
} as const;

const YOUTUBE_SECTION = {
  id: "youtube",
  eyebrow: "유튜브",
  title: "연결과 업로드",
  description:
    "1. 텔레그램에서 후보를 승인해 패키지를 만들고, 2. 영상 파일을 선택한 뒤, 3. 상단 빠른 액션에서 실제 유튜브 업로드를 진행합니다.",
  actionPlacement: "beforeFields",
  fields: [
    {
      id: "youtubeChannelLabel",
      label: "채널 라벨",
      type: "text",
      placeholder: "메인 쇼츠 채널"
    },
    {
      id: "youtubePrivacyStatus",
      label: "공개 범위",
      type: "select",
      options: [
        { label: "비공개", value: "private" },
        { label: "일부 공개", value: "unlisted" },
        { label: "전체 공개", value: "public" }
      ]
    },
    {
      id: "youtubeCategoryId",
      label: "카테고리",
      type: "select",
      options: YOUTUBE_CATEGORY_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value
      }))
    },
    {
      id: "youtubeAudience",
      label: "시청자 대상",
      type: "select",
      options: [
        { label: "아동용 아님", value: "not_made_for_kids" },
        { label: "아동용", value: "made_for_kids" }
      ]
    },
    {
      id: "youtubeOAuthClientId",
      label: "OAuth Client ID",
      type: "text",
      placeholder: "1234567890-xxxx.apps.googleusercontent.com"
    },
    {
      id: "youtubeOAuthClientSecret",
      label: "OAuth Client Secret",
      type: "secret",
      placeholder: "GOCSPX-..."
    },
    {
      id: "youtubeOAuthRedirectPort",
      label: "리디렉션 포트",
      type: "text",
      placeholder: "45123"
    },
    {
      id: "youtubePublishMode",
      label: "게시 방식",
      type: "select",
      options: [
        { label: "지금 업로드", value: "now" },
        { label: "예약 업로드", value: "scheduled" }
      ]
    },
    {
      id: "youtubeScheduledPublishAt",
      label: "예약 게시 시각",
      type: "datetime-local",
      showWhen: { fieldId: "youtubePublishMode", equals: "scheduled" }
    }
  ],
  actions: [
    { id: "chooseVideoFile", label: "영상 파일 선택", tone: "secondary" },
    { id: "chooseThumbnailFile", label: "썸네일 선택", tone: "secondary" }
  ],
  statuses: [
    { id: "youtubeState", label: "유튜브 연결 상태" },
    { id: "selectedVideoFile", label: "선택된 영상" },
    { id: "selectedThumbnailFile", label: "선택된 썸네일" },
    { id: "uploadRequestStatus", label: "업로드 요청" },
    { id: "latestPackage", label: "최근 패키지" },
    { id: "lastUpload", label: "최근 업로드" }
  ]
} as const;

const INSTAGRAM_SECTION = {
  id: "instagram",
  eyebrow: "인스타그램",
  title: "전송과 게시",
  description:
    "인스타그램 전송은 다음 게시 커넥터로 준비 중입니다. 현재 워크플로는 이 자리만 먼저 예약해 둔 상태입니다.",
  statuses: [
    { id: "instagramState", label: "인스타그램" },
    { id: "latestPackage", label: "최근 패키지" }
  ]
} as const;

export const SHORTFORM_TELEGRAM_YOUTUBE_SCHEMA: WorkflowUISchema = {
  id: "shortform-telegram-youtube",
  title: "텔레그램 → 유튜브",
  description:
    "텔레그램에서 트렌드 수집과 검토를 진행하고, 패키지를 만들어 유튜브까지 바로 게시합니다.",
  sections: [DISCOVERY_BASELINE_SECTION, YOUTUBE_SECTION]
};

export const SHORTFORM_TELEGRAM_INSTAGRAM_SCHEMA: WorkflowUISchema = {
  id: "shortform-telegram-instagram",
  title: "텔레그램 → 인스타그램",
  description:
    "텔레그램에서 트렌드 수집과 검토를 진행하고, 인스타그램 전송용 패키지를 준비합니다.",
  sections: [DISCOVERY_BASELINE_SECTION, INSTAGRAM_SECTION]
};

export const SHORTFORM_WORKFLOW_SCHEMA: WorkflowUISchema = {
  id: "shortform-automation-stack",
  title: "숏폼 자동화 스택",
  description:
    "텔레그램, 생성 엔진, 채널 게시 설정을 이곳에서 관리해 자동화별 설정이 전역 앱 설정과 섞이지 않도록 정리합니다.",
  sections: [DISCOVERY_BASELINE_SECTION, YOUTUBE_SECTION]
};
