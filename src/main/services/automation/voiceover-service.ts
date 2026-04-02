import fs from "node:fs";
import { spawn } from "node:child_process";
import type { WorkflowAiConnectionRef } from "../../../common/types/automation";
import type { VoiceoverCue } from "../../../common/types/media-generation";
import { SettingsRepository } from "../storage/settings-repository";
import { FileService } from "../system/file-service";
import { PathService } from "../system/path-service";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";

export interface VoiceoverGenerationResult {
  source: "azure" | "openai" | "none";
  relativePath?: string;
  durationSec?: number;
  error?: string;
}

export class VoiceoverService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly workflowConfigService: ShortformWorkflowConfigService,
    private readonly fileService: FileService,
    private readonly pathService: PathService
  ) {}

  async generateVoiceover(
    cues: VoiceoverCue[],
    packagePath: string
  ): Promise<VoiceoverGenerationResult> {
    const input = cues.map((cue) => cue.text.trim()).filter(Boolean).join("\n\n");
    if (!input) {
      return {
        source: "none",
        error: "No voiceover cues were available."
      };
    }

    const apiKey = this.resolveOpenAiApiKey();
    const settings = this.settingsRepository.get();
    const azureSpeechKey = settings.azureSpeechKey?.trim();
    const azureSpeechRegion = settings.azureSpeechRegion?.trim();
    const azureSpeechVoice = settings.azureSpeechVoice?.trim() || "ko-KR-SunHiNeural";

    if (azureSpeechKey && azureSpeechRegion) {
      return this.generateWithAzure(cues, input, packagePath, azureSpeechKey, azureSpeechRegion, azureSpeechVoice);
    }

    if (!apiKey) {
      return {
        source: "none",
        error: "No Azure Speech or OpenAI TTS credentials were available."
      };
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input,
        response_format: "mp3",
        instructions:
          "Speak natural Korean for a shortform video narration. Keep pacing clear and emotionally steady."
      })
    });

    if (!response.ok) {
      return {
        source: "none",
        error: `OpenAI TTS HTTP ${response.status}: ${await response.text()}`
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const relativePath = "voiceover.mp3";
    this.fileService.writeBinaryFile(
      `${packagePath}\\${relativePath}`,
      Buffer.from(arrayBuffer)
    );

    const durationSec = await this.probeDurationSec(`${packagePath}\\${relativePath}`);
    return {
      source: "openai",
      relativePath,
      durationSec
    };
  }

  private async generateWithAzure(
    cues: VoiceoverCue[],
    input: string,
    packagePath: string,
    speechKey: string,
    speechRegion: string,
    speechVoice: string
  ): Promise<VoiceoverGenerationResult> {
    const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const styledResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "MellowCat Launcher"
      },
      body: this.buildAzureSsml(cues, input, speechVoice, true)
    });

    let response = styledResponse;
    if (!styledResponse.ok) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": speechKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "MellowCat Launcher"
        },
        body: this.buildAzureSsml(cues, input, speechVoice, false)
      });
    }

    if (!response.ok) {
      return {
        source: "none",
        error: `Azure Speech HTTP ${response.status}: ${await response.text()}`
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const relativePath = "voiceover.mp3";
    this.fileService.writeBinaryFile(
      `${packagePath}\\${relativePath}`,
      Buffer.from(arrayBuffer)
    );

    const durationSec = await this.probeDurationSec(`${packagePath}\\${relativePath}`);
    return {
      source: "azure",
      relativePath,
      durationSec
    };
  }

  private resolveOpenAiApiKey(): string | undefined {
    const settings = this.settingsRepository.get();
    const workflowConfig = this.workflowConfigService.get();
    const preferredConnection = workflowConfig.createAiConnection ?? "connection_1";

    const fromConnection = this.resolveConnectionKey(preferredConnection, settings);
    if (fromConnection) {
      return fromConnection;
    }

    return (
      settings.openAiApiKey?.trim() ||
      settings.secondaryOpenAiApiKey?.trim() ||
      workflowConfig.openAiApiKey?.trim()
    );
  }

  private resolveConnectionKey(
    connection: WorkflowAiConnectionRef,
    settings: ReturnType<SettingsRepository["get"]>
  ): string | undefined {
    if (connection === "connection_2") {
      return settings.secondaryOpenAiApiKey?.trim();
    }

    return settings.openAiApiKey?.trim();
  }

  private buildAzureSsml(
    cues: VoiceoverCue[],
    input: string,
    voice: string,
    useStyle: boolean
  ): string {
    const paragraphs = (cues.length > 0 ? cues.map((cue) => cue.text) : [input])
      .map((text) => this.normalizeSpeechText(text))
      .filter(Boolean)
      .map((text) => `<p><s>${this.escapeXml(text)}</s></p>`);

    const body = paragraphs.length > 0
      ? paragraphs.join("<break time='350ms'/>")
      : `<p><s>${this.escapeXml(this.normalizeSpeechText(input))}</s></p>`;

    return [
      "<speak version='1.0' xml:lang='ko-KR' xmlns:mstts='https://www.w3.org/2001/mstts'>",
      `<voice name='${this.escapeXml(voice)}'>`,
      useStyle ? "<mstts:express-as style='calm'>" : "",
      body,
      useStyle ? "</mstts:express-as>" : "",
      "</voice>",
      "</speak>"
    ].join("");
  }

  private normalizeSpeechText(value: string): string {
    return value
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[“”"']/g, "")
      .replace(/&/g, " 그리고 ")
      .replace(/\//g, " ")
      .replace(/[:;]/g, ", ")
      .replace(/[()]/g, " ")
      .trim();
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  private async probeDurationSec(audioPath: string): Promise<number | undefined> {
    const ffmpegExecutable = this.resolveFfmpegExecutable();
    if (!ffmpegExecutable || !fs.existsSync(audioPath)) {
      return undefined;
    }

    return new Promise((resolve) => {
      const child = spawn(ffmpegExecutable, ["-i", audioPath], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"]
      });

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", () => resolve(undefined));
      child.on("close", () => {
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
        if (!match) {
          resolve(undefined);
          return;
        }

        const hours = Number(match[1] ?? 0);
        const minutes = Number(match[2] ?? 0);
        const seconds = Number(match[3] ?? 0);
        resolve(hours * 3600 + minutes * 60 + seconds);
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
