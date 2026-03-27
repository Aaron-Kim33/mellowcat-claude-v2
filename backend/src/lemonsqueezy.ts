import { createHmac, timingSafeEqual } from "crypto";

export interface LemonSqueezyCheckoutResult {
  providerCheckoutId: string;
  checkoutUrl: string;
  providerSessionId?: string;
}

export interface LemonSqueezyConfig {
  apiKey?: string;
  storeId?: string;
  webhookSecret?: string;
  variantMap: Record<string, number>;
}

interface LemonSqueezyCheckoutResponse {
  data?: {
    id: string;
    attributes?: {
      url?: string;
    };
  };
}

export function isLemonSqueezyConfigured(config: LemonSqueezyConfig): boolean {
  return Boolean(config.apiKey && config.storeId);
}

export async function createLemonSqueezyCheckout(
  config: LemonSqueezyConfig,
  params: {
    productId: string;
    productName: string;
    productSummary: string;
    userId: string;
    email?: string;
    displayName?: string;
    handoffToken: string;
    source: string;
    testMode?: boolean;
    redirectUrl?: string;
  }
): Promise<LemonSqueezyCheckoutResult> {
  if (!config.apiKey || !config.storeId) {
    throw new Error("Lemon Squeezy API key or store id is missing.");
  }

  const variantId = config.variantMap[params.productId];
  if (!variantId) {
    throw new Error(`No Lemon Squeezy variant is mapped for ${params.productId}.`);
  }

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            name: params.productName,
            description: params.productSummary,
            ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
            enabled_variants: [variantId]
          },
          checkout_data: {
            ...(params.email ? { email: params.email } : {}),
            ...(params.displayName ? { name: params.displayName } : {}),
            custom: {
              user_id: params.userId,
              product_id: params.productId,
              handoff_token: params.handoffToken,
              source: params.source
            }
          },
          test_mode: Boolean(params.testMode)
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: config.storeId
            }
          },
          variant: {
            data: {
              type: "variants",
              id: String(variantId)
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Lemon Squeezy checkout failed: HTTP ${response.status} ${body}`);
  }

  const json = (await response.json()) as LemonSqueezyCheckoutResponse;
  const providerCheckoutId = json.data?.id;
  const checkoutUrl = json.data?.attributes?.url;

  if (!providerCheckoutId || !checkoutUrl) {
    throw new Error("Lemon Squeezy checkout response did not include a checkout URL.");
  }

  return {
    providerCheckoutId,
    providerSessionId: providerCheckoutId,
    checkoutUrl
  };
}

export function verifyLemonSqueezySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string | undefined
): boolean {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const digest = Buffer.from(
    createHmac("sha256", webhookSecret).update(rawBody).digest("hex"),
    "utf8"
  );
  const signature = Buffer.from(signatureHeader, "utf8");

  if (digest.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(digest, signature);
}
