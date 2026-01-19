/**
 * AI FAQ Learning System
 *
 * Handles learning from user interactions to build a knowledge base of FAQs.
 * Features:
 * - Track user feedback on AI responses (helpful/not helpful)
 * - Extract patterns from successful interactions
 * - Auto-suggest FAQs for admin approval
 * - Inject learned knowledge into AI context
 */

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import type { User, AiFaq, AiLearnedPattern } from "@shared/schema";

// Categories for FAQ classification
export const FAQ_CATEGORIES = [
  "general",
  "account",
  "kyc",
  "security",
  "transactions",
  "balance",
  "topup",
  "withdrawal",
  "casino",
  "qrph",
  "telegram",
  "errors",
] as const;

// Keywords for auto-categorization
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  kyc: ["kyc", "verify", "verification", "identity", "document", "id", "selfie", "proof"],
  security: ["pin", "password", "secure", "security", "2fa", "otp", "hack", "protect"],
  transactions: ["send", "transfer", "transaction", "history", "payment", "receive"],
  balance: ["balance", "money", "funds", "wallet", "phpt", "peso"],
  topup: ["topup", "top up", "add money", "deposit", "cash in", "cashin"],
  withdrawal: ["withdraw", "withdrawal", "cash out", "cashout", "payout"],
  casino: ["casino", "747", "chips", "gambling", "bet", "gaming"],
  qrph: ["qrph", "qr", "gcash", "maya", "grabpay", "e-wallet", "ewallet"],
  telegram: ["telegram", "paygram", "bot", "connect"],
  account: ["account", "profile", "settings", "email", "phone", "username"],
  errors: ["error", "problem", "issue", "not working", "failed", "help"],
};

/**
 * Auto-detect category from question text
 */
export function detectCategory(text: string): string {
  const lowerText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      return category;
    }
  }

  return "general";
}

/**
 * Normalize question text for pattern matching
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .substring(0, 200); // Limit length
}

/**
 * Calculate confidence score based on feedback
 */
export function calculateConfidence(positiveRatings: number, negativeRatings: number, occurrenceCount: number): number {
  const totalRatings = positiveRatings + negativeRatings;
  if (totalRatings === 0) return 0;

  const positiveRatio = positiveRatings / totalRatings;
  const frequencyBonus = Math.min(occurrenceCount / 10, 1) * 20; // Up to 20 points for frequency

  return Math.min(100, Math.round(positiveRatio * 80 + frequencyBonus));
}

/**
 * Process user feedback and update learning patterns
 */
export async function processFeedback(
  messageId: number,
  conversationId: number,
  userId: number | null,
  rating: "helpful" | "not_helpful" | "incorrect",
  feedbackText?: string
): Promise<void> {
  // Store the feedback
  await storage.createAiInteractionFeedback({
    messageId,
    conversationId,
    userId,
    rating,
    feedbackText,
  });

  // Get the message and its context
  const messages = await storage.getAiMessagesByConversationId(conversationId);
  const messageIndex = messages.findIndex(m => m.id === messageId);

  if (messageIndex <= 0) return; // No previous user message

  const assistantMessage = messages[messageIndex];
  const userMessage = messages[messageIndex - 1];

  if (assistantMessage.role !== "assistant" || userMessage.role !== "user") return;

  const normalizedQuestion = normalizeQuestion(userMessage.content);
  const category = detectCategory(userMessage.content);

  // Find or create a learned pattern
  let pattern = await storage.findSimilarPattern(normalizedQuestion);

  if (pattern) {
    // Update existing pattern
    const updates: Partial<AiLearnedPattern> = {
      occurrenceCount: pattern.occurrenceCount + 1,
      positiveRatings: pattern.positiveRatings + (rating === "helpful" ? 1 : 0),
      negativeRatings: pattern.negativeRatings + (rating !== "helpful" ? 1 : 0),
    };

    // Recalculate confidence
    const newConfidence = calculateConfidence(
      updates.positiveRatings!,
      updates.negativeRatings!,
      updates.occurrenceCount!
    );
    updates.confidenceScore = newConfidence.toString();

    // If it's a better answer (helpful rating), update the answer pattern
    if (rating === "helpful" && assistantMessage.content.length > (pattern.answerPattern?.length || 0)) {
      updates.answerPattern = assistantMessage.content.substring(0, 2000);
    }

    await storage.updateAiLearnedPattern(pattern.id, updates);

    // If high confidence, create a training suggestion
    if (newConfidence >= 75 && pattern.status === "pending") {
      await storage.createAiTrainingSuggestion({
        learnedPatternId: pattern.id,
        originalQuestion: userMessage.content.substring(0, 500),
        originalAnswer: assistantMessage.content.substring(0, 2000),
        suggestedCategory: category,
        reason: `High confidence score (${newConfidence}%) with ${updates.occurrenceCount} occurrences`,
      });
    }
  } else if (rating === "helpful") {
    // Create new pattern only for helpful responses
    await storage.createAiLearnedPattern({
      questionPattern: normalizedQuestion,
      answerPattern: assistantMessage.content.substring(0, 2000),
      category,
      confidenceScore: "25", // Start with base confidence
      occurrenceCount: 1,
      positiveRatings: 1,
      negativeRatings: 0,
      status: "pending",
    });
  }
}

/**
 * Get FAQs formatted for AI context injection
 */
export async function getFaqContext(): Promise<string> {
  const faqs = await storage.getApprovedFaqs();

  if (faqs.length === 0) {
    return "";
  }

  const faqList = faqs
    .slice(0, 20) // Limit to top 20 FAQs
    .map((faq, i) => `Q${i + 1}: ${faq.question}\nA${i + 1}: ${faq.answer}`)
    .join("\n\n");

  return `\n\nLEARNED FAQS FROM USER INTERACTIONS:\nUse these verified Q&A pairs to answer similar questions accurately:\n\n${faqList}`;
}

/**
 * Search FAQs for a specific query
 */
export async function searchRelevantFaqs(query: string): Promise<AiFaq[]> {
  return await storage.searchFaqs(query);
}

// Categories that are safe for public/guest users
const PUBLIC_SAFE_CATEGORIES = ["general", "account", "kyc", "security", "transactions", "balance", "topup", "withdrawal", "qrph", "errors"];

// Categories that require authentication
const AUTH_REQUIRED_CATEGORIES = ["casino", "telegram"];

// Categories that are admin-only (should never be shown to regular users)
const ADMIN_ONLY_CATEGORIES = ["admin", "system", "internal"];

/**
 * Get FAQs filtered by user role - excludes admin/sensitive content
 */
export async function getPublicFaqs(userRole: string | null): Promise<AiFaq[]> {
  const allFaqs = await storage.getApprovedFaqs();

  // Filter out admin-only categories
  let filteredFaqs = allFaqs.filter(faq => !ADMIN_ONLY_CATEGORIES.includes(faq.category));

  // For guests, only show public safe categories
  if (!userRole || userRole === "public") {
    filteredFaqs = filteredFaqs.filter(faq => PUBLIC_SAFE_CATEGORIES.includes(faq.category));
  }

  // For regular users, include auth-required categories but still exclude admin
  // Admins can see everything except internal system FAQs

  // Sanitize answers to remove any potentially sensitive information
  return filteredFaqs.map(faq => ({
    ...faq,
    // Remove any potential admin-specific details from answers
    answer: sanitizeFaqAnswer(faq.answer),
  }));
}

/**
 * Sanitize FAQ answer to remove sensitive information
 */
function sanitizeFaqAnswer(answer: string): string {
  let sanitized = answer;

  // Remove any mentions of admin panels, internal systems, or credentials
  const sensitivePatterns = [
    /admin\s+panel\s+at\s+[^\s]+/gi,
    /internal\s+api/gi,
    /api[_-]?key[:\s]+[^\s]+/gi,
    /password[:\s]+[^\s]+/gi,
    /secret[:\s]+[^\s]+/gi,
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
    /database\s+connection/gi,
    /server\s+config/gi,
  ];

  for (const pattern of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, "[removed]");
  }

  return sanitized;
}

/**
 * Get FAQ categories available for a user role
 */
export function getAvailableCategories(userRole: string | null): string[] {
  if (!userRole || userRole === "public") {
    return PUBLIC_SAFE_CATEGORIES;
  }

  if (userRole === "admin" || userRole === "super_admin") {
    return [...PUBLIC_SAFE_CATEGORIES, ...AUTH_REQUIRED_CATEGORIES];
  }

  // Regular users
  return [...PUBLIC_SAFE_CATEGORIES, ...AUTH_REQUIRED_CATEGORIES];
}

/**
 * Get popular/trending FAQs based on hit count
 */
export async function getPopularFaqs(userRole: string | null, limit: number = 5): Promise<AiFaq[]> {
  const faqs = await getPublicFaqs(userRole);
  return faqs
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, limit);
}

/**
 * Register FAQ learning API routes
 */
export function registerFaqLearningRoutes(app: Express, authMiddleware: any, optionalAuthMiddleware: any) {
  console.log("[AI FAQ] Registering FAQ learning routes...");

  /**
   * POST /api/ai/feedback - Submit feedback on AI response
   */
  app.post("/api/ai/feedback", optionalAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user: User | null = (req as any).user || null;
      const { messageId, conversationId, rating, feedbackText } = req.body;

      if (!messageId || !conversationId || !rating) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (!["helpful", "not_helpful", "incorrect"].includes(rating)) {
        return res.status(400).json({ message: "Invalid rating value" });
      }

      await processFeedback(messageId, conversationId, user?.id || null, rating, feedbackText);

      res.json({ success: true, message: "Feedback recorded" });
    } catch (error) {
      console.error("[AI FAQ] Error recording feedback:", error);
      res.status(500).json({ message: "Failed to record feedback" });
    }
  });

  /**
   * GET /api/ai/faqs - Get approved FAQs filtered by user role
   * This is the main public endpoint for the Help & Support page
   */
  app.get("/api/ai/faqs", optionalAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user: User | null = (req as any).user || null;
      const category = req.query.category as string | undefined;
      const userRole = user?.role || null;

      // Get role-appropriate FAQs
      let faqs = await getPublicFaqs(userRole);

      // Filter by category if specified
      if (category) {
        faqs = faqs.filter(faq => faq.category === category);
      }

      // Get available categories for this user
      const categories = getAvailableCategories(userRole);

      res.json({
        faqs,
        categories,
        userRole: userRole || "guest",
      });
    } catch (error) {
      console.error("[AI FAQ] Error fetching FAQs:", error);
      res.status(500).json({ message: "Failed to fetch FAQs" });
    }
  });

  /**
   * GET /api/ai/faqs/popular - Get most popular FAQs
   */
  app.get("/api/ai/faqs/popular", optionalAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user: User | null = (req as any).user || null;
      const limit = parseInt(req.query.limit as string) || 5;
      const userRole = user?.role || null;

      const faqs = await getPopularFaqs(userRole, Math.min(limit, 10));

      res.json({ faqs });
    } catch (error) {
      console.error("[AI FAQ] Error fetching popular FAQs:", error);
      res.status(500).json({ message: "Failed to fetch popular FAQs" });
    }
  });

  /**
   * GET /api/ai/faqs/search - Search FAQs with role filtering
   */
  app.get("/api/ai/faqs/search", optionalAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user: User | null = (req as any).user || null;
      const query = req.query.q as string;

      if (!query) {
        return res.status(400).json({ message: "Search query required" });
      }

      const userRole = user?.role || null;

      // Get all matching FAQs then filter by role
      let faqs = await storage.searchFaqs(query);

      // Apply role-based filtering
      const allowedCategories = getAvailableCategories(userRole);
      faqs = faqs.filter(faq =>
        allowedCategories.includes(faq.category) &&
        !ADMIN_ONLY_CATEGORIES.includes(faq.category)
      );

      // Sanitize answers
      faqs = faqs.map(faq => ({
        ...faq,
        answer: sanitizeFaqAnswer(faq.answer),
      }));

      res.json({ faqs });
    } catch (error) {
      console.error("[AI FAQ] Error searching FAQs:", error);
      res.status(500).json({ message: "Failed to search FAQs" });
    }
  });

  /**
   * POST /api/ai/faqs/:id/hit - Track FAQ hit (when user views it)
   */
  app.post("/api/ai/faqs/:id/hit", async (req: Request, res: Response) => {
    try {
      const faqId = parseInt(req.params.id);
      await storage.incrementFaqHitCount(faqId);
      res.json({ success: true });
    } catch (error) {
      console.error("[AI FAQ] Error tracking FAQ hit:", error);
      res.status(500).json({ message: "Failed to track FAQ hit" });
    }
  });

  // ============================================
  // Admin-only routes
  // ============================================

  /**
   * GET /api/admin/ai/training-suggestions - Get pending training suggestions
   */
  app.get("/api/admin/ai/training-suggestions", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const suggestions = await storage.getPendingTrainingSuggestions();
      res.json({ suggestions });
    } catch (error) {
      console.error("[AI FAQ] Error fetching training suggestions:", error);
      res.status(500).json({ message: "Failed to fetch training suggestions" });
    }
  });

  /**
   * POST /api/admin/ai/training-suggestions/:id/approve - Approve a training suggestion as FAQ
   */
  app.post("/api/admin/ai/training-suggestions/:id/approve", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const suggestionId = parseInt(req.params.id);
      const { question, answer, category } = req.body;

      // Get the suggestion
      const suggestions = await storage.getPendingTrainingSuggestions();
      const suggestion = suggestions.find(s => s.id === suggestionId);

      if (!suggestion) {
        return res.status(404).json({ message: "Suggestion not found" });
      }

      // Create the FAQ
      const faq = await storage.createAiFaq({
        question: question || suggestion.originalQuestion,
        answer: answer || suggestion.originalAnswer,
        category: category || suggestion.suggestedCategory || "general",
        isActive: true,
        isApproved: true,
        approvedBy: user.id,
      });

      // Update the suggestion status
      await storage.updateAiTrainingSuggestion(suggestionId, {
        status: "approved",
        reviewedBy: user.id,
        reviewedAt: new Date(),
      });

      // Update the learned pattern if exists
      if (suggestion.learnedPatternId) {
        await storage.updateAiLearnedPattern(suggestion.learnedPatternId, {
          status: "approved",
          promotedToFaqId: faq.id,
        });
      }

      res.json({ success: true, faq });
    } catch (error) {
      console.error("[AI FAQ] Error approving suggestion:", error);
      res.status(500).json({ message: "Failed to approve suggestion" });
    }
  });

  /**
   * POST /api/admin/ai/training-suggestions/:id/reject - Reject a training suggestion
   */
  app.post("/api/admin/ai/training-suggestions/:id/reject", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const suggestionId = parseInt(req.params.id);
      const { reason } = req.body;

      await storage.updateAiTrainingSuggestion(suggestionId, {
        status: "rejected",
        reviewedBy: user.id,
        reviewedAt: new Date(),
        adminNotes: reason,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[AI FAQ] Error rejecting suggestion:", error);
      res.status(500).json({ message: "Failed to reject suggestion" });
    }
  });

  /**
   * POST /api/admin/ai/faqs - Create a new FAQ manually
   */
  app.post("/api/admin/ai/faqs", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { question, answer, category, keywords, priority } = req.body;

      if (!question || !answer) {
        return res.status(400).json({ message: "Question and answer are required" });
      }

      const faq = await storage.createAiFaq({
        question,
        answer,
        category: category || "general",
        keywords: keywords ? JSON.stringify(keywords) : null,
        priority: priority || 0,
        isActive: true,
        isApproved: true,
        approvedBy: user.id,
      });

      res.json({ success: true, faq });
    } catch (error) {
      console.error("[AI FAQ] Error creating FAQ:", error);
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  /**
   * PUT /api/admin/ai/faqs/:id - Update an FAQ
   */
  app.put("/api/admin/ai/faqs/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const faqId = parseInt(req.params.id);
      const updates = req.body;

      const faq = await storage.updateAiFaq(faqId, updates);

      if (!faq) {
        return res.status(404).json({ message: "FAQ not found" });
      }

      res.json({ success: true, faq });
    } catch (error) {
      console.error("[AI FAQ] Error updating FAQ:", error);
      res.status(500).json({ message: "Failed to update FAQ" });
    }
  });

  /**
   * DELETE /api/admin/ai/faqs/:id - Deactivate an FAQ
   */
  app.delete("/api/admin/ai/faqs/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const faqId = parseInt(req.params.id);
      await storage.updateAiFaq(faqId, { isActive: false });

      res.json({ success: true });
    } catch (error) {
      console.error("[AI FAQ] Error deactivating FAQ:", error);
      res.status(500).json({ message: "Failed to deactivate FAQ" });
    }
  });

  /**
   * GET /api/admin/ai/feedback-stats - Get feedback statistics
   */
  app.get("/api/admin/ai/feedback-stats", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const stats = await storage.getFeedbackStats();
      res.json({ stats });
    } catch (error) {
      console.error("[AI FAQ] Error fetching feedback stats:", error);
      res.status(500).json({ message: "Failed to fetch feedback stats" });
    }
  });

  /**
   * GET /api/admin/ai/learned-patterns - Get learned patterns
   */
  app.get("/api/admin/ai/learned-patterns", authMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      if (user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const highConfidence = req.query.highConfidence === "true";

      const patterns = highConfidence
        ? await storage.getHighConfidencePatterns(70)
        : await storage.getPendingPatterns(50);

      res.json({ patterns });
    } catch (error) {
      console.error("[AI FAQ] Error fetching learned patterns:", error);
      res.status(500).json({ message: "Failed to fetch learned patterns" });
    }
  });

  console.log("[AI FAQ] FAQ learning routes registered successfully");
}
