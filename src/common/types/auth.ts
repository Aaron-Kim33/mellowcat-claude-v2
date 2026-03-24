export interface AuthSession {
  userId?: string;
  email?: string;
  displayName?: string;
  accessToken?: string;
  source?: "demo" | "remote" | "token";
  lastSyncedAt?: string;
  loggedIn: boolean;
}
