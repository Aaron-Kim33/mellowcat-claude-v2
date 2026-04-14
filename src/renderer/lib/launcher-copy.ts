export type LauncherLanguage = "en" | "ko";

type LauncherCopy = {
  shell: {
    eyebrow: string;
    title: string;
    subtitle: string;
    workspaceLabel: string;
    accountLabel: string;
    tabs: {
      launcher: string;
      generation: string;
      store: string;
      installed: string;
      settings: string;
      login: string;
      about: string;
    };
  };
  pages: {
    launcher: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    generation: {
      eyebrow: string;
      title: string;
      subtitle: string;
      packagePath: string;
      noPackage: string;
      emptyState: string;
      sceneList: string;
      sceneLabel: string;
      selectScene: string;
      text: string;
      fluxPrompt: string;
      assetSearchQuery: string;
      motion: string;
      durationSec: string;
      reload: string;
      save: string;
      saving: string;
      saved: string;
      saveError: string;
      subtitleStyleTitle: string;
      subtitleMode: string;
      fontFamily: string;
      fontSize: string;
      outline: string;
      textColor: string;
      outlineColor: string;
      voiceProfileTitle: string;
      voiceProvider: string;
      voiceModelId: string;
      voiceId: string;
      stability: string;
      similarityBoost: string;
      voiceStyle: string;
      useSpeakerBoost: string;
      presetTitle: string;
      presetSubtitle: string;
      presetEmpty: string;
    };
    store: {
      eyebrow: string;
      title: string;
      subtitle: string;
      installed: string;
      running: string;
      search: string;
      searchPlaceholder: string;
    };
    installed: {
      eyebrow: string;
      title: string;
      subtitle: string;
      version: string;
      enabled: string;
      installPath: string;
      entrypoint: string;
      remove: string;
      disable: string;
      enable: string;
      logsTitle: string;
      noLogs: (id: string) => string;
      selectLogs: string;
    };
    settings: {
      eyebrow: string;
      title: string;
      subtitle: string;
      launcherLanguage: string;
      english: string;
      korean: string;
      saveSettings: string;
      saved: string;
      detectClaude: string;
      installClaudeCode: string;
      syncTelegram: string;
      sendTestTrendShortlist: string;
      realFlowHint: string;
    };
    account: {
      eyebrow: string;
      title: string;
      subtitle: string;
      status: string;
      loggedIn: string;
      loggedOut: string;
      user: string;
      guest: string;
      login: string;
      logout: string;
    };
    about: {
      eyebrow: string;
      title: string;
      subtitle: string;
      appVersion: string;
    };
  };
};

const copy: Record<LauncherLanguage, LauncherCopy> = {
  en: {
    shell: {
      eyebrow: "MellowCat",
      title: "Launcher",
      subtitle: "A compact desktop workspace for Claude, MCP automation, account access, and delivery flows.",
      workspaceLabel: "Workspace",
      accountLabel: "Account",
      tabs: {
        launcher: "Home",
        generation: "Create",
        store: "Marketplace",
        installed: "Installed",
        settings: "Settings",
        login: "Account",
        about: "About"
      }
    },
    pages: {
      launcher: {
        eyebrow: "Home",
        title: "Automation workspace",
        subtitle: "Check Claude status, MCP readiness, and launch controls in one compact view."
      },
      generation: {
        eyebrow: "Create",
        title: "Scene script editor",
        subtitle: "Edit scene text, Flux prompts, motion, and duration before expensive generation.",
        packagePath: "Package path",
        noPackage: "No active package",
        emptyState: "No scene script available yet. Run slot 3 create first.",
        sceneList: "Scenes",
        sceneLabel: "Scene",
        selectScene: "Select a scene to edit.",
        text: "Narration text",
        fluxPrompt: "Flux prompt",
        assetSearchQuery: "Asset search query",
        motion: "Motion",
        durationSec: "Duration (sec)",
        reload: "Reload",
        save: "Save",
        saving: "Saving...",
        saved: "Scene script saved.",
        saveError: "Failed to save scene script.",
        subtitleStyleTitle: "Subtitle style",
        subtitleMode: "Mode",
        fontFamily: "Font family",
        fontSize: "Font size",
        outline: "Outline",
        textColor: "Text color",
        outlineColor: "Outline color",
        voiceProfileTitle: "Voice profile",
        voiceProvider: "Provider",
        voiceModelId: "Model ID",
        voiceId: "Voice ID",
        stability: "Stability",
        similarityBoost: "Similarity boost",
        voiceStyle: "Style",
        useSpeakerBoost: "Use speaker boost",
        presetTitle: "Genre presets",
        presetSubtitle: "Preset buttons are loaded from the selected MCP module metadata.",
        presetEmpty: "No presets are declared for the selected module."
      },
      store: {
        eyebrow: "Marketplace",
        title: "Workflow catalog",
        subtitle: "Browse built-in and paid workflow modules without leaving the launcher.",
        installed: "installed",
        running: "running",
        search: "Search",
        searchPlaceholder: "Search by name, summary, or tag"
      },
      installed: {
        eyebrow: "Installed",
        title: "Installed workflows",
        subtitle: "See local modules, workflow settings, and runtime logs in one place.",
        version: "Version",
        enabled: "Enabled",
        installPath: "Install path",
        entrypoint: "Entrypoint",
        remove: "Remove",
        disable: "Disable",
        enable: "Enable",
        logsTitle: "Runtime logs",
        noLogs: (id) => `No logs yet for ${id}.`,
        selectLogs: "Select a module to inspect its runtime log."
      },
      settings: {
        eyebrow: "Settings",
        title: "Launcher defaults",
        subtitle: "Adjust app-wide paths, API targets, and basic launcher preferences.",
        launcherLanguage: "Launcher language",
        english: "English",
        korean: "Korean",
        saveSettings: "Save changes",
        saved: "Saved",
        detectClaude: "Detect Claude",
        installClaudeCode: "Install Claude Code",
        syncTelegram: "Sync Telegram",
        sendTestTrendShortlist: "Send test shortlist",
        realFlowHint: "Production operations still happen in Telegram. The button above is only for testing."
      },
      account: {
        eyebrow: "Account",
        title: "Identity and access",
        subtitle: "Review your sign-in status, linked providers, and purchased workflow access.",
        status: "Status",
        loggedIn: "Logged in",
        loggedOut: "Logged out",
        user: "User",
        guest: "Guest",
        login: "Sign in",
        logout: "Log out"
      },
      about: {
        eyebrow: "About",
        title: "MellowCat Launcher",
        subtitle: "A desktop launcher for Claude Code, MCP automation, and publishing workflows.",
        appVersion: "App version"
      }
    }
  },
  ko: {
    shell: {
      eyebrow: "MellowCat",
      title: "런처",
      subtitle: "Claude, MCP 자동화, 계정, 배포 흐름을 한곳에서 다루는 콤팩트한 작업 공간입니다.",
      workspaceLabel: "작업 공간",
      accountLabel: "계정",
      tabs: {
        launcher: "홈",
        generation: "생성",
        store: "마켓",
        installed: "설치됨",
        settings: "설정",
        login: "계정",
        about: "정보"
      }
    },
    pages: {
      launcher: {
        eyebrow: "홈",
        title: "자동화 작업 공간",
        subtitle: "Claude 상태, MCP 준비 상태, 실행 제어를 한 화면에서 차분하게 확인합니다."
      },
      generation: {
        eyebrow: "생성",
        title: "씬 스크립트 에디터",
        subtitle: "비용이 드는 생성 전에 씬 문장, Flux 프롬프트, 모션, 길이를 수정합니다.",
        packagePath: "패키지 경로",
        noPackage: "활성 패키지가 없습니다",
        emptyState: "scene-script.json이 없습니다. 3번 생성을 먼저 실행해 주세요.",
        sceneList: "씬 목록",
        sceneLabel: "씬",
        selectScene: "수정할 씬을 선택해 주세요.",
        text: "내레이션 문장",
        fluxPrompt: "Flux 프롬프트",
        assetSearchQuery: "소재 검색 키워드",
        motion: "모션",
        durationSec: "길이(초)",
        reload: "다시 불러오기",
        save: "저장",
        saving: "저장 중...",
        saved: "scene-script.json을 저장했습니다.",
        saveError: "scene-script.json 저장에 실패했습니다.",
        subtitleStyleTitle: "자막 스타일",
        subtitleMode: "모드",
        fontFamily: "폰트",
        fontSize: "폰트 크기",
        outline: "외곽선",
        textColor: "글자 색상",
        outlineColor: "외곽선 색상",
        voiceProfileTitle: "보이스 프로필",
        voiceProvider: "제공자",
        voiceModelId: "모델 ID",
        voiceId: "보이스 ID",
        stability: "Stability",
        similarityBoost: "Similarity Boost",
        voiceStyle: "Style",
        useSpeakerBoost: "스피커 부스트 사용",
        presetTitle: "장르 프리셋",
        presetSubtitle: "선택한 MCP 모듈 메타데이터에서 프리셋을 불러옵니다.",
        presetEmpty: "선택한 모듈에 선언된 프리셋이 없습니다."
      },
      store: {
        eyebrow: "마켓",
        title: "워크플로 카탈로그",
        subtitle: "기본 제공 모듈과 유료 워크플로 모듈을 런처 안에서 바로 둘러보고 설치합니다.",
        installed: "설치됨",
        running: "실행 중",
        search: "검색",
        searchPlaceholder: "이름, 요약, 태그로 검색"
      },
      installed: {
        eyebrow: "설치됨",
        title: "설치된 워크플로",
        subtitle: "로컬 모듈, 워크플로 설정, 실행 로그를 한곳에서 관리합니다.",
        version: "버전",
        enabled: "활성화",
        installPath: "설치 경로",
        entrypoint: "진입 파일",
        remove: "삭제",
        disable: "비활성화",
        enable: "활성화",
        logsTitle: "실행 로그",
        noLogs: (id) => `${id}의 로그가 아직 없습니다.`,
        selectLogs: "모듈을 선택하면 실행 로그를 확인할 수 있습니다."
      },
      settings: {
        eyebrow: "설정",
        title: "런처 기본 설정",
        subtitle: "앱 전체에서 공통으로 사용하는 경로, API 대상, 기본 옵션을 정리합니다.",
        launcherLanguage: "런처 언어",
        english: "영어",
        korean: "한국어",
        saveSettings: "변경 저장",
        saved: "저장됨",
        detectClaude: "Claude 찾기",
        installClaudeCode: "Claude Code 설치",
        syncTelegram: "텔레그램 동기화",
        sendTestTrendShortlist: "테스트 후보 보내기",
        realFlowHint: "실운영 흐름은 텔레그램에서 진행하고, 위 버튼은 테스트용으로만 사용하세요."
      },
      account: {
        eyebrow: "계정",
        title: "계정과 접근 상태",
        subtitle: "로그인 상태, 연결된 로그인 방식, 구매한 접근 권한을 한곳에서 확인합니다.",
        status: "상태",
        loggedIn: "로그인됨",
        loggedOut: "로그아웃됨",
        user: "사용자",
        guest: "게스트",
        login: "로그인",
        logout: "로그아웃"
      },
      about: {
        eyebrow: "정보",
        title: "MellowCat Launcher",
        subtitle: "Claude Code, MCP 자동화, 배포 워크플로를 위한 데스크톱 런처입니다.",
        appVersion: "앱 버전"
      }
    }
  }
};

export function getLauncherCopy(language?: LauncherLanguage): LauncherCopy {
  return copy[language ?? "en"];
}
