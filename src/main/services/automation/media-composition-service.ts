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

export class MediaCompositionService {
  constructor(
    private readonly fileService: FileService,
    private readonly pathService: PathService
  ) {}

  async composeFinalVideo(
    manifest: GeneratedMediaPackageManifest,
    packagePath: string
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

    const preparedScenes = [];
    const updatedScenes = [];

    for (const scene of manifest.scenes) {
      const resolvedAsset = await this.resolveSceneAsset(scene, packagePath, assetsDir);
      if (!resolvedAsset?.localPath) {
        updatedScenes.push(scene);
        continue;
      }

      const preparedClipPath = path.join(
        renderDir,
        `scene-${scene.sceneIndex.toString().padStart(2, "0")}.mp4`
      );
      const durationSec = Math.max(
        1,
        scene.trim.sourceEndSec - scene.trim.sourceStartSec || 1
      );

      await this.runFfmpeg([
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        path.resolve(packagePath, resolvedAsset.localPath),
        "-t",
        durationSec.toString(),
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
        "-r",
        "30",
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        preparedClipPath
      ]);

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
    if (hasSubtitle) {
      ffmpegArgs.push("-i", subtitlePath);
    }

    ffmpegArgs.push("-map", "0:v:0", "-map", "1:a:0");
    if (hasSubtitle) {
      ffmpegArgs.push("-map", "2:0");
    }
    ffmpegArgs.push(
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac"
    );
    if (hasSubtitle) {
      ffmpegArgs.push("-c:s", "mov_text");
    }
    ffmpegArgs.push("-shortest", finalVideoPath);

    await this.runFfmpeg(ffmpegArgs);

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
    assetsDir: string
  ) {
    const selectedAsset = scene.selectedAsset;
    if (!selectedAsset) {
      return undefined;
    }

    if (selectedAsset.localPath) {
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

    if (!fs.existsSync(absolutePath)) {
      const response = await fetch(selectedAsset.sourceUrl);
      if (!response.ok) {
        throw new Error(`Asset download failed: HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      this.fileService.writeBinaryFile(path.join(assetsDir, path.basename(absolutePath)), buffer);
    }

    return {
      ...selectedAsset,
      localPath: relativePath
    };
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegExecutable = this.resolveFfmpegExecutable();
      if (!ffmpegExecutable) {
        reject(
          new Error(
            "Bundled FFmpeg was not found. Expected it under resources/bundled/dev/ffmpeg(.exe)."
          )
        );
        return;
      }

      const child = spawn(ffmpegExecutable, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stderr = "";
      let stdout = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
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
}
