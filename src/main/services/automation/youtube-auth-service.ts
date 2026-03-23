import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { shell } from "electron";
import type {
  YouTubeAuthStatus,
  YouTubeUploadRequest,
  YouTubeUploadResult
} from "../../../common/types/settings";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";
import { SecretsStore } from "../storage/secrets-store";
import { PathService } from "../system/path-service";

interface YouTubeAuthStateFile {
  connectedAt?: string;
  expiresAt?: string;
  scope?: string;
}

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

export class YouTubeAuthService {
  constructor(
    private readonly workflowConfigService: ShortformWorkflowConfigService,
    private readonly secretsStore: SecretsStore,
    private readonly pathService: PathService
  ) {}

  getStatus(): YouTubeAuthStatus {
    const workflowConfig = this.workflowConfigService.get();
    const state = this.readState();
    const connected = Boolean(this.secretsStore.get("youtubeRefreshToken"));

    return {
      configured: Boolean(workflowConfig.youtubeOAuthClientId?.trim()),
      connected,
      clientIdConfigured: Boolean(workflowConfig.youtubeOAuthClientId?.trim()),
      channelLabel: workflowConfig.youtubeChannelLabel,
      scope: state.scope ?? YOUTUBE_UPLOAD_SCOPE,
      connectedAt: state.connectedAt,
      expiresAt: state.expiresAt,
      message: !workflowConfig.youtubeOAuthClientId?.trim()
        ? "Add a Google OAuth desktop client ID to connect YouTube."
        : connected
          ? "YouTube account is connected and ready for upload helper actions."
          : "YouTube is configured but not connected yet."
    };
  }

  async connect(): Promise<YouTubeAuthStatus> {
    const workflowConfig = this.workflowConfigService.get();
    const clientId = workflowConfig.youtubeOAuthClientId?.trim();
    const clientSecret = workflowConfig.youtubeOAuthClientSecret?.trim();
    const redirectPort = Number.parseInt(
      workflowConfig.youtubeOAuthRedirectPort ?? "45123",
      10
    );

    if (!clientId) {
      return {
        ...this.getStatus(),
        message: "Set YouTube OAuth Client ID first."
      };
    }

    const verifier = this.createCodeVerifier();
    const challenge = this.createCodeChallenge(verifier);
    const redirectUri = `http://127.0.0.1:${redirectPort}/oauth2callback`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", YOUTUBE_UPLOAD_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const code = await this.waitForAuthorizationCode(redirectPort, authUrl.toString());
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `YouTube token exchange failed: HTTP ${tokenResponse.status} ${errorText}`
      );
    }

    const payload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!payload.access_token || !payload.refresh_token) {
      throw new Error("YouTube token exchange returned incomplete credentials.");
    }

    this.secretsStore.set("youtubeAccessToken", payload.access_token);
    this.secretsStore.set("youtubeRefreshToken", payload.refresh_token);

    const now = new Date();
    const expiresAt = payload.expires_in
      ? new Date(now.getTime() + payload.expires_in * 1000).toISOString()
      : undefined;

    this.writeState({
      connectedAt: now.toISOString(),
      expiresAt,
      scope: payload.scope ?? YOUTUBE_UPLOAD_SCOPE
    });

    return this.getStatus();
  }

  async disconnect(): Promise<YouTubeAuthStatus> {
    const refreshToken = this.secretsStore.get("youtubeRefreshToken");
    const accessToken = this.secretsStore.get("youtubeAccessToken");
    const tokenToRevoke = refreshToken ?? accessToken;

    if (tokenToRevoke) {
      try {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            token: tokenToRevoke
          })
        });
      } catch {
        // Best effort revoke only.
      }
    }

    this.secretsStore.delete("youtubeAccessToken");
    this.secretsStore.delete("youtubeRefreshToken");
    this.writeState({});
    return this.getStatus();
  }

  inspectUploadRequest(packagePath: string): YouTubeUploadRequest {
    const requestPath = path.join(packagePath, "youtube-upload-request.json");
    return JSON.parse(fs.readFileSync(requestPath, "utf-8")) as YouTubeUploadRequest;
  }

  updateUploadRequest(
    packagePath: string,
    patch: Partial<YouTubeUploadRequest>
  ): YouTubeUploadRequest {
    const requestPath = path.join(packagePath, "youtube-upload-request.json");
    const current = this.inspectUploadRequest(packagePath);
    const next: YouTubeUploadRequest = {
      ...current,
      ...patch,
      metadata: {
        ...current.metadata,
        ...patch.metadata
      }
    };

    fs.writeFileSync(requestPath, JSON.stringify(next, null, 2), "utf-8");
    return next;
  }

  async uploadPackage(packagePath: string): Promise<YouTubeUploadResult> {
    const requestPath = path.join(packagePath, "youtube-upload-request.json");
    const resultPath = path.join(packagePath, "youtube-upload-result.json");
    const uploadRequest = this.inspectUploadRequest(packagePath);

    if (!fs.existsSync(uploadRequest.videoFilePath)) {
      return this.writeUploadResult(
        resultPath,
        requestPath,
        packagePath,
        {
          ok: false,
          status: "error",
          message: "Video file path does not exist."
        },
        uploadRequest
      );
    }

    const accessToken = await this.getValidAccessToken();
    const metadata = {
      snippet: {
        title: uploadRequest.metadata.title,
        description: uploadRequest.metadata.description,
        tags: uploadRequest.metadata.tags,
        categoryId: uploadRequest.metadata.categoryId
      },
      status: {
        privacyStatus: uploadRequest.metadata.privacyStatus,
        selfDeclaredMadeForKids: uploadRequest.metadata.selfDeclaredMadeForKids,
        ...(uploadRequest.scheduledPublishAt
          ? { publishAt: uploadRequest.scheduledPublishAt }
          : {})
      }
    };

    const videoBuffer = fs.readFileSync(uploadRequest.videoFilePath);
    const boundary = `mellowcat-${randomBytes(12).toString("hex")}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
          metadata
        )}\r\n`,
        "utf-8"
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Type: ${this.getMimeType(uploadRequest.videoFilePath)}\r\n\r\n`,
        "utf-8"
      ),
      videoBuffer,
      Buffer.from(`\r\n--${boundary}--`, "utf-8")
    ]);

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      return this.writeUploadResult(
        resultPath,
        requestPath,
        packagePath,
        {
          ok: false,
          status: "error",
          message: `YouTube upload failed: HTTP ${uploadResponse.status} ${errorText}`
        },
        uploadRequest
      );
    }

    const uploadPayload = (await uploadResponse.json()) as { id?: string };
    const videoId = uploadPayload.id;

    if (!videoId) {
      return this.writeUploadResult(
        resultPath,
        requestPath,
        packagePath,
        {
          ok: false,
          status: "error",
          message: "YouTube upload succeeded but did not return a video ID."
        },
        uploadRequest
      );
    }

    if (uploadRequest.thumbnailFilePath && fs.existsSync(uploadRequest.thumbnailFilePath)) {
      await this.uploadThumbnail(videoId, uploadRequest.thumbnailFilePath, accessToken);
    }

    uploadRequest.status = "uploaded";
    fs.writeFileSync(requestPath, JSON.stringify(uploadRequest, null, 2), "utf-8");

    return this.writeUploadResult(
      resultPath,
      requestPath,
      packagePath,
      {
        ok: true,
        status: "uploaded",
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        message: "YouTube upload completed."
      },
      uploadRequest
    );
  }

  private waitForAuthorizationCode(port: number, authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((request, response) => {
        const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
        const code = requestUrl.searchParams.get("code");
        const error = requestUrl.searchParams.get("error");

        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          error
            ? "<html><body><h2>MellowCat YouTube connection failed.</h2><p>You can close this window.</p></body></html>"
            : "<html><body><h2>MellowCat YouTube connected.</h2><p>You can close this window and return to the app.</p></body></html>"
        );

        server.close();

        if (error) {
          reject(new Error(`YouTube authorization failed: ${error}`));
          return;
        }

        if (!code) {
          reject(new Error("YouTube authorization did not return a code."));
          return;
        }

        resolve(code);
      });

      server.once("error", (error) => {
        reject(error);
      });

      server.listen(port, "127.0.0.1", async () => {
        try {
          await shell.openExternal(authUrl);
        } catch {
          server.close();
          reject(new Error("Could not open the browser for YouTube authorization."));
        }
      });

      setTimeout(() => {
        server.close();
        reject(new Error("Timed out waiting for YouTube authorization."));
      }, 180000);
    });
  }

  private async getValidAccessToken(): Promise<string> {
    const existingAccessToken = this.secretsStore.get("youtubeAccessToken");
    const refreshToken = this.secretsStore.get("youtubeRefreshToken");
    const workflowConfig = this.workflowConfigService.get();
    const state = this.readState();
    const clientId = workflowConfig.youtubeOAuthClientId?.trim();
    const clientSecret = workflowConfig.youtubeOAuthClientSecret?.trim();

    if (!clientId || !refreshToken) {
      throw new Error("YouTube is not connected yet.");
    }

    if (existingAccessToken && state.expiresAt && new Date(state.expiresAt).getTime() > Date.now() + 60_000) {
      return existingAccessToken;
    }

    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      throw new Error(
        `YouTube token refresh failed: HTTP ${refreshResponse.status} ${errorText}`
      );
    }

    const payload = (await refreshResponse.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!payload.access_token) {
      throw new Error("YouTube token refresh did not return an access token.");
    }

    this.secretsStore.set("youtubeAccessToken", payload.access_token);
    this.writeState({
      ...state,
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : state.expiresAt,
      scope: payload.scope ?? state.scope ?? YOUTUBE_UPLOAD_SCOPE,
      connectedAt: state.connectedAt ?? new Date().toISOString()
    });

    return payload.access_token;
  }

  private async uploadThumbnail(
    videoId: string,
    thumbnailFilePath: string,
    accessToken: string
  ): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": this.getMimeType(thumbnailFilePath)
        },
        body: fs.readFileSync(thumbnailFilePath)
      }
    );

    if (!response.ok) {
      throw new Error(`Thumbnail upload failed: HTTP ${response.status}`);
    }
  }

  private writeUploadResult(
    resultPath: string,
    requestPath: string,
    packagePath: string,
    partial: Omit<YouTubeUploadResult, "packagePath" | "requestPath" | "resultPath">,
    uploadRequest: YouTubeUploadRequest
  ): YouTubeUploadResult {
    if (partial.status === "error") {
      uploadRequest.status = "error";
      fs.writeFileSync(requestPath, JSON.stringify(uploadRequest, null, 2), "utf-8");
    }

    const result: YouTubeUploadResult = {
      packagePath,
      requestPath,
      resultPath,
      ...partial
    };

    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");
    return result;
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case ".mp4":
        return "video/mp4";
      case ".mov":
        return "video/quicktime";
      case ".webm":
        return "video/webm";
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      default:
        return "application/octet-stream";
    }
  }

  private readState(): YouTubeAuthStateFile {
    const filePath = this.pathService.getAutomationStatePath("youtube-auth.json");
    const directory = path.dirname(filePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as YouTubeAuthStateFile;
    } catch {
      return {};
    }
  }

  private writeState(state: YouTubeAuthStateFile): void {
    const filePath = this.pathService.getAutomationStatePath("youtube-auth.json");
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  }

  private createCodeVerifier(): string {
    return randomBytes(48).toString("base64url");
  }

  private createCodeChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
  }
}
