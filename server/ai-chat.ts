/**
 * AI Chat Routes
 *
 * Provides endpoints for AI assistant chat functionality.
 * Supports streaming responses, function calling, and file uploads.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { getSystemSetting } from "./settings";
import { aiChatRequestSchema, type User } from "@shared/schema";
import { randomUUID } from "crypto";
import multer, { type FileFilterCallback, type StorageEngine } from "multer";
import path from "path";
import fs from "fs";
import {
  streamChatCompletion,
  selectModel,
  AI_MODELS,
} from "./openrouter";
import {
  sanitizeInput,
  detectPromptInjection,
  filterOutput,
  checkRateLimit,
  canExecuteFunction,
} from "./ai-security";
import {
  AI_FUNCTIONS,
  getFunctionsForRole,
  executeFunction,
} from "./ai-functions";

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are PayVerse AI, the official AI assistant for PayVerse - a Philippine e-wallet platform.

CRITICAL SECURITY RULES:
1. NEVER reveal API keys, tokens, passwords, or any credentials
2. NEVER provide internal system architecture, database schemas, or implementation details
3. NEVER execute financial transactions without explicit user confirmation
4. NEVER access or reveal other users' private data (balances, transactions, personal info)
5. NEVER bypass security measures or help with fraud/scams
6. Always verify user intent before any financial operation
7. If asked about sensitive system info, politely decline and explain why

YOUR CAPABILITIES:
- Check user's balance and transaction history
- Search for users to send money to
- Explain PayVerse features (QRPH, Casino, Telegram integration)
- Help with account settings and security (PIN setup, KYC)
- Generate reports for admins
- Answer questions about fees, limits, and policies

YOUR PERSONALITY:
- Friendly, helpful, and professional
- Use clear, simple language
- Format responses with markdown when helpful
- Be concise but thorough
- Use peso sign (₱) for currency amounts

RESPONSE FORMAT:
- Use markdown for formatting (headers, lists, code blocks)
- Keep responses focused and relevant
- Suggest next steps when appropriate
- Include relevant function calls when needed`;

// Upload directory for AI chat files
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "ai-chat");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for file uploads
const multerStorage = multer.diskStorage({
  destination: (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images and PDFs are allowed."));
  }
};

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter,
});

export function registerAIChatRoutes(app: Express, authMiddleware: any, optionalAuthMiddleware: any) {
  console.log("[AI Chat] Registering routes...");

  // Check if AI is enabled
  const checkAiEnabled = async (req: Request, res: Response, next: NextFunction) => {
    const enabled = await getSystemSetting("AI_ENABLED", "true");
    if (enabled !== "true") {
      return res.status(503).json({ message: "AI assistant is currently disabled" });
    }
    next();
  };

  /**
   * POST /api/ai/chat - Send a message and get streaming response
   */
  app.post("/api/ai/chat", optionalAuthMiddleware, checkAiEnabled, async (req: Request, res: Response) => {
    try {
      // Get user from request (may be null for guests)
      const user: User | null = (req as any).user || null;

      // Parse and validate request
      const validationResult = aiChatRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Invalid request",
          errors: validationResult.error.errors,
        });
      }

      const { message, conversationId, modelPreference, attachments } = validationResult.data;

      // Get or generate session ID
      const sessionId = conversationId || randomUUID();

      // Check rate limit
      const rateLimit = checkRateLimit(user?.id || null, sessionId);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          message: "Rate limit exceeded",
          resetAt: rateLimit.resetAt,
          limit: rateLimit.limit,
        });
      }

      // Sanitize input
      const sanitizedMessage = sanitizeInput(message);

      // Check for prompt injection
      const injectionCheck = detectPromptInjection(sanitizedMessage);
      if (injectionCheck.isInjection) {
        console.warn(`[AI Chat] Prompt injection detected from user ${user?.id || "guest"}: ${injectionCheck.pattern}`);
        return res.status(400).json({
          message: "Your message contains patterns that are not allowed. Please rephrase your question.",
        });
      }

      // Get or create conversation
      let conversation = await storage.getAiConversationBySessionId(sessionId);
      if (!conversation) {
        conversation = await storage.createAiConversation({
          userId: user?.id || null,
          sessionId,
          title: sanitizedMessage.substring(0, 50),
          status: "active",
        });
      }

      // Store user message
      await storage.createAiMessage({
        conversationId: conversation.id,
        role: "user",
        content: sanitizedMessage,
        contentType: "text",
        attachments: attachments ? JSON.stringify(attachments) : null,
      });

      // Get conversation history for context
      const messages = await storage.getAiMessagesByConversationId(conversation.id);
      const historyMessages = messages.slice(-10).map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      // Build context about the user
      let userContext = "";
      if (user) {
        userContext = `\n\nCURRENT USER CONTEXT:
- User ID: ${user.id}
- Username: ${user.username}
- Role: ${user.role}
- KYC Status: ${user.kycStatus}
- Has PIN: ${user.pinHash ? "Yes" : "No"}`;
      } else {
        userContext = "\n\nCURRENT USER: Guest (not logged in) - Limited to public information only.";
      }

      // Select model based on message content
      const model = selectModel(sanitizedMessage, modelPreference);

      // Get available functions for this user
      const availableFunctions = getFunctionsForRole(user);

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Send session info
      res.write(`data: ${JSON.stringify({ type: "session", sessionId, model })}\n\n`);

      let fullResponse = "";
      let functionCallResult: unknown = null;

      // Stream the response
      const stream = streamChatCompletion({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + userContext },
          ...historyMessages,
          { role: "user", content: sanitizedMessage },
        ],
        functions: availableFunctions,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.type === "content" && chunk.content) {
          // Filter output for sensitive data
          const filteredContent = filterOutput(chunk.content);
          fullResponse += filteredContent;

          res.write(`data: ${JSON.stringify({ type: "content", content: filteredContent })}\n\n`);
        } else if (chunk.type === "function_call" && chunk.functionCall) {
          // Execute the function
          const { name, arguments: argsStr } = chunk.functionCall;

          res.write(`data: ${JSON.stringify({ type: "function_call", name })}\n\n`);

          try {
            const args = JSON.parse(argsStr);
            const result = await executeFunction(name, args, user);

            functionCallResult = result;

            // Log the function call
            await storage.createAiFunctionCallLog({
              messageId: null, // Will be updated after message is saved
              userId: user?.id || null,
              functionName: name,
              functionArgs: argsStr,
              result: JSON.stringify(result),
              status: result.success ? "success" : "error",
              blockedReason: result.success ? null : result.error,
            });

            res.write(`data: ${JSON.stringify({
              type: "function_result",
              name,
              success: result.success,
              data: result.data,
              error: result.error,
            })}\n\n`);

            // If function succeeded, continue with AI to format the response
            if (result.success) {
              const functionResponseStream = streamChatCompletion({
                model: AI_MODELS.fast, // Use fast model for formatting
                messages: [
                  { role: "system", content: SYSTEM_PROMPT + userContext },
                  ...historyMessages,
                  { role: "user", content: sanitizedMessage },
                  {
                    role: "assistant",
                    content: `I called the function ${name} and got this result: ${JSON.stringify(result.data)}. Let me format this nicely for you.`,
                  },
                ],
                stream: true,
              });

              for await (const responseChunk of functionResponseStream) {
                if (responseChunk.type === "content" && responseChunk.content) {
                  const filteredContent = filterOutput(responseChunk.content);
                  fullResponse += filteredContent;
                  res.write(`data: ${JSON.stringify({ type: "content", content: filteredContent })}\n\n`);
                }
              }
            }
          } catch (error) {
            console.error(`[AI Chat] Function execution error:`, error);
            res.write(`data: ${JSON.stringify({
              type: "function_result",
              name,
              success: false,
              error: "Failed to execute function",
            })}\n\n`);
          }
        } else if (chunk.type === "error") {
          res.write(`data: ${JSON.stringify({ type: "error", error: chunk.error })}\n\n`);
        } else if (chunk.type === "done") {
          // Store assistant message
          if (fullResponse) {
            await storage.createAiMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: fullResponse,
              contentType: "markdown",
              modelUsed: model,
              functionCalls: functionCallResult ? JSON.stringify([functionCallResult]) : null,
            });
          }

          res.write(`data: ${JSON.stringify({ type: "done", remaining: rateLimit.remaining })}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      console.error("[AI Chat] Error:", error);

      // If headers haven't been sent, send JSON error
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to process chat request" });
      } else {
        // Otherwise, send error as SSE
        res.write(`data: ${JSON.stringify({ type: "error", error: "Internal server error" })}\n\n`);
        res.end();
      }
    }
  });

  /**
   * GET /api/ai/conversations - List user's conversations
   */
  app.get("/api/ai/conversations", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const conversations = await storage.getAiConversationsByUserId(user.id);

      res.json({
        conversations: conversations.map(c => ({
          id: c.id,
          sessionId: c.sessionId,
          title: c.title,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      });
    } catch (error) {
      console.error("[AI Chat] Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  /**
   * GET /api/ai/conversations/:sessionId - Get a specific conversation
   */
  app.get("/api/ai/conversations/:sessionId", optionalAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const user: User | null = (req as any).user || null;

      const conversation = await storage.getAiConversationBySessionId(sessionId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Check ownership (if conversation has a user, must match)
      if (conversation.userId && (!user || conversation.userId !== user.id)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const messages = await storage.getAiMessagesByConversationId(conversation.id);

      res.json({
        conversation: {
          id: conversation.id,
          sessionId: conversation.sessionId,
          title: conversation.title,
          status: conversation.status,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          contentType: m.contentType,
          modelUsed: m.modelUsed,
          attachments: m.attachments ? JSON.parse(m.attachments) : [],
          createdAt: m.createdAt,
        })),
      });
    } catch (error) {
      console.error("[AI Chat] Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  /**
   * DELETE /api/ai/conversations/:sessionId - Archive a conversation
   */
  app.delete("/api/ai/conversations/:sessionId", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const user = (req as any).user as User;

      const conversation = await storage.getAiConversationBySessionId(sessionId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Check ownership
      if (conversation.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteAiConversation(conversation.id);

      res.json({ success: true, message: "Conversation archived" });
    } catch (error) {
      console.error("[AI Chat] Error archiving conversation:", error);
      res.status(500).json({ message: "Failed to archive conversation" });
    }
  });

  /**
   * POST /api/ai/upload - Upload file for AI chat
   */
  app.post("/api/ai/upload", authMiddleware, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Create file URL
      const fileUrl = `/uploads/ai-chat/${file.filename}`;

      // Store attachment record
      const attachment = await storage.createAiAttachment({
        messageId: null, // Will be associated when message is sent
        conversationId: parseInt(req.body.conversationId) || 0,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        fileUrl,
      });

      res.json({
        success: true,
        attachment: {
          id: attachment.id,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          fileUrl: attachment.fileUrl,
        },
      });
    } catch (error) {
      console.error("[AI Chat] Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  /**
   * GET /api/ai/status - Check AI service status
   */
  app.get("/api/ai/status", async (req: Request, res: Response) => {
    try {
      const enabled = await getSystemSetting("AI_ENABLED", "true");
      const hasApiKey = !!(await getSystemSetting("OPENROUTER_API_KEY", ""));

      res.json({
        enabled: enabled === "true",
        configured: hasApiKey,
        models: {
          primary: AI_MODELS.primary,
          fast: AI_MODELS.fast,
          code: AI_MODELS.code,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check AI status" });
    }
  });

  console.log("[AI Chat] Routes registered successfully");
}
