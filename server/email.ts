import nodemailer from "nodemailer";
import { getSystemSetting } from "./settings";

// Logo is served from the app's public folder - computed at runtime
async function getLogoUrl(): Promise<string> {
  const logoUrl = await getSystemSetting("EMAIL_LOGO_URL", "");
  if (logoUrl) return logoUrl;
  const appUrl = process.env.APP_URL || "https://payverse.ph";
  return `${appUrl}/payverse_logo.png`;
}

// Get the app base URL for email links
function getAppUrl(): string {
  return process.env.APP_URL || "https://payverse.ph";
}
const APP_NAME = "PayVerse";
const PRIMARY_COLOR = "#7C3AED";
const SUPPORT_EMAIL = "support@payverse.ph";

let transporter: nodemailer.Transporter | null = null;
let smtpConfigured = false;

// Initialize email transporter using database settings (called on first send)
async function getTransporter(): Promise<nodemailer.Transporter | null> {
  if (transporter && smtpConfigured) {
    return transporter;
  }

  // Try database settings first, fall back to environment variables
  const host = await getSystemSetting("SMTP_HOST", process.env.SMTP_HOST || "");
  const port = parseInt(await getSystemSetting("SMTP_PORT", process.env.SMTP_PORT || "587"));
  const user = await getSystemSetting("SMTP_USER", process.env.SMTP_USER || "");
  const pass = await getSystemSetting("SMTP_PASS", process.env.SMTP_PASS || "");

  if (!host || !user || !pass) {
    console.log("[Email] SMTP not configured - missing host, user, or password");
    return null;
  }

  console.log(`[Email] Configuring SMTP: ${host}:${port} (user: ${user})`);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false // Allow self-signed certificates
    }
  });

  smtpConfigured = true;
  return transporter;
}

// Legacy function for backward compatibility - initializes on startup using env vars only
export function initializeEmailTransporter() {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || "587");
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("[Email] SMTP not configured via env vars - will use database settings on demand");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });

  transporter.verify((error) => {
    if (error) {
      console.error("[Email] SMTP verification failed:", error.message);
    } else {
      console.log("[Email] SMTP connected and ready (from env vars)");
      smtpConfigured = true;
    }
  });

  return transporter;
}

// Clear cached transporter (call when SMTP settings are updated)
export function clearEmailTransporter() {
  transporter = null;
  smtpConfigured = false;
  console.log("[Email] Transporter cache cleared - will reload settings on next send");
}

async function getBaseTemplate(content: string, preheader?: string): Promise<string> {
  const logoUrl = await getLogoUrl();
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${APP_NAME}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; }
    .wrapper { width: 100%; background-color: #f4f4f5; padding: 40px 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #5B21B6 100%); padding: 32px 40px; text-align: center; }
    .header img { height: 40px; width: auto; }
    .content { padding: 40px; }
    .footer { background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6; }
    .footer a { color: ${PRIMARY_COLOR}; text-decoration: none; }
    h1 { margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #111827; }
    p { margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #4b5563; }
    .amount { font-size: 36px; font-weight: 700; color: ${PRIMARY_COLOR}; margin: 24px 0; }
    .amount-label { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }
    .status-approved { background-color: #dcfce7; color: #166534; }
    .status-rejected { background-color: #fee2e2; color: #991b1b; }
    .status-pending { background-color: #fef3c7; color: #92400e; }
    .btn { display: inline-block; padding: 14px 32px; background-color: ${PRIMARY_COLOR}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin-top: 24px; }
    .btn:hover { background-color: #6D28D9; }
    .details-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    .details-table td { padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .details-table td:first-child { color: #6b7280; font-size: 14px; }
    .details-table td:last-child { text-align: right; font-weight: 500; color: #111827; }
    .details-table tr:last-child td { border-bottom: none; }
    .highlight-box { background-color: #f5f3ff; border-left: 4px solid ${PRIMARY_COLOR}; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0; }
    .preheader { display: none !important; max-height: 0; overflow: hidden; mso-hide: all; }
  </style>
</head>
<body>
  ${preheader ? `<div class="preheader">${preheader}</div>` : ''}
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="${APP_NAME}" style="height: 40px; width: auto;" />
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>This email was sent by ${APP_NAME}</p>
        <p>If you have any questions, contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
        <p style="margin-top: 12px;">&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export const emailTemplates = {
  // Test email template for verifying SMTP configuration
  testEmail: async (data: { recipientName: string; testTime: string }) => ({
    subject: `${APP_NAME} Email Test - Configuration Verified`,
    html: await getBaseTemplate(`
      <h1>Email Configuration Test</h1>
      <p>Hi ${data.recipientName},</p>
      <p>This is a test email from ${APP_NAME}. If you're receiving this, your email configuration is working correctly!</p>

      <div class="highlight-box">
        <p style="margin: 0;"><strong>Test Details:</strong></p>
        <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563;">
          <li>Sent at: ${data.testTime}</li>
          <li>From: ${APP_NAME} System</li>
          <li>Status: Successfully delivered</li>
        </ul>
      </div>

      <p>Your SMTP settings are configured correctly. Email notifications will now work for:</p>
      <ul style="padding-left: 20px; color: #4b5563;">
        <li>Deposit approvals and rejections</li>
        <li>Transfer notifications</li>
        <li>OTP codes for verification</li>
        <li>Security alerts</li>
        <li>KYC status updates</li>
        <li>Withdrawal notifications</li>
      </ul>

      <div style="text-align: center;">
        <a href="https://payverse.ph/admin" class="btn">Go to Admin Panel</a>
      </div>
    `, `Email test successful - ${APP_NAME}`),
  }),

  depositApproved: async (data: { recipientName: string; amount: string; method: string }) => ({
    subject: `Your deposit of ₱${data.amount} has been approved!`,
    html: await getBaseTemplate(`
      <h1>Deposit Approved!</h1>
      <p>Hi ${data.recipientName},</p>
      <p>Great news! Your deposit request has been approved and the PHPT has been credited to your wallet.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Amount Credited</p>
        <p class="amount">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-approved">Approved</span>
      </div>
      
      <table class="details-table">
        <tr>
          <td>Payment Method</td>
          <td>${data.method}</td>
        </tr>
        <tr>
          <td>PHPT Credited</td>
          <td>${parseFloat(data.amount).toLocaleString()} PHPT</td>
        </tr>
        <tr>
          <td>Exchange Rate</td>
          <td>1 PHP = 1 PHPT</td>
        </tr>
      </table>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/dashboard" class="btn">View Your Wallet</a>
      </div>
    `, `Your deposit of ₱${data.amount} has been approved!`),
  }),

  depositRejected: async (data: { recipientName: string; amount: string; reason: string }) => ({
    subject: `Your deposit request was not approved`,
    html: await getBaseTemplate(`
      <h1>Deposit Request Update</h1>
      <p>Hi ${data.recipientName},</p>
      <p>We're sorry, but your deposit request could not be approved at this time.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Requested Amount</p>
        <p class="amount" style="color: #991b1b;">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-rejected">Not Approved</span>
      </div>
      
      <div class="highlight-box">
        <p style="margin: 0;"><strong>Reason:</strong> ${data.reason}</p>
      </div>
      
      <p>If you believe this was a mistake or have questions, please contact our support team. You may also submit a new deposit request with the correct information.</p>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/manual-deposit" class="btn">Try Again</a>
      </div>
    `, `Your deposit request was not approved`),
  }),

  depositPending: async (data: { recipientName: string; amount: string; method: string }) => ({
    subject: `Deposit request received - ₱${data.amount}`,
    html: await getBaseTemplate(`
      <h1>Deposit Request Received</h1>
      <p>Hi ${data.recipientName},</p>
      <p>We've received your deposit request and it's being reviewed by our team. You'll receive another email once it's processed.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Deposit Amount</p>
        <p class="amount">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-pending">Pending Review</span>
      </div>
      
      <table class="details-table">
        <tr>
          <td>Payment Method</td>
          <td>${data.method}</td>
        </tr>
        <tr>
          <td>Expected Credit</td>
          <td>${parseFloat(data.amount).toLocaleString()} PHPT</td>
        </tr>
        <tr>
          <td>Processing Time</td>
          <td>Usually within 24 hours</td>
        </tr>
      </table>
      
      <div class="highlight-box">
        <p style="margin: 0;"><strong>What's next?</strong> Our team will verify your payment proof and credit your wallet once approved.</p>
      </div>
    `, `We received your deposit request`),
  }),

  transferReceived: async (data: { recipientName: string; senderName: string; amount: string; note?: string }) => ({
    subject: `You received ₱${data.amount} from ${data.senderName}`,
    html: await getBaseTemplate(`
      <h1>Money Received!</h1>
      <p>Hi ${data.recipientName},</p>
      <p><strong>${data.senderName}</strong> just sent you money!</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Amount Received</p>
        <p class="amount" style="color: #166534;">+₱${parseFloat(data.amount).toLocaleString()}</p>
      </div>
      
      <table class="details-table">
        <tr>
          <td>From</td>
          <td>${data.senderName}</td>
        </tr>
        <tr>
          <td>Amount</td>
          <td>${parseFloat(data.amount).toLocaleString()} PHPT</td>
        </tr>
        ${data.note ? `<tr><td>Note</td><td>${data.note}</td></tr>` : ''}
      </table>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/dashboard" class="btn">View Your Wallet</a>
      </div>
    `, `${data.senderName} sent you ₱${data.amount}`),
  }),

  transferSent: async (data: { senderName: string; recipientName: string; amount: string; note?: string }) => ({
    subject: `You sent ₱${data.amount} to ${data.recipientName}`,
    html: await getBaseTemplate(`
      <h1>Transfer Successful</h1>
      <p>Hi ${data.senderName},</p>
      <p>Your transfer to <strong>${data.recipientName}</strong> was successful.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Amount Sent</p>
        <p class="amount">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-approved">Completed</span>
      </div>
      
      <table class="details-table">
        <tr>
          <td>To</td>
          <td>${data.recipientName}</td>
        </tr>
        <tr>
          <td>Amount</td>
          <td>${parseFloat(data.amount).toLocaleString()} PHPT</td>
        </tr>
        ${data.note ? `<tr><td>Note</td><td>${data.note}</td></tr>` : ''}
      </table>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/history" class="btn">View Transaction History</a>
      </div>
    `, `Transfer to ${data.recipientName} complete`),
  }),

  welcomeEmail: async (data: { userName: string }) => ({
    subject: `Welcome to ${APP_NAME}!`,
    html: await getBaseTemplate(`
      <h1>Welcome to ${APP_NAME}!</h1>
      <p>Hi ${data.userName},</p>
      <p>Thank you for joining PayVerse! Your account has been created successfully.</p>
      
      <div class="highlight-box">
        <p style="margin: 0;"><strong>What you can do:</strong></p>
        <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563;">
          <li>Send money instantly to other PayVerse users</li>
          <li>Deposit using QRPH (GCash, Maya, GrabPay)</li>
          <li>Deposit via manual P2P transfer</li>
          <li>Manage your PHPT cryptocurrency wallet</li>
        </ul>
      </div>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/dashboard" class="btn">Get Started</a>
      </div>
      
      <p style="margin-top: 24px;">If you need any help, our support team is here for you!</p>
    `, `Welcome to ${APP_NAME}!`),
  }),

  creditPendingNotice: async (data: { recipientName: string; amount: string }) => ({
    subject: `Your deposit is being processed - ₱${data.amount}`,
    html: await getBaseTemplate(`
      <h1>Deposit Processing</h1>
      <p>Hi ${data.recipientName},</p>
      <p>Your deposit has been approved, but there's a slight delay in crediting your PHPT. Our team is working on it.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Approved Amount</p>
        <p class="amount">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-pending">Processing</span>
      </div>
      
      <div class="highlight-box">
        <p style="margin: 0;">Your PHPT will be credited shortly. No action is needed from your side.</p>
      </div>
      
      <p>We'll notify you once the credit is complete. Thank you for your patience!</p>
    `, `Your deposit is being processed`),
  }),

  otpCode: async (data: { recipientName: string; otp: string; purpose: string }) => {
    const purposeLabels: Record<string, string> = {
      verification: "Email Verification",
      login: "Login Verification",
      password_reset: "Password Reset",
      transaction: "Transaction Verification",
      pin_change: "PIN Change Verification",
      pin_reset: "PIN Reset Verification",
      large_transfer: "Large Transfer Verification",
    };
    const purposeLabel = purposeLabels[data.purpose] || "Verification";
    
    return {
      subject: `${data.otp} is your ${APP_NAME} verification code`,
      html: await getBaseTemplate(`
        <h1>${purposeLabel}</h1>
        <p>Hi ${data.recipientName},</p>
        <p>Use the following code to complete your ${purposeLabel.toLowerCase()}. This code is valid for 10 minutes.</p>
        
        <div style="text-align: center; margin: 32px 0;">
          <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 24px; display: inline-block;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em;">Your verification code</p>
            <p style="margin: 0; font-size: 48px; font-weight: 700; color: ${PRIMARY_COLOR}; letter-spacing: 8px; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;">${data.otp}</p>
          </div>
        </div>
        
        <div class="highlight-box">
          <p style="margin: 0;"><strong>Security Tips:</strong></p>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #4b5563;">
            <li>Never share this code with anyone</li>
            <li>PayVerse staff will never ask for your code</li>
            <li>This code expires in 10 minutes</li>
          </ul>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email or contact support if you have concerns.</p>
      `, `Your ${APP_NAME} verification code is ${data.otp}`),
    };
  },

  securityAlert: async (data: { recipientName: string; alertType: string; message: string }) => ({
    subject: `Security Alert: ${data.alertType}`,
    html: await getBaseTemplate(`
      <h1>Security Alert</h1>
      <p>Hi ${data.recipientName},</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <span class="status-badge status-pending" style="font-size: 16px; padding: 12px 24px;">${data.alertType}</span>
      </div>
      
      <p>${data.message}</p>
      
      <div class="highlight-box">
        <p style="margin: 0;"><strong>Didn't make this change?</strong></p>
        <p style="margin: 8px 0 0 0;">If you didn't authorize this action, please contact our support team immediately at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      </div>
    `, data.alertType),
  }),

  newDeviceLogin: async (data: { recipientName: string; deviceInfo: string; ipAddress: string; loginTime: string }) => ({
    subject: `New device login to your ${APP_NAME} account`,
    html: await getBaseTemplate(`
      <h1>New Device Login Detected</h1>
      <p>Hi ${data.recipientName},</p>
      <p>We detected a new login to your PayVerse account from an unrecognized device.</p>
      
      <table class="details-table">
        <tr>
          <td>Device</td>
          <td>${data.deviceInfo}</td>
        </tr>
        <tr>
          <td>IP Address</td>
          <td>${data.ipAddress}</td>
        </tr>
        <tr>
          <td>Time</td>
          <td>${data.loginTime}</td>
        </tr>
      </table>
      
      <div class="highlight-box" style="background-color: #fef2f2; border-color: #dc2626;">
        <p style="margin: 0; color: #991b1b;"><strong>Was this you?</strong></p>
        <p style="margin: 8px 0 0 0; color: #991b1b;">If you didn't login from this device, please change your password immediately and contact support.</p>
      </div>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/settings" class="btn">Review Security Settings</a>
      </div>
    `, `New login from ${data.deviceInfo}`),
  }),

  withdrawalInitiated: async (data: { recipientName: string; amount: string; method: string }) => ({
    subject: `Withdrawal of ₱${data.amount} initiated`,
    html: await getBaseTemplate(`
      <h1>Withdrawal Initiated</h1>
      <p>Hi ${data.recipientName},</p>
      <p>Your withdrawal request has been submitted and is being processed.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Withdrawal Amount</p>
        <p class="amount">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-pending">Processing</span>
      </div>
      
      <table class="details-table">
        <tr>
          <td>Method</td>
          <td>${data.method}</td>
        </tr>
        <tr>
          <td>Expected Time</td>
          <td>Usually within 24 hours</td>
        </tr>
      </table>
      
      <p>You'll receive another email once the withdrawal is completed.</p>
    `, `Withdrawal of ₱${data.amount} initiated`),
  }),

  withdrawalCompleted: async (data: { recipientName: string; amount: string; method: string }) => ({
    subject: `Withdrawal of ₱${data.amount} completed`,
    html: await getBaseTemplate(`
      <h1>Withdrawal Completed</h1>
      <p>Hi ${data.recipientName},</p>
      <p>Great news! Your withdrawal has been completed successfully.</p>
      
      <div style="text-align: center;">
        <p class="amount-label">Amount Withdrawn</p>
        <p class="amount" style="color: #166534;">₱${parseFloat(data.amount).toLocaleString()}</p>
        <span class="status-badge status-approved">Completed</span>
      </div>
      
      <table class="details-table">
        <tr>
          <td>Method</td>
          <td>${data.method}</td>
        </tr>
      </table>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/history" class="btn">View Transaction History</a>
      </div>
    `, `Withdrawal of ₱${data.amount} completed`),
  }),

  kycApproved: async (data: { recipientName: string }) => ({
    subject: `Your identity verification is approved!`,
    html: await getBaseTemplate(`
      <h1>KYC Verification Approved!</h1>
      <p>Hi ${data.recipientName},</p>
      <p>Congratulations! Your identity verification (KYC) has been approved.</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <span class="status-badge status-approved" style="font-size: 18px; padding: 12px 28px;">Verified</span>
      </div>
      
      <div class="highlight-box">
        <p style="margin: 0;"><strong>What's next?</strong></p>
        <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563;">
          <li>Higher transaction limits are now available</li>
          <li>Access to all PayVerse features</li>
          <li>Priority customer support</li>
        </ul>
      </div>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/dashboard" class="btn">Go to Dashboard</a>
      </div>
    `, `Your KYC verification is approved!`),
  }),

  kycRejected: async (data: { recipientName: string; reason: string }) => ({
    subject: `Action required: KYC verification update`,
    html: await getBaseTemplate(`
      <h1>KYC Verification Update</h1>
      <p>Hi ${data.recipientName},</p>
      <p>Unfortunately, we couldn't verify your identity based on the documents you submitted.</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <span class="status-badge status-rejected" style="font-size: 16px; padding: 10px 24px;">Verification Needed</span>
      </div>
      
      <div class="highlight-box">
        <p style="margin: 0;"><strong>Reason:</strong></p>
        <p style="margin: 8px 0 0 0;">${data.reason}</p>
      </div>
      
      <p>Please resubmit your documents with the following in mind:</p>
      <ul style="padding-left: 20px; color: #4b5563;">
        <li>Ensure all document corners are visible</li>
        <li>Photos should be clear and well-lit</li>
        <li>Documents must be valid and not expired</li>
      </ul>
      
      <div style="text-align: center;">
        <a href="https://payverse.ph/kyc" class="btn">Resubmit Documents</a>
      </div>
    `, `Action required: KYC verification`),
  }),
};

export async function sendEmail(to: string, template: { subject: string; html: string }): Promise<boolean> {
  // Get transporter dynamically (reads from database settings)
  const emailTransporter = await getTransporter();

  if (!emailTransporter) {
    console.log("[Email] Skipping email - SMTP not configured");
    return false;
  }

  // Get from address from database settings or fall back to env vars
  const from = await getSystemSetting("SMTP_FROM", process.env.SMTP_FROM || "PayVerse <noreply@payverse.ph>");

  try {
    const info = await emailTransporter.sendMail({
      from,
      to,
      subject: template.subject,
      html: template.html,
    });
    console.log(`[Email] Sent to ${to}: ${template.subject} (${info.messageId})`);
    return true;
  } catch (error: any) {
    console.error(`[Email] Failed to send to ${to}:`, error.message);
    return false;
  }
}

export async function sendDepositApprovedEmail(email: string, name: string, amount: string, method: string) {
  const template = await emailTemplates.depositApproved({ recipientName: name, amount, method });
  return sendEmail(email, template);
}

export async function sendDepositRejectedEmail(email: string, name: string, amount: string, reason: string) {
  const template = await emailTemplates.depositRejected({ recipientName: name, amount, reason });
  return sendEmail(email, template);
}

export async function sendDepositPendingEmail(email: string, name: string, amount: string, method: string) {
  const template = await emailTemplates.depositPending({ recipientName: name, amount, method });
  return sendEmail(email, template);
}

export async function sendTransferReceivedEmail(email: string, recipientName: string, senderName: string, amount: string, note?: string) {
  const template = await emailTemplates.transferReceived({ recipientName, senderName, amount, note });
  return sendEmail(email, template);
}

export async function sendTransferSentEmail(email: string, senderName: string, recipientName: string, amount: string, note?: string) {
  const template = await emailTemplates.transferSent({ senderName, recipientName, amount, note });
  return sendEmail(email, template);
}

export async function sendWelcomeEmail(email: string, name: string) {
  const template = await emailTemplates.welcomeEmail({ userName: name });
  return sendEmail(email, template);
}

export async function sendCreditPendingEmail(email: string, name: string, amount: string) {
  const template = await emailTemplates.creditPendingNotice({ recipientName: name, amount });
  return sendEmail(email, template);
}

export async function sendOtpEmail(email: string, name: string, otp: string, purpose: string = "verification") {
  const template = await emailTemplates.otpCode({ recipientName: name, otp, purpose });
  return sendEmail(email, template);
}

export async function sendPasswordChangedEmail(email: string, name: string, changeType: string = "Password") {
  const template = await emailTemplates.securityAlert({
    recipientName: name,
    alertType: `${changeType} Changed`,
    message: `Your ${changeType.toLowerCase()} has been changed successfully. If you did not make this change, please contact support immediately.`
  });
  return sendEmail(email, template);
}

export async function sendPinSetupEmail(email: string, name: string) {
  const template = await emailTemplates.securityAlert({
    recipientName: name,
    alertType: "PIN Set Up",
    message: "Your transaction PIN has been set up successfully. You can now use your PIN to authorize transfers and withdrawals."
  });
  return sendEmail(email, template);
}

export async function sendNewDeviceLoginEmail(email: string, name: string, deviceInfo: string, ipAddress: string, loginTime: Date) {
  const template = await emailTemplates.newDeviceLogin({
    recipientName: name,
    deviceInfo,
    ipAddress,
    loginTime: loginTime.toLocaleString()
  });
  return sendEmail(email, template);
}

export async function sendWithdrawalInitiatedEmail(email: string, name: string, amount: string, method: string) {
  const template = await emailTemplates.withdrawalInitiated({ recipientName: name, amount, method });
  return sendEmail(email, template);
}

export async function sendWithdrawalCompletedEmail(email: string, name: string, amount: string, method: string) {
  const template = await emailTemplates.withdrawalCompleted({ recipientName: name, amount, method });
  return sendEmail(email, template);
}

export async function sendKycApprovedEmail(email: string, name: string) {
  const template = await emailTemplates.kycApproved({ recipientName: name });
  return sendEmail(email, template);
}

export async function sendKycRejectedEmail(email: string, name: string, reason: string) {
  const template = await emailTemplates.kycRejected({ recipientName: name, reason });
  return sendEmail(email, template);
}

// Send a test email to verify SMTP configuration
export async function sendTestEmail(email: string, name: string) {
  const testTime = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "Asia/Manila"
  });
  const template = await emailTemplates.testEmail({ recipientName: name, testTime });
  return sendEmail(email, template);
}
