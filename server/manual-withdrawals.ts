import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import { adminRateLimiter, sensitiveActionRateLimiter } from "./admin";
import { transferToAdminWallet, transferFromAdminWallet, getUserPhptBalance } from "./paygram";
import { broadcastWithdrawalUpdate, broadcastNewWithdrawal } from "./websocket";
import { insertUserBankAccountSchema, insertManualWithdrawalSchema, processWithdrawalSchema, rejectWithdrawalSchema } from "@shared/schema";
import { ZodError } from "zod";
import { verifyUserPin } from "./utils";
import { calculateServiceFee } from "@shared/constants";

export function registerManualWithdrawalRoutes(app: Express) {
  // ==================== User Bank Account Endpoints ====================

  // Get user's bank accounts
  app.get("/api/manual/bank-accounts", authMiddleware, async (req: Request, res: Response) => {
    try {
      const accounts = await storage.getUserBankAccounts(req.user!.id);
      res.json(accounts);
    } catch (error: any) {
      console.error("[Bank Accounts] Error fetching accounts:", error);
      res.status(500).json({ success: false, message: "Failed to fetch bank accounts" });
    }
  });

  // Add new bank account
  app.post("/api/manual/bank-accounts", authMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const data = insertUserBankAccountSchema.parse(req.body);

      // Validate account type
      const validTypes = ["gcash", "maya", "bank", "grabpay"];
      if (!validTypes.includes(data.accountType)) {
        return res.status(400).json({ success: false, message: "Invalid account type" });
      }

      // If bank type, require bankName
      if (data.accountType === "bank" && !data.bankName) {
        return res.status(400).json({ success: false, message: "Bank name is required for bank accounts" });
      }

      const account = await storage.createUserBankAccount(req.user!.id, data);

      res.json({ success: true, account });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ success: false, message: error.errors[0].message });
      }
      console.error("[Bank Accounts] Error creating account:", error);
      res.status(500).json({ success: false, message: "Failed to create bank account" });
    }
  });

  // Update bank account
  app.patch("/api/manual/bank-accounts/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const accountId = parseInt(req.params.id);
      const account = await storage.getUserBankAccount(accountId);

      if (!account || account.userId !== req.user!.id) {
        return res.status(404).json({ success: false, message: "Bank account not found" });
      }

      const data = insertUserBankAccountSchema.partial().parse(req.body);
      const updated = await storage.updateUserBankAccount(accountId, data);

      res.json({ success: true, account: updated });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ success: false, message: error.errors[0].message });
      }
      console.error("[Bank Accounts] Error updating account:", error);
      res.status(500).json({ success: false, message: "Failed to update bank account" });
    }
  });

  // Delete bank account
  app.delete("/api/manual/bank-accounts/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const accountId = parseInt(req.params.id);
      const account = await storage.getUserBankAccount(accountId);

      if (!account || account.userId !== req.user!.id) {
        return res.status(404).json({ success: false, message: "Bank account not found" });
      }

      await storage.deleteUserBankAccount(accountId);

      res.json({ success: true, message: "Bank account deleted" });
    } catch (error: any) {
      console.error("[Bank Accounts] Error deleting account:", error);
      res.status(500).json({ success: false, message: "Failed to delete bank account" });
    }
  });

  // Set default bank account
  app.post("/api/manual/bank-accounts/:id/set-default", authMiddleware, async (req: Request, res: Response) => {
    try {
      const accountId = parseInt(req.params.id);
      const account = await storage.getUserBankAccount(accountId);

      if (!account || account.userId !== req.user!.id) {
        return res.status(404).json({ success: false, message: "Bank account not found" });
      }

      await storage.setDefaultBankAccount(req.user!.id, accountId);

      res.json({ success: true, message: "Default account updated" });
    } catch (error: any) {
      console.error("[Bank Accounts] Error setting default:", error);
      res.status(500).json({ success: false, message: "Failed to set default account" });
    }
  });

  // ==================== User Withdrawal Endpoints ====================

  // Submit withdrawal request
  app.post("/api/manual/withdrawals", authMiddleware, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    try {
      const { userBankAccountId, amount, pin } = req.body;
      const withdrawAmount = parseFloat(amount);

      // Validate amount
      if (!withdrawAmount || withdrawAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum withdrawal is ₱1" });
      }

      if (withdrawAmount > 50000) {
        return res.status(400).json({ success: false, message: "Maximum withdrawal is ₱50,000" });
      }

      // Validate bank account
      const bankAccount = await storage.getUserBankAccount(userBankAccountId);
      if (!bankAccount || bankAccount.userId !== req.user!.id) {
        return res.status(400).json({ success: false, message: "Invalid bank account" });
      }

      // Get full user for PIN verification
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(401).json({ success: false, message: "User not found" });
      }

      // Use centralized PIN verification
      const pinResult = await verifyUserPin(user, pin, storage.updateUserPinAttempts.bind(storage));
      if (!pinResult.success) {
        return res.status(pinResult.statusCode).json({
          success: false,
          message: pinResult.message,
          requiresPin: pinResult.requiresPin,
          needsPinSetup: pinResult.needsPinSetup,
          lockedUntil: pinResult.lockedUntil,
          attemptsRemaining: pinResult.attemptsRemaining
        });
      }

      // Calculate service fee for bank withdrawal
      const serviceFee = calculateServiceFee("BANK_WITHDRAWAL", withdrawAmount);
      const totalDeduction = withdrawAmount + serviceFee;

      // Check PHPT balance
      const userCliId = user.username || user.email;
      const balanceResult = await getUserPhptBalance(userCliId);

      if (!balanceResult.success) {
        return res.status(503).json({
          success: false,
          message: "Unable to verify balance. Please try again."
        });
      }

      if (balanceResult.balance < totalDeduction) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. You have ₱${balanceResult.balance.toLocaleString()} but need ₱${totalDeduction.toLocaleString()} (₱${withdrawAmount.toLocaleString()} + ₱${serviceFee.toLocaleString()} fee).`
        });
      }

      // Transfer PHPT from user to admin escrow (hold funds including fee)
      console.log(`[Manual Withdrawal] Transferring ${totalDeduction} PHPT (${withdrawAmount} + ${serviceFee} fee) from ${userCliId} to escrow`);
      const transferResult = await transferToAdminWallet(userCliId, totalDeduction);

      if (!transferResult.success) {
        return res.status(400).json({
          success: false,
          message: transferResult.message || "Failed to process PHPT"
        });
      }

      // Create withdrawal request
      const withdrawal = await storage.createManualWithdrawal(user.id, {
        userBankAccountId,
        amount: withdrawAmount.toString(),
        phptTxId: transferResult.transactionId,
      });

      // Get full details for broadcasting
      const withdrawalWithDetails = await storage.getManualWithdrawalWithDetails(withdrawal.id);

      // Broadcast to admins
      broadcastNewWithdrawal(withdrawalWithDetails);

      // Create transaction record (includes fee)
      await storage.createTransaction({
        senderId: user.id,
        receiverId: null,
        amount: totalDeduction.toString(),
        type: "manual_withdrawal",
        status: "pending",
        walletType: "phpt",
        note: `Manual withdrawal to ${bankAccount.accountType.toUpperCase()} - ${bankAccount.accountNumber} (₱${serviceFee.toFixed(2)} fee)`,
      });

      console.log(`[Manual Withdrawal] Request created: ID ${withdrawal.id}, Amount: ${withdrawAmount}, Fee: ${serviceFee}, Total: ${totalDeduction}`);

      res.json({
        success: true,
        withdrawal: withdrawalWithDetails,
        fee: serviceFee,
        totalCharged: totalDeduction,
        message: `Withdrawal request submitted (₱${serviceFee.toFixed(2)} fee charged)`
      });
    } catch (error: any) {
      console.error("[Manual Withdrawal] Error submitting request:", error);
      res.status(500).json({ success: false, message: "Failed to submit withdrawal request" });
    }
  });

  // Get user's withdrawal history
  app.get("/api/manual/withdrawals/my", authMiddleware, async (req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getUserManualWithdrawals(req.user!.id);

      // Enrich with bank account details
      const enriched = await Promise.all(
        withdrawals.map(async (w) => {
          const bankAccount = await storage.getUserBankAccount(w.userBankAccountId);
          return { ...w, bankAccount };
        })
      );

      res.json(enriched);
    } catch (error: any) {
      console.error("[Manual Withdrawal] Error fetching user withdrawals:", error);
      res.status(500).json({ success: false, message: "Failed to fetch withdrawals" });
    }
  });

  // ==================== Admin Withdrawal Endpoints ====================

  const adminMiddleware = (req: Request, res: Response, next: Function) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    next();
  };

  // Get all withdrawals (admin)
  app.get("/api/manual/admin/withdrawals", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getAllManualWithdrawalsWithDetails();
      res.json(withdrawals);
    } catch (error: any) {
      console.error("[Admin Withdrawal] Error fetching all:", error);
      res.status(500).json({ success: false, message: "Failed to fetch withdrawals" });
    }
  });

  // Get pending withdrawals (admin)
  app.get("/api/manual/admin/withdrawals/pending", authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getPendingManualWithdrawalsWithDetails();
      res.json(withdrawals);
    } catch (error: any) {
      console.error("[Admin Withdrawal] Error fetching pending:", error);
      res.status(500).json({ success: false, message: "Failed to fetch pending withdrawals" });
    }
  });

  // Mark as processing (admin)
  app.post("/api/manual/admin/withdrawals/:id/process", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const withdrawalId = parseInt(req.params.id);
      const { adminNote } = processWithdrawalSchema.parse(req.body);

      const withdrawal = await storage.getManualWithdrawal(withdrawalId);
      if (!withdrawal) {
        return res.status(404).json({ success: false, message: "Withdrawal not found" });
      }

      if (withdrawal.status !== "pending") {
        return res.status(400).json({ success: false, message: `Cannot process a ${withdrawal.status} withdrawal` });
      }

      const updated = await storage.updateManualWithdrawalStatus(
        withdrawalId,
        "processing",
        req.user!.id,
        adminNote
      );

      // Get full details for broadcasting
      const withdrawalWithDetails = await storage.getManualWithdrawalWithDetails(withdrawalId);

      // Broadcast update
      broadcastWithdrawalUpdate(withdrawalWithDetails);

      // Create audit log
      await storage.createAuditLog({
        adminId: req.user!.id,
        action: "withdrawal_processing",
        targetType: "withdrawal",
        targetId: withdrawalId,
        details: `Marked withdrawal #${withdrawalId} as processing. Amount: ₱${withdrawal.amount}. User ID: ${withdrawal.userId}`,
      });

      console.log(`[Admin Withdrawal] #${withdrawalId} marked as processing by admin ${req.user!.id}`);

      res.json({ success: true, withdrawal: withdrawalWithDetails });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ success: false, message: error.errors[0].message });
      }
      console.error("[Admin Withdrawal] Error processing:", error);
      res.status(500).json({ success: false, message: "Failed to process withdrawal" });
    }
  });

  // Complete withdrawal (admin)
  app.post("/api/manual/admin/withdrawals/:id/complete", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const withdrawalId = parseInt(req.params.id);
      const { adminNote } = processWithdrawalSchema.parse(req.body);

      const withdrawal = await storage.getManualWithdrawal(withdrawalId);
      if (!withdrawal) {
        return res.status(404).json({ success: false, message: "Withdrawal not found" });
      }

      if (withdrawal.status !== "pending" && withdrawal.status !== "processing") {
        return res.status(400).json({ success: false, message: `Cannot complete a ${withdrawal.status} withdrawal` });
      }

      const updated = await storage.updateManualWithdrawalStatus(
        withdrawalId,
        "completed",
        req.user!.id,
        adminNote
      );

      // Get full details for broadcasting
      const withdrawalWithDetails = await storage.getManualWithdrawalWithDetails(withdrawalId);

      // Broadcast update
      broadcastWithdrawalUpdate(withdrawalWithDetails);

      // Create audit log
      await storage.createAuditLog({
        adminId: req.user!.id,
        action: "withdrawal_completed",
        targetType: "withdrawal",
        targetId: withdrawalId,
        details: `Completed withdrawal #${withdrawalId}. Amount: ₱${withdrawal.amount}. User ID: ${withdrawal.userId}`,
      });

      console.log(`[Admin Withdrawal] #${withdrawalId} completed by admin ${req.user!.id}`);

      res.json({ success: true, withdrawal: withdrawalWithDetails });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ success: false, message: error.errors[0].message });
      }
      console.error("[Admin Withdrawal] Error completing:", error);
      res.status(500).json({ success: false, message: "Failed to complete withdrawal" });
    }
  });

  // Reject withdrawal (admin) - refunds PHPT to user
  app.post("/api/manual/admin/withdrawals/:id/reject", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
    try {
      const withdrawalId = parseInt(req.params.id);
      const { rejectionReason } = rejectWithdrawalSchema.parse(req.body);

      const withdrawal = await storage.getManualWithdrawal(withdrawalId);
      if (!withdrawal) {
        return res.status(404).json({ success: false, message: "Withdrawal not found" });
      }

      if (withdrawal.status === "completed" || withdrawal.status === "rejected") {
        return res.status(400).json({ success: false, message: `Cannot reject a ${withdrawal.status} withdrawal` });
      }

      // Refund PHPT to user
      const user = await storage.getUser(withdrawal.userId);
      if (!user) {
        return res.status(400).json({ success: false, message: "User not found" });
      }

      const userCliId = user.username || user.email;
      const refundAmount = parseFloat(withdrawal.amount);

      console.log(`[Admin Withdrawal] Refunding ${refundAmount} PHPT to ${userCliId}`);
      const refundResult = await transferFromAdminWallet(userCliId, refundAmount);

      if (!refundResult.success) {
        console.error(`[Admin Withdrawal] Refund failed:`, refundResult.message);
        return res.status(500).json({
          success: false,
          message: `Failed to refund PHPT: ${refundResult.message}`
        });
      }

      // Update withdrawal status
      const updated = await storage.updateManualWithdrawalStatus(
        withdrawalId,
        "rejected",
        req.user!.id,
        undefined,
        rejectionReason
      );

      // Get full details for broadcasting
      const withdrawalWithDetails = await storage.getManualWithdrawalWithDetails(withdrawalId);

      // Broadcast update
      broadcastWithdrawalUpdate(withdrawalWithDetails);

      // Create audit log
      await storage.createAuditLog({
        adminId: req.user!.id,
        action: "withdrawal_rejected",
        targetType: "withdrawal",
        targetId: withdrawalId,
        details: `Rejected withdrawal #${withdrawalId}. Amount: ₱${withdrawal.amount}. User ID: ${withdrawal.userId}. Reason: ${rejectionReason}. PHPT refunded.`,
      });

      console.log(`[Admin Withdrawal] #${withdrawalId} rejected by admin ${req.user!.id}, PHPT refunded`);

      res.json({
        success: true,
        withdrawal: withdrawalWithDetails,
        message: "Withdrawal rejected and PHPT refunded"
      });
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ success: false, message: error.errors[0].message });
      }
      console.error("[Admin Withdrawal] Error rejecting:", error);
      res.status(500).json({ success: false, message: "Failed to reject withdrawal" });
    }
  });

  console.log("[Manual Withdrawals] Routes registered");
}
