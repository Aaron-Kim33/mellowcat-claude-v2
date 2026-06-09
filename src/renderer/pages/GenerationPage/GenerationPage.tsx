import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  ErrorInfo,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent
} from "react";
import { Component } from "react";
import type {
  CardNewsTemplateRecord,
  CardNewsLayoutPreset,
  CardNewsTransitionStyle,
  AiWorkspaceMaterial,
  AiWorkspacePlan,
  AiWorkspaceTargetKind,
  FreesoundAudioResult,
  PixabayAssetResult,
  UploadedAssetRecord,
  SceneScriptDocument,
  SceneScriptItem,
  SceneScriptAudioLayer,
  SceneScriptElementTransition,
  SceneScriptElementTransitionPlacement,
  SceneScriptElementTransitionStyle,
  SceneScriptSubtitleStyle,
  SceneScriptVideoMediaMotion,
  SceneScriptVideoMediaMotionStyle,
  SceneScriptVideoMediaLayer,
  SceneScriptVideoTextOverlay,
  SceneScriptVoiceProfile
} from "@common/types/media-generation";
import {
  buildLayerFrameClipInsets,
  buildLayerSourceCropTransform,
  hasPercentCrop,
  resolveLayerBox,
  resolveLayerFrameCrop
} from "@common/video-layer-layout";
import { getMcpRuntimeContract } from "../../../common/contracts/mcp-contract-registry";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { useAppStore } from "../../store/app-store";

const VIDEO_SCENE_BACKGROUND_COLORS = [
  "#ffffff",
  "#f8fafc",
  "#111827",
  "#0f172a",
  "#fef3c7",
  "#fee2e2",
  "#dcfce7",
  "#dbeafe",
  "#f3e8ff",
  "#000000"
];

const VIDEO_CANVAS_PRESETS = [
  {
    id: "landscape_16_9",
    labelKo: "일반 16:9",
    labelEn: "Landscape 16:9",
    width: 1920,
    height: 1080
  },
  {
    id: "reels_9_16",
    labelKo: "릴스 9:16",
    labelEn: "Reels 9:16",
    width: 1080,
    height: 1920
  },
  {
    id: "shorts_9_16",
    labelKo: "쇼츠 9:16",
    labelEn: "Shorts 9:16",
    width: 1080,
    height: 1920
  }
] as const;

type VideoCanvasPresetId = (typeof VIDEO_CANVAS_PRESETS)[number]["id"];

const getVideoCanvasPreset = (presetId?: string) =>
  VIDEO_CANVAS_PRESETS.find((preset) => preset.id === presetId) ?? VIDEO_CANVAS_PRESETS[0];

const buildVideoCanvasFrameStyle = (
  preset: (typeof VIDEO_CANVAS_PRESETS)[number],
  extraStyle?: CSSProperties
): CSSProperties => ({
  width: `min(100%, calc((100vh - 390px) * ${preset.width} / ${preset.height}))`,
  aspectRatio: `${preset.width} / ${preset.height}`,
  ...extraStyle
});

const getReadableTextColorForBackground = (backgroundColor?: string) => {
  const hex = (backgroundColor || "#ffffff").replace("#", "");
  if (hex.length !== 6) {
    return "#17202c";
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.45 ? "#f8fafc" : "#17202c";
};

const VOICE_PROVIDER_OPTIONS: Array<SceneScriptVoiceProfile["provider"]> = [
  "elevenlabs",
  "azure",
  "openai"
];
const DEFAULT_AI_WORKSPACE_PROMPT =
  "올린 소재들을 순서대로 사용해서 카드뉴스 5장 또는 영상 씬 구성안을 만들어줘. 성공적인 디자인/편집 흐름을 참고하되, 소재의 핵심 메시지가 먼저 보이게 재구성해줘. 필요한 보조 이미지나 그래픽은 추가 생성해도 좋아.";
const TIMELINE_CLIPBOARD_MARKER = "__MELLOWCAT_TIMELINE_ELEMENT__";
const DEFAULT_VIDEO_TEXT_OVERLAY: SceneScriptVideoTextOverlay = {
  text: "새 텍스트",
  startSec: 0,
  durationSec: 5,
  trackIndex: 0,
  xPct: 50,
  yPct: 50,
  widthPct: 42,
  heightPct: 15,
  fontSize: 21,
  fontWeight: 800,
  textColor: "#ffffff",
  outlineColor: "#000000",
  outlineThickness: 5,
  backgroundColor: "transparent"
};
const TIMELINE_ELEMENT_TRACK_ROW_HEIGHT = 30;
const TIMELINE_RESIZE_SENSITIVITY = 1;
const CANVAS_SNAP_THRESHOLD_PCT = 1.5;
const VIDEO_MEDIA_OVERFLOW_MIN_PCT = -300;
const VIDEO_MEDIA_OVERFLOW_MAX_PCT = 400;
const CANVAS_RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const VIDEO_MEDIA_CROP_HANDLES = ["top", "right", "bottom", "left"] as const;
const DEFAULT_ELEMENT_TRANSITION: SceneScriptElementTransition = {
  style: "none",
  placement: "both",
  durationSec: 0.55
};
const DEFAULT_MEDIA_MOTION: SceneScriptVideoMediaMotion = {
  style: "none",
  amountPct: 6,
  focusXPct: 50,
  focusYPct: 50
};
const VIDEO_ELEMENT_TRANSITION_STYLES: Array<{
  value: SceneScriptElementTransitionStyle;
  labelKo: string;
  labelEn: string;
}> = [
  { value: "none", labelKo: "없음", labelEn: "None" },
  { value: "fade", labelKo: "페이드", labelEn: "Fade" },
  { value: "slide-left", labelKo: "왼쪽 슬라이드", labelEn: "Slide Left" },
  { value: "slide-right", labelKo: "오른쪽 슬라이드", labelEn: "Slide Right" },
  { value: "slide-up", labelKo: "위 슬라이드", labelEn: "Slide Up" },
  { value: "slide-down", labelKo: "아래 슬라이드", labelEn: "Slide Down" }
];
const VIDEO_ELEMENT_TRANSITION_PLACEMENTS: Array<{
  value: SceneScriptElementTransitionPlacement;
  labelKo: string;
  labelEn: string;
}> = [
  { value: "in", labelKo: "첫부분", labelEn: "Start" },
  { value: "out", labelKo: "마지막", labelEn: "End" },
  { value: "both", labelKo: "양쪽", labelEn: "Both" }
];
const VIDEO_MEDIA_MOTION_STYLES: Array<{
  value: SceneScriptVideoMediaMotionStyle;
  labelKo: string;
  labelEn: string;
}> = [
  { value: "none", labelKo: "없음", labelEn: "None" },
  { value: "slow-zoom-in", labelKo: "천천히 줌인", labelEn: "Slow Zoom In" },
  { value: "slow-zoom-out", labelKo: "천천히 줌아웃", labelEn: "Slow Zoom Out" }
];
const MOBILE_SAFE_AREA_GUIDES: Record<
  VideoCanvasPresetId,
  { topPct: number; rightPct: number; bottomPct: number; leftPct: number }
> = {
  landscape_16_9: {
    topPct: 7,
    rightPct: 5,
    bottomPct: 10,
    leftPct: 5
  },
  reels_9_16: {
    topPct: 7,
    rightPct: 16,
    bottomPct: 18,
    leftPct: 6
  },
  shorts_9_16: {
    topPct: 7,
    rightPct: 16,
    bottomPct: 18,
    leftPct: 6
  }
};
const clampLayerVolume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
const formatLayerVolume = (value?: number) => `${Math.round(clampLayerVolume(Number(value ?? 1)) * 100)}%`;
const clampPlaybackRate = (value: number) => Math.max(1, Math.min(2, Number.isFinite(value) ? value : 1));
const formatPlaybackRate = (value?: number) => `${clampPlaybackRate(Number(value ?? 1)).toFixed(2)}x`;
type CanvasResizeHandle = (typeof CANVAS_RESIZE_HANDLES)[number];
type VideoMediaCropHandle = (typeof VIDEO_MEDIA_CROP_HANDLES)[number];
type CanvasPositionField = "x" | "y" | "width" | "height";
const CANVAS_POSITION_FIELDS: CanvasPositionField[] = ["x", "y", "width", "height"];
const TIMELINE_SNAP_THRESHOLD_SEC = 0.18;
const roundTimelineSeconds = (value: number, min = 0) =>
  Math.max(min, Math.round((Number(value) || 0) * 20) / 20);
const clampVideoMediaCanvasPct = (value: number) =>
  Math.max(VIDEO_MEDIA_OVERFLOW_MIN_PCT, Math.min(VIDEO_MEDIA_OVERFLOW_MAX_PCT, value));
const parseLooseNumberInput = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const normalizeElementTransition = (transition?: SceneScriptElementTransition): SceneScriptElementTransition => ({
  style: transition?.style ?? DEFAULT_ELEMENT_TRANSITION.style,
  placement: transition?.placement ?? DEFAULT_ELEMENT_TRANSITION.placement,
  durationSec: clampNumber(Number(transition?.durationSec ?? DEFAULT_ELEMENT_TRANSITION.durationSec), 0.05, 3)
});
const normalizeMediaMotion = (motion?: SceneScriptVideoMediaMotion): SceneScriptVideoMediaMotion => ({
  style: motion?.style ?? DEFAULT_MEDIA_MOTION.style,
  amountPct: clampNumber(Number(motion?.amountPct ?? DEFAULT_MEDIA_MOTION.amountPct), 1, 20),
  focusXPct: clampNumber(Number(motion?.focusXPct ?? DEFAULT_MEDIA_MOTION.focusXPct), 0, 100),
  focusYPct: clampNumber(Number(motion?.focusYPct ?? DEFAULT_MEDIA_MOTION.focusYPct), 0, 100)
});
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clampNumber(value, 0, 1), 3);
const easeInCubic = (value: number) => Math.pow(clampNumber(value, 0, 1), 3);
const shouldRunTransitionPhase = (
  transition: SceneScriptElementTransition,
  phase: "in" | "out"
) => transition.style !== "none" && (transition.placement === phase || transition.placement === "both");
const formatTimelineSeconds = (value: number) => `${roundTimelineSeconds(value).toFixed(2)}s`;
const formatTimelineTooltipSeconds = (value: number) => `${Math.max(0, Number(value) || 0).toFixed(1)}s`;
const getSceneStartSec = (scene: SceneScriptItem, fallbackStartSec: number) => {
  const explicitStartSec = Number(scene.startSec);
  return Number.isFinite(explicitStartSec) ? Math.max(0, explicitStartSec) : fallbackStartSec;
};
const buildTimelinePlayheadLeft = (timeSec: number, durationSec: number) => {
  const ratio = Math.max(0, Math.min(1, timeSec / Math.max(1, durationSec)));
  return `calc(64px + ${(ratio * 100).toFixed(4)}% - ${(ratio * 64).toFixed(2)}px)`;
};
type AudioWaveformPreview = {
  durationSec: number;
  peaks: number[];
};
const buildAudioWaveformPeaks = (buffer: AudioBuffer, barCount = 900) => {
  const channelCount = Math.max(1, buffer.numberOfChannels);
  const blockSize = Math.max(1, Math.ceil(buffer.length / barCount));
  return Array.from({ length: barCount }, (_, index) => {
    const start = index * blockSize;
    const end = Math.min(buffer.length, start + blockSize);
    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        const channel = buffer.getChannelData(channelIndex);
        const sample = Math.abs(channel[sampleIndex] ?? 0);
        peak = Math.max(peak, sample);
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }
    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    return Math.max(0.06, Math.min(1, peak * 0.72 + rms * 2.6));
  });
};
const getVisibleWaveformPeaks = (
  waveform: AudioWaveformPreview | undefined,
  sourceOffsetSec: number,
  durationSec: number,
  targetBarCount = 80
) => {
  if (!waveform || waveform.peaks.length === 0 || waveform.durationSec <= 0) {
    return [];
  }
  const startRatio = Math.max(0, Math.min(1, sourceOffsetSec / waveform.durationSec));
  const endRatio = Math.max(startRatio, Math.min(1, (sourceOffsetSec + durationSec) / waveform.durationSec));
  const startIndex = Math.floor(startRatio * waveform.peaks.length);
  const endIndex = Math.max(startIndex + 1, Math.ceil(endRatio * waveform.peaks.length));
  const slice = waveform.peaks.slice(startIndex, endIndex);
  const visiblePeaks = slice.length > 0 ? slice : waveform.peaks;
  const outputCount = Math.max(8, Math.min(180, Math.round(targetBarCount)));
  if (visiblePeaks.length <= outputCount) {
    return visiblePeaks;
  }
  const sourcePerOutput = visiblePeaks.length / outputCount;
  return Array.from({ length: outputCount }, (_, outputIndex) => {
    const start = Math.floor(outputIndex * sourcePerOutput);
    const end = Math.max(start + 1, Math.ceil((outputIndex + 1) * sourcePerOutput));
    let peak = 0;
    let total = 0;
    let count = 0;
    for (let peakIndex = start; peakIndex < end && peakIndex < visiblePeaks.length; peakIndex += 1) {
      const value = visiblePeaks[peakIndex] ?? 0;
      peak = Math.max(peak, value);
      total += value;
      count += 1;
    }
    const average = count > 0 ? total / count : peak;
    return Math.max(0.04, Math.min(1, peak * 0.72 + average * 0.28));
  });
};
const buildDefaultAiWorkspace = (targetKind: AiWorkspaceTargetKind): NonNullable<SceneScriptDocument["aiWorkspace"]> => ({
  targetKind,
  prompt: DEFAULT_AI_WORKSPACE_PROMPT,
  materials: []
});
const extractJsonObject = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      try {
        return JSON.parse(fencedMatch[1].trim());
      } catch {
        // Fall through to brace slicing.
      }
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("AI response did not contain valid JSON.");
  }
};
const normalizeAiPlan = (
  parsed: unknown,
  fallback: { targetKind: AiWorkspaceTargetKind; rawText: string; provider: AiWorkspacePlan["provider"]; model?: string }
): AiWorkspacePlan => {
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems.slice(0, 12).map((item, index) => {
    const itemRecord = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      index: Number(itemRecord.index) || index + 1,
      title: typeof itemRecord.title === "string" ? itemRecord.title : `Item ${index + 1}`,
      text: typeof itemRecord.text === "string" ? itemRecord.text : "",
      visualPrompt: typeof itemRecord.visualPrompt === "string" ? itemRecord.visualPrompt : undefined,
      sourceMaterialIds: Array.isArray(itemRecord.sourceMaterialIds)
        ? itemRecord.sourceMaterialIds.filter((value): value is string => typeof value === "string")
        : undefined
    };
  });
  return {
    summary: typeof record.summary === "string" ? record.summary : "AI design plan",
    targetKind:
      record.targetKind === "card_news" || record.targetKind === "video" || record.targetKind === "canva"
        ? record.targetKind
        : fallback.targetKind,
    canvaPrompt: typeof record.canvaPrompt === "string" ? record.canvaPrompt : fallback.rawText,
    items,
    generatedAt: new Date().toISOString(),
    provider: fallback.provider,
    model: fallback.model,
    rawText: fallback.rawText
  };
};
const buildLayerId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildIconDataUrl = (body: string, viewBox = "0 0 128 128") =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`
  )}`;
const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read clipboard image."));
    reader.readAsDataURL(blob);
  });

const readImageBlobDimensions = async (blob: Blob) => {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Failed to read clipboard image dimensions."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const buildInitialMediaLayerBox = (
  naturalWidth: number | undefined,
  naturalHeight: number | undefined,
  canvasPreset: (typeof VIDEO_CANVAS_PRESETS)[number]
) => {
  const canvasAspect = canvasPreset.width / canvasPreset.height;
  const imageAspect =
    naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0
      ? naturalWidth / naturalHeight
      : canvasAspect;
  const maxPct = 100;
  if (imageAspect >= canvasAspect) {
    return {
      widthPct: maxPct,
      heightPct: Math.max(6, Number(((maxPct * canvasAspect) / imageAspect).toFixed(2)))
    };
  }
  return {
    widthPct: Math.max(6, Number(((maxPct * imageAspect) / canvasAspect).toFixed(2))),
    heightPct: maxPct
  };
};
const VIDEO_ICON_LIBRARY = [
  {
    id: "alert",
    labelKo: "주의",
    labelEn: "Alert",
    tags: "alert warning caution danger",
    dataUrl: buildIconDataUrl(
      '<path d="M64 10 120 112H8L64 10Z" fill="#FFD53D" stroke="#111827" stroke-width="8" stroke-linejoin="round"/><path d="M64 42v34" stroke="#111827" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="94" r="6" fill="#111827"/>'
    )
  },
  {
    id: "check",
    labelKo: "체크",
    labelEn: "Check",
    tags: "check success confirm",
    dataUrl: buildIconDataUrl(
      '<circle cx="64" cy="64" r="54" fill="#22C55E" stroke="#111827" stroke-width="7"/><path d="M38 65 56 83l36-42" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'
    )
  },
  {
    id: "question",
    labelKo: "질문",
    labelEn: "Question",
    tags: "question why qna",
    dataUrl: buildIconDataUrl(
      '<circle cx="64" cy="64" r="54" fill="#38BDF8" stroke="#111827" stroke-width="7"/><path d="M49 48c2-13 28-18 34-3 6 16-15 19-17 33" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/><circle cx="64" cy="95" r="6" fill="#fff"/>'
    )
  },
  {
    id: "fire",
    labelKo: "불꽃",
    labelEn: "Fire",
    tags: "fire hot viral trend",
    dataUrl: buildIconDataUrl(
      '<path d="M72 10c8 24-8 31 11 50 6 6 10 16 10 27 0 22-17 35-38 35-18 0-34-12-34-33 0-19 13-31 24-44 7-8 11-17 10-29 18 10 12 30 17 42 12-15 5-31 0-48Z" fill="#FF7A1A" stroke="#111827" stroke-width="6" stroke-linejoin="round"/><path d="M58 78c7-9 3-19 0-27 16 12 26 24 21 42-3 12-13 20-25 20-11 0-20-8-20-20 0-10 8-16 24-15Z" fill="#FFD53D"/>'
    )
  },
  {
    id: "money",
    labelKo: "돈",
    labelEn: "Money",
    tags: "money dollar revenue price",
    dataUrl: buildIconDataUrl(
      '<rect x="14" y="30" width="100" height="68" rx="12" fill="#22C55E" stroke="#111827" stroke-width="7"/><circle cx="64" cy="64" r="22" fill="#DCFCE7" stroke="#111827" stroke-width="5"/><path d="M64 46v36M53 56c3-7 21-8 22 1 2 12-21 6-21 18 0 9 19 8 23 1" fill="none" stroke="#111827" stroke-width="6" stroke-linecap="round"/>'
    )
  },
  {
    id: "globe",
    labelKo: "세계",
    labelEn: "Globe",
    tags: "world global earth news",
    dataUrl: buildIconDataUrl(
      '<circle cx="64" cy="64" r="52" fill="#38BDF8" stroke="#111827" stroke-width="7"/><path d="M22 62c20 7 30-6 42 1 17 10 22 1 42 5M44 21c9 11 2 22 10 30 8 8 21 4 28 15 7 12-8 20-2 38M64 13c-21 20-21 82 0 102M64 13c21 20 21 82 0 102" fill="none" stroke="#0F766E" stroke-width="5" stroke-linecap="round"/>'
    )
  },
  {
    id: "arrow",
    labelKo: "화살표",
    labelEn: "Arrow",
    tags: "arrow point next direction",
    dataUrl: buildIconDataUrl(
      '<path d="M16 64h78" stroke="#111827" stroke-width="16" stroke-linecap="round"/><path d="M70 25 111 64 70 103" fill="none" stroke="#111827" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 64h78" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/><path d="M70 25 111 64 70 103" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
    )
  },
  {
    id: "chat",
    labelKo: "댓글",
    labelEn: "Chat",
    tags: "comment chat message talk",
    dataUrl: buildIconDataUrl(
      '<path d="M20 28h88v58H57l-25 22V86H20V28Z" fill="#FFFFFF" stroke="#111827" stroke-width="7" stroke-linejoin="round"/><circle cx="48" cy="58" r="6" fill="#111827"/><circle cx="64" cy="58" r="6" fill="#111827"/><circle cx="80" cy="58" r="6" fill="#111827"/>'
    )
  }
];
const getSceneVideoTextOverlays = (scene?: SceneScriptItem | null): SceneScriptVideoTextOverlay[] => {
  if (!scene) {
    return [];
  }
  if (scene.videoTextOverlays && scene.videoTextOverlays.length > 0) {
    return scene.videoTextOverlays.map((overlay) => ({
      ...DEFAULT_VIDEO_TEXT_OVERLAY,
      ...overlay
    }));
  }
  return scene.videoTextOverlay
    ? [
        {
          ...DEFAULT_VIDEO_TEXT_OVERLAY,
          ...scene.videoTextOverlay
        }
      ]
    : [];
};
const CARD_NEWS_TEXT_PRESETS = [
  { id: "headline", labelKo: "헤드라인", labelEn: "Headline", fontSize: 64, fontWeight: 800 as const, lineHeight: 1.2 },
  { id: "story", labelKo: "본문", labelEn: "Story", fontSize: 48, fontWeight: 700 as const, lineHeight: 1.28 },
  { id: "caption", labelKo: "캡션", labelEn: "Caption", fontSize: 40, fontWeight: 600 as const, lineHeight: 1.34 }
];

const CARD_NEWS_COLOR_PRESETS = [
  { id: "classic", labelKo: "클래식", labelEn: "Classic", textColor: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.52)" },
  { id: "warm", labelKo: "웜", labelEn: "Warm", textColor: "#FFF5D6", backgroundColor: "rgba(28,18,8,0.6)" },
  { id: "cool", labelKo: "쿨", labelEn: "Cool", textColor: "#EAF4FF", backgroundColor: "rgba(8,20,36,0.58)" },
  { id: "accent", labelKo: "포인트", labelEn: "Accent", textColor: "#FFFFFF", backgroundColor: "rgba(120,28,55,0.62)" }
];

const CARD_NEWS_FONT_OPTIONS = [
  "Jalnan OTF",
  "S-Core Dream 5 M",
  "GongGothic B",
  "Gmarket Sans",
  "Arial"
];

const CARD_NEWS_PALETTE = [
  "#000000",
  "#FFFFFF",
  "#FFD800",
  "#42D7DE",
  "#F5335B",
  "#2455FF",
  "#12B886",
  "#FF7A1A"
];

const CARD_NEWS_SYMBOLS = [
  { symbol: "★", label: "star" },
  { symbol: "✓", label: "check" },
  { symbol: "!", label: "alert" },
  { symbol: "?", label: "question" },
  { symbol: "→", label: "arrow" },
  { symbol: "※", label: "note" },
  { symbol: "♡", label: "heart" },
  { symbol: "☞", label: "point" },
  { symbol: "○", label: "circle" },
  { symbol: "■", label: "square" },
  { symbol: "▲", label: "triangle" },
  { symbol: "◆", label: "diamond" },
  { symbol: "돈", label: "money" },
  { symbol: "핵심", label: "core" },
  { symbol: "주의", label: "warning" },
  { symbol: "결론", label: "conclusion" }
];

type CardDesignDragState = {
  mode: "move" | "resize";
  sceneNo: number;
  boxIndex: number;
  startX: number;
  startY: number;
  startDesign: NonNullable<SceneScriptItem["cardDesign"]>;
  bounds: {
    width: number;
    height: number;
  };
};

type CardDesignBox = NonNullable<SceneScriptItem["cardDesign"]>;
type CardRichTextRun = NonNullable<CardDesignBox["richTextRuns"]>[number];
type CardRichTextStylePatch = Partial<
  Pick<
    CardDesignBox,
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "textColor"
    | "outlineEnabled"
    | "outlineThickness"
    | "outlineColor"
    | "shadowEnabled"
    | "shadowColor"
    | "shadowDirectionDeg"
    | "shadowOpacity"
    | "shadowDistance"
    | "shadowBlur"
  >
>;

type CardStagePanState = {
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
};

type TimelineClipboardItem =
  | {
      kind: "media";
      layer: SceneScriptVideoMediaLayer;
    }
  | {
      kind: "audio";
      layer: SceneScriptAudioLayer;
    }
  | {
      kind: "text";
      overlay: SceneScriptVideoTextOverlay;
    };

type TimelineSelectionItem =
  | { kind: "media"; id: string }
  | { kind: "audio"; id: string }
  | { kind: "text"; index: number };

type TimelineSelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type TimelineMultiMoveDrag = {
  startClientX: number;
  startClientY: number;
  secondsPerPixel: number;
  items: Array<{
    selection: TimelineSelectionItem;
    startSec: number;
    durationSec: number;
    trackIndex: number;
  }>;
};

type TimelineLayerKind = TimelineSelectionItem["kind"];

type TimelineLayerPlacement = {
  key: string;
  startSec: number;
  durationSec: number;
  trackIndex: number;
};

class GenerationErrorBoundary extends Component<
  { children: ReactNode },
  { errorMessage: string | null }
> {
  state = { errorMessage: null };

  static getDerivedStateFromError(error: unknown) {
    return {
      errorMessage: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Generation page render failed", error, info.componentStack);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="card">
          <strong>카드뉴스 편집 화면 렌더링 오류</strong>
          <p className="warning-text">{this.state.errorMessage}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => this.setState({ errorMessage: null })}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  return `file:///${encodeURI(normalized)}`;
}

function buildScenePreviewCandidates(packagePath: string, sceneNo: number): Array<{
  kind: "image" | "video";
  src: string;
}> {
  const sceneToken = String(sceneNo).padStart(2, "0");
  const base = `${packagePath}\\assets\\scene-${sceneToken}`;
  return [
    { kind: "image", src: toFileUrl(`${base}.jpg`) },
    { kind: "image", src: toFileUrl(`${base}.png`) },
    { kind: "image", src: toFileUrl(`${base}.webp`) },
    { kind: "video", src: toFileUrl(`${base}.mp4`) }
  ];
}

function buildPackagePreviewFallbackCandidates(packagePath: string): Array<{
  kind: "image" | "video";
  src: string;
}> {
  return [
    { kind: "video", src: toFileUrl(`${packagePath}\\final-video.mp4`) },
    { kind: "image", src: toFileUrl(`${packagePath}\\assets\\background.png`) },
    { kind: "video", src: toFileUrl(`${packagePath}\\assets\\background.mp4`) }
  ];
}

function buildCardNewsPlaceholderPreview(sceneNo: number): string {
  const label = sceneNo === 1 ? "COVER" : `CARD ${sceneNo}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171717"/><stop offset="1" stop-color="#31302b"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/><rect x="54" y="54" width="972" height="972" rx="44" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="4" stroke-dasharray="18 18"/><text x="540" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="rgba(255,255,255,0.52)">${label}</text><text x="540" y="930" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="rgba(255,255,255,0.38)">Choose an image or edit text layers</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildCardTextShadow(design: NonNullable<SceneScriptItem["cardDesign"]>): string {
  if (!design.shadowEnabled) {
    return "none";
  }
  const direction = ((design.shadowDirectionDeg ?? 135) * Math.PI) / 180;
  const distance = design.shadowDistance ?? 10;
  const opacity = Math.max(0, Math.min(100, design.shadowOpacity ?? 45)) / 100;
  const blur = Math.max(0, design.shadowBlur ?? 0);
  const x = Math.cos(direction) * distance;
  const y = Math.sin(direction) * distance;
  return `${x.toFixed(1)}px ${y.toFixed(1)}px ${blur}px ${toRgba(design.shadowColor ?? "#000000", opacity)}`;
}

function buildCardRunStyle(
  box: NonNullable<SceneScriptItem["cardDesign"]>,
  run: CardRichTextRun
): CSSProperties {
  return {
    color: run.textColor ?? box.textColor,
    fontFamily: run.fontFamily ?? box.fontFamily ?? "GongGothic B",
    fontSize: run.fontSize ?? box.fontSize,
    fontWeight: run.fontWeight ?? box.fontWeight,
    WebkitTextStroke: (run.outlineEnabled ?? box.outlineEnabled)
      ? `${run.outlineThickness ?? box.outlineThickness ?? 0}px ${run.outlineColor ?? box.outlineColor ?? "#000000"}`
      : "0 transparent",
    paintOrder: "stroke fill",
    textShadow: buildCardTextShadow({
      ...box,
      shadowEnabled: run.shadowEnabled ?? box.shadowEnabled,
      shadowColor: run.shadowColor ?? box.shadowColor,
      shadowDirectionDeg: run.shadowDirectionDeg ?? box.shadowDirectionDeg,
      shadowOpacity: run.shadowOpacity ?? box.shadowOpacity,
      shadowDistance: run.shadowDistance ?? box.shadowDistance,
      shadowBlur: run.shadowBlur ?? box.shadowBlur
    })
  };
}

function getCardPlainTextFromRuns(runs?: CardRichTextRun[]): string {
  return runs?.map((run) => run.text).join("") ?? "";
}

function getCardRunsForBox(box: CardDesignBox): CardRichTextRun[] {
  if (box.richTextRuns && box.richTextRuns.length > 0) {
    return box.richTextRuns.filter((run) => typeof run.text === "string" && run.text.length > 0);
  }
  return typeof box.text === "string" && box.text.length > 0 ? [{ text: box.text }] : [];
}

function extractCardRunsFromEditableElement(root: HTMLElement, sourceRuns?: CardRichTextRun[]): CardRichTextRun[] {
  const runs: CardRichTextRun[] = [];
  const appendText = (text: string, inheritedRun?: CardRichTextRun) => {
    if (!text) {
      return;
    }
    runs.push({ ...(inheritedRun ?? {}), text });
  };
  const appendLineBreak = (inheritedRun?: CardRichTextRun, options?: { force?: boolean }) => {
    const last = runs[runs.length - 1];
    if (!options?.force && last?.text.endsWith("\n")) {
      return;
    }
    appendText("\n", inheritedRun);
  };
  const walk = (node: Node, inheritedRun?: CardRichTextRun) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "", inheritedRun);
      return;
    }
    if (node.nodeName === "BR") {
      appendLineBreak(inheritedRun, { force: true });
      return;
    }
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const runIndexRaw = node.dataset.cardRunIndex;
    const runIndex = runIndexRaw === undefined ? Number.NaN : Number(runIndexRaw);
    const currentRun =
      Number.isFinite(runIndex) && sourceRuns?.[runIndex]
        ? { ...sourceRuns[runIndex], text: "" }
        : inheritedRun;
    const tagName = node.tagName.toLowerCase();
    const isBlockNode = ["div", "p", "li", "section", "article"].includes(tagName) && node !== root;
    if (isBlockNode && runs.length > 0) {
      appendLineBreak(currentRun);
    }
    const beforeLength = runs.reduce((total, run) => total + run.text.length, 0);
    Array.from(node.childNodes).forEach((child) => walk(child, currentRun));
    const afterLength = runs.reduce((total, run) => total + run.text.length, 0);
    if (isBlockNode && afterLength > beforeLength) {
      appendLineBreak(currentRun);
    }
  };
  Array.from(root.childNodes).forEach((child) => walk(child));
  const merged = mergeAdjacentCardRuns(runs);
  if (merged.length > 0) {
    merged[merged.length - 1] = {
      ...merged[merged.length - 1],
      text: merged[merged.length - 1].text.replace(/\n+$/, "")
    };
  }
  return mergeAdjacentCardRuns(merged);
}

function normalizeCardRichTextRuns(runs?: CardRichTextRun[]): CardRichTextRun[] | undefined {
  if (!runs || runs.length === 0) {
    return undefined;
  }
  const normalized = mergeAdjacentCardRuns(
    runs
      .filter((run) => typeof run.text === "string" && run.text.length > 0)
      .map((run) => ({
        ...run,
        text: run.text
      }))
  );
  return normalized.length > 0 ? normalized : undefined;
}

function getPlainTextFromEditableElement(root: HTMLElement): string {
  const runs = extractCardRunsFromEditableElement(root);
  if (runs.length > 0) {
    return getCardPlainTextFromRuns(runs);
  }
  return root.innerText;
}

function getCardRunStyleKey(run: CardRichTextRun): string {
  return JSON.stringify({
    fontFamily: run.fontFamily,
    fontSize: run.fontSize,
    fontWeight: run.fontWeight,
    textColor: run.textColor,
    outlineEnabled: run.outlineEnabled,
    outlineThickness: run.outlineThickness,
    outlineColor: run.outlineColor,
    shadowEnabled: run.shadowEnabled,
    shadowColor: run.shadowColor,
    shadowDirectionDeg: run.shadowDirectionDeg,
    shadowOpacity: run.shadowOpacity,
    shadowDistance: run.shadowDistance,
    shadowBlur: run.shadowBlur
  });
}

function mergeAdjacentCardRuns(runs: CardRichTextRun[]): CardRichTextRun[] {
  return runs.reduce<CardRichTextRun[]>((merged, run) => {
    if (!run.text) {
      return merged;
    }
    const last = merged[merged.length - 1];
    if (last && getCardRunStyleKey(last) === getCardRunStyleKey(run)) {
      merged[merged.length - 1] = { ...last, text: `${last.text}${run.text}` };
      return merged;
    }
    merged.push(run);
    return merged;
  }, []);
}

function applyCardStylePatchToRuns(
  runs: CardRichTextRun[],
  start: number,
  end: number,
  patch: CardRichTextStylePatch
): CardRichTextRun[] {
  let cursor = 0;
  const nextRuns: CardRichTextRun[] = [];
  runs.forEach((run) => {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    if (runEnd <= start || runStart >= end) {
      nextRuns.push(run);
      return;
    }
    const localStart = Math.max(0, start - runStart);
    const localEnd = Math.min(run.text.length, end - runStart);
    const before = run.text.slice(0, localStart);
    const middle = run.text.slice(localStart, localEnd);
    const after = run.text.slice(localEnd);
    if (before) {
      nextRuns.push({ ...run, text: before });
    }
    if (middle) {
      nextRuns.push({ ...run, ...patch, text: middle });
    }
    if (after) {
      nextRuns.push({ ...run, text: after });
    }
  });
  return mergeAdjacentCardRuns(nextRuns);
}

function toRgba(color: string, opacity: number): string {
  if (/^rgba?\(/i.test(color)) {
    return color;
  }
  const hex = color.replace("#", "").trim();
  if (hex.length !== 6) {
    return color;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function parseCssColorToHexAndOpacity(color: string): { hex: string; opacity: number } {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return { hex: trimmed, opacity: 100 };
  }
  const rgbaMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(",").map((part) => part.trim());
    const r = Math.max(0, Math.min(255, Number(parts[0]) || 0));
    const g = Math.max(0, Math.min(255, Number(parts[1]) || 0));
    const b = Math.max(0, Math.min(255, Number(parts[2]) || 0));
    const alpha = parts[3] === undefined ? 1 : Math.max(0, Math.min(1, Number(parts[3]) || 0));
    const hex = `#${[r, g, b]
      .map((value) => Math.round(value).toString(16).padStart(2, "0"))
      .join("")}`;
    return { hex, opacity: Math.round(alpha * 100) };
  }
  return { hex: "#000000", opacity: 0 };
}

function buildCssRgbaFromHexAndOpacity(hex: string, opacity: number): string {
  if (opacity >= 100) {
    return hex;
  }
  return toRgba(hex, Math.max(0, Math.min(100, opacity)) / 100);
}

async function pickColorWithEyeDropper(): Promise<string | null> {
  const EyeDropperCtor = (window as unknown as {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }).EyeDropper;
  if (!EyeDropperCtor) {
    return null;
  }
  try {
    const result = await new EyeDropperCtor().open();
    return result.sRGBHex;
  } catch {
    return null;
  }
}

function probePreviewAsset(kind: "image" | "video", src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(false), 1500);
    if (kind === "image") {
      const image = new Image();
      image.onload = () => {
        window.clearTimeout(timer);
        resolve(true);
      };
      image.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      image.src = src;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    video.src = src;
  });
}

function stripNarrationPrefixFromFluxPrompt(text: string, fluxPrompt: string): string {
  const normalizedText = text.trim();
  const normalizedPrompt = fluxPrompt.trim();
  if (!normalizedText || !normalizedPrompt) {
    return fluxPrompt;
  }
  const escapedText = normalizedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixRegex = new RegExp(`^${escapedText}[\\s]*[.ã€‚!?â€¦,:-]*[\\s]*`, "i");
  if (!prefixRegex.test(normalizedPrompt)) {
    return fluxPrompt;
  }
  const stripped = normalizedPrompt.replace(prefixRegex, "").trim();
  return stripped || fluxPrompt;
}

function mapCardTransitionToMotion(
  transitionStyle: NonNullable<SceneScriptDocument["cardNews"]>["transitionStyle"]
): SceneScriptItem["motion"] {
  if (transitionStyle === "slide") {
    return "pan-right";
  }
  if (transitionStyle === "wipe") {
    return "wipe-transition";
  }
  if (transitionStyle === "fade") {
    return "zoom-in";
  }
  return "none";
}

function getCardLayoutSubtitlePreset(layoutPreset: CardNewsLayoutPreset): Partial<SceneScriptSubtitleStyle> {
  if (layoutPreset === "split_story") {
    return { mode: "box", fontSize: 44, outline: 3 };
  }
  if (layoutPreset === "data_highlight") {
    return { mode: "box", fontSize: 40, outline: 2 };
  }
  return { mode: "outline", fontSize: 52, outline: 4 };
}

function buildDefaultCardDesign(sceneNo: number): NonNullable<SceneScriptItem["cardDesign"]> {
  return {
    layerOrder: 0,
    hidden: false,
    locked: false,
    xPct: 8,
    yPct: sceneNo === 1 ? 72 : 58,
    widthPct: 84,
    heightPct: sceneNo === 1 ? 20 : 30,
    align: "center",
    verticalAlign: "middle",
    fontFamily: "GongGothic B",
    fontSize: sceneNo === 1 ? 72 : 52,
    fontWeight: 700,
    textColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.52)",
    lineHeight: 1.28,
    padding: 28,
    outlineEnabled: true,
    outlineThickness: 8,
    outlineColor: "#000000",
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowDirectionDeg: 135,
    shadowOpacity: 45,
    shadowDistance: 10,
    shadowBlur: 0
  };
}

function toFriendlySceneScriptErrorMessage(error: unknown, isKorean: boolean): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Failed to load scene script.";
  if (raw.includes("scene-script.json was not found")) {
    return isKorean
      ? "ì„ íƒí•œ íŒ¨í‚¤ì§€ì— scene-scriptê°€ ì•„ì§ ì—†ìŠµë‹ˆë‹¤. 3ë²ˆ ìŠ¬ë¡¯ì—ì„œ ì†Œìž¬ ìƒì„±ì„ ë¨¼ì € ì‹¤í–‰í•´ ì£¼ì„¸ìš”."
      : "No completed scene script exists in this package yet. Run Slot 03 create first.";
  }
  return raw;
}

function cloneSceneScriptDocument(document: SceneScriptDocument): SceneScriptDocument {
  return JSON.parse(JSON.stringify(document)) as SceneScriptDocument;
}

function migrateSceneTextOverlaysToTimeline(document: SceneScriptDocument): SceneScriptDocument {
  if (document.videoTextOverlays && document.videoTextOverlays.length > 0) {
    return document;
  }
  let cursorSec = 0;
  const timelineTextOverlays: SceneScriptVideoTextOverlay[] = [];
  const scenes = document.scenes.map((scene) => {
    getSceneVideoTextOverlays(scene).forEach((overlay) => {
      timelineTextOverlays.push({
        ...overlay,
        startSec: roundTimelineSeconds(cursorSec + Math.max(0, Number(overlay.startSec ?? 0) || 0))
      });
    });
    cursorSec += Math.max(1, Number(scene.durationSec || 1));
    return {
      ...scene,
      videoTextOverlay: undefined,
      videoTextOverlays: undefined
    };
  });
  return {
    ...document,
    scenes,
    videoTextOverlays: timelineTextOverlays
  };
}

function migrateLegacyPlaybackRateDurations(document: SceneScriptDocument): SceneScriptDocument {
  let nextDocument = cloneSceneScriptDocument(document);
  const layersToMigrate = [...(nextDocument.videoMediaLayers ?? [])]
    .filter((layer) => {
      const playbackRate = clampPlaybackRate(Number(layer.playbackRate ?? 1));
      return layer.mediaType === "video" && playbackRate > 1.0001 && !Number(layer.sourceDurationSec);
    })
    .sort((a, b) => (Number(a.startSec ?? 0) || 0) - (Number(b.startSec ?? 0) || 0));

  layersToMigrate.forEach((targetLayer) => {
    const targetId = targetLayer.id;
    const currentLayer = (nextDocument.videoMediaLayers ?? []).find((layer) => layer.id === targetId);
    if (!currentLayer) {
      return;
    }
    const playbackRate = clampPlaybackRate(Number(currentLayer.playbackRate ?? 1));
    const oldDurationSec = Math.max(0.1, Number(currentLayer.durationSec || 0.1));
    const oldStartSec = Math.max(0, Number(currentLayer.startSec || 0));
    const oldEndSec = oldStartSec + oldDurationSec;
    const sourceDurationSec = oldDurationSec;
    const nextDurationSec = Number((sourceDurationSec / playbackRate).toFixed(3));
    const deltaSec = nextDurationSec - oldDurationSec;
    const isSameStart = (value?: number) => Math.abs((Number(value ?? 0) || 0) - oldStartSec) <= 0.05;
    const isAfterTarget = (value?: number) => (Number(value ?? 0) || 0) >= oldEndSec - 0.05;
    const shiftStart = (value?: number) => Number(((Number(value ?? 0) || 0) + deltaSec).toFixed(3));

    const nextVideoMediaLayers = (nextDocument.videoMediaLayers ?? []).map((layer) => {
      if (layer.id === targetId) {
        return {
          ...layer,
          playbackRate,
          sourceDurationSec,
          durationSec: nextDurationSec
        };
      }
      if (isAfterTarget(layer.startSec)) {
        return { ...layer, startSec: shiftStart(layer.startSec) };
      }
      return layer;
    });
    const nextAudioLayers = (nextDocument.audioLayers ?? []).map((layer) =>
      isAfterTarget(layer.startSec) ? { ...layer, startSec: shiftStart(layer.startSec) } : layer
    );
    const nextTextOverlays = (nextDocument.videoTextOverlays ?? []).map((overlay) => {
      if (isSameStart(overlay.startSec) && Math.abs(Number(overlay.durationSec ?? 0) - oldDurationSec) <= 0.1) {
        return { ...overlay, durationSec: nextDurationSec };
      }
      if (isAfterTarget(overlay.startSec)) {
        return { ...overlay, startSec: shiftStart(overlay.startSec) };
      }
      return overlay;
    });
    const nextScenes = nextDocument.scenes.map((scene) => {
      if (isSameStart(scene.startSec) && Math.abs(Number(scene.durationSec ?? 0) - oldDurationSec) <= 0.1) {
        return { ...scene, durationSec: Math.max(1, nextDurationSec) };
      }
      if (isAfterTarget(scene.startSec)) {
        return { ...scene, startSec: shiftStart(scene.startSec) };
      }
      return scene;
    });
    const nextEndSec = [
      ...nextScenes.map((scene) => (Number(scene.startSec ?? 0) || 0) + Math.max(0.1, Number(scene.durationSec) || 0.1)),
      ...nextVideoMediaLayers.map((layer) => (Number(layer.startSec ?? 0) || 0) + Math.max(0.1, Number(layer.durationSec) || 0.1)),
      ...nextAudioLayers.map((layer) => (Number(layer.startSec ?? 0) || 0) + Math.max(0.1, Number(layer.durationSec) || 0.1)),
      ...nextTextOverlays.map((overlay) => (Number(overlay.startSec ?? 0) || 0) + Math.max(0.1, Number(overlay.durationSec) || 0.1))
    ].reduce((max, value) => Math.max(max, value), 0);
    nextDocument = {
      ...nextDocument,
      scenes: nextScenes,
      videoMediaLayers: nextVideoMediaLayers,
      audioLayers: nextAudioLayers,
      videoTextOverlays: nextTextOverlays,
      targetDurationSec: Math.max(1, Math.ceil(nextEndSec))
    };
  });

  return nextDocument;
}

export function GenerationPage() {
  const {
    settings,
    workflowConfig,
    sceneScript,
    sceneScriptPackagePath,
    cardNewsTemplates,
    telegramStatus,
    workflowJobSnapshot,
    captureNewsSourceToVideoClip,
    inspectSceneScript,
    inspectEditorDraft,
    saveEditorDraft,
    saveSceneScript,
    captureCardPreviewImageAs,
    saveWorkflowConfig,
    searchPixabayAssets,
    importPixabayAsset,
    searchFreesoundAudio,
    importFreesoundAudio,
    importLocalAsset,
    listUploadedAssets,
    deleteUploadedAsset,
    generateVoiceLayer,
    pickCreateBackgroundFile,
    pickYouTubePackageFolder,
    refreshCardNewsTemplates,
    registerCardNewsTemplate,
    deleteCardNewsTemplate
  } = useAppStore();
  const copy = getLauncherCopy(settings?.launcherLanguage).pages.generation;
  const packagePath =
    sceneScriptPackagePath ??
    workflowJobSnapshot?.resolvedPackagePath ??
    telegramStatus?.lastPackagePath ??
    "";
  const [selectedPackagePath, setSelectedPackagePath] = useState("");
  const resolvedPackagePath = selectedPackagePath || packagePath;
  const [editableDocument, setEditableDocument] = useState<SceneScriptDocument | null>(null);
  const [selectedSceneNo, setSelectedSceneNo] = useState<number>(1);
  const [editorTab, setEditorTab] = useState<"scene" | "text" | "voice" | "ai">("scene");
  const [previewAssetIndex, setPreviewAssetIndex] = useState(0);
  const [timelineTimeSec, setTimelineTimeSec] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [hasGeneratedAssets, setHasGeneratedAssets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [positionDraft, setPositionDraft] = useState<Partial<Record<CanvasPositionField, string>>>({});
  const [editingPositionField, setEditingPositionField] = useState<CanvasPositionField | null>(null);
  const [positionDraftKey, setPositionDraftKey] = useState("");
  const [cardDesignDrag, setCardDesignDrag] = useState<CardDesignDragState | null>(null);
  const [videoTextDrag, setVideoTextDrag] = useState<{
    sceneNo: number;
    overlayIndex: number;
    mode: "move" | "resize";
    handle?: CanvasResizeHandle;
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
    startWidthPct: number;
    startHeightPct: number;
  } | null>(null);
  const [videoTextDragPreview, setVideoTextDragPreview] = useState<{
    sceneNo: number;
    overlayIndex: number;
    patch: Partial<Pick<SceneScriptVideoTextOverlay, "xPct" | "yPct" | "widthPct" | "heightPct">>;
  } | null>(null);
  const [videoMediaDrag, setVideoMediaDrag] = useState<{
    layerId: string;
    mode: "move" | "resize";
    handle?: CanvasResizeHandle;
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
    startWidthPct: number;
    startHeightPct: number;
  } | null>(null);
  const [videoMediaDragPreview, setVideoMediaDragPreview] = useState<{
    layerId: string;
    box: Pick<SceneScriptVideoMediaLayer, "xPct" | "yPct" | "widthPct" | "heightPct">;
  } | null>(null);
  const [croppingVideoMediaLayerId, setCroppingVideoMediaLayerId] = useState<string | null>(null);
  const [videoMediaCropDrag, setVideoMediaCropDrag] = useState<{
    layerId: string;
    handle: VideoMediaCropHandle;
    startClientX: number;
    startClientY: number;
    startTopPct: number;
    startRightPct: number;
    startBottomPct: number;
    startLeftPct: number;
    layerWidthPx: number;
    layerHeightPx: number;
  } | null>(null);
  const [timelineResizeDrag, setTimelineResizeDrag] = useState<{
    kind:
      | "scene-duration"
      | "scene-track"
      | "text-duration"
      | "text-track"
      | "media-duration"
      | "media-track"
      | "audio-duration"
      | "audio-track";
    sceneNo: number;
    overlayIndex?: number;
    layerId?: string;
    startClientX: number;
    startClientY: number;
    startDurationSec: number;
    startSceneStartSec?: number;
    startTextStartSec?: number;
    startLayerStartSec?: number;
    startTrackIndex?: number;
    secondsPerPixel: number;
    timelineBaseDurationSec: number;
    previewDurationSec?: number;
    baseSegments: Array<{
      sceneNo: number;
      startSec: number;
      durationSec: number;
    }>;
  } | null>(null);
  const [timelineSeekDrag, setTimelineSeekDrag] = useState(false);
  const [timelineSeekTooltip, setTimelineSeekTooltip] = useState<{ x: number; y: number; timeSec: number } | null>(null);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState(0);
  const [selectedVideoTextIndex, setSelectedVideoTextIndex] = useState(0);
  const [selectedVideoMediaLayerId, setSelectedVideoMediaLayerId] = useState<string | null>(null);
  const [selectedAudioLayerId, setSelectedAudioLayerId] = useState<string | null>(null);
  const [selectedTimelineTarget, setSelectedTimelineTarget] = useState<"scene" | "text" | "media" | "audio" | null>(null);
  const [selectedTimelineItems, setSelectedTimelineItems] = useState<TimelineSelectionItem[]>([]);
  const [pickingMotionFocusLayerId, setPickingMotionFocusLayerId] = useState<string | null>(null);
  const [pausedMotionPreviewLayerId, setPausedMotionPreviewLayerId] = useState<string | null>(null);
  const [timelineSelectionBox, setTimelineSelectionBox] = useState<TimelineSelectionBox | null>(null);
  const [timelineMultiMoveDrag, setTimelineMultiMoveDrag] = useState<TimelineMultiMoveDrag | null>(null);
  const [editingVideoText, setEditingVideoText] = useState<{
    sceneNo: number;
    overlayIndex: number;
  } | null>(null);
  const [editingPreviewBox, setEditingPreviewBox] = useState<{
    sceneNo: number;
    boxIndex: number;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ verticalPct?: number; horizontalPct?: number }>({});
  const snapGuidesRef = useRef<{ verticalPct?: number; horizontalPct?: number }>({});
  useEffect(() => {
    snapGuidesRef.current = snapGuides;
  }, [snapGuides]);
  const setCanvasSnapGuides = (nextGuides: { verticalPct?: number; horizontalPct?: number }) => {
    const current = snapGuidesRef.current;
    if (current.verticalPct === nextGuides.verticalPct && current.horizontalPct === nextGuides.horizontalPct) {
      return;
    }
    snapGuidesRef.current = nextGuides;
    setSnapGuides(nextGuides);
  };
  const [draggingLayerIndex, setDraggingLayerIndex] = useState<number | null>(null);
  const [dragOverLayerIndex, setDragOverLayerIndex] = useState<number | null>(null);
  const [draggingSceneIndex, setDraggingSceneIndex] = useState<number | null>(null);
  const [dragOverSceneIndex, setDragOverSceneIndex] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<SceneScriptDocument[]>([]);
  const [redoStack, setRedoStack] = useState<SceneScriptDocument[]>([]);
  const [showCardBoxOutline, setShowCardBoxOutline] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [videoIconSearch, setVideoIconSearch] = useState("");
  const [pixabayApiKeyDraft, setPixabayApiKeyDraft] = useState(workflowConfig?.pixabayApiKey ?? "");
  const [pixabayQuery, setPixabayQuery] = useState("");
  const [pixabayMediaType, setPixabayMediaType] = useState<"video" | "image">("video");
  const [pixabayResults, setPixabayResults] = useState<PixabayAssetResult[]>([]);
  const [pixabayBusy, setPixabayBusy] = useState(false);
  const [assetSourceTab, setAssetSourceTab] = useState<"upload" | "pixabay">("upload");
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAssetRecord[]>([]);
  const [uploadedAssetsBusy, setUploadedAssetsBusy] = useState(false);
  const [youtubeRecordUrl, setYoutubeRecordUrl] = useState("");
  const [youtubeRecordBusy, setYoutubeRecordBusy] = useState(false);
  const [draftStatus, setDraftStatus] = useState<{
    savedAt?: string;
    saveReason?: "manual" | "autosave";
    state: "idle" | "saving" | "saved" | "error";
    error?: string;
  }>({ state: "idle" });
  const [freesoundApiKeyDraft, setFreesoundApiKeyDraft] = useState(workflowConfig?.freesoundApiKey ?? "");
  const [freesoundQuery, setFreesoundQuery] = useState("");
  const [freesoundResults, setFreesoundResults] = useState<FreesoundAudioResult[]>([]);
  const [freesoundBusy, setFreesoundBusy] = useState(false);
  const [playingAssetKey, setPlayingAssetKey] = useState<string | null>(null);
  const [voiceLayerText, setVoiceLayerText] = useState("");
  const [voiceLayerBusy, setVoiceLayerBusy] = useState(false);
  const [aiMaterialTextDraft, setAiMaterialTextDraft] = useState("");
  const [aiMaterialUrlDraft, setAiMaterialUrlDraft] = useState("");
  const [aiWorkspaceBusy, setAiWorkspaceBusy] = useState(false);
  const [draggingAiMaterialId, setDraggingAiMaterialId] = useState<string | null>(null);
  const [dragOverAiMaterialId, setDragOverAiMaterialId] = useState<string | null>(null);
  const [assetPreviewVersion, setAssetPreviewVersion] = useState(0);
  const [audioWaveforms, setAudioWaveforms] = useState<Record<string, AudioWaveformPreview>>({});
  const editableDocumentRef = useRef<SceneScriptDocument | null>(null);
  const lastAutosavedDocumentRef = useRef("");
  const autosaveHydratedRef = useRef(false);
  const groupedHistorySnapshotRef = useRef<SceneScriptDocument | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaLayerVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioLayerRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const timelineClipboardRef = useRef<TimelineClipboardItem | null>(null);
  const videoMediaLayersRef = useRef<SceneScriptVideoMediaLayer[]>([]);
  const audioLayersRef = useRef<SceneScriptAudioLayer[]>([]);
  const selectedTimelineItemsRef = useRef<TimelineSelectionItem[]>([]);
  const suppressTimelineClickSelectionRef = useRef(false);
  const suppressSceneClickSelectionRef = useRef(false);
  const timelineSegmentsRef = useRef<Array<{
    scene: SceneScriptItem;
    startSec: number;
    endSec: number;
    durationSec: number;
  }>>([]);
  const selectedSceneNoRef = useRef(selectedSceneNo);
  const timelineTimeSecRef = useRef(0);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const editingPreviewDirtyRef = useRef(false);
  const activeRichTextSelectionRef = useRef<{
    sceneNo: number;
    boxIndex: number;
    start: number;
    end: number;
  } | null>(null);

  useEffect(() => {
    if (timelinePlaying) {
      setPausedMotionPreviewLayerId(null);
    }
  }, [timelinePlaying]);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const [cardStageFitScale, setCardStageFitScale] = useState(1);
  const [cardStageZoom, setCardStageZoom] = useState(1);
  const [cardStagePan, setCardStagePan] = useState({ x: 0, y: 0 });
  const [cardStagePanDrag, setCardStagePanDrag] = useState<CardStagePanState | null>(null);
  const [videoCanvasZoom, setVideoCanvasZoom] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const cardStageScale = cardStageFitScale * cardStageZoom;
  const isKorean = settings?.launcherLanguage === "ko";
  const createModuleId = workflowConfig?.createModuleId ?? "youtube-material-generator-mcp";
  const sceneStylePresets = useMemo(
    () => getMcpRuntimeContract(createModuleId)?.sceneStylePresets ?? [],
    [createModuleId]
  );
  const isCardNewsModule = createModuleId === "card-news-generator-mcp";
  const moduleCopy = useMemo(
    () => ({
      pageTitle: isCardNewsModule
        ? isKorean
          ? "카드뉴스 에디터"
          : "Card News Editor"
        : copy.title,
      pageSubtitle: isCardNewsModule
        ? isKorean
          ? "카드 문구, 배경 템플릿, 텍스트 스타일을 편집합니다."
          : "Edit card text, visual prompts, transitions, and timing before/after generation."
        : copy.subtitle,
      sceneLabel: isCardNewsModule ? (isKorean ? "카드" : "Card") : copy.sceneLabel,
      sceneList: isCardNewsModule ? (isKorean ? "카드 목록" : "Card List") : copy.sceneList,
      fluxPrompt: isCardNewsModule
        ? isKorean
          ? "카드 비주얼 프롬프트"
          : "Card Visual Prompt"
        : copy.fluxPrompt,
      assetSearchQuery: isCardNewsModule
        ? isKorean
          ? "이미지 검색 키워드"
          : "Image Search Query"
        : copy.assetSearchQuery
    }),
    [copy.assetSearchQuery, copy.fluxPrompt, copy.sceneLabel, copy.sceneList, copy.subtitle, copy.title, isCardNewsModule, isKorean]
  );
  const textFieldLabel = isCardNewsModule
    ? isKorean
      ? "카드 문구"
      : "Card Copy"
    : copy.text;
  const previewHintText = isCardNewsModule
    ? isKorean
      ? "선택한 카드의 배경과 텍스트를 여기서 확인합니다. Ctrl+휠로 확대하고 우클릭 드래그로 이동할 수 있습니다."
      : "Quickly review selected card copy, asset, and transition."
    : isKorean
      ? "ì„ íƒí•œ ì”¬ì˜ ë‚´ë ˆì´ì…˜/í‚¤ì›Œë“œ/ëª¨ì…˜ì„ ì˜¤ë¥¸ìª½ì—ì„œ ë¹ ë¥´ê²Œ ê²€í† í•˜ì„¸ìš”."
      : "Quickly review selected scene narration, keyword, and motion here.";

  useEffect(() => {
    editableDocumentRef.current = editableDocument;
  }, [editableDocument]);

  useEffect(() => {
    if (isCardNewsModule && cardNewsTemplates.length === 0) {
      void refreshCardNewsTemplates();
    }
  }, [cardNewsTemplates.length, isCardNewsModule, refreshCardNewsTemplates]);

  useEffect(() => {
    setPixabayApiKeyDraft(workflowConfig?.pixabayApiKey ?? "");
  }, [workflowConfig?.pixabayApiKey]);
  useEffect(() => {
    setFreesoundApiKeyDraft(workflowConfig?.freesoundApiKey ?? "");
  }, [workflowConfig?.freesoundApiKey]);

  const refreshUploadedAssets = async () => {
    if (!resolvedPackagePath) {
      setUploadedAssets([]);
      return;
    }
    setUploadedAssetsBusy(true);
    try {
      setUploadedAssets(await listUploadedAssets(resolvedPackagePath));
    } catch {
      setUploadedAssets([]);
    } finally {
      setUploadedAssetsBusy(false);
    }
  };

  const handleRecordYouTubeClipFromEditor = async () => {
    const sourceUrl = youtubeRecordUrl.trim() || "https://www.youtube.com/";
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "먼저 작업 패키지 경로를 선택해 주세요." : "Select a package path first.");
      return;
    }

    setYoutubeRecordBusy(true);
    setMessage(
      youtubeRecordUrl.trim()
        ? isKorean
          ? "유튜브를 열고 녹화 영역을 선택해 주세요."
          : "Opening YouTube. Select the area to record."
        : isKorean
          ? "유튜브 홈을 엽니다. 원하는 영상을 검색한 뒤 녹화 영역을 선택해 주세요."
          : "Opening YouTube home. Search freely, then select the area to record."
    );
    try {
      const result = await captureNewsSourceToVideoClip(sourceUrl, resolvedPackagePath);
      setAssetPreviewVersion((current) => current + 1);
      await refreshUploadedAssets();
      setAssetSourceTab("upload");
      setMessage(
        result.packageUpdated
          ? isKorean
            ? "녹화본을 Upload에 저장했습니다. 필요한 위치에서 추가해 주세요."
            : "Saved the recording to Upload. Add it at the playhead when ready."
          : isKorean
            ? `녹화본을 저장했습니다: ${result.videoPath}`
            : `Saved recording: ${result.videoPath}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.trim()
          ? isKorean
            ? `유튜브 녹화에 실패했습니다. ${error.message}`
            : `YouTube recording failed. ${error.message}`
          : isKorean
            ? "유튜브 녹화에 실패했습니다."
            : "YouTube recording failed."
      );
    } finally {
      setYoutubeRecordBusy(false);
    }
  };

  useEffect(() => {
    if (isCardNewsModule) {
      return;
    }
    void refreshUploadedAssets();
  }, [assetPreviewVersion, isCardNewsModule, resolvedPackagePath]);

  useEffect(() => {
    if (isCardNewsModule && (editorTab === "text" || editorTab === "voice")) {
      setEditorTab("scene");
    }
  }, [editorTab, isCardNewsModule]);

  const applyDocumentUpdate = (
    updater: (current: SceneScriptDocument) => SceneScriptDocument,
    options?: { recordHistory?: boolean }
  ) => {
    const current = editableDocumentRef.current;
    if (!current) {
      return;
    }
    const next = updater(current);
    const currentSnapshot = cloneSceneScriptDocument(current);
    const nextSnapshot = cloneSceneScriptDocument(next);
    if (JSON.stringify(currentSnapshot) === JSON.stringify(nextSnapshot)) {
      return;
    }
    if (options?.recordHistory !== false) {
      setUndoStack((prev) => [...prev.slice(-79), currentSnapshot]);
      setRedoStack([]);
    }
    editableDocumentRef.current = nextSnapshot;
    setEditableDocument(nextSnapshot);
  };

  const updateSoundLayerVolume = (
    kind: "media" | "audio",
    layerId: string,
    volume: number,
    options?: { recordHistory?: boolean }
  ) => {
    const nextVolume = clampLayerVolume(volume);
    applyDocumentUpdate((current) => {
      if (kind === "media") {
        return {
          ...current,
          videoMediaLayers: (current.videoMediaLayers ?? []).map((layer) =>
            layer.id === layerId ? { ...layer, volume: nextVolume } : layer
          )
        };
      }
      return {
        ...current,
        audioLayers: (current.audioLayers ?? []).map((layer) =>
          layer.id === layerId ? { ...layer, volume: nextVolume } : layer
        )
      };
    }, options);
  };

  const updateVideoMediaLayerPlaybackRate = (
    layerId: string,
    playbackRate: number,
    options?: { recordHistory?: boolean }
  ) => {
    const nextPlaybackRate = Number(clampPlaybackRate(playbackRate).toFixed(2));
    applyDocumentUpdate((current) => {
      const targetLayer = (current.videoMediaLayers ?? []).find((layer) => layer.id === layerId);
      if (!targetLayer) {
        return current;
      }
      const oldPlaybackRate = clampPlaybackRate(Number(targetLayer.playbackRate ?? 1));
      const oldDurationSec = Math.max(0.1, Number(targetLayer.durationSec || 0.1));
      const oldStartSec = Math.max(0, Number(targetLayer.startSec || 0));
      const oldEndSec = oldStartSec + oldDurationSec;
      const sourceDurationSec = Math.max(
        0.1,
        Number(targetLayer.sourceDurationSec ?? oldDurationSec * oldPlaybackRate) || oldDurationSec
      );
      const nextDurationSec = Number((sourceDurationSec / nextPlaybackRate).toFixed(3));
      const deltaSec = nextDurationSec - oldDurationSec;
      const isSameStart = (value?: number) => Math.abs((Number(value ?? 0) || 0) - oldStartSec) <= 0.05;
      const isAfterTarget = (value?: number) => (Number(value ?? 0) || 0) >= oldEndSec - 0.05;
      const shiftStart = (value?: number) => Number(((Number(value ?? 0) || 0) + deltaSec).toFixed(3));
      const nextVideoMediaLayers = (current.videoMediaLayers ?? []).map((layer) => {
        if (layer.id === layerId) {
          return {
            ...layer,
            playbackRate: nextPlaybackRate,
            sourceDurationSec,
            durationSec: nextDurationSec
          };
        }
        if (isAfterTarget(layer.startSec)) {
          return { ...layer, startSec: shiftStart(layer.startSec) };
        }
        return layer;
      });
      const nextAudioLayers = (current.audioLayers ?? []).map((layer) =>
        isAfterTarget(layer.startSec) ? { ...layer, startSec: shiftStart(layer.startSec) } : layer
      );
      const nextTextOverlays = (current.videoTextOverlays ?? []).map((overlay) => {
        if (isSameStart(overlay.startSec) && Math.abs(Number(overlay.durationSec ?? 0) - oldDurationSec) <= 0.1) {
          return { ...overlay, durationSec: nextDurationSec };
        }
        if (isAfterTarget(overlay.startSec)) {
          return { ...overlay, startSec: shiftStart(overlay.startSec) };
        }
        return overlay;
      });
      const nextScenes = current.scenes.map((scene) => {
        if (isSameStart(scene.startSec) && Math.abs(Number(scene.durationSec ?? 0) - oldDurationSec) <= 0.1) {
          return { ...scene, durationSec: Math.max(1, nextDurationSec) };
        }
        if (isAfterTarget(scene.startSec)) {
          return { ...scene, startSec: shiftStart(scene.startSec) };
        }
        return scene;
      });
      const nextEndSec = [
        ...nextScenes.map((scene) => (Number(scene.startSec ?? 0) || 0) + Math.max(0.1, Number(scene.durationSec) || 0.1)),
        ...nextVideoMediaLayers.map((layer) => (Number(layer.startSec ?? 0) || 0) + Math.max(0.1, Number(layer.durationSec) || 0.1)),
        ...nextAudioLayers.map((layer) => (Number(layer.startSec ?? 0) || 0) + Math.max(0.1, Number(layer.durationSec) || 0.1)),
        ...nextTextOverlays.map((overlay) => (Number(overlay.startSec ?? 0) || 0) + Math.max(0.1, Number(overlay.durationSec) || 0.1))
      ].reduce((max, value) => Math.max(max, value), 0);
      return {
        ...current,
        scenes: nextScenes,
        videoMediaLayers: nextVideoMediaLayers,
        audioLayers: nextAudioLayers,
        videoTextOverlays: nextTextOverlays,
        targetDurationSec: Math.max(1, Math.ceil(nextEndSec))
      };
    }, options);
  };

  const beginGroupedDocumentChange = () => {
    if (!groupedHistorySnapshotRef.current && editableDocumentRef.current) {
      groupedHistorySnapshotRef.current = cloneSceneScriptDocument(editableDocumentRef.current);
    }
  };

  const commitGroupedDocumentChange = () => {
    const snapshot = groupedHistorySnapshotRef.current;
    const current = editableDocumentRef.current;
    groupedHistorySnapshotRef.current = null;
    if (!snapshot || !current || JSON.stringify(snapshot) === JSON.stringify(current)) {
      return;
    }
    setUndoStack((prev) => [...prev.slice(-79), snapshot]);
    setRedoStack([]);
  };

  const undoDocumentChange = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const current = editableDocumentRef.current;
      const previous = prev[prev.length - 1];
      if (current) {
        setRedoStack((redoPrev) => [...redoPrev.slice(-79), cloneSceneScriptDocument(current)]);
      }
      const previousSnapshot = cloneSceneScriptDocument(previous);
      editableDocumentRef.current = previousSnapshot;
      setEditableDocument(previousSnapshot);
      return prev.slice(0, -1);
    });
  };

  const redoDocumentChange = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const current = editableDocumentRef.current;
      const next = prev[prev.length - 1];
      if (current) {
        setUndoStack((undoPrev) => [...undoPrev.slice(-79), cloneSceneScriptDocument(current)]);
      }
      const nextSnapshot = cloneSceneScriptDocument(next);
      editableDocumentRef.current = nextSnapshot;
      setEditableDocument(nextSnapshot);
      return prev.slice(0, -1);
    });
  };

  const selectedVideoCanvasPreset = getVideoCanvasPreset(editableDocument?.videoCanvas?.preset);

  const updateVideoCanvasPreset = (presetId: VideoCanvasPresetId) => {
    const preset = getVideoCanvasPreset(presetId);
    applyDocumentUpdate((current) => ({
      ...current,
      videoCanvas: {
        preset: preset.id,
        width: preset.width,
        height: preset.height
      }
    }));
  };

  useEffect(() => {
    if (!resolvedPackagePath) {
      setEditableDocument(null);
      editableDocumentRef.current = null;
      setUndoStack([]);
      setRedoStack([]);
      lastAutosavedDocumentRef.current = "";
      autosaveHydratedRef.current = false;
      return;
    }
    void inspectSceneScript(resolvedPackagePath).catch((error) => {
      setMessage(toFriendlySceneScriptErrorMessage(error, isKorean));
    });
  }, [inspectSceneScript, isKorean, resolvedPackagePath]);

  useEffect(() => {
    if (!sceneScript) {
      setEditableDocument(null);
      editableDocumentRef.current = null;
      setUndoStack([]);
      setRedoStack([]);
      lastAutosavedDocumentRef.current = "";
      autosaveHydratedRef.current = false;
      return;
    }
    const normalizedDocument: SceneScriptDocument = {
      ...sceneScript,
      videoCanvas: {
        preset: sceneScript.videoCanvas?.preset ?? "landscape_16_9",
        width: sceneScript.videoCanvas?.width ?? 1920,
        height: sceneScript.videoCanvas?.height ?? 1080
      },
      scenes: sceneScript.scenes.map((scene) => ({
        ...scene,
        fluxPrompt: stripNarrationPrefixFromFluxPrompt(scene.text, scene.fluxPrompt),
        cardDesign:
          isCardNewsModule
            ? {
                ...buildDefaultCardDesign(scene.sceneNo),
                ...(scene.cardDesign ?? {})
              }
            : scene.cardDesign,
        cardDesignBoxes:
          isCardNewsModule
            ? (scene.cardDesignBoxes && scene.cardDesignBoxes.length > 0
                ? scene.cardDesignBoxes.map((box, index) => ({
                    ...buildDefaultCardDesign(scene.sceneNo),
                    ...(box ?? {}),
                    id: box?.id ?? `box-${scene.sceneNo}-${index + 1}`,
                    layerOrder: box?.layerOrder ?? index,
                    hidden: Boolean(box?.hidden),
                    locked: Boolean(box?.locked)
                  }))
                : [
                    {
                      ...buildDefaultCardDesign(scene.sceneNo),
                      ...(scene.cardDesign ?? {}),
                      id: `box-${scene.sceneNo}-1`,
                      layerOrder: 0,
                      hidden: false,
                      locked: false
                    }
                  ])
            : scene.cardDesignBoxes
      })),
      cardNews: isCardNewsModule
        ? {
            layoutPreset: sceneScript.cardNews?.layoutPreset ?? "headline_focus",
            transitionStyle: sceneScript.cardNews?.transitionStyle ?? "cut",
            outputFormat: sceneScript.cardNews?.outputFormat ?? "square_1_1",
            coverSource: sceneScript.cardNews?.coverSource ?? "ai_generate",
            coverPrompt: sceneScript.cardNews?.coverPrompt ?? "",
            coverImagePath: sceneScript.cardNews?.coverImagePath ?? "",
            templateBackgroundPath: sceneScript.cardNews?.templateBackgroundPath ?? ""
          }
        : sceneScript.cardNews
    };
    const loadedDocument = isCardNewsModule
      ? normalizedDocument
      : migrateLegacyPlaybackRateDurations(migrateSceneTextOverlaysToTimeline(normalizedDocument));
    setEditableDocument(loadedDocument);
    editableDocumentRef.current = loadedDocument;
    lastAutosavedDocumentRef.current = JSON.stringify(loadedDocument);
    autosaveHydratedRef.current = true;
    setDraftStatus({ state: "idle" });
    setUndoStack([]);
    setRedoStack([]);
    setSelectedSceneNo(sceneScript.scenes[0]?.sceneNo ?? 1);
  }, [isCardNewsModule, sceneScript]);

  const selectedScene = useMemo(
    () => editableDocument?.scenes.find((scene) => scene.sceneNo === selectedSceneNo),
    [editableDocument, selectedSceneNo]
  );
  const aiWorkspace = useMemo(
    () =>
      editableDocument?.aiWorkspace ??
      buildDefaultAiWorkspace(isCardNewsModule ? "card_news" : "video"),
    [editableDocument?.aiWorkspace, isCardNewsModule]
  );
  const videoMediaLayers = useMemo(
    () => editableDocument?.videoMediaLayers ?? [],
    [editableDocument?.videoMediaLayers]
  );
  const audioLayers = useMemo(
    () => editableDocument?.audioLayers ?? [],
    [editableDocument?.audioLayers]
  );
  const videoTextLayers = useMemo(
    () => editableDocument?.videoTextOverlays ?? [],
    [editableDocument?.videoTextOverlays]
  );
  const selectedVideoMediaLayer = useMemo(
    () => videoMediaLayers.find((layer) => layer.id === selectedVideoMediaLayerId) ?? null,
    [selectedVideoMediaLayerId, videoMediaLayers]
  );
  const selectedAudioLayer = useMemo(
    () => audioLayers.find((layer) => layer.id === selectedAudioLayerId) ?? null,
    [audioLayers, selectedAudioLayerId]
  );
  const selectedVideoTextOverlays = useMemo(
    () => (isCardNewsModule ? getSceneVideoTextOverlays(selectedScene) : videoTextLayers),
    [isCardNewsModule, selectedScene, videoTextLayers]
  );
  const selectedVideoTextOverlay = selectedVideoTextOverlays[selectedVideoTextIndex] ?? selectedVideoTextOverlays[0];
  const selectedCardDesignBoxes = useMemo(() => {
    if (!selectedScene) {
      return [] as Array<NonNullable<SceneScriptItem["cardDesign"]>>;
    }
    if (selectedScene.cardDesignBoxes) {
      return selectedScene.cardDesignBoxes.map((box, index) => ({
        ...buildDefaultCardDesign(selectedScene.sceneNo),
        ...(box ?? {}),
        id: box?.id ?? `box-${selectedScene.sceneNo}-${index + 1}`,
        layerOrder: box?.layerOrder ?? index,
        hidden: Boolean(box?.hidden),
        locked: Boolean(box?.locked)
      }));
    }
    if (!selectedScene.cardDesign) {
      return [];
    }
    return [
      {
        ...buildDefaultCardDesign(selectedScene.sceneNo),
        ...(selectedScene.cardDesign ?? {})
      }
    ];
  }, [selectedScene]);
  const selectedCardDesign = useMemo(
    () =>
      selectedCardDesignBoxes.length > 0
        ? selectedCardDesignBoxes[Math.min(selectedBoxIndex, selectedCardDesignBoxes.length - 1)] ?? null
        : null,
    [selectedBoxIndex, selectedCardDesignBoxes]
  );
  const selectedCardBackground = useMemo(
    () => parseCssColorToHexAndOpacity(selectedCardDesign?.backgroundColor ?? "rgba(0,0,0,0)"),
    [selectedCardDesign?.backgroundColor]
  );
  const isCardBoxTextMode = Boolean(
    isCardNewsModule && selectedScene && selectedCardDesign
  );
  const activeTextValue = isCardBoxTextMode
    ? selectedCardDesign?.text ?? ""
    : selectedScene?.text ?? "";
  const previewCardDesignBoxes = useMemo(
    () =>
      selectedCardDesignBoxes
        .map((box, index) => ({
          ...box,
          _sourceIndex: index
        }))
        .filter((box) => !box.hidden)
        .sort((left, right) => (left.layerOrder ?? left._sourceIndex) - (right.layerOrder ?? right._sourceIndex)),
    [selectedCardDesignBoxes]
  );
  const filteredCardNewsSymbols = useMemo(() => {
    const keyword = symbolSearch.trim().toLowerCase();
    if (!keyword) {
      return CARD_NEWS_SYMBOLS;
    }
    return CARD_NEWS_SYMBOLS.filter(
      (item) =>
        item.symbol.toLowerCase().includes(keyword) ||
        item.label.toLowerCase().includes(keyword)
    );
  }, [symbolSearch]);
  const filteredVideoIcons = useMemo(() => {
    const keyword = videoIconSearch.trim().toLowerCase();
    if (!keyword) {
      return VIDEO_ICON_LIBRARY;
    }
    return VIDEO_ICON_LIBRARY.filter(
      (item) =>
        item.id.includes(keyword) ||
        item.labelKo.toLowerCase().includes(keyword) ||
        item.labelEn.toLowerCase().includes(keyword) ||
        item.tags.includes(keyword)
    );
  }, [videoIconSearch]);
  const totalDurationSec = useMemo(
    () => {
      let cursor = 0;
      const sceneEndTimes = (editableDocument?.scenes ?? []).map((scene) => {
        const startSec = getSceneStartSec(scene, cursor);
        const durationSec = Math.max(1, Number(scene.durationSec || 1));
        cursor = Math.max(cursor, startSec + durationSec);
        return startSec + durationSec;
      });
      const layerEndTimes = [
        ...(editableDocument?.videoMediaLayers ?? []).map((layer) =>
          Math.max(0, Number(layer.startSec || 0)) + Math.max(0.5, Number(layer.durationSec || 0.5))
        ),
        ...(editableDocument?.audioLayers ?? []).map((layer) =>
          Math.max(0, Number(layer.startSec || 0)) + Math.max(0.5, Number(layer.durationSec || 0.5))
        ),
        ...(editableDocument?.videoTextOverlays ?? []).map((overlay) =>
          Math.max(0, Number(overlay.startSec ?? 0) || 0) + Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5)
        )
      ];
      return Math.max(1, roundTimelineSeconds(Math.max(0, ...sceneEndTimes, ...layerEndTimes)));
    },
    [editableDocument]
  );
  const timelineSegments = useMemo(() => {
    let cursor = 0;
    return (editableDocument?.scenes ?? []).map((scene) => {
      const startSec = getSceneStartSec(scene, cursor);
      const durationSec = Math.max(1, Number(scene.durationSec || 1));
      const segment = {
        scene,
        startSec,
        endSec: startSec + durationSec,
        durationSec
      };
      cursor = Math.max(cursor, startSec + durationSec);
      return segment;
    });
  }, [editableDocument]);
  const videoElementTrackCount = useMemo(
    () =>
      Math.max(
        1,
        ...(isCardNewsModule
          ? timelineSegments.flatMap((segment) =>
              getSceneVideoTextOverlays(segment.scene).map((overlay) => Math.max(0, Number(overlay.trackIndex ?? 0) || 0) + 1)
            )
          : videoTextLayers.map((overlay) => Math.max(0, Number(overlay.trackIndex ?? 0) || 0) + 1))
      ),
    [isCardNewsModule, timelineSegments, videoTextLayers]
  );
  const videoMediaTrackCount = useMemo(
    () =>
      Math.max(
        1,
        ...videoMediaLayers.map((layer) => Math.max(0, Number(layer.trackIndex ?? 0) || 0) + 1)
      ),
    [videoMediaLayers]
  );
  const audioTrackCount = useMemo(
    () =>
      Math.max(
        1,
        ...audioLayers.map((layer) => Math.max(0, Number(layer.trackIndex ?? 0) || 0) + 1)
      ),
    [audioLayers]
  );
  const getTimelineDisplaySegment = (sceneNo: number) => {
    if (!timelineResizeDrag || timelineResizeDrag.kind !== "scene-duration") {
      return timelineSegments.find((segment) => segment.scene.sceneNo === sceneNo);
    }
    const baseSegment = timelineResizeDrag.baseSegments.find((segment) => segment.sceneNo === sceneNo);
    const targetBaseSegment = timelineResizeDrag.baseSegments.find(
      (segment) => segment.sceneNo === timelineResizeDrag.sceneNo
    );
    if (!baseSegment || !targetBaseSegment) {
      return timelineSegments.find((segment) => segment.scene.sceneNo === sceneNo);
    }
    const targetDurationSec = Math.max(
      1,
      Number(timelineResizeDrag.previewDurationSec ?? timelineResizeDrag.startDurationSec)
    );
    const durationDeltaSec = targetDurationSec - timelineResizeDrag.startDurationSec;
    return {
      sceneNo,
      startSec:
        baseSegment.startSec > targetBaseSegment.startSec
          ? baseSegment.startSec + durationDeltaSec
          : baseSegment.startSec,
      durationSec: sceneNo === timelineResizeDrag.sceneNo ? targetDurationSec : baseSegment.durationSec
    };
  };
  const timelineDisplayDurationSec = timelineResizeDrag?.timelineBaseDurationSec ?? totalDurationSec;
  const timelineContentWidth = `${Math.max(0.5, Math.min(8, timelineZoom)) * 100}%`;
  const activeTimelineSegment = useMemo(
    () =>
      timelineSegments.find((segment) => segment.scene.sceneNo === selectedSceneNo) ??
      timelineSegments[0],
    [selectedSceneNo, timelineSegments]
  );
  const timelineTickMarks = useMemo(() => {
    const step = totalDurationSec <= 30 ? 5 : totalDurationSec <= 90 ? 10 : 15;
    const ticks: number[] = [];
    for (let current = 0; current <= totalDurationSec; current += step) {
      ticks.push(current);
    }
    if (ticks[ticks.length - 1] !== totalDurationSec) {
      ticks.push(totalDurationSec);
    }
    return ticks;
  }, [totalDurationSec]);
  const timelinePlayheadLeft = buildTimelinePlayheadLeft(timelineTimeSec, timelineDisplayDurationSec);

  const seekTimeline = (nextTimeSec: number) => {
    const clampedTime = Math.max(0, Math.min(totalDurationSec, nextTimeSec));
    timelineTimeSecRef.current = clampedTime;
    setTimelineTimeSec(clampedTime);
    const targetSegment =
      timelineSegments.find((segment) => clampedTime >= segment.startSec && clampedTime < segment.endSec) ??
      timelineSegments[timelineSegments.length - 1];
    if (targetSegment && targetSegment.scene.sceneNo !== selectedSceneNo) {
      setSelectedSceneNo(targetSegment.scene.sceneNo);
    }
  };

  const getTimelineItemTiming = (item: TimelineSelectionItem) => {
    if (item.kind === "media") {
      const layer = videoMediaLayers.find((candidate) => candidate.id === item.id);
      if (!layer) {
        return null;
      }
      return {
        startSec: Math.max(0, Number(layer.startSec || 0)),
        durationSec: Math.max(0.5, Number(layer.durationSec || 0.5))
      };
    }
    if (item.kind === "audio") {
      const layer = audioLayers.find((candidate) => candidate.id === item.id);
      if (!layer) {
        return null;
      }
      return {
        startSec: Math.max(0, Number(layer.startSec || 0)),
        durationSec: Math.max(0.5, Number(layer.durationSec || 0.5))
      };
    }
    const overlay = videoTextLayers[item.index];
    if (!overlay) {
      return null;
    }
    return {
      startSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
      durationSec: Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5)
    };
  };

  const seekTimelineItemCenter = (item: TimelineSelectionItem) => {
    const timing = getTimelineItemTiming(item);
    if (!timing) {
      return;
    }
    setTimelinePlaying(false);
    seekTimeline(timing.startSec + timing.durationSec / 2);
  };

  const seekSceneStart = (sceneNo: number) => {
    setSelectedSceneNo(sceneNo);
    setSelectedVideoTextIndex(0);
    clearTimelineLayerSelection();
    const targetSegment = timelineSegments.find((segment) => segment.scene.sceneNo === sceneNo);
    if (targetSegment) {
      seekTimeline(targetSegment.startSec);
      return;
    }
  };

  const seekTimelineFromClientX = (clientX: number) => {
    const track = timelineTrackRef.current;
    if (!track) {
      return timelineTimeSecRef.current;
    }
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const nextTimeSec = ratio * totalDurationSec;
    setTimelinePlaying(false);
    seekTimeline(nextTimeSec);
    return nextTimeSec;
  };

  const beginTimelineSeekDrag = (event: ReactMouseEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const nextTimeSec = seekTimelineFromClientX(event.clientX);
    setTimelineSeekDrag(true);
    setTimelineSeekTooltip({ x: event.clientX, y: event.clientY, timeSec: nextTimeSec });
  };

  const getTimelineSnapTargets = (
    ignore?: { mediaLayerId?: string; audioLayerId?: string; textSceneNo?: number; textOverlayIndex?: number }
  ) => {
    const document = editableDocumentRef.current;
    if (!document) {
      return [0, totalDurationSec];
    }
    const sceneSegments = timelineSegmentsRef.current.length > 0 ? timelineSegmentsRef.current : timelineSegments;
    const targets = new Set<number>([0, totalDurationSec, timelineTimeSecRef.current]);
    sceneSegments.forEach((segment) => {
      targets.add(segment.startSec);
      targets.add(segment.endSec);
    });
    (document.videoMediaLayers ?? []).forEach((layer) => {
      if (layer.id === ignore?.mediaLayerId) {
        return;
      }
      const startSec = Math.max(0, Number(layer.startSec || 0));
      const endSec = startSec + Math.max(0.5, Number(layer.durationSec || 0.5));
      targets.add(startSec);
      targets.add(endSec);
    });
    (document.audioLayers ?? []).forEach((layer) => {
      if (layer.id === ignore?.audioLayerId) {
        return;
      }
      const startSec = Math.max(0, Number(layer.startSec || 0));
      const endSec = startSec + Math.max(0.5, Number(layer.durationSec || 0.5));
      targets.add(startSec);
      targets.add(endSec);
    });
    const textOverlays =
      !isCardNewsModule && document.videoTextOverlays
        ? document.videoTextOverlays.map((overlay, overlayIndex) => ({
            overlay,
            overlayIndex,
            startSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
            fallbackDurationSec: totalDurationSec
          }))
        : sceneSegments.flatMap((segment) =>
            getSceneVideoTextOverlays(segment.scene).map((overlay, overlayIndex) => ({
              overlay,
              overlayIndex,
              startSec: segment.startSec + Math.max(0, Number(overlay.startSec ?? 0) || 0),
              fallbackDurationSec: segment.durationSec
            }))
          );
    textOverlays.forEach(({ overlay, overlayIndex, startSec, fallbackDurationSec }) => {
        if (overlayIndex === ignore?.textOverlayIndex) {
          return;
        }
        const endSec = startSec + Math.max(0.5, Number(overlay.durationSec ?? fallbackDurationSec) || 0.5);
        targets.add(startSec);
        targets.add(endSec);
    });
    return [...targets].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  };

  const snapTimelineValue = (
    rawValueSec: number,
    ignore?: { mediaLayerId?: string; audioLayerId?: string; textSceneNo?: number; textOverlayIndex?: number }
  ) => {
    const targets = getTimelineSnapTargets(ignore);
    const closest = targets.reduce<{ value: number; distance: number } | null>((best, target) => {
      const distance = Math.abs(target - rawValueSec);
      if (distance > TIMELINE_SNAP_THRESHOLD_SEC) {
        return best;
      }
      if (!best || distance < best.distance) {
        return { value: target, distance };
      }
      return best;
    }, null);
    return closest ? closest.value : rawValueSec;
  };

  const clampTimelineStart = (startSec: number, durationSec: number) =>
    roundTimelineSeconds(Math.max(0, Math.min(Math.max(0, totalDurationSec - durationSec), startSec)));

  const clearTimelineLayerSelection = () => {
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineTarget(null);
    setSelectedTimelineItems([]);
  };

  const blurActiveInlineEditor = () => {
    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.isContentEditable) {
      activeElement.blur();
    }
  };

  const clearVideoEditorSelection = () => {
    blurActiveInlineEditor();
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineTarget(null);
    setSelectedTimelineItems([]);
    setEditingVideoText(null);
  };

  const getTimelineSelectionKey = (item: TimelineSelectionItem) =>
    item.kind === "text" ? `text:${item.index}` : `${item.kind}:${item.id}`;

  const applyTimelineClipPreviewToDom = (
    key: string,
    placement: { startSec: number; durationSec: number; trackIndex: number }
  ) => {
    const displayDurationSec = Math.max(0.5, timelineDisplayDurationSec);
    document.querySelectorAll<HTMLElement>("[data-timeline-key]").forEach((element) => {
      if (element.dataset.timelineKey !== key) {
        return;
      }
      element.style.left = `${(placement.startSec / displayDurationSec) * 100}%`;
      element.style.width = `${(placement.durationSec / displayDurationSec) * 100}%`;
      element.style.top = `${6 + placement.trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`;
    });
  };

  const isTimelineItemSelected = (item: TimelineSelectionItem) => {
    const key = getTimelineSelectionKey(item);
    return selectedTimelineItems.some((selectedItem) => getTimelineSelectionKey(selectedItem) === key);
  };

  const selectTimelineItem = (
    item: TimelineSelectionItem,
    event?: Pick<ReactMouseEvent, "shiftKey" | "ctrlKey" | "metaKey">,
    options?: { focusTime?: boolean }
  ) => {
    const additive = Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    if (!additive && suppressTimelineClickSelectionRef.current) {
      suppressTimelineClickSelectionRef.current = false;
      return;
    }
    setSelectedTimelineItems((current) => {
      const key = getTimelineSelectionKey(item);
      const exists = current.some((selectedItem) => getTimelineSelectionKey(selectedItem) === key);
      if (additive) {
        return exists ? current.filter((selectedItem) => getTimelineSelectionKey(selectedItem) !== key) : [...current, item];
      }
      return [item];
    });
    if (options?.focusTime ?? !additive) {
      seekTimelineItemCenter(item);
    }
    if (item.kind === "media") {
      setSelectedVideoMediaLayerId(item.id);
      setSelectedAudioLayerId(null);
      setSelectedTimelineTarget("media");
      return;
    }
    if (item.kind === "audio") {
      setSelectedAudioLayerId(item.id);
      setSelectedVideoMediaLayerId(null);
      setSelectedTimelineTarget("audio");
      return;
    }
    setSelectedVideoTextIndex(item.index);
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineTarget("text");
  };

  const selectOnlyTimelineItem = (item: TimelineSelectionItem) => selectTimelineItem(item);

  const buildTimelineSelectionItems = () => [
    ...videoMediaLayersRef.current.map((layer) => ({
      selection: { kind: "media" as const, id: layer.id },
      startSec: Math.max(0, Number(layer.startSec || 0)),
      durationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
      trackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0)
    })),
    ...audioLayersRef.current.map((layer) => ({
      selection: { kind: "audio" as const, id: layer.id },
      startSec: Math.max(0, Number(layer.startSec || 0)),
      durationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
      trackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0)
    })),
    ...(editableDocumentRef.current?.videoTextOverlays ?? []).map((overlay, index) => ({
      selection: { kind: "text" as const, index },
      startSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
      durationSec: Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5),
      trackIndex: Math.max(0, Number(overlay.trackIndex ?? 0) || 0)
    }))
  ];

  const getCurrentTimelineSelectionItems = () => {
    const items = selectedTimelineItemsRef.current;
    if (items.length > 0) {
      return items;
    }
    if (selectedTimelineTarget === "media" && selectedVideoMediaLayerId) {
      return [{ kind: "media" as const, id: selectedVideoMediaLayerId }];
    }
    if (selectedTimelineTarget === "audio" && selectedAudioLayerId) {
      return [{ kind: "audio" as const, id: selectedAudioLayerId }];
    }
    if (selectedTimelineTarget === "text" && selectedVideoTextOverlay) {
      return [{ kind: "text" as const, index: selectedVideoTextIndex }];
    }
    return [];
  };

  const nudgeSelectedTimelineTracks = (direction: -1 | 1) => {
    const selections = getCurrentTimelineSelectionItems();
    if (selections.length === 0) {
      return false;
    }
    const selectedKeys = new Set(selections.map(getTimelineSelectionKey));
    applyDocumentUpdate((current) => ({
      ...current,
      videoMediaLayers: (current.videoMediaLayers ?? []).map((layer) =>
        selectedKeys.has(`media:${layer.id}`)
          ? {
              ...layer,
              trackIndex: Math.max(0, Math.max(0, Number(layer.trackIndex ?? 0) || 0) + direction)
            }
          : layer
      ),
      audioLayers: (current.audioLayers ?? []).map((layer) =>
        selectedKeys.has(`audio:${layer.id}`)
          ? {
              ...layer,
              trackIndex: Math.max(0, Math.max(0, Number(layer.trackIndex ?? 0) || 0) + direction)
            }
          : layer
      ),
      videoTextOverlays: (current.videoTextOverlays ?? []).map((overlay, index) =>
        selectedKeys.has(`text:${index}`)
          ? {
              ...overlay,
              trackIndex: Math.max(0, Math.max(0, Number(overlay.trackIndex ?? 0) || 0) + direction)
            }
          : overlay
      )
    }));
    return true;
  };

  const snapSelectedTimelineItemsToNeighbor = (direction: -1 | 1) => {
    const selections = getCurrentTimelineSelectionItems();
    if (selections.length === 0) {
      return false;
    }
    const selectedKeys = new Set(selections.map(getTimelineSelectionKey));
    const allItems = buildTimelineSelectionItems();
    const selectedPlacements = allItems.filter((item) => selectedKeys.has(getTimelineSelectionKey(item.selection)));
    if (selectedPlacements.length === 0) {
      return false;
    }
    const groupStartSec = Math.min(...selectedPlacements.map((item) => item.startSec));
    const groupEndSec = Math.max(...selectedPlacements.map((item) => item.startSec + item.durationSec));
    const groupDurationSec = Math.max(0.5, groupEndSec - groupStartSec);
    const otherItems = allItems.filter((item) => !selectedKeys.has(getTimelineSelectionKey(item.selection)));
    const candidateDeltas = selectedPlacements.flatMap((placement) => {
      const placementEndSec = placement.startSec + placement.durationSec;
      return otherItems
        .filter(
          (item) =>
            item.selection.kind === placement.selection.kind &&
            item.trackIndex === placement.trackIndex
        )
        .map((item) =>
          direction < 0
            ? item.startSec + item.durationSec - placement.startSec
            : item.startSec - placementEndSec
        )
        .filter((deltaSec) => (direction < 0 ? deltaSec < -0.001 : deltaSec > 0.001));
    });
    const fallbackDeltaSec =
      direction < 0
        ? -groupStartSec
        : Math.max(0, totalDurationSec - groupDurationSec) - groupStartSec;
    const deltaSec =
      candidateDeltas.length > 0
        ? candidateDeltas.reduce((winner, candidate) =>
            Math.abs(candidate) < Math.abs(winner) ? candidate : winner
          )
        : fallbackDeltaSec;
    if (Math.abs(deltaSec) < 0.001) {
      return false;
    }
    const clampStartForDuration = (startSec: number, durationSec: number) =>
      Number(Math.max(0, Math.min(Math.max(0, totalDurationSec - durationSec), startSec)).toFixed(3));
    const nextGroupStartSec = clampStartForDuration(groupStartSec + deltaSec, groupDurationSec);
    applyDocumentUpdate((current) => ({
      ...current,
      videoMediaLayers: (current.videoMediaLayers ?? []).map((layer) =>
        selectedKeys.has(`media:${layer.id}`)
          ? {
              ...layer,
              startSec: clampStartForDuration(
                Math.max(0, Number(layer.startSec || 0)) + deltaSec,
                Math.max(0.5, Number(layer.durationSec || 0.5))
              )
            }
          : layer
      ),
      audioLayers: (current.audioLayers ?? []).map((layer) =>
        selectedKeys.has(`audio:${layer.id}`)
          ? {
              ...layer,
              startSec: clampStartForDuration(
                Math.max(0, Number(layer.startSec || 0)) + deltaSec,
                Math.max(0.5, Number(layer.durationSec || 0.5))
              )
            }
          : layer
      ),
      videoTextOverlays: (current.videoTextOverlays ?? []).map((overlay, index) =>
        selectedKeys.has(`text:${index}`)
          ? {
              ...overlay,
              startSec: clampStartForDuration(
                Math.max(0, Number(overlay.startSec ?? 0) || 0) + deltaSec,
                Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5)
              )
            }
          : overlay
      )
    }));
    seekTimeline(nextGroupStartSec);
    return true;
  };

  const timelineRangesOverlap = (
    aStartSec: number,
    aDurationSec: number,
    bStartSec: number,
    bDurationSec: number
  ) => {
    const aEndSec = aStartSec + aDurationSec;
    const bEndSec = bStartSec + bDurationSec;
    return aStartSec < bEndSec - 0.01 && aEndSec > bStartSec + 0.01;
  };

  const buildTimelineLayerPlacements = (
    kind: TimelineLayerKind,
    document: SceneScriptDocument
  ): TimelineLayerPlacement[] => {
    if (kind === "media") {
      return (document.videoMediaLayers ?? []).map((layer) => ({
        key: `media:${layer.id}`,
        startSec: Math.max(0, Number(layer.startSec || 0)),
        durationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
        trackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0)
      }));
    }
    if (kind === "audio") {
      return (document.audioLayers ?? []).map((layer) => ({
        key: `audio:${layer.id}`,
        startSec: Math.max(0, Number(layer.startSec || 0)),
        durationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
        trackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0)
      }));
    }
    return (document.videoTextOverlays ?? []).map((overlay, index) => ({
      key: `text:${index}`,
      startSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
      durationSec: Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5),
      trackIndex: Math.max(0, Number(overlay.trackIndex ?? 0) || 0)
    }));
  };

  const findAvailableTimelineTrackIndex = (
    placements: TimelineLayerPlacement[],
    startSec: number,
    durationSec: number,
    preferredTrackIndex: number
  ) => {
    let trackIndex = Math.max(0, preferredTrackIndex);
    while (
      placements.some(
        (placement) =>
          placement.trackIndex === trackIndex &&
          timelineRangesOverlap(startSec, durationSec, placement.startSec, placement.durationSec)
      )
    ) {
      trackIndex += 1;
    }
    return trackIndex;
  };

  const resolveSingleTimelineTrackIndex = (
    document: SceneScriptDocument,
    item: TimelineSelectionItem,
    startSec: number,
    durationSec: number,
    preferredTrackIndex: number
  ) => {
    const key = getTimelineSelectionKey(item);
    const placements = buildTimelineLayerPlacements(item.kind, document).filter(
      (placement) => placement.key !== key
    );
    return findAvailableTimelineTrackIndex(placements, startSec, durationSec, preferredTrackIndex);
  };

  const resolveTimelineMultiMovePlacements = (
    document: SceneScriptDocument,
    deltaSec: number,
    laneDelta: number
  ) => {
    const selectedKeys = new Set(timelineMultiMoveDrag?.items.map((item) => getTimelineSelectionKey(item.selection)) ?? []);
    const result = new Map<string, { startSec: number; durationSec: number; trackIndex: number }>();

    (["media", "audio", "text"] as const).forEach((kind) => {
      const fixedPlacements = buildTimelineLayerPlacements(kind, document).filter(
        (placement) => !selectedKeys.has(placement.key)
      );
      const movingPlacements = (timelineMultiMoveDrag?.items ?? [])
        .filter((item) => item.selection.kind === kind)
        .map((item) => {
          const startSec = clampTimelineStart(item.startSec + deltaSec, item.durationSec);
          return {
            key: getTimelineSelectionKey(item.selection),
            startSec,
            durationSec: item.durationSec,
            preferredTrackIndex: Math.max(0, item.trackIndex + laneDelta)
          };
        })
        .sort((left, right) => left.preferredTrackIndex - right.preferredTrackIndex || left.startSec - right.startSec);

      const occupiedPlacements = [...fixedPlacements];
      movingPlacements.forEach((placement) => {
        const trackIndex = findAvailableTimelineTrackIndex(
          occupiedPlacements,
          placement.startSec,
          placement.durationSec,
          placement.preferredTrackIndex
        );
        const resolvedPlacement = {
          key: placement.key,
          startSec: placement.startSec,
          durationSec: placement.durationSec,
          trackIndex
        };
        occupiedPlacements.push(resolvedPlacement);
        result.set(placement.key, {
          startSec: placement.startSec,
          durationSec: placement.durationSec,
          trackIndex
        });
      });
    });

    return result;
  };

  const beginTimelineMultiMove = (event: ReactMouseEvent, targetItem: TimelineSelectionItem) => {
    const selectedKeys = new Set(selectedTimelineItemsRef.current.map(getTimelineSelectionKey));
    const targetKey = getTimelineSelectionKey(targetItem);
    if (selectedKeys.size <= 1 || !selectedKeys.has(targetKey)) {
      return false;
    }
    const movingItems = buildTimelineSelectionItems().filter((item) =>
      selectedKeys.has(getTimelineSelectionKey(item.selection))
    );
    if (movingItems.length <= 1) {
      return false;
    }
    beginGroupedDocumentChange();
    setTimelinePlaying(false);
    suppressTimelineClickSelectionRef.current = true;
    setTimelineMultiMoveDrag({
      startClientX: event.clientX,
      startClientY: event.clientY,
      secondsPerPixel: totalDurationSec / Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1),
      items: movingItems
    });
    return true;
  };

  const renumberScenes = (scenes: SceneScriptItem[]) =>
    scenes.map((scene, index) => ({
      ...scene,
      sceneNo: index + 1
    }));

  const updateSceneDuration = (sceneNo: number, durationSec: number) => {
    const nextDurationSec = roundTimelineSeconds(durationSec, 1);
    applyDocumentUpdate((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => {
        if (scene.sceneNo !== sceneNo) {
          return scene;
        }
        const overlays = getSceneVideoTextOverlays(scene).map((overlay) => {
          const startSec = Math.min(Math.max(0, nextDurationSec - 0.5), Math.max(0, Number(overlay.startSec ?? 0) || 0));
          const durationSec = Math.min(
            Math.max(0.5, nextDurationSec - startSec),
            Math.max(0.5, Number(overlay.durationSec ?? nextDurationSec) || 0.5)
          );
          return {
            ...overlay,
            startSec,
            durationSec
          };
        });
        return {
          ...scene,
          durationSec: nextDurationSec,
          videoTextOverlay: overlays[0] ?? scene.videoTextOverlay,
          videoTextOverlays: overlays.length > 0 ? overlays : scene.videoTextOverlays
        };
      })
    }));
  };

  const updateSceneStart = (
    sceneNo: number,
    startSec: number,
    options?: { recordHistory?: boolean }
  ) => {
    const nextStartSec = roundTimelineSeconds(Math.max(0, startSec));
    applyDocumentUpdate((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.sceneNo === sceneNo
          ? {
              ...scene,
              startSec: nextStartSec
            }
          : scene
      )
    }), options);
  };

  const beginTimelineSceneResize = (event: ReactMouseEvent, scene: SceneScriptItem) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    const trackWidth = Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1);
    setTimelineResizeDrag({
      kind: "scene-duration",
      sceneNo: scene.sceneNo,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(1, Number(scene.durationSec || 1)),
      secondsPerPixel: totalDurationSec / trackWidth,
      timelineBaseDurationSec: totalDurationSec,
      previewDurationSec: Math.max(1, Number(scene.durationSec || 1)),
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const beginTimelineSceneTrackMove = (event: ReactMouseEvent, scene: SceneScriptItem) => {
    if ((event.target as HTMLElement).closest(".video-timeline-resize-handle")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    setSelectedSceneNo(scene.sceneNo);
    setSelectedVideoTextIndex(0);
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineTarget("scene");
    setSelectedTimelineItems([]);
    suppressSceneClickSelectionRef.current = true;
    beginGroupedDocumentChange();
    const trackWidth = Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1);
    const currentSegment = timelineSegments.find((segment) => segment.scene.sceneNo === scene.sceneNo);
    setTimelineResizeDrag({
      kind: "scene-track",
      sceneNo: scene.sceneNo,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(1, Number(scene.durationSec || 1)),
      startSceneStartSec: currentSegment?.startSec ?? 0,
      secondsPerPixel: totalDurationSec / trackWidth,
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const beginTimelineTextResize = (event: ReactMouseEvent, scene: SceneScriptItem, overlayIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    const trackWidth = Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1);
    const overlay = isCardNewsModule
      ? getSceneVideoTextOverlays(scene)[overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY
      : videoTextLayers[overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY;
    const selectionItem: TimelineSelectionItem = { kind: "text", index: overlayIndex };
    selectTimelineItem(selectionItem, event);
    if (beginTimelineMultiMove(event, selectionItem)) {
      return;
    }
    beginGroupedDocumentChange();
    setTimelineResizeDrag({
      kind: "text-duration",
      sceneNo: scene.sceneNo,
      overlayIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(0.5, Number(overlay.durationSec ?? scene.durationSec) || 0.5),
      startTextStartSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
      startTrackIndex: Math.max(0, Number(overlay.trackIndex ?? 0) || 0),
      secondsPerPixel: totalDurationSec / trackWidth,
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const beginTimelineTextTrackMove = (event: ReactMouseEvent, scene: SceneScriptItem, overlayIndex: number) => {
    if ((event.target as HTMLElement).closest(".video-element-resize-handle")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    const overlay = isCardNewsModule
      ? getSceneVideoTextOverlays(scene)[overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY
      : videoTextLayers[overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY;
    setSelectedVideoTextIndex(overlayIndex);
    setSelectedTimelineTarget("text");
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    const selectionItem: TimelineSelectionItem = { kind: "text", index: overlayIndex };
    if (beginTimelineMultiMove(event, selectionItem)) {
      return;
    }
    selectTimelineItem(selectionItem, event);
    beginGroupedDocumentChange();
    setTimelineResizeDrag({
      kind: "text-track",
      sceneNo: scene.sceneNo,
      overlayIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(0.5, Number(overlay.durationSec ?? scene.durationSec) || 0.5),
      startTextStartSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
      startTrackIndex: Math.max(0, Number(overlay.trackIndex ?? 0) || 0),
      secondsPerPixel: totalDurationSec / Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1),
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const updateVideoMediaLayer = (
    layerId: string,
    patch: Partial<SceneScriptVideoMediaLayer>,
    options?: { recordHistory?: boolean }
  ) => {
    applyDocumentUpdate((current) => ({
      ...current,
      videoMediaLayers: (current.videoMediaLayers ?? []).map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              ...patch
            }
          : layer
      )
    }), options);
  };

  const updateAudioLayer = (
    layerId: string,
    patch: Partial<SceneScriptAudioLayer>,
    options?: { recordHistory?: boolean }
  ) => {
    applyDocumentUpdate((current) => ({
      ...current,
      audioLayers: (current.audioLayers ?? []).map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              ...patch
            }
          : layer
      )
    }), options);
  };

  const getVideoMediaLayerBox = (layer: SceneScriptVideoMediaLayer) => ({
    ...resolveLayerBox(layer)
  });

  const getVideoMediaLayerDisplayBox = (layer: SceneScriptVideoMediaLayer) =>
    videoMediaDragPreview?.layerId === layer.id
      ? {
          ...getVideoMediaLayerBox(layer),
          ...videoMediaDragPreview.box
        }
      : getVideoMediaLayerBox(layer);

  const getVideoTextOverlayDisplay = (
    sceneNo: number,
    overlay: SceneScriptVideoTextOverlay,
    overlayIndex: number
  ) =>
    videoTextDragPreview?.sceneNo === sceneNo && videoTextDragPreview.overlayIndex === overlayIndex
      ? {
          ...overlay,
          ...videoTextDragPreview.patch
        }
      : overlay;

  const applyVideoTextDragPreviewToDom = (
    sceneNo: number,
    overlayIndex: number,
    patch: Partial<Pick<SceneScriptVideoTextOverlay, "xPct" | "yPct" | "widthPct" | "heightPct">>
  ) => {
    document.querySelectorAll<HTMLElement>("[data-video-text-overlay-index]").forEach((element) => {
      if (
        element.dataset.videoTextSceneNo !== String(sceneNo) ||
        element.dataset.videoTextOverlayIndex !== String(overlayIndex)
      ) {
        return;
      }
      if (patch.xPct !== undefined) {
        element.style.left = `${patch.xPct}%`;
      }
      if (patch.yPct !== undefined) {
        element.style.top = `${patch.yPct}%`;
      }
      if (patch.widthPct !== undefined) {
        element.style.width = `${patch.widthPct}%`;
      }
      if (patch.heightPct !== undefined) {
        element.style.height = `${patch.heightPct}%`;
      }
    });
  };

  const applyVideoMediaDragPreviewToDom = (
    layerId: string,
    box: Pick<SceneScriptVideoMediaLayer, "xPct" | "yPct" | "widthPct" | "heightPct">
  ) => {
    document.querySelectorAll<HTMLElement>("[data-video-media-layer-id]").forEach((element) => {
      if (element.dataset.videoMediaLayerId !== layerId) {
        return;
      }
      element.style.left = `${box.xPct}%`;
      element.style.top = `${box.yPct}%`;
      element.style.width = `${box.widthPct}%`;
      element.style.height = `${box.heightPct}%`;
    });
  };

  const getVideoMediaLayerCrop = (layer: SceneScriptVideoMediaLayer) => resolveLayerFrameCrop(layer);

  const buildVideoMediaLayerFrameClipStyle = (layer: SceneScriptVideoMediaLayer): CSSProperties => {
    const crop = buildLayerFrameClipInsets(layer);
    if (!crop.leftPct && !crop.rightPct && !crop.topPct && !crop.bottomPct) {
      return {};
    }
    return {
      clipPath: `inset(${Math.min(100, crop.topPct).toFixed(3)}% ${Math.min(100, crop.rightPct).toFixed(3)}% ${Math.min(100, crop.bottomPct).toFixed(3)}% ${Math.min(100, crop.leftPct).toFixed(3)}%)`
    };
  };

  const buildVideoMediaLayerSourceStyle = (layer: SceneScriptVideoMediaLayer): CSSProperties => {
    if (!hasPercentCrop(layer.sourceCrop)) {
      return {};
    }
    const transform = buildLayerSourceCropTransform(layer);
    const sourceCrop = transform.sourceCrop;
    const supportsObjectViewBox =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("object-view-box", "inset(0% 0% 0% 0%)");
    if (supportsObjectViewBox) {
      return {
        objectViewBox: `inset(${sourceCrop.topPct}% ${sourceCrop.rightPct}% ${sourceCrop.bottomPct}% ${sourceCrop.leftPct}%)`
      } as CSSProperties;
    }
    return {
      width: `${transform.widthPct}%`,
      height: `${transform.heightPct}%`,
      transform: `translate(${transform.translateXPct}%, ${transform.translateYPct}%)`,
      transformOrigin: "top left"
    };
  };

  const updateVideoMediaLayerNaturalSize = (
    layer: SceneScriptVideoMediaLayer,
    width: number,
    height: number,
    metadata?: { durationSec?: number }
  ) => {
    if (!width || !height || width <= 0 || height <= 0) {
      return;
    }
    const box = getVideoMediaLayerBox(layer);
    const shouldKeepMediaAspect = layer.mediaType === "video" || layer.mediaType === "image";
    const desiredBox = buildInitialMediaLayerBox(width, height, selectedVideoCanvasPreset);
    const desiredHeightPct = Number(Math.max(3, box.widthPct * (desiredBox.heightPct / Math.max(1, desiredBox.widthPct))).toFixed(2));
    const shouldNormalizeInitialBox =
      shouldKeepMediaAspect &&
      (!layer.naturalWidth || !layer.naturalHeight) &&
      (Math.abs(box.widthPct - 100) < 0.5 || Math.abs(box.heightPct - 100) < 0.5);
    const shouldUpdateAspect =
      shouldKeepMediaAspect && Math.abs(Number(box.heightPct || 0) - desiredHeightPct) > 0.25;
    if (layer.naturalWidth === width && layer.naturalHeight === height && !shouldUpdateAspect) {
      return;
    }
    const patch: Partial<SceneScriptVideoMediaLayer> = {
      naturalWidth: width,
      naturalHeight: height,
      mediaMetadata: {
        ...layer.mediaMetadata,
        width,
        height,
        durationSec: metadata?.durationSec ?? layer.mediaMetadata?.durationSec
      }
    };
    if (shouldNormalizeInitialBox) {
      patch.widthPct = desiredBox.widthPct;
      patch.heightPct = desiredBox.heightPct;
    } else if (shouldUpdateAspect) {
      patch.heightPct = desiredHeightPct;
    }
    updateVideoMediaLayer(layer.id, patch);
  };

  const beginVideoMediaResize = (
    event: ReactMouseEvent<HTMLElement>,
    layer: SceneScriptVideoMediaLayer,
    handle: NonNullable<NonNullable<typeof videoMediaDrag>["handle"]>
  ) => {
    if (event.button !== 0 || timelinePlaying) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const box = getVideoMediaLayerBox(layer);
    setSelectedVideoMediaLayerId(layer.id);
    setSelectedAudioLayerId(null);
    setSelectedTimelineTarget("media");
    seekTimelineItemCenter({ kind: "media", id: layer.id });
    beginGroupedDocumentChange();
    setVideoMediaDrag({
      layerId: layer.id,
      mode: "resize",
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXPct: box.xPct,
      startYPct: box.yPct,
      startWidthPct: box.widthPct,
      startHeightPct: box.heightPct
    });
  };

  const beginVideoMediaCrop = (
    event: ReactMouseEvent<HTMLElement>,
    layer: SceneScriptVideoMediaLayer,
    handle: VideoMediaCropHandle
  ) => {
    if (event.button !== 0 || timelinePlaying) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const crop = getVideoMediaLayerCrop(layer);
    const bounds = (event.currentTarget.closest(".video-media-layer-outline") as HTMLElement | null)
      ?.getBoundingClientRect();
    setSelectedVideoMediaLayerId(layer.id);
    setSelectedAudioLayerId(null);
    setSelectedTimelineTarget("media");
    setCroppingVideoMediaLayerId(layer.id);
    beginGroupedDocumentChange();
    setVideoMediaCropDrag({
      layerId: layer.id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTopPct: crop.topPct,
      startRightPct: crop.rightPct,
      startBottomPct: crop.bottomPct,
      startLeftPct: crop.leftPct,
      layerWidthPx: Math.max(1, bounds?.width ?? 1),
      layerHeightPx: Math.max(1, bounds?.height ?? 1)
    });
  };

  const beginVideoMediaDrag = (event: ReactMouseEvent<HTMLElement>, layer: SceneScriptVideoMediaLayer) => {
    if (event.button !== 0 || timelinePlaying) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (pickingMotionFocusLayerId === layer.id) {
      setMediaMotionFocusFromPoint(layer, event);
      return;
    }
    const box = getVideoMediaLayerBox(layer);
    setSelectedVideoMediaLayerId(layer.id);
    setSelectedAudioLayerId(null);
    setSelectedTimelineTarget("media");
    seekTimelineItemCenter({ kind: "media", id: layer.id });
    beginGroupedDocumentChange();
    setVideoMediaDrag({
      layerId: layer.id,
      mode: "move",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXPct: box.xPct,
      startYPct: box.yPct,
      startWidthPct: box.widthPct,
      startHeightPct: box.heightPct
    });
  };

  const beginTimelineMediaResize = (event: ReactMouseEvent, layer: SceneScriptVideoMediaLayer) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    setSelectedVideoMediaLayerId(layer.id);
    setSelectedAudioLayerId(null);
    setSelectedTimelineTarget("media");
    beginGroupedDocumentChange();
    const trackWidth = Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1);
    setTimelineResizeDrag({
      kind: "media-duration",
      sceneNo: selectedSceneNo,
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
      startLayerStartSec: Math.max(0, Number(layer.startSec || 0)),
      startTrackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0),
      secondsPerPixel: totalDurationSec / trackWidth,
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const beginTimelineMediaTrackMove = (event: ReactMouseEvent, layer: SceneScriptVideoMediaLayer) => {
    if ((event.target as HTMLElement).closest(".video-element-resize-handle")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    const selectionItem: TimelineSelectionItem = { kind: "media", id: layer.id };
    if (beginTimelineMultiMove(event, selectionItem)) {
      return;
    }
    selectTimelineItem(selectionItem, event);
    beginGroupedDocumentChange();
    setTimelineResizeDrag({
      kind: "media-track",
      sceneNo: selectedSceneNo,
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
      startLayerStartSec: Math.max(0, Number(layer.startSec || 0)),
      startTrackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0),
      secondsPerPixel: totalDurationSec / Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1),
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const beginTimelineAudioResize = (event: ReactMouseEvent, layer: SceneScriptAudioLayer) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    setSelectedAudioLayerId(layer.id);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineTarget("audio");
    beginGroupedDocumentChange();
    const trackWidth = Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1);
    setTimelineResizeDrag({
      kind: "audio-duration",
      sceneNo: selectedSceneNo,
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
      startLayerStartSec: Math.max(0, Number(layer.startSec || 0)),
      startTrackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0),
      secondsPerPixel: totalDurationSec / trackWidth,
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const beginTimelineAudioTrackMove = (event: ReactMouseEvent, layer: SceneScriptAudioLayer) => {
    if ((event.target as HTMLElement).closest(".video-element-resize-handle")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    const selectionItem: TimelineSelectionItem = { kind: "audio", id: layer.id };
    if (beginTimelineMultiMove(event, selectionItem)) {
      return;
    }
    selectTimelineItem(selectionItem, event);
    beginGroupedDocumentChange();
    setTimelineResizeDrag({
      kind: "audio-track",
      sceneNo: selectedSceneNo,
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDurationSec: Math.max(0.5, Number(layer.durationSec || 0.5)),
      startLayerStartSec: Math.max(0, Number(layer.startSec || 0)),
      startTrackIndex: Math.max(0, Number(layer.trackIndex ?? 0) || 0),
      secondsPerPixel: totalDurationSec / Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1),
      timelineBaseDurationSec: totalDurationSec,
      baseSegments: timelineSegments.map((segment) => ({
        sceneNo: segment.scene.sceneNo,
        startSec: segment.startSec,
        durationSec: segment.durationSec
      }))
    });
  };

  const updateVideoTextTiming = (
    scene: SceneScriptItem,
    patch: Partial<Pick<SceneScriptVideoTextOverlay, "startSec" | "durationSec">>,
    overlayIndex = selectedVideoTextIndex,
    options?: { recordHistory?: boolean }
  ) => {
    if (!isCardNewsModule) {
      const overlay = videoTextLayers[overlayIndex] ?? {
        ...DEFAULT_VIDEO_TEXT_OVERLAY,
        durationSec: Math.min(5, totalDurationSec),
        startSec: timelineTimeSecRef.current
      };
      const currentStart = Math.max(0, Number(overlay.startSec ?? 0) || 0);
      const currentDuration = Math.max(0.5, Number(overlay.durationSec ?? 5) || 0.5);
      const nextStart = Math.min(
        Math.max(0, totalDurationSec - 0.5),
        Math.max(0, Number(patch.startSec ?? currentStart) || 0)
      );
      const maxDurationFromStart = Math.max(0.5, totalDurationSec - nextStart);
      const nextDuration = Math.min(
        maxDurationFromStart,
        Math.max(0.5, Number(patch.durationSec ?? currentDuration) || 0.5)
      );
      updateVideoTextOverlay(0, { startSec: nextStart, durationSec: nextDuration }, overlayIndex, options);
      return;
    }
    const sceneDuration = Math.max(1, Number(scene.durationSec || 1));
    const overlay = getSceneVideoTextOverlays(scene)[overlayIndex] ?? {
      ...DEFAULT_VIDEO_TEXT_OVERLAY,
      durationSec: Math.min(5, sceneDuration)
    };
    const currentStart = Math.max(0, Number(overlay.startSec ?? 0) || 0);
    const currentDuration = Math.max(0.5, Number(overlay.durationSec ?? sceneDuration) || 0.5);
    const nextStart = Math.min(
      Math.max(0, sceneDuration - 0.5),
      Math.max(0, Number(patch.startSec ?? currentStart) || 0)
    );
    const maxDurationFromStart = Math.max(0.5, sceneDuration - nextStart);
    const nextDuration = Math.min(
      maxDurationFromStart,
      Math.max(0.5, Number(patch.durationSec ?? currentDuration) || 0.5)
    );
    updateVideoTextOverlay(
      scene.sceneNo,
      {
        startSec: nextStart,
        durationSec: nextDuration
      },
      overlayIndex,
      options
    );
  };

  useEffect(() => {
    if (selectedCardDesignBoxes.length === 0) {
      if (selectedBoxIndex !== 0) {
        setSelectedBoxIndex(0);
      }
      return;
    }
    if (selectedBoxIndex > selectedCardDesignBoxes.length - 1) {
      setSelectedBoxIndex(0);
    }
  }, [selectedBoxIndex, selectedCardDesignBoxes.length]);

  useEffect(() => {
    if (selectedVideoTextOverlays.length === 0) {
      if (selectedVideoTextIndex !== 0) {
        setSelectedVideoTextIndex(0);
      }
      return;
    }
    if (selectedVideoTextIndex > selectedVideoTextOverlays.length - 1) {
      setSelectedVideoTextIndex(0);
    }
  }, [selectedVideoTextIndex, selectedVideoTextOverlays.length]);

  useEffect(() => {
    setDraggingLayerIndex(null);
    setDragOverLayerIndex(null);
    setDraggingSceneIndex(null);
    setDragOverSceneIndex(null);
  }, [selectedSceneNo]);

  useEffect(() => {
    if (!isCardNewsModule) {
      setCardStageFitScale(1);
      setCardStageZoom(1);
      setCardStagePan({ x: 0, y: 0 });
      return;
    }
    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }
    const updateScale = () => {
      const rect = viewport.getBoundingClientRect();
      const maxWidth = Math.max(120, rect.width - 24);
      const maxHeight = Math.max(120, rect.height - 24);
      const scale = Math.min(maxWidth / 1080, maxHeight / 1080, 1);
      setCardStageFitScale(Number.isFinite(scale) && scale > 0 ? Math.max(0.2, scale) : 1);
    };
    updateScale();
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(viewport);
    window.addEventListener("resize", updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [isCardNewsModule, selectedSceneNo, hasGeneratedAssets]);

  useEffect(() => {
    setCardStagePan({ x: 0, y: 0 });
  }, [selectedSceneNo]);

  useEffect(() => {
    timelineTimeSecRef.current = timelineTimeSec;
  }, [timelineTimeSec]);

  const sceneAssetCandidates = useMemo(() => {
    if (!resolvedPackagePath || !selectedScene) {
      return [];
    }
    const generatedCandidates = buildScenePreviewCandidates(resolvedPackagePath, selectedScene.sceneNo);
    if (!isCardNewsModule) {
      return [
        ...generatedCandidates,
        ...buildPackagePreviewFallbackCandidates(resolvedPackagePath)
      ].map((candidate) => ({
        ...candidate,
        src: `${candidate.src}${candidate.src.includes("?") ? "&" : "?"}v=${assetPreviewVersion}`
      }));
    }

    const configuredImagePath =
      selectedScene.cardTemplateImagePath?.trim() ||
      (selectedScene.sceneNo === 1
        ? editableDocument?.cardNews?.coverImagePath?.trim()
        : editableDocument?.cardNews?.templateBackgroundPath?.trim());
    return [
      ...(configuredImagePath ? [{ kind: "image" as const, src: toFileUrl(configuredImagePath) }] : []),
      ...generatedCandidates,
      { kind: "image" as const, src: buildCardNewsPlaceholderPreview(selectedScene.sceneNo) }
    ];
  }, [assetPreviewVersion, editableDocument?.cardNews?.coverImagePath, editableDocument?.cardNews?.templateBackgroundPath, isCardNewsModule, resolvedPackagePath, selectedScene]);
  const activePreviewAsset = sceneAssetCandidates[previewAssetIndex];
  const getVideoMediaLayerSrc = (layer: SceneScriptVideoMediaLayer) => {
    if (layer.localPath) {
      return `${toFileUrl(layer.localPath)}?v=${assetPreviewVersion}`;
    }
    return layer.previewUrl || layer.sourceUrl || "";
  };
  const getAudioLayerSrc = (layer: SceneScriptAudioLayer) => {
    if (layer.localPath) {
      return `${toFileUrl(layer.localPath)}?v=${assetPreviewVersion}`;
    }
    if (layer.relativePath && resolvedPackagePath) {
      return `${toFileUrl(`${resolvedPackagePath}\\${layer.relativePath}`)}?v=${assetPreviewVersion}`;
    }
    return "";
  };
  useEffect(() => {
    if (isCardNewsModule || audioLayers.length === 0 || typeof window === "undefined") {
      setAudioWaveforms({});
      return;
    }
    const audioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!audioContextConstructor) {
      return;
    }
    let cancelled = false;
    const audioContext = new audioContextConstructor();
    void Promise.all(
      audioLayers.map(async (layer) => {
        const src = getAudioLayerSrc(layer);
        if (!src) {
          return null;
        }
        try {
          const response = await fetch(src);
          if (!response.ok) {
            return null;
          }
          const audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
          return [
            layer.id,
            {
              durationSec: audioBuffer.duration,
              peaks: buildAudioWaveformPeaks(audioBuffer)
            }
          ] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setAudioWaveforms(
        entries.reduce<Record<string, AudioWaveformPreview>>((nextWaveforms, entry) => {
          if (entry) {
            nextWaveforms[entry[0]] = entry[1];
          }
          return nextWaveforms;
        }, {})
      );
    });
    return () => {
      cancelled = true;
      void audioContext.close().catch(() => undefined);
    };
  }, [assetPreviewVersion, audioLayers, isCardNewsModule, resolvedPackagePath]);
  const activeVideoMediaLayers = useMemo(
    () =>
      videoMediaLayers.filter((layer) => {
        const startSec = Math.max(0, Number(layer.startSec || 0));
        const durationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
        return timelineTimeSec >= startSec && timelineTimeSec < startSec + durationSec;
      }),
    [timelineTimeSec, videoMediaLayers]
  );
  useEffect(() => {
    videoMediaLayersRef.current = videoMediaLayers;
  }, [videoMediaLayers]);
  useEffect(() => {
    audioLayersRef.current = audioLayers;
  }, [audioLayers]);
  useEffect(() => {
    selectedTimelineItemsRef.current = selectedTimelineItems;
  }, [selectedTimelineItems]);
  useEffect(() => {
    timelineSegmentsRef.current = timelineSegments;
  }, [timelineSegments]);
  useEffect(() => {
    selectedSceneNoRef.current = selectedSceneNo;
  }, [selectedSceneNo]);
  const syncMediaLayerVideo = (
    layer: SceneScriptVideoMediaLayer,
    video: HTMLVideoElement | null,
    options?: { forceSeek?: boolean; controlPlayback?: boolean }
  ) => {
    if (!video || layer.mediaType !== "video") {
      return;
    }
    const playbackRate = clampPlaybackRate(Number(layer.playbackRate ?? 1));
    const sourceOffsetSec = Math.max(0, Number(layer.sourceOffsetSec ?? 0) || 0);
    const rawLocalTime =
      sourceOffsetSec +
      Math.max(0, timelineTimeSecRef.current - Math.max(0, Number(layer.startSec || 0))) * playbackRate;
    const mediaDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const localTime = mediaDuration > 0 ? rawLocalTime % mediaDuration : rawLocalTime;
    const drift = Math.abs(video.currentTime - localTime);
    const seekThreshold = options?.forceSeek ? 0.05 : timelinePlaying ? 1.2 : 0.15;
    video.volume = Math.max(0, Math.min(1, Number(layer.volume ?? 1)));
    video.muted = video.volume <= 0;
    video.playbackRate = playbackRate;
    if (Number.isFinite(localTime) && drift > seekThreshold) {
      try {
        video.currentTime = localTime;
      } catch {
        // Some remote media can reject early seeks until metadata is ready.
      }
    }
    if (options?.controlPlayback === false) {
      return;
    }
    if (timelinePlaying) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };
  const syncAudioLayer = (
    layer: SceneScriptAudioLayer,
    audio: HTMLAudioElement | null,
    options?: { forceSeek?: boolean; controlPlayback?: boolean }
  ) => {
    if (!audio) {
      return;
    }
    const startSec = Math.max(0, Number(layer.startSec || 0));
    const durationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
    const isActive = timelineTimeSecRef.current >= startSec && timelineTimeSecRef.current <= startSec + durationSec;
    const sourceOffsetSec = Math.max(0, Number(layer.sourceOffsetSec ?? 0) || 0);
    const localTime = sourceOffsetSec + Math.max(0, timelineTimeSecRef.current - startSec);
    const drift = Math.abs(audio.currentTime - localTime);
    const seekThreshold = options?.forceSeek ? 0.05 : timelinePlaying ? 0.8 : 0.12;
    audio.volume = Math.max(0, Math.min(1, Number(layer.volume ?? 1)));
    if (Number.isFinite(localTime) && drift > seekThreshold) {
      try {
        audio.currentTime = localTime;
      } catch {
        // Audio may reject seeks until metadata is available.
      }
    }
    if (options?.controlPlayback === false) {
      return;
    }
    if (timelinePlaying && isActive) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };
  useEffect(() => {
    if (isCardNewsModule || !activePreviewAsset || activePreviewAsset.kind !== "video") {
      return;
    }
    if (timelinePlaying) {
      return;
    }
    const video = previewVideoRef.current;
    if (!video || !activeTimelineSegment) {
      return;
    }
    const rawLocalTime = Math.max(0, Math.min(activeTimelineSegment.durationSec, timelineTimeSec - activeTimelineSegment.startSec));
    const mediaDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const localTime = mediaDuration > 0 ? rawLocalTime % mediaDuration : rawLocalTime;
    if (Number.isFinite(localTime) && Math.abs(video.currentTime - localTime) > 0.15) {
      video.currentTime = localTime;
    }
  }, [activePreviewAsset, activeTimelineSegment, isCardNewsModule, timelinePlaying, timelineTimeSec]);

  useEffect(() => {
    if (isCardNewsModule) {
      return;
    }
    if (timelinePlaying) {
      return;
    }
    videoMediaLayersRef.current
      .filter((layer) => {
        const startSec = Math.max(0, Number(layer.startSec || 0));
        const durationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
        return timelineTimeSecRef.current >= startSec && timelineTimeSecRef.current <= startSec + durationSec;
      })
      .forEach((layer) => {
      syncMediaLayerVideo(layer, mediaLayerVideoRefs.current[layer.id], { forceSeek: true });
    });
    audioLayersRef.current.forEach((layer) => {
      syncAudioLayer(layer, audioLayerRefs.current[layer.id], { forceSeek: true });
    });
  }, [activeVideoMediaLayers, isCardNewsModule, timelinePlaying, timelineTimeSec]);

  useEffect(() => {
    if (!editableDocument) {
      setTimelineTimeSec(0);
      setTimelinePlaying(false);
      return;
    }
    if (timelineTimeSec > totalDurationSec) {
      setTimelineTimeSec(totalDurationSec);
    }
  }, [editableDocument, timelineTimeSec, totalDurationSec]);

  useEffect(() => {
    if (!timelinePlaying || isCardNewsModule) {
      return;
    }
    let animationFrameId = 0;
    let lastFrameAt = performance.now();
    let lastStateSyncAt = 0;
    const video = activePreviewAsset?.kind === "video" ? previewVideoRef.current : null;

    if (video) {
      video.loop = true;
      void video.play().catch(() => {
        // Timeline playback is driven by the editor clock, not by media playback.
      });
    }
    activeVideoMediaLayers.forEach((layer) => {
      syncMediaLayerVideo(layer, mediaLayerVideoRefs.current[layer.id], { forceSeek: true });
    });
    audioLayersRef.current.forEach((layer) => {
      syncAudioLayer(layer, audioLayerRefs.current[layer.id], { forceSeek: true });
    });

    const tick = () => {
      const now = performance.now();
      const deltaSec = (now - lastFrameAt) / 1000;
      lastFrameAt = now;
      const nextGlobalTime = Math.min(totalDurationSec, timelineTimeSecRef.current + deltaSec);
      timelineTimeSecRef.current = nextGlobalTime;
      const segments = timelineSegmentsRef.current;
      const nextSegment =
        segments.find((segment) => nextGlobalTime >= segment.startSec && nextGlobalTime < segment.endSec) ??
        segments[segments.length - 1];
      if (nextSegment && nextSegment.scene.sceneNo !== selectedSceneNoRef.current) {
        selectedSceneNoRef.current = nextSegment.scene.sceneNo;
        setSelectedSceneNo(nextSegment.scene.sceneNo);
      }
      if (now - lastStateSyncAt > 120) {
        lastStateSyncAt = now;
        setTimelineTimeSec(nextGlobalTime);
        videoMediaLayersRef.current
          .filter((layer) => {
            const startSec = Math.max(0, Number(layer.startSec || 0));
            const durationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
            return nextGlobalTime >= startSec && nextGlobalTime <= startSec + durationSec;
          })
          .forEach((layer) => {
            syncMediaLayerVideo(layer, mediaLayerVideoRefs.current[layer.id]);
          });
        audioLayersRef.current.forEach((layer) => {
          syncAudioLayer(layer, audioLayerRefs.current[layer.id]);
        });
      }

      if (nextGlobalTime >= totalDurationSec) {
        timelineTimeSecRef.current = totalDurationSec;
        setTimelineTimeSec(totalDurationSec);
        setTimelinePlaying(false);
        previewVideoRef.current?.pause();
        return;
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      previewVideoRef.current?.pause();
      Object.values(mediaLayerVideoRefs.current).forEach((layerVideo) => layerVideo?.pause());
      Object.values(audioLayerRefs.current).forEach((audio) => audio?.pause());
    };
  }, [
    activePreviewAsset,
    isCardNewsModule,
    timelinePlaying,
    totalDurationSec
  ]);

  useEffect(() => {
    if (!timelineResizeDrag) {
      return;
    }
    let animationFrameId = 0;
    let pendingPoint: { clientX: number; clientY: number } | null = null;
    let latestCommit: (() => void) | null = null;
    const applyPointerMove = (point: { clientX: number; clientY: number }) => {
      const deltaSec =
        (point.clientX - timelineResizeDrag.startClientX) *
        timelineResizeDrag.secondsPerPixel *
        TIMELINE_RESIZE_SENSITIVITY;
      const scene = editableDocumentRef.current?.scenes.find((item) => item.sceneNo === timelineResizeDrag.sceneNo);
      if (!scene) {
        return;
      }
      if (timelineResizeDrag.kind === "scene-track") {
        const rawStartSec = (timelineResizeDrag.startSceneStartSec ?? 0) + deltaSec;
        updateSceneStart(timelineResizeDrag.sceneNo, rawStartSec, { recordHistory: false });
        return;
      }
      if (timelineResizeDrag.kind === "audio-track") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const laneDelta = Math.round((point.clientY - timelineResizeDrag.startClientY) / 26);
        const nextTrackIndex = Math.max(0, (timelineResizeDrag.startTrackIndex ?? 0) + laneDelta);
        const rawStartSec = (timelineResizeDrag.startLayerStartSec ?? 0) + deltaSec;
        const snappedStartSec = snapTimelineValue(rawStartSec, { audioLayerId: layerId });
        const nextStartSec = clampTimelineStart(snappedStartSec, timelineResizeDrag.startDurationSec);
        applyTimelineClipPreviewToDom(`audio:${layerId}`, {
          startSec: nextStartSec,
          durationSec: timelineResizeDrag.startDurationSec,
          trackIndex: nextTrackIndex
        });
        latestCommit = () => {
          const nextResolvedTrackIndex = editableDocumentRef.current
            ? resolveSingleTimelineTrackIndex(
                editableDocumentRef.current,
                { kind: "audio", id: layerId },
                nextStartSec,
                timelineResizeDrag.startDurationSec,
                nextTrackIndex
              )
            : nextTrackIndex;
          updateAudioLayer(layerId, {
            trackIndex: nextResolvedTrackIndex,
            startSec: nextStartSec
          }, { recordHistory: false });
        };
        return;
      }
      if (timelineResizeDrag.kind === "audio-duration") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const startSec = timelineResizeDrag.startLayerStartSec ?? 0;
        const maxDuration = Math.max(0.5, totalDurationSec - startSec);
        const rawEndSec = startSec + timelineResizeDrag.startDurationSec + deltaSec;
        const snappedEndSec = snapTimelineValue(rawEndSec, { audioLayerId: layerId });
        const nextDurationSec = Math.min(maxDuration, roundTimelineSeconds(snappedEndSec - startSec, 0.5));
        applyTimelineClipPreviewToDom(`audio:${layerId}`, {
          startSec,
          durationSec: nextDurationSec,
          trackIndex: Math.max(0, Number(timelineResizeDrag.startTrackIndex ?? 0) || 0)
        });
        latestCommit = () =>
          updateAudioLayer(layerId, {
            durationSec: nextDurationSec
          }, { recordHistory: false });
        return;
      }
      if (timelineResizeDrag.kind === "media-track") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const laneDelta = Math.round((point.clientY - timelineResizeDrag.startClientY) / 26);
        const nextTrackIndex = Math.max(0, (timelineResizeDrag.startTrackIndex ?? 0) + laneDelta);
        const rawStartSec = (timelineResizeDrag.startLayerStartSec ?? 0) + deltaSec;
        const snappedStartSec = snapTimelineValue(rawStartSec, { mediaLayerId: layerId });
        const nextStartSec = clampTimelineStart(snappedStartSec, timelineResizeDrag.startDurationSec);
        applyTimelineClipPreviewToDom(`media:${layerId}`, {
          startSec: nextStartSec,
          durationSec: timelineResizeDrag.startDurationSec,
          trackIndex: nextTrackIndex
        });
        latestCommit = () => {
          const nextResolvedTrackIndex = editableDocumentRef.current
            ? resolveSingleTimelineTrackIndex(
                editableDocumentRef.current,
                { kind: "media", id: layerId },
                nextStartSec,
                timelineResizeDrag.startDurationSec,
                nextTrackIndex
              )
            : nextTrackIndex;
          updateVideoMediaLayer(layerId, {
            trackIndex: nextResolvedTrackIndex,
            startSec: nextStartSec
          }, { recordHistory: false });
        };
        return;
      }
      if (timelineResizeDrag.kind === "media-duration") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const startSec = timelineResizeDrag.startLayerStartSec ?? 0;
        const maxDuration = Math.max(0.5, totalDurationSec - startSec);
        const rawEndSec = startSec + timelineResizeDrag.startDurationSec + deltaSec;
        const snappedEndSec = snapTimelineValue(rawEndSec, { mediaLayerId: layerId });
        const nextDurationSec = Math.min(maxDuration, roundTimelineSeconds(snappedEndSec - startSec, 0.5));
        applyTimelineClipPreviewToDom(`media:${layerId}`, {
          startSec,
          durationSec: nextDurationSec,
          trackIndex: Math.max(0, Number(timelineResizeDrag.startTrackIndex ?? 0) || 0)
        });
        latestCommit = () =>
          updateVideoMediaLayer(layerId, {
            durationSec: nextDurationSec
          }, { recordHistory: false });
        return;
      }
      if (timelineResizeDrag.kind === "text-track") {
        const laneDelta = Math.round((point.clientY - timelineResizeDrag.startClientY) / 26);
        const nextTrackIndex = Math.max(0, (timelineResizeDrag.startTrackIndex ?? 0) + laneDelta);
        if (!isCardNewsModule) {
          const rawStartSec = (timelineResizeDrag.startTextStartSec ?? 0) + deltaSec;
          const snappedStartSec = snapTimelineValue(rawStartSec, {
            textOverlayIndex: timelineResizeDrag.overlayIndex ?? 0
          });
          const nextStartSec = clampTimelineStart(snappedStartSec, timelineResizeDrag.startDurationSec);
          const overlayIndex = timelineResizeDrag.overlayIndex ?? 0;
          applyTimelineClipPreviewToDom(`text:${overlayIndex}`, {
            startSec: nextStartSec,
            durationSec: timelineResizeDrag.startDurationSec,
            trackIndex: nextTrackIndex
          });
          latestCommit = () => {
            const nextResolvedTrackIndex = editableDocumentRef.current
              ? resolveSingleTimelineTrackIndex(
                  editableDocumentRef.current,
                  { kind: "text", index: overlayIndex },
                  nextStartSec,
                  timelineResizeDrag.startDurationSec,
                  nextTrackIndex
                )
              : nextTrackIndex;
            updateVideoTextOverlay(
              0,
              {
                trackIndex: nextResolvedTrackIndex,
                startSec: nextStartSec
              },
              overlayIndex,
              { recordHistory: false }
            );
          };
          return;
        }
        const segment = timelineSegmentsRef.current.find((item) => item.scene.sceneNo === scene.sceneNo);
        const sceneGlobalStartSec = segment?.startSec ?? 0;
        const rawGlobalStartSec = sceneGlobalStartSec + (timelineResizeDrag.startTextStartSec ?? 0) + deltaSec;
        const snappedGlobalStartSec = snapTimelineValue(rawGlobalStartSec, {
          textSceneNo: scene.sceneNo,
          textOverlayIndex: timelineResizeDrag.overlayIndex ?? 0
        });
        const nextStartSec = roundTimelineSeconds(
          Math.max(
            0,
            Math.min(
              Math.max(0, Number(scene.durationSec || 1) - timelineResizeDrag.startDurationSec),
              snappedGlobalStartSec - sceneGlobalStartSec
            )
          )
        );
        const overlayIndex = timelineResizeDrag.overlayIndex ?? 0;
        applyTimelineClipPreviewToDom(`text:${overlayIndex}`, {
          startSec: sceneGlobalStartSec + nextStartSec,
          durationSec: timelineResizeDrag.startDurationSec,
          trackIndex: nextTrackIndex
        });
        latestCommit = () =>
          updateVideoTextOverlay(
            scene.sceneNo,
            {
              trackIndex: nextTrackIndex,
              startSec: nextStartSec
            },
            overlayIndex,
            { recordHistory: false }
          );
        return;
      }
      if (timelineResizeDrag.kind === "scene-duration") {
        const nextDurationSec = roundTimelineSeconds(timelineResizeDrag.startDurationSec + deltaSec, 1);
        setTimelineResizeDrag((current) =>
          current && current.kind === "scene-duration"
            ? {
                ...current,
                previewDurationSec: nextDurationSec
              }
            : current
        );
        return;
      }
      const textStartSec = timelineResizeDrag.startTextStartSec ?? 0;
      if (!isCardNewsModule) {
        const rawEndSec = textStartSec + timelineResizeDrag.startDurationSec + deltaSec;
        const snappedEndSec = snapTimelineValue(rawEndSec, {
          textOverlayIndex: timelineResizeDrag.overlayIndex ?? 0
        });
        const maxDuration = Math.max(0.5, totalDurationSec - textStartSec);
        const overlayIndex = timelineResizeDrag.overlayIndex ?? 0;
        const nextDurationSec = Math.min(maxDuration, roundTimelineSeconds(snappedEndSec - textStartSec, 0.5));
        applyTimelineClipPreviewToDom(`text:${overlayIndex}`, {
          startSec: textStartSec,
          durationSec: nextDurationSec,
          trackIndex: Math.max(0, Number(timelineResizeDrag.startTrackIndex ?? 0) || 0)
        });
        latestCommit = () =>
          updateVideoTextOverlay(
            0,
            {
              durationSec: nextDurationSec
            },
            overlayIndex,
            { recordHistory: false }
          );
        return;
      }
      const segment = timelineSegmentsRef.current.find((item) => item.scene.sceneNo === scene.sceneNo);
      const sceneGlobalStartSec = segment?.startSec ?? 0;
      const rawEndSec = sceneGlobalStartSec + textStartSec + timelineResizeDrag.startDurationSec + deltaSec;
      const snappedEndSec = snapTimelineValue(rawEndSec, {
        textSceneNo: scene.sceneNo,
        textOverlayIndex: timelineResizeDrag.overlayIndex ?? 0
      });
      const maxDuration = Math.max(0.5, Number(scene.durationSec || 1) - textStartSec);
      const overlayIndex = timelineResizeDrag.overlayIndex ?? 0;
      const nextDurationSec = Math.min(maxDuration, roundTimelineSeconds(snappedEndSec - sceneGlobalStartSec - textStartSec, 0.5));
      applyTimelineClipPreviewToDom(`text:${overlayIndex}`, {
        startSec: sceneGlobalStartSec + textStartSec,
        durationSec: nextDurationSec,
        trackIndex: Math.max(0, Number(timelineResizeDrag.startTrackIndex ?? 0) || 0)
      });
      latestCommit = () =>
        updateVideoTextTiming(
          scene,
          {
            durationSec: nextDurationSec
          },
          overlayIndex,
          { recordHistory: false }
        );
    };
    const flushPointerMove = () => {
      animationFrameId = 0;
      if (!pendingPoint) {
        return;
      }
      const point = pendingPoint;
      pendingPoint = null;
      applyPointerMove(point);
    };
    const handlePointerMove = (event: PointerEvent) => {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(flushPointerMove);
      }
    };
    const handlePointerUp = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      if (pendingPoint) {
        applyPointerMove(pendingPoint);
        pendingPoint = null;
      }
      setTimelineResizeDrag((current) => {
        if (current?.kind === "scene-duration") {
          updateSceneDuration(current.sceneNo, current.previewDurationSec ?? current.startDurationSec);
        } else {
          latestCommit?.();
          commitGroupedDocumentChange();
        }
        return null;
      });
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timelineResizeDrag]);

  useEffect(() => {
    if (!timelineMultiMoveDrag) {
      return;
    }
    let animationFrameId = 0;
    let pendingPoint: { clientX: number; clientY: number } | null = null;
    let latestDeltaSec: number | null = null;
    let latestLaneDelta = 0;
    const applyPointerMove = (point: { clientX: number; clientY: number }) => {
      const deltaSec =
        (point.clientX - timelineMultiMoveDrag.startClientX) *
        timelineMultiMoveDrag.secondsPerPixel *
        TIMELINE_RESIZE_SENSITIVITY;
      const laneDelta = Math.round((point.clientY - timelineMultiMoveDrag.startClientY) / TIMELINE_ELEMENT_TRACK_ROW_HEIGHT);
      latestDeltaSec = deltaSec;
      latestLaneDelta = laneDelta;
      timelineMultiMoveDrag.items.forEach((item) => {
        applyTimelineClipPreviewToDom(getTimelineSelectionKey(item.selection), {
          startSec: clampTimelineStart(item.startSec + deltaSec, item.durationSec),
          durationSec: item.durationSec,
          trackIndex: Math.max(0, item.trackIndex + laneDelta)
        });
      });
    };
    const flushPointerMove = () => {
      animationFrameId = 0;
      if (!pendingPoint) {
        return;
      }
      const point = pendingPoint;
      pendingPoint = null;
      applyPointerMove(point);
    };
    const handlePointerMove = (event: PointerEvent) => {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(flushPointerMove);
      }
    };
    const handlePointerUp = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      if (pendingPoint) {
        applyPointerMove(pendingPoint);
        pendingPoint = null;
      }
      if (latestDeltaSec !== null) {
        applyDocumentUpdate((current) => {
          const resolvedPlacements = resolveTimelineMultiMovePlacements(
            current,
            latestDeltaSec ?? 0,
            latestLaneDelta
          );
          return {
            ...current,
            videoMediaLayers: (current.videoMediaLayers ?? []).map((layer) => {
              const resolved = resolvedPlacements.get(`media:${layer.id}`);
              return resolved
                ? {
                    ...layer,
                    startSec: resolved.startSec,
                    trackIndex: resolved.trackIndex
                  }
                : layer;
            }),
            audioLayers: (current.audioLayers ?? []).map((layer) => {
              const resolved = resolvedPlacements.get(`audio:${layer.id}`);
              return resolved
                ? {
                    ...layer,
                    startSec: resolved.startSec,
                    trackIndex: resolved.trackIndex
                  }
                : layer;
            }),
            videoTextOverlays: (current.videoTextOverlays ?? []).map((overlay, index) => {
              const resolved = resolvedPlacements.get(`text:${index}`);
              return resolved
                ? {
                    ...overlay,
                    startSec: resolved.startSec,
                    trackIndex: resolved.trackIndex
                  }
                : overlay;
            })
          };
        }, { recordHistory: false });
      }
      commitGroupedDocumentChange();
      setTimelineMultiMoveDrag(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timelineMultiMoveDrag]);

  useEffect(() => {
    if (!timelineSelectionBox) {
      return;
    }
    let animationFrameId = 0;
    let pendingPoint: { clientX: number; clientY: number } | null = null;
    const applyPointerMove = (point: { clientX: number; clientY: number }) => {
      setTimelineSelectionBox((current) =>
        current
          ? {
              ...current,
              currentX: point.clientX,
              currentY: point.clientY
            }
          : current
      );
    };
    const flushPointerMove = () => {
      animationFrameId = 0;
      if (!pendingPoint) {
        return;
      }
      const point = pendingPoint;
      pendingPoint = null;
      applyPointerMove(point);
    };
    const handlePointerMove = (event: PointerEvent) => {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(flushPointerMove);
      }
    };
    const handlePointerUp = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      if (pendingPoint) {
        applyPointerMove(pendingPoint);
        pendingPoint = null;
      }
      setTimelineSelectionBox((current) => {
        if (!current) {
          return null;
        }
        const selectionRect = {
          left: Math.min(current.startX, current.currentX),
          right: Math.max(current.startX, current.currentX),
          top: Math.min(current.startY, current.currentY),
          bottom: Math.max(current.startY, current.currentY)
        };
        const clips = Array.from(document.querySelectorAll<HTMLElement>("[data-timeline-kind]"));
        const nextItems = clips.flatMap((clip): TimelineSelectionItem[] => {
          const rect = clip.getBoundingClientRect();
          const intersects =
            rect.left <= selectionRect.right &&
            rect.right >= selectionRect.left &&
            rect.top <= selectionRect.bottom &&
            rect.bottom >= selectionRect.top;
          if (!intersects) {
            return [];
          }
          const kind = clip.dataset.timelineKind;
          if (kind === "media" && clip.dataset.timelineId) {
            return [{ kind: "media", id: clip.dataset.timelineId }];
          }
          if (kind === "audio" && clip.dataset.timelineId) {
            return [{ kind: "audio", id: clip.dataset.timelineId }];
          }
          if (kind === "text") {
            const index = Number.parseInt(clip.dataset.timelineIndex ?? "", 10);
            return Number.isFinite(index) ? [{ kind: "text", index }] : [];
          }
          return [];
        });
        if (nextItems.length > 0) {
          setSelectedTimelineItems(nextItems);
          const first = nextItems[0];
          if (first.kind === "media") {
            setSelectedVideoMediaLayerId(first.id);
            setSelectedAudioLayerId(null);
            setSelectedTimelineTarget("media");
          } else if (first.kind === "audio") {
            setSelectedAudioLayerId(first.id);
            setSelectedVideoMediaLayerId(null);
            setSelectedTimelineTarget("audio");
          } else {
            setSelectedVideoTextIndex(first.index);
            setSelectedAudioLayerId(null);
            setSelectedVideoMediaLayerId(null);
            setSelectedTimelineTarget("text");
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timelineSelectionBox]);

  useEffect(() => {
    if (!timelineSeekDrag) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const nextTimeSec = seekTimelineFromClientX(event.clientX);
      setTimelineSeekTooltip({ x: event.clientX, y: event.clientY, timeSec: nextTimeSec });
    };
    const handlePointerUp = () => {
      setTimelineSeekDrag(false);
      setTimelineSeekTooltip(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timelineSeekDrag, totalDurationSec, timelineSegments, selectedSceneNo]);

  const getCardNewsRailPreviewSrc = (scene: SceneScriptItem): string => {
    const configuredImagePath =
      scene.cardTemplateImagePath?.trim() ||
      (scene.sceneNo === 1
        ? editableDocument?.cardNews?.coverImagePath?.trim()
        : editableDocument?.cardNews?.templateBackgroundPath?.trim());
    if (configuredImagePath) {
      return toFileUrl(configuredImagePath);
    }
    return (
      buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[0]?.src ??
      buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[1]?.src ??
      buildCardNewsPlaceholderPreview(scene.sceneNo)
    );
  };

  useEffect(() => {
    setPreviewAssetIndex(0);
  }, [selectedSceneNo, resolvedPackagePath]);

  useEffect(() => {
    if (selectedScene?.assetSearchQuery && !pixabayQuery) {
      setPixabayQuery(selectedScene.assetSearchQuery);
    }
  }, [pixabayQuery, selectedScene?.assetSearchQuery]);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedPackagePath || !editableDocument || editableDocument.scenes.length === 0) {
      setHasGeneratedAssets(false);
      return;
    }
    if (
      !isCardNewsModule &&
      ((editableDocument.videoMediaLayers?.length ?? 0) > 0 ||
        (editableDocument.audioLayers?.length ?? 0) > 0 ||
        (editableDocument.videoTextOverlays?.length ?? 0) > 0)
    ) {
      setHasGeneratedAssets(true);
      return;
    }

    const detectGeneratedAssets = async () => {
      for (const scene of editableDocument.scenes) {
        const candidates = [
          ...buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo),
          ...buildPackagePreviewFallbackCandidates(resolvedPackagePath)
        ];
        for (const candidate of candidates) {
          // Detect actual generated media, including single-background composer packages.
          const exists = await probePreviewAsset(candidate.kind, candidate.src);
          if (exists) {
            if (!cancelled) {
              setHasGeneratedAssets(true);
            }
            return;
          }
        }
      }
      if (!cancelled) {
        setHasGeneratedAssets(false);
      }
    };

    void detectGeneratedAssets();
    return () => {
      cancelled = true;
    };
  }, [editableDocument, resolvedPackagePath]);

  const handleChoosePackageFolder = async () => {
    const selectedPath = await pickYouTubePackageFolder();
    if (!selectedPath) {
      return;
    }
    setSelectedPackagePath(selectedPath);
    setMessage("");
  };

  const updateScene = (sceneNo: number, patch: Partial<SceneScriptItem>) => {
    applyDocumentUpdate((current) => {
      const scenes = current.scenes.map((scene) =>
        scene.sceneNo === sceneNo ? { ...scene, ...patch } : scene
      );
      const targetDurationSec = Math.max(
        1,
        Math.round(scenes.reduce((total, scene) => total + Number(scene.durationSec || 0), 0))
      );
      return { ...current, scenes, targetDurationSec };
    });
  };

  const addVideoSceneAfterSelected = () => {
    if (!editableDocumentRef.current || isCardNewsModule) {
      return;
    }
    const currentDocument = editableDocumentRef.current;
    const selectedIndex = Math.max(
      0,
      currentDocument.scenes.findIndex((scene) => scene.sceneNo === selectedSceneNo)
    );
    const insertIndex = selectedIndex + 1;
    const segments = timelineSegmentsRef.current.length > 0 ? timelineSegmentsRef.current : timelineSegments;
    const selectedSegment = segments.find((segment) => segment.scene.sceneNo === selectedSceneNo);
    const insertAtSec = selectedSegment?.endSec ?? totalDurationSec;
    const defaultDurationSec = 5;
    const nextScene: SceneScriptItem = {
      sceneNo: insertIndex + 1,
      text: "",
      fluxPrompt: "",
      assetSearchQuery: "",
      motion: "none",
      startSec: insertAtSec,
      durationSec: defaultDurationSec,
      videoTextOverlay: undefined,
      videoTextOverlays: []
    };

    applyDocumentUpdate((current) => {
      const scenes = renumberScenes([
        ...current.scenes.slice(0, insertIndex),
        nextScene,
        ...current.scenes.slice(insertIndex)
      ]);
      return {
        ...current,
        scenes,
        targetDurationSec: Math.max(1, Math.round(Math.max(totalDurationSec, insertAtSec + defaultDurationSec)))
      };
    });
    setSelectedSceneNo(insertIndex + 1);
    setSelectedVideoTextIndex(0);
    clearTimelineLayerSelection();
    seekTimeline(insertAtSec);
    setMessage(isKorean ? "선택한 씬 뒤에 빈 씬을 추가했습니다." : "Added a blank scene after the selected scene.");
  };

  const updateAiWorkspace = (patch: Partial<NonNullable<SceneScriptDocument["aiWorkspace"]>>) => {
    applyDocumentUpdate((current) => ({
      ...current,
      aiWorkspace: {
        ...buildDefaultAiWorkspace(isCardNewsModule ? "card_news" : "video"),
        ...(current.aiWorkspace ?? {}),
        ...patch
      }
    }));
  };

  const setAiWorkspaceMaterials = (materials: AiWorkspaceMaterial[]) => {
    updateAiWorkspace({
      materials: materials.map((material, index) => ({
        ...material,
        order: index
      }))
    });
  };

  const addAiTextMaterial = () => {
    const text = aiMaterialTextDraft.trim();
    if (!text) {
      return;
    }
    const nextMaterial: AiWorkspaceMaterial = {
      id: buildLayerId("ai-text"),
      kind: "text",
      label: text.slice(0, 44) || "Text material",
      text,
      order: aiWorkspace.materials.length
    };
    setAiWorkspaceMaterials([...aiWorkspace.materials, nextMaterial]);
    setAiMaterialTextDraft("");
  };

  const addAiLinkMaterial = () => {
    const sourceUrl = aiMaterialUrlDraft.trim();
    if (!sourceUrl) {
      return;
    }
    const nextMaterial: AiWorkspaceMaterial = {
      id: buildLayerId("ai-link"),
      kind: "link",
      label: sourceUrl.replace(/^https?:\/\//i, "").slice(0, 48) || "Link material",
      sourceUrl,
      order: aiWorkspace.materials.length
    };
    setAiWorkspaceMaterials([...aiWorkspace.materials, nextMaterial]);
    setAiMaterialUrlDraft("");
  };

  const handleAddAiLocalMaterial = async () => {
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "패키지 경로를 먼저 선택해 주세요." : "Choose a package folder first.");
      return;
    }
    const result = await importLocalAsset({
      packagePath: resolvedPackagePath,
      sceneNo: selectedSceneNo,
      applyToScene: false
    });
    if (!result) {
      return;
    }
    const nextMaterial: AiWorkspaceMaterial = {
      id: buildLayerId("ai-file"),
      kind: result.mediaType,
      label: result.localPath.split(/[\\/]/).pop() ?? result.mediaType,
      localPath: result.localPath,
      mimeType: result.mediaType,
      order: aiWorkspace.materials.length
    };
    setAiWorkspaceMaterials([...aiWorkspace.materials, nextMaterial]);
  };

  const removeAiMaterial = (materialId: string) => {
    setAiWorkspaceMaterials(aiWorkspace.materials.filter((material) => material.id !== materialId));
  };

  const handleAiMaterialDrop = (targetMaterialId: string) => {
    if (!draggingAiMaterialId || draggingAiMaterialId === targetMaterialId) {
      setDraggingAiMaterialId(null);
      setDragOverAiMaterialId(null);
      return;
    }
    const fromIndex = aiWorkspace.materials.findIndex((material) => material.id === draggingAiMaterialId);
    const toIndex = aiWorkspace.materials.findIndex((material) => material.id === targetMaterialId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingAiMaterialId(null);
      setDragOverAiMaterialId(null);
      return;
    }
    const nextMaterials = [...aiWorkspace.materials];
    const [moved] = nextMaterials.splice(fromIndex, 1);
    nextMaterials.splice(toIndex, 0, moved);
    setAiWorkspaceMaterials(nextMaterials);
    setDraggingAiMaterialId(null);
    setDragOverAiMaterialId(null);
  };

  const buildAiWorkspacePrompt = () => {
    const materialsText = aiWorkspace.materials
      .map((material, index) => {
        const body =
          material.text?.trim() ||
          material.sourceUrl?.trim() ||
          material.localPath?.trim() ||
          material.label;
        return `${index + 1}. [${material.kind}] ${material.label}\n${body}`;
      })
      .join("\n\n");
    return [
      "너는 한국어 콘텐츠 디자인 디렉터이자 Canva/영상 편집 설계자다.",
      "사용자가 올린 소재 순서를 최대한 유지해서 카드뉴스, 영상, Canva 슬라이드로 바로 옮길 수 있는 설계도를 만든다.",
      "출력은 반드시 JSON 객체 하나만 반환한다.",
      "JSON 스키마:",
      '{"summary":"전체 콘셉트","targetKind":"card_news|video|canva","canvaPrompt":"Canva에 그대로 붙일 수 있는 프롬프트","items":[{"index":1,"title":"슬라이드/씬 제목","text":"화면에 들어갈 최종 문구 또는 내레이션","visualPrompt":"필요한 이미지/영상/그래픽 지시","sourceMaterialIds":["소재 id"]}]}',
      `목표 타입: ${aiWorkspace.targetKind}`,
      `사용자 프롬프트:\n${aiWorkspace.prompt || DEFAULT_AI_WORKSPACE_PROMPT}`,
      `소재 목록:\n${materialsText || "소재 없음. 사용자의 프롬프트만으로 구성하라."}`,
      "주의: 카드뉴스면 5장 내외, 영상이면 씬 단위, Canva면 슬라이드 단위로 만들어라. 문구는 한국어로 자연스럽고 짧게 쓴다."
    ].join("\n\n");
  };

  const handleGenerateAiWorkspacePlan = async () => {
    const prompt = buildAiWorkspacePrompt();
    const primaryProvider = settings?.scriptProvider ?? "openrouter_api";
    const provider =
      primaryProvider === "openai_api" && settings?.openAiApiKey
        ? "openai"
        : settings?.openRouterApiKey
          ? "openrouter"
          : settings?.secondaryOpenRouterApiKey
            ? "openrouter"
            : settings?.secondaryOpenAiApiKey
              ? "openai"
              : "local";
    const model =
      provider === "openai"
        ? settings?.openAiModel || settings?.secondaryOpenAiModel || "gpt-5.4-mini"
        : settings?.openRouterModel || settings?.secondaryOpenRouterModel || "anthropic/claude-sonnet-4.6";
    setAiWorkspaceBusy(true);
    try {
      let rawText = "";
      if (provider === "openrouter") {
        const apiKey = settings?.openRouterApiKey || settings?.secondaryOpenRouterApiKey;
        if (!apiKey) {
          throw new Error("OpenRouter API key is missing.");
        }
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.65,
            response_format: { type: "json_object" }
          })
        });
        if (!response.ok) {
          throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
        }
        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        rawText = payload.choices?.[0]?.message?.content ?? "";
      } else if (provider === "openai") {
        const apiKey = settings?.openAiApiKey || settings?.secondaryOpenAiApiKey;
        if (!apiKey) {
          throw new Error("OpenAI API key is missing.");
        }
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.65,
            response_format: { type: "json_object" }
          })
        });
        if (!response.ok) {
          throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
        }
        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        rawText = payload.choices?.[0]?.message?.content ?? "";
      } else {
        rawText = JSON.stringify({
          summary: "API 키가 없어 로컬 초안으로 구성했습니다.",
          targetKind: aiWorkspace.targetKind,
          canvaPrompt: `${aiWorkspace.prompt}\n\n소재 순서:\n${aiWorkspace.materials
            .map((material, index) => `${index + 1}. ${material.label}`)
            .join("\n")}`,
          items: (aiWorkspace.materials.length > 0 ? aiWorkspace.materials : [{ id: "prompt", label: "프롬프트", kind: "text", text: aiWorkspace.prompt }])
            .slice(0, 5)
            .map((material, index) => ({
              index: index + 1,
              title: `${index + 1}장 핵심`,
              text: material.text || material.label,
              visualPrompt: material.sourceUrl || material.localPath || material.label,
              sourceMaterialIds: [material.id]
            }))
        });
      }
      if (!rawText.trim()) {
        throw new Error("AI returned empty content.");
      }
      const plan = normalizeAiPlan(extractJsonObject(rawText), {
        targetKind: aiWorkspace.targetKind,
        rawText,
        provider,
        model
      });
      updateAiWorkspace({ plan });
      setMessage(isKorean ? "AI 설계 초안이 생성되었습니다." : "AI design draft generated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI design generation failed.");
    } finally {
      setAiWorkspaceBusy(false);
    }
  };

  const applyAiWorkspacePlanToDocument = () => {
    const plan = aiWorkspace.plan;
    if (!plan || plan.items.length === 0) {
      setMessage(isKorean ? "먼저 AI 설계 초안을 생성해 주세요." : "Generate an AI design draft first.");
      return;
    }
    applyDocumentUpdate((current) => {
      if (isCardNewsModule) {
        const desiredCount = Math.max(current.scenes.length, plan.items.length);
        const scenes = Array.from({ length: desiredCount }, (_, index) => {
          const sourceScene = current.scenes[index];
          const item = plan.items[index];
          const sceneNo = index + 1;
          const text = item?.text || sourceScene?.text || "";
          const baseScene: SceneScriptItem =
            sourceScene ?? {
              sceneNo,
              text,
              fluxPrompt: item?.visualPrompt ?? "",
              assetSearchQuery: item?.title ?? "",
              motion: "none",
              durationSec: 1
            };
          const baseDesign = {
            ...buildDefaultCardDesign(sceneNo),
            ...(baseScene.cardDesign ?? {}),
            text,
            id: baseScene.cardDesign?.id ?? `box-${sceneNo}-1`,
            layerOrder: 0
          };
          return {
            ...baseScene,
            sceneNo,
            text,
            fluxPrompt: item?.visualPrompt ?? baseScene.fluxPrompt,
            assetSearchQuery: item?.title ?? baseScene.assetSearchQuery,
            cardDesign: baseDesign,
            cardDesignBoxes:
              baseScene.cardDesignBoxes && baseScene.cardDesignBoxes.length > 0
                ? baseScene.cardDesignBoxes.map((box, boxIndex) =>
                    boxIndex === 0 ? { ...box, text, richTextRuns: undefined } : box
                  )
                : [baseDesign]
          };
        });
        return {
          ...current,
          scenes,
          targetDurationSec: scenes.length,
          aiWorkspace: { ...aiWorkspace, plan }
        };
      }
      const scenes = current.scenes.map((scene, index) => {
        const item = plan.items[index];
        if (!item) {
          return scene;
        }
        return {
          ...scene,
          text: item.text,
          fluxPrompt: item.visualPrompt ?? scene.fluxPrompt,
          assetSearchQuery: item.title || item.visualPrompt || scene.assetSearchQuery
        };
      });
      return {
        ...current,
        scenes,
        aiWorkspace: { ...aiWorkspace, plan }
      };
    });
    setMessage(isKorean ? "AI 설계 초안을 현재 에디터에 반영했습니다." : "Applied AI draft to the current editor.");
  };

  const updateCardDesign = (
    sceneNo: number,
    boxIndex: number,
    patch: Partial<NonNullable<SceneScriptItem["cardDesign"]>>
  ) => {
    applyDocumentUpdate((current) => {
      const scenes = current.scenes.map((scene) => {
        if (scene.sceneNo !== sceneNo) {
          return scene;
        }
        const currentBoxes =
          scene.cardDesignBoxes && scene.cardDesignBoxes.length > 0
            ? scene.cardDesignBoxes
            : [
                {
                  ...buildDefaultCardDesign(scene.sceneNo),
                  ...(scene.cardDesign ?? {}),
                  id: `box-${scene.sceneNo}-1`
                }
              ];
        const safeIndex = Math.max(0, Math.min(boxIndex, currentBoxes.length - 1));
        return {
          ...scene,
          cardDesignBoxes: currentBoxes.map((box, index) =>
            index === safeIndex
              ? {
                  ...buildDefaultCardDesign(scene.sceneNo),
                  ...(box ?? {}),
                  id: box?.id ?? `box-${scene.sceneNo}-${index + 1}`,
                  layerOrder: box?.layerOrder ?? index,
                  hidden: Boolean(box?.hidden),
                  locked: Boolean(box?.locked),
                  ...patch
                }
              : {
                  ...buildDefaultCardDesign(scene.sceneNo),
                  ...(box ?? {}),
                  id: box?.id ?? `box-${scene.sceneNo}-${index + 1}`,
                  layerOrder: box?.layerOrder ?? index,
                  hidden: Boolean(box?.hidden),
                  locked: Boolean(box?.locked)
                }
          ),
          cardDesign: {
            ...buildDefaultCardDesign(scene.sceneNo),
            ...(currentBoxes[safeIndex] ?? {}),
            ...patch
          }
        };
      });
      const targetDurationSec = Math.max(
        1,
        Math.round(scenes.reduce((total, scene) => total + Number(scene.durationSec || 0), 0))
      );
      return { ...current, scenes, targetDurationSec };
    });
  };

  const getCardDesignBoxesForScene = (scene: SceneScriptItem): Array<CardDesignBox> => {
    if (scene.cardDesignBoxes) {
      return scene.cardDesignBoxes.map((box, index) => ({
        ...buildDefaultCardDesign(scene.sceneNo),
        ...(box ?? {}),
        id: box?.id ?? `box-${scene.sceneNo}-${index + 1}`,
        layerOrder: box?.layerOrder ?? index,
        hidden: Boolean(box?.hidden),
        locked: Boolean(box?.locked)
      }));
    }
    if (!scene.cardDesign) {
      return [];
    }
    return [
      {
        ...buildDefaultCardDesign(scene.sceneNo),
        ...(scene.cardDesign ?? {}),
        id: `box-${scene.sceneNo}-1`,
        layerOrder: 0,
        hidden: false,
        locked: false
      }
    ];
  };

  const updateCardDesignBoxes = (
    sceneNo: number,
    updater: (boxes: Array<CardDesignBox>) => Array<CardDesignBox>,
    nextSelectedIndex?: number
  ) => {
    applyDocumentUpdate((current) => {
      const scenes = current.scenes.map((scene) => {
        if (scene.sceneNo !== sceneNo) {
          return scene;
        }
        const currentBoxes = getCardDesignBoxesForScene(scene);
        const updatedBoxes = updater(currentBoxes).map((box, index) => ({
          ...buildDefaultCardDesign(scene.sceneNo),
          ...(box ?? {}),
          id: box?.id ?? `box-${scene.sceneNo}-${index + 1}`,
          layerOrder: box?.layerOrder ?? index,
          hidden: Boolean(box?.hidden),
          locked: Boolean(box?.locked)
        }));
        const safePrimary = updatedBoxes[0];
        return {
          ...scene,
          cardDesignBoxes: updatedBoxes,
          cardDesign: safePrimary ? { ...safePrimary } : undefined
        };
      });
      const targetDurationSec = Math.max(
        1,
        Math.round(scenes.reduce((total, scene) => total + Number(scene.durationSec || 0), 0))
      );
      return { ...current, scenes, targetDurationSec };
    });
    if (typeof nextSelectedIndex === "number") {
      setSelectedBoxIndex(Math.max(0, nextSelectedIndex));
    }
  };

  const addCardDesignBox = () => {
    if (!selectedScene) {
      return;
    }
    const nextIndex = selectedCardDesignBoxes.length;
    updateCardDesignBoxes(
      selectedScene.sceneNo,
      (boxes) => [
        ...boxes,
        {
          ...buildDefaultCardDesign(selectedScene.sceneNo),
          id: `box-${selectedScene.sceneNo}-${boxes.length + 1}`,
          layerOrder: boxes.length,
          yPct: Math.max(0, Math.min(84, 12 + boxes.length * 10)),
          text: ""
        }
      ],
      nextIndex
    );
  };

  const addCardFromTemplate = (template: CardNewsTemplateRecord) => {
    const nextSceneNo = (editableDocumentRef.current?.scenes.length ?? 0) + 1;
    applyDocumentUpdate((current) => {
      const sceneNo = current.scenes.length + 1;
      const baseDesign = {
        ...buildDefaultCardDesign(sceneNo),
        id: `box-${sceneNo}-1`,
        layerOrder: 0,
        text:
          template.role === "qna"
            ? "Q. 질문을 입력하세요\n\nA. 답변을 입력하세요"
            : template.role === "closer"
              ? "흥미로웠다면 저장하고 다시 꺼내보세요"
              : template.role === "opener"
                ? "세상의 모든 지식을 알려줌"
                : "본문 내용을 입력하세요",
        fontSize:
          template.role === "closer" ? 58 : template.role === "qna" ? 42 : sceneNo === 1 ? 64 : 46,
        xPct: template.role === "qna" ? 18 : 10,
        yPct: template.role === "qna" ? 34 : template.role === "closer" ? 8 : 14,
        widthPct: template.role === "qna" ? 68 : 80,
        heightPct: template.role === "qna" ? 36 : template.role === "closer" ? 36 : 46,
        backgroundColor: template.role === "body" ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.04)"
      };
      const nextScene: SceneScriptItem = {
        sceneNo,
        text: baseDesign.text,
        fluxPrompt: template.name,
        assetSearchQuery: template.name,
        cardTemplateImagePath: template.imagePath,
        motion: "none",
        durationSec: 1,
        cardDesign: baseDesign,
        cardDesignBoxes: [baseDesign]
      };
      const scenes = [...current.scenes, nextScene];
      return {
        ...current,
        targetDurationSec: scenes.length,
        scenes
      };
    });
    setSelectedSceneNo(nextSceneNo);
    setSelectedBoxIndex(0);
  };

  const duplicateCardDesignBox = () => {
    if (!selectedScene || !selectedCardDesign) {
      return;
    }
    const source = selectedCardDesignBoxes[Math.min(selectedBoxIndex, selectedCardDesignBoxes.length - 1)];
    if (!source) {
      return;
    }
    const nextIndex = selectedBoxIndex + 1;
    updateCardDesignBoxes(
      selectedScene.sceneNo,
      (boxes) => {
        const copied = {
          ...source,
          id: `box-${selectedScene.sceneNo}-${boxes.length + 1}`,
          layerOrder: Math.max(...boxes.map((box) => box.layerOrder ?? 0), 0) + 1,
          xPct: Math.max(0, Math.min(86, source.xPct + 2)),
          yPct: Math.max(0, Math.min(86, source.yPct + 2))
        };
        return [...boxes.slice(0, nextIndex), copied, ...boxes.slice(nextIndex)];
      },
      nextIndex
    );
  };

  const removeCardDesignBox = () => {
    if (!selectedScene || selectedCardDesignBoxes.length === 0) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(selectedBoxIndex, selectedCardDesignBoxes.length - 1));
    updateCardDesignBoxes(
      selectedScene.sceneNo,
      (boxes) => boxes.filter((_, index) => index !== safeIndex),
      Math.max(0, safeIndex - 1)
    );
  };

  const removeSelectedCard = (sceneNoToRemove = selectedScene?.sceneNo) => {
    if (!editableDocumentRef.current || !sceneNoToRemove || editableDocumentRef.current.scenes.length <= 1) {
      return;
    }
    const removedSceneNo = sceneNoToRemove;
    applyDocumentUpdate((current) => {
      const scenes = current.scenes
        .filter((scene) => scene.sceneNo !== removedSceneNo)
        .map((scene, index) => ({
          ...scene,
          sceneNo: index + 1
        }));
      return {
        ...current,
        scenes,
        targetDurationSec: Math.max(
          1,
          Math.round(scenes.reduce((total, scene) => total + Number(scene.durationSec || 0), 0))
        )
      };
    });
    const nextSceneNo = Math.min(removedSceneNo, editableDocumentRef.current.scenes.length || 1);
    setSelectedSceneNo(nextSceneNo);
    setSelectedBoxIndex(0);
  };

  const reorderCardScene = (fromIndex: number, toIndex: number) => {
    const currentDocument = editableDocumentRef.current;
    if (!currentDocument || currentDocument.scenes.length <= 1) {
      return;
    }
    const safeFrom = Math.max(0, Math.min(fromIndex, currentDocument.scenes.length - 1));
    const safeTo = Math.max(0, Math.min(toIndex, currentDocument.scenes.length - 1));
    if (safeFrom === safeTo) {
      return;
    }
    applyDocumentUpdate((current) => {
      const nextScenes = [...current.scenes];
      const [moving] = nextScenes.splice(safeFrom, 1);
      if (!moving) {
        return current;
      }
      nextScenes.splice(safeTo, 0, moving);
      const scenes = nextScenes.map((scene, index) => ({
        ...scene,
        sceneNo: index + 1
      }));
      return {
        ...current,
        scenes,
        targetDurationSec: Math.max(
          1,
          Math.round(scenes.reduce((total, scene) => total + Number(scene.durationSec || 0), 0))
        )
      };
    });
    setSelectedSceneNo(safeTo + 1);
    setSelectedBoxIndex(0);
  };

  const handleSceneDragStart = (event: ReactDragEvent<HTMLDivElement>, index: number) => {
    setDraggingSceneIndex(index);
    setDragOverSceneIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-mellowcat-card-index", String(index));
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleSceneDragOver = (event: ReactDragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    if (dragOverSceneIndex !== index) {
      setDragOverSceneIndex(index);
    }
    event.dataTransfer.dropEffect = "move";
  };

  const handleSceneDrop = (event: ReactDragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault();
    const raw =
      event.dataTransfer.getData("application/x-mellowcat-card-index") ||
      event.dataTransfer.getData("text/plain");
    const fromIndex = Number(raw);
    if (Number.isFinite(fromIndex)) {
      reorderCardScene(fromIndex, targetIndex);
    }
    setDraggingSceneIndex(null);
    setDragOverSceneIndex(null);
  };

  const handleSceneDragEnd = () => {
    setDraggingSceneIndex(null);
    setDragOverSceneIndex(null);
  };

  const toggleCardDesignLockAt = (index: number) => {
    if (!selectedScene) {
      return;
    }
    const target = selectedCardDesignBoxes[Math.max(0, Math.min(index, selectedCardDesignBoxes.length - 1))];
    if (!target) {
      return;
    }
    updateCardDesign(selectedScene.sceneNo, index, {
      locked: !target.locked
    });
  };

  const toggleCardDesignHiddenAt = (index: number) => {
    if (!selectedScene) {
      return;
    }
    const target = selectedCardDesignBoxes[Math.max(0, Math.min(index, selectedCardDesignBoxes.length - 1))];
    if (!target) {
      return;
    }
    updateCardDesign(selectedScene.sceneNo, index, {
      hidden: !target.hidden
    });
  };

  const moveCardDesignLayer = (direction: "up" | "down") => {
    if (!selectedScene || selectedCardDesignBoxes.length <= 1) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(selectedBoxIndex, selectedCardDesignBoxes.length - 1));
    const targetIndex =
      direction === "up"
        ? Math.min(selectedCardDesignBoxes.length - 1, safeIndex + 1)
        : Math.max(0, safeIndex - 1);
    if (targetIndex === safeIndex) {
      return;
    }
    updateCardDesignBoxes(
      selectedScene.sceneNo,
      (boxes) => {
        const next = [...boxes];
        const temp = next[safeIndex];
        next[safeIndex] = next[targetIndex];
        next[targetIndex] = temp;
        return next.map((box, index) => ({
          ...box,
          layerOrder: index
        }));
      },
      targetIndex
    );
  };

  const reorderCardDesignLayer = (fromIndex: number, toIndex: number) => {
    if (!selectedScene || selectedCardDesignBoxes.length <= 1) {
      return;
    }
    const safeFrom = Math.max(0, Math.min(fromIndex, selectedCardDesignBoxes.length - 1));
    const safeTo = Math.max(0, Math.min(toIndex, selectedCardDesignBoxes.length - 1));
    if (safeFrom === safeTo) {
      return;
    }
    updateCardDesignBoxes(
      selectedScene.sceneNo,
      (boxes) => {
        const next = [...boxes];
        const [moving] = next.splice(safeFrom, 1);
        if (!moving) {
          return boxes;
        }
        next.splice(safeTo, 0, moving);
        return next.map((box, index) => ({
          ...box,
          layerOrder: index
        }));
      },
      safeTo
    );
  };

  const handleLayerDragStart = (event: ReactDragEvent<HTMLButtonElement>, index: number) => {
    setDraggingLayerIndex(index);
    setDragOverLayerIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleLayerDragOver = (event: ReactDragEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    if (dragOverLayerIndex !== index) {
      setDragOverLayerIndex(index);
    }
    event.dataTransfer.dropEffect = "move";
  };

  const handleLayerDrop = (event: ReactDragEvent<HTMLButtonElement>, targetIndex: number) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    const fromIndex = Number(raw);
    if (Number.isFinite(fromIndex)) {
      reorderCardDesignLayer(fromIndex, targetIndex);
    }
    setDraggingLayerIndex(null);
    setDragOverLayerIndex(null);
  };

  const handleLayerDragEnd = () => {
    setDraggingLayerIndex(null);
    setDragOverLayerIndex(null);
  };

  const flushActivePreviewTextEdit = async () => {
    const activeElement = document.activeElement as HTMLElement | null;
    if (!activeElement?.isContentEditable) {
      return;
    }
    activeElement.blur();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  };

  const applyCardTextPreset = (presetId: string) => {
    if (!selectedScene) {
      return;
    }
    const preset = CARD_NEWS_TEXT_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    applyCardTextStylePatch({
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight
    });
    updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
      lineHeight: preset.lineHeight
    });
  };

  const applyCardColorPreset = (presetId: string) => {
    if (!selectedScene) {
      return;
    }
    const preset = CARD_NEWS_COLOR_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    applyCardTextStylePatch({
      textColor: preset.textColor
    });
    updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
      backgroundColor: preset.backgroundColor
    });
  };

  const appendSymbolToSelectedBox = (symbol: string) => {
    if (!selectedScene || !selectedCardDesign) {
      return;
    }
    const currentText = selectedCardDesign.text ?? "";
    updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
      text: `${currentText}${currentText.endsWith(" ") || currentText.length === 0 ? "" : " "}${symbol}`
    });
  };

  const captureRichTextSelection = (sceneNo: number, boxIndex: number, root: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      activeRichTextSelectionRef.current = null;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      activeRichTextSelectionRef.current = null;
      return;
    }
    const beforeRange = range.cloneRange();
    beforeRange.selectNodeContents(root);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const start = beforeRange.toString().length;
    const end = start + range.toString().length;
    if (end <= start) {
      activeRichTextSelectionRef.current = null;
      return;
    }
    activeRichTextSelectionRef.current = { sceneNo, boxIndex, start, end };
  };

  const applyCardTextStylePatch = (patch: CardRichTextStylePatch) => {
    if (!selectedScene) {
      return;
    }
    const selection = activeRichTextSelectionRef.current;
    if (
      selection &&
      selection.sceneNo === selectedScene.sceneNo &&
      selection.boxIndex === selectedBoxIndex &&
      selection.end > selection.start
    ) {
      updateCardDesignBoxes(selectedScene.sceneNo, (boxes) =>
        boxes.map((box, index) => {
          if (index !== selectedBoxIndex) {
            return box;
          }
          const currentText = box.text ?? getCardPlainTextFromRuns(box.richTextRuns);
          const baseRuns = getCardRunsForBox({ ...box, text: currentText });
          const safeStart = Math.max(0, Math.min(selection.start, currentText.length));
          const safeEnd = Math.max(safeStart, Math.min(selection.end, currentText.length));
          return {
            ...box,
            text: currentText,
            richTextRuns:
              safeEnd > safeStart
                ? applyCardStylePatchToRuns(baseRuns, safeStart, safeEnd, patch)
                : box.richTextRuns
          };
        })
      );
      activeRichTextSelectionRef.current = null;
      return;
    }
    updateCardDesignBoxes(selectedScene.sceneNo, (boxes) =>
      boxes.map((box, index) => {
        if (index !== selectedBoxIndex) {
          return box;
        }
        const currentText = box.text ?? getCardPlainTextFromRuns(box.richTextRuns);
        const baseRuns = getCardRunsForBox({ ...box, text: currentText });
        return {
          ...box,
          ...patch,
          text: currentText,
          richTextRuns:
            currentText.length > 0
              ? applyCardStylePatchToRuns(baseRuns, 0, currentText.length, patch)
              : box.richTextRuns
        };
      })
    );
  };

  const beginCardDesignDrag = (
    event: ReactMouseEvent<HTMLDivElement>,
    mode: "move" | "resize",
    sceneNo: number,
    boxIndex: number,
    design: NonNullable<SceneScriptItem["cardDesign"]>
  ) => {
    if (design.locked || design.hidden) {
      return;
    }
    const previewHost =
      (event.currentTarget.closest(".generation-card-stage") as HTMLElement | null) ??
      event.currentTarget.parentElement;
    if (!previewHost) {
      return;
    }
    const rect = previewHost.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    setCardDesignDrag({
      mode,
      sceneNo,
      boxIndex,
      startX: event.clientX,
      startY: event.clientY,
      startDesign: { ...design },
      bounds: {
        width: rect.width,
        height: rect.height
      }
    });
  };

  useEffect(() => {
    if (!cardDesignDrag) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const deltaXPct =
        ((event.clientX - cardDesignDrag.startX) / Math.max(1, cardDesignDrag.bounds.width)) * 100;
      const deltaYPct =
        ((event.clientY - cardDesignDrag.startY) / Math.max(1, cardDesignDrag.bounds.height)) * 100;

      if (cardDesignDrag.mode === "move") {
        let nextXPct = Math.max(
          0,
          Math.min(
            100 - cardDesignDrag.startDesign.widthPct,
            cardDesignDrag.startDesign.xPct + deltaXPct
          )
        );
        let nextYPct = Math.max(
          0,
          Math.min(
            100 - cardDesignDrag.startDesign.heightPct,
            cardDesignDrag.startDesign.yPct + deltaYPct
          )
        );
        const centerXPct = nextXPct + cardDesignDrag.startDesign.widthPct / 2;
        const centerYPct = nextYPct + cardDesignDrag.startDesign.heightPct / 2;
        const nextGuides: { verticalPct?: number; horizontalPct?: number } = {};
        if (Math.abs(centerXPct - 50) <= 1.5) {
          nextXPct = 50 - cardDesignDrag.startDesign.widthPct / 2;
          nextGuides.verticalPct = 50;
        }
        if (Math.abs(centerYPct - 50) <= 1.5) {
          nextYPct = 50 - cardDesignDrag.startDesign.heightPct / 2;
          nextGuides.horizontalPct = 50;
        }
        setSnapGuides(nextGuides);
        updateCardDesign(cardDesignDrag.sceneNo, cardDesignDrag.boxIndex, {
          xPct: Number(nextXPct.toFixed(2)),
          yPct: Number(nextYPct.toFixed(2))
        });
        return;
      }

      const nextWidth = Math.max(
        20,
        Math.min(100 - cardDesignDrag.startDesign.xPct, cardDesignDrag.startDesign.widthPct + deltaXPct)
      );
      const nextHeight = Math.max(
        10,
        Math.min(
          100 - cardDesignDrag.startDesign.yPct,
          cardDesignDrag.startDesign.heightPct + deltaYPct
        )
      );
      setSnapGuides({});
      updateCardDesign(cardDesignDrag.sceneNo, cardDesignDrag.boxIndex, {
        widthPct: Number(nextWidth.toFixed(2)),
        heightPct: Number(nextHeight.toFixed(2))
      });
    };

    const onMouseUp = () => {
      setCardDesignDrag(null);
      setSnapGuides({});
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [cardDesignDrag]);

  useEffect(() => {
    if (!videoTextDrag) {
      return;
    }
    let animationFrameId = 0;
    let pendingPoint: { clientX: number; clientY: number } | null = null;
    let latestPatch: Partial<Pick<SceneScriptVideoTextOverlay, "xPct" | "yPct" | "widthPct" | "heightPct">> | null = null;
    const previewTextPatch = (
      patch: Partial<Pick<SceneScriptVideoTextOverlay, "xPct" | "yPct" | "widthPct" | "heightPct">>
    ) => {
      latestPatch = patch;
      applyVideoTextDragPreviewToDom(videoTextDrag.sceneNo, videoTextDrag.overlayIndex, patch);
    };
    const applyMouseMove = (point: { clientX: number; clientY: number }) => {
      const stage = document.querySelector<HTMLElement>(".video-canvas-frame");
      const bounds = stage?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      const scene = editableDocumentRef.current?.scenes.find((item) => item.sceneNo === videoTextDrag.sceneNo);
      const overlay =
        !isCardNewsModule && editableDocumentRef.current?.videoTextOverlays
          ? editableDocumentRef.current.videoTextOverlays[videoTextDrag.overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY
          : getSceneVideoTextOverlays(scene)[videoTextDrag.overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY;
      const deltaXPct = ((point.clientX - videoTextDrag.startClientX) / Math.max(1, bounds.width)) * 100;
      const deltaYPct = ((point.clientY - videoTextDrag.startClientY) / Math.max(1, bounds.height)) * 100;
      if (videoTextDrag.mode === "resize") {
        const handle = videoTextDrag.handle ?? "se";
        const minWidthPct = 3;
        const minHeightPct = 3;
        let left = videoTextDrag.startXPct;
        let right = videoTextDrag.startXPct + videoTextDrag.startWidthPct;
        let top = videoTextDrag.startYPct;
        let bottom = videoTextDrag.startYPct + videoTextDrag.startHeightPct;

        if (handle.includes("w")) {
          left += deltaXPct;
        }
        if (handle.includes("e")) {
          right += deltaXPct;
        }
        if (handle.includes("n")) {
          top += deltaYPct;
        }
        if (handle.includes("s")) {
          bottom += deltaYPct;
        }

        left = Math.max(0, Math.min(100, left));
        right = Math.max(0, Math.min(100, right));
        top = Math.max(0, Math.min(100, top));
        bottom = Math.max(0, Math.min(100, bottom));
        if (right - left < minWidthPct) {
          if (handle.includes("w")) {
            left = right - minWidthPct;
          } else {
            right = left + minWidthPct;
          }
        }
        if (bottom - top < minHeightPct) {
          if (handle.includes("n")) {
            top = bottom - minHeightPct;
          } else {
            bottom = top + minHeightPct;
          }
        }
        left = Math.max(0, Math.min(100 - minWidthPct, left));
        top = Math.max(0, Math.min(100 - minHeightPct, top));
        right = Math.max(left + minWidthPct, Math.min(100, right));
        bottom = Math.max(top + minHeightPct, Math.min(100, bottom));
        setCanvasSnapGuides({});
        previewTextPatch({
          xPct: Number(left.toFixed(2)),
          yPct: Number(top.toFixed(2)),
          widthPct: Number((right - left).toFixed(2)),
          heightPct: Number((bottom - top).toFixed(2))
        });
        return;
      }
      let nextXPct = Math.max(0, Math.min(100 - overlay.widthPct, videoTextDrag.startXPct + deltaXPct));
      let nextYPct = Math.max(0, Math.min(100 - overlay.heightPct, videoTextDrag.startYPct + deltaYPct));
      const nextGuides: { verticalPct?: number; horizontalPct?: number } = {};
      const otherOverlays =
        !isCardNewsModule && editableDocumentRef.current?.videoTextOverlays
          ? editableDocumentRef.current.videoTextOverlays.filter((_, index) => index !== videoTextDrag.overlayIndex)
          : getSceneVideoTextOverlays(scene).filter((_, index) => index !== videoTextDrag.overlayIndex);
      const xTargets = [
        0,
        50,
        100,
        ...otherOverlays.flatMap((item) => [
          item.xPct,
          item.xPct + item.widthPct / 2,
          item.xPct + item.widthPct
        ])
      ];
      const yTargets = [
        0,
        50,
        100,
        ...otherOverlays.flatMap((item) => [
          item.yPct,
          item.yPct + item.heightPct / 2,
          item.yPct + item.heightPct
        ])
      ];
      for (const target of xTargets) {
        const currentPoints = [
          { value: nextXPct, offset: 0 },
          { value: nextXPct + overlay.widthPct / 2, offset: overlay.widthPct / 2 },
          { value: nextXPct + overlay.widthPct, offset: overlay.widthPct }
        ];
        const match = currentPoints.find((point) => Math.abs(point.value - target) <= CANVAS_SNAP_THRESHOLD_PCT);
        if (match) {
          nextXPct = Math.max(0, Math.min(100 - overlay.widthPct, target - match.offset));
          nextGuides.verticalPct = target;
          break;
        }
      }
      for (const target of yTargets) {
        const currentPoints = [
          { value: nextYPct, offset: 0 },
          { value: nextYPct + overlay.heightPct / 2, offset: overlay.heightPct / 2 },
          { value: nextYPct + overlay.heightPct, offset: overlay.heightPct }
        ];
        const match = currentPoints.find((point) => Math.abs(point.value - target) <= CANVAS_SNAP_THRESHOLD_PCT);
        if (match) {
          nextYPct = Math.max(0, Math.min(100 - overlay.heightPct, target - match.offset));
          nextGuides.horizontalPct = target;
          break;
        }
      }
      setCanvasSnapGuides(nextGuides);
      previewTextPatch({
        xPct: Number(nextXPct.toFixed(2)),
        yPct: Number(nextYPct.toFixed(2))
      });
    };
    const flushMouseMove = () => {
      animationFrameId = 0;
      if (!pendingPoint) {
        return;
      }
      const point = pendingPoint;
      pendingPoint = null;
      applyMouseMove(point);
    };
    const onMouseMove = (event: MouseEvent) => {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(flushMouseMove);
      }
    };
    const onMouseUp = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      if (pendingPoint) {
        applyMouseMove(pendingPoint);
        pendingPoint = null;
      }
      if (latestPatch) {
        updateVideoTextOverlay(
          videoTextDrag.sceneNo,
          latestPatch,
          videoTextDrag.overlayIndex,
          { recordHistory: false }
        );
      }
      commitGroupedDocumentChange();
      setVideoTextDrag(null);
      setVideoTextDragPreview(null);
      setSnapGuides({});
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      setVideoTextDragPreview(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isCardNewsModule, videoTextDrag]);

  useEffect(() => {
    if (!videoMediaDrag) {
      return;
    }
    let animationFrameId = 0;
    let pendingPoint: { clientX: number; clientY: number } | null = null;
    let latestBox: Pick<SceneScriptVideoMediaLayer, "xPct" | "yPct" | "widthPct" | "heightPct"> | null = null;
    const previewMediaBox = (
      box: Pick<SceneScriptVideoMediaLayer, "xPct" | "yPct" | "widthPct" | "heightPct">
    ) => {
      latestBox = box;
      applyVideoMediaDragPreviewToDom(videoMediaDrag.layerId, box);
    };
    const applyMouseMove = (point: { clientX: number; clientY: number }) => {
      const stage = document.querySelector<HTMLElement>(".video-canvas-frame");
      const bounds = stage?.getBoundingClientRect();
      const layer = editableDocumentRef.current?.videoMediaLayers?.find(
        (item) => item.id === videoMediaDrag.layerId
      );
      if (!bounds || !layer) {
        return;
      }
      const box = getVideoMediaLayerBox(layer);
      const deltaXPct = ((point.clientX - videoMediaDrag.startClientX) / Math.max(1, bounds.width)) * 100;
      const deltaYPct = ((point.clientY - videoMediaDrag.startClientY) / Math.max(1, bounds.height)) * 100;

      if (videoMediaDrag.mode === "resize") {
        const handle = videoMediaDrag.handle ?? "se";
        const minSizePct = 3;
        const startWidthPx = (videoMediaDrag.startWidthPct / 100) * bounds.width;
        const startHeightPx = (videoMediaDrag.startHeightPct / 100) * bounds.height;
        const keepNaturalAspect = layer.mediaType === "video" || layer.mediaType === "image";
        if (keepNaturalAspect) {
          const minSizePx = Math.max(24, (minSizePct / 100) * Math.min(bounds.width, bounds.height));
          const naturalAspect =
            Number(layer.naturalWidth) > 0 && Number(layer.naturalHeight) > 0
              ? Number(layer.naturalWidth) / Math.max(1, Number(layer.naturalHeight))
              : Math.max(0.01, startWidthPx / Math.max(1, startHeightPx));
          const startCenterXPx = (videoMediaDrag.startXPct / 100) * bounds.width;
          const startCenterYPx = (videoMediaDrag.startYPct / 100) * bounds.height;
          const startLeftPx = startCenterXPx - startWidthPx / 2;
          const startRightPx = startCenterXPx + startWidthPx / 2;
          const startTopPx = startCenterYPx - startHeightPx / 2;
          const startBottomPx = startCenterYPx + startHeightPx / 2;
          const horizontalDeltaPx = point.clientX - videoMediaDrag.startClientX;
          const verticalDeltaPx = point.clientY - videoMediaDrag.startClientY;
          const signedWidthDeltaPx =
            handle.includes("e") ? horizontalDeltaPx : handle.includes("w") ? -horizontalDeltaPx : 0;
          const signedHeightDeltaPx =
            handle.includes("s") ? verticalDeltaPx : handle.includes("n") ? -verticalDeltaPx : 0;
          const widthScale = handle.includes("e") || handle.includes("w")
            ? (startWidthPx + signedWidthDeltaPx) / Math.max(1, startWidthPx)
            : 1;
          const heightScale = handle.includes("n") || handle.includes("s")
            ? (startHeightPx + signedHeightDeltaPx) / Math.max(1, startHeightPx)
            : 1;
          const activeScales = [
            ...(handle.includes("e") || handle.includes("w") ? [widthScale] : []),
            ...(handle.includes("n") || handle.includes("s") ? [heightScale] : [])
          ];
          const rawScale =
            activeScales.length > 1
              ? activeScales.reduce((winner, candidate) =>
                  Math.abs(candidate - 1) > Math.abs(winner - 1) ? candidate : winner
                )
              : activeScales[0] ?? 1;
          const scale = Math.max(
            minSizePx / Math.max(1, startWidthPx),
            minSizePx / Math.max(1, startHeightPx),
            rawScale
          );

          let nextWidthPx = Math.max(minSizePx, startWidthPx * scale);
          let nextHeightPx = Math.max(minSizePx, nextWidthPx / naturalAspect);
          if (nextHeightPx < minSizePx) {
            nextHeightPx = minSizePx;
            nextWidthPx = nextHeightPx * naturalAspect;
          }

          let nextCenterXPx = startCenterXPx;
          let nextCenterYPx = startCenterYPx;
          if (handle.includes("w")) {
            nextCenterXPx = startRightPx - nextWidthPx / 2;
          } else if (handle.includes("e")) {
            nextCenterXPx = startLeftPx + nextWidthPx / 2;
          }
          if (handle.includes("n")) {
            nextCenterYPx = startBottomPx - nextHeightPx / 2;
          } else if (handle.includes("s")) {
            nextCenterYPx = startTopPx + nextHeightPx / 2;
          }

          setCanvasSnapGuides({});
          previewMediaBox({
            xPct: Number(clampVideoMediaCanvasPct((nextCenterXPx / bounds.width) * 100).toFixed(2)),
            yPct: Number(clampVideoMediaCanvasPct((nextCenterYPx / bounds.height) * 100).toFixed(2)),
            widthPct: Number(((nextWidthPx / bounds.width) * 100).toFixed(2)),
            heightPct: Number(((nextHeightPx / bounds.height) * 100).toFixed(2))
          });
          return;
        }
        let left = videoMediaDrag.startXPct - videoMediaDrag.startWidthPct / 2;
        let right = videoMediaDrag.startXPct + videoMediaDrag.startWidthPct / 2;
        let top = videoMediaDrag.startYPct - videoMediaDrag.startHeightPct / 2;
        let bottom = videoMediaDrag.startYPct + videoMediaDrag.startHeightPct / 2;

        if (handle.includes("w")) {
          left += deltaXPct;
        }
        if (handle.includes("e")) {
          right += deltaXPct;
        }
        if (handle.includes("n")) {
          top += deltaYPct;
        }
        if (handle.includes("s")) {
          bottom += deltaYPct;
        }

        if (right - left < minSizePct) {
          if (handle.includes("w")) {
            left = right - minSizePct;
          } else {
            right = left + minSizePct;
          }
        }
        if (bottom - top < minSizePct) {
          if (handle.includes("n")) {
            top = bottom - minSizePct;
          } else {
            bottom = top + minSizePct;
          }
        }

        left = clampVideoMediaCanvasPct(left);
        right = clampVideoMediaCanvasPct(right);
        top = clampVideoMediaCanvasPct(top);
        bottom = clampVideoMediaCanvasPct(bottom);
        if (right - left < minSizePct) {
          right = Math.min(VIDEO_MEDIA_OVERFLOW_MAX_PCT, left + minSizePct);
          left = Math.min(left, right - minSizePct);
        }
        if (bottom - top < minSizePct) {
          bottom = Math.min(VIDEO_MEDIA_OVERFLOW_MAX_PCT, top + minSizePct);
          top = Math.min(top, bottom - minSizePct);
        }

        let nextWidthPct = right - left;
        let nextHeightPct = bottom - top;
        let nextXPct = left + nextWidthPct / 2;
        let nextYPct = top + nextHeightPct / 2;
        setCanvasSnapGuides({});
        previewMediaBox({
          xPct: Number(clampVideoMediaCanvasPct(nextXPct).toFixed(2)),
          yPct: Number(clampVideoMediaCanvasPct(nextYPct).toFixed(2)),
          widthPct: Number(nextWidthPct.toFixed(2)),
          heightPct: Number(nextHeightPct.toFixed(2))
        });
        return;
      }

      let nextXPct = clampVideoMediaCanvasPct(videoMediaDrag.startXPct + deltaXPct);
      let nextYPct = clampVideoMediaCanvasPct(videoMediaDrag.startYPct + deltaYPct);
      const nextGuides: { verticalPct?: number; horizontalPct?: number } = {};
      const otherLayers = (editableDocumentRef.current?.videoMediaLayers ?? []).filter(
        (item) => item.id !== videoMediaDrag.layerId
      );
      const xTargets = [
        0,
        50,
        100,
        ...otherLayers.flatMap((item) => {
          const otherBox = getVideoMediaLayerBox(item);
          return [
            otherBox.xPct - otherBox.widthPct / 2,
            otherBox.xPct,
            otherBox.xPct + otherBox.widthPct / 2
          ];
        })
      ];
      const yTargets = [
        0,
        50,
        100,
        ...otherLayers.flatMap((item) => {
          const otherBox = getVideoMediaLayerBox(item);
          return [
            otherBox.yPct - otherBox.heightPct / 2,
            otherBox.yPct,
            otherBox.yPct + otherBox.heightPct / 2
          ];
        })
      ];
      const movingXPoints = [
        { offset: -box.widthPct / 2, apply: (target: number) => target + box.widthPct / 2 },
        { offset: 0, apply: (target: number) => target },
        { offset: box.widthPct / 2, apply: (target: number) => target - box.widthPct / 2 }
      ];
      const movingYPoints = [
        { offset: -box.heightPct / 2, apply: (target: number) => target + box.heightPct / 2 },
        { offset: 0, apply: (target: number) => target },
        { offset: box.heightPct / 2, apply: (target: number) => target - box.heightPct / 2 }
      ];
      for (const point of movingXPoints) {
        const currentPoint = nextXPct + point.offset;
        const target = xTargets.find((candidate) => Math.abs(candidate - currentPoint) <= CANVAS_SNAP_THRESHOLD_PCT);
        if (target !== undefined) {
          nextXPct = clampVideoMediaCanvasPct(point.apply(target));
          nextGuides.verticalPct = target;
          break;
        }
      }
      for (const point of movingYPoints) {
        const currentPoint = nextYPct + point.offset;
        const target = yTargets.find((candidate) => Math.abs(candidate - currentPoint) <= CANVAS_SNAP_THRESHOLD_PCT);
        if (target !== undefined) {
          nextYPct = clampVideoMediaCanvasPct(point.apply(target));
          nextGuides.horizontalPct = target;
          break;
        }
      }
      setCanvasSnapGuides(nextGuides);
      previewMediaBox({
        xPct: Number(nextXPct.toFixed(2)),
        yPct: Number(nextYPct.toFixed(2)),
        widthPct: videoMediaDrag.startWidthPct,
        heightPct: videoMediaDrag.startHeightPct
      });
    };
    const flushMouseMove = () => {
      animationFrameId = 0;
      if (!pendingPoint) {
        return;
      }
      const point = pendingPoint;
      pendingPoint = null;
      applyMouseMove(point);
    };
    const onMouseMove = (event: MouseEvent) => {
      pendingPoint = { clientX: event.clientX, clientY: event.clientY };
      if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(flushMouseMove);
      }
    };
    const onMouseUp = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }
      if (pendingPoint) {
        applyMouseMove(pendingPoint);
        pendingPoint = null;
      }
      if (latestBox) {
        updateVideoMediaLayer(videoMediaDrag.layerId, latestBox, { recordHistory: false });
      }
      commitGroupedDocumentChange();
      setVideoMediaDrag(null);
      setVideoMediaDragPreview(null);
      setSnapGuides({});
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      setVideoMediaDragPreview(null);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [videoMediaDrag, timelinePlaying]);

  useEffect(() => {
    if (!videoMediaCropDrag) {
      return;
    }
    const onMouseMove = (event: MouseEvent) => {
      const deltaXPct = ((event.clientX - videoMediaCropDrag.startClientX) / videoMediaCropDrag.layerWidthPx) * 100;
      const deltaYPct = ((event.clientY - videoMediaCropDrag.startClientY) / videoMediaCropDrag.layerHeightPx) * 100;
      let topPct = videoMediaCropDrag.startTopPct;
      let rightPct = videoMediaCropDrag.startRightPct;
      let bottomPct = videoMediaCropDrag.startBottomPct;
      let leftPct = videoMediaCropDrag.startLeftPct;
      if (videoMediaCropDrag.handle === "top") {
        topPct += deltaYPct;
      }
      if (videoMediaCropDrag.handle === "right") {
        rightPct -= deltaXPct;
      }
      if (videoMediaCropDrag.handle === "bottom") {
        bottomPct -= deltaYPct;
      }
      if (videoMediaCropDrag.handle === "left") {
        leftPct += deltaXPct;
      }
      const clampCrop = (value: number) => Math.max(0, Math.min(85, Number(value.toFixed(2))));
      topPct = clampCrop(topPct);
      rightPct = clampCrop(rightPct);
      bottomPct = clampCrop(bottomPct);
      leftPct = clampCrop(leftPct);
      if (topPct + bottomPct > 88) {
        if (videoMediaCropDrag.handle === "top") {
          topPct = 88 - bottomPct;
        } else {
          bottomPct = 88 - topPct;
        }
      }
      if (leftPct + rightPct > 88) {
        if (videoMediaCropDrag.handle === "left") {
          leftPct = 88 - rightPct;
        } else {
          rightPct = 88 - leftPct;
        }
      }
      updateVideoMediaLayer(videoMediaCropDrag.layerId, {
        frameCrop: { topPct, rightPct, bottomPct, leftPct },
        crop: undefined
      }, { recordHistory: false });
    };
    const onMouseUp = () => {
      commitGroupedDocumentChange();
      setVideoMediaCropDrag(null);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [videoMediaCropDrag]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCardNewsModule) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTextEditable =
        tag === "input" || tag === "textarea" || Boolean(target && target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
        if (isTextEditable) {
          return;
        }
        event.preventDefault();
        if (event.shiftKey) {
          redoDocumentChange();
        } else {
          undoDocumentChange();
        }
        return;
      }

      if (isTextEditable) {
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedScene?.sceneNo &&
        selectedCardDesignBoxes.length > 0
      ) {
        event.preventDefault();
        removeCardDesignBox();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCardNewsModule, redoDocumentChange, removeCardDesignBox, selectedCardDesignBoxes.length, selectedScene?.sceneNo, undoDocumentChange]);

  useEffect(() => {
    if (!cardStagePanDrag) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      setCardStagePan({
        x: cardStagePanDrag.startPanX + event.clientX - cardStagePanDrag.startX,
        y: cardStagePanDrag.startPanY + event.clientY - cardStagePanDrag.startY
      });
    };
    const onMouseUp = () => setCardStagePanDrag(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [cardStagePanDrag]);

  const handleCardPreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!isCardNewsModule || !event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setCardStageZoom((current) => {
      const next = current * (direction > 0 ? 1.1 : 0.9);
      return Math.max(0.35, Math.min(4, Number(next.toFixed(3))));
    });
  };

  const handleVideoCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (isCardNewsModule || !event.ctrlKey) {
      handleCardPreviewWheel(event);
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setVideoCanvasZoom((current) => {
      const next = current * (direction > 0 ? 1.1 : 0.9);
      return Math.max(0.35, Math.min(5, Number(next.toFixed(3))));
    });
  };

  const handleTimelineWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (isCardNewsModule || !event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setTimelineZoom((current) => {
      const next = current * (direction > 0 ? 1.16 : 0.86);
      return Math.max(0.5, Math.min(8, Number(next.toFixed(3))));
    });
  };

  const buildZoomedVideoCanvasStyle = (extraStyle?: CSSProperties): CSSProperties => ({
    ...buildVideoCanvasFrameStyle(selectedVideoCanvasPreset, extraStyle),
    transform: `scale(${videoCanvasZoom})`,
    transformOrigin: "center center"
  });

  const buildElementTransitionPreviewStyle = (
    transition: SceneScriptElementTransition | undefined,
    startSec: number,
    durationSec: number
  ) => {
    const normalized = normalizeElementTransition(transition);
    if (normalized.style === "none") {
      return { opacityMultiplier: 1, transform: "" };
    }
    const localSec = Math.max(0, Math.min(durationSec, timelineTimeSec - startSec));
    const transitionDurationSec = Math.min(normalized.durationSec, Math.max(0.05, durationSec / 2));
    let progress = 1;
    let phase: "in" | "out" | null = null;
    if (
      shouldRunTransitionPhase(normalized, "in") &&
      localSec < transitionDurationSec
    ) {
      progress = localSec / transitionDurationSec;
      phase = "in";
    } else if (
      shouldRunTransitionPhase(normalized, "out") &&
      localSec > durationSec - transitionDurationSec
    ) {
      progress = Math.max(0, (durationSec - localSec) / transitionDurationSec);
      phase = "out";
    }
    if (!phase) {
      return { opacityMultiplier: 1, transform: "" };
    }
    if (normalized.style === "fade") {
      const eased = phase === "in" ? easeOutCubic(progress) : 1 - easeInCubic(1 - progress);
      return { opacityMultiplier: clampNumber(eased, 0, 1), transform: "" };
    }
    const eased = phase === "in" ? easeOutCubic(progress) : 1 - easeInCubic(1 - progress);
    const offsetPx = 26 * (1 - clampNumber(eased, 0, 1));
    const opacityMultiplier = 0.88 + 0.12 * clampNumber(eased, 0, 1);
    const directionMultiplier = phase === "in" ? 1 : -1;
    const transform =
      normalized.style === "slide-left"
        ? `translateX(${offsetPx * directionMultiplier}px)`
        : normalized.style === "slide-right"
          ? `translateX(${-offsetPx * directionMultiplier}px)`
          : normalized.style === "slide-up"
            ? `translateY(${offsetPx * directionMultiplier}px)`
            : normalized.style === "slide-down"
              ? `translateY(${-offsetPx * directionMultiplier}px)`
              : "";
    return { opacityMultiplier, transform };
  };

  const buildMediaMotionPreviewStyle = (
    motion: SceneScriptVideoMediaMotion | undefined,
    startSec: number,
    durationSec: number
  ): CSSProperties => {
    const normalized = normalizeMediaMotion(motion);
    if (normalized.style === "none") {
      return {};
    }
    const localSec = Math.max(0, Math.min(durationSec, timelineTimeSec - startSec));
    const progress = clampNumber(localSec / Math.max(0.1, durationSec), 0, 1);
    const amount = normalized.amountPct / 100;
    const scale =
      normalized.style === "slow-zoom-out"
        ? 1 + amount * (1 - progress)
        : 1 + amount * progress;
    return {
      transform: `scale(${scale.toFixed(4)})`,
      transformOrigin: `${normalized.focusXPct ?? 50}% ${normalized.focusYPct ?? 50}%`
    };
  };

  const renderMobileSafeAreaGuides = () => {
    if (isCardNewsModule) {
      return null;
    }
    const guide = MOBILE_SAFE_AREA_GUIDES[selectedVideoCanvasPreset.id];
    const isVertical = selectedVideoCanvasPreset.width < selectedVideoCanvasPreset.height;
    return (
      <>
        <div
          className={[
            "mobile-safe-area-guide",
            isVertical ? "mobile-safe-area-guide--vertical" : "mobile-safe-area-guide--landscape"
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            top: `${guide.topPct}%`,
            right: `${guide.rightPct}%`,
            bottom: `${guide.bottomPct}%`,
            left: `${guide.leftPct}%`
          }}
          aria-hidden="true"
        />
        {isVertical ? (
          <>
            <div
              className="mobile-safe-area-ui-zone mobile-safe-area-ui-zone--right"
              style={{ width: `${guide.rightPct}%` }}
              aria-hidden="true"
            />
            <div
              className="mobile-safe-area-ui-zone mobile-safe-area-ui-zone--bottom"
              style={{ height: `${guide.bottomPct}%` }}
              aria-hidden="true"
            />
          </>
        ) : null}
      </>
    );
  };

  const handleCardPreviewMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isCardNewsModule || event.button !== 2) {
      return;
    }
    event.preventDefault();
    setCardStagePanDrag({
      startX: event.clientX,
      startY: event.clientY,
      startPanX: cardStagePan.x,
      startPanY: cardStagePan.y
    });
  };

  const updateVoiceProfile = (patch: Partial<SceneScriptVoiceProfile>) => {
    applyDocumentUpdate((current) => ({
      ...current,
      voiceProfile: {
        ...current.voiceProfile,
        ...patch
      }
    }));
  };

  const updateCardNewsOptions = (
    patch: Partial<NonNullable<SceneScriptDocument["cardNews"]>>
  ) => {
    applyDocumentUpdate((current) => {
      const nextCardNews = {
        layoutPreset: current.cardNews?.layoutPreset ?? "headline_focus",
        transitionStyle: current.cardNews?.transitionStyle ?? "cut",
        outputFormat: current.cardNews?.outputFormat ?? "square_1_1",
        ...patch
      };
      const transitionMotion = mapCardTransitionToMotion(nextCardNews.transitionStyle);
      const subtitlePatch = patch.layoutPreset
        ? getCardLayoutSubtitlePreset(nextCardNews.layoutPreset)
        : {};
      return {
        ...current,
        scenes: current.scenes.map((scene) =>
          scene.sceneNo > 1 ? { ...scene, motion: transitionMotion } : scene
        ),
        subtitleStyle: {
          ...current.subtitleStyle,
          ...subtitlePatch
        },
        cardNews: nextCardNews
      };
    });
  };

  const addVideoTextOverlay = (scene: SceneScriptItem) => {
    const overlays = isCardNewsModule ? getSceneVideoTextOverlays(scene) : videoTextLayers;
    const nextIndex = overlays.length;
    const globalStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
    const nextDurationSec = Math.min(
      5,
      Math.max(1, isCardNewsModule ? Number(scene.durationSec || 1) : totalDurationSec - globalStartSec)
    );
    const nextTrackIndex = findAvailableTimelineTrackIndex(
      overlays.map((overlay, index) => ({
        key: `text:${index}`,
        startSec: Math.max(0, Number(overlay.startSec ?? 0) || 0),
        durationSec: Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5),
        trackIndex: Math.max(0, Number(overlay.trackIndex ?? 0) || 0)
      })),
      isCardNewsModule ? 0 : globalStartSec,
      nextDurationSec,
      0
    );
    const nextOverlay: SceneScriptVideoTextOverlay = {
      ...DEFAULT_VIDEO_TEXT_OVERLAY,
      startSec: isCardNewsModule ? 0 : globalStartSec,
      durationSec: nextDurationSec,
      text: DEFAULT_VIDEO_TEXT_OVERLAY.text,
      xPct: Math.min(65, DEFAULT_VIDEO_TEXT_OVERLAY.xPct + nextTrackIndex * 3),
      yPct: Math.min(68, DEFAULT_VIDEO_TEXT_OVERLAY.yPct + nextTrackIndex * 4),
      trackIndex: nextTrackIndex
    };
    const nextOverlays = [...overlays, nextOverlay];
    if (isCardNewsModule) {
      updateScene(scene.sceneNo, {
        videoTextOverlay: nextOverlays[0],
        videoTextOverlays: nextOverlays
      });
    } else {
      applyDocumentUpdate((current) => ({
        ...current,
        videoTextOverlays: nextOverlays
      }));
    }
    setSelectedVideoTextIndex(nextIndex);
    setSelectedTimelineTarget("text");
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineItems([{ kind: "text", index: nextIndex }]);
    setEditorTab("text");
  };

  const updateVideoTextOverlay = (
    sceneNo: number,
    patch: Partial<SceneScriptVideoTextOverlay>,
    overlayIndex = selectedVideoTextIndex,
    options?: { recordHistory?: boolean }
  ) => {
    if (!isCardNewsModule) {
      applyDocumentUpdate((current) => {
        const overlays = current.videoTextOverlays ?? [];
        const safeIndex = Math.max(0, Math.min(overlayIndex, Math.max(0, overlays.length - 1)));
        const base = overlays.length > 0 ? overlays : [{ ...DEFAULT_VIDEO_TEXT_OVERLAY, startSec: timelineTimeSecRef.current }];
        return {
          ...current,
          videoTextOverlays: base.map((overlay, index) =>
            index === safeIndex
              ? {
                  ...DEFAULT_VIDEO_TEXT_OVERLAY,
                  ...overlay,
                  ...patch
                }
              : overlay
          )
        };
      }, options);
      return;
    }
    applyDocumentUpdate((current) => {
      const scenes = current.scenes.map((scene) => {
        if (scene.sceneNo !== sceneNo) {
          return scene;
        }
        const overlays = getSceneVideoTextOverlays(scene);
        const safeIndex = Math.max(0, Math.min(overlayIndex, Math.max(0, overlays.length - 1)));
        const base = overlays.length > 0 ? overlays : [{ ...DEFAULT_VIDEO_TEXT_OVERLAY }];
        const nextOverlays = base.map((overlay, index) =>
          index === safeIndex
            ? {
                ...DEFAULT_VIDEO_TEXT_OVERLAY,
                ...overlay,
                ...patch
              }
            : overlay
        );
        return {
          ...scene,
          videoTextOverlay: nextOverlays[0],
          videoTextOverlays: nextOverlays
        };
      });
      return { ...current, scenes };
    }, options);
  };

  const removeVideoTextOverlay = (sceneNo: number, overlayIndex = selectedVideoTextIndex) => {
    if (!isCardNewsModule) {
      applyDocumentUpdate((current) => ({
        ...current,
        videoTextOverlays: (current.videoTextOverlays ?? []).filter((_, index) => index !== overlayIndex)
      }));
      setSelectedVideoTextIndex(Math.max(0, overlayIndex - 1));
      setSelectedTimelineTarget(null);
      setEditingVideoText(null);
      return;
    }
    applyDocumentUpdate((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => {
        if (scene.sceneNo !== sceneNo) {
          return scene;
        }
        const nextOverlays = getSceneVideoTextOverlays(scene).filter((_, index) => index !== overlayIndex);
        return {
          ...scene,
          videoTextOverlay: nextOverlays[0],
          videoTextOverlays: nextOverlays
        };
      })
    }));
    setSelectedVideoTextIndex(Math.max(0, overlayIndex - 1));
    setSelectedTimelineTarget(null);
    setEditingVideoText(null);
  };

  const deleteSelectedTimelineElement = () => {
    if (selectedTimelineItems.length > 1) {
      const selectedKeys = new Set(selectedTimelineItems.map(getTimelineSelectionKey));
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: (current.audioLayers ?? []).filter((layer) => !selectedKeys.has(`audio:${layer.id}`)),
        videoMediaLayers: (current.videoMediaLayers ?? []).filter((layer) => !selectedKeys.has(`media:${layer.id}`)),
        videoTextOverlays: (current.videoTextOverlays ?? []).filter((_, index) => !selectedKeys.has(`text:${index}`))
      }));
      setSelectedTimelineItems([]);
      setSelectedAudioLayerId(null);
      setSelectedVideoMediaLayerId(null);
      setSelectedTimelineTarget(null);
      return true;
    }
    if (selectedTimelineTarget === "audio" && selectedAudioLayerId) {
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: (current.audioLayers ?? []).filter((layer) => layer.id !== selectedAudioLayerId)
      }));
      setSelectedAudioLayerId(null);
      setSelectedTimelineTarget(null);
      return true;
    }
    if (selectedTimelineTarget === "media" && selectedVideoMediaLayerId) {
      applyDocumentUpdate((current) => ({
        ...current,
        videoMediaLayers: (current.videoMediaLayers ?? []).filter((layer) => layer.id !== selectedVideoMediaLayerId)
      }));
      setSelectedVideoMediaLayerId(null);
      setSelectedTimelineTarget(null);
      return true;
    }
    if (selectedTimelineTarget === "text" && selectedScene && selectedVideoTextOverlays.length > 0) {
      removeVideoTextOverlay(selectedScene.sceneNo, selectedVideoTextIndex);
      return true;
    }
    if (selectedTimelineTarget === "scene" && selectedScene) {
      return removeSceneAtTimeline(selectedScene.sceneNo);
    }
    return false;
  };

  const copySelectedTimelineElement = () => {
    if (selectedTimelineTarget === "audio" && selectedAudioLayer) {
      timelineClipboardRef.current = { kind: "audio", layer: { ...selectedAudioLayer } };
      void navigator.clipboard?.writeText(TIMELINE_CLIPBOARD_MARKER).catch(() => undefined);
      setMessage(isKorean ? "음성 레이어를 복사했습니다." : "Copied voice layer.");
      return true;
    }
    if (selectedTimelineTarget === "media" && selectedVideoMediaLayer) {
      timelineClipboardRef.current = { kind: "media", layer: { ...selectedVideoMediaLayer } };
      void navigator.clipboard?.writeText(TIMELINE_CLIPBOARD_MARKER).catch(() => undefined);
      setMessage(isKorean ? "미디어 레이어를 복사했습니다." : "Copied media layer.");
      return true;
    }
    if (selectedTimelineTarget === "text" && selectedVideoTextOverlay) {
      timelineClipboardRef.current = { kind: "text", overlay: { ...selectedVideoTextOverlay } };
      void navigator.clipboard?.writeText(TIMELINE_CLIPBOARD_MARKER).catch(() => undefined);
      setMessage(isKorean ? "텍스트 레이어를 복사했습니다." : "Copied text layer.");
      return true;
    }
    return false;
  };

  const pasteTimelineElement = () => {
    const item = timelineClipboardRef.current;
    if (!item || !editableDocumentRef.current) {
      return false;
    }
    const pasteOffsetPct = 3;
    const offsetTextOverlay = (overlay: SceneScriptVideoTextOverlay): SceneScriptVideoTextOverlay => ({
      ...overlay,
      xPct: Math.max(0, Math.min(100 - Number(overlay.widthPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.widthPct), Number(overlay.xPct ?? 0) + pasteOffsetPct)),
      yPct: Math.max(0, Math.min(100 - Number(overlay.heightPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.heightPct), Number(overlay.yPct ?? 0) + pasteOffsetPct)),
      trackIndex: Math.max(0, Number(overlay.trackIndex ?? 0) || 0) + 1
    });
    if (item.kind === "audio") {
      const nextLayer: SceneScriptAudioLayer = {
        ...item.layer,
        id: buildLayerId("voice"),
        trackIndex: Math.max(0, Number(item.layer.trackIndex ?? 0) || 0) + 1
      };
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: [...(current.audioLayers ?? []), nextLayer]
      }));
      selectOnlyTimelineItem({ kind: "audio", id: nextLayer.id });
      return true;
    }
    if (item.kind === "media") {
      const nextLayer: SceneScriptVideoMediaLayer = {
        ...item.layer,
        id: buildLayerId("media"),
        xPct: Math.max(VIDEO_MEDIA_OVERFLOW_MIN_PCT, Math.min(VIDEO_MEDIA_OVERFLOW_MAX_PCT, Number(item.layer.xPct ?? 50) + pasteOffsetPct)),
        yPct: Math.max(VIDEO_MEDIA_OVERFLOW_MIN_PCT, Math.min(VIDEO_MEDIA_OVERFLOW_MAX_PCT, Number(item.layer.yPct ?? 50) + pasteOffsetPct)),
        trackIndex: Math.max(0, Number(item.layer.trackIndex ?? 0) || 0) + 1
      };
      applyDocumentUpdate((current) => ({
        ...current,
        videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer]
      }));
      selectOnlyTimelineItem({ kind: "media", id: nextLayer.id });
      return true;
    }

    let nextOverlayIndex = 0;
    if (!isCardNewsModule) {
      const nextOverlay = offsetTextOverlay(item.overlay);
      applyDocumentUpdate((current) => {
        const overlays = current.videoTextOverlays ?? [];
        nextOverlayIndex = overlays.length;
        return {
          ...current,
          videoTextOverlays: [...overlays, nextOverlay]
        };
      });
      setSelectedVideoTextIndex(nextOverlayIndex);
      setSelectedAudioLayerId(null);
      setSelectedVideoMediaLayerId(null);
      setSelectedTimelineTarget("text");
      selectOnlyTimelineItem({ kind: "text", index: nextOverlayIndex });
      return true;
    }

    const targetScene = selectedScene ?? editableDocumentRef.current.scenes[0];
    if (!targetScene) {
      return false;
    }
    applyDocumentUpdate((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => {
        if (scene.sceneNo !== targetScene.sceneNo) {
          return scene;
        }
        const overlays = getSceneVideoTextOverlays(scene);
        nextOverlayIndex = overlays.length;
        const nextOverlays = [
          ...overlays,
          offsetTextOverlay(item.overlay)
        ];
        return {
          ...scene,
          videoTextOverlay: nextOverlays[0],
          videoTextOverlays: nextOverlays
        };
      })
    }));
    setSelectedSceneNo(targetScene.sceneNo);
    setSelectedVideoTextIndex(nextOverlayIndex);
    setSelectedAudioLayerId(null);
    setSelectedVideoMediaLayerId(null);
    setSelectedTimelineTarget("text");
    selectOnlyTimelineItem({ kind: "text", index: nextOverlayIndex });
    return true;
  };

  const splitSelectedSceneAtPlayhead = () => {
    if (!selectedScene) {
      return false;
    }
    const splitSec = roundTimelineSeconds(timelineTimeSecRef.current);
    const segment = timelineSegmentsRef.current.find((item) => item.scene.sceneNo === selectedScene.sceneNo);
    if (!segment) {
      return false;
    }
    if (splitSec <= segment.startSec + 0.1 || splitSec >= segment.endSec - 0.1) {
      setMessage(isKorean ? "재생 위치가 선택한 씬 안쪽에 있어야 씬을 자를 수 있습니다." : "Move the playhead inside the selected scene to split it.");
      return false;
    }

    const splitLocalSec = roundTimelineSeconds(splitSec - segment.startSec, 0.5);
    const leftDurationSec = roundTimelineSeconds(splitLocalSec, 1);
    const rightDurationSec = roundTimelineSeconds(segment.endSec - splitSec, 1);

    applyDocumentUpdate((current) => {
      const scenes = renumberScenes(
        current.scenes.flatMap((scene) => {
          if (scene.sceneNo !== selectedScene.sceneNo) {
            return [scene];
          }
          const leftScene: SceneScriptItem = {
            ...scene,
            durationSec: leftDurationSec
          };
          const rightScene: SceneScriptItem = {
            ...scene,
            durationSec: rightDurationSec,
            text: "",
            videoTextOverlay: undefined,
            videoTextOverlays: []
          };
          return [leftScene, rightScene];
        })
      );
      return {
        ...current,
        scenes,
        targetDurationSec: Math.max(
          1,
          Math.round(scenes.reduce((total, scene) => total + Number(scene.durationSec || 0), 0))
        )
      };
    });
    setSelectedSceneNo(selectedScene.sceneNo + 1);
    setSelectedVideoTextIndex(0);
    setSelectedTimelineTarget("scene");
    seekTimeline(splitSec);
    return true;
  };

  const splitSelectedTimelineElement = () => {
    const splitSec = roundTimelineSeconds(timelineTimeSecRef.current);
    if (selectedTimelineTarget === "audio" && selectedAudioLayer) {
      const startSec = Math.max(0, Number(selectedAudioLayer.startSec || 0));
      const durationSec = Math.max(0.5, Number(selectedAudioLayer.durationSec || 0.5));
      const endSec = startSec + durationSec;
      if (splitSec <= startSec + 0.1 || splitSec >= endSec - 0.1) {
        setMessage(isKorean ? "재생 위치가 선택한 음성 요소 안에 있어야 분할됩니다." : "Move the playhead inside the selected voice clip to split.");
        return false;
      }
      const leftDurationSec = roundTimelineSeconds(splitSec - startSec, 0.5);
      const rightDurationSec = roundTimelineSeconds(endSec - splitSec, 0.5);
      const sourceOffsetSec = Math.max(0, Number(selectedAudioLayer.sourceOffsetSec ?? 0) || 0);
      const nextLayer: SceneScriptAudioLayer = {
        ...selectedAudioLayer,
        id: buildLayerId("voice"),
        startSec: splitSec,
        durationSec: rightDurationSec,
        sourceOffsetSec: roundTimelineSeconds(sourceOffsetSec + leftDurationSec)
      };
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: (current.audioLayers ?? []).flatMap((layer) =>
          layer.id === selectedAudioLayer.id
            ? [{ ...layer, durationSec: leftDurationSec, sourceOffsetSec }, nextLayer]
            : [layer]
        )
      }));
      setSelectedAudioLayerId(nextLayer.id);
      setSelectedVideoMediaLayerId(null);
      setSelectedTimelineTarget("audio");
      return true;
    }
    if (selectedTimelineTarget === "media" && selectedVideoMediaLayer) {
      const startSec = Math.max(0, Number(selectedVideoMediaLayer.startSec || 0));
      const durationSec = Math.max(0.5, Number(selectedVideoMediaLayer.durationSec || 0.5));
      const endSec = startSec + durationSec;
      if (splitSec <= startSec + 0.1 || splitSec >= endSec - 0.1) {
        setMessage(isKorean ? "재생 위치가 선택한 미디어 요소 안에 있어야 분할됩니다." : "Move the playhead inside the selected media clip to split.");
        return false;
      }
      const leftDurationSec = roundTimelineSeconds(splitSec - startSec, 0.5);
      const rightDurationSec = roundTimelineSeconds(endSec - splitSec, 0.5);
      const sourceOffsetSec = Math.max(0, Number(selectedVideoMediaLayer.sourceOffsetSec ?? 0) || 0);
      const nextLayer: SceneScriptVideoMediaLayer = {
        ...selectedVideoMediaLayer,
        id: buildLayerId("media"),
        startSec: splitSec,
        durationSec: rightDurationSec,
        sourceOffsetSec: roundTimelineSeconds(sourceOffsetSec + leftDurationSec)
      };
      applyDocumentUpdate((current) => ({
        ...current,
        videoMediaLayers: (current.videoMediaLayers ?? []).flatMap((layer) =>
          layer.id === selectedVideoMediaLayer.id
            ? [{ ...layer, durationSec: leftDurationSec, sourceOffsetSec }, nextLayer]
            : [layer]
        )
      }));
      selectOnlyTimelineItem({ kind: "media", id: nextLayer.id });
      return true;
    }
    if (selectedTimelineTarget === "text" && selectedScene && selectedVideoTextOverlay) {
      if (!isCardNewsModule) {
        const overlayStartSec = Math.max(0, Number(selectedVideoTextOverlay.startSec ?? 0) || 0);
        const overlayDurationSec = Math.max(0.5, Number(selectedVideoTextOverlay.durationSec ?? 0.5) || 0.5);
        const overlayEndSec = overlayStartSec + overlayDurationSec;
        if (splitSec <= overlayStartSec + 0.1 || splitSec >= overlayEndSec - 0.1) {
          setMessage(isKorean ? "재생 위치가 선택한 텍스트 요소 안에 있어야 분할됩니다." : "Move the playhead inside the selected text clip to split.");
          return false;
        }
        const leftDurationSec = roundTimelineSeconds(splitSec - overlayStartSec, 0.5);
        const rightDurationSec = roundTimelineSeconds(overlayEndSec - splitSec, 0.5);
        const rightOverlay: SceneScriptVideoTextOverlay = {
          ...selectedVideoTextOverlay,
          startSec: splitSec,
          durationSec: rightDurationSec
        };
        applyDocumentUpdate((current) => ({
          ...current,
          videoTextOverlays: (current.videoTextOverlays ?? []).flatMap((overlay, index) =>
            index === selectedVideoTextIndex
              ? [{ ...overlay, durationSec: leftDurationSec }, rightOverlay]
              : [overlay]
          )
        }));
        selectOnlyTimelineItem({ kind: "text", index: selectedVideoTextIndex + 1 });
        return true;
      }
      const segment = timelineSegmentsRef.current.find((item) => item.scene.sceneNo === selectedScene.sceneNo);
      if (!segment) {
        return false;
      }
      const overlayStartSec = segment.startSec + Math.max(0, Number(selectedVideoTextOverlay.startSec ?? 0) || 0);
      const overlayDurationSec = Math.max(0.5, Number(selectedVideoTextOverlay.durationSec ?? selectedScene.durationSec) || 0.5);
      const overlayEndSec = overlayStartSec + overlayDurationSec;
      if (splitSec <= overlayStartSec + 0.1 || splitSec >= overlayEndSec - 0.1) {
        setMessage(isKorean ? "재생 위치가 선택한 텍스트 요소 안에 있어야 분할됩니다." : "Move the playhead inside the selected text clip to split.");
        return false;
      }
      const leftDurationSec = roundTimelineSeconds(splitSec - overlayStartSec, 0.5);
      const rightDurationSec = roundTimelineSeconds(overlayEndSec - splitSec, 0.5);
      const rightOverlay: SceneScriptVideoTextOverlay = {
        ...selectedVideoTextOverlay,
        startSec: roundTimelineSeconds(splitSec - segment.startSec),
        durationSec: rightDurationSec
      };
      applyDocumentUpdate((current) => ({
        ...current,
        scenes: current.scenes.map((scene) => {
          if (scene.sceneNo !== selectedScene.sceneNo) {
            return scene;
          }
          const overlays = getSceneVideoTextOverlays(scene);
          const nextOverlays = overlays.flatMap((overlay, index) =>
            index === selectedVideoTextIndex
              ? [{ ...overlay, durationSec: leftDurationSec }, rightOverlay]
              : [overlay]
          );
          return {
            ...scene,
            videoTextOverlay: nextOverlays[0],
            videoTextOverlays: nextOverlays
          };
        })
      }));
      selectOnlyTimelineItem({ kind: "text", index: selectedVideoTextIndex + 1 });
      return true;
    }
    if (selectedTimelineTarget === "scene") {
      return splitSelectedSceneAtPlayhead();
    }
    return false;
  };

  const removeSceneAtTimeline = (sceneNo: number) => {
    const segment = timelineSegmentsRef.current.find((item) => item.scene.sceneNo === sceneNo);
    const current = editableDocumentRef.current;
    if (!segment || !current || current.scenes.length <= 1) {
      setMessage(isKorean ? "씬은 최소 1개 이상 필요합니다." : "At least one scene is required.");
      return false;
    }
    const removeStartSec = segment.startSec;
    applyDocumentUpdate((document) => {
      const segmentBySceneNo = new Map(timelineSegmentsRef.current.map((item) => [item.scene.sceneNo, item]));
      const scenes = renumberScenes(
        document.scenes
          .filter((scene) => scene.sceneNo !== sceneNo)
          .map((scene) => ({
            ...scene,
            startSec: roundTimelineSeconds(segmentBySceneNo.get(scene.sceneNo)?.startSec ?? getSceneStartSec(scene, 0))
          }))
      );
      const nextTargetDurationSec = Math.max(
        1,
        Math.round(
          Math.max(
            document.targetDurationSec ?? 0,
            ...scenes.map((scene) => Math.max(0, Number(scene.startSec ?? 0)) + Math.max(1, Number(scene.durationSec || 1))),
            ...(document.videoMediaLayers ?? []).map(
              (layer) => Math.max(0, Number(layer.startSec || 0)) + Math.max(0.5, Number(layer.durationSec || 0.5))
            ),
            ...(document.audioLayers ?? []).map(
              (layer) => Math.max(0, Number(layer.startSec || 0)) + Math.max(0.5, Number(layer.durationSec || 0.5))
            ),
            ...(document.videoTextOverlays ?? []).map(
              (overlay) =>
                Math.max(0, Number(overlay.startSec ?? 0) || 0) + Math.max(0.5, Number(overlay.durationSec ?? 0.5) || 0.5)
            )
          )
        )
      );
      return {
        ...document,
        scenes,
        targetDurationSec: nextTargetDurationSec
      };
    });
    const nextSceneNo = Math.min(sceneNo, current.scenes.length - 1);
    setSelectedSceneNo(Math.max(1, nextSceneNo));
    setSelectedVideoTextIndex(0);
    setSelectedTimelineTarget("scene");
    setSelectedTimelineItems([]);
    seekTimeline(removeStartSec);
    return true;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isCardNewsModule || editingVideoText || editingPreviewBox || !selectedScene) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTextEditable = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "z") {
        if (isTextEditable) {
          return;
        }
        event.preventDefault();
        if (event.shiftKey) {
          redoDocumentChange();
        } else {
          undoDocumentChange();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "y") {
        if (isTextEditable) {
          return;
        }
        event.preventDefault();
        redoDocumentChange();
        return;
      }

      if (isTextEditable) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          if (nudgeSelectedTimelineTracks(event.key === "ArrowUp" ? -1 : 1)) {
            event.preventDefault();
          }
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          if (snapSelectedTimelineItemsToNeighbor(event.key === "ArrowLeft" ? -1 : 1)) {
            event.preventDefault();
          }
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && key === "c") {
        if (copySelectedTimelineElement()) {
          event.preventDefault();
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "s") {
        if (splitSelectedTimelineElement()) {
          event.preventDefault();
          setMessage(isKorean ? "선택한 요소를 재생 위치에서 분할했습니다." : "Split selected element at playhead.");
        }
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && deleteSelectedTimelineElement()) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingPreviewBox,
    editingVideoText,
    isCardNewsModule,
    isKorean,
    redoDocumentChange,
    selectedAudioLayer,
    selectedAudioLayerId,
    selectedScene,
    selectedTimelineTarget,
    selectedVideoMediaLayer,
    selectedVideoMediaLayerId,
    selectedVideoTextIndex,
    selectedVideoTextOverlay,
    selectedVideoTextOverlays.length,
    undoDocumentChange
  ]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isCardNewsModule || editingVideoText || editingPreviewBox) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTextEditable = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      if (isTextEditable || !event.clipboardData) {
        return;
      }
      const hasClipboardImage =
        Array.from(event.clipboardData.items ?? []).some(
          (item) => item.kind === "file" && item.type.startsWith("image/")
        ) || Array.from(event.clipboardData.files ?? []).some((file) => file.type.startsWith("image/"));
      if (!hasClipboardImage) {
        const markerText = event.clipboardData.getData("text/plain");
        if (markerText === TIMELINE_CLIPBOARD_MARKER && pasteTimelineElement()) {
          event.preventDefault();
        }
        return;
      }
      event.preventDefault();
      void addClipboardImagesAsVideoLayers(event.clipboardData);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    editingPreviewBox,
    editingVideoText,
    isCardNewsModule,
    resolvedPackagePath,
    totalDurationSec,
    videoMediaTrackCount
  ]);

  const beginVideoTextDrag = (
    event: ReactMouseEvent<HTMLElement>,
    scene: SceneScriptItem,
    overlayIndex: number,
    mode: "move" | "resize" = "move",
    handle?: CanvasResizeHandle
  ) => {
    const overlay = isCardNewsModule ? getSceneVideoTextOverlays(scene)[overlayIndex] : videoTextLayers[overlayIndex];
    if (!overlay || event.button !== 0 || editingVideoText?.sceneNo === scene.sceneNo) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedVideoTextIndex(overlayIndex);
    setSelectedVideoMediaLayerId(null);
    setSelectedAudioLayerId(null);
    setSelectedTimelineTarget("text");
    seekTimelineItemCenter({ kind: "text", index: overlayIndex });
    beginGroupedDocumentChange();
    setVideoTextDrag({
      sceneNo: scene.sceneNo,
      overlayIndex,
      mode,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXPct: overlay.xPct,
      startYPct: overlay.yPct,
      startWidthPct: overlay.widthPct,
      startHeightPct: overlay.heightPct
    });
  };

  const applyStylePreset = (presetId: string) => {
    const preset = sceneStylePresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    applyDocumentUpdate((current) => ({
      ...current,
      subtitleStyle: { ...preset.subtitleStyle },
      voiceProfile: { ...preset.voiceProfile }
    }));
    void saveWorkflowConfig({ createSceneStylePresetId: presetId });
  };

  const handleSave = async () => {
    if (!editableDocument) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await flushActivePreviewTextEdit();
      const latestDocument = editableDocumentRef.current ?? editableDocument;
      await saveSceneScript(latestDocument);
      setMessage(copy.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraft = async (saveReason: "manual" | "autosave" = "manual", showMessage = true) => {
    const latestDocument = editableDocumentRef.current ?? editableDocument;
    if (!latestDocument || !resolvedPackagePath) {
      return undefined;
    }
    setDraftStatus((current) => ({ ...current, state: "saving", error: undefined }));
    try {
      if (saveReason === "manual") {
        await flushActivePreviewTextEdit();
      }
      const documentToSave = cloneSceneScriptDocument(editableDocumentRef.current ?? latestDocument);
      const draft = await saveEditorDraft(documentToSave, saveReason, resolvedPackagePath);
      lastAutosavedDocumentRef.current = JSON.stringify(documentToSave);
      setDraftStatus({ state: "saved", savedAt: draft.savedAt, saveReason: draft.saveReason });
      if (showMessage) {
        setMessage(
          isKorean
            ? `작업 초안을 저장했습니다: ${new Date(draft.savedAt).toLocaleTimeString()}`
            : `Saved editor draft: ${new Date(draft.savedAt).toLocaleTimeString()}`
        );
      }
      return draft;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : isKorean
            ? "작업 초안 저장에 실패했습니다."
            : "Failed to save editor draft.";
      setDraftStatus({ state: "error", error: errorMessage });
      if (showMessage) {
        setMessage(errorMessage);
      }
      return undefined;
    }
  };

  const handleLoadDraft = async () => {
    if (!resolvedPackagePath) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const draft = await inspectEditorDraft(resolvedPackagePath);
      if (!draft?.document) {
        setMessage(isKorean ? "저장된 작업 초안이 없습니다." : "No saved editor draft was found.");
        return;
      }
      const nextDocument = isCardNewsModule
        ? cloneSceneScriptDocument(draft.document)
        : migrateLegacyPlaybackRateDurations(migrateSceneTextOverlaysToTimeline(draft.document));
      editableDocumentRef.current = nextDocument;
      setEditableDocument(nextDocument);
      setUndoStack([]);
      setRedoStack([]);
      lastAutosavedDocumentRef.current = JSON.stringify(nextDocument);
      setDraftStatus({ state: "saved", savedAt: draft.savedAt, saveReason: draft.saveReason });
      setMessage(
        isKorean
          ? `작업 초안을 불러왔습니다: ${new Date(draft.savedAt).toLocaleString()}`
          : `Loaded editor draft: ${new Date(draft.savedAt).toLocaleString()}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "작업 초안 불러오기에 실패했습니다."
            : "Failed to load editor draft."
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!editableDocument || !resolvedPackagePath || !autosaveHydratedRef.current) {
      return;
    }
    const serializedDocument = JSON.stringify(editableDocument);
    if (!serializedDocument || serializedDocument === lastAutosavedDocumentRef.current) {
      return;
    }
    const autosaveTimer = window.setTimeout(() => {
      const latestDocument = editableDocumentRef.current;
      if (!latestDocument || !resolvedPackagePath) {
        return;
      }
      const latestSerializedDocument = JSON.stringify(latestDocument);
      if (latestSerializedDocument === lastAutosavedDocumentRef.current) {
        return;
      }
      void handleSaveDraft("autosave", false);
    }, 3500);
    return () => window.clearTimeout(autosaveTimer);
  }, [editableDocument, isCardNewsModule, resolvedPackagePath]);

  const handleChooseCardNewsCoverImage = async () => {
    const selectedPath = await pickCreateBackgroundFile();
    if (!selectedPath) {
      return;
    }
    updateCardNewsOptions({ coverImagePath: selectedPath, coverSource: "manual_upload" });
  };

  const handleChooseCardNewsTemplateImage = async () => {
    const selectedPath = await pickCreateBackgroundFile();
    if (!selectedPath) {
      return;
    }
    updateCardNewsOptions({ templateBackgroundPath: selectedPath });
  };

  const handleRegisterCardNewsTemplate = async () => {
    setBusy(true);
    setMessage("");
    try {
      await registerCardNewsTemplate();
      setMessage(
        isKorean
          ? "템플릿 저장소에 이미지가 등록되었습니다."
          : "Template image was registered in your library."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "템플릿 등록에 실패했습니다."
            : "Failed to register template."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCardNewsTemplate = async (templateId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await deleteCardNewsTemplate(templateId);
      setMessage(
        isKorean
          ? "템플릿 저장소에서 삭제했습니다."
          : "Template was removed from your library."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "템플릿 삭제에 실패했습니다."
            : "Failed to delete template."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSearchPixabayAssets = async (mediaType: "video" | "image" = "video") => {
    const apiKey = pixabayApiKeyDraft.trim();
    const query = pixabayQuery.trim() || selectedScene?.assetSearchQuery?.trim() || "";
    setPixabayBusy(true);
    setMessage("");
    try {
      if (apiKey !== (workflowConfig?.pixabayApiKey ?? "")) {
        await saveWorkflowConfig({ pixabayApiKey: apiKey });
      }
      const results = await searchPixabayAssets({
        apiKey,
        query,
        mediaType,
        perPage: 12
      });
      setPixabayMediaType(mediaType);
      setPixabayResults(results);
      setPixabayQuery(query);
      setMessage(
        results.length > 0
          ? isKorean
            ? `Pixabay에서 ${results.length}개 ${mediaType === "video" ? "영상" : "이미지"} 소재를 찾았습니다.`
            : `Found ${results.length} Pixabay ${mediaType} assets.`
          : isKorean
            ? "검색 결과가 없습니다. 다른 키워드를 시도해 주세요."
            : "No results. Try another keyword."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "Pixabay 검색에 실패했습니다."
            : "Pixabay search failed."
      );
    } finally {
      setPixabayBusy(false);
    }
  };

  const handleApplyPixabayAsset = async (asset: PixabayAssetResult) => {
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "선택된 패키지가 없습니다." : "No package selected.");
      return;
    }
    setPixabayBusy(true);
    setMessage("");
    try {
      const result = await importPixabayAsset({
        packagePath: resolvedPackagePath,
        asset,
        applyToScene: false
      });
      const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
      const layerDurationSec = Math.min(
        Math.max(0.5, Number(asset.durationSec ?? 5) || 5),
        Math.max(0.5, totalDurationSec - layerStartSec)
      );
      const initialBox = buildInitialMediaLayerBox(asset.width, asset.height, selectedVideoCanvasPreset);
      const nextLayer: SceneScriptVideoMediaLayer = {
        id: buildLayerId("media"),
        mediaType: asset.mediaType,
        source: "pixabay",
        label: asset.title || asset.tags || `${asset.mediaType} asset`,
        localPath: result.localPath,
        relativePath: result.relativePath,
        sourceUrl: asset.sourceUrl || asset.downloadUrl,
        previewUrl: asset.previewUrl,
        startSec: layerStartSec,
        durationSec: layerDurationSec,
        trackIndex: 0,
        fit: "cover",
        opacity: 1,
        xPct: 50,
        yPct: 50,
        widthPct: initialBox.widthPct,
        heightPct: initialBox.heightPct,
        naturalWidth: asset.width,
        naturalHeight: asset.height,
        mediaMetadata: {
          width: asset.width,
          height: asset.height,
          durationSec: asset.durationSec,
          hasAudio: asset.mediaType === "video" ? undefined : false
        },
        volume: asset.mediaType === "video" ? 1 : undefined
      };
      applyDocumentUpdate((current) => ({
        ...current,
        videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer],
        scenes: current.scenes
      }));
      setSelectedVideoMediaLayerId(nextLayer.id);
      setSelectedAudioLayerId(null);
      setSelectedTimelineTarget("media");
      setAssetPreviewVersion((current) => current + 1);
      setMessage(
        isKorean
          ? `${formatTimelineSeconds(layerStartSec)} 지점에 소재 레이어를 추가했습니다: ${result.relativePath}`
          : `Added asset as a timeline layer at ${formatTimelineSeconds(layerStartSec)}: ${result.relativePath}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "Pixabay 소재 적용에 실패했습니다."
            : "Failed to apply Pixabay asset."
      );
    } finally {
      setPixabayBusy(false);
    }
  };

  const addClipboardImageAsVideoLayer = async (blob: Blob, fileName = `clipboard-image-${Date.now()}.png`) => {
    if (isCardNewsModule || !editableDocumentRef.current) {
      return false;
    }
    let localPath: string | undefined;
    let relativePath: string | undefined;
    let sourceUrl = URL.createObjectURL(blob);
    try {
      const dimensions = await readImageBlobDimensions(blob).catch(() => ({ width: 0, height: 0 }));
      const initialBox = buildInitialMediaLayerBox(
        dimensions.width,
        dimensions.height,
        selectedVideoCanvasPreset
      );
      if (resolvedPackagePath) {
        const dataUrl = await readBlobAsDataUrl(blob);
        const result = await window.mellowcat.automation.saveAiWorkspaceClipboardAsset({
          packagePath: resolvedPackagePath,
          dataUrl,
          fileName
        });
        localPath = result.localPath;
        relativePath = result.relativePath;
        sourceUrl = toFileUrl(result.localPath);
      }
      const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
      const layerDurationSec = Math.min(5, Math.max(0.5, totalDurationSec - layerStartSec));
      const nextLayer: SceneScriptVideoMediaLayer = {
        id: buildLayerId("media"),
        mediaType: "image",
        source: "manual",
        label: fileName,
        localPath,
        relativePath,
        sourceUrl,
        startSec: layerStartSec,
        durationSec: layerDurationSec,
        trackIndex: videoMediaTrackCount,
        fit: "cover",
        opacity: 1,
        xPct: 50,
        yPct: 50,
        widthPct: initialBox.widthPct,
        heightPct: initialBox.heightPct,
        naturalWidth: dimensions.width || undefined,
        naturalHeight: dimensions.height || undefined,
        mediaMetadata: {
          width: dimensions.width || undefined,
          height: dimensions.height || undefined,
          hasAudio: false
        }
      };
      applyDocumentUpdate((current) => ({
        ...current,
        videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer]
      }));
      selectOnlyTimelineItem({ kind: "media", id: nextLayer.id });
      setSelectedVideoMediaLayerId(nextLayer.id);
      setSelectedAudioLayerId(null);
      setSelectedTimelineTarget("media");
      setAssetPreviewVersion((current) => current + 1);
      setMessage(
        resolvedPackagePath
          ? isKorean
            ? `클립보드 이미지를 원본 비율로 추가했습니다${dimensions.width && dimensions.height ? ` (${dimensions.width}×${dimensions.height})` : ""}.`
            : `Added clipboard image at its original aspect ratio${dimensions.width && dimensions.height ? ` (${dimensions.width}×${dimensions.height})` : ""}.`
          : isKorean
            ? `클립보드 이미지를 임시 요소로 추가했습니다. 저장하려면 패키지 폴더를 선택해 주세요.`
            : `Added clipboard image as a temporary media layer. Choose a package folder to save it.`
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isKorean ? "클립보드 이미지 추가에 실패했습니다." : "Failed to add clipboard image.");
      return false;
    }
  };

  const addClipboardImagesAsVideoLayers = async (data: DataTransfer | null) => {
    if (!data || isCardNewsModule) {
      return false;
    }
    const imageFilesFromItems = Array.from(data.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFilesFromFiles = Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/"));
    const imageFiles = [...imageFilesFromItems, ...imageFilesFromFiles].filter(
      (file, index, files) =>
        files.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size) === index
    );
    if (imageFiles.length === 0) {
      return false;
    }
    setPixabayBusy(true);
    try {
      let addedCount = 0;
      for (const file of imageFiles) {
        const added = await addClipboardImageAsVideoLayer(file, file.name || `clipboard-image-${Date.now()}.png`);
        if (added) {
          addedCount += 1;
        }
      }
      if (addedCount > 1) {
        setMessage(isKorean ? `클립보드 이미지 ${addedCount}개를 요소로 추가했습니다.` : `Added ${addedCount} clipboard images as media layers.`);
      }
      return addedCount > 0;
    } finally {
      setPixabayBusy(false);
    }
  };

  const toggleInlinePreviewPlayback = (assetKey: string, elementId: string) => {
    const element = document.getElementById(elementId) as HTMLMediaElement | null;
    if (!element) {
      return;
    }
    document.querySelectorAll<HTMLMediaElement>(".asset-library-preview-media").forEach((mediaElement) => {
      if (mediaElement !== element) {
        mediaElement.pause();
      }
    });
    if (playingAssetKey === assetKey && !element.paused) {
      element.pause();
      setPlayingAssetKey(null);
      return;
    }
    void element.play().then(() => setPlayingAssetKey(assetKey)).catch(() => undefined);
  };

  const handleDownloadPixabayAsset = async (asset: PixabayAssetResult) => {
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "선택된 패키지가 없습니다." : "No package selected.");
      return;
    }
    setPixabayBusy(true);
    setMessage("");
    try {
      const result = await importPixabayAsset({
        packagePath: resolvedPackagePath,
        asset,
        applyToScene: false
      });
      setMessage(
        isKorean
          ? `소재를 라이브러리에 저장했습니다: ${result.relativePath}`
          : `Downloaded asset to library: ${result.relativePath}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "Pixabay 소재 다운로드에 실패했습니다."
            : "Failed to download Pixabay asset."
      );
    } finally {
      setPixabayBusy(false);
    }
  };

  const handleSearchFreesoundAudio = async () => {
    const apiKey = freesoundApiKeyDraft.trim();
    const query = freesoundQuery.trim() || pixabayQuery.trim() || selectedScene?.assetSearchQuery?.trim() || "";
    setFreesoundBusy(true);
    setMessage("");
    try {
      if (apiKey !== (workflowConfig?.freesoundApiKey ?? "")) {
        await saveWorkflowConfig({ freesoundApiKey: apiKey });
      }
      const results = await searchFreesoundAudio({
        apiKey,
        query,
        perPage: 12
      });
      setFreesoundResults(results);
      setFreesoundQuery(query);
      setMessage(
        isKorean
          ? `Freesound에서 ${results.length}개 오디오를 찾았습니다.`
          : `Found ${results.length} Freesound audio assets.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "Freesound 오디오 검색에 실패했습니다."
            : "Freesound audio search failed."
      );
    } finally {
      setFreesoundBusy(false);
    }
  };

  const handleApplyFreesoundAudio = async (asset: FreesoundAudioResult) => {
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "선택된 패키지가 없습니다." : "No package selected.");
      return;
    }
    setFreesoundBusy(true);
    setMessage("");
    try {
      const result = await importFreesoundAudio({
        packagePath: resolvedPackagePath,
        asset
      });
      const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
      const layerDurationSec = Math.min(
        Math.max(0.5, Number(asset.durationSec ?? 8) || 8),
        Math.max(0.5, totalDurationSec - layerStartSec)
      );
      const nextLayer: SceneScriptAudioLayer = {
        id: buildLayerId("audio"),
        source: "local",
        label: asset.title || "Freesound audio",
        localPath: result.localPath,
        relativePath: result.relativePath,
        startSec: layerStartSec,
        durationSec: layerDurationSec,
        trackIndex: audioTrackCount,
        volume: 0.65
      };
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: [...(current.audioLayers ?? []), nextLayer]
      }));
      selectOnlyTimelineItem({ kind: "audio", id: nextLayer.id });
      setAssetPreviewVersion((current) => current + 1);
      setMessage(
        isKorean
          ? `${formatTimelineSeconds(layerStartSec)} 지점에 Freesound 오디오를 추가했습니다: ${result.relativePath}`
          : `Added Freesound audio at ${formatTimelineSeconds(layerStartSec)}: ${result.relativePath}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "Freesound 오디오 추가에 실패했습니다."
            : "Failed to add Freesound audio."
      );
    } finally {
      setFreesoundBusy(false);
    }
  };

  const handleAddVideoIconLayer = (icon: (typeof VIDEO_ICON_LIBRARY)[number]) => {
    if (!editableDocument) {
      setMessage(isKorean ? "편집할 씬 스크립트가 없습니다." : "No scene script is loaded.");
      return;
    }
    const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
    const nextLayer: SceneScriptVideoMediaLayer = {
      id: buildLayerId("icon"),
      mediaType: "icon",
      source: "manual",
      label: isKorean ? icon.labelKo : icon.labelEn,
      previewUrl: icon.dataUrl,
      startSec: layerStartSec,
      durationSec: Math.min(5, Math.max(0.5, totalDurationSec - layerStartSec)),
      trackIndex: videoMediaTrackCount,
      fit: "contain",
      opacity: 1,
      xPct: 50,
      yPct: 50,
      widthPct: 16,
      heightPct: 16
    };
    applyDocumentUpdate((current) => ({
      ...current,
      videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer]
    }));
    selectOnlyTimelineItem({ kind: "media", id: nextLayer.id });
    setMessage(
      isKorean
        ? `${formatTimelineSeconds(layerStartSec)} 지점에 픽토그램을 추가했습니다.`
        : `Added an icon at ${formatTimelineSeconds(layerStartSec)}.`
    );
  };

  const handleGenerateVoiceLayer = async () => {
    if (!resolvedPackagePath || !editableDocument) {
      setMessage(isKorean ? "선택된 패키지가 없습니다." : "No package selected.");
      return;
    }
    const text = voiceLayerText.trim() || selectedScene?.text.trim() || "";
    if (!text) {
      setMessage(isKorean ? "음성으로 만들 문장을 입력해 주세요." : "Enter text to generate voice.");
      return;
    }
    setVoiceLayerBusy(true);
    setMessage("");
    try {
      const result = await generateVoiceLayer({
        packagePath: resolvedPackagePath,
        text,
        voiceProfile: editableDocument.voiceProfile
      });
      const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
      const durationSec = Math.min(
        Math.max(0.5, Number(result.durationSec ?? 5) || 5),
        Math.max(0.5, totalDurationSec - layerStartSec)
      );
      const nextLayer: SceneScriptAudioLayer = {
        id: buildLayerId("voice"),
        source: "tts",
        label: text.slice(0, 32) || (isKorean ? "AI 음성" : "AI Voice"),
        localPath: result.localPath,
        relativePath: result.relativePath,
        startSec: layerStartSec,
        durationSec,
        trackIndex: audioTrackCount,
        volume: 1
      };
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: [...(current.audioLayers ?? []), nextLayer]
      }));
      selectOnlyTimelineItem({ kind: "audio", id: nextLayer.id });
      setAssetPreviewVersion((current) => current + 1);
      setMessage(
        isKorean
          ? `${formatTimelineSeconds(layerStartSec)} 지점에 음성 레이어를 추가했습니다.`
          : `Added voice layer at ${formatTimelineSeconds(layerStartSec)}.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "음성 생성에 실패했습니다."
            : "Failed to generate voice."
      );
    } finally {
      setVoiceLayerBusy(false);
    }
  };

  const handleImportLocalAsset = async (applyToScene: boolean) => {
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "선택된 패키지가 없습니다." : "No package selected.");
      return;
    }
    setPixabayBusy(true);
    setMessage("");
    try {
      const result = await importLocalAsset({
        packagePath: resolvedPackagePath,
        applyToScene: false
      });
      if (!result) {
        return;
      }
      if (applyToScene) {
        const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
        const layerDurationSec = Math.min(
          Math.max(0.5, Number(result.durationSec ?? 5) || 5),
          Math.max(0.5, totalDurationSec - layerStartSec)
        );
        if (result.mediaType === "audio") {
          const nextLayer: SceneScriptAudioLayer = {
            id: buildLayerId("audio"),
            source: "local",
            label: result.relativePath,
            localPath: result.localPath,
            relativePath: result.relativePath,
            startSec: layerStartSec,
            durationSec: layerDurationSec,
            trackIndex: audioTrackCount,
            volume: 0.8
          };
          applyDocumentUpdate((current) => ({
            ...current,
            audioLayers: [...(current.audioLayers ?? []), nextLayer]
          }));
          selectOnlyTimelineItem({ kind: "audio", id: nextLayer.id });
          setAssetPreviewVersion((current) => current + 1);
          return;
        }
        const nextLayer: SceneScriptVideoMediaLayer = {
          id: buildLayerId("media"),
          mediaType: result.mediaType,
          source: "local",
          label: result.relativePath,
          localPath: result.localPath,
          relativePath: result.relativePath,
          startSec: layerStartSec,
          durationSec: layerDurationSec,
          trackIndex: 0,
          fit: "cover",
          opacity: 1,
          xPct: 50,
          yPct: 50,
          widthPct: 100,
          heightPct: 100,
          naturalWidth: result.width,
          naturalHeight: result.height,
          sourceCrop: result.mediaMetadata?.contentCrop,
          mediaMetadata: result.mediaMetadata ?? {
            width: result.width,
            height: result.height,
            durationSec: result.durationSec,
            hasAudio: result.mediaType === "video" ? undefined : false
          },
          volume: result.mediaType === "video" ? 1 : undefined
        };
        applyDocumentUpdate((current) => ({
          ...current,
          videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer]
        }));
        selectOnlyTimelineItem({ kind: "media", id: nextLayer.id });
        setAssetPreviewVersion((current) => current + 1);
      }
      setMessage(
        applyToScene
          ? isKorean
            ? `${formatTimelineSeconds(timelineTimeSecRef.current)} 지점에 내 파일 레이어를 추가했습니다: ${result.relativePath}`
            : `Added local file as a timeline layer at ${formatTimelineSeconds(timelineTimeSecRef.current)}: ${result.relativePath}`
          : isKorean
            ? `내 파일을 라이브러리에 저장했습니다: ${result.relativePath}`
            : `Saved local file to library: ${result.relativePath}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "내 파일 가져오기에 실패했습니다."
            : "Failed to import local file."
      );
    } finally {
      setPixabayBusy(false);
    }
  };

  const handleApplyUploadedAsset = (asset: UploadedAssetRecord) => {
    if (!editableDocumentRef.current) {
      return;
    }
    const layerStartSec = Math.max(0, Math.min(totalDurationSec - 0.5, timelineTimeSecRef.current));
    const layerDurationSec = Math.min(
      Math.max(0.5, Number(asset.durationSec ?? 5) || 5),
      Math.max(0.5, totalDurationSec - layerStartSec)
    );
    if (asset.mediaType === "audio") {
      const nextLayer: SceneScriptAudioLayer = {
        id: buildLayerId("audio"),
        source: "local",
        label: asset.label,
        localPath: asset.localPath,
        relativePath: asset.relativePath,
        startSec: layerStartSec,
        durationSec: layerDurationSec,
        trackIndex: audioTrackCount,
        volume: 0.8
      };
      applyDocumentUpdate((current) => ({
        ...current,
        audioLayers: [...(current.audioLayers ?? []), nextLayer]
      }));
      selectOnlyTimelineItem({ kind: "audio", id: nextLayer.id });
      setAssetPreviewVersion((current) => current + 1);
      setMessage(isKorean ? `Upload 오디오를 추가했습니다: ${asset.label}` : `Added uploaded audio: ${asset.label}`);
      return;
    }
    const nextLayer: SceneScriptVideoMediaLayer = {
      id: buildLayerId("media"),
      mediaType: asset.mediaType,
      source: "local",
      label: asset.label,
      localPath: asset.localPath,
      relativePath: asset.relativePath,
      startSec: layerStartSec,
      durationSec: layerDurationSec,
      trackIndex: videoMediaTrackCount,
      fit: "cover",
      opacity: 1,
      xPct: 50,
      yPct: 50,
      widthPct: 100,
      heightPct: 100,
      naturalWidth: asset.width,
      naturalHeight: asset.height,
      sourceCrop: asset.mediaMetadata?.contentCrop,
      mediaMetadata: asset.mediaMetadata ?? {
        width: asset.width,
        height: asset.height,
        durationSec: asset.durationSec,
        hasAudio: asset.mediaType === "video" ? undefined : false
      },
      volume: asset.mediaType === "video" ? 1 : undefined
    };
    applyDocumentUpdate((current) => ({
      ...current,
      videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer]
    }));
    selectOnlyTimelineItem({ kind: "media", id: nextLayer.id });
    setSelectedVideoMediaLayerId(nextLayer.id);
    setSelectedAudioLayerId(null);
    setSelectedTimelineTarget("media");
    setAssetPreviewVersion((current) => current + 1);
    setMessage(isKorean ? `Upload 소재를 추가했습니다: ${asset.label}` : `Added uploaded asset: ${asset.label}`);
  };

  const handleDeleteUploadedAsset = async (asset: UploadedAssetRecord) => {
    if (!resolvedPackagePath) {
      return;
    }
    const confirmed = window.confirm(
      isKorean
        ? `업로드 소재를 삭제할까요?\n\n${asset.label}\n\n이미 타임라인에 올린 요소는 별도로 제거해야 합니다.`
        : `Delete this uploaded asset?\n\n${asset.label}\n\nTimeline layers already using it must be removed separately.`
    );
    if (!confirmed) {
      return;
    }
    try {
      setUploadedAssetsBusy(true);
      const nextAssets = await deleteUploadedAsset(resolvedPackagePath, asset);
      setUploadedAssets(nextAssets);
      setMessage(isKorean ? `Upload 소재를 삭제했습니다: ${asset.label}` : `Deleted uploaded asset: ${asset.label}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "Upload 소재 삭제에 실패했습니다."
            : "Failed to delete uploaded asset."
      );
    } finally {
      setUploadedAssetsBusy(false);
    }
  };

  const waitForPreviewStagePaint = async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    const stage = previewStageRef.current;
    const images = Array.from(stage?.querySelectorAll("img") ?? []);
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            const finish = () => resolve();
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
            window.setTimeout(finish, 700);
          })
      )
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };

  const captureCardPreviewImage = async (sceneNo: number): Promise<string | undefined> => {
    if (!editableDocument || !resolvedPackagePath) {
      return undefined;
    }
    setSelectedSceneNo(sceneNo);
    await waitForPreviewStagePaint();
    const stage = previewStageRef.current;
    if (!stage) {
      throw new Error(isKorean ? "프리뷰 스테이지를 찾지 못했습니다." : "Preview stage was not found.");
    }
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      throw new Error(isKorean ? "프리뷰 크기가 올바르지 않습니다." : "Preview bounds are invalid.");
    }
    return captureCardPreviewImageAs(
      sceneNo,
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      resolvedPackagePath
    );
  };

  const handleSaveCardPreviewImageAs = async (sceneNo: number) => {
    if (!editableDocument || !resolvedPackagePath) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await flushActivePreviewTextEdit();
      const savedPath = await captureCardPreviewImage(sceneNo);
      if (savedPath) {
        setMessage(
          isKorean
            ? `${sceneNo}장 카드를 저장했습니다: ${savedPath}`
            : `Saved scene ${sceneNo} preview: ${savedPath}`
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAllCardPreviewImages = async () => {
    const latestDocument = editableDocumentRef.current ?? editableDocument;
    if (!latestDocument || !resolvedPackagePath || latestDocument.scenes.length === 0) {
      return;
    }
    setBusy(true);
    setMessage("");
    const originalSceneNo = selectedSceneNo;
    try {
      await flushActivePreviewTextEdit();
      const savedPaths: string[] = [];
      for (const scene of latestDocument.scenes) {
        const savedPath = await captureCardPreviewImage(scene.sceneNo);
        if (savedPath) {
          savedPaths.push(savedPath);
        }
      }
      setSelectedSceneNo(originalSceneNo);
      await waitForPreviewStagePaint();
      setMessage(
        isKorean
          ? `전체 카드 ${savedPaths.length}개를 저장했습니다.`
          : `Saved ${savedPaths.length} card images.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleExportVideoProject = async () => {
    const latestDocument = editableDocumentRef.current ?? editableDocument;
    if (!latestDocument || !resolvedPackagePath) {
      return;
    }
    setBusy(true);
    setMessage(isKorean ? "영상 MP4를 합성하는 중입니다..." : "Exporting MP4 video...");
    try {
      await flushActivePreviewTextEdit();
      const documentForExport = isCardNewsModule
        ? latestDocument
        : migrateLegacyPlaybackRateDurations(latestDocument);
      const savedDocument = await window.mellowcat.automation.updateSceneScript(
        resolvedPackagePath,
        documentForExport
      );
      setEditableDocument(savedDocument);
      const result = await window.mellowcat.automation.exportVideoEditorProject({
        packagePath: resolvedPackagePath,
        document: savedDocument
      });
      setMessage(
        isKorean
          ? `영상 내보내기가 완료되었습니다: ${result.outputPath}`
          : `Video export finished: ${result.outputPath}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isKorean ? "영상 내보내기에 실패했습니다." : "Video export failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeriveShortformFromLongform = async () => {
    const latestDocument = editableDocumentRef.current ?? editableDocument;
    if (!latestDocument || !resolvedPackagePath) {
      return;
    }
    setBusy(true);
    setMessage(isKorean ? "롱폼에서 9:16 숏폼 초안을 추출하는 중입니다..." : "Deriving a 9:16 short from the longform...");
    try {
      await flushActivePreviewTextEdit();
      const savedDocument = await window.mellowcat.automation.updateSceneScript(
        resolvedPackagePath,
        latestDocument
      );
      setEditableDocument(savedDocument);
      const result = await window.mellowcat.automation.deriveShortformFromLongform({
        packagePath: resolvedPackagePath,
        document: savedDocument,
        maxDurationSec: 89
      });
      await inspectSceneScript(result.packagePath);
      setSelectedSceneNo(result.document.scenes[0]?.sceneNo ?? 1);
      setMessage(
        isKorean
          ? `숏폼 초안 패키지를 만들었습니다: ${result.packagePath}`
          : `Shortform draft package created: ${result.packagePath}`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isKorean ? "숏폼 추출에 실패했습니다." : "Shortform extraction failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoadLatestShortformDraft = async () => {
    if (!resolvedPackagePath) {
      return;
    }
    setBusy(true);
    setMessage(isKorean ? "저장된 숏폼 초안을 찾는 중입니다..." : "Finding saved shortform drafts...");
    try {
      const drafts = await window.mellowcat.automation.listDerivedShortformPackages(resolvedPackagePath);
      const latestDraft = drafts[0];
      if (!latestDraft) {
        setMessage(
          isKorean
            ? "저장된 숏폼 초안이 없습니다. 처음 한 번은 숏폼 추출을 실행해야 합니다."
            : "No saved shortform draft was found. Run Extract Short once first."
        );
        return;
      }

      setSelectedPackagePath(latestDraft.packagePath);
      const editorDraft = await inspectEditorDraft(latestDraft.packagePath);
      const rawDocument =
        editorDraft?.document ??
        (await window.mellowcat.automation.inspectSceneScript(latestDraft.packagePath));
      const nextDocument = migrateLegacyPlaybackRateDurations(
        migrateSceneTextOverlaysToTimeline(rawDocument)
      );
      editableDocumentRef.current = nextDocument;
      setEditableDocument(nextDocument);
      setSelectedSceneNo(nextDocument.scenes[0]?.sceneNo ?? 1);
      setSelectedTimelineTarget(null);
      setSelectedVideoMediaLayerId(null);
      setSelectedAudioLayerId(null);
      setSelectedVideoTextIndex(null);
      setUndoStack([]);
      setRedoStack([]);
      lastAutosavedDocumentRef.current = JSON.stringify(nextDocument);
      if (editorDraft) {
        setDraftStatus({
          state: "saved",
          savedAt: editorDraft.savedAt,
          saveReason: editorDraft.saveReason
        });
      } else {
        setDraftStatus({ state: "idle" });
      }
      setMessage(
        isKorean
          ? `저장된 숏폼 초안을 불러왔습니다: ${latestDraft.packagePath}`
          : `Loaded saved shortform draft: ${latestDraft.packagePath}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : isKorean
            ? "숏폼 초안을 불러오지 못했습니다."
            : "Failed to load the shortform draft."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRepairLegacyVideoLayers = async () => {
    const latestDocument = editableDocumentRef.current ?? editableDocument;
    if (!latestDocument || !resolvedPackagePath) {
      return;
    }
    const migratedLayers = (latestDocument.videoMediaLayers ?? []).map((layer) => {
      if (!hasPercentCrop(layer.crop)) {
        return layer;
      }
      return {
        ...layer,
        sourceCrop: layer.sourceCrop ?? layer.crop,
        frameCrop: layer.frameCrop,
        crop: undefined
      };
    });
    const migratedCount = migratedLayers.filter((layer, index) => layer !== (latestDocument.videoMediaLayers ?? [])[index]).length;
    if (migratedCount === 0) {
      setMessage(isKorean ? "복구할 레거시 영상 crop이 없습니다." : "No legacy video crop data to repair.");
      return;
    }
    const confirmed = window.confirm(
      isKorean
        ? `레거시 영상 요소 ${migratedCount}개를 sourceCrop 구조로 변환할까요?`
        : `Convert ${migratedCount} legacy media layer(s) to sourceCrop?`
    );
    if (!confirmed) {
      return;
    }
    const nextDocument: SceneScriptDocument = {
      ...latestDocument,
      videoMediaLayers: migratedLayers
    };
    setBusy(true);
    setMessage(isKorean ? "레거시 영상 요소를 복구하는 중입니다..." : "Repairing legacy video layers...");
    try {
      const savedDocument = await window.mellowcat.automation.updateSceneScript(
        resolvedPackagePath,
        nextDocument
      );
      setEditableDocument(savedDocument);
      setMessage(
        isKorean
          ? `레거시 영상 요소 ${migratedCount}개를 복구했습니다.`
          : `Repaired ${migratedCount} legacy media layer(s).`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : isKorean ? "레거시 영상 요소 복구에 실패했습니다." : "Legacy media repair failed.");
    } finally {
      setBusy(false);
    }
  };

  const selectedCanvasPosition = (() => {
    const canvasWidth = selectedVideoCanvasPreset.width;
    const canvasHeight = selectedVideoCanvasPreset.height;
    if (!isCardNewsModule && selectedTimelineTarget === "media" && selectedVideoMediaLayer) {
      const box = resolveLayerBox(selectedVideoMediaLayer);
      const width = (canvasWidth * Number(box.widthPct || 0)) / 100;
      const height = (canvasHeight * Number(box.heightPct || 0)) / 100;
      const centerX = (canvasWidth * Number(box.xPct || 0)) / 100;
      const centerY = (canvasHeight * Number(box.yPct || 0)) / 100;
      return {
        kind: "media" as const,
        key: `media:${selectedVideoMediaLayer.id}`,
        label: selectedVideoMediaLayer.label || (selectedVideoMediaLayer.mediaType === "video" ? "Video" : "Media"),
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height
      };
    }
    if (!isCardNewsModule && selectedTimelineTarget === "text" && selectedVideoTextOverlay) {
      return {
        kind: "text" as const,
        key: `text:${selectedVideoTextIndex}`,
        label: isKorean ? "텍스트" : "Text",
        x: (canvasWidth * Number(selectedVideoTextOverlay.xPct || 0)) / 100,
        y: (canvasHeight * Number(selectedVideoTextOverlay.yPct || 0)) / 100,
        width: (canvasWidth * Number(selectedVideoTextOverlay.widthPct || 0)) / 100,
        height: (canvasHeight * Number(selectedVideoTextOverlay.heightPct || 0)) / 100
      };
    }
    return null;
  })();

  const selectedElementTransition =
    selectedCanvasPosition?.kind === "media" && selectedVideoMediaLayer
      ? normalizeElementTransition(selectedVideoMediaLayer.transition)
      : selectedCanvasPosition?.kind === "text" && selectedVideoTextOverlay
        ? normalizeElementTransition(selectedVideoTextOverlay.transition)
        : null;
  const selectedMediaMotion =
    selectedCanvasPosition?.kind === "media" && selectedVideoMediaLayer
      ? normalizeMediaMotion(selectedVideoMediaLayer.motion)
      : null;

  const updateSelectedElementTransition = (patch: Partial<SceneScriptElementTransition>) => {
    if (!selectedCanvasPosition || !selectedElementTransition) {
      return;
    }
    const nextTransition = normalizeElementTransition({
      ...selectedElementTransition,
      ...patch
    });
    if (selectedCanvasPosition.kind === "media" && selectedVideoMediaLayer) {
      updateVideoMediaLayer(selectedVideoMediaLayer.id, { transition: nextTransition });
      return;
    }
    if (selectedCanvasPosition.kind === "text" && selectedScene) {
      updateVideoTextOverlay(0, { transition: nextTransition });
    }
  };

  const updateSelectedMediaMotion = (patch: Partial<SceneScriptVideoMediaMotion>) => {
    if (!selectedVideoMediaLayer || !selectedMediaMotion) {
      return;
    }
    updateVideoMediaLayer(selectedVideoMediaLayer.id, {
      motion: normalizeMediaMotion({
        ...selectedMediaMotion,
        ...patch
      })
    });
  };

  const setMediaMotionFocusFromPoint = (
    layer: SceneScriptVideoMediaLayer,
    event: ReactMouseEvent<HTMLElement>
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const focusXPct = clampNumber(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100);
    const focusYPct = clampNumber(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100);
    updateVideoMediaLayer(layer.id, {
      motion: normalizeMediaMotion({
        ...layer.motion,
        focusXPct: Number(focusXPct.toFixed(1)),
        focusYPct: Number(focusYPct.toFixed(1))
      })
    });
    setPickingMotionFocusLayerId(null);
    setPausedMotionPreviewLayerId(layer.id);
  };

  const updateSelectedCanvasPosition = (
    patch: Partial<Pick<NonNullable<typeof selectedCanvasPosition>, "x" | "y" | "width" | "height">>
  ) => {
    if (!selectedCanvasPosition) {
      return;
    }
    const canvasWidth = selectedVideoCanvasPreset.width;
    const canvasHeight = selectedVideoCanvasPreset.height;
    const next = {
      ...selectedCanvasPosition,
      ...patch
    };
    const width = Math.max(1, Number(next.width) || 1);
    const height = Math.max(1, Number(next.height) || 1);
    const x = Number.isFinite(Number(next.x)) ? Number(next.x) : selectedCanvasPosition.x;
    const y = Number.isFinite(Number(next.y)) ? Number(next.y) : selectedCanvasPosition.y;
    if (selectedCanvasPosition.kind === "media" && selectedVideoMediaLayer) {
      updateVideoMediaLayer(selectedVideoMediaLayer.id, {
        xPct: Number(clampVideoMediaCanvasPct(((x + width / 2) / canvasWidth) * 100).toFixed(2)),
        yPct: Number(clampVideoMediaCanvasPct(((y + height / 2) / canvasHeight) * 100).toFixed(2)),
        widthPct: Number(clampNumber((width / canvasWidth) * 100, 0.1, 500).toFixed(2)),
        heightPct: Number(clampNumber((height / canvasHeight) * 100, 0.1, 500).toFixed(2))
      });
      return;
    }
    if (selectedCanvasPosition.kind === "text" && selectedScene) {
      const widthPct = clampNumber((width / canvasWidth) * 100, 3, 100);
      const heightPct = clampNumber((height / canvasHeight) * 100, 3, 100);
      updateVideoTextOverlay(0, {
        xPct: Number(clampNumber((x / canvasWidth) * 100, 0, 100 - widthPct).toFixed(2)),
        yPct: Number(clampNumber((y / canvasHeight) * 100, 0, 100 - heightPct).toFixed(2)),
        widthPct: Number(widthPct.toFixed(2)),
        heightPct: Number(heightPct.toFixed(2))
      });
    }
  };

  useEffect(() => {
    if (!selectedCanvasPosition) {
      setPositionDraft({});
      setPositionDraftKey("");
      setEditingPositionField(null);
      return;
    }
    if (editingPositionField && positionDraftKey === selectedCanvasPosition.key) {
      return;
    }
    setPositionDraftKey(selectedCanvasPosition.key);
    setPositionDraft({
      x: selectedCanvasPosition.x.toFixed(1),
      y: selectedCanvasPosition.y.toFixed(1),
      width: selectedCanvasPosition.width.toFixed(1),
      height: selectedCanvasPosition.height.toFixed(1)
    });
  }, [
    editingPositionField,
    positionDraftKey,
    selectedCanvasPosition?.height,
    selectedCanvasPosition?.key,
    selectedCanvasPosition?.width,
    selectedCanvasPosition?.x,
    selectedCanvasPosition?.y
  ]);

  const commitPositionDraftField = (field: CanvasPositionField) => {
    if (!selectedCanvasPosition) {
      return;
    }
    const parsed = Number(positionDraft[field]);
    setEditingPositionField(null);
    if (!Number.isFinite(parsed)) {
      setPositionDraft((current) => ({
        ...current,
        [field]: selectedCanvasPosition[field].toFixed(1)
      }));
      return;
    }
    updateSelectedCanvasPosition({ [field]: parsed });
  };

  const applySelectedTextPropertyToAllTextBoxes = (field: CanvasPositionField | "fontSize") => {
    if (
      !selectedCanvasPosition ||
      selectedCanvasPosition.kind !== "text" ||
      !selectedVideoTextOverlay ||
      isCardNewsModule
    ) {
      return;
    }
    const canvasWidth = selectedVideoCanvasPreset.width;
    const canvasHeight = selectedVideoCanvasPreset.height;
    const targetXPct = (selectedCanvasPosition.x / canvasWidth) * 100;
    const targetYPct = (selectedCanvasPosition.y / canvasHeight) * 100;
    const targetWidthPct = clampNumber((selectedCanvasPosition.width / canvasWidth) * 100, 3, 100);
    const targetHeightPct = clampNumber((selectedCanvasPosition.height / canvasHeight) * 100, 3, 100);
    const targetFontSize = clampNumber(Number(selectedVideoTextOverlay.fontSize ?? DEFAULT_VIDEO_TEXT_OVERLAY.fontSize), 8, 180);
    applyDocumentUpdate((current) => ({
      ...current,
      videoTextOverlays: (current.videoTextOverlays ?? []).map((overlay) => {
        const currentWidthPct = clampNumber(Number(overlay.widthPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.widthPct), 3, 100);
        const currentHeightPct = clampNumber(Number(overlay.heightPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.heightPct), 3, 100);
        const nextWidthPct = field === "width" ? targetWidthPct : currentWidthPct;
        const nextHeightPct = field === "height" ? targetHeightPct : currentHeightPct;
        const nextXPct =
          field === "x" || field === "width"
            ? clampNumber(field === "x" ? targetXPct : Number(overlay.xPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.xPct), 0, 100 - nextWidthPct)
            : clampNumber(Number(overlay.xPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.xPct), 0, 100 - nextWidthPct);
        const nextYPct =
          field === "y" || field === "height"
            ? clampNumber(field === "y" ? targetYPct : Number(overlay.yPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.yPct), 0, 100 - nextHeightPct)
            : clampNumber(Number(overlay.yPct ?? DEFAULT_VIDEO_TEXT_OVERLAY.yPct), 0, 100 - nextHeightPct);
        return {
          ...overlay,
          ...(field === "x" || field === "width" ? { xPct: Number(nextXPct.toFixed(2)) } : {}),
          ...(field === "y" || field === "height" ? { yPct: Number(nextYPct.toFixed(2)) } : {}),
          ...(field === "width" ? { widthPct: Number(nextWidthPct.toFixed(2)) } : {}),
          ...(field === "height" ? { heightPct: Number(nextHeightPct.toFixed(2)) } : {}),
          ...(field === "fontSize" ? { fontSize: targetFontSize } : {})
        };
      })
    }));
    const label =
      field === "x"
        ? "X"
        : field === "y"
          ? "Y"
          : field === "width"
            ? isKorean ? "너비" : "Width"
            : field === "height"
              ? isKorean ? "높이" : "Height"
              : isKorean ? "폰트 크기" : "Font size";
    setMessage(
      isKorean
        ? `모든 텍스트 박스에 ${label} 값을 적용했습니다.`
        : `Applied ${label} to all text boxes.`
    );
  };

  return (
    <GenerationErrorBoundary>
    <section className="page generation-page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{moduleCopy.pageTitle}</h2>
          <p className="subtle">{moduleCopy.pageSubtitle}</p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={!resolvedPackagePath || busy}
            onClick={() => void inspectSceneScript(resolvedPackagePath)}
          >
            {copy.reload}
          </button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void handleChoosePackageFolder()}>
            {isKorean ? "패키지 폴더 선택" : "Choose package folder"}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!editableDocument || busy}
            onClick={() => void handleSave()}
          >
            {busy ? copy.saving : copy.save}
          </button>
          {!isCardNewsModule ? (
            <button
              type="button"
              className="secondary-button"
              disabled={!editableDocument || busy}
              onClick={() => void handleRepairLegacyVideoLayers()}
            >
              {isKorean ? "레거시 영상 복구" : "Repair Legacy Video"}
            </button>
          ) : null}
          {!isCardNewsModule ? (
            <button
              type="button"
              className="primary-button"
              disabled={!editableDocument || busy}
              onClick={() => void handleExportVideoProject()}
            >
              {isKorean ? "영상 다운로드" : "Download Video"}
            </button>
          ) : null}
          {!isCardNewsModule ? (
            <button
              type="button"
              className="secondary-button"
              disabled={!editableDocument || busy}
              onClick={() => void handleDeriveShortformFromLongform()}
            >
              {isKorean ? "숏폼 추출" : "Extract Short"}
            </button>
          ) : null}
          {!isCardNewsModule ? (
            <button
              type="button"
              className="secondary-button"
              disabled={!resolvedPackagePath || busy}
              onClick={() => void handleLoadLatestShortformDraft()}
            >
              {isKorean ? "숏폼 초안 불러오기" : "Load Short Draft"}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            disabled={!editableDocument || busy || draftStatus.state === "saving"}
            onClick={() => void handleSaveDraft("manual")}
          >
            {draftStatus.state === "saving"
              ? isKorean
                ? "초안 저장 중"
                : "Saving Draft"
              : isKorean
                ? "초안 저장"
                : "Save Draft"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!resolvedPackagePath || busy}
            onClick={() => void handleLoadDraft()}
          >
            {isKorean ? "초안 불러오기" : "Load Draft"}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>{copy.packagePath}</span>
          <code className="meta-code">{resolvedPackagePath || copy.noPackage}</code>
        </div>
        {editableDocument ? (
          <p className="subtle">
            {draftStatus.state === "saving"
              ? isKorean
                ? "자동 저장 중..."
                : "Autosaving..."
              : draftStatus.savedAt
                ? isKorean
                  ? `최근 초안 저장: ${new Date(draftStatus.savedAt).toLocaleString()} · ${
                      draftStatus.saveReason === "autosave" ? "자동 저장" : "수동 저장"
                    }`
                  : `Last draft: ${new Date(draftStatus.savedAt).toLocaleString()} · ${draftStatus.saveReason}`
                : isKorean
                  ? "초안은 패키지 폴더의 editor-draft.json에 저장됩니다."
                  : "Drafts are saved to editor-draft.json inside the package folder."}
          </p>
        ) : null}
        {message && <p className={message === copy.saved ? "subtle" : "warning-text"}>{message}</p>}
      </div>

      {!editableDocument ? (
        <div className="card">
          <p className="subtle">{copy.emptyState}</p>
        </div>
      ) : (
        !hasGeneratedAssets && !isCardNewsModule ? (
          <div className="card generation-prebuild">
            <div className="card-row">
              <strong>{isKorean ? "생성 전 편집" : "Pre-generation Edit"}</strong>
              <span className="pill">
                {moduleCopy.sceneLabel} {selectedScene?.sceneNo ?? "-"}
              </span>
            </div>
            <p className="subtle">
              {isKorean
                ? "자산 생성 전에는 스크립트, 프롬프트, 길이만 빠르게 수정할 수 있습니다. 이미지/영상이 생성되면 고급 편집 화면으로 자동 전환됩니다."
                : "Before assets are generated, you can quickly edit script, prompt, and duration. The advanced editor opens automatically after generation."}
            </p>

            <div
              className={
                isCardNewsModule
                  ? "workflow-slot-candidate-list compact"
                  : "workflow-slot-candidate-list"
              }
            >
              {editableDocument.scenes.map((scene) => (
                <button
                  key={scene.sceneNo}
                  type="button"
                  className={selectedSceneNo === scene.sceneNo ? "pill-button active" : "pill-button"}
                  onClick={() => setSelectedSceneNo(scene.sceneNo)}
                >
                    {moduleCopy.sceneLabel} {scene.sceneNo}
                </button>
              ))}
            </div>

            {!selectedScene ? (
              <p className="subtle">{copy.selectScene}</p>
            ) : (
              <div className="form-grid">
                {isCardNewsModule ? (
                  <div className="field field-span-2">
                    <span className="subtle">
                      {selectedScene.sceneNo === 1
                        ? isKorean
                          ? "1장은 어그로 커버 카드입니다. 이미지/프롬프트 중심으로 편집하세요."
                          : "Card 1 is the hook cover card. Focus on image/prompt."
                        : isKorean
                          ? "2장 이후는 템플릿 카드입니다. 본문 텍스트 중심으로 편집하세요."
                          : "Card 2+ are template cards. Focus on copy text."}
                    </span>
                  </div>
                ) : null}
                {!isCardNewsModule ? (
                  <div className="field field-span-2">
                    <span>{isKorean ? "씬 배경색" : "Scene Background"}</span>
                    <div className="scene-color-palette">
                      {VIDEO_SCENE_BACKGROUND_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={
                            (selectedScene.backgroundColor ?? "#ffffff").toLowerCase() === color.toLowerCase()
                              ? "card-color-swatch active"
                              : "card-color-swatch"
                          }
                          title={color}
                          style={{ background: color }}
                          onClick={() => updateScene(selectedScene.sceneNo, { backgroundColor: color })}
                        />
                      ))}
                      <input
                        className="scene-color-input"
                        type="color"
                        value={selectedScene.backgroundColor ?? "#ffffff"}
                        onChange={(event) => updateScene(selectedScene.sceneNo, { backgroundColor: event.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : (
        <div className={isCardNewsModule ? "generation-shell generation-shell--canvas" : "generation-shell generation-shell--video"}>
          <div className="generation-editor card">
            <div className="generation-editor-header">
              <div>
                <p className="eyebrow">{isKorean ? "Edit Suite" : "Edit Suite"}</p>
                <h4>{moduleCopy.pageTitle}</h4>
                <p className="subtle">
                  {isCardNewsModule ? `${editableDocument.scenes.length} cards` : isKorean
                    ? `씬 ${editableDocument.scenes.length}개 · 총 ${formatTimelineSeconds(totalDurationSec)}`
                    : `${editableDocument.scenes.length} scenes · ${formatTimelineSeconds(totalDurationSec)} total`}
                </p>
              </div>
            </div>

            <div className="generation-tab-row">
              <button
                type="button"
                className={editorTab === "scene" ? "pill-button active" : "pill-button"}
                onClick={() => setEditorTab("scene")}
              >
                {isCardNewsModule ? (isKorean ? "Design" : "Design") : "Scene"}
              </button>
              {!isCardNewsModule ? (
                <>
                  <button
                    type="button"
                    className={editorTab === "text" ? "pill-button active" : "pill-button"}
                    onClick={() => setEditorTab("text")}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    className={editorTab === "voice" ? "pill-button active" : "pill-button"}
                    onClick={() => setEditorTab("voice")}
                  >
                    {isKorean ? "Voice" : "Voice"}
                  </button>
                </>
              ) : null}
            </div>

            {editorTab === "ai" && (
              <div className="ai-workspace-panel">
                <div>
                  <h4>{isKorean ? "AI 작업실" : "AI Workspace"}</h4>
                  <p className="subtle">
                    {isKorean
                      ? "텍스트, 이미지, 영상, 링크를 순서대로 쌓고 AI에게 카드뉴스/영상/Canva 설계도를 만들게 합니다."
                      : "Stack text, images, video, and links in order, then let AI prepare a card/video/Canva plan."}
                  </p>
                </div>
                <label className="field">
                  <span>{isKorean ? "결과 타입" : "Target"}</span>
                  <select
                    className="text-input"
                    value={aiWorkspace.targetKind}
                    onChange={(event) =>
                      updateAiWorkspace({ targetKind: event.target.value as AiWorkspaceTargetKind })
                    }
                  >
                    <option value="card_news">{isKorean ? "카드뉴스" : "Card News"}</option>
                    <option value="video">{isKorean ? "영상" : "Video"}</option>
                    <option value="canva">Canva</option>
                  </select>
                </label>
                <div className="ai-material-composer">
                  <label className="field">
                    <span>{isKorean ? "텍스트 소재 추가" : "Add Text Material"}</span>
                    <textarea
                      className="text-input textarea-input"
                      rows={4}
                      value={aiMaterialTextDraft}
                      onChange={(event) => setAiMaterialTextDraft(event.target.value)}
                      placeholder={isKorean ? "기사 본문, 아이디어, 문장, 메모를 붙여넣으세요." : "Paste article text, ideas, lines, or notes."}
                    />
                  </label>
                  <button type="button" className="secondary-button" onClick={addAiTextMaterial}>
                    {isKorean ? "텍스트 추가" : "Add Text"}
                  </button>
                  <label className="field">
                    <span>{isKorean ? "링크 소재 추가" : "Add Link Material"}</span>
                    <input
                      className="text-input"
                      type="text"
                      value={aiMaterialUrlDraft}
                      onChange={(event) => setAiMaterialUrlDraft(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <div className="button-row">
                    <button type="button" className="secondary-button" onClick={addAiLinkMaterial}>
                      {isKorean ? "링크 추가" : "Add Link"}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => void handleAddAiLocalMaterial()}>
                      {isKorean ? "파일 소재 추가" : "Add File"}
                    </button>
                  </div>
                </div>
                <div className="ai-material-board">
                  <div className="card-row">
                    <strong>{isKorean ? "소재 순서" : "Material Order"}</strong>
                    <span className="pill">{aiWorkspace.materials.length}</span>
                  </div>
                  {aiWorkspace.materials.length === 0 ? (
                    <p className="subtle">
                      {isKorean
                        ? "아직 소재가 없습니다. 프롬프트만으로도 설계는 가능하지만, 소재를 넣으면 결과가 훨씬 안정적입니다."
                        : "No materials yet. Prompt-only works, but ordered materials make the plan stronger."}
                    </p>
                  ) : (
                    <div className="ai-material-list">
                      {aiWorkspace.materials.map((material, index) => (
                        <article
                          key={material.id}
                          className={[
                            "ai-material-card",
                            dragOverAiMaterialId === material.id ? "drag-over" : "",
                            draggingAiMaterialId === material.id ? "dragging" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          draggable
                          onDragStart={() => setDraggingAiMaterialId(material.id)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverAiMaterialId(material.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            handleAiMaterialDrop(material.id);
                          }}
                          onDragEnd={() => {
                            setDraggingAiMaterialId(null);
                            setDragOverAiMaterialId(null);
                          }}
                        >
                          <span className="ai-material-index">{index + 1}</span>
                          <div>
                            <strong>{material.label}</strong>
                            <p>{material.text || material.sourceUrl || material.localPath || material.kind}</p>
                          </div>
                          <span className="pill">{material.kind}</span>
                          <button type="button" className="ghost-button" onClick={() => removeAiMaterial(material.id)}>
                            ×
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <label className="field">
                  <span>{isKorean ? "AI 프롬프트" : "AI Prompt"}</span>
                  <textarea
                    className="text-input textarea-input"
                    rows={7}
                    value={aiWorkspace.prompt}
                    onChange={(event) => updateAiWorkspace({ prompt: event.target.value })}
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={aiWorkspaceBusy}
                    onClick={() => void handleGenerateAiWorkspacePlan()}
                  >
                    {aiWorkspaceBusy
                      ? isKorean
                        ? "AI 설계 중"
                        : "Planning"
                      : isKorean
                        ? "AI 설계 초안 생성"
                        : "Generate AI Plan"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!aiWorkspace.plan}
                    onClick={applyAiWorkspacePlanToDocument}
                  >
                    {isKorean ? "현재 에디터에 반영" : "Apply to Editor"}
                  </button>
                </div>
                {aiWorkspace.plan ? (
                  <div className="ai-plan-preview">
                    <p className="eyebrow">{isKorean ? "AI 설계 결과" : "AI Plan"}</p>
                    <strong>{aiWorkspace.plan.summary}</strong>
                    <p className="subtle">
                      {aiWorkspace.plan.provider} · {aiWorkspace.plan.model ?? "local"}
                    </p>
                    <div className="ai-plan-items">
                      {aiWorkspace.plan.items.map((item) => (
                        <article key={`ai-plan-item-${item.index}`} className="ai-plan-item">
                          <span className="ai-material-index">{item.index}</span>
                          <div>
                            <strong>{item.title}</strong>
                            <p>{item.text}</p>
                            {item.visualPrompt ? <small>{item.visualPrompt}</small> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                    <details className="ai-canva-prompt-box">
                      <summary>{isKorean ? "Canva에 붙일 프롬프트" : "Prompt for Canva"}</summary>
                      <p>{aiWorkspace.plan.canvaPrompt}</p>
                    </details>
                  </div>
                ) : null}
              </div>
            )}

            {editorTab === "scene" && (
              <>
                {isCardNewsModule ? (
                  <>
                    <div className="card-template-library">
                      <div className="card-row">
                        <strong>{isKorean ? "템플릿 저장소" : "Template Library"}</strong>
                        <span className="pill">{cardNewsTemplates.length}</span>
                      </div>
                      <p className="subtle">
                        {isKorean
                          ? "유저가 직접 등록한 템플릿만 표시됩니다. 템플릿을 누르면 새 카드가 추가됩니다."
                          : "Only user-registered templates are shown. Click one to append a new card."}
                      </p>
                      <button
                        type="button"
                        className="card-tool-btn card-template-register-btn"
                        onClick={() => void handleRegisterCardNewsTemplate()}
                        disabled={busy}
                      >
                        {isKorean ? "템플릿 등록" : "Register Template"}
                      </button>
                      <div className="card-template-grid">
                        {cardNewsTemplates.length === 0 ? (
                          <p className="subtle card-template-empty">
                            {isKorean
                              ? "아직 등록된 템플릿이 없습니다. PNG/JPG/WebP 이미지를 등록해 주세요."
                              : "No templates yet. Register a PNG/JPG/WebP image to start."}
                          </p>
                        ) : (
                          cardNewsTemplates.map((template) => (
                            <div key={template.id} className="card-template-tile">
                              <button
                                type="button"
                                className="card-template-preview-btn"
                                onClick={() => addCardFromTemplate(template)}
                              >
                                <img src={toFileUrl(template.thumbnailPath)} alt={template.name} />
                                <span>{template.name}</span>
                              </button>
                              <button
                                type="button"
                                className="card-template-delete-btn"
                                onClick={() => void handleDeleteCardNewsTemplate(template.id)}
                                disabled={busy}
                              >
                                {isKorean ? "삭제" : "Delete"}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="card-path-compact-grid">
                      <div className="card-path-compact-item">
                        <span>{isKorean ? "1장 커버 이미지 경로" : "Cover Image Path (Card 1)"}</span>
                        <div className="card-path-compact-row">
                          <input
                            className="text-input"
                            type="text"
                            value={editableDocument.cardNews?.coverImagePath ?? ""}
                            onChange={(event) =>
                              updateCardNewsOptions({
                                coverImagePath: event.target.value
                              })
                            }
                          />
                          <button
                            type="button"
                            className="card-tool-btn"
                            onClick={() => void handleChooseCardNewsCoverImage()}
                          >
                            {isKorean ? "찾아보기" : "Browse"}
                          </button>
                        </div>
                      </div>
                      <div className="card-path-compact-item">
                        <span>{isKorean ? "기본 템플릿 배경 경로" : "Default Template Background Path"}</span>
                        <div className="card-path-compact-row">
                          <input
                            className="text-input"
                            type="text"
                            value={editableDocument.cardNews?.templateBackgroundPath ?? ""}
                            onChange={(event) =>
                              updateCardNewsOptions({
                                templateBackgroundPath: event.target.value
                              })
                            }
                          />
                          <button
                            type="button"
                            className="card-tool-btn"
                            onClick={() => void handleChooseCardNewsTemplateImage()}
                          >
                            {isKorean ? "찾아보기" : "Browse"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                {!isCardNewsModule ? (
                  <>
                    <details className="asset-library-panel" open>
                      <summary className="asset-library-summary">
                        <span>{isKorean ? "소재 라이브러리" : "Asset Library"}</span>
                        <span className="pill">Pixabay · Local</span>
                      </summary>
                      <div className="asset-library-body">
                        <p className="subtle">
                          {isKorean
                            ? "Upload에는 붙여넣은 이미지, 직접 추가한 파일, 크롤링 녹화본이 모입니다. 필요한 소재를 현재 재생 위치에 추가하세요."
                            : "Upload collects pasted images, local files, and crawler recordings. Add assets at the current playhead."}
                        </p>
                        <div className="asset-source-tabs" role="tablist">
                          <button
                            type="button"
                            className={assetSourceTab === "upload" ? "is-active" : ""}
                            onClick={() => setAssetSourceTab("upload")}
                          >
                            Upload
                          </button>
                          <button
                            type="button"
                            className={assetSourceTab === "pixabay" ? "is-active" : ""}
                            onClick={() => setAssetSourceTab("pixabay")}
                          >
                            Pixabay
                          </button>
                        </div>
                        <div className="asset-library-local-row">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={pixabayBusy}
                            onClick={() => void handleImportLocalAsset(true)}
                          >
                            {isKorean ? "내 파일 요소 추가" : "Add Local Element"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={pixabayBusy}
                            onClick={() => void handleImportLocalAsset(false)}
                          >
                            {isKorean ? "내 파일 저장만" : "Save Local Only"}
                          </button>
                        </div>
                        <div className="asset-library-youtube-record">
                          <input
                            className="text-input"
                            type="url"
                            value={youtubeRecordUrl}
                            onChange={(event) => setYoutubeRecordUrl(event.target.value)}
                            placeholder={isKorean ? "비워두면 유튜브 홈 열기" : "Leave blank to open YouTube home"}
                          />
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={youtubeRecordBusy || !resolvedPackagePath}
                            onClick={() => void handleRecordYouTubeClipFromEditor()}
                          >
                            {youtubeRecordBusy
                              ? isKorean
                                ? "녹화 중"
                                : "Recording"
                              : isKorean
                                ? "유튜브 열기 · 녹화"
                                : "Open YouTube · Record"}
                          </button>
                        </div>
                        {assetSourceTab === "upload" ? (
                          <>
                            <div className="asset-library-local-row">
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={uploadedAssetsBusy}
                                onClick={() => void refreshUploadedAssets()}
                              >
                                {uploadedAssetsBusy
                                  ? isKorean
                                    ? "불러오는 중"
                                    : "Loading"
                                  : isKorean
                                    ? "Upload 새로고침"
                                    : "Refresh Uploads"}
                              </button>
                            </div>
                            {uploadedAssets.length > 0 ? (
                              <div className="asset-library-results">
                                {uploadedAssets.map((asset) => {
                                  const assetKey = `upload-${asset.id}`;
                                  const mediaId = `preview-${assetKey.replace(/[^a-z0-9_-]+/gi, "-")}`;
                                  const sourceLabel =
                                    asset.source === "source-clip"
                                      ? isKorean
                                        ? "녹화본"
                                        : "Recording"
                                      : asset.source === "clipboard"
                                        ? isKorean
                                          ? "붙여넣기"
                                          : "Clipboard"
                                        : isKorean
                                          ? "내 파일"
                                          : "Local";
                                  return (
                                    <article key={asset.id} className="asset-library-card asset-library-card--compact">
                                      <div className="asset-library-thumb">
                                        {asset.mediaType === "video" ? (
                                          <video
                                            id={mediaId}
                                            className="asset-library-preview-media"
                                            src={toFileUrl(asset.localPath)}
                                            playsInline
                                            preload="metadata"
                                            onPause={() =>
                                              setPlayingAssetKey((current) => (current === assetKey ? null : current))
                                            }
                                            onEnded={() =>
                                              setPlayingAssetKey((current) => (current === assetKey ? null : current))
                                            }
                                          />
                                        ) : asset.mediaType === "image" ? (
                                          <img src={toFileUrl(asset.localPath)} alt={asset.label} />
                                        ) : (
                                          <div className="asset-library-audio-preview">
                                            <span>♪</span>
                                            <small>{sourceLabel}</small>
                                          </div>
                                        )}
                                      </div>
                                      <span className="asset-library-duration">{sourceLabel}</span>
                                      <div className="button-row asset-library-actions">
                                        {asset.mediaType === "video" || asset.mediaType === "audio" ? (
                                          <button
                                            type="button"
                                            className="icon-button mini"
                                            onClick={() => toggleInlinePreviewPlayback(assetKey, mediaId)}
                                            title={isKorean ? "미리보기 재생/정지" : "Preview play/pause"}
                                          >
                                            {playingAssetKey === assetKey ? "Ⅱ" : "▶"}
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="secondary-button"
                                          onClick={() => handleApplyUploadedAsset(asset)}
                                        >
                                          {isKorean ? "추가" : "Add"}
                                        </button>
                                        <button
                                          type="button"
                                          className="danger-button mini"
                                          disabled={uploadedAssetsBusy}
                                          onClick={() => void handleDeleteUploadedAsset(asset)}
                                        >
                                          {isKorean ? "삭제" : "Delete"}
                                        </button>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="subtle">
                                {isKorean
                                  ? "아직 Upload 소재가 없습니다. 이미지 붙여넣기, 내 파일 추가, 크롤링 영상 녹화를 하면 여기에 표시됩니다."
                                  : "No uploaded assets yet. Paste images, add local files, or record crawler video to show them here."}
                              </p>
                            )}
                          </>
                        ) : null}
                        {assetSourceTab === "pixabay" ? (
                          <>
                        <details className="icon-library-panel" open>
                          <summary className="icon-library-summary">
                            <span>{isKorean ? "픽토그램 · 아이콘" : "Pictograms · Icons"}</span>
                          </summary>
                          <div className="icon-library-body">
                            <input
                              className="text-input"
                              type="text"
                              value={videoIconSearch}
                              onChange={(event) => setVideoIconSearch(event.target.value)}
                              placeholder={isKorean ? "아이콘 검색: 주의, 돈, 세계..." : "Search icons: alert, money, world..."}
                            />
                            <div className="icon-library-grid">
                              {filteredVideoIcons.map((icon) => (
                                <button
                                  key={icon.id}
                                  type="button"
                                  className="icon-library-item"
                                  onClick={() => handleAddVideoIconLayer(icon)}
                                  title={isKorean ? icon.labelKo : icon.labelEn}
                                >
                                  <img src={icon.dataUrl} alt={isKorean ? icon.labelKo : icon.labelEn} />
                                  <span>{isKorean ? icon.labelKo : icon.labelEn}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </details>
                        <div className="asset-library-controls">
                          <label className="field">
                            <span>{isKorean ? "Pixabay API Key" : "Pixabay API Key"}</span>
                            <input
                              className="text-input"
                              type="password"
                              value={pixabayApiKeyDraft}
                              onChange={(event) => setPixabayApiKeyDraft(event.target.value)}
                              onBlur={() => void saveWorkflowConfig({ pixabayApiKey: pixabayApiKeyDraft.trim() })}
                              placeholder="Pixabay API Key"
                            />
                          </label>
                          <label className="field">
                            <span>{isKorean ? "검색어" : "Search Query"}</span>
                            <input
                              className="text-input"
                              type="text"
                              value={pixabayQuery}
                              onChange={(event) => setPixabayQuery(event.target.value)}
                              placeholder={selectedScene?.assetSearchQuery || "cinematic background"}
                            />
                          </label>
                          <button
                            type="button"
                            className="primary-button"
                            disabled={pixabayBusy}
                            onClick={() => void handleSearchPixabayAssets("video")}
                          >
                            {pixabayBusy
                              ? isKorean
                                ? "검색 중"
                                : "Searching"
                              : isKorean
                                ? "영상 검색"
                                : "Search Video"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={pixabayBusy}
                            onClick={() => void handleSearchPixabayAssets("image")}
                          >
                            {isKorean ? "이미지 검색" : "Search Image"}
                          </button>
                        </div>
                        {pixabayResults.length > 0 ? (
                          <div className="asset-library-results">
                            {pixabayResults.map((asset) => {
                              const assetKey = `pixabay-${asset.mediaType}-${asset.id}`;
                              const mediaId = `preview-${assetKey}`;
                              return (
                              <article key={assetKey} className="asset-library-card asset-library-card--compact">
                                <div className="asset-library-thumb">
                                  {asset.mediaType === "video" ? (
                                    <video
                                      id={mediaId}
                                      className="asset-library-preview-media"
                                      src={asset.downloadUrl}
                                      poster={asset.previewUrl || undefined}
                                      muted
                                      playsInline
                                      preload="metadata"
                                      onPause={() =>
                                        setPlayingAssetKey((current) => (current === assetKey ? null : current))
                                      }
                                      onEnded={() =>
                                        setPlayingAssetKey((current) => (current === assetKey ? null : current))
                                      }
                                    />
                                  ) : asset.previewUrl ? (
                                    <img src={asset.previewUrl} alt={asset.title} />
                                  ) : (
                                    <span>{asset.mediaType}</span>
                                )}
                              </div>
                                <span className="asset-library-duration">
                                  {asset.durationSec ? `${asset.durationSec}s` : asset.mediaType}
                                  {asset.mediaType === pixabayMediaType ? "" : ` · ${asset.mediaType}`}
                                </span>
                                <div className="button-row asset-library-actions">
                                  {asset.mediaType === "video" ? (
                                    <button
                                      type="button"
                                      className="icon-button mini"
                                      onClick={() => toggleInlinePreviewPlayback(assetKey, mediaId)}
                                      title={isKorean ? "미리보기 재생/정지" : "Preview play/pause"}
                                    >
                                      {playingAssetKey === assetKey ? "Ⅱ" : "▶"}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={pixabayBusy}
                                    onClick={() => void handleApplyPixabayAsset(asset)}
                                  >
                                    {isKorean ? "추가" : "Add"}
                                  </button>
                                </div>
                              </article>
                              );
                            })}
                          </div>
                        ) : null}
                        <details className="asset-library-panel compact" open>
                          <summary>
                            <span>{isKorean ? "무료 오디오" : "Free Audio"}</span>
                            <span className="pill">Freesound</span>
                          </summary>
                          <p className="subtle">
                            {isKorean
                              ? "BGM/효과음을 검색해서 현재 재생 위치의 Voice 트랙에 추가합니다. 라이선스는 결과 카드에서 확인하세요."
                              : "Search BGM/SFX and add them to the Voice track at the playhead. Check each card license."}
                          </p>
                          <div className="asset-library-controls">
                            <label className="field">
                              <span>{isKorean ? "Freesound API Key" : "Freesound API Key"}</span>
                              <input
                                className="text-input"
                                type="password"
                                value={freesoundApiKeyDraft}
                                onChange={(event) => setFreesoundApiKeyDraft(event.target.value)}
                                onBlur={() => void saveWorkflowConfig({ freesoundApiKey: freesoundApiKeyDraft.trim() })}
                                placeholder="Freesound API Key"
                              />
                            </label>
                            <label className="field">
                              <span>{isKorean ? "오디오 검색어" : "Audio Query"}</span>
                              <input
                                className="text-input"
                                type="text"
                                value={freesoundQuery}
                                onChange={(event) => setFreesoundQuery(event.target.value)}
                                placeholder={pixabayQuery || selectedScene?.assetSearchQuery || "cinematic ambience"}
                              />
                            </label>
                            <button
                              type="button"
                              className="primary-button"
                              disabled={freesoundBusy}
                              onClick={() => void handleSearchFreesoundAudio()}
                            >
                              {freesoundBusy
                                ? isKorean
                                  ? "검색 중"
                                  : "Searching"
                                : isKorean
                                  ? "오디오 검색"
                                  : "Search Audio"}
                            </button>
                          </div>
                          {freesoundResults.length > 0 ? (
                            <div className="asset-library-results">
                              {freesoundResults.map((asset) => {
                                const assetKey = `freesound-${asset.id}`;
                                const mediaId = `preview-${assetKey}`;
                                return (
                                <article key={assetKey} className="asset-library-card asset-library-card--compact">
                                  <div className="asset-library-thumb">
                                    <div className="asset-library-audio-preview">
                                      <span>♪</span>
                                      <small>{asset.user || "Freesound"}</small>
                                    </div>
                                  </div>
                                  <audio
                                    id={mediaId}
                                    className="asset-library-audio-player"
                                    src={asset.previewUrl}
                                    preload="none"
                                    onPause={() =>
                                      setPlayingAssetKey((current) => (current === assetKey ? null : current))
                                    }
                                    onEnded={() =>
                                      setPlayingAssetKey((current) => (current === assetKey ? null : current))
                                    }
                                  />
                                  <span className="asset-library-duration">
                                    {asset.durationSec ? `${Math.round(asset.durationSec)}s` : "audio"}
                                  </span>
                                  <div className="button-row asset-library-actions">
                                    <button
                                      type="button"
                                      className="icon-button mini"
                                      onClick={() => toggleInlinePreviewPlayback(assetKey, mediaId)}
                                      title={isKorean ? "미리듣기 재생/정지" : "Preview play/pause"}
                                    >
                                      {playingAssetKey === assetKey ? "Ⅱ" : "▶"}
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      disabled={freesoundBusy}
                                      onClick={() => void handleApplyFreesoundAudio(asset)}
                                    >
                                      {isKorean ? "추가" : "Add"}
                                    </button>
                                  </div>
                                </article>
                                );
                              })}
                            </div>
                          ) : null}
                        </details>
                          </>
                        ) : null}
                      </div>
                    </details>
                    <div className="card-row">
                      <strong>{moduleCopy.sceneList}</strong>
                      <span className="pill">{editableDocument.scenes.length}</span>
                    </div>
                    <div className="workflow-slot-candidate-list">
                      {editableDocument.scenes.map((scene) => (
                        <button
                          key={scene.sceneNo}
                          type="button"
                          className={selectedSceneNo === scene.sceneNo ? "pill-button active" : "pill-button"}
                          onClick={() => setSelectedSceneNo(scene.sceneNo)}
                        >
                          {moduleCopy.sceneLabel} {scene.sceneNo}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {!selectedScene ? (
                  <p className="subtle">{copy.selectScene}</p>
                ) : (
                  <div className="form-grid">
                    {isCardNewsModule ? (
                      <div className="field field-span-2">
                        <span className="subtle">
                          {selectedScene.sceneNo === 1
                            ? isKorean
                              ? "1장은 커버 카드입니다. 배경 이미지와 제목 문구를 중심으로 편집하세요."
                              : "Card 1 is the hook cover card. Focus on image/prompt."
                            : isKorean
                              ? "2장 이후는 템플릿 카드입니다. 본문 텍스트와 스타일을 편집하세요."
                              : "Card 2+ are template cards. Focus on copy text."}
                        </span>
                      </div>
                    ) : null}
                    {!isCardNewsModule ? (
                      <div className="field field-span-2">
                        <span>{textFieldLabel}</span>
                        <textarea
                          className="text-input textarea-input"
                          value={activeTextValue}
                          onChange={(event) => {
                            updateScene(selectedScene.sceneNo, { text: event.target.value });
                          }}
                        />
                      </div>
                    ) : (
                      <div className="field field-span-2">
                        <p className="subtle">
                          {isKorean
                            ? "문구는 오른쪽 프리뷰에서 텍스트 박스를 더블클릭해 직접 수정합니다."
                            : "Double-click a text box in the preview to edit copy directly."}
                        </p>
                      </div>
                    )}
                    {isCardNewsModule && !selectedCardDesign ? (
                      <div className="field field-span-2 card-layer-field">
                        <span>Text Boxes</span>
                        <p className="subtle">This card has no text boxes and will render as image-only.</p>
                        <button type="button" className="card-tool-btn" onClick={addCardDesignBox}>
                          Add Text Box
                        </button>
                      </div>
                    ) : null}
                    {isCardNewsModule && selectedCardDesign ? (
                      <>
                        <div className="field field-span-2 card-layer-field">
                          <span>Text Boxes</span>
                          <label className="checkbox-inline">
                            <input
                              type="checkbox"
                              checked={showCardBoxOutline}
                              onChange={(event) => setShowCardBoxOutline(event.target.checked)}
                            />
                            <span>{isKorean ? "박스 가이드 표시" : "Show Box Guide"}</span>
                          </label>
                          <div className="card-layer-list">
                            {selectedCardDesignBoxes.map((box, index) => (
                              <button
                                key={`card-box-tab-${selectedScene.sceneNo}-${index}`}
                                type="button"
                                className={selectedBoxIndex === index ? "card-layer-item active" : "card-layer-item"}
                                onClick={() => setSelectedBoxIndex(index)}
                                draggable
                                onDragStart={(event) => handleLayerDragStart(event, index)}
                                onDragOver={(event) => handleLayerDragOver(event, index)}
                                onDrop={(event) => handleLayerDrop(event, index)}
                                onDragEnd={handleLayerDragEnd}
                                style={{
                                  opacity: draggingLayerIndex === index ? 0.55 : 1,
                                  outline:
                                    dragOverLayerIndex === index
                                      ? "2px solid rgba(255,126,95,0.9)"
                                      : undefined,
                                  outlineOffset: dragOverLayerIndex === index ? "1px" : undefined
                                }}
                              >
                                <span className="layer-title">{`Box ${index + 1}`}</span>
                                <span className="layer-meta">z{box.layerOrder ?? index}</span>
                                <div className="layer-inline-actions">
                                  <button
                                    type="button"
                                    className="layer-icon-btn"
                                    title={box.hidden ? "Show layer" : "Hide layer"}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      toggleCardDesignHiddenAt(index);
                                    }}
                                  >
                                    {box.hidden ? "Show" : "Hide"}
                                  </button>
                                  <button
                                    type="button"
                                    className="layer-icon-btn"
                                    title={box.locked ? "Unlock layer" : "Lock layer"}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      toggleCardDesignLockAt(index);
                                    }}
                                  >
                                    {box.locked ? "Unlock" : "Lock"}
                                  </button>
                                  <span className="layer-drag-handle" title="Drag to reorder">
                                    ::
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="card-layer-actions">
                            <button type="button" className="card-tool-btn" onClick={addCardDesignBox}>
                              Add
                            </button>
                            <button type="button" className="card-tool-btn" onClick={duplicateCardDesignBox}>
                              Duplicate
                            </button>
                            <button
                              type="button"
                              className="card-tool-btn"
                              onClick={() => moveCardDesignLayer("up")}
                              disabled={selectedBoxIndex >= selectedCardDesignBoxes.length - 1}
                            >
                              {isKorean ? "Bring Front" : "Bring Front"}
                            </button>
                            <button
                              type="button"
                              className="card-tool-btn"
                              onClick={() => moveCardDesignLayer("down")}
                              disabled={selectedBoxIndex <= 0}
                            >
                              {isKorean ? "Send Back" : "Send Back"}
                            </button>
                            <button
                              type="button"
                              className="card-tool-btn danger"
                              onClick={removeCardDesignBox}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="card-editor-tools-row">
                          <details className="card-style-section" open>
                            <summary>Text Style Options</summary>
                            <div className="card-style-stack">
                            <details className="card-style-subsection" open>
                              <summary>Presets</summary>
                              <div className="card-style-grid">
                        <div className="field field-span-2">
                          <span>Text Presets</span>
                          <div className="card-layer-actions card-preset-row">
                            {CARD_NEWS_TEXT_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className="card-tool-btn"
                                onClick={() => applyCardTextPreset(preset.id)}
                              >
                                {isKorean ? preset.labelKo : preset.labelEn}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="field field-span-2">
                          <span>Color Presets</span>
                          <div className="card-layer-actions card-preset-row">
                            {CARD_NEWS_COLOR_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className="card-tool-btn"
                                onClick={() => applyCardColorPreset(preset.id)}
                              >
                                {isKorean ? preset.labelKo : preset.labelEn}
                              </button>
                            ))}
                          </div>
                        </div>
                              </div>
                            </details>
                            <details className="card-style-subsection">
                              <summary>Typography</summary>
                              <div className="card-style-grid">
                        <div className="field">
                          <span>Font</span>
                          <select
                            className="text-input"
                            value={selectedCardDesign.fontFamily ?? "GongGothic B"}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                fontFamily: event.target.value
                              })
                            }
                          >
                            {CARD_NEWS_FONT_OPTIONS.map((font) => (
                              <option key={font} value={font}>
                                {font}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <span>Font Size</span>
                          <input
                            className="text-input"
                            type="number"
                            min={18}
                            max={120}
                            value={selectedCardDesign.fontSize}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                fontSize: parseLooseNumberInput(event.target.value, selectedCardDesign.fontSize)
                              })
                            }
                            onBlur={(event) =>
                              applyCardTextStylePatch({
                                fontSize: clampNumber(parseLooseNumberInput(event.target.value, selectedCardDesign.fontSize), 18, 120)
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Weight</span>
                          <select
                            className="text-input"
                            value={selectedCardDesign.fontWeight}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                fontWeight: Number(event.target.value) as NonNullable<
                                  SceneScriptItem["cardDesign"]
                                >["fontWeight"]
                              })
                            }
                          >
                            <option value={400}>400</option>
                            <option value={500}>500</option>
                            <option value={600}>600</option>
                            <option value={700}>700</option>
                            <option value={800}>800</option>
                          </select>
                        </div>
                        <div className="field">
                          <span>Align</span>
                          <select
                            className="text-input"
                            value={selectedCardDesign.align}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                align: event.target.value as NonNullable<SceneScriptItem["cardDesign"]>["align"]
                              })
                            }
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div className="field">
                          <span>Vertical Align</span>
                          <select
                            className="text-input"
                            value={selectedCardDesign.verticalAlign}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                verticalAlign:
                                  event.target.value as NonNullable<SceneScriptItem["cardDesign"]>["verticalAlign"]
                              })
                            }
                          >
                            <option value="top">Top</option>
                            <option value="middle">Middle</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </div>
                              </div>
                            </details>
                            <details className="card-style-subsection">
                              <summary>Color</summary>
                              <div className="card-style-grid">
                        <div className="field">
                          <span>Text Color</span>
                          <input
                            className="text-input"
                            type="color"
                            value={selectedCardDesign.textColor}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                textColor: event.target.value
                              })
                            }
                          />
                          <button
                            type="button"
                            className="card-tool-btn"
                            onClick={async () => {
                              const color = await pickColorWithEyeDropper();
                              if (color) {
                                applyCardTextStylePatch({
                                  textColor: color
                                });
                              }
                            }}
                          >
                            Pick
                          </button>
                        </div>
                        <div className="field field-span-2">
                          <span>Palette</span>
                          <div className="card-color-palette">
                            {CARD_NEWS_PALETTE.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className="card-color-swatch"
                                style={{ background: color }}
                                title={color}
                                onClick={() =>
                                  applyCardTextStylePatch({
                                    textColor: color
                                  })
                                }
                              />
                            ))}
                          </div>
                        </div>
                              </div>
                            </details>
                            <details className="card-style-subsection">
                              <summary>Outline</summary>
                              <div className="card-style-grid">
                        <label className="field">
                          <span>Outline</span>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCardDesign.outlineEnabled)}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                outlineEnabled: event.target.checked
                              })
                            }
                          />
                        </label>
                        <div className="field">
                          <span>Outline Thickness</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={100}
                            value={selectedCardDesign.outlineThickness ?? 0}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                outlineThickness: parseLooseNumberInput(event.target.value, selectedCardDesign.outlineThickness ?? 0)
                              })
                            }
                            onBlur={(event) =>
                              applyCardTextStylePatch({
                                outlineThickness: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.outlineThickness ?? 0),
                                  0,
                                  100
                                )
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Outline Color</span>
                          <input
                            className="text-input"
                            type="color"
                            value={selectedCardDesign.outlineColor ?? "#000000"}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                outlineColor: event.target.value
                              })
                            }
                          />
                        </div>
                              </div>
                            </details>
                            <details className="card-style-subsection">
                              <summary>Shadow</summary>
                              <div className="card-style-grid">
                        <label className="field">
                          <span>Shadow</span>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCardDesign.shadowEnabled)}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                shadowEnabled: event.target.checked
                              })
                            }
                          />
                        </label>
                        <div className="field">
                          <span>Shadow Color</span>
                          <input
                            className="text-input"
                            type="color"
                            value={selectedCardDesign.shadowColor ?? "#000000"}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                shadowColor: event.target.value
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Direction</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={360}
                            value={selectedCardDesign.shadowDirectionDeg ?? 135}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                shadowDirectionDeg: parseLooseNumberInput(event.target.value, selectedCardDesign.shadowDirectionDeg ?? 135)
                              })
                            }
                            onBlur={(event) =>
                              applyCardTextStylePatch({
                                shadowDirectionDeg: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.shadowDirectionDeg ?? 135),
                                  0,
                                  360
                                )
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Opacity</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={100}
                            value={selectedCardDesign.shadowOpacity ?? 45}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                shadowOpacity: parseLooseNumberInput(event.target.value, selectedCardDesign.shadowOpacity ?? 45)
                              })
                            }
                            onBlur={(event) =>
                              applyCardTextStylePatch({
                                shadowOpacity: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.shadowOpacity ?? 45),
                                  0,
                                  100
                                )
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Distance</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={100}
                            value={selectedCardDesign.shadowDistance ?? 10}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                shadowDistance: parseLooseNumberInput(event.target.value, selectedCardDesign.shadowDistance ?? 10)
                              })
                            }
                            onBlur={(event) =>
                              applyCardTextStylePatch({
                                shadowDistance: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.shadowDistance ?? 10),
                                  0,
                                  100
                                )
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Blur</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={100}
                            value={selectedCardDesign.shadowBlur ?? 0}
                            onChange={(event) =>
                              applyCardTextStylePatch({
                                shadowBlur: parseLooseNumberInput(event.target.value, selectedCardDesign.shadowBlur ?? 0)
                              })
                            }
                            onBlur={(event) =>
                              applyCardTextStylePatch({
                                shadowBlur: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.shadowBlur ?? 0),
                                  0,
                                  100
                                )
                              })
                            }
                          />
                        </div>
                              </div>
                            </details>
                            <details className="card-style-subsection">
                              <summary>Spacing & Background</summary>
                              <div className="card-style-grid">
                        <div className="field">
                          <span>Line Height</span>
                          <input
                            className="text-input"
                            type="number"
                            min={1}
                            max={2.2}
                            step={0.05}
                            value={selectedCardDesign.lineHeight}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                lineHeight: parseLooseNumberInput(event.target.value, selectedCardDesign.lineHeight)
                              })
                            }
                            onBlur={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                lineHeight: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.lineHeight),
                                  1,
                                  2.2
                                )
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>Padding (px)</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={120}
                            value={selectedCardDesign.padding}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                padding: parseLooseNumberInput(event.target.value, selectedCardDesign.padding)
                              })
                            }
                            onBlur={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                padding: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedCardDesign.padding),
                                  0,
                                  120
                                )
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "배경 색상" : "Background Color"}</span>
                          <div className="card-color-control">
                            <input
                              className="text-input"
                              type="color"
                              value={parseCssColorToHexAndOpacity(selectedCardDesign.backgroundColor).hex}
                              onChange={(event) =>
                                updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                  backgroundColor: buildCssRgbaFromHexAndOpacity(
                                    event.target.value,
                                    parseCssColorToHexAndOpacity(selectedCardDesign.backgroundColor).opacity
                                  )
                                })
                              }
                            />
                            <button
                              type="button"
                              className="card-tool-btn"
                              onClick={() =>
                                updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                  backgroundColor: "rgba(0,0,0,0)"
                                })
                              }
                            >
                              {isKorean ? "투명" : "Clear"}
                            </button>
                          </div>
                        </div>
                        <div className="field">
                          <span>{isKorean ? "배경 투명도" : "Background Opacity"}</span>
                          <input
                            className="text-input"
                            type="range"
                            min={0}
                            max={100}
                            value={parseCssColorToHexAndOpacity(selectedCardDesign.backgroundColor).opacity}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                backgroundColor: buildCssRgbaFromHexAndOpacity(
                                  parseCssColorToHexAndOpacity(selectedCardDesign.backgroundColor).hex,
                                  Number(event.target.value) || 0
                                )
                              })
                            }
                          />
                          <span className="subtle">
                            {parseCssColorToHexAndOpacity(selectedCardDesign.backgroundColor).opacity}%
                          </span>
                        </div>
                          </div>
                        </details>
                            </div>
                          </details>
                          <details className="card-symbol-section">
                            <summary>Symbols</summary>
                            <div className="card-symbol-panel">
                              <input
                                className="text-input"
                                type="text"
                                placeholder="Search"
                                value={symbolSearch}
                                onChange={(event) => setSymbolSearch(event.target.value)}
                              />
                              <div className="card-symbol-grid">
                                {filteredCardNewsSymbols.map((item) => (
                                  <button
                                    key={`${item.symbol}-${item.label}`}
                                    type="button"
                                    className="card-symbol-btn"
                                    title={item.label}
                                    onClick={() => appendSymbolToSelectedBox(item.symbol)}
                                  >
                                    {item.symbol}
                                  </button>
                                ))}
                              </div>
                              <p className="subtle">Click to insert into the selected text box.</p>
                            </div>
                          </details>
                        </div>
                      </>
                    ) : null}

                    {!isCardNewsModule ? (
                      <div className="field field-span-2">
                        <span>{isKorean ? "씬 배경색" : "Scene Background"}</span>
                        <div className="scene-color-palette">
                          {VIDEO_SCENE_BACKGROUND_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={
                                (selectedScene.backgroundColor ?? "#ffffff").toLowerCase() === color.toLowerCase()
                                  ? "card-color-swatch active"
                                  : "card-color-swatch"
                              }
                              title={color}
                              style={{ background: color }}
                              onClick={() => updateScene(selectedScene.sceneNo, { backgroundColor: color })}
                            />
                          ))}
                          <input
                            className="scene-color-input"
                            type="color"
                            value={selectedScene.backgroundColor ?? "#ffffff"}
                            onChange={(event) =>
                              updateScene(selectedScene.sceneNo, { backgroundColor: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </>
            )}

            {!isCardNewsModule && editorTab === "text" && (
              <>
                <h4>{isKorean ? "텍스트" : "Text"}</h4>
                <p className="subtle">
                  {isKorean
                    ? "캔버스 위에 텍스트를 올리고 직접 드래그해서 배치합니다."
                    : "Place text on the canvas and drag it into position."}
                </p>
                {selectedScene ? (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => addVideoTextOverlay(selectedScene)}
                    >
                      {isKorean ? "텍스트 박스 추가" : "Add Text Box"}
                    </button>
                    {selectedVideoTextOverlays.length > 0 ? (
                      <div className="button-row">
                        {selectedVideoTextOverlays.map((overlay, index) => (
                          <button
                            key={`video-text-picker-${selectedScene.sceneNo}-${index}`}
                            type="button"
                            className={index === selectedVideoTextIndex ? "chip-button active" : "chip-button"}
                            onClick={() => {
                              setSelectedVideoTextIndex(index);
                              setSelectedTimelineTarget("text");
                              setSelectedVideoMediaLayerId(null);
                              setSelectedAudioLayerId(null);
                            }}
                          >
                            {isKorean ? `텍스트 ${index + 1}` : `Text ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedVideoTextOverlay ? (
                      <div className="form-grid">
                        <p className="subtle field-span-2">
                          {isKorean
                            ? "문구는 왼쪽 입력칸이 아니라, 미리보기의 텍스트 박스를 더블클릭해서 직접 수정합니다."
                            : "Edit wording by double-clicking the text box directly on the preview."}
                        </p>
                        <label className="field">
                          <span>{isKorean ? "시작(초)" : "Start"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={totalDurationSec}
                            step={0.1}
                            value={selectedVideoTextOverlay.startSec ?? 0}
                            onChange={(event) =>
                              updateVideoTextTiming(selectedScene, {
                                startSec: parseLooseNumberInput(event.target.value, selectedVideoTextOverlay.startSec ?? 0)
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>{isKorean ? "길이(초)" : "Duration"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0.5}
                            max={totalDurationSec}
                            step={0.1}
                            value={selectedVideoTextOverlay.durationSec ?? totalDurationSec}
                            onChange={(event) =>
                              updateVideoTextTiming(selectedScene, {
                                durationSec: parseLooseNumberInput(
                                  event.target.value,
                                  selectedVideoTextOverlay.durationSec ?? totalDurationSec
                                )
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>{copy.fontSize}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={12}
                            max={180}
                            value={selectedVideoTextOverlay.fontSize}
                            onChange={(event) =>
                              updateVideoTextOverlay(selectedScene.sceneNo, {
                                fontSize: parseLooseNumberInput(event.target.value, selectedVideoTextOverlay.fontSize)
                              })
                            }
                            onBlur={(event) =>
                              updateVideoTextOverlay(selectedScene.sceneNo, {
                                fontSize: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedVideoTextOverlay.fontSize),
                                  12,
                                  180
                                )
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>{copy.textColor}</span>
                          <input
                            className="text-input"
                            type="color"
                            value={selectedVideoTextOverlay.textColor}
                            onChange={(event) =>
                              updateVideoTextOverlay(selectedScene.sceneNo, { textColor: event.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>{copy.outline}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={24}
                            value={selectedVideoTextOverlay.outlineThickness}
                            onChange={(event) =>
                              updateVideoTextOverlay(selectedScene.sceneNo, {
                                outlineThickness: parseLooseNumberInput(
                                  event.target.value,
                                  selectedVideoTextOverlay.outlineThickness
                                )
                              })
                            }
                            onBlur={(event) =>
                              updateVideoTextOverlay(selectedScene.sceneNo, {
                                outlineThickness: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedVideoTextOverlay.outlineThickness),
                                  0,
                                  24
                                )
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>{copy.outlineColor}</span>
                          <input
                            className="text-input"
                            type="color"
                            value={selectedVideoTextOverlay.outlineColor}
                            onChange={(event) =>
                              updateVideoTextOverlay(selectedScene.sceneNo, { outlineColor: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <h4>{copy.presetTitle}</h4>
                <p className="subtle">{copy.presetSubtitle}</p>
                {sceneStylePresets.length === 0 ? (
                  <span className="subtle">{copy.presetEmpty}</span>
                ) : (
                  <div className="button-row">
                    {sceneStylePresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={
                          workflowConfig?.createSceneStylePresetId === preset.id
                            ? "pill-button active"
                            : "pill-button"
                        }
                        onClick={() => applyStylePreset(preset.id)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

              </>
            )}

            {editorTab === "voice" && !isCardNewsModule && (
              <>
                <h4>{isKorean ? "음성 레이어" : "Voice Layer"}</h4>
                <p className="subtle">
                  {isKorean
                    ? "입력한 문장을 TTS로 생성해서 현재 재생 위치에 VOICE 트랙으로 추가합니다."
                    : "Generate TTS from text and add it to the VOICE track at the playhead."}
                </p>
                <div className="form-grid">
                  <label className="field field-span-2">
                    <span>{isKorean ? "음성 문장" : "Voice Text"}</span>
                    <textarea
                      className="text-input textarea-input"
                      rows={5}
                      value={voiceLayerText}
                      onChange={(event) => setVoiceLayerText(event.target.value)}
                      placeholder={selectedScene?.text || (isKorean ? "음성으로 만들 문장을 입력하세요." : "Enter text to synthesize.")}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button field-span-2"
                    disabled={voiceLayerBusy}
                    onClick={() => void handleGenerateVoiceLayer()}
                  >
                    {voiceLayerBusy
                      ? isKorean
                        ? "음성 생성 중"
                        : "Generating Voice"
                      : isKorean
                        ? "음성 생성 후 타임라인 추가"
                        : "Generate Voice Layer"}
                  </button>
                </div>
                <h4>{copy.voiceProfileTitle}</h4>
                <div className="form-grid">
                  <div className="field">
                    <span>{copy.voiceProvider}</span>
                    <select
                      className="text-input"
                      value={editableDocument.voiceProfile.provider}
                      onChange={(event) =>
                        updateVoiceProfile({
                          provider: event.target.value as SceneScriptVoiceProfile["provider"]
                        })
                      }
                    >
                      {VOICE_PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editableDocument.voiceProfile.provider !== "azure" ? (
                    <div className="field">
                      <span>{copy.voiceModelId}</span>
                      <input
                        className="text-input"
                        type="text"
                        value={editableDocument.voiceProfile.modelId ?? ""}
                        onChange={(event) =>
                          updateVoiceProfile({
                            modelId: event.target.value || undefined
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="generation-preview-prompt field-span-2">
                      <p className="eyebrow">{isKorean ? "Azure 음성 안내" : "Azure Voice Note"}</p>
                      <p>
                        {isKorean
                          ? "Azure Speech는 모델 ID를 쓰지 않고 Voice ID만 사용합니다. 예: ko-KR-SunHiNeural, ko-KR-HyunsuNeural"
                          : "Azure Speech uses Voice ID only, not Model ID. Example: ko-KR-SunHiNeural, ko-KR-HyunsuNeural"}
                      </p>
                    </div>
                  )}
                  <div className="field">
                    <span>{copy.voiceId}</span>
                    <input
                      className="text-input"
                      type="text"
                      value={editableDocument.voiceProfile.voiceId ?? ""}
                      onChange={(event) =>
                        updateVoiceProfile({
                          voiceId: event.target.value || undefined
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.stability}</span>
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={editableDocument.voiceProfile.stability ?? ""}
                      onChange={(event) =>
                        updateVoiceProfile({
                          stability: event.target.value ? Number(event.target.value) : undefined
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.similarityBoost}</span>
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={editableDocument.voiceProfile.similarityBoost ?? ""}
                      onChange={(event) =>
                        updateVoiceProfile({
                          similarityBoost: event.target.value ? Number(event.target.value) : undefined
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.voiceStyle}</span>
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={editableDocument.voiceProfile.style ?? ""}
                      onChange={(event) =>
                        updateVoiceProfile({
                          style: event.target.value ? Number(event.target.value) : undefined
                        })
                      }
                    />
                  </div>
                  <label className="field">
                    <span>{copy.useSpeakerBoost}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(editableDocument.voiceProfile.useSpeakerBoost)}
                      onChange={(event) =>
                        updateVoiceProfile({
                          useSpeakerBoost: event.target.checked
                        })
                      }
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="generation-preview card">
            <div className="card-row">
              <strong>{isCardNewsModule ? (isKorean ? "Preview" : "Preview") : isKorean ? "영상 캔버스" : "Video Canvas"}</strong>
              <div className="button-row">
                <span className="pill">
                  {moduleCopy.sceneLabel} {selectedScene?.sceneNo ?? "-"}
                </span>
                {isCardNewsModule && selectedScene ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void handleSaveCardPreviewImageAs(selectedScene.sceneNo)}
                    >
                      {isKorean ? "현재 카드 저장" : "Save Current Card"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void handleSaveAllCardPreviewImages()}
                    >
                      {isKorean ? "전체 카드 저장" : "Save All Cards"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {!selectedScene ? (
              <p className="subtle">{copy.selectScene}</p>
            ) : (
              <>
                {!isCardNewsModule ? (
                  <div className="video-edit-toolbar" aria-label={isKorean ? "영상 편집 도구" : "Video edit tools"}>
                    <button
                      type="button"
                      className={editorTab === "scene" ? "video-tool-button active" : "video-tool-button"}
                      onClick={() => setEditorTab("scene")}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={editorTab === "text" ? "video-tool-button active" : "video-tool-button"}
                      onClick={() => setEditorTab("text")}
                    >
                      Text
                    </button>
                    <button
                      type="button"
                      className={editorTab === "voice" ? "video-tool-button active" : "video-tool-button"}
                      onClick={() => setEditorTab("voice")}
                    >
                      Voice
                    </button>
                    <span className="video-toolbar-divider" />
                    <label className="video-tool-chip video-tool-duration-chip">
                      <input
                        aria-label={isKorean ? "선택 씬 길이" : "Selected scene duration"}
                        type="number"
                        min={1}
                        max={600}
                        step={0.05}
                        value={selectedScene.durationSec}
                        onChange={(event) =>
                          updateSceneDuration(selectedScene.sceneNo, Number(event.target.value))
                        }
                      />
                      <span>s</span>
                    </label>
                    <label className="video-tool-chip video-tool-select-chip">
                      <select
                        aria-label={isKorean ? "영상 비율" : "Video aspect ratio"}
                        value={selectedVideoCanvasPreset.id}
                        onChange={(event) => updateVideoCanvasPreset(event.target.value as VideoCanvasPresetId)}
                      >
                        {VIDEO_CANVAS_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {isKorean ? preset.labelKo : preset.labelEn}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="video-tool-chip">
                      {selectedVideoCanvasPreset.width} × {selectedVideoCanvasPreset.height}
                    </span>
                  </div>
                ) : null}
                <div className="generation-preview-banner">
                  <p className="subtle">
                    {isCardNewsModule
                      ? isKorean
                        ? "카드를 직접 보면서 편집하세요. Ctrl+휠로 확대/축소, 우클릭 드래그로 이동할 수 있습니다."
                        : "Edit while previewing the card. Ctrl+wheel zooms, right-drag pans."
                      : isKorean
                        ? "프리뷰에서 씬 결과를 크게 확인하고, 아래 타임라인에서 장면을 바꿉니다."
                        : "Review the scene in a larger preview, then switch scenes from the timeline below."}
                  </p>
                </div>
                {!isCardNewsModule &&
                (selectedCanvasPosition ||
                  (selectedTimelineTarget === "media" && selectedVideoMediaLayer?.mediaType === "video") ||
                  (selectedTimelineTarget === "audio" && selectedAudioLayer)) ? (
                  <div className="video-floating-control-panel">
                    {(selectedTimelineTarget === "media" && selectedVideoMediaLayer?.mediaType === "video") ||
                    (selectedTimelineTarget === "audio" && selectedAudioLayer) ? (
                      <div className="video-sound-control-panel">
                        {selectedTimelineTarget === "media" && selectedVideoMediaLayer?.mediaType === "video" ? (
                          <label className="video-sound-control">
                            <span>{isKorean ? "영상 음량" : "Video Volume"}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round(clampLayerVolume(Number(selectedVideoMediaLayer.volume ?? 1)) * 100)}
                              onPointerDown={beginGroupedDocumentChange}
                              onPointerUp={commitGroupedDocumentChange}
                              onBlur={commitGroupedDocumentChange}
                              onChange={(event) =>
                                updateSoundLayerVolume("media", selectedVideoMediaLayer.id, Number(event.target.value) / 100, {
                                  recordHistory: false
                                })
                              }
                            />
                            <strong>{formatLayerVolume(selectedVideoMediaLayer.volume)}</strong>
                          </label>
                        ) : null}
                        {selectedTimelineTarget === "media" && selectedVideoMediaLayer?.mediaType === "video" ? (
                          <label className="video-sound-control">
                            <span>{isKorean ? "배속" : "Speed"}</span>
                            <input
                              type="range"
                              min={1}
                              max={2}
                              step={0.01}
                              value={clampPlaybackRate(Number(selectedVideoMediaLayer.playbackRate ?? 1))}
                              onPointerDown={beginGroupedDocumentChange}
                              onPointerUp={commitGroupedDocumentChange}
                              onBlur={commitGroupedDocumentChange}
                              onChange={(event) =>
                                updateVideoMediaLayerPlaybackRate(
                                  selectedVideoMediaLayer.id,
                                  Number(event.target.value),
                                  { recordHistory: false }
                                )
                              }
                            />
                            <input
                              className="video-speed-input"
                              type="number"
                              min={1}
                              max={2}
                              step={0.01}
                              value={clampPlaybackRate(Number(selectedVideoMediaLayer.playbackRate ?? 1)).toFixed(2)}
                              onPointerDown={beginGroupedDocumentChange}
                              onBlur={(event) => {
                                updateVideoMediaLayerPlaybackRate(
                                  selectedVideoMediaLayer.id,
                                  parseLooseNumberInput(event.target.value, selectedVideoMediaLayer.playbackRate ?? 1),
                                  { recordHistory: false }
                                );
                                commitGroupedDocumentChange();
                              }}
                              onChange={(event) =>
                                updateVideoMediaLayerPlaybackRate(
                                  selectedVideoMediaLayer.id,
                                  parseLooseNumberInput(event.target.value, selectedVideoMediaLayer.playbackRate ?? 1),
                                  { recordHistory: false }
                                )
                              }
                            />
                            <strong>{formatPlaybackRate(selectedVideoMediaLayer.playbackRate)}</strong>
                          </label>
                        ) : null}
                        {selectedTimelineTarget === "audio" && selectedAudioLayer ? (
                          <label className="video-sound-control">
                            <span>{isKorean ? "오디오 음량" : "Audio Volume"}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round(clampLayerVolume(Number(selectedAudioLayer.volume ?? 1)) * 100)}
                              onPointerDown={beginGroupedDocumentChange}
                              onPointerUp={commitGroupedDocumentChange}
                              onBlur={commitGroupedDocumentChange}
                              onChange={(event) =>
                                updateSoundLayerVolume("audio", selectedAudioLayer.id, Number(event.target.value) / 100, {
                                  recordHistory: false
                                })
                              }
                            />
                            <strong>{formatLayerVolume(selectedAudioLayer.volume)}</strong>
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedCanvasPosition ? (
                      <div className="video-position-panel">
                        <strong>{isKorean ? "Position" : "Position"}</strong>
                        {CANVAS_POSITION_FIELDS.map((field) => (
                          <label key={field} className="video-position-field">
                            <span>
                              {field === "x"
                                ? "X"
                                : field === "y"
                                  ? "Y"
                                  : field === "width"
                                    ? isKorean ? "너비" : "W"
                                    : isKorean ? "높이" : "H"}
                            </span>
                            <input
                              type="number"
                              step={1}
                              value={positionDraft[field] ?? selectedCanvasPosition[field].toFixed(1)}
                              onFocus={() => {
                                setEditingPositionField(field);
                                setPositionDraftKey(selectedCanvasPosition.key);
                                setPositionDraft((current) => ({
                                  ...current,
                                  [field]: current[field] ?? selectedCanvasPosition[field].toFixed(1)
                                }));
                              }}
                              onPointerDown={beginGroupedDocumentChange}
                              onBlur={() => {
                                commitPositionDraftField(field);
                                commitGroupedDocumentChange();
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                                if (event.key === "Escape") {
                                  setPositionDraft((current) => ({
                                    ...current,
                                    [field]: selectedCanvasPosition[field].toFixed(1)
                                  }));
                                  event.currentTarget.blur();
                                }
                              }}
                              onChange={(event) =>
                                setPositionDraft((current) => ({
                                  ...current,
                                  [field]: event.target.value
                                }))
                              }
                            />
                            <small>px</small>
                          </label>
                        ))}
                        {selectedCanvasPosition.kind === "text" ? (
                          <div className="video-position-actions">
                            {CANVAS_POSITION_FIELDS.map((field) => (
                              <button
                                key={`apply-all-${field}`}
                                type="button"
                                className="video-position-action"
                                onClick={() => applySelectedTextPropertyToAllTextBoxes(field)}
                              >
                                {field === "x"
                                  ? isKorean ? "X 전체" : "All X"
                                  : field === "y"
                                    ? isKorean ? "Y 전체" : "All Y"
                                    : field === "width"
                                      ? isKorean ? "너비 전체" : "All W"
                                      : isKorean ? "높이 전체" : "All H"}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="video-position-action"
                              onClick={() => applySelectedTextPropertyToAllTextBoxes("fontSize")}
                            >
                              {isKorean ? "폰트 전체" : "All Font"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedElementTransition ? (
                      <div className="video-transition-panel">
                        <strong>{isKorean ? "전환" : "Transition"}</strong>
                        <label className="video-transition-field">
                          <span>{isKorean ? "스타일" : "Style"}</span>
                          <select
                            value={selectedElementTransition.style}
                            onChange={(event) =>
                              updateSelectedElementTransition({
                                style: event.target.value as SceneScriptElementTransitionStyle
                              })
                            }
                          >
                            {VIDEO_ELEMENT_TRANSITION_STYLES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {isKorean ? item.labelKo : item.labelEn}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="video-transition-field">
                          <span>{isKorean ? "구간" : "Part"}</span>
                          <select
                            value={selectedElementTransition.placement}
                            onChange={(event) =>
                              updateSelectedElementTransition({
                                placement: event.target.value as SceneScriptElementTransitionPlacement
                              })
                            }
                            disabled={selectedElementTransition.style === "none"}
                          >
                            {VIDEO_ELEMENT_TRANSITION_PLACEMENTS.map((item) => (
                              <option key={item.value} value={item.value}>
                                {isKorean ? item.labelKo : item.labelEn}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="video-transition-field video-transition-field--duration">
                          <span>{isKorean ? "초" : "Sec"}</span>
                          <input
                            type="number"
                            min={0.05}
                            max={3}
                            step={0.05}
                            value={selectedElementTransition.durationSec}
                            disabled={selectedElementTransition.style === "none"}
                            onChange={(event) =>
                              updateSelectedElementTransition({
                                durationSec: parseLooseNumberInput(
                                  event.target.value,
                                  selectedElementTransition.durationSec
                                )
                              })
                            }
                            onBlur={(event) =>
                              updateSelectedElementTransition({
                                durationSec: clampNumber(
                                  parseLooseNumberInput(
                                    event.target.value,
                                    selectedElementTransition.durationSec
                                  ),
                                  0.05,
                                  3
                                )
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                    {selectedMediaMotion ? (
                      <div className="video-motion-panel">
                        <strong>{isKorean ? "모션" : "Motion"}</strong>
                        <label className="video-transition-field">
                          <span>{isKorean ? "스타일" : "Style"}</span>
                          <select
                            value={selectedMediaMotion.style}
                            onChange={(event) =>
                              updateSelectedMediaMotion({
                                style: event.target.value as SceneScriptVideoMediaMotionStyle
                              })
                            }
                          >
                            {VIDEO_MEDIA_MOTION_STYLES.map((item) => (
                              <option key={item.value} value={item.value}>
                                {isKorean ? item.labelKo : item.labelEn}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="video-transition-field video-transition-field--duration">
                          <span>{isKorean ? "강도" : "Amt"}</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            step={0.5}
                            value={selectedMediaMotion.amountPct}
                            disabled={selectedMediaMotion.style === "none"}
                            onChange={(event) =>
                              updateSelectedMediaMotion({
                                amountPct: parseLooseNumberInput(event.target.value, selectedMediaMotion.amountPct)
                              })
                            }
                            onBlur={(event) =>
                              updateSelectedMediaMotion({
                                amountPct: clampNumber(
                                  parseLooseNumberInput(event.target.value, selectedMediaMotion.amountPct),
                                  1,
                                  20
                                )
                              })
                            }
                          />
                        </label>
                        <span className="video-motion-unit">%</span>
                        <div className="video-motion-focus-row">
                          <span>{isKorean ? "중심" : "Focus"}</span>
                          <strong>
                            {Math.round(selectedMediaMotion.focusXPct ?? 50)}%, {Math.round(selectedMediaMotion.focusYPct ?? 50)}%
                          </strong>
                          <button
                            type="button"
                            className={[
                              "video-position-action",
                              pickingMotionFocusLayerId === selectedVideoMediaLayerId ? "active" : ""
                            ].filter(Boolean).join(" ")}
                            disabled={selectedMediaMotion.style === "none" || !selectedVideoMediaLayerId}
                            onClick={() =>
                              setPickingMotionFocusLayerId((current) =>
                                current === selectedVideoMediaLayerId ? null : selectedVideoMediaLayerId
                              )
                            }
                          >
                            {pickingMotionFocusLayerId === selectedVideoMediaLayerId
                              ? isKorean ? "캔버스 클릭" : "Click Canvas"
                              : isKorean ? "중심 찍기" : "Pick Focus"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className={isCardNewsModule ? "card-preview-workspace" : "card-preview-workspace single"}>
                  {isCardNewsModule ? (
                    <aside className="card-preview-rail" aria-label={isKorean ? "카드 목록" : "Card list"}>
                      <div className="card-preview-rail-header">
                        <strong>{isKorean ? "카드 목록" : "Cards"}</strong>
                        <span className="pill">{editableDocument.scenes.length}</span>
                      </div>
                      <div className="card-preview-rail-list">
                        {editableDocument.scenes.map((scene, sceneIndex) => {
                          const thumbSrc = getCardNewsRailPreviewSrc(scene);
                          const isSelected = scene.sceneNo === selectedSceneNo;
                          return (
                            <div
                              key={`card-preview-rail-${scene.sceneNo}-${thumbSrc}`}
                              className={[
                                "card-preview-rail-item",
                                isSelected ? "active" : "",
                                draggingSceneIndex === sceneIndex ? "dragging" : "",
                                dragOverSceneIndex === sceneIndex ? "drag-over" : ""
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              draggable={!busy}
                              onDragStart={(event) => handleSceneDragStart(event, sceneIndex)}
                              onDragOver={(event) => handleSceneDragOver(event, sceneIndex)}
                              onDrop={(event) => handleSceneDrop(event, sceneIndex)}
                              onDragEnd={handleSceneDragEnd}
                            >
                              <button
                                type="button"
                                className="card-preview-rail-thumb"
                                onClick={() => setSelectedSceneNo(scene.sceneNo)}
                              >
                                {thumbSrc ? (
                                  <img
                                    src={thumbSrc}
                                    alt={`${moduleCopy.sceneLabel} ${scene.sceneNo}`}
                                    onError={(event) => {
                                      const target = event.currentTarget;
                                      if (target.dataset.fallbackApplied === "true") {
                                        target.src = buildCardNewsPlaceholderPreview(scene.sceneNo);
                                        return;
                                      }
                                      target.dataset.fallbackApplied = "true";
                                      target.src =
                                        buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[1]?.src ??
                                        buildCardNewsPlaceholderPreview(scene.sceneNo);
                                    }}
                                  />
                                ) : (
                                  <img src={buildCardNewsPlaceholderPreview(scene.sceneNo)} alt="" />
                                )}
                                <strong className="card-preview-rail-number">{scene.sceneNo}</strong>
                                <span>
                                  {moduleCopy.sceneLabel} {scene.sceneNo}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="card-preview-rail-delete"
                                title={isKorean ? "카드 삭제" : "Delete card"}
                                disabled={editableDocument.scenes.length <= 1 || busy}
                                onClick={() => removeSelectedCard(scene.sceneNo)}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </aside>
                  ) : null}
                  <div
                    ref={isCardNewsModule ? previewViewportRef : null}
                    className={
                      isCardNewsModule
                        ? "generation-preview-media generation-preview-media--canvas"
                        : "generation-preview-media"
                    }
                    onWheel={handleVideoCanvasWheel}
                    onMouseDown={(event) => {
                      if (!isCardNewsModule && event.target === event.currentTarget) {
                        clearVideoEditorSelection();
                        return;
                      }
                      handleCardPreviewMouseDown(event);
                    }}
                    onContextMenu={(event) => {
                      if (isCardNewsModule) {
                        event.preventDefault();
                      }
                    }}
                  >
                  {isCardNewsModule && activePreviewAsset ? (
                    activePreviewAsset.kind === "image" ? (
                      <div
                        ref={isCardNewsModule ? previewStageRef : null}
                        className={isCardNewsModule ? "generation-card-stage-shell" : undefined}
                        style={
                          isCardNewsModule
                            ? {
                                width: `${Math.round(1080 * cardStageScale)}px`,
                                height: `${Math.round(1080 * cardStageScale)}px`,
                                transform: `translate(${cardStagePan.x}px, ${cardStagePan.y}px)`,
                                cursor: cardStagePanDrag ? "grabbing" : "grab"
                              }
                            : undefined
                        }
                      >
                        <div
                          className={isCardNewsModule ? "generation-card-stage" : "video-canvas-frame"}
                          onMouseDown={(event) => {
                            if (!isCardNewsModule && event.target === event.currentTarget) {
                              clearVideoEditorSelection();
                            }
                          }}
                          style={
                            isCardNewsModule
                              ? { transform: `scale(${cardStageScale})` }
                              : buildZoomedVideoCanvasStyle({
                                  position: "relative",
                                  background: selectedScene.backgroundColor ?? "#ffffff"
                                })
                          }
                        >
                          <img
                            src={activePreviewAsset.src}
                            alt={`Scene ${selectedScene.sceneNo} preview`}
                            onError={() =>
                              setPreviewAssetIndex((current) =>
                                Math.min(current + 1, sceneAssetCandidates.length)
                              )
                            }
                          />
                          {!isCardNewsModule
                            ? selectedVideoTextOverlays.map((overlay, overlayIndex) => {
                                const localTime = timelineTimeSec;
                                const isVisible =
                                  localTime >= (overlay.startSec ?? 0) &&
                                  localTime <= (overlay.startSec ?? 0) + (overlay.durationSec ?? totalDurationSec);
                                if (!isVisible) {
                                  return null;
                                }
                                const displayOverlay = getVideoTextOverlayDisplay(
                                  selectedScene.sceneNo,
                                  overlay,
                                  overlayIndex
                                );
                                const isEditing =
                                  editingVideoText?.sceneNo === selectedScene.sceneNo &&
                                  editingVideoText.overlayIndex === overlayIndex;
                        const isActive =
                          selectedTimelineTarget === "text" && overlayIndex === selectedVideoTextIndex;
                        const overlayStartSec = Math.max(0, Number(overlay.startSec ?? 0) || 0);
                        const overlayDurationSec = Math.max(
                          0.5,
                          Number(overlay.durationSec ?? totalDurationSec) || totalDurationSec
                        );
                        const transitionPreview = buildElementTransitionPreviewStyle(
                          overlay.transition,
                          overlayStartSec,
                          overlayDurationSec
                        );
                        return (
                                  <div
                                    key={`video-text-${selectedScene.sceneNo}-${overlayIndex}-${isEditing ? "edit" : "view"}`}
                                    className={[
                                      "video-text-overlay",
                                      isActive ? "is-active" : "",
                                      isEditing ? "is-editing" : ""
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    contentEditable={isEditing}
                                    suppressContentEditableWarning={isEditing}
                                    spellCheck={false}
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    data-gramm="false"
                                    data-gramm_editor="false"
                                    data-video-text-scene-no={selectedScene.sceneNo}
                                    data-video-text-overlay-index={overlayIndex}
                                    onDoubleClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedVideoTextIndex(overlayIndex);
                                      setSelectedTimelineTarget("text");
                                      setSelectedAudioLayerId(null);
                                      setSelectedVideoMediaLayerId(null);
                                      setEditingVideoText({ sceneNo: selectedScene.sceneNo, overlayIndex });
                                      window.setTimeout(() => {
                                        const target = event.currentTarget;
                                        target.focus();
                                        const range = document.createRange();
                                        range.selectNodeContents(target);
                                        range.collapse(false);
                                        const selection = window.getSelection();
                                        selection?.removeAllRanges();
                                        selection?.addRange(range);
                                      }, 0);
                                    }}
                                    onMouseDown={(event) => beginVideoTextDrag(event, selectedScene, overlayIndex)}
                                    onBlur={(event) => {
                                      updateVideoTextOverlay(selectedScene.sceneNo, { text: event.currentTarget.innerText }, overlayIndex);
                                      setEditingVideoText(null);
                                    }}
                                    onKeyDown={(event) => {
                                      if (!isEditing) {
                                        return;
                                      }
                                      event.stopPropagation();
                                      if (event.key === "Escape") {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    style={{
                                      left: `${displayOverlay.xPct}%`,
                                      top: `${displayOverlay.yPct}%`,
                                      width: `${displayOverlay.widthPct}%`,
                                      height: `${displayOverlay.heightPct}%`,
                                      color: overlay.textColor,
                                      fontSize: overlay.fontSize,
                                      fontWeight: overlay.fontWeight,
                                      WebkitTextStroke: `${overlay.outlineThickness}px ${overlay.outlineColor}`,
                              textShadow: `0 4px 18px ${overlay.outlineColor}`,
                              background: overlay.backgroundColor ?? "transparent",
                              opacity: transitionPreview.opacityMultiplier,
                              transform: transitionPreview.transform
                            }}
                          >
                                    {overlay.text}
                                    {isActive && !isEditing
                                      ? CANVAS_RESIZE_HANDLES.map((handle) => (
                                          <button
                                            key={handle}
                                            type="button"
                                            className={`video-text-resize-handle video-text-resize-handle--${handle}`}
                                            aria-label={`Resize text ${handle}`}
                                            onMouseDown={(event) =>
                                              beginVideoTextDrag(event, selectedScene, overlayIndex, "resize", handle)
                                            }
                                          />
                                        ))
                                      : null}
                                  </div>
                                );
                              })
                            : null}
                          {isCardNewsModule
                            ? previewCardDesignBoxes.map((box) => {
                              const sourceIndex = box._sourceIndex;
                              const isActive = selectedBoxIndex === sourceIndex;
                              const isEditing =
                                editingPreviewBox?.sceneNo === selectedScene.sceneNo &&
                                editingPreviewBox.boxIndex === sourceIndex;
                              const textValue =
                                box.text !== undefined
                                  ? box.text
                                  : sourceIndex === 0
                                    ? selectedScene.text
                                    : "";
                              return (
                                <div
                                  className={[
                                    "card-preview-text-box",
                                    isActive ? "is-active" : "",
                                    isEditing ? "is-editing" : "",
                                    showCardBoxOutline ? "show-guide" : "",
                                    box.locked ? "is-locked" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  key={box.id ?? `preview-box-${selectedScene.sceneNo}-${sourceIndex}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (
                                      activeRichTextSelectionRef.current &&
                                      (activeRichTextSelectionRef.current.sceneNo !== selectedScene.sceneNo ||
                                        activeRichTextSelectionRef.current.boxIndex !== sourceIndex)
                                    ) {
                                      activeRichTextSelectionRef.current = null;
                                    }
                                    setSelectedBoxIndex(sourceIndex);
                                  }}
                                  onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    if (box.locked) {
                                      return;
                                    }
                                    setSelectedBoxIndex(sourceIndex);
                                    setEditingPreviewBox({
                                      sceneNo: selectedScene.sceneNo,
                                      boxIndex: sourceIndex
                                    });
                                    editingPreviewDirtyRef.current = false;
                                    window.setTimeout(() => {
                                      const target = event.currentTarget.querySelector<HTMLElement>(
                                        ".card-preview-text-content"
                                      );
                                      if (!target) {
                                        return;
                                      }
                                      target.focus();
                                      const selection = window.getSelection();
                                      const range = document.createRange();
                                      range.selectNodeContents(target);
                                      range.collapse(false);
                                      selection?.removeAllRanges();
                                      selection?.addRange(range);
                                    }, 0);
                                  }}
                                  onMouseDown={(event) => {
                                    if (isEditing) {
                                      event.stopPropagation();
                                      return;
                                    }
                                    if (event.button === 0) {
                                      beginCardDesignDrag(event, "move", selectedScene.sceneNo, sourceIndex, box);
                                    }
                                  }}
                                  tabIndex={0}
                                  style={{
                                    position: "absolute",
                                    left: `${box.xPct}%`,
                                    top: `${box.yPct}%`,
                                    width: `${box.widthPct}%`,
                                    height: `${box.heightPct}%`,
                                    padding: box.padding,
                                    background: box.backgroundColor,
                                    color: box.textColor,
                                    fontFamily: box.fontFamily ?? "GongGothic B",
                                    fontSize: box.fontSize,
                                    fontWeight: box.fontWeight,
                                    lineHeight: box.lineHeight,
                                    WebkitTextStroke: box.outlineEnabled
                                      ? `${box.outlineThickness ?? 0}px ${box.outlineColor ?? "#000000"}`
                                      : "0 transparent",
                                    paintOrder: "stroke fill",
                                    textShadow: buildCardTextShadow(box),
                                    display: "flex",
                                    alignItems:
                                      box.verticalAlign === "top"
                                        ? "flex-start"
                                        : box.verticalAlign === "bottom"
                                          ? "flex-end"
                                          : "center",
                                    justifyContent:
                                      box.align === "left"
                                        ? "flex-start"
                                        : box.align === "right"
                                          ? "flex-end"
                                          : "center",
                                    textAlign: box.align,
                                    borderRadius: 12,
                                    boxSizing: "border-box",
                                    whiteSpace: "pre-wrap",
                                    cursor: box.locked
                                      ? "not-allowed"
                                      : isEditing
                                        ? "text"
                                        : cardDesignDrag?.sceneNo === selectedScene.sceneNo
                                          ? "grabbing"
                                          : "grab",
                                    userSelect: isEditing ? "text" : "none",
                                    opacity: box.locked ? 0.75 : 1
                                  }}
                                >
                                  <div
                                    className="card-preview-text-content"
                                    key={`${box.id ?? sourceIndex}-${isEditing ? "editing" : "display"}`}
                                    contentEditable={isEditing}
                                    suppressContentEditableWarning={isEditing}
                                    spellCheck={false}
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    data-gramm="false"
                                    data-gramm_editor="false"
                                    tabIndex={isEditing ? 0 : -1}
                                    onInput={() => {
                                      if (isEditing) {
                                        editingPreviewDirtyRef.current = true;
                                      }
                                    }}
                                    onBlur={(event) => {
                                      if (!isEditing) {
                                        return;
                                      }
                                      const nextText = getPlainTextFromEditableElement(event.currentTarget);
                                      try {
                                        const nextRuns = normalizeCardRichTextRuns(
                                          extractCardRunsFromEditableElement(
                                            event.currentTarget,
                                            normalizeCardRichTextRuns(box.richTextRuns)
                                          )
                                        );
                                        updateCardDesign(selectedScene.sceneNo, sourceIndex, {
                                          text: nextText,
                                          richTextRuns: nextRuns
                                        });
                                      } catch (error) {
                                        console.error("Card text extraction failed", error);
                                        updateCardDesign(selectedScene.sceneNo, sourceIndex, {
                                          text: nextText,
                                          richTextRuns: undefined
                                        });
                                        setMessage(
                                          error instanceof Error
                                            ? `카드 텍스트 스타일 복원 실패: ${error.message}`
                                            : "카드 텍스트 스타일 복원 실패"
                                        );
                                      }
                                      editingPreviewDirtyRef.current = false;
                                      setEditingPreviewBox(null);
                                    }}
                                    onPaste={(event) => {
                                      if (!isEditing) {
                                        return;
                                      }
                                      event.preventDefault();
                                      const plainText = event.clipboardData.getData("text/plain");
                                      document.execCommand("insertText", false, plainText);
                                    }}
                                    onMouseDown={(event) => {
                                      if (isEditing) {
                                        event.stopPropagation();
                                      }
                                    }}
                                    onMouseUp={(event) => {
                                      if (isEditing) {
                                        captureRichTextSelection(
                                          selectedScene.sceneNo,
                                          sourceIndex,
                                          event.currentTarget
                                        );
                                      }
                                    }}
                                    onKeyUp={(event) => {
                                      if (isEditing) {
                                        captureRichTextSelection(
                                          selectedScene.sceneNo,
                                          sourceIndex,
                                          event.currentTarget
                                        );
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (!isEditing) {
                                        return;
                                      }
                                      event.stopPropagation();
                                      if (event.key === "Escape") {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    style={{
                                      width: "100%",
                                      maxWidth: "100%",
                                      minWidth: 0,
                                      whiteSpace: "pre-wrap",
                                      overflowWrap: "anywhere",
                                      wordBreak: "keep-all",
                                      textAlign: box.align,
                                      outline: "none"
                                    }}
                                  >
                                    {(() => {
                                      const safeRuns = normalizeCardRichTextRuns(box.richTextRuns);
                                      if (!safeRuns) {
                                        return textValue;
                                      }
                                      try {
                                        return safeRuns.map((run, runIndex) => (
                                          <span
                                            key={`${box.id ?? sourceIndex}-run-${runIndex}`}
                                            data-card-run-index={runIndex}
                                            style={buildCardRunStyle(box, run)}
                                          >
                                            {run.text}
                                          </span>
                                        ));
                                      } catch (error) {
                                        console.error("Card rich text render failed", error);
                                        return getCardPlainTextFromRuns(safeRuns) || textValue;
                                      }
                                    })()}
                                  </div>
                                  {!box.locked ? (
                                    <div
                                      className="card-preview-resize-handle"
                                      aria-label={isKorean ? "텍스트 박스 크기 조절" : "Resize text box"}
                                      onMouseDown={(event) => {
                                        event.stopPropagation();
                                        beginCardDesignDrag(event, "resize", selectedScene.sceneNo, sourceIndex, box);
                                      }}
                                    />
                                  ) : null}
                                </div>
                              );
                            })
                            : null}
                          {snapGuides.verticalPct !== undefined ? (
                            <div
                              style={{
                                position: "absolute",
                                left: `${snapGuides.verticalPct}%`,
                                top: 0,
                                bottom: 0,
                                width: 1,
                                background: "rgba(255,126,95,0.9)",
                                pointerEvents: "none"
                              }}
                            />
                          ) : null}
                          {snapGuides.horizontalPct !== undefined ? (
                            <div
                              style={{
                                position: "absolute",
                                top: `${snapGuides.horizontalPct}%`,
                                left: 0,
                                right: 0,
                                height: 1,
                                background: "rgba(255,126,95,0.9)",
                                pointerEvents: "none"
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="video-canvas-frame"
                        style={buildZoomedVideoCanvasStyle()}
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget) {
                            clearVideoEditorSelection();
                          }
                        }}
                      >
                        {activePreviewAsset.kind === "video" ? (
                          <video
                            ref={previewVideoRef}
                            src={activePreviewAsset.src}
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            onError={() =>
                              setPreviewAssetIndex((current) =>
                                Math.min(current + 1, sceneAssetCandidates.length)
                              )
                            }
                          />
                        ) : (
                          <img
                            src={activePreviewAsset.src}
                            alt={isKorean ? "씬 미리보기" : "Scene preview"}
                            onError={() =>
                              setPreviewAssetIndex((current) =>
                                Math.min(current + 1, sceneAssetCandidates.length)
                              )
                            }
                          />
                        )}
                        {renderMobileSafeAreaGuides()}
                        {activeVideoMediaLayers.map((layer) => {
                          const src = getVideoMediaLayerSrc(layer);
                          if (!src) {
                            return null;
                          }
                          const box = getVideoMediaLayerDisplayBox(layer);
                          const layerStartSec = Math.max(0, Number(layer.startSec || 0));
                          const layerDurationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
                          const transitionPreview = buildElementTransitionPreviewStyle(
                            layer.transition,
                            layerStartSec,
                            layerDurationSec
                          );
                          const style: CSSProperties = {
                            position: "absolute",
                            left: `${box.xPct}%`,
                            top: `${box.yPct}%`,
                            zIndex: 2,
                            width: `${box.widthPct}%`,
                            height: `${box.heightPct}%`,
                            transform: `translate(-50%, -50%)${transitionPreview.transform ? ` ${transitionPreview.transform}` : ""}`,
                            objectFit: "cover",
                            opacity: (layer.opacity ?? 1) * transitionPreview.opacityMultiplier,
                            pointerEvents: "auto",
                            cursor: timelinePlaying ? "default" : "grab"
                          };
                          const frameClipStyle = buildVideoMediaLayerFrameClipStyle(layer);
                          const sourceCropStyle = buildVideoMediaLayerSourceStyle(layer);
                          const mediaMotionStyle =
                            pickingMotionFocusLayerId === layer.id || pausedMotionPreviewLayerId === layer.id
                              ? {}
                              : buildMediaMotionPreviewStyle(
                                  layer.motion,
                                  layerStartSec,
                                  layerDurationSec
                                );
                          const isActive = selectedTimelineTarget === "media" && layer.id === selectedVideoMediaLayerId;
                          const outlineStyle: CSSProperties = {
                            position: "absolute",
                            left: `${box.xPct}%`,
                            top: `${box.yPct}%`,
                            zIndex: 8,
                            width: `${box.widthPct}%`,
                            height: `${box.heightPct}%`,
                            transform: "translate(-50%, -50%)"
                          };
                          return (
                            <>
                              <div
                                key={layer.id}
                                className={[
                                  "video-media-layer-shell",
                                  pickingMotionFocusLayerId === layer.id ? "is-picking-motion-focus" : ""
                                ].filter(Boolean).join(" ")}
                                data-video-media-layer-id={layer.id}
                                onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                                style={{ ...style, ...frameClipStyle, overflow: "hidden" }}
                              >
                                <div className="video-media-motion-frame" style={mediaMotionStyle}>
                                  {layer.mediaType === "video" ? (
                                    <video
                                      ref={(element) => {
                                        mediaLayerVideoRefs.current[layer.id] = element;
                                      }}
                                      className="video-media-layer"
                                      style={{ ...sourceCropStyle, objectFit: "cover" }}
                                      src={src}
                                      playsInline
                                      loop
                                      preload="metadata"
                                      onLoadedMetadata={(event) => {
                                        updateVideoMediaLayerNaturalSize(
                                          layer,
                                          event.currentTarget.videoWidth,
                                          event.currentTarget.videoHeight,
                                          {
                                            durationSec: Number.isFinite(event.currentTarget.duration)
                                              ? event.currentTarget.duration
                                              : undefined
                                          }
                                        );
                                        syncMediaLayerVideo(layer, event.currentTarget, { forceSeek: true });
                                      }}
                                      onCanPlay={(event) =>
                                        syncMediaLayerVideo(layer, event.currentTarget, { controlPlayback: false })
                                      }
                                    />
                                  ) : (
                                    <img
                                      className="video-media-layer"
                                      style={{ ...sourceCropStyle, objectFit: "cover" }}
                                      src={src}
                                      alt={layer.label ?? "media layer"}
                                      onLoad={(event) =>
                                        updateVideoMediaLayerNaturalSize(
                                          layer,
                                          event.currentTarget.naturalWidth,
                                          event.currentTarget.naturalHeight
                                        )
                                      }
                                    />
                                  )}
                                </div>
                                {isActive && normalizeMediaMotion(layer.motion).style !== "none" ? (
                                  <span
                                    className="video-motion-focus-marker"
                                    style={{
                                      left: `${normalizeMediaMotion(layer.motion).focusXPct}%`,
                                      top: `${normalizeMediaMotion(layer.motion).focusYPct}%`
                                    }}
                                  />
                                ) : null}
                              </div>
                              {isActive
                                ? (
                                    <div
                                      className={[
                                        "video-media-layer-outline",
                                        croppingVideoMediaLayerId === layer.id ? "is-cropping" : ""
                                      ].filter(Boolean).join(" ")}
                                      data-video-media-layer-id={layer.id}
                                      style={outlineStyle}
                                      onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                                    >
                                      <button
                                        type="button"
                                        className="video-media-crop-button"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setCroppingVideoMediaLayerId((current) => current === layer.id ? null : layer.id);
                                        }}
                                      >
                                        Crop
                                      </button>
                                      {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => (
                                        <button
                                          key={handle}
                                          type="button"
                                          className={`video-media-resize-handle video-media-resize-handle--${handle}`}
                                          aria-label={`Resize media ${handle}`}
                                          onMouseDown={(event) => beginVideoMediaResize(event, layer, handle)}
                                        />
                                      ))}
                                      {croppingVideoMediaLayerId === layer.id
                                        ? VIDEO_MEDIA_CROP_HANDLES.map((handle) => (
                                            <button
                                              key={`crop-${handle}`}
                                              type="button"
                                              className={`video-media-crop-handle video-media-crop-handle--${handle}`}
                                              aria-label={`Crop media ${handle}`}
                                              onMouseDown={(event) => beginVideoMediaCrop(event, layer, handle)}
                                            />
                                          ))
                                        : null}
                                    </div>
                                  )
                                : null}
                            </>
                          );
                        })}
                        {selectedVideoTextOverlays.map((overlay, overlayIndex) => {
                          const localTime = timelineTimeSec;
                          const isVisible =
                            localTime >= (overlay.startSec ?? 0) &&
                            localTime < (overlay.startSec ?? 0) + (overlay.durationSec ?? totalDurationSec);
                          if (!isVisible) {
                            return null;
                          }
                          const displayOverlay = getVideoTextOverlayDisplay(
                            selectedScene.sceneNo,
                            overlay,
                            overlayIndex
                          );
                          const isEditing =
                            editingVideoText?.sceneNo === selectedScene.sceneNo &&
                            editingVideoText.overlayIndex === overlayIndex;
                          const isActive =
                            selectedTimelineTarget === "text" && overlayIndex === selectedVideoTextIndex;
                          const overlayStartSec = Math.max(0, Number(overlay.startSec ?? 0) || 0);
                          const overlayDurationSec = Math.max(
                            0.5,
                            Number(overlay.durationSec ?? totalDurationSec) || totalDurationSec
                          );
                          const transitionPreview = buildElementTransitionPreviewStyle(
                            overlay.transition,
                            overlayStartSec,
                            overlayDurationSec
                          );
                          return (
                            <div
                              key={`video-text-${selectedScene.sceneNo}-${overlayIndex}-${isEditing ? "edit" : "view"}`}
                              className={[
                                "video-text-overlay",
                                isActive ? "is-active" : "",
                                isEditing ? "is-editing" : ""
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              contentEditable={isEditing}
                              suppressContentEditableWarning={isEditing}
                              spellCheck={false}
                              autoCorrect="off"
                              autoCapitalize="off"
                              data-gramm="false"
                              data-gramm_editor="false"
                              data-video-text-scene-no={selectedScene.sceneNo}
                              data-video-text-overlay-index={overlayIndex}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setSelectedVideoTextIndex(overlayIndex);
                                setSelectedVideoMediaLayerId(null);
                                setSelectedAudioLayerId(null);
                                setSelectedTimelineTarget("text");
                                setEditingVideoText({ sceneNo: selectedScene.sceneNo, overlayIndex });
                                window.setTimeout(() => {
                                  const target = event.currentTarget;
                                  target.focus();
                                  const range = document.createRange();
                                  range.selectNodeContents(target);
                                  range.collapse(false);
                                  const selection = window.getSelection();
                                  selection?.removeAllRanges();
                                  selection?.addRange(range);
                                }, 0);
                              }}
                              onMouseDown={(event) => beginVideoTextDrag(event, selectedScene, overlayIndex)}
                              onBlur={(event) => {
                                updateVideoTextOverlay(selectedScene.sceneNo, { text: event.currentTarget.innerText }, overlayIndex);
                                setEditingVideoText(null);
                              }}
                              onKeyDown={(event) => {
                                if (!isEditing) {
                                  return;
                                }
                                event.stopPropagation();
                                if (event.key === "Escape") {
                                  event.currentTarget.blur();
                                }
                              }}
                              style={{
                                left: `${displayOverlay.xPct}%`,
                                top: `${displayOverlay.yPct}%`,
                                width: `${displayOverlay.widthPct}%`,
                                height: `${displayOverlay.heightPct}%`,
                                color: overlay.textColor,
                                fontSize: overlay.fontSize,
                                fontWeight: overlay.fontWeight,
                                WebkitTextStroke: `${overlay.outlineThickness}px ${overlay.outlineColor}`,
                                textShadow: `0 4px 18px ${overlay.outlineColor}`,
                                background: overlay.backgroundColor ?? "transparent",
                                opacity: transitionPreview.opacityMultiplier,
                                transform: transitionPreview.transform
                              }}
                            >
                              {overlay.text}
                              {isActive && !isEditing
                                ? CANVAS_RESIZE_HANDLES.map((handle) => (
                                    <button
                                      key={handle}
                                      type="button"
                                      className={`video-text-resize-handle video-text-resize-handle--${handle}`}
                                      aria-label={`Resize text ${handle}`}
                                      onMouseDown={(event) =>
                                        beginVideoTextDrag(event, selectedScene, overlayIndex, "resize", handle)
                                      }
                                    />
                                  ))
                                : null}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : !isCardNewsModule ? (
                    <div
                      className="video-canvas-frame video-canvas-frame--blank"
                      style={buildZoomedVideoCanvasStyle({
                        background: selectedScene.backgroundColor ?? "#ffffff"
                      })}
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          clearVideoEditorSelection();
                        }
                      }}
                    >
                      {renderMobileSafeAreaGuides()}
                      {activeVideoMediaLayers.map((layer) => {
                        const src = getVideoMediaLayerSrc(layer);
                        if (!src) {
                          return null;
                        }
                        const box = getVideoMediaLayerDisplayBox(layer);
                        const layerStartSec = Math.max(0, Number(layer.startSec || 0));
                        const layerDurationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
                        const transitionPreview = buildElementTransitionPreviewStyle(
                          layer.transition,
                          layerStartSec,
                          layerDurationSec
                        );
                        const style: CSSProperties = {
                          position: "absolute",
                          left: `${box.xPct}%`,
                          top: `${box.yPct}%`,
                          zIndex: 2,
                          width: `${box.widthPct}%`,
                          height: `${box.heightPct}%`,
                          transform: `translate(-50%, -50%)${transitionPreview.transform ? ` ${transitionPreview.transform}` : ""}`,
                          objectFit: "cover",
                          opacity: (layer.opacity ?? 1) * transitionPreview.opacityMultiplier,
                          pointerEvents: "auto",
                          cursor: timelinePlaying ? "default" : "grab"
                        };
                        const frameClipStyle = buildVideoMediaLayerFrameClipStyle(layer);
                        const sourceCropStyle = buildVideoMediaLayerSourceStyle(layer);
                        const mediaMotionStyle =
                          pickingMotionFocusLayerId === layer.id || pausedMotionPreviewLayerId === layer.id
                            ? {}
                            : buildMediaMotionPreviewStyle(
                                layer.motion,
                                layerStartSec,
                                layerDurationSec
                              );
                        const isActive = selectedTimelineTarget === "media" && layer.id === selectedVideoMediaLayerId;
                        const outlineStyle: CSSProperties = {
                          position: "absolute",
                          left: `${box.xPct}%`,
                          top: `${box.yPct}%`,
                          zIndex: 8,
                          width: `${box.widthPct}%`,
                          height: `${box.heightPct}%`,
                          transform: "translate(-50%, -50%)"
                        };
                        return (
                          <>
                            <div
                              key={layer.id}
                              className={[
                                "video-media-layer-shell",
                                pickingMotionFocusLayerId === layer.id ? "is-picking-motion-focus" : ""
                              ].filter(Boolean).join(" ")}
                              data-video-media-layer-id={layer.id}
                              onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                              style={{ ...style, ...frameClipStyle, overflow: "hidden" }}
                            >
                              <div className="video-media-motion-frame" style={mediaMotionStyle}>
                                {layer.mediaType === "video" ? (
                                  <video
                                    ref={(element) => {
                                      mediaLayerVideoRefs.current[layer.id] = element;
                                    }}
                                    className="video-media-layer"
                                    style={{ ...sourceCropStyle, objectFit: "cover" }}
                                    src={src}
                                    playsInline
                                    loop
                                    preload="metadata"
                                    onLoadedMetadata={(event) => {
                                      updateVideoMediaLayerNaturalSize(
                                        layer,
                                        event.currentTarget.videoWidth,
                                        event.currentTarget.videoHeight,
                                        {
                                          durationSec: Number.isFinite(event.currentTarget.duration)
                                            ? event.currentTarget.duration
                                            : undefined
                                        }
                                      );
                                      syncMediaLayerVideo(layer, event.currentTarget, { forceSeek: true });
                                    }}
                                    onCanPlay={(event) =>
                                      syncMediaLayerVideo(layer, event.currentTarget, { controlPlayback: false })
                                    }
                                  />
                                ) : (
                                  <img
                                    className="video-media-layer"
                                    style={{ ...sourceCropStyle, objectFit: "cover" }}
                                    src={src}
                                    alt={layer.label ?? "media layer"}
                                    onLoad={(event) =>
                                      updateVideoMediaLayerNaturalSize(
                                        layer,
                                        event.currentTarget.naturalWidth,
                                        event.currentTarget.naturalHeight
                                      )
                                    }
                                  />
                                )}
                              </div>
                              {isActive && normalizeMediaMotion(layer.motion).style !== "none" ? (
                                <span
                                  className="video-motion-focus-marker"
                                  style={{
                                    left: `${normalizeMediaMotion(layer.motion).focusXPct}%`,
                                    top: `${normalizeMediaMotion(layer.motion).focusYPct}%`
                                  }}
                                />
                              ) : null}
                            </div>
                            {isActive
                              ? (
                                  <div
                                    className={[
                                      "video-media-layer-outline",
                                      croppingVideoMediaLayerId === layer.id ? "is-cropping" : ""
                                    ].filter(Boolean).join(" ")}
                                    data-video-media-layer-id={layer.id}
                                    style={outlineStyle}
                                    onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                                  >
                                    <button
                                      type="button"
                                      className="video-media-crop-button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setCroppingVideoMediaLayerId((current) => current === layer.id ? null : layer.id);
                                      }}
                                    >
                                      Crop
                                    </button>
                                    {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => (
                                      <button
                                        key={handle}
                                        type="button"
                                        className={`video-media-resize-handle video-media-resize-handle--${handle}`}
                                        aria-label={`Resize media ${handle}`}
                                        onMouseDown={(event) => beginVideoMediaResize(event, layer, handle)}
                                      />
                                    ))}
                                    {croppingVideoMediaLayerId === layer.id
                                      ? VIDEO_MEDIA_CROP_HANDLES.map((handle) => (
                                          <button
                                            key={`crop-${handle}`}
                                            type="button"
                                            className={`video-media-crop-handle video-media-crop-handle--${handle}`}
                                            aria-label={`Crop media ${handle}`}
                                            onMouseDown={(event) => beginVideoMediaCrop(event, layer, handle)}
                                          />
                                        ))
                                      : null}
                                  </div>
                                )
                              : null}
                          </>
                        );
                      })}
                      {selectedVideoTextOverlays.map((overlay, overlayIndex) => {
                        const localTime = timelineTimeSec;
                          const isVisible =
                            localTime >= (overlay.startSec ?? 0) &&
                            localTime < (overlay.startSec ?? 0) + (overlay.durationSec ?? totalDurationSec);
                        if (!isVisible) {
                          return null;
                        }
                        const displayOverlay = getVideoTextOverlayDisplay(
                          selectedScene.sceneNo,
                          overlay,
                          overlayIndex
                        );
                        const isEditing =
                          editingVideoText?.sceneNo === selectedScene.sceneNo &&
                          editingVideoText.overlayIndex === overlayIndex;
                        const isActive =
                          selectedTimelineTarget === "text" && overlayIndex === selectedVideoTextIndex;
                        const overlayStartSec = Math.max(0, Number(overlay.startSec ?? 0) || 0);
                        const overlayDurationSec = Math.max(
                          0.5,
                          Number(overlay.durationSec ?? totalDurationSec) || totalDurationSec
                        );
                        const transitionPreview = buildElementTransitionPreviewStyle(
                          overlay.transition,
                          overlayStartSec,
                          overlayDurationSec
                        );
                        return (
                          <div
                            key={`video-text-${selectedScene.sceneNo}-${overlayIndex}-${isEditing ? "edit" : "view"}`}
                            className={[
                              "video-text-overlay",
                              isActive ? "is-active" : "",
                              isEditing ? "is-editing" : ""
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            contentEditable={isEditing}
                            suppressContentEditableWarning={isEditing}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                            data-gramm="false"
                            data-gramm_editor="false"
                            data-video-text-scene-no={selectedScene.sceneNo}
                            data-video-text-overlay-index={overlayIndex}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setSelectedVideoTextIndex(overlayIndex);
                                setSelectedVideoMediaLayerId(null);
                                setSelectedAudioLayerId(null);
                                setSelectedTimelineTarget("text");
                                setEditingVideoText({ sceneNo: selectedScene.sceneNo, overlayIndex });
                              window.setTimeout(() => {
                                const target = event.currentTarget;
                                target.focus();
                                const range = document.createRange();
                                range.selectNodeContents(target);
                                range.collapse(false);
                                const selection = window.getSelection();
                                selection?.removeAllRanges();
                                selection?.addRange(range);
                              }, 0);
                            }}
                            onMouseDown={(event) => beginVideoTextDrag(event, selectedScene, overlayIndex)}
                            onBlur={(event) => {
                              updateVideoTextOverlay(selectedScene.sceneNo, { text: event.currentTarget.innerText }, overlayIndex);
                              setEditingVideoText(null);
                            }}
                            onKeyDown={(event) => {
                              if (!isEditing) {
                                return;
                              }
                              event.stopPropagation();
                              if (event.key === "Escape") {
                                event.currentTarget.blur();
                              }
                            }}
                            style={{
                              left: `${displayOverlay.xPct}%`,
                              top: `${displayOverlay.yPct}%`,
                              width: `${displayOverlay.widthPct}%`,
                              height: `${displayOverlay.heightPct}%`,
                              color: overlay.textColor,
                              fontSize: overlay.fontSize,
                              fontWeight: overlay.fontWeight,
                              WebkitTextStroke: `${overlay.outlineThickness}px ${overlay.outlineColor}`,
                              textShadow: `0 4px 18px ${overlay.outlineColor}`,
                              background: overlay.backgroundColor ?? "transparent",
                              opacity: transitionPreview.opacityMultiplier,
                              transform: transitionPreview.transform
                            }}
                          >
                            {overlay.text}
                            {isActive && !isEditing
                              ? CANVAS_RESIZE_HANDLES.map((handle) => (
                                  <button
                                    key={handle}
                                    type="button"
                                    className={`video-text-resize-handle video-text-resize-handle--${handle}`}
                                    aria-label={`Resize text ${handle}`}
                                    onMouseDown={(event) =>
                                      beginVideoTextDrag(event, selectedScene, overlayIndex, "resize", handle)
                                    }
                                  />
                                ))
                              : null}
                          </div>
                        );
                      })}
                      {snapGuides.verticalPct !== undefined ? (
                        <div
                          className="canvas-snap-guide canvas-snap-guide--vertical"
                          style={{ left: `${snapGuides.verticalPct}%` }}
                        />
                      ) : null}
                      {snapGuides.horizontalPct !== undefined ? (
                        <div
                          className="canvas-snap-guide canvas-snap-guide--horizontal"
                          style={{ top: `${snapGuides.horizontalPct}%` }}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p className="subtle">
                      {isKorean ? "아직 미리보기 이미지가 없습니다." : "No generated scene preview is available yet."}
                    </p>
                  )}
                  </div>
                </div>

                {isCardNewsModule ? (
                  <div className="meta-list">
                    {selectedScene.sceneNo === 1 ? (
                      <div>
                        <strong>{moduleCopy.assetSearchQuery}</strong>
                        <span>{selectedScene.assetSearchQuery || "-"}</span>
                      </div>
                    ) : (
                      <div>
                        <strong>{isKorean ? "카드 배경" : "Card Background"}</strong>
                        <span>{isKorean ? "선택한 템플릿 또는 공통 배경 사용" : "Selected template or shared background"}</span>
                      </div>
                    )}
                    <>
                      <div>
                        <strong>{isKorean ? "레이아웃" : "Layout"}</strong>
                        <span>{editableDocument.cardNews?.layoutPreset ?? "headline_focus"}</span>
                      </div>
                      <div>
                        <strong>{isKorean ? "전환" : "Transition"}</strong>
                        <span>{editableDocument.cardNews?.transitionStyle ?? "cut"}</span>
                      </div>
                      <div>
                        <strong>{isKorean ? "출력" : "Output"}</strong>
                        <span>{editableDocument.cardNews?.outputFormat ?? "square_1_1"}</span>
                      </div>
                    </>
                  </div>
                ) : null}

                {isCardNewsModule ? (
                  <div className="generation-preview-text">
                    <p className="eyebrow">{textFieldLabel}</p>
                    <p>{selectedScene.text}</p>
                  </div>
                ) : null}

                {!isCardNewsModule ? (
                  <div className="audio-layer-sinks" aria-hidden="true">
                    {audioLayers.map((layer) => {
                      const src = getAudioLayerSrc(layer);
                      if (!src) {
                        return null;
                      }
                      return (
                        <audio
                          key={`audio-layer-${layer.id}`}
                          ref={(element) => {
                            audioLayerRefs.current[layer.id] = element;
                          }}
                          src={src}
                          preload="metadata"
                          onLoadedMetadata={(event) =>
                            syncAudioLayer(layer, event.currentTarget, {
                              forceSeek: true,
                              controlPlayback: false
                            })
                          }
                        />
                      );
                    })}
                  </div>
                ) : null}

                <div className="generation-timeline" onWheel={handleTimelineWheel}>
                  {!isCardNewsModule ? (
                    <>
                      <div className="video-timeline-header">
                        <div className="video-timeline-playback">
                          <button
                            type="button"
                            className="video-play-button"
                            onClick={() => {
                              if (timelineTimeSec >= totalDurationSec) {
                                seekTimeline(0);
                              }
                              setTimelinePlaying((value) => !value);
                            }}
                          >
                            {timelinePlaying ? "⏸" : "▶"}
                          </button>
                          <p className="eyebrow">{isKorean ? "Timeline" : "Timeline"}</p>
                        </div>
                        <strong>
                          {Math.floor(timelineTimeSec / 60)}:{String(Math.floor(timelineTimeSec % 60)).padStart(2, "0")} /{" "}
                          {Math.floor(totalDurationSec / 60)}:{String(Math.floor(totalDurationSec % 60)).padStart(2, "0")}
                        </strong>
                        <button type="button" className="video-tool-button" onClick={addVideoSceneAfterSelected}>
                          {isKorean ? "씬 추가" : "Add Scene"}
                        </button>
                        <button
                          type="button"
                          className="video-tool-button danger"
                          onClick={() => selectedScene && removeSceneAtTimeline(selectedScene.sceneNo)}
                          disabled={editableDocument.scenes.length <= 1}
                        >
                          {isKorean ? "씬 제거" : "Remove Scene"}
                        </button>
                      </div>
                      <div
                        className="video-timeline-body"
                        style={{
                          width: timelineContentWidth,
                          minWidth: timelineZoom >= 1 ? "100%" : timelineContentWidth
                        }}
                        onMouseDown={(event) => {
                          const target = event.target as HTMLElement;
                          if (
                            event.button !== 0 ||
                            target.closest(".video-element-clip, .video-timeline-segment, .video-timeline-ruler, button")
                          ) {
                            return;
                          }
                          clearVideoEditorSelection();
                          if (!target.closest(".video-element-track-lane")) {
                            return;
                          }
                          event.preventDefault();
                          setTimelineSelectionBox({
                            startX: event.clientX,
                            startY: event.clientY,
                            currentX: event.clientX,
                            currentY: event.clientY
                          });
                        }}
                      >
                        <span
                          className="video-timeline-playhead video-timeline-playhead--full"
                          style={{ left: timelinePlayheadLeft }}
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            beginTimelineSeekDrag(event);
                          }}
                        />
                        {timelineSeekTooltip ? (
                          <span
                            className="video-timeline-seek-tooltip"
                            style={{ left: `${timelineSeekTooltip.x}px`, top: `${timelineSeekTooltip.y - 12}px` }}
                          >
                            {formatTimelineTooltipSeconds(timelineSeekTooltip.timeSec)}
                          </span>
                        ) : null}
                        {timelineSelectionBox ? (
                          <span
                            className="video-timeline-selection-box"
                            style={{
                              left: `${Math.min(timelineSelectionBox.startX, timelineSelectionBox.currentX)}px`,
                              top: `${Math.min(timelineSelectionBox.startY, timelineSelectionBox.currentY)}px`,
                              width: `${Math.abs(timelineSelectionBox.currentX - timelineSelectionBox.startX)}px`,
                              height: `${Math.abs(timelineSelectionBox.currentY - timelineSelectionBox.startY)}px`
                            }}
                          />
                        ) : null}
                        <div
                          className="video-timeline-ruler"
                          onMouseDown={(event) => {
                            beginTimelineSeekDrag(event);
                          }}
                        >
                          {timelineTickMarks.map((tick) => (
                            <span
                              key={`timeline-tick-${tick}`}
                              style={{ left: `${(tick / timelineDisplayDurationSec) * 100}%` }}
                            >
                              {tick}s
                            </span>
                          ))}
                        </div>
                        <div
                          className="video-timeline-track"
                          ref={timelineTrackRef}
                          onMouseDown={(event) => {
                            if (event.button !== 0 || (event.target as HTMLElement).closest("button")) {
                              return;
                            }
                            beginTimelineSeekDrag(event);
                          }}
                        >
                          {timelineSegments.map((segment) => {
                            const displaySegment = getTimelineDisplaySegment(segment.scene.sceneNo) ?? segment;
                            return (
                              <div
                                key={`timeline-segment-${segment.scene.sceneNo}`}
                                className={
                                  selectedTimelineTarget === "scene" && segment.scene.sceneNo === selectedScene.sceneNo
                                    ? "video-timeline-segment active"
                                    : "video-timeline-segment"
                                }
                                style={{
                                  left: `${(displaySegment.startSec / timelineDisplayDurationSec) * 100}%`,
                                  width: `${(displaySegment.durationSec / timelineDisplayDurationSec) * 100}%`,
                                  background: segment.scene.backgroundColor ?? "#dff8fb",
                                  color: getReadableTextColorForBackground(segment.scene.backgroundColor ?? "#dff8fb")
                                }}
                                onMouseDown={(event) => beginTimelineSceneTrackMove(event, segment.scene)}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (suppressSceneClickSelectionRef.current) {
                                      suppressSceneClickSelectionRef.current = false;
                                      return;
                                    }
                                    setSelectedSceneNo(segment.scene.sceneNo);
                                    setSelectedVideoTextIndex(0);
                                    setSelectedAudioLayerId(null);
                                    setSelectedVideoMediaLayerId(null);
                                    setSelectedTimelineTarget("scene");
                                    seekTimeline(segment.startSec);
                                  }}
                                >
                                  <span>{moduleCopy.sceneLabel} {segment.scene.sceneNo}</span>
                                  <small>{formatTimelineSeconds(segment.durationSec)}</small>
                                </button>
                                <span className="video-timeline-duration-badge">{formatTimelineSeconds(segment.durationSec)}</span>
                                <button
                                  type="button"
                                  className="video-timeline-resize-handle"
                                  aria-label={`${moduleCopy.sceneLabel} ${segment.scene.sceneNo} length resize`}
                                  onMouseDown={(event) => beginTimelineSceneResize(event, segment.scene)}
                                />
                              </div>
                            );
                          })}
                        </div>
                        {videoMediaLayers.length > 0 ? (
                        <div className="video-element-track video-media-track">
                          <span className="video-track-label">Media</span>
                          <div
                            className="video-element-track-lane"
                            style={{
                              height: `${Math.max(70, 12 + videoMediaTrackCount * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT)}px`
                            }}
                          >
                            {videoMediaLayers.map((layer) => {
                              const startSec = Math.max(0, Math.min(totalDurationSec - 0.5, Number(layer.startSec || 0)));
                              const durationSec = Math.max(
                                0.5,
                                Math.min(totalDurationSec - startSec, Number(layer.durationSec || 0.5))
                              );
                              const trackIndex = Math.max(0, Number(layer.trackIndex ?? 0) || 0);
                              return (
                                <div
                                  key={`media-track-${layer.id}`}
                                  className={[
                                    "video-element-clip",
                                    "video-media-clip",
                                    selectedTimelineTarget === "media" && layer.id === selectedVideoMediaLayerId ? "active" : "",
                                    isTimelineItemSelected({ kind: "media", id: layer.id }) ? "multi-selected" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  data-timeline-kind="media"
                                  data-timeline-id={layer.id}
                                  data-timeline-key={`media:${layer.id}`}
                                  style={{
                                    left: `${(startSec / timelineDisplayDurationSec) * 100}%`,
                                    width: `${(durationSec / timelineDisplayDurationSec) * 100}%`,
                                    top: `${6 + trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`
                                  }}
                                  onMouseDown={(event) => beginTimelineMediaTrackMove(event, layer)}
                                  onClick={(event) => selectTimelineItem({ kind: "media", id: layer.id }, event)}
                                >
                                  <span>{layer.label || (layer.mediaType === "video" ? "Video" : "Image")}</span>
                                  <small>{formatTimelineSeconds(startSec)} · {formatTimelineSeconds(durationSec)}</small>
                                  <button
                                    type="button"
                                    className="video-element-resize-handle"
                                    aria-label={`Media length resize ${layer.label ?? layer.id}`}
                                    onMouseDown={(event) => beginTimelineMediaResize(event, layer)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        ) : null}
                        {audioLayers.length > 0 ? (
                        <div className="video-element-track video-audio-track">
                          <span className="video-track-label">Voice</span>
                          <div
                            className="video-element-track-lane"
                            style={{
                              height: `${Math.max(70, 12 + audioTrackCount * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT)}px`
                            }}
                          >
                            {audioLayers.map((layer) => {
                              const startSec = Math.max(0, Math.min(totalDurationSec - 0.5, Number(layer.startSec || 0)));
                              const durationSec = Math.max(
                                0.5,
                                Math.min(totalDurationSec - startSec, Number(layer.durationSec || 0.5))
                              );
                              const trackIndex = Math.max(0, Number(layer.trackIndex ?? 0) || 0);
                              const waveformTargetBars = Math.max(
                                14,
                                Math.min(
                                  150,
                                  Math.round((durationSec / Math.max(1, timelineDisplayDurationSec)) * 360)
                                )
                              );
                              const waveformPeaks = getVisibleWaveformPeaks(
                                audioWaveforms[layer.id],
                                Math.max(0, Number(layer.sourceOffsetSec ?? 0) || 0),
                                durationSec,
                                waveformTargetBars
                              );
                              return (
                                <div
                                  key={`audio-track-${layer.id}`}
                                  className={[
                                    "video-element-clip",
                                    "video-audio-clip",
                                    selectedTimelineTarget === "audio" && layer.id === selectedAudioLayerId ? "active" : "",
                                    isTimelineItemSelected({ kind: "audio", id: layer.id }) ? "multi-selected" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  data-timeline-kind="audio"
                                  data-timeline-id={layer.id}
                                  data-timeline-key={`audio:${layer.id}`}
                                  style={{
                                    left: `${(startSec / timelineDisplayDurationSec) * 100}%`,
                                    width: `${(durationSec / timelineDisplayDurationSec) * 100}%`,
                                    top: `${6 + trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`
                                  }}
                                  onMouseDown={(event) => beginTimelineAudioTrackMove(event, layer)}
                                  onClick={(event) => selectTimelineItem({ kind: "audio", id: layer.id }, event)}
                                >
                                  {waveformPeaks.length > 0 ? (
                                    <div className="video-audio-waveform" aria-hidden="true">
                                      {waveformPeaks.map((peak, peakIndex) => (
                                        <i
                                          key={`audio-wave-${layer.id}-${peakIndex}`}
                                          style={{ height: `${Math.max(12, peak * 100)}%` }}
                                        />
                                      ))}
                                    </div>
                                  ) : null}
                                  <span>{layer.label || "Voice"}</span>
                                  <small>{formatTimelineSeconds(startSec)} · {formatTimelineSeconds(durationSec)}</small>
                                  <button
                                    type="button"
                                    className="video-element-resize-handle"
                                    aria-label={`Voice length resize ${layer.label ?? layer.id}`}
                                    onMouseDown={(event) => beginTimelineAudioResize(event, layer)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        ) : null}
                        {videoTextLayers.length > 0 ? (
                        <div className="video-element-track">
                          <span className="video-track-label">Text</span>
                          <div
                            className="video-element-track-lane"
                            style={{
                              height: `${Math.max(100, 12 + videoElementTrackCount * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT)}px`
                            }}
                          >
                            {videoTextLayers.map((overlay, overlayIndex) => {
                              const startSec = Math.max(0, Math.min(totalDurationSec - 0.5, Number(overlay.startSec ?? 0) || 0));
                              const durationSec = Math.min(
                                Math.max(0.5, totalDurationSec - startSec),
                                Math.max(0.5, Number(overlay.durationSec ?? 5) || 0.5)
                              );
                              const trackIndex = Math.max(0, Number(overlay.trackIndex ?? 0) || 0);
                              return (
                                <div
                                  key={`text-track-global-${overlayIndex}`}
                                  className={[
                                    "video-element-clip",
                                    selectedTimelineTarget === "text" && overlayIndex === selectedVideoTextIndex
                                      ? "active"
                                      : "",
                                    isTimelineItemSelected({ kind: "text", index: overlayIndex }) ? "multi-selected" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  data-timeline-kind="text"
                                  data-timeline-index={overlayIndex}
                                  data-timeline-key={`text:${overlayIndex}`}
                                  style={{
                                    left: `${(startSec / timelineDisplayDurationSec) * 100}%`,
                                    width: `${(durationSec / timelineDisplayDurationSec) * 100}%`,
                                    top: `${6 + trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`
                                  }}
                                  onMouseDown={(event) => beginTimelineTextTrackMove(event, selectedScene, overlayIndex)}
                                  onClick={(event) => selectTimelineItem({ kind: "text", index: overlayIndex }, event)}
                                >
                                  <span>{overlay.text || `Text ${overlayIndex + 1}`}</span>
                                  <small>{formatTimelineSeconds(startSec)} · {formatTimelineSeconds(durationSec)}</small>
                                  <button
                                    type="button"
                                    className="video-element-resize-handle"
                                    aria-label={`Text length resize ${overlayIndex + 1}`}
                                    onMouseDown={(event) => beginTimelineTextResize(event, selectedScene, overlayIndex)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="eyebrow">{isKorean ? "Timeline" : "Timeline"}</p>
                      {editableDocument.scenes.map((scene) => (
                        <div
                          key={`timeline-${scene.sceneNo}`}
                          role="button"
                          tabIndex={0}
                          className={
                            scene.sceneNo === selectedScene.sceneNo
                              ? "generation-timeline-item active"
                              : "generation-timeline-item"
                          }
                          onClick={() => seekSceneStart(scene.sceneNo)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              seekSceneStart(scene.sceneNo);
                            }
                          }}
                        >
                          <span>
                            {moduleCopy.sceneLabel} {scene.sceneNo}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="generation-thumb-strip">
                  <p className="eyebrow">{isKorean ? "Scene Thumbnails" : "Scene Thumbnails"}</p>
                  <div className="generation-thumb-row">
                    {editableDocument.scenes.map((scene) => {
                      const thumbSrc = buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[0]?.src;
                      if (isCardNewsModule) {
                        return (
                          <div
                            key={`thumb-${scene.sceneNo}`}
                            className={
                              scene.sceneNo === selectedSceneNo
                                ? "generation-thumb-card active"
                                : "generation-thumb-card"
                            }
                          >
                            <button type="button" className="generation-thumb-select" onClick={() => setSelectedSceneNo(scene.sceneNo)}>
                              {thumbSrc ? (
                                <img
                                  src={thumbSrc}
                                  alt={`Scene ${scene.sceneNo} thumbnail`}
                                  onError={(event) => {
                                    const target = event.currentTarget;
                                    if (target.dataset.fallbackApplied === "true") {
                                      target.style.display = "none";
                                      return;
                                    }
                                    target.dataset.fallbackApplied = "true";
                                    target.src =
                                      buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[1]?.src ??
                                      "";
                                  }}
                                />
                              ) : null}
                              <span>
                                {moduleCopy.sceneLabel} {scene.sceneNo}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="secondary-button slim"
                              disabled={busy}
                              onClick={() => void handleSaveCardPreviewImageAs(scene.sceneNo)}
                            >
                              {isKorean ? "다른 이름 저장" : "Save As"}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={`thumb-${scene.sceneNo}`}
                          type="button"
                          className={
                            scene.sceneNo === selectedSceneNo
                              ? "generation-thumb-card active"
                              : "generation-thumb-card"
                          }
                          onClick={() => setSelectedSceneNo(scene.sceneNo)}
                        >
                          {thumbSrc ? (
                            <img
                              src={thumbSrc}
                              alt={`Scene ${scene.sceneNo} thumbnail`}
                              onError={(event) => {
                                const target = event.currentTarget;
                                if (target.dataset.fallbackApplied === "true") {
                                  target.style.display = "none";
                                  return;
                                }
                                target.dataset.fallbackApplied = "true";
                                target.src =
                                  buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[1]?.src ??
                                  "";
                              }}
                            />
                          ) : null}
                          <span>
                            {moduleCopy.sceneLabel} {scene.sceneNo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          {isCardNewsModule ? (
            <div className="generation-inspector card">
              <div className="card-row">
                <strong>{isKorean ? "검사기" : "Inspector"}</strong>
                <span className="pill">{isKorean ? "실시간" : "Live"}</span>
              </div>
              {!selectedScene ? (
                <p className="subtle">{copy.selectScene}</p>
              ) : (
                <>
                  <div className="meta-list">
                    {!isCardNewsModule || selectedScene.sceneNo === 1 ? (
                      <div>
                        <strong>{moduleCopy.assetSearchQuery}</strong>
                        <span>{selectedScene.assetSearchQuery || "-"}</span>
                      </div>
                    ) : (
                      <div>
                        <strong>{isKorean ? "카드 배경" : "Card Background"}</strong>
                        <span>{isKorean ? "선택한 템플릿 또는 공통 배경 사용" : "Selected template or shared background"}</span>
                      </div>
                    )}
                    <div>
                      <strong>{isKorean ? "레이아웃" : "Layout"}</strong>
                      <span>{editableDocument.cardNews?.layoutPreset ?? "headline_focus"}</span>
                    </div>
                    <div>
                      <strong>{isKorean ? "전환" : "Transition"}</strong>
                      <span>{editableDocument.cardNews?.transitionStyle ?? "cut"}</span>
                    </div>
                    <div>
                      <strong>{isKorean ? "출력" : "Output"}</strong>
                      <span>{editableDocument.cardNews?.outputFormat ?? "square_1_1"}</span>
                    </div>
                  </div>

                  <div className="generation-preview-prompt">
                    <p className="eyebrow">{isKorean ? "템플릿 카드 안내" : "Template Card Note"}</p>
                    <p>
                      {isKorean
                        ? "템플릿 배경 위에 텍스트 박스를 올려 카드뉴스 이미지를 만듭니다."
                        : "Cards after the cover reuse one template and swap text only."}
                    </p>
                  </div>

                  <div className="generation-preview-prompt">
                    <p className="eyebrow">{isKorean ? "레이어 상태" : "Layer Status"}</p>
                    <p>
                      {(selectedScene.cardDesignBoxes?.length ?? 0) > 0
                        ? isKorean
                          ? `${selectedScene.cardDesignBoxes?.length ?? 0}개 레이어 · 선택 #${selectedBoxIndex + 1} · ${
                              selectedCardDesign?.hidden ? "숨김" : "표시"
                            } · ${selectedCardDesign?.locked ? "잠김" : "편집 가능"}`
                          : `${selectedScene.cardDesignBoxes?.length ?? 0} layers · selected #${selectedBoxIndex + 1} · ${
                              selectedCardDesign?.hidden ? "hidden" : "visible"
                            } · ${selectedCardDesign?.locked ? "locked" : "editable"}`
                        : "No configured text layers for this card."}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
        )
      )}
    </section>
    </GenerationErrorBoundary>
  );
}
