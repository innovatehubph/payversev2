/**
 * System Settings Routes (Super Admin Only)
 *
 * Manages API keys, credentials, and system configuration.
 * Only accessible by users with super_admin role.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { systemSettings, escrowAgents, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { clearTokenCache } from "./casino";
import { clearNexusPayConfigCache } from "./nexuspay";
import fs from "fs";
import path from "path";

/**
 * Update a key in the .env file
 */
function updateEnvFile(key: string, value: string): void {
  try {
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }

    const lines = envContent.split("\n");
    let found = false;

    const updatedLines = lines.map(line => {
      if (line.startsWith(`${key}=`)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!found) {
      updatedLines.push(`${key}=${value}`);
    }

    fs.writeFileSync(envPath, updatedLines.join("\n"));

    // Also update process.env for immediate effect
    process.env[key] = value;

    console.log(`[Settings] Updated .env file: ${key}`);
  } catch (error) {
    console.error(`[Settings] Failed to update .env file:`, error);
  }
}

// Cache for settings to avoid repeated DB queries
let settingsCache: Map<string, { value: string; timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get a system setting value.
 * Reads from database first, falls back to environment variable.
 * Results are cached for 1 minute to reduce DB queries.
 */
export async function getSystemSetting(key: string, defaultValue: string = ""): Promise<string> {
  // Check cache first
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value || process.env[key] || defaultValue;
  }

  try {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);

    if (setting && setting.value && setting.isActive) {
      // Cache the value
      settingsCache.set(key, { value: setting.value, timestamp: Date.now() });
      return setting.value;
    }
  } catch (error) {
    // DB error, fall back to env
    console.warn(`[Settings] Failed to read ${key} from DB, using env`);
  }

  // Fall back to environment variable
  const envValue = process.env[key] || defaultValue;
  settingsCache.set(key, { value: envValue, timestamp: Date.now() });
  return envValue;
}

/**
 * Clear the settings cache (call after updating settings)
 */
export function clearSettingsCache(key?: string): void {
  if (key) {
    settingsCache.delete(key);
  } else {
    settingsCache.clear();
  }
}

// Middleware to check super admin role
function superAdminOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Super admin access required" });
  }
  next();
}

// Default settings that should exist
const DEFAULT_SETTINGS = [
  // PayGram Settings (PHPT Wallet)
  {
    key: "PAYGRAM_API_TOKEN",
    category: "paygram",
    description: "PayGram API Token for PHPT transactions (shared account)",
    value: process.env.PAYGRAM_API_TOKEN || "",
    isEncrypted: true,
  },
  {
    key: "ADMIN_TGIN_TOKEN",
    category: "paygram",
    description: "Super Admin TGIN Token for Telegram wallet operations (escrow topup/cashout)",
    value: process.env.ADMIN_TGIN_TOKEN || "",
    isEncrypted: true,
  },
  // Note: Escrow account is always the super admin's username ("superadmin")
  // No need for separate ADMIN_PAYGRAM_CLI_ID setting

  // Casino 747Live Settings (per-agent tokens)
  {
    key: "CASINO_747_TOKEN_MARCTHEPOGI",
    category: "casino",
    description: "747Live API Token for agent: marcthepogi",
    value: process.env.CASINO_747_TOKEN_MARCTHEPOGI || "",
    isEncrypted: true,
  },
  {
    key: "CASINO_747_TOKEN_TEAMMARC",
    category: "casino",
    description: "747Live API Token for agent: teammarc",
    value: process.env.CASINO_747_TOKEN_TEAMMARC || "",
    isEncrypted: true,
  },
  {
    key: "CASINO_747_TOKEN_BOSSMARC747",
    category: "casino",
    description: "747Live API Token for agent: bossmarc747",
    value: process.env.CASINO_747_TOKEN_BOSSMARC747 || "",
    isEncrypted: true,
  },

  // NexusPay Settings (QRPH - GCash, Maya, etc.)
  {
    key: "NEXUSPAY_BASE_URL",
    category: "nexuspay",
    description: "NexusPay API Base URL",
    value: process.env.NEXUSPAY_BASE_URL || "https://nexuspay.cloud",
  },
  {
    key: "NEXUSPAY_USERNAME",
    category: "nexuspay",
    description: "NexusPay API Username",
    value: process.env.NEXUSPAY_USERNAME || "",
  },
  {
    key: "NEXUSPAY_PASSWORD",
    category: "nexuspay",
    description: "NexusPay API Password",
    value: process.env.NEXUSPAY_PASSWORD || "",
    isEncrypted: true,
  },
  {
    key: "NEXUSPAY_MERCHANT_ID",
    category: "nexuspay",
    description: "NexusPay Merchant ID (16 characters)",
    value: process.env.NEXUSPAY_MERCHANT_ID || "",
  },
  {
    key: "NEXUSPAY_KEY",
    category: "nexuspay",
    description: "NexusPay Encryption Key (16 characters)",
    value: process.env.NEXUSPAY_KEY || "",
    isEncrypted: true,
  },

  // Escrow Settings
  {
    key: "ESCROW_ACCOUNT_ID",
    category: "escrow",
    description: "Super Admin User ID (Escrow Account)",
    value: "1", // Usually the first admin account
  },

  // System Settings
  {
    key: "KYC_AUTO_APPROVAL",
    category: "system",
    description: "Enable automatic KYC approval (true/false)",
    value: "false",
  },
  {
    key: "LARGE_TRANSFER_THRESHOLD",
    category: "system",
    description: "Amount threshold requiring KYC verification (PHPT)",
    value: "5000",
  },
  {
    key: "PIN_REQUIRED",
    category: "system",
    description: "Require PIN for all transactions (true/false)",
    value: "true",
  },

  // Email/SMTP Settings
  {
    key: "SMTP_HOST",
    category: "email",
    description: "SMTP server hostname",
    value: process.env.SMTP_HOST || "",
  },
  {
    key: "SMTP_PORT",
    category: "email",
    description: "SMTP server port",
    value: process.env.SMTP_PORT || "587",
  },
  {
    key: "SMTP_USER",
    category: "email",
    description: "SMTP username/email",
    value: process.env.SMTP_USER || "",
  },
  {
    key: "SMTP_PASS",
    category: "email",
    description: "SMTP password/app password",
    value: process.env.SMTP_PASS || "",
    isEncrypted: true,
  },
  {
    key: "SMTP_FROM",
    category: "email",
    description: "SMTP from email address",
    value: process.env.SMTP_FROM || "noreply@payverse.ph",
  },
  {
    key: "EMAIL_LOGO_URL",
    category: "email",
    description: "Logo URL for email templates (must be publicly accessible)",
    value: process.env.EMAIL_LOGO_URL || "https://payverse.ph/logo.png",
  },

  // SMS/PhilSMS Settings
  {
    key: "PHILSMS_API_TOKEN",
    category: "sms",
    description: "PhilSMS API Bearer Token for SMS gateway",
    value: process.env.PHILSMS_API_TOKEN || "",
    isEncrypted: true,
  },
  {
    key: "SMS_SENDER_ID",
    category: "sms",
    description: "SMS Sender ID (max 11 alphanumeric characters)",
    value: "PayVerse",
  },
  {
    key: "SMS_NOTIFICATIONS_ENABLED",
    category: "sms",
    description: "Enable SMS notifications for transactions (true/false)",
    value: "false",
  },

  // AI Chat Settings
  {
    key: "OPENROUTER_API_KEY",
    category: "ai",
    description: "OpenRouter API Key for AI assistant",
    value: process.env.OPENROUTER_API_KEY || "",
    isEncrypted: true,
  },
  {
    key: "AI_ENABLED",
    category: "ai",
    description: "Enable AI chat assistant (true/false)",
    value: "true",
  },
  {
    key: "AI_DEFAULT_MODEL",
    category: "ai",
    description: "Default AI model preference (auto/fast/reasoning/code)",
    value: "auto",
  },
  {
    key: "AI_MAX_TOKENS",
    category: "ai",
    description: "Maximum tokens for AI responses",
    value: "4096",
  },
  {
    key: "AI_RATE_LIMIT_PER_HOUR",
    category: "ai",
    description: "Default rate limit per hour for AI requests",
    value: "50",
  },
];

// Default escrow agents (casino agents managed by super admin)
const DEFAULT_ESCROW_AGENTS = [
  { agentUsername: "marcthepogi", agentType: "casino" },
  { agentUsername: "teammarc", agentType: "casino" },
  { agentUsername: "bossmarc747", agentType: "casino" },
];

export function registerSettingsRoutes(app: Express, authMiddleware: any) {
  // Initialize default settings on startup
  initializeDefaultSettings().catch(console.error);

  // Get all settings (grouped by category)
  app.get("/api/admin/settings", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const settings = await db.select().from(systemSettings).orderBy(systemSettings.category, systemSettings.key);

      // Group by category
      const grouped = settings.reduce((acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        // Mask sensitive values for display
        acc[setting.category].push({
          ...setting,
          value: setting.isEncrypted ? "••••••••" : setting.value,
          hasValue: !!setting.value,
        });
        return acc;
      }, {} as Record<string, any[]>);

      res.json({ settings: grouped });
    } catch (error) {
      console.error("[Settings] Failed to fetch settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // Update a setting
  app.put("/api/admin/settings/:key", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { key } = req.params;
      const { value, description, isActive } = req.body;

      const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));

      if (!existing) {
        return res.status(404).json({ message: "Setting not found" });
      }

      const updateData: any = {
        updatedAt: new Date(),
        updatedBy: req.user!.id,
      };

      if (value !== undefined && value !== "") {
        updateData.value = value;
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }

      const [updated] = await db
        .update(systemSettings)
        .set(updateData)
        .where(eq(systemSettings.key, key))
        .returning();

      console.log(`[Settings] Updated ${key} by admin ${req.user!.id}`);

      // Clear cache for this setting so it's reloaded on next access
      clearSettingsCache(key);

      // If this is a casino token setting, also clear the casino token cache
      if (key.startsWith("CASINO_747_TOKEN_")) {
        clearTokenCache();
        console.log(`[Settings] Cleared casino token cache for ${key}`);
      }

      // If this is a NexusPay setting, clear the NexusPay config cache
      if (key.startsWith("NEXUSPAY_")) {
        clearNexusPayConfigCache();
        console.log(`[Settings] Cleared NexusPay config cache for ${key}`);
      }

      // If this is an SMS/PhilSMS setting, clear the SMS cache
      if (key.startsWith("PHILSMS_") || key.startsWith("SMS_")) {
        const { clearPhilSMSCache } = await import("./sms-philsms");
        clearPhilSMSCache();
        console.log(`[Settings] Cleared PhilSMS cache for ${key}`);
      }

      // If this is an AI setting, also update .env file for immediate effect
      if (key === "OPENROUTER_API_KEY" || key.startsWith("AI_")) {
        if (value !== undefined && value !== "") {
          updateEnvFile(key, value);
        }
      }

      res.json({
        success: true,
        setting: {
          ...updated,
          value: updated.isEncrypted ? "••••••••" : updated.value,
        },
      });
    } catch (error) {
      console.error("[Settings] Failed to update setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Create a new setting
  app.post("/api/admin/settings", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { key, value, category, description, isEncrypted } = req.body;

      if (!key || !value) {
        return res.status(400).json({ message: "Key and value are required" });
      }

      const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
      if (existing) {
        return res.status(400).json({ message: "Setting already exists" });
      }

      const [created] = await db
        .insert(systemSettings)
        .values({
          key,
          value,
          category: category || "general",
          description,
          isEncrypted: isEncrypted || false,
          updatedBy: req.user!.id,
        })
        .returning();

      console.log(`[Settings] Created ${key} by admin ${req.user!.id}`);

      res.json({ success: true, setting: created });
    } catch (error) {
      console.error("[Settings] Failed to create setting:", error);
      res.status(500).json({ message: "Failed to create setting" });
    }
  });

  // Delete a setting
  app.delete("/api/admin/settings/:key", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { key } = req.params;

      await db.delete(systemSettings).where(eq(systemSettings.key, key));

      console.log(`[Settings] Deleted ${key} by admin ${req.user!.id}`);

      res.json({ success: true });
    } catch (error) {
      console.error("[Settings] Failed to delete setting:", error);
      res.status(500).json({ message: "Failed to delete setting" });
    }
  });

  // Get escrow agents
  app.get("/api/admin/escrow-agents", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const agents = await db.select().from(escrowAgents).orderBy(escrowAgents.agentUsername);
      res.json({ agents });
    } catch (error) {
      console.error("[Settings] Failed to fetch escrow agents:", error);
      res.status(500).json({ message: "Failed to fetch escrow agents" });
    }
  });

  // Update escrow agent
  app.put("/api/admin/escrow-agents/:id", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive, dailyLimit } = req.body;

      const [updated] = await db
        .update(escrowAgents)
        .set({
          isActive: isActive !== undefined ? isActive : undefined,
          dailyLimit: dailyLimit !== undefined ? dailyLimit : undefined,
        })
        .where(eq(escrowAgents.id, parseInt(id)))
        .returning();

      res.json({ success: true, agent: updated });
    } catch (error) {
      console.error("[Settings] Failed to update escrow agent:", error);
      res.status(500).json({ message: "Failed to update escrow agent" });
    }
  });

  // Get a specific setting value (for internal use)
  app.get("/api/admin/settings/:key/value", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { key } = req.params;
      const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));

      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }

      res.json({ value: setting.value, isActive: setting.isActive });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  // Test email endpoint - sends a test email to verify SMTP configuration
  app.post("/api/admin/settings/test-email", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email address is required" });
      }

      // Import sendTestEmail dynamically to avoid circular dependencies
      const { sendTestEmail, clearEmailTransporter } = await import("./email");

      // Clear both the settings cache and transporter cache to force reload
      clearSettingsCache();
      clearEmailTransporter();

      console.log(`[Settings] Sending test email to ${email}`);
      const success = await sendTestEmail(email, req.user!.fullName || "Admin");

      if (success) {
        res.json({
          success: true,
          message: `Test email sent successfully to ${email}`
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to send test email. Please check SMTP settings."
        });
      }
    } catch (error: any) {
      console.error("[Settings] Test email error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to send test email"
      });
    }
  });

  // Test SMS endpoint - sends a test SMS to verify PhilSMS configuration
  app.post("/api/admin/settings/test-sms", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { phone, message } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      // Import SMS service dynamically
      const { sendSMS, clearPhilSMSCache } = await import("./sms-philsms");

      // Clear cache to force reload of credentials
      clearSettingsCache();
      clearPhilSMSCache();

      console.log(`[Settings] Sending test SMS to ${phone}`);
      const testMessage = message || "PayVerse Test: Your SMS gateway is working! This is a test message.";
      const result = await sendSMS(phone, testMessage);

      if (result.success) {
        res.json({
          success: true,
          message: `Test SMS sent successfully to ${phone}`,
          messageId: result.messageId
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || "Failed to send test SMS. Please check PhilSMS settings."
        });
      }
    } catch (error: any) {
      console.error("[Settings] Test SMS error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to send test SMS"
      });
    }
  });

  // Check SMS balance endpoint
  app.get("/api/admin/settings/sms-balance", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { checkBalance, clearPhilSMSCache } = await import("./sms-philsms");
      clearSettingsCache();
      clearPhilSMSCache();

      const result = await checkBalance();

      if (result.success) {
        res.json({
          success: true,
          balance: result.balance,
          expiresOn: (result as any).expiresOn
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || "Failed to check SMS balance"
        });
      }
    } catch (error: any) {
      console.error("[Settings] SMS balance error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to check SMS balance"
      });
    }
  });

  // Test OpenRouter API key endpoint
  app.post("/api/admin/settings/test-openrouter", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      // Clear cache to get fresh value
      clearSettingsCache();

      // Get API key from database
      const apiKey = await getSystemSetting("OPENROUTER_API_KEY", "");

      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: "OpenRouter API key is not configured. Please enter an API key first."
        });
      }

      console.log(`[Settings] Testing OpenRouter API key...`);

      // Make a simple test request to OpenRouter
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://payverse.ph",
          "X-Title": "PayVerse AI Assistant",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [
            { role: "user", content: "Say 'API key is working!' in exactly those words." }
          ],
          max_tokens: 20,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "API key validation failed";

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          // Use raw text if not JSON
          if (errorText.includes("Invalid API key") || response.status === 401) {
            errorMessage = "Invalid API key. Please check your OpenRouter API key.";
          } else if (response.status === 402) {
            errorMessage = "Insufficient credits on your OpenRouter account.";
          } else if (response.status === 429) {
            errorMessage = "Rate limited. Please try again later.";
          }
        }

        console.log(`[Settings] OpenRouter API test failed: ${response.status} - ${errorMessage}`);
        return res.status(400).json({
          success: false,
          message: errorMessage
        });
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || "";

      console.log(`[Settings] OpenRouter API test successful. Response: ${responseText}`);

      res.json({
        success: true,
        message: "OpenRouter API key is valid and working!",
        response: responseText,
        model: data.model || "google/gemini-2.0-flash-001"
      });
    } catch (error: any) {
      console.error("[Settings] OpenRouter test error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to test OpenRouter API key"
      });
    }
  });

  console.log("[Settings] Super admin settings routes registered");
}

// Initialize default settings if they don't exist
async function initializeDefaultSettings() {
  try {
    for (const setting of DEFAULT_SETTINGS) {
      const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, setting.key));
      if (!existing) {
        await db.insert(systemSettings).values({
          key: setting.key,
          value: setting.value,
          category: setting.category,
          description: setting.description,
          isEncrypted: (setting as any).isEncrypted || false,
        });
        console.log(`[Settings] Initialized default setting: ${setting.key}`);
      }
    }

    // Initialize escrow agents
    for (const agent of DEFAULT_ESCROW_AGENTS) {
      const [existing] = await db.select().from(escrowAgents).where(eq(escrowAgents.agentUsername, agent.agentUsername));
      if (!existing) {
        await db.insert(escrowAgents).values(agent);
        console.log(`[Settings] Initialized escrow agent: ${agent.agentUsername}`);
      }
    }
  } catch (error) {
    console.error("[Settings] Failed to initialize default settings:", error);
  }
}

// Helper function to get a setting value (for use in other modules)
export async function getSettingValue(key: string): Promise<string | null> {
  try {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting?.isActive ? setting.value : null;
  } catch (error) {
    console.error(`[Settings] Failed to get setting ${key}:`, error);
    return null;
  }
}

// Helper to get multiple settings
export async function getSettingsByCategory(category: string): Promise<Record<string, string>> {
  try {
    const settings = await db.select().from(systemSettings).where(eq(systemSettings.category, category));
    return settings.reduce((acc, s) => {
      if (s.isActive) {
        acc[s.key] = s.value;
      }
      return acc;
    }, {} as Record<string, string>);
  } catch (error) {
    console.error(`[Settings] Failed to get settings for category ${category}:`, error);
    return {};
  }
}
