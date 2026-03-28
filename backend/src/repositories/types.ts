export type EntitlementStatus = "free" | "owned" | "trial" | "not_owned" | "unknown";

export interface UserRecord {
  id: string;
  email: string;
  displayName?: string;
  launcherToken?: string;
  createdAt?: string;
}

export interface CreateUserInput {
  id?: string;
  email: string;
  displayName?: string;
}

export interface PasswordCredentialRecord {
  userId: string;
  passwordHash: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  source: string;
  expiresAt?: string;
  createdAt?: string;
  lastUsedAt?: string;
}

export interface LauncherAuthRequestRecord {
  id: string;
  requestTokenHash: string;
  userId?: string;
  source: string;
  expiresAt: string;
  resolvedAt?: string;
  createdAt?: string;
}

export interface PasswordResetRequestRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt?: string;
}

export interface PaymentHandoffRecord {
  id: string;
  tokenHash: string;
  userId: string;
  productId: string;
  source: string;
  expiresAt: string;
  usedAt?: string;
  createdAt?: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  productId: string;
  provider: string;
  status: "pending" | "paid" | "failed" | "canceled" | "refunded";
  providerCheckoutId?: string;
  providerSessionId?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreatePaymentInput {
  id?: string;
  userId: string;
  productId: string;
  provider: string;
  status: PaymentRecord["status"];
  providerCheckoutId?: string;
  providerSessionId?: string;
  paidAt?: string;
  createdAt: string;
}

export interface EntitlementRecord {
  id: string;
  userId: string;
  productId: string;
  status: "owned" | "trial" | "revoked";
  source: "purchase" | "grant" | "admin";
  grantedAt: string;
  expiresAt?: string;
  updatedAt?: string;
}

export interface AuthRepository {
  findUserByLauncherToken(token: string): Promise<UserRecord | undefined>;
  findUserById(userId: string): Promise<UserRecord | undefined>;
  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  createUser(user: CreateUserInput): Promise<UserRecord>;
  createPasswordCredential(input: PasswordCredentialRecord): Promise<void>;
  findPasswordCredentialByEmail(
    email: string
  ): Promise<{ user: UserRecord; passwordHash: string } | undefined>;
  updatePasswordCredential(input: PasswordCredentialRecord): Promise<void>;
  findUserByIdentity(
    provider: string,
    providerUserId: string
  ): Promise<UserRecord | undefined>;
  upsertAuthIdentity(input: {
    userId: string;
    provider: string;
    providerUserId: string;
    email?: string;
  }): Promise<void>;
  createLauncherSession(input: {
    userId: string;
    tokenHash: string;
    source: string;
    expiresAt?: string;
  }): Promise<void>;
  deleteLauncherSession(tokenHash: string): Promise<void>;
  createWebSession(input: {
    userId: string;
    tokenHash: string;
    source: string;
    expiresAt?: string;
  }): Promise<void>;
  findUserByWebSessionToken(token: string): Promise<UserRecord | undefined>;
  deleteWebSession(tokenHash: string): Promise<void>;
  createLauncherAuthRequest(input: {
    requestTokenHash: string;
    source: string;
    expiresAt: string;
    userId?: string;
  }): Promise<LauncherAuthRequestRecord>;
  findLauncherAuthRequestByTokenHash(
    tokenHash: string
  ): Promise<LauncherAuthRequestRecord | undefined>;
  resolveLauncherAuthRequest(tokenHash: string, userId: string): Promise<void>;
  createPasswordResetRequest(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<PasswordResetRequestRecord>;
  findPasswordResetRequestByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetRequestRecord | undefined>;
  markPasswordResetRequestUsed(id: string): Promise<void>;
}

export interface PaymentRepository {
  createPaymentHandoff(record: Omit<PaymentHandoffRecord, "id">): Promise<PaymentHandoffRecord>;
  findPaymentHandoffByTokenHash(tokenHash: string): Promise<PaymentHandoffRecord | undefined>;
  markPaymentHandoffUsed(id: string): Promise<void>;
  createPayment(record: CreatePaymentInput): Promise<PaymentRecord>;
  findPendingPaymentByUserAndProduct(
    userId: string,
    productId: string
  ): Promise<PaymentRecord | undefined>;
  findPaymentById(paymentId: string): Promise<PaymentRecord | undefined>;
  markPaymentPaid(
    paymentId: string,
    patch?: { providerSessionId?: string; providerCheckoutId?: string }
  ): Promise<void>;
}

export interface EntitlementRepository {
  listEntitlementsForUser(userId: string): Promise<EntitlementRecord[]>;
  findEntitlement(userId: string, productId: string): Promise<EntitlementRecord | undefined>;
  upsertOwnedEntitlement(userId: string, productId: string): Promise<EntitlementRecord>;
}

export interface BackendRepositories {
  auth: AuthRepository;
  payments: PaymentRepository;
  entitlements: EntitlementRepository;
}
