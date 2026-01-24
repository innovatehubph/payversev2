import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export from constants for backward compatibility
export { USER_ROLES, CASINO_AGENTS, CASINO_TX_STATUSES, LIMITS } from "./constants";
export type { UserRole, CasinoAgent, CasinoTxStatus } from "./constants";

// Import for internal use
import { LIMITS } from "./constants";

/**
 * Users table
 *
 * BALANCE SYSTEM - PHPT IS THE SINGLE SOURCE OF TRUTH:
 * - phptBalance: THE authoritative balance field (PHPT tokens)
 * - balance: Mirror of phptBalance (kept in sync for compatibility)
 * - fiatBalance: DEPRECATED - not used in transaction flows
 *
 * IMPORTANT:
 * - Use balanceService (server/balance-service.ts) for ALL balance operations
 * - balanceService ensures transaction records are created for audit trail
 * - balance and phptBalance should ALWAYS be equal
 * - Casino balance is display-only (player wallet connection, no transaction impact)
 *
 * DEPRECATED FIELDS (do not use in new code):
 * - pin: Use pinHash instead (plain text PIN is insecure)
 * - isAdmin: Use role field instead (supports more granular permissions)
 * - fiatBalance: Not used - PHPT is the only balance that matters
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  accountNumber: text("account_number").unique(), // Unique account number (e.g., PV-1000001)
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),

  // Balance fields - PHPT is single source of truth
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0.00"), // Mirror of phptBalance
  /** @deprecated Not used in transaction flows - PHPT is the only balance */
  fiatBalance: decimal("fiat_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  phptBalance: decimal("phpt_balance", { precision: 15, scale: 2 }).notNull().default("0.00"), // Single source of truth

  // PIN security - use pinHash, not pin
  /** @deprecated Use pinHash instead - this field should not be used */
  pin: text("pin"),
  pinHash: text("pin_hash"), // Hashed 6-digit PIN for transaction security
  pinUpdatedAt: timestamp("pin_updated_at"),
  pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until"),

  phoneNumber: text("phone_number"),
  emailVerified: boolean("email_verified").notNull().default(false), // Email verification status
  kycStatus: text("kyc_status").notNull().default("unverified"),
  isActive: boolean("is_active").notNull().default(true),

  // Role-based access - use role, not isAdmin
  /** @deprecated Use role field instead - kept for backward compatibility */
  isAdmin: boolean("is_admin").notNull().default(false),
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
  referenceNumber: text("reference_number").unique(), // Unique reference number for tracking (e.g., PV-TXN-20240124-ABC123)
  senderId: integer("sender_id").references(() => users.id),
  receiverId: integer("receiver_id").references(() => users.id),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  category: text("category"),
  note: text("note"),
  walletType: text("wallet_type").notNull().default("fiat"),
  externalTxId: text("external_tx_id"), // External transaction ID (e.g., PayGram tx ID)
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
// Note: CASINO_AGENTS is imported from constants.ts

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
// Note: CASINO_TX_STATUSES is imported from constants.ts which includes full state machine documentation

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
}).extend({
  // PIN is optional for internal user creation (e.g., seed), but validated when provided
  pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be 6 digits").optional(),
});

// Schema for user registration - PIN is required
export const registerUserSchema = insertUserSchema.extend({
  pin: z.string().length(6).regex(/^\d{6}$/, "PIN must be 6 digits"),
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

// Re-exported from constants for backward compatibility
export const LARGE_TRANSFER_THRESHOLD = LIMITS.LARGE_TRANSFER_THRESHOLD;

export const connectTelegramTokenSchema = z.object({
  telegramToken: z.string().min(10, "Telegram PayGram token is required"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;
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

// ============================================================================
// SYSTEM SETTINGS (Super Admin Only)
// ============================================================================

/**
 * System Settings table
 *
 * Stores sensitive configuration like API keys, credentials, and system settings.
 * Only accessible by super_admin role.
 *
 * Settings are stored as key-value pairs with optional encryption flag.
 * Categories help organize settings (api_keys, casino, paygram, system, etc.)
 */
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., "PAYGRAM_API_TOKEN", "CASINO_747_API_KEY"
  value: text("value").notNull(), // The actual value (may be encrypted)
  category: text("category").notNull().default("general"), // api_keys, casino, paygram, escrow, system
  description: text("description"), // Human-readable description
  isEncrypted: boolean("is_encrypted").notNull().default(false), // Whether value is encrypted
  isActive: boolean("is_active").notNull().default(true), // Can disable without deleting
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSystemSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// ============================================================================
// ESCROW CONFIGURATION
// ============================================================================

/**
 * Escrow Accounts Configuration
 *
 * The super admin acts as the escrow for all transactions.
 * This table tracks the casino agent accounts that are managed by the escrow.
 */
export const escrowAgents = pgTable("escrow_agents", {
  id: serial("id").primaryKey(),
  agentUsername: text("agent_username").notNull().unique(), // marcthepogi, teammarc, bossmarc747
  agentType: text("agent_type").notNull().default("casino"), // casino, payment, etc.
  isActive: boolean("is_active").notNull().default(true),
  dailyLimit: decimal("daily_limit", { precision: 15, scale: 2 }), // Optional daily transaction limit
  totalProcessed: decimal("total_processed", { precision: 15, scale: 2 }).notNull().default("0.00"),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EscrowAgent = typeof escrowAgents.$inferSelect;
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

// Change password schema for logged-in users
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters"),
  otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must contain only numbers"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type SetPinInput = z.infer<typeof setPinSchema>;
export type VerifyPinInput = z.infer<typeof verifyPinSchema>;
export type ChangePinInput = z.infer<typeof changePinSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// User Bank/E-Wallet Accounts for manual withdrawals
export const userBankAccounts = pgTable("user_bank_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  accountType: text("account_type").notNull(), // "gcash", "maya", "bank", "grabpay"
  bankName: text("bank_name"), // For bank type: "BDO", "BPI", "Metrobank", etc.
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(), // Account holder name
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserBankAccountSchema = createInsertSchema(userBankAccounts).pick({
  accountType: true,
  bankName: true,
  accountNumber: true,
  accountName: true,
});

export type UserBankAccount = typeof userBankAccounts.$inferSelect;
export type InsertUserBankAccount = z.infer<typeof insertUserBankAccountSchema>;

// Manual Withdrawal Requests
export const manualWithdrawalRequests = pgTable("manual_withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  userBankAccountId: integer("user_bank_account_id").references(() => userBankAccounts.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").default("pending").notNull(), // pending, processing, completed, rejected
  adminId: integer("admin_id").references(() => users.id),
  adminNote: text("admin_note"),
  rejectionReason: text("rejection_reason"),
  phptTxId: text("phpt_tx_id"), // PayGram transaction ID for PHPT debit
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertManualWithdrawalSchema = createInsertSchema(manualWithdrawalRequests).pick({
  userBankAccountId: true,
  amount: true,
});

export const processWithdrawalSchema = z.object({
  adminNote: z.string().optional(),
});

export const rejectWithdrawalSchema = z.object({
  rejectionReason: z.string().min(5, "Rejection reason must be at least 5 characters"),
});

export type ManualWithdrawalRequest = typeof manualWithdrawalRequests.$inferSelect;
export type InsertManualWithdrawal = z.infer<typeof insertManualWithdrawalSchema>;
export type ProcessWithdrawalInput = z.infer<typeof processWithdrawalSchema>;
export type RejectWithdrawalInput = z.infer<typeof rejectWithdrawalSchema>;

// ============================================================================
// AI CHAT SYSTEM
// ============================================================================

/**
 * AI Chat Conversations
 * Stores chat sessions for users and guests
 */
export const aiChatConversations = pgTable("ai_chat_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id), // null for public/guest
  sessionId: text("session_id").notNull().unique(),
  title: text("title"),
  status: text("status").notNull().default("active"), // active, archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * AI Chat Messages
 * Individual messages in a conversation
 */
export const aiChatMessages = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => aiChatConversations.id).notNull(),
  role: text("role").notNull(), // user, assistant, system
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"), // text, markdown, html, image
  modelUsed: text("model_used"), // which AI model was used
  functionCalls: text("function_calls"), // JSON array of function calls
  attachments: text("attachments"), // JSON array of attachment URLs
  tokenCount: integer("token_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * AI Chat Attachments
 * File uploads in AI chat
 */
export const aiChatAttachments = pgTable("ai_chat_attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => aiChatMessages.id),
  conversationId: integer("conversation_id").references(() => aiChatConversations.id).notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileUrl: text("file_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * AI Function Call Logs
 * Audit trail for AI function executions
 */
export const aiFunctionCallLogs = pgTable("ai_function_call_logs", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => aiChatMessages.id),
  userId: integer("user_id").references(() => users.id),
  functionName: text("function_name").notNull(),
  functionArgs: text("function_args").notNull(), // JSON string
  result: text("result"), // JSON string
  status: text("status").notNull().default("pending"), // pending, success, error, blocked
  blockedReason: text("blocked_reason"),
  executionTimeMs: integer("execution_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertAiChatConversationSchema = createInsertSchema(aiChatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiChatMessageSchema = createInsertSchema(aiChatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertAiChatAttachmentSchema = createInsertSchema(aiChatAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertAiFunctionCallLogSchema = createInsertSchema(aiFunctionCallLogs).omit({
  id: true,
  createdAt: true,
});

// Types
export type AiChatConversation = typeof aiChatConversations.$inferSelect;
export type InsertAiChatConversation = z.infer<typeof insertAiChatConversationSchema>;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;
export type AiChatAttachment = typeof aiChatAttachments.$inferSelect;
export type InsertAiChatAttachment = z.infer<typeof insertAiChatAttachmentSchema>;
export type AiFunctionCallLog = typeof aiFunctionCallLogs.$inferSelect;
export type InsertAiFunctionCallLog = z.infer<typeof insertAiFunctionCallLogSchema>;

// ============================================
// AI FAQ Learning System Tables
// ============================================

// AI FAQs - Curated frequently asked questions learned from interactions
export const aiFaqs = pgTable("ai_faqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(), // The question pattern
  questionVariants: text("question_variants"), // JSON array of alternative phrasings
  answer: text("answer").notNull(), // The curated answer
  category: text("category").notNull().default("general"), // general, kyc, transactions, security, casino, etc.
  keywords: text("keywords"), // JSON array of keywords for matching
  priority: integer("priority").notNull().default(0), // Higher = shown first
  hitCount: integer("hit_count").notNull().default(0), // How many times this FAQ matched
  isActive: boolean("is_active").notNull().default(true),
  isApproved: boolean("is_approved").notNull().default(false), // Admin approval required
  approvedBy: integer("approved_by").references(() => users.id),
  createdFromMessageId: integer("created_from_message_id").references(() => aiChatMessages.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Interaction Feedback - User ratings on AI responses
export const aiInteractionFeedback = pgTable("ai_interaction_feedback", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => aiChatMessages.id).notNull(),
  conversationId: integer("conversation_id").references(() => aiChatConversations.id).notNull(),
  userId: integer("user_id").references(() => users.id), // null for guests
  rating: text("rating").notNull(), // "helpful", "not_helpful", "incorrect"
  feedbackText: text("feedback_text"), // Optional user comment
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Learned Patterns - Automatically extracted Q&A patterns from successful interactions
export const aiLearnedPatterns = pgTable("ai_learned_patterns", {
  id: serial("id").primaryKey(),
  questionPattern: text("question_pattern").notNull(), // Normalized question
  answerPattern: text("answer_pattern").notNull(), // Successful answer
  category: text("category"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"), // 0-100
  occurrenceCount: integer("occurrence_count").notNull().default(1), // How many times this pattern appeared
  positiveRatings: integer("positive_ratings").notNull().default(0),
  negativeRatings: integer("negative_ratings").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  promotedToFaqId: integer("promoted_to_faq_id").references(() => aiFaqs.id),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Training Suggestions - Admin queue for reviewing learned patterns
export const aiTrainingSuggestions = pgTable("ai_training_suggestions", {
  id: serial("id").primaryKey(),
  learnedPatternId: integer("learned_pattern_id").references(() => aiLearnedPatterns.id),
  originalQuestion: text("original_question").notNull(),
  originalAnswer: text("original_answer").notNull(),
  suggestedCategory: text("suggested_category"),
  reason: text("reason"), // Why this was suggested (high ratings, frequent, etc.)
  status: text("status").notNull().default("pending"), // pending, approved, rejected, merged
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for FAQ tables
export const insertAiFaqSchema = createInsertSchema(aiFaqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiInteractionFeedbackSchema = createInsertSchema(aiInteractionFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertAiLearnedPatternSchema = createInsertSchema(aiLearnedPatterns).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});

export const insertAiTrainingSuggestionSchema = createInsertSchema(aiTrainingSuggestions).omit({
  id: true,
  createdAt: true,
});

// Types for FAQ tables
export type AiFaq = typeof aiFaqs.$inferSelect;
export type InsertAiFaq = z.infer<typeof insertAiFaqSchema>;
export type AiInteractionFeedback = typeof aiInteractionFeedback.$inferSelect;
export type InsertAiInteractionFeedback = z.infer<typeof insertAiInteractionFeedbackSchema>;
export type AiLearnedPattern = typeof aiLearnedPatterns.$inferSelect;
export type InsertAiLearnedPattern = z.infer<typeof insertAiLearnedPatternSchema>;
export type AiTrainingSuggestion = typeof aiTrainingSuggestions.$inferSelect;
export type InsertAiTrainingSuggestion = z.infer<typeof insertAiTrainingSuggestionSchema>;

// Chat request/response schemas
export const aiChatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().optional(),
  modelPreference: z.enum(["auto", "fast", "reasoning", "code"]).optional().default("auto"),
  attachments: z.array(z.object({
    fileName: z.string(),
    fileType: z.string(),
    fileUrl: z.string(),
  })).optional(),
});

export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
