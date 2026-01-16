import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const USER_ROLES = ["super_admin", "admin", "support", "user"] as const;
export type UserRole = typeof USER_ROLES[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  fiatBalance: decimal("fiat_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  phptBalance: decimal("phpt_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  pin: text("pin"), // Deprecated - use pinHash instead
  pinHash: text("pin_hash"), // Hashed 6-digit PIN for transaction security
  pinUpdatedAt: timestamp("pin_updated_at"),
  pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until"),
  phoneNumber: text("phone_number"),
  kycStatus: text("kyc_status").notNull().default("unverified"),
  isActive: boolean("is_active").notNull().default(true),
  isAdmin: boolean("is_admin").notNull().default(false), // Deprecated - use role instead
  role: text("role").notNull().default("user"), // super_admin, admin, support, user
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: text("last_login_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userTutorials = pgTable("user_tutorials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  tutorialId: text("tutorial_id").notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id),
  receiverId: integer("receiver_id").references(() => users.id),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  category: text("category"),
  note: text("note"),
  walletType: text("wallet_type").notNull().default("fiat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paygramConnections = pgTable("paygram_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  paygramUserId: text("paygram_user_id").notNull(),
  apiToken: text("api_token").notNull(),
  isValid: boolean("is_valid").notNull().default(true),
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cryptoInvoices = pgTable("crypto_invoices", {
  id: serial("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().unique(),
  invoiceCode: text("invoice_code"),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 8 }).notNull(),
  currencyCode: integer("currency_code").notNull().default(11),
  status: text("status").notNull().default("pending"),
  payUrl: text("pay_url"),
  voucherCode: text("voucher_code"),
  paidAt: timestamp("paid_at"),
  creditedAt: timestamp("credited_at"),
  creditedTransactionId: integer("credited_transaction_id").references(() => transactions.id),
  paygramTxId: text("paygram_tx_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cryptoWithdrawals = pgTable("crypto_withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 8 }).notNull(),
  fee: decimal("fee", { precision: 15, scale: 8 }).notNull().default("0"),
  method: text("method").notNull(),
  currencyCode: integer("currency_code").notNull().default(11),
  status: text("status").notNull().default("pending"),
  paygramRequestId: text("paygram_request_id"),
  paygramTxId: text("paygram_tx_id"),
  voucherCode: text("voucher_code"),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Casino Links - Store verified 747Live user-to-agent mappings
export const CASINO_AGENTS = ["marcthepogi", "teammarc", "bossmarc747"] as const;
export type CasinoAgent = typeof CASINO_AGENTS[number];

export const casinoLinks = pgTable("casino_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  casinoUsername: text("casino_username").notNull(),
  casinoClientId: text("casino_client_id"), // 747Live clientId from hierarchy (e.g., "329777805")
  agentUsername: text("agent_username"), // The agent's username (e.g., "Marcthepogi")
  agentClientId: text("agent_client_id"), // The agent's clientId (e.g., "458663") - needed for withdrawals
  isAgent: boolean("is_agent").notNull().default(false),
  assignedAgent: text("assigned_agent").notNull(), // marcthepogi, teammarc, or bossmarc747
  hierarchySnapshot: text("hierarchy_snapshot"), // JSON string of hierarchy for debugging
  status: text("status").notNull().default("verified"), // pending, verified, revoked, demo
  lastVerifiedAt: timestamp("last_verified_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCasinoLinkSchema = createInsertSchema(casinoLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastVerifiedAt: true,
});

export type CasinoLink = typeof casinoLinks.$inferSelect;
export type InsertCasinoLink = z.infer<typeof insertCasinoLinkSchema>;

// Casino Transactions - Track buy/sell chip operations with state machine for rollback
export const CASINO_TX_STATUSES = [
  "initiated",           // Transaction started
  "escrow_debited",      // PHPT transferred to/from escrow (buy: user→admin, sell: admin→user pending)
  "casino_debited",      // Casino chips transferred
  "payout_pending",      // Waiting for PHPT payout (sell flow)
  "refund_pending",      // Refund in progress (buy flow rollback)
  "redeposit_pending",   // Re-depositing chips (sell flow rollback)
  "completed",           // Transaction completed successfully
  "failed",              // Transaction failed, manual intervention needed
  "manual_required",     // Requires admin manual resolution
] as const;
export type CasinoTxStatus = typeof CASINO_TX_STATUSES[number];

export const casinoTransactions = pgTable("casino_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // "buy" (deposit chips) or "sell" (withdraw chips)
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("initiated"),
  
  // External transaction IDs for reconciliation
  transactionId: text("transaction_id").notNull().unique(), // Our internal ID (DEP123xxx or WD123xxx)
  escrowTxId: text("escrow_tx_id"), // PayGram transaction ID for PHPT transfer
  casinoNonce: text("casino_nonce"), // 747Live nonce for idempotency
  casinoResponseId: text("casino_response_id"), // 747Live response ID if available
  
  // Rollback tracking
  rollbackAttempts: integer("rollback_attempts").notNull().default(0),
  rollbackTxId: text("rollback_tx_id"), // Transaction ID of refund/redeposit
  lastRollbackAt: timestamp("last_rollback_at"),
  
  // Retry mechanism
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  nextRetryAt: timestamp("next_retry_at"),
  
  // Error tracking
  failureReason: text("failure_reason"),
  failureStep: text("failure_step"), // Which step failed: escrow_transfer, casino_credit, payout, refund, redeposit
  
  // Admin resolution
  adminAlertSent: boolean("admin_alert_sent").notNull().default(false),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCasinoTransactionSchema = createInsertSchema(casinoTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CasinoTransaction = typeof casinoTransactions.$inferSelect;
export type InsertCasinoTransaction = z.infer<typeof insertCasinoTransactionSchema>;

export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  username: z.string().min(3),
}).omit({
  id: true,
  balance: true,
  fiatBalance: true,
  phptBalance: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const transferSchema = z.object({
  receiverId: z.number(),
  amount: z.string()
    .refine((val) => /^\d+(\.\d+)?$/.test(val.trim()), {
      message: "Amount must be a valid number",
    })
    .refine((val) => {
      const num = parseFloat(val.trim());
      return !isNaN(num) && isFinite(num) && num > 0;
    }, {
      message: "Amount must be a positive number",
    }),
  note: z.string().optional(),
  pin: z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits").optional(),
});

export const LARGE_TRANSFER_THRESHOLD = 5000;

export const connectTelegramTokenSchema = z.object({
  telegramToken: z.string().min(10, "Telegram PayGram token is required"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type UserTutorial = typeof userTutorials.$inferSelect;
export type PaygramConnection = typeof paygramConnections.$inferSelect;
export type ConnectTelegramTokenInput = z.infer<typeof connectTelegramTokenSchema>;
export type CryptoInvoice = typeof cryptoInvoices.$inferSelect;
export type CryptoWithdrawal = typeof cryptoWithdrawals.$inferSelect;

export const withdrawalSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  method: z.enum(["transfer", "voucher"]),
  currencyCode: z.number().optional().default(11),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  details: text("details"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  sessionId: text("session_id"),
  requestMethod: text("request_method"),
  requestPath: text("request_path"),
  riskLevel: text("risk_level").default("low"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const balanceAdjustments = pgTable("balance_adjustments", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => users.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  adjustmentType: text("adjustment_type").notNull(),
  reason: text("reason").notNull(),
  previousBalance: decimal("previous_balance", { precision: 15, scale: 2 }).notNull(),
  newBalance: decimal("new_balance", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertBalanceAdjustmentSchema = createInsertSchema(balanceAdjustments).omit({
  id: true,
  createdAt: true,
});

export const balanceAdjustmentInputSchema = z.object({
  userId: z.number(),
  amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) !== 0, {
    message: "Amount must be a non-zero number",
  }),
  adjustmentType: z.enum(["credit", "debit", "correction", "refund", "fee"]),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type BalanceAdjustment = typeof balanceAdjustments.$inferSelect;
export type InsertBalanceAdjustment = z.infer<typeof insertBalanceAdjustmentSchema>;
export type BalanceAdjustmentInput = z.infer<typeof balanceAdjustmentInputSchema>;

// Manual P2P Deposit - Payment Methods managed by admin
export const manualPaymentMethods = pgTable("manual_payment_methods", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  providerType: text("provider_type").notNull(),
  instructions: text("instructions"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Manual P2P Deposit - User deposit requests
export const manualDepositRequests = pgTable("manual_deposit_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  paymentMethodId: integer("payment_method_id").references(() => manualPaymentMethods.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  proofImageUrl: text("proof_image_url"),
  userNote: text("user_note"),
  adminId: integer("admin_id").references(() => users.id),
  adminNote: text("admin_note"),
  rejectionReason: text("rejection_reason"),
  paygramTxId: text("paygram_tx_id"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertManualPaymentMethodSchema = createInsertSchema(manualPaymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertManualDepositRequestSchema = createInsertSchema(manualDepositRequests).omit({
  id: true,
  status: true,
  adminId: true,
  adminNote: true,
  rejectionReason: true,
  paygramTxId: true,
  processedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const manualDepositSubmitSchema = z.object({
  paymentMethodId: z.number().positive(),
  amount: z.number().positive("Amount must be positive"),
  userNote: z.string().optional(),
});

export const manualDepositApproveSchema = z.object({
  adminNote: z.string().optional(),
});

export const manualDepositRejectSchema = z.object({
  rejectionReason: z.string().min(5, "Rejection reason must be at least 5 characters"),
});

export type ManualPaymentMethod = typeof manualPaymentMethods.$inferSelect;
export type InsertManualPaymentMethod = z.infer<typeof insertManualPaymentMethodSchema>;
export type ManualDepositRequest = typeof manualDepositRequests.$inferSelect;
export type InsertManualDepositRequest = z.infer<typeof insertManualDepositRequestSchema>;
export type ManualDepositSubmitInput = z.infer<typeof manualDepositSubmitSchema>;
export type ManualDepositApproveInput = z.infer<typeof manualDepositApproveSchema>;
export type ManualDepositRejectInput = z.infer<typeof manualDepositRejectSchema>;

// OTP (One-Time Password) for email verification
export const emailOtps = pgTable("email_otps", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  otp: text("otp").notNull(),
  purpose: text("purpose").notNull().default("verification"), // verification, login, password_reset, transaction
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailOtpSchema = createInsertSchema(emailOtps).omit({
  id: true,
  verified: true,
  attempts: true,
  createdAt: true,
});

export type EmailOtp = typeof emailOtps.$inferSelect;
export type InsertEmailOtp = z.infer<typeof insertEmailOtpSchema>;

// KYC Documents for identity verification
export const kycDocuments = pgTable("kyc_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  documentType: text("document_type").notNull(), // government_id, selfie, proof_of_address
  documentUrl: text("document_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertKycDocumentSchema = createInsertSchema(kycDocuments).omit({
  id: true,
  status: true,
  adminNote: true,
  createdAt: true,
  updatedAt: true,
});

export type KycDocument = typeof kycDocuments.$inferSelect;
export type InsertKycDocument = z.infer<typeof insertKycDocumentSchema>;

// User Devices for login tracking and new device alerts
export const userDevices = pgTable("user_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  deviceFingerprint: text("device_fingerprint").notNull(),
  deviceName: text("device_name"), // e.g., "Chrome on Windows"
  ipAddress: text("ip_address"),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  isTrusted: boolean("is_trusted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserDeviceSchema = createInsertSchema(userDevices).omit({
  id: true,
  lastUsedAt: true,
  isTrusted: true,
  createdAt: true,
});

export type UserDevice = typeof userDevices.$inferSelect;
export type InsertUserDevice = z.infer<typeof insertUserDeviceSchema>;

// PIN and security validation schemas
export const setPinSchema = z.object({
  pin: z.string().length(6, "PIN must be exactly 6 digits").regex(/^\d{6}$/, "PIN must contain only numbers"),
  confirmPin: z.string().length(6, "PIN confirmation must be exactly 6 digits"),
}).refine((data) => data.pin === data.confirmPin, {
  message: "PINs do not match",
  path: ["confirmPin"],
});

export const verifyPinSchema = z.object({
  pin: z.string().length(6, "PIN must be exactly 6 digits").regex(/^\d{6}$/, "PIN must contain only numbers"),
});

export const changePinSchema = z.object({
  currentPin: z.string().length(6, "Current PIN must be exactly 6 digits").regex(/^\d{6}$/, "PIN must contain only numbers"),
  newPin: z.string().length(6, "New PIN must be exactly 6 digits").regex(/^\d{6}$/, "PIN must contain only numbers"),
  confirmNewPin: z.string().length(6, "Confirm PIN must be exactly 6 digits").regex(/^\d{6}$/, "PIN must contain only numbers"),
  otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must contain only numbers"),
}).refine((data) => data.newPin === data.confirmNewPin, {
  message: "New PINs do not match",
  path: ["confirmNewPin"],
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const passwordResetConfirmSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type SetPinInput = z.infer<typeof setPinSchema>;
export type VerifyPinInput = z.infer<typeof verifyPinSchema>;
export type ChangePinInput = z.infer<typeof changePinSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
