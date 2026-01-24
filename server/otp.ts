import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import { sendOtpEmail, sendWelcomeEmail } from "./email";
import { z } from "zod";

const router = Router();

function generateOtp(length: number = 6): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

function getExpiryTime(minutes: number = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

const requestOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  purpose: z.enum(["verification", "login", "password_reset", "transaction"]).default("verification"),
});

const verifyOtpSchema = z.object({
  email: z.string().email("Invalid email address"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  purpose: z.enum(["verification", "login", "password_reset", "transaction"]).default("verification"),
});

router.post("/request", async (req: Request, res: Response) => {
  try {
    const body = requestOtpSchema.parse(req.body);
    
    const otp = generateOtp();
    const expiresAt = getExpiryTime(10);
    
    await storage.createEmailOtp({
      email: body.email,
      otp,
      purpose: body.purpose,
      expiresAt,
    });
    
    const user = await storage.getUserByEmail(body.email);
    const name = user?.fullName || "User";
    
    const sent = await sendOtpEmail(body.email, name, otp, body.purpose);
    
    if (!sent) {
      return res.status(500).json({ message: "Failed to send OTP email. Please try again." });
    }
    
    res.json({ 
      success: true, 
      message: "OTP sent to your email",
      expiresIn: "10 minutes"
    });
  } catch (error: any) {
    console.error("[OTP] Failed to send OTP:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  try {
    const body = verifyOtpSchema.parse(req.body);

    const result = await storage.verifyEmailOtp(body.email, body.otp, body.purpose);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message || "Invalid or expired OTP"
      });
    }

    // If this is email verification, mark the user's email as verified
    if (body.purpose === "verification") {
      const user = await storage.getUserByEmail(body.email);
      if (user) {
        await storage.updateUserEmailVerified(user.id, true);
        console.log(`[OTP] Email verified for user ${user.id}`);
      }
    }

    res.json({
      success: true,
      message: body.purpose === "verification" ? "Email verified successfully" : "OTP verified successfully"
    });
  } catch (error: any) {
    console.error("[OTP] Failed to verify OTP:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to verify OTP" });
  }
});

// Resend verification email for logged-in users
router.post("/resend-verification", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified"
      });
    }

    const otp = generateOtp();
    const expiresAt = getExpiryTime(60); // 1 hour expiry

    await storage.createEmailOtp({
      email: user.email,
      otp,
      purpose: "verification",
      expiresAt,
    });

    const sent = await sendOtpEmail(user.email, user.fullName, otp, "verification");

    if (!sent) {
      return res.status(500).json({ message: "Failed to send verification email. Please try again." });
    }

    res.json({
      success: true,
      message: "Verification email sent",
      expiresIn: "1 hour"
    });
  } catch (error: any) {
    console.error("[OTP] Failed to resend verification:", error);
    res.status(500).json({ message: "Failed to send verification email" });
  }
});

router.post("/test/welcome", async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    const sent = await sendWelcomeEmail(email, name || "Test User");
    
    res.json({ 
      success: sent, 
      message: sent ? "Welcome email sent successfully" : "Failed to send welcome email" 
    });
  } catch (error: any) {
    console.error("[OTP] Failed to send test email:", error);
    res.status(500).json({ message: "Failed to send test email" });
  }
});

router.post("/test/otp", async (req: Request, res: Response) => {
  try {
    const { email, name, purpose } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    const otp = generateOtp();
    const sent = await sendOtpEmail(email, name || "Test User", otp, purpose || "verification");
    
    res.json({ 
      success: sent, 
      message: sent ? "OTP email sent successfully" : "Failed to send OTP email",
      otp: sent ? otp : undefined
    });
  } catch (error: any) {
    console.error("[OTP] Failed to send test OTP:", error);
    res.status(500).json({ message: "Failed to send test OTP" });
  }
});

export function registerOtpRoutes(app: any) {
  app.use("/api/otp", router);
  console.log("[OTP] Routes registered");
}
