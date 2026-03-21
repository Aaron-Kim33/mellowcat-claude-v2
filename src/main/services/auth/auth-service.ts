import type { AuthSession } from "../../../common/types/auth";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";

export class AuthService {
  constructor(private readonly apiClient: MellowCatApiClient) {}

  private session: AuthSession = {
    loggedIn: false
  };

  async getSession(): Promise<AuthSession> {
    if (this.apiClient.isConfigured()) {
      try {
        this.session = await this.apiClient.getSession();
        return this.session;
      } catch (_error) {
        return this.session;
      }
    }

    return this.session;
  }

  async loginWithBrowser(): Promise<AuthSession> {
    this.session = {
      loggedIn: true,
      userId: "demo-user",
      email: "demo@mellowcat.dev",
      displayName: "Demo User"
    };
    return this.session;
  }

  logout(): void {
    this.session = { loggedIn: false };
  }
}
