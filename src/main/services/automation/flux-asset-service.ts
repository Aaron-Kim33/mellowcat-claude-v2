import type {
  GeneratedMediaPackageManifest,
  SceneAssetCandidate,
  SceneScriptDocument
} from "../../../common/types/media-generation";

export interface FluxAssetRequestOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  model?: string;
}

export class FluxAssetService {
  async enrichManifestWithFlux(
    manifest: GeneratedMediaPackageManifest,
    sceneScript: SceneScriptDocument,
    sceneIndexes?: number[],
    options?: FluxAssetRequestOptions
  ): Promise<GeneratedMediaPackageManifest> {
    const sceneIndexSet =
      sceneIndexes && sceneIndexes.length > 0 ? new Set(sceneIndexes) : undefined;
    const sceneByNo = new Map(sceneScript.scenes.map((scene) => [scene.sceneNo, scene] as const));

    const scenes = await Promise.all(manifest.scenes.map(async (sceneSelection) => {
      if (sceneIndexSet && !sceneIndexSet.has(sceneSelection.sceneIndex)) {
        return sceneSelection;
      }

      const scene = sceneByNo.get(sceneSelection.sceneIndex);
      const prompt = this.pickPrompt(scene);
      if (!prompt) {
        return {
          ...sceneSelection,
          fallbackUsed: true
        };
      }

      const selectedAsset = await this.buildFluxAsset(
        prompt,
        sceneSelection.sceneIndex,
        options
      );
      return {
        ...sceneSelection,
        selectedAsset,
        fallbackUsed: false
      };
    }));

    return {
      ...manifest,
      scenes
    };
  }

  private async buildFluxAsset(
    prompt: string,
    sceneIndex: number,
    options?: FluxAssetRequestOptions
  ): Promise<SceneAssetCandidate> {
    const apiKey = options?.apiKey?.trim();
    if (apiKey) {
      const generated = await this.generateViaOpenAiCompatibleApi(prompt, apiKey, options);
      if (generated) {
        return generated;
      }
      throw new Error("Flux API request failed. Check API key, model, and base URL.");
    }

    const seed = Date.now() + sceneIndex;
    const sourceUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=1080&height=1920&seed=${seed}&nologo=true`;

    return {
      provider: "flux",
      assetType: "image",
      sourceUrl,
      width: 1080,
      height: 1920,
      attributionLabel: "Flux"
    };
  }

  private async generateViaOpenAiCompatibleApi(
    prompt: string,
    apiKey: string,
    options?: FluxAssetRequestOptions
  ): Promise<SceneAssetCandidate | undefined> {
    try {
      const baseUrl = this.normalizeImageApiBaseUrl(options?.apiBaseUrl);
      const model = this.resolveFluxModel(options?.model);
      const sourceUrl = /openrouter\.ai/i.test(baseUrl)
        ? await this.generateViaOpenRouter(baseUrl, model, prompt, apiKey)
        : await this.generateViaImagesEndpoint(baseUrl, model, prompt, apiKey);
      if (!sourceUrl) {
        return undefined;
      }

      return {
        provider: "flux",
        assetType: "image",
        sourceUrl,
        width: 1080,
        height: 1920,
        attributionLabel: "Flux API"
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Flux API request failed.");
    }
  }

  private async generateViaOpenRouter(
    baseUrl: string,
    model: string,
    prompt: string,
    apiKey: string
  ): Promise<string | undefined> {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mellowcat.xyz",
        "X-Title": "MellowCat Launcher"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image"],
        image_config: {
          aspect_ratio: "9:16"
        },
        stream: false
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Flux API HTTP ${response.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ""}`
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          images?: Array<{
            image_url?: { url?: string };
            imageUrl?: { url?: string };
          }>;
        };
      }>;
    };
    const image = payload.choices?.[0]?.message?.images?.[0];
    return image?.image_url?.url?.trim() || image?.imageUrl?.url?.trim();
  }

  private async generateViaImagesEndpoint(
    baseUrl: string,
    model: string,
    prompt: string,
    apiKey: string
  ): Promise<string | undefined> {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mellowcat.xyz",
        "X-Title": "MellowCat Launcher"
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1792",
        n: 1
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Flux API HTTP ${response.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ""}`
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const item = payload.data?.[0];
    return item?.url?.trim() || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined);
  }

  private normalizeImageApiBaseUrl(rawBaseUrl?: string): string {
    const fallback = "https://openrouter.ai/api/v1";
    const input = rawBaseUrl?.trim();
    if (!input) {
      return fallback;
    }

    const sanitized = input.replace(/\/+$/, "");

    if (/openrouter\.ai/i.test(sanitized) && !/\/api\/v1$/i.test(sanitized)) {
      if (/\/api$/i.test(sanitized)) {
        return `${sanitized}/v1`;
      }
      return `${sanitized}/api/v1`;
    }

    return sanitized;
  }

  private resolveFluxModel(rawModel?: string): string {
    const fallback = "black-forest-labs/flux.2-pro";
    const model = rawModel?.trim();
    if (!model) {
      return fallback;
    }

    const normalized = model.toLowerCase();
    if (
      normalized === "black-forest-labs/flux.1-schnell" ||
      normalized === "black-forest-labs/flux.1-schnell:free" ||
      normalized === "black-forest-labs/flux.1.1-pro" ||
      normalized === "black-forest-labs/flux-1.1-pro"
    ) {
      return fallback;
    }

    return model;
  }

  private pickPrompt(
    scene:
      | SceneScriptDocument["scenes"][number]
      | undefined
  ): string | undefined {
    if (!scene) {
      return undefined;
    }

    const raw =
      scene.assetSearchQuery?.trim() ||
      scene.fluxPrompt?.trim() ||
      scene.text?.trim() ||
      "";
    if (!raw) {
      return undefined;
    }

    // Pollinations endpoint becomes unstable with very long/non-normalized prompts.
    // Keep a short, clean query for higher success rate.
    return raw
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 220)
      .trim();
  }
}
