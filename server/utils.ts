/**
 * Payverse Server Utilities
 *
 * Centralized utility functions to eliminate code duplication.
 */

import type { User } from "@shared/schema";
import { ERROR_CODES, type ErrorCode } from "@shared/constants";
import bcrypt from "bcrypt";

// ============================================================================
// USER SANITIZATION
// ============================================================================

/**
 * Remove sensitive fields from user object before sending to client
 */
export function sanitizeUser<T extends Partial<User>>(user: T): Omit<T, "password" | "pin" | "pinHash"> {
  const { password, pin, pinHash, ...safeUser } = user as any;
  return safeUser;
}

/**
 * Remove sensitive fields from array of users
 */
export function sanitizeUsers<T extends Partial<User>>(users: T[]): Omit<T, "password" | "pin" | "pinHash">[] {
  return users.map(sanitizeUser);
}

// ============================================================================
// REQUEST ID GENERATION
// ============================================================================

/**
 * Generate a unique request ID for PayGram API calls
 * Uses negative integers as required by PayGram API
 */
export function generateRequestId(): number {
  return -Math.floor(Math.random() * 9000000000) - 1000000000;
}

/**
 * Generate a unique transaction ID
 */
export function generateTransactionId(prefix: string = "TX"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}${random}`.toUpperCase();
}

// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

/**
 * Standard success response structure
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  message?: string;
  data?: T;
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  success: false;
  message: string;
  code?: ErrorCode;
  details?: Record<string, unknown>;
}

/**
 * Create a standardized success response
 */
export function successResponse<T>(data?: T, message?: string): SuccessResponse<T> {
  const response: SuccessResponse<T> = { success: true };
  if (message) response.message = message;
  if (data !== undefined) response.data = data;
  return response;
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  message: string,
  code?: ErrorCode,
  details?: Record<string, unknown>
): ErrorResponse {
  const response: ErrorResponse = { success: false, message };
  if (code) response.code = code;
  if (details) response.details = details;
  return response;
}

// ============================================================================
// PIN VALIDATION HELPERS
// ============================================================================

// PIN verification constants
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * PIN verification result types
 */
export interface PinVerificationSuccess {
  success: true;
}

export interface PinVerificationError {
  success: false;
  error: "NO_PIN_SET" | "PIN_REQUIRED" | "PIN_LOCKED" | "INVALID_PIN";
  message: string;
  statusCode: number;
  requiresPin?: boolean;
  needsPinSetup?: boolean;
  lockedUntil?: Date;
  attemptsRemaining?: number;
}

export type PinVerificationResult = PinVerificationSuccess | PinVerificationError;

/**
 * Comprehensive PIN verification function
 * Use this for ALL PIN verification across the app to ensure consistency
 *
 * @param user - Full user object from storage.getUser()
 * @param pin - PIN entered by user
 * @param updatePinAttempts - Callback to update PIN attempts (from storage)
 * @returns PinVerificationResult
 */
export async function verifyUserPin(
  user: User,
  pin: string | undefined,
  updatePinAttempts: (userId: number, attempts: number, lockedUntil: Date | null) => Promise<void>
): Promise<PinVerificationResult> {
  // Check if user has PIN set up
  if (!user.pinHash) {
    return {
      success: false,
      error: "NO_PIN_SET",
      message: "PIN required. Please set up your PIN in Security settings first.",
      statusCode: 400,
      requiresPin: true,
      needsPinSetup: true
    };
  }

  // Check if PIN was provided
  if (!pin) {
    return {
      success: false,
      error: "PIN_REQUIRED",
      message: "PIN required for this transaction",
      statusCode: 400,
      requiresPin: true
    };
  }

  // Check PIN lockout
  if (user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date()) {
    const remainingMinutes = Math.ceil((new Date(user.pinLockedUntil).getTime() - Date.now()) / 60000);
    return {
      success: false,
      error: "PIN_LOCKED",
      message: `PIN locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
      statusCode: 423,
      lockedUntil: new Date(user.pinLockedUntil)
    };
  }

  // Verify PIN
  const isValidPin = await bcrypt.compare(pin, user.pinHash);

  if (!isValidPin) {
    const newAttempts = (user.pinFailedAttempts || 0) + 1;

    if (newAttempts >= MAX_PIN_ATTEMPTS) {
      // Lock the PIN
      const lockUntil = new Date(Date.now() + PIN_LOCKOUT_DURATION_MS);
      await updatePinAttempts(user.id, newAttempts, lockUntil);
      return {
        success: false,
        error: "PIN_LOCKED",
        message: "Too many failed PIN attempts. PIN locked for 30 minutes.",
        statusCode: 423,
        lockedUntil: lockUntil
      };
    }

    // Update failed attempts
    await updatePinAttempts(user.id, newAttempts, null);
    return {
      success: false,
      error: "INVALID_PIN",
      message: `Invalid PIN. ${MAX_PIN_ATTEMPTS - newAttempts} attempts remaining.`,
      statusCode: 401,
      attemptsRemaining: MAX_PIN_ATTEMPTS - newAttempts
    };
  }

  // Reset failed attempts on success
  await updatePinAttempts(user.id, 0, null);

  return { success: true };
}

/**
 * Check if user's PIN is locked due to too many failed attempts
 */
export function isPinLocked(user: User): { locked: boolean; lockedUntil?: Date } {
  if (user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date()) {
    return { locked: true, lockedUntil: new Date(user.pinLockedUntil) };
  }
  return { locked: false };
}

/**
 * Check if user has a PIN set
 */
export function hasPinSet(user: User): boolean {
  return !!user.pinHash;
}

// ============================================================================
// BALANCE HELPERS
// ============================================================================

/**
 * Parse balance string to number safely
 */
export function parseBalance(balance: string | null | undefined): number {
  if (!balance) return 0;
  const parsed = parseFloat(balance);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format number as balance string with 2 decimal places
 */
export function formatBalance(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Calculate total balance from fiat and PHPT balances
 */
export function calculateTotalBalance(fiatBalance: string | null, phptBalance: string | null): string {
  const fiat = parseBalance(fiatBalance);
  const phpt = parseBalance(phptBalance);
  return formatBalance(fiat + phpt);
}

// ============================================================================
// ROLE/PERMISSION HELPERS
// ============================================================================

/**
 * Check if user has admin privileges (uses role field, not deprecated isAdmin)
 */
export function isAdmin(user: User): boolean {
  return user.role === "super_admin" || user.role === "admin";
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user: User): boolean {
  return user.role === "super_admin";
}

/**
 * Check if user has support or higher privileges
 */
export function hasStaffAccess(user: User): boolean {
  return ["super_admin", "admin", "support"].includes(user.role);
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate PIN format (6 digits)
 */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate phone number format (Philippine format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Accepts formats: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
  return /^(\+?63|0)?9\d{9}$/.test(phone.replace(/\s/g, ""));
}

/**
 * Normalize phone number to 09XXXXXXXXX format
 */
export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\s/g, "");
  if (cleaned.startsWith("+63")) return "0" + cleaned.slice(3);
  if (cleaned.startsWith("63")) return "0" + cleaned.slice(2);
  return cleaned;
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Check if a date is expired (past current time)
 */
export function isExpired(date: Date | string): boolean {
  return new Date(date) < new Date();
}

/**
 * Get expiry date from now plus minutes
 */
export function getExpiryDate(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ============================================================================
// IP ADDRESS HELPERS
// ============================================================================

/**
 * Extract client IP from request
 */
export function getClientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined> }): string | null {
  // Check X-Forwarded-For header first (common for proxied requests)
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return ip.trim();
  }
  return req.ip || null;
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Create a structured log entry
 */
export function createLogEntry(
  action: string,
  details: Record<string, unknown>,
  userId?: number
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    action,
    userId,
    ...details,
  };
}

// ============================================================================
// ASYNC HELPERS
// ============================================================================

/**
 * Wrap async route handler to catch errors
 */
export function asyncHandler<T>(
  fn: (req: any, res: any, next?: any) => Promise<T>
): (req: any, res: any, next: any) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
