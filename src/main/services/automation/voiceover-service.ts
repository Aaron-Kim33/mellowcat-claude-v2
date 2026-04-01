import type { WorkflowAiConnectionRef } from "../../../common/types/automation";
import type { VoiceoverCue } from "../../../common/types/media-generation";
import { SettingsRepository } from "../storage/settings-repository";
import { FileService } from "../system/file-service";
import { ShortformWorkflowConfigService } from "./shortform-workflow-config-service";

export interface VoiceoverGenerationResult {
  source: "azure" | "openai" | "none";
  relativePath?: string;
  error?: string;
}

export class VoiceoverService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly workflowConfigService: ShortformWorkflowConfigService,
    private readonly fileService: FileService
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
      return this.generateWithAzure(input, packagePath, azureSpeechKey, azureSpeechRegion, azureSpeechVoice);
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

    return {
      source: "openai",
      relativePath
    };
  }

  private async generateWithAzure(
    input: string,
    packagePath: string,
    speechKey: string,
    speechRegion: string,
    speechVoice: string
  ): Promise<VoiceoverGenerationResult> {
    const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const ssml = this.buildAzureSsml(input, speechVoice);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "MellowCat Launcher"
      },
      body: ssml
    });

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

    return {
      source: "azure",
      relativePath
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

  private buildAzureSsml(input: string, voice: string): string {
    return [
      "<speak version='1.0' xml:lang='ko-KR'>",
      `<voice name='${this.escapeXml(voice)}'>`,
      this.escapeXml(input),
      "</voice>",
      "</speak>"
    ].join("");
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
}
