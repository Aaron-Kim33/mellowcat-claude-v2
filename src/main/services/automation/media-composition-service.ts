import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { GeneratedMediaPackageManifest } from "../../../common/types/media-generation";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";

export interface MediaCompositionResult {
  source: "ffmpeg" | "none";
  manifest: GeneratedMediaPackageManifest;
  relativePath?: string;
  error?: string;
}

export interface MediaCompositionOptions {
  rerenderSceneIndexes?: number[];
}

export class MediaCompositionService {
  private static readonly FFMPEG_TIMEOUT_MS = 12 * 60 * 1000;
  private static readonly BACKGROUND_COMPOSER_SPEED = 1.1;

  constructor(
    private readonly fileService: FileService,
    private readonly pathService: PathService
  ) {}

  async composeFinalVideo(
    manifest: GeneratedMediaPackageManifest,
    packagePath: string,
    options?: MediaCompositionOptions
  ): Promise<MediaCompositionResult> {
    const voiceoverPath = manifest.artifacts.voiceoverPath
      ? path.join(packagePath, manifest.artifacts.voiceoverPath)
      : "";
    const subtitlePath = manifest.artifacts.subtitlePath
      ? path.join(packagePath, manifest.artifacts.subtitlePath)
      : "";

    if (!voiceoverPath || !fs.existsSync(voiceoverPath)) {
      return {
        source: "none",
        manifest,
        error: "Voiceover audio was not generated, so final composition was skipped."
      };
    }

    const assetsDir = path.join(packagePath, "assets");
    const renderDir = path.join(packagePath, "render");
    this.fileService.ensureDir(assetsDir);
    this.fileService.ensureDir(renderDir);

    const rerenderSceneIndexSet =
      options?.rerenderSceneIndexes && options.rerenderSceneIndexes.length > 0
        ? new Set(options.rerenderSceneIndexes)
        : undefined;
    const preparedScenes: string[] = [];
    const updatedScenes: GeneratedMediaPackageManifest["scenes"] = [];

    for (const scene of manifest.scenes) {
      const shouldRerender =
        !rerenderSceneIndexSet || rerenderSceneIndexSet.has(scene.sceneIndex);
      const resolvedAsset = await this.resolveSceneAsset(
        scene,
        packagePath,
        assetsDir,
        shouldRerender
      );
      if (!resolvedAsset?.localPath) {
        updatedScenes.push(scene);
        continue;
      }

      const preparedClipPath = path.join(
        renderDir,
        `scene-${scene.sceneIndex.toString().padStart(2, "0")}.mp4`
      );
      const canReusePreparedClip = !shouldRerender && fs.existsSync(preparedClipPath);
      if (canReusePreparedClip) {
        preparedScenes.push(preparedClipPath);
        updatedScenes.push({
          ...scene,
          selectedAsset: resolvedAsset
        });
        continue;
      }

      const durationSec = Math.max(
        1,
        scene.trim.sourceEndSec - scene.trim.sourceStartSec || 1
      );
      const sourceAssetPath = path.resolve(packagePath, resolvedAsset.localPath);
      const sceneFilter = this.buildSceneFilter(scene.motion, durationSec);
      const inputArgs =
        resolvedAsset.assetType === "image"
          ? ["-loop", "1", "-i", sourceAssetPath]
          : ["-stream_loop", "-1", "-i", sourceAssetPath];

      await this.runFfmpeg(
        [
        "-y",
        ...inputArgs,
        "-t",
        durationSec.toString(),
        "-vf",
        sceneFilter,
        "-r",
        "30",
        "-an",
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        preparedClipPath
        ],
        {
          packagePath,
          logName: `ffmpeg-scene-${scene.sceneIndex.toString().padStart(2, "0")}.log`
        }
      );

      preparedScenes.push(preparedClipPath);
      updatedScenes.push({
        ...scene,
        selectedAsset: resolvedAsset
      });
    }

    if (preparedScenes.length === 0) {
      return {
        source: "none",
        manifest,
        error: "No local scene assets were ready for FFmpeg composition."
      };
    }

    const concatListPath = path.join(renderDir, "concat.txt");
    this.fileService.writeTextFile(
      concatListPath,
      preparedScenes
        .map((clipPath) => `file '${clipPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
        .join("\n")
    );

    const finalRelativePath = "final-video.mp4";
    const finalVideoPath = path.join(packagePath, finalRelativePath);
    const ffmpegArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-i",
      voiceoverPath
    ];

    const hasSubtitle = Boolean(subtitlePath && fs.existsSync(subtitlePath));
    const compositionOptions = manifest.compositionOptions;
    const burnSubtitles =
      hasSubtitle &&
      (manifest.provider === "background-subtitle-composer-mcp" ||
        compositionOptions?.burnSubtitles === true);
    const speedFactor =
      manifest.provider === "background-subtitle-composer-mcp"
        ? MediaCompositionService.BACKGROUND_COMPOSER_SPEED
        : compositionOptions?.speedFactor;
    const speedAdjusted = typeof speedFactor === "number" && Number.isFinite(speedFactor) && speedFactor > 0;
    const outputCrf =
      typeof compositionOptions?.videoCrf === "number" && Number.isFinite(compositionOptions.videoCrf)
        ? String(compositionOptions.videoCrf)
        : "18";
    const outputPreset = compositionOptions?.videoPreset ?? "medium";
    if (hasSubtitle) {
      ffmpegArgs.push("-i", subtitlePath);
    }

    if (speedAdjusted) {
      const videoFilters: string[] = [];
      if (burnSubtitles) {
        videoFilters.push(this.buildSubtitleFilter(subtitlePath));
      }
      videoFilters.push(`setpts=PTS/${speedFactor}`);
      ffmpegArgs.push(
        "-filter_complex",
        `[0:v]${videoFilters.join(",")}[v];[1:a]atempo=${speedFactor}[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]"
      );
    } else {
      ffmpegArgs.push("-map", "0:v:0", "-map", "1:a:0");
      if (hasSubtitle && !burnSubtitles) {
        ffmpegArgs.push("-map", "2:0");
      }
    }

    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-crf",
      outputCrf,
      "-preset",
      outputPreset,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac"
    );

    if (burnSubtitles && !speedAdjusted) {
      ffmpegArgs.push("-vf", this.buildSubtitleFilter(subtitlePath));
    } else if (hasSubtitle && !speedAdjusted) {
      ffmpegArgs.push("-c:s", "mov_text");
    }
    ffmpegArgs.push("-shortest", finalVideoPath);

    await this.runFfmpeg(ffmpegArgs, {
      packagePath,
      logName: "ffmpeg-compose.log"
    });

    return {
      source: "ffmpeg",
      relativePath: finalRelativePath,
      manifest: {
        ...manifest,
        scenes: updatedScenes,
        artifacts: {
          ...manifest.artifacts,
          finalVideoPath: finalRelativePath
        }
      }
    };
  }

  private async resolveSceneAsset(
    scene: GeneratedMediaPackageManifest["scenes"][number],
    packagePath: string,
    assetsDir: string,
    forceRefresh: boolean
  ) {
    let selectedAsset = scene.selectedAsset;
    if (!selectedAsset) {
      return undefined;
    }

    if (
      selectedAsset.localPath &&
      (!forceRefresh || !selectedAsset.sourceUrl || selectedAsset.provider === "local")
    ) {
      return selectedAsset;
    }

    if (!selectedAsset.sourceUrl) {
      return selectedAsset;
    }

    const extension = selectedAsset.assetType === "image" ? ".jpg" : ".mp4";
    const relativePath = path.join(
      "assets",
      `scene-${scene.sceneIndex.toString().padStart(2, "0")}${extension}`
    );
    const absolutePath = path.join(packagePath, relativePath);

    if (!forceRefresh && fs.existsSync(absolutePath)) {
      return {
        ...selectedAsset,
        localPath: relativePath
      };
    }

    const decodedDataImage = this.decodeDataImageSource(selectedAsset.sourceUrl);
    if (decodedDataImage) {
      this.fileService.writeBinaryFile(path.join(assetsDir, path.basename(absolutePath)), decodedDataImage);
    } else {
      let response = await fetch(selectedAsset.sourceUrl);
      let resolvedSourceUrl = selectedAsset.sourceUrl;

      if (!response.ok && selectedAsset.provider === "flux") {
        const fallbackUrl = this.buildFluxFallbackUrl(selectedAsset.sourceUrl);
        if (fallbackUrl) {
          response = await fetch(fallbackUrl);
          if (response.ok) {
            resolvedSourceUrl = fallbackUrl;
          }
        }
      }

      if (!response.ok) {
        throw new Error(`Asset download failed: HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      this.fileService.writeBinaryFile(path.join(assetsDir, path.basename(absolutePath)), buffer);
      selectedAsset = {
        ...selectedAsset,
        sourceUrl: resolvedSourceUrl
      };
    }

    return {
      ...selectedAsset,
      localPath: relativePath
    };
  }

  private decodeDataImageSource(sourceUrl?: string): Buffer | undefined {
    if (!sourceUrl || !sourceUrl.startsWith("data:image/")) {
      return undefined;
    }

    const splitIndex = sourceUrl.indexOf(",");
    if (splitIndex <= 0) {
      return undefined;
    }

    const header = sourceUrl.slice(0, splitIndex).toLowerCase();
    if (!header.includes(";base64")) {
      return undefined;
    }

    try {
      const encoded = sourceUrl.slice(splitIndex + 1);
      const buffer = Buffer.from(encoded, "base64");
      return buffer.length ? buffer : undefined;
    } catch {
      return undefined;
    }
  }

  private buildFluxFallbackUrl(sourceUrl: string): string | undefined {
    try {
      const url = new URL(sourceUrl);
      if (!url.hostname.includes("pollinations.ai")) {
        return undefined;
      }

      const promptPrefix = "/prompt/";
      const pathName = url.pathname;
      const promptIndex = pathName.indexOf(promptPrefix);
      if (promptIndex === -1) {
        return undefined;
      }

      const encodedPrompt = pathName.slice(promptIndex + promptPrefix.length);
      const decodedPrompt = decodeURIComponent(encodedPrompt)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140);
      if (!decodedPrompt) {
        return undefined;
      }

      return `https://image.pollinations.ai/prompt/${encodeURIComponent(decodedPrompt)}?width=1080&height=1920&seed=${Date.now()}&nologo=true`;
    } catch {
      return undefined;
    }
  }

  private runFfmpeg(
    args: string[],
    options: {
      packagePath: string;
      logName: string;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegExecutable = this.resolveFfmpegExecutable();
      if (!ffmpegExecutable) {
        reject(
          new Error(
            "Bundled FFmpeg was not found. Please place ffmpeg in the launcher bundled tools directory."
          )
        );
        return;
      }

      const logPath = path.join(options.packagePath, options.logName);
      this.fileService.writeTextFile(
        logPath,
        [`[start] ${new Date().toISOString()}`, ffmpegExecutable, ...args].join("\n")
      );

      const child = spawn(ffmpegExecutable, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stderr = "";
      let stdout = "";
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGKILL");
        fs.appendFileSync(
          logPath,
          `\n[timeout] ${new Date().toISOString()}\nFFmpeg timed out after ${MediaCompositionService.FFMPEG_TIMEOUT_MS}ms.\n`,
          "utf-8"
        );
        reject(
          new Error(
            `FFmpeg timed out after ${Math.round(MediaCompositionService.FFMPEG_TIMEOUT_MS / 1000)} seconds.`
          )
        );
      }, MediaCompositionService.FFMPEG_TIMEOUT_MS);

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        fs.appendFileSync(
          logPath,
          `\n[error] ${new Date().toISOString()}\n${error.message}\n`,
          "utf-8"
        );
        reject(error);
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const combinedOutput = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n");
        fs.appendFileSync(
          logPath,
          `\n[close] ${new Date().toISOString()}\nexit=${code}\n${combinedOutput}\n`,
          "utf-8"
        );
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `ffmpeg exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  private resolveFfmpegExecutable(): string | undefined {
    const candidates = process.platform === "win32"
      ? [
          this.pathService.getBundledToolPath("ffmpeg.exe"),
          this.pathService.getBundledToolPath("ffmpeg")
        ]
      : [
          this.pathService.getBundledToolPath("ffmpeg"),
          this.pathService.getBundledToolPath("ffmpeg.exe")
        ];

    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  private buildSubtitleFilter(subtitlePath: string): string {
    const escapedSubtitlePath = subtitlePath
      .replace(/\\/g, "/")
      .replace(/:/g, "\\:")
      .replace(/,/g, "\\,")
      .replace(/'/g, "\\'");
    const bundledFontsPath = this.pathService.getBundledFontsPath();

    if (fs.existsSync(bundledFontsPath)) {
      const escapedFontsPath = bundledFontsPath
        .replace(/\\/g, "/")
        .replace(/:/g, "\\:")
        .replace(/,/g, "\\,")
        .replace(/'/g, "\\'");
      return `subtitles='${escapedSubtitlePath}':fontsdir='${escapedFontsPath}'`;
    }

    return `subtitles='${escapedSubtitlePath}'`;
  }

  private buildSceneFilter(
    motion: GeneratedMediaPackageManifest["scenes"][number]["motion"] | undefined,
    durationSec: number
  ): string {
    const safeDuration = Math.max(1, Number(durationSec) || 1);
    const base = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1";

    if (!motion || motion === "none") {
      return base;
    }

    if (motion === "zoom-in") {
      return `scale='1080+160*(t/${safeDuration})':'1920+284*(t/${safeDuration})':eval=frame,crop=1080:1920,setsar=1`;
    }

    if (motion === "zoom-out") {
      return `scale='1240-160*(t/${safeDuration})':'2204-284*(t/${safeDuration})':eval=frame,crop=1080:1920,setsar=1`;
    }

    if (motion === "pan-left") {
      return `scale=1240:2204,crop=1080:1920:x='(in_w-out_w)/2-100*(t/${safeDuration})':y='(in_h-out_h)/2',setsar=1`;
    }

    if (motion === "pan-right") {
      return `scale=1240:2204,crop=1080:1920:x='(in_w-out_w)/2+100*(t/${safeDuration})':y='(in_h-out_h)/2',setsar=1`;
    }

    if (motion === "shake") {
      return "scale=1160:2062,crop=1080:1920:x='(in_w-out_w)/2+14*sin(25*t)':y='(in_h-out_h)/2+10*sin(33*t)',setsar=1";
    }

    if (motion === "wipe-transition") {
      return `scale=1240:2204,crop=1080:1920:x='(in_w-out_w)*(t/${safeDuration})':y='(in_h-out_h)/2',setsar=1`;
    }

    return base;
  }
}
