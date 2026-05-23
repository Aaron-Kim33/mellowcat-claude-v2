import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { load } from "cheerio";
import { BrowserWindow, desktopCapturer, dialog, ipcMain, nativeImage, screen, shell } from "electron";
import type { DesktopCapturerSource, OpenDialogOptions } from "electron";
import type {
  AutomationJobSnapshot,
  ShortformWorkflowConfig
} from "../../common/types/automation";
import type {
  AiWorkspaceGenerateRequest,
  AiWorkspaceGenerateResult,
  AiWorkspaceClipboardAssetRequest,
  AiWorkspaceClipboardAssetResult,
  AiWorkspaceLinkAnalysisRequest,
  AiWorkspaceLinkAnalysisResult,
  AiWorkspaceManusSubmitRequest,
  AiWorkspaceManusSubmitResult,
  CardNewsTemplateRecord,
  FreesoundAudioImportRequest,
  FreesoundAudioImportResult,
  FreesoundAudioResult,
  FreesoundAudioSearchRequest,
  LocalAssetImportRequest,
  UploadedAssetRecord,
  PixabayAssetImportRequest,
  PixabayAssetResult,
  PixabayAssetSearchRequest,
  SceneScriptDocument,
  SceneScriptEditorDraft,
  VoiceLayerGenerationRequest,
  VoiceLayerGenerationResult
} from "../../common/types/media-generation";
import type { YouTubeUploadRequest } from "../../common/types/settings";
import type {
  AutoProcessDraftPayload,
  ManualInputCheckpointPayload,
  ManualCreateCheckpointPayload,
  ManualOutputCheckpointPayload,
  ManualProcessCheckpointPayload
} from "../../common/types/slot-workflow";
import type {
  NewsKnowledgeDiscoveryRequest,
  YouTubeBreakoutDiscoveryRequest,
  YouTubeCandidateAnalysisRequest,
  YouTubeTranscriptProbeRequest
} from "../../common/types/trend";
import type { TrendCandidate } from "../../common/types/trend";
import { CheckpointWorkflowService } from "../services/automation/checkpoint-workflow-service";
import { ProductionPackageService } from "../services/automation/production-package-service";
import { ShortformScriptService } from "../services/automation/shortform-script-service";
import { VoiceoverService } from "../services/automation/voiceover-service";
import { TelegramControlService } from "../services/automation/telegram-control-service";
import { TrendDiscoveryService } from "../services/automation/trend-discovery-service";
import { ShortformWorkflowConfigService } from "../services/automation/shortform-workflow-config-service";
import { YouTubeAuthService } from "../services/automation/youtube-auth-service";
import { PathService } from "../services/system/path-service";

export function registerAutomationIpc(
  telegramControlService: TelegramControlService,
  trendDiscoveryService: TrendDiscoveryService,
  youTubeAuthService: YouTubeAuthService,
  workflowConfigService: ShortformWorkflowConfigService,
  checkpointWorkflowService: CheckpointWorkflowService,
  productionPackageService: ProductionPackageService,
  shortformScriptService: ShortformScriptService,
  voiceoverService: VoiceoverService,
  pathService: PathService
): void {
  const sanitizeFileToken = (value: string) =>
    value
      .replace(/https?:\/\//gi, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "source";
  const getBundledFfmpegPath = () => {
    const candidates = [
      pathService.getBundledToolPath("ffmpeg.exe"),
      pathService.getBundledToolPath("ffmpeg")
    ];
    const ffmpegPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!ffmpegPath) {
      throw new Error("Bundled FFmpeg was not found. Put ffmpeg.exe in resources/bundled/dev.");
    }
    return ffmpegPath;
  };
  const listDirectShowAudioDevices = () =>
    new Promise<string[]>((resolve) => {
      let ffmpegPath: string;
      try {
        ffmpegPath = getBundledFfmpegPath();
      } catch {
        resolve([]);
        return;
      }
      const child = spawn(ffmpegPath, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      child.stderr.on("data", (chunk) => {
        output += String(chunk);
      });
      child.on("error", () => resolve([]));
      child.on("close", () => {
        const devices = [...output.matchAll(/"([^"]+)"\s+\(audio\)/gi)]
          .map((match) => match[1]?.trim())
          .filter((value): value is string => Boolean(value));
        resolve([...new Set(devices)]);
      });
    });
  const findSystemAudioCaptureDevice = async () => {
    if (process.platform !== "win32") {
      return undefined;
    }
    const devices = await listDirectShowAudioDevices();
    const loopbackPatterns = [
      /stereo mix/i,
      /what u hear/i,
      /wave out/i,
      /loopback/i,
      /virtual-audio-capturer/i,
      /cable output/i,
      /vb-audio/i,
      /스테레오\s*믹스/i
    ];
    return devices.find((device) => loopbackPatterns.some((pattern) => pattern.test(device)));
  };
  const startChromiumLoopbackRecorder = async (
    outputPath: string,
    videoSource: DesktopCapturerSource,
    log?: (message: string) => void
  ) => {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startedChannel = `mellowcat:source-record:chromium-started:${token}`;
    const doneChannel = `mellowcat:source-record:chromium-done:${token}`;
    const errorChannel = `mellowcat:source-record:chromium-error:${token}`;
    const logChannel = `mellowcat:source-record:chromium-log:${token}`;
    const recorderWindow = new BrowserWindow({
      width: 320,
      height: 240,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });
    const recorderSession = recorderWindow.webContents.session;
    recorderSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === "media");
    });
    recorderSession.setPermissionCheckHandler((_webContents, permission) => permission === "media");
    recorderSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({ video: { id: videoSource.id, name: videoSource.name }, audio: "loopback" });
    });
    log?.(`chromium-recorder source id=${videoSource.id} name=${videoSource.name} display_id=${videoSource.display_id || ""}`);

    let stopped = false;
    let started = false;
    let doneSettled = false;
    let startTimer: NodeJS.Timeout | undefined;
    let doneResolve: (() => void) | undefined;
    let doneReject: ((error: Error) => void) | undefined;
    const done = new Promise<void>((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });
    const recorderHtmlPath = path.join(path.dirname(outputPath), `source-recorder-${token}.html`);

    const cleanup = () => {
      recorderSession.setDisplayMediaRequestHandler(null);
      ipcMain.removeListener(startedChannel, onStarted);
      ipcMain.removeListener(doneChannel, onDone);
      ipcMain.removeListener(errorChannel, onError);
      ipcMain.removeListener(logChannel, onLog);
      if (startTimer) {
        clearTimeout(startTimer);
      }
      if (!recorderWindow.isDestroyed()) {
        recorderWindow.close();
      }
      try {
        fs.unlinkSync(recorderHtmlPath);
      } catch {
        // best-effort cleanup
      }
    };
    const onStarted = () => {
      started = true;
    };
    const onDone = () => {
      if (doneSettled) {
        return;
      }
      doneSettled = true;
      cleanup();
      doneResolve?.();
    };
    const onError = (_event: Electron.IpcMainEvent, message?: string) => {
      if (doneSettled) {
        return;
      }
      doneSettled = true;
      log?.(`chromium-recorder error: ${message || "unknown"}`);
      cleanup();
      doneReject?.(new Error(message || "Chromium screen recorder failed."));
    };
    const onLog = (_event: Electron.IpcMainEvent, message?: string) => {
      if (message) {
        log?.(message);
      }
    };

    ipcMain.on(startedChannel, onStarted);
    ipcMain.once(doneChannel, onDone);
    ipcMain.once(errorChannel, onError);
    ipcMain.on(logChannel, onLog);

    const html = `
      <!doctype html>
      <html>
        <body>
          <script>
            const { ipcRenderer } = require("electron");
            const fs = require("fs");
            const { Buffer } = require("buffer");
            const outputPath = ${JSON.stringify(outputPath)};
            const startedChannel = ${JSON.stringify(startedChannel)};
            const doneChannel = ${JSON.stringify(doneChannel)};
            const errorChannel = ${JSON.stringify(errorChannel)};
            const logChannel = ${JSON.stringify(logChannel)};
            let stream = null;
            let recorder = null;
            let pendingWrite = Promise.resolve();
            const log = (message) => ipcRenderer.send(logChannel, String(message));
            const fail = (error) => {
              ipcRenderer.send(errorChannel, String(error && error.message ? error.message : error));
            };
            window.__mellowcatStopRecorder = () => {
              try {
                if (recorder && recorder.state !== "inactive") {
                  recorder.stop();
                  return;
                }
              } catch (error) {
                fail(error);
                return;
              }
              ipcRenderer.send(doneChannel);
            };
            (async () => {
              try {
                if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
                  throw new Error("getDisplayMedia is unavailable in recorder window. protocol=" + location.protocol + " secure=" + window.isSecureContext);
                }
                stream = await navigator.mediaDevices.getDisplayMedia({
                  video: { frameRate: 30 },
                  audio: true
                });
                const videoTrack = stream.getVideoTracks()[0];
                const audioTracks = stream.getAudioTracks();
                log("tracks video=" + JSON.stringify(videoTrack ? videoTrack.getSettings() : null) + " audioCount=" + audioTracks.length);
                const mimeType = [
                  "video/webm;codecs=vp9,opus",
                  "video/webm;codecs=vp8,opus",
                  "video/webm"
                ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
                recorder = new MediaRecorder(stream, {
                  ...(mimeType ? { mimeType } : {}),
                  videoBitsPerSecond: 12000000,
                  audioBitsPerSecond: 192000
                });
                recorder.ondataavailable = (event) => {
                  if (!event.data || event.data.size <= 0) return;
                  pendingWrite = pendingWrite.then(async () => {
                    const buffer = Buffer.from(await event.data.arrayBuffer());
                    fs.appendFileSync(outputPath, buffer);
                  });
                };
                recorder.onerror = (event) => fail(event.error || "MediaRecorder error");
                recorder.onstop = async () => {
                  try {
                    await pendingWrite;
                    if (stream) {
                      stream.getTracks().forEach((track) => track.stop());
                    }
                    ipcRenderer.send(doneChannel);
                  } catch (error) {
                    fail(error);
                  }
                };
                recorder.start(500);
                ipcRenderer.send(startedChannel);
              } catch (error) {
                fail(error);
              }
            })();
          </script>
        </body>
      </html>
    `;
    fs.writeFileSync(recorderHtmlPath, html, "utf8");

    try {
      await recorderWindow.loadFile(recorderHtmlPath);
    } catch (error) {
      cleanup();
      throw error;
    }

    await new Promise<void>((resolve, reject) => {
      startTimer = setTimeout(() => {
        if (!started) {
          cleanup();
          reject(new Error("Chromium loopback recorder did not start."));
        }
      }, 8000);
      const pollStarted = setInterval(() => {
        if (started) {
          clearInterval(pollStarted);
          if (startTimer) {
            clearTimeout(startTimer);
          }
          resolve();
        }
      }, 50);
    });

    return {
      stop: async () => {
        if (stopped || recorderWindow.isDestroyed()) {
          return;
        }
        stopped = true;
        await recorderWindow.webContents.executeJavaScript("window.__mellowcatStopRecorder && window.__mellowcatStopRecorder();", true);
      },
      done
    };
  };
  const runBundledFfmpeg = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      let ffmpegPath: string;
      try {
        ffmpegPath = getBundledFfmpegPath();
      } catch (error) {
        reject(error);
        return;
      }

      const child = spawn(ffmpegPath, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`FFmpeg failed with exit code ${code}. ${stderr.slice(-1200)}`));
      });
    });
  const getAiWorkspaceOpenRouterModel = (rawModel?: string) => {
    const fallback = "openai/gpt-5.4-mini";
    const model = rawModel?.trim();
    if (!model) {
      return fallback;
    }

    const normalized = model.toLowerCase();
    if (
      normalized.startsWith("anthropic/claude-3") ||
      normalized === "anthropic/claude-3.5-sonnet"
    ) {
      return fallback;
    }
    return model;
  };

  const getMimeTypeForFile = (filePath: string, fallback?: string) => {
    if (fallback?.trim()) {
      return fallback.trim();
    }
    const ext = path.extname(filePath).toLowerCase();
    if ([".jpg", ".jpeg"].includes(ext)) {
      return "image/jpeg";
    }
    if (ext === ".png") {
      return "image/png";
    }
    if (ext === ".webp") {
      return "image/webp";
    }
    if (ext === ".gif") {
      return "image/gif";
    }
    if (ext === ".mp4") {
      return "video/mp4";
    }
    if (ext === ".mov") {
      return "video/quicktime";
    }
    if (ext === ".webm") {
      return "video/webm";
    }
    if (ext === ".pdf") {
      return "application/pdf";
    }
    if (ext === ".md") {
      return "text/markdown";
    }
    if (ext === ".txt") {
      return "text/plain";
    }
    return "application/octet-stream";
  };

  const callManusApi = async <T>(apiKey: string, pathName: string, body: unknown): Promise<T> => {
    const response = await fetch(`https://api.manus.ai/v2/${pathName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": apiKey
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Manus API HTTP ${response.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  };

  const callManusGet = async <T>(apiKey: string, pathName: string, query: Record<string, string>): Promise<T> => {
    const url = new URL(`https://api.manus.ai/v2/${pathName}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-manus-api-key": apiKey
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Manus API HTTP ${response.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  };

  const waitForManusFileUpload = async (apiKey: string, fileId: string, fileName: string) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const detail = await callManusGet<{
        file?: {
          status?: "pending" | "uploaded" | "deleted" | "error";
          error_message?: string | null;
        };
      }>(apiKey, "file.detail", { file_id: fileId });
      const status = detail.file?.status;
      if (status === "uploaded") {
        return;
      }
      if (status === "error" || status === "deleted") {
        throw new Error(`Manus file upload failed for ${fileName}: ${detail.file?.error_message ?? status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Manus file upload did not finish in time for ${fileName}.`);
  };

  const submitAiWorkspaceToManus = async (
    request: AiWorkspaceManusSubmitRequest
  ): Promise<AiWorkspaceManusSubmitResult> => {
    const workflowConfig = workflowConfigService.refreshSecrets();
    const apiKey = workflowConfig.manusApiKey?.trim();
    if (!apiKey) {
      throw new Error("Manus API Key가 없습니다. 설정 탭에서 Manus API Key를 저장해 주세요.");
    }

    const uploadedFiles: AiWorkspaceManusSubmitResult["uploadedFiles"] = [];
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: request.prompt
      }
    ];
    const urlReferences = (request.attachments ?? [])
      .filter((attachment) => attachment.sourceUrl?.trim())
      .map((attachment, index) => {
        const title = attachment.label?.trim() || `${attachment.kind} reference ${index + 1}`;
        return `${index + 1}. [${attachment.kind}] ${title}\n   url: ${attachment.sourceUrl?.trim()}`;
      });
    if (urlReferences.length > 0) {
      content.push({
        type: "text",
        text: ["[MELLOWCAT URL REFERENCES]", ...urlReferences].join("\n")
      });
    }

    for (const attachment of request.attachments ?? []) {
      if (!attachment.localPath || !fs.existsSync(attachment.localPath)) {
        continue;
      }
      const fileName = path.basename(attachment.localPath);
      const mimeType = getMimeTypeForFile(attachment.localPath, attachment.mimeType);
      const uploadPayload = await callManusApi<{
        file?: {
          id?: string;
          name?: string;
        };
        file_id?: string;
        fileId?: string;
        upload_url?: string;
        uploadUrl?: string;
        presigned_url?: string;
        url?: string;
      }>(apiKey, "file.upload", { filename: fileName });
      const fileId = uploadPayload.file?.id ?? uploadPayload.file_id ?? uploadPayload.fileId;
      const uploadUrl =
        uploadPayload.upload_url ?? uploadPayload.uploadUrl ?? uploadPayload.presigned_url ?? uploadPayload.url;
      if (!fileId || !uploadUrl) {
        throw new Error(`Manus file.upload returned an unexpected response for ${fileName}.`);
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType
        },
        body: fs.readFileSync(attachment.localPath)
      });
      if (!uploadResponse.ok) {
        throw new Error(`Manus file upload HTTP ${uploadResponse.status}: ${await uploadResponse.text()}`);
      }
      await waitForManusFileUpload(apiKey, fileId, fileName);

      uploadedFiles.push({
        id: attachment.id,
        label: attachment.label,
        fileId
      });
      content.push({
        type: "file",
        file_id: fileId
      });
    }

    const taskPayload = await callManusApi<{
      task_id?: string;
      taskId?: string;
      id?: string;
      task_url?: string;
      taskUrl?: string;
      url?: string;
    }>(apiKey, "task.create", {
      message: {
        content
      }
    });

    const taskId = taskPayload.task_id ?? taskPayload.taskId ?? taskPayload.id;
    if (!taskId) {
      throw new Error("Manus task.create returned an unexpected response without task id.");
    }
    const taskUrl = taskPayload.task_url ?? taskPayload.taskUrl ?? taskPayload.url ?? `https://manus.im/app/task/${taskId}`;

    return {
      ok: true,
      taskId,
      taskUrl,
      uploadedFiles,
      message: `Manus task created: ${taskId}`
    };
  };

  const generateAiWorkspacePlan = async (
    request: AiWorkspaceGenerateRequest
  ): Promise<AiWorkspaceGenerateResult> => {
    const aiWorkspaceSystemPrompt =
      "You are a senior Korean social content creative director. Transform user-provided raw materials into a new, polished content plan. Do not simply restate, summarize, or copy the source text. Return only one valid JSON object that follows the user's schema.";
    const workflowConfig = workflowConfigService.refreshSecrets();
    const preferredProvider = workflowConfig.scriptProvider ?? "openrouter_api";
    const openRouterApiKey = workflowConfig.openRouterApiKey?.trim();
    const openAiApiKey = workflowConfig.openAiApiKey?.trim();
    const useOpenAi = preferredProvider === "openai_api" && Boolean(openAiApiKey);
    const useOpenRouter = !useOpenAi && Boolean(openRouterApiKey);

    if (!useOpenAi && !useOpenRouter) {
      return {
        rawText: request.fallbackRawText,
        provider: "local",
        model: "local-fallback"
      };
    }

    if (useOpenAi) {
      const model = workflowConfig.openAiModel?.trim() || "gpt-5.4-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: aiWorkspaceSystemPrompt },
            { role: "user", content: request.prompt }
          ],
          temperature: 0.65,
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const rawText = payload.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) {
        throw new Error("OpenAI returned empty content.");
      }
      return {
        rawText,
        provider: "openai",
        model
      };
    }

    const fallbackModel = "openai/gpt-5.4-mini";
    const configuredModel = getAiWorkspaceOpenRouterModel(workflowConfig.openRouterModel);
    const callOpenRouter = async (model: string) => {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://mellowcat.xyz",
          "X-Title": "MellowCat Claude"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: aiWorkspaceSystemPrompt },
            { role: "user", content: request.prompt }
          ],
          temperature: 0.65,
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = payload.choices?.[0]?.message?.content ?? "";
      if (!rawText.trim()) {
        throw new Error("OpenRouter returned empty content.");
      }
      return rawText;
    };

    try {
      return {
        rawText: await callOpenRouter(configuredModel),
        provider: "openrouter",
        model: configuredModel
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetryWithFallback =
        configuredModel !== fallbackModel &&
        /OpenRouter HTTP 404|No endpoints found/i.test(message);
      if (!shouldRetryWithFallback) {
        throw error;
      }
      return {
        rawText: await callOpenRouter(fallbackModel),
        provider: "openrouter",
        model: fallbackModel
      };
    }
  };
  const getCardNewsTemplateStorePath = () => pathService.getUserCardNewsTemplatesPath();
  const getCardNewsTemplateIndexPath = () =>
    path.join(getCardNewsTemplateStorePath(), "templates.json");
  const supportedCardNewsTemplateExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const inferCardNewsTemplateRole = (
    name: string
  ): CardNewsTemplateRecord["role"] => {
    const lowerName = name.toLowerCase();
    if (/(opener|cover|intro|시작|커버|표지)/i.test(lowerName)) {
      return "opener";
    }
    if (/(qna|q&a|question|질문|문답)/i.test(lowerName)) {
      return "qna";
    }
    if (/(closer|outro|ending|마무리|끝|엔딩)/i.test(lowerName)) {
      return "closer";
    }
    return "body";
  };
  const normalizeCardNewsTemplateRecords = (records: unknown): CardNewsTemplateRecord[] => {
    if (!Array.isArray(records)) {
      return [];
    }
    return records
      .map((record) => {
        if (!record || typeof record !== "object") {
          return undefined;
        }
        const candidate = record as Partial<CardNewsTemplateRecord>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.name !== "string" ||
          typeof candidate.imagePath !== "string"
        ) {
          return undefined;
        }
        const role =
          candidate.role === "opener" ||
          candidate.role === "qna" ||
          candidate.role === "closer" ||
          candidate.role === "body"
            ? candidate.role
            : inferCardNewsTemplateRole(candidate.name);
        return {
          id: candidate.id,
          name: candidate.name,
          role,
          imagePath: candidate.imagePath,
          thumbnailPath: candidate.thumbnailPath || candidate.imagePath
        };
      })
      .filter((record): record is CardNewsTemplateRecord => Boolean(record));
  };
  const loadUserCardNewsTemplates = (): CardNewsTemplateRecord[] => {
    const indexPath = getCardNewsTemplateIndexPath();
    if (!fs.existsSync(indexPath)) {
      return [];
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as unknown;
      const normalized = normalizeCardNewsTemplateRecords(parsed);
      return normalized.filter((template) => fs.existsSync(template.imagePath));
    } catch {
      return [];
    }
  };
  const saveUserCardNewsTemplates = (templates: CardNewsTemplateRecord[]) => {
    fs.mkdirSync(getCardNewsTemplateStorePath(), { recursive: true });
    fs.writeFileSync(
      getCardNewsTemplateIndexPath(),
      JSON.stringify(templates, null, 2),
      "utf8"
    );
  };

  const pickPixabayVideoUrl = (videos: unknown): { url: string; width?: number; height?: number } | undefined => {
    if (!videos || typeof videos !== "object") {
      return undefined;
    }
    const videoMap = videos as Record<string, { url?: string; width?: number; height?: number }>;
    return videoMap.large?.url
      ? { url: videoMap.large.url, width: videoMap.large.width, height: videoMap.large.height }
      : videoMap.medium?.url
        ? { url: videoMap.medium.url, width: videoMap.medium.width, height: videoMap.medium.height }
        : videoMap.small?.url
          ? { url: videoMap.small.url, width: videoMap.small.width, height: videoMap.small.height }
          : videoMap.tiny?.url
            ? { url: videoMap.tiny.url, width: videoMap.tiny.width, height: videoMap.tiny.height }
            : undefined;
  };

  const pickPixabayVideoPreviewUrl = (hit: Record<string, unknown>) => {
    const directPreviewUrl =
      typeof hit.previewURL === "string"
        ? hit.previewURL
        : typeof hit.webformatURL === "string"
          ? hit.webformatURL
          : typeof hit.largeImageURL === "string"
            ? hit.largeImageURL
            : "";
    if (directPreviewUrl) {
      return directPreviewUrl;
    }

    if (hit.videos && typeof hit.videos === "object") {
      const videoMap = hit.videos as Record<string, { thumbnail?: string; poster?: string; preview?: string }>;
      const videoPreview =
        videoMap.large?.thumbnail ??
        videoMap.large?.poster ??
        videoMap.large?.preview ??
        videoMap.medium?.thumbnail ??
        videoMap.medium?.poster ??
        videoMap.medium?.preview ??
        videoMap.small?.thumbnail ??
        videoMap.small?.poster ??
        videoMap.small?.preview ??
        videoMap.tiny?.thumbnail ??
        videoMap.tiny?.poster ??
        videoMap.tiny?.preview ??
        "";
      if (videoPreview) {
        return videoPreview;
      }
    }

    return typeof hit.picture_id === "string" && hit.picture_id.trim()
      ? `https://i.vimeocdn.com/video/${hit.picture_id.trim()}_295x166.jpg`
      : "";
  };

  const getDownloadedAssetExtension = (
    mediaType: "video" | "image" | "audio",
    contentType: string | null,
    sourceUrl: string
  ) => {
    const urlExtension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (urlExtension && urlExtension.length <= 6) {
      return urlExtension;
    }
    if (contentType?.includes("png")) {
      return ".png";
    }
    if (contentType?.includes("webp")) {
      return ".webp";
    }
    if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
      return ".jpg";
    }
    if (contentType?.includes("mpeg") || contentType?.includes("mp3")) {
      return ".mp3";
    }
    if (contentType?.includes("wav")) {
      return ".wav";
    }
    if (contentType?.includes("ogg")) {
      return ".ogg";
    }
    if (contentType?.includes("mp4") && mediaType === "audio") {
      return ".m4a";
    }
    return mediaType === "video" ? ".mp4" : mediaType === "audio" ? ".mp3" : ".jpg";
  };
  const getMediaTypeFromExtension = (extension: string): "video" | "image" | "audio" | undefined => {
    if ([".mp4", ".mov", ".webm", ".mkv"].includes(extension.toLowerCase())) {
      return "video";
    }
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension.toLowerCase())) {
      return "image";
    }
    if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"].includes(extension.toLowerCase())) {
      return "audio";
    }
    return undefined;
  };
  const getClipboardAssetExtension = (mimeType: string) => {
    if (mimeType.includes("png")) {
      return ".png";
    }
    if (mimeType.includes("webp")) {
      return ".webp";
    }
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
      return ".jpg";
    }
    return ".png";
  };
  const listPackageAssetDirectory = (
    packagePath: string,
    relativeDir: string,
    source: UploadedAssetRecord["source"]
  ): UploadedAssetRecord[] => {
    const absoluteDir = path.join(packagePath, relativeDir);
    if (!fs.existsSync(absoluteDir)) {
      return [];
    }
    const records: UploadedAssetRecord[] = [];
    fs
      .readdirSync(absoluteDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        const localPath = path.join(absoluteDir, entry.name);
        const mediaType = getMediaTypeFromExtension(path.extname(entry.name));
        if (!mediaType) {
          return;
        }
        const stats = fs.statSync(localPath);
        const relativePath = path.relative(packagePath, localPath);
        records.push({
          id: `${source}:${relativePath.replace(/\\/g, "/")}`,
          label: entry.name,
          localPath,
          relativePath,
          mediaType,
          source,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString()
        });
      });
    return records;
  };
  const listUploadedPackageAssets = (packagePath: string): UploadedAssetRecord[] =>
    [
      ...listPackageAssetDirectory(packagePath, path.join("assets", "source-clips"), "source-clip"),
      ...listPackageAssetDirectory(packagePath, path.join("assets", "library", "ai-workspace"), "clipboard"),
      ...listPackageAssetDirectory(packagePath, path.join("assets", "library", "local"), "local")
    ].sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  const isPathInside = (targetPath: string, parentPath: string) => {
    const relative = path.relative(parentPath, targetPath);
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  const assertUploadedAssetPath = (packagePath: string, asset: UploadedAssetRecord) => {
    const resolvedPackagePath = path.resolve(packagePath);
    const resolvedAssetPath = path.resolve(asset.localPath || path.join(packagePath, asset.relativePath || ""));
    const allowedDirectories = [
      path.join(resolvedPackagePath, "assets", "source-clips"),
      path.join(resolvedPackagePath, "assets", "library", "ai-workspace"),
      path.join(resolvedPackagePath, "assets", "library", "local")
    ].map((directory) => path.resolve(directory));
    const isAllowed = allowedDirectories.some((directory) => isPathInside(resolvedAssetPath, directory));
    if (!isAllowed) {
      throw new Error("Uploaded asset delete is only allowed inside this package's upload folders.");
    }
    return resolvedAssetPath;
  };
  const toAbsolutePageUrl = (value: string | undefined, baseUrl: string) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return undefined;
    }
  };
  const extractKeywordsFromText = (value: string) => {
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "with",
      "from",
      "that",
      "this",
      "you",
      "your",
      "are",
      "was",
      "뉴스",
      "기사",
      "영상",
      "이미지",
      "대한",
      "관련",
      "있는",
      "하는",
      "했다",
      "한다",
      "그리고",
      "하지만"
    ]);
    const words = value
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !stopWords.has(word.toLowerCase()));
    const counts = new Map<string, number>();
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([word]) => word);
  };

  ipcMain.handle("automation:workflow:getConfig", () => workflowConfigService.get());
  ipcMain.handle(
    "automation:workflow:setConfig",
    (_event, patch: Partial<ShortformWorkflowConfig>) => workflowConfigService.set(patch)
  );
  ipcMain.handle("automation:telegram:getStatus", () =>
    telegramControlService.getStatus()
  );
  ipcMain.handle("automation:telegram:sync", () => telegramControlService.syncUpdates());
  ipcMain.handle("automation:telegram:sendMockShortlist", () =>
    telegramControlService.sendMockShortlist()
  );
  ipcMain.handle("automation:crawl:discoverYouTubeBreakouts", (_event, request: YouTubeBreakoutDiscoveryRequest) =>
    trendDiscoveryService.discoverYouTubeBreakoutCandidates(
      request,
      workflowConfigService.get().youtubeDataApiKey
    )
  );
  ipcMain.handle(
    "automation:crawl:discoverNewsKnowledgeCandidates",
    (_event, request: NewsKnowledgeDiscoveryRequest) =>
      trendDiscoveryService.discoverNewsKnowledgeCandidates(request)
  );
  ipcMain.handle(
    "automation:crawl:analyzeYouTubeCandidate",
    (_event, request: YouTubeCandidateAnalysisRequest) =>
      shortformScriptService.analyzeYouTubeCandidate(request)
  );
  ipcMain.handle(
    "automation:crawl:probeYouTubeTranscript",
    (_event, request: YouTubeTranscriptProbeRequest) =>
      shortformScriptService.probeYouTubeTranscript(request)
  );
  ipcMain.handle(
    "automation:crawl:captureNewsSourceToCardCover",
    async (event, sourceUrl: string, packagePath?: string) => {
      const normalizedUrl = sourceUrl?.trim();
      if (!normalizedUrl) {
        throw new Error("Source URL is required.");
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(normalizedUrl);
      } catch {
        throw new Error("Invalid source URL.");
      }

      if (!/^https?:$/i.test(parsedUrl.protocol)) {
        throw new Error("Only http/https URLs are supported for capture.");
      }

      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const captureWindow = new BrowserWindow({
        width: 1280,
        height: 920,
        show: true,
        autoHideMenuBar: true,
        title: "Capture Source",
        parent: ownerWindow ?? undefined,
        modal: Boolean(ownerWindow),
        webPreferences: {
          sandbox: true,
          contextIsolation: true
        }
      });

      try {
        await captureWindow.loadURL(normalizedUrl);

        const selection = await captureWindow.webContents.executeJavaScript(
          `
          new Promise((resolve) => {
            const oldRoot = document.getElementById("__mellowcat_capture_root");
            if (oldRoot) oldRoot.remove();

            const root = document.createElement("div");
            root.id = "__mellowcat_capture_root";
            Object.assign(root.style, {
              position: "fixed",
              right: "18px",
              top: "18px",
              zIndex: "2147483647",
              display: "flex",
              gap: "8px",
              alignItems: "center",
              padding: "10px",
              borderRadius: "16px",
              background: "rgba(17,17,17,0.92)",
              color: "#fff",
              font: "600 13px sans-serif",
              boxShadow: "0 14px 40px rgba(0,0,0,0.35)"
            });

            const guide = document.createElement("span");
            guide.textContent = "Scroll first, then capture 1:1";
            Object.assign(guide.style, {
              whiteSpace: "nowrap",
              opacity: "0.9"
            });

            const captureButton = document.createElement("button");
            captureButton.type = "button";
            captureButton.textContent = "캡쳐 시작";
            Object.assign(captureButton.style, {
              border: "0",
              borderRadius: "999px",
              padding: "8px 12px",
              background: "#ff3ea5",
              color: "#fff",
              font: "700 13px sans-serif",
              cursor: "pointer"
            });

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "취소";
            Object.assign(cancelButton.style, {
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: "999px",
              padding: "8px 12px",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              font: "700 13px sans-serif",
              cursor: "pointer"
            });

            root.appendChild(guide);
            root.appendChild(captureButton);
            root.appendChild(cancelButton);
            document.documentElement.appendChild(root);

            let overlay = null;
            let box = null;
            let startX = 0;
            let startY = 0;
            let dragging = false;
            let lastRect = null;

            const cleanup = () => {
              window.removeEventListener("keydown", onKeyDown, true);
              if (overlay) overlay.remove();
              root.remove();
            };

            const startCaptureMode = () => {
              root.style.display = "none";

              overlay = document.createElement("div");
              overlay.id = "__mellowcat_capture_overlay";
              Object.assign(overlay.style, {
                position: "fixed",
                inset: "0",
                zIndex: "2147483647",
                cursor: "crosshair",
                background: "rgba(0,0,0,0.20)",
                userSelect: "none"
              });

              box = document.createElement("div");
              Object.assign(box.style, {
                position: "fixed",
                display: "none",
                border: "3px solid #ff3ea5",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                background: "rgba(255,255,255,0.04)",
                boxSizing: "border-box"
              });

              const tip = document.createElement("div");
              tip.textContent = "Drag to select a 1:1 square. Release to capture. Press Esc to cancel.";
              Object.assign(tip.style, {
                position: "fixed",
                left: "50%",
                top: "18px",
                transform: "translateX(-50%)",
                padding: "10px 14px",
                borderRadius: "999px",
                background: "rgba(17,17,17,0.92)",
                color: "#fff",
                font: "600 13px sans-serif",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
              });

              overlay.appendChild(box);
              overlay.appendChild(tip);
              document.documentElement.appendChild(overlay);
              overlay.addEventListener("mousedown", onMouseDown);
              overlay.addEventListener("mousemove", onMouseMove);
              overlay.addEventListener("mouseup", onMouseUp);
              window.addEventListener("keydown", onKeyDown, true);
            };

            const makeSquareRect = (clientX, clientY) => {
              const dx = clientX - startX;
              const dy = clientY - startY;
              const size = Math.max(8, Math.min(Math.abs(dx), Math.abs(dy)));
              const left = dx < 0 ? startX - size : startX;
              const top = dy < 0 ? startY - size : startY;
              return {
                x: Math.max(0, Math.round(left)),
                y: Math.max(0, Math.round(top)),
                width: Math.round(size),
                height: Math.round(size)
              };
            };

            const renderRect = (rect) => {
              if (!box) return;
              box.style.display = "block";
              box.style.left = rect.x + "px";
              box.style.top = rect.y + "px";
              box.style.width = rect.width + "px";
              box.style.height = rect.height + "px";
            };

            const onKeyDown = (event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cleanup();
                resolve(null);
              }
            };

            const onMouseDown = (event) => {
              event.preventDefault();
              dragging = true;
              startX = event.clientX;
              startY = event.clientY;
              lastRect = { x: startX, y: startY, width: 8, height: 8 };
              renderRect(lastRect);
            };
            const onMouseMove = (event) => {
              if (!dragging) return;
              lastRect = makeSquareRect(event.clientX, event.clientY);
              renderRect(lastRect);
            };
            const onMouseUp = (event) => {
              if (!dragging) return;
              event.preventDefault();
              dragging = false;
              lastRect = makeSquareRect(event.clientX, event.clientY);
              if (!lastRect || lastRect.width < 48 || lastRect.height < 48) {
                if (box) box.style.display = "none";
                lastRect = null;
                return;
              }
              cleanup();
              window.setTimeout(() => resolve(lastRect), 80);
            };

            captureButton.addEventListener("click", (event) => {
              event.preventDefault();
              startCaptureMode();
            });
            cancelButton.addEventListener("click", (event) => {
              event.preventDefault();
              cleanup();
              resolve(null);
            });
            startRecordMode();
          });
          `,
          true
        );

        if (!selection) {
          throw new Error("Capture was cancelled.");
        }

        const captureRect = {
          x: Math.max(0, Math.round(Number(selection.x) || 0)),
          y: Math.max(0, Math.round(Number(selection.y) || 0)),
          width: Math.max(1, Math.round(Number(selection.width) || 1)),
          height: Math.max(1, Math.round(Number(selection.height) || 1))
        };
        captureRect.height = captureRect.width;

        const image = await captureWindow.capturePage(captureRect);
        if (image.isEmpty()) {
          throw new Error("Capture result is empty.");
        }
        const squareImage = nativeImage.createFromBuffer(image.toPNG()).resize({
          width: 1080,
          height: 1080,
          quality: "best"
        });

        const capturesRoot = pathService.getAutomationStatePath("captures");
        fs.mkdirSync(capturesRoot, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const hostToken = sanitizeFileToken(parsedUrl.hostname || "source");
        const filePath = path.join(capturesRoot, `news-cover-${hostToken}-${timestamp}.png`);
        fs.writeFileSync(filePath, squareImage.toPNG());

        const statusPackagePath =
          packagePath?.trim() ||
          telegramControlService.getStatus().lastPackagePath ||
          undefined;
        let packageUpdated = false;
        let resolvedPackagePath: string | undefined;

        if (statusPackagePath) {
          try {
            productionPackageService.applyCardNewsCoverImage(statusPackagePath, filePath);
            packageUpdated = true;
            resolvedPackagePath = statusPackagePath;
          } catch {
            // Keep going: we still persist this path to workflow config below.
          }
        }

        workflowConfigService.set({
          cardNewsCoverImagePath: filePath
        });

        return {
          imagePath: filePath,
          packageUpdated,
          packagePath: resolvedPackagePath
        };
      } finally {
        if (!captureWindow.isDestroyed()) {
          captureWindow.close();
        }
      }
    }
  );
  ipcMain.handle(
    "automation:crawl:captureNewsSourceToVideoClip",
    async (event, sourceUrl: string, packagePath?: string) => {
      const normalizedUrl = sourceUrl?.trim();
      if (!normalizedUrl) {
        throw new Error("Source URL is required.");
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(normalizedUrl);
      } catch {
        throw new Error("Invalid source URL.");
      }

      if (!/^https?:$/i.test(parsedUrl.protocol)) {
        throw new Error("Only http/https URLs are supported for recording.");
      }

      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const captureWindow = new BrowserWindow({
        width: 1280,
        height: 920,
        show: true,
        autoHideMenuBar: true,
        title: "Record Source Clip",
        parent: ownerWindow ?? undefined,
        modal: Boolean(ownerWindow),
        webPreferences: {
          sandbox: true,
          contextIsolation: true
        }
      });

      const frameRate = 12;
      const waitForRecordStart = () =>
        new Promise<boolean>((resolve) => {
          const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const recordChannel = `mellowcat:source-record:start:${token}`;
          const cancelChannel = `mellowcat:source-record:cancel:${token}`;
          const controlWindow = new BrowserWindow({
            width: 430,
            height: 74,
            frame: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            show: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            parent: captureWindow,
            webPreferences: {
              nodeIntegration: true,
              contextIsolation: false,
              sandbox: false
            }
          });
          const cleanup = (value: boolean) => {
            ipcMain.removeListener(recordChannel, onRecord);
            ipcMain.removeListener(cancelChannel, onCancel);
            if (!controlWindow.isDestroyed()) {
              controlWindow.close();
            }
            resolve(value);
          };
          const onRecord = () => cleanup(true);
          const onCancel = () => cleanup(false);
          const positionControl = () => {
            if (controlWindow.isDestroyed() || captureWindow.isDestroyed()) {
              return;
            }
            const bounds = captureWindow.getBounds();
            controlWindow.setBounds({
              x: bounds.x + bounds.width - 450,
              y: bounds.y + 56,
              width: 430,
              height: 74
            });
          };
          ipcMain.once(recordChannel, onRecord);
          ipcMain.once(cancelChannel, onCancel);
          captureWindow.on("move", positionControl);
          captureWindow.on("resize", positionControl);
          controlWindow.on("closed", () => {
            captureWindow.off("move", positionControl);
            captureWindow.off("resize", positionControl);
            ipcMain.removeListener(recordChannel, onRecord);
            ipcMain.removeListener(cancelChannel, onCancel);
          });
          const html = encodeURIComponent(`
            <!doctype html>
            <html>
              <body style="margin:0;background:rgba(17,17,17,.94);color:#fff;font:600 13px sans-serif;overflow:hidden;">
                <div style="height:100%;display:flex;align-items:center;gap:8px;padding:10px;box-sizing:border-box;">
                  <span style="flex:1;white-space:nowrap;opacity:.9;">재생/스크롤 준비 후 9:16 영역 녹화</span>
                  <button id="record" style="border:0;border-radius:999px;padding:9px 13px;background:#ff3ea5;color:#fff;font:800 13px sans-serif;cursor:pointer;">동영상 저장</button>
                  <button id="cancel" style="border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:9px 12px;background:rgba(255,255,255,.08);color:#fff;font:800 13px sans-serif;cursor:pointer;">취소</button>
                </div>
                <script>
                  const { ipcRenderer } = require("electron");
                  document.getElementById("record").addEventListener("click", () => ipcRenderer.send(${JSON.stringify(recordChannel)}));
                  document.getElementById("cancel").addEventListener("click", () => ipcRenderer.send(${JSON.stringify(cancelChannel)}));
                </script>
              </body>
            </html>
          `);
          void controlWindow.loadURL(`data:text/html;charset=utf-8,${html}`).then(() => {
            positionControl();
            controlWindow.show();
            controlWindow.focus();
          });
        });
      const createRecordingStopControl = () => {
        let stopped = false;
        let elapsedSeconds = 0;
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const stopChannel = `mellowcat:source-record:stop:${token}`;
        const controlWindow = new BrowserWindow({
          width: 430,
          height: 78,
          frame: false,
          resizable: false,
          minimizable: false,
          maximizable: false,
          show: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          parent: captureWindow,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
          }
        });
        const positionControl = () => {
          if (controlWindow.isDestroyed() || captureWindow.isDestroyed()) {
            return;
          }
          const bounds = captureWindow.getBounds();
          controlWindow.setBounds({
            x: bounds.x + bounds.width - 450,
            y: bounds.y + 56,
            width: 430,
            height: 78
          });
        };
        const onStop = () => {
          stopped = true;
          if (!controlWindow.isDestroyed()) {
            controlWindow.webContents.send("mellowcat:source-record:stopping");
          }
        };
        ipcMain.once(stopChannel, onStop);
        captureWindow.on("move", positionControl);
        captureWindow.on("resize", positionControl);
        controlWindow.on("closed", () => {
          captureWindow.off("move", positionControl);
          captureWindow.off("resize", positionControl);
          ipcMain.removeListener(stopChannel, onStop);
        });
        const html = encodeURIComponent(`
          <!doctype html>
          <html>
            <body style="margin:0;background:rgba(17,17,17,.94);color:#fff;font:600 13px sans-serif;overflow:hidden;">
              <div style="height:100%;display:flex;align-items:center;gap:10px;padding:10px;box-sizing:border-box;">
                <div style="width:10px;height:10px;border-radius:50%;background:#ff3ea5;box-shadow:0 0 0 7px rgba(255,62,165,.18);"></div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:800;">녹화 중 <span id="elapsed">0초</span></div>
                  <div id="hint" style="opacity:.72;font-size:12px;margin-top:3px;">원하는 만큼 녹화한 뒤 종료하세요.</div>
                </div>
                <button id="stop" style="border:0;border-radius:999px;padding:10px 14px;background:#ff3ea5;color:#fff;font:900 13px sans-serif;cursor:pointer;">녹화 종료</button>
              </div>
              <script>
                const { ipcRenderer } = require("electron");
                const elapsed = document.getElementById("elapsed");
                const stop = document.getElementById("stop");
                const hint = document.getElementById("hint");
                let seconds = 0;
                const timer = setInterval(() => {
                  seconds += 1;
                  elapsed.textContent = seconds + "초";
                }, 1000);
                stop.addEventListener("click", () => {
                  stop.disabled = true;
                  stop.textContent = "저장 중...";
                  hint.textContent = "프레임을 mp4로 변환하고 있습니다.";
                  ipcRenderer.send(${JSON.stringify(stopChannel)});
                });
                ipcRenderer.on("mellowcat:source-record:stopping", () => {
                  stop.disabled = true;
                  stop.textContent = "저장 중...";
                  hint.textContent = "프레임을 mp4로 변환하고 있습니다.";
                  clearInterval(timer);
                });
              </script>
            </body>
          </html>
        `);
        void controlWindow.loadURL(`data:text/html;charset=utf-8,${html}`).then(() => {
          positionControl();
          controlWindow.show();
        });
        return {
          isStopped: () => stopped,
          tick: () => {
            elapsedSeconds += 1 / frameRate;
            return elapsedSeconds;
          },
          close: () => {
            ipcMain.removeListener(stopChannel, onStop);
            if (!controlWindow.isDestroyed()) {
              controlWindow.close();
            }
          }
        };
      };

      try {
        await captureWindow.loadURL(normalizedUrl);
        const shouldRecord = await waitForRecordStart();
        if (!shouldRecord) {
          throw new Error("Recording was cancelled.");
        }

        const selection = await captureWindow.webContents.executeJavaScript(
          `
          new Promise((resolve) => {
            const oldRoot = document.getElementById("__mellowcat_record_root");
            if (oldRoot) oldRoot.remove();

            const root = document.createElement("div");
            root.id = "__mellowcat_record_root";
            Object.assign(root.style, {
              position: "fixed",
              right: "18px",
              top: "18px",
              zIndex: "2147483647",
              display: "flex",
              gap: "8px",
              alignItems: "center",
              padding: "10px",
              borderRadius: "16px",
              background: "rgba(17,17,17,0.92)",
              color: "#fff",
              font: "600 13px sans-serif",
              boxShadow: "0 14px 40px rgba(0,0,0,0.35)"
            });

            const guide = document.createElement("span");
            guide.textContent = "Play/scroll first, then record a 9:16 area";
            Object.assign(guide.style, { whiteSpace: "nowrap", opacity: "0.9" });

            const recordButton = document.createElement("button");
            recordButton.type = "button";
            recordButton.textContent = "동영상 저장";
            Object.assign(recordButton.style, {
              border: "0",
              borderRadius: "999px",
              padding: "8px 12px",
              background: "#ff3ea5",
              color: "#fff",
              font: "700 13px sans-serif",
              cursor: "pointer"
            });

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "취소";
            Object.assign(cancelButton.style, {
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: "999px",
              padding: "8px 12px",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              font: "700 13px sans-serif",
              cursor: "pointer"
            });

            root.appendChild(guide);
            root.appendChild(recordButton);
            root.appendChild(cancelButton);

            let cleanedUp = false;
            let keepAliveTimer = null;
            const mountRoot = () => {
              if (cleanedUp) return;
              if (!document.documentElement.contains(root)) {
                document.documentElement.appendChild(root);
              }
            };
            mountRoot();
            keepAliveTimer = window.setInterval(mountRoot, 350);

            let overlay = null;
            let box = null;
            let startX = 0;
            let startY = 0;
            let dragging = false;
            let lastRect = null;

            const cleanup = () => {
              cleanedUp = true;
              if (keepAliveTimer) window.clearInterval(keepAliveTimer);
              window.removeEventListener("keydown", onKeyDown, true);
              if (overlay) overlay.remove();
              if (root.parentNode) root.remove();
            };

            const startRecordMode = () => {
              root.style.display = "none";
              overlay = document.createElement("div");
              overlay.id = "__mellowcat_record_overlay";
              Object.assign(overlay.style, {
                position: "fixed",
                inset: "0",
                zIndex: "2147483647",
                cursor: "crosshair",
                background: "rgba(0,0,0,0.20)",
                userSelect: "none"
              });

              box = document.createElement("div");
              Object.assign(box.style, {
                position: "fixed",
                display: "none",
                border: "3px solid #ff3ea5",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                background: "rgba(255,255,255,0.04)",
                boxSizing: "border-box"
              });

              const tip = document.createElement("div");
              tip.textContent = "Drag freely. The saved clip will be converted to 9:16. Press Esc to cancel.";
              Object.assign(tip.style, {
                position: "fixed",
                left: "50%",
                top: "18px",
                transform: "translateX(-50%)",
                padding: "10px 14px",
                borderRadius: "999px",
                background: "rgba(17,17,17,0.92)",
                color: "#fff",
                font: "600 13px sans-serif",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
              });

              overlay.appendChild(box);
              overlay.appendChild(tip);
              document.documentElement.appendChild(overlay);
              overlay.addEventListener("mousedown", onMouseDown);
              overlay.addEventListener("mousemove", onMouseMove);
              overlay.addEventListener("mouseup", onMouseUp);
              window.addEventListener("keydown", onKeyDown, true);
            };

            const makeVerticalRect = (clientX, clientY) => {
              const dx = clientX - startX;
              const dy = clientY - startY;
              const left = Math.min(startX, clientX);
              const top = Math.min(startY, clientY);
              const right = Math.max(startX, clientX);
              const bottom = Math.max(startY, clientY);
              return {
                x: Math.max(0, Math.round(left)),
                y: Math.max(0, Math.round(top)),
                width: Math.max(8, Math.round(Math.min(right, window.innerWidth) - Math.max(0, left))),
                height: Math.max(8, Math.round(Math.min(bottom, window.innerHeight) - Math.max(0, top)))
              };
            };

            const renderRect = (rect) => {
              if (!box) return;
              box.style.display = "block";
              box.style.left = rect.x + "px";
              box.style.top = rect.y + "px";
              box.style.width = rect.width + "px";
              box.style.height = rect.height + "px";
            };

            const onKeyDown = (event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cleanup();
                resolve(null);
              }
            };
            const onMouseDown = (event) => {
              event.preventDefault();
              dragging = true;
              startX = event.clientX;
              startY = event.clientY;
              lastRect = { x: startX, y: startY, width: 8, height: 8 };
              renderRect(lastRect);
            };
            const onMouseMove = (event) => {
              if (!dragging) return;
              lastRect = makeVerticalRect(event.clientX, event.clientY);
              renderRect(lastRect);
            };
            const onMouseUp = (event) => {
              if (!dragging) return;
              event.preventDefault();
              dragging = false;
              lastRect = makeVerticalRect(event.clientX, event.clientY);
              if (!lastRect || lastRect.width < 80 || lastRect.height < 80) {
                if (box) box.style.display = "none";
                lastRect = null;
                return;
              }
              cleanup();
              window.setTimeout(() => resolve(lastRect), 120);
            };

            recordButton.addEventListener("click", (event) => {
              event.preventDefault();
              startRecordMode();
            });
            cancelButton.addEventListener("click", (event) => {
              event.preventDefault();
              cleanup();
              resolve(null);
            });
          });
          `,
          true
        );

        if (!selection) {
          throw new Error("Recording was cancelled.");
        }

        const captureRect = {
          x: Math.max(0, Math.round(Number(selection.x) || 0)),
          y: Math.max(0, Math.round(Number(selection.y) || 0)),
          width: Math.max(1, Math.round(Number(selection.width) || 1)),
          height: Math.max(1, Math.round(Number(selection.height) || 1))
        };

        const capturesRoot = pathService.getAutomationStatePath("captures");
        fs.mkdirSync(capturesRoot, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const hostToken = sanitizeFileToken(parsedUrl.hostname || "source");
        const outputPath = path.join(capturesRoot, `source-video-${hostToken}-${timestamp}.mp4`);
        const debugLogPath = path.join(capturesRoot, `source-video-${hostToken}-${timestamp}.log`);
        const writeCaptureLog = (message: string) => {
          fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
        };
        writeCaptureLog(`start url=${normalizedUrl}`);

        if (process.platform !== "win32") {
          throw new Error("Smooth source recording is currently supported on Windows only.");
        }

        const contentBounds = captureWindow.getContentBounds();
        const display = screen.getDisplayNearestPoint({
          x: contentBounds.x + captureRect.x,
          y: contentBounds.y + captureRect.y
        });
        const scaleFactor = display.scaleFactor || 1;
        const screenCaptureRect = {
          x: Math.max(0, Math.round((contentBounds.x + captureRect.x - display.bounds.x) * scaleFactor)),
          y: Math.max(0, Math.round((contentBounds.y + captureRect.y - display.bounds.y) * scaleFactor)),
          width: Math.max(2, Math.round(captureRect.width * scaleFactor)),
          height: Math.max(2, Math.round(captureRect.height * scaleFactor))
        };
        writeCaptureLog(
          `bounds content=${JSON.stringify(contentBounds)} display=${JSON.stringify(display.bounds)} scale=${scaleFactor} selection=${JSON.stringify(captureRect)} screenCrop=${JSON.stringify(screenCaptureRect)}`
        );
        const allDisplays = screen.getAllDisplays();
        const displayIndex = Math.max(0, allDisplays.findIndex((candidate) => candidate.id === display.id));
        const screenSources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 }
        });
        const displaySource =
          screenSources.find((source) => source.display_id && String(source.display_id) === String(display.id)) ||
          screenSources.find((source) => new RegExp(`screen\\s*${displayIndex + 1}\\b`, "i").test(source.name)) ||
          screenSources[displayIndex] ||
          screenSources[0];
        writeCaptureLog(
          `screenSources=${screenSources.map((source) => `${source.name}:${source.id}:${source.display_id || ""}`).join(" | ")} selected=${displaySource?.name || "none"}`
        );
        if (!displaySource) {
          throw new Error("No screen source was found for loopback recording.");
        }

        await new Promise((resolve) => setTimeout(resolve, 350));
        const recordingControl = createRecordingStopControl();
        const rawOutputPath = path.join(capturesRoot, `source-video-raw-${hostToken}-${timestamp}.webm`);
        const ffmpegPath = getBundledFfmpegPath();
        const chromiumRecorder = await startChromiumLoopbackRecorder(rawOutputPath, displaySource, writeCaptureLog);
        const startedAt = Date.now();
        const pollStop = setInterval(() => {
          if (recordingControl.isStopped() || Date.now() - startedAt >= 180_000) {
            void chromiumRecorder.stop();
          }
        }, 100);
        try {
          await chromiumRecorder.done;
        } finally {
          clearInterval(pollStop);
          recordingControl.close();
        }
        if (!fs.existsSync(rawOutputPath) || fs.statSync(rawOutputPath).size <= 0) {
          throw new Error("Loopback recorder did not write a usable video file.");
        }
        writeCaptureLog(`raw complete path=${rawOutputPath} size=${fs.statSync(rawOutputPath).size}`);

        await new Promise<void>((resolve, reject) => {
          const cropFilter = [
            `crop=${screenCaptureRect.width}:${screenCaptureRect.height}:${screenCaptureRect.x}:${screenCaptureRect.y}`,
            "scale=1080:1920:force_original_aspect_ratio=decrease",
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
            "setsar=1"
          ].join(",");
          const ffmpegArgs = [
            "-y",
            "-i",
            rawOutputPath,
            "-vf",
            cropFilter,
            "-map",
            "0:v",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            outputPath
          ];
          writeCaptureLog(`ffmpeg ${ffmpegArgs.join(" ")}`);
          const child = spawn(ffmpegPath, ffmpegArgs, {
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"]
          });
          let stderr = "";
          let settled = false;
          child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
          });
          child.on("error", (error) => {
            if (!settled) {
              settled = true;
              reject(error);
            }
          });
          child.on("close", (code) => {
            writeCaptureLog(`ffmpeg close code=${code} stderr=${stderr.slice(-2000)}`);
            if (settled) {
              return;
            }
            settled = true;
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
              resolve();
              return;
            }
            reject(new Error(`FFmpeg screen recording failed with exit code ${code}. ${stderr.slice(-1200)}`));
          });
        });

        const statusPackagePath =
          packagePath?.trim() ||
          telegramControlService.getStatus().lastPackagePath ||
          undefined;
        let packageUpdated = false;
        let resolvedPackagePath: string | undefined;

        if (statusPackagePath) {
          try {
            const clipDir = path.join(statusPackagePath, "assets", "source-clips");
            fs.mkdirSync(clipDir, { recursive: true });
            const packageVideoPath = path.join(clipDir, path.basename(outputPath));
            fs.copyFileSync(outputPath, packageVideoPath);
            packageUpdated = true;
            resolvedPackagePath = statusPackagePath;
          } catch {
            // The saved clip remains available from the captures directory.
          }
        }

        return {
          videoPath: outputPath,
          packageUpdated,
          packagePath: resolvedPackagePath
        };
      } finally {
        if (!captureWindow.isDestroyed()) {
          captureWindow.close();
        }
      }
    }
  );
  ipcMain.handle("automation:workflow:openPackageFolder", async (_event, packagePath?: string) => {
    const resolvedPackagePath =
      packagePath?.trim() ||
      telegramControlService.getStatus().lastPackagePath ||
      undefined;
    if (!resolvedPackagePath) {
      throw new Error("No package path is available yet.");
    }
    if (!fs.existsSync(resolvedPackagePath)) {
      throw new Error(`Package path does not exist: ${resolvedPackagePath}`);
    }
    const result = await shell.openPath(resolvedPackagePath);
    if (result) {
      throw new Error(result);
    }
    return resolvedPackagePath;
  });
  ipcMain.handle("automation:create:listCardNewsTemplates", () =>
    loadUserCardNewsTemplates()
  );
  ipcMain.handle("automation:create:registerCardNewsTemplate", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Card news template images",
          extensions: ["png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return loadUserCardNewsTemplates();
    }

    const sourcePath = result.filePaths[0];
    const extension = path.extname(sourcePath).toLowerCase();
    if (!supportedCardNewsTemplateExtensions.has(extension)) {
      throw new Error("Unsupported card news template image format.");
    }

    const storePath = getCardNewsTemplateStorePath();
    fs.mkdirSync(storePath, { recursive: true });
    const baseName = path.basename(sourcePath, extension).trim() || "template";
    const id = `${Date.now()}-${sanitizeFileToken(baseName)}`;
    const fileName = `${id}${extension}`;
    const targetPath = path.join(storePath, fileName);
    fs.copyFileSync(sourcePath, targetPath);

    const templates = [
      ...loadUserCardNewsTemplates(),
      {
        id,
        name: baseName,
        role: inferCardNewsTemplateRole(baseName),
        imagePath: targetPath,
        thumbnailPath: targetPath
      }
    ];
    saveUserCardNewsTemplates(templates);
    return templates;
  });
  ipcMain.handle("automation:create:deleteCardNewsTemplate", (_event, templateId: string) => {
    const templates = loadUserCardNewsTemplates();
    const target = templates.find((template) => template.id === templateId);
    if (target && fs.existsSync(target.imagePath)) {
      const storePath = path.resolve(getCardNewsTemplateStorePath());
      const targetPath = path.resolve(target.imagePath);
      const relativeTarget = path.relative(storePath, targetPath);
      if (relativeTarget && !relativeTarget.startsWith("..") && !path.isAbsolute(relativeTarget)) {
        fs.rmSync(targetPath, { force: true });
      }
    }
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    saveUserCardNewsTemplates(nextTemplates);
    return nextTemplates;
  });
  ipcMain.handle("automation:youtube:getStatus", () => youTubeAuthService.getStatus());
  ipcMain.handle("automation:youtube:connect", () => youTubeAuthService.connect());
  ipcMain.handle("automation:youtube:disconnect", () => youTubeAuthService.disconnect());
  ipcMain.handle("automation:youtube:inspectUploadRequest", (_event, packagePath: string) =>
    youTubeAuthService.inspectUploadRequest(packagePath)
  );
  ipcMain.handle(
    "automation:youtube:updateUploadRequest",
    (_event, packagePath: string, patch: Partial<YouTubeUploadRequest>) =>
      youTubeAuthService.updateUploadRequest(packagePath, patch)
  );
  ipcMain.handle("automation:youtube:pickVideoFile", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Video files",
          extensions: ["mp4", "mov", "webm", "mkv"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:youtube:pickThumbnailFile", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Image files",
          extensions: ["png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:create:pickBackgroundFile", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        {
          name: "Media files",
          extensions: ["mp4", "mov", "webm", "mkv", "png", "jpg", "jpeg", "webp"]
        }
      ]
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:youtube:pickPackageFolder", async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openDirectory"],
      defaultPath: pathService.getAutomationPackagesRootPath()
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("automation:youtube:uploadPackage", (_event, packagePath: string) =>
    youTubeAuthService.uploadPackage(packagePath)
  );
  ipcMain.handle("automation:workflow:inspectJob", (_event, jobId: string) =>
    checkpointWorkflowService.inspectJob(jobId)
  );
  ipcMain.handle("automation:workflow:getCreateReadiness", (_event, jobId: string) =>
    productionPackageService.getCreateReadiness(jobId)
  );
  ipcMain.handle("automation:create:inspectSceneScript", (_event, packagePath: string) =>
    productionPackageService.inspectSceneScript(packagePath)
  );
  ipcMain.handle("automation:create:inspectEditorDraft", (_event, packagePath: string) =>
    productionPackageService.inspectEditorDraft(packagePath)
  );
  ipcMain.handle(
    "automation:create:saveEditorDraft",
    (
      _event,
      packagePath: string,
      document: SceneScriptDocument,
      saveReason: SceneScriptEditorDraft["saveReason"]
    ) => productionPackageService.saveEditorDraft(packagePath, document, saveReason)
  );
  ipcMain.handle("automation:create:inspectAiWorkspace", (_event, packagePath: string) =>
    productionPackageService.inspectAiWorkspace(packagePath)
  );
  ipcMain.handle(
    "automation:create:updateAiWorkspace",
    (_event, packagePath: string, workspace: NonNullable<SceneScriptDocument["aiWorkspace"]>) =>
      productionPackageService.updateAiWorkspace(packagePath, workspace)
  );
  ipcMain.handle(
    "automation:create:generateAiWorkspacePlan",
    async (_event, request: AiWorkspaceGenerateRequest) => generateAiWorkspacePlan(request)
  );
  ipcMain.handle(
    "automation:create:submitAiWorkspaceToManus",
    async (_event, request: AiWorkspaceManusSubmitRequest) => submitAiWorkspaceToManus(request)
  );
  ipcMain.handle(
    "automation:create:searchPixabayAssets",
    async (_event, request: PixabayAssetSearchRequest): Promise<PixabayAssetResult[]> => {
      const apiKey = request.apiKey?.trim();
      const query = request.query?.trim();
      if (!apiKey) {
        throw new Error("Pixabay API Key가 필요합니다.");
      }
      if (!query) {
        throw new Error("Pixabay 검색어를 입력해 주세요.");
      }

      const endpoint =
        request.mediaType === "video"
          ? "https://pixabay.com/api/videos/"
          : "https://pixabay.com/api/";
      const url = new URL(endpoint);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", query);
      url.searchParams.set("lang", "ko");
      url.searchParams.set("safesearch", "true");
      url.searchParams.set("order", "popular");
      url.searchParams.set("per_page", String(Math.max(3, Math.min(30, request.perPage ?? 12))));

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Pixabay API HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { hits?: Array<Record<string, unknown>> };
      const hits = Array.isArray(payload.hits) ? payload.hits : [];
      return hits
        .map((hit): PixabayAssetResult | undefined => {
          const id = String(hit.id ?? "");
          if (!id) {
            return undefined;
          }
          if (request.mediaType === "video") {
            const pickedVideo = pickPixabayVideoUrl(hit.videos);
            const previewUrl = pickPixabayVideoPreviewUrl(hit);
            if (!pickedVideo?.url) {
              return undefined;
            }
            return {
              id,
              mediaType: "video",
              title: String(hit.tags ?? `Pixabay video ${id}`),
              previewUrl,
              downloadUrl: pickedVideo.url,
              sourceUrl: typeof hit.pageURL === "string" ? hit.pageURL : "https://pixabay.com/videos/",
              width: pickedVideo.width,
              height: pickedVideo.height,
              durationSec: typeof hit.duration === "number" ? hit.duration : undefined,
              tags: typeof hit.tags === "string" ? hit.tags : undefined,
              user: typeof hit.user === "string" ? hit.user : undefined
            };
          }
          const downloadUrl =
            typeof hit.largeImageURL === "string"
              ? hit.largeImageURL
              : typeof hit.webformatURL === "string"
                ? hit.webformatURL
                : "";
          const previewUrl =
            typeof hit.previewURL === "string"
              ? hit.previewURL
              : typeof hit.webformatURL === "string"
                ? hit.webformatURL
                : "";
          if (!downloadUrl) {
            return undefined;
          }
          return {
            id,
            mediaType: "image",
            title: String(hit.tags ?? `Pixabay image ${id}`),
            previewUrl,
            downloadUrl,
            sourceUrl: typeof hit.pageURL === "string" ? hit.pageURL : "https://pixabay.com/images/",
            width: typeof hit.imageWidth === "number" ? hit.imageWidth : undefined,
            height: typeof hit.imageHeight === "number" ? hit.imageHeight : undefined,
            tags: typeof hit.tags === "string" ? hit.tags : undefined,
            user: typeof hit.user === "string" ? hit.user : undefined
          };
        })
        .filter((result): result is PixabayAssetResult => Boolean(result));
    }
  );
  ipcMain.handle(
    "automation:create:importPixabayAsset",
    async (_event, request: PixabayAssetImportRequest) => {
      const packagePath = request.packagePath?.trim();
      if (!packagePath || !fs.existsSync(packagePath)) {
        throw new Error("유효한 작업 패키지 경로가 필요합니다.");
      }
      const asset = request.asset;
      if (!asset?.downloadUrl) {
        throw new Error("가져올 Pixabay 자산 URL이 없습니다.");
      }
      const response = await fetch(asset.downloadUrl);
      if (!response.ok) {
        throw new Error(`Pixabay asset download HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const extension = getDownloadedAssetExtension(
        asset.mediaType,
        response.headers.get("content-type"),
        asset.downloadUrl
      );
      const libraryDir = path.join(packagePath, "assets", "library", "pixabay");
      fs.mkdirSync(libraryDir, { recursive: true });
      const token = sanitizeFileToken(`${asset.mediaType}-${asset.id}-${asset.title}`);
      const libraryPath = path.join(libraryDir, `${token}${extension}`);
      fs.writeFileSync(libraryPath, bytes);

      let localPath = libraryPath;
      let appliedSceneNo: number | undefined;
      if (request.applyToScene && request.sceneNo) {
        const sceneToken = String(request.sceneNo).padStart(2, "0");
        const scenePath = path.join(packagePath, "assets", `scene-${sceneToken}${extension}`);
        fs.mkdirSync(path.dirname(scenePath), { recursive: true });
        fs.copyFileSync(libraryPath, scenePath);
        localPath = scenePath;
        appliedSceneNo = request.sceneNo;
      }

      return {
        localPath,
        relativePath: path.relative(packagePath, localPath),
        appliedSceneNo
      };
    }
  );
  ipcMain.handle(
    "automation:create:searchFreesoundAudio",
    async (_event, request: FreesoundAudioSearchRequest): Promise<FreesoundAudioResult[]> => {
      const apiKey = request.apiKey?.trim();
      const query = request.query?.trim();
      if (!apiKey) {
        throw new Error("Freesound API Key가 필요합니다.");
      }
      if (!query) {
        throw new Error("오디오 검색어를 입력해 주세요.");
      }

      const url = new URL("https://freesound.org/apiv2/search/text/");
      url.searchParams.set("query", query);
      url.searchParams.set("filter", "duration:[1 TO 600]");
      url.searchParams.set("sort", "rating_desc");
      url.searchParams.set("page_size", String(Math.max(3, Math.min(30, request.perPage ?? 12))));
      url.searchParams.set("fields", "id,name,username,duration,previews,license,url,tags");

      const response = await fetch(url, {
        headers: {
          Authorization: `Token ${apiKey}`
        }
      });
      if (!response.ok) {
        throw new Error(`Freesound API HTTP ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
      const results = Array.isArray(payload.results) ? payload.results : [];
      return results
        .map((hit): FreesoundAudioResult | undefined => {
          const id = String(hit.id ?? "");
          const previews = hit.previews && typeof hit.previews === "object"
            ? (hit.previews as Record<string, unknown>)
            : {};
          const previewUrl =
            (typeof previews["preview-hq-mp3"] === "string" && previews["preview-hq-mp3"]) ||
            (typeof previews["preview-lq-mp3"] === "string" && previews["preview-lq-mp3"]) ||
            (typeof previews["preview-hq-ogg"] === "string" && previews["preview-hq-ogg"]) ||
            (typeof previews["preview-lq-ogg"] === "string" && previews["preview-lq-ogg"]) ||
            "";
          if (!id || !previewUrl) {
            return undefined;
          }
          return {
            id,
            title: String(hit.name ?? `Freesound audio ${id}`),
            previewUrl,
            downloadUrl: previewUrl,
            sourceUrl: typeof hit.url === "string" ? hit.url : `https://freesound.org/s/${id}/`,
            durationSec: typeof hit.duration === "number" ? hit.duration : undefined,
            tags: Array.isArray(hit.tags) ? hit.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
            user: typeof hit.username === "string" ? hit.username : undefined,
            license: typeof hit.license === "string" ? hit.license : undefined
          };
        })
        .filter((result): result is FreesoundAudioResult => Boolean(result));
    }
  );
  ipcMain.handle(
    "automation:create:importFreesoundAudio",
    async (_event, request: FreesoundAudioImportRequest): Promise<FreesoundAudioImportResult> => {
      const packagePath = request.packagePath?.trim();
      if (!packagePath || !fs.existsSync(packagePath)) {
        throw new Error("유효한 작업 패키지 경로가 필요합니다.");
      }
      const asset = request.asset;
      if (!asset?.downloadUrl) {
        throw new Error("가져올 Freesound 오디오 URL이 없습니다.");
      }
      const response = await fetch(asset.downloadUrl);
      if (!response.ok) {
        throw new Error(`Freesound audio download HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const extension = getDownloadedAssetExtension(
        "audio",
        response.headers.get("content-type"),
        asset.downloadUrl
      );
      const libraryDir = path.join(packagePath, "assets", "library", "freesound");
      fs.mkdirSync(libraryDir, { recursive: true });
      const token = sanitizeFileToken(`audio-${asset.id}-${asset.title}`);
      const localPath = path.join(libraryDir, `${token}${extension}`);
      fs.writeFileSync(localPath, bytes);
      return {
        localPath,
        relativePath: path.relative(packagePath, localPath)
      };
    }
  );
  ipcMain.handle(
    "automation:create:importLocalAsset",
    async (event, request: LocalAssetImportRequest) => {
      const packagePath = request.packagePath?.trim();
      if (!packagePath || !fs.existsSync(packagePath)) {
        throw new Error("유효한 작업 패키지 경로가 필요합니다.");
      }
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = {
        properties: ["openFile"],
        filters: [
          {
            name: "Media files",
            extensions: ["mp4", "mov", "webm", "mkv", "png", "jpg", "jpeg", "webp", "mp3", "wav", "m4a", "aac", "ogg", "flac"]
          }
        ]
      };
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) {
        return undefined;
      }

      const sourcePath = result.filePaths[0];
      const extension = path.extname(sourcePath).toLowerCase();
      const mediaType = getMediaTypeFromExtension(extension);
      if (!mediaType) {
        throw new Error("지원하지 않는 소재 파일 형식입니다.");
      }

      const libraryDir = path.join(packagePath, "assets", "library", "local");
      fs.mkdirSync(libraryDir, { recursive: true });
      const token = sanitizeFileToken(path.basename(sourcePath, extension));
      const libraryPath = path.join(libraryDir, `${Date.now()}-${token}${extension}`);
      fs.copyFileSync(sourcePath, libraryPath);

      let localPath = libraryPath;
      let appliedSceneNo: number | undefined;
      if (request.applyToScene && request.sceneNo) {
        const sceneToken = String(request.sceneNo).padStart(2, "0");
        const scenePath = path.join(packagePath, "assets", `scene-${sceneToken}${extension}`);
        fs.copyFileSync(libraryPath, scenePath);
        localPath = scenePath;
        appliedSceneNo = request.sceneNo;
      }

      return {
        localPath,
        relativePath: path.relative(packagePath, localPath),
        mediaType,
        appliedSceneNo
      };
    }
  );
  ipcMain.handle(
    "automation:create:listUploadedAssets",
    async (_event, packagePath: string): Promise<UploadedAssetRecord[]> => {
      const resolvedPackagePath = packagePath?.trim();
      if (!resolvedPackagePath || !fs.existsSync(resolvedPackagePath)) {
        return [];
      }
      return listUploadedPackageAssets(resolvedPackagePath);
    }
  );
  ipcMain.handle(
    "automation:create:deleteUploadedAsset",
    async (_event, packagePath: string, asset: UploadedAssetRecord): Promise<UploadedAssetRecord[]> => {
      const resolvedPackagePath = packagePath?.trim();
      if (!resolvedPackagePath || !fs.existsSync(resolvedPackagePath)) {
        return [];
      }
      const targetPath = assertUploadedAssetPath(resolvedPackagePath, asset);
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
        fs.unlinkSync(targetPath);
      }
      return listUploadedPackageAssets(resolvedPackagePath);
    }
  );
  ipcMain.handle(
    "automation:create:saveAiWorkspaceClipboardAsset",
    async (_event, request: AiWorkspaceClipboardAssetRequest): Promise<AiWorkspaceClipboardAssetResult> => {
      const packagePath = request.packagePath?.trim();
      if (!packagePath || !fs.existsSync(packagePath)) {
        throw new Error("AI workspace package path is required before saving clipboard images.");
      }

      const match = request.dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!match) {
        throw new Error("Clipboard image data was not a valid data URL.");
      }

      const mimeType = match[1] || "image/png";
      if (!mimeType.startsWith("image/")) {
        throw new Error("Only clipboard images can be saved to the AI workspace.");
      }

      const extension = getClipboardAssetExtension(mimeType);
      const fileName = request.fileName || `clipboard-image${extension}`;
      const token = sanitizeFileToken(path.basename(fileName, path.extname(fileName)));
      const libraryDir = path.join(packagePath, "assets", "library", "ai-workspace");
      fs.mkdirSync(libraryDir, { recursive: true });

      const localPath = path.join(libraryDir, `${Date.now()}-${token}${extension}`);
      fs.writeFileSync(localPath, Buffer.from(match[2], "base64"));

      return {
        localPath,
        relativePath: path.relative(packagePath, localPath),
        mediaType: "image",
        mimeType
      };
    }
  );
  ipcMain.handle(
    "automation:create:analyzeAiWorkspaceLink",
    async (_event, request: AiWorkspaceLinkAnalysisRequest): Promise<AiWorkspaceLinkAnalysisResult> => {
      const sourceUrl = request.sourceUrl?.trim();
      if (!sourceUrl) {
        throw new Error("Link URL is required.");
      }
      const parsedUrl = new URL(sourceUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only http and https links can be analyzed.");
      }

      const response = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      if (!response.ok) {
        throw new Error(`Link analysis failed with HTTP ${response.status}.`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        throw new Error(`Link analysis supports HTML pages only. (${contentType || "unknown content-type"})`);
      }

      const finalUrl = response.url || parsedUrl.toString();
      const html = await response.text();
      const $ = load(html);
      $("script, style, noscript, svg").remove();

      const getMeta = (...names: string[]) => {
        for (const name of names) {
          const value =
            $(`meta[property="${name}"]`).attr("content") ??
            $(`meta[name="${name}"]`).attr("content") ??
            $(`meta[itemprop="${name}"]`).attr("content");
          if (value?.trim()) {
            return value.trim();
          }
        }
        return "";
      };
      const title =
        getMeta("og:title", "twitter:title") ||
        $("title").first().text().trim() ||
        $("h1").first().text().trim() ||
        parsedUrl.hostname;
      const description =
        getMeta("og:description", "twitter:description", "description") ||
        $("article p").first().text().trim() ||
        $("p").first().text().trim();
      const imageUrl = toAbsolutePageUrl(getMeta("og:image", "twitter:image", "image"), finalUrl);
      const siteName = getMeta("og:site_name", "application-name") || parsedUrl.hostname;
      const author = getMeta("author", "article:author") || undefined;
      const publishedAt =
        getMeta("article:published_time", "pubdate", "date", "datePublished") ||
        $("time[datetime]").first().attr("datetime") ||
        undefined;

      const articleText = $("article").text().trim() || $("main").text().trim() || $("body").text().trim();
      const normalizedText = articleText.replace(/\s+/g, " ").trim();
      const excerpt = normalizedText.slice(0, 1400);
      const keywords = extractKeywordsFromText([title, description, excerpt].filter(Boolean).join(" "));

      return {
        sourceUrl: parsedUrl.toString(),
        finalUrl,
        title,
        description,
        siteName,
        imageUrl,
        author,
        publishedAt,
        keywords,
        excerpt
      };
    }
  );
  ipcMain.handle(
    "automation:create:generateVoiceLayer",
    async (_event, request: VoiceLayerGenerationRequest): Promise<VoiceLayerGenerationResult> => {
      const packagePath = request.packagePath?.trim();
      if (!packagePath || !fs.existsSync(packagePath)) {
        throw new Error("유효한 작업 패키지 경로가 필요합니다.");
      }
      const text = request.text?.trim();
      if (!text) {
        throw new Error("음성으로 만들 문장을 입력해 주세요.");
      }
      const result = await voiceoverService.generateStandaloneVoiceLayer(
        text,
        packagePath,
        request.voiceProfile
      );
      if (!result.relativePath || result.source === "none") {
        throw new Error(result.error ?? "음성 생성에 실패했습니다.");
      }
      const localPath = path.join(packagePath, result.relativePath);
      return {
        localPath,
        relativePath: result.relativePath,
        durationSec: result.durationSec,
        source: result.source
      };
    }
  );
  ipcMain.handle(
    "automation:create:updateSceneScript",
    (_event, packagePath: string, document: SceneScriptDocument) =>
      productionPackageService.updateSceneScript(packagePath, document)
  );
  ipcMain.handle(
    "automation:create:saveSceneCard",
    (_event, packagePath: string, document: SceneScriptDocument, sceneNo: number) =>
      productionPackageService.saveSceneCard(packagePath, document, sceneNo)
  );
  ipcMain.handle(
    "automation:create:saveCardPreviewImageAs",
    async (event, packagePath: string, sceneNo: number, pngBase64: string) => {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      const saveResult = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, {
            title: "Save Card Preview",
            defaultPath: path.join(packagePath, `card-${String(sceneNo).padStart(2, "0")}-preview.png`),
            filters: [{ name: "PNG Image", extensions: ["png"] }]
          })
        : await dialog.showSaveDialog({
            title: "Save Card Preview",
            defaultPath: path.join(packagePath, `card-${String(sceneNo).padStart(2, "0")}-preview.png`),
            filters: [{ name: "PNG Image", extensions: ["png"] }]
          });
      if (saveResult.canceled || !saveResult.filePath) {
        return undefined;
      }
      fs.mkdirSync(path.dirname(saveResult.filePath), { recursive: true });
      fs.writeFileSync(saveResult.filePath, Buffer.from(pngBase64, "base64"));
      return saveResult.filePath;
    }
  );
  ipcMain.handle(
    "automation:create:captureCardPreviewImageAs",
    async (
      event,
      packagePath: string,
      sceneNo: number,
      bounds: { x: number; y: number; width: number; height: number }
    ) => {
      const ownerWindow = BrowserWindow.fromWebContents(event.sender);
      if (!ownerWindow) {
        throw new Error("Owner window was not found.");
      }

      const captureRect = {
        x: Math.max(0, Math.round(bounds.x)),
        y: Math.max(0, Math.round(bounds.y)),
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height))
      };
      const captured = await ownerWindow.capturePage(captureRect);
      const saveResult = await dialog.showSaveDialog(ownerWindow, {
        title: "Save Card Preview",
        defaultPath: path.join(packagePath, `card-${String(sceneNo).padStart(2, "0")}-preview.png`),
        filters: [{ name: "PNG Image", extensions: ["png"] }]
      });
      if (saveResult.canceled || !saveResult.filePath) {
        return undefined;
      }
      fs.mkdirSync(path.dirname(saveResult.filePath), { recursive: true });
      fs.writeFileSync(saveResult.filePath, captured.toPNG());
      return saveResult.filePath;
    }
  );
  ipcMain.handle("automation:workflow:runCreatePipeline", (_event, jobId: string) =>
    productionPackageService.runCreatePipeline(jobId)
  );
  ipcMain.handle("automation:workflow:rerenderCreateComposition", (_event, jobId: string) =>
    productionPackageService.rerenderCreateComposition(jobId)
  );
  ipcMain.handle(
    "automation:workflow:rerenderCreateScenes",
    (_event, jobId: string, sceneIndexes: number[]) =>
      productionPackageService.rerenderCreateScenes(jobId, sceneIndexes)
  );
  ipcMain.handle(
    "automation:workflow:refreshCreateAssets",
    (_event, jobId: string, sceneIndexes: number[]) =>
      productionPackageService.refreshCreateAssets(jobId, sceneIndexes)
  );
  ipcMain.handle("automation:workflow:refreshCreateVoiceover", (_event, jobId: string) =>
    productionPackageService.refreshCreateVoiceover(jobId)
  );
  ipcMain.handle("automation:workflow:refreshCreateSubtitles", (_event, jobId: string) =>
    productionPackageService.refreshCreateSubtitles(jobId)
  );
  ipcMain.handle(
    "automation:workflow:saveManualInputCheckpoint",
    (_event, payload: ManualInputCheckpointPayload) =>
      checkpointWorkflowService.saveManualInputCheckpoint(payload)
  );
  ipcMain.handle(
    "automation:workflow:saveManualProcessCheckpoint",
    (_event, payload: ManualProcessCheckpointPayload) =>
      checkpointWorkflowService.saveManualProcessCheckpoint(payload)
  );
  ipcMain.handle(
    "automation:workflow:generateProcessDraft",
    async (_event, payload: AutoProcessDraftPayload) => {
      const snapshot = checkpointWorkflowService.inspectJob(payload.jobId);
      const inputCheckpoint = snapshot.checkpoints[1] as
        | {
            payload?: {
              candidates?: TrendCandidate[];
            };
          }
        | undefined;
      const candidates = inputCheckpoint?.payload?.candidates ?? [];
      if (!candidates.length) {
        throw new Error("checkpoint-1 후보가 없습니다. 먼저 후보를 저장해 주세요.");
      }

      const selectedCandidate =
        (payload.selectedCandidateId
          ? candidates.find((candidate) => candidate.id === payload.selectedCandidateId)
          : undefined) ?? candidates[0];
      if (!selectedCandidate?.title?.trim()) {
        throw new Error("선택한 후보 정보가 비어 있습니다. 다른 후보를 선택해 주세요.");
      }

      const now = new Date().toISOString();
      const job: AutomationJobSnapshot = {
        id: payload.jobId,
        title: selectedCandidate.title.trim() || snapshot.job?.title || "Process draft job",
        stage: "awaiting_review",
        createdAt: snapshot.job?.createdAt ?? now,
        updatedAt: now
      };
      const scriptCategory = payload.scriptCategory ?? "community";
      const ideaStrategy =
        payload.ideaStrategy === "pattern_remix" ||
        payload.ideaStrategy === "series_ip" ||
        payload.ideaStrategy === "comment_gap"
          ? payload.ideaStrategy
          : "comment_gap";
      const lengthMode =
        payload.lengthMode === "shortform" ||
        payload.lengthMode === "longform" ||
        payload.lengthMode === "auto"
          ? payload.lengthMode
          : "auto";
      const draftMode =
        payload.draftMode === "manual_polish" || payload.draftMode === "auto_generate"
          ? payload.draftMode
          : workflowConfigService.get().processDraftMode ?? "manual_polish";
      const sourceDraft = payload.sourceDraft
        ? {
            headline: payload.sourceDraft.headline?.trim() || undefined,
            summary: payload.sourceDraft.summary?.trim() || undefined,
            titleOptions: Array.isArray(payload.sourceDraft.titleOptions)
              ? payload.sourceDraft.titleOptions
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .slice(0, 5)
              : undefined,
            hook: payload.sourceDraft.hook?.trim() || undefined,
            narration: payload.sourceDraft.narration?.trim() || undefined,
            callToAction: payload.sourceDraft.callToAction?.trim() || undefined,
            operatorMemo: payload.sourceDraft.operatorMemo?.trim() || undefined
          }
        : undefined;
      const revisionRequest = payload.revisionRequest?.trim() || undefined;
      const draftResult = await shortformScriptService.generateDraft(
        selectedCandidate.title.trim(),
        revisionRequest,
        scriptCategory,
        ideaStrategy,
        lengthMode,
        draftMode,
        sourceDraft
      );

      checkpointWorkflowService.writeProcessCheckpoint({
        job,
        mode: "manual",
        selectedCandidateId: selectedCandidate.id,
        selectedCandidate,
        draft: draftResult.draft,
        scriptCategory,
        ideaStrategy,
        lengthMode,
        draftMode,
        revisionRequest,
        source: draftResult.source,
        error: draftResult.error
      });

      return checkpointWorkflowService.inspectJob(payload.jobId);
    }
  );
  ipcMain.handle(
    "automation:workflow:saveManualCreateCheckpoint",
    (_event, payload: ManualCreateCheckpointPayload) =>
      checkpointWorkflowService.saveManualCreateCheckpoint(payload)
  );
  ipcMain.handle(
    "automation:workflow:saveManualOutputCheckpoint",
    (_event, payload: ManualOutputCheckpointPayload) =>
      checkpointWorkflowService.saveManualOutputCheckpoint(payload)
  );
}
