import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import { balanceAdjustmentInputSchema, USER_ROLES, type UserRole } from "@shared/schema";
import { transferFromAdminWallet, getUserPhptBalance, registerPaygramUser, getSharedPaygramToken, getDecryptedTelegramToken, PAYGRAM_API_URL, TGIN_API_URL } from "./paygram";
import { sanitizeUser, sanitizeUsers, generateRequestId, getClientIp, isAdmin as checkIsAdmin } from "./utils";
import { getSystemSetting } from "./settings";

const PAYGRAM_API_URL = "https://api.pay-gram.org";

export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Too many admin requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || "anonymous",
  validate: { xForwardedForHeader: false },
});

export const sensitiveActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many sensitive operations. Please wait before retrying." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || "anonymous",
  validate: { xForwardedForHeader: false },
});

// generateRequestId is now imported from ./utils

const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 100,
  admin: 50,
  support: 25,
  user: 0
};

export function hasRole(userRole: string | undefined, requiredRole: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY[(userRole as UserRole) || "user"] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

export function isSuperAdmin(user: { role?: string }): boolean {
  return user.role === "super_admin";
}

interface AuditMetadata {
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  requestMethod: string;
  requestPath: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

const HIGH_RISK_ACTIONS = ["update_user", "balance_adjustment", "approve_deposit", "reject_deposit", "send_crypto"];
const CRITICAL_ACTIONS = ["update_super_admin", "delete_user", "approve_large_amount"];

export function getAuditMetadata(req: Request, action: string): AuditMetadata {
  const ipAddress = req.ip || req.headers["x-forwarded-for"]?.toString() || null;
  const userAgent = req.headers["user-agent"] || null;
  const sessionId = (req as any).sessionID || null;
  
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (CRITICAL_ACTIONS.includes(action)) {
    riskLevel = "critical";
  } else if (HIGH_RISK_ACTIONS.includes(action)) {
    riskLevel = "high";
  } else if (action.includes("update") || action.includes("create")) {
    riskLevel = "medium";
  }
  
  return {
    ipAddress,
    userAgent,
    sessionId,
    requestMethod: req.method,
    requestPath: req.originalUrl,
    riskLevel
  };
}

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  // Check role-based access (admin or super_admin)
  if (!hasRole(req.user.role, "admin") && !req.user.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  next();
}

export async function superAdminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ message: "Super admin access required" });
  }
  
  next();
}

async function getAdminPaygramToken(): Promise<string | null> {
  const token = await getSystemSetting("PAYGRAM_API_TOKEN", "");
  return token || null;
}

export function registerAdminRoutes(app: Express) {
  app.use("/api/admin", adminRateLimiter);
  
  app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Admin stats error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(sanitizeUsers(users));
    } catch (error: any) {
      console.error("Admin users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/transactions", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const transactions = await storage.getAllTransactions();
      res.json(transactions);
    } catch (error: any) {
      console.error("Admin transactions error:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.patch("/api/admin/users/:id", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { isActive, isAdmin, kycStatus, role } = req.body;
      
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Protect super_admin from being modified by non-super admins
      if (targetUser.role === "super_admin" && !isSuperAdmin(req.user!)) {
        return res.status(403).json({ message: "Cannot modify super admin account" });
      }
      
      // Only super admin can change roles
      if (role !== undefined && role !== targetUser.role) {
        if (!isSuperAdmin(req.user!)) {
          return res.status(403).json({ message: "Only super admin can change user roles" });
        }
        // Prevent setting another super_admin (only one super admin allowed via seed)
        if (role === "super_admin") {
          return res.status(403).json({ message: "Cannot create additional super admin accounts" });
        }
      }
      
      // Prevent self-demotion for super admin
      if (userId === req.user!.id && isSuperAdmin(req.user!)) {
        if (role && role !== "super_admin") {
          return res.status(403).json({ message: "Cannot demote your own super admin account" });
        }
        if (isActive === false) {
          return res.status(403).json({ message: "Cannot deactivate your own super admin account" });
        }
      }
      
      const previousValue = JSON.stringify({ 
        isActive: targetUser.isActive, 
        isAdmin: targetUser.isAdmin, 
        kycStatus: targetUser.kycStatus,
        role: targetUser.role 
      });
      
      await storage.updateUserAdmin(userId, { isActive, isAdmin, kycStatus, role });
      
      const auditMeta = getAuditMetadata(req, "update_user");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "update_user",
        targetType: "user",
        targetId: userId,
        details: `Updated user: isActive=${isActive}, isAdmin=${isAdmin}, kycStatus=${kycStatus}, role=${role}`,
        previousValue,
        newValue: JSON.stringify({ isActive, isAdmin, kycStatus, role }),
        ...auditMeta
      });
      
      res.json({ success: true, message: "User updated" });
    } catch (error: any) {
      console.error("Admin update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.get("/api/admin/users/search", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || "";
      const users = await storage.searchUsersAdmin(query);
      res.json(sanitizeUsers(users));
    } catch (error: any) {
      console.error("Admin search users error:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  app.get("/api/admin/transactions/search", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const filters = {
        userId: req.query.userId ? parseInt(req.query.userId as string) : undefined,
        status: req.query.status as string | undefined,
        type: req.query.type as string | undefined
      };
      const transactions = await storage.searchTransactionsAdmin(filters);
      res.json(transactions);
    } catch (error: any) {
      console.error("Admin search transactions error:", error);
      res.status(500).json({ message: "Failed to search transactions" });
    }
  });

  app.get("/api/admin/kyc/pending", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const users = await storage.getPendingKycUsers();
      res.json(sanitizeUsers(users));
    } catch (error: any) {
      console.error("Admin KYC pending error:", error);
      res.status(500).json({ message: "Failed to fetch pending KYC" });
    }
  });

  app.get("/api/admin/kyc/:userId/documents", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const documents = await storage.getKycDocumentsByUserId(userId);
      res.json(documents);
    } catch (error: any) {
      console.error("Admin KYC documents error:", error);
      res.status(500).json({ message: "Failed to fetch KYC documents" });
    }
  });

  app.post("/api/admin/kyc/:userId/approve", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      await storage.updateUserAdmin(userId, { kycStatus: "verified" });
      
      const auditMeta = getAuditMetadata(req, "kyc_approve");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "kyc_approve",
        targetType: "user",
        targetId: userId,
        details: "Approved KYC verification",
        previousValue: "pending",
        newValue: "verified",
        ...auditMeta
      });
      
      res.json({ success: true, message: "KYC approved" });
    } catch (error: any) {
      console.error("Admin KYC approve error:", error);
      res.status(500).json({ message: "Failed to approve KYC" });
    }
  });

  app.post("/api/admin/kyc/:userId/reject", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const { reason } = req.body;
      
      await storage.updateUserAdmin(userId, { kycStatus: "rejected" });
      
      const auditMeta = getAuditMetadata(req, "kyc_reject");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "kyc_reject",
        targetType: "user",
        targetId: userId,
        details: `Rejected KYC: ${reason || "No reason provided"}`,
        previousValue: "pending",
        newValue: "rejected",
        ...auditMeta
      });
      
      res.json({ success: true, message: "KYC rejected" });
    } catch (error: any) {
      console.error("Admin KYC reject error:", error);
      res.status(500).json({ message: "Failed to reject KYC" });
    }
  });

  app.post("/api/admin/balance/adjust", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const result = balanceAdjustmentInputSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const { userId, amount, adjustmentType, reason } = result.data;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const adjustmentAmount = parseFloat(amount);
      const previousPhptBalance = parseFloat(user.phptBalance || "0");
      
      // For CREDIT operations, simply transfer PHPT from admin escrow to user
      if (adjustmentType === "credit") {
        const userCliId = user.username || user.email;
        if (!userCliId) {
          return res.status(400).json({ message: "User has no wallet identifier" });
        }
        
        // Transfer PHPT from admin escrow to user via PayGram
        console.log(`[Admin Credit] Transferring ${adjustmentAmount} PHPT from escrow to ${userCliId}`);
        const transferResult = await transferFromAdminWallet(userCliId, adjustmentAmount);
        
        if (!transferResult.success) {
          console.error(`[Admin Credit] PayGram transfer failed:`, transferResult.message);
          return res.status(400).json({ 
            message: `Transfer failed: ${transferResult.message}` 
          });
        }
        
        console.log(`[Admin Credit] PayGram transfer successful: ${transferResult.transactionId}`);
      }
      
      // Calculate new balance for audit purposes
      // adjustBalanceWithAudit will update the database balance in a transaction
      let newPhptBalance: number;
      if (adjustmentType === "debit" || adjustmentType === "fee") {
        newPhptBalance = previousPhptBalance - Math.abs(adjustmentAmount);
        
        if (newPhptBalance < 0) {
          return res.status(400).json({ message: "Resulting PHPT balance cannot be negative" });
        }
        // Note: Debits are local adjustments only (corrections, fees)
        // adjustBalanceWithAudit below will update the balance
      } else {
        // Credit - PayGram transfer was done above, adjustBalanceWithAudit will update local balance
        newPhptBalance = previousPhptBalance + Math.abs(adjustmentAmount);
      }
      
      // Record the adjustment with audit trail
      const { adjustment } = await storage.adjustBalanceWithAudit({
        adminId: req.user!.id,
        userId,
        amount: adjustmentAmount.toFixed(2),
        adjustmentType,
        reason,
        previousBalance: previousPhptBalance.toFixed(2),
        newBalance: newPhptBalance.toFixed(2),
        ipAddress: req.ip || null
      });
      
      res.json({ success: true, adjustment, newBalance: newPhptBalance.toFixed(2) });
    } catch (error: any) {
      console.error("Admin balance adjustment error:", error);
      res.status(500).json({ message: "Failed to adjust balance" });
    }
  });

  app.get("/api/admin/balance/adjustments", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const adjustments = await storage.getBalanceAdjustments();
      res.json(adjustments);
    } catch (error: any) {
      console.error("Admin get adjustments error:", error);
      res.status(500).json({ message: "Failed to fetch adjustments" });
    }
  });

  // Sync user's PayGram balance to local database
  app.post("/api/admin/users/:id/sync-balance", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      const userCliId = user.username || user.email;
      if (!userCliId) {
        return res.status(400).json({ success: false, message: "User has no wallet identifier" });
      }
      
      // Fetch balance from PayGram
      const balanceResult = await getUserPhptBalance(userCliId);
      
      if (!balanceResult.success) {
        return res.status(503).json({ 
          success: false, 
          message: `Failed to fetch PayGram balance: ${balanceResult.message}` 
        });
      }
      
      const previousBalance = parseFloat(user.phptBalance || "0") || 0;
      const newBalance = isNaN(balanceResult.balance) ? 0 : balanceResult.balance;
      
      // Update local database to match PayGram
      // Use direct update since this is a sync, not a credit/debit
      await storage.syncPhptBalance(userId, newBalance);
      
      console.log(`[Admin] Synced balance for user ${userId} (${userCliId}): ${previousBalance} → ${newBalance} PHPT`);
      
      res.json({ 
        success: true, 
        previousBalance: previousBalance.toFixed(2),
        newBalance: newBalance.toFixed(2),
        message: `Balance synced from PayGram: ${newBalance.toFixed(2)} PHPT`
      });
    } catch (error: any) {
      console.error("Admin sync balance error:", error);
      res.status(500).json({ success: false, message: "Failed to sync balance" });
    }
  });

  // Register a user on PayGram (useful for users who weren't registered during signup)
  app.post("/api/admin/users/:id/register-paygram", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const userCliId = user.username || user.email;
      if (!userCliId) {
        return res.status(400).json({ success: false, message: "User has no username or email" });
      }

      console.log(`[Admin] Registering user ${userId} (${userCliId}) on PayGram`);

      const result = await registerPaygramUser(userCliId);

      if (result.success) {
        res.json({
          success: true,
          message: `User ${userCliId} registered on PayGram successfully`,
          userCliId
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || "Failed to register on PayGram",
          userCliId
        });
      }
    } catch (error: any) {
      console.error("Admin register PayGram error:", error);
      res.status(500).json({ success: false, message: "Failed to register user on PayGram" });
    }
  });

  // Get PIN status for a user (admin view)
  app.get("/api/admin/users/:id/pin-status", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const isLocked = user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date();
      const remainingMinutes = isLocked
        ? Math.ceil((new Date(user.pinLockedUntil!).getTime() - Date.now()) / 60000)
        : 0;

      res.json({
        success: true,
        userId: user.id,
        email: user.email,
        hasPinSet: !!user.pinHash,
        failedAttempts: user.pinFailedAttempts || 0,
        isLocked,
        lockedUntil: user.pinLockedUntil,
        remainingMinutes,
      });
    } catch (error: any) {
      console.error("Admin get PIN status error:", error);
      res.status(500).json({ success: false, message: "Failed to get PIN status" });
    }
  });

  // Unlock a user's PIN (reset failed attempts and clear lock)
  app.post("/api/admin/users/:id/unlock-pin", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Reset failed attempts and clear lock
      await storage.updateUserPinAttempts(userId, 0, null);

      // Create audit log
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "pin_unlock",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({
          previousFailedAttempts: user.pinFailedAttempts,
          previousLockedUntil: user.pinLockedUntil,
        }),
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
        sessionId: req.headers.authorization?.replace("Bearer ", "") || null,
        requestMethod: req.method,
        requestPath: req.path,
        riskLevel: "medium"
      });

      console.log(`[Admin] User ${req.user!.id} unlocked PIN for user ${userId}`);

      res.json({
        success: true,
        message: `PIN unlocked for user ${user.email}. Failed attempts reset to 0.`,
        userId,
      });
    } catch (error: any) {
      console.error("Admin unlock PIN error:", error);
      res.status(500).json({ success: false, message: "Failed to unlock PIN" });
    }
  });

  // Reset a user's PIN (clear the PIN so they can set a new one)
  app.post("/api/admin/users/:id/reset-pin", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Clear the PIN hash so user can set a new PIN
      await storage.clearUserPin(userId);

      // Create audit log
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "pin_reset",
        targetType: "user",
        targetId: userId,
        details: JSON.stringify({
          reason: req.body.reason || "Admin reset",
        }),
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
        sessionId: req.headers.authorization?.replace("Bearer ", "") || null,
        requestMethod: req.method,
        requestPath: req.path,
        riskLevel: "high"
      });

      console.log(`[Admin] User ${req.user!.id} reset PIN for user ${userId}`);

      res.json({
        success: true,
        message: `PIN reset for user ${user.email}. User must set a new PIN.`,
        userId,
      });
    } catch (error: any) {
      console.error("Admin reset PIN error:", error);
      res.status(500).json({ success: false, message: "Failed to reset PIN" });
    }
  });

  // Sync all users' PayGram balances (batch operation)
  app.post("/api/admin/users/sync-all-balances", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      const results: { userId: number; username: string; success: boolean; balance?: number; error?: string }[] = [];
      
      for (const user of allUsers) {
        const userCliId = user.username || user.email;
        if (!userCliId) {
          results.push({ userId: user.id, username: user.username || "unknown", success: false, error: "No wallet ID" });
          continue;
        }
        
        try {
          const balanceResult = await getUserPhptBalance(userCliId);
          
          if (balanceResult.success) {
            await storage.syncPhptBalance(user.id, balanceResult.balance);
            results.push({ userId: user.id, username: user.username || userCliId, success: true, balance: balanceResult.balance });
          } else {
            results.push({ userId: user.id, username: user.username || userCliId, success: false, error: balanceResult.message });
          }
        } catch (err: any) {
          results.push({ userId: user.id, username: user.username || userCliId, success: false, error: err.message });
        }
        
        // Rate limit: small delay between API calls
        await new Promise(r => setTimeout(r, 100));
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`[Admin] Bulk balance sync: ${successCount}/${allUsers.length} users synced`);
      
      res.json({ 
        success: true, 
        totalUsers: allUsers.length,
        synced: successCount,
        failed: allUsers.length - successCount,
        results
      });
    } catch (error: any) {
      console.error("Admin bulk sync error:", error);
      res.status(500).json({ success: false, message: "Failed to sync balances" });
    }
  });

  app.get("/api/admin/audit-logs", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAdminAuditLogs();
      res.json(logs);
    } catch (error: any) {
      console.error("Admin audit logs error:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Get escrow account balance (admin@payverse.ph) - used for all PHPT operations
  app.get("/api/admin/crypto/balances", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ 
        message: "PayGram admin not configured",
        code: "ADMIN_TOKEN_MISSING"
      });
    }
    
    // Super admin's PayGram username is always "superadmin" (the escrow account)
    const escrowAccountId = "superadmin";
    
    try {
      const response = await fetch(`${PAYGRAM_API_URL}/${token}/UserInfo`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: escrowAccountId
        })
      });
      const data = await response.json();
      
      // Parse coins/balances from PayGram response
      const coinsArray = data.coins || data.balances || [];
      const wallets = coinsArray.map((b: any) => ({
        currencyCode: b.currency || b.currencyCode,
        balance: b.balance || b.amount || "0"
      }));
      
      // Find PHPT balance specifically
      const phptWallet = wallets.find((w: any) => w.currencyCode === 11);
      const phptBalance = phptWallet?.balance || "0";
      
      res.json({ 
        success: true, 
        escrowAccount: escrowAccountId,
        phptBalance,
        wallets, 
        rawResponse: data 
      });
    } catch (error: any) {
      console.error("Admin PayGram balances error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/crypto/exchange-rates", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ message: "PayGram admin not configured" });
    }
    
    try {
      const response = await fetch(`${PAYGRAM_API_URL}/${token}/GetExchangeRates`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Admin PayGram rates error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Send PHPT from escrow account to a PayGram user
  app.post("/api/admin/crypto/send", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ message: "PayGram admin not configured" });
    }
    
    // Super admin's PayGram username is always "superadmin" (the escrow account)
    const escrowAccountId = "superadmin";
    
    try {
      const { telegramId, amount, currency } = req.body;

      const response = await fetch(`${PAYGRAM_API_URL}/${token}/TransferCredit`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: escrowAccountId,
          toUserCliId: telegramId,
          currencyCode: currency || 11,
          amount: parseFloat(amount)
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Admin PayGram send error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/crypto/invoice", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ message: "PayGram admin not configured" });
    }
    
    try {
      const { amount, currency, callbackData } = req.body;

      const response = await fetch(`${PAYGRAM_API_URL}/${token}/IssueInvoice`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: "admin",
          currencyCode: currency || 11,
          amount: parseFloat(amount),
          merchantType: 0,
          callbackData: callbackData
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Admin PayGram invoice error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Admin top-up: Credit PHPT to user after NexusPay QRPH payment
  // This is used when users pay via QRPH and admin credits their wallet from the pre-funded PHPT pool
  // Uses transactional operation for atomicity
  app.post("/api/admin/topup-user", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId, amount, reference, paymentMethod } = req.body;
      const topupAmount = parseFloat(amount);
      
      if (isNaN(topupAmount) || topupAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid amount" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      const previousPhptBalance = user.phptBalance || "0";
      
      // Use transactional top-up for atomicity
      const result = await storage.topupUserWithAudit({
        adminId: req.user!.id,
        userId,
        amount: topupAmount,
        paymentMethod: paymentMethod || 'NexusPay',
        reference: reference || null,
        previousBalance: previousPhptBalance,
        ipAddress: req.ip || null
      });
      
      console.log(`Admin top-up: ${topupAmount} PHPT credited to user ${userId} (${user.username})`);
      
      res.json({ 
        success: true, 
        message: `Credited ${topupAmount} PHPT to ${user.username}`,
        newBalance: result.newTotalBalance,
        newPhptBalance: result.newPhptBalance
      });
    } catch (error: any) {
      console.error("Admin top-up error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== TELEGRAM TOPUP/CASHOUT ROUTES ====================

  // Create a Telegram invoice for user to claim (Topup via Telegram link)
  app.post("/api/admin/telegram/create-topup", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ success: false, message: "PayGram not configured" });
    }

    try {
      const { userId, amount, note } = req.body;
      const topupAmount = parseFloat(amount);

      if (isNaN(topupAmount) || topupAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum amount is 1 PHPT" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const userCliId = user.username || user.email;
      if (!userCliId) {
        return res.status(400).json({ success: false, message: "User has no wallet identifier" });
      }

      // Create invoice for the user to receive PHPT
      const response = await fetch(`${PAYGRAM_API_URL}/${token}/IssueInvoice`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: userCliId,
          currencyCode: 11,
          amount: topupAmount,
          merchantType: 0,
          callbackData: `admin-topup-${userId}-${Date.now()}`
        })
      });

      const data = await response.json();

      if (!data.success) {
        return res.status(400).json({
          success: false,
          message: data.message || "Failed to create invoice"
        });
      }

      const invoiceCode = data.invoiceCode;
      const friendlyVoucherCode = data.friendlyVoucherCode;

      // Generate Telegram redeem link
      const payload = `a=v&c=${invoiceCode}`;
      const encodedPayload = Buffer.from(payload).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const telegramLink = `https://telegram.me/opgmbot?start=${encodedPayload}`;

      // Create transaction record for tracking
      await storage.createTransaction({
        senderId: req.user!.id,
        receiverId: userId,
        amount: topupAmount.toFixed(2),
        type: "telegram_topup",
        status: "pending",
        category: "Admin Telegram Topup",
        note: note || `Admin Telegram topup - Invoice: ${invoiceCode}`,
        walletType: "phpt",
        externalTxId: invoiceCode
      });

      // Audit log
      const auditMeta = getAuditMetadata(req, "telegram_topup");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "telegram_topup",
        targetType: "user",
        targetId: userId,
        details: `Created Telegram topup of ${topupAmount} PHPT for ${user.username}`,
        newValue: JSON.stringify({ amount: topupAmount, invoiceCode }),
        ...auditMeta
      });

      console.log(`[Admin Telegram] Created topup invoice ${invoiceCode} for user ${userId} (${userCliId}): ${topupAmount} PHPT`);

      res.json({
        success: true,
        message: `Created ${topupAmount} PHPT topup for ${user.fullName || user.username}`,
        invoiceCode,
        friendlyVoucherCode,
        telegramLink,
        amount: topupAmount,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName
        }
      });
    } catch (error: any) {
      console.error("Admin Telegram topup error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Direct send PHPT to user's PayGram account (instant, no link needed)
  app.post("/api/admin/telegram/direct-send", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ success: false, message: "PayGram not configured" });
    }

    try {
      const { userId, amount, note } = req.body;
      const sendAmount = parseFloat(amount);

      if (isNaN(sendAmount) || sendAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum amount is 1 PHPT" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const userCliId = user.username || user.email;
      if (!userCliId) {
        return res.status(400).json({ success: false, message: "User has no wallet identifier" });
      }

      // Transfer from admin escrow to user
      const result = await transferFromAdminWallet(userCliId, sendAmount);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message || "Transfer failed"
        });
      }

      // Create transaction record
      await storage.createTransaction({
        senderId: req.user!.id,
        receiverId: userId,
        amount: sendAmount.toFixed(2),
        type: "telegram_topup",
        status: "completed",
        category: "Admin Direct Send",
        note: note || `Admin direct send via Telegram`,
        walletType: "phpt",
        externalTxId: result.transactionId
      });

      // Sync user's balance from PayGram
      const balanceResult = await getUserPhptBalance(userCliId);
      if (balanceResult.success) {
        await storage.syncPhptBalance(userId, balanceResult.balance);
      }

      // Audit log
      const auditMeta = getAuditMetadata(req, "telegram_direct_send");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "telegram_direct_send",
        targetType: "user",
        targetId: userId,
        details: `Direct sent ${sendAmount} PHPT to ${user.username}`,
        newValue: JSON.stringify({ amount: sendAmount, txId: result.transactionId }),
        ...auditMeta
      });

      console.log(`[Admin Telegram] Direct sent ${sendAmount} PHPT to user ${userId} (${userCliId})`);

      res.json({
        success: true,
        message: `Sent ${sendAmount} PHPT to ${user.fullName || user.username}`,
        transactionId: result.transactionId,
        amount: sendAmount,
        newBalance: balanceResult.success ? balanceResult.balance.toFixed(2) : undefined
      });
    } catch (error: any) {
      console.error("Admin Telegram direct send error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Process cashout to user's Telegram wallet
  app.post("/api/admin/telegram/process-cashout", authMiddleware, adminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    const token = await getAdminPaygramToken();
    if (!token) {
      return res.status(503).json({ success: false, message: "PayGram not configured" });
    }

    try {
      const { userId, amount, telegramUsername, note } = req.body;
      const cashoutAmount = parseFloat(amount);

      if (isNaN(cashoutAmount) || cashoutAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum amount is 1 PHPT" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Determine recipient - either user's PayGram ID or provided Telegram username
      const recipientId = telegramUsername || user.username || user.email;
      if (!recipientId) {
        return res.status(400).json({ success: false, message: "No recipient identifier" });
      }

      // Check user has sufficient balance
      const userCliId = user.username || user.email;
      const balanceResult = await getUserPhptBalance(userCliId!);

      if (!balanceResult.success || balanceResult.balance < cashoutAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. User has ${balanceResult.balance?.toFixed(2) || 0} PHPT`
        });
      }

      // Transfer from user to admin escrow first (debit user)
      const escrowAccountId = "superadmin";
      const debitResponse = await fetch(`${PAYGRAM_API_URL}/${token}/TransferCredit`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: userCliId,
          toUserCliId: escrowAccountId,
          currencyCode: 11,
          amount: cashoutAmount
        })
      });

      const debitData = await debitResponse.json();
      if (!debitData.success) {
        return res.status(400).json({
          success: false,
          message: debitData.message || "Failed to debit user balance"
        });
      }

      // If telegramUsername is different from user's account, transfer to that account
      if (telegramUsername && telegramUsername !== userCliId) {
        const sendResponse = await fetch(`${PAYGRAM_API_URL}/${token}/TransferCredit`, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            requestId: generateRequestId(),
            userCliId: escrowAccountId,
            toUserCliId: telegramUsername,
            currencyCode: 11,
            amount: cashoutAmount
          })
        });

        const sendData = await sendResponse.json();
        if (!sendData.success) {
          // Refund user if transfer to Telegram fails
          await fetch(`${PAYGRAM_API_URL}/${token}/TransferCredit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: generateRequestId(),
              userCliId: escrowAccountId,
              toUserCliId: userCliId,
              currencyCode: 11,
              amount: cashoutAmount
            })
          });

          return res.status(400).json({
            success: false,
            message: `Failed to send to Telegram: ${sendData.message}. User refunded.`
          });
        }
      }

      // Create transaction record
      await storage.createTransaction({
        senderId: userId,
        amount: cashoutAmount.toFixed(2),
        type: "telegram_cashout",
        status: "completed",
        category: "Admin Telegram Cashout",
        note: note || `Cashout to Telegram: ${telegramUsername || userCliId}`,
        walletType: "phpt"
      });

      // Sync user's balance
      const newBalanceResult = await getUserPhptBalance(userCliId!);
      if (newBalanceResult.success) {
        await storage.syncPhptBalance(userId, newBalanceResult.balance);
      }

      // Audit log
      const auditMeta = getAuditMetadata(req, "telegram_cashout");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "telegram_cashout",
        targetType: "user",
        targetId: userId,
        details: `Processed ${cashoutAmount} PHPT cashout to Telegram for ${user.username}`,
        newValue: JSON.stringify({ amount: cashoutAmount, recipient: telegramUsername || userCliId }),
        ...auditMeta
      });

      console.log(`[Admin Telegram] Processed cashout ${cashoutAmount} PHPT for user ${userId} to ${telegramUsername || userCliId}`);

      res.json({
        success: true,
        message: `Sent ${cashoutAmount} PHPT to ${telegramUsername || user.username}'s Telegram`,
        amount: cashoutAmount,
        recipient: telegramUsername || userCliId,
        newBalance: newBalanceResult.success ? newBalanceResult.balance.toFixed(2) : undefined
      });
    } catch (error: any) {
      console.error("Admin Telegram cashout error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get Telegram transaction history
  app.get("/api/admin/telegram/transactions", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const transactions = await storage.getTransactionsByType(["telegram_topup", "telegram_cashout", "escrow_topup", "escrow_cashout"]);
      res.json({ success: true, transactions });
    } catch (error: any) {
      console.error("Admin Telegram transactions error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // ==================== ESCROW MANAGEMENT ROUTES (Super Admin Only) ====================
  // These routes allow the super admin to topup/cashout the escrow account via Telegram

  // Helper function to get admin's TGIN token from system settings
  async function getAdminTginToken(): Promise<string | null> {
    const token = await getSystemSetting("ADMIN_TGIN_TOKEN", "");
    return token || null;
  }

  // Helper function to format voucher code for PayVoucher
  function formatVoucherCode(code: string): string | null {
    if (!code) return null;
    const cleanCode = code.replace(/\s+/g, '').trim();
    if (cleanCode.length !== 12) {
      console.error(`Invalid voucher code length: expected 12, got ${cleanCode.length}`);
      return null;
    }
    const formatted = `${cleanCode.slice(0,3)} ${cleanCode.slice(3,6)} ${cleanCode.slice(6,8)} ${cleanCode.slice(8,10)} ${cleanCode.slice(10,12)}`;
    return formatted.toUpperCase();
  }

  // Check if super admin's TGIN token is configured
  app.get("/api/admin/escrow/status", authMiddleware, superAdminMiddleware, async (req: Request, res: Response) => {
    try {
      const tginToken = await getAdminTginToken();
      const paygramToken = await getAdminPaygramToken();
      const escrowAccountId = "superadmin";

      // Get escrow account balance
      let escrowBalance = 0;
      if (paygramToken) {
        try {
          const balanceResult = await getUserPhptBalance(escrowAccountId);
          if (balanceResult.success) {
            escrowBalance = balanceResult.balance;
          }
        } catch (e) {
          console.error("Failed to get escrow balance:", e);
        }
      }

      res.json({
        success: true,
        tginConfigured: !!tginToken,
        paygramConfigured: !!paygramToken,
        escrowAccountId,
        escrowBalance: escrowBalance.toFixed(2),
        message: !tginToken
          ? "Configure your TGIN token in System Settings → PayGram API to enable Telegram operations"
          : "Escrow account ready"
      });
    } catch (error: any) {
      console.error("Escrow status error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Escrow Topup: Transfer PHPT from super admin's Telegram wallet to escrow account
  // Flow: Super Admin Telegram → Escrow PayGram account ("superadmin")
  app.post("/api/admin/escrow/topup", authMiddleware, superAdminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    const paygramToken = await getAdminPaygramToken();
    const tginToken = await getAdminTginToken();

    if (!paygramToken) {
      return res.status(503).json({ success: false, message: "PayGram not configured. Set PAYGRAM_API_TOKEN in System Settings." });
    }
    if (!tginToken) {
      return res.status(503).json({ success: false, message: "TGIN token not configured. Set ADMIN_TGIN_TOKEN in System Settings." });
    }

    try {
      const { amount } = req.body;
      const topupAmount = parseFloat(amount);

      if (isNaN(topupAmount) || topupAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum amount is 1 PHPT" });
      }

      const escrowAccountId = "superadmin";
      console.log(`[Escrow Topup] Starting ${topupAmount} PHPT topup to escrow from Telegram`);

      // Step 1: Create invoice for escrow account via PayGramPay
      console.log(`[Escrow Topup] Step 1: Creating invoice for ${escrowAccountId}`);
      const invoiceResponse = await fetch(`${PAYGRAM_API_URL}/${paygramToken}/IssueInvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/plain" },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: escrowAccountId,
          currencyCode: 11,
          amount: topupAmount,
          callbackData: `escrow-topup-${Date.now()}`,
          merchantType: 0
        })
      });

      const invoiceText = await invoiceResponse.text();
      console.log("[Escrow Topup] Invoice response:", invoiceText);

      let invoiceData;
      try {
        invoiceData = JSON.parse(invoiceText);
      } catch {
        return res.status(500).json({ success: false, message: "Failed to create invoice", rawResponse: invoiceText });
      }

      if (!invoiceData.success) {
        return res.status(400).json({ success: false, message: invoiceData.message || "Failed to create invoice" });
      }

      const invoiceCode = invoiceData.invoiceCode;
      const friendlyVoucherCode = invoiceData.friendlyVoucherCode;
      console.log(`[Escrow Topup] Invoice created: ${invoiceCode}`);

      // Step 2: Pay invoice using TGIN PayVoucher (from super admin's Telegram)
      const formattedVoucher = formatVoucherCode(friendlyVoucherCode);
      if (!formattedVoucher) {
        return res.status(400).json({ success: false, message: "Invalid voucher code format" });
      }

      console.log(`[Escrow Topup] Step 2: Paying invoice with TGIN PayVoucher`);
      const payUrl = `${TGIN_API_URL}/${tginToken}/PayVoucher?voucherCode=${encodeURIComponent(formattedVoucher)}&amt=${topupAmount}&cursym=11`;
      const payResponse = await fetch(payUrl, { method: "GET", headers: { "Accept": "text/plain" } });
      const payText = await payResponse.text();
      console.log("[Escrow Topup] PayVoucher response:", payText);

      let payData;
      try {
        payData = JSON.parse(payText);
      } catch {
        return res.status(500).json({ success: false, message: "Payment failed", rawResponse: payText });
      }

      if (!payData.success) {
        return res.status(400).json({ success: false, message: payData.message || "Payment from Telegram failed" });
      }

      // Step 3: Redeem invoice to credit escrow account
      console.log(`[Escrow Topup] Step 3: Redeeming invoice to credit escrow`);
      const redeemResponse = await fetch(`${PAYGRAM_API_URL}/${paygramToken}/RedeemInvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/plain" },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: escrowAccountId,
          invoiceCode: invoiceCode
        })
      });

      const redeemText = await redeemResponse.text();
      console.log("[Escrow Topup] RedeemInvoice response:", redeemText);

      let redeemData;
      try {
        redeemData = JSON.parse(redeemText);
      } catch {
        return res.status(500).json({ success: false, message: "Redeem failed", rawResponse: redeemText });
      }

      if (!redeemData.success) {
        return res.status(400).json({ success: false, message: redeemData.message || "Redeem failed" });
      }

      // Get new escrow balance
      const balanceResult = await getUserPhptBalance(escrowAccountId);
      const newBalance = balanceResult.success ? balanceResult.balance : 0;

      // Create transaction record
      await storage.createTransaction({
        senderId: req.user!.id,
        receiverId: req.user!.id,
        amount: topupAmount.toFixed(2),
        type: "escrow_topup",
        status: "completed",
        category: "Escrow Topup",
        note: `Escrow topup from Telegram: ${topupAmount} PHPT`,
        walletType: "phpt",
        externalTxId: invoiceCode
      });

      // Audit log
      const auditMeta = getAuditMetadata(req, "escrow_topup");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "escrow_topup",
        targetType: "escrow",
        targetId: req.user!.id,
        details: `Topped up escrow with ${topupAmount} PHPT from Telegram`,
        newValue: JSON.stringify({ amount: topupAmount, invoiceCode }),
        ...auditMeta
      });

      console.log(`[Escrow Topup] Success! ${topupAmount} PHPT credited to escrow. New balance: ${newBalance}`);

      res.json({
        success: true,
        message: `Successfully topped up ${topupAmount} PHPT to escrow`,
        amount: topupAmount,
        newEscrowBalance: newBalance.toFixed(2),
        transactionId: invoiceCode
      });
    } catch (error: any) {
      console.error("[Escrow Topup] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Escrow Cashout: Transfer PHPT from escrow account to super admin's Telegram wallet
  // Flow: Escrow PayGram account ("superadmin") → Super Admin Telegram
  app.post("/api/admin/escrow/cashout", authMiddleware, superAdminMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    const paygramToken = await getAdminPaygramToken();
    const tginToken = await getAdminTginToken();

    if (!paygramToken) {
      return res.status(503).json({ success: false, message: "PayGram not configured. Set PAYGRAM_API_TOKEN in System Settings." });
    }
    if (!tginToken) {
      return res.status(503).json({ success: false, message: "TGIN token not configured. Set ADMIN_TGIN_TOKEN in System Settings." });
    }

    try {
      const { amount } = req.body;
      const cashoutAmount = parseFloat(amount);

      if (isNaN(cashoutAmount) || cashoutAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum amount is 1 PHPT" });
      }

      const escrowAccountId = "superadmin";

      // Check escrow balance first
      const balanceResult = await getUserPhptBalance(escrowAccountId);
      if (!balanceResult.success || balanceResult.balance < cashoutAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient escrow balance. Available: ${balanceResult.balance?.toFixed(2) || 0} PHPT`
        });
      }

      console.log(`[Escrow Cashout] Starting ${cashoutAmount} PHPT cashout from escrow to Telegram`);

      // Step 1: Create TGIN invoice for super admin's Telegram to receive
      console.log(`[Escrow Cashout] Step 1: Creating TGIN invoice for Telegram to receive`);
      const tginInvoiceUrl = `${TGIN_API_URL}/${tginToken}/IssueInvoice?amt=${cashoutAmount}&cursym=PHPT`;
      const tginResponse = await fetch(tginInvoiceUrl, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });

      const tginData = await tginResponse.json();
      console.log("[Escrow Cashout] TGIN Invoice response:", JSON.stringify(tginData));

      if (!tginData.success) {
        return res.status(400).json({ success: false, message: tginData.message || "Failed to create Telegram invoice" });
      }

      const tginInvoiceCode = tginData.invoiceCode;

      // Step 2: Pay the TGIN invoice from escrow via PayGramPay
      console.log(`[Escrow Cashout] Step 2: Paying TGIN invoice from escrow`);
      const payResponse = await fetch(`${PAYGRAM_API_URL}/${paygramToken}/PayInvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/plain" },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId: escrowAccountId,
          invoiceCode: tginInvoiceCode,
          currencyCode: 11,
          amount: cashoutAmount
        })
      });

      const payText = await payResponse.text();
      console.log("[Escrow Cashout] PayInvoice response:", payText);

      let payData;
      try {
        payData = JSON.parse(payText);
      } catch {
        return res.status(500).json({ success: false, message: "Payment failed", rawResponse: payText });
      }

      if (!payData.success) {
        return res.status(400).json({ success: false, message: payData.message || "Payment from escrow failed" });
      }

      // Get new escrow balance
      const newBalanceResult = await getUserPhptBalance(escrowAccountId);
      const newBalance = newBalanceResult.success ? newBalanceResult.balance : 0;

      // Create transaction record
      await storage.createTransaction({
        senderId: req.user!.id,
        amount: cashoutAmount.toFixed(2),
        type: "escrow_cashout",
        status: "completed",
        category: "Escrow Cashout",
        note: `Escrow cashout to Telegram: ${cashoutAmount} PHPT`,
        walletType: "phpt",
        externalTxId: tginInvoiceCode
      });

      // Audit log
      const auditMeta = getAuditMetadata(req, "escrow_cashout");
      await storage.createAdminAuditLog({
        adminId: req.user!.id,
        action: "escrow_cashout",
        targetType: "escrow",
        targetId: req.user!.id,
        details: `Cashed out ${cashoutAmount} PHPT from escrow to Telegram`,
        newValue: JSON.stringify({ amount: cashoutAmount, invoiceCode: tginInvoiceCode }),
        ...auditMeta
      });

      console.log(`[Escrow Cashout] Success! ${cashoutAmount} PHPT sent to Telegram. New escrow balance: ${newBalance}`);

      res.json({
        success: true,
        message: `Successfully sent ${cashoutAmount} PHPT to your Telegram`,
        amount: cashoutAmount,
        newEscrowBalance: newBalance.toFixed(2),
        transactionId: tginInvoiceCode
      });
    } catch (error: any) {
      console.error("[Escrow Cashout] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  console.log("Admin routes registered");
}
