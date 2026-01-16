import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, registerUserSchema, transferSchema, LARGE_TRANSFER_THRESHOLD } from "@shared/schema";
import bcrypt from "bcrypt";
import { ZodError } from "zod";
import { registerPaygramRoutes, registerPaygramUser, getUserPhptBalance } from "./paygram";
import { registerAdminRoutes } from "./admin";
import { registerNexusPayRoutes } from "./nexuspay";
import { registerManualDepositRoutes } from "./manual-deposits";
import { registerOtpRoutes } from "./otp";
import { registerSecurityRoutes } from "./security";
import { registerKycRoutes } from "./kyc";
import { registerTutorialRoutes } from "./tutorials";
import { registerCasinoRoutes } from "./casino";
import { registerSettingsRoutes, getSystemSetting } from "./settings";
import { registerReportRoutes } from "./reports";
import { registerManualWithdrawalRoutes } from "./manual-withdrawals";
import { seedAdminAccount } from "./seed";
import { sessions, generateSessionToken, authMiddleware } from "./auth";
import { initializeEmailTransporter, sendWelcomeEmail, sendTransferReceivedEmail, sendTransferSentEmail } from "./email";
import { setupSwagger } from "./swagger";
import { sanitizeUser, verifyUserPin } from "./utils";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  await seedAdminAccount();
  initializeEmailTransporter();
  setupSwagger(app);
  registerPaygramRoutes(app);
  registerAdminRoutes(app);
  registerNexusPayRoutes(app);
  registerManualDepositRoutes(app);
  registerOtpRoutes(app);
  registerSecurityRoutes(app);
  registerKycRoutes(app);
  registerTutorialRoutes(app);
  await registerCasinoRoutes(app, authMiddleware);
  registerSettingsRoutes(app, authMiddleware);
  registerReportRoutes(app);
  registerManualWithdrawalRoutes(app);

  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerUserSchema.parse(req.body);

      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const hashedPin = await bcrypt.hash(data.pin, 10);

      // Remove pin from data before passing to createUser (it expects pinHash)
      const { pin, ...userData } = data;
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        pinHash: hashedPin,
      });

      // Register user with PayGram using their username as userCliId
      registerPaygramUser(user.username).catch(err => {
        console.error("Background PayGram registration failed:", err);
      });

      // Send welcome email
      sendWelcomeEmail(user.email, user.fullName).catch(err => {
        console.error("Failed to send welcome email:", err);
      });

      const token = generateSessionToken();
      sessions.set(token, user.id);

      res.json({ user: sanitizeUser(user), token });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateSessionToken();
      sessions.set(token, user.id);

      res.json({ user: sanitizeUser(user), token });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", authMiddleware, async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.substring(7);
      sessions.delete(token);
    }
    res.json({ message: "Logged out successfully" });
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    res.json(sanitizeUser(req.user!));
  });

  app.get("/api/transactions", authMiddleware, async (req, res) => {
    try {
      const transactions = await storage.getTransactionsByUserId(req.user!.id);
      const currentUserId = req.user!.id;

      const enrichedTransactions = await Promise.all(
        transactions.map(async (tx) => {
          let counterparty = null;

          // Determine if this is outgoing from current user's perspective
          // For transfers: outgoing if we're the sender
          // For self-transactions (senderId === receiverId): check the type
          const isSelfTransaction = tx.senderId === tx.receiverId && tx.senderId === currentUserId;
          const isOutgoing = tx.senderId === currentUserId && tx.receiverId !== currentUserId;
          const isIncoming = tx.receiverId === currentUserId && tx.senderId !== currentUserId;

          // Get counterparty info for transfers
          if (tx.type === "transfer" || tx.type === "crypto_send") {
            if (isOutgoing && tx.receiverId) {
              const receiver = await storage.getUser(tx.receiverId);
              if (receiver) {
                counterparty = {
                  id: receiver.id,
                  fullName: receiver.fullName,
                  username: receiver.username,
                };
              }
            } else if (isIncoming && tx.senderId) {
              const sender = await storage.getUser(tx.senderId);
              if (sender) {
                counterparty = {
                  id: sender.id,
                  fullName: sender.fullName,
                  username: sender.username,
                };
              }
            }
          }

          // Determine direction based on transaction type and user role
          const outgoingTypes = ["withdrawal", "cashout", "crypto_cashout", "crypto_send", "qrph_payout", "qrph_payout_failed", "casino_deposit", "sync_debit"];
          const incomingTypes = ["deposit", "topup", "qrph_cashin", "qrph_credit", "manual_deposit", "crypto_topup", "casino_withdraw", "sync_credit"];

          let direction: "incoming" | "outgoing";
          if (incomingTypes.includes(tx.type)) {
            direction = "incoming";
          } else if (outgoingTypes.includes(tx.type)) {
            direction = "outgoing";
          } else if (tx.type === "transfer") {
            // For P2P transfers, direction depends on whether user is sender or receiver
            direction = isOutgoing ? "outgoing" : "incoming";
          } else {
            // Default: check if user is sender or receiver
            direction = isOutgoing ? "outgoing" : "incoming";
          }

          // Build human-readable description with counterparty names
          let description: string;

          switch (tx.type) {
            case "transfer":
              if (isOutgoing && counterparty) {
                description = `Sent to ${counterparty.fullName}`;
              } else if (isIncoming && counterparty) {
                description = `Received from ${counterparty.fullName}`;
              } else if (isOutgoing) {
                description = "Transfer sent";
              } else {
                description = "Transfer received";
              }
              break;
            case "crypto_send":
              if (counterparty) {
                description = `Sent to ${counterparty.fullName}`;
              } else {
                // Extract recipient from note if available (for external PayGram sends)
                const noteMatch = tx.note?.match(/Sent to PayGram: (.+)/);
                description = noteMatch ? `Sent to @${noteMatch[1]}` : "Crypto transfer sent";
              }
              break;
            case "topup":
            case "deposit":
              description = tx.category === "Telegram Top-up" ? "Telegram top-up" : "Wallet top-up";
              break;
            case "manual_deposit":
              description = "Manual deposit";
              break;
            case "crypto_topup":
              description = tx.category === "Invoice Payment" ? "Invoice payment received" : "Telegram top-up";
              break;
            case "qrph_cashin":
              description = "QRPH cash-in initiated";
              break;
            case "qrph_credit":
              description = "QRPH deposit credited";
              break;
            case "qrph_payout":
              description = "QRPH cash-out";
              break;
            case "qrph_payout_failed":
              description = "QRPH cash-out (refunded)";
              break;
            case "withdrawal":
            case "cashout":
              description = "Withdrawal";
              break;
            case "crypto_cashout":
              description = "Crypto cash-out";
              break;
            case "casino_deposit":
              description = "Casino chips purchase";
              break;
            case "casino_withdraw":
              description = "Casino chips sold";
              break;
            case "sync_credit":
              description = "Balance adjustment (credit)";
              break;
            case "sync_debit":
              description = "Balance adjustment (debit)";
              break;
            default:
              // Use note or category for unknown types
              description = tx.note?.substring(0, 50) || tx.category || tx.type.replace(/_/g, ' ');
          }

          // Get category label for display
          const categoryLabels: Record<string, string> = {
            "transfer": "Transfer",
            "crypto_send": "Transfer",
            "topup": "Top-up",
            "deposit": "Deposit",
            "manual_deposit": "Deposit",
            "crypto_topup": "Top-up",
            "qrph_cashin": "QRPH",
            "qrph_credit": "QRPH",
            "qrph_payout": "QRPH",
            "qrph_payout_failed": "QRPH",
            "withdrawal": "Withdrawal",
            "cashout": "Cash Out",
            "crypto_cashout": "Cash Out",
            "casino_deposit": "Casino",
            "casino_withdraw": "Casino",
            "sync_credit": "Adjustment",
            "sync_debit": "Adjustment",
          };

          return {
            ...tx,
            counterparty,
            direction,
            description,
            displayCategory: categoryLabels[tx.type] || tx.category || "Transaction",
            originalType: tx.type,
            type: direction === "incoming" ? "received" : "sent", // For backward compatibility with frontend
          };
        })
      );

      res.json(enrichedTransactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // P2P Transfer - uses PayGram TransferCredit as single source of truth
  // PayVerse database only stores transaction records for history
  app.post("/api/transfer", authMiddleware, async (req, res) => {
    try {
      const { receiverId, amount, note, pin } = transferSchema.parse(req.body);
      const sender = await storage.getUser(req.user!.id);
      
      if (!sender) {
        return res.status(401).json({ message: "User not found" });
      }

      if (sender.id === receiverId) {
        return res.status(400).json({ message: "Cannot transfer to yourself" });
      }

      const receiver = await storage.getUser(receiverId);
      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" });
      }

      const transferAmount = parseFloat(amount);
      if (transferAmount < 1) {
        return res.status(400).json({ message: "Minimum transfer is 1 PHPT" });
      }

      // KYC verification only for large transfers (5000+)
      if (transferAmount >= LARGE_TRANSFER_THRESHOLD) {
        if (sender.kycStatus !== "verified") {
          return res.status(403).json({
            message: `KYC verification required for transfers of ${LARGE_TRANSFER_THRESHOLD.toLocaleString()} PHPT or more. Please complete your identity verification.`,
            requiresKyc: true,
            kycStatus: sender.kycStatus || "unverified",
          });
        }
      }

      // Use centralized PIN verification
      const pinResult = await verifyUserPin(sender, pin, storage.updateUserPinAttempts.bind(storage));
      if (!pinResult.success) {
        return res.status(pinResult.statusCode).json({
          message: pinResult.message,
          requiresPin: pinResult.requiresPin,
          needsPinSetup: pinResult.needsPinSetup,
          lockedUntil: pinResult.lockedUntil,
          attemptsRemaining: pinResult.attemptsRemaining
        });
      }

      // Get PayGram API token from system settings or env
      const sharedToken = await getSystemSetting("PAYGRAM_API_TOKEN", "");
      if (!sharedToken) {
        return res.status(503).json({ message: "Payment system not configured" });
      }

      // Get userCliIds for both sender and receiver
      const senderCliId = sender.username || sender.email;
      const receiverCliId = receiver.username || receiver.email;

      // Execute transfer via PayGram TransferCredit API
      const clientUnique = `transfer-${sender.id}-${receiverId}-${Date.now()}`;
      const response = await fetch(`https://api.pay-gram.org/${sharedToken}/TransferCredit`, {
        method: "POST",
        headers: { 
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requestId: -Math.floor(Math.random() * 9000000000) - 1000000000,
          userCliId: senderCliId,
          toUserCliId: receiverCliId,
          currencyCode: 11, // PHPT
          amount: transferAmount,
          ClientUnique: clientUnique
        })
      });

      const paygramData = await response.json();
      console.log("PayGram P2P Transfer:", JSON.stringify(paygramData, null, 2));

      if (!paygramData.success) {
        return res.status(400).json({ 
          message: paygramData.message || "Transfer failed - insufficient balance or invalid recipient"
        });
      }

      // Record the transaction in database for history (balance is managed by PayGram)
      const transaction = await storage.createTransaction({
        senderId: sender.id,
        receiverId,
        amount,
        type: "transfer",
        status: "completed",
        category: "Transfer",
        note,
        walletType: "phpt"
      });

      // Sync real balances from PayGram to keep database in sync
      // Fetch actual balances from PayGram (source of truth)
      const [senderBalanceResult, receiverBalanceResult] = await Promise.all([
        getUserPhptBalance(senderCliId),
        getUserPhptBalance(receiverCliId)
      ]);

      // Update sender's balance from PayGram
      if (senderBalanceResult.success) {
        await storage.updateUser(sender.id, { phptBalance: senderBalanceResult.balance.toFixed(2) });
        console.log(`[Transfer] Synced sender ${sender.username} balance from PayGram: ${senderBalanceResult.balance}`);
      }

      // Update receiver's balance from PayGram
      if (receiverBalanceResult.success) {
        await storage.updateUser(receiver.id, { phptBalance: receiverBalanceResult.balance.toFixed(2) });
        console.log(`[Transfer] Synced receiver ${receiver.username} balance from PayGram: ${receiverBalanceResult.balance}`);
      }

      // Send email notifications for transfer (async, don't block response)
      sendTransferSentEmail(sender.email, sender.fullName, receiver.fullName, amount, note || undefined).catch(err => {
        console.error("Failed to send transfer sent email:", err);
      });
      sendTransferReceivedEmail(receiver.email, receiver.fullName, sender.fullName, amount, note || undefined).catch(err => {
        console.error("Failed to send transfer received email:", err);
      });

      res.json({
        message: "Transfer successful",
        transaction,
        paygramTransactionId: paygramData.transactionId
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Transfer error:", error);
      res.status(500).json({ message: "Transfer failed" });
    }
  });

  app.get("/api/users/search", authMiddleware, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }

      const users = await storage.searchUsers(query);
      const filtered = users.filter(u => u.id !== req.user!.id);
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ message: "Search failed" });
    }
  });

  return httpServer;
}
