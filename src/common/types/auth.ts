export interface AuthSession {
  userId?: string;
  email?: string;
  displayName?: string;
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
