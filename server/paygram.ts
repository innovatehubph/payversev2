import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { ZodError, z } from "zod";
import { authMiddleware } from "./auth";
import { encrypt, decrypt } from "./encryption";
import { generateRequestId } from "./utils";
import { getSystemSetting } from "./settings";

const PAYGRAM_API_URL = "https://api.pay-gram.org";
const TGIN_API_URL = "https://tgin.pay-gram.org/PayGramUsers";
const PAYGRAM_TELEGRAM_BOT = "opgmbot";

async function getSharedPaygramToken(): Promise<string | null> {
  const token = await getSystemSetting("PAYGRAM_API_TOKEN", "");
  return token || null;
}

// generateRequestId is now imported from ./utils

function formatInvoiceAsVoucher(invoiceCode: string): string {
  if (!invoiceCode) return '';
  const parts = invoiceCode.split('-');
  if (parts.length >= 2) {
    return `${parts[0].substring(0, 8).toUpperCase()} - ${parts[1].substring(0, 4).toUpperCase()}`;
  }
  return invoiceCode.substring(0, 12).toUpperCase();
}

function generateTelegramRedeemLink(invoiceCode: string): string {
  // Format: base64("a=v&c={invoiceCode}") with URL-safe encoding
  // "a=v" indicates voucher/invoice action, "c" is the invoice code
  const payload = `a=v&c=${invoiceCode}`;
  const encodedPayload = Buffer.from(payload).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `https://telegram.me/${PAYGRAM_TELEGRAM_BOT}?start=${encodedPayload}`;
}

const connectTelegramTokenSchema = z.object({
  telegramToken: z.string().min(10, "Telegram PayGram token is required")
});

async function getDecryptedTelegramToken(userId: number): Promise<string | null> {
  const connection = await storage.getPaygramConnection(userId);
  if (!connection) return null;
  
  try {
    return decrypt(connection.apiToken);
  } catch (error) {
    console.error("Failed to decrypt token:", error);
    return null;
  }
}

function getUserCliId(user: { username: string; email: string }): string {
  return user.username || user.email;
}

interface PaygramTransferParams {
  fromUserCliId: string;
  toUserCliId: string;
  amount: number;
  clientUnique?: string;
  currencyCode?: number;
}

interface PaygramTransferResult {
  success: boolean;
  message: string;
  transactionId?: string;
  data?: any;
}

async function executePaygramTransfer(params: PaygramTransferParams): Promise<PaygramTransferResult> {
  const sharedToken = await getSharedPaygramToken();
  if (!sharedToken) {
    return { success: false, message: "PayGram not configured" };
  }

  const { fromUserCliId, toUserCliId, amount, clientUnique, currencyCode = 11 } = params;

  try {
    const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/TransferCredit`, {
      method: "POST",
      headers: { 
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requestId: generateRequestId(),
        userCliId: fromUserCliId,
        toUserCliId,
        currencyCode,
        amount,
        ClientUnique: clientUnique || `transfer-${Date.now()}`
      })
    });

    const responseText = await response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[PaygramTransfer] Failed to parse response:", responseText);
      return { success: false, message: "Invalid response from payment service" };
    }

    if (!data.success) {
      const errorMessage = data.message || "Transfer failed";
      if (errorMessage.toLowerCase().includes('balance') || errorMessage.toLowerCase().includes('insufficient')) {
        return { success: false, message: "Insufficient balance" };
      }
      return { success: false, message: errorMessage };
    }

    return { 
      success: true, 
      message: `Transferred ${amount} PHPT successfully`,
      transactionId: data.transactionId || data.voucherCode || data.friendlyVoucherCode,
      data
    };
  } catch (error: any) {
    console.error("[PaygramTransfer] Error:", error);
    return { success: false, message: error.message || "Transfer failed" };
  }
}

interface PaygramUserInfoResult {
  success: boolean;
  message?: string;
  coins?: Array<{ currencyCode: number | string; balance: string }>;
  data?: any;
}

async function getPaygramUserInfo(userCliId: string): Promise<PaygramUserInfoResult> {
  const sharedToken = await getSharedPaygramToken();
  if (!sharedToken) {
    return { success: false, message: "PayGram not configured" };
  }

  try {
    const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/UserInfo`, {
      method: "POST",
      headers: { 
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requestId: generateRequestId(),
        userCliId
      })
    });

    const data = await response.json();
    
    if (data.success === false) {
      return { success: false, message: data.message || "User not found" };
    }

    const coinsArray = data.coins || data.balances || [];
    return { 
      success: true, 
      coins: coinsArray.map((b: any) => ({
        currencyCode: b.currency || b.currencyCode,
        balance: b.balance || b.amount || "0"
      })),
      data
    };
  } catch (error: any) {
    console.error("[PaygramUserInfo] Error:", error);
    return { success: false, message: error.message };
  }
}

function isPhptCurrency(currValue: any): boolean {
  if (currValue === 11 || currValue === "11") return true;
  if (typeof currValue === "string" && currValue.toUpperCase() === "PHPT") return true;
  return false;
}

function extractPhptBalance(coins: Array<{ currencyCode: number | string; balance: string }> | undefined): number {
  if (!coins) return 0;
  const phptWallet = coins.find(b => isPhptCurrency(b.currencyCode));
  const balance = phptWallet ? parseFloat(phptWallet.balance) : 0;
  return isNaN(balance) ? 0 : balance;
}

// TGIN API helpers for Telegram wallet operations

interface TginInvoiceResult {
  success: boolean;
  message?: string;
  invoiceCode?: string;
  payUrl?: string;
  toUser?: string;
  data?: any;
}

async function executeTginIssueInvoice(
  telegramToken: string,
  amount: number,
  currencyCode: number = 11,
  callbackData?: string
): Promise<TginInvoiceResult> {
  const currencySymbol = currencyCode === 1 ? 'BTC' : currencyCode === 5 ? 'USDT' : 'PHPT';
  let url = `${TGIN_API_URL}/${telegramToken}/IssueInvoice?amt=${amount}&cursym=${currencySymbol}`;
  if (callbackData) {
    url += `&callbackData=${callbackData}`;
  }
  
  try {
    const response = await fetch(url, {
      method: callbackData ? "GET" : "POST",
      headers: { 
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: callbackData ? undefined : JSON.stringify({ requestId: generateRequestId() })
    });
    
    const responseText = await response.text();
    console.log("[TginIssueInvoice] Response:", responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return { success: false, message: "Invalid response from Telegram API" };
    }
    
    if (!data.success) {
      return { success: false, message: data.message || "Failed to create invoice", data };
    }
    
    return {
      success: true,
      invoiceCode: data.invoiceCode,
      payUrl: data.payUrl,
      toUser: data.toUser,
      data
    };
  } catch (error: any) {
    console.error("[TginIssueInvoice] Error:", error);
    // Rethrow network errors so routes can return 500 status
    throw error;
  }
}

interface TginPayResult {
  success: boolean;
  message?: string;
  transactionId?: string;
  data?: any;
}

async function executeTginPayVoucher(
  telegramToken: string,
  voucherCode: string,
  amount: number,
  currencyCode: number = 11
): Promise<TginPayResult> {
  const payUrl = `${TGIN_API_URL}/${telegramToken}/PayVoucher?voucherCode=${encodeURIComponent(voucherCode)}&amt=${amount}&cursym=${currencyCode}`;
  
  try {
    const response = await fetch(payUrl, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    
    const data = await response.json();
    console.log("[TginPayVoucher] Response:", JSON.stringify(data, null, 2));
    
    if (!data.success) {
      return { success: false, message: data.message || "Payment failed", data };
    }
    
    return {
      success: true,
      transactionId: data.transactionId,
      data
    };
  } catch (error: any) {
    console.error("[TginPayVoucher] Error:", error);
    // Rethrow network errors so routes can return 500 status
    throw error;
  }
}

async function executePaygramPayInvoice(
  userCliId: string,
  invoiceCode: string
): Promise<TginPayResult> {
  const sharedToken = await getSharedPaygramToken();
  if (!sharedToken) {
    return { success: false, message: "PayGram not configured" };
  }
  
  try {
    const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/PayInvoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: generateRequestId(),
        userCliId,
        invoiceCode,
        ClientUnique: invoiceCode
      })
    });
    
    const responseText = await response.text();
    console.log("[PaygramPayInvoice] Response:", responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return { success: false, message: "Invalid response from payment service" };
    }
    
    if (!data.success) {
      const errorMessage = data.message || "Payment failed";
      if (errorMessage.toLowerCase().includes('balance')) {
        return { success: false, message: "Insufficient PHPT balance" };
      }
      return { success: false, message: errorMessage };
    }
    
    return {
      success: true,
      transactionId: data.transactionId,
      data
    };
  } catch (error: any) {
    console.error("[PaygramPayInvoice] Error:", error);
    // Rethrow network errors so routes can return 500 status
    throw error;
  }
}

export async function registerPaygramUser(username: string): Promise<{ success: boolean; error?: string }> {
  const sharedToken = await getSharedPaygramToken();
  if (!sharedToken) {
    console.log("PayGram not configured, skipping SetUserInfo");
    return { success: false, error: "PayGram not configured" };
  }

  try {
    const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/SetUserInfo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/plain"
      },
      body: JSON.stringify({
        requestId: generateRequestId(),
        userCliId: username,
        callbackUrl: "https://payverse.innovatehub.site/api/crypto/callback"
      })
    });

    const responseText = await response.text();
    console.log(`PayGram SetUserInfo for ${username}:`, responseText);

    if (!response.ok) {
      return { success: false, error: `PayGram API error: ${response.status}` };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to register PayGram user:", error);
    return { success: false, error: error.message };
  }
}

export function registerPaygramRoutes(app: Express) {
  app.get("/api/crypto/status", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.json({ 
        connected: false,
        message: "PayGram integration not configured. Contact administrator.",
        code: "PAYGRAM_NOT_CONFIGURED"
      });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    
    if (!connection) {
      return res.json({ 
        connected: false,
        message: "Connect your Telegram PayGram token to access crypto features"
      });
    }
    
    return res.json({
      connected: true,
      userCliId: getUserCliId(req.user!),
      isValid: connection.isValid,
      lastError: connection.lastError,
      lastSyncAt: connection.lastSyncAt,
      connectedAt: connection.createdAt
    });
  });

  app.post("/api/crypto/connect", authMiddleware, async (req: Request, res: Response) => {
    try {
      const sharedToken = await getSharedPaygramToken();
      if (!sharedToken) {
        return res.status(503).json({ 
          message: "PayGram integration not configured",
          code: "PAYGRAM_NOT_CONFIGURED"
        });
      }
      
      const { telegramToken } = connectTelegramTokenSchema.parse(req.body);
      const userCliId = getUserCliId(req.user!);
      
      const encryptedToken = encrypt(telegramToken);
      const connection = await storage.createPaygramConnection(req.user!.id, userCliId, encryptedToken);
      await storage.updatePaygramConnection(req.user!.id, { lastSyncAt: new Date() });
      
      return res.json({
        success: true,
        message: "Telegram PayGram token saved successfully",
        connected: true,
        userCliId,
        connectedAt: connection.createdAt
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("PayGram connect error:", error);
      return res.status(500).json({ message: "Failed to save token" });
    }
  });

  app.delete("/api/crypto/connect", authMiddleware, async (req: Request, res: Response) => {
    try {
      await storage.deletePaygramConnection(req.user!.id);
      return res.json({
        success: true,
        message: "PayGram wallet disconnected successfully",
        connected: false
      });
    } catch (error) {
      console.error("PayGram disconnect error:", error);
      return res.status(500).json({ message: "Failed to disconnect wallet" });
    }
  });

  // Main balance endpoint - fetches PHPT balance from PayGram (single source of truth)
  // Used by dashboard and all balance displays
  // Also syncs to local database for admin dashboard consistency
  app.get("/api/wallet/balance", authMiddleware, async (req: Request, res: Response) => {
    const userCliId = getUserCliId(req.user!);
    const result = await getPaygramUserInfo(userCliId);
    
    if (!result.success) {
      return res.json({ success: true, phptBalance: "0.00", connected: false, error: result.message });
    }
    
    const sanitizedBalance = extractPhptBalance(result.coins);
    
    // Sync to local database in background (non-blocking)
    storage.syncPhptBalance(req.user!.id, sanitizedBalance).catch(err => {
      console.error(`[wallet/balance] Failed to sync local balance for user ${req.user!.id}:`, err.message);
    });
    
    res.json({ 
      success: true, 
      phptBalance: sanitizedBalance.toFixed(2),
      connected: true,
      allBalances: result.coins
    });
  });

  app.get("/api/crypto/balances", authMiddleware, async (req: Request, res: Response) => {
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    const userCliId = getUserCliId(req.user!);
    const result = await getPaygramUserInfo(userCliId);
    
    if (!result.success) {
      await storage.updatePaygramConnection(req.user!.id, { 
        isValid: false, 
        lastError: result.message || "API call failed" 
      });
      return res.status(409).json({ message: result.message || "Failed to fetch balance", code: "API_ERROR" });
    }
    
    const wallets = result.coins && result.coins.length > 0 
      ? result.coins 
      : [{ currencyCode: 11, balance: "0" }];
    
    await storage.updatePaygramConnection(req.user!.id, { lastSyncAt: new Date(), isValid: true, lastError: null });
    res.json({ success: true, wallets, rawResponse: result.data });
  });

  app.get("/api/crypto/exchange-rates", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/GetExchangeRates`, {
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
      console.error("PayGram GetExchangeRates error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/crypto/invoice", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const { amount, currency } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/IssueInvoice`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          currencyCode: currency || 11,
          amount: parseFloat(amount),
          merchantType: 0
        })
      });
      
      const data = await response.json();
      console.log("PayGram IssueInvoice response:", JSON.stringify(data, null, 2));
      
      if (data.success) {
        // Use invoiceId (GUID) as primary identifier for callbacks, ensure invoiceCode exists for frontend redemption
        const invoiceId = data.invoiceId;
        const invoiceCode = data.invoiceCode || data.invoiceId;
        const telegramLink = data.payUrl || generateTelegramRedeemLink(invoiceCode);
        const voucherCode = data.voucherCode || formatInvoiceAsVoucher(invoiceCode);
        
        // Store invoice in database with both identifiers - invoiceId for callbacks, invoiceCode for redemption
        await storage.createCryptoInvoice({
          invoiceId: invoiceId,
          invoiceCode: invoiceCode,
          userId: req.user!.id,
          amount: String(amount),
          currencyCode: currency || 11,
          payUrl: telegramLink,
          voucherCode
        });
        console.log(`Invoice ${invoiceId} created and stored for user ${req.user!.id}`);
        
        res.json({
          success: true,
          invoiceId,
          invoiceCode,
          telegramLink,
          voucherCode,
          amount: data.amount,
          currencyCode: data.currencyCode,
          status: data.status,
          createdAt: data.createdUtc,
          rawResponse: data
        });
      } else {
        res.json({
          success: false,
          message: data.message || "Failed to create invoice",
          rawResponse: data
        });
      }
    } catch (error: any) {
      console.error("PayGram IssueInvoice error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Create invoice via user's Telegram token (Tgin API) - for Telegram → PayVerse top-up
  app.post("/api/crypto/telegram-invoice", authMiddleware, async (req: Request, res: Response) => {
    if (!(await getSharedPaygramToken())) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const telegramToken = await getDecryptedTelegramToken(req.user!.id);
    if (!telegramToken) {
      return res.status(409).json({ 
        message: "Telegram wallet not connected. Please add your Telegram token in Settings.", 
        code: "TELEGRAM_NOT_CONNECTED" 
      });
    }
    
    try {
      const { amount, currency = 11 } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const result = await executeTginIssueInvoice(telegramToken, parseFloat(amount), currency, userCliId);
      
      if (!result.success) {
        return res.json({ success: false, message: result.message, rawResponse: result.data });
      }
      
      // Store the invoice for tracking
      await storage.createCryptoInvoice({
        invoiceId: result.invoiceCode!,
        invoiceCode: result.invoiceCode!,
        userId: req.user!.id,
        amount: String(amount),
        currencyCode: currency,
        payUrl: result.payUrl,
        voucherCode: formatInvoiceAsVoucher(result.invoiceCode!)
      });
      
      res.json({
        success: true,
        invoiceCode: result.invoiceCode,
        telegramLink: result.payUrl,
        voucherCode: formatInvoiceAsVoucher(result.invoiceCode!),
        amount: parseFloat(amount),
        currencyCode: currency,
        message: "Invoice created. Pay via Telegram, then click 'Redeem' to credit your PayVerse wallet.",
        rawResponse: result.data
      });
    } catch (error: any) {
      console.error("Tgin IssueInvoice error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Redeem a Telegram invoice via PayGram API
  app.post("/api/crypto/redeem-invoice", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const { invoiceCode } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      console.log(`Redeeming invoice ${invoiceCode} for user ${userCliId}`);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/RedeemInvoice`, {
        method: "POST",
        headers: { 
          "Accept": "text/plain",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          invoiceCode
        })
      });
      
      const responseText = await response.text();
      console.log("PayGram RedeemInvoice response:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { success: response.ok, message: responseText };
      }
      
      if (data.success === true && data.responseCode === 200) {
        // Update invoice status in database for tracking
        const invoice = await storage.getCryptoInvoiceByInvoiceCode(invoiceCode);
        if (invoice) {
          await storage.updateCryptoInvoiceStatus(invoice.invoiceId, "paid");
        }
        
        // Balance is managed by PayGram - no local balance update needed
        console.log(`Invoice ${invoiceCode} redeemed for user ${userCliId}`);
        
        res.json({
          success: true,
          message: "Invoice redeemed successfully! Your balance has been updated.",
          amount: invoice?.amount,
          rawResponse: data
        });
      } else {
        res.json({
          success: false,
          message: data.message || "Failed to redeem invoice. Make sure you've paid via Telegram first.",
          rawResponse: data
        });
      }
    } catch (error: any) {
      console.error("PayGram RedeemInvoice error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Pay invoice/voucher using user's Telegram token via PayVoucher endpoint
  app.post("/api/crypto/pay-invoice", authMiddleware, async (req: Request, res: Response) => {
    const telegramToken = await getDecryptedTelegramToken(req.user!.id);
    if (!telegramToken) {
      return res.status(409).json({ 
        message: "Telegram wallet not connected. Please add your Telegram token in Settings.", 
        code: "TELEGRAM_NOT_CONNECTED" 
      });
    }
    
    const { voucherCode, amount, currency = 11 } = req.body;
    
    if (!voucherCode) {
      return res.status(400).json({ success: false, message: "Voucher code is required" });
    }
    
    if (!amount) {
      return res.status(400).json({ success: false, message: "Amount is required" });
    }
    
    try {
      console.log(`Paying voucher ${voucherCode} (${amount} currency ${currency}) with user's Telegram token`);
      
      const result = await executeTginPayVoucher(telegramToken, voucherCode, parseFloat(amount), currency);
      
      if (result.success && result.data?.isPaid) {
        const creditAmount = parseFloat(result.data.amount);
        
        // Update invoice status in database for tracking
        const invoiceCode = result.data.invoiceCode;
        if (invoiceCode) {
          const invoice = await storage.getCryptoInvoiceByInvoiceCode(invoiceCode);
          if (invoice) {
            await storage.updateCryptoInvoiceStatus(invoice.invoiceId, "paid", new Date());
          }
        }
        
        // Record transaction for history (balance managed by PayGram)
        await storage.createTransaction({
          senderId: req.user!.id,
          receiverId: req.user!.id,
          amount: creditAmount.toFixed(2),
          type: "deposit",
          status: "completed",
          category: "Telegram Top-up",
          note: `Telegram wallet deposit via PayGram (${voucherCode})`,
          walletType: "phpt"
        });
        
        console.log(`Invoice ${voucherCode} paid for user ${req.user!.id}`);
        
        return res.json({
          success: true,
          message: `Invoice paid! ${creditAmount} PHPT added to your wallet.`,
          amount: creditAmount,
          rawResponse: result.data
        });
      } else if (result.success) {
        return res.json({
          success: true,
          message: "Invoice payment processed.",
          rawResponse: result.data
        });
      } else {
        return res.json({
          success: false,
          message: result.message || "Failed to pay invoice. Check your Telegram wallet balance.",
          rawResponse: result.data
        });
      }
    } catch (error: any) {
      console.error("Tgin PayVoucher error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Helper function to format friendlyVoucherCode for TGIN PayVoucher
  // Converts "5xhuzf121625" to "5XH UZF 12 16 25" format
  // Expected format: 12 characters, split as 3+3+2+2+2
  function formatVoucherCode(code: string): string | null {
    if (!code) return null;
    // Remove any existing spaces and normalize
    const cleanCode = code.replace(/\s+/g, '').trim();
    if (cleanCode.length !== 12) {
      console.error(`Invalid voucher code length: expected 12, got ${cleanCode.length} for code "${code}"`);
      return null;
    }
    // Format: XXX XXX XX XX XX (3 + 3 + 2 + 2 + 2 = 12 chars)
    const formatted = `${cleanCode.slice(0,3)} ${cleanCode.slice(3,6)} ${cleanCode.slice(6,8)} ${cleanCode.slice(8,10)} ${cleanCode.slice(10,12)}`;
    return formatted.toUpperCase();
  }

  // Direct one-step topup using invoice-voucher-redeem flow
  // 1. Create invoice via PayGramPay IssueInvoice (for user's PayVerse account)
  // 2. Pay invoice via TGIN PayVoucher (using user's Telegram token and formatted voucher code)
  // 3. Redeem invoice via PayGramPay RedeemInvoice (credit PayVerse account)
  // This bridges: Telegram wallet -> PayVerse PayGram account -> PayVerse wallet
  app.post("/api/crypto/direct-topup", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    // Get user's Telegram token - required for paying from Telegram wallet
    const telegramToken = await getDecryptedTelegramToken(req.user!.id);
    if (!telegramToken) {
      return res.status(409).json({ 
        message: "Telegram wallet not connected. Please connect your PayGram Telegram token in Profile settings first.", 
        code: "TELEGRAM_NOT_CONNECTED" 
      });
    }
    
    try {
      const { amount } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      if (!amount || parseFloat(amount) < 1) {
        return res.status(400).json({ success: false, message: "Minimum top-up amount is 1 PHPT" });
      }
      
      const depositAmount = parseFloat(amount);
      const requestId = Math.floor(Math.random() * 1000000000);
      const uniqueTxId = `topup-${req.user!.id}-${Date.now()}`;
      
      console.log(`Direct top-up: User ${userCliId} depositing ${depositAmount} PHPT via invoice-voucher-redeem flow`);
      
      // Step 1: Create invoice via PayGramPay IssueInvoice
      console.log(`Step 1: Creating invoice for ${userCliId}, amount: ${depositAmount} PHPT`);
      const invoiceResponse = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/IssueInvoice`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "text/plain" 
        },
        body: JSON.stringify({
          requestId,
          userCliId: userCliId,
          currencyCode: 11, // PHPT
          amount: depositAmount,
          callbackData: uniqueTxId,
          merchantType: 0
        })
      });
      
      const invoiceText = await invoiceResponse.text();
      console.log("PayGramPay IssueInvoice raw response:", invoiceText);
      
      let invoiceData;
      try {
        invoiceData = JSON.parse(invoiceText);
      } catch {
        return res.json({
          success: false,
          message: "Failed to create invoice. Please try again.",
          step: "create_invoice",
          rawResponse: invoiceText
        });
      }
      
      if (!invoiceData.success) {
        return res.json({
          success: false,
          message: invoiceData.message || "Failed to create invoice",
          step: "create_invoice",
          rawResponse: invoiceData
        });
      }
      
      const invoiceCode = invoiceData.invoiceCode;
      const friendlyVoucherCode = invoiceData.friendlyVoucherCode;
      const invoiceAmount = invoiceData.amount || depositAmount;
      console.log(`Invoice created: ${invoiceCode}, friendlyVoucherCode: ${friendlyVoucherCode}`);
      
      // Step 2: Pay invoice via TGIN PayVoucher using formatted voucher code
      const formattedVoucherCode = formatVoucherCode(friendlyVoucherCode);
      if (!formattedVoucherCode) {
        return res.json({
          success: false,
          message: "Invalid voucher code format received from PayGram. Please try again.",
          step: "format_voucher",
          rawResponse: { friendlyVoucherCode }
        });
      }
      console.log(`Step 2: Paying invoice with TGIN PayVoucher, voucherCode: ${formattedVoucherCode}`);
      
      const payVoucherUrl = `${TGIN_API_URL}/${telegramToken}/PayVoucher?voucherCode=${encodeURIComponent(formattedVoucherCode)}&amt=${invoiceAmount}&cursym=11`;
      console.log(`Calling TGIN PayVoucher: ${payVoucherUrl.replace(telegramToken, '***')}`);
      
      const payResponse = await fetch(payVoucherUrl, {
        method: "GET",
        headers: { "Accept": "text/plain" }
      });
      
      const payText = await payResponse.text();
      console.log("TGIN PayVoucher raw response:", payText);
      
      if (!payText || payText.trim() === '') {
        return res.json({
          success: false,
          message: "Your Telegram token appears to be invalid or expired. Please reconnect your Telegram wallet.",
          step: "pay_voucher",
          rawResponse: payText
        });
      }
      
      let payData;
      try {
        payData = JSON.parse(payText);
      } catch {
        return res.json({
          success: false,
          message: "Invalid response from payment service. Please try again.",
          step: "pay_voucher",
          rawResponse: payText
        });
      }
      console.log("TGIN PayVoucher parsed:", JSON.stringify(payData, null, 2));
      
      if (!payData.success) {
        const errorMessage = payData.message || "Failed to pay voucher";
        if (errorMessage.toLowerCase().includes('balance') || errorMessage.toLowerCase().includes('insufficient') ||
            errorMessage.includes('trying to send')) {
          return res.json({
            success: false,
            message: "Insufficient PHPT balance in your Telegram PayGram wallet. Please fund your wallet via @opgmbot first.",
            step: "pay_voucher",
            rawResponse: payData
          });
        }
        return res.json({
          success: false,
          message: errorMessage,
          step: "pay_voucher",
          rawResponse: payData
        });
      }
      
      // Validate PayVoucher response integrity
      if (payData.invoiceCode && payData.invoiceCode !== invoiceCode) {
        console.error(`Invoice code mismatch: expected ${invoiceCode}, got ${payData.invoiceCode}`);
        return res.json({
          success: false,
          message: "Payment verification failed. Please try again.",
          step: "pay_voucher_validation",
          rawResponse: payData
        });
      }
      
      if (!payData.isPaid) {
        return res.json({
          success: false,
          message: "Payment was not confirmed. Please try again.",
          step: "pay_voucher_validation",
          rawResponse: payData
        });
      }
      
      // Step 3: Confirm with PayGramPay InvoiceInfo for authoritative amount
      console.log(`Step 3: Verifying invoice ${invoiceCode} status with PayGramPay InvoiceInfo`);
      const infoRequestId = Math.floor(Math.random() * 1000000000);
      
      const infoResponse = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/InvoiceInfo`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "text/plain" 
        },
        body: JSON.stringify({
          requestId: infoRequestId,
          userCliId: userCliId,
          invoiceCode: invoiceCode
        })
      });
      
      const infoText = await infoResponse.text();
      console.log("PayGramPay InvoiceInfo raw response:", infoText);
      
      let infoData;
      try {
        infoData = JSON.parse(infoText);
      } catch {
        console.error("Failed to parse InvoiceInfo response, falling back to PayVoucher data");
        infoData = null;
      }
      
      // Use InvoiceInfo as authoritative source for amount and status
      let creditAmount: number;
      let isRedeemed = false;
      let hasAuthoritativeConfirmation = false;
      
      if (infoData?.success && infoData.isPaid) {
        creditAmount = infoData.amount || invoiceAmount;
        isRedeemed = infoData.isRedeemed === true;
        hasAuthoritativeConfirmation = true;
        console.log(`InvoiceInfo confirmed: amount=${creditAmount}, isPaid=true, isRedeemed=${isRedeemed}`);
      } else {
        // InvoiceInfo failed - do NOT trust PayVoucher data, force RedeemInvoice
        creditAmount = invoiceAmount; // Use original invoice amount as authoritative
        isRedeemed = false; // Force RedeemInvoice to get PayGramPay confirmation
        console.warn(`InvoiceInfo failed or not paid, forcing RedeemInvoice for authoritative confirmation`);
      }
      
      if (isRedeemed && hasAuthoritativeConfirmation) {
        console.log(`Invoice ${invoiceCode} is already redeemed (confirmed by InvoiceInfo), skipping RedeemInvoice step`);
      } else {
        // Step 4: Redeem invoice via PayGramPay RedeemInvoice (only if not already redeemed)
        console.log(`Step 4: Redeeming invoice ${invoiceCode} for user ${userCliId}`);
        const redeemRequestId = Math.floor(Math.random() * 1000000000);
        
        const redeemResponse = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/RedeemInvoice`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "text/plain" 
          },
          body: JSON.stringify({
            requestId: redeemRequestId,
            userCliId: userCliId,
            invoiceCode: invoiceCode
          })
        });
        
        const redeemText = await redeemResponse.text();
        console.log("PayGramPay RedeemInvoice raw response:", redeemText);
        
        let redeemData;
        try {
          redeemData = JSON.parse(redeemText);
        } catch {
          return res.json({
            success: false,
            message: "Failed to redeem invoice. Please contact support.",
            step: "redeem_invoice",
            rawResponse: redeemText
          });
        }
        
        if (!redeemData.success) {
          // If already redeemed, that's ok - proceed with crediting
          if (redeemData.message?.includes('already redeemed')) {
            console.log(`Invoice ${invoiceCode} was already redeemed, continuing...`);
          } else {
            return res.json({
              success: false,
              message: redeemData.message || "Failed to redeem invoice",
              step: "redeem_invoice",
              rawResponse: redeemData
            });
          }
        } else {
          creditAmount = redeemData.amount || creditAmount;
        }
      }
      
      // Success! Record transaction for history (balance managed by PayGram)
      await storage.createTransaction({
        senderId: req.user!.id,
        receiverId: req.user!.id,
        amount: creditAmount.toFixed(2),
        type: "deposit",
        status: "completed",
        category: "Telegram Top-up",
        note: `Top-up from Telegram PayGram wallet (${creditAmount} PHPT)`,
        walletType: "phpt"
      });
      
      console.log(`Direct top-up success: ${creditAmount} PHPT for user ${req.user!.id}`);
      
      return res.json({
        success: true,
        message: `Successfully deposited ${creditAmount} PHPT to your wallet!`,
        amount: creditAmount,
        txId: uniqueTxId,
        invoiceCode
      });
    } catch (error: any) {
      console.error("Direct top-up error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Seamless auto-topup: Pay merchant invoice using user's Telegram token, then auto-redeem to PayVerse
  app.post("/api/crypto/auto-topup", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    // Get user's Telegram token from database
    const telegramToken = await getDecryptedTelegramToken(req.user!.id);
    if (!telegramToken) {
      return res.status(409).json({ 
        message: "Telegram wallet not connected. Please add your Telegram token in Profile settings.", 
        code: "TELEGRAM_NOT_CONNECTED" 
      });
    }
    
    try {
      const { invoiceCode } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      if (!invoiceCode) {
        return res.status(400).json({ success: false, message: "Invoice code is required" });
      }
      
      // SECURITY: Fetch invoice from storage to get authoritative amount - never trust client-supplied amount
      const storedInvoice = await storage.getCryptoInvoiceByInvoiceCode(invoiceCode);
      if (!storedInvoice) {
        return res.status(404).json({ success: false, message: "Invoice not found", code: "INVOICE_NOT_FOUND" });
      }
      
      // Verify the invoice belongs to this user
      if (storedInvoice.userId !== req.user!.id) {
        return res.status(403).json({ success: false, message: "Invoice does not belong to this user", code: "UNAUTHORIZED" });
      }
      
      // Use stored invoice amount for crediting - this is the authoritative source
      const authorizedAmount = parseFloat(storedInvoice.amount);
      const currencyCode = storedInvoice.currencyCode;
      const currencySymbol = currencyCode === 1 ? 'BTC' : currencyCode === 5 ? 'USDT' : 'PHPT';
      
      console.log(`Auto top-up: User ${userCliId} paying invoice ${invoiceCode} (authorized amount: ${authorizedAmount} ${currencySymbol})`);
      
      // Step 1: Pay the merchant invoice using user's Telegram token via TGIN PayInvoice
      const payUrl = `${TGIN_API_URL}/${telegramToken}/PayInvoice?invoiceCode=${encodeURIComponent(invoiceCode)}`;
      
      console.log(`Calling TGIN PayInvoice: ${payUrl.replace(telegramToken, '***')}`);
      
      const payResponse = await fetch(payUrl, {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      
      const payData = await payResponse.json();
      console.log("TGIN PayInvoice response:", JSON.stringify(payData, null, 2));
      
      // Verify payment was successful AND marked as paid
      if (!payData.success || (payData.isPaid === false)) {
        return res.json({
          success: false,
          message: payData.message || "Failed to pay invoice. Check your Telegram wallet balance.",
          step: "pay",
          rawResponse: payData
        });
      }
      
      // Step 2: Redeem the paid invoice to credit PayVerse account
      console.log(`Redeeming invoice ${invoiceCode} for user ${userCliId}`);
      
      const redeemResponse = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/RedeemInvoice`, {
        method: "POST",
        headers: { 
          "Accept": "text/plain",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          invoiceCode
        })
      });
      
      const redeemText = await redeemResponse.text();
      console.log("PayGram RedeemInvoice response:", redeemText);
      
      let redeemData;
      try {
        redeemData = JSON.parse(redeemText);
      } catch {
        redeemData = { success: redeemResponse.ok, message: redeemText };
      }
      
      // Redemption successful - record transaction for history (balance managed by PayGram)
      if (redeemData.success === true || redeemData.responseCode === 200) {
        const creditAmount = authorizedAmount;
        
        // Update invoice status in database for tracking
        await storage.updateCryptoInvoiceStatus(storedInvoice.invoiceId, "paid", new Date());
        
        // Record transaction for history
        await storage.createTransaction({
          senderId: req.user!.id,
          receiverId: req.user!.id,
          amount: creditAmount.toFixed(2),
          type: "deposit",
          status: "completed",
          category: "Telegram Top-up",
          note: `Auto top-up from Telegram wallet (Invoice: ${invoiceCode})`,
          walletType: "phpt"
        });
        
        console.log(`Auto top-up success: ${creditAmount} PHPT for user ${req.user!.id}`);
        
        return res.json({
          success: true,
          message: `Successfully transferred ${creditAmount} ${currencySymbol} to your wallet!`,
          amount: creditAmount,
          payResponse: payData,
          redeemResponse: redeemData
        });
      } else {
        // Payment succeeded but redemption failed - this shouldn't happen normally
        return res.json({
          success: false,
          message: redeemData.message || "Invoice paid but redemption failed. Please contact support.",
          step: "redeem",
          payResponse: payData,
          redeemResponse: redeemData
        });
      }
    } catch (error: any) {
      console.error("Auto top-up error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/crypto/invoice/:invoiceCode", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const { invoiceCode } = req.params;
      const userCliId = getUserCliId(req.user!);
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/InvoiceInfo`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          invoiceCode
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram InvoiceInfo error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/crypto/circulating", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/GetCirculatingCoins`, {
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
      console.error("PayGram GetCirculatingCoins error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/crypto/swap", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const { fromCurrency, toCurrency, amount, isSimulation = false } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/Swap`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          fromCurrency,
          toCurrency,
          amountToSwap: parseFloat(amount),
          isSimulation
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram Swap error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/crypto/transfer", authMiddleware, async (req: Request, res: Response) => {
    if (!(await getSharedPaygramToken())) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    const { toUserCliId, currency, amount } = req.body;
    const userCliId = getUserCliId(req.user!);
    
    const result = await executePaygramTransfer({
      fromUserCliId: userCliId,
      toUserCliId,
      amount: parseFloat(amount),
      currencyCode: currency,
      clientUnique: `crypto-transfer-${req.user!.id}-${Date.now()}`
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  // Send PHPT from PayVerse wallet to a PayGram user
  // Balance is managed by PayGram - just calls TransferCredit and records transaction
  // If recipient is a PayVerse user, links transaction properly for both parties
  app.post("/api/crypto/send-paygram", authMiddleware, async (req: Request, res: Response) => {
    if (!(await getSharedPaygramToken())) {
      return res.status(503).json({ success: false, message: "PayGram not configured" });
    }

    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ success: false, message: "Wallet not connected" });
    }

    const { recipientId, amount, note } = req.body;

    if (!recipientId || typeof recipientId !== 'string' || recipientId.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Recipient is required" });
    }

    const sendAmount = parseFloat(amount);
    if (isNaN(sendAmount) || sendAmount < 1) {
      return res.status(400).json({ success: false, message: "Minimum send amount is 1 PHPT" });
    }

    const userCliId = getUserCliId(req.user!);
    console.log(`PayGram send: ${userCliId} sending ${sendAmount} PHPT to ${recipientId}`);

    // Check if recipient is a PayVerse user (by username - case insensitive)
    const recipientUser = await storage.getUserByUsername(recipientId.toLowerCase());
    const isInternalTransfer = !!recipientUser;

    const result = await executePaygramTransfer({
      fromUserCliId: userCliId,
      toUserCliId: recipientId,
      amount: sendAmount,
      clientUnique: `send-paygram-${req.user!.id}-${Date.now()}`
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Transfer failed - insufficient balance or invalid recipient"
      });
    }

    // Record transaction for history
    // If recipient is a PayVerse user, use "transfer" type so it shows in both histories
    await storage.createTransaction({
      senderId: req.user!.id,
      receiverId: isInternalTransfer ? recipientUser!.id : null,
      amount: sendAmount.toFixed(2),
      type: isInternalTransfer ? "transfer" : "crypto_send",
      status: "completed",
      category: isInternalTransfer ? "Transfer" : "Crypto Send",
      note: note || (isInternalTransfer ? `Sent to ${recipientUser!.fullName}` : `Sent to PayGram: ${recipientId}`),
      walletType: "phpt"
    });

    // Sync balances from PayGram for both sender and receiver (if internal)
    const senderBalanceResult = await getUserPhptBalance(userCliId);
    if (senderBalanceResult.success) {
      await storage.updateUser(req.user!.id, { phptBalance: senderBalanceResult.balance.toFixed(2) });
      console.log(`[PayGram Send] Synced sender ${req.user!.username} balance: ${senderBalanceResult.balance}`);
    }

    if (isInternalTransfer && recipientUser) {
      const receiverCliId = getUserCliId(recipientUser);
      const receiverBalanceResult = await getUserPhptBalance(receiverCliId);
      if (receiverBalanceResult.success) {
        await storage.updateUser(recipientUser.id, { phptBalance: receiverBalanceResult.balance.toFixed(2) });
        console.log(`[PayGram Send] Synced receiver ${recipientUser.username} balance: ${receiverBalanceResult.balance}`);
      }
    }

    res.json({
      success: true,
      message: `Successfully sent ${sendAmount} PHPT to ${isInternalTransfer ? recipientUser!.fullName : recipientId}`,
      transactionId: result.transactionId,
      isInternalTransfer
    });
  });

  app.post("/api/crypto/withdraw", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const { amount, provider = 0, withdrawMethod } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/Withdraw`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          provider,
          amount: parseFloat(amount),
          withdrawMethod
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram Withdraw error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Withdraw PHPT from PayVerse to user's Telegram PayGram wallet
  // Flow: TGIN IssueInvoice (for Telegram to receive) → PayGramPay PayInvoice (pays from PayVerse)
  // This mirrors the top-up flow in reverse for seamless bidirectional transfers
  app.post("/api/crypto/cashout", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const { amount } = req.body;
      const withdrawAmount = parseFloat(amount);
      
      if (isNaN(withdrawAmount) || withdrawAmount < 1) {
        return res.status(400).json({ success: false, message: "Minimum withdrawal is 1 PHPT" });
      }
      
      const userCliId = getUserCliId(req.user!);
      
      // Decrypt user's Telegram token
      let telegramToken: string | null = null;
      try {
        telegramToken = decrypt(connection.apiToken);
      } catch (e) {
        console.error("[Cashout] Failed to decrypt Telegram token:", e);
      }
      
      // If no Telegram token, fall back to link-based approach
      if (!telegramToken) {
        console.log(`[Cashout] No Telegram token for user ${userCliId}, using link fallback`);
        return await handleLinkBasedCashout(req, res, userCliId, withdrawAmount, sharedToken);
      }
      
      console.log(`[Cashout] User ${userCliId} requesting ${withdrawAmount} PHPT cashout to Telegram (seamless)`);
      
      // Step 1: Create invoice via TGIN for user's Telegram to RECEIVE
      console.log(`[Cashout] Step 1: Creating TGIN invoice for Telegram wallet to receive ${withdrawAmount} PHPT`);
      
      const invoiceResult = await executeTginIssueInvoice(telegramToken, withdrawAmount, 11);
      
      if (!invoiceResult.success) {
        console.error("[Cashout] TGIN IssueInvoice failed:", invoiceResult.message);
        return await handleLinkBasedCashout(req, res, userCliId, withdrawAmount, sharedToken);
      }
      
      const invoiceCode = invoiceResult.invoiceCode!;
      const telegramUserId = invoiceResult.toUser;
      console.log(`[Cashout] TGIN invoice created: ${invoiceCode} for Telegram user ${telegramUserId}`);
      
      // Step 2: Pay the invoice from PayGramPay user's balance
      console.log(`[Cashout] Step 2: Paying invoice from PayGramPay user ${userCliId}`);
      
      const payResult = await executePaygramPayInvoice(userCliId, invoiceCode);
      
      if (!payResult.success) {
        return res.status(400).json({ success: false, message: payResult.message });
      }
      
      // Success! Record the completed withdrawal
      console.log(`[Cashout] SUCCESS: ${withdrawAmount} PHPT sent to Telegram user ${telegramUserId}`);
      
      const withdrawal = await storage.createCryptoWithdrawal({
        userId: req.user!.id,
        amount: String(withdrawAmount),
        fee: "0",
        method: "telegram_instant",
        currencyCode: 11
      });
      
      await storage.updateCryptoWithdrawal(withdrawal.id, {
        status: "completed",
        paygramTxId: invoiceCode,
        processedAt: new Date()
      });
      
      await storage.createTransaction({
        senderId: req.user!.id,
        amount: String(withdrawAmount),
        type: 'crypto_cashout',
        status: 'completed',
        category: 'withdrawal',
        note: `PHPT cashout to Telegram wallet`,
        walletType: "phpt"
      });
      
      res.json({
        success: true,
        message: `${withdrawAmount} PHPT has been sent to your Telegram wallet!`,
        withdrawalId: withdrawal.id,
        amount: withdrawAmount,
        telegramUserId,
        status: "completed"
      });
      
    } catch (error: any) {
      console.error("[Cashout] Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // Helper function for link-based cashout fallback
  async function handleLinkBasedCashout(
    req: Request, 
    res: Response, 
    userCliId: string, 
    withdrawAmount: number, 
    sharedToken: string
  ) {
    const requestId = generateRequestId();
    const invoiceResponse = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/IssueInvoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/plain" },
      body: JSON.stringify({
        requestId,
        userCliId,
        currencyCode: 11,
        amount: withdrawAmount.toFixed(2),
        callbackData: `payverse-cashout-${req.user!.id}-${Date.now()}`,
        merchantType: 0
      })
    });
    
    const invoiceText = await invoiceResponse.text();
    let invoiceData;
    try {
      invoiceData = JSON.parse(invoiceText);
    } catch (e) {
      return res.status(500).json({ success: false, message: "Failed to create withdrawal" });
    }
    
    if (!invoiceData.success) {
      return res.status(400).json({
        success: false,
        message: invoiceData.message || "Insufficient balance"
      });
    }
    
    const invoiceCode = invoiceData.invoiceCode;
    const telegramLink = generateTelegramRedeemLink(invoiceCode);
    
    const withdrawal = await storage.createCryptoWithdrawal({
      userId: req.user!.id,
      amount: String(withdrawAmount),
      fee: "0",
      method: "telegram_link",
      currencyCode: 11
    });
    
    await storage.updateCryptoWithdrawal(withdrawal.id, {
      status: "pending",
      paygramTxId: invoiceCode,
      voucherCode: invoiceData.friendlyVoucherCode,
      processedAt: new Date()
    });
    
    await storage.createTransaction({
      senderId: req.user!.id,
      amount: String(withdrawAmount),
      type: 'crypto_cashout',
      status: 'pending',
      category: 'withdrawal',
      note: `PHPT cashout via Telegram link`,
      walletType: "phpt"
    });
    
    return res.json({
      success: true,
      message: `Tap the link to claim ${withdrawAmount} PHPT in Telegram`,
      withdrawalId: withdrawal.id,
      amount: withdrawAmount,
      telegramLink,
      status: "pending"
    });
  }

  // Cancel a pending withdrawal - marks it as failed in history
  app.post("/api/crypto/cancel-withdrawal", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { invoiceId, amount } = req.body;
      
      if (!invoiceId) {
        return res.status(400).json({ success: false, message: "Invoice ID required" });
      }
      
      // Find and update the withdrawal record by invoice code
      const withdrawals = await storage.getCryptoWithdrawalsByUserId(req.user!.id);
      const pendingWithdrawal = withdrawals.find(
        (w: any) => w.paygramTxId === invoiceId && w.status === 'pending'
      );
      
      if (pendingWithdrawal) {
        // Update withdrawal status to failed
        await storage.updateCryptoWithdrawal(pendingWithdrawal.id, {
          status: "failed",
          processedAt: new Date()
        });
      }
      
      // Create a failed transaction record for history
      await storage.createTransaction({
        senderId: req.user!.id,
        amount: String(amount || 0),
        type: 'crypto_cashout',
        status: 'failed',
        category: 'withdrawal',
        note: `Cancelled withdrawal - Invoice: ${invoiceId.substring(0, 12)}...`,
        walletType: "phpt"
      });
      
      console.log(`Withdrawal cancelled by user ${req.user!.id}: Invoice ${invoiceId}`);
      
      res.json({
        success: true,
        message: "Withdrawal cancelled"
      });
      
    } catch (error: any) {
      console.error("Cancel withdrawal error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get user's withdrawal history
  app.get("/api/crypto/withdrawals", authMiddleware, async (req: Request, res: Response) => {
    try {
      const withdrawals = await storage.getCryptoWithdrawalsByUserId(req.user!.id);
      res.json({ success: true, withdrawals });
    } catch (error: any) {
      console.error("Get withdrawals error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get("/api/crypto/statement", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/GetStatement`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          fromUtc: thirtyDaysAgo.toISOString(),
          toExcludingUtc: now.toISOString(),
          startIdx: 0,
          resultsPerPage: 25,
          goForward: true
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram GetStatement error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/crypto/set-callback", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const { callbackUrl } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/SetCallbackApi`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          url: callbackUrl
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram SetCallbackApi error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // PayGram callback endpoint - receives payment notifications
  // Configure this URL in the PayGram Telegram bot with currency code 11 (PHPT)
  app.post("/api/crypto/callback", async (req: Request, res: Response) => {
    try {
      const callbackData = req.body;
      console.log("=== PayGram Callback Received ===");
      console.log("Timestamp:", new Date().toISOString());
      console.log("Data:", JSON.stringify(callbackData, null, 2));
      
      // Extract payment details from callback
      const {
        invoiceCode,
        invoiceId,
        amount,
        currencyCode,
        status,
        payerUsername,
        paidAt,
        transactionId
      } = callbackData;
      
      // Log the payment confirmation
      const invoiceIdentifier = invoiceCode || invoiceId;
      
      if (status === 'paid' || status === 'completed' || callbackData.success) {
        console.log(`Payment confirmed: ${amount} (currency ${currencyCode || 11})`);
        console.log(`Invoice: ${invoiceIdentifier}`);
        console.log(`Payer: ${payerUsername || 'unknown'}`);
        
        // Look up the invoice in our database - try both invoiceId and invoiceCode
        if (invoiceIdentifier) {
          let invoice = await storage.getCryptoInvoiceByInvoiceId(invoiceIdentifier);
          if (!invoice) {
            // Try by invoiceCode if not found by invoiceId
            invoice = await storage.getCryptoInvoiceByInvoiceCode(invoiceIdentifier);
          }
          
          if (invoice && invoice.status === 'pending') {
            const creditAmount = parseFloat(String(amount || invoice.amount));

            // Update invoice status to paid
            await storage.updateCryptoInvoiceStatus(invoice.invoiceId, 'paid', new Date());

            // Credit local balance and record transaction using balanceService
            const { balanceService } = await import("./balance-service");
            await balanceService.creditFromPaygram({
              userId: invoice.userId,
              amount: creditAmount,
              type: "crypto_topup",
              note: `PHPT top-up via PayGram invoice ${invoice.invoiceId}`,
              paygramTxId: invoice.invoiceId,
            });

            console.log(`Invoice ${invoiceIdentifier} paid: ${creditAmount} PHPT credited for user ${invoice.userId}`);
          } else if (invoice?.status !== 'pending') {
            console.log(`Invoice ${invoiceIdentifier} already processed (status: ${invoice?.status})`);
          } else {
            console.log(`Invoice ${invoiceIdentifier} not found in database`);
          }
        }
      }
      
      // Always respond with success to acknowledge receipt
      res.json({ 
        success: true, 
        received: true,
        message: "Callback processed successfully",
        invoiceId: invoiceIdentifier,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("PayGram callback error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Endpoint to get the callback URL for setting up in PayGram bot
  app.get("/api/crypto/callback-url", (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${protocol}://${host}/api/crypto/callback`;
    
    res.json({
      success: true,
      callbackUrl,
      currencyCode: 11, // PHPT
      currencyName: "PHPT",
      instructions: "Copy this URL and paste it in the PayGram Telegram bot's callback settings"
    });
  });

  app.post("/api/crypto/red-envelope/create", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const { currency, amount, maxRedeemers } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/CreateRedEnvelope`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          currencyCode: currency || 11,
          amount: parseFloat(amount),
          maxNumOfRedeemers: maxRedeemers || 1
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram CreateRedEnvelope error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post("/api/crypto/red-envelope/redeem", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    const connection = await storage.getPaygramConnection(req.user!.id);
    if (!connection) {
      return res.status(409).json({ message: "Wallet not connected", code: "WALLET_NOT_CONNECTED" });
    }
    
    try {
      const { invoiceId } = req.body;
      const userCliId = getUserCliId(req.user!);
      
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/RedeemRedEnvelope`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          invoiceId
        })
      });
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PayGram RedeemRedEnvelope error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get user's crypto invoices (all or pending only)
  app.get("/api/crypto/invoices", authMiddleware, async (req: Request, res: Response) => {
    try {
      const pendingOnly = req.query.pending === "true";
      const invoices = pendingOnly 
        ? await storage.getPendingCryptoInvoicesByUserId(req.user!.id)
        : await storage.getCryptoInvoicesByUserId(req.user!.id);
      
      res.json({ success: true, invoices });
    } catch (error: any) {
      console.error("Get invoices error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Check invoice status against PayGram and update local record
  app.post("/api/crypto/invoices/:invoiceId/check-status", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const { invoiceId } = req.params;
      const invoice = await storage.getCryptoInvoiceByInvoiceId(invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ success: false, message: "Invoice not found" });
      }
      
      if (invoice.userId !== req.user!.id) {
        return res.status(403).json({ success: false, message: "Not authorized" });
      }
      
      // Call PayGram GetInvoice to check actual status
      const userCliId = getUserCliId(req.user!);
      const response = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/GetInvoice`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          invoiceId
        })
      });
      
      const data = await response.json();
      console.log(`GetInvoice response for ${invoiceId}:`, JSON.stringify(data, null, 2));
      
      if (data.success) {
        // Update local invoice status based on PayGram response
        const paygramStatus = data.isPaid ? "paid" : (data.status || invoice.status);
        
        if (data.isPaid && invoice.status === "pending") {
          await storage.markInvoicePaid(invoiceId, data.txId);
        }
        
        res.json({
          success: true,
          localStatus: invoice.status,
          paygramStatus: paygramStatus,
          isPaid: data.isPaid,
          isCredited: invoice.status === "credited",
          canReclaim: data.isPaid && invoice.status !== "credited",
          invoice: { ...invoice, paygramData: data }
        });
      } else {
        res.json({
          success: false,
          message: data.message || "Failed to check invoice status",
          localStatus: invoice.status,
          invoice
        });
      }
    } catch (error: any) {
      console.error("Check invoice status error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Confirm invoice is paid - just updates tracking status (balance managed by PayGram)
  app.post("/api/crypto/invoices/:invoiceId/confirm", authMiddleware, async (req: Request, res: Response) => {
    const sharedToken = await getSharedPaygramToken();
    if (!sharedToken) {
      return res.status(503).json({ message: "PayGram not configured", code: "PAYGRAM_NOT_CONFIGURED" });
    }
    
    try {
      const { invoiceId } = req.params;
      const invoice = await storage.getCryptoInvoiceByInvoiceId(invoiceId);
      
      if (!invoice) {
        return res.status(404).json({ success: false, message: "Invoice not found" });
      }
      
      if (invoice.userId !== req.user!.id) {
        return res.status(403).json({ success: false, message: "Not authorized" });
      }
      
      if (invoice.status === "paid" || invoice.status === "credited") {
        return res.status(400).json({ success: false, message: "Invoice already processed" });
      }
      
      // Verify with PayGram that the invoice is actually paid
      const userCliId = getUserCliId(req.user!);
      const checkResponse = await fetch(`${PAYGRAM_API_URL}/${sharedToken}/GetInvoice`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: generateRequestId(),
          userCliId,
          invoiceId
        })
      });
      
      const checkData = await checkResponse.json();
      
      if (!checkData.success || !checkData.isPaid) {
        return res.status(400).json({ 
          success: false, 
          message: "Invoice is not paid yet. Please complete the payment first.",
          paygramStatus: checkData.status || "unknown"
        });
      }
      
      // Update invoice status to paid
      await storage.updateCryptoInvoiceStatus(invoiceId, "paid", new Date());

      // Credit local balance and record transaction using balanceService
      const creditAmount = parseFloat(invoice.amount);
      const { balanceService } = await import("./balance-service");
      await balanceService.creditFromPaygram({
        userId: req.user!.id,
        amount: creditAmount,
        type: "crypto_topup",
        note: `Invoice ${invoice.invoiceCode || invoiceId} confirmed`,
        paygramTxId: invoice.invoiceId,
      });

      console.log(`Invoice ${invoiceId} confirmed paid for user ${req.user!.id}: ${creditAmount} PHPT`);

      res.json({
        success: true,
        message: `Invoice confirmed! ${creditAmount} PHPT credited to your wallet.`,
        amount: creditAmount
      });
    } catch (error: any) {
      console.error("Confirm invoice error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  console.log("PayGram crypto routes registered (proper API with POST requests)");
}

// Admin wallet transfer function - sends PHPT from admin PayVerse escrow to user
export async function transferFromAdminWallet(
  recipientUserCliId: string,
  amount: number
): Promise<{ success: boolean; message: string; transactionId?: string }> {
  // Super admin's PayGram username is always "superadmin" (the escrow account)
  const adminUserCliId = "superadmin";
  
  if (amount < 1) {
    return { success: false, message: "Minimum transfer amount is 1 PHPT" };
  }
  
  console.log(`[AdminToUser] Transferring ${amount} PHPT from ${adminUserCliId} to ${recipientUserCliId}`);
  
  const result = await executePaygramTransfer({
    fromUserCliId: adminUserCliId,
    toUserCliId: recipientUserCliId,
    amount,
    clientUnique: `casino-payout-${Date.now()}`
  });
  
  if (!result.success) {
    console.error("[AdminToUser] Transfer failed:", result.message);
    if (result.message.toLowerCase().includes('insufficient')) {
      return { success: false, message: "Insufficient PHPT balance in admin escrow" };
    }
  } else {
    console.log(`[AdminToUser] Successfully transferred ${amount} PHPT`);
  }
  
  return result;
}

// Transfer PHPT from user's PayGram account to admin wallet
export async function transferToAdminWallet(
  senderUserCliId: string,
  amount: number
): Promise<{ success: boolean; message: string; transactionId?: string }> {
  // Super admin's PayGram username is always "superadmin" (the escrow account)
  const adminUserCliId = "superadmin";
  
  if (amount < 1) {
    return { success: false, message: "Minimum transfer amount is 1 PHPT" };
  }
  
  console.log(`[UserToAdmin] Transferring ${amount} PHPT from ${senderUserCliId} to admin wallet`);
  
  const result = await executePaygramTransfer({
    fromUserCliId: senderUserCliId,
    toUserCliId: adminUserCliId,
    amount,
    clientUnique: `qrph-payout-${Date.now()}`
  });
  
  if (result.success) {
    console.log(`[UserToAdmin] Successfully transferred ${amount} PHPT`);
  }
  
  return result;
}

// Get user's PHPT balance from PayGram
export async function getUserPhptBalance(userCliId: string): Promise<{ success: boolean; balance: number; message?: string }> {
  const result = await getPaygramUserInfo(userCliId);
  
  if (!result.success) {
    // User might not be registered - try to register them
    console.log(`[getUserPhptBalance] User ${userCliId} not found, attempting registration`);
    const regResult = await registerPaygramUser(userCliId);
    if (regResult.success) {
      return { success: true, balance: 0 };
    }
    return { success: false, balance: 0, message: result.message || "Failed to get balance" };
  }
  
  const balance = extractPhptBalance(result.coins);
  console.log(`[getUserPhptBalance] User ${userCliId} has ${balance} PHPT`);
  return { success: true, balance };
}
