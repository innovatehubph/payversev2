import { Router, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import { adminMiddleware, getAuditMetadata, adminRateLimiter, sensitiveActionRateLimiter } from "./admin";
import { transferFromAdminWallet } from "./paygram";
import { manualDepositSubmitSchema, manualDepositApproveSchema, manualDepositRejectSchema, insertManualPaymentMethodSchema } from "@shared/schema";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { sendDepositPendingEmail, sendDepositApprovedEmail, sendDepositRejectedEmail, sendCreditPendingEmail } from "./email";

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "proof-images");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ============= USER ROUTES =============

router.get("/payment-methods", authMiddleware, async (req: Request, res: Response) => {
  try {
    const methods = await storage.getActivePaymentMethods();
    res.json(methods);
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to get payment methods:", error);
    res.status(500).json({ message: "Failed to get payment methods" });
  }
});

router.post("/deposits", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = manualDepositSubmitSchema.parse(req.body);
    
    const paymentMethod = await storage.getPaymentMethod(body.paymentMethodId);
    if (!paymentMethod || !paymentMethod.isActive) {
      return res.status(400).json({ message: "Invalid payment method" });
    }
    
    const deposit = await storage.createManualDepositRequest({
      userId,
      paymentMethodId: body.paymentMethodId,
      amount: body.amount.toFixed(2),
      userNote: body.userNote,
      proofImageUrl: req.body.proofImageUrl || null,
    });
    
    // Send pending deposit email notification
    const user = await storage.getUser(userId);
    if (user) {
      sendDepositPendingEmail(user.email, user.fullName, body.amount.toFixed(2), paymentMethod.label).catch(err => {
        console.error("[ManualDeposits] Failed to send pending email:", err);
      });
    }
    
    res.json({ success: true, deposit });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to create deposit request:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create deposit request" });
  }
});

router.get("/deposits/my", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const deposits = await storage.getManualDepositsByUserId(userId);
    res.json(deposits);
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to get user deposits:", error);
    res.status(500).json({ message: "Failed to get deposits" });
  }
});

router.post("/upload-proof", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    if (!req.body.imageData) {
      return res.status(400).json({ message: "No image data provided" });
    }
    
    const base64Data = req.body.imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Image too large (max 5MB)" });
    }
    
    const extension = req.body.imageData.match(/^data:image\/(\w+);base64,/)?.[1] || "png";
    const filename = `proof-${userId}-${Date.now()}.${extension}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    
    fs.writeFileSync(filepath, buffer);
    
    const imageUrl = `/uploads/proof-images/${filename}`;
    res.json({ success: true, imageUrl });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to upload proof:", error);
    res.status(500).json({ message: "Failed to upload image" });
  }
});

// ============= ADMIN ROUTES =============

router.get("/admin/payment-methods", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const methods = await storage.getAllPaymentMethods();
    res.json(methods);
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to get all payment methods:", error);
    res.status(500).json({ message: "Failed to get payment methods" });
  }
});

router.post("/admin/payment-methods", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const body = insertManualPaymentMethodSchema.parse(req.body);
    const method = await storage.createPaymentMethod(body);
    
    const auditMeta = getAuditMetadata(req, "create_payment_method");
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: "create_payment_method",
      targetType: "payment_method",
      targetId: method.id,
      details: `Created payment method: ${method.label} (${method.providerType})`,
      ...auditMeta,
    });
    
    res.json({ success: true, method });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to create payment method:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create payment method" });
  }
});

router.patch("/admin/payment-methods/:id", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const method = await storage.updatePaymentMethod(id, req.body);
    
    if (!method) {
      return res.status(404).json({ message: "Payment method not found" });
    }
    
    const auditMeta = getAuditMetadata(req, "update_payment_method");
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: "update_payment_method",
      targetType: "payment_method",
      targetId: id,
      details: `Updated payment method: ${method.label}`,
      ...auditMeta,
    });
    
    res.json({ success: true, method });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to update payment method:", error);
    res.status(500).json({ message: "Failed to update payment method" });
  }
});

router.delete("/admin/payment-methods/:id", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const method = await storage.getPaymentMethod(id);
    
    if (!method) {
      return res.status(404).json({ message: "Payment method not found" });
    }
    
    await storage.deletePaymentMethod(id);
    
    const auditMeta = getAuditMetadata(req, "delete_payment_method");
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: "delete_payment_method",
      targetType: "payment_method",
      targetId: id,
      details: `Deleted payment method: ${method.label}`,
      ...auditMeta,
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to delete payment method:", error);
    res.status(500).json({ message: "Failed to delete payment method" });
  }
});

router.get("/admin/deposits", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const deposits = await storage.getAllManualDeposits();
    
    const depositsWithUsers = await Promise.all(
      deposits.map(async (deposit) => {
        const user = await storage.getUser(deposit.userId);
        const paymentMethod = await storage.getPaymentMethod(deposit.paymentMethodId);
        return {
          ...deposit,
          user: user ? { id: user.id, username: user.username, fullName: user.fullName, email: user.email } : null,
          paymentMethod: paymentMethod || null,
        };
      })
    );
    
    res.json(depositsWithUsers);
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to get all deposits:", error);
    res.status(500).json({ message: "Failed to get deposits" });
  }
});

router.get("/admin/deposits/pending", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const deposits = await storage.getPendingManualDeposits();
    
    const depositsWithUsers = await Promise.all(
      deposits.map(async (deposit) => {
        const user = await storage.getUser(deposit.userId);
        const paymentMethod = await storage.getPaymentMethod(deposit.paymentMethodId);
        return {
          ...deposit,
          user: user ? { id: user.id, username: user.username, fullName: user.fullName, email: user.email } : null,
          paymentMethod: paymentMethod || null,
        };
      })
    );
    
    res.json(depositsWithUsers);
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to get pending deposits:", error);
    res.status(500).json({ message: "Failed to get pending deposits" });
  }
});

router.post("/admin/deposits/:id/approve", authMiddleware, adminMiddleware, adminRateLimiter, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const body = manualDepositApproveSchema.parse(req.body);
    
    const deposit = await storage.getManualDepositRequest(id);
    if (!deposit) {
      return res.status(404).json({ message: "Deposit request not found" });
    }
    
    if (deposit.status !== "pending") {
      return res.status(400).json({ message: `Deposit already ${deposit.status}` });
    }
    
    const user = await storage.getUser(deposit.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const userCliId = user.username || user.email;
    const amount = parseFloat(deposit.amount);
    
    console.log(`[ManualDeposits] Approving deposit ${id} for user ${userCliId}, amount: ${amount} PHPT`);
    
    const transferResult = await transferFromAdminWallet(userCliId, amount);
    
    const paymentMethod = await storage.getPaymentMethod(deposit.paymentMethodId);
    const methodLabel = paymentMethod?.label || "Manual Deposit";
    
    if (!transferResult.success) {
      await storage.updateManualDepositStatus(id, "credit_pending", {
        adminId: req.user!.id,
        adminNote: `Approved but PHPT transfer failed: ${transferResult.message}`,
      });
      
      // Send credit pending email
      sendCreditPendingEmail(user.email, user.fullName, deposit.amount).catch(err => {
        console.error("[ManualDeposits] Failed to send credit pending email:", err);
      });
      
      return res.status(500).json({ 
        success: false, 
        message: `Deposit approved but PHPT transfer failed: ${transferResult.message}. Marked for retry.` 
      });
    }
    
    await storage.updateManualDepositStatus(id, "approved", {
      adminId: req.user!.id,
      adminNote: body.adminNote,
      paygramTxId: transferResult.transactionId || undefined,
    });

    // Use balanceService to credit local balance AND create transaction record atomically
    const { balanceService } = await import("./balance-service");
    await balanceService.creditFromPaygram({
      userId: deposit.userId,
      amount: amount,
      type: "manual_deposit",
      note: `Manual deposit approved by admin`,
      paygramTxId: transferResult.transactionId,
    });
    
    const auditMeta = getAuditMetadata(req, "approve_deposit");
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: "approve_manual_deposit",
      targetType: "manual_deposit",
      targetId: id,
      details: `Approved manual deposit of ${amount} PHPT for user ${user.username}`,
      ...auditMeta,
    });
    
    // Send deposit approved email
    sendDepositApprovedEmail(user.email, user.fullName, deposit.amount, methodLabel).catch(err => {
      console.error("[ManualDeposits] Failed to send approved email:", err);
    });
    
    res.json({ success: true, message: "Deposit approved and PHPT credited" });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to approve deposit:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to approve deposit" });
  }
});

router.get("/admin/deposits/credit-pending", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const deposits = await storage.getManualDepositsByStatus("credit_pending");
    
    const depositsWithUsers = await Promise.all(
      deposits.map(async (deposit) => {
        const user = await storage.getUser(deposit.userId);
        const paymentMethod = await storage.getPaymentMethod(deposit.paymentMethodId);
        return {
          ...deposit,
          user: user ? { id: user.id, username: user.username, fullName: user.fullName, email: user.email } : null,
          paymentMethod: paymentMethod || null,
        };
      })
    );
    
    res.json(depositsWithUsers);
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to get credit pending deposits:", error);
    res.status(500).json({ message: "Failed to get credit pending deposits" });
  }
});

router.post("/admin/deposits/:id/retry", authMiddleware, adminMiddleware, adminRateLimiter, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const deposit = await storage.getManualDepositRequest(id);
    if (!deposit) {
      return res.status(404).json({ message: "Deposit request not found" });
    }
    
    if (deposit.status !== "credit_pending") {
      return res.status(400).json({ message: `Cannot retry deposit with status: ${deposit.status}` });
    }
    
    const user = await storage.getUser(deposit.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const userCliId = user.username || user.email;
    const amount = parseFloat(deposit.amount);
    
    console.log(`[ManualDeposits] Retrying credit for deposit ${id}, user ${userCliId}, amount: ${amount} PHPT`);
    
    const transferResult = await transferFromAdminWallet(userCliId, amount);
    
    if (!transferResult.success) {
      await storage.updateManualDepositStatus(id, "credit_pending", {
        adminId: req.user!.id,
        adminNote: `Retry failed: ${transferResult.message}`,
      });
      
      return res.status(500).json({ 
        success: false, 
        message: `Retry failed: ${transferResult.message}` 
      });
    }
    
    await storage.updateManualDepositStatus(id, "approved", {
      adminId: req.user!.id,
      adminNote: "Successfully credited on retry",
      paygramTxId: transferResult.transactionId || undefined,
    });

    // Use balanceService to credit local balance AND create transaction record atomically
    const { balanceService } = await import("./balance-service");
    await balanceService.creditFromPaygram({
      userId: deposit.userId,
      amount: amount,
      type: "manual_deposit",
      note: `Manual deposit approved (retry)`,
      paygramTxId: transferResult.transactionId,
    });

    const auditMeta = getAuditMetadata(req, "approve_deposit");
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: "retry_manual_deposit",
      targetType: "manual_deposit",
      targetId: id,
      details: `Retried and credited ${amount} PHPT for user ${user.username}`,
      ...auditMeta,
    });
    
    // Send deposit approved email after successful retry
    const paymentMethod = await storage.getPaymentMethod(deposit.paymentMethodId);
    const methodLabel = paymentMethod?.label || "Manual Deposit";
    sendDepositApprovedEmail(user.email, user.fullName, deposit.amount, methodLabel).catch(err => {
      console.error("[ManualDeposits] Failed to send approved email after retry:", err);
    });
    
    res.json({ success: true, message: "Deposit credited successfully" });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to retry deposit:", error);
    res.status(500).json({ message: "Failed to retry deposit" });
  }
});

router.post("/admin/deposits/:id/reject", authMiddleware, adminMiddleware, adminRateLimiter, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const body = manualDepositRejectSchema.parse(req.body);
    
    const deposit = await storage.getManualDepositRequest(id);
    if (!deposit) {
      return res.status(404).json({ message: "Deposit request not found" });
    }
    
    if (deposit.status !== "pending") {
      return res.status(400).json({ message: `Deposit already ${deposit.status}` });
    }
    
    await storage.updateManualDepositStatus(id, "rejected", {
      adminId: req.user!.id,
      rejectionReason: body.rejectionReason,
    });
    
    const user = await storage.getUser(deposit.userId);
    
    const auditMeta = getAuditMetadata(req, "reject_deposit");
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: "reject_manual_deposit",
      targetType: "manual_deposit",
      targetId: id,
      details: `Rejected manual deposit of ${deposit.amount} PHPT for user ${user?.username || deposit.userId}: ${body.rejectionReason}`,
      ...auditMeta,
    });
    
    // Send rejection email
    if (user) {
      sendDepositRejectedEmail(user.email, user.fullName, deposit.amount, body.rejectionReason).catch(err => {
        console.error("[ManualDeposits] Failed to send rejection email:", err);
      });
    }
    
    res.json({ success: true, message: "Deposit rejected" });
  } catch (error: any) {
    console.error("[ManualDeposits] Failed to reject deposit:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to reject deposit" });
  }
});

export function registerManualDepositRoutes(app: any) {
  app.use("/api/manual", router);
  
  app.use("/uploads", (req: Request, res: Response, next: any) => {
    const uploadsPath = path.join(process.cwd(), "uploads");
    require("express").static(uploadsPath)(req, res, next);
  });
  
  console.log("[ManualDeposits] Routes registered");
}
