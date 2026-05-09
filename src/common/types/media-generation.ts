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

export interface CardNewsRichTextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  textColor?: string;
  outlineEnabled?: boolean;
  outlineThickness?: number;
  outlineColor?: string;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowDirectionDeg?: number;
  shadowOpacity?: number;
  shadowDistance?: number;
  shadowBlur?: number;
}

export interface SceneScriptVideoTextOverlay {
  text: string;
  startSec?: number;
  durationSec?: number;
  trackIndex?: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700 | 800;
  textColor: string;
  outlineColor: string;
  outlineThickness: number;
  backgroundColor?: string;
}

export interface SceneScriptVideoMediaLayer {
  id: string;
  mediaType: "video" | "image" | "icon";
  source: "pixabay" | "local" | "manual" | "generated";
  label?: string;
  localPath?: string;
  relativePath?: string;
  sourceUrl?: string;
  previewUrl?: string;
  startSec: number;
  durationSec: number;
  trackIndex?: number;
  fit?: "cover" | "contain";
  opacity?: number;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
}

export interface SceneScriptAudioLayer {
  id: string;
  source: "tts" | "local" | "manual";
  label?: string;
  localPath?: string;
  relativePath?: string;
  startSec: number;
  durationSec: number;
  trackIndex?: number;
  volume?: number;
}

export interface SceneScriptItem {
  sceneNo: number;
  text: string;
  fluxPrompt: string;
  assetSearchQuery?: string;
  cardTemplateImagePath?: string;
  videoTextOverlay?: SceneScriptVideoTextOverlay;
  videoTextOverlays?: SceneScriptVideoTextOverlay[];
  motion: "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "wipe-transition" | "shake";
  durationSec: number;
  cardDesign?: {
    id?: string;
    text?: string;
    layerOrder?: number;
    hidden?: boolean;
    locked?: boolean;
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    align: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
    fontFamily?: string;
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700 | 800;
    textColor: string;
    backgroundColor: string;
    lineHeight: number;
    padding: number;
    outlineEnabled?: boolean;
    outlineThickness?: number;
    outlineColor?: string;
    shadowEnabled?: boolean;
    shadowColor?: string;
    shadowDirectionDeg?: number;
    shadowOpacity?: number;
    shadowDistance?: number;
    shadowBlur?: number;
    richTextRuns?: CardNewsRichTextRun[];
  };
  cardDesignBoxes?: Array<{
    id?: string;
    text?: string;
    layerOrder?: number;
    hidden?: boolean;
    locked?: boolean;
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    align: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
    fontFamily?: string;
    fontSize: number;
    fontWeight: 400 | 500 | 600 | 700 | 800;
    textColor: string;
    backgroundColor: string;
    lineHeight: number;
    padding: number;
    outlineEnabled?: boolean;
    outlineThickness?: number;
    outlineColor?: string;
    shadowEnabled?: boolean;
    shadowColor?: string;
    shadowDirectionDeg?: number;
    shadowOpacity?: number;
    shadowDistance?: number;
    shadowBlur?: number;
    richTextRuns?: CardNewsRichTextRun[];
  }>;
}

export interface CardNewsTemplateRecord {
  id: string;
  name: string;
  role: "opener" | "body" | "qna" | "closer";
  imagePath: string;
  thumbnailPath: string;
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

export type CardNewsLayoutPreset = "headline_focus" | "split_story" | "data_highlight";
export type CardNewsTransitionStyle = "cut" | "slide" | "fade" | "wipe";
export type CardNewsOutputFormat = "shorts_9_16" | "feed_4_5" | "square_1_1";
export type CardNewsCoverSource = "ai_generate" | "manual_upload";

export interface SceneScriptCardNewsOptions {
  layoutPreset: CardNewsLayoutPreset;
  transitionStyle: CardNewsTransitionStyle;
  outputFormat: CardNewsOutputFormat;
  coverSource: CardNewsCoverSource;
  coverPrompt?: string;
  coverImagePath?: string;
  templateBackgroundPath?: string;
}

export interface SceneScriptDocument {
  schemaVersion: 1;
  jobId: string;
  language: "ko";
  category: SceneScriptCategory;
  targetDurationSec: number;
  scenes: SceneScriptItem[];
  videoMediaLayers?: SceneScriptVideoMediaLayer[];
  audioLayers?: SceneScriptAudioLayer[];
  subtitleStyle: SceneScriptSubtitleStyle;
  voiceProfile: SceneScriptVoiceProfile;
  cardNews?: SceneScriptCardNewsOptions;
}

export interface PixabayAssetSearchRequest {
  apiKey: string;
  query: string;
  mediaType: "video" | "image";
  perPage?: number;
}

export interface PixabayAssetResult {
  id: string;
  mediaType: "video" | "image";
  title: string;
  previewUrl: string;
  downloadUrl: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  durationSec?: number;
  tags?: string;
  user?: string;
}

export interface PixabayAssetImportRequest {
  packagePath: string;
  sceneNo?: number;
  asset: PixabayAssetResult;
  applyToScene?: boolean;
}

export interface PixabayAssetImportResult {
  localPath: string;
  relativePath: string;
  appliedSceneNo?: number;
}

export interface LocalAssetImportRequest {
  packagePath: string;
  sceneNo?: number;
  applyToScene?: boolean;
}

export interface LocalAssetImportResult {
  localPath: string;
  relativePath: string;
  mediaType: "video" | "image";
  appliedSceneNo?: number;
}

export interface VoiceLayerGenerationRequest {
  packagePath: string;
  text: string;
  voiceProfile?: SceneScriptVoiceProfile;
}

export interface VoiceLayerGenerationResult {
  localPath: string;
  relativePath: string;
  durationSec?: number;
  source: "azure" | "openai";
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
    | "card-news-generator-mcp"
    | "background-subtitle-composer-mcp"
    | "video-production-mcp";
  language: "ko";
  totalDurationSec: number;
  compositionOptions?: {
    burnSubtitles?: boolean;
    videoCrf?: number;
    videoPreset?: "fast" | "medium" | "slow";
    speedFactor?: number;
    outputWidth?: number;
    outputHeight?: number;
  };
  subtitleStyle?: SceneScriptSubtitleStyle;
  voiceProfile?: SceneScriptVoiceProfile;
  scenes: SceneAssetSelection[];
  voiceoverCues: VoiceoverCue[];
  subtitles: SubtitleCue[];
  artifacts: GeneratedMediaArtifacts;
}
