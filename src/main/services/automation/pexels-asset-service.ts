import type {
  GeneratedMediaPackageManifest,
  SceneAssetCandidate,
  ScenePlanDocument
} from "../../../common/types/media-generation";

interface PexelsVideoFile {
  link?: string;
  width?: number;
  height?: number;
}

interface PexelsVideo {
  url?: string;
  duration?: number;
  width?: number;
  height?: number;
  video_files?: PexelsVideoFile[];
  user?: {
    name?: string;
  };
}

export class PexelsAssetService {
  async enrichManifestWithPexels(
    manifest: GeneratedMediaPackageManifest,
    scenePlan: ScenePlanDocument,
    apiKey?: string
  ): Promise<GeneratedMediaPackageManifest> {
    if (!apiKey?.trim()) {
      return manifest;
    }

    const scenes = await Promise.all(
      manifest.scenes.map(async (sceneSelection) => {
        const scene = scenePlan.scenes.find((item) => item.index === sceneSelection.sceneIndex);
        if (!scene) {
          return sceneSelection;
        }

        const selectedAsset = await this.searchBestAsset(scene.keywords, apiKey.trim());
        return {
          ...sceneSelection,
          selectedAsset,
          fallbackUsed: !selectedAsset
        };
      })
    );

    return {
      ...manifest,
      scenes
    };
  }

  private async searchBestAsset(
    keywords: string[],
    apiKey: string
  ): Promise<SceneAssetCandidate | undefined> {
    const query = keywords.filter(Boolean).slice(0, 3).join(" ");
    if (!query) {
      return undefined;
    }

    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=portrait`,
      {
        headers: {
          Authorization: apiKey
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Pexels HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      videos?: PexelsVideo[];
    };

    const selectedVideo = (payload.videos ?? []).find((video) =>
      Array.isArray(video.video_files) && video.video_files.length > 0
    );

    if (!selectedVideo) {
      return undefined;
    }

    const preferredFile =
      selectedVideo.video_files
        ?.filter((file) => Boolean(file.link))
        .sort((left, right) => {
          const leftScore = Math.abs((left.height ?? 0) - 1920) + Math.abs((left.width ?? 0) - 1080);
          const rightScore =
            Math.abs((right.height ?? 0) - 1920) + Math.abs((right.width ?? 0) - 1080);
          return leftScore - rightScore;
        })[0] ?? selectedVideo.video_files?.[0];

    if (!preferredFile?.link) {
      return undefined;
    }

    return {
      provider: "pexels",
      assetType: "video",
      sourceUrl: preferredFile.link,
      durationSec: selectedVideo.duration,
      width: preferredFile.width ?? selectedVideo.width,
      height: preferredFile.height ?? selectedVideo.height,
      attributionLabel: selectedVideo.user?.name ? `Pexels · ${selectedVideo.user.name}` : "Pexels"
    };
  }
}
