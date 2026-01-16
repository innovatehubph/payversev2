import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, insertUserSchema, transferSchema, LARGE_TRANSFER_THRESHOLD } from "@shared/schema";
import bcrypt from "bcrypt";
import { ZodError } from "zod";
import { registerPaygramRoutes, registerPaygramUser } from "./paygram";
import { registerAdminRoutes } from "./admin";
import { registerNexusPayRoutes } from "./nexuspay";
import { registerManualDepositRoutes } from "./manual-deposits";
import { registerOtpRoutes } from "./otp";
import { registerSecurityRoutes } from "./security";
import { registerKycRoutes } from "./kyc";
import { registerTutorialRoutes } from "./tutorials";
import { registerCasinoRoutes } from "./casino";
import { seedAdminAccount } from "./seed";
import { sessions, generateSessionToken, authMiddleware } from "./auth";
import { initializeEmailTransporter, sendWelcomeEmail, sendTransferReceivedEmail, sendTransferSentEmail } from "./email";
import { setupSwagger } from "./swagger";

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
  registerCasinoRoutes(app, authMiddleware);
  
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
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

      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
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

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
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
    const { password, ...userWithoutPassword } = req.user!;
    res.json(userWithoutPassword);
  });

  app.get("/api/transactions", authMiddleware, async (req, res) => {
    try {
      const transactions = await storage.getTransactionsByUserId(req.user!.id);
      
      const enrichedTransactions = await Promise.all(
        transactions.map(async (tx) => {
          let counterparty = null;
          if (tx.senderId === req.user!.id && tx.receiverId) {
            const receiver = await storage.getUser(tx.receiverId);
            if (receiver) {
              counterparty = {
                id: receiver.id,
                fullName: receiver.fullName,
                username: receiver.username,
              };
            }
          } else if (tx.receiverId === req.user!.id && tx.senderId) {
            const sender = await storage.getUser(tx.senderId);
            if (sender) {
              counterparty = {
                id: sender.id,
                fullName: sender.fullName,
                username: sender.username,
              };
            }
          }

          // Preserve special transaction types like deposit, withdrawal
          // Map QRPH cash-in types to display as deposits (incoming funds)
          const preserveTypes = ["deposit", "withdrawal", "topup", "cashout"];
          const depositTypes = ["qrph_cashin", "qrph_credit", "qrph_credit_pending"];
          
          let displayType: string;
          if (preserveTypes.includes(tx.type)) {
            displayType = tx.type;
          } else if (depositTypes.includes(tx.type)) {
            displayType = "deposit";
          } else {
            displayType = tx.senderId === req.user!.id ? "sent" : "received";
          }
          
          return {
            ...tx,
            counterparty,
            type: displayType,
          };
        })
      );

      res.json(enrichedTransactions);
    } catch (error) {
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

      // PIN verification for large transfers
      if (transferAmount >= LARGE_TRANSFER_THRESHOLD) {
        if (!sender.pinHash) {
          return res.status(400).json({ 
            message: "PIN required for large transfers. Please set up your PIN first.",
            requiresPin: true,
            needsPinSetup: true
          });
        }
        
        if (!pin) {
          return res.status(400).json({ 
            message: `PIN required for transfers of ${LARGE_TRANSFER_THRESHOLD.toLocaleString()} PHPT or more`,
            requiresPin: true
          });
        }
        
        // Check lockout
        if (sender.pinLockedUntil && new Date(sender.pinLockedUntil) > new Date()) {
          const remainingMinutes = Math.ceil((new Date(sender.pinLockedUntil).getTime() - Date.now()) / 60000);
          return res.status(423).json({ 
            message: `PIN locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
            lockedUntil: sender.pinLockedUntil
          });
        }
        
        // Verify PIN
        const isValidPin = await bcrypt.compare(pin, sender.pinHash);
        if (!isValidPin) {
          const newAttempts = (sender.pinFailedAttempts || 0) + 1;
          const maxAttempts = 5;
          
          if (newAttempts >= maxAttempts) {
            const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
            await storage.updateUserPinAttempts(sender.id, newAttempts, lockUntil);
            return res.status(423).json({ 
              message: "Too many failed PIN attempts. PIN locked for 30 minutes.",
              lockedUntil: lockUntil
            });
          }
          
          await storage.updateUserPinAttempts(sender.id, newAttempts, null);
          return res.status(401).json({ 
            message: `Invalid PIN. ${maxAttempts - newAttempts} attempts remaining.`,
            attemptsRemaining: maxAttempts - newAttempts
          });
        }
        
        // Reset failed attempts on success
        await storage.updateUserPinAttempts(sender.id, 0, null);
      }

      // Get PayGram API token
      const sharedToken = process.env.PAYGRAM_API_TOKEN;
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
