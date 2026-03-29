export type AuthProvider = "password" | "google";

export interface AuthSession {
  userId?: string;
  email?: string;
  displayName?: string;
  linkedProviders?: AuthProvider[];
  emailVerified?: boolean;
  accessToken?: string;
  source?: "demo" | "remote" | "token";
  lastSyncedAt?: string;
  loggedIn: boolean;
}

export interface PaymentHandoffResponse {
  ok: boolean;
  handoffToken: string;
  paymentUrl: string;
  expiresAt: string;
}

export interface LauncherAuthStartResponse {
  ok: boolean;
  requestId: string;
  loginUrl: string;
  expiresAt: string;
}

export interface VerificationActionResponse {
  ok: true;
  alreadyVerified?: boolean;
  verificationSent?: boolean;
  emailSent?: boolean;
  verificationUrl?: string | null;
  verificationExpiresAt?: string;
}

export interface ChangeEmailResponse {
  ok: true;
  emailSent?: boolean;
  verificationSent?: boolean;
  verificationUrl?: string | null;
  verificationExpiresAt?: string;
}

export interface ProviderUnlinkResponse {
  ok: true;
  linkedProviders: AuthProvider[];
}

export interface LauncherAuthPendingResponse {
  ok: true;
  status: "pending";
}

export interface LauncherAuthResolvedResponse {
  ok: true;
  status: "resolved";
  accessToken: string;
  session: AuthSession;
}

export type LauncherAuthResolveResponse =
  | LauncherAuthPendingResponse
  | LauncherAuthResolvedResponse;
