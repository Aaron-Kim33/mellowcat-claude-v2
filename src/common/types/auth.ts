export interface AuthSession {
  userId?: string;
  email?: string;
  displayName?: string;
  accessToken?: string;
  loggedIn: boolean;
}
