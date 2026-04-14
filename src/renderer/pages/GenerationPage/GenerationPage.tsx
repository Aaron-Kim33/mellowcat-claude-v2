import { useEffect, useMemo, useState } from "react";
import type {
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
  const isKorean = settings?.launcherLanguage === "ko";
  const createModuleId = workflowConfig?.createModuleId ?? "youtube-material-generator-mcp";
  const sceneStylePresets = useMemo(
    () => getMcpRuntimeContract(createModuleId)?.sceneStylePresets ?? [],
    [createModuleId]
  );

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
        fluxPrompt: stripNarrationPrefixFromFluxPrompt(scene.text, scene.fluxPrompt)
      }))
    });
    setSelectedSceneNo(sceneScript.scenes[0]?.sceneNo ?? 1);
  }, [sceneScript]);

  const selectedScene = useMemo(
    () => editableDocument?.scenes.find((scene) => scene.sceneNo === selectedSceneNo),
    [editableDocument, selectedSceneNo]
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

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <p className="subtle">{copy.subtitle}</p>
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
                {copy.sceneLabel} {selectedScene?.sceneNo ?? "-"}
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
                  {copy.sceneLabel} {scene.sceneNo}
                </button>
              ))}
            </div>

            {!selectedScene ? (
              <p className="subtle">{copy.selectScene}</p>
            ) : (
              <div className="form-grid">
                <div className="field field-span-2">
                  <span>{copy.text}</span>
                  <textarea
                    className="text-input textarea-input"
                    value={selectedScene.text}
                    onChange={(event) =>
                      updateScene(selectedScene.sceneNo, { text: event.target.value })
                    }
                  />
                </div>
                <div className="field field-span-2">
                  <span>{copy.fluxPrompt}</span>
                  <textarea
                    className="text-input textarea-input"
                    value={selectedScene.fluxPrompt}
                    onChange={(event) =>
                      updateScene(selectedScene.sceneNo, { fluxPrompt: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <span>{copy.assetSearchQuery}</span>
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
        <div className="generation-shell">
          <div className="generation-editor card">
            <div className="generation-editor-header">
              <div>
                <p className="eyebrow">{isKorean ? "Edit Suite" : "Edit Suite"}</p>
                <h4>{copy.title}</h4>
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

            {editorTab === "scene" && (
              <>
                <div className="card-row">
                  <strong>{copy.sceneList}</strong>
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
                      {copy.sceneLabel} {scene.sceneNo}
                    </button>
                  ))}
                </div>

                {!selectedScene ? (
                  <p className="subtle">{copy.selectScene}</p>
                ) : (
                  <div className="form-grid">
                    <div className="field field-span-2">
                      <span>{copy.text}</span>
                      <textarea
                        className="text-input textarea-input"
                        value={selectedScene.text}
                        onChange={(event) =>
                          updateScene(selectedScene.sceneNo, { text: event.target.value })
                        }
                      />
                    </div>

                    <div className="field field-span-2">
                      <span>{copy.fluxPrompt}</span>
                      <textarea
                        className="text-input textarea-input"
                        value={selectedScene.fluxPrompt}
                        onChange={(event) =>
                          updateScene(selectedScene.sceneNo, { fluxPrompt: event.target.value })
                        }
                      />
                    </div>

                    <div className="field">
                      <span>{copy.assetSearchQuery}</span>
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

            {editorTab === "voice" && (
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
                {copy.sceneLabel} {selectedScene?.sceneNo ?? "-"}
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

                <div className="generation-preview-media">
                  {activePreviewAsset ? (
                    activePreviewAsset.kind === "image" ? (
                      <img
                        src={activePreviewAsset.src}
                        alt={`Scene ${selectedScene.sceneNo} preview`}
                        onError={() =>
                          setPreviewAssetIndex((current) =>
                            Math.min(current + 1, sceneAssetCandidates.length)
                          )
                        }
                      />
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
                  <div>
                    <strong>{copy.assetSearchQuery}</strong>
                    <span>{selectedScene.assetSearchQuery || "-"}</span>
                  </div>
                  <div>
                    <strong>{copy.motion}</strong>
                    <span>{selectedScene.motion}</span>
                  </div>
                  <div>
                    <strong>{copy.durationSec}</strong>
                    <span>{selectedScene.durationSec}s</span>
                  </div>
                </div>

                <div className="generation-preview-text">
                  <p className="eyebrow">{copy.text}</p>
                  <p>{selectedScene.text}</p>
                </div>

                <div className="generation-preview-prompt">
                  <p className="eyebrow">{copy.fluxPrompt}</p>
                  <p>{selectedScene.fluxPrompt}</p>
                </div>

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
                        {copy.sceneLabel} {scene.sceneNo}
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
                            {copy.sceneLabel} {scene.sceneNo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        )
      )}
    </section>
  );
}
