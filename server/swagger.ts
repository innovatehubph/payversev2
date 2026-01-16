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
      { name: "Casino", description: "747Live casino buy/sell chips integration" },
      { name: "Crypto", description: "PayGram cryptocurrency operations (Telegram top-up, invoices, etc.)" },
      { name: "Security", description: "PIN setup, verification, and password management" },
      { name: "KYC", description: "Know Your Customer verification" },
      { name: "Admin", description: "Admin dashboard and user management" },
      { name: "Manual Deposits", description: "Manual P2P deposit system" }
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
      }
    }
  },
  apis: []
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "PayVerse API Documentation",
    swaggerOptions: {
      persistAuthorization: true
    }
  }));

  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  console.log("[Swagger] API documentation available at /api-docs");
}
