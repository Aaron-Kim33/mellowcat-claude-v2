import { createHash, randomBytes } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "fs";
import path from "path";
import { URL } from "url";
import { getLemonSqueezyConfig } from "./config";
import {
  createLemonSqueezyCheckout,
  isLemonSqueezyConfigured,
  verifyLemonSqueezySignature
} from "./lemonsqueezy";
import { createRepositories } from "./repositories";
import type { EntitlementStatus, PaymentRecord, UserRecord } from "./repositories/types";

interface CatalogItem {
  id: string;
  slug: string;
  name: string;
  summary: string;
  visibility?: string;
  distribution: {
    type: "free" | "paid" | "private" | "bundled";
    priceText?: string;
    currency?: string;
    amount?: number;
  };
  commerce?: {
    checkoutUrl?: string;
    productUrl?: string;
    ctaLabel?: string;
  };
  latestVersion: string;
  package?: {
    source: "bundled" | "remote";
    remote?: {
      manifestUrl?: string;
      downloadUrl?: string;
      checksumSha256?: string;
      requiresAuth?: boolean;
    };
  };
  workflow?: {
    ids: string[];
  };
  tags?: string[];
  entitlement?: {
    status: EntitlementStatus;
    source: "local" | "remote" | "bundled";
    checkedAt?: string;
  };
}

const PORT = Number(process.env.PORT ?? process.env.MELLOWCAT_API_PORT ?? "8787");
const HOST = process.env.MELLOWCAT_API_HOST ?? "127.0.0.1";
const PAYMENT_BASE_URL = process.env.MELLOWCAT_PAYMENT_BASE_URL ?? "https://mellowcat.xyz/payment";
const PAYMENT_SUCCESS_URL =
  process.env.MELLOWCAT_PAYMENT_SUCCESS_URL ?? `${PAYMENT_BASE_URL}?status=success`;
const APP_BASE_URL = process.env.MELLOWCAT_APP_BASE_URL ?? `http://${HOST}:${PORT}`;
const ROOT_DIR = path.resolve(__dirname, "../..");
const CATALOG_PATH = path.resolve(ROOT_DIR, "resources", "bundled", "catalog.json");
const LEMON_SQUEEZY = getLemonSqueezyConfig();
const repositories = createRepositories();

const DEV_LAUNCHER_USERS = [
  {
    id: "user_01",
    email: "creator@mellowcat.dev",
    displayName: "MellowCat Creator",
    token: "dev-launcher-token"
  },
  {
    id: "user_02",
    email: "creator2@mellowcat.dev",
    displayName: "MellowCat Creator 2",
    token: "dev-launcher-token-2"
  },
  {
    id: "user_03",
    email: "creator3@mellowcat.dev",
    displayName: "MellowCat Creator 3",
    token: "dev-launcher-token-3"
  }
] as const;

function loadCatalog(): CatalogItem[] {
  const raw = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as CatalogItem[];
  return raw.map((item) => {
    if (item.id === "youtube-publish-mcp") {
      return {
        ...item,
        summary: "Paid delivery module that connects checkout, entitlement, and YouTube publishing access.",
        distribution: {
          type: "paid",
          priceText: "$19",
          currency: "USD",
          amount: 19
        },
        commerce: {
          checkoutUrl: PAYMENT_BASE_URL,
          productUrl: PAYMENT_BASE_URL,
          ctaLabel: "Buy"
        },
        availability: {
          state: "installable"
        },
        package: {
          source: "remote",
          remote: {
            manifestUrl: `${APP_BASE_URL}/artifacts/${item.id}/${item.latestVersion}/manifest.json`,
            downloadUrl: `${APP_BASE_URL}/artifacts/${item.id}/${item.latestVersion}/package.zip`,
            checksumSha256: item.package?.remote?.checksumSha256,
            requiresAuth: true
          }
        }
      };
    }

    if (item.id === "filesystem-tools") {
      return {
        ...item,
        summary: "Remote-installable starter MCP used to validate owned/install flows.",
        distribution: {
          type: "paid",
          priceText: "$5",
          currency: "USD",
          amount: 5
        },
        commerce: {
          checkoutUrl: PAYMENT_BASE_URL,
          productUrl: PAYMENT_BASE_URL,
          ctaLabel: "Buy"
        },
        availability: {
          state: "installable"
        },
        package: {
          source: "remote",
          remote: {
            manifestUrl: `${APP_BASE_URL}/artifacts/${item.id}/${item.latestVersion}/manifest.json`,
            downloadUrl: `${APP_BASE_URL}/artifacts/${item.id}/${item.latestVersion}/package.zip`,
            checksumSha256: item.package?.remote?.checksumSha256,
            requiresAuth: true
          }
        }
      };
    }

    if (item.package?.source !== "remote") {
      return item;
    }

    return {
      ...item,
      package: {
        ...item.package,
        remote: {
          ...item.package.remote,
          manifestUrl:
            item.package.remote?.manifestUrl ??
            `${APP_BASE_URL}/artifacts/${item.id}/${item.latestVersion}/manifest.json`,
          downloadUrl:
            item.package.remote?.downloadUrl ??
            `${APP_BASE_URL}/artifacts/${item.id}/${item.latestVersion}/package.zip`
        }
      }
    };
  });
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readRawBody(req);
  if (raw.length === 0) {
    return {} as T;
  }

  return JSON.parse(raw.toString("utf8")) as T;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function ensureDevLauncherUsers(): Promise<void> {
  for (const devUser of DEV_LAUNCHER_USERS) {
    let user = await repositories.auth.findUserByEmail(devUser.email);
    if (!user) {
      user = await repositories.auth.createUser({
        email: devUser.email,
        displayName: devUser.displayName
      });
    }

    const existingSession = await repositories.auth.findUserByLauncherToken(devUser.token);
    if (!existingSession) {
      await repositories.auth.createLauncherSession({
        userId: user.id,
        tokenHash: sha256(devUser.token),
        source: "launcher",
        expiresAt: `dev-token:${devUser.token}`
      });
    }
  }
}

function getBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }

  return header.slice("Bearer ".length).trim();
}

async function findUserByToken(token?: string): Promise<UserRecord | undefined> {
  if (!token) {
    return undefined;
  }

  return repositories.auth.findUserByLauncherToken(token);
}

async function getUserEntitlements(userId: string) {
  return repositories.entitlements.listEntitlementsForUser(userId);
}

async function getEntitlementStatus(userId: string, mcpId: string): Promise<EntitlementStatus> {
  const record = await repositories.entitlements.findEntitlement(userId, mcpId);
  if (!record) {
    return "not_owned";
  }

  return record.status === "trial" ? "trial" : "owned";
}

async function catalogForUser(userId?: string): Promise<CatalogItem[]> {
  const catalog = loadCatalog();
  return Promise.all(catalog.map(async (item) => {
    const status =
      item.distribution.type === "free" || item.distribution.type === "bundled"
        ? "free"
        : userId
          ? await getEntitlementStatus(userId, item.id)
          : "not_owned";

    return {
      ...item,
      entitlement: {
        status,
        source: userId ? "remote" : "bundled",
        checkedAt: new Date().toISOString()
      }
    };
  }));
}

function createError(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}

function createPaymentUrl(handoffToken: string): string {
  const url = new URL(PAYMENT_BASE_URL);
  url.searchParams.set("handoff", handoffToken);
  return url.toString();
}

async function upsertEntitlement(userId: string, mcpId: string) {
  return repositories.entitlements.upsertOwnedEntitlement(userId, mcpId);
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    json(res, 400, createError("BAD_REQUEST", "Missing URL."));
    return;
  }

  if (req.method === "OPTIONS") {
    json(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, APP_BASE_URL);
  const pathname = url.pathname;
  const user = await findUserByToken(getBearerToken(req));

  try {
    if (req.method === "GET" && pathname === "/health") {
      json(res, 200, { ok: true, service: "mellowcat-backend", now: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && pathname === "/catalog") {
      json(res, 200, { items: await catalogForUser(user?.id) });
      return;
    }

    if (req.method === "GET" && pathname === "/auth/session") {
      if (!user) {
        json(res, 401, createError("UNAUTHENTICATED", "Sign in again to continue."));
        return;
      }

      json(res, 200, {
        loggedIn: true,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        source: "remote",
        lastSyncedAt: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/auth/entitlements") {
      if (!user) {
        json(res, 401, createError("UNAUTHENTICATED", "Sign in again to continue."));
        return;
      }

      const items = (await getUserEntitlements(user.id)).map((entry) => ({
        mcpId: entry.productId,
        status: entry.status === "trial" ? "trial" : "owned",
        checkedAt: new Date().toISOString()
      }));
      json(res, 200, { items });
      return;
    }

    const downloadTicketMatch = pathname.match(/^\/mcp\/([^/]+)\/download-ticket$/);
    if (req.method === "GET" && downloadTicketMatch) {
      if (!user) {
        json(res, 401, createError("UNAUTHENTICATED", "Sign in again to continue."));
        return;
      }

      const mcpId = decodeURIComponent(downloadTicketMatch[1]);
      const version = url.searchParams.get("version");
      if (!version) {
        json(res, 400, createError("BAD_REQUEST", "version is required."));
        return;
      }

      const item = (await catalogForUser(user.id)).find((entry) => entry.id === mcpId);
      if (!item) {
        json(res, 404, createError("PRODUCT_NOT_FOUND", "This MCP does not exist."));
        return;
      }

      if (item.distribution.type === "paid" && item.entitlement?.status !== "owned") {
        json(res, 403, createError("NOT_ENTITLED", "You do not own this MCP yet."));
        return;
      }

      json(res, 200, {
        mcpId,
        version,
        manifestUrl:
          item.package?.remote?.manifestUrl ??
          `${APP_BASE_URL}/artifacts/${mcpId}/${version}/manifest.json`,
        downloadUrl:
          item.package?.remote?.downloadUrl ??
          `${APP_BASE_URL}/artifacts/${mcpId}/${version}/package.zip`,
        checksumSha256: item.package?.remote?.checksumSha256
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/payment/handoff") {
      if (!user) {
        json(res, 401, createError("UNAUTHENTICATED", "You need to sign in again before starting checkout."));
        return;
      }

      const body = await readJson<{ productId?: string; source?: string }>(req);
      const productId = body.productId?.trim();
      if (!productId) {
        json(res, 400, createError("BAD_REQUEST", "productId is required."));
        return;
      }

      const product = (await catalogForUser(user.id)).find((entry) => entry.id === productId);
      if (!product || product.visibility === "hidden") {
        json(res, 404, createError("PRODUCT_NOT_FOUND", "This product is no longer available."));
        return;
      }

      if (product.distribution.type === "paid" && product.entitlement?.status === "owned") {
        json(res, 409, createError("ALREADY_OWNED", "You already own this product."));
        return;
      }

      const rawToken = `handoff_${randomBytes(16).toString("hex")}`;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await repositories.payments.createPaymentHandoff({
        tokenHash: sha256(rawToken),
        userId: user.id,
        productId,
        source: body.source?.trim() || "launcher",
        expiresAt,
        createdAt: new Date().toISOString()
      });

      json(res, 200, {
        ok: true,
        handoffToken: rawToken,
        paymentUrl: createPaymentUrl(rawToken),
        expiresAt
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/payment/resolve-handoff") {
      const body = await readJson<{ handoffToken?: string }>(req);
      const handoffToken = body.handoffToken?.trim();
      if (!handoffToken) {
        json(res, 400, createError("BAD_REQUEST", "handoffToken is required."));
        return;
      }

      const handoff = await repositories.payments.findPaymentHandoffByTokenHash(sha256(handoffToken));
      if (!handoff) {
        json(res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      if (handoff.usedAt) {
        json(res, 409, createError("HANDOFF_USED", "This checkout link has already been used."));
        return;
      }

      if (new Date(handoff.expiresAt).getTime() < Date.now()) {
        json(res, 410, createError("HANDOFF_EXPIRED", "This checkout link expired. Return to the launcher and try again."));
        return;
      }

      const handoffUser = await repositories.auth.findUserById(handoff.userId);
      const product = (await catalogForUser(handoff.userId)).find((entry) => entry.id === handoff.productId);
      if (!handoffUser || !product) {
        json(res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      json(res, 200, {
        ok: true,
        user: {
          id: handoffUser.id,
          email: handoffUser.email,
          displayName: handoffUser.displayName
        },
        product: {
          id: product.id,
          name: product.name,
          summary: product.summary,
          priceAmount: product.distribution.amount ?? 0,
          priceCurrency: product.distribution.currency ?? "USD"
        },
        source: handoff.source
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/payment/create-checkout-session") {
      const body = await readJson<{ handoffToken?: string }>(req);
      const handoffToken = body.handoffToken?.trim();
      if (!handoffToken) {
        json(res, 400, createError("BAD_REQUEST", "handoffToken is required."));
        return;
      }

      const handoff = await repositories.payments.findPaymentHandoffByTokenHash(sha256(handoffToken));
      if (!handoff) {
        json(res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      if (new Date(handoff.expiresAt).getTime() < Date.now()) {
        json(res, 410, createError("HANDOFF_EXPIRED", "This checkout link expired. Return to the launcher and try again."));
        return;
      }

      const product = (await catalogForUser(handoff.userId)).find((entry) => entry.id === handoff.productId);
      if (!product) {
        json(res, 404, createError("PRODUCT_NOT_FOUND", "This product is no longer available."));
        return;
      }

      if (product.entitlement?.status === "owned") {
        json(res, 409, createError("ALREADY_OWNED", "You already own this product."));
        return;
      }

      const paymentId = `pay_${randomBytes(8).toString("hex")}`;
      const paymentBase: PaymentRecord = {
        id: paymentId,
        userId: handoff.userId,
        productId: handoff.productId,
        provider: isLemonSqueezyConfigured(LEMON_SQUEEZY) ? "lemonsqueezy" : "manual",
        status: "pending",
        createdAt: new Date().toISOString()
      };

      let checkoutUrl: string;
      let providerCheckoutId: string | undefined;
      let providerSessionId: string | undefined;

      if (isLemonSqueezyConfigured(LEMON_SQUEEZY)) {
        const handoffUser = await repositories.auth.findUserById(handoff.userId);
        const lemonResult = await createLemonSqueezyCheckout(LEMON_SQUEEZY, {
          productId: handoff.productId,
          productName: product.name,
          productSummary: product.summary,
          userId: handoff.userId,
          email: handoffUser?.email,
          displayName: handoffUser?.displayName,
          handoffToken,
          source: handoff.source,
          redirectUrl: PAYMENT_SUCCESS_URL
        });
        checkoutUrl = lemonResult.checkoutUrl;
        providerCheckoutId = lemonResult.providerCheckoutId;
        providerSessionId = lemonResult.providerSessionId;
      } else {
        const checkoutId = `checkout_${randomBytes(8).toString("hex")}`;
        checkoutUrl = `${PAYMENT_BASE_URL}/checkout?paymentId=${encodeURIComponent(paymentId)}`;
        providerCheckoutId = checkoutId;
        providerSessionId = checkoutId;
      }

      await repositories.payments.createPayment({
        ...paymentBase,
        providerCheckoutId,
        providerSessionId
      });
      await repositories.payments.markPaymentHandoffUsed(handoff.id);

      json(res, 200, {
        ok: true,
        provider: paymentBase.provider,
        checkoutUrl,
        paymentId
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/payment/webhook") {
      const rawBody = await readRawBody(req);
      const signature = req.headers["x-signature"];
      const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

      if (isLemonSqueezyConfigured(LEMON_SQUEEZY)) {
        if (!verifyLemonSqueezySignature(rawBody, signatureHeader, LEMON_SQUEEZY.webhookSecret)) {
          json(res, 401, createError("INVALID_SIGNATURE", "Webhook signature is invalid."));
          return;
        }

        const body = JSON.parse(rawBody.toString("utf8")) as {
          meta?: {
            event_name?: string;
            custom_data?: {
              user_id?: string;
              product_id?: string;
            };
          };
          data?: {
            attributes?: {
              status?: string;
              identifier?: string;
            };
          };
        };

        const eventName = body.meta?.event_name;
        const custom = body.meta?.custom_data;
        if (
          eventName === "order_created" &&
          custom?.user_id &&
          custom?.product_id
        ) {
          const payment = await repositories.payments.findPendingPaymentByUserAndProduct(
            custom.user_id,
            custom.product_id
          );

          if (payment) {
            await repositories.payments.markPaymentPaid(payment.id, {
              providerSessionId: body.data?.attributes?.identifier ?? payment.providerSessionId
            });
            await upsertEntitlement(payment.userId, payment.productId);
          }
        }
      } else {
        const body = JSON.parse(rawBody.toString("utf8")) as {
          paymentId?: string;
          status?: string;
        };
        const paymentId = body.paymentId?.trim();
        if (!paymentId) {
          json(res, 400, createError("BAD_REQUEST", "paymentId is required."));
          return;
        }

        const payment = await repositories.payments.findPaymentById(paymentId);
        if (!payment) {
          json(res, 404, createError("PAYMENT_NOT_FOUND", "Payment was not found."));
          return;
        }

        if (body.status === "paid") {
          await repositories.payments.markPaymentPaid(payment.id);
          await upsertEntitlement(payment.userId, payment.productId);
        }
      }

      json(res, 200, { ok: true });
      return;
    }

    const paymentStatusMatch = pathname.match(/^\/api\/payment\/status\/([^/]+)$/);
    if (req.method === "GET" && paymentStatusMatch) {
      const paymentId = decodeURIComponent(paymentStatusMatch[1]);
      const payment = await repositories.payments.findPaymentById(paymentId);
      if (!payment) {
        json(res, 404, createError("PAYMENT_NOT_FOUND", "Payment was not found."));
        return;
      }

      json(res, 200, {
        ok: true,
        status: payment.status,
        entitlementGranted: payment.status === "paid"
      });
      return;
    }

    json(res, 404, createError("NOT_FOUND", "Endpoint not found."));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    json(res, 500, createError("INTERNAL_ERROR", message));
  }
});

void ensureDevLauncherUsers()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`MellowCat backend listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to seed dev launcher users:", error);
    process.exit(1);
  });
