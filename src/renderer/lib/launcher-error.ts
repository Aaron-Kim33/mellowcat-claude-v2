type ErrorContext =
  | "auth"
  | "oauth"
  | "payment"
  | "install"
  | "update"
  | "network"
  | "generic";

interface ParsedApiError {
  status?: number;
  code?: string;
  message?: string;
}

function parseApiError(input: string): ParsedApiError {
  const statusMatch = input.match(/API request failed:\s*(\d{3})/i);
  const jsonStart = input.indexOf("{");
  let parsed: ParsedApiError = {
    status: statusMatch ? Number(statusMatch[1]) : undefined
  };

  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(input.slice(jsonStart)) as {
        code?: string;
        message?: string;
      };
      parsed = {
        ...parsed,
        code: body.code,
        message: body.message
      };
    } catch {
      return parsed;
    }
  }

  return parsed;
}

function isNetworkFailure(input: string): boolean {
  return /failed to fetch|fetch failed|network|load failed|ECONNREFUSED|ENOTFOUND|timed out|Application failed to respond/i.test(
    input
  );
}

function defaultMessage(context: ErrorContext, isKorean: boolean): string {
  const defaults: Record<ErrorContext, string> = isKorean
    ? {
        auth: "로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        oauth: "외부 로그인 연결을 마치지 못했습니다. 다시 시도해 주세요.",
        payment: "결제를 진행하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        install: "설치 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        update: "업데이트 확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        network: "서버에 연결하지 못했습니다. 네트워크 상태와 API 주소를 확인해 주세요.",
        generic: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    : {
        auth: "We could not complete sign-in. Please try again in a moment.",
        oauth: "External sign-in could not be completed. Please try again.",
        payment: "Checkout could not be completed. Please try again in a moment.",
        install: "Installation failed. Please try again in a moment.",
        update: "Update check failed. Please try again in a moment.",
        network: "We could not reach the server. Check your network and API URL.",
        generic: "We could not complete this request. Please try again."
      };

  return defaults[context];
}

function codeMessage(code: string, context: ErrorContext, isKorean: boolean): string | undefined {
  const messages: Record<string, { ko: string; en: string }> = {
    UNAUTHENTICATED: {
      ko: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
      en: "Your session expired. Please sign in again."
    },
    REQUEST_EXPIRED: {
      ko: "브라우저 로그인 요청이 만료되었습니다. 런처에서 다시 시작해 주세요.",
      en: "The browser sign-in request expired. Start again from the launcher."
    },
    REQUEST_NOT_FOUND: {
      ko: "브라우저 로그인 요청을 찾을 수 없습니다. 다시 시도해 주세요.",
      en: "The browser sign-in request could not be found. Please try again."
    },
    HANDOFF_EXPIRED: {
      ko: "결제 링크가 만료되었습니다. 런처에서 다시 결제를 시작해 주세요.",
      en: "This checkout link expired. Start checkout again from the launcher."
    },
    HANDOFF_INVALID: {
      ko: "유효하지 않은 결제 링크입니다. 런처에서 다시 열어 주세요.",
      en: "This checkout link is invalid. Open checkout again from the launcher."
    },
    ALREADY_OWNED: {
      ko: "이미 보유한 상품입니다. 라이브러리에서 바로 설치할 수 있어요.",
      en: "You already own this product. Install it from your library."
    },
    NOT_ENTITLED: {
      ko: "이 상품에 대한 권한이 아직 없습니다. 구매 상태를 먼저 확인해 주세요.",
      en: "You do not have access to this product yet. Check your purchase status first."
    },
    PRODUCT_NOT_FOUND: {
      ko: "이 상품을 찾을 수 없습니다. 카탈로그를 새로고침해 주세요.",
      en: "This product could not be found. Refresh the catalog and try again."
    },
    EMAIL_EXISTS: {
      ko: "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.",
      en: "That email is already registered. Sign in or reset your password."
    },
    WEAK_PASSWORD: {
      ko: "비밀번호는 8자 이상으로 입력해 주세요.",
      en: "Password must be at least 8 characters long."
    },
    INVALID_PASSWORD: {
      ko: "비밀번호가 올바르지 않습니다. 다시 확인해 주세요.",
      en: "That password is incorrect. Please try again."
    },
    INVALID_CREDENTIALS: {
      ko: "이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해 주세요.",
      en: "The email or password is incorrect. Please try again."
    },
    USER_NOT_FOUND: {
      ko: "계정을 찾을 수 없습니다. 이메일을 다시 확인해 주세요.",
      en: "We could not find that account. Check the email and try again."
    },
    RESET_NOT_FOUND: {
      ko: "비밀번호 재설정 링크를 찾을 수 없습니다. 새 링크를 다시 받아 주세요.",
      en: "This reset link could not be found. Request a new reset email."
    },
    RESET_USED: {
      ko: "이미 사용한 재설정 링크입니다. 새 링크를 다시 받아 주세요.",
      en: "This reset link was already used. Request a new reset email."
    },
    RESET_EXPIRED: {
      ko: "비밀번호 재설정 링크가 만료되었습니다. 새 링크를 다시 받아 주세요.",
      en: "This reset link expired. Request a new reset email."
    },
    VERIFY_NOT_FOUND: {
      ko: "이메일 인증 링크를 찾을 수 없습니다. 다시 받아 주세요.",
      en: "This verification link could not be found. Request a new one."
    },
    VERIFY_USED: {
      ko: "이미 사용한 인증 링크입니다. 필요하면 다시 인증 메일을 보내 주세요.",
      en: "This verification link was already used. Send a new verification email if needed."
    },
    VERIFY_EXPIRED: {
      ko: "이메일 인증 링크가 만료되었습니다. 인증 메일을 다시 보내 주세요.",
      en: "This verification link expired. Send a new verification email."
    },
    OAUTH_NOT_CONFIGURED: {
      ko: "외부 로그인 설정이 아직 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      en: "External sign-in is not configured yet. Please try again later."
    },
    RATE_LIMITED: {
      ko: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      en: "Too many requests. Please wait a moment and try again."
    },
    BRUTE_FORCE_PROTECTION: {
      ko: "로그인 시도가 너무 많아 잠시 차단되었습니다. 잠시 후 다시 시도해 주세요.",
      en: "Too many sign-in attempts were blocked. Please try again later."
    },
    BAD_REQUEST: {
      ko:
        context === "payment"
          ? "결제 요청 정보가 올바르지 않습니다. 런처에서 다시 시도해 주세요."
          : "입력한 정보가 올바르지 않습니다. 다시 확인해 주세요.",
      en:
        context === "payment"
          ? "The checkout request was invalid. Please start again from the launcher."
          : "Some of the provided information is invalid. Please review it and try again."
    },
    INTERNAL_ERROR: {
      ko: defaultMessage(context, true),
      en: defaultMessage(context, false)
    }
  };

  const entry = messages[code];
  return entry ? (isKorean ? entry.ko : entry.en) : undefined;
}

export function getFriendlyErrorMessage(
  error: unknown,
  options?: { isKorean?: boolean; context?: ErrorContext }
): string {
  const isKorean = Boolean(options?.isKorean);
  const context = options?.context ?? "generic";
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  if (!raw) {
    return defaultMessage(context, isKorean);
  }

  if (isNetworkFailure(raw)) {
    return defaultMessage("network", isKorean);
  }

  const parsed = parseApiError(raw);
  if (parsed.code) {
    const friendly = codeMessage(parsed.code, context, isKorean);
    if (friendly) {
      return friendly;
    }
  }

  if (parsed.status && parsed.status >= 500) {
    return defaultMessage(context, isKorean);
  }

  return parsed.message || raw;
}
