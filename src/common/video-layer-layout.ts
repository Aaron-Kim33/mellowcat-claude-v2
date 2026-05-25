import type { SceneScriptPercentCrop, SceneScriptVideoMediaLayer } from "./types/media-generation";

export interface VideoMediaLayerBox {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface VideoMediaLayerExportLayout {
  layerWidth: number;
  layerHeight: number;
  centerX: number;
  centerY: number;
  x: number;
  y: number;
  frameCrop: Required<SceneScriptPercentCrop>;
  frameCropPx: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  visibleX: number;
  visibleY: number;
  visibleLayerWidth: number;
  visibleLayerHeight: number;
}

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const clampCropSide = (value: unknown, max = 95) =>
  clampNumber(Number(value ?? 0) || 0, 0, max);

export const EMPTY_PERCENT_CROP: Required<SceneScriptPercentCrop> = {
  topPct: 0,
  rightPct: 0,
  bottomPct: 0,
  leftPct: 0
};

export function normalizePercentCrop(
  crop?: SceneScriptPercentCrop,
  options?: { maxSidePct?: number; maxCombinedPct?: number }
): Required<SceneScriptPercentCrop> {
  const maxSidePct = options?.maxSidePct ?? 95;
  const maxCombinedPct = options?.maxCombinedPct ?? 95;
  let topPct = clampCropSide(crop?.topPct, maxSidePct);
  let rightPct = clampCropSide(crop?.rightPct, maxSidePct);
  let bottomPct = clampCropSide(crop?.bottomPct, maxSidePct);
  let leftPct = clampCropSide(crop?.leftPct, maxSidePct);

  const verticalTotal = topPct + bottomPct;
  if (verticalTotal > maxCombinedPct) {
    const ratio = maxCombinedPct / verticalTotal;
    topPct *= ratio;
    bottomPct *= ratio;
  }

  const horizontalTotal = leftPct + rightPct;
  if (horizontalTotal > maxCombinedPct) {
    const ratio = maxCombinedPct / horizontalTotal;
    leftPct *= ratio;
    rightPct *= ratio;
  }

  return {
    topPct,
    rightPct,
    bottomPct,
    leftPct
  };
}

export function hasPercentCrop(crop?: SceneScriptPercentCrop) {
  const normalized = normalizePercentCrop(crop);
  return (
    normalized.topPct > 0 ||
    normalized.rightPct > 0 ||
    normalized.bottomPct > 0 ||
    normalized.leftPct > 0
  );
}

export function resolveLayerFrameCrop(layer: SceneScriptVideoMediaLayer) {
  return normalizePercentCrop(layer.frameCrop ?? layer.crop, { maxSidePct: 90, maxCombinedPct: 95 });
}

export function resolveLayerSourceCrop(layer: SceneScriptVideoMediaLayer) {
  return normalizePercentCrop(layer.sourceCrop, { maxSidePct: 95, maxCombinedPct: 95 });
}

export function resolveLayerBox(layer: SceneScriptVideoMediaLayer): VideoMediaLayerBox {
  return {
    xPct: Number(layer.xPct ?? 50),
    yPct: Number(layer.yPct ?? 50),
    widthPct: Number(layer.widthPct ?? 100),
    heightPct: Number(layer.heightPct ?? 100)
  };
}

export function buildLayerFrameClipInsets(layer: SceneScriptVideoMediaLayer) {
  const box = resolveLayerBox(layer);
  const frameCrop = resolveLayerFrameCrop(layer);
  const leftEdgePct = box.xPct - box.widthPct / 2;
  const rightEdgePct = box.xPct + box.widthPct / 2;
  const topEdgePct = box.yPct - box.heightPct / 2;
  const bottomEdgePct = box.yPct + box.heightPct / 2;

  return {
    topPct: Math.max(frameCrop.topPct, box.heightPct > 0 ? Math.max(0, (-topEdgePct / box.heightPct) * 100) : 0),
    rightPct: Math.max(frameCrop.rightPct, box.widthPct > 0 ? Math.max(0, ((rightEdgePct - 100) / box.widthPct) * 100) : 0),
    bottomPct: Math.max(frameCrop.bottomPct, box.heightPct > 0 ? Math.max(0, ((bottomEdgePct - 100) / box.heightPct) * 100) : 0),
    leftPct: Math.max(frameCrop.leftPct, box.widthPct > 0 ? Math.max(0, (-leftEdgePct / box.widthPct) * 100) : 0)
  };
}

export function buildLayerSourceCropTransform(layer: SceneScriptVideoMediaLayer) {
  const sourceCrop = resolveLayerSourceCrop(layer);
  const visibleWidthPct = Math.max(1, 100 - sourceCrop.leftPct - sourceCrop.rightPct);
  const visibleHeightPct = Math.max(1, 100 - sourceCrop.topPct - sourceCrop.bottomPct);

  return {
    sourceCrop,
    widthPct: 10000 / visibleWidthPct,
    heightPct: 10000 / visibleHeightPct,
    translateXPct: -(sourceCrop.leftPct / visibleWidthPct) * 100,
    translateYPct: -(sourceCrop.topPct / visibleHeightPct) * 100
  };
}

export function buildVideoMediaLayerExportLayout(
  layer: SceneScriptVideoMediaLayer,
  canvasWidth: number,
  canvasHeight: number
): VideoMediaLayerExportLayout {
  const box = resolveLayerBox(layer);
  const layerWidth = Math.max(1, Math.round((canvasWidth * clampNumber(Number(box.widthPct), 0.1, 500)) / 100));
  const layerHeight = Math.max(1, Math.round((canvasHeight * clampNumber(Number(box.heightPct), 0.1, 500)) / 100));
  const centerX = Math.round((canvasWidth * (Number(box.xPct) || 50)) / 100);
  const centerY = Math.round((canvasHeight * (Number(box.yPct) || 50)) / 100);
  const x = Math.round(centerX - layerWidth / 2);
  const y = Math.round(centerY - layerHeight / 2);
  const frameCrop = resolveLayerFrameCrop(layer);
  const frameCropPx = {
    left: Math.max(0, Math.round((layerWidth * frameCrop.leftPct) / 100)),
    right: Math.max(0, Math.round((layerWidth * frameCrop.rightPct) / 100)),
    top: Math.max(0, Math.round((layerHeight * frameCrop.topPct) / 100)),
    bottom: Math.max(0, Math.round((layerHeight * frameCrop.bottomPct) / 100))
  };

  return {
    layerWidth,
    layerHeight,
    centerX,
    centerY,
    x,
    y,
    frameCrop,
    frameCropPx,
    visibleX: x + frameCropPx.left,
    visibleY: y + frameCropPx.top,
    visibleLayerWidth: Math.max(1, layerWidth - frameCropPx.left - frameCropPx.right),
    visibleLayerHeight: Math.max(1, layerHeight - frameCropPx.top - frameCropPx.bottom)
  };
}
