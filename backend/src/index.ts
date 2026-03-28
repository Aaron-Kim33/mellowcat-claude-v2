import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
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
import type {
  CreatePaymentInput,
  EntitlementStatus,
  PaymentRecord,
  UserRecord
} from "./repositories/types";

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
const WEB_BASE_URL = process.env.MELLOWCAT_WEB_BASE_URL ?? "https://mellowcat.xyz";
const ROOT_DIR = path.resolve(__dirname, "../..");
const CATALOG_PATH = path.resolve(ROOT_DIR, "resources", "bundled", "catalog.json");
const LEMON_SQUEEZY = getLemonSqueezyConfig();
const repositories = createRepositories();
const ALLOWED_WEB_ORIGINS = new Set(
  [
    WEB_BASE_URL,
    APP_BASE_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return undefined;
      }
    })
    .filter((value): value is string => Boolean(value))
);

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

function getCorsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  const allowOrigin =
    origin && ALLOWED_WEB_ORIGINS.has(origin)
      ? origin
      : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  };
}

function json(req: IncomingMessage, res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...getCorsHeaders(req)
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

function shortTokenHash(token?: string): string {
  if (!token) {
    return "missing";
  }

  return sha256(token).slice(0, 12);
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

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, digest] = storedHash.split(":");
  if (!salt || !digest) {
    return false;
  }

  const derived = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(digest, "hex"));
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").map((pair) => {
      const [name, ...rest] = pair.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    })
  );
}

function setCookie(res: ServerResponse, name: string, value: string, maxAgeSeconds?: number): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAgeSeconds) {
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearCookie(res: ServerResponse, name: string): void {
  res.setHeader("Set-Cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function findUserByWebCookie(req: IncomingMessage): Promise<UserRecord | undefined> {
  const cookies = parseCookies(req);
  const token = cookies["mellowcat_web_session"];
  if (!token) {
    return undefined;
  }

  return repositories.auth.findUserByWebSessionToken(token);
}

async function upsertEntitlement(userId: string, mcpId: string) {
  return repositories.entitlements.upsertOwnedEntitlement(userId, mcpId);
}

const server = createServer(async (req, res) => {
    if (!req.url) {
    json(req, res, 400, createError("BAD_REQUEST", "Missing URL."));
    return;
  }

  if (req.method === "OPTIONS") {
    json(req, res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, APP_BASE_URL);
  const pathname = url.pathname;
  const user = await findUserByToken(getBearerToken(req));

  try {
    if (req.method === "GET" && pathname === "/health") {
      json(req, res, 200, { ok: true, service: "mellowcat-backend", now: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && pathname === "/catalog") {
      json(req, res, 200, { items: await catalogForUser(user?.id) });
      return;
    }

    if (req.method === "GET" && pathname === "/auth/session") {
      if (!user) {
        console.warn("[auth/session] user lookup failed", {
          tokenHash: shortTokenHash(getBearerToken(req))
        });
        json(req, res, 401, createError("UNAUTHENTICATED", "Sign in again to continue."));
        return;
      }

      json(req, res, 200, {
        loggedIn: true,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        source: "remote",
        lastSyncedAt: new Date().toISOString()
      });
      console.log("[auth/session] resolved", {
        userId: user.id,
        email: user.email
      });
      return;
    }

    if (req.method === "GET" && pathname === "/auth/entitlements") {
      if (!user) {
        json(req, res, 401, createError("UNAUTHENTICATED", "Sign in again to continue."));
        return;
      }

      const items = (await getUserEntitlements(user.id)).map((entry) => ({
        mcpId: entry.productId,
        status: entry.status === "trial" ? "trial" : "owned",
        checkedAt: new Date().toISOString()
      }));
      json(req, res, 200, { items });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      const body = await readJson<{ email?: string; password?: string; displayName?: string }>(req);
      const email = body.email?.trim().toLowerCase();
      const password = body.password?.trim();
      const displayName = body.displayName?.trim();

      if (!email || !password) {
        json(req, res, 400, createError("BAD_REQUEST", "email and password are required."));
        return;
      }

      if (password.length < 8) {
        json(req, res, 400, createError("WEAK_PASSWORD", "Password must be at least 8 characters."));
        return;
      }

      const existing = await repositories.auth.findUserByEmail(email);
      if (existing) {
        json(req, res, 409, createError("EMAIL_EXISTS", "An account with this email already exists."));
        return;
      }

      const createdUser = await repositories.auth.createUser({
        email,
        displayName
      });
      await repositories.auth.createPasswordCredential({
        userId: createdUser.id,
        passwordHash: hashPassword(password)
      });

      const rawWebToken = `web_${randomBytes(16).toString("hex")}`;
      await repositories.auth.createWebSession({
        userId: createdUser.id,
        tokenHash: sha256(rawWebToken),
        source: "signup"
      });
      setCookie(res, "mellowcat_web_session", rawWebToken, 60 * 60 * 24 * 30);

      json(req, res, 200, {
        ok: true,
        user: {
          id: createdUser.id,
          email: createdUser.email,
          displayName: createdUser.displayName
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await readJson<{ email?: string; password?: string; launcherRequest?: string }>(req);
      const email = body.email?.trim().toLowerCase();
      const password = body.password?.trim();

      if (!email || !password) {
        json(req, res, 400, createError("BAD_REQUEST", "email and password are required."));
        return;
      }

      const credential = await repositories.auth.findPasswordCredentialByEmail(email);
      if (!credential || !verifyPassword(password, credential.passwordHash)) {
        json(req, res, 401, createError("INVALID_CREDENTIALS", "Email or password is incorrect."));
        return;
      }

      const rawWebToken = `web_${randomBytes(16).toString("hex")}`;
      await repositories.auth.createWebSession({
        userId: credential.user.id,
        tokenHash: sha256(rawWebToken),
        source: "login"
      });
      setCookie(res, "mellowcat_web_session", rawWebToken, 60 * 60 * 24 * 30);

      if (body.launcherRequest?.trim()) {
        await repositories.auth.resolveLauncherAuthRequest(
          sha256(body.launcherRequest.trim()),
          credential.user.id
        );
      }

      json(req, res, 200, {
        ok: true,
        user: {
          id: credential.user.id,
          email: credential.user.email,
          displayName: credential.user.displayName
        },
        launcherRequestResolved: Boolean(body.launcherRequest?.trim())
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const cookies = parseCookies(req);
      const token = cookies["mellowcat_web_session"];
      if (token) {
        await repositories.auth.deleteWebSession(sha256(token));
      }
      clearCookie(res, "mellowcat_web_session");
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const webUser = await findUserByWebCookie(req);
      if (!webUser) {
        json(req, res, 401, createError("UNAUTHENTICATED", "Sign in to continue."));
        return;
      }

      json(req, res, 200, {
        ok: true,
        user: {
          id: webUser.id,
          email: webUser.email,
          displayName: webUser.displayName
        }
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/launcher/start") {
      const rawRequestToken = `authreq_${randomBytes(16).toString("hex")}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await repositories.auth.createLauncherAuthRequest({
        requestTokenHash: sha256(rawRequestToken),
        source: "launcher",
        expiresAt
      });

      const loginUrl = new URL("/login", WEB_BASE_URL);
      loginUrl.searchParams.set("source", "launcher");
      loginUrl.searchParams.set("launcherRequest", rawRequestToken);

      json(req, res, 200, {
        ok: true,
        requestId: rawRequestToken,
        loginUrl: loginUrl.toString(),
        expiresAt
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/launcher/complete") {
      const webUser = await findUserByWebCookie(req);
      if (!webUser) {
        json(req, res, 401, createError("UNAUTHENTICATED", "Sign in to continue."));
        return;
      }

      const body = await readJson<{ requestId?: string }>(req);
      const requestId = body.requestId?.trim();
      if (!requestId) {
        json(req, res, 400, createError("BAD_REQUEST", "requestId is required."));
        return;
      }

      const requestRecord = await repositories.auth.findLauncherAuthRequestByTokenHash(
        sha256(requestId)
      );
      if (!requestRecord) {
        json(req, res, 404, createError("REQUEST_NOT_FOUND", "Launcher auth request was not found."));
        return;
      }

      if (new Date(requestRecord.expiresAt).getTime() < Date.now()) {
        json(req, res, 410, createError("REQUEST_EXPIRED", "Launcher auth request expired."));
        return;
      }

      await repositories.auth.resolveLauncherAuthRequest(sha256(requestId), webUser.id);
      json(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/launcher/resolve") {
      const body = await readJson<{ requestId?: string }>(req);
      const requestId = body.requestId?.trim();
      if (!requestId) {
        json(req, res, 400, createError("BAD_REQUEST", "requestId is required."));
        return;
      }

      const requestRecord = await repositories.auth.findLauncherAuthRequestByTokenHash(
        sha256(requestId)
      );
      if (!requestRecord) {
        json(req, res, 404, createError("REQUEST_NOT_FOUND", "Launcher auth request was not found."));
        return;
      }

      if (new Date(requestRecord.expiresAt).getTime() < Date.now()) {
        json(req, res, 410, createError("REQUEST_EXPIRED", "Launcher auth request expired."));
        return;
      }

      if (!requestRecord.resolvedAt || !requestRecord.userId) {
        json(req, res, 202, {
          ok: true,
          status: "pending"
        });
        return;
      }

      const resolvedUser = await repositories.auth.findUserById(requestRecord.userId);
      if (!resolvedUser) {
        json(req, res, 404, createError("USER_NOT_FOUND", "Resolved launcher user could not be found."));
        return;
      }

      const rawLauncherToken = `launcher_${randomBytes(20).toString("hex")}`;
      await repositories.auth.createLauncherSession({
        userId: resolvedUser.id,
        tokenHash: sha256(rawLauncherToken),
        source: "launcher-browser"
      });

      json(req, res, 200, {
        ok: true,
        status: "resolved",
        accessToken: rawLauncherToken,
        session: {
          loggedIn: true,
          userId: resolvedUser.id,
          email: resolvedUser.email,
          displayName: resolvedUser.displayName,
          source: "remote",
          lastSyncedAt: new Date().toISOString()
        }
      });
      return;
    }

    const downloadTicketMatch = pathname.match(/^\/mcp\/([^/]+)\/download-ticket$/);
    if (req.method === "GET" && downloadTicketMatch) {
      if (!user) {
        json(req, res, 401, createError("UNAUTHENTICATED", "Sign in again to continue."));
        return;
      }

      const mcpId = decodeURIComponent(downloadTicketMatch[1]);
      const version = url.searchParams.get("version");
      if (!version) {
        json(req, res, 400, createError("BAD_REQUEST", "version is required."));
        return;
      }

      const item = (await catalogForUser(user.id)).find((entry) => entry.id === mcpId);
      if (!item) {
        json(req, res, 404, createError("PRODUCT_NOT_FOUND", "This MCP does not exist."));
        return;
      }

      if (item.distribution.type === "paid" && item.entitlement?.status !== "owned") {
        json(req, res, 403, createError("NOT_ENTITLED", "You do not own this MCP yet."));
        return;
      }

      json(req, res, 200, {
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
        json(req, res, 401, createError("UNAUTHENTICATED", "You need to sign in again before starting checkout."));
        return;
      }

      const body = await readJson<{ productId?: string; source?: string }>(req);
      const productId = body.productId?.trim();
      if (!productId) {
        json(req, res, 400, createError("BAD_REQUEST", "productId is required."));
        return;
      }

      const product = (await catalogForUser(user.id)).find((entry) => entry.id === productId);
      if (!product || product.visibility === "hidden") {
        json(req, res, 404, createError("PRODUCT_NOT_FOUND", "This product is no longer available."));
        return;
      }

      if (product.distribution.type === "paid" && product.entitlement?.status === "owned") {
        json(req, res, 409, createError("ALREADY_OWNED", "You already own this product."));
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

      json(req, res, 200, {
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
        json(req, res, 400, createError("BAD_REQUEST", "handoffToken is required."));
        return;
      }

      const handoff = await repositories.payments.findPaymentHandoffByTokenHash(sha256(handoffToken));
      if (!handoff) {
        json(req, res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      if (handoff.usedAt) {
        json(req, res, 409, createError("HANDOFF_USED", "This checkout link has already been used."));
        return;
      }

      if (new Date(handoff.expiresAt).getTime() < Date.now()) {
        json(req, res, 410, createError("HANDOFF_EXPIRED", "This checkout link expired. Return to the launcher and try again."));
        return;
      }

      const handoffUser = await repositories.auth.findUserById(handoff.userId);
      const product = (await catalogForUser(handoff.userId)).find((entry) => entry.id === handoff.productId);
      if (!handoffUser || !product) {
        json(req, res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      json(req, res, 200, {
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
        json(req, res, 400, createError("BAD_REQUEST", "handoffToken is required."));
        return;
      }

      const handoff = await repositories.payments.findPaymentHandoffByTokenHash(sha256(handoffToken));
      if (!handoff) {
        json(req, res, 404, createError("HANDOFF_INVALID", "This checkout link is invalid."));
        return;
      }

      if (new Date(handoff.expiresAt).getTime() < Date.now()) {
        json(req, res, 410, createError("HANDOFF_EXPIRED", "This checkout link expired. Return to the launcher and try again."));
        return;
      }

      const product = (await catalogForUser(handoff.userId)).find((entry) => entry.id === handoff.productId);
      if (!product) {
        json(req, res, 404, createError("PRODUCT_NOT_FOUND", "This product is no longer available."));
        return;
      }

      if (product.entitlement?.status === "owned") {
        json(req, res, 409, createError("ALREADY_OWNED", "You already own this product."));
        return;
      }

      const paymentBase: CreatePaymentInput = {
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
        const fallbackPaymentId = `pay_${randomBytes(8).toString("hex")}`;
        paymentBase.id = fallbackPaymentId;
        checkoutUrl = `${PAYMENT_BASE_URL}/checkout?paymentId=${encodeURIComponent(fallbackPaymentId)}`;
        providerCheckoutId = checkoutId;
        providerSessionId = checkoutId;
      }

      const createdPayment = await repositories.payments.createPayment({
        ...paymentBase,
        providerCheckoutId,
        providerSessionId
      });
      await repositories.payments.markPaymentHandoffUsed(handoff.id);

      json(req, res, 200, {
        ok: true,
        provider: paymentBase.provider,
        checkoutUrl,
        paymentId: createdPayment.id
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/payment/webhook") {
      const rawBody = await readRawBody(req);
      const signature = req.headers["x-signature"];
      const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

      if (isLemonSqueezyConfigured(LEMON_SQUEEZY)) {
        if (!verifyLemonSqueezySignature(rawBody, signatureHeader, LEMON_SQUEEZY.webhookSecret)) {
          json(req, res, 401, createError("INVALID_SIGNATURE", "Webhook signature is invalid."));
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
          json(req, res, 400, createError("BAD_REQUEST", "paymentId is required."));
          return;
        }

        const payment = await repositories.payments.findPaymentById(paymentId);
        if (!payment) {
          json(req, res, 404, createError("PAYMENT_NOT_FOUND", "Payment was not found."));
          return;
        }

        if (body.status === "paid") {
          await repositories.payments.markPaymentPaid(payment.id);
          await upsertEntitlement(payment.userId, payment.productId);
        }
      }

      json(req, res, 200, { ok: true });
      return;
    }

    const paymentStatusMatch = pathname.match(/^\/api\/payment\/status\/([^/]+)$/);
    if (req.method === "GET" && paymentStatusMatch) {
      const paymentId = decodeURIComponent(paymentStatusMatch[1]);
      const payment = await repositories.payments.findPaymentById(paymentId);
      if (!payment) {
        json(req, res, 404, createError("PAYMENT_NOT_FOUND", "Payment was not found."));
        return;
      }

      json(req, res, 200, {
        ok: true,
        status: payment.status,
        entitlementGranted: payment.status === "paid"
      });
      return;
    }

    json(req, res, 404, createError("NOT_FOUND", "Endpoint not found."));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    console.error("[backend] request failed", {
      method: req.method,
      pathname,
      message
    });
    json(req, res, 500, createError("INTERNAL_ERROR", message));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MellowCat backend listening on http://${HOST}:${PORT}`);
  void ensureDevLauncherUsers().catch((error) => {
    console.error("Failed to seed dev launcher users:", error);
  });
});
