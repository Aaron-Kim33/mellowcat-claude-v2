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
  PixabayAssetResult,
  SceneScriptDocument,
  SceneScriptItem,
  SceneScriptAudioLayer,
  SceneScriptSubtitleStyle,
  SceneScriptVideoMediaLayer,
  SceneScriptVideoTextOverlay,
  SceneScriptVoiceProfile
} from "@common/types/media-generation";
import { getMcpRuntimeContract } from "../../../common/contracts/mcp-contract-registry";
import { getLauncherCopy } from "../../lib/launcher-copy";
import { useAppStore } from "../../store/app-store";

const MOTION_OPTIONS: Array<SceneScriptItem["motion"]> = [
  "none",
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "wipe-transition",
  "shake"
];

const VOICE_PROVIDER_OPTIONS: Array<SceneScriptVoiceProfile["provider"]> = [
  "elevenlabs",
  "azure",
  "openai"
];
const DEFAULT_VIDEO_TEXT_OVERLAY: SceneScriptVideoTextOverlay = {
  text: "새 텍스트",
  startSec: 0,
  durationSec: 5,
  trackIndex: 0,
  xPct: 50,
  yPct: 50,
  widthPct: 42,
  heightPct: 15,
  fontSize: 64,
  fontWeight: 800,
  textColor: "#ffffff",
  outlineColor: "#000000",
  outlineThickness: 5,
  backgroundColor: "transparent"
};
const TIMELINE_ELEMENT_TRACK_ROW_HEIGHT = 30;
const TIMELINE_RESIZE_SENSITIVITY = 1;
const CANVAS_SNAP_THRESHOLD_PCT = 1.5;
const roundTimelineSeconds = (value: number, min = 0) =>
  Math.max(min, Math.round((Number(value) || 0) * 20) / 20);
const formatTimelineSeconds = (value: number) => `${roundTimelineSeconds(value).toFixed(2)}s`;
const buildLayerId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildIconDataUrl = (body: string, viewBox = "0 0 128 128") =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`
  )}`;
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

export function GenerationPage() {
  const {
    settings,
    workflowConfig,
    sceneScript,
    sceneScriptPackagePath,
    cardNewsTemplates,
    telegramStatus,
    workflowJobSnapshot,
    inspectSceneScript,
    saveSceneScript,
    captureCardPreviewImageAs,
    saveWorkflowConfig,
    searchPixabayAssets,
    importPixabayAsset,
    importLocalAsset,
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
  const [editorTab, setEditorTab] = useState<"scene" | "text" | "voice">("scene");
  const [previewAssetIndex, setPreviewAssetIndex] = useState(0);
  const [timelineTimeSec, setTimelineTimeSec] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [hasGeneratedAssets, setHasGeneratedAssets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cardDesignDrag, setCardDesignDrag] = useState<CardDesignDragState | null>(null);
  const [videoTextDrag, setVideoTextDrag] = useState<{
    sceneNo: number;
    overlayIndex: number;
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
  } | null>(null);
  const [videoMediaDrag, setVideoMediaDrag] = useState<{
    layerId: string;
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
  } | null>(null);
  const [timelineResizeDrag, setTimelineResizeDrag] = useState<{
    kind:
      | "scene-duration"
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
  const [selectedBoxIndex, setSelectedBoxIndex] = useState(0);
  const [selectedVideoTextIndex, setSelectedVideoTextIndex] = useState(0);
  const [selectedVideoMediaLayerId, setSelectedVideoMediaLayerId] = useState<string | null>(null);
  const [selectedAudioLayerId, setSelectedAudioLayerId] = useState<string | null>(null);
  const [editingVideoText, setEditingVideoText] = useState<{
    sceneNo: number;
    overlayIndex: number;
  } | null>(null);
  const [editingPreviewBox, setEditingPreviewBox] = useState<{
    sceneNo: number;
    boxIndex: number;
  } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ verticalPct?: number; horizontalPct?: number }>({});
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
  const [voiceLayerText, setVoiceLayerText] = useState("");
  const [voiceLayerBusy, setVoiceLayerBusy] = useState(false);
  const [assetPreviewVersion, setAssetPreviewVersion] = useState(0);
  const editableDocumentRef = useRef<SceneScriptDocument | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaLayerVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioLayerRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const videoMediaLayersRef = useRef<SceneScriptVideoMediaLayer[]>([]);
  const audioLayersRef = useRef<SceneScriptAudioLayer[]>([]);
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
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const [cardStageFitScale, setCardStageFitScale] = useState(1);
  const [cardStageZoom, setCardStageZoom] = useState(1);
  const [cardStagePan, setCardStagePan] = useState({ x: 0, y: 0 });
  const [cardStagePanDrag, setCardStagePanDrag] = useState<CardStagePanState | null>(null);
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

  useEffect(() => {
    if (!resolvedPackagePath) {
      setEditableDocument(null);
      editableDocumentRef.current = null;
      setUndoStack([]);
      setRedoStack([]);
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
      return;
    }
    const loadedDocument: SceneScriptDocument = {
      ...sceneScript,
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
    setEditableDocument(loadedDocument);
    editableDocumentRef.current = loadedDocument;
    setUndoStack([]);
    setRedoStack([]);
    setSelectedSceneNo(sceneScript.scenes[0]?.sceneNo ?? 1);
  }, [isCardNewsModule, sceneScript]);

  const selectedScene = useMemo(
    () => editableDocument?.scenes.find((scene) => scene.sceneNo === selectedSceneNo),
    [editableDocument, selectedSceneNo]
  );
  const videoMediaLayers = useMemo(
    () => editableDocument?.videoMediaLayers ?? [],
    [editableDocument?.videoMediaLayers]
  );
  const audioLayers = useMemo(
    () => editableDocument?.audioLayers ?? [],
    [editableDocument?.audioLayers]
  );
  const selectedVideoMediaLayer = useMemo(
    () => videoMediaLayers.find((layer) => layer.id === selectedVideoMediaLayerId) ?? null,
    [selectedVideoMediaLayerId, videoMediaLayers]
  );
  const selectedVideoTextOverlays = useMemo(() => getSceneVideoTextOverlays(selectedScene), [selectedScene]);
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
    () =>
      Math.max(
        1,
        roundTimelineSeconds(
          editableDocument?.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0) ?? 0
        )
      ),
    [editableDocument]
  );
  const timelineSegments = useMemo(() => {
    let cursor = 0;
    return (editableDocument?.scenes ?? []).map((scene) => {
      const durationSec = Math.max(1, Number(scene.durationSec || 1));
      const segment = {
        scene,
        startSec: cursor,
        endSec: cursor + durationSec,
        durationSec
      };
      cursor += durationSec;
      return segment;
    });
  }, [editableDocument]);
  const videoElementTrackCount = useMemo(
    () =>
      Math.max(
        1,
        ...timelineSegments.flatMap((segment) =>
          getSceneVideoTextOverlays(segment.scene).map((overlay) => Math.max(0, Number(overlay.trackIndex ?? 0) || 0) + 1)
        )
      ),
    [timelineSegments]
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

  const seekSceneStart = (sceneNo: number) => {
    const targetSegment = timelineSegments.find((segment) => segment.scene.sceneNo === sceneNo);
    if (targetSegment) {
      seekTimeline(targetSegment.startSec);
      return;
    }
    setSelectedSceneNo(sceneNo);
  };

  const seekTimelineFromClientX = (clientX: number) => {
    const track = timelineTrackRef.current;
    if (!track) {
      return;
    }
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setTimelinePlaying(false);
    seekTimeline(ratio * totalDurationSec);
  };

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

  const beginTimelineTextResize = (event: ReactMouseEvent, scene: SceneScriptItem, overlayIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    const trackWidth = Math.max(1, timelineTrackRef.current?.getBoundingClientRect().width ?? 1);
    const overlay = getSceneVideoTextOverlays(scene)[overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY;
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
    const overlay = getSceneVideoTextOverlays(scene)[overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY;
    setSelectedVideoTextIndex(overlayIndex);
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

  const updateVideoMediaLayer = (layerId: string, patch: Partial<SceneScriptVideoMediaLayer>) => {
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
    }));
  };

  const updateAudioLayer = (layerId: string, patch: Partial<SceneScriptAudioLayer>) => {
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
    }));
  };

  const getVideoMediaLayerBox = (layer: SceneScriptVideoMediaLayer) => ({
    xPct: Number(layer.xPct ?? 50),
    yPct: Number(layer.yPct ?? 50),
    widthPct: Number(layer.widthPct ?? 100),
    heightPct: Number(layer.heightPct ?? 100)
  });

  const beginVideoMediaDrag = (event: ReactMouseEvent<HTMLElement>, layer: SceneScriptVideoMediaLayer) => {
    if (event.button !== 0 || timelinePlaying) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const box = getVideoMediaLayerBox(layer);
    setSelectedVideoMediaLayerId(layer.id);
    setVideoMediaDrag({
      layerId: layer.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXPct: box.xPct,
      startYPct: box.yPct
    });
  };

  const beginTimelineMediaResize = (event: ReactMouseEvent, layer: SceneScriptVideoMediaLayer) => {
    event.preventDefault();
    event.stopPropagation();
    setTimelinePlaying(false);
    setSelectedVideoMediaLayerId(layer.id);
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
    setSelectedVideoMediaLayerId(layer.id);
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
    setSelectedAudioLayerId(layer.id);
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
    overlayIndex = selectedVideoTextIndex
  ) => {
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
      overlayIndex
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isCardNewsModule || editingVideoText || editingPreviewBox || !selectedScene) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']") ||
        (event.key !== "Delete" && event.key !== "Backspace")
      ) {
        return;
      }
      event.preventDefault();
      if (selectedAudioLayerId) {
        applyDocumentUpdate((current) => ({
          ...current,
          audioLayers: (current.audioLayers ?? []).filter((layer) => layer.id !== selectedAudioLayerId)
        }));
        setSelectedAudioLayerId(null);
        return;
      }
      if (selectedVideoMediaLayerId) {
        applyDocumentUpdate((current) => ({
          ...current,
          videoMediaLayers: (current.videoMediaLayers ?? []).filter((layer) => layer.id !== selectedVideoMediaLayerId)
        }));
        setSelectedVideoMediaLayerId(null);
        return;
      }
      if (selectedVideoTextOverlays.length === 0) {
        return;
      }
      removeVideoTextOverlay(selectedScene.sceneNo, selectedVideoTextIndex);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingPreviewBox,
    editingVideoText,
    isCardNewsModule,
    selectedScene,
    selectedAudioLayerId,
    selectedVideoMediaLayerId,
    selectedVideoTextIndex,
    selectedVideoTextOverlays.length
  ]);

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
  const activeVideoMediaLayers = useMemo(
    () =>
      videoMediaLayers.filter((layer) => {
        const startSec = Math.max(0, Number(layer.startSec || 0));
        const durationSec = Math.max(0.5, Number(layer.durationSec || 0.5));
        return timelineTimeSec >= startSec && timelineTimeSec <= startSec + durationSec;
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
    const rawLocalTime = Math.max(0, timelineTimeSecRef.current - Math.max(0, Number(layer.startSec || 0)));
    const mediaDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const localTime = mediaDuration > 0 ? rawLocalTime % mediaDuration : rawLocalTime;
    const drift = Math.abs(video.currentTime - localTime);
    const seekThreshold = options?.forceSeek ? 0.05 : timelinePlaying ? 1.2 : 0.15;
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
    const localTime = Math.max(0, timelineTimeSecRef.current - startSec);
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
    const handlePointerMove = (event: PointerEvent) => {
      const deltaSec =
        (event.clientX - timelineResizeDrag.startClientX) *
        timelineResizeDrag.secondsPerPixel *
        TIMELINE_RESIZE_SENSITIVITY;
      const scene = editableDocumentRef.current?.scenes.find((item) => item.sceneNo === timelineResizeDrag.sceneNo);
      if (!scene) {
        return;
      }
      if (timelineResizeDrag.kind === "audio-track") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const laneDelta = Math.round((event.clientY - timelineResizeDrag.startClientY) / 26);
        const nextTrackIndex = Math.max(0, (timelineResizeDrag.startTrackIndex ?? 0) + laneDelta);
        const nextStartSec = roundTimelineSeconds(
          Math.max(
            0,
            Math.min(
              Math.max(0, totalDurationSec - timelineResizeDrag.startDurationSec),
              (timelineResizeDrag.startLayerStartSec ?? 0) + deltaSec
            )
          )
        );
        updateAudioLayer(layerId, {
          trackIndex: nextTrackIndex,
          startSec: nextStartSec
        });
        return;
      }
      if (timelineResizeDrag.kind === "audio-duration") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const startSec = timelineResizeDrag.startLayerStartSec ?? 0;
        const maxDuration = Math.max(0.5, totalDurationSec - startSec);
        updateAudioLayer(layerId, {
          durationSec: Math.min(maxDuration, roundTimelineSeconds(timelineResizeDrag.startDurationSec + deltaSec, 0.5))
        });
        return;
      }
      if (timelineResizeDrag.kind === "media-track") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const laneDelta = Math.round((event.clientY - timelineResizeDrag.startClientY) / 26);
        const nextTrackIndex = Math.max(0, (timelineResizeDrag.startTrackIndex ?? 0) + laneDelta);
        const nextStartSec = roundTimelineSeconds(
          Math.max(
            0,
            Math.min(
              Math.max(0, totalDurationSec - timelineResizeDrag.startDurationSec),
              (timelineResizeDrag.startLayerStartSec ?? 0) + deltaSec
            )
          )
        );
        updateVideoMediaLayer(layerId, {
          trackIndex: nextTrackIndex,
          startSec: nextStartSec
        });
        return;
      }
      if (timelineResizeDrag.kind === "media-duration") {
        const layerId = timelineResizeDrag.layerId;
        if (!layerId) {
          return;
        }
        const startSec = timelineResizeDrag.startLayerStartSec ?? 0;
        const maxDuration = Math.max(0.5, totalDurationSec - startSec);
        updateVideoMediaLayer(layerId, {
          durationSec: Math.min(maxDuration, roundTimelineSeconds(timelineResizeDrag.startDurationSec + deltaSec, 0.5))
        });
        return;
      }
      if (timelineResizeDrag.kind === "text-track") {
        const laneDelta = Math.round((event.clientY - timelineResizeDrag.startClientY) / 26);
        const nextTrackIndex = Math.max(0, (timelineResizeDrag.startTrackIndex ?? 0) + laneDelta);
        const nextStartSec = roundTimelineSeconds(
          Math.max(
            0,
            Math.min(
              Math.max(0, Number(scene.durationSec || 1) - timelineResizeDrag.startDurationSec),
              (timelineResizeDrag.startTextStartSec ?? 0) + deltaSec
            )
          )
        );
        updateVideoTextOverlay(
          scene.sceneNo,
          {
            trackIndex: nextTrackIndex,
            startSec: nextStartSec
          },
          timelineResizeDrag.overlayIndex ?? 0
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
      const maxDuration = Math.max(0.5, Number(scene.durationSec || 1) - textStartSec);
      updateVideoTextTiming(
        scene,
        {
          durationSec: Math.min(maxDuration, roundTimelineSeconds(timelineResizeDrag.startDurationSec + deltaSec, 0.5))
        },
        timelineResizeDrag.overlayIndex ?? 0
      );
    };
    const handlePointerUp = () => {
      setTimelineResizeDrag((current) => {
        if (current?.kind === "scene-duration") {
          updateSceneDuration(current.sceneNo, current.previewDurationSec ?? current.startDurationSec);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [timelineResizeDrag]);

  useEffect(() => {
    if (!timelineSeekDrag) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      seekTimelineFromClientX(event.clientX);
    };
    const handlePointerUp = () => setTimelineSeekDrag(false);
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
    const onMouseMove = (event: MouseEvent) => {
      const stage = document.querySelector<HTMLElement>(".video-canvas-frame");
      const bounds = stage?.getBoundingClientRect();
      if (!bounds) {
        return;
      }
      const scene = editableDocumentRef.current?.scenes.find((item) => item.sceneNo === videoTextDrag.sceneNo);
      const overlay = getSceneVideoTextOverlays(scene)[videoTextDrag.overlayIndex] ?? DEFAULT_VIDEO_TEXT_OVERLAY;
      const deltaXPct = ((event.clientX - videoTextDrag.startClientX) / Math.max(1, bounds.width)) * 100;
      const deltaYPct = ((event.clientY - videoTextDrag.startClientY) / Math.max(1, bounds.height)) * 100;
      let nextXPct = Math.max(0, Math.min(100 - overlay.widthPct, videoTextDrag.startXPct + deltaXPct));
      let nextYPct = Math.max(0, Math.min(100 - overlay.heightPct, videoTextDrag.startYPct + deltaYPct));
      const nextGuides: { verticalPct?: number; horizontalPct?: number } = {};
      const otherOverlays = getSceneVideoTextOverlays(scene).filter((_, index) => index !== videoTextDrag.overlayIndex);
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
      setSnapGuides(nextGuides);
      updateVideoTextOverlay(
        videoTextDrag.sceneNo,
        {
          xPct: Number(nextXPct.toFixed(2)),
          yPct: Number(nextYPct.toFixed(2))
        },
        videoTextDrag.overlayIndex
      );
    };
    const onMouseUp = () => {
      setVideoTextDrag(null);
      setSnapGuides({});
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [videoTextDrag]);

  useEffect(() => {
    if (!videoMediaDrag) {
      return;
    }
    const onMouseMove = (event: MouseEvent) => {
      const stage = document.querySelector<HTMLElement>(".video-canvas-frame");
      const bounds = stage?.getBoundingClientRect();
      const layer = editableDocumentRef.current?.videoMediaLayers?.find(
        (item) => item.id === videoMediaDrag.layerId
      );
      if (!bounds || !layer) {
        return;
      }
      const box = getVideoMediaLayerBox(layer);
      const deltaXPct = ((event.clientX - videoMediaDrag.startClientX) / Math.max(1, bounds.width)) * 100;
      const deltaYPct = ((event.clientY - videoMediaDrag.startClientY) / Math.max(1, bounds.height)) * 100;
      let nextXPct = Math.max(box.widthPct / 2, Math.min(100 - box.widthPct / 2, videoMediaDrag.startXPct + deltaXPct));
      let nextYPct = Math.max(box.heightPct / 2, Math.min(100 - box.heightPct / 2, videoMediaDrag.startYPct + deltaYPct));
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
          nextXPct = Math.max(box.widthPct / 2, Math.min(100 - box.widthPct / 2, point.apply(target)));
          nextGuides.verticalPct = target;
          break;
        }
      }
      for (const point of movingYPoints) {
        const currentPoint = nextYPct + point.offset;
        const target = yTargets.find((candidate) => Math.abs(candidate - currentPoint) <= CANVAS_SNAP_THRESHOLD_PCT);
        if (target !== undefined) {
          nextYPct = Math.max(box.heightPct / 2, Math.min(100 - box.heightPct / 2, point.apply(target)));
          nextGuides.horizontalPct = target;
          break;
        }
      }
      setSnapGuides(nextGuides);
      updateVideoMediaLayer(videoMediaDrag.layerId, {
        xPct: Number(nextXPct.toFixed(2)),
        yPct: Number(nextYPct.toFixed(2))
      });
    };
    const onMouseUp = () => {
      setVideoMediaDrag(null);
      setSnapGuides({});
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [videoMediaDrag, timelinePlaying]);

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
    const overlays = getSceneVideoTextOverlays(scene);
    const nextIndex = overlays.length;
    const nextOverlay: SceneScriptVideoTextOverlay = {
      ...DEFAULT_VIDEO_TEXT_OVERLAY,
      durationSec: Math.min(5, Math.max(1, Number(scene.durationSec || 1))),
      text: DEFAULT_VIDEO_TEXT_OVERLAY.text,
      xPct: Math.min(70, DEFAULT_VIDEO_TEXT_OVERLAY.xPct + nextIndex * 5),
      yPct: Math.min(75, DEFAULT_VIDEO_TEXT_OVERLAY.yPct + nextIndex * 7),
      trackIndex: nextIndex
    };
    const nextOverlays = [...overlays, nextOverlay];
    updateScene(scene.sceneNo, {
      videoTextOverlay: nextOverlays[0],
      videoTextOverlays: nextOverlays
    });
    setSelectedVideoTextIndex(nextIndex);
    setEditingVideoText({ sceneNo: scene.sceneNo, overlayIndex: nextIndex });
    setEditorTab("text");
  };

  const updateVideoTextOverlay = (
    sceneNo: number,
    patch: Partial<SceneScriptVideoTextOverlay>,
    overlayIndex = selectedVideoTextIndex
  ) => {
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
    });
  };

  const removeVideoTextOverlay = (sceneNo: number, overlayIndex = selectedVideoTextIndex) => {
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
    setEditingVideoText(null);
  };

  const beginVideoTextDrag = (event: ReactMouseEvent<HTMLDivElement>, scene: SceneScriptItem, overlayIndex: number) => {
    const overlay = getSceneVideoTextOverlays(scene)[overlayIndex];
    if (!overlay || event.button !== 0 || editingVideoText?.sceneNo === scene.sceneNo) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedVideoTextIndex(overlayIndex);
    setVideoTextDrag({
      sceneNo: scene.sceneNo,
      overlayIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXPct: overlay.xPct,
      startYPct: overlay.yPct
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

  const handleSearchPixabayAssets = async () => {
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
        mediaType: pixabayMediaType,
        perPage: 12
      });
      setPixabayResults(results);
      setPixabayQuery(query);
      setMessage(
        results.length > 0
          ? isKorean
            ? `Pixabay에서 ${results.length}개 소재를 찾았습니다.`
            : `Found ${results.length} Pixabay assets.`
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
        widthPct: 100,
        heightPct: 100
      };
      applyDocumentUpdate((current) => ({
        ...current,
        videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer],
        scenes: current.scenes
      }));
      setSelectedVideoMediaLayerId(nextLayer.id);
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
    setSelectedVideoMediaLayerId(nextLayer.id);
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
      setSelectedAudioLayerId(nextLayer.id);
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
          Math.max(0.5, 5),
          Math.max(0.5, totalDurationSec - layerStartSec)
        );
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
          heightPct: 100
        };
        applyDocumentUpdate((current) => ({
          ...current,
          videoMediaLayers: [...(current.videoMediaLayers ?? []), nextLayer]
        }));
        setSelectedVideoMediaLayerId(nextLayer.id);
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
        </div>
      </div>

      <div className="card">
        <div className="settings-row">
          <span>{copy.packagePath}</span>
          <code className="meta-code">{resolvedPackagePath || copy.noPackage}</code>
        </div>
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
                    <span>{textFieldLabel}</span>
                    <textarea
                      className="text-input textarea-input"
                      value={activeTextValue}
                      onChange={(event) => {
                        updateScene(selectedScene.sceneNo, { text: event.target.value });
                      }}
                    />
                  </div>
                ) : null}
                {!isCardNewsModule ? (
                  <>
                    <div className="field field-span-2">
                      <span>{moduleCopy.fluxPrompt}</span>
                      <textarea
                        className="text-input textarea-input"
                        value={selectedScene.fluxPrompt}
                        onChange={(event) =>
                          updateScene(selectedScene.sceneNo, { fluxPrompt: event.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <span>{moduleCopy.assetSearchQuery}</span>
                      <input
                        className="text-input"
                        type="text"
                        value={selectedScene.assetSearchQuery ?? ""}
                        onChange={(event) =>
                          updateScene(selectedScene.sceneNo, {
                            assetSearchQuery: event.target.value
                          })
                        }
                      />
                    </div>
                  </>
                ) : null}
                {!isCardNewsModule ? (
                  <div className="field">
                    <span>{copy.durationSec}</span>
                    <input
                      className="text-input"
                      type="number"
                      min={1}
                      max={30}
                      value={selectedScene.durationSec}
                      onChange={(event) =>
                        updateScene(selectedScene.sceneNo, {
                          durationSec: Number(event.target.value) || 1
                        })
                      }
                    />
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

            {!isCardNewsModule ? (
              <div className="generation-tab-row">
                <button
                  type="button"
                  className={editorTab === "scene" ? "pill-button active" : "pill-button"}
                  onClick={() => setEditorTab("scene")}
                >
                  {isKorean ? "Scene" : "Scene"}
                </button>
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
              </div>
            ) : null}

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
                            ? "Pixabay 검색 또는 내 파일을 현재 재생 위치에 요소 레이어로 추가합니다. 씬은 흰 도화지처럼 유지됩니다."
                            : "Search Pixabay or import local files as timeline element layers at the playhead. Scenes stay as a blank canvas."}
                        </p>
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
                          <label className="field">
                            <span>{isKorean ? "유형" : "Type"}</span>
                            <select
                              className="text-input"
                              value={pixabayMediaType}
                              onChange={(event) =>
                                setPixabayMediaType(event.target.value as "video" | "image")
                              }
                            >
                              <option value="video">{isKorean ? "영상" : "Video"}</option>
                              <option value="image">{isKorean ? "이미지" : "Image"}</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            className="primary-button"
                            disabled={pixabayBusy}
                            onClick={() => void handleSearchPixabayAssets()}
                          >
                            {pixabayBusy
                              ? isKorean
                                ? "검색 중"
                                : "Searching"
                              : isKorean
                                ? "소재 검색"
                                : "Search Assets"}
                          </button>
                        </div>
                        {pixabayResults.length > 0 ? (
                          <div className="asset-library-results">
                            {pixabayResults.map((asset) => (
                              <article key={`${asset.mediaType}-${asset.id}`} className="asset-library-card">
                                <div className="asset-library-thumb">
                                  {asset.mediaType === "video" ? (
                                    <video
                                      src={asset.downloadUrl}
                                      poster={asset.previewUrl || undefined}
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : asset.previewUrl ? (
                                    <img src={asset.previewUrl} alt={asset.title} />
                                  ) : (
                                    <span>{asset.mediaType}</span>
                                )}
                              </div>
                                <span className="asset-library-duration">
                                  {asset.durationSec ? `${asset.durationSec}s` : asset.mediaType}
                                </span>
                                <div className="button-row">
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={pixabayBusy}
                                    onClick={() => void handleApplyPixabayAsset(asset)}
                                  >
                                    {isKorean ? "요소 추가" : "Add Element"}
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
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
                                fontSize: Number(event.target.value) || 18
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
                                outlineThickness: Number(event.target.value) || 0
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
                                shadowDirectionDeg: Number(event.target.value) || 0
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
                                shadowOpacity: Number(event.target.value) || 0
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
                                shadowDistance: Number(event.target.value) || 0
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
                                shadowBlur: Number(event.target.value) || 0
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
                                lineHeight: Number(event.target.value) || 1.2
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
                                padding: Number(event.target.value) || 0
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
                      <>
                        <div className="field field-span-2">
                          <span>{moduleCopy.fluxPrompt}</span>
                          <textarea
                            className="text-input textarea-input"
                            value={selectedScene.fluxPrompt}
                            onChange={(event) =>
                              updateScene(selectedScene.sceneNo, { fluxPrompt: event.target.value })
                            }
                          />
                        </div>

                        <div className="field">
                          <span>{moduleCopy.assetSearchQuery}</span>
                          <input
                            className="text-input"
                            type="text"
                            value={selectedScene.assetSearchQuery ?? ""}
                            onChange={(event) =>
                              updateScene(selectedScene.sceneNo, {
                                assetSearchQuery: event.target.value
                              })
                            }
                          />
                        </div>
                      </>
                    ) : null}

                    {!isCardNewsModule ? (
                      <div className="field">
                        <span>{copy.motion}</span>
                        <select
                          className="text-input"
                          value={selectedScene.motion}
                          onChange={(event) =>
                            updateScene(selectedScene.sceneNo, {
                              motion: event.target.value as SceneScriptItem["motion"]
                            })
                          }
                        >
                          {MOTION_OPTIONS.map((motion) => (
                            <option key={motion} value={motion}>
                              {motion}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {!isCardNewsModule ? (
                      <div className="field">
                        <span>{copy.durationSec}</span>
                        <input
                          className="text-input"
                          type="number"
                          min={1}
                          max={30}
                          value={selectedScene.durationSec}
                          onChange={(event) =>
                            updateScene(selectedScene.sceneNo, {
                              durationSec: Number(event.target.value) || 1
                            })
                          }
                        />
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
                            onClick={() => setSelectedVideoTextIndex(index)}
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
                            max={selectedScene.durationSec}
                            step={0.1}
                            value={selectedVideoTextOverlay.startSec ?? 0}
                            onChange={(event) =>
                              updateVideoTextTiming(selectedScene, { startSec: Number(event.target.value) || 0 })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>{isKorean ? "길이(초)" : "Duration"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0.5}
                            max={selectedScene.durationSec}
                            step={0.1}
                            value={selectedVideoTextOverlay.durationSec ?? selectedScene.durationSec}
                            onChange={(event) =>
                              updateVideoTextTiming(selectedScene, { durationSec: Number(event.target.value) || 0.5 })
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
                                fontSize: Math.max(12, Number(event.target.value) || 12)
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
                                outlineThickness: Math.max(0, Number(event.target.value) || 0)
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
                    <span className="video-tool-chip">{selectedScene.motion}</span>
                    <span className="video-tool-chip">1920 × 1080</span>
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
                    onWheel={handleCardPreviewWheel}
                    onMouseDown={handleCardPreviewMouseDown}
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
                          style={
                            isCardNewsModule
                              ? { transform: `scale(${cardStageScale})` }
                              : { position: "relative", width: "100%", height: "100%" }
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
                                const localTime = timelineTimeSec - (activeTimelineSegment?.startSec ?? 0);
                                const isVisible =
                                  localTime >= (overlay.startSec ?? 0) &&
                                  localTime <= (overlay.startSec ?? 0) + (overlay.durationSec ?? selectedScene.durationSec);
                                if (!isVisible) {
                                  return null;
                                }
                                const isEditing =
                                  editingVideoText?.sceneNo === selectedScene.sceneNo &&
                                  editingVideoText.overlayIndex === overlayIndex;
                                return (
                                  <div
                                    key={`video-text-${selectedScene.sceneNo}-${overlayIndex}-${isEditing ? "edit" : "view"}`}
                                    className={[
                                      "video-text-overlay",
                                      overlayIndex === selectedVideoTextIndex ? "is-active" : "",
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
                                    onDoubleClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedVideoTextIndex(overlayIndex);
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
                                      left: `${overlay.xPct}%`,
                                      top: `${overlay.yPct}%`,
                                      width: `${overlay.widthPct}%`,
                                      height: `${overlay.heightPct}%`,
                                      color: overlay.textColor,
                                      fontSize: overlay.fontSize,
                                      fontWeight: overlay.fontWeight,
                                      WebkitTextStroke: `${overlay.outlineThickness}px ${overlay.outlineColor}`,
                                      textShadow: `0 4px 18px ${overlay.outlineColor}`,
                                      background: overlay.backgroundColor ?? "transparent"
                                    }}
                                  >
                                    {overlay.text}
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
                                    onInput={(event) => {
                                      if (isEditing) {
                                        editingPreviewDirtyRef.current = true;
                                      }
                                    }}
                                    onBlur={(event) => {
                                      if (!isEditing) {
                                        return;
                                      }
                                      if (editingPreviewDirtyRef.current) {
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
                      <div className="video-canvas-frame">
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
                        {activeVideoMediaLayers.map((layer) => {
                          const src = getVideoMediaLayerSrc(layer);
                          if (!src) {
                            return null;
                          }
                          const box = getVideoMediaLayerBox(layer);
                          const style: CSSProperties = {
                            position: "absolute",
                            left: `${box.xPct}%`,
                            top: `${box.yPct}%`,
                            zIndex: 2,
                            width: `${box.widthPct}%`,
                            height: `${box.heightPct}%`,
                            transform: "translate(-50%, -50%)",
                            objectFit: layer.fit ?? "cover",
                            opacity: layer.opacity ?? 1,
                            pointerEvents: "auto",
                            cursor: timelinePlaying ? "default" : "grab"
                          };
                          return layer.mediaType === "video" ? (
                            <video
                              key={layer.id}
                              ref={(element) => {
                                mediaLayerVideoRefs.current[layer.id] = element;
                              }}
                              className={layer.id === selectedVideoMediaLayerId ? "video-media-layer is-active" : "video-media-layer"}
                              src={src}
                              muted
                              playsInline
                              loop
                              preload="metadata"
                              onLoadedMetadata={(event) =>
                                syncMediaLayerVideo(layer, event.currentTarget, { forceSeek: true })
                              }
                              onCanPlay={(event) =>
                                syncMediaLayerVideo(layer, event.currentTarget, { controlPlayback: false })
                              }
                              onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                              style={style}
                            />
                          ) : (
                            <img
                              key={layer.id}
                              className={layer.id === selectedVideoMediaLayerId ? "video-media-layer is-active" : "video-media-layer"}
                              src={src}
                              alt={layer.label ?? "media layer"}
                              onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                              style={style}
                            />
                          );
                        })}
                        {selectedVideoTextOverlays.map((overlay, overlayIndex) => {
                          const localTime = timelineTimeSec - (activeTimelineSegment?.startSec ?? 0);
                          const isVisible =
                            localTime >= (overlay.startSec ?? 0) &&
                            localTime <= (overlay.startSec ?? 0) + (overlay.durationSec ?? selectedScene.durationSec);
                          if (!isVisible) {
                            return null;
                          }
                          const isEditing =
                            editingVideoText?.sceneNo === selectedScene.sceneNo &&
                            editingVideoText.overlayIndex === overlayIndex;
                          return (
                            <div
                              key={`video-text-${selectedScene.sceneNo}-${overlayIndex}-${isEditing ? "edit" : "view"}`}
                              className={[
                                "video-text-overlay",
                                overlayIndex === selectedVideoTextIndex ? "is-active" : "",
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
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setSelectedVideoTextIndex(overlayIndex);
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
                                left: `${overlay.xPct}%`,
                                top: `${overlay.yPct}%`,
                                width: `${overlay.widthPct}%`,
                                height: `${overlay.heightPct}%`,
                                color: overlay.textColor,
                                fontSize: overlay.fontSize,
                                fontWeight: overlay.fontWeight,
                                WebkitTextStroke: `${overlay.outlineThickness}px ${overlay.outlineColor}`,
                                textShadow: `0 4px 18px ${overlay.outlineColor}`,
                                background: overlay.backgroundColor ?? "transparent"
                              }}
                            >
                              {overlay.text}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : !isCardNewsModule ? (
                    <div className="video-canvas-frame video-canvas-frame--blank">
                      {activeVideoMediaLayers.map((layer) => {
                        const src = getVideoMediaLayerSrc(layer);
                        if (!src) {
                          return null;
                        }
                        const box = getVideoMediaLayerBox(layer);
                        const style: CSSProperties = {
                          position: "absolute",
                          left: `${box.xPct}%`,
                          top: `${box.yPct}%`,
                          zIndex: 2,
                          width: `${box.widthPct}%`,
                          height: `${box.heightPct}%`,
                          transform: "translate(-50%, -50%)",
                          objectFit: layer.fit ?? "cover",
                          opacity: layer.opacity ?? 1,
                          pointerEvents: "auto",
                          cursor: timelinePlaying ? "default" : "grab"
                        };
                        return layer.mediaType === "video" ? (
                          <video
                            key={layer.id}
                            ref={(element) => {
                              mediaLayerVideoRefs.current[layer.id] = element;
                            }}
                            className={layer.id === selectedVideoMediaLayerId ? "video-media-layer is-active" : "video-media-layer"}
                            src={src}
                            muted
                            playsInline
                            loop
                            preload="metadata"
                            onLoadedMetadata={(event) =>
                              syncMediaLayerVideo(layer, event.currentTarget, { forceSeek: true })
                            }
                            onCanPlay={(event) =>
                              syncMediaLayerVideo(layer, event.currentTarget, { controlPlayback: false })
                            }
                            onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                            style={style}
                          />
                        ) : (
                          <img
                            key={layer.id}
                            className={layer.id === selectedVideoMediaLayerId ? "video-media-layer is-active" : "video-media-layer"}
                            src={src}
                            alt={layer.label ?? "media layer"}
                            onMouseDown={(event) => beginVideoMediaDrag(event, layer)}
                            style={style}
                          />
                        );
                      })}
                      {selectedVideoTextOverlays.map((overlay, overlayIndex) => {
                        const localTime = timelineTimeSec - (activeTimelineSegment?.startSec ?? 0);
                        const isVisible =
                          localTime >= (overlay.startSec ?? 0) &&
                          localTime <= (overlay.startSec ?? 0) + (overlay.durationSec ?? selectedScene.durationSec);
                        if (!isVisible) {
                          return null;
                        }
                        const isEditing =
                          editingVideoText?.sceneNo === selectedScene.sceneNo &&
                          editingVideoText.overlayIndex === overlayIndex;
                        return (
                          <div
                            key={`video-text-${selectedScene.sceneNo}-${overlayIndex}-${isEditing ? "edit" : "view"}`}
                            className={[
                              "video-text-overlay",
                              overlayIndex === selectedVideoTextIndex ? "is-active" : "",
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
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              setSelectedVideoTextIndex(overlayIndex);
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
                              left: `${overlay.xPct}%`,
                              top: `${overlay.yPct}%`,
                              width: `${overlay.widthPct}%`,
                              height: `${overlay.heightPct}%`,
                              color: overlay.textColor,
                              fontSize: overlay.fontSize,
                              fontWeight: overlay.fontWeight,
                              WebkitTextStroke: `${overlay.outlineThickness}px ${overlay.outlineColor}`,
                              textShadow: `0 4px 18px ${overlay.outlineColor}`,
                              background: overlay.backgroundColor ?? "transparent"
                            }}
                          >
                            {overlay.text}
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

                <div className="generation-timeline">
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
                      </div>
                      <div
                        className="video-timeline-ruler"
                        onMouseDown={(event) => {
                          if (event.button !== 0) {
                            return;
                          }
                          setTimelineSeekDrag(true);
                          seekTimelineFromClientX(event.clientX);
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
                          setTimelineSeekDrag(true);
                          seekTimelineFromClientX(event.clientX);
                        }}
                      >
                        {timelineSegments.map((segment) => {
                          const displaySegment = getTimelineDisplaySegment(segment.scene.sceneNo) ?? segment;
                          return (
                            <div
                              key={`timeline-segment-${segment.scene.sceneNo}`}
                              className={
                                segment.scene.sceneNo === selectedScene.sceneNo
                                  ? "video-timeline-segment active"
                                  : "video-timeline-segment"
                              }
                              style={{
                                left: `${(displaySegment.startSec / timelineDisplayDurationSec) * 100}%`,
                                width: `${(displaySegment.durationSec / timelineDisplayDurationSec) * 100}%`
                              }}
                            >
                              <button type="button" onClick={() => seekTimeline(segment.startSec)}>
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
                        <span
                          className="video-timeline-playhead"
                          style={{ left: `${(timelineTimeSec / timelineDisplayDurationSec) * 100}%` }}
                        />
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
                                    layer.id === selectedVideoMediaLayerId ? "active" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  style={{
                                    left: `${(startSec / timelineDisplayDurationSec) * 100}%`,
                                    width: `${(durationSec / timelineDisplayDurationSec) * 100}%`,
                                    top: `${6 + trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`
                                  }}
                                  onMouseDown={(event) => beginTimelineMediaTrackMove(event, layer)}
                                  onClick={() => {
                                    setSelectedVideoMediaLayerId(layer.id);
                                    seekTimeline(startSec);
                                  }}
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
                              return (
                                <div
                                  key={`audio-track-${layer.id}`}
                                  className={[
                                    "video-element-clip",
                                    "video-audio-clip",
                                    layer.id === selectedAudioLayerId ? "active" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  style={{
                                    left: `${(startSec / timelineDisplayDurationSec) * 100}%`,
                                    width: `${(durationSec / timelineDisplayDurationSec) * 100}%`,
                                    top: `${6 + trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`
                                  }}
                                  onMouseDown={(event) => beginTimelineAudioTrackMove(event, layer)}
                                  onClick={() => {
                                    setSelectedAudioLayerId(layer.id);
                                    setSelectedVideoMediaLayerId(null);
                                    seekTimeline(startSec);
                                  }}
                                >
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
                      {timelineSegments.some((segment) => getSceneVideoTextOverlays(segment.scene).length > 0) ? (
                        <div className="video-element-track">
                          <span className="video-track-label">Text</span>
                          <div
                            className="video-element-track-lane"
                            style={{
                              height: `${Math.max(100, 12 + videoElementTrackCount * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT)}px`
                            }}
                          >
                            {timelineSegments.flatMap((segment) =>
                              getSceneVideoTextOverlays(segment.scene).map((overlay, overlayIndex) => {
                              const displaySegment = getTimelineDisplaySegment(segment.scene.sceneNo) ?? segment;
                              const localStartSec = Math.min(
                                Math.max(0, segment.durationSec - 0.5),
                                Math.max(0, Number(overlay.startSec ?? 0) || 0)
                              );
                              const durationSec = Math.min(
                                Math.max(0.5, segment.durationSec - localStartSec),
                                Math.max(0.5, Number(overlay.durationSec ?? segment.durationSec) || 0.5)
                              );
                              const trackIndex = Math.max(0, Number(overlay.trackIndex ?? 0) || 0);
                              const startSec = segment.startSec + localStartSec;
                              const displayStartSec = displaySegment.startSec + localStartSec;
                              return (
                                <div
                                  key={`text-track-${segment.scene.sceneNo}-${overlayIndex}`}
                                  className={[
                                    "video-element-clip",
                                    segment.scene.sceneNo === selectedScene.sceneNo && overlayIndex === selectedVideoTextIndex ? "active" : ""
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  style={{
                                    left: `${(displayStartSec / timelineDisplayDurationSec) * 100}%`,
                                    width: `${(durationSec / timelineDisplayDurationSec) * 100}%`,
                                    top: `${6 + trackIndex * TIMELINE_ELEMENT_TRACK_ROW_HEIGHT}px`
                                  }}
                                  onMouseDown={(event) => beginTimelineTextTrackMove(event, segment.scene, overlayIndex)}
                                  onClick={() => {
                                    setSelectedSceneNo(segment.scene.sceneNo);
                                    setSelectedVideoTextIndex(overlayIndex);
                                    seekTimeline(startSec);
                                  }}
                                >
                                  <span>{overlay.text || `Text ${overlayIndex + 1}`}</span>
                                  <small>{formatTimelineSeconds(localStartSec)} · {formatTimelineSeconds(durationSec)}</small>
                                  <button
                                    type="button"
                                    className="video-element-resize-handle"
                                    aria-label={`Text length resize scene ${segment.scene.sceneNo}`}
                                    onMouseDown={(event) => beginTimelineTextResize(event, segment.scene, overlayIndex)}
                                  />
                                </div>
                              );
                            }))}
                          </div>
                        </div>
                      ) : null}
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
