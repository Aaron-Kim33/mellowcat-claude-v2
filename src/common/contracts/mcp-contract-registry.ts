import type { MCPRuntimeContract } from "../types/mcp-contract";

export const MCP_CONTRACT_REGISTRY: Record<string, MCPRuntimeContract> = {
  "telegram-control-mcp": {
    id: "telegram-control-mcp",
    name: "Telegram Control",
    aiCapable: true,
    builtinAvailable: true,
    slot: "input",
    category: "control",
    compatibility: {
      inputs: [
        { contract: "trend_candidates_v1", required: false },
        { contract: "script_draft_v1", required: false },
        { contract: "production_package_v1", required: false }
      ],
      outputs: [
        { contract: "candidate_selection_v1", required: true },
        { contract: "revision_request_v1", required: true }
      ],
      executionModes: ["interactive", "background_worker"]
    },
    dependencies: [],
    configScopes: ["pack", "mcp"],
    slotUi: {
      input: {
        slot: "input",
        title: "텔레그램 연결 설정",
        description: "텔레그램 제어와 운영용 연결 정보를 관리합니다.",
        fields: [
          { id: "telegramBotToken", label: "텔레그램 봇 토큰", type: "secret", width: "half" },
          { id: "telegramAdminChatId", label: "관리자 채팅 ID", type: "text", width: "half" },
          {
            id: "trendDiscoveryMode",
            label: "후보 수집 모드",
            type: "select",
            width: "half",
            options: [
              { label: "스토리형 (기존)", value: "shortform_story" },
              { label: "뉴스카드형", value: "news_card" }
            ]
          },
          {
            id: "trendFocusCategory",
            label: "검색 카테고리",
            type: "select",
            width: "half",
            options: [
              { label: "전체", value: "all" },
              { label: "세계 정세", value: "world" },
              { label: "속보", value: "breaking" },
              { label: "중국", value: "china" }
            ]
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
          }
        ],
        actions: [
          { id: "save_telegram_config", label: "텔레그램 설정 저장", kind: "secondary" },
          { id: "sync_telegram", label: "텔레그램 동기화", kind: "secondary" }
        ]
      }
    }
  },
  "trend-discovery-mcp": {
    id: "trend-discovery-mcp",
    name: "Trend Discovery",
    aiCapable: false,
    builtinAvailable: true,
    slot: "input",
    category: "discovery",
    compatibility: {
      inputs: [],
      outputs: [{ contract: "trend_candidates_v1", required: true }],
      executionModes: ["scheduled", "on_demand"]
    },
    dependencies: [],
    configScopes: ["pack", "mcp"],
    slotUi: {
      input: {
        slot: "input",
        title: "트렌드 수집 설정",
        description: "자료 수집 범위와 후보 입력 방식을 정리합니다.",
        fields: [
          {
            id: "trendDiscoveryMode",
            label: "후보 수집 모드",
            type: "select",
            width: "half",
            options: [
              { label: "스토리형 (기존)", value: "shortform_story" },
              { label: "뉴스카드형", value: "news_card" }
            ]
          },
          {
            id: "trendFocusCategory",
            label: "검색 카테고리",
            type: "select",
            width: "half",
            options: [
              { label: "전체", value: "all" },
              { label: "세계 정세", value: "world" },
              { label: "속보", value: "breaking" },
              { label: "중국", value: "china" }
            ]
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
          }
        ],
        actions: [
          { id: "fetch_trend_candidates", label: "트렌드 후보 조회", kind: "primary" },
          { id: "save_checkpoint_1", label: "checkpoint-1 저장", kind: "primary" }
        ]
      }
    }
  },
  "youtube-breakout-crawler-mcp": {
    id: "youtube-breakout-crawler-mcp",
    name: "YouTube Breakout Crawler",
    aiCapable: false,
    builtinAvailable: true,
    slot: "input",
    category: "discovery",
    compatibility: {
      inputs: [],
      outputs: [{ contract: "trend_candidates_v1", required: true }],
      executionModes: ["scheduled", "on_demand"]
    },
    dependencies: [],
    configScopes: ["pack", "mcp"],
    slotUi: {
      input: {
        slot: "input",
        title: "유튜브 비율 크롤링",
        description:
          "구독자 대비 조회수 비율이 높은 영상만 걸러서 숏폼 후보로 가져옵니다.",
        fields: [
          {
            id: "youtubeCountry",
            label: "국가",
            type: "select",
            width: "half",
            options: [
              { label: "대한민국 (KR)", value: "KR" },
              { label: "미국 (US)", value: "US" },
              { label: "일본 (JP)", value: "JP" },
              { label: "영국 (GB)", value: "GB" },
              { label: "인도 (IN)", value: "IN" }
            ]
          },
          {
            id: "youtubeBreakoutPeriod",
            label: "기간",
            type: "select",
            width: "half",
            options: [
              { label: "최근 24시간", value: "24h" },
              { label: "최근 3일", value: "3d" },
              { label: "최근 7일", value: "7d" }
            ]
          },
          {
            id: "youtubeBreakoutRatioPercent",
            label: "구독자 대비 조회수 %",
            type: "text",
            width: "half",
            placeholder: "예: 120"
          },
          {
            id: "youtubeSubscriberRange",
            label: "구독자 수 구간",
            type: "select",
            width: "half",
            options: [
              { label: "전체", value: "all" },
              { label: "0 ~ 1만", value: "0_10k" },
              { label: "1만 ~ 5만", value: "10k_50k" },
              { label: "5만 ~ 10만", value: "50k_100k" },
              { label: "10만 ~ 20만", value: "100k_200k" },
              { label: "20만 ~ 30만", value: "200k_300k" },
              { label: "30만 ~ 50만", value: "300k_500k" },
              { label: "50만+", value: "500k_plus" }
            ]
          },
          {
            id: "youtubeCategoryId",
            label: "카테고리",
            type: "select",
            width: "half",
            options: [
              { label: "전체", value: "all" },
              { label: "엔터테인먼트", value: "24" },
              { label: "사람/블로그", value: "22" },
              { label: "뉴스/정치", value: "25" },
              { label: "코미디", value: "23" },
              { label: "게임", value: "20" },
              { label: "음악", value: "10" }
            ]
          },
          {
            id: "youtubeBreakoutLimit",
            label: "결과 개수",
            type: "select",
            width: "half",
            options: [
              { label: "10", value: "10" },
              { label: "20", value: "20" },
              { label: "30", value: "30" },
              { label: "50", value: "50" }
            ]
          },
          {
            id: "youtubeDataApiKey",
            label: "YouTube Data API Key",
            type: "secret",
            width: "half",
            placeholder: "AIza..."
          }
        ],
        actions: [
          { id: "fetch_youtube_breakouts", label: "유튜브 후보 조회", kind: "primary" },
          { id: "save_checkpoint_1", label: "checkpoint-1 저장", kind: "secondary" }
        ]
      }
    }
  },
  "shortform-script-mcp": {
    id: "shortform-script-mcp",
    name: "Shortform Script",
    aiCapable: true,
    builtinAvailable: true,
    slot: "process",
    category: "generation",
    compatibility: {
      inputs: [
        { contract: "candidate_selection_v1", required: true },
        { contract: "revision_request_v1", required: false }
      ],
      outputs: [{ contract: "script_draft_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "telegram-control-mcp",
        reason: "Needs a control MCP that emits candidate selections and revision requests.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    slotUi: {
      process: {
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
          { id: "reviewNotes", label: "검토 메모", type: "textarea", width: "full" }
        ],
        actions: [{ id: "save_checkpoint_2", label: "checkpoint-2 저장", kind: "primary" }]
      }
    }
  },
  "asset-packager-mcp": {
    id: "asset-packager-mcp",
    name: "Asset Packager",
    aiCapable: false,
    builtinAvailable: true,
    slot: "create",
    category: "packaging",
    compatibility: {
      inputs: [{ contract: "script_draft_v1", required: true }],
      outputs: [{ contract: "production_package_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "shortform-script-mcp",
        reason: "Needs a script generator that emits structured shortform drafts.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    slotUi: {
      create: {
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
          { id: "publishDescription", label: "설명", type: "textarea", width: "full" },
          { id: "hashtags", label: "해시태그", type: "text", width: "full" },
          { id: "productionNotes", label: "제작 메모", type: "textarea", width: "full" }
        ],
        actions: [{ id: "save_checkpoint_3", label: "checkpoint-3 저장", kind: "primary" }]
      }
    }
  },
  "youtube-material-generator-mcp": {
    id: "youtube-material-generator-mcp",
    name: "YouTube Material Generator",
    aiCapable: true,
    builtinAvailable: true,
    slot: "create",
    category: "packaging",
    compatibility: {
      inputs: [
        { contract: "script_draft_v1", required: true },
        { contract: "scene_script_v1", required: false }
      ],
      outputs: [{ contract: "production_package_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "shortform-script-mcp",
        reason: "Needs a script draft to build a timed scene plan and media package.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    slotUi: {
      create: {
        slot: "create",
        title: "유튜브 소재 생성기",
        description:
          "스크립트를 장면 계획으로 변환하고, 검색·더빙·자막·합성으로 이어질 제작 패키지를 준비합니다.",
        fields: [
          {
            id: "assetSource",
            label: "Asset Source",
            type: "select",
            width: "half",
            options: [
              { label: "Pexels", value: "pexels" },
              { label: "Flux", value: "flux" }
            ]
          },
          {
            id: "pexelsApiKey",
            label: "Pexels API Key",
            type: "secret",
            width: "half"
          },
          {
            id: "fluxApiKey",
            label: "Flux API Key",
            type: "secret",
            width: "half"
          },
          {
            id: "fluxApiBaseUrl",
            label: "Flux API Base URL",
            type: "text",
            width: "half"
          },
          {
            id: "fluxModel",
            label: "Flux Model",
            type: "text",
            width: "half"
          },
          {
            id: "targetDurationSec",
            label: "목표 길이(초)",
            type: "text",
            width: "half"
          },
          {
            id: "minimumSceneCount",
            label: "최소 씬 수",
            type: "text",
            width: "half"
          }
        ],
        actions: [
          { id: "run_create_pipeline", label: "소재 생성 실행", kind: "primary" },
          { id: "generate_scene_plan", label: "씬 플랜 생성", kind: "secondary" },
          { id: "save_checkpoint_3", label: "checkpoint-3 저장", kind: "primary" }
        ]
      }
    }
  },
  "card-news-generator-mcp": {
    id: "card-news-generator-mcp",
    name: "Card News Generator",
    aiCapable: true,
    builtinAvailable: true,
    slot: "create",
    category: "packaging",
    compatibility: {
      inputs: [
        { contract: "script_draft_v1", required: true },
        { contract: "scene_script_v1", required: false }
      ],
      outputs: [{ contract: "production_package_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "shortform-script-mcp",
        reason: "Needs a script draft to build card-news scene packages.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    sceneStylePresets: [
      {
        id: "news_clean",
        label: "뉴스 클린",
        subtitleStyle: {
          mode: "outline",
          fontFamily: "Gmarket Sans",
          fontSize: 26,
          outline: 3,
          color: "#ffffff",
          outlineColor: "#111111"
        },
        voiceProfile: {
          provider: "elevenlabs",
          modelId: "eleven_multilingual_v2",
          stability: 0.52,
          similarityBoost: 0.74,
          style: 0.04,
          useSpeakerBoost: true
        }
      },
      {
        id: "insight_bold",
        label: "인사이트 볼드",
        subtitleStyle: {
          mode: "outline",
          fontFamily: "Gmarket Sans",
          fontSize: 28,
          outline: 4,
          color: "#ffffff",
          outlineColor: "#000000"
        },
        voiceProfile: {
          provider: "elevenlabs",
          modelId: "eleven_multilingual_v2",
          stability: 0.48,
          similarityBoost: 0.76,
          style: 0.07,
          useSpeakerBoost: true
        }
      }
    ],
    slotUi: {
      create: {
        slot: "create",
        title: "카드뉴스 생성기",
        description:
          "스크립트를 카드뉴스 장면 계획으로 변환하고, 이미지 소스·더빙·자막·합성으로 이어질 제작 패키지를 준비합니다.",
        fields: [
          {
            id: "assetSource",
            label: "Asset Source",
            type: "select",
            width: "half",
            options: [
              { label: "Pexels", value: "pexels" },
              { label: "Flux", value: "flux" }
            ]
          },
          {
            id: "pexelsApiKey",
            label: "Pexels API Key",
            type: "secret",
            width: "half"
          },
          {
            id: "fluxApiKey",
            label: "Flux API Key",
            type: "secret",
            width: "half"
          },
          {
            id: "fluxApiBaseUrl",
            label: "Flux API Base URL",
            type: "text",
            width: "half"
          },
          {
            id: "fluxModel",
            label: "Flux Model",
            type: "text",
            width: "half"
          },
          {
            id: "targetDurationSec",
            label: "목표 길이(초)",
            type: "text",
            width: "half"
          },
          {
            id: "minimumSceneCount",
            label: "최소 카드 수",
            type: "text",
            width: "half"
          },
          {
            id: "cardNewsLayoutPreset",
            label: "레이아웃 프리셋",
            type: "select",
            width: "half",
            options: [
              { label: "헤드라인 집중", value: "headline_focus" },
              { label: "좌우 분할 스토리", value: "split_story" },
              { label: "데이터 하이라이트", value: "data_highlight" }
            ]
          },
          {
            id: "cardNewsTransitionStyle",
            label: "카드 전환 스타일",
            type: "select",
            width: "half",
            options: [
              { label: "컷", value: "cut" },
              { label: "슬라이드", value: "slide" },
              { label: "페이드", value: "fade" },
              { label: "와이프", value: "wipe" }
            ]
          },
          {
            id: "cardNewsOutputFormat",
            label: "출력 포맷",
            type: "select",
            width: "half",
            options: [
              { label: "쇼츠 9:16", value: "shorts_9_16" },
              { label: "피드 4:5", value: "feed_4_5" },
              { label: "정사각 1:1", value: "square_1_1" }
            ]
          }
        ],
        actions: [
          { id: "run_create_pipeline", label: "카드뉴스 생성 실행", kind: "primary" },
          { id: "generate_scene_plan", label: "씬 플랜 생성", kind: "secondary" },
          { id: "save_checkpoint_3", label: "checkpoint-3 저장", kind: "primary" }
        ]
      }
    }
  },
  "video-production-mcp": {
    id: "video-production-mcp",
    name: "Video Production",
    aiCapable: true,
    builtinAvailable: true,
    slot: "create",
    category: "packaging",
    compatibility: {
      inputs: [
        { contract: "script_draft_v1", required: true },
        { contract: "scene_script_v1", required: false }
      ],
      outputs: [{ contract: "production_package_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "shortform-script-mcp",
        reason: "Needs a script draft to build production-ready media packages.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    slotUi: {
      create: {
        slot: "create",
        title: "Video Production",
        description:
          "Transforms a script into scene plan, asset search, dubbing, subtitles, and final composition.",
        fields: [
          {
            id: "assetSource",
            label: "Asset Source",
            type: "select",
            width: "half",
            options: [
              { label: "Pexels", value: "pexels" },
              { label: "Flux", value: "flux" }
            ]
          },
          {
            id: "pexelsApiKey",
            label: "Pexels API Key",
            type: "secret",
            width: "half"
          },
          {
            id: "fluxApiKey",
            label: "Flux API Key",
            type: "secret",
            width: "half"
          },
          {
            id: "fluxApiBaseUrl",
            label: "Flux API Base URL",
            type: "text",
            width: "half"
          },
          {
            id: "fluxModel",
            label: "Flux Model",
            type: "text",
            width: "half"
          },
          {
            id: "videoSubtitleMode",
            label: "Subtitle Output",
            type: "select",
            width: "half",
            options: [
              { label: "Hard burn-in", value: "hard" },
              { label: "Soft subtitle track", value: "soft" }
            ]
          },
          {
            id: "videoRenderQuality",
            label: "Render Quality",
            type: "select",
            width: "half",
            options: [
              { label: "High 1080p", value: "high" },
              { label: "Standard", value: "standard" }
            ]
          },
          {
            id: "targetDurationSec",
            label: "Target Duration (sec)",
            type: "text",
            width: "half"
          },
          {
            id: "minimumSceneCount",
            label: "Minimum Scenes",
            type: "text",
            width: "half"
          },
          {
            id: "rerenderSceneIndexes",
            label: "Re-render Scenes (e.g. 1,3)",
            type: "text",
            width: "full"
          }
        ],
        actions: [
          { id: "run_create_pipeline", label: "Run Production", kind: "primary" },
          { id: "rerender_create_composition", label: "Re-render Final Video", kind: "secondary" },
          { id: "rerender_selected_scenes", label: "Re-render Selected Scenes", kind: "secondary" },
          { id: "refresh_create_assets", label: "Refresh Selected Assets", kind: "secondary" },
          { id: "refresh_create_voiceover", label: "Refresh Voiceover", kind: "secondary" },
          { id: "refresh_create_subtitles", label: "Refresh Subtitles", kind: "secondary" },
          { id: "generate_scene_plan", label: "Generate Scene Plan", kind: "secondary" },
          { id: "save_checkpoint_3", label: "Save checkpoint-3", kind: "primary" }
        ]
      }
    }
  },
  "background-subtitle-composer-mcp": {
    id: "background-subtitle-composer-mcp",
    name: "Background Subtitle Composer",
    aiCapable: true,
    builtinAvailable: true,
    slot: "create",
    category: "packaging",
    compatibility: {
      inputs: [
        { contract: "script_draft_v1", required: true },
        { contract: "scene_script_v1", required: false }
      ],
      outputs: [{ contract: "production_package_v1", required: true }],
      executionModes: ["on_demand"]
    },
    dependencies: [
      {
        mcpId: "shortform-script-mcp",
        reason: "Needs a script draft to build a subtitle-driven background composition package.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    sceneStylePresets: [
      {
        id: "horror",
        label: "무서운 썰",
        subtitleStyle: {
          mode: "outline",
          fontFamily: "Gmarket Sans",
          fontSize: 29,
          outline: 5,
          color: "#ffffff",
          outlineColor: "#000000"
        },
        voiceProfile: {
          provider: "elevenlabs",
          modelId: "eleven_multilingual_v2",
          stability: 0.38,
          similarityBoost: 0.8,
          style: 0.12,
          useSpeakerBoost: true
        }
      },
      {
        id: "romance",
        label: "연애썰",
        subtitleStyle: {
          mode: "outline",
          fontFamily: "Gmarket Sans",
          fontSize: 28,
          outline: 4,
          color: "#ffffff",
          outlineColor: "#1f1f1f"
        },
        voiceProfile: {
          provider: "elevenlabs",
          modelId: "eleven_multilingual_v2",
          stability: 0.5,
          similarityBoost: 0.75,
          style: 0.08,
          useSpeakerBoost: true
        }
      },
      {
        id: "community",
        label: "커뮤/실화",
        subtitleStyle: {
          mode: "outline",
          fontFamily: "Gmarket Sans",
          fontSize: 27,
          outline: 4,
          color: "#ffffff",
          outlineColor: "#000000"
        },
        voiceProfile: {
          provider: "elevenlabs",
          modelId: "eleven_multilingual_v2",
          stability: 0.56,
          similarityBoost: 0.72,
          style: 0.05,
          useSpeakerBoost: true
        }
      }
    ],
    slotUi: {
      create: {
        slot: "create",
        title: "배경 자막 합성기",
        description:
          "미리 준비한 배경 영상이나 이미지를 반복 사용하고, 자막을 하드코딩한 썰형 숏폼 패키지를 만듭니다.",
          fields: [
            {
              id: "backgroundSourceType",
              label: "배경 소스",
              type: "select",
              width: "half",
              options: [
                { label: "기본 배경 사용", value: "preset" },
                { label: "직접 파일 선택", value: "custom" }
              ]
            },
            {
              id: "backgroundMediaPath",
              label: "배경 파일 경로",
              type: "text",
              required: false,
              width: "full"
            },
          {
            id: "targetDurationSec",
            label: "목표 길이(초)",
            type: "text",
            width: "half"
          },
          {
            id: "minimumSceneCount",
            label: "최소 씬 수",
            type: "text",
            width: "half"
          },
          {
            id: "subtitleTheme",
            label: "자막 스타일",
            type: "select",
            width: "half",
            options: [
              { label: "스토리 볼드", value: "story_bold" },
              { label: "클린 다크", value: "clean_dark" },
              { label: "클린 라이트", value: "clean_light" }
            ]
          }
        ],
        actions: [
          { id: "run_create_pipeline", label: "소재 생성 실행", kind: "primary" },
          { id: "generate_scene_plan", label: "씬 플랜 생성", kind: "secondary" },
          { id: "save_checkpoint_3", label: "checkpoint-3 저장", kind: "primary" }
        ]
      }
    }
  },
  "youtube-publish-mcp": {
    id: "youtube-publish-mcp",
    name: "YouTube Publisher",
    aiCapable: false,
    builtinAvailable: true,
    slot: "output",
    category: "delivery",
    compatibility: {
      inputs: [
        { contract: "production_package_v1", required: true },
        { contract: "publish_request_v1", required: false }
      ],
      outputs: [{ contract: "publish_result_v1", required: true }],
      executionModes: ["on_demand", "scheduled"]
    },
    dependencies: [
      {
        mcpId: "asset-packager-mcp",
        reason: "Needs a packaging MCP that produces production-package outputs.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    slotUi: {
      output: {
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
      }
    }
  },
  "instagram-publish-mcp": {
    id: "instagram-publish-mcp",
    name: "Instagram Publisher",
    aiCapable: false,
    slot: "output",
    category: "delivery",
    compatibility: {
      inputs: [
        { contract: "production_package_v1", required: true },
        { contract: "publish_request_v1", required: false }
      ],
      outputs: [{ contract: "publish_result_v1", required: true }],
      executionModes: ["on_demand", "scheduled"]
    },
    dependencies: [
      {
        mcpId: "asset-packager-mcp",
        reason: "Needs a packaging MCP that produces production-package outputs.",
        required: true
      }
    ],
    configScopes: ["pack", "mcp"],
    slotUi: {
      output: {
        slot: "output",
        title: "인스타그램 연결과 업로드",
        description: "배포 슬롯에서 인스타그램 릴스용 연결 상태와 mock 업로드 흐름을 확인합니다.",
        fields: [
          {
            id: "instagramAccountHandle",
            label: "인스타그램 계정",
            type: "text",
            required: true,
            placeholder: "@mellowcat",
            width: "full"
          },
          {
            id: "instagramAccessToken",
            label: "Instagram Access Token",
            type: "secret",
            required: true,
            placeholder: "IGQVJ...",
            width: "full"
          }
        ],
        actions: [
          { id: "save_instagram_config", label: "인스타그램 설정 저장", kind: "secondary" },
          { id: "refresh_instagram_status", label: "인스타그램 상태 새로고침", kind: "secondary" },
          { id: "connect_instagram", label: "인스타그램 연결", kind: "primary" },
          { id: "disconnect_instagram", label: "연결 해제", kind: "danger" },
          { id: "upload_instagram_mock", label: "인스타그램 mock 업로드", kind: "primary" }
        ]
      }
    }
  }
};

export function getMcpRuntimeContract(mcpId: string): MCPRuntimeContract | undefined {
  return MCP_CONTRACT_REGISTRY[mcpId];
}

export function listMcpRuntimeContracts(): MCPRuntimeContract[] {
  return Object.values(MCP_CONTRACT_REGISTRY);
}
