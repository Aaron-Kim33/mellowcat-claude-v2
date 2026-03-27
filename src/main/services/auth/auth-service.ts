import type { AuthSession, PaymentHandoffResponse } from "../../../common/types/auth";
import { MellowCatApiClient } from "../../api/mellowcat-api-client";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { SecretsStore } from "../storage/secrets-store";

export class AuthService {
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

      throw new Error(
        "Server-backed browser login is not connected yet. Use token sign-in for now."
      );
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

  logout(): void {
    this.session = { loggedIn: false };
    this.apiClient.setAccessToken(undefined);
    this.secretsStore.delete("authAccessToken");
    this.persist();
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
      source: this.session.source,
      lastSyncedAt: this.session.lastSyncedAt
    });
  }
}
