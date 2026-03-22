export type LauncherLanguage = "en" | "ko";

type LauncherCopy = {
  shell: {
    eyebrow: string;
    title: string;
    subtitle: string;
    tabs: {
      launcher: string;
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
      title: "Claude Control Room",
      subtitle: "Launch Claude, install MCPs, and grow into a real storefront later.",
      tabs: {
        launcher: "Launcher",
        store: "Store",
        installed: "Installed",
        settings: "Settings",
        login: "Account",
        about: "About"
      }
    },
    pages: {
      launcher: {
        eyebrow: "Launcher",
        title: "Claude session control",
        subtitle: "Start a local Claude session, stream its output, and prepare to wire in the real engine."
      },
      store: {
        eyebrow: "Store",
        title: "Free-first MCP catalog",
        subtitle: "This page is structured for future paid entitlement checks, but stays frictionless for free distribution today.",
        installed: "installed",
        running: "running",
        search: "Search",
        searchPlaceholder: "Search MCPs by name, summary, or tag"
      },
      installed: {
        eyebrow: "Installed",
        title: "Local MCP registry",
        subtitle: "Installed MCPs are tracked locally so the app can later sync account entitlements without changing the core model.",
        version: "Version",
        enabled: "Enabled",
        installPath: "Install Path",
        entrypoint: "Entrypoint",
        remove: "Remove",
        disable: "Disable",
        enable: "Enable",
        logsTitle: "MCP Logs",
        noLogs: (id) => `No logs yet for ${id}.`,
        selectLogs: "Select an installed MCP to inspect its runtime logs."
      },
      settings: {
        eyebrow: "Settings",
        title: "Launcher defaults",
        subtitle: "Settings are stored through a repository layer so this can move from local JSON to a richer storage system later.",
        launcherLanguage: "Launcher Language",
        english: "English",
        korean: "Korean",
        saveSettings: "Save Settings",
        saved: "Saved",
        detectClaude: "Detect Claude",
        installClaudeCode: "Install Claude Code",
        syncTelegram: "Sync Telegram",
        sendTestTrendShortlist: "Send Test Trend Shortlist",
        realFlowHint: "Real operator flow should happen in Telegram with /shortlist, /status, and /help. The button above is only for testing."
      },
      account: {
        eyebrow: "Account",
        title: "Future-proof auth entry",
        subtitle: "The UI stays optional for now, but the service boundary is already in place for account and payment rollout later.",
        status: "Status",
        loggedIn: "Logged In",
        loggedOut: "Logged Out",
        user: "User",
        guest: "Guest",
        login: "Login",
        logout: "Logout"
      },
      about: {
        eyebrow: "About",
        title: "MellowCat Claude",
        subtitle: "Desktop launcher for Claude Code and MCP workflows.",
        appVersion: "App Version"
      }
    }
  },
  ko: {
    shell: {
      eyebrow: "MellowCat",
      title: "클로드 컨트롤 룸",
      subtitle: "Claude를 실행하고 MCP를 설치하며, 이후 실제 스토어로 확장할 수 있는 런처입니다.",
      tabs: {
        launcher: "런처",
        store: "스토어",
        installed: "설치됨",
        settings: "설정",
        login: "계정",
        about: "정보"
      }
    },
    pages: {
      launcher: {
        eyebrow: "런처",
        title: "Claude 세션 제어",
        subtitle: "로컬 Claude 세션을 시작하고 출력을 스트리밍하며, 실제 엔진 연결을 준비합니다."
      },
      store: {
        eyebrow: "스토어",
        title: "무료 우선 MCP 카탈로그",
        subtitle: "지금은 무료 배포 중심이지만, 이후 유료 권한 체크까지 확장할 수 있게 구조를 잡아둔 화면입니다.",
        installed: "설치됨",
        running: "실행 중",
        search: "검색",
        searchPlaceholder: "이름, 설명, 태그로 MCP 검색"
      },
      installed: {
        eyebrow: "설치됨",
        title: "로컬 MCP 레지스트리",
        subtitle: "설치된 MCP를 로컬에서 추적해두고, 나중에 계정 권한 동기화가 붙어도 핵심 모델을 유지할 수 있게 합니다.",
        version: "버전",
        enabled: "활성화",
        installPath: "설치 경로",
        entrypoint: "엔트리포인트",
        remove: "삭제",
        disable: "비활성화",
        enable: "활성화",
        logsTitle: "MCP 로그",
        noLogs: (id) => `${id}에 대한 로그가 아직 없습니다.`,
        selectLogs: "설치된 MCP를 선택하면 런타임 로그를 볼 수 있습니다."
      },
      settings: {
        eyebrow: "설정",
        title: "런처 기본 설정",
        subtitle: "설정은 repository 계층을 통해 저장되므로, 나중에 로컬 JSON에서 더 풍부한 저장소로 옮기기 쉽습니다.",
        launcherLanguage: "런처 언어",
        english: "영어",
        korean: "한국어",
        saveSettings: "설정 저장",
        saved: "저장됨",
        detectClaude: "Claude 찾기",
        installClaudeCode: "Claude Code 설치",
        syncTelegram: "텔레그램 동기화",
        sendTestTrendShortlist: "테스트용 트렌드 후보 보내기",
        realFlowHint: "실사용 흐름은 텔레그램의 /shortlist, /status, /help 로 진행하는 것이 맞고, 위 버튼은 테스트용입니다."
      },
      account: {
        eyebrow: "계정",
        title: "향후 확장 가능한 인증 진입점",
        subtitle: "지금은 선택 UI에 가깝지만, 이후 계정과 결제 기능을 붙일 서비스 경계는 이미 준비되어 있습니다.",
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
        title: "MellowCat Claude",
        subtitle: "Claude Code와 MCP 워크플로우를 위한 데스크톱 런처입니다.",
        appVersion: "앱 버전"
      }
    }
  }
};

export function getLauncherCopy(language?: LauncherLanguage): LauncherCopy {
  return copy[language ?? "en"];
}
