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
  SceneScriptDocument,
  SceneScriptItem,
  SceneScriptSubtitleStyle,
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

const SUBTITLE_MODE_OPTIONS: Array<SceneScriptSubtitleStyle["mode"]> = ["outline", "box"];
const VOICE_PROVIDER_OPTIONS: Array<SceneScriptVoiceProfile["provider"]> = [
  "elevenlabs",
  "azure",
  "openai"
];
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
  const [editorTab, setEditorTab] = useState<"scene" | "subtitle" | "voice">("scene");
  const [previewAssetIndex, setPreviewAssetIndex] = useState(0);
  const [hasGeneratedAssets, setHasGeneratedAssets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cardDesignDrag, setCardDesignDrag] = useState<CardDesignDragState | null>(null);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState(0);
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
  const editableDocumentRef = useRef<SceneScriptDocument | null>(null);
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
  const totalDurationSec = useMemo(
    () =>
      Math.max(
        1,
        Math.round(
          editableDocument?.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0) ?? 0
        )
      ),
    [editableDocument]
  );

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
  const sceneAssetCandidates = useMemo(() => {
    if (!resolvedPackagePath || !selectedScene) {
      return [];
    }
    const generatedCandidates = buildScenePreviewCandidates(resolvedPackagePath, selectedScene.sceneNo);
    if (!isCardNewsModule) {
      return generatedCandidates;
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
  }, [editableDocument?.cardNews?.coverImagePath, editableDocument?.cardNews?.templateBackgroundPath, isCardNewsModule, resolvedPackagePath, selectedScene]);
  const activePreviewAsset = sceneAssetCandidates[previewAssetIndex];
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
    let cancelled = false;
    if (!resolvedPackagePath || !editableDocument || editableDocument.scenes.length === 0) {
      setHasGeneratedAssets(false);
      return;
    }

    const detectGeneratedAssets = async () => {
      for (const scene of editableDocument.scenes) {
        const candidates = buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo);
        for (const candidate of candidates) {
          // Detect from actual scene files so we can switch UI only after generation.
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

  const updateSubtitleStyle = (patch: Partial<SceneScriptSubtitleStyle>) => {
    applyDocumentUpdate((current) => ({
      ...current,
      subtitleStyle: {
        ...current.subtitleStyle,
        ...patch
      }
    }));
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
    <section className="page">
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
              <strong>{isKorean ? "ìƒì„± ì „ íŽ¸ì§‘" : "Pre-generation Edit"}</strong>
              <span className="pill">
                {moduleCopy.sceneLabel} {selectedScene?.sceneNo ?? "-"}
              </span>
            </div>
            <p className="subtle">
              {isKorean
                ? "ìžì‚° ìƒì„± ì „ì—ëŠ” ìŠ¤í¬ë¦½íŠ¸, í”„ë¡¬í”„íŠ¸, ê¸¸ì´ë§Œ ë¹ ë¥´ê²Œ ìˆ˜ì •í•  ìˆ˜ ìžˆìŠµë‹ˆë‹¤. ì´ë¯¸ì§€/ì˜ìƒì´ ìƒì„±ë˜ë©´ ê³ ê¸‰ íŽ¸ì§‘ í™”ë©´ìœ¼ë¡œ ìžë™ ì „í™˜ë©ë‹ˆë‹¤."
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
                          ? "1ìž¥ì€ ì–´ê·¸ë¡œ ì»¤ë²„ ì¹´ë“œìž…ë‹ˆë‹¤. ì´ë¯¸ì§€/í”„ë¡¬í”„íŠ¸ ì¤‘ì‹¬ìœ¼ë¡œ íŽ¸ì§‘í•˜ì„¸ìš”."
                          : "Card 1 is the hook cover card. Focus on image/prompt."
                        : isKorean
                          ? "2ìž¥ ì´í›„ëŠ” í…œí”Œë¦¿ ì¹´ë“œìž…ë‹ˆë‹¤. ë³¸ë¬¸ í…ìŠ¤íŠ¸ ì¤‘ì‹¬ìœ¼ë¡œ íŽ¸ì§‘í•˜ì„¸ìš”."
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
        <div className={isCardNewsModule ? "generation-shell generation-shell--canvas" : "generation-shell"}>
          <div className="generation-editor card">
            <div className="generation-editor-header">
              <div>
                <p className="eyebrow">{isKorean ? "Edit Suite" : "Edit Suite"}</p>
                <h4>{moduleCopy.pageTitle}</h4>
                <p className="subtle">
                  {isCardNewsModule ? `${editableDocument.scenes.length} cards` : isKorean
                    ? `ì”¬ ${editableDocument.scenes.length}ê°œ Â· ì´ ${totalDurationSec}ì´ˆ`
                    : `${editableDocument.scenes.length} scenes Â· ${totalDurationSec}s total`}
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
                  className={editorTab === "subtitle" ? "pill-button active" : "pill-button"}
                  onClick={() => setEditorTab("subtitle")}
                >
                  {isKorean ? "Subtitle" : "Subtitle"}
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

            {!isCardNewsModule && editorTab === "subtitle" && (
              <>
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

                <h4>{copy.subtitleStyleTitle}</h4>
                <div className="form-grid">
                  <div className="field">
                    <span>{copy.subtitleMode}</span>
                    <select
                      className="text-input"
                      value={editableDocument.subtitleStyle.mode}
                      onChange={(event) =>
                        updateSubtitleStyle({
                          mode: event.target.value as SceneScriptSubtitleStyle["mode"]
                        })
                      }
                    >
                      {SUBTITLE_MODE_OPTIONS.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span>{copy.fontFamily}</span>
                    <input
                      className="text-input"
                      type="text"
                      value={editableDocument.subtitleStyle.fontFamily}
                      onChange={(event) =>
                        updateSubtitleStyle({
                          fontFamily: event.target.value
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.fontSize}</span>
                    <input
                      className="text-input"
                      type="number"
                      min={8}
                      max={120}
                      value={editableDocument.subtitleStyle.fontSize}
                      onChange={(event) =>
                        updateSubtitleStyle({
                          fontSize: Math.max(8, Number(event.target.value) || 8)
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.outline}</span>
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      max={20}
                      value={editableDocument.subtitleStyle.outline}
                      onChange={(event) =>
                        updateSubtitleStyle({
                          outline: Math.max(0, Number(event.target.value) || 0)
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.textColor}</span>
                    <input
                      className="text-input"
                      type="text"
                      value={editableDocument.subtitleStyle.color}
                      onChange={(event) =>
                        updateSubtitleStyle({
                          color: event.target.value
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>{copy.outlineColor}</span>
                    <input
                      className="text-input"
                      type="text"
                      value={editableDocument.subtitleStyle.outlineColor}
                      onChange={(event) =>
                        updateSubtitleStyle({
                          outlineColor: event.target.value
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {editorTab === "voice" && !isCardNewsModule && (
              <>
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
              <strong>{isKorean ? "Preview" : "Preview"}</strong>
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
                <div className="generation-preview-banner">
                  <p className="subtle">
                    {isCardNewsModule
                      ? isKorean
                        ? "카드를 직접 보면서 편집하세요. Ctrl+휠로 확대/축소, 우클릭 드래그로 이동할 수 있습니다."
                        : "Edit while previewing the card. Ctrl+wheel zooms, right-drag pans."
                      : isKorean
                        ? "선택한 씬의 내레이션, 키워드, 모션을 확인하세요."
                        : "Quickly review selected scene narration, keyword, and motion here."}
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
                  {activePreviewAsset ? (
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
                          className={isCardNewsModule ? "generation-card-stage" : undefined}
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
                      <video
                        src={activePreviewAsset.src}
                        controls
                        muted
                        playsInline
                        onError={() =>
                          setPreviewAssetIndex((current) =>
                            Math.min(current + 1, sceneAssetCandidates.length)
                          )
                        }
                      />
                    )
                  ) : (
                    <p className="subtle">
                      {isKorean ? "아직 미리보기 이미지가 없습니다." : "No generated scene preview is available yet."}
                    </p>
                  )}
                  </div>
                </div>

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
                  {!isCardNewsModule ? (
                    <div>
                      <strong>{copy.motion}</strong>
                      <span>{selectedScene.motion}</span>
                    </div>
                  ) : null}
                  {isCardNewsModule ? (
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
                  ) : null}
                </div>

                <div className="generation-preview-text">
                  <p className="eyebrow">{textFieldLabel}</p>
                  <p>{selectedScene.text}</p>
                </div>

                {!isCardNewsModule ? (
                  <div className="generation-preview-prompt">
                    <p className="eyebrow">{moduleCopy.fluxPrompt}</p>
                    <p>{selectedScene.fluxPrompt}</p>
                  </div>
                ) : null}

                <div className="generation-timeline">
                  <p className="eyebrow">{isKorean ? "Timeline" : "Timeline"}</p>
                  {editableDocument.scenes.map((scene) => (
                    <div
                      key={`timeline-${scene.sceneNo}`}
                      className={
                        scene.sceneNo === selectedScene.sceneNo
                          ? "generation-timeline-item active"
                          : "generation-timeline-item"
                      }
                    >
                      <span>
                        {moduleCopy.sceneLabel} {scene.sceneNo}
                      </span>
                      {!isCardNewsModule ? <span>{scene.durationSec}s</span> : null}
                    </div>
                  ))}
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
