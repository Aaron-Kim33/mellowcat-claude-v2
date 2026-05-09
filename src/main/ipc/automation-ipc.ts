import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import type {
  AutomationJobSnapshot,
  ShortformWorkflowConfig
} from "../../common/types/automation";
import type {
  CardNewsTemplateRecord,
  LocalAssetImportRequest,
  PixabayAssetImportRequest,
  PixabayAssetResult,
  PixabayAssetSearchRequest,
  SceneScriptDocument,
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
  const runBundledFfmpeg = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const candidates = [
        pathService.getBundledToolPath("ffmpeg.exe"),
        pathService.getBundledToolPath("ffmpeg")
      ];
      const ffmpegPath = candidates.find((candidate) => fs.existsSync(candidate));
      if (!ffmpegPath) {
        reject(new Error("Bundled FFmpeg was not found. Put ffmpeg.exe in resources/bundled/dev."));
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
    mediaType: "video" | "image",
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
    return mediaType === "video" ? ".mp4" : ".jpg";
  };
  const getMediaTypeFromExtension = (extension: string): "video" | "image" | undefined => {
    if ([".mp4", ".mov", ".webm", ".mkv"].includes(extension.toLowerCase())) {
      return "video";
    }
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension.toLowerCase())) {
      return "image";
    }
    return undefined;
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
        const frameRoot = path.join(capturesRoot, `source-video-frames-${hostToken}-${timestamp}`);
        fs.mkdirSync(frameRoot, { recursive: true });

        await new Promise((resolve) => setTimeout(resolve, 350));
        const recordingControl = createRecordingStopControl();
        let capturedFrameCount = 0;
        try {
          while (!recordingControl.isStopped()) {
            const image = await captureWindow.capturePage(captureRect);
            if (image.isEmpty()) {
              throw new Error("Recording frame capture result is empty.");
            }
            capturedFrameCount += 1;
            const framePath = path.join(
              frameRoot,
              `frame-${String(capturedFrameCount).padStart(4, "0")}.png`
            );
            fs.writeFileSync(framePath, image.toPNG());
            const elapsed = recordingControl.tick();
            if (elapsed >= 180) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, Math.round(1000 / frameRate)));
          }
        } finally {
          recordingControl.close();
        }
        if (capturedFrameCount < 2) {
          throw new Error("Recording is too short. Capture at least a moment before stopping.");
        }

        const outputPath = path.join(capturesRoot, `source-video-${hostToken}-${timestamp}.mp4`);
        await runBundledFfmpeg([
          "-y",
          "-framerate",
          String(frameRate),
          "-i",
          path.join(frameRoot, "frame-%04d.png"),
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-r",
          "30",
          outputPath
        ]);
        fs.rmSync(frameRoot, { recursive: true, force: true });

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
            extensions: ["mp4", "mov", "webm", "mkv", "png", "jpg", "jpeg", "webp"]
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
