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
  createLauncherSession(input: {
    userId: string;
    tokenHash: string;
    source: string;
    expiresAt?: string;
  }): Promise<void>;
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
