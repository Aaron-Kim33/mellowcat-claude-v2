import { createHash } from "crypto";
import type {
  BackendRepositories,
  EmailVerificationRequestRecord,
  EntitlementRecord,
  LauncherAuthRequestRecord,
  PasswordResetRequestRecord,
  PaymentHandoffRecord,
  PaymentRecord,
  UserRecord
} from "./types";

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type Json = Record<string, unknown>;

class SupabaseRestClient {
  constructor(private readonly config: SupabaseConfig) {}

  private buildUrl(table: string, query?: string): string {
    const normalizedBase = this.config.url.replace(/\/+$/, "");
    const suffix = query ? `?${query}` : "";
    return `${normalizedBase}/rest/v1/${table}${suffix}`;
  }

  async request<T>(table: string, init?: RequestInit & { query?: string }): Promise<T> {
    const response = await fetch(this.buildUrl(table, init?.query), {
      method: init?.method ?? "GET",
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...init?.headers
      },
      body: init?.body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase request failed (${response.status}): ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

function mapUser(row: Json): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: typeof row.display_name === "string" ? row.display_name : undefined,
    emailVerifiedAt:
      typeof row.email_verified_at === "string" ? row.email_verified_at : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined
  };
}

function mapEntitlement(row: Json): EntitlementRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    productId: String(row.product_id),
    status: row.status as EntitlementRecord["status"],
    source: row.source as EntitlementRecord["source"],
    grantedAt: String(row.granted_at),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

function mapPayment(row: Json): PaymentRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    productId: String(row.product_id),
    provider: String(row.provider),
    status: row.status as PaymentRecord["status"],
    providerCheckoutId:
      typeof row.provider_checkout_id === "string" ? row.provider_checkout_id : undefined,
    providerSessionId:
      typeof row.provider_session_id === "string" ? row.provider_session_id : undefined,
    paidAt: typeof row.paid_at === "string" ? row.paid_at : undefined,
    createdAt: String(row.created_at),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

function mapHandoff(row: Json): PaymentHandoffRecord {
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    userId: String(row.user_id),
    productId: String(row.product_id),
    source: String(row.source),
    expiresAt: String(row.expires_at),
    usedAt: typeof row.used_at === "string" ? row.used_at : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined
  };
}

function mapLauncherAuthRequest(row: Json): LauncherAuthRequestRecord {
  return {
    id: String(row.id),
    requestTokenHash: String(row.request_token_hash),
    userId: typeof row.user_id === "string" ? row.user_id : undefined,
    source: String(row.source),
    expiresAt: String(row.expires_at),
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined
  };
}

function mapPasswordResetRequest(row: Json): PasswordResetRequestRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    usedAt: typeof row.used_at === "string" ? row.used_at : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined
  };
}

function mapEmailVerificationRequest(row: Json): EmailVerificationRequestRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    usedAt: typeof row.used_at === "string" ? row.used_at : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined
  };
}

function first<T>(items: T[] | null | undefined): T | undefined {
  return Array.isArray(items) && items.length > 0 ? items[0] : undefined;
}

export function createSupabaseRepositories(config: SupabaseConfig): BackendRepositories {
  const client = new SupabaseRestClient(config);

  return {
    auth: {
      async findUserByLauncherToken(token: string) {
        const sessionRows = await client.request<Json[]>("launcher_sessions", {
          query: [
            "select=user_id",
            `token_hash=eq.${encodeURIComponent(sha256(token))}`,
            "limit=1"
          ].join("&")
        });
        const session = first(sessionRows);
        const userId = typeof session?.user_id === "string" ? session.user_id : undefined;
        if (!userId) {
          return undefined;
        }

        const userRows = await client.request<Json[]>("app_users", {
          query: `select=*&id=eq.${encodeURIComponent(userId)}&limit=1`
        });
        const user = first(userRows);
        return user ? mapUser(user) : undefined;
      },
      async findUserById(userId: string) {
        const rows = await client.request<Json[]>("app_users", {
          query: `select=*&id=eq.${encodeURIComponent(userId)}`
        });
        const row = first(rows);
        return row ? mapUser(row) : undefined;
      },
      async findUserByEmail(email: string) {
        const rows = await client.request<Json[]>("app_users", {
          query: `select=*&email=eq.${encodeURIComponent(email)}`
        });
        const row = first(rows);
        return row ? mapUser(row) : undefined;
      },
      async listAuthProvidersForUser(userId) {
        const providers = new Set<string>();

        const passwordRows = await client.request<Json[]>("password_credentials", {
          query: `select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`
        });
        if (first(passwordRows)) {
          providers.add("password");
        }

        const identityRows = await client.request<Json[]>("auth_identities", {
          query: `select=provider&user_id=eq.${encodeURIComponent(userId)}`
        });
        for (const row of identityRows) {
          if (typeof row.provider === "string" && row.provider.trim()) {
            providers.add(row.provider);
          }
        }

        return Array.from(providers).sort();
      },
      async markUserEmailVerified(userId) {
        const rows = await client.request<Json[]>("app_users", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(userId)}`,
          body: JSON.stringify({
            email_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
        const row = first(rows);
        return row ? mapUser(row) : undefined;
      },
      async createUser(user) {
        const rows = await client.request<Json[]>("app_users", {
          method: "POST",
          body: JSON.stringify({
            ...(user.id ? { id: user.id } : {}),
            email: user.email,
            display_name: user.displayName ?? null
          })
        });
        return mapUser(rows[0]);
      },
      async createPasswordCredential(input) {
        await client.request<Json[]>("password_credentials", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          query: "on_conflict=user_id",
          body: JSON.stringify({
            user_id: input.userId,
            password_hash: input.passwordHash,
            updated_at: new Date().toISOString()
          })
        });
      },
      async findPasswordCredentialByEmail(email) {
        const user = await this.findUserByEmail(email);
        if (!user) {
          return undefined;
        }
        const rows = await client.request<Json[]>("password_credentials", {
          query: `select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
        });
        const credential = first(rows);
        if (!credential || typeof credential.password_hash !== "string") {
          return undefined;
        }
        return {
          user,
          passwordHash: credential.password_hash
        };
      },
      async updatePasswordCredential(input) {
        await client.request<Json[]>("password_credentials", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          query: "on_conflict=user_id",
          body: JSON.stringify({
            user_id: input.userId,
            password_hash: input.passwordHash,
            updated_at: new Date().toISOString()
          })
        });
      },
      async findUserByIdentity(provider, providerUserId) {
        const identityRows = await client.request<Json[]>("auth_identities", {
          query: [
            "select=user_id",
            `provider=eq.${encodeURIComponent(provider)}`,
            `provider_user_id=eq.${encodeURIComponent(providerUserId)}`,
            "limit=1"
          ].join("&")
        });
        const identity = first(identityRows);
        const userId = typeof identity?.user_id === "string" ? identity.user_id : undefined;
        if (!userId) {
          return undefined;
        }
        return this.findUserById(userId);
      },
      async upsertAuthIdentity(input) {
        await client.request<Json[]>("auth_identities", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          query: "on_conflict=provider,provider_user_id",
          body: JSON.stringify({
            user_id: input.userId,
            provider: input.provider,
            provider_user_id: input.providerUserId,
            email: input.email ?? null,
            updated_at: new Date().toISOString()
          })
        });
      },
      async createLauncherSession(input) {
        await client.request<Json[]>("launcher_sessions", {
          method: "POST",
          body: JSON.stringify({
          user_id: input.userId,
          token_hash: input.tokenHash,
          source: input.source,
          expires_at:
            input.expiresAt && !input.expiresAt.startsWith("dev-token:")
              ? input.expiresAt
              : null
        })
      });
      },
      async deleteLauncherSession(tokenHash) {
        await client.request<Json[]>("launcher_sessions", {
          method: "DELETE",
          query: `token_hash=eq.${encodeURIComponent(tokenHash)}`
        });
      },
      async createWebSession(input) {
        await client.request<Json[]>("web_sessions", {
          method: "POST",
          body: JSON.stringify({
            user_id: input.userId,
            token_hash: input.tokenHash,
            source: input.source,
            expires_at: input.expiresAt ?? null
          })
        });
      },
      async findUserByWebSessionToken(token) {
        const sessionRows = await client.request<Json[]>("web_sessions", {
          query: [
            "select=user_id",
            `token_hash=eq.${encodeURIComponent(sha256(token))}`,
            "limit=1"
          ].join("&")
        });
        const session = first(sessionRows);
        const userId = typeof session?.user_id === "string" ? session.user_id : undefined;
        if (!userId) {
          return undefined;
        }
        return this.findUserById(userId);
      },
      async deleteWebSession(tokenHash) {
        await client.request<Json[]>("web_sessions", {
          method: "DELETE",
          query: `token_hash=eq.${encodeURIComponent(tokenHash)}`
        });
      },
      async createLauncherAuthRequest(input) {
        const rows = await client.request<Json[]>("launcher_auth_requests", {
          method: "POST",
          body: JSON.stringify({
            request_token_hash: input.requestTokenHash,
            user_id: input.userId ?? null,
            source: input.source,
            expires_at: input.expiresAt
          })
        });
        return mapLauncherAuthRequest(rows[0]);
      },
      async findLauncherAuthRequestByTokenHash(tokenHash) {
        const rows = await client.request<Json[]>("launcher_auth_requests", {
          query: `select=*&request_token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
        });
        const row = first(rows);
        return row ? mapLauncherAuthRequest(row) : undefined;
      },
      async resolveLauncherAuthRequest(tokenHash, userId) {
        await client.request<Json[]>("launcher_auth_requests", {
          method: "PATCH",
          query: `request_token_hash=eq.${encodeURIComponent(tokenHash)}`,
          body: JSON.stringify({
            user_id: userId,
            resolved_at: new Date().toISOString()
          })
        });
      },
      async createPasswordResetRequest(input) {
        const rows = await client.request<Json[]>("password_reset_requests", {
          method: "POST",
          body: JSON.stringify({
            user_id: input.userId,
            token_hash: input.tokenHash,
            expires_at: input.expiresAt
          })
        });
        return mapPasswordResetRequest(rows[0]);
      },
      async findPasswordResetRequestByTokenHash(tokenHash) {
        const rows = await client.request<Json[]>("password_reset_requests", {
          query: `select=*&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
        });
        const row = first(rows);
        return row ? mapPasswordResetRequest(row) : undefined;
      },
      async markPasswordResetRequestUsed(id) {
        await client.request<Json[]>("password_reset_requests", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(id)}`,
          body: JSON.stringify({
            used_at: new Date().toISOString()
          })
        });
      },
      async createEmailVerificationRequest(input) {
        const rows = await client.request<Json[]>("email_verification_requests", {
          method: "POST",
          body: JSON.stringify({
            user_id: input.userId,
            token_hash: input.tokenHash,
            expires_at: input.expiresAt
          })
        });
        return mapEmailVerificationRequest(rows[0]);
      },
      async findEmailVerificationRequestByTokenHash(tokenHash) {
        const rows = await client.request<Json[]>("email_verification_requests", {
          query: `select=*&token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
        });
        const row = first(rows);
        return row ? mapEmailVerificationRequest(row) : undefined;
      },
      async markEmailVerificationRequestUsed(id) {
        await client.request<Json[]>("email_verification_requests", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(id)}`,
          body: JSON.stringify({
            used_at: new Date().toISOString()
          })
        });
      }
    },
    payments: {
      async createPaymentHandoff(record) {
        const rows = await client.request<Json[]>("payment_handoffs", {
          method: "POST",
          body: JSON.stringify({
            token_hash: record.tokenHash,
            user_id: record.userId,
            product_id: record.productId,
            source: record.source,
            expires_at: record.expiresAt,
            used_at: record.usedAt ?? null,
            created_at: record.createdAt ?? new Date().toISOString()
          })
        });
        return mapHandoff(rows[0]);
      },
      async findPaymentHandoffByTokenHash(tokenHash) {
        const rows = await client.request<Json[]>("payment_handoffs", {
          query: `select=*&token_hash=eq.${encodeURIComponent(tokenHash)}`
        });
        const row = first(rows);
        return row ? mapHandoff(row) : undefined;
      },
      async markPaymentHandoffUsed(id) {
        await client.request<Json[]>("payment_handoffs", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(id)}`,
          body: JSON.stringify({
            used_at: new Date().toISOString()
          })
        });
      },
      async createPayment(record) {
        const rows = await client.request<Json[]>("payments", {
          method: "POST",
          body: JSON.stringify({
            user_id: record.userId,
            product_id: record.productId,
            provider: record.provider,
            provider_checkout_id: record.providerCheckoutId ?? null,
            provider_session_id: record.providerSessionId ?? null,
            status: record.status,
            paid_at: record.paidAt ?? null,
            created_at: record.createdAt
          })
        });
        return mapPayment(rows[0]);
      },
      async findPendingPaymentByUserAndProduct(userId, productId) {
        const rows = await client.request<Json[]>("payments", {
          query: [
            "select=*",
            `user_id=eq.${encodeURIComponent(userId)}`,
            `product_id=eq.${encodeURIComponent(productId)}`,
            "status=neq.paid",
            "order=created_at.desc",
            "limit=1"
          ].join("&")
        });
        const row = first(rows);
        return row ? mapPayment(row) : undefined;
      },
      async findPaymentById(paymentId) {
        const rows = await client.request<Json[]>("payments", {
          query: `select=*&id=eq.${encodeURIComponent(paymentId)}`
        });
        const row = first(rows);
        return row ? mapPayment(row) : undefined;
      },
      async markPaymentPaid(paymentId, patch) {
        await client.request<Json[]>("payments", {
          method: "PATCH",
          query: `id=eq.${encodeURIComponent(paymentId)}`,
          body: JSON.stringify({
            status: "paid",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            provider_checkout_id: patch?.providerCheckoutId ?? undefined,
            provider_session_id: patch?.providerSessionId ?? undefined
          })
        });
      }
    },
    entitlements: {
      async listEntitlementsForUser(userId) {
        const rows = await client.request<Json[]>("entitlements", {
          query: [
            "select=*",
            `user_id=eq.${encodeURIComponent(userId)}`,
            "status=neq.revoked"
          ].join("&")
        });
        return rows.map(mapEntitlement);
      },
      async findEntitlement(userId, productId) {
        const rows = await client.request<Json[]>("entitlements", {
          query: [
            "select=*",
            `user_id=eq.${encodeURIComponent(userId)}`,
            `product_id=eq.${encodeURIComponent(productId)}`,
            "status=neq.revoked"
          ].join("&")
        });
        const row = first(rows);
        return row ? mapEntitlement(row) : undefined;
      },
      async upsertOwnedEntitlement(userId, productId) {
        const rows = await client.request<Json[]>("entitlements", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          query: "on_conflict=user_id,product_id",
          body: JSON.stringify({
            user_id: userId,
            product_id: productId,
            status: "owned",
            source: "purchase",
            granted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
        return mapEntitlement(rows[0]);
      }
    }
  };
}
