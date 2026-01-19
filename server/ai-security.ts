/**
 * AI Security Middleware
 *
 * Handles input sanitization, output filtering, and rate limiting
 * for the AI chat system.
 */

import type { User } from "@shared/schema";

// Sensitive patterns that should never be exposed
const SENSITIVE_PATTERNS = [
  // API keys and tokens
  /api[_-]?key/i,
  /api[_-]?token/i,
  /bearer\s+[a-zA-Z0-9_-]+/i,
  /authorization:\s*bearer/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /jwt[_-]?token/i,
  /auth[_-]?token/i,

  // Database and connection strings
  /postgres:\/\//i,
  /mysql:\/\//i,
  /mongodb:\/\//i,
  /database_url/i,
  /connection_string/i,
  /redis:\/\//i,

  // Secrets and credentials
  /secret[_-]?key/i,
  /private[_-]?key/i,
  /password\s*[=:]/i,
  /credential/i,
  /\$2[aby]\$\d+\$/i, // bcrypt hash pattern
  /\$argon2/i, // argon2 hash pattern
  /sha256:/i,
  /sha512:/i,

  // Internal system info
  /\.env/i,
  /process\.env/i,
  /internal_api/i,
  /server[_-]?config/i,
  /admin[_-]?password/i,

  // PayVerse specific
  /paygram[_-]?api[_-]?token/i,
  /casino[_-]?747[_-]?token/i,
  /nexuspay[_-]?password/i,
  /smtp[_-]?pass/i,
  /pin[_-]?hash/i,
  /escrow[_-]?account/i,
  /openrouter[_-]?api/i,
  /telegram[_-]?bot[_-]?token/i,
  /webhook[_-]?secret/i,
  /encryption[_-]?key/i,
];

// Prompt injection patterns
const INJECTION_PATTERNS = [
  // Role override attempts
  /ignore\s+(previous|all|prior)\s+(instructions|prompts)/i,
  /you\s+are\s+now\s+a/i,
  /forget\s+(everything|your\s+instructions)/i,
  /new\s+instructions/i,
  /disregard\s+(all|previous)/i,
  /override\s+(your|the)\s+(rules|instructions)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(if|a)/i,
  /roleplay\s+as/i,

  // System prompt extraction
  /what\s+(is|are)\s+your\s+(system\s+)?prompt/i,
  /show\s+me\s+your\s+instructions/i,
  /reveal\s+your\s+prompt/i,
  /print\s+system\s+message/i,
  /repeat\s+your\s+(initial|system)/i,
  /what\s+were\s+you\s+told/i,
  /display\s+(your|the)\s+rules/i,

  // Jailbreak attempts
  /dan\s+mode/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /do\s+anything\s+now/i,
  /grandma\s+mode/i,
  /sudo\s+mode/i,
  /god\s+mode/i,
  /unrestricted\s+mode/i,

  // Code execution attempts
  /eval\s*\(/i,
  /exec\s*\(/i,
  /__import__/i,
  /subprocess/i,
  /os\.system/i,
  /shell_exec/i,

  // Credential extraction attempts
  /give\s+me\s+(the\s+)?(api|admin|user)\s*(key|password|token|secret)/i,
  /list\s+(all\s+)?(user|admin)\s*passwords/i,
  /show\s+(me\s+)?(database|db)\s*(password|credentials)/i,
  /extract\s+(user|admin)\s*credentials/i,
  /dump\s+(the\s+)?(database|users|passwords)/i,
  /access\s+(other|another)\s+user('s)?\s+(account|data|balance)/i,
  /bypass\s+(authentication|security|pin)/i,
  /hack\s+(into|the)/i,
  /exploit\s+(the|this)/i,

  // Social engineering attempts
  /i\s+am\s+(an?\s+)?(admin|developer|owner|support)/i,
  /testing\s+(the\s+)?security/i,
  /authorized\s+to\s+access/i,
  /emergency\s+override/i,
  /maintenance\s+mode/i,
];

// Rate limits by role (requests per hour)
const RATE_LIMITS: Record<string, number> = {
  public: 25,
  user: 50,
  admin: 200,
  super_admin: 500,
};

// In-memory rate limit store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Get user role for rate limiting
 */
function getUserRole(user: User | null): string {
  if (!user) return "public";
  return user.role || "user";
}

/**
 * Check if message contains prompt injection attempts
 */
export function detectPromptInjection(message: string): {
  isInjection: boolean;
  pattern?: string;
} {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { isInjection: true, pattern: pattern.source };
    }
  }
  return { isInjection: false };
}

/**
 * Sanitize user input
 */
export function sanitizeInput(message: string): string {
  // Remove potential HTML/script tags
  let sanitized = message.replace(/<[^>]*>/g, "");

  // Remove control characters except newlines
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Limit length
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }

  return sanitized.trim();
}

/**
 * Check if output contains sensitive data
 */
export function containsSensitiveData(output: string): {
  hasSensitive: boolean;
  patterns: string[];
} {
  const matchedPatterns: string[] = [];

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(output)) {
      matchedPatterns.push(pattern.source);
    }
  }

  return {
    hasSensitive: matchedPatterns.length > 0,
    patterns: matchedPatterns,
  };
}

/**
 * Filter sensitive data from output
 */
export function filterOutput(output: string): string {
  let filtered = output;

  // Replace potential API keys/tokens with placeholder
  filtered = filtered.replace(
    /(['"]\s*[:=]\s*['"]?)[a-zA-Z0-9_-]{32,}(['"]?)/g,
    "$1[REDACTED]$2"
  );

  // Replace connection strings
  filtered = filtered.replace(
    /(postgres|mysql|mongodb|redis):\/\/[^\s'"]+/gi,
    "[REDACTED_CONNECTION_STRING]"
  );

  // Replace bearer tokens
  filtered = filtered.replace(
    /bearer\s+[a-zA-Z0-9_-]{20,}/gi,
    "Bearer [REDACTED]"
  );

  // Replace bcrypt/argon2 password hashes
  filtered = filtered.replace(
    /\$2[aby]\$\d+\$[./A-Za-z0-9]{53}/g,
    "[REDACTED_HASH]"
  );
  filtered = filtered.replace(
    /\$argon2[id]+\$[^\s'"]+/gi,
    "[REDACTED_HASH]"
  );

  // Replace JWT tokens
  filtered = filtered.replace(
    /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    "[REDACTED_JWT]"
  );

  // Replace email:password patterns
  filtered = filtered.replace(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+):([^\s]+)/g,
    "$1:[REDACTED]"
  );

  // Replace PIN hashes or any 6-digit sensitive codes in context
  filtered = filtered.replace(
    /pin[_-]?hash['":\s]+[a-zA-Z0-9$./]+/gi,
    "pin_hash: [REDACTED]"
  );

  // Replace Telegram bot tokens
  filtered = filtered.replace(
    /\d{8,10}:[a-zA-Z0-9_-]{35}/g,
    "[REDACTED_BOT_TOKEN]"
  );

  // Replace any hex strings that look like secrets (32+ chars)
  filtered = filtered.replace(
    /['"]\s*[:=]\s*['"]?[a-f0-9]{32,}['"]?/gi,
    '"[REDACTED_SECRET]"'
  );

  return filtered;
}

/**
 * Check rate limit for user
 */
export function checkRateLimit(
  userId: number | null,
  sessionId: string
): {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
} {
  const key = userId ? `user:${userId}` : `session:${sessionId}`;
  const role = userId ? "user" : "public";
  const limit = RATE_LIMITS[role];
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  let entry = rateLimitStore.get(key);

  // Reset if expired
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + hourMs };
    rateLimitStore.set(key, entry);
  }

  const remaining = Math.max(0, limit - entry.count);

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.resetAt),
      limit,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: remaining - 1,
    resetAt: new Date(entry.resetAt),
    limit,
  };
}

/**
 * Update rate limit for user with role
 */
export function updateRateLimitForRole(
  userId: number,
  role: string
): void {
  const key = `user:${userId}`;
  const entry = rateLimitStore.get(key);

  if (entry) {
    // Don't reset count, just update the limit check logic
    // This happens in checkRateLimit
  }
}

/**
 * Get rate limit for role
 */
export function getRateLimitForRole(role: string): number {
  return RATE_LIMITS[role] || RATE_LIMITS.user;
}

/**
 * Function access control matrix
 */
const FUNCTION_ACCESS: Record<string, string[]> = {
  // Public functions (no auth required)
  get_platform_info: ["public", "user", "admin", "super_admin"],

  // User functions (requires login)
  get_balance: ["user", "admin", "super_admin"],
  get_transactions: ["user", "admin", "super_admin"],
  search_user: ["user", "admin", "super_admin"],
  get_profile: ["user", "admin", "super_admin"],

  // Admin functions
  admin_get_stats: ["admin", "super_admin"],
  admin_search_transactions: ["admin", "super_admin"],
  admin_generate_report: ["admin", "super_admin"],
  admin_search_users: ["admin", "super_admin"],

  // Super admin only
  admin_get_settings: ["super_admin"],
};

/**
 * Check if user can execute a function
 */
export function canExecuteFunction(
  functionName: string,
  user: User | null
): {
  allowed: boolean;
  reason?: string;
} {
  const allowedRoles = FUNCTION_ACCESS[functionName];

  if (!allowedRoles) {
    return { allowed: false, reason: "Unknown function" };
  }

  const userRole = getUserRole(user);

  if (allowedRoles.includes(userRole)) {
    return { allowed: true };
  }

  if (allowedRoles.includes("public")) {
    return { allowed: true };
  }

  if (!user && !allowedRoles.includes("public")) {
    return { allowed: false, reason: "Login required" };
  }

  return {
    allowed: false,
    reason: `Requires ${allowedRoles.join(" or ")} role`,
  };
}

/**
 * Validate function arguments
 */
export function validateFunctionArgs(
  functionName: string,
  args: Record<string, unknown>,
  userId: number | null
): {
  valid: boolean;
  sanitizedArgs: Record<string, unknown>;
  error?: string;
} {
  const sanitizedArgs: Record<string, unknown> = {};

  // Special validation for functions that access user data
  if (functionName === "get_transactions" || functionName === "get_balance") {
    // Users can only access their own data
    if (args.userId && args.userId !== userId) {
      return {
        valid: false,
        sanitizedArgs: {},
        error: "Cannot access other users' data",
      };
    }
    sanitizedArgs.userId = userId;
  }

  // Sanitize string arguments
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      sanitizedArgs[key] = sanitizeInput(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      sanitizedArgs[key] = value;
    } else if (Array.isArray(value)) {
      sanitizedArgs[key] = value.map(v =>
        typeof v === "string" ? sanitizeInput(v) : v
      );
    }
  }

  return { valid: true, sanitizedArgs };
}

/**
 * Create audit log entry for function call
 */
export interface FunctionAuditEntry {
  timestamp: Date;
  userId: number | null;
  functionName: string;
  args: Record<string, unknown>;
  result: "success" | "error" | "blocked";
  error?: string;
  executionTimeMs: number;
}

const auditLog: FunctionAuditEntry[] = [];

export function logFunctionCall(entry: FunctionAuditEntry): void {
  auditLog.push(entry);

  // Keep only last 1000 entries in memory
  if (auditLog.length > 1000) {
    auditLog.shift();
  }

  // Log to console for debugging
  console.log(`[AI Function] ${entry.functionName}:`, {
    userId: entry.userId,
    result: entry.result,
    timeMs: entry.executionTimeMs,
    error: entry.error,
  });
}

export function getRecentAuditLogs(limit = 100): FunctionAuditEntry[] {
  return auditLog.slice(-limit);
}
