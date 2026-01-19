import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PayVerse E-Wallet API",
      version: "1.0.0",
      description: "PayVerse is a production-ready P2P e-wallet application for secure peer-to-peer money transfers, wallet management, and cryptocurrency integration via PayGram API. Features include QRPH cash-in/out, 747Live casino integration, and Telegram top-up.",
      contact: {
        name: "PayVerse Support",
        email: "support@payverse.ph"
      }
    },
    servers: [
      {
        url: process.env.PUBLIC_APP_URL || "https://payverse.ph",
        description: "Production Server"
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your Bearer token from login response"
        }
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            email: { type: "string", format: "email" },
            fullName: { type: "string" },
            username: { type: "string" },
            balance: { type: "string" },
            phptBalance: { type: "string" },
            kycStatus: { type: "string", enum: ["unverified", "pending", "verified", "rejected"] },
            isActive: { type: "boolean" },
            role: { type: "string", enum: ["super_admin", "admin", "support", "user"] }
          }
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "integer" },
            senderId: { type: "integer" },
            receiverId: { type: "integer" },
            amount: { type: "string" },
            type: { type: "string" },
            status: { type: "string" },
            note: { type: "string" },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" }
          }
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" }
          }
        }
      }
    },
    tags: [
      { name: "Auth", description: "User authentication and session management" },
      { name: "Wallet", description: "Wallet balance and PayGram integration" },
      { name: "Transfers", description: "P2P PHPT transfers between users" },
      { name: "QRPH", description: "NexusPay QRPH cash-in (deposit) and cash-out (withdraw)" },
      { name: "Casino", description: "747Live casino buy/sell chips integration (PIN required)" },
      { name: "Crypto", description: "PayGram cryptocurrency operations (Telegram top-up, invoices, etc.)" },
      { name: "Security", description: "PIN setup, verification, and password management" },
      { name: "KYC", description: "Know Your Customer verification" },
      { name: "Admin", description: "Admin dashboard and user management" },
      { name: "Manual Deposits", description: "Manual P2P deposit system" },
      { name: "Manual Withdrawals", description: "Manual withdrawal to bank/e-wallet accounts" },
      { name: "AI Chat", description: "Intelligent AI assistant for user support and guidance" },
      { name: "AI FAQs", description: "AI-powered FAQ system with learning capabilities" }
    ],
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user account",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "fullName", "username"],
                  properties: {
                    email: { type: "string", format: "email", example: "user@example.com" },
                    password: { type: "string", minLength: 6, example: "securePassword123" },
                    fullName: { type: "string", example: "Juan Dela Cruz" },
                    username: { type: "string", example: "juandc" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Registration successful, returns user and token" },
            "400": { description: "Validation error or email/username exists" }
          }
        }
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login with email and password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Login successful, returns user data and bearer token" },
            "401": { description: "Invalid credentials" }
          }
        }
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout current session",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Logged out successfully" }
          }
        }
      },
      "/api/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current authenticated user profile",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Current user data" },
            "401": { description: "Unauthorized - invalid or expired token" }
          }
        }
      },
      "/api/wallet/balance": {
        get: {
          tags: ["Wallet"],
          summary: "Get PHPT wallet balance from PayGram",
          description: "Fetches real-time PHPT balance from PayGram (single source of truth) and syncs to local database",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Wallet balance",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      phptBalance: { type: "string", example: "1000.00" },
                      connected: { type: "boolean" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/crypto/status": {
        get: {
          tags: ["Wallet"],
          summary: "Check PayGram wallet connection status",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Connection status and wallet info" }
          }
        }
      },
      "/api/crypto/connect": {
        post: {
          tags: ["Wallet"],
          summary: "Connect Telegram wallet via PayGram token",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token"],
                  properties: {
                    token: { type: "string", description: "PayGram API token from Telegram bot" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Wallet connected successfully" }
          }
        },
        delete: {
          tags: ["Wallet"],
          summary: "Disconnect PayGram wallet",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Wallet disconnected" }
          }
        }
      },
      "/api/transfer": {
        post: {
          tags: ["Transfers"],
          summary: "Send PHPT to another PayVerse user",
          description: "Transfer PHPT from your wallet to another user. Requires PIN verification for security.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["receiverId", "amount"],
                  properties: {
                    receiverId: { type: "integer", description: "Recipient user ID" },
                    amount: { type: "string", description: "Amount to send", example: "100.00" },
                    note: { type: "string", description: "Optional transfer note" },
                    pin: { type: "string", description: "6-digit PIN for verification" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Transfer successful" },
            "400": { description: "Invalid amount or insufficient balance" }
          }
        }
      },
      "/api/transactions": {
        get: {
          tags: ["Transfers"],
          summary: "Get transaction history",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "type", in: "query", schema: { type: "string" }, description: "Filter by type (casino, deposit, etc.)" }
          ],
          responses: {
            "200": { description: "List of transactions" }
          }
        }
      },
      "/api/users/search": {
        get: {
          tags: ["Transfers"],
          summary: "Search users by username or email",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Search query" }
          ],
          responses: {
            "200": { description: "Matching users (id, fullName, username, email)" }
          }
        }
      },
      "/api/nexuspay/status": {
        get: {
          tags: ["QRPH"],
          summary: "Check NexusPay QRPH integration status",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "NexusPay configuration status" }
          }
        }
      },
      "/api/nexuspay/cashin": {
        post: {
          tags: ["QRPH"],
          summary: "Initiate QRPH cash-in (deposit PHP via QR)",
          description: "Generate a QR code for depositing PHP. After payment confirmation via webhook, PHPT is credited 1:1.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number", minimum: 100, description: "Amount in PHP (min 100)", example: 500 }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "QR code generated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      qrCode: { type: "string", description: "Base64 QR image" },
                      transactionId: { type: "string" },
                      expiresAt: { type: "string", format: "date-time" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/nexuspay/cashin-status/{transactionId}": {
        get: {
          tags: ["QRPH"],
          summary: "Check QRPH cash-in status",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "transactionId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Transaction status (pending, completed, expired)" }
          }
        }
      },
      "/api/nexuspay/cashout": {
        post: {
          tags: ["QRPH"],
          summary: "Initiate QRPH cash-out (withdraw to GCash/Maya)",
          description: "Convert PHPT to PHP and send to e-wallet. PHPT is debited, then PHP is sent via NexusPay.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "accountNumber", "provider"],
                  properties: {
                    amount: { type: "number", minimum: 100, example: 500 },
                    accountNumber: { type: "string", description: "Mobile number (11 digits)", example: "09171234567" },
                    provider: { type: "string", enum: ["gcash", "maya", "grabpay"], example: "gcash" },
                    pin: { type: "string", description: "6-digit PIN" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Cash-out initiated, pending payout" },
            "400": { description: "Insufficient balance or validation error" }
          }
        }
      },
      "/api/casino/balance": {
        get: {
          tags: ["Casino"],
          summary: "Get 747Live casino connection status and balance",
          description: "Returns casino balance for players. Agents get connection status only (no balance endpoint for agents).",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Casino status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      connected: { type: "boolean" },
                      balance: { type: "number", description: "Casino chip balance (players only)" },
                      username: { type: "string" },
                      isAgent: { type: "boolean" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/casino/connect": {
        post: {
          tags: ["Casino"],
          summary: "Connect 747Live casino account",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username"],
                  properties: {
                    username: { type: "string", description: "747Live username" },
                    isAgent: { type: "boolean", default: false }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Proceed to verification" }
          }
        }
      },
      "/api/casino/validate": {
        post: {
          tags: ["Casino"],
          summary: "Validate 747Live username exists under Team Marc network",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username"],
                  properties: {
                    username: { type: "string" },
                    isAgent: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Validation result with agent info" }
          }
        }
      },
      "/api/casino/deposit": {
        post: {
          tags: ["Casino"],
          summary: "Buy casino chips (deposit PHPT → get chips)",
          description: "Transfer PHPT to escrow, credit casino chips. Auto-refunds PHPT if casino credit fails.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number", minimum: 100, example: 500 },
                    pin: { type: "string", description: "6-digit PIN" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Chips purchased successfully" },
            "400": { description: "Insufficient PHPT balance" }
          }
        }
      },
      "/api/casino/withdraw": {
        post: {
          tags: ["Casino"],
          summary: "Sell casino chips (withdraw chips → get PHPT)",
          description: "Withdraw chips from casino, receive PHPT. Auto-redeposits chips if PHPT payout fails.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number", minimum: 100, example: 500 },
                    pin: { type: "string", description: "6-digit PIN" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Chips sold, PHPT credited" },
            "400": { description: "Insufficient casino balance" }
          }
        }
      },
      "/api/casino/disconnect": {
        post: {
          tags: ["Casino"],
          summary: "Disconnect 747Live casino account",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Casino disconnected" }
          }
        }
      },
      "/api/casino/finance": {
        get: {
          tags: ["Casino"],
          summary: "Get casino finance/transaction history from 747Live",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Casino transaction history" }
          }
        }
      },
      "/api/casino/statistics": {
        get: {
          tags: ["Casino"],
          summary: "Get casino statistics (deposits, withdrawals, bets, wins)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Casino statistics summary" }
          }
        }
      },
      "/api/crypto/telegram-invoice": {
        post: {
          tags: ["Crypto"],
          summary: "Create Telegram top-up invoice via PayGram",
          description: "Generate a PayGram invoice payable via Telegram. After payment, PHPT is credited.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number", example: 100 }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Invoice created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      payUrl: { type: "string", description: "Telegram payment URL" },
                      invoiceCode: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/crypto/send-paygram": {
        post: {
          tags: ["Crypto"],
          summary: "Send PHPT to any PayGram user",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["recipientCliId", "amount"],
                  properties: {
                    recipientCliId: { type: "string", description: "Recipient PayGram user ID or username" },
                    amount: { type: "number" },
                    pin: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Transfer successful" }
          }
        }
      },
      "/api/crypto/exchange-rates": {
        get: {
          tags: ["Crypto"],
          summary: "Get PayGram exchange rates",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Current exchange rates for all currencies" }
          }
        }
      },
      "/api/crypto/invoices": {
        get: {
          tags: ["Crypto"],
          summary: "Get user's invoice history",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of invoices" }
          }
        }
      },
      "/api/crypto/withdrawals": {
        get: {
          tags: ["Crypto"],
          summary: "Get user's withdrawal history",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of withdrawals" }
          }
        }
      },
      "/api/security/status": {
        get: {
          tags: ["Security"],
          summary: "Get user's security status (PIN setup, etc.)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Security status" }
          }
        }
      },
      "/api/security/pin/setup": {
        post: {
          tags: ["Security"],
          summary: "Set up 6-digit transaction PIN",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pin"],
                  properties: {
                    pin: { type: "string", pattern: "^[0-9]{6}$", example: "123456" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "PIN set successfully" }
          }
        }
      },
      "/api/security/pin/verify": {
        post: {
          tags: ["Security"],
          summary: "Verify transaction PIN",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pin"],
                  properties: {
                    pin: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "PIN verified" },
            "401": { description: "Invalid PIN" }
          }
        }
      },
      "/api/security/pin/change": {
        post: {
          tags: ["Security"],
          summary: "Change transaction PIN",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["currentPin", "newPin"],
                  properties: {
                    currentPin: { type: "string" },
                    newPin: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "PIN changed successfully" }
          }
        }
      },
      "/api/kyc/status": {
        get: {
          tags: ["KYC"],
          summary: "Get user's KYC verification status",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "KYC status (unverified, pending, verified, rejected)" }
          }
        }
      },
      "/api/kyc/submit": {
        post: {
          tags: ["KYC"],
          summary: "Submit KYC documents for verification",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    idType: { type: "string", enum: ["national_id", "passport", "drivers_license"] },
                    idFront: { type: "string", format: "binary" },
                    idBack: { type: "string", format: "binary" },
                    selfie: { type: "string", format: "binary" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Documents submitted for review" }
          }
        }
      },
      "/api/admin/stats": {
        get: {
          tags: ["Admin"],
          summary: "Get admin dashboard statistics",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Dashboard statistics (users, transactions, pending KYC)" },
            "403": { description: "Admin access required" }
          }
        }
      },
      "/api/admin/users": {
        get: {
          tags: ["Admin"],
          summary: "Get all users with balances",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of all users" },
            "403": { description: "Admin access required" }
          }
        }
      },
      "/api/admin/users/{id}": {
        patch: {
          tags: ["Admin"],
          summary: "Update user (active status, role, etc.)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isActive: { type: "boolean" },
                    role: { type: "string", enum: ["super_admin", "admin", "support", "user"] }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "User updated" }
          }
        }
      },
      "/api/admin/transactions": {
        get: {
          tags: ["Admin"],
          summary: "Get all transactions",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All transactions" }
          }
        }
      },
      "/api/admin/balance/adjust": {
        post: {
          tags: ["Admin"],
          summary: "Adjust user PHPT balance (credit/debit)",
          description: "Credit transfers PHPT from admin escrow to user. Debit/fee subtracts locally.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId", "amount", "adjustmentType", "reason"],
                  properties: {
                    userId: { type: "integer" },
                    amount: { type: "string", description: "Amount as string" },
                    adjustmentType: { type: "string", enum: ["credit", "debit", "correction", "refund", "fee"] },
                    reason: { type: "string", minLength: 10 }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Balance adjusted" }
          }
        }
      },
      "/api/admin/kyc/pending": {
        get: {
          tags: ["Admin"],
          summary: "Get pending KYC applications",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of pending KYC applications" }
          }
        }
      },
      "/api/admin/kyc/{userId}/approve": {
        post: {
          tags: ["Admin"],
          summary: "Approve KYC application",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "userId", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "KYC approved" }
          }
        }
      },
      "/api/admin/kyc/{userId}/reject": {
        post: {
          tags: ["Admin"],
          summary: "Reject KYC application",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "userId", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "KYC rejected" }
          }
        }
      },
      "/api/admin/qrph/pending": {
        get: {
          tags: ["Admin"],
          summary: "Get pending QRPH transactions awaiting processing",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Pending QRPH transactions" }
          }
        }
      },
      "/api/admin/qrph/process/{id}": {
        post: {
          tags: ["Admin"],
          summary: "Process pending QRPH transaction (credit PHPT via PayGram)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "QRPH processed, PHPT credited" }
          }
        }
      },
      "/api/admin/qrph/direct-credit/{id}": {
        post: {
          tags: ["Admin"],
          summary: "Direct credit QRPH (bypass PayGram if API issues)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Direct credit applied" }
          }
        }
      },
      "/api/admin/crypto/balances": {
        get: {
          tags: ["Admin"],
          summary: "Get admin escrow (admin@payverse.ph) PayGram balance",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Escrow wallet balances" }
          }
        }
      },
      "/api/admin/audit-logs": {
        get: {
          tags: ["Admin"],
          summary: "Get admin audit logs",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Audit log entries" }
          }
        }
      },
      "/api/manual/payment-methods": {
        get: {
          tags: ["Manual Deposits"],
          summary: "Get available payment methods for manual deposit",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of payment methods (GCash, Maya, bank, etc.)" }
          }
        }
      },
      "/api/manual/deposits": {
        post: {
          tags: ["Manual Deposits"],
          summary: "Submit manual deposit request",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "paymentMethodId", "referenceNumber"],
                  properties: {
                    amount: { type: "number" },
                    paymentMethodId: { type: "integer" },
                    referenceNumber: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Deposit submitted for admin approval" }
          }
        }
      },
      "/api/manual/deposits/my": {
        get: {
          tags: ["Manual Deposits"],
          summary: "Get user's manual deposit history",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "User's deposit history" }
          }
        }
      },
      "/api/tutorials/status": {
        get: {
          tags: ["Auth"],
          summary: "Get user's tutorial completion status",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Completed tutorial IDs" }
          }
        }
      },
      "/api/tutorials/complete/{tutorialId}": {
        post: {
          tags: ["Auth"],
          summary: "Mark tutorial as completed",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "tutorialId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Tutorial marked complete" }
          }
        }
      },
      "/api/otp/request": {
        post: {
          tags: ["Security"],
          summary: "Request OTP for verification",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "purpose"],
                  properties: {
                    email: { type: "string", format: "email" },
                    purpose: { type: "string", enum: ["password_reset", "pin_change", "verification"] }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "OTP sent to email" }
          }
        }
      },
      "/api/otp/verify": {
        post: {
          tags: ["Security"],
          summary: "Verify OTP code",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "otp"],
                  properties: {
                    email: { type: "string" },
                    otp: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "OTP verified" },
            "400": { description: "Invalid or expired OTP" }
          }
        }
      },
      "/api/casino/send-otp": {
        post: {
          tags: ["Casino"],
          summary: "Send OTP to 747Live registered email for verification",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username"],
                  properties: {
                    username: { type: "string" },
                    isAgent: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "OTP sent to registered email" }
          }
        }
      },
      "/api/casino/verify-otp": {
        post: {
          tags: ["Casino"],
          summary: "Verify casino OTP to complete account linking",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "otp"],
                  properties: {
                    username: { type: "string" },
                    otp: { type: "string" },
                    isAgent: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Casino account linked successfully" }
          }
        }
      },
      "/api/casino/verify-balance": {
        post: {
          tags: ["Casino"],
          summary: "Verify casino account by balance check (alternative to OTP)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "balance"],
                  properties: {
                    username: { type: "string" },
                    balance: { type: "number" },
                    isAgent: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Casino account verified" }
          }
        }
      },
      "/api/casino/transaction-status": {
        get: {
          tags: ["Casino"],
          summary: "Get status of pending casino buy/sell transaction",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Transaction status (pending, completed, failed, etc.)" }
          }
        }
      },
      "/api/casino/admin/manual-required": {
        get: {
          tags: ["Casino"],
          summary: "Get casino transactions requiring manual resolution",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Transactions needing admin intervention" }
          }
        }
      },
      "/api/casino/admin/pending": {
        get: {
          tags: ["Casino"],
          summary: "Get pending casino transactions",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Pending casino transactions" }
          }
        }
      },
      "/api/casino/admin/resolve/{id}": {
        post: {
          tags: ["Casino"],
          summary: "Manually resolve a stuck casino transaction",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    action: { type: "string", enum: ["complete", "fail", "refund"] },
                    note: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Transaction resolved" }
          }
        }
      },
      "/api/security/pin/change/request-otp": {
        post: {
          tags: ["Security"],
          summary: "Request OTP for PIN change verification",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "OTP sent to registered email" }
          }
        }
      },
      "/api/security/password/reset/request": {
        post: {
          tags: ["Security"],
          summary: "Request password reset link",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string", format: "email" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Reset link sent if email exists" }
          }
        }
      },
      "/api/security/password/reset/confirm": {
        post: {
          tags: ["Security"],
          summary: "Confirm password reset with token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token", "newPassword"],
                  properties: {
                    token: { type: "string" },
                    newPassword: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Password reset successful" }
          }
        }
      },
      "/api/manual/upload-proof": {
        post: {
          tags: ["Manual Deposits"],
          summary: "Upload payment proof image for manual deposit",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    depositId: { type: "integer" },
                    proof: { type: "string", format: "binary" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Proof uploaded successfully" }
          }
        }
      },
      "/api/manual/admin/payment-methods": {
        get: {
          tags: ["Admin"],
          summary: "Get all payment methods (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All payment methods" }
          }
        },
        post: {
          tags: ["Admin"],
          summary: "Create new payment method",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "type", "accountNumber"],
                  properties: {
                    name: { type: "string" },
                    type: { type: "string", enum: ["gcash", "maya", "bank", "other"] },
                    accountNumber: { type: "string" },
                    accountName: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Payment method created" }
          }
        }
      },
      "/api/manual/admin/payment-methods/{id}": {
        patch: {
          tags: ["Admin"],
          summary: "Update payment method",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Payment method updated" }
          }
        },
        delete: {
          tags: ["Admin"],
          summary: "Delete payment method",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Payment method deleted" }
          }
        }
      },
      "/api/manual/admin/deposits/pending": {
        get: {
          tags: ["Admin"],
          summary: "Get pending manual deposits awaiting approval",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Pending deposits" }
          }
        }
      },
      "/api/manual/admin/deposits/{id}/approve": {
        post: {
          tags: ["Admin"],
          summary: "Approve manual deposit and credit user",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Deposit approved and PHPT credited" }
          }
        }
      },
      "/api/manual/admin/deposits/{id}/reject": {
        post: {
          tags: ["Admin"],
          summary: "Reject manual deposit",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Deposit rejected" }
          }
        }
      },
      "/api/admin/qrph/process-all": {
        post: {
          tags: ["Admin"],
          summary: "Process all pending QRPH transactions at once",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All pending QRPH processed" }
          }
        }
      },
      "/api/crypto/balances": {
        get: {
          tags: ["Crypto"],
          summary: "Get all crypto wallet balances from PayGram",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All cryptocurrency balances" }
          }
        }
      },
      "/api/crypto/invoice": {
        post: {
          tags: ["Crypto"],
          summary: "Create PayGram invoice for deposit",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number" },
                    currency: { type: "integer", default: 11 }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Invoice created with payment URL" }
          }
        }
      },
      "/api/crypto/withdraw": {
        post: {
          tags: ["Crypto"],
          summary: "Withdraw PHPT to external wallet",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "method"],
                  properties: {
                    amount: { type: "number" },
                    method: { type: "string" },
                    pin: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Withdrawal initiated" }
          }
        }
      },
      "/api/crypto/cashout": {
        post: {
          tags: ["Crypto"],
          summary: "Cash out PHPT via PayGram",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "method"],
                  properties: {
                    amount: { type: "number" },
                    method: { type: "string" },
                    accountNumber: { type: "string" },
                    pin: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Cashout initiated" }
          }
        }
      },
      "/api/crypto/statement": {
        get: {
          tags: ["Crypto"],
          summary: "Get PayGram transaction statement",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Transaction statement from PayGram" }
          }
        }
      },
      "/api/manual/admin/deposits": {
        get: {
          tags: ["Admin"],
          summary: "Get all manual deposits",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All manual deposits" }
          }
        }
      },
      "/api/manual/admin/deposits/credit-pending": {
        get: {
          tags: ["Admin"],
          summary: "Get deposits awaiting credit (approved but not yet credited)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Credit-pending deposits" }
          }
        }
      },
      "/api/manual/admin/deposits/{id}/retry": {
        post: {
          tags: ["Admin"],
          summary: "Retry crediting a failed deposit",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Credit retry initiated" }
          }
        }
      },
      "/api/tutorials/reset": {
        post: {
          tags: ["Auth"],
          summary: "Reset all tutorial completion status",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Tutorials reset" }
          }
        }
      },
      "/api/crypto/invoice/{invoiceCode}": {
        get: {
          tags: ["Crypto"],
          summary: "Get invoice details by code",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "invoiceCode", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Invoice details" }
          }
        }
      },
      "/api/crypto/invoices/{invoiceId}/check-status": {
        post: {
          tags: ["Crypto"],
          summary: "Check and update invoice payment status",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "invoiceId", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Updated invoice status" }
          }
        }
      },
      "/api/crypto/invoices/{invoiceId}/confirm": {
        post: {
          tags: ["Crypto"],
          summary: "Confirm paid invoice and credit user",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "invoiceId", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Invoice confirmed and PHPT credited" }
          }
        }
      },
      "/api/crypto/cancel-withdrawal": {
        post: {
          tags: ["Crypto"],
          summary: "Cancel pending withdrawal",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["withdrawalId"],
                  properties: {
                    withdrawalId: { type: "integer" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Withdrawal cancelled" }
          }
        }
      },
      "/api/crypto/circulating": {
        get: {
          tags: ["Crypto"],
          summary: "Get circulating PHPT supply info",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Circulating supply data" }
          }
        }
      },
      "/api/crypto/swap": {
        post: {
          tags: ["Crypto"],
          summary: "Swap between cryptocurrencies",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["fromCurrency", "toCurrency", "amount"],
                  properties: {
                    fromCurrency: { type: "integer" },
                    toCurrency: { type: "integer" },
                    amount: { type: "number" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Swap completed" }
          }
        }
      },
      "/api/crypto/transfer": {
        post: {
          tags: ["Crypto"],
          summary: "Transfer crypto to another PayGram user",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["recipientCliId", "amount", "currencyCode"],
                  properties: {
                    recipientCliId: { type: "string" },
                    amount: { type: "number" },
                    currencyCode: { type: "integer" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Transfer completed" }
          }
        }
      },
      "/api/crypto/red-envelope/create": {
        post: {
          tags: ["Crypto"],
          summary: "Create a red envelope (gift)",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount", "count"],
                  properties: {
                    amount: { type: "number" },
                    count: { type: "integer" },
                    message: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Red envelope created" }
          }
        }
      },
      "/api/crypto/red-envelope/redeem": {
        post: {
          tags: ["Crypto"],
          summary: "Redeem a red envelope",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code"],
                  properties: {
                    code: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Red envelope redeemed" }
          }
        }
      },
      "/api/nexuspay/payout-status/{id}": {
        get: {
          tags: ["QRPH"],
          summary: "Get cash-out payout status",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Payout status" }
          }
        }
      },
      "/api/admin/users/search": {
        get: {
          tags: ["Admin"],
          summary: "Search users by name/email/username",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Matching users" }
          }
        }
      },
      "/api/admin/transactions/search": {
        get: {
          tags: ["Admin"],
          summary: "Search/filter transactions",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Filtered transactions" }
          }
        }
      },
      "/api/admin/users/{id}/sync-balance": {
        post: {
          tags: ["Admin"],
          summary: "Sync user's PayGram balance to local database",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Balance synced from PayGram" }
          }
        }
      },
      "/api/admin/users/sync-all-balances": {
        post: {
          tags: ["Admin"],
          summary: "Sync all users' PayGram balances (batch operation)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Batch sync results" }
          }
        }
      },
      "/api/admin/balance/adjustments": {
        get: {
          tags: ["Admin"],
          summary: "Get balance adjustment history",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Adjustment history" }
          }
        }
      },
      "/api/admin/crypto/exchange-rates": {
        get: {
          tags: ["Admin"],
          summary: "Get PayGram exchange rates (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Exchange rates" }
          }
        }
      },
      "/api/admin/crypto/send": {
        post: {
          tags: ["Admin"],
          summary: "Send PHPT from escrow to PayGram user",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["telegramId", "amount"],
                  properties: {
                    telegramId: { type: "string" },
                    amount: { type: "number" },
                    currency: { type: "integer", default: 11 }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "PHPT sent from escrow" }
          }
        }
      },
      "/api/admin/crypto/invoice": {
        post: {
          tags: ["Admin"],
          summary: "Create admin invoice",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["amount"],
                  properties: {
                    amount: { type: "number" },
                    currency: { type: "integer" },
                    callbackData: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Admin invoice created" }
          }
        }
      },
      "/api/admin/topup-user": {
        post: {
          tags: ["Admin"],
          summary: "Top-up user PHPT from admin escrow",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId", "amount"],
                  properties: {
                    userId: { type: "integer" },
                    amount: { type: "number" },
                    reference: { type: "string" },
                    paymentMethod: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "User topped up" }
          }
        }
      },
      "/api/kyc/admin/pending": {
        get: {
          tags: ["KYC"],
          summary: "Get pending KYC submissions (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Pending KYC list" }
          }
        }
      },
      "/api/kyc/admin/review/{id}": {
        post: {
          tags: ["KYC"],
          summary: "Review and approve/reject KYC submission",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["action"],
                  properties: {
                    action: { type: "string", enum: ["approve", "reject"] },
                    reason: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "KYC reviewed" }
          }
        }
      },
      // Manual Withdrawal Endpoints
      "/api/manual/bank-accounts": {
        get: {
          tags: ["Manual Withdrawals"],
          summary: "Get user's saved bank/e-wallet accounts",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of user's bank accounts" }
          }
        },
        post: {
          tags: ["Manual Withdrawals"],
          summary: "Add a new bank/e-wallet account",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["accountType", "accountNumber", "accountName"],
                  properties: {
                    accountType: { type: "string", enum: ["gcash", "maya", "bank", "grabpay"], example: "gcash" },
                    bankName: { type: "string", description: "Required for bank type", example: "BDO" },
                    accountNumber: { type: "string", example: "09171234567" },
                    accountName: { type: "string", example: "Juan Dela Cruz" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Bank account added" },
            "400": { description: "Validation error" }
          }
        }
      },
      "/api/manual/bank-accounts/{id}": {
        patch: {
          tags: ["Manual Withdrawals"],
          summary: "Update a bank account",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Bank account updated" }
          }
        },
        delete: {
          tags: ["Manual Withdrawals"],
          summary: "Delete a bank account",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Bank account deleted" }
          }
        }
      },
      "/api/manual/bank-accounts/{id}/set-default": {
        post: {
          tags: ["Manual Withdrawals"],
          summary: "Set bank account as default",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "Default account updated" }
          }
        }
      },
      "/api/manual/withdrawals": {
        post: {
          tags: ["Manual Withdrawals"],
          summary: "Submit a withdrawal request",
          description: "Request withdrawal to a saved bank account. PHPT is held in escrow until admin processes. Requires PIN.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userBankAccountId", "amount", "pin"],
                  properties: {
                    userBankAccountId: { type: "integer", description: "ID of saved bank account" },
                    amount: { type: "number", minimum: 1, maximum: 50000, example: 1000 },
                    pin: { type: "string", description: "6-digit PIN" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Withdrawal request submitted" },
            "400": { description: "Insufficient balance or invalid PIN" }
          }
        }
      },
      "/api/manual/withdrawals/my": {
        get: {
          tags: ["Manual Withdrawals"],
          summary: "Get user's withdrawal history",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "List of user's withdrawals" }
          }
        }
      },
      "/api/manual/admin/withdrawals": {
        get: {
          tags: ["Admin"],
          summary: "Get all withdrawal requests (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All withdrawals" }
          }
        }
      },
      "/api/manual/admin/withdrawals/pending": {
        get: {
          tags: ["Admin"],
          summary: "Get pending withdrawal requests (admin)",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Pending withdrawals" }
          }
        }
      },
      "/api/manual/admin/withdrawals/{id}/process": {
        post: {
          tags: ["Admin"],
          summary: "Mark withdrawal as processing",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    adminNote: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Withdrawal marked as processing" }
          }
        }
      },
      "/api/manual/admin/withdrawals/{id}/complete": {
        post: {
          tags: ["Admin"],
          summary: "Complete withdrawal (mark as paid)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    adminNote: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Withdrawal completed" }
          }
        }
      },
      "/api/manual/admin/withdrawals/{id}/reject": {
        post: {
          tags: ["Admin"],
          summary: "Reject withdrawal and refund PHPT",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["rejectionReason"],
                  properties: {
                    rejectionReason: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Withdrawal rejected and PHPT refunded" }
          }
        }
      },
      // Admin PIN Management
      "/api/admin/users/{id}/pin-status": {
        get: {
          tags: ["Admin"],
          summary: "Get user's PIN status (admin)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": {
              description: "PIN status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      hasPinSetup: { type: "boolean" },
                      pinFailedAttempts: { type: "integer" },
                      pinLockedUntil: { type: "string", format: "date-time" },
                      isLocked: { type: "boolean" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/admin/users/{id}/unlock-pin": {
        post: {
          tags: ["Admin"],
          summary: "Unlock user's PIN (reset failed attempts)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "PIN unlocked" }
          }
        }
      },
      "/api/admin/users/{id}/reset-pin": {
        post: {
          tags: ["Admin"],
          summary: "Reset user's PIN (user must set up new PIN)",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } }
          ],
          responses: {
            "200": { description: "PIN reset, user must set up new PIN" }
          }
        }
      },
      "/api/admin/users/{id}/email": {
        patch: {
          tags: ["Admin"],
          summary: "Update user's email address",
          description: "Admin-only endpoint to update a user's email address with validation and audit logging",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" }, description: "User ID" }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string", format: "email", description: "New email address" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Email updated successfully", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" }, previousEmail: { type: "string" }, newEmail: { type: "string" } } } } } },
            "400": { description: "Invalid email or email already in use" },
            "404": { description: "User not found" }
          }
        }
      },
      "/api/admin/nexuspay/balance": {
        get: {
          tags: ["Admin"],
          summary: "Get NexusPay merchant wallet balance",
          description: "Read-only endpoint to check the NexusPay merchant wallet balance for QRPH cash-out operations. Does not affect any transactions.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Balance retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      username: { type: "string", description: "NexusPay merchant username" },
                      email: { type: "string", description: "Merchant email" },
                      walletBalance: { type: "number", description: "Available balance in PHP" },
                      walletBalanceFormatted: { type: "string", description: "Formatted balance with peso sign" },
                      totalAmountFailed: { type: "number" },
                      totalAmount: { type: "number" },
                      message: { type: "string" }
                    }
                  }
                }
              }
            },
            "403": { description: "Admin access required" },
            "500": { description: "Failed to fetch balance" }
          }
        }
      },
      "/api/ai/chat": {
        post: {
          tags: ["AI Chat"],
          summary: "Send message to AI assistant",
          description: "Interact with the PayVerse AI assistant. Supports streaming responses via Server-Sent Events. The AI can help with account questions, navigation guidance, transaction help, and general support. Authenticated users get personalized responses.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["messages"],
                  properties: {
                    messages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          role: { type: "string", enum: ["user", "assistant"], description: "Message role" },
                          content: { type: "string", description: "Message content" }
                        }
                      },
                      description: "Conversation history"
                    },
                    conversationId: { type: "string", description: "Optional conversation ID for continuity" }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "AI response stream (SSE)",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string",
                    description: "Server-Sent Events stream with AI response chunks"
                  }
                }
              }
            },
            "429": { description: "Rate limit exceeded" },
            "500": { description: "AI service error" }
          }
        }
      },
      "/api/ai/faqs": {
        get: {
          tags: ["AI FAQs"],
          summary: "Get all FAQs",
          description: "Retrieve all approved FAQs. Results are filtered based on user role - guests see general FAQs, authenticated users see role-specific content. Admin-sensitive FAQs are hidden from regular users.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "FAQ list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      faqs: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            question: { type: "string" },
                            answer: { type: "string" },
                            category: { type: "string" },
                            hitCount: { type: "integer" },
                            priority: { type: "integer" }
                          }
                        }
                      },
                      categories: {
                        type: "array",
                        items: { type: "string" }
                      },
                      userRole: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/ai/faqs/search": {
        get: {
          tags: ["AI FAQs"],
          summary: "Search FAQs",
          description: "Search FAQs by keyword. Uses semantic matching to find relevant questions and answers.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Search query"
            }
          ],
          responses: {
            "200": {
              description: "Search results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      faqs: { type: "array", items: { type: "object" } },
                      query: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/ai/faqs/popular": {
        get: {
          tags: ["AI FAQs"],
          summary: "Get popular FAQs",
          description: "Retrieve most frequently accessed FAQs, sorted by hit count. Useful for landing pages and quick help sections.",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 5 },
              description: "Number of FAQs to return"
            }
          ],
          responses: {
            "200": {
              description: "Popular FAQs",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      faqs: { type: "array", items: { type: "object" } }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/ai/faqs/{id}/hit": {
        post: {
          tags: ["AI FAQs"],
          summary: "Track FAQ view",
          description: "Increment the hit counter for a FAQ. Called when a user expands/views a FAQ answer.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
              description: "FAQ ID"
            }
          ],
          responses: {
            "200": { description: "Hit recorded" },
            "404": { description: "FAQ not found" }
          }
        }
      },
      "/api/ai/feedback": {
        post: {
          tags: ["AI Chat"],
          summary: "Submit feedback on AI response",
          description: "Rate an AI response and optionally provide text feedback. Used to improve AI responses and generate FAQs from positive interactions.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["messageId", "conversationId", "rating"],
                  properties: {
                    messageId: { type: "string", description: "The AI message ID" },
                    conversationId: { type: "string", description: "Conversation ID" },
                    rating: { type: "integer", minimum: 1, maximum: 5, description: "Rating from 1-5" },
                    feedback: { type: "string", description: "Optional text feedback" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Feedback recorded" },
            "400": { description: "Invalid request" }
          }
        }
      },
      "/api/ai/admin/faqs": {
        get: {
          tags: ["AI FAQs"],
          summary: "Admin: Get all FAQs including pending",
          description: "Admin endpoint to retrieve all FAQs including those pending approval or rejected.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "All FAQs with status" },
            "403": { description: "Admin access required" }
          }
        }
      },
      "/api/ai/admin/faqs/{id}": {
        patch: {
          tags: ["AI FAQs"],
          summary: "Admin: Update FAQ",
          description: "Update a FAQ's question, answer, category, status, or priority.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" }
            }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" },
                    category: { type: "string" },
                    status: { type: "string", enum: ["pending", "approved", "rejected"] },
                    priority: { type: "integer" }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "FAQ updated" },
            "403": { description: "Admin access required" },
            "404": { description: "FAQ not found" }
          }
        },
        delete: {
          tags: ["AI FAQs"],
          summary: "Admin: Delete FAQ",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" }
            }
          ],
          responses: {
            "200": { description: "FAQ deleted" },
            "403": { description: "Admin access required" }
          }
        }
      },
      "/api/ai/admin/suggestions": {
        get: {
          tags: ["AI FAQs"],
          summary: "Admin: Get training suggestions",
          description: "Get AI-generated suggestions for new FAQs based on user interactions and feedback.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Training suggestions",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      suggestions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            suggestedQuestion: { type: "string" },
                            suggestedAnswer: { type: "string" },
                            suggestedCategory: { type: "string" },
                            confidence: { type: "number" },
                            sourceInteractionCount: { type: "integer" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "403": { description: "Admin access required" }
          }
        }
      },
      "/api/ai/admin/suggestions/{id}/approve": {
        post: {
          tags: ["AI FAQs"],
          summary: "Admin: Approve training suggestion",
          description: "Convert a training suggestion into an approved FAQ.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" }
            }
          ],
          responses: {
            "200": { description: "Suggestion approved and converted to FAQ" },
            "403": { description: "Admin access required" }
          }
        }
      }
    }
  },
  apis: []
};

const swaggerSpec = swaggerJsdoc(options);

// Professional GitBook/MkDocs-style documentation page
const docsHtml = `
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PayVerse Documentation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #5C6AC4;
      --primary-dark: #4959BD;
      --bg-primary: #ffffff;
      --bg-secondary: #f6f8fa;
      --bg-sidebar: #f6f8fa;
      --text-primary: #24292f;
      --text-secondary: #57606a;
      --text-muted: #8b949e;
      --border: #d0d7de;
      --border-light: #e8e8e8;
      --code-bg: #f6f8fa;
      --success: #1a7f37;
      --warning: #9a6700;
      --error: #cf222e;
      --info: #0969da;
    }
    [data-theme="dark"] {
      --primary: #7C8AE4;
      --primary-dark: #9BA6F5;
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-sidebar: #010409;
      --text-primary: #c9d1d9;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --border: #30363d;
      --border-light: #21262d;
      --code-bg: #161b22;
      --success: #3fb950;
      --warning: #d29922;
      --error: #f85149;
      --info: #58a6ff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg-primary); color: var(--text-primary); line-height: 1.6; font-size: 15px; }

    /* Layout */
    .layout { display: flex; min-height: 100vh; }

    /* Sidebar */
    .sidebar { width: 280px; background: var(--bg-sidebar); border-right: 1px solid var(--border); position: fixed; height: 100vh; overflow-y: auto; z-index: 100; transition: transform 0.3s; }
    .sidebar-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
    .sidebar-logo { width: 32px; height: 32px; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 14px; }
    .sidebar-title { font-weight: 600; font-size: 16px; }
    .sidebar-nav { padding: 16px 0; }
    .nav-section { padding: 8px 24px; }
    .nav-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 8px; }
    .nav-link { display: flex; align-items: center; gap: 10px; padding: 8px 24px; color: var(--text-secondary); text-decoration: none; font-size: 14px; transition: all 0.15s; border-left: 3px solid transparent; }
    .nav-link:hover { color: var(--text-primary); background: var(--bg-secondary); }
    .nav-link.active { color: var(--primary); background: rgba(92, 106, 196, 0.08); border-left-color: var(--primary); font-weight: 500; }
    .nav-icon { width: 18px; height: 18px; opacity: 0.7; }

    /* Main Content */
    .main { flex: 1; margin-left: 280px; }
    .header { position: sticky; top: 0; background: var(--bg-primary); border-bottom: 1px solid var(--border); padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 50; backdrop-filter: blur(8px); }
    .search-box { display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 8px 16px; width: 320px; }
    .search-box input { border: none; background: transparent; outline: none; color: var(--text-primary); width: 100%; font-size: 14px; }
    .search-box input::placeholder { color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .theme-toggle { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 14px; color: var(--text-secondary); transition: all 0.15s; }
    .theme-toggle:hover { background: var(--border-light); }
    .btn-primary { background: var(--primary); color: white; border: none; border-radius: 8px; padding: 8px 16px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: background 0.15s; }
    .btn-primary:hover { background: var(--primary-dark); }

    /* Content Area */
    .content { max-width: 900px; margin: 0 auto; padding: 48px 32px; }
    .content h1 { font-size: 2.25rem; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.02em; }
    .content h2 { font-size: 1.5rem; font-weight: 600; margin: 48px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .content h3 { font-size: 1.125rem; font-weight: 600; margin: 32px 0 12px; }
    .content p { margin: 16px 0; color: var(--text-secondary); }
    .content ul, .content ol { margin: 16px 0 16px 24px; color: var(--text-secondary); }
    .content li { margin: 8px 0; }
    .lead { font-size: 1.125rem; color: var(--text-secondary); margin-bottom: 32px; }

    /* Code */
    code { font-family: 'JetBrains Mono', monospace; font-size: 13px; background: var(--code-bg); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-light); }
    pre { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; overflow-x: auto; margin: 16px 0; }
    pre code { background: transparent; border: none; padding: 0; font-size: 13px; line-height: 1.7; }

    /* Cards */
    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 24px; transition: all 0.2s; }
    .card:hover { border-color: var(--primary); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .card-icon { width: 40px; height: 40px; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 16px; }
    .card h4 { font-size: 1rem; font-weight: 600; margin-bottom: 8px; }
    .card p { font-size: 14px; color: var(--text-muted); margin: 0; }

    /* Badges */
    .badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; margin: 4px 4px 4px 0; }
    .badge-success { background: rgba(26, 127, 55, 0.1); color: var(--success); }
    .badge-warning { background: rgba(154, 103, 0, 0.1); color: var(--warning); }
    .badge-info { background: rgba(9, 105, 218, 0.1); color: var(--info); }
    .badge-error { background: rgba(207, 34, 46, 0.1); color: var(--error); }

    /* Tables */
    table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
    th { background: var(--bg-secondary); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); }
    tr:hover td { background: var(--bg-secondary); }

    /* Callouts */
    .callout { padding: 16px 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid; }
    .callout-info { background: rgba(9, 105, 218, 0.05); border-color: var(--info); }
    .callout-warning { background: rgba(154, 103, 0, 0.05); border-color: var(--warning); }
    .callout-success { background: rgba(26, 127, 55, 0.05); border-color: var(--success); }
    .callout-title { font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    .callout p { margin: 0; font-size: 14px; }

    /* Steps */
    .steps { counter-reset: step; margin: 24px 0; }
    .step { display: flex; gap: 16px; margin: 20px 0; padding-left: 8px; }
    .step::before { counter-increment: step; content: counter(step); min-width: 28px; height: 28px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0; }
    .step-content h4 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .step-content p { margin: 0; font-size: 14px; color: var(--text-muted); }

    /* Footer */
    .footer { border-top: 1px solid var(--border); padding: 32px; margin-top: 64px; text-align: center; color: var(--text-muted); font-size: 14px; }
    .footer a { color: var(--primary); text-decoration: none; }

    /* Mobile */
    .menu-toggle { display: none; background: none; border: none; padding: 8px; cursor: pointer; }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.open { transform: translateX(0); }
      .main { margin-left: 0; }
      .menu-toggle { display: block; }
      .search-box { width: 200px; }
      .content { padding: 24px 16px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">P</div>
        <span class="sidebar-title">PayVerse Docs</span>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <div class="nav-section-title">Getting Started</div>
          <a href="#introduction" class="nav-link active">Introduction</a>
          <a href="#quickstart" class="nav-link">Quick Start</a>
          <a href="#authentication" class="nav-link">Authentication</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Features</div>
          <a href="#transfers" class="nav-link">P2P Transfers</a>
          <a href="#qrph" class="nav-link">QRPH Cash In/Out</a>
          <a href="#casino" class="nav-link">747 Casino</a>
          <a href="#withdrawals" class="nav-link">Manual Withdrawals</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Security</div>
          <a href="#pin" class="nav-link">PIN Protection</a>
          <a href="#kyc" class="nav-link">KYC Verification</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">AI Features</div>
          <a href="#ai-assistant" class="nav-link">AI Assistant</a>
          <a href="#ai-faqs" class="nav-link">FAQ System</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">API Reference</div>
          <a href="/api/swagger" class="nav-link">Swagger UI</a>
          <a href="#endpoints" class="nav-link">Key Endpoints</a>
        </div>
      </nav>
    </aside>

    <main class="main">
      <header class="header">
        <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
        <div class="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" placeholder="Search documentation..." disabled>
        </div>
        <div class="header-actions">
          <button class="theme-toggle" onclick="toggleTheme()">🌙 Dark</button>
          <a href="/api/swagger" class="btn-primary">API Docs</a>
        </div>
      </header>

      <article class="content">
        <section id="introduction">
          <h1>PayVerse Documentation</h1>
          <p class="lead">Complete guide to using the PayVerse E-Wallet Platform - a production-ready P2P payment system with PHPT cryptocurrency integration.</p>

          <div class="card-grid">
            <div class="card">
              <div class="card-icon">💸</div>
              <h4>P2P Transfers</h4>
              <p>Send PHPT instantly to any PayVerse user with PIN protection.</p>
            </div>
            <div class="card">
              <div class="card-icon">📱</div>
              <h4>QRPH Integration</h4>
              <p>Cash in via InstaPay/PESONet, cash out to GCash, Maya, GrabPay.</p>
            </div>
            <div class="card">
              <div class="card-icon">🎰</div>
              <h4>747 Casino</h4>
              <p>Buy and sell casino chips for players and agents.</p>
            </div>
            <div class="card">
              <div class="card-icon">🔐</div>
              <h4>Secure by Design</h4>
              <p>PIN verification, email OTP, and KYC for large transfers.</p>
            </div>
          </div>
        </section>

        <section id="quickstart">
          <h2>Quick Start</h2>
          <p>Get started with PayVerse in four simple steps:</p>

          <div class="steps">
            <div class="step">
              <div class="step-content">
                <h4>Create an Account</h4>
                <p>Register with your email, full name, and username. Set up a 6-digit PIN during registration.</p>
              </div>
            </div>
            <div class="step">
              <div class="step-content">
                <h4>Verify Your Email</h4>
                <p>Check your inbox for a welcome email from PayVerse to confirm your account.</p>
              </div>
            </div>
            <div class="step">
              <div class="step-content">
                <h4>Add Funds</h4>
                <p>Top up via QRPH (InstaPay/PESONet), Telegram PayGram, or manual deposit.</p>
              </div>
            </div>
            <div class="step">
              <div class="step-content">
                <h4>Start Transacting</h4>
                <p>Send PHPT to other users, cash out to e-wallets, or use 747 Casino.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="authentication">
          <h2>Authentication</h2>
          <p>All API requests (except login/register) require a Bearer token in the Authorization header.</p>

          <pre><code>Authorization: Bearer your_token_here</code></pre>

          <div class="callout callout-info">
            <div class="callout-title">ℹ️ Getting Your Token</div>
            <p>Call <code>POST /api/auth/login</code> with your email and password to receive a bearer token.</p>
          </div>

          <h3>Login Example</h3>
          <pre><code>POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}</code></pre>
        </section>

        <section id="transfers">
          <h2>P2P Transfers</h2>
          <p>Send PHPT instantly to any PayVerse user. All transfers require PIN verification.</p>

          <div class="callout callout-warning">
            <div class="callout-title">⚠️ PIN Required</div>
            <p>All financial transactions require your 6-digit PIN for security.</p>
          </div>

          <h3>Send PHPT</h3>
          <pre><code>POST /api/transfer
Authorization: Bearer your_token
Content-Type: application/json

{
  "receiverId": 123,
  "amount": "100.00",
  "note": "Payment for lunch",
  "pin": "123456"
}</code></pre>

          <p><span class="badge badge-success">Instant</span> <span class="badge badge-info">PIN Protected</span></p>
        </section>

        <section id="qrph">
          <h2>QRPH Cash In/Out</h2>
          <p>Deposit PHP via QR code and withdraw to GCash, Maya, or GrabPay.</p>

          <h3>Cash In (Deposit)</h3>
          <pre><code>POST /api/nexuspay/cashin
{
  "amount": 500
}</code></pre>
          <p>Returns a QR code for payment via InstaPay/PESONet. PHPT is credited 1:1 after payment.</p>

          <h3>Cash Out (Withdraw)</h3>
          <pre><code>POST /api/nexuspay/cashout
{
  "amount": 500,
  "accountNumber": "09171234567",
  "provider": "gcash",
  "pin": "123456"
}</code></pre>
          <p><span class="badge badge-success">1:1 Rate</span> <span class="badge badge-warning">Min ₱100</span></p>
        </section>

        <section id="casino">
          <h2>747 Live Casino</h2>
          <p>Buy and sell casino chips instantly. Works for both players and agents.</p>

          <h3>Buy Chips (Deposit)</h3>
          <pre><code>POST /api/casino/deposit
{
  "amount": 500,
  "pin": "123456"
}</code></pre>

          <h3>Sell Chips (Withdraw)</h3>
          <pre><code>POST /api/casino/withdraw
{
  "amount": 500,
  "pin": "123456"
}</code></pre>

          <p><span class="badge badge-info">PIN Required</span> <span class="badge badge-success">Instant</span></p>
        </section>

        <section id="withdrawals">
          <h2>Manual Withdrawals</h2>
          <p>Withdraw PHPT to your saved bank accounts or e-wallets.</p>

          <h3>Add Bank Account</h3>
          <pre><code>POST /api/manual/bank-accounts
{
  "accountType": "gcash",
  "accountNumber": "09171234567",
  "accountName": "Juan Dela Cruz"
}</code></pre>

          <h3>Request Withdrawal</h3>
          <pre><code>POST /api/manual/withdrawals
{
  "userBankAccountId": 1,
  "amount": 1000,
  "pin": "123456"
}</code></pre>

          <p>Withdrawals are processed by admin within 1-24 hours.</p>
          <p><span class="badge badge-warning">1-24 hrs</span> <span class="badge badge-info">PIN Required</span></p>
        </section>

        <section id="ai-assistant">
          <h2>AI Assistant</h2>
          <p>PayVerse includes an intelligent AI assistant that can help you with:</p>

          <div class="card-grid">
            <div class="card">
              <div class="card-icon">💬</div>
              <h4>Real-time Support</h4>
              <p>Get instant answers to your questions about transactions, features, and account management.</p>
            </div>
            <div class="card">
              <div class="card-icon">🧭</div>
              <h4>Navigation Help</h4>
              <p>The AI knows the exact app layout and can guide you step-by-step through any feature.</p>
            </div>
            <div class="card">
              <div class="card-icon">🔒</div>
              <h4>Secure Design</h4>
              <p>The AI is protected against prompt injection and never exposes sensitive data.</p>
            </div>
            <div class="card">
              <div class="card-icon">📚</div>
              <h4>Learning System</h4>
              <p>Improves over time by learning from real user interactions and feedback.</p>
            </div>
          </div>

          <h3>Using the AI Chat</h3>
          <pre><code>POST /api/ai/chat
Content-Type: application/json
Authorization: Bearer your_token (optional)

{
  "messages": [
    { "role": "user", "content": "How do I cash out to GCash?" }
  ],
  "conversationId": "optional-conversation-id"
}</code></pre>

          <div class="callout callout-info">
            <div class="callout-title">ℹ️ Streaming Response</div>
            <p>The AI chat uses Server-Sent Events (SSE) for real-time streaming responses.</p>
          </div>

          <h3>Rate Limits</h3>
          <table>
            <thead>
              <tr><th>User Type</th><th>Requests/Hour</th></tr>
            </thead>
            <tbody>
              <tr><td>Guest</td><td>25</td></tr>
              <tr><td>Authenticated User</td><td>50</td></tr>
              <tr><td>Admin</td><td>200</td></tr>
              <tr><td>Super Admin</td><td>500</td></tr>
            </tbody>
          </table>
        </section>

        <section id="ai-faqs">
          <h2>AI-Powered FAQs</h2>
          <p>The FAQ system automatically learns from user interactions and feedback to provide accurate, up-to-date answers.</p>

          <h3>How It Works</h3>
          <ol>
            <li><strong>User Interaction:</strong> Users chat with the AI assistant</li>
            <li><strong>Feedback Collection:</strong> Users can rate AI responses (1-5 stars)</li>
            <li><strong>Pattern Learning:</strong> System identifies common questions and successful answers</li>
            <li><strong>Admin Approval:</strong> Admins review and approve FAQs before they go public</li>
            <li><strong>Role-based Display:</strong> FAQs are filtered based on user role to prevent data leakage</li>
          </ol>

          <h3>Fetch FAQs</h3>
          <pre><code>GET /api/ai/faqs
Authorization: Bearer your_token (optional)

Response:
{
  "faqs": [
    {
      "id": 1,
      "question": "How do I cash out to GCash?",
      "answer": "Navigate to Dashboard > Cash Out > Select GCash...",
      "category": "withdrawal",
      "hitCount": 42,
      "priority": 1
    }
  ],
  "categories": ["withdrawal", "topup", "account"],
  "userRole": "user"
}</code></pre>

          <h3>Submit Feedback</h3>
          <pre><code>POST /api/ai/feedback
Authorization: Bearer your_token

{
  "messageId": "msg_abc123",
  "conversationId": "conv_xyz789",
  "rating": 5,
  "feedback": "Very helpful explanation!"
}</code></pre>

          <p><span class="badge badge-success">Auto-Learning</span> <span class="badge badge-info">Role-Filtered</span></p>
        </section>

        <section id="pin">
          <h2>PIN Protection</h2>
          <p>Your 6-digit PIN is required for all financial transactions:</p>
          <ul>
            <li>P2P Transfers</li>
            <li>QRPH Cash-out</li>
            <li>Casino Buy/Sell Chips</li>
            <li>Telegram Cashout</li>
            <li>Manual Withdrawals</li>
          </ul>

          <div class="callout callout-warning">
            <div class="callout-title">⚠️ PIN Lockout</div>
            <p>After 5 failed PIN attempts, your account is locked for 30 minutes.</p>
          </div>
        </section>

        <section id="kyc">
          <h2>KYC Verification</h2>
          <p>KYC verification is required for transfers of ₱5,000 or more.</p>

          <table>
            <thead>
              <tr><th>Status</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td><span class="badge badge-warning">Unverified</span></td><td>KYC not submitted</td></tr>
              <tr><td><span class="badge badge-info">Pending</span></td><td>Under admin review</td></tr>
              <tr><td><span class="badge badge-success">Verified</span></td><td>Full access granted</td></tr>
              <tr><td><span class="badge badge-error">Rejected</span></td><td>Resubmission required</td></tr>
            </tbody>
          </table>
        </section>

        <section id="endpoints">
          <h2>Key API Endpoints</h2>
          <table>
            <thead>
              <tr><th>Endpoint</th><th>Method</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td><code>/api/auth/login</code></td><td>POST</td><td>Login and get bearer token</td></tr>
              <tr><td><code>/api/auth/register</code></td><td>POST</td><td>Create new account</td></tr>
              <tr><td><code>/api/wallet/balance</code></td><td>GET</td><td>Get PHPT balance</td></tr>
              <tr><td><code>/api/transfer</code></td><td>POST</td><td>Send PHPT to user</td></tr>
              <tr><td><code>/api/nexuspay/cashin</code></td><td>POST</td><td>Generate QRPH deposit QR</td></tr>
              <tr><td><code>/api/nexuspay/cashout</code></td><td>POST</td><td>Withdraw to e-wallet</td></tr>
              <tr><td><code>/api/casino/deposit</code></td><td>POST</td><td>Buy casino chips</td></tr>
              <tr><td><code>/api/casino/withdraw</code></td><td>POST</td><td>Sell casino chips</td></tr>
              <tr><td><code>/api/ai/chat</code></td><td>POST</td><td>AI assistant chat (SSE stream)</td></tr>
              <tr><td><code>/api/ai/faqs</code></td><td>GET</td><td>Get all FAQs</td></tr>
              <tr><td><code>/api/ai/faqs/search</code></td><td>GET</td><td>Search FAQs by keyword</td></tr>
              <tr><td><code>/api/ai/faqs/popular</code></td><td>GET</td><td>Get popular FAQs</td></tr>
              <tr><td><code>/api/ai/feedback</code></td><td>POST</td><td>Rate AI response</td></tr>
            </tbody>
          </table>
          <p style="margin-top: 24px;"><a href="/api/swagger" class="btn-primary">View Full API Documentation →</a></p>
        </section>

        <footer class="footer">
          <p>PayVerse Documentation • <a href="mailto:support@payverse.ph">support@payverse.ph</a></p>
          <p style="margin-top: 8px;">Version 1.0 • Last updated January 2026</p>
        </footer>
      </article>
    </main>
  </div>

  <script>
    function toggleTheme() {
      const html = document.documentElement;
      const btn = document.querySelector('.theme-toggle');
      if (html.getAttribute('data-theme') === 'dark') {
        html.setAttribute('data-theme', 'light');
        btn.textContent = '🌙 Dark';
      } else {
        html.setAttribute('data-theme', 'dark');
        btn.textContent = '☀️ Light';
      }
    }

    // Highlight active nav link on scroll
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach(section => {
        const top = section.offsetTop - 100;
        if (scrollY >= top) current = section.getAttribute('id');
      });
      navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + current) link.classList.add('active');
      });
    });
  </script>
</body>
</html>
`;

export function setupSwagger(app: Express) {
  // Main documentation page at /docs
  app.get("/docs", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(docsHtml);
  });

  // Swagger UI at /api/swagger
  app.use("/api/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "PayVerse API Documentation",
    swaggerOptions: {
      persistAuthorization: true
    }
  }));

  // Legacy route redirect (backward compatibility)
  app.get("/api-docs", (req, res) => {
    res.redirect("/api/swagger");
  });

  // JSON export
  app.get("/api/swagger.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // Legacy JSON route redirect
  app.get("/api-docs.json", (req, res) => {
    res.redirect("/api/swagger.json");
  });

  console.log("[Swagger] API documentation available at /api/swagger");
  console.log("[Docs] User documentation available at /docs");
}
