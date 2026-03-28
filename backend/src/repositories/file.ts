import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { createHash, randomBytes } from "crypto";
import type {
  AuthIdentityRecord,
  BackendRepositories,
  EntitlementRecord,
  LauncherAuthRequestRecord,
  PasswordCredentialRecord,
  PaymentHandoffRecord,
  PaymentRecord,
  UserRecord,
  WebSessionRecord
} from "./types";

interface FileDatabaseShape {
  users: UserRecord[];
  authIdentities: AuthIdentityRecord[];
  passwordCredentials: PasswordCredentialRecord[];
  webSessions: WebSessionRecord[];
  launcherAuthRequests: LauncherAuthRequestRecord[];
  handoffs: PaymentHandoffRecord[];
  payments: PaymentRecord[];
  entitlements: EntitlementRecord[];
}

const ROOT_DIR = path.resolve(__dirname, "../../..");
const DATA_DIR = path.resolve(ROOT_DIR, "backend", "data");
const DB_PATH = path.resolve(DATA_DIR, "db.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function seedDatabase(): FileDatabaseShape {
  return {
    users: [
      {
        id: "user_01",
        email: "creator@mellowcat.dev",
        displayName: "MellowCat Creator",
        launcherToken: "dev-launcher-token"
      },
      {
        id: "user_02",
        email: "creator2@mellowcat.dev",
        displayName: "MellowCat Creator 2",
        launcherToken: "dev-launcher-token-2"
      }
    ],
    authIdentities: [],
    passwordCredentials: [],
    webSessions: [],
    launcherAuthRequests: [],
    handoffs: [],
    payments: [],
    entitlements: [
      {
        id: "ent_fs_01",
        userId: "user_01",
        productId: "filesystem-tools",
        status: "owned",
        source: "grant",
        grantedAt: new Date().toISOString()
      }
    ]
  };
}

function loadDb(): FileDatabaseShape {
  ensureDataDir();
  if (!existsSync(DB_PATH)) {
    const seeded = seedDatabase();
    writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }

  return JSON.parse(readFileSync(DB_PATH, "utf8")) as FileDatabaseShape;
}

function saveDb(db: FileDatabaseShape): void {
  ensureDataDir();
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createFileRepositories(): BackendRepositories {
  return {
    auth: {
      async findUserByLauncherToken(token: string) {
        const db = loadDb();
        return db.users.find((user) => user.launcherToken === token);
      },
      async findUserById(userId: string) {
        const db = loadDb();
        return db.users.find((user) => user.id === userId);
      },
      async findUserByEmail(email: string) {
        const db = loadDb();
        return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
      },
      async createUser(user) {
        const db = loadDb();
        const created: UserRecord = {
          id: user.id ?? `user_${randomBytes(6).toString("hex")}`,
          ...user,
          createdAt: new Date().toISOString()
        };
        db.users.push(created);
        saveDb(db);
        return created;
      },
      async createPasswordCredential(input) {
        const db = loadDb();
        const existing = db.passwordCredentials.find((entry) => entry.userId === input.userId);
        if (existing) {
          existing.passwordHash = input.passwordHash;
          existing.updatedAt = new Date().toISOString();
          saveDb(db);
          return;
        }

        db.passwordCredentials.push({
          ...input,
          createdAt: input.createdAt ?? new Date().toISOString(),
          updatedAt: input.updatedAt ?? new Date().toISOString()
        });
        saveDb(db);
      },
      async findPasswordCredentialByEmail(email) {
        const db = loadDb();
        const user = db.users.find((entry) => entry.email.toLowerCase() === email.toLowerCase());
        if (!user) {
          return undefined;
        }
        const credential = db.passwordCredentials.find((entry) => entry.userId === user.id);
        if (!credential) {
          return undefined;
        }
        return { user, passwordHash: credential.passwordHash };
      },
      async findUserByIdentity(provider, providerUserId) {
        const db = loadDb();
        const identity = db.authIdentities.find(
          (entry) => entry.provider === provider && entry.providerUserId === providerUserId
        );
        if (!identity) {
          return undefined;
        }
        return db.users.find((entry) => entry.id === identity.userId);
      },
      async upsertAuthIdentity(input) {
        const db = loadDb();
        const existing = db.authIdentities.find(
          (entry) =>
            entry.provider === input.provider && entry.providerUserId === input.providerUserId
        );
        if (existing) {
          existing.userId = input.userId;
          existing.email = input.email;
          existing.updatedAt = new Date().toISOString();
          saveDb(db);
          return;
        }

        db.authIdentities.push({
          id: `ident_${randomBytes(8).toString("hex")}`,
          userId: input.userId,
          provider: input.provider,
          providerUserId: input.providerUserId,
          email: input.email,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        saveDb(db);
      },
      async createLauncherSession(input) {
        const db = loadDb();
        const user = db.users.find((entry) => entry.id === input.userId);
        if (!user) {
          return;
        }

        if (input.source === "launcher" && input.expiresAt?.startsWith("dev-token:")) {
          user.launcherToken = input.expiresAt.slice("dev-token:".length);
        } else {
          user.launcherToken = `session:${sha256(input.tokenHash)}:${input.source}`;
        }
        saveDb(db);
      },
      async deleteLauncherSession(tokenHash) {
        const db = loadDb();
        const sessionToken = `session:${sha256(tokenHash)}:launcher-browser`;
        for (const user of db.users) {
          if (user.launcherToken === sessionToken) {
            delete user.launcherToken;
          }
        }
        saveDb(db);
      },
      async createWebSession(input) {
        const db = loadDb();
        db.webSessions.push({
          id: `web_${randomBytes(8).toString("hex")}`,
          userId: input.userId,
          tokenHash: input.tokenHash,
          source: input.source,
          expiresAt: input.expiresAt,
          createdAt: new Date().toISOString()
        });
        saveDb(db);
      },
      async findUserByWebSessionToken(token) {
        const db = loadDb();
        const session = db.webSessions.find((entry) => entry.tokenHash === sha256(token));
        if (!session) {
          return undefined;
        }
        return db.users.find((entry) => entry.id === session.userId);
      },
      async deleteWebSession(tokenHash) {
        const db = loadDb();
        db.webSessions = db.webSessions.filter((entry) => entry.tokenHash !== tokenHash);
        saveDb(db);
      },
      async createLauncherAuthRequest(input) {
        const db = loadDb();
        const created: LauncherAuthRequestRecord = {
          id: `authreq_${randomBytes(8).toString("hex")}`,
          requestTokenHash: input.requestTokenHash,
          userId: input.userId,
          source: input.source,
          expiresAt: input.expiresAt,
          createdAt: new Date().toISOString()
        };
        db.launcherAuthRequests.push(created);
        saveDb(db);
        return created;
      },
      async findLauncherAuthRequestByTokenHash(tokenHash) {
        const db = loadDb();
        return db.launcherAuthRequests.find((entry) => entry.requestTokenHash === tokenHash);
      },
      async resolveLauncherAuthRequest(tokenHash, userId) {
        const db = loadDb();
        const request = db.launcherAuthRequests.find((entry) => entry.requestTokenHash === tokenHash);
        if (!request) {
          return;
        }
        request.userId = userId;
        request.resolvedAt = new Date().toISOString();
        saveDb(db);
      }
    },
    payments: {
      async createPaymentHandoff(record) {
        const db = loadDb();
        const created: PaymentHandoffRecord = {
          ...record,
          id: `ph_${randomBytes(8).toString("hex")}`,
          createdAt: record.createdAt ?? new Date().toISOString()
        };
        db.handoffs.push(created);
        saveDb(db);
        return created;
      },
      async findPaymentHandoffByTokenHash(tokenHash: string) {
        const db = loadDb();
        return db.handoffs.find((entry) => entry.tokenHash === tokenHash);
      },
      async markPaymentHandoffUsed(id: string) {
        const db = loadDb();
        const handoff = db.handoffs.find((entry) => entry.id === id);
        if (!handoff) {
          return;
        }

        handoff.usedAt = new Date().toISOString();
        saveDb(db);
      },
      async createPayment(record) {
        const db = loadDb();
        const created: PaymentRecord = {
          id: record.id ?? `pay_${randomBytes(8).toString("hex")}`,
          ...record,
          updatedAt: new Date().toISOString()
        };
        db.payments.push(created);
        saveDb(db);
        return created;
      },
      async findPendingPaymentByUserAndProduct(userId: string, productId: string) {
        const db = loadDb();
        return db.payments.find(
          (entry) => entry.userId === userId && entry.productId === productId && entry.status !== "paid"
        );
      },
      async findPaymentById(paymentId: string) {
        const db = loadDb();
        return db.payments.find((entry) => entry.id === paymentId);
      },
      async markPaymentPaid(paymentId: string, patch) {
        const db = loadDb();
        const payment = db.payments.find((entry) => entry.id === paymentId);
        if (!payment) {
          return;
        }

        payment.status = "paid";
        payment.paidAt = new Date().toISOString();
        payment.updatedAt = new Date().toISOString();
        if (patch?.providerCheckoutId) {
          payment.providerCheckoutId = patch.providerCheckoutId;
        }
        if (patch?.providerSessionId) {
          payment.providerSessionId = patch.providerSessionId;
        }
        saveDb(db);
      }
    },
    entitlements: {
      async listEntitlementsForUser(userId: string) {
        const db = loadDb();
        return db.entitlements.filter((entry) => entry.userId === userId && entry.status !== "revoked");
      },
      async findEntitlement(userId: string, productId: string) {
        const db = loadDb();
        return db.entitlements.find(
          (entry) => entry.userId === userId && entry.productId === productId && entry.status !== "revoked"
        );
      },
      async upsertOwnedEntitlement(userId: string, productId: string) {
        const db = loadDb();
        const existing = db.entitlements.find((entry) => entry.userId === userId && entry.productId === productId);
        if (existing) {
          existing.status = "owned";
          existing.source = "purchase";
          existing.grantedAt = new Date().toISOString();
          existing.updatedAt = new Date().toISOString();
          saveDb(db);
          return existing;
        }

        const created: EntitlementRecord = {
          id: `ent_${randomBytes(6).toString("hex")}`,
          userId,
          productId,
          status: "owned",
          source: "purchase",
          grantedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.entitlements.push(created);
        saveDb(db);
        return created;
      }
    }
  };
}
