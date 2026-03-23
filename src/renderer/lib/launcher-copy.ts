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
      title: "Automation Hub",
      subtitle: "Build channel-based automations with modular MCPs and packs.",
      tabs: {
        launcher: "Console",
        store: "Marketplace",
        installed: "Workflows",
        settings: "App",
        login: "Account",
        about: "About"
      }
    },
    pages: {
      launcher: {
        eyebrow: "Console",
        title: "Claude session control",
        subtitle: "Run Claude, monitor automations, and keep channel workflows moving."
      },
      store: {
        eyebrow: "Marketplace",
        title: "Channel-ready MCP catalog",
        subtitle: "Browse modular workflow pieces and packs by platform so users can buy only what they need.",
        installed: "installed",
        running: "running",
        search: "Search",
        searchPlaceholder: "Search MCPs by name, summary, or tag"
      },
      installed: {
        eyebrow: "Workflows",
        title: "Installed workflow pieces",
        subtitle: "Manage installed MCPs and workflow config in the same place so packs feel cohesive instead of scattered.",
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
        eyebrow: "App",
        title: "Global app defaults",
        subtitle: "Keep launcher-wide settings here and push workflow-specific configuration down into installed packs.",
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
        subtitle: "Keep the account boundary lightweight now, then grow into payments and ownership later.",
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
        subtitle: "Desktop launcher for Claude Code and modular MCP workflows.",
        appVersion: "App Version"
      }
    }
  },
  ko: {
    shell: {
      eyebrow: "MellowCat",
      title: "오토메이션 허브",
      subtitle: "MCP와 Pack을 조합해 채널별 자동화를 구성하는 런처입니다.",
      tabs: {
        launcher: "콘솔",
        store: "마켓",
        installed: "워크플로",
        settings: "앱 설정",
        login: "계정",
        about: "정보"
      }
    },
    pages: {
      launcher: {
        eyebrow: "콘솔",
        title: "Claude 세션 제어",
        subtitle: "Claude를 실행하고 자동화 상태를 보면서 채널 운영 흐름을 이어갑니다."
      },
      store: {
        eyebrow: "마켓",
        title: "채널 중심 MCP 카탈로그",
        subtitle: "플랫폼별로 MCP와 Pack을 나눠서 필요한 자동화 조각만 골라 쓸 수 있게 구성합니다.",
        installed: "설치됨",
        running: "실행 중",
        search: "검색",
        searchPlaceholder: "이름, 설명, 태그로 MCP 검색"
      },
      installed: {
        eyebrow: "워크플로",
        title: "설치된 워크플로 조각",
        subtitle: "설치된 MCP와 워크플로 설정을 한곳에서 관리해 Pack이 흩어지지 않게 정리합니다.",
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
        eyebrow: "앱 설정",
        title: "전역 앱 기본값",
        subtitle: "런처 전체 설정만 여기서 관리하고, 워크플로 설정은 설치된 Pack 쪽으로 내립니다.",
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
        subtitle: "지금은 가볍게 두고, 이후 결제와 소유권 개념으로 확장할 수 있게 준비합니다.",
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
        subtitle: "Claude Code와 모듈형 MCP 워크플로를 위한 데스크톱 런처입니다.",
        appVersion: "앱 버전"
      }
    }
  }
};

export function getLauncherCopy(language?: LauncherLanguage): LauncherCopy {
  return copy[language ?? "en"];
}
