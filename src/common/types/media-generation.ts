export interface ScenePlanRequest {
  language: "ko";
  targetDurationSec: number;
  minimumSceneCount: number;
  sceneWordTarget: {
    min: number;
    max: number;
  };
  sceneCharacterTarget: {
    min: number;
    max: number;
  };
  keywordCountPerScene: {
    min: number;
    max: number;
  };
  source: {
    headline: string;
    summary: string;
    narration: string;
    hook?: string;
    callToAction?: string;
  };
}

export type SceneScriptCategory = "horror" | "romance" | "community";

export interface SceneScriptItem {
  sceneNo: number;
  text: string;
  fluxPrompt: string;
  assetSearchQuery?: string;
  motion: "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "wipe-transition" | "shake";
  durationSec: number;
}

export interface SceneScriptSubtitleStyle {
  mode: "outline" | "box";
  fontFamily: string;
  fontSize: number;
  outline: number;
  color: string;
  outlineColor: string;
}

export interface SceneScriptVoiceProfile {
  provider: "elevenlabs" | "azure" | "openai";
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface SceneScriptDocument {
  schemaVersion: 1;
  jobId: string;
  language: "ko";
  category: SceneScriptCategory;
  targetDurationSec: number;
  scenes: SceneScriptItem[];
  subtitleStyle: SceneScriptSubtitleStyle;
  voiceProfile: SceneScriptVoiceProfile;
}

export interface ScenePlanScene {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  keywords: string[];
  visualIntent?: string;
}

export interface ScenePlanDocument {
  schemaVersion: 1;
  generatedAt: string;
  totalDurationSec: number;
  language: "ko";
  scenes: ScenePlanScene[];
}

export interface SceneAssetCandidate {
  provider: "pexels" | "flux" | "local" | "manual";
  assetType: "video" | "image";
  sourceUrl?: string;
  localPath?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  attributionLabel?: string;
}

export interface SceneAssetSelection {
  sceneIndex: number;
  motion?: SceneScriptItem["motion"];
  selectedAsset?: SceneAssetCandidate;
  fallbackUsed?: boolean;
  trim: {
    sourceStartSec: number;
    sourceEndSec: number;
  };
}

export interface VoiceoverCue {
  sceneIndex: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface SubtitleCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface GeneratedMediaArtifacts {
  scenePlanPath: string;
  assetsManifestPath: string;
  voiceoverPath: string;
  subtitlePath: string;
  finalVideoPath: string;
  thumbnailPath?: string;
}

export interface GeneratedMediaPackageManifest {
  schemaVersion: 1;
  generatedAt: string;
  provider:
    | "youtube-material-generator-mcp"
    | "background-subtitle-composer-mcp"
    | "video-production-mcp";
  language: "ko";
  totalDurationSec: number;
  compositionOptions?: {
    burnSubtitles?: boolean;
    videoCrf?: number;
    videoPreset?: "fast" | "medium" | "slow";
    speedFactor?: number;
  };
  subtitleStyle?: SceneScriptSubtitleStyle;
  voiceProfile?: SceneScriptVoiceProfile;
  scenes: SceneAssetSelection[];
  voiceoverCues: VoiceoverCue[];
  subtitles: SubtitleCue[];
  artifacts: GeneratedMediaArtifacts;
}
