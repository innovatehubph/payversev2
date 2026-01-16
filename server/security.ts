import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import { sendOtpEmail } from "./email";
import { setPinSchema, verifyPinSchema, changePinSchema, passwordResetRequestSchema, passwordResetConfirmSchema } from "@shared/schema";
import { sendPasswordChangedEmail, sendPinSetupEmail } from "./email";
import bcrypt from "bcrypt";
import { z } from "zod";
import crypto from "crypto";

const router = Router();

const LARGE_TRANSFER_THRESHOLD = 5000;
const PIN_LOCKOUT_DURATION = 30 * 60 * 1000;
const MAX_PIN_ATTEMPTS = 5;

function generateSecureOtp(length: number = 6): string {
  const bytes = crypto.randomBytes(length);
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += (bytes[i] % 10).toString();
  }
  return otp;
}

router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }
    
    res.json({
      hasPinSet: !!freshUser.pinHash,
      pinUpdatedAt: freshUser.pinUpdatedAt,
      kycStatus: freshUser.kycStatus,
      isLocked: freshUser.pinLockedUntil && new Date(freshUser.pinLockedUntil) > new Date(),
    });
  } catch (error: any) {
    console.error("[Security] Failed to get status:", error);
    res.status(500).json({ message: "Failed to get security status" });
  }
});

router.post("/pin/setup", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }
    
    if (freshUser.pinHash) {
      return res.status(400).json({ message: "PIN already set. Use change PIN instead." });
    }
    
    const body = setPinSchema.parse(req.body);
    
    const pinHash = await bcrypt.hash(body.pin, 10);
    
    await storage.updateUserPin(freshUser.id, pinHash);
    
    sendPinSetupEmail(freshUser.email, freshUser.fullName).catch(err => {
      console.error("[Security] Failed to send PIN setup email:", err);
    });
    
    res.json({ success: true, message: "PIN set successfully" });
  } catch (error: any) {
    console.error("[Security] Failed to setup PIN:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to setup PIN" });
  }
});

router.post("/pin/verify", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }
    
    if (!freshUser.pinHash) {
      return res.status(400).json({ message: "PIN not set. Please set up your PIN first." });
    }
    
    if (freshUser.pinLockedUntil && new Date(freshUser.pinLockedUntil) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(freshUser.pinLockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({ 
        message: `PIN locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
        lockedUntil: freshUser.pinLockedUntil
      });
    }
    
    const body = verifyPinSchema.parse(req.body);
    
    const isValid = await bcrypt.compare(body.pin, freshUser.pinHash);
    
    if (!isValid) {
      const newAttempts = (freshUser.pinFailedAttempts || 0) + 1;
      
      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + PIN_LOCKOUT_DURATION);
        await storage.updateUserPinAttempts(freshUser.id, newAttempts, lockUntil);
        return res.status(423).json({ 
          message: "Too many failed attempts. PIN locked for 30 minutes.",
          lockedUntil: lockUntil
        });
      }
      
      await storage.updateUserPinAttempts(freshUser.id, newAttempts, null);
      
      return res.status(401).json({ 
        message: `Invalid PIN. ${MAX_PIN_ATTEMPTS - newAttempts} attempts remaining.`,
        attemptsRemaining: MAX_PIN_ATTEMPTS - newAttempts
      });
    }
    
    await storage.updateUserPinAttempts(freshUser.id, 0, null);
    
    res.json({ success: true, message: "PIN verified" });
  } catch (error: any) {
    console.error("[Security] Failed to verify PIN:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to verify PIN" });
  }
});

router.post("/pin/change", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }
    
    if (!freshUser.pinHash) {
      return res.status(400).json({ message: "PIN not set. Please set up your PIN first." });
    }
    
    const body = changePinSchema.parse(req.body);
    
    const isCurrentPinValid = await bcrypt.compare(body.currentPin, freshUser.pinHash);
    if (!isCurrentPinValid) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }
    
    const otpResult = await storage.verifyEmailOtp(freshUser.email, body.otp, "pin_change");
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.message || "Invalid or expired OTP" });
    }
    
    const newPinHash = await bcrypt.hash(body.newPin, 10);
    await storage.updateUserPin(freshUser.id, newPinHash);
    
    sendPasswordChangedEmail(freshUser.email, freshUser.fullName, "PIN").catch(err => {
      console.error("[Security] Failed to send PIN change email:", err);
    });
    
    res.json({ success: true, message: "PIN changed successfully" });
  } catch (error: any) {
    console.error("[Security] Failed to change PIN:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to change PIN" });
  }
});

router.post("/pin/change/request-otp", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }
    
    const otp = generateSecureOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await storage.createEmailOtp({
      email: freshUser.email,
      otp,
      purpose: "pin_change",
      expiresAt,
    });
    
    const sent = await sendOtpEmail(freshUser.email, freshUser.fullName, otp, "pin_change");
    
    if (!sent) {
      return res.status(500).json({ message: "Failed to send OTP email" });
    }
    
    res.json({ success: true, message: "OTP sent to your email" });
  } catch (error: any) {
    console.error("[Security] Failed to request PIN change OTP:", error);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// Forgot PIN - Request OTP (no current PIN required)
router.post("/pin/reset/request", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }

    if (!freshUser.pinHash) {
      return res.status(400).json({ message: "No PIN set. Please set up a PIN first." });
    }

    const otp = generateSecureOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await storage.createEmailOtp({
      email: freshUser.email,
      otp,
      purpose: "pin_reset",
      expiresAt,
    });

    const sent = await sendOtpEmail(freshUser.email, freshUser.fullName, otp, "pin_reset");

    if (!sent) {
      return res.status(500).json({ message: "Failed to send OTP email. Please try again." });
    }

    console.log(`[Security] PIN reset OTP sent to ${freshUser.email}`);

    res.json({
      success: true,
      message: "Verification code sent to your email",
      email: freshUser.email.replace(/(.{2}).*(@.*)/, "$1***$2") // Mask email
    });
  } catch (error: any) {
    console.error("[Security] Failed to request PIN reset OTP:", error);
    res.status(500).json({ message: "Failed to send verification code" });
  }
});

// Forgot PIN - Confirm reset with OTP
router.post("/pin/reset/confirm", authMiddleware, async (req: Request, res: Response) => {
  try {
    const freshUser = await storage.getUser(req.user!.id);
    if (!freshUser) {
      return res.status(401).json({ message: "User not found" });
    }

    const { otp, newPin } = req.body;

    if (!otp || otp.length !== 6) {
      return res.status(400).json({ message: "Please enter a valid 6-digit verification code" });
    }

    if (!newPin || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      return res.status(400).json({ message: "Please enter a valid 6-digit PIN" });
    }

    // Verify OTP
    const otpResult = await storage.verifyEmailOtp(freshUser.email, otp, "pin_reset");
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.message || "Invalid or expired verification code" });
    }

    // Hash and update PIN
    const newPinHash = await bcrypt.hash(newPin, 10);
    await storage.updateUserPin(freshUser.id, newPinHash);

    // Reset any PIN lockout
    await storage.updateUserPinAttempts(freshUser.id, 0, null);

    // Send confirmation email
    sendPasswordChangedEmail(freshUser.email, freshUser.fullName, "PIN").catch(err => {
      console.error("[Security] Failed to send PIN reset confirmation email:", err);
    });

    console.log(`[Security] PIN reset successful for user ${freshUser.id}`);

    res.json({ success: true, message: "PIN reset successfully" });
  } catch (error: any) {
    console.error("[Security] Failed to reset PIN:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to reset PIN" });
  }
});

router.post("/password/reset/request", async (req: Request, res: Response) => {
  try {
    const body = passwordResetRequestSchema.parse(req.body);
    
    const user = await storage.getUserByEmail(body.email);
    
    res.json({ success: true, message: "If the email exists, you will receive a reset code." });
    
    if (!user) {
      return;
    }
    
    const otp = generateSecureOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    await storage.createEmailOtp({
      email: user.email,
      otp,
      purpose: "password_reset",
      expiresAt,
    });
    
    sendOtpEmail(user.email, user.fullName, otp, "password_reset").catch(err => {
      console.error("[Security] Failed to send password reset OTP:", err);
    });
  } catch (error: any) {
    console.error("[Security] Failed to request password reset:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to process request" });
  }
});

router.post("/password/reset/confirm", async (req: Request, res: Response) => {
  try {
    const body = passwordResetConfirmSchema.parse(req.body);
    
    const user = await storage.getUserByEmail(body.email);
    if (!user) {
      return res.status(400).json({ message: "Invalid request" });
    }
    
    const otpResult = await storage.verifyEmailOtp(body.email, body.otp, "password_reset");
    if (!otpResult.valid) {
      return res.status(400).json({ message: otpResult.message || "Invalid or expired OTP" });
    }
    
    const hashedPassword = await bcrypt.hash(body.newPassword, 10);
    await storage.updateUserPassword(user.id, hashedPassword);
    
    sendPasswordChangedEmail(user.email, user.fullName, "Password").catch(err => {
      console.error("[Security] Failed to send password change email:", err);
    });
    
    res.json({ success: true, message: "Password reset successfully. You can now login with your new password." });
  } catch (error: any) {
    console.error("[Security] Failed to reset password:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to reset password" });
  }
});

export function getLargeTransferThreshold(): number {
  return LARGE_TRANSFER_THRESHOLD;
}

export function registerSecurityRoutes(app: any) {
  app.use("/api/security", router);
  console.log("[Security] Routes registered");
}
