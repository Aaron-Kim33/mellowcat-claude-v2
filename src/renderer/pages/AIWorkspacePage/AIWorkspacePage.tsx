import { useEffect, useMemo, useState } from "react";
import type {
  AiWorkspaceMaterial,
  AiWorkspaceMaterialGroup,
  AiWorkspaceOutputFormat,
  AiWorkspacePlan,
  AiWorkspaceTargetKind,
  SceneScriptDocument,
  SceneScriptItem,
  SceneScriptVideoMediaLayer
} from "@common/types/media-generation";
import { useAppStore } from "../../store/app-store";

type AIWorkspacePageProps = {
  onNavigate?: (tab: "generation") => void;
};

const defaultPrompt =
  "아래 참고 링크와 이미지를 바탕으로 Manus가 자료를 분석하고, 성공적인 콘텐츠 구성처럼 새 결과물로 재구성해줘. 링크와 이미지는 참고자료로만 쓰고, 문장은 더 강한 훅과 자연스러운 한국어 카피로 다시 써줘. 필요한 이미지, 아이콘, 그래픽, 배치 아이디어도 함께 제안해줘. 제시한 자료들은 반드시 브라우저 재검색으로 기사 혹은 공식 공신력 있는 곳의 글과 교차검증을 하고, 팩트로만 기반해서 말해줘. 그렇게 뽑아낸 자료들을 다시 분석해서 순서대로 재구성하고, 최종 카피는 구어체 반말로 다시 뱉어내.";

const buildId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MANUS_BASE_INSTRUCTION =
  "아래 [USER PROMPT]를 최우선 요구사항으로 보고, [REFERENCE] 링크와 이미지를 바탕으로 Manus가 자료를 분석한 뒤 성공적인 콘텐츠 구성처럼 새 결과물로 재구성해줘. 링크와 이미지는 참고자료로만 쓰고, 문장은 더 강한 훅과 자연스러운 한국어 카피로 다시 써줘. 필요한 이미지, 아이콘, 그래픽, 배치 아이디어도 함께 제안해줘. 제시한 자료들은 반드시 브라우저 재검색으로 기사 또는 공식/공신력 있는 출처와 교차검증하고, 확인된 팩트에만 기반해서 말해줘. 검증한 자료를 다시 분석해서 순서대로 재구성하고, 최종 카피는 구어체 반말로 뱉어내.";
const toFilePreviewUrl = (filePath: string) => `file:///${filePath.replace(/\\/g, "/")}`;
const extractUrlsFromText = (text: string) => Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map((match) => match[0]);

const OUTPUT_FORMAT_OPTIONS: Array<{ id: AiWorkspaceOutputFormat; label: string; description: string; defaultInstruction: string }> = [
  {
    id: "shortform",
    label: "Shortform",
    description: "Pre-production plan for reels/shorts",
    defaultInstruction: [
      "먼저 숏폼을 어떻게 만들지 제안만 해줘. 실제 슬라이드, 이미지, 영상 생성은 아직 하지 마.",
      "- 전체 길이는 30~60초 기준으로 제안한다.",
      "- 첫 3초 훅, 전개, 반전/정보, 마무리 구조를 제안한다.",
      "- 5~9개 장면 후보로 나누고, 각 장면마다 제목, 목적, 내레이션 방향, 필요한 시각 자료를 적어줘.",
      "- 참고 링크/이미지는 장면별로 어디에 쓰면 좋을지만 제안한다.",
      "- 마지막에는 사용자가 승인 후 붙여넣을 수 있는 제작용 프롬프트 초안을 별도로 제안한다."
    ].join("\n")
  },
  {
    id: "longform",
    label: "Longform",
    description: "Pre-production plan for YouTube longform",
    defaultInstruction: [
      "먼저 롱폼을 어떻게 만들지 제안만 해줘. 실제 영상 제작이나 슬라이드 생성은 아직 하지 마.",
      "- 전체 흐름을 인트로, 배경 설명, 핵심 전개, 위기/반전, 결론으로 나눈다.",
      "- 챕터별 제목, 핵심 질문, 필요한 B-roll, 참고 근거, 화면 자료를 제안한다.",
      "- 시청 지속 시간을 위해 각 챕터 시작부에 남길 궁금증을 적어줘.",
      "- 링크와 이미지는 참고 근거와 시각 자료로만 쓰고, 본문에 URL을 노출하지 마.",
      "- 마지막에는 승인 후 제작 단계에서 쓸 수 있는 프롬프트 초안과 자료 체크리스트를 제안한다."
    ].join("\n")
  },
  {
    id: "slides",
    label: "Slides",
    description: "Pre-production plan for card news or Canva slides",
    defaultInstruction: [
      "먼저 카드뉴스/Canva 슬라이드를 어떻게 만들지 제안만 해줘. 실제 디자인 생성은 아직 하지 마.",
      "- 5~10장 슬라이드 구성 후보로 나눈다.",
      "- 1장은 강한 오프너, 중간 장은 정보/근거/비교/전개, 마지막 장은 정리 또는 CTA로 제안한다.",
      "- 각 슬라이드마다 제목, 본문 방향, 레이아웃 의도, 필요한 이미지/아이콘/그래픽을 적어줘.",
      "- 사용자가 준 이미지와 링크는 슬라이드별 참고 자료로 어디에 쓸지 제안한다.",
      "- 마지막에는 승인 후 Canva에 붙여넣을 제작용 프롬프트 초안을 별도로 제안한다."
    ].join("\n")
  }
];

const createDefaultFormatInstructions = () =>
  OUTPUT_FORMAT_OPTIONS.reduce(
    (acc, option) => ({
      ...acc,
      [option.id]: option.defaultInstruction
    }),
    {} as Record<AiWorkspaceOutputFormat, string>
  );

const createMaterialGroup = (order: number): AiWorkspaceMaterialGroup => ({
  id: buildId("ai-group"),
  title: `${order + 1}번 소재`,
  role: "custom",
  order,
  materials: []
});

const GROUP_ROLE_OPTIONS: Array<{ id: NonNullable<AiWorkspaceMaterialGroup["role"]>; labelKo: string; labelEn: string }> = [
  { id: "custom", labelKo: "자유", labelEn: "Custom" },
  { id: "intro", labelKo: "도입", labelEn: "Intro" },
  { id: "evidence", labelKo: "근거", labelEn: "Evidence" },
  { id: "twist", labelKo: "반전", labelEn: "Twist" },
  { id: "cta", labelKo: "CTA", labelEn: "CTA" },
  { id: "visual_reference", labelKo: "비주얼 참고", labelEn: "Visual Ref" },
  { id: "source", labelKo: "출처", labelEn: "Source" }
];

const getGroupRoleLabel = (role: AiWorkspaceMaterialGroup["role"], isKorean: boolean) =>
  GROUP_ROLE_OPTIONS.find((option) => option.id === role)?.[isKorean ? "labelKo" : "labelEn"] ??
  (isKorean ? "자유" : "Custom");

const buildDefaultCardDesign = (text: string): NonNullable<SceneScriptItem["cardDesign"]> => ({
  id: buildId("ai-card-box"),
  text,
  layerOrder: 0,
  hidden: false,
  locked: false,
  xPct: 50,
  yPct: 50,
  widthPct: 82,
  heightPct: 38,
  align: "center",
  verticalAlign: "middle",
  fontFamily: "GongGothic B",
  fontSize: 58,
  fontWeight: 800,
  textColor: "#FFFFFF",
  backgroundColor: "transparent",
  lineHeight: 1.22,
  padding: 24,
  outlineEnabled: true,
  outlineThickness: 8,
  outlineColor: "#000000",
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowDirectionDeg: 135,
  shadowOpacity: 35,
  shadowDistance: 8,
  shadowBlur: 12,
  richTextRuns: [{ text }]
});

const extractPackageJobId = (packagePath: string) => {
  const normalized = packagePath.replace(/\\/g, "/").replace(/\/+$/g, "");
  return normalized.split("/").pop() || `ai-workspace-${Date.now()}`;
};

const buildAssetSearchQuery = (group: AiWorkspaceMaterialGroup, item: AiWorkspacePlan["items"][number]) => {
  const materialLabels = group.materials
    .filter((material) => material.kind !== "text")
    .map((material) => material.label)
    .join(" ");
  return [item.visualPrompt, materialLabels, item.title].filter(Boolean).join(" ").trim().slice(0, 180);
};

const getAiVideoMaterialLayout = (index: number) => {
  const layouts = [
    { xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, fit: "cover" as const, opacity: 100 },
    { xPct: 75, yPct: 28, widthPct: 36, heightPct: 30, fit: "contain" as const, opacity: 96 },
    { xPct: 27, yPct: 72, widthPct: 34, heightPct: 28, fit: "contain" as const, opacity: 96 },
    { xPct: 72, yPct: 74, widthPct: 32, heightPct: 26, fit: "contain" as const, opacity: 92 }
  ];
  return layouts[index] ?? layouts[((index - 1) % (layouts.length - 1)) + 1];
};

const inferAiVideoMaterialLayout = (layoutIntent: string | undefined, materialIndex: number) => {
  const lowerIntent = layoutIntent?.toLowerCase() ?? "";
  if (materialIndex === 0 && /(background|배경|full|전체|cover)/i.test(lowerIntent)) {
    return { xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, fit: "cover" as const, opacity: 100 };
  }
  if (/(left|좌측|왼쪽)/i.test(lowerIntent)) {
    return { xPct: 28, yPct: 50, widthPct: 42, heightPct: 58, fit: "contain" as const, opacity: 96 };
  }
  if (/(right|우측|오른쪽)/i.test(lowerIntent)) {
    return { xPct: 72, yPct: 50, widthPct: 42, heightPct: 58, fit: "contain" as const, opacity: 96 };
  }
  if (/(top|상단|위)/i.test(lowerIntent)) {
    return { xPct: 50, yPct: 28, widthPct: 48, heightPct: 34, fit: "contain" as const, opacity: 96 };
  }
  if (/(bottom|하단|아래)/i.test(lowerIntent)) {
    return { xPct: 50, yPct: 73, widthPct: 48, heightPct: 34, fit: "contain" as const, opacity: 96 };
  }
  return getAiVideoMaterialLayout(materialIndex);
};

const extractJsonObject = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1].trim());
    }
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("AI response did not contain valid JSON.");
  }
};

const normalizePlan = (
  parsed: unknown,
  fallback: { targetKind: AiWorkspaceTargetKind; rawText: string; provider: AiWorkspacePlan["provider"]; model?: string }
): AiWorkspacePlan => {
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  return {
    summary: typeof record.summary === "string" ? record.summary : "AI design plan",
    targetKind:
      record.targetKind === "card_news" || record.targetKind === "video" || record.targetKind === "canva"
        ? record.targetKind
        : fallback.targetKind,
    canvaPrompt: typeof record.canvaPrompt === "string" ? record.canvaPrompt : fallback.rawText,
    items: rawItems.slice(0, 12).map((item, index) => {
      const itemRecord = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        index: Number(itemRecord.index) || index + 1,
        title: typeof itemRecord.title === "string" ? itemRecord.title : `Item ${index + 1}`,
        text: typeof itemRecord.text === "string" ? itemRecord.text : "",
        durationSec: Number.isFinite(Number(itemRecord.durationSec))
          ? Math.max(1, Math.min(120, Number(itemRecord.durationSec)))
          : undefined,
        sceneRole:
          itemRecord.sceneRole === "hook" ||
          itemRecord.sceneRole === "context" ||
          itemRecord.sceneRole === "evidence" ||
          itemRecord.sceneRole === "turning_point" ||
          itemRecord.sceneRole === "climax" ||
          itemRecord.sceneRole === "cta" ||
          itemRecord.sceneRole === "custom"
            ? itemRecord.sceneRole
            : undefined,
        visualPrompt: typeof itemRecord.visualPrompt === "string" ? itemRecord.visualPrompt : undefined,
        layoutIntent: typeof itemRecord.layoutIntent === "string" ? itemRecord.layoutIntent : undefined,
        editNote: typeof itemRecord.editNote === "string" ? itemRecord.editNote : undefined,
        sourceMaterialIds: Array.isArray(itemRecord.sourceMaterialIds)
          ? itemRecord.sourceMaterialIds.filter((value): value is string => typeof value === "string")
          : undefined
      };
    }),
    generatedAt: new Date().toISOString(),
    provider: fallback.provider,
    model: fallback.model,
    rawText: fallback.rawText
  };
};

const materialKindLabel = (kind: AiWorkspaceMaterial["kind"], isKorean: boolean) => {
  if (!isKorean) {
    return kind;
  }
  switch (kind) {
    case "text":
      return "텍스트";
    case "link":
      return "링크";
    case "image":
      return "이미지";
    case "video":
      return "영상";
    case "file":
      return "파일";
    default:
      return kind;
  }
};

export function AIWorkspacePage({ onNavigate }: AIWorkspacePageProps) {
  const settings = useAppStore((state) => state.settings);
  const sceneScript = useAppStore((state) => state.sceneScript);
  const sceneScriptPackagePath = useAppStore((state) => state.sceneScriptPackagePath);
  const workflowJobSnapshot = useAppStore((state) => state.workflowJobSnapshot);
  const telegramStatus = useAppStore((state) => state.telegramStatus);
  const pickYouTubePackageFolder = useAppStore((state) => state.pickYouTubePackageFolder);
  const inspectSceneScript = useAppStore((state) => state.inspectSceneScript);
  const saveSceneScript = useAppStore((state) => state.saveSceneScript);
  const saveWorkflowConfig = useAppStore((state) => state.saveWorkflowConfig);
  const isKorean = settings?.launcherLanguage === "ko";
  const [targetKind, setTargetKind] = useState<AiWorkspaceTargetKind>("canva");
  const [outputFormat, setOutputFormat] = useState<AiWorkspaceOutputFormat>("shortform");
  const [prompt, setPrompt] = useState("");
  const [formatInstructions, setFormatInstructions] = useState<Record<AiWorkspaceOutputFormat, string>>(
    createDefaultFormatInstructions
  );
  const [manusPrompt, setManusPrompt] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groups, setGroups] = useState<AiWorkspaceMaterialGroup[]>(() => [createMaterialGroup(0)]);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [plan, setPlan] = useState<AiWorkspacePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [manusSubmitting, setManusSubmitting] = useState(false);
  const [savingToCardNews, setSavingToCardNews] = useState(false);
  const [savingToVideo, setSavingToVideo] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [clipboardSaving, setClipboardSaving] = useState(false);
  const [linkAnalyzing, setLinkAnalyzing] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPackagePath, setSelectedPackagePath] = useState("");
  const resolvedPackagePath =
    selectedPackagePath ||
    sceneScriptPackagePath ||
    workflowJobSnapshot?.resolvedPackagePath ||
    telegramStatus?.lastPackagePath ||
    "";

  const orderedGroups = useMemo(
    () =>
      groups
        .map((group, order) => ({
          ...group,
          order,
          title: group.title || `${order + 1}번 소재`,
          materials: group.materials.map((material, materialOrder) => ({ ...material, order: materialOrder }))
        }))
        .sort((left, right) => left.order - right.order),
    [groups]
  );
  const activeGroupId = selectedGroupId || orderedGroups[0]?.id || "";
  const activeGroup = orderedGroups.find((group) => group.id === activeGroupId) ?? orderedGroups[0];
  const orderedMaterials = useMemo(() => orderedGroups.flatMap((group) => group.materials), [orderedGroups]);
  const selectedOutputFormat = OUTPUT_FORMAT_OPTIONS.find((option) => option.id === outputFormat) ?? OUTPUT_FORMAT_OPTIONS[0];

  const setOrderedGroups = (nextGroups: AiWorkspaceMaterialGroup[]) => {
    setGroups(
      nextGroups.map((group, order) => ({
        ...group,
        order,
        title: group.title || `${order + 1}번 소재`,
        materials: group.materials.map((material, materialOrder) => ({ ...material, order: materialOrder }))
      }))
    );
  };

  const setReferenceMaterials = (updater: (materials: AiWorkspaceMaterial[]) => AiWorkspaceMaterial[]) => {
    const baseGroup = orderedGroups[0] ?? createMaterialGroup(0);
    const nextMaterials = updater(baseGroup.materials).map((material, order) => ({ ...material, order }));
    setGroups([
      {
        ...baseGroup,
        title: "참고자료",
        role: "source",
        order: 0,
        materials: nextMaterials
      }
    ]);
    setSelectedGroupId(baseGroup.id);
  };

  const addGroup = () => {
    const nextGroup = createMaterialGroup(orderedGroups.length);
    setOrderedGroups([...orderedGroups, nextGroup]);
    setSelectedGroupId(nextGroup.id);
  };

  const removeGroup = (groupId: string) => {
    if (orderedGroups.length <= 1) {
      return;
    }
    const nextGroups = orderedGroups.filter((group) => group.id !== groupId);
    setOrderedGroups(nextGroups);
    if (activeGroupId === groupId) {
      setSelectedGroupId(nextGroups[0]?.id ?? "");
    }
  };

  const updateGroupTitle = (groupId: string, title: string) => {
    setOrderedGroups(orderedGroups.map((group) => (group.id === groupId ? { ...group, title } : group)));
  };

  const updateGroupRole = (groupId: string, role: NonNullable<AiWorkspaceMaterialGroup["role"]>) => {
    setOrderedGroups(orderedGroups.map((group) => (group.id === groupId ? { ...group, role } : group)));
  };

  const appendMaterialToGroup = (groupId: string, material: Omit<AiWorkspaceMaterial, "order">) => {
    setReferenceMaterials((materials) => [
      ...materials,
      {
        ...material,
        order: materials.length
      }
    ]);
  };

  const addTextMaterial = () => {
    const text = textDraft.trim();
    if (!text || !activeGroupId) {
      return;
    }
    appendMaterialToGroup(activeGroupId, {
      id: buildId("ai-text"),
      kind: "text",
      label: text.slice(0, 48) || "Text material",
      text
    });
    setTextDraft("");
  };

  const addLinkMaterial = () => {
    const sourceUrl = urlDraft.trim();
    if (!sourceUrl || !activeGroupId) {
      return;
    }
    appendMaterialToGroup(activeGroupId, {
      id: buildId("ai-link"),
      kind: "link",
      label: sourceUrl.replace(/^https?:\/\//i, "").slice(0, 48) || "Link material",
      sourceUrl
    });
    setUrlDraft("");
  };

  const addClipboardTextToWorkspace = (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || !activeGroupId) {
      return false;
    }
    const urls = extractUrlsFromText(trimmedText);
    if (urls.length > 0 && urls.join("\n") === trimmedText.split(/\s+/).join("\n")) {
      setReferenceMaterials((materials) => [
        ...materials,
        ...urls.map((sourceUrl, index) => ({
          id: buildId("ai-link"),
          kind: "link" as const,
          label: sourceUrl.replace(/^https?:\/\//i, "").slice(0, 48) || "Link material",
          sourceUrl,
          order: materials.length + index
        }))
      ]);
      setMessage(isKorean ? `클립보드 링크 ${urls.length}개를 참고자료에 추가했습니다.` : `Added ${urls.length} clipboard link(s) as references.`);
      return true;
    }
    setPrompt((currentPrompt) => [currentPrompt.trim(), trimmedText].filter(Boolean).join("\n\n"));
    setMessage(isKorean ? "클립보드 텍스트를 전체 지시 프롬프트에 붙여넣었습니다." : "Pasted clipboard text into the master prompt.");
    return true;
  };

  const analyzeLinkMaterial = async () => {
    const sourceUrl = urlDraft.trim();
    if (!sourceUrl || !activeGroupId) {
      return;
    }
    setLinkAnalyzing(true);
    setMessage("");
    try {
      const result = await window.mellowcat.automation.analyzeAiWorkspaceLink({ sourceUrl });
      const linkId = buildId("ai-link");
      appendMaterialToGroup(activeGroupId, {
        id: linkId,
        kind: "link",
        label: result.title || result.finalUrl,
        sourceUrl: result.finalUrl
      });

      const summaryText = [
        `제목: ${result.title}`,
        result.siteName ? `출처: ${result.siteName}` : "",
        result.publishedAt ? `게시일: ${result.publishedAt}` : "",
        result.description ? `요약: ${result.description}` : "",
        result.keywords.length > 0 ? `키워드: ${result.keywords.join(", ")}` : "",
        result.excerpt ? `본문 참고: ${result.excerpt}` : ""
      ]
        .filter(Boolean)
        .join("\n");
      appendMaterialToGroup(activeGroupId, {
        id: buildId("ai-link-analysis"),
        kind: "text",
        label: `Link analysis - ${result.title || result.siteName || "source"}`.slice(0, 80),
        text: summaryText
      });

      if (result.imageUrl) {
        appendMaterialToGroup(activeGroupId, {
          id: buildId("ai-link-image"),
          kind: "image",
          label: `대표 이미지 - ${result.title || result.siteName || "source"}`.slice(0, 80),
          sourceUrl: result.imageUrl
        });
      }

      setUrlDraft("");
      setMessage(
        isKorean
          ? "링크를 분석해서 출처, 요약, 키워드, 대표 이미지를 현재 번호 소재에 추가했습니다."
          : "Analyzed the link and added source, summary, keywords, and preview image to the active group."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to analyze link.");
    } finally {
      setLinkAnalyzing(false);
    }
  };

  const addFileMaterials = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !activeGroupId) {
      return;
    }
    const nextFiles = Array.from(fileList).map((file): Omit<AiWorkspaceMaterial, "order"> => {
      const kind = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      return {
        id: buildId("ai-file"),
        kind,
        label: file.name,
        mimeType: file.type || undefined,
        sourceUrl: URL.createObjectURL(file)
      };
    });
    setOrderedGroups(
      orderedGroups.map((group) =>
        group.id === activeGroupId
          ? {
              ...group,
              materials: [
                ...group.materials,
                ...nextFiles.map((material, index) => ({
                  ...material,
                  order: group.materials.length + index
                }))
              ]
            }
          : group
      )
    );
  };

  const readBlobAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read clipboard image."));
      reader.readAsDataURL(blob);
    });

  const addClipboardImageBlob = async (blob: Blob, fileName = "clipboard-image.png") => {
    if (!activeGroupId) {
      return false;
    }
    let localPath: string | undefined;
    let sourceUrl = URL.createObjectURL(blob);
    let mimeType = blob.type || "image/png";
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "패키지 경로를 먼저 선택한 뒤 이미지를 붙여넣어 주세요." : "Choose a package folder before pasting images.");
      setMessage(
        isKorean
          ? "패키지 경로가 없어 임시 참고이미지로 추가했습니다. 영구 저장하려면 패키지 폴더를 먼저 선택해 주세요."
          : "Added as a temporary reference image. Choose a package folder first to save it permanently."
      );
    } else {
      const dataUrl = await readBlobAsDataUrl(blob);
      const result = await window.mellowcat.automation.saveAiWorkspaceClipboardAsset({
        packagePath: resolvedPackagePath,
        dataUrl,
        fileName
      });
      localPath = result.localPath;
      sourceUrl = toFilePreviewUrl(result.localPath);
      mimeType = result.mimeType;
    }
    appendMaterialToGroup(activeGroupId, {
      id: buildId("ai-clipboard-image"),
      kind: "image",
      label: fileName,
      localPath,
      sourceUrl,
      mimeType
    });
    return true;
  };

  const addClipboardImagesFromData = async (data: DataTransfer | null) => {
    if (!data) {
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
    setClipboardSaving(true);
    try {
      let addedCount = 0;
      for (const file of imageFiles) {
        const added = await addClipboardImageBlob(file, file.name || `clipboard-image-${Date.now()}.png`);
        if (added) {
          addedCount += 1;
        }
      }
      if (addedCount === 0) {
        return false;
      }
      setMessage(
        isKorean
          ? `클립보드 이미지 ${imageFiles.length}개를 AI 작업실 소재에 추가했습니다.`
          : `Added ${imageFiles.length} clipboard image(s) to the AI workspace.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to paste clipboard image.");
    } finally {
      setClipboardSaving(false);
    }
    return true;
  };

  const handleMaterialPaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    const handled = await addClipboardImagesFromData(event.clipboardData);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const pastedText = event.clipboardData.getData("text/plain");
    if (pastedText && addClipboardTextToWorkspace(pastedText)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }
      const hasClipboardImage = Array.from(clipboardData.items ?? []).some(
        (item) => item.kind === "file" && item.type.startsWith("image/")
      );
      if (hasClipboardImage) {
        event.preventDefault();
        void addClipboardImagesFromData(clipboardData);
        return;
      }
      if (isEditableTarget) {
        return;
      }
      const pastedText = clipboardData.getData("text/plain");
      if (pastedText && addClipboardTextToWorkspace(pastedText)) {
        event.preventDefault();
      }
    };
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [activeGroupId, isKorean, orderedGroups, resolvedPackagePath]);

  const pasteImageFromClipboard = async () => {
    const clipboardReader = navigator.clipboard as Clipboard & {
      read?: () => Promise<ClipboardItem[]>;
    };
    if (!clipboardReader?.read) {
      setMessage(isKorean ? "이 환경에서는 버튼 붙여넣기를 지원하지 않습니다. 업로드 박스를 클릭한 뒤 Ctrl+V를 눌러 주세요." : "Clipboard button paste is not available here. Click the upload box and press Ctrl+V.");
      return;
    }
    setClipboardSaving(true);
    try {
      const clipboardItems = await clipboardReader.read();
      let count = 0;
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
        if (!imageType) {
          continue;
        }
        const blob = await clipboardItem.getType(imageType);
        count += 1;
        await addClipboardImageBlob(blob, `clipboard-image-${Date.now()}-${count}.png`);
      }
      setMessage(
        count > 0
          ? isKorean
            ? `클립보드 이미지 ${count}개를 AI 작업실 소재에 추가했습니다.`
            : `Added ${count} clipboard image(s) to the AI workspace.`
          : isKorean
            ? "클립보드에서 이미지를 찾지 못했습니다."
            : "No image was found in the clipboard."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to read clipboard image.");
    } finally {
      setClipboardSaving(false);
    }
  };

  const removeMaterial = (groupId: string, materialId: string) => {
    setReferenceMaterials((materials) => materials.filter((material) => material.id !== materialId));
  };

  const handleGroupDrop = (targetId: string) => {
    if (!draggingGroupId || draggingGroupId === targetId) {
      setDraggingGroupId(null);
      setDragOverGroupId(null);
      return;
    }
    const fromIndex = orderedGroups.findIndex((group) => group.id === draggingGroupId);
    const toIndex = orderedGroups.findIndex((group) => group.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingGroupId(null);
      setDragOverGroupId(null);
      return;
    }
    const nextGroups = [...orderedGroups];
    const [moved] = nextGroups.splice(fromIndex, 1);
    nextGroups.splice(toIndex, 0, moved);
    setOrderedGroups(nextGroups);
    setDraggingGroupId(null);
    setDragOverGroupId(null);
  };

  const updateSelectedFormatInstruction = (value: string) => {
    setFormatInstructions((current) => ({
      ...current,
      [outputFormat]: value
    }));
  };

  const getMaterialReferenceLine = (material: AiWorkspaceMaterial, materialIndex: number) => {
    const content = material.text || material.sourceUrl || material.localPath || material.label || "(empty)";
    return `${materialIndex + 1}. [${material.kind}] ${material.label}\n   id: ${material.id}\n   ${content}`;
  };

  const buildReferenceSection = (kind: AiWorkspaceMaterial["kind"], title: string) => {
    const materials = orderedMaterials.filter((material) => material.kind === kind);
    if (materials.length === 0) {
      return "";
    }
    return [`[REFERENCE] ${title}`, ...materials.map(getMaterialReferenceLine)].join("\n");
  };

  const buildGroupedReferenceSection = () => {
    if (orderedMaterials.length === 0) {
      return "";
    }
    return [
      "[REFERENCE] All reference materials",
      ...orderedMaterials.map(getMaterialReferenceLine)
    ].join("\n");
  };

  const buildManusPromptPackage = () =>
    [
      "[BASE INSTRUCTION]",
      MANUS_BASE_INSTRUCTION,
      "",
      "[USER PROMPT]",
      prompt.trim() || "(사용자 프롬프트가 비어 있습니다. 참고자료 기반으로 제작 방향 제안부터 해 주세요.)",
      "",
      "[OUTPUT FORMAT]",
      `${selectedOutputFormat.label} - ${selectedOutputFormat.description}`,
      "",
      "[FORMAT-SPECIFIC PLANNING INSTRUCTIONS]",
      formatInstructions[outputFormat] || selectedOutputFormat.defaultInstruction,
      "",
      buildGroupedReferenceSection(),
      "",
      buildReferenceSection("link", "Links"),
      "",
      buildReferenceSection("image", "Images"),
      "",
      buildReferenceSection("video", "Videos"),
      "",
      buildReferenceSection("file", "Files"),
      "",
      "[IMPORTANT]",
      "- Do not create final images, final slides, final videos, or any finished deliverable yet.",
      "- First propose how to make it: concept, structure, scene/slide order, visual direction, risks, and required materials.",
      "- Before proposing the structure, use browser research to cross-check the supplied links/images against reliable news, official sources, or other credible references.",
      "- Base factual claims only on verified material. If a claim cannot be verified, mark it as unverified and do not use it as a factual hook.",
      "- Re-analyze the verified facts, then rebuild the content in a stronger order instead of merely summarizing the references.",
      "- Write final Korean copy in casual spoken banmal. Make the hook sharper, the flow more natural, and avoid stiff translation-style wording.",
      "- Use references as context only. Do not simply copy or list them.",
      "- Do not expose raw URLs inside viewer-facing copy.",
      "- For each proposed scene/slide, explain which reference link/image/video should be used and why.",
      "- End with a separate 'production prompt draft' that the user may approve and use later."
    ]
      .filter((part) => part !== "")
      .join("\n");

  const generateManusPrompt = () => {
    const nextPrompt = buildManusPromptPackage();
    setManusPrompt(nextPrompt);
    setMessage(isKorean ? "Manus용 프롬프트를 생성했습니다." : "Generated a Manus-ready prompt.");
  };

  const copyManusPrompt = async () => {
    const nextPrompt = buildManusPromptPackage();
    setManusPrompt(nextPrompt);
    await navigator.clipboard.writeText(nextPrompt);
    setMessage(isKorean ? "Manus용 프롬프트를 클립보드에 복사했습니다." : "Copied Manus prompt to clipboard.");
  };

  const submitToManus = async () => {
    const nextPrompt = buildManusPromptPackage();
    setManusPrompt(nextPrompt);
    setManusSubmitting(true);
    setMessage("");
    try {
      const result = await window.mellowcat.automation.submitAiWorkspaceToManus({
        prompt: nextPrompt,
        packagePath: resolvedPackagePath || undefined,
        attachments: orderedMaterials
          .filter((material) => material.localPath || material.sourceUrl)
          .map((material) => ({
            id: material.id,
            label: material.label,
            kind: material.kind,
            localPath: material.localPath,
            sourceUrl: material.sourceUrl,
            mimeType: material.mimeType
          }))
      });
      const suffix = result.taskUrl ? ` (${result.taskUrl})` : "";
      setMessage(
        isKorean
          ? `Manus 작업을 생성했습니다. Task ID: ${result.taskId}${suffix}`
          : `Created Manus task. Task ID: ${result.taskId}${suffix}`
      );
      if (result.taskUrl) {
        await window.mellowcat.app.openExternal(result.taskUrl);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to submit to Manus.");
    } finally {
      setManusSubmitting(false);
    }
  };

  const buildAiPrompt = () => {
    const materialBlocks = orderedGroups
      .map((group, groupIndex) => {
        const materials = group.materials
          .map((material, materialIndex) => {
            const content = material.text || material.localPath || material.sourceUrl || material.label;
            return [
              `    - material_${materialIndex + 1}`,
              `      id: ${material.id}`,
              `      kind: ${material.kind}`,
              `      label: ${material.label}`,
              `      content: ${content || "(empty)"}`
            ].join("\n");
          })
          .join("\n");
        return [
          `  ${groupIndex + 1}. groupId: ${group.id}`,
          `     title: ${group.title}`,
          `     role: ${getGroupRoleLabel(group.role, false)}`,
          materials || "    - (empty)"
        ].join("\n");
      })
      .join("\n\n");
    return [
      "너는 한국 SNS 콘텐츠를 기획하는 시니어 크리에이티브 디렉터이자 영상/카드뉴스 씬 설계자다.",
      "사용자가 넣은 텍스트, 링크, 이미지, 영상, 파일은 전부 하나의 재료통이다. 번호나 그룹은 정리용일 뿐 씬 번호가 아니다.",
      "전체 재료를 한 번에 읽고, 가장 자연스러운 흐름으로 3~10개의 새 씬을 직접 나눠라.",
      "원문을 그대로 나열하거나 입력 그룹 개수대로 기계적으로 맞추면 실패다.",
      "고유명사, 핵심 사실, 이미지/영상 자료의 의미만 보존하고 제목, 카피, 장면 순서, 시각 배치는 새로 설계한다.",
      "링크 분석 텍스트는 근거와 맥락으로 쓰고, 이미지/영상 소재는 필요한 장면에 배경/인서트/비교컷/자료화면으로 배치한다.",
      "한국어는 자연스러운 구어체 또는 카드뉴스 카피체로 작성한다. 내부 지시문, URL, 분석 메타 문장을 결과 카피에 넣지 않는다.",
      "",
      `목표 출력 타입: ${targetKind}`,
      targetKind === "video"
        ? "영상용 items를 만든다. 각 item은 하나의 장면이며 durationSec, sceneRole, layoutIntent, editNote, sourceMaterialIds를 최대한 채운다. durationSec는 보통 3~12초로 잡고, sceneRole은 hook/context/evidence/turning_point/climax/cta/custom 중 하나를 쓴다."
        : targetKind === "card_news"
          ? "카드뉴스용 items를 만든다. 각 item은 카드 1장이다. 첫 장은 훅, 중간 장은 정보/근거/전개, 마지막 장은 저장/공유/댓글 유도 역할을 하게 한다."
          : "Canva 제작용 plan을 만든다. canvaPrompt에는 Canva AI에 붙여넣을 수 있는 목적, 톤, 레이아웃, 색감, 소재 사용 지시를 구체적으로 적는다.",
      "",
      "출력은 반드시 JSON 객체 하나만 반환한다. 마크다운 코드블록 금지.",
      "JSON schema:",
      '{"summary":"새 콘텐츠 콘셉트 한 줄","targetKind":"card_news|video|canva","canvaPrompt":"Canva나 제작 AI에 붙여넣을 최종 제작 프롬프트","items":[{"index":1,"title":"새로 만든 페이지/장면 제목","text":"최종 화면 카피 또는 내레이션","durationSec":6,"sceneRole":"hook|context|evidence|turning_point|climax|cta|custom","visualPrompt":"부족한 이미지/영상/아이콘 생성 또는 검색 지시","layoutIntent":"선택한 소재를 화면에 어떻게 배치할지","editNote":"검수자가 볼 편집 메모","sourceMaterialIds":["사용한 소재 id"]}]}',
      "",
      "사용자 요청:",
      prompt.trim(),
      "",
      "전체 재료통:",
      materialBlocks,
      "",
      "중요 규칙:",
      "- items 개수는 입력 그룹 개수와 달라도 된다.",
      "- 이미지/영상/link preview 소재를 쓰는 장면은 sourceMaterialIds와 layoutIntent를 반드시 함께 적는다.",
      "- item.text는 최종 결과물에 그대로 올라갈 수 있는 완성 문장이어야 한다.",
      "- visualPrompt는 추가 소재가 필요할 때만 구체적으로 쓴다. 이미 충분한 이미지/영상이 있으면 layoutIntent에 배치 방식을 더 자세히 쓴다.",
      "- canvaPrompt에도 원재료를 어떻게 재구성할지 쓰되, 단순 목록 복붙은 금지한다."
    ].join("\n");
    const targetGuide =
      targetKind === "video"
        ? [
            "영상 초안을 만든다.",
            "items는 장면 단위다. 각 item.text는 화면 자막 또는 내레이션으로 바로 쓸 수 있는 한국어 문장이어야 한다.",
            "각 장면은 원문 복붙이 아니라 훅, 전개, 반전/정보, 마무리 흐름으로 재구성한다.",
            "visualPrompt에는 필요한 영상/이미지/아이콘/그래픽 검색 또는 생성 지시를 영어 중심으로 적는다."
          ].join("\n")
        : targetKind === "card_news"
          ? [
              "카드뉴스 초안을 만든다.",
              "items는 카드 1장 단위다. 첫 장은 강한 훅, 중간 장은 정보/근거/전개, 마지막 장은 저장/공유/댓글을 유도한다.",
              "item.text는 카드 안에 들어갈 최종 카피다. 사용자가 넣은 문장을 그대로 반복하지 말고 더 짧고 강하게 다시 쓴다.",
              "visualPrompt에는 카드 배경, 아이콘, 사진, 레이아웃 방향을 구체적으로 적는다."
            ].join("\n")
          : [
              "Canva에서 실행할 수 있는 제작 프롬프트와 슬라이드 초안을 만든다.",
              "canvaPrompt에는 Canva AI에게 붙여넣으면 바로 디자인 생성이 가능할 정도로 목적, 톤, 레이아웃, 색감, 필요한 소재를 구체적으로 적는다.",
              "items는 슬라이드/페이지 단위다. 각 item은 최종 카피와 시각 지시를 포함한다."
            ].join("\n");

    return [
      "너는 한국 SNS 콘텐츠를 기획하는 시니어 크리에이티브 디렉터다.",
      "사용자가 번호별로 넣은 텍스트/링크/이미지/영상/파일은 원재료일 뿐이다.",
      "절대 원재료를 그대로 나열하거나 복붙하지 말고, 시청자가 멈추고 읽게 만드는 새 콘텐츠 구조로 재해석한다.",
      "입력 문장을 그대로 쓰는 것은 실패다. 고유명사와 핵심 사실만 보존하고, 제목/카피/흐름/시각 연출은 새로 만든다.",
      "한국어는 자연스러운 구어체 또는 카드뉴스 카피체로 쓴다. 번역투, 설명문, 내부 지시문, URL 노출은 피한다.",
      "각 번호의 순서는 유지하되, 필요하면 더 좋은 훅/전개를 위해 압축하거나 합칠 수 있다.",
      "",
      `목표 출력 타입: ${targetKind}`,
      targetGuide,
      "",
      "출력은 반드시 JSON 객체 하나만 반환한다. 마크다운 코드블록 금지.",
      "JSON schema:",
      '{"summary":"새 콘텐츠 콘셉트 한 줄","targetKind":"card_news|video|canva","canvaPrompt":"Canva나 제작 AI에 붙여넣을 최종 제작 프롬프트","items":[{"index":1,"title":"새로 만든 페이지/장면 제목","text":"최종 화면 카피 또는 내레이션","visualPrompt":"이미지/영상/아이콘/레이아웃 생성 지시","sourceMaterialIds":["사용한 소재 id"]}]}',
      "중요: 이미지/영상/link preview 소재가 있으면 반드시 시각 자료로 활용하고, 해당 id를 sourceMaterialIds에 넣는다.",
      "중요: 영상 target에서는 item.text만 만들고 끝내면 실패다. visualPrompt와 sourceMaterialIds를 통해 어떤 이미지/영상 소재를 어느 장면에 쓸지 지정한다.",
      "중요: 링크 분석 텍스트는 근거와 맥락으로만 사용하고, 대표 이미지 소재는 가능한 장면 배경 또는 인서트로 활용한다.",
      "",
      "사용자 추가 요청:",
      prompt.trim(),
      "",
      "번호별 원재료:",
      materialBlocks,
      "",
      "품질 기준:",
      "- summary와 title도 새로 작성한다.",
      "- item.text에는 '사용자 메모를 반영해', '아래 소재를 바탕으로' 같은 작업 지시문을 넣지 않는다.",
      "- 조회수, 구독자, 내부 분석 수치처럼 원재료 설명용 메타데이터는 콘텐츠 문장에 직접 넣지 않는다.",
      "- 각 item은 바로 디자인/영상으로 넘겨도 어색하지 않은 완성 문장이어야 한다.",
      "- sourceMaterialIds에는 실제로 참고한 소재 id만 넣는다."
    ].join("\n");
    const groupText = orderedGroups
      .map((group, groupIndex) => {
        const materialsText = group.materials
          .map((material, materialIndex) => {
            const body = material.text || material.sourceUrl || material.localPath || material.label;
            return `  ${materialIndex + 1}) id=${material.id} [${material.kind}] ${material.label}\n  ${body}`;
          })
          .join("\n");
        return `${groupIndex + 1}. ${group.title}\n역할: ${getGroupRoleLabel(group.role, true)}\n${materialsText || "  (비어 있음)"}`;
      })
      .join("\n\n");
    return [
      "너는 한국형 콘텐츠 디자인 디렉터다.",
      "사용자가 번호별로 묶어둔 소재를 반드시 순서대로 해석해서 Canva 슬라이드, 카드뉴스, 영상 편집 설계안을 만든다.",
      "각 번호는 하나의 장면, 카드, 슬라이드, 또는 편집 블록 후보이며, 그 안의 텍스트/링크/이미지/영상/파일은 함께 쓰이는 재료다.",
      "출력은 반드시 JSON 객체 하나만 반환한다.",
      "JSON 스키마:",
      '{"summary":"전체 콘셉트","targetKind":"card_news|video|canva","canvaPrompt":"Canva에 그대로 붙일 수 있는 최종 프롬프트","items":[{"index":1,"title":"슬라이드/장면 제목","text":"화면에 들어갈 최종 문구 또는 내레이션","visualPrompt":"필요한 이미지/영상/그래픽 지시","sourceMaterialIds":["소재 id"]}]}',
      `목표 타입: ${targetKind}`,
      `사용자 프롬프트:\n${prompt || defaultPrompt}`,
      `번호별 소재 묶음:\n${groupText}`,
      "주의: 텍스트는 한국어로 자연스럽게 작성한다. 링크는 참고 출처로만 쓰고 화면 문구에 URL을 그대로 노출하지 않는다. 이미지/영상/파일은 해당 번호의 시각 소재로 반영한다."
    ].join("\n\n");
  };

  const buildCurrentWorkspaceState = (): NonNullable<SceneScriptDocument["aiWorkspace"]> => ({
    targetKind,
    outputFormat,
    prompt,
    formatInstructions,
    manusPrompt,
    materials: orderedMaterials,
    materialGroups: orderedGroups,
    plan: plan ?? undefined
  });

  const applyWorkspaceState = (workspace: NonNullable<SceneScriptDocument["aiWorkspace"]>) => {
    setTargetKind(workspace.targetKind);
    setOutputFormat(workspace.outputFormat ?? "shortform");
    setPrompt(workspace.prompt || "");
    setFormatInstructions({
      ...createDefaultFormatInstructions(),
      ...(workspace.formatInstructions ?? {})
    });
    setManusPrompt(workspace.manusPrompt ?? "");
    const nextGroups =
      workspace.materialGroups && workspace.materialGroups.length > 0
        ? workspace.materialGroups
        : [
            {
              id: buildId("ai-group"),
              title: "참고자료",
              order: 0,
              materials: workspace.materials ?? []
            }
          ];
    setOrderedGroups(nextGroups);
    setSelectedGroupId(nextGroups[0]?.id ?? "");
    setPlan(workspace.plan ?? null);
  };

  const saveWorkspaceDraft = async () => {
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "먼저 저장할 작업 패키지 폴더를 선택해 주세요." : "Choose a package folder first.");
      return;
    }
    setWorkspaceSaving(true);
    setMessage("");
    try {
      await window.mellowcat.automation.updateAiWorkspace(resolvedPackagePath, buildCurrentWorkspaceState());
      setMessage(isKorean ? "AI 작업실 초안을 패키지에 저장했습니다." : "AI workspace draft saved to package.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save AI workspace.");
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const loadWorkspaceDraft = async (packagePath = resolvedPackagePath) => {
    if (!packagePath) {
      setMessage(isKorean ? "먼저 불러올 작업 패키지 폴더를 선택해 주세요." : "Choose a package folder first.");
      return;
    }
    setWorkspaceSaving(true);
    setMessage("");
    try {
      const workspace = await window.mellowcat.automation.inspectAiWorkspace(packagePath);
      if (!workspace) {
        setMessage(isKorean ? "저장된 AI 작업실 초안이 없습니다." : "No saved AI workspace draft was found.");
        return;
      }
      applyWorkspaceState(workspace);
      setMessage(isKorean ? "AI 작업실 초안을 불러왔습니다." : "AI workspace draft loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load AI workspace.");
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const buildLocalFallbackPlan = () => {
    const items = orderedGroups.slice(0, 12).map((group, index) => {
      const mainText = group.materials.find((material) => material.text)?.text;
      const visualPrompt = group.materials
        .filter((material) => material.kind !== "text")
        .map((material) => material.label || material.sourceUrl || material.localPath)
        .filter(Boolean)
        .join(" / ");
      return {
        index: index + 1,
        title: group.title || `${index + 1}번 소재`,
        text: mainText || group.materials.map((material) => material.label).join(" / ") || prompt,
        durationSec: targetKind === "video" ? 6 : 1,
        sceneRole: index === 0 ? "hook" : index === orderedGroups.length - 1 ? "cta" : "context",
        visualPrompt: visualPrompt || group.title,
        layoutIntent: visualPrompt
          ? "Use the strongest visual material as the scene background and place secondary assets as inserts."
          : "Create a clean text-led scene.",
        editNote: "Fallback draft. Review copy, materials, timing, and layout before sending to the editor.",
        sourceMaterialIds: group.materials.map((material) => material.id)
      };
    });
    return JSON.stringify({
      summary: "API 키가 없어 로컬 초안으로 구성했습니다.",
      targetKind,
      canvaPrompt: `${prompt}\n\n번호별 소재:\n${orderedGroups
        .map((group, index) => `${index + 1}. ${group.title}: ${group.materials.map((material) => material.label).join(", ") || "비어 있음"}`)
        .join("\n")}`,
      items: items.length > 0 ? items : [{ index: 1, title: "프롬프트 기반 초안", text: prompt, visualPrompt: prompt, sourceMaterialIds: [] }]
    });
  };

  const generatePlan = async () => {
    const aiPrompt = buildManusPromptPackage();
    setManusPrompt(aiPrompt);
    setBusy(true);
    setMessage("");
    try {
      const result = await window.mellowcat.automation.generateAiWorkspacePlan({
        prompt: aiPrompt,
        targetKind,
        fallbackRawText: buildLocalFallbackPlan()
      });
      const rawText = result.rawText;
      if (!rawText.trim()) {
        throw new Error("AI returned empty content.");
      }
      setPlan(
        normalizePlan(extractJsonObject(rawText), {
          targetKind,
          rawText,
          provider: result.provider,
          model: result.model
        })
      );
      setMessage(isKorean ? "AI 설계 초안이 생성되었습니다." : "AI design draft generated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI design generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const updatePlanSummary = (summary: string) => {
    setPlan((current) => (current ? { ...current, summary } : current));
  };

  const updatePlanCanvaPrompt = (canvaPrompt: string) => {
    setPlan((current) => (current ? { ...current, canvaPrompt } : current));
  };

  const updatePlanItem = (
    itemIndex: number,
    patch: Partial<Pick<AiWorkspacePlan["items"][number], "title" | "text" | "durationSec" | "sceneRole" | "visualPrompt" | "layoutIntent" | "editNote">>
  ) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, index) => (index === itemIndex ? { ...item, ...patch } : item))
          }
        : current
    );
  };

  const choosePackageFolder = async () => {
    const packagePath = await pickYouTubePackageFolder();
    if (!packagePath) {
      return;
    }
    setSelectedPackagePath(packagePath);
    try {
      await inspectSceneScript(packagePath);
      await loadWorkspaceDraft(packagePath);
      setMessage(isKorean ? "선택한 패키지를 불러왔습니다." : "Package loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load package.");
    }
  };

  const buildCardNewsDocumentFromPlan = (sourcePlan: AiWorkspacePlan, packagePath: string): SceneScriptDocument => {
    const sourceDocument = sceneScript;
    const items = sourcePlan.items.length > 0 ? sourcePlan.items : normalizePlan(JSON.parse(buildLocalFallbackPlan()), {
      targetKind,
      rawText: "",
      provider: "local"
    }).items;
    const scenes: SceneScriptItem[] = items.map((item, index) => {
      const group = orderedGroups[index] ?? orderedGroups[0] ?? createMaterialGroup(index);
      const text = item.text?.trim() || item.title?.trim() || `${index + 1}번 카드`;
      const cardDesign = buildDefaultCardDesign(text);
      return {
        sceneNo: index + 1,
        text,
        fluxPrompt: item.visualPrompt || buildAssetSearchQuery(group, item) || text,
        assetSearchQuery: buildAssetSearchQuery(group, item) || text,
        motion: "none",
        durationSec: 1,
        cardDesign,
        cardDesignBoxes: [cardDesign]
      };
    });
    return {
      schemaVersion: 1,
      jobId: sourceDocument?.jobId || extractPackageJobId(packagePath),
      language: "ko",
      category: sourceDocument?.category || "community",
      targetDurationSec: scenes.length,
      scenes,
      subtitleStyle: sourceDocument?.subtitleStyle || {
        mode: "outline",
        fontFamily: "GongGothic B",
        fontSize: 42,
        outline: 6,
        color: "#FFFFFF",
        outlineColor: "#000000"
      },
      voiceProfile: sourceDocument?.voiceProfile || {
        provider: "azure",
        voiceId: "ko-KR-SunHiNeural",
        modelId: "azure-speech"
      },
      cardNews: {
        layoutPreset: "headline_focus",
        transitionStyle: "cut",
        outputFormat: "square_1_1",
        coverSource: "manual_upload",
        coverPrompt: sourcePlan.summary
      },
      aiWorkspace: {
        targetKind,
        outputFormat,
        prompt,
        formatInstructions,
        manusPrompt,
        materials: orderedMaterials,
        materialGroups: orderedGroups,
        plan: sourcePlan
      }
    };
  };

  const buildVideoDocumentFromPlan = (sourcePlan: AiWorkspacePlan, packagePath: string): SceneScriptDocument => {
    const sourceDocument = sceneScript;
    const items = sourcePlan.items.length > 0 ? sourcePlan.items : normalizePlan(JSON.parse(buildLocalFallbackPlan()), {
      targetKind,
      rawText: "",
      provider: "local"
    }).items;
    const materialById = new Map(orderedMaterials.map((material) => [material.id, material]));
    const getVisualMaterialsForItem = (item: AiWorkspacePlan["items"][number], index: number) => {
      const explicitMaterials = (item.sourceMaterialIds ?? [])
        .map((materialId) => materialById.get(materialId))
        .filter((material): material is AiWorkspaceMaterial => Boolean(material))
        .filter((material) => material.kind === "image" || material.kind === "video");
      if (explicitMaterials.length > 0) {
        return explicitMaterials;
      }
      const group = orderedGroups[index] ?? orderedGroups[0];
      const nearbyGroups = [group, orderedGroups[index - 1], orderedGroups[index + 1]].filter(
        (candidate): candidate is AiWorkspaceMaterialGroup => Boolean(candidate)
      );
      const nearbyMaterials = nearbyGroups
        .flatMap((candidate) => candidate.materials)
        .filter((material) => material.kind === "image" || material.kind === "video");
      if (nearbyMaterials.length > 0) {
        return nearbyMaterials;
      }
      return orderedMaterials.filter((material) => material.kind === "image" || material.kind === "video");
    };
    const scenes: SceneScriptItem[] = items.map((item, index) => {
      const group = orderedGroups[index] ?? orderedGroups[0] ?? createMaterialGroup(index);
      const text = item.text?.trim() || item.title?.trim() || `${index + 1}번 장면`;
      return {
        sceneNo: index + 1,
        text,
        fluxPrompt: "",
        assetSearchQuery: "",
        motion: "none",
        durationSec: Math.max(1, Math.min(120, Number(item.durationSec) || 6)),
        videoTextOverlay: {
          text,
          startSec: 0,
          durationSec: Math.max(1, Math.min(120, Number(item.durationSec) || 6)),
          trackIndex: 0,
          xPct: 50,
          yPct: 50,
          widthPct: 78,
          heightPct: 22,
          fontSize: 68,
          fontWeight: 800,
          textColor: "#FFFFFF",
          outlineColor: "#000000",
          outlineThickness: 8,
          backgroundColor: "transparent"
        }
      };
    });
    const sceneStartTimes = scenes.reduce<number[]>((starts, scene, index) => {
      starts.push(index === 0 ? 0 : starts[index - 1] + scenes[index - 1].durationSec);
      return starts;
    }, []);
    const videoMediaLayers: SceneScriptVideoMediaLayer[] = items.flatMap((item, index) => {
      const scene = scenes[index];
      const sceneStartSec = sceneStartTimes[index] ?? 0;
      return getVisualMaterialsForItem(item, index)
        .filter((material) => material.localPath || material.sourceUrl)
        .map((material, materialIndex): SceneScriptVideoMediaLayer => {
          const layout = inferAiVideoMaterialLayout(item.layoutIntent, materialIndex);
          const localPath = material.localPath;
          const sourceUrl = material.sourceUrl;
          const relativePath =
            localPath && localPath.toLowerCase().startsWith(packagePath.toLowerCase())
              ? localPath.slice(packagePath.length).replace(/^[/\\]+/, "")
              : undefined;
          return {
            id: buildId(`ai-video-${index + 1}-${materialIndex + 1}`),
            mediaType: material.kind === "video" ? "video" : "image",
            source: localPath ? "local" : "manual",
            label: material.label,
            localPath,
            relativePath,
            sourceUrl,
            previewUrl: sourceUrl,
            startSec: sceneStartSec,
            durationSec: scene.durationSec,
            trackIndex: materialIndex,
            fit: layout.fit,
            opacity: layout.opacity,
            xPct: layout.xPct,
            yPct: layout.yPct,
            widthPct: layout.widthPct,
            heightPct: layout.heightPct
          };
        });
    });
    const videoTextOverlays = scenes.map((scene, index) => ({
      text: scene.text,
      startSec: sceneStartTimes[index] ?? 0,
      durationSec: scene.durationSec,
      trackIndex: 0,
      xPct: 50,
      yPct: 50,
      widthPct: 78,
      heightPct: 22,
      fontSize: 68,
      fontWeight: 800 as const,
      textColor: "#FFFFFF",
      outlineColor: "#000000",
      outlineThickness: 8,
      backgroundColor: "transparent"
    }));

    return {
      schemaVersion: 1,
      jobId: sourceDocument?.jobId || extractPackageJobId(packagePath),
      language: "ko",
      category: sourceDocument?.category || "community",
      targetDurationSec: scenes.reduce((total, scene) => total + scene.durationSec, 0),
      scenes,
      videoMediaLayers,
      videoTextOverlays,
      audioLayers: [],
      subtitleStyle: sourceDocument?.subtitleStyle || {
        mode: "outline",
        fontFamily: "GongGothic B",
        fontSize: 42,
        outline: 6,
        color: "#FFFFFF",
        outlineColor: "#000000"
      },
      voiceProfile: sourceDocument?.voiceProfile || {
        provider: "azure",
        voiceId: "ko-KR-SunHiNeural",
        modelId: "azure-speech"
      },
      aiWorkspace: {
        targetKind,
        outputFormat,
        prompt,
        formatInstructions,
        manusPrompt,
        materials: orderedMaterials,
        materialGroups: orderedGroups,
        plan: sourcePlan
      }
    };
  };

  const sendPlanToCardNews = async () => {
    if (!plan) {
      setMessage(isKorean ? "먼저 AI 설계 초안을 생성해 주세요." : "Generate an AI plan first.");
      return;
    }
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "먼저 저장할 작업 패키지 폴더를 선택해 주세요." : "Choose a package folder first.");
      return;
    }
    setSavingToCardNews(true);
    setMessage("");
    try {
      await inspectSceneScript(resolvedPackagePath).catch(() => undefined);
      await saveWorkflowConfig({ createModuleId: "card-news-generator-mcp" });
      const document = buildCardNewsDocumentFromPlan(plan, resolvedPackagePath);
      await saveSceneScript(document);
      await window.mellowcat.automation.updateAiWorkspace(resolvedPackagePath, document.aiWorkspace ?? buildCurrentWorkspaceState());
      setMessage(isKorean ? "카드뉴스 에디터로 넘겼습니다. 생성 탭에서 이어서 편집하세요." : "Sent to the card news editor.");
      onNavigate?.("generation");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send plan to card news editor.");
    } finally {
      setSavingToCardNews(false);
    }
  };

  const sendPlanToVideo = async () => {
    if (!plan) {
      setMessage(isKorean ? "먼저 AI 설계 초안을 생성해 주세요." : "Generate an AI plan first.");
      return;
    }
    if (!resolvedPackagePath) {
      setMessage(isKorean ? "먼저 저장할 작업 패키지 폴더를 선택해 주세요." : "Choose a package folder first.");
      return;
    }
    setSavingToVideo(true);
    setMessage("");
    try {
      await inspectSceneScript(resolvedPackagePath).catch(() => undefined);
      await saveWorkflowConfig({ createModuleId: "video-production-mcp" });
      const document = buildVideoDocumentFromPlan(plan, resolvedPackagePath);
      await saveSceneScript(document);
      await window.mellowcat.automation.updateAiWorkspace(resolvedPackagePath, document.aiWorkspace ?? buildCurrentWorkspaceState());
      setMessage(isKorean ? "영상 에디터로 넘겼습니다. 생성 탭에서 타임라인을 이어서 편집하세요." : "Sent to the video editor.");
      onNavigate?.("generation");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send plan to video editor.");
    } finally {
      setSavingToVideo(false);
    }
  };

  return (
    <div className="page ai-workspace-page">
      <section className="hero-card">
        <p className="eyebrow">AI Workspace</p>
        <h2>{isKorean ? "AI 작업실" : "AI Material Studio"}</h2>
        <p className="subtle">
          {isKorean
            ? "큰 프롬프트 하나와 참고 링크/이미지를 Manus에 넣기 좋은 형태로 정리합니다."
            : "Build one master prompt plus reference links and images for Manus."}
        </p>
        <div className="ai-package-bar">
          <div>
            <strong>{isKorean ? "작업 패키지" : "Package"}</strong>
            <p>{resolvedPackagePath || (isKorean ? "아직 선택된 패키지가 없습니다." : "No package selected.")}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void choosePackageFolder()}>
            {isKorean ? "패키지 선택" : "Choose Package"}
          </button>
          <button type="button" className="secondary-button" disabled={workspaceSaving} onClick={() => void loadWorkspaceDraft()}>
            {isKorean ? "초안 불러오기" : "Load Draft"}
          </button>
          <button type="button" className="primary-button" disabled={workspaceSaving} onClick={() => void saveWorkspaceDraft()}>
            {workspaceSaving ? (isKorean ? "저장 중" : "Saving") : isKorean ? "현재 작업실 저장" : "Save Workspace"}
          </button>
        </div>
      </section>

      <section className="ai-studio-shell">
        <aside className="ai-studio-panel card">
          <div className="card-row">
            <strong>{isKorean ? "참고자료 추가" : "Add References"}</strong>
            <span className="pill">{orderedMaterials.length}</span>
          </div>
          <label className="field">
            <span>{isKorean ? "참고 링크" : "Reference Link"}</span>
            <input
              className="text-input"
              type="text"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <button type="button" className="secondary-button" onClick={addLinkMaterial}>
            {isKorean ? "링크 추가" : "Add Link"}
          </button>
          <label className="ai-file-drop" tabIndex={0} onPaste={handleMaterialPaste}>
            <input
              type="file"
              multiple
              accept="image/*,video/*,.txt,.md,.pdf"
              onChange={(event) => {
                addFileMaterials(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <span>{isKorean ? "이미지/영상/파일 선택" : "Choose image/video/files"}</span>
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={clipboardSaving}
            onClick={() => void pasteImageFromClipboard()}
          >
            {clipboardSaving ? (isKorean ? "붙여넣는 중..." : "Pasting...") : isKorean ? "클립보드 이미지 붙여넣기" : "Paste Clipboard Image"}
          </button>
          <p className="subtle">
            {isKorean
              ? "텍스트는 오른쪽 큰 프롬프트 하나에만 작성하고, 여기는 Manus가 참고할 링크와 이미지 중심으로 넣습니다."
              : "Write text only in the master prompt. Add links and visual references here."}
          </p>
        </aside>

        <main className="ai-studio-main card">
          <div className="card-row">
            <div>
              <strong>{isKorean ? "참고자료" : "References"}</strong>
              <p className="subtle">
                {isKorean ? "Manus 프롬프트 뒤에 [참고] 링크/이미지/영상/파일로 정리됩니다." : "These will be appended as reference links, images, videos, and files."}
              </p>
            </div>
            <span className="pill">{orderedMaterials.length}</span>
          </div>

          <div className="ai-reference-list">
            {orderedMaterials.length === 0 ? (
              <p className="subtle ai-board-empty">{isKorean ? "아직 참고자료가 없습니다." : "No references yet."}</p>
            ) : (
              orderedMaterials.map((material, materialIndex) => (
                <div key={material.id} className="ai-group-material-row">
                  <span className="ai-material-index">{materialIndex + 1}</span>
                  <span className="pill">{materialKindLabel(material.kind, isKorean)}</span>
                  {material.kind === "image" && material.sourceUrl ? (
                    <img className="ai-material-thumb" src={material.sourceUrl} alt="" />
                  ) : material.kind === "video" && material.sourceUrl ? (
                    <video className="ai-material-thumb" src={material.sourceUrl} muted playsInline />
                  ) : null}
                  <div>
                    <strong>{material.label}</strong>
                    <p>{material.sourceUrl || material.localPath || material.kind}</p>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => removeMaterial(activeGroupId, material.id)}>
                    {isKorean ? "제거" : "Remove"}
                  </button>
                </div>
              ))
            )}
          </div>

          <label className="field">
            <span>{isKorean ? "전체 지시 프롬프트" : "Master Prompt"}</span>
            <textarea
              className="text-input textarea-input ai-main-prompt"
              rows={7}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={isKorean ? "여기에 Manus에게 직접 시킬 내용을 적어주세요." : "Write what you want Manus to do here."}
            />
          </label>

          <div className="ai-output-format-grid">
            {OUTPUT_FORMAT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={["ai-output-format-card", outputFormat === option.id ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => setOutputFormat(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>

          <details className="ai-format-instruction-box">
            <summary>{isKorean ? "형식별 프롬프트 조정" : "Format Prompt"}</summary>
            <textarea
              className="text-input textarea-input"
              rows={8}
              value={formatInstructions[outputFormat] || selectedOutputFormat.defaultInstruction}
              onChange={(event) => updateSelectedFormatInstruction(event.target.value)}
            />
          </details>

          <div className="button-row">
            <select
              className="text-input ai-target-select"
              value={targetKind}
              onChange={(event) => setTargetKind(event.target.value as AiWorkspaceTargetKind)}
            >
              <option value="canva">Canva</option>
              <option value="card_news">{isKorean ? "카드뉴스" : "Card News"}</option>
              <option value="video">{isKorean ? "영상" : "Video"}</option>
            </select>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void generatePlan()}>
              {busy ? (isKorean ? "AI 설계 중" : "Planning") : isKorean ? "AI 설계 초안 생성" : "Generate AI Plan"}
            </button>
            <button type="button" className="secondary-button" onClick={generateManusPrompt}>
              {isKorean ? "Manus 프롬프트 생성" : "Build Manus Prompt"}
            </button>
            <button type="button" className="secondary-button" onClick={() => void copyManusPrompt()}>
              {isKorean ? "복사" : "Copy"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={manusSubmitting}
              onClick={() => void submitToManus()}
            >
              {manusSubmitting ? (isKorean ? "Manus 전송 중..." : "Submitting...") : isKorean ? "Manus API로 전송" : "Submit to Manus"}
            </button>
          </div>
          <label className="field">
            <span>{isKorean ? "Manus에 붙여넣을 최종 프롬프트" : "Manus-ready Prompt"}</span>
            <textarea
              className="text-input textarea-input ai-manus-prompt-output"
              rows={12}
              value={manusPrompt}
              onChange={(event) => setManusPrompt(event.target.value)}
              placeholder={isKorean ? "Manus 프롬프트 생성 버튼을 누르면 여기에 정리됩니다." : "Build a Manus prompt to preview it here."}
            />
          </label>
          {message ? <p className={message.includes("HTTP") || message.includes("failed") ? "warning-text" : "subtle"}>{message}</p> : null}
        </main>

        <aside className="ai-studio-result card">
          <div className="card-row">
            <strong>{isKorean ? "설계 결과" : "Design Plan"}</strong>
            <span className="pill">{plan?.items.length ?? 0}</span>
          </div>
          {!plan ? (
            <p className="subtle">
              {isKorean ? "AI 초안이 생성되면 결과가 여기에 표시됩니다." : "Generated drafts will appear here."}
            </p>
          ) : (
            <>
              <label className="field">
                <span>{isKorean ? "전체 요약" : "Summary"}</span>
                <textarea
                  className="text-input textarea-input ai-plan-summary-input"
                  rows={3}
                  value={plan.summary}
                  onChange={(event) => updatePlanSummary(event.target.value)}
                />
              </label>
              <p className="subtle">
                {plan.provider} · {plan.model ?? "local"}
              </p>
              <div className="ai-plan-items">
                {plan.items.map((item, itemIndex) => (
                  <article key={`ai-plan-${item.index}`} className="ai-plan-item">
                    <span className="ai-material-index">{item.index}</span>
                    <div className="ai-plan-edit-grid">
                      <input
                        className="text-input"
                        value={item.title}
                        onChange={(event) => updatePlanItem(itemIndex, { title: event.target.value })}
                        placeholder={isKorean ? "제목" : "Title"}
                      />
                      <textarea
                        className="text-input textarea-input"
                        rows={3}
                        value={item.text}
                        onChange={(event) => updatePlanItem(itemIndex, { text: event.target.value })}
                        placeholder={isKorean ? "화면 문구 또는 내레이션" : "Text or narration"}
                      />
                      <textarea
                        className="text-input textarea-input"
                        rows={2}
                        value={item.visualPrompt ?? ""}
                        onChange={(event) => updatePlanItem(itemIndex, { visualPrompt: event.target.value })}
                        placeholder={isKorean ? "비주얼 지시" : "Visual prompt"}
                      />
                      <div className="ai-plan-meta-grid">
                        <label>
                          <span>{isKorean ? "길이" : "Duration"}</span>
                          <input
                            className="text-input"
                            type="number"
                            min={1}
                            max={120}
                            step={0.5}
                            value={item.durationSec ?? (plan.targetKind === "video" ? 6 : 1)}
                            onChange={(event) => updatePlanItem(itemIndex, { durationSec: Number(event.target.value) || 1 })}
                          />
                        </label>
                        <label>
                          <span>{isKorean ? "역할" : "Role"}</span>
                          <select
                            className="text-input"
                            value={item.sceneRole ?? "custom"}
                            onChange={(event) =>
                              updatePlanItem(itemIndex, {
                                sceneRole: event.target.value as NonNullable<AiWorkspacePlan["items"][number]["sceneRole"]>
                              })
                            }
                          >
                            <option value="hook">{isKorean ? "훅" : "Hook"}</option>
                            <option value="context">{isKorean ? "맥락" : "Context"}</option>
                            <option value="evidence">{isKorean ? "근거" : "Evidence"}</option>
                            <option value="turning_point">{isKorean ? "전환점" : "Turn"}</option>
                            <option value="climax">{isKorean ? "클라이맥스" : "Climax"}</option>
                            <option value="cta">{isKorean ? "마무리" : "CTA"}</option>
                            <option value="custom">{isKorean ? "직접 지정" : "Custom"}</option>
                          </select>
                        </label>
                      </div>
                      <textarea
                        className="text-input textarea-input"
                        rows={2}
                        value={item.layoutIntent ?? ""}
                        onChange={(event) => updatePlanItem(itemIndex, { layoutIntent: event.target.value })}
                        placeholder={isKorean ? "소재 배치 방식. 예: 배경은 전체 화면, 로고는 우상단, 링크 이미지는 컷인" : "Layout intent"}
                      />
                      <textarea
                        className="text-input textarea-input"
                        rows={2}
                        value={item.editNote ?? ""}
                        onChange={(event) => updatePlanItem(itemIndex, { editNote: event.target.value })}
                        placeholder={isKorean ? "검수 메모" : "Review note"}
                      />
                      {item.sourceMaterialIds?.length > 0 ? (
                        <div className="ai-plan-source-list">
                          <span>{isKorean ? "사용 소재" : "Source materials"}</span>
                          <div>
                            {item.sourceMaterialIds.map((materialId) => (
                              <code key={`${item.index}-${materialId}`}>{materialId}</code>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              <details className="ai-canva-prompt-box" open>
                <summary>{isKorean ? "Canva 프롬프트" : "Canva Prompt"}</summary>
                <textarea
                  className="text-input textarea-input"
                  rows={7}
                  value={plan.canvaPrompt}
                  onChange={(event) => updatePlanCanvaPrompt(event.target.value)}
                />
              </details>
              <button
                type="button"
                className="primary-button"
                disabled={savingToCardNews}
                onClick={() => void sendPlanToCardNews()}
              >
                {savingToCardNews
                  ? isKorean
                    ? "카드뉴스로 저장 중"
                    : "Sending"
                  : isKorean
                    ? "카드뉴스 에디터로 보내기"
                    : "Send To Card News Editor"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={savingToVideo}
                onClick={() => void sendPlanToVideo()}
              >
                {savingToVideo
                  ? isKorean
                    ? "영상으로 저장 중"
                    : "Sending"
                  : isKorean
                    ? "영상 에디터로 보내기"
                    : "Send To Video Editor"}
              </button>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
