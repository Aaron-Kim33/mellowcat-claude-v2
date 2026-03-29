import { shell } from "electron";
import type {
  AuthSession,
  ChangeEmailResponse,
  LauncherAuthResolveResponse,
  PaymentHandoffResponse,
  ProviderUnlinkResponse,
  VerificationActionResponse
} from "../../../common/types/auth";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { SecretsStore } from "../storage/secrets-store";

export class AuthService {
  private static readonly AUTH_POLL_INTERVAL_MS = 1500;
  private static readonly AUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000;
  private browserLoginAttempt = 0;

  constructor(
    private readonly apiClient: MellowCatApiClient,
    private readonly pathService: PathService,
    private readonly fileService: FileService,
    private readonly secretsStore: SecretsStore
  ) {
    this.session = this.load();
    this.apiClient.setAccessToken(this.session.accessToken);
  }

  private session: AuthSession = {
    loggedIn: false
  };

  async getSession(): Promise<AuthSession> {
    if (this.apiClient.isConfigured() && this.session.accessToken) {
      try {
        const remoteSession = await this.apiClient.getSession();
        this.session = {
          ...remoteSession,
          accessToken: this.session.accessToken,
          source: "remote",
          lastSyncedAt: new Date().toISOString()
        };
        this.persist();
        return this.session;
      } catch (error) {
        console.warn("[AuthService] getSession failed", error);
        return this.session;
      }
    }

    return this.session;
  }

  async loginWithBrowser(): Promise<AuthSession> {
    if (this.apiClient.isConfigured()) {
      if (this.session.accessToken) {
        return this.getSession();
      }

      const attemptId = ++this.browserLoginAttempt;
      const authStart = await this.apiClient.startLauncherAuth();
      await shell.openExternal(authStart.loginUrl);

      const resolved = await this.pollForLauncherAuth(
        authStart.requestId,
        authStart.expiresAt,
        attemptId
      );
      this.session = {
        ...resolved.session,
        accessToken: resolved.accessToken,
        source: "remote",
        lastSyncedAt: new Date().toISOString()
      };
      this.apiClient.setAccessToken(resolved.accessToken);
      this.persist();
      return this.session;
    }

    this.session = {
      loggedIn: true,
      userId: "demo-user",
      email: "demo@mellowcat.dev",
      displayName: "Demo User",
      source: "demo",
      lastSyncedAt: new Date().toISOString()
    };
    this.persist();
    return this.session;
  }

  async cancelBrowserLogin(): Promise<void> {
    this.browserLoginAttempt += 1;
  }

  async loginWithToken(accessToken: string): Promise<AuthSession> {
    const normalizedToken = accessToken.trim();

    if (!normalizedToken) {
      throw new Error("Session token is required.");
    }

    this.session = {
      ...this.session,
      accessToken: normalizedToken,
      loggedIn: true,
      source: this.apiClient.isConfigured() ? "token" : "demo",
      lastSyncedAt: new Date().toISOString()
    };
    this.apiClient.setAccessToken(normalizedToken);
    this.persist();

    if (this.apiClient.isConfigured()) {
      const remoteSession = await this.apiClient.getSession();
      if (!remoteSession.loggedIn || !remoteSession.userId) {
        this.session = { loggedIn: false };
        this.apiClient.setAccessToken(undefined);
        this.secretsStore.delete("authAccessToken");
        this.persist();
        throw new Error("Token sign-in failed. The server did not return a valid session.");
      }

      this.session = {
        ...remoteSession,
        accessToken: normalizedToken,
        source: "remote",
        lastSyncedAt: new Date().toISOString()
      };
      this.persist();
      return this.session;
    }

    return this.session;
  }

  async createPaymentHandoff(
    productId: string,
    source = "launcher"
  ): Promise<PaymentHandoffResponse> {
    const normalizedProductId = productId.trim();

    if (!normalizedProductId) {
      throw new Error("Product id is required.");
    }

    if (!this.apiClient.isConfigured()) {
      throw new Error("API base URL is not configured.");
    }

    if (!this.session.accessToken) {
      throw new Error("Sign in again before starting checkout.");
    }

    return this.apiClient.createPaymentHandoff(normalizedProductId, source);
  }

  async logout(): Promise<void> {
    if (this.apiClient.isConfigured() && this.session.accessToken) {
      try {
        await this.apiClient.logoutLauncher();
      } catch (error) {
        console.warn("[AuthService] logout failed", error);
      }
    }

    this.session = { loggedIn: false };
    this.apiClient.setAccessToken(undefined);
    this.secretsStore.delete("authAccessToken");
    this.persist();
  }

  async sendVerificationEmail(): Promise<VerificationActionResponse> {
    if (!this.apiClient.isConfigured()) {
      throw new Error("API base URL is not configured.");
    }

    if (!this.session.accessToken) {
      throw new Error("Sign in again before requesting verification.");
    }

    return this.apiClient.sendVerificationEmail("launcher");
  }

  async changeEmail(email: string): Promise<ChangeEmailResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Email is required.");
    }

    if (!this.apiClient.isConfigured()) {
      throw new Error("API base URL is not configured.");
    }

    if (!this.session.accessToken) {
      throw new Error("Sign in again before changing email.");
    }

    const response = await this.apiClient.changeEmail(normalizedEmail);
    const remoteSession = await this.apiClient.getSession();
    this.session = {
      ...remoteSession,
      accessToken: this.session.accessToken,
      source: "remote",
      lastSyncedAt: new Date().toISOString()
    };
    this.persist();
    return response;
  }

  async unlinkProvider(provider: string): Promise<ProviderUnlinkResponse> {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!normalizedProvider) {
      throw new Error("Provider is required.");
    }

    if (!this.apiClient.isConfigured()) {
      throw new Error("API base URL is not configured.");
    }

    if (!this.session.accessToken) {
      throw new Error("Sign in again before updating linked providers.");
    }

    const response = await this.apiClient.unlinkProvider(normalizedProvider);
    const remoteSession = await this.apiClient.getSession();
    this.session = {
      ...remoteSession,
      accessToken: this.session.accessToken,
      source: "remote",
      lastSyncedAt: new Date().toISOString()
    };
    this.persist();
    return response;
  }

  private load(): AuthSession {
    try {
      const sessionPath = this.pathService.getAuthSessionPath();
      const stored = this.fileService.readJsonFile<Partial<AuthSession>>(sessionPath);
      const accessToken = this.secretsStore.get("authAccessToken");
      return {
        loggedIn: Boolean(stored.loggedIn && accessToken),
        userId: stored.userId,
        email: stored.email,
        displayName: stored.displayName,
        linkedProviders: stored.linkedProviders,
        emailVerified: stored.emailVerified,
        source: stored.source,
        lastSyncedAt: stored.lastSyncedAt,
        accessToken
      };
    } catch {
      return {
        loggedIn: false
      };
    }
  }

  private persist(): void {
    if (this.session.accessToken) {
      this.secretsStore.set("authAccessToken", this.session.accessToken);
    } else {
      this.secretsStore.delete("authAccessToken");
    }

    this.fileService.writeJsonFile(this.pathService.getAuthSessionPath(), {
      loggedIn: this.session.loggedIn,
      userId: this.session.userId,
      email: this.session.email,
      displayName: this.session.displayName,
      linkedProviders: this.session.linkedProviders,
      emailVerified: this.session.emailVerified,
      source: this.session.source,
      lastSyncedAt: this.session.lastSyncedAt
    });
  }

  private async pollForLauncherAuth(
    requestId: string,
    expiresAt: string,
    attemptId: number
  ): Promise<Extract<LauncherAuthResolveResponse, { status: "resolved" }>> {
    const timeoutAt = Math.min(
      new Date(expiresAt).getTime(),
      Date.now() + AuthService.AUTH_POLL_TIMEOUT_MS
    );

    while (Date.now() < timeoutAt) {
      if (attemptId !== this.browserLoginAttempt) {
        throw new Error("Browser sign-in canceled.");
      }

      const response = await this.apiClient.resolveLauncherAuth(requestId);
      if (response.status === "resolved") {
        return response;
      }

      await this.delay(AuthService.AUTH_POLL_INTERVAL_MS);
    }

    throw new Error("Browser sign-in timed out. Finish login in the browser and try again.");
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
