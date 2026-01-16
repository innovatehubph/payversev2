/**
 * Email Service
 *
 * Sends transactional emails using SMTP credentials from system settings.
 * Features HTML templates with logo support.
 */

import nodemailer from "nodemailer";
import { getSystemSetting } from "./settings";

// Cache for transporter to avoid recreating on every email
let transporterCache: {
  transporter: nodemailer.Transporter | null;
  timestamp: number;
} = { transporter: null, timestamp: 0 };

const TRANSPORTER_CACHE_TTL = 300000; // 5 minutes

/**
 * Get or create email transporter using system settings
 */
async function getTransporter(): Promise<nodemailer.Transporter> {
  // Check cache
  if (transporterCache.transporter && Date.now() - transporterCache.timestamp < TRANSPORTER_CACHE_TTL) {
    return transporterCache.transporter;
  }

  // Get SMTP settings from database
  const host = await getSystemSetting("SMTP_HOST");
  const port = await getSystemSetting("SMTP_PORT", "587");
  const user = await getSystemSetting("SMTP_USER");
  const pass = await getSystemSetting("SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("Email service not configured. Please set SMTP settings in System Settings.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: parseInt(port) === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
  });

  // Verify connection
  try {
    await transporter.verify();
    console.log("[Email] SMTP connection verified successfully");
  } catch (error) {
    console.error("[Email] SMTP connection failed:", error);
    throw new Error("Email service connection failed. Please check SMTP settings.");
  }

  // Cache the transporter
  transporterCache = { transporter, timestamp: Date.now() };

  return transporter;
}

/**
 * Clear transporter cache (call when SMTP settings are updated)
 */
export function clearEmailCache(): void {
  transporterCache = { transporter: null, timestamp: 0 };
  console.log("[Email] Transporter cache cleared");
}

/**
 * Get email template wrapper with logo and styling
 */
async function getEmailTemplate(content: string, title: string): Promise<string> {
  const logoUrl = await getSystemSetting("EMAIL_LOGO_URL", "https://payverse.ph/logo.png");
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      margin: 0;
      padding: 0;
      background-color: #f3f4f6;
    }
    .wrapper {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .container {
      background-color: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
      padding: 32px;
      text-align: center;
    }
    .logo {
      max-width: 180px;
      height: auto;
    }
    .content {
      padding: 40px 32px;
    }
    .otp-box {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 2px dashed #3b82f6;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-code {
      font-size: 36px;
      font-weight: bold;
      letter-spacing: 8px;
      color: #1e3a8a;
      font-family: 'Courier New', monospace;
    }
    .otp-label {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .footer a {
      color: #3b82f6;
      text-decoration: none;
    }
    .warning {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }
    .warning p {
      margin: 0;
      color: #92400e;
      font-size: 14px;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      margin: 16px 0;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 16px 0;
      font-size: 24px;
    }
    p {
      margin: 0 0 16px 0;
      color: #4b5563;
    }
    .highlight {
      color: #3b82f6;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="PayVerse" class="logo" />
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>&copy; ${year} PayVerse. All rights reserved.</p>
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>If you didn't request this, please ignore this email or <a href="#">contact support</a>.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Send PIN Reset OTP email
 */
export async function sendPinResetOtp(
  email: string,
  fullName: string,
  otp: string,
  expiresInMinutes: number = 10
): Promise<boolean> {
  try {
    const transporter = await getTransporter();
    const fromAddress = await getSystemSetting("SMTP_FROM", "noreply@payverse.ph");

    const content = `
      <h1>Reset Your PIN</h1>
      <p>Hi <span class="highlight">${fullName}</span>,</p>
      <p>We received a request to reset your transaction PIN. Use the verification code below to proceed:</p>

      <div class="otp-box">
        <p class="otp-label">Your Verification Code</p>
        <p class="otp-code">${otp}</p>
      </div>

      <p>This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>

      <div class="warning">
        <p><strong>Security Notice:</strong> Never share this code with anyone. PayVerse staff will never ask for your PIN or verification codes.</p>
      </div>

      <p>If you didn't request a PIN reset, please secure your account immediately by changing your password.</p>
    `;

    const html = await getEmailTemplate(content, "Reset Your PIN - PayVerse");

    await transporter.sendMail({
      from: `"PayVerse" <${fromAddress}>`,
      to: email,
      subject: "Reset Your PIN - PayVerse",
      html,
    });

    console.log(`[Email] PIN reset OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send PIN reset OTP:", error);
    return false;
  }
}

/**
 * Send PIN Change OTP email
 */
export async function sendPinChangeOtp(
  email: string,
  fullName: string,
  otp: string,
  expiresInMinutes: number = 10
): Promise<boolean> {
  try {
    const transporter = await getTransporter();
    const fromAddress = await getSystemSetting("SMTP_FROM", "noreply@payverse.ph");

    const content = `
      <h1>Confirm PIN Change</h1>
      <p>Hi <span class="highlight">${fullName}</span>,</p>
      <p>You're attempting to change your transaction PIN. Please use the verification code below to confirm:</p>

      <div class="otp-box">
        <p class="otp-label">Your Verification Code</p>
        <p class="otp-code">${otp}</p>
      </div>

      <p>This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>

      <div class="warning">
        <p><strong>Security Notice:</strong> If you didn't request this change, someone may have access to your account. Please change your password immediately.</p>
      </div>
    `;

    const html = await getEmailTemplate(content, "Confirm PIN Change - PayVerse");

    await transporter.sendMail({
      from: `"PayVerse" <${fromAddress}>`,
      to: email,
      subject: "Confirm PIN Change - PayVerse",
      html,
    });

    console.log(`[Email] PIN change OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send PIN change OTP:", error);
    return false;
  }
}

/**
 * Send withdrawal status notification email
 */
export async function sendWithdrawalStatusEmail(
  email: string,
  fullName: string,
  status: "processing" | "completed" | "rejected",
  amount: string,
  accountInfo: string,
  rejectionReason?: string
): Promise<boolean> {
  try {
    const transporter = await getTransporter();
    const fromAddress = await getSystemSetting("SMTP_FROM", "noreply@payverse.ph");

    const statusMessages = {
      processing: {
        title: "Withdrawal In Progress",
        message: "Your withdrawal request is now being processed.",
        color: "#3b82f6",
      },
      completed: {
        title: "Withdrawal Completed",
        message: "Your withdrawal has been successfully processed.",
        color: "#10b981",
      },
      rejected: {
        title: "Withdrawal Rejected",
        message: "Unfortunately, your withdrawal request has been rejected.",
        color: "#ef4444",
      },
    };

    const { title, message, color } = statusMessages[status];

    const content = `
      <h1>${title}</h1>
      <p>Hi <span class="highlight">${fullName}</span>,</p>
      <p>${message}</p>

      <div class="otp-box" style="border-color: ${color};">
        <p class="otp-label">Withdrawal Details</p>
        <p class="otp-code" style="font-size: 24px; letter-spacing: 0; color: ${color};">₱${amount}</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">To: ${accountInfo}</p>
      </div>

      ${rejectionReason ? `
        <div class="warning" style="background-color: #fee2e2; border-left-color: #ef4444;">
          <p><strong>Reason:</strong> ${rejectionReason}</p>
          <p style="margin-top: 8px;">Your funds have been refunded to your PayVerse wallet.</p>
        </div>
      ` : ""}

      <p>If you have any questions, please contact our support team.</p>
    `;

    const html = await getEmailTemplate(content, `${title} - PayVerse`);

    await transporter.sendMail({
      from: `"PayVerse" <${fromAddress}>`,
      to: email,
      subject: `${title} - PayVerse`,
      html,
    });

    console.log(`[Email] Withdrawal ${status} notification sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send withdrawal notification:", error);
    return false;
  }
}

/**
 * Send welcome email to new users
 */
export async function sendWelcomeEmail(
  email: string,
  fullName: string
): Promise<boolean> {
  try {
    const transporter = await getTransporter();
    const fromAddress = await getSystemSetting("SMTP_FROM", "noreply@payverse.ph");

    const content = `
      <h1>Welcome to PayVerse!</h1>
      <p>Hi <span class="highlight">${fullName}</span>,</p>
      <p>Thank you for joining PayVerse. Your account has been created successfully.</p>

      <p>With PayVerse, you can:</p>
      <ul style="color: #4b5563; padding-left: 20px;">
        <li>Send and receive money instantly</li>
        <li>Top up using various payment methods</li>
        <li>Connect to gaming platforms</li>
        <li>Manage your digital wallet securely</li>
      </ul>

      <p style="text-align: center;">
        <a href="#" class="btn">Get Started</a>
      </p>

      <div class="warning">
        <p><strong>Important:</strong> Set up your transaction PIN in Settings → Security to enable large transfers and keep your account secure.</p>
      </div>
    `;

    const html = await getEmailTemplate(content, "Welcome to PayVerse");

    await transporter.sendMail({
      from: `"PayVerse" <${fromAddress}>`,
      to: email,
      subject: "Welcome to PayVerse!",
      html,
    });

    console.log(`[Email] Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send welcome email:", error);
    return false;
  }
}

/**
 * Test email configuration
 */
export async function testEmailConfiguration(testEmail: string): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = await getTransporter();
    const fromAddress = await getSystemSetting("SMTP_FROM", "noreply@payverse.ph");

    const content = `
      <h1>Email Test Successful</h1>
      <p>This is a test email from PayVerse.</p>
      <p>If you received this email, your SMTP configuration is working correctly.</p>

      <div class="otp-box">
        <p class="otp-label">Test Status</p>
        <p class="otp-code" style="font-size: 20px; letter-spacing: 0; color: #10b981;">SUCCESS</p>
      </div>
    `;

    const html = await getEmailTemplate(content, "Email Test - PayVerse");

    await transporter.sendMail({
      from: `"PayVerse" <${fromAddress}>`,
      to: testEmail,
      subject: "Email Test - PayVerse",
      html,
    });

    return { success: true, message: `Test email sent to ${testEmail}` };
  } catch (error: any) {
    return { success: false, message: error.message || "Failed to send test email" };
  }
}
