/**
 * AI Function Definitions and Executors
 *
 * Defines functions that the AI can call to interact with PayVerse.
 * Each function has access controls and sanitized execution.
 */

import { storage } from "./storage";
import type { User } from "@shared/schema";
import { canExecuteFunction, validateFunctionArgs, logFunctionCall } from "./ai-security";

// Function definition interface matching OpenRouter/OpenAI format
interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

// All available functions
export const AI_FUNCTIONS: FunctionDefinition[] = [
  // Public functions
  {
    name: "get_platform_info",
    description: "Get general information about PayVerse platform, features, and services",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Topic to get info about",
          enum: ["features", "services", "fees", "limits", "security", "support"],
        },
      },
    },
  },

  // User functions
  {
    name: "get_balance",
    description: "Get the user's current PHPT wallet balance",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "get_transactions",
    description: "Get the user's recent transactions with optional filters",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of transactions to return (default 10, max 50)",
        },
        type: {
          type: "string",
          description: "Filter by transaction type",
          enum: ["transfer", "topup", "withdrawal", "casino_deposit", "casino_withdraw"],
        },
      },
    },
  },

  {
    name: "search_user",
    description: "Search for a user by username, email, or phone to send money to",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Username, email, or phone number to search for (exact match)",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "get_profile",
    description: "Get the user's profile information",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  // Admin functions
  {
    name: "admin_get_stats",
    description: "Get platform statistics (admin only)",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "admin_search_transactions",
    description: "Search all transactions with filters (admin only)",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "number",
          description: "Filter by user ID",
        },
        type: {
          type: "string",
          description: "Filter by transaction type",
        },
        status: {
          type: "string",
          description: "Filter by status",
          enum: ["pending", "completed", "failed"],
        },
        limit: {
          type: "number",
          description: "Maximum results (default 20, max 100)",
        },
      },
    },
  },

  {
    name: "admin_search_users",
    description: "Search users by name, email, or username (admin only)",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (partial match)",
        },
        limit: {
          type: "number",
          description: "Maximum results (default 20, max 100)",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "admin_generate_report",
    description: "Generate a summary report of platform activity (admin only)",
    parameters: {
      type: "object",
      properties: {
        reportType: {
          type: "string",
          description: "Type of report to generate",
          enum: ["daily_summary", "user_activity", "transaction_volume", "pending_kyc"],
        },
      },
      required: ["reportType"],
    },
  },
];

// Get functions available to a specific user role
export function getFunctionsForRole(user: User | null): FunctionDefinition[] {
  return AI_FUNCTIONS.filter(fn => {
    const { allowed } = canExecuteFunction(fn.name, user);
    return allowed;
  });
}

// Function execution result
interface FunctionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Execute a function by name
export async function executeFunction(
  functionName: string,
  args: Record<string, unknown>,
  user: User | null
): Promise<FunctionResult> {
  const startTime = Date.now();

  // Check access
  const access = canExecuteFunction(functionName, user);
  if (!access.allowed) {
    logFunctionCall({
      timestamp: new Date(),
      userId: user?.id || null,
      functionName,
      args,
      result: "blocked",
      error: access.reason,
      executionTimeMs: Date.now() - startTime,
    });
    return { success: false, error: access.reason };
  }

  // Validate and sanitize args
  const validation = validateFunctionArgs(functionName, args, user?.id || null);
  if (!validation.valid) {
    logFunctionCall({
      timestamp: new Date(),
      userId: user?.id || null,
      functionName,
      args,
      result: "error",
      error: validation.error,
      executionTimeMs: Date.now() - startTime,
    });
    return { success: false, error: validation.error };
  }

  try {
    let result: unknown;

    switch (functionName) {
      case "get_platform_info":
        result = await getPlatformInfo(validation.sanitizedArgs.topic as string);
        break;

      case "get_balance":
        result = await getBalance(user!);
        break;

      case "get_transactions":
        result = await getTransactions(
          user!,
          validation.sanitizedArgs.limit as number,
          validation.sanitizedArgs.type as string
        );
        break;

      case "search_user":
        result = await searchUser(validation.sanitizedArgs.query as string);
        break;

      case "get_profile":
        result = await getProfile(user!);
        break;

      case "admin_get_stats":
        result = await adminGetStats();
        break;

      case "admin_search_transactions":
        result = await adminSearchTransactions(
          validation.sanitizedArgs.userId as number,
          validation.sanitizedArgs.type as string,
          validation.sanitizedArgs.status as string,
          validation.sanitizedArgs.limit as number
        );
        break;

      case "admin_search_users":
        result = await adminSearchUsers(
          validation.sanitizedArgs.query as string,
          validation.sanitizedArgs.limit as number
        );
        break;

      case "admin_generate_report":
        result = await adminGenerateReport(
          validation.sanitizedArgs.reportType as string
        );
        break;

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }

    logFunctionCall({
      timestamp: new Date(),
      userId: user?.id || null,
      functionName,
      args: validation.sanitizedArgs,
      result: "success",
      executionTimeMs: Date.now() - startTime,
    });

    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logFunctionCall({
      timestamp: new Date(),
      userId: user?.id || null,
      functionName,
      args: validation.sanitizedArgs,
      result: "error",
      error: errorMessage,
      executionTimeMs: Date.now() - startTime,
    });

    return { success: false, error: errorMessage };
  }
}

// Function implementations

async function getPlatformInfo(topic?: string): Promise<Record<string, unknown>> {
  const info: Record<string, unknown> = {
    name: "PayVerse",
    description: "Philippines PHPT E-Wallet Platform",
    currency: "PHPT (1 PHPT = 1 PHP)",
  };

  switch (topic) {
    case "features":
      return {
        ...info,
        features: [
          "P2P Money Transfer",
          "QRPH Cash-in via GCash, Maya, Banks",
          "Casino Chip Buy/Sell (747Live)",
          "Telegram PayGram Integration",
          "Manual Deposit/Withdrawal",
        ],
      };

    case "services":
      return {
        ...info,
        services: {
          p2p_transfer: "Send money to other PayVerse users instantly",
          qrph: "Cash-in via GCash, Maya, and bank transfers",
          casino: "Buy and sell casino chips for 747Live",
          telegram: "Connect your Telegram for PayGram wallet sync",
        },
      };

    case "fees":
      return {
        ...info,
        fees: {
          p2p_transfer: "Free",
          qrph_cashin: "Check current rates",
          casino: "No fees (1:1 exchange)",
          withdrawal: "Depends on method",
        },
      };

    case "limits":
      return {
        ...info,
        limits: {
          minimum_transfer: "1 PHPT",
          kyc_threshold: "5,000 PHPT (requires KYC for larger transfers)",
          daily_limit: "Depends on KYC status",
        },
      };

    case "security":
      return {
        ...info,
        security: [
          "6-digit PIN for transactions",
          "Email OTP verification",
          "KYC verification for large transactions",
          "Secure password hashing",
          "Rate limiting protection",
        ],
      };

    case "support":
      return {
        ...info,
        support: {
          email: "support@payverse.ph",
          telegram: "@PayVerseSupport",
          hours: "24/7",
        },
      };

    default:
      return info;
  }
}

async function getBalance(user: User): Promise<Record<string, unknown>> {
  const currentUser = await storage.getUser(user.id);
  if (!currentUser) {
    throw new Error("User not found");
  }

  return {
    balance: parseFloat(currentUser.phptBalance || "0"),
    currency: "PHPT",
    formattedBalance: `₱${parseFloat(currentUser.phptBalance || "0").toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
  };
}

async function getTransactions(
  user: User,
  limit?: number,
  type?: string
): Promise<unknown[]> {
  const transactions = await storage.getTransactionsByUserId(user.id);

  let filtered = transactions;
  if (type) {
    filtered = transactions.filter(tx => tx.type === type);
  }

  const maxLimit = Math.min(limit || 10, 50);

  return filtered.slice(0, maxLimit).map(tx => ({
    id: tx.id,
    type: tx.type,
    amount: parseFloat(tx.amount),
    status: tx.status,
    note: tx.note,
    createdAt: tx.createdAt,
    isOutgoing: tx.senderId === user.id && tx.receiverId !== user.id,
  }));
}

async function searchUser(query: string): Promise<unknown[]> {
  const users = await storage.searchUsers(query);

  return users.map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
  }));
}

async function getProfile(user: User): Promise<Record<string, unknown>> {
  const currentUser = await storage.getUser(user.id);
  if (!currentUser) {
    throw new Error("User not found");
  }

  return {
    id: currentUser.id,
    username: currentUser.username,
    fullName: currentUser.fullName,
    email: currentUser.email,
    phoneNumber: currentUser.phoneNumber,
    kycStatus: currentUser.kycStatus,
    createdAt: currentUser.createdAt,
    hasPin: !!currentUser.pinHash,
  };
}

async function adminGetStats(): Promise<Record<string, unknown>> {
  const stats = await storage.getAdminStats();
  return stats;
}

async function adminSearchTransactions(
  userId?: number,
  type?: string,
  status?: string,
  limit?: number
): Promise<unknown[]> {
  const transactions = await storage.searchTransactionsAdmin({
    userId,
    type,
    status,
  });

  const maxLimit = Math.min(limit || 20, 100);

  return transactions.slice(0, maxLimit).map(tx => ({
    id: tx.id,
    type: tx.type,
    amount: parseFloat(tx.amount),
    status: tx.status,
    senderId: tx.senderId,
    receiverId: tx.receiverId,
    note: tx.note,
    createdAt: tx.createdAt,
  }));
}

async function adminSearchUsers(
  query: string,
  limit?: number
): Promise<unknown[]> {
  const users = await storage.searchUsersAdmin(query);
  const maxLimit = Math.min(limit || 20, 100);

  return users.slice(0, maxLimit).map(u => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    kycStatus: u.kycStatus,
    isActive: u.isActive,
    balance: parseFloat(u.phptBalance || "0"),
    createdAt: u.createdAt,
  }));
}

async function adminGenerateReport(reportType: string): Promise<Record<string, unknown>> {
  const stats = await storage.getAdminStats();

  switch (reportType) {
    case "daily_summary":
      return {
        reportType: "Daily Summary",
        generatedAt: new Date(),
        stats: {
          totalUsers: stats.totalUsers,
          activeUsers: stats.activeUsers,
          totalTransactions: stats.totalTransactions,
          totalVolume: stats.totalVolume,
        },
      };

    case "user_activity":
      return {
        reportType: "User Activity",
        generatedAt: new Date(),
        stats: {
          totalUsers: stats.totalUsers,
          activeUsers: stats.activeUsers,
          verifiedUsers: stats.verifiedUsers,
          cryptoConnections: stats.cryptoConnections,
        },
      };

    case "transaction_volume":
      return {
        reportType: "Transaction Volume",
        generatedAt: new Date(),
        stats: {
          totalTransactions: stats.totalTransactions,
          totalVolume: stats.totalVolume,
          averageTransaction: stats.totalTransactions > 0
            ? (parseFloat(stats.totalVolume) / stats.totalTransactions).toFixed(2)
            : "0",
        },
      };

    case "pending_kyc":
      const pendingUsers = await storage.getPendingKycUsers();
      return {
        reportType: "Pending KYC",
        generatedAt: new Date(),
        pendingCount: pendingUsers.length,
        users: pendingUsers.slice(0, 20).map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          createdAt: u.createdAt,
        })),
      };

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}
