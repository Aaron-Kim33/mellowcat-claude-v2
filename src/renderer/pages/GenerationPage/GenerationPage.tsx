import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  CardNewsCoverSource,
  CardNewsLayoutPreset,
  CardNewsOutputFormat,
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
const CARD_NEWS_LAYOUT_OPTIONS: Array<{ value: CardNewsLayoutPreset; labelKo: string; labelEn: string }> = [
  { value: "headline_focus", labelKo: "헤드라인 집중", labelEn: "Headline Focus" },
  { value: "split_story", labelKo: "좌우 분할 스토리", labelEn: "Split Story" },
  { value: "data_highlight", labelKo: "데이터 하이라이트", labelEn: "Data Highlight" }
];
const CARD_NEWS_TRANSITION_OPTIONS: Array<{
  value: CardNewsTransitionStyle;
  labelKo: string;
  labelEn: string;
}> = [
  { value: "cut", labelKo: "컷", labelEn: "Cut" },
  { value: "slide", labelKo: "슬라이드", labelEn: "Slide" },
  { value: "fade", labelKo: "페이드", labelEn: "Fade" },
  { value: "wipe", labelKo: "와이프", labelEn: "Wipe" }
];
const CARD_NEWS_OUTPUT_OPTIONS: Array<{ value: CardNewsOutputFormat; labelKo: string; labelEn: string }> = [
  { value: "shorts_9_16", labelKo: "쇼츠 9:16", labelEn: "Shorts 9:16" },
  { value: "feed_4_5", labelKo: "피드 4:5", labelEn: "Feed 4:5" },
  { value: "square_1_1", labelKo: "정사각 1:1", labelEn: "Square 1:1" }
];
const CARD_NEWS_COVER_SOURCE_OPTIONS: Array<{
  value: CardNewsCoverSource;
  labelKo: string;
  labelEn: string;
}> = [
  { value: "ai_generate", labelKo: "AI 생성", labelEn: "AI Generate" },
  { value: "manual_upload", labelKo: "직접 업로드", labelEn: "Manual Upload" }
];

const CARD_NEWS_TEXT_PRESETS = [
  { id: "headline", labelKo: "헤드라인", labelEn: "Headline", fontSize: 64, fontWeight: 800 as const, lineHeight: 1.2 },
  { id: "story", labelKo: "스토리", labelEn: "Story", fontSize: 48, fontWeight: 700 as const, lineHeight: 1.28 },
  { id: "caption", labelKo: "캡션", labelEn: "Caption", fontSize: 40, fontWeight: 600 as const, lineHeight: 1.34 }
];

const CARD_NEWS_COLOR_PRESETS = [
  { id: "classic", labelKo: "클래식", labelEn: "Classic", textColor: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.52)" },
  { id: "warm", labelKo: "웜", labelEn: "Warm", textColor: "#FFF5D6", backgroundColor: "rgba(28,18,8,0.6)" },
  { id: "cool", labelKo: "쿨", labelEn: "Cool", textColor: "#EAF4FF", backgroundColor: "rgba(8,20,36,0.58)" },
  { id: "accent", labelKo: "포인트", labelEn: "Accent", textColor: "#FFFFFF", backgroundColor: "rgba(120,28,55,0.62)" }
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
  const prefixRegex = new RegExp(`^${escapedText}[\\s]*[.。!?…,:-]*[\\s]*`, "i");
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
    xPct: 8,
    yPct: sceneNo === 1 ? 72 : 58,
    widthPct: 84,
    heightPct: sceneNo === 1 ? 20 : 30,
    align: "center",
    verticalAlign: "middle",
    fontSize: sceneNo === 1 ? 72 : 52,
    fontWeight: 700,
    textColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.52)",
    lineHeight: 1.28,
    padding: 28
  };
}

function toFriendlySceneScriptErrorMessage(error: unknown, isKorean: boolean): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Failed to load scene script.";
  if (raw.includes("scene-script.json was not found")) {
    return isKorean
      ? "선택한 패키지에 scene-script가 아직 없습니다. 3번 슬롯에서 소재 생성을 먼저 실행해 주세요."
      : "No completed scene script exists in this package yet. Run Slot 03 create first.";
  }
  return raw;
}

export function GenerationPage() {
  const {
    settings,
    workflowConfig,
    sceneScript,
    sceneScriptPackagePath,
    telegramStatus,
    workflowJobSnapshot,
    inspectSceneScript,
    saveSceneScript,
    saveWorkflowConfig,
    pickCreateBackgroundFile,
    pickYouTubePackageFolder
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
  const [snapGuides, setSnapGuides] = useState<{ verticalPct?: number; horizontalPct?: number }>({});
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
          ? "생성 전/후에 카드 텍스트, 비주얼 프롬프트, 전환 모션, 길이를 편집합니다."
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
      ? "선택한 카드의 문구/자산/전환을 여기서 빠르게 확인하세요."
      : "Quickly review selected card copy, asset, and transition."
    : isKorean
      ? "선택한 씬의 내레이션/키워드/모션을 오른쪽에서 빠르게 검토하세요."
      : "Quickly review selected scene narration, keyword, and motion here.";

  useEffect(() => {
    if (!resolvedPackagePath) {
      setEditableDocument(null);
      return;
    }
    void inspectSceneScript(resolvedPackagePath).catch((error) => {
      setMessage(toFriendlySceneScriptErrorMessage(error, isKorean));
    });
  }, [inspectSceneScript, isKorean, resolvedPackagePath]);

  useEffect(() => {
    if (!sceneScript) {
      setEditableDocument(null);
      return;
    }
    setEditableDocument({
      ...sceneScript,
      scenes: sceneScript.scenes.map((scene) => ({
        ...scene,
        fluxPrompt: stripNarrationPrefixFromFluxPrompt(scene.text, scene.fluxPrompt),
        cardDesign:
          isCardNewsModule && scene.sceneNo > 1
            ? {
                ...buildDefaultCardDesign(scene.sceneNo),
                ...(scene.cardDesign ?? {})
              }
            : scene.cardDesign,
        cardDesignBoxes:
          isCardNewsModule && scene.sceneNo > 1
            ? (scene.cardDesignBoxes && scene.cardDesignBoxes.length > 0
                ? scene.cardDesignBoxes
                : [
                    {
                      ...buildDefaultCardDesign(scene.sceneNo),
                      ...(scene.cardDesign ?? {}),
                      id: `box-${scene.sceneNo}-1`
                    }
                  ])
            : scene.cardDesignBoxes
      })),
      cardNews: isCardNewsModule
        ? {
            layoutPreset: sceneScript.cardNews?.layoutPreset ?? "headline_focus",
            transitionStyle: sceneScript.cardNews?.transitionStyle ?? "cut",
            outputFormat: sceneScript.cardNews?.outputFormat ?? "shorts_9_16",
            coverSource: sceneScript.cardNews?.coverSource ?? "ai_generate",
            coverPrompt: sceneScript.cardNews?.coverPrompt ?? "",
            coverImagePath: sceneScript.cardNews?.coverImagePath ?? "",
            templateBackgroundPath: sceneScript.cardNews?.templateBackgroundPath ?? ""
          }
        : sceneScript.cardNews
    });
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
    if (selectedScene.cardDesignBoxes && selectedScene.cardDesignBoxes.length > 0) {
      return selectedScene.cardDesignBoxes.map((box) => ({
        ...buildDefaultCardDesign(selectedScene.sceneNo),
        ...(box ?? {})
      }));
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
  const sceneAssetCandidates = useMemo(() => {
    if (!resolvedPackagePath || !selectedScene) {
      return [];
    }
    return buildScenePreviewCandidates(resolvedPackagePath, selectedScene.sceneNo);
  }, [resolvedPackagePath, selectedScene]);
  const activePreviewAsset = sceneAssetCandidates[previewAssetIndex];

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
    setEditableDocument((current) => {
      if (!current) {
        return current;
      }
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
    setEditableDocument((current) => {
      if (!current) {
        return current;
      }
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
                  ...patch
                }
              : box
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
    if (scene.cardDesignBoxes && scene.cardDesignBoxes.length > 0) {
      return scene.cardDesignBoxes.map((box) => ({
        ...buildDefaultCardDesign(scene.sceneNo),
        ...(box ?? {})
      }));
    }
    return [
      {
        ...buildDefaultCardDesign(scene.sceneNo),
        ...(scene.cardDesign ?? {}),
        id: `box-${scene.sceneNo}-1`
      }
    ];
  };

  const updateCardDesignBoxes = (
    sceneNo: number,
    updater: (boxes: Array<CardDesignBox>) => Array<CardDesignBox>,
    nextSelectedIndex?: number
  ) => {
    setEditableDocument((current) => {
      if (!current) {
        return current;
      }
      const scenes = current.scenes.map((scene) => {
        if (scene.sceneNo !== sceneNo) {
          return scene;
        }
        const currentBoxes = getCardDesignBoxesForScene(scene);
        const updatedBoxes = updater(currentBoxes).map((box, index) => ({
          ...buildDefaultCardDesign(scene.sceneNo),
          ...(box ?? {}),
          id: box?.id ?? `box-${scene.sceneNo}-${index + 1}`
        }));
        const safePrimary = updatedBoxes[0] ?? buildDefaultCardDesign(scene.sceneNo);
        return {
          ...scene,
          cardDesignBoxes: updatedBoxes,
          cardDesign: {
            ...safePrimary
          }
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
          yPct: Math.max(0, Math.min(84, 12 + boxes.length * 10)),
          text: ""
        }
      ],
      nextIndex
    );
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
          xPct: Math.max(0, Math.min(86, source.xPct + 2)),
          yPct: Math.max(0, Math.min(86, source.yPct + 2))
        };
        return [...boxes.slice(0, nextIndex), copied, ...boxes.slice(nextIndex)];
      },
      nextIndex
    );
  };

  const removeCardDesignBox = () => {
    if (!selectedScene || selectedCardDesignBoxes.length <= 1) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(selectedBoxIndex, selectedCardDesignBoxes.length - 1));
    updateCardDesignBoxes(
      selectedScene.sceneNo,
      (boxes) => boxes.filter((_, index) => index !== safeIndex),
      Math.max(0, safeIndex - 1)
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
    updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
      fontSize: preset.fontSize,
      fontWeight: preset.fontWeight,
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
    updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
      textColor: preset.textColor,
      backgroundColor: preset.backgroundColor
    });
  };

  const beginCardDesignDrag = (
    event: ReactMouseEvent<HTMLDivElement>,
    mode: "move" | "resize",
    sceneNo: number,
    boxIndex: number,
    design: NonNullable<SceneScriptItem["cardDesign"]>
  ) => {
    const previewHost = event.currentTarget.parentElement;
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

  const updateSubtitleStyle = (patch: Partial<SceneScriptSubtitleStyle>) => {
    setEditableDocument((current) =>
      current
        ? {
            ...current,
            subtitleStyle: {
              ...current.subtitleStyle,
              ...patch
            }
          }
        : current
    );
  };

  const updateVoiceProfile = (patch: Partial<SceneScriptVoiceProfile>) => {
    setEditableDocument((current) =>
      current
        ? {
            ...current,
            voiceProfile: {
              ...current.voiceProfile,
              ...patch
            }
          }
        : current
    );
  };

  const updateCardNewsOptions = (
    patch: Partial<NonNullable<SceneScriptDocument["cardNews"]>>
  ) => {
    setEditableDocument((current) =>
      current
        ? (() => {
            const nextCardNews = {
              layoutPreset: current.cardNews?.layoutPreset ?? "headline_focus",
              transitionStyle: current.cardNews?.transitionStyle ?? "cut",
              outputFormat: current.cardNews?.outputFormat ?? "shorts_9_16",
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
          })()
        : current
    );
  };

  const applyStylePreset = (presetId: string) => {
    const preset = sceneStylePresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setEditableDocument((current) =>
      current
        ? {
            ...current,
            subtitleStyle: { ...preset.subtitleStyle },
            voiceProfile: { ...preset.voiceProfile }
          }
        : current
    );
    void saveWorkflowConfig({ createSceneStylePresetId: presetId });
  };

  const handleSave = async () => {
    if (!editableDocument) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await saveSceneScript(editableDocument);
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

  return (
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
        !hasGeneratedAssets ? (
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
                <div className="field field-span-2">
                  <span>{textFieldLabel}</span>
                  <textarea
                    className="text-input textarea-input"
                    value={selectedScene.text}
                    onChange={(event) =>
                      updateScene(selectedScene.sceneNo, { text: event.target.value })
                    }
                  />
                </div>
                {!isCardNewsModule || selectedScene.sceneNo === 1 ? (
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
                  {isKorean
                    ? `씬 ${editableDocument.scenes.length}개 · 총 ${totalDurationSec}초`
                    : `${editableDocument.scenes.length} scenes · ${totalDurationSec}s total`}
                </p>
              </div>
            </div>

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
                {isCardNewsModule ? (isKorean ? "Design" : "Design") : isKorean ? "Subtitle" : "Subtitle"}
              </button>
              {!isCardNewsModule ? (
                <button
                  type="button"
                  className={editorTab === "voice" ? "pill-button active" : "pill-button"}
                  onClick={() => setEditorTab("voice")}
                >
                  {isKorean ? "Voice" : "Voice"}
                </button>
              ) : null}
            </div>

            {editorTab === "scene" && (
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
                    <div className="field field-span-2">
                      <span>{textFieldLabel}</span>
                      <textarea
                        className="text-input textarea-input"
                        value={selectedScene.text}
                        onChange={(event) =>
                          updateScene(selectedScene.sceneNo, { text: event.target.value })
                        }
                      />
                    </div>
                    {isCardNewsModule && selectedScene.sceneNo > 1 && selectedCardDesign ? (
                      <>
                        <div className="field field-span-2">
                          <span>{isKorean ? "텍스트 박스" : "Text Boxes"}</span>
                          <div className="button-row">
                            {selectedCardDesignBoxes.map((_, index) => (
                              <button
                                key={`card-box-tab-${selectedScene.sceneNo}-${index}`}
                                type="button"
                                className={selectedBoxIndex === index ? "pill-button active" : "pill-button"}
                                onClick={() => setSelectedBoxIndex(index)}
                              >
                                {isKorean ? `박스 ${index + 1}` : `Box ${index + 1}`}
                              </button>
                            ))}
                            <button type="button" className="pill-button" onClick={addCardDesignBox}>
                              {isKorean ? "추가" : "Add"}
                            </button>
                            <button type="button" className="pill-button" onClick={duplicateCardDesignBox}>
                              {isKorean ? "복제" : "Duplicate"}
                            </button>
                            <button
                              type="button"
                              className="pill-button"
                              onClick={removeCardDesignBox}
                              disabled={selectedCardDesignBoxes.length <= 1}
                            >
                              {isKorean ? "삭제" : "Delete"}
                            </button>
                          </div>
                        </div>
                        <div className="field field-span-2">
                          <span>{isKorean ? "현재 박스 문구" : "Current Box Text"}</span>
                          <textarea
                            className="text-input textarea-input"
                            value={selectedCardDesign.text ?? ""}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                text: event.target.value
                              })
                            }
                          />
                        </div>
                        <div className="field field-span-2">
                          <span>{isKorean ? "텍스트 프리셋" : "Text Presets"}</span>
                          <div className="button-row">
                            {CARD_NEWS_TEXT_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className="pill-button"
                                onClick={() => applyCardTextPreset(preset.id)}
                              >
                                {isKorean ? preset.labelKo : preset.labelEn}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="field field-span-2">
                          <span>{isKorean ? "색상 프리셋" : "Color Presets"}</span>
                          <div className="button-row">
                            {CARD_NEWS_COLOR_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                className="pill-button"
                                onClick={() => applyCardColorPreset(preset.id)}
                              >
                                {isKorean ? preset.labelKo : preset.labelEn}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="field">
                          <span>{isKorean ? "텍스트 박스 X(%)" : "Text Box X (%)"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={90}
                            value={selectedCardDesign.xPct}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                xPct: Number(event.target.value) || 0
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "텍스트 박스 Y(%)" : "Text Box Y (%)"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={90}
                            value={selectedCardDesign.yPct}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                yPct: Number(event.target.value) || 0
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "박스 너비(%)" : "Box Width (%)"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={20}
                            max={100}
                            value={selectedCardDesign.widthPct}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                widthPct: Number(event.target.value) || 20
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "박스 높이(%)" : "Box Height (%)"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={10}
                            max={100}
                            value={selectedCardDesign.heightPct}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                heightPct: Number(event.target.value) || 10
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "폰트 크기" : "Font Size"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={18}
                            max={120}
                            value={selectedCardDesign.fontSize}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                fontSize: Number(event.target.value) || 18
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "두께" : "Weight"}</span>
                          <select
                            className="text-input"
                            value={selectedCardDesign.fontWeight}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
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
                          <span>{isKorean ? "정렬" : "Align"}</span>
                          <select
                            className="text-input"
                            value={selectedCardDesign.align}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                align: event.target.value as NonNullable<SceneScriptItem["cardDesign"]>["align"]
                              })
                            }
                          >
                            <option value="left">{isKorean ? "왼쪽" : "Left"}</option>
                            <option value="center">{isKorean ? "가운데" : "Center"}</option>
                            <option value="right">{isKorean ? "오른쪽" : "Right"}</option>
                          </select>
                        </div>
                        <div className="field">
                          <span>{isKorean ? "세로 정렬" : "Vertical Align"}</span>
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
                            <option value="top">{isKorean ? "위" : "Top"}</option>
                            <option value="middle">{isKorean ? "가운데" : "Middle"}</option>
                            <option value="bottom">{isKorean ? "아래" : "Bottom"}</option>
                          </select>
                        </div>
                        <div className="field">
                          <span>{isKorean ? "텍스트색" : "Text Color"}</span>
                          <input
                            className="text-input"
                            type="text"
                            value={selectedCardDesign.textColor}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                textColor: event.target.value
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <span>{isKorean ? "줄간격" : "Line Height"}</span>
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
                          <span>{isKorean ? "패딩(px)" : "Padding (px)"}</span>
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
                          <span>{isKorean ? "배경색 (rgba)" : "Background (rgba)"}</span>
                          <input
                            className="text-input"
                            type="text"
                            value={selectedCardDesign.backgroundColor}
                            onChange={(event) =>
                              updateCardDesign(selectedScene.sceneNo, selectedBoxIndex, {
                                backgroundColor: event.target.value
                              })
                            }
                          />
                        </div>
                      </>
                    ) : null}

                    {!isCardNewsModule || selectedScene.sceneNo === 1 ? (
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
                  </div>
                )}
              </>
            )}

            {editorTab === "subtitle" && (
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

                {isCardNewsModule ? (
                  <>
                    <h4>{isKorean ? "카드뉴스 디테일" : "Card News Details"}</h4>
                    <div className="form-grid">
                      <div className="field">
                        <span>{isKorean ? "1장 커버 소스" : "Cover Source (Card 1)"}</span>
                        <select
                          className="text-input"
                          value={editableDocument.cardNews?.coverSource ?? "ai_generate"}
                          onChange={(event) =>
                            updateCardNewsOptions({
                              coverSource: event.target.value as CardNewsCoverSource
                            })
                          }
                        >
                          {CARD_NEWS_COVER_SOURCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {isKorean ? option.labelKo : option.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field field-span-2">
                        <span>{isKorean ? "1장 커버 프롬프트(어그로용)" : "Cover Prompt (Card 1)"}</span>
                        <textarea
                          className="text-input textarea-input"
                          value={editableDocument.cardNews?.coverPrompt ?? ""}
                          onChange={(event) =>
                            updateCardNewsOptions({
                              coverPrompt: event.target.value
                            })
                          }
                        />
                      </div>
                      <div className="field field-span-2">
                        <span>{isKorean ? "1장 커버 이미지 경로" : "Cover Image Path (Card 1)"}</span>
                        <div className="button-row">
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
                            className="secondary-button"
                            onClick={() => void handleChooseCardNewsCoverImage()}
                          >
                            {isKorean ? "찾아보기" : "Browse"}
                          </button>
                        </div>
                      </div>
                      <div className="field field-span-2">
                        <span>{isKorean ? "2장 이후 템플릿 배경 경로" : "Template Background Path (Card 2+)"}</span>
                        <div className="button-row">
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
                            className="secondary-button"
                            onClick={() => void handleChooseCardNewsTemplateImage()}
                          >
                            {isKorean ? "찾아보기" : "Browse"}
                          </button>
                        </div>
                      </div>
                      <div className="field">
                        <span>{isKorean ? "레이아웃 프리셋" : "Layout Preset"}</span>
                        <select
                          className="text-input"
                          value={editableDocument.cardNews?.layoutPreset ?? "headline_focus"}
                          onChange={(event) =>
                            updateCardNewsOptions({
                              layoutPreset: event.target.value as CardNewsLayoutPreset
                            })
                          }
                        >
                          {CARD_NEWS_LAYOUT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {isKorean ? option.labelKo : option.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <span>{isKorean ? "카드 전환 스타일" : "Card Transition Style"}</span>
                        <select
                          className="text-input"
                          value={editableDocument.cardNews?.transitionStyle ?? "cut"}
                          onChange={(event) =>
                            updateCardNewsOptions({
                              transitionStyle: event.target.value as CardNewsTransitionStyle
                            })
                          }
                        >
                          {CARD_NEWS_TRANSITION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {isKorean ? option.labelKo : option.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <span>{isKorean ? "출력 포맷" : "Output Format"}</span>
                        <select
                          className="text-input"
                          value={editableDocument.cardNews?.outputFormat ?? "shorts_9_16"}
                          onChange={(event) =>
                            updateCardNewsOptions({
                              outputFormat: event.target.value as CardNewsOutputFormat
                            })
                          }
                        >
                          {CARD_NEWS_OUTPUT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {isKorean ? option.labelKo : option.labelEn}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : null}

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
              <span className="pill">
                {moduleCopy.sceneLabel} {selectedScene?.sceneNo ?? "-"}
              </span>
            </div>

            {!selectedScene ? (
              <p className="subtle">{copy.selectScene}</p>
            ) : (
              <>
                <div className="generation-preview-banner">
                  <p className="subtle">
                    {isKorean
                      ? "선택한 씬의 내레이션/키워드/모션을 오른쪽에서 빠르게 검토하세요."
                      : "Quickly review selected scene narration, keyword, and motion here."}
                  </p>
                </div>

                <div
                  className={
                    isCardNewsModule ? "generation-preview-media generation-preview-media--canvas" : "generation-preview-media"
                  }
                >
                  {activePreviewAsset ? (
                    activePreviewAsset.kind === "image" ? (
                      <div style={{ position: "relative", width: "100%", height: "100%" }}>
                        <img
                          src={activePreviewAsset.src}
                          alt={`Scene ${selectedScene.sceneNo} preview`}
                          onError={() =>
                            setPreviewAssetIndex((current) =>
                              Math.min(current + 1, sceneAssetCandidates.length)
                            )
                          }
                        />
                        {isCardNewsModule &&
                        selectedScene.sceneNo > 1 &&
                        selectedCardDesign ? (
                          <div
                            onMouseDown={(event) =>
                              beginCardDesignDrag(
                                event,
                                "move",
                                selectedScene.sceneNo,
                                selectedBoxIndex,
                                selectedCardDesign
                              )
                            }
                            style={{
                              position: "absolute",
                              left: `${selectedCardDesign.xPct}%`,
                              top: `${selectedCardDesign.yPct}%`,
                              width: `${selectedCardDesign.widthPct}%`,
                              height: `${selectedCardDesign.heightPct}%`,
                              padding: selectedCardDesign.padding,
                              background: selectedCardDesign.backgroundColor,
                              color: selectedCardDesign.textColor,
                              fontSize: selectedCardDesign.fontSize,
                              fontWeight: selectedCardDesign.fontWeight,
                              lineHeight: selectedCardDesign.lineHeight,
                              display: "flex",
                              alignItems:
                                selectedCardDesign.verticalAlign === "top"
                                  ? "flex-start"
                                  : selectedCardDesign.verticalAlign === "bottom"
                                    ? "flex-end"
                                    : "center",
                              justifyContent:
                                selectedCardDesign.align === "left"
                                  ? "flex-start"
                                  : selectedCardDesign.align === "right"
                                    ? "flex-end"
                                    : "center",
                              textAlign: selectedCardDesign.align,
                              borderRadius: 12,
                              boxSizing: "border-box",
                              whiteSpace: "pre-wrap",
                              cursor: cardDesignDrag?.sceneNo === selectedScene.sceneNo ? "grabbing" : "grab",
                              userSelect: "none"
                            }}
                          >
                            {selectedCardDesign.text && selectedCardDesign.text.trim()
                              ? selectedCardDesign.text
                              : selectedScene.text}
                            <div
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                beginCardDesignDrag(
                                  event,
                                  "resize",
                                  selectedScene.sceneNo,
                                  selectedBoxIndex,
                                  selectedCardDesign
                                );
                              }}
                              style={{
                                position: "absolute",
                                right: 8,
                                bottom: 8,
                                width: 14,
                                height: 14,
                                borderRadius: 3,
                                background: "rgba(255,255,255,0.85)",
                                border: "1px solid rgba(0,0,0,0.45)",
                                cursor: "nwse-resize"
                              }}
                              title={isKorean ? "드래그해서 박스 크기 조절" : "Drag to resize text box"}
                            />
                          </div>
                        ) : null}
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
                      {isKorean
                        ? "아직 생성된 씬 미리보기가 없습니다."
                        : "No generated scene preview is available yet."}
                    </p>
                  )}
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
                      <span>{isKorean ? "공통 템플릿 사용" : "Shared template background"}</span>
                    </div>
                  )}
                  <div>
                    <strong>{copy.motion}</strong>
                    <span>{selectedScene.motion}</span>
                  </div>
                  <div>
                    <strong>{copy.durationSec}</strong>
                    <span>{selectedScene.durationSec}s</span>
                  </div>
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
                        <span>{editableDocument.cardNews?.outputFormat ?? "shorts_9_16"}</span>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="generation-preview-text">
                  <p className="eyebrow">{textFieldLabel}</p>
                  <p>{selectedScene.text}</p>
                </div>

                {!isCardNewsModule || selectedScene.sceneNo === 1 ? (
                  <div className="generation-preview-prompt">
                    <p className="eyebrow">{moduleCopy.fluxPrompt}</p>
                    <p>{selectedScene.fluxPrompt}</p>
                  </div>
                ) : (
                  <div className="generation-preview-prompt">
                    <p className="eyebrow">{isKorean ? "템플릿 카드 안내" : "Template Card Note"}</p>
                    <p>
                      {isKorean
                        ? "2장 이후 카드는 공통 템플릿에 텍스트만 바꿔서 렌더링됩니다."
                        : "Cards after the cover reuse one template and swap text only."}
                    </p>
                  </div>
                )}

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
                      <span>{scene.durationSec}s</span>
                    </div>
                  ))}
                </div>

                <div className="generation-thumb-strip">
                  <p className="eyebrow">{isKorean ? "Scene Thumbnails" : "Scene Thumbnails"}</p>
                  <div className="generation-thumb-row">
                    {editableDocument.scenes.map((scene) => {
                      const thumbSrc = buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[0]?.src;
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
                <strong>{isKorean ? "Inspector" : "Inspector"}</strong>
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
                        <span>{isKorean ? "공통 템플릿 사용" : "Shared template background"}</span>
                      </div>
                    )}
                    <div>
                      <strong>{copy.motion}</strong>
                      <span>{selectedScene.motion}</span>
                    </div>
                    <div>
                      <strong>{copy.durationSec}</strong>
                      <span>{selectedScene.durationSec}s</span>
                    </div>
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
                      <span>{editableDocument.cardNews?.outputFormat ?? "shorts_9_16"}</span>
                    </div>
                  </div>

                  <div className="generation-preview-text">
                    <p className="eyebrow">{textFieldLabel}</p>
                    <p>{selectedScene.text}</p>
                  </div>

                  <div className="generation-preview-prompt">
                    <p className="eyebrow">{isKorean ? "템플릿 카드 안내" : "Template Card Note"}</p>
                    <p>
                      {isKorean
                        ? "2장 이후 카드는 공통 템플릿에 텍스트만 바꿔 렌더링됩니다."
                        : "Cards after the cover reuse one template and swap text only."}
                    </p>
                  </div>

                  <div className="generation-timeline">
                    <p className="eyebrow">{isKorean ? "Timeline" : "Timeline"}</p>
                    {editableDocument.scenes.map((scene) => (
                      <div
                        key={`inspector-timeline-${scene.sceneNo}`}
                        className={
                          scene.sceneNo === selectedScene.sceneNo
                            ? "generation-timeline-item active"
                            : "generation-timeline-item"
                        }
                      >
                        <span>
                          {moduleCopy.sceneLabel} {scene.sceneNo}
                        </span>
                        <span>{scene.durationSec}s</span>
                      </div>
                    ))}
                  </div>

                  <div className="generation-thumb-strip">
                    <p className="eyebrow">{isKorean ? "Scene Thumbnails" : "Scene Thumbnails"}</p>
                    <div className="generation-thumb-row">
                      {editableDocument.scenes.map((scene) => {
                        const thumbSrc = buildScenePreviewCandidates(resolvedPackagePath, scene.sceneNo)[0]?.src;
                        return (
                          <button
                            key={`inspector-thumb-${scene.sceneNo}`}
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
          ) : null}
        </div>
        )
      )}
    </section>
  );
}
