import { createHash, randomBytes } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { URL } from "url";
import { getLemonSqueezyConfig } from "./config";
import {
  createLemonSqueezyCheckout,
  isLemonSqueezyConfigured,
  verifyLemonSqueezySignature
} from "./lemonsqueezy";

type EntitlementStatus = "free" | "owned" | "trial" | "not_owned" | "unknown";

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

interface DevUser {
  id: string;
  email: string;
  displayName: string;
  launcherToken: string;
}

interface PaymentHandoffRecord {
  id: string;
  tokenHash: string;
  userId: string;
  productId: string;
  source: string;
  expiresAt: string;
  usedAt?: string;
}

interface PaymentRecord {
  id: string;
  userId: string;
  productId: string;
  provider: string;
  status: "pending" | "paid" | "failed" | "canceled" | "refunded";
  providerCheckoutId?: string;
  providerSessionId?: string;
  paidAt?: string;
  createdAt: string;
}

interface EntitlementRecord {
  id: string;
  userId: string;
  mcpId: string;
  status: "owned" | "trial" | "revoked";
  source: "purchase" | "grant" | "admin";
  grantedAt: string;
  expiresAt?: string;
}

interface DatabaseShape {
  users: DevUser[];
  handoffs: PaymentHandoffRecord[];
  payments: PaymentRecord[];
  entitlements: EntitlementRecord[];
}

const PORT = Number(process.env.MELLOWCAT_API_PORT ?? "8787");
const HOST = process.env.MELLOWCAT_API_HOST ?? "127.0.0.1";
const PAYMENT_BASE_URL = process.env.MELLOWCAT_PAYMENT_BASE_URL ?? "https://mellowcat.xyz/payment";
const APP_BASE_URL = process.env.MELLOWCAT_APP_BASE_URL ?? `http://${HOST}:${PORT}`;
const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = path.resolve(ROOT_DIR, "backend", "data");
const DB_PATH = path.resolve(DATA_DIR, "db.json");
const CATALOG_PATH = path.resolve(ROOT_DIR, "resources", "bundled", "catalog.json");
const LEMON_SQUEEZY = getLemonSqueezyConfig();

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function seedDatabase(): DatabaseShape {
  return {
    users: [
      {
        id: "user_01",
        email: "creator@mellowcat.dev",
        displayName: "MellowCat Creator",
        launcherToken: "dev-launcher-token"
      }
    ],
    handoffs: [],
    payments: [],
    entitlements: [
      {
        id: "ent_fs_01",
        userId: "user_01",
        mcpId: "filesystem-tools",
        status: "owned",
        source: "grant",
        grantedAt: new Date().toISOString()
      }
    ]
  };
}

function loadDb(): DatabaseShape {
  ensureDataDir();
  if (!existsSync(DB_PATH)) {
    const seeded = seedDatabase();
    writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }

  return JSON.parse(readFileSync(DB_PATH, "utf8")) as DatabaseShape;
}

function saveDb(db: DatabaseShape): void {
  ensureDataDir();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

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

function getBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }

  return header.slice("Bearer ".length).trim();
}

function findUserByToken(db: DatabaseShape, token?: string): DevUser | undefined {
  if (!token) {
    return undefined;
  }

  return db.users.find((user) => user.launcherToken === token);
}

function getUserEntitlements(db: DatabaseShape, userId: string): EntitlementRecord[] {
  return db.entitlements.filter((entry) => entry.userId === userId && entry.status !== "revoked");
}

function getEntitlementStatus(db: DatabaseShape, userId: string, mcpId: string): EntitlementStatus {
  const record = db.entitlements.find(
    (entry) => entry.userId === userId && entry.mcpId === mcpId && entry.status !== "revoked"
  );
  if (!record) {
    return "not_owned";
  }

  return record.status === "trial" ? "trial" : "owned";
}

function catalogForUser(db: DatabaseShape, userId?: string): CatalogItem[] {
  const catalog = loadCatalog();
  return catalog.map((item) => {
    const status =
      item.distribution.type === "free" || item.distribution.type === "bundled"
        ? "free"
        : userId
          ? getEntitlementStatus(db, userId, item.id)
          : "not_owned";

    return {
      ...item,
      entitlement: {
        status,
        source: userId ? "remote" : "bundled",
        checkedAt: new Date().toISOString()
      }
    };
  });
}

function createError(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}

function createPaymentUrl(handoffToken: string): string {
  const url = new URL(PAYMENT_BASE_URL);
  url.searchParams.set("handoff", handoffToken);
  return url.toString();
}

function upsertEntitlement(db: DatabaseShape, userId: string, mcpId: string): EntitlementRecord {
  const existing = db.entitlements.find((entry) => entry.userId === userId && entry.mcpId === mcpId);
  if (existing) {
    existing.status = "owned";
    existing.source = "purchase";
    existing.grantedAt = new Date().toISOString();
    return existing;
  }

  const created: EntitlementRecord = {
    id: `ent_${randomBytes(6).toString("hex")}`,
    userId,
    mcpId,
    status: "owned",
    source: "purchase",
    grantedAt: new Date().toISOString()
  };
  db.entitlements.push(created);
  return created;
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
  const db = loadDb();
  const user = findUserByToken(db, getBearerToken(req));

  try {
    if (req.method === "GET" && pathname === "/health") {
      json(res, 200, { ok: true, service: "mellowcat-backend", now: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && pathname === "/catalog") {
      json(res, 200, { items: catalogForUser(db, user?.id) });
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

      const items = getUserEntitlements(db, user.id).map((entry) => ({
        mcpId: entry.mcpId,
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

      const item = catalogForUser(db, user.id).find((entry) => entry.id === mcpId);
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

      const product = catalogForUser(db, user.id).find((entry) => entry.id === productId);
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
      db.handoffs.push({
        id: `ph_${randomBytes(8).toString("hex")}`,
        tokenHash: sha256(rawToken),
        userId: user.id,
        productId,
        source: body.source?.trim() || "launcher",
        expiresAt
      });
      saveDb(db);

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

      const handoff = db.handoffs.find((entry) => entry.tokenHash === sha256(handoffToken));
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

      const handoffUser = db.users.find((entry) => entry.id === handoff.userId);
      const product = catalogForUser(db, handoff.userId).find((entry) => entry.id === handoff.productId);
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

      const handoff = db.handoffs.find((entry) => entry.tokenHash === sha256(handoffToken));
      if (!handoff) {
        json(res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      if (new Date(handoff.expiresAt).getTime() < Date.now()) {
        json(res, 410, createError("HANDOFF_EXPIRED", "This checkout link expired. Return to the launcher and try again."));
        return;
      }

      const product = catalogForUser(db, handoff.userId).find((entry) => entry.id === handoff.productId);
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
        const handoffUser = db.users.find((entry) => entry.id === handoff.userId);
        const lemonResult = await createLemonSqueezyCheckout(LEMON_SQUEEZY, {
          productId: handoff.productId,
          productName: product.name,
          productSummary: product.summary,
          userId: handoff.userId,
          email: handoffUser?.email,
          displayName: handoffUser?.displayName,
          handoffToken,
          source: handoff.source,
          redirectUrl: PAYMENT_BASE_URL
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

      db.payments.push({
        ...paymentBase,
        providerCheckoutId,
        providerSessionId
      });
      handoff.usedAt = new Date().toISOString();
      saveDb(db);

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
          const payment = db.payments.find(
            (entry) =>
              entry.userId === custom.user_id &&
              entry.productId === custom.product_id &&
              entry.status !== "paid"
          );

          if (payment) {
            payment.status = "paid";
            payment.paidAt = new Date().toISOString();
            payment.providerSessionId =
              body.data?.attributes?.identifier ?? payment.providerSessionId;
            upsertEntitlement(db, payment.userId, payment.productId);
            saveDb(db);
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

        const payment = db.payments.find((entry) => entry.id === paymentId);
        if (!payment) {
          json(res, 404, createError("PAYMENT_NOT_FOUND", "Payment was not found."));
          return;
        }

        if (body.status === "paid") {
          payment.status = "paid";
          payment.paidAt = new Date().toISOString();
          upsertEntitlement(db, payment.userId, payment.productId);
          saveDb(db);
        }
      }

      json(res, 200, { ok: true });
      return;
    }

    const paymentStatusMatch = pathname.match(/^\/api\/payment\/status\/([^/]+)$/);
    if (req.method === "GET" && paymentStatusMatch) {
      const paymentId = decodeURIComponent(paymentStatusMatch[1]);
      const payment = db.payments.find((entry) => entry.id === paymentId);
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

server.listen(PORT, HOST, () => {
  console.log(`MellowCat backend listening on http://${HOST}:${PORT}`);
});
