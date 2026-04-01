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
  provider: "pexels" | "local" | "manual";
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
  provider: "youtube-material-generator-mcp";
  language: "ko";
  totalDurationSec: number;
  scenes: SceneAssetSelection[];
  voiceoverCues: VoiceoverCue[];
  subtitles: SubtitleCue[];
  artifacts: GeneratedMediaArtifacts;
}
