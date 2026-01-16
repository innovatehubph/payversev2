/**
 * Payverse Constants
 *
 * Centralized constants for transaction types, statuses, roles, and other enums.
 * This file serves as the single source of truth for all constant values.
 */

// ============================================================================
// USER ROLES
// ============================================================================

export const USER_ROLES = ["super_admin", "admin", "support", "user"] as const;
export type UserRole = typeof USER_ROLES[number];

/**
 * Check if a role has admin privileges
 */
export function isAdminRole(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * All transaction types used in Payverse
 *
 * Categories:
 * - transfer: User-to-user transfers
 * - topup/deposit: Adding funds to wallet
 * - withdrawal/cashout: Removing funds from wallet
 * - crypto: Crypto-related transactions
 * - qrph: QRPH payment transactions
 * - casino: Casino chip transactions
 */
export const TRANSACTION_TYPES = {
  // User-to-user
  TRANSFER: "transfer",

  // Deposits/Top-ups
  TOPUP: "topup",
  DEPOSIT: "deposit",
  MANUAL_DEPOSIT: "manual_deposit",
  CRYPTO_TOPUP: "crypto_topup",

  // QRPH transactions
  QRPH_CASHIN: "qrph_cashin",
  QRPH_CREDIT: "qrph_credit",
  QRPH_PAYOUT: "qrph_payout",
  QRPH_PAYOUT_FAILED: "qrph_payout_failed",

  // Crypto transactions
  CRYPTO_SEND: "crypto_send",
  CRYPTO_CASHOUT: "crypto_cashout",

  // Casino transactions
  CASINO_DEPOSIT: "casino_deposit",
  CASINO_WITHDRAW: "casino_withdraw",
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

/**
 * Map transaction types to display labels
 */
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  [TRANSACTION_TYPES.TRANSFER]: "Transfer",
  [TRANSACTION_TYPES.TOPUP]: "Top-up",
  [TRANSACTION_TYPES.DEPOSIT]: "Deposit",
  [TRANSACTION_TYPES.MANUAL_DEPOSIT]: "Manual Deposit",
  [TRANSACTION_TYPES.CRYPTO_TOPUP]: "Crypto Top-up",
  [TRANSACTION_TYPES.QRPH_CASHIN]: "QRPH Cash In",
  [TRANSACTION_TYPES.QRPH_CREDIT]: "QRPH Credit",
  [TRANSACTION_TYPES.QRPH_PAYOUT]: "QRPH Payout",
  [TRANSACTION_TYPES.QRPH_PAYOUT_FAILED]: "QRPH Payout Failed",
  [TRANSACTION_TYPES.CRYPTO_SEND]: "Crypto Send",
  [TRANSACTION_TYPES.CRYPTO_CASHOUT]: "Crypto Cash Out",
  [TRANSACTION_TYPES.CASINO_DEPOSIT]: "Casino Deposit",
  [TRANSACTION_TYPES.CASINO_WITHDRAW]: "Casino Withdrawal",
};

// ============================================================================
// TRANSACTION STATUSES
// ============================================================================

export const TRANSACTION_STATUSES = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export type TransactionStatus = typeof TRANSACTION_STATUSES[keyof typeof TRANSACTION_STATUSES];

// ============================================================================
// KYC STATUSES
// ============================================================================

export const KYC_STATUSES = {
  UNVERIFIED: "unverified",
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
} as const;

export type KycStatus = typeof KYC_STATUSES[keyof typeof KYC_STATUSES];

// ============================================================================
// WALLET TYPES
// ============================================================================

export const WALLET_TYPES = {
  FIAT: "fiat",
  PHPT: "phpt",
  CRYPTO: "crypto",
} as const;

export type WalletType = typeof WALLET_TYPES[keyof typeof WALLET_TYPES];

// ============================================================================
// CASINO TRANSACTION STATUSES
// ============================================================================

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

/**
 * Casino transaction state machine documentation
 *
 * BUY FLOW (User buys casino chips with PHPT):
 * 1. initiated → User initiates chip purchase
 * 2. escrow_debited → PHPT deducted from user, sent to admin escrow
 * 3. casino_debited → Chips credited to user's casino account
 * 4. completed → Transaction successful
 *
 * BUY FLOW ROLLBACK:
 * - If casino credit fails after escrow_debited:
 *   escrow_debited → refund_pending → completed (PHPT returned to user)
 *
 * SELL FLOW (User sells casino chips for PHPT):
 * 1. initiated → User initiates chip sale
 * 2. casino_debited → Chips deducted from user's casino account
 * 3. payout_pending → Awaiting PHPT transfer to user
 * 4. escrow_debited → PHPT transferred from admin to user
 * 5. completed → Transaction successful
 *
 * SELL FLOW ROLLBACK:
 * - If PHPT payout fails after casino_debited:
 *   casino_debited → redeposit_pending → completed (chips returned to user)
 */
export const CASINO_STATE_TRANSITIONS: Record<string, CasinoTxStatus[]> = {
  // Buy flow
  "buy:initiated": ["escrow_debited", "failed"],
  "buy:escrow_debited": ["casino_debited", "refund_pending", "failed"],
  "buy:casino_debited": ["completed"],
  "buy:refund_pending": ["completed", "manual_required"],

  // Sell flow
  "sell:initiated": ["casino_debited", "failed"],
  "sell:casino_debited": ["payout_pending", "redeposit_pending", "failed"],
  "sell:payout_pending": ["escrow_debited", "redeposit_pending", "manual_required"],
  "sell:escrow_debited": ["completed"],
  "sell:redeposit_pending": ["completed", "manual_required"],

  // Terminal states
  "completed": [],
  "failed": ["manual_required"],
  "manual_required": ["completed", "failed"],
};

// ============================================================================
// BALANCE ADJUSTMENT TYPES
// ============================================================================

export const ADJUSTMENT_TYPES = {
  CREDIT: "credit",
  DEBIT: "debit",
  CORRECTION: "correction",
  REFUND: "refund",
  FEE: "fee",
} as const;

export type AdjustmentType = typeof ADJUSTMENT_TYPES[keyof typeof ADJUSTMENT_TYPES];

// ============================================================================
// OTP PURPOSES
// ============================================================================

export const OTP_PURPOSES = {
  VERIFICATION: "verification",
  LOGIN: "login",
  PASSWORD_RESET: "password_reset",
  PIN_CHANGE: "pin_change",
  TRANSACTION: "transaction",
} as const;

export type OtpPurpose = typeof OTP_PURPOSES[keyof typeof OTP_PURPOSES];

// ============================================================================
// CASINO AGENTS
// ============================================================================

export const CASINO_AGENTS = ["marcthepogi", "teammarc", "bossmarc747"] as const;
export type CasinoAgent = typeof CASINO_AGENTS[number];

// ============================================================================
// THRESHOLDS & LIMITS
// ============================================================================

export const LIMITS = {
  LARGE_TRANSFER_THRESHOLD: 5000,
  MIN_TRANSFER_AMOUNT: 1,
  MAX_PIN_ATTEMPTS: 5,
  PIN_LOCKOUT_MINUTES: 30,
  OTP_EXPIRY_MINUTES: 10,
  OTP_MAX_ATTEMPTS: 5,
  MIN_TOPUP_AMOUNT: 100,
  MIN_WITHDRAWAL_AMOUNT: 100,
} as const;

// ============================================================================
// API ERROR CODES
// ============================================================================

export const ERROR_CODES = {
  // Authentication
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Authorization
  FORBIDDEN: "FORBIDDEN",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",

  // Balance
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  BALANCE_SYNC_ERROR: "BALANCE_SYNC_ERROR",

  // PIN
  INVALID_PIN: "INVALID_PIN",
  PIN_REQUIRED: "PIN_REQUIRED",
  PIN_LOCKED: "PIN_LOCKED",
  PIN_NOT_SET: "PIN_NOT_SET",

  // OTP
  INVALID_OTP: "INVALID_OTP",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_MAX_ATTEMPTS: "OTP_MAX_ATTEMPTS",

  // Transaction
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  TRANSACTION_NOT_FOUND: "TRANSACTION_NOT_FOUND",
  DUPLICATE_TRANSACTION: "DUPLICATE_TRANSACTION",

  // External Services
  PAYGRAM_ERROR: "PAYGRAM_ERROR",
  CASINO_API_ERROR: "CASINO_API_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",

  // General
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================================================
// CURRENCY CODES (PayGram)
// ============================================================================

export const CURRENCY_CODES = {
  PHPT: 11,
  USDT: 1,
  BTC: 2,
  ETH: 3,
} as const;

export type CurrencyCode = typeof CURRENCY_CODES[keyof typeof CURRENCY_CODES];
