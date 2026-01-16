import type { Express, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { authMiddleware } from "./auth";
import { storage } from "./storage";
import { transferFromAdminWallet, transferToAdminWallet, getUserPhptBalance } from "./paygram";
import { adminRateLimiter, sensitiveActionRateLimiter } from "./admin";
import { balanceService } from "./balance-service";
import { getSystemSetting } from "./settings";

interface NexusPayConfig {
  baseUrl: string;
  username: string;
  password: string;
  merchantId: string;
  key: string;
}

// Cache for config to avoid repeated DB queries
let configCache: { config: NexusPayConfig | null; timestamp: number } | null = null;
const CONFIG_CACHE_TTL = 30000; // 30 seconds

async function getConfig(): Promise<NexusPayConfig | null> {
  // Check cache first
  if (configCache && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL) {
    return configCache.config;
  }

  // Load from database (falls back to env vars)
  const baseUrl = await getSystemSetting("NEXUSPAY_BASE_URL", "https://nexuspay.cloud");
  const username = await getSystemSetting("NEXUSPAY_USERNAME", "");
  const password = await getSystemSetting("NEXUSPAY_PASSWORD", "");
  const merchantId = await getSystemSetting("NEXUSPAY_MERCHANT_ID", "");
  const key = await getSystemSetting("NEXUSPAY_KEY", "");

  if (!username || !password || !merchantId || !key) {
    console.error("[NexusPay] Configuration incomplete - missing:", {
      username: !username,
      password: !password,
      merchantId: !merchantId,
      key: !key
    });
    configCache = { config: null, timestamp: Date.now() };
    return null;
  }

  const config = { baseUrl, username, password, merchantId, key };
  configCache = { config, timestamp: Date.now() };
  return config;
}

// Clear config cache (call when settings are updated)
export function clearNexusPayConfigCache(): void {
  configCache = null;
}

interface CSRFSession {
  csrfToken: string;
  sessionCookie: string;
}

async function getCSRFSession(baseUrl: string): Promise<CSRFSession | null> {
  try {
    console.log(`[NexusPay] Step 1: Getting CSRF token from ${baseUrl}/api/csrf_token`);

    const response = await fetch(`${baseUrl}/api/csrf_token`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "PayVerse/1.0"
      }
    });
    
    console.log(`[NexusPay] CSRF response status: ${response.status}`);
    
    // Extract session cookie (PHPSESSID) - this is required for the login request
    let sessionCookie = "";
    const cookies = response.headers.get("set-cookie");
    if (cookies) {
      console.log("[NexusPay] Cookies received:", cookies.substring(0, 150));
      const phpSessionMatch = cookies.match(/PHPSESSID=([^;]+)/);
      if (phpSessionMatch) {
        sessionCookie = `PHPSESSID=${phpSessionMatch[1]}`;
        console.log("[NexusPay] Session cookie extracted");
      }
    }
    
    if (!sessionCookie) {
      console.error("[NexusPay] No PHPSESSID cookie received");
      return null;
    }
    
    // Extract CSRF token from response body
    const text = await response.text();
    console.log("[NexusPay] CSRF response body:", text.substring(0, 200));
    
    let csrfToken = "";
    if (text) {
      try {
        const data = JSON.parse(text);
        csrfToken = data.csrf_token || data.csrfToken || data.token || "";
        if (csrfToken) {
          console.log("[NexusPay] CSRF token extracted from JSON");
        }
      } catch {
        console.error("[NexusPay] Failed to parse CSRF response as JSON");
      }
    }
    
    if (!csrfToken) {
      console.error("[NexusPay] No CSRF token in response body");
      return null;
    }
    
    console.log("[NexusPay] CSRF session obtained successfully");
    return { csrfToken, sessionCookie };
  } catch (error) {
    console.error("[NexusPay] Failed to get CSRF session:", error);
    return null;
  }
}

interface AuthSession {
  token: string;
  sessionCookie: string;
}

async function getFreshAuthSession(): Promise<AuthSession | null> {
  const config = await getConfig();
  if (!config) {
    console.error("[NexusPay] Cannot login - configuration missing");
    return null;
  }

  try {
    // Get CSRF session (token + session cookie)
    const csrfSession = await getCSRFSession(config.baseUrl);

    if (!csrfSession) {
      console.error("[NexusPay] CSRF session request failed");
      return null;
    }

    console.log(`[NexusPay] Step 2: Logging in to get fresh auth token`);

    // Include the session cookie with the CSRF token
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "PayVerse/1.0",
      "X-CSRF-TOKEN": csrfSession.csrfToken,
      "Cookie": csrfSession.sessionCookie
    };

    const loginBody = {
      username: config.username,
      password: config.password
    };

    console.log(`[NexusPay] Login request to ${config.baseUrl}/api/create/login`);
    console.log(`[NexusPay] Using session cookie: ${csrfSession.sessionCookie.substring(0, 30)}...`);

    const response = await fetch(`${config.baseUrl}/api/create/login`, {
      method: "POST",
      headers,
      body: JSON.stringify(loginBody)
    });

    console.log(`[NexusPay] Login response status: ${response.status}`);
    
    // Capture any additional cookies from login response
    let allCookies = csrfSession.sessionCookie;
    const loginCookies = response.headers.get("set-cookie");
    if (loginCookies) {
      console.log("[NexusPay] Login cookies received:", loginCookies.substring(0, 150));
      // Parse all cookies and merge with session cookie
      const cookieMatches = loginCookies.match(/([^=;\s]+)=([^;]+)/g);
      if (cookieMatches) {
        for (const cookie of cookieMatches) {
          if (!allCookies.includes(cookie.split('=')[0])) {
            allCookies += `; ${cookie}`;
          }
        }
      }
    }
    console.log("[NexusPay] Combined cookies:", allCookies.substring(0, 80));
    
    const text = await response.text();
    console.log("[NexusPay] Login response:", text.substring(0, 500));

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("[NexusPay] Failed to parse login response as JSON:", text.substring(0, 200));
      return null;
    }

    if (data.status === "success" && data.data?.token) {
      console.log("[NexusPay] Login successful, got fresh token");
      // Add token as api_key cookie as well (in case NexusPay expects it there)
      const cookiesWithApiKey = `${allCookies}; api_key=${data.data.token}`;
      return { 
        token: data.data.token,
        sessionCookie: cookiesWithApiKey
      };
    }

    console.error("[NexusPay] Login failed:", data.message || "Unknown error");
    return null;
  } catch (error) {
    console.error("[NexusPay] Login error:", error);
    return null;
  }
}

// Backward compatible function that returns just the token
async function getFreshAuthToken(): Promise<string | null> {
  const session = await getFreshAuthSession();
  return session?.token || null;
}

function encryptPayload(payload: object, config: NexusPayConfig): string {
  // AES-128-CBC encryption (Key Size: 128 bits = 16 bytes)
  // IV = Merchant ID (16 bytes)
  // Secret Key = Merchant Key (16 bytes)
  // Padding: PKCS5Padding (handled automatically by Node.js crypto)

  const keyBuffer = Buffer.from(config.key, "utf8");
  const ivBuffer = Buffer.from(config.merchantId, "utf8");
  
  // Validate key and IV lengths for AES-128
  if (keyBuffer.length !== 16) {
    console.error(`[NexusPay] Key length must be 16 bytes for AES-128, got ${keyBuffer.length}`);
    throw new Error("Invalid merchant key length");
  }
  if (ivBuffer.length !== 16) {
    console.error(`[NexusPay] IV length must be 16 bytes, got ${ivBuffer.length}`);
    throw new Error("Invalid merchant ID length");
  }

  const cipher = crypto.createCipheriv("aes-128-cbc", keyBuffer, ivBuffer);
  const jsonPayload = JSON.stringify(payload);
  
  let encrypted = cipher.update(jsonPayload, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  console.log("[NexusPay] Payload encrypted with AES-128-CBC successfully");
  return encrypted;
}

export function registerNexusPayRoutes(app: Express) {
  app.get("/api/nexuspay/status", authMiddleware, async (req: Request, res: Response) => {
    const config = await getConfig();
    if (!config) {
      return res.json({
        configured: false,
        authenticated: false,
        message: "NexusPay is not configured - missing credentials"
      });
    }

    try {
      const token = await getFreshAuthToken();
      return res.json({
        configured: true,
        authenticated: !!token,
        message: token ? "NexusPay is ready" : "Authentication failed - check logs"
      });
    } catch (error: any) {
      return res.json({
        configured: true,
        authenticated: false,
        message: `Authentication error: ${error.message}`
      });
    }
  });

  app.post("/api/nexuspay/cashin", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { amount } = req.body;

      // NexusPay requires minimum ₱100 for cash-in
      if (!amount || parseFloat(amount) < 100) {
        return res.status(400).json({
          success: false,
          message: "Minimum amount is ₱100"
        });
      }

      console.log(`[NexusPay] === Starting Cash-In Request for ₱${amount} ===`);

      const config = await getConfig();
      if (!config) {
        return res.status(503).json({
          success: false,
          message: "Payment gateway not configured. Please contact support."
        });
      }

      const token = await getFreshAuthToken();
      if (!token) {
        return res.status(503).json({
          success: false,
          message: "Payment gateway authentication failed. Please try again later."
        });
      }

      // Use PUBLIC_APP_URL for production, fallback to dev domain or default
      const appBaseUrl = process.env.PUBLIC_APP_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        || "https://payverse.ph";

      const webhookUrl = `${appBaseUrl}/api/nexuspay/webhook`;
      console.log(`[NexusPay] Using webhook URL: ${webhookUrl}`);
      const redirectUrl = `${appBaseUrl}/qrph?status=success`;

      console.log(`[NexusPay] Step 3: Creating GCash cash-in for ₱${amount}`);
      console.log(`[NexusPay] Webhook: ${webhookUrl}`);
      console.log(`[NexusPay] Redirect: ${redirectUrl}`);

      const response = await fetch(`${config.baseUrl}/api/pay_cashin`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "PayVerse/1.0"
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          webhook: webhookUrl,
          redirectUrl: redirectUrl
        })
      });

      console.log(`[NexusPay] Cash-in response status: ${response.status}`);
      
      const text = await response.text();
      console.log("[NexusPay] Cash-in response length:", text.length);
      console.log("[NexusPay] Cash-in response:", text.substring(0, 2000));

      if (!text || text.trim().length === 0) {
        console.error("[NexusPay] Empty response from API");
        return res.status(500).json({
          success: false,
          message: "Empty response from payment gateway"
        });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("[NexusPay] JSON parse error:", parseError);
        console.error("[NexusPay] Response text:", text.substring(0, 500));
        return res.status(500).json({
          success: false,
          message: "Invalid response from payment gateway",
          debug: process.env.NODE_ENV === "development" ? text.substring(0, 200) : undefined
        });
      }

      if (data.status === "success" && data.link) {
        // Create pending transaction - senderId is null (external), receiverId is the user
        await storage.createTransaction({
          senderId: null, // External payment source
          receiverId: req.user!.id,
          amount: String(amount),
          type: "qrph_cashin",
          status: "pending",
          note: `GCash QR payment - ${data.transactionId || 'pending'}`,
          walletType: "phpt", // Will receive PHPT after payment confirmation
          externalTxId: data.transactionId || null,
        });

        console.log(`[NexusPay] Cash-in created successfully: ${data.transactionId}`);

        return res.json({
          success: true,
          paymentUrl: data.link,
          transactionId: data.transactionId,
          qrphraw: data.qrphraw || null,
          amount: parseFloat(amount),
          message: "Scan QR code with your GCash app to complete payment"
        });
      }

      console.error("[NexusPay] Cash-in failed:", data);
      return res.json({
        success: false,
        message: data.message || "Failed to create payment request",
        debug: process.env.NODE_ENV === "development" ? data : undefined
      });
    } catch (error: any) {
      console.error("[NexusPay] Cash-in error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Payment processing failed"
      });
    }
  });

  app.get("/api/nexuspay/cashin-status/:transactionId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;

      console.log(`[NexusPay] Checking cash-in status for: ${transactionId}`);

      const config = await getConfig();
      if (!config) {
        return res.status(503).json({
          success: false,
          message: "Payment gateway not configured"
        });
      }

      const token = await getFreshAuthToken();
      if (!token) {
        return res.status(503).json({
          success: false,
          message: "Authentication failed"
        });
      }

      const response = await fetch(`${config.baseUrl}/api/cashin_transactions_status/${transactionId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
          "User-Agent": "PayVerse/1.0"
        }
      });

      const text = await response.text();
      console.log("[NexusPay] Cash-in status response:", text);
      
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(500).json({ success: false, message: "Invalid response" });
      }

      // Check multiple possible status fields from NexusPay response
      const txStatus = (data.transaction_status || data.transaction_state || data.status || "").toString().toLowerCase();
      const successStatuses = ["success", "successful", "completed", "paid"];

      const isPaymentSuccessful = successStatuses.includes(txStatus);

      console.log(`[NexusPay] Status check: txStatus="${txStatus}", isPaymentSuccessful=${isPaymentSuccessful}, data.success=${data.success}`);
      
      // If payment is successful, trigger the credit flow (same as webhook)
      if (isPaymentSuccessful) {
        console.log(`[NexusPay] Status check detected successful payment: ${transactionId}`);
        
        // Find the pending transaction
        const pendingTx = await storage.findPendingQrphTransaction(transactionId);
        
        if (pendingTx && pendingTx.receiverId && pendingTx.status === "pending") {
          // IDEMPOTENCY: Mark as "processing" first to prevent duplicate credits from webhook/poll race
          const claimed = await storage.claimQrphTransaction(pendingTx.id);
          if (!claimed) {
            console.log(`[NexusPay] Transaction ${pendingTx.id} already being processed`);
            return res.json({
              success: data.success,
              referenceNumber: data.reference_number,
              amount: data.total_amount,
              status: "processing",
              message: "Payment being processed"
            });
          }
          
          console.log(`[NexusPay] Claimed tx ${pendingTx.id}, processing credit...`);
          
          const user = await storage.getUser(pendingTx.receiverId!);
          if (!user) {
            console.error(`[NexusPay] User not found for transaction ${pendingTx.id}, reverting to pending`);
            await storage.updateTransactionStatus(pendingTx.id, "pending");
            return res.json({
              success: data.success,
              referenceNumber: data.reference_number,
              amount: data.total_amount,
              status: "pending",
              message: "Payment confirmed but credit pending - user not found"
            });
          }
          
          const userCliId = user.username || user.email;
          const txAmount = parseFloat(data.total_amount || pendingTx.amount || "0");
          
          if (txAmount <= 0) {
            console.error(`[NexusPay] Invalid amount ${txAmount}, reverting to pending`);
            await storage.updateTransactionStatus(pendingTx.id, "pending");
            return res.json({
              success: data.success,
              referenceNumber: data.reference_number,
              amount: data.total_amount,
              status: "pending",
              message: "Payment confirmed but credit pending - invalid amount"
            });
          }
          
          console.log(`[NexusPay] Crediting ${txAmount} PHPT to ${userCliId} from status check`);
          
          // Transfer PHPT from admin wallet to user
          const transferResult = await transferFromAdminWallet(userCliId, txAmount);
          
          if (transferResult.success) {
            // Mark original qrph_cashin as completed
            await storage.updateTransactionStatus(pendingTx.id, "completed");

            // Use balanceService for atomic balance update + transaction record
            try {
              const creditResult = await balanceService.creditFromPaygram({
                userId: pendingTx.receiverId!,
                amount: txAmount,
                type: "qrph_credit",
                note: `PHPT credited from QRPH payment ${transactionId}`,
                paygramTxId: transferResult.transactionId,
              });
              console.log(`[NexusPay] Local balance updated via balanceService: PHPT ${creditResult.newBalance}`);
            } catch (balanceError) {
              console.error(`[NexusPay] Failed to update local balance:`, balanceError);
              // Don't fail the whole operation - PayGram transfer succeeded
            }

            console.log(`[NexusPay] Successfully credited ${txAmount} PHPT via status check`);

            // Return success with completed status
            return res.json({
              success: true,
              referenceNumber: data.reference_number,
              amount: data.total_amount,
              status: "completed",
              message: `${txAmount} PHPT credited successfully`
            });
          } else {
            // Transfer failed, revert to pending for retry
            console.error(`[NexusPay] Failed to credit PHPT:`, transferResult.message);
            await storage.updateTransactionStatus(pendingTx.id, "pending");
            
            return res.json({
              success: data.success,
              referenceNumber: data.reference_number,
              amount: data.total_amount,
              status: "pending",
              message: `Payment confirmed but credit pending: ${transferResult.message}`
            });
          }
        } else if (pendingTx && (pendingTx.status === "completed" || pendingTx.status === "processing")) {
          console.log(`[NexusPay] Transaction ${pendingTx.id} already ${pendingTx.status}`);
        }
      }

      return res.json({
        success: data.success,
        referenceNumber: data.reference_number,
        amount: data.total_amount,
        status: data.transaction_status || data.transaction_state || data.status,
        message: data.message
      });
    } catch (error: any) {
      console.error("[NexusPay] Status check error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // QRPH Payout - Convert PHPT to PHP via NexusPay
  // Flow: 1. Transfer PHPT from user to admin wallet → 2. NexusPay sends PHP to user's e-wallet
  app.post("/api/nexuspay/cashout", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { amount, accountNumber, accountName, provider = "gcash", pin } = req.body;
      const payoutAmount = parseFloat(amount);

      if (!amount || payoutAmount < 1) {
        return res.status(400).json({
          success: false,
          message: "Minimum payout is ₱1"
        });
      }

      if (!accountNumber) {
        return res.status(400).json({
          success: false,
          message: "Account number is required"
        });
      }

      // Get full user record for PIN verification
      const fullUser = await storage.getUser(req.user!.id);
      if (!fullUser) {
        return res.status(401).json({ success: false, message: "User not found" });
      }

      // PIN verification required for cashout transactions
      if (!fullUser.pinHash) {
        return res.status(400).json({
          success: false,
          message: "PIN required. Please set up your PIN in Security settings first.",
          requiresPin: true,
          needsPinSetup: true
        });
      }

      if (!pin) {
        return res.status(400).json({
          success: false,
          message: "PIN required for cashout transactions",
          requiresPin: true
        });
      }

      // Check PIN lockout
      if (fullUser.pinLockedUntil && new Date(fullUser.pinLockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(fullUser.pinLockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({
          success: false,
          message: `PIN locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
          lockedUntil: fullUser.pinLockedUntil
        });
      }

      // Verify PIN
      const isValidPin = await bcrypt.compare(pin, fullUser.pinHash);
      if (!isValidPin) {
        const newAttempts = (fullUser.pinFailedAttempts || 0) + 1;
        const maxAttempts = 5;

        if (newAttempts >= maxAttempts) {
          const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
          await storage.updateUserPinAttempts(fullUser.id, newAttempts, lockUntil);
          return res.status(423).json({
            success: false,
            message: "Too many failed PIN attempts. PIN locked for 30 minutes.",
            lockedUntil: lockUntil
          });
        }

        await storage.updateUserPinAttempts(fullUser.id, newAttempts, null);
        return res.status(401).json({
          success: false,
          message: `Invalid PIN. ${maxAttempts - newAttempts} attempts remaining.`,
          attemptsRemaining: maxAttempts - newAttempts
        });
      }

      // Reset failed attempts on success
      await storage.updateUserPinAttempts(fullUser.id, 0, null);

      const userCliId = req.user!.username || req.user!.email;
      console.log(`[QRPH Payout] === Starting for user ${userCliId}: ${payoutAmount} PHPT → ₱${payoutAmount} to ${accountNumber} via ${provider} ===`);

      // Step 1: Check user's PHPT balance first (fail early if insufficient)
      console.log(`[QRPH Payout] Step 1: Checking user's PHPT balance`);
      const balanceResult = await getUserPhptBalance(userCliId);
      
      if (!balanceResult.success) {
        console.error(`[QRPH Payout] Failed to check balance:`, balanceResult.message);
        return res.status(503).json({
          success: false,
          message: "Unable to verify balance. Please try again."
        });
      }

      if (balanceResult.balance < payoutAmount) {
        console.log(`[QRPH Payout] Insufficient balance: ${balanceResult.balance} < ${payoutAmount}`);
        return res.status(400).json({
          success: false,
          message: `Insufficient PHPT balance. You have ${balanceResult.balance.toFixed(2)} PHPT but need ${payoutAmount.toFixed(2)} PHPT.`
        });
      }

      console.log(`[QRPH Payout] Balance OK: ${balanceResult.balance} PHPT`);

      // Step 2: Transfer PHPT from user to admin wallet
      console.log(`[QRPH Payout] Step 2: Transferring ${payoutAmount} PHPT from user to admin wallet`);
      const transferResult = await transferToAdminWallet(userCliId, payoutAmount);
      
      if (!transferResult.success) {
        console.error(`[QRPH Payout] PHPT transfer failed:`, transferResult.message);
        return res.status(400).json({
          success: false,
          message: transferResult.message || "Failed to process PHPT. Please check your balance."
        });
      }

      console.log(`[QRPH Payout] PHPT transferred to admin wallet. TransactionId: ${transferResult.transactionId}`);
      const phptTransactionId = transferResult.transactionId;

      // Step 3: Get NexusPay auth session (token + session cookie)
      console.log(`[QRPH Payout] Step 3: Authenticating with NexusPay`);
      const authSession = await getFreshAuthSession();
      if (!authSession) {
        console.error(`[QRPH Payout] NexusPay auth failed - initiating refund`);
        const refundResult = await transferFromAdminWallet(userCliId, payoutAmount);
        console.log(`[QRPH Payout] Refund result:`, refundResult);
        
        return res.status(503).json({
          success: false,
          message: "Payment gateway unavailable. Your PHPT has been refunded.",
          refunded: refundResult.success
        });
      }

      const { token, sessionCookie } = authSession;
      console.log(`[QRPH Payout] Auth session obtained, cookie: ${sessionCookie.substring(0, 25)}...`);

      const config = await getConfig();
      if (!config) {
        console.error(`[QRPH Payout] NexusPay not configured - initiating refund`);
        const refundResult = await transferFromAdminWallet(userCliId, payoutAmount);

        return res.status(503).json({
          success: false,
          message: "Payment gateway not configured. Your PHPT has been refunded.",
          refunded: refundResult.success
        });
      }

      // Build webhook URL for status updates
      const publicUrl = process.env.PUBLIC_APP_URL || `https://${req.get('host')}`;
      const webhookUrl = `${publicUrl}/api/nexuspay/cashout-webhook`;

      // Provider codes for different e-wallets
      const providerCodes: Record<string, string> = {
        "gcash": "0093",
        "maya": "0483",
        "mayabank": "7031",
        "grabpay": "7003"
      };
      const xCode = providerCodes[provider.toLowerCase()] || "0093";

      // Payload for encryption - per NexusPay docs, amount must be STRING
      // Merchant ID = IV, Merchant Key = Secret key for AES encryption
      const payloadToEncrypt = {
        code: xCode,
        account_number: accountNumber.replace(/\s/g, ""),
        name: accountName || req.user!.fullName || "PayVerse User",
        amount: String(payoutAmount)  // MUST be string per NexusPay docs
      };

      // Generate unique transaction ID for this payout
      const merchantPaymentTxId = `PV${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      console.log(`[QRPH Payout] Step 4: Creating NexusPay cashout to ${accountNumber}`);
      console.log(`[QRPH Payout] Payload (pre-encrypt):`, JSON.stringify(payloadToEncrypt));

      let encryptedData: string;
      try {
        encryptedData = encryptPayload(payloadToEncrypt, config);
      } catch (error: any) {
        console.error("[QRPH Payout] Encryption failed - initiating refund:", error);
        const refundResult = await transferFromAdminWallet(userCliId, payoutAmount);

        return res.status(500).json({
          success: false,
          message: "Payment processing error. Your PHPT has been refunded.",
          refunded: refundResult.success
        });
      }

      // Use encrypted payload in X-data header per NexusPay API v2 docs
      console.log(`[QRPH Payout] Sending request with Bearer token, X-data encrypted, X-code: ${xCode}`);
      console.log(`[QRPH Payout] merchant_payment_transaction_id: ${merchantPaymentTxId}`);
      const response = await fetch(`${config.baseUrl}/api/create_pay_out`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Cookie": sessionCookie,
          "X-data": encryptedData,
          "X-code": xCode,
          "merchant_payment_transaction_id": merchantPaymentTxId,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      console.log(`[QRPH Payout] NexusPay response status: ${response.status}`);
      
      const text = await response.text();
      console.log("[QRPH Payout] NexusPay response:", text);

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // REFUND: Invalid response
        console.error("[QRPH Payout] Invalid NexusPay response - initiating refund");
        const refundResult = await transferFromAdminWallet(userCliId, payoutAmount);
        
        return res.status(500).json({
          success: false,
          message: "Invalid response from payment gateway. Your PHPT has been refunded.",
          refunded: refundResult.success
        });
      }

      // Check for successful response with payoutlink (per NexusPay API v2 docs)
      if (data.status === "successful" && data.payoutlink) {
        console.log(`[QRPH Payout] NexusPay returned payoutlink: ${data.payoutlink}`);
        
        // Step 5: Call the payoutlink to complete the payout
        console.log(`[QRPH Payout] Step 5: Calling payoutlink to process payout`);
        const payoutResponse = await fetch(data.payoutlink, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Cookie": sessionCookie,
            "Accept": "application/json"
          }
        });
        
        console.log(`[QRPH Payout] Payoutlink response status: ${payoutResponse.status}`);
        const payoutText = await payoutResponse.text();
        console.log(`[QRPH Payout] Payoutlink response:`, payoutText);
        
        let payoutData;
        try {
          payoutData = JSON.parse(payoutText);
        } catch {
          console.error("[QRPH Payout] Invalid payoutlink response - but payout was initiated");
          payoutData = { status: "pending" };
        }
        
        // Check if payout was successful
        if (payoutData.status === "success" && payoutData.data?.transaction_id) {
          console.log(`[QRPH Payout] SUCCESS: ${payoutData.data.transaction_id} via ${payoutData.data.payout_gateway}`);
          
          // Record successful payout transaction
          await storage.createTransaction({
            senderId: req.user!.id,
            amount: String(payoutAmount),
            type: "qrph_payout",
            status: "completed",
            note: `PHPT→PHP cashout to ${provider.toUpperCase()} ${accountNumber} - NexusPay: ${payoutData.data.transaction_id}, Gateway: ${payoutData.data.payout_gateway}`,
            walletType: "phpt"
          });
          
          return res.json({
            success: true,
            transactionId: payoutData.data.transaction_id,
            merchantPaymentId: payoutData.data.merchant_payment_transaction_id,
            phptTransactionId,
            amount: payoutAmount,
            gateway: payoutData.data.payout_gateway,
            status: "success",
            message: payoutData.message || `₱${payoutAmount.toFixed(2)} successfully sent to your ${provider.toUpperCase()} account!`
          });
        } else if (payoutData.status === "error") {
          // Payout failed at the gateway level - need to refund
          console.error(`[QRPH Payout] Payout failed at gateway:`, payoutData);
          const refundResult = await transferFromAdminWallet(userCliId, payoutAmount);
          
          return res.json({
            success: false,
            message: payoutData.message || "Payout failed. Please verify your account details.",
            refunded: refundResult.success,
            refundMessage: refundResult.success ? "Your PHPT has been refunded." : "Refund pending - contact support."
          });
        }
        
        // Payout initiated but status unclear - record as pending
        await storage.createTransaction({
          senderId: req.user!.id,
          amount: String(payoutAmount),
          type: "qrph_payout",
          status: "pending",
          note: `PHPT→PHP cashout to ${provider.toUpperCase()} ${accountNumber} - Processing`,
          walletType: "phpt"
        });
        
        return res.json({
          success: true,
          transactionId: merchantPaymentTxId,
          phptTransactionId,
          amount: payoutAmount,
          status: "processing",
          message: `₱${payoutAmount.toFixed(2)} is being sent to your ${provider.toUpperCase()} account!`
        });
      }
      
      // Legacy check for direct success response
      if (data.transactionId && (data.status === "processing" || data.status === "success" || data.status === "successful")) {
        console.log(`[QRPH Payout] NexusPay cashout submitted: ${data.transactionId}`);

        // Record successful payout transaction
        await storage.createTransaction({
          senderId: req.user!.id,
          amount: String(payoutAmount),
          type: "qrph_payout",
          status: data.status === "success" ? "completed" : "pending",
          note: `PHPT→PHP cashout to ${provider.toUpperCase()} ${accountNumber} - NexusPay: ${data.transactionId}, PHPT Tx: ${phptTransactionId || ''}`,
          walletType: "phpt"
        });

        console.log(`[QRPH Payout] SUCCESS: ₱${payoutAmount} sent to ${accountNumber}`);

        return res.json({
          success: true,
          transactionId: data.transactionId,
          phptTransactionId,
          amount: payoutAmount,
          recipientMobile: data.recipientMobile || accountNumber,
          status: data.status,
          message: data.message || `₱${payoutAmount.toFixed(2)} is being sent to your ${provider.toUpperCase()} account!`
        });
      }

      // REFUND: NexusPay payout failed
      console.error("[QRPH Payout] NexusPay failed - initiating refund:", data);
      const refundResult = await transferFromAdminWallet(userCliId, payoutAmount);
      console.log(`[QRPH Payout] Refund result:`, refundResult);

      // Provide specific error message for common issues
      let errorMessage = data.message || "Failed to process payout";
      if (data.error === "Missing API key") {
        errorMessage = "Payment gateway temporarily unavailable. This may be due to insufficient merchant wallet balance. Please try again later or contact support.";
      } else if (data.error?.includes("insufficient") || data.message?.includes("insufficient")) {
        errorMessage = "Payment gateway has insufficient funds. Please try again later.";
      }

      // Record failed payout with refund status
      await storage.createTransaction({
        senderId: req.user!.id,
        amount: String(payoutAmount),
        type: "qrph_payout_failed",
        status: refundResult.success ? "refunded" : "failed",
        note: `Failed payout to ${provider.toUpperCase()} ${accountNumber}. ${refundResult.success ? 'PHPT refunded.' : 'Refund pending - contact support.'}`,
        walletType: "phpt"
      });

      return res.json({
        success: false,
        message: errorMessage,
        refunded: refundResult.success,
        refundMessage: refundResult.success ? "Your PHPT has been refunded." : "Refund pending - please contact support."
      });
    } catch (error: any) {
      console.error("[QRPH Payout] Unexpected error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Payout processing failed"
      });
    }
  });

  app.post("/api/nexuspay/webhook", async (req: Request, res: Response) => {
    try {
      console.log("[NexusPay] Webhook received:", JSON.stringify(req.body));
      console.log("[NexusPay] Webhook headers:", JSON.stringify(req.headers));
      
      // NexusPay webhook payload fields (handle multiple variations)
      const { transactionId, transaction_id, status, transaction_status, amount, total_amount, reference, reference_number } = req.body;
      const txId = transactionId || transaction_id;
      const rawAmount = amount || total_amount;
      const txStatus = (transaction_status || status || "").toString().toLowerCase();

      // Validate and parse amount
      let txAmount: number = 0;
      if (rawAmount !== undefined && rawAmount !== null) {
        txAmount = parseFloat(String(rawAmount));
        if (isNaN(txAmount) || txAmount <= 0) {
          console.error(`[NexusPay] Invalid amount received: ${rawAmount}`);
          return res.json({ received: true, status: "ok", error: "invalid amount" });
        }
      }

      // Only process successful payments with valid transaction ID and amount
      const successStatuses = ["success", "successful", "completed", "paid"];
      if (successStatuses.includes(txStatus) && txId && txAmount > 0) {
        console.log(`[NexusPay] Payment confirmed: ${txId} for ₱${txAmount}`);
        
        // Find the pending transaction by transactionId in note
        const pendingTx = await storage.findPendingQrphTransaction(txId);
        
        if (!pendingTx) {
          console.log(`[NexusPay] No pending transaction found for ${txId}`);
          return res.json({ received: true, status: "ok", note: "no pending tx" });
        }
        
        if (!pendingTx.receiverId) {
          console.error(`[NexusPay] Transaction ${pendingTx.id} has no receiver ID`);
          return res.json({ received: true, status: "ok", error: "no receiver" });
        }

        console.log(`[NexusPay] Found transaction ID ${pendingTx.id} for user ${pendingTx.receiverId}, status: ${pendingTx.status}`);
        
        // Skip if already completed or being processed
        if (pendingTx.status === "completed") {
          console.log(`[NexusPay] Transaction ${pendingTx.id} already completed`);
          return res.json({ received: true, status: "ok", note: "already completed" });
        }
        
        if (pendingTx.status === "processing") {
          console.log(`[NexusPay] Transaction ${pendingTx.id} already being processed`);
          return res.json({ received: true, status: "ok", note: "already processing" });
        }
        
        // IDEMPOTENCY: Claim the transaction atomically to prevent duplicate credits
        const claimed = await storage.claimQrphTransaction(pendingTx.id);
        if (!claimed) {
          console.log(`[NexusPay] Transaction ${pendingTx.id} already claimed by another process`);
          return res.json({ received: true, status: "ok", note: "claimed by another process" });
        }
        
        console.log(`[NexusPay] Claimed transaction ${pendingTx.id}, proceeding with credit...`);
        
        // Get user to get their userCliId
        const user = await storage.getUser(pendingTx.receiverId!);
        
        if (!user) {
          console.error(`[NexusPay] User not found for transaction ${pendingTx.id}`);
          await storage.updateTransactionStatus(pendingTx.id, "pending"); // Revert to pending
          return res.json({ received: true, status: "ok", error: "user not found" });
        }
        
        const userCliId = user.username || user.email;
        const phptAmount = txAmount; // 1:1 PHP to PHPT rate
        
        console.log(`[NexusPay] Crediting ${phptAmount} PHPT to user ${userCliId} via admin wallet`);
        
        // Transfer PHPT from admin wallet to user's PayGram account
        // Retry up to 2 times for transient failures
        let transferResult = await transferFromAdminWallet(userCliId, phptAmount);
        
        if (!transferResult.success && !transferResult.message.toLowerCase().includes('insufficient')) {
          console.log(`[NexusPay] First transfer attempt failed, retrying...`);
          await new Promise(r => setTimeout(r, 1000));
          transferResult = await transferFromAdminWallet(userCliId, phptAmount);
          
          if (!transferResult.success && !transferResult.message.toLowerCase().includes('insufficient')) {
            console.log(`[NexusPay] Second transfer attempt failed, final retry...`);
            await new Promise(r => setTimeout(r, 2000));
            transferResult = await transferFromAdminWallet(userCliId, phptAmount);
          }
        }
        
        if (transferResult.success) {
          // Only mark as completed AFTER successful transfer
          await storage.updateTransactionStatus(pendingTx.id, "completed");

          // Use balanceService for atomic balance update + transaction record
          try {
            const creditResult = await balanceService.creditFromPaygram({
              userId: pendingTx.receiverId!,
              amount: phptAmount,
              type: "qrph_credit",
              note: `PHPT credited from QRPH payment ${txId}`,
              paygramTxId: transferResult.transactionId,
            });
            console.log(`[NexusPay] Updated local balance via balanceService for user ${user.id}: PHPT ${creditResult.newBalance}`);
          } catch (balanceError) {
            console.error(`[NexusPay] Failed to update local balance for user ${user.id}:`, balanceError);
            // Don't fail - PayGram transfer already succeeded
          }

          console.log(`[NexusPay] Successfully credited ${phptAmount} PHPT to user ${user.id}`);
        } else {
          // Transfer failed - revert to pending for retry
          console.error(`[NexusPay] Failed to credit PHPT, reverting to pending:`, transferResult.message);
          await storage.updateTransactionStatus(pendingTx.id, "pending");
        }
      } else {
        console.log(`[NexusPay] Webhook status: ${txStatus}, txId: ${txId}, amount: ${txAmount} - no action needed`);
      }

      return res.json({ received: true, status: "ok" });
    } catch (error) {
      console.error("[NexusPay] Webhook error:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  app.get("/api/nexuspay/payout-status/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      console.log(`[NexusPay] Checking payout status for: ${id}`);

      const config = await getConfig();
      if (!config) {
        return res.status(503).json({
          success: false,
          message: "Payment gateway not configured"
        });
      }

      const response = await fetch(`${config.baseUrl}/api/payoutstatus/${id}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "PayVerse/1.0"
        }
      });

      const text = await response.text();
      console.log("[NexusPay] Payout status response:", text);
      
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(500).json({ success: false, message: "Invalid response" });
      }

      return res.json({
        success: data.status === "success",
        transactionId: data.data?.transaction_id,
        gateway: data.data?.payout_gateway,
        message: data.message
      });
    } catch (error: any) {
      console.error("[NexusPay] Status check error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin endpoint to get all pending QRPH transactions
  app.get("/api/admin/qrph/pending", authMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const pendingTxs = await storage.getPendingQrphTransactions();
      const txsWithUsers = await Promise.all(pendingTxs.map(async (tx) => {
        // QRPH transactions have receiverId as the user (senderId is null for external)
        const user = tx.receiverId ? await storage.getUser(tx.receiverId) : null;
        return {
          ...tx,
          userName: user?.fullName,
          userEmail: user?.email,
          username: user?.username
        };
      }));
      res.json(txsWithUsers);
    } catch (error: any) {
      console.error("[NexusPay] Failed to get pending transactions:", error);
      res.status(500).json({ message: "Failed to get pending transactions" });
    }
  });

  // Admin endpoint to manually process a pending QRPH transaction
  app.post("/api/admin/qrph/process/:id", authMiddleware, adminRateLimiter, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const txId = parseInt(req.params.id);
      const tx = await storage.getTransaction(txId);
      
      if (!tx) {
        return res.status(404).json({ success: false, message: "Transaction not found" });
      }
      
      if (tx.type !== "qrph_cashin") {
        return res.status(400).json({ success: false, message: "Not a QRPH cash-in transaction" });
      }
      
      if (tx.status === "completed") {
        return res.status(400).json({ success: false, message: "Transaction already completed" });
      }

      // QRPH transactions have senderId=null (external), receiverId=userId
      if (!tx.receiverId) {
        return res.status(400).json({ success: false, message: "Transaction has no recipient" });
      }

      const user = await storage.getUser(tx.receiverId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const userCliId = user.username || user.email;
      const phptAmount = parseFloat(tx.amount);

      console.log(`[NexusPay Admin] Processing pending tx ${txId}: ${phptAmount} PHPT for ${userCliId}`);
      
      // Transfer PHPT from admin wallet to user
      const transferResult = await transferFromAdminWallet(userCliId, phptAmount);
      
      if (transferResult.success) {
        await storage.updateTransactionStatus(txId, "completed");

        // Use balanceService for atomic balance update + transaction record
        const creditResult = await balanceService.creditFromPaygram({
          userId: tx.receiverId!,
          amount: phptAmount,
          type: "qrph_credit",
          note: `PHPT credited (manual) from tx ${txId}`,
          paygramTxId: transferResult.transactionId,
        });
        console.log(`[NexusPay Admin] Updated local balance via balanceService for user ${tx.receiverId}: PHPT ${creditResult.newBalance}`);
        
        // Create audit log for manual QRPH credit
        await storage.createAdminAuditLog({
          adminId: req.user.id,
          action: "qrph_manual_credit",
          targetType: "user",
          targetId: tx.receiverId,
          details: JSON.stringify({
            transactionId: txId,
            amount: phptAmount,
            userCliId,
            paygramTxId: transferResult.transactionId
          }),
          ipAddress: req.ip || req.socket?.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
          sessionId: req.headers.authorization?.replace("Bearer ", "") || null,
          requestMethod: req.method,
          requestPath: req.path,
          riskLevel: "high"
        });
        
        console.log(`[NexusPay Admin] Successfully processed tx ${txId}`);
        return res.json({ 
          success: true, 
          message: `Successfully credited ${phptAmount} PHPT to ${userCliId}`,
          transactionId: transferResult.transactionId
        });
      } else {
        console.error(`[NexusPay Admin] Failed to process tx ${txId}:`, transferResult.message);
        return res.status(400).json({ 
          success: false, 
          message: transferResult.message 
        });
      }
    } catch (error: any) {
      console.error("[NexusPay Admin] Process error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin endpoint to process all pending QRPH transactions
  app.post("/api/admin/qrph/process-all", authMiddleware, adminRateLimiter, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      const pendingTxs = await storage.getPendingQrphTransactions();
      
      if (pendingTxs.length === 0) {
        return res.json({ success: true, message: "No pending transactions to process", processed: 0 });
      }
      
      const results = [];
      
      for (const tx of pendingTxs) {
        if (!tx.senderId) {
          results.push({ id: tx.id, success: false, message: "No user" });
          continue;
        }
        
        const user = await storage.getUser(tx.senderId);
        if (!user) {
          results.push({ id: tx.id, success: false, message: "User not found" });
          continue;
        }
        
        const userCliId = user.username || user.email;
        const phptAmount = parseFloat(tx.amount);
        
        console.log(`[NexusPay Admin] Processing tx ${tx.id}: ${phptAmount} PHPT for ${userCliId}`);
        
        const transferResult = await transferFromAdminWallet(userCliId, phptAmount);
        
        if (transferResult.success) {
          await storage.updateTransactionStatus(tx.id, "completed");
          
          // Credit the user's local PayVerse PHPT balance (sync with PayGram transfer)
          // This MUST succeed to maintain balance consistency
          try {
            const balanceResult = await storage.creditPhptBalance(tx.senderId, phptAmount);
            console.log(`[NexusPay Admin] Updated local balance for user ${tx.senderId}: PHPT ${balanceResult.newPhptBalance}, Total ${balanceResult.newTotalBalance}`);
            
            await storage.createTransaction({
              senderId: null,
              receiverId: tx.senderId,
              amount: phptAmount.toFixed(2),
              type: "qrph_credit",
              status: "completed",
              category: "QRPH Cash-In",
              note: `PHPT credited (batch) from tx ${tx.id}`,
              walletType: "phpt"
            });
            
            results.push({ id: tx.id, success: true, amount: phptAmount, user: userCliId });
          } catch (balanceError: any) {
            console.error(`[NexusPay Admin] Failed to update local balance for user ${tx.senderId}:`, balanceError);
            results.push({ id: tx.id, success: false, message: `PayGram OK but local credit failed: ${balanceError.message}` });
          }
        } else {
          results.push({ id: tx.id, success: false, message: transferResult.message });
          // Continue with other transactions even if one fails
        }
        
        // Small delay between transfers to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`[NexusPay Admin] Batch processed ${successCount}/${pendingTxs.length} transactions`);
      
      // Create audit log for batch processing
      await storage.createAdminAuditLog({
        adminId: req.user.id,
        action: "qrph_batch_credit",
        targetType: "system",
        targetId: null,
        details: JSON.stringify({ 
          totalAttempted: pendingTxs.length,
          successCount,
          failedCount: pendingTxs.length - successCount,
          results: results.map(r => ({ id: r.id, success: r.success }))
        }),
        ipAddress: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
        sessionId: req.headers.authorization?.replace("Bearer ", "") || null,
        requestMethod: req.method,
        requestPath: req.path,
        riskLevel: "high"
      });
      
      return res.json({ 
        success: true, 
        message: `Processed ${successCount}/${pendingTxs.length} transactions`,
        processed: successCount,
        total: pendingTxs.length,
        results 
      });
    } catch (error: any) {
      console.error("[NexusPay Admin] Batch process error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  console.log("NexusPay QRPH routes registered");
}
