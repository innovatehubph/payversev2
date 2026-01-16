import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";
import { adminMiddleware, getAuditMetadata, adminRateLimiter, sensitiveActionRateLimiter } from "./admin";
import { sendKycApprovedEmail, sendKycRejectedEmail } from "./email";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";

const router = Router();

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "kyc");
const REQUIRED_DOC_TYPES = ["government_id", "selfie", "proof_of_address"];

if (!fsSync.existsSync(UPLOADS_DIR)) {
  fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const submitKycSchema = z.object({
  documentType: z.enum(["government_id", "selfie", "proof_of_address"]),
  documentData: z.string().min(1, "Document data is required"),
});

router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const documents = await storage.getKycDocumentsByUserId(user.id);
    
    res.json({
      kycStatus: user.kycStatus,
      documents: documents.map(d => ({
        id: d.id,
        documentType: d.documentType,
        documentUrl: d.documentUrl,
        status: d.status,
        adminNote: d.adminNote,
        createdAt: d.createdAt,
      })),
    });
  } catch (error: any) {
    console.error("[KYC] Failed to get status:", error);
    res.status(500).json({ message: "Failed to get KYC status" });
  }
});

router.post("/submit", authMiddleware, async (req: Request, res: Response) => {
  let filepath: string | null = null;
  
  try {
    const user = req.user!;
    const body = submitKycSchema.parse(req.body);
    
    const base64Match = body.documentData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ message: "Invalid image format. Please upload a valid image." });
    }
    
    const ext = base64Match[1].toLowerCase();
    const data = base64Match[2];
    
    if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
      return res.status(400).json({ message: "Only PNG, JPG, and WEBP images are allowed." });
    }
    
    const buffer = Buffer.from(data, "base64");
    
    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return res.status(400).json({ message: "File too large. Maximum size is 5MB." });
    }
    
    const filename = `${user.id}_${body.documentType}_${Date.now()}.${ext}`;
    filepath = path.join(UPLOADS_DIR, filename);
    
    await fs.writeFile(filepath, buffer);
    
    const documentUrl = `/uploads/kyc/${filename}`;
    
    const kycDoc = await storage.createKycDocument({
      userId: user.id,
      documentType: body.documentType,
      documentUrl,
    });
    
    if (user.kycStatus === "not_submitted") {
      await storage.updateUserAdmin(user.id, { kycStatus: "pending" });
    }
    
    res.json({ 
      success: true, 
      message: "Document submitted successfully",
      document: {
        id: kycDoc.id,
        documentType: kycDoc.documentType,
        status: kycDoc.status,
        createdAt: kycDoc.createdAt,
      }
    });
  } catch (error: any) {
    if (filepath) {
      try {
        await fs.unlink(filepath);
      } catch (cleanupErr) {
        console.error("[KYC] Failed to cleanup partial file:", cleanupErr);
      }
    }
    
    console.error("[KYC] Failed to submit document:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    res.status(500).json({ message: "Failed to submit document" });
  }
});

router.get("/admin/pending", authMiddleware, adminMiddleware, adminRateLimiter, async (req: Request, res: Response) => {
  try {
    const pendingDocs = await storage.getPendingKycDocuments();
    res.json(pendingDocs);
  } catch (error: any) {
    console.error("[KYC] Failed to get pending documents:", error);
    res.status(500).json({ message: "Failed to get pending documents" });
  }
});

router.post("/admin/review/:id", authMiddleware, adminMiddleware, adminRateLimiter, sensitiveActionRateLimiter, async (req: Request, res: Response) => {
  try {
    const docId = parseInt(req.params.id);
    const { action, note } = req.body;
    
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }
    
    const docs = await storage.getPendingKycDocuments();
    const doc = docs.find(d => d.id === docId);
    
    if (!doc) {
      return res.status(404).json({ message: "Document not found or already reviewed" });
    }
    
    const newStatus = action === "approve" ? "approved" : "rejected";
    await storage.updateKycDocumentStatus(docId, newStatus, note);
    
    const userDocs = await storage.getKycDocumentsByUserId(doc.userId);
    
    const approvedDocTypes = new Set<string>();
    for (const d of userDocs) {
      const effectiveStatus = d.id === docId ? newStatus : d.status;
      if (effectiveStatus === "approved") {
        approvedDocTypes.add(d.documentType);
      }
    }
    
    const hasAllRequiredDocs = REQUIRED_DOC_TYPES.every(type => approvedDocTypes.has(type));
    
    if (hasAllRequiredDocs) {
      await storage.updateUserAdmin(doc.userId, { kycStatus: "verified" });
      sendKycApprovedEmail(doc.user.email, doc.user.fullName).catch(err => {
        console.error("[KYC] Failed to send approval email:", err);
      });
    } else if (action === "reject") {
      sendKycRejectedEmail(doc.user.email, doc.user.fullName, note || "Document did not meet requirements").catch(err => {
        console.error("[KYC] Failed to send rejection email:", err);
      });
    }
    
    const auditMeta = getAuditMetadata(req, `kyc_${action}`);
    await storage.createAdminAuditLog({
      adminId: req.user!.id,
      action: `kyc_${action}`,
      targetType: "kyc_document",
      targetId: docId,
      details: `KYC document ${action}d for user ${doc.user.username}`,
      newValue: note || null,
      ...auditMeta,
    });
    
    res.json({ 
      success: true, 
      message: `Document ${action === "approve" ? "approved" : "rejected"} successfully` 
    });
  } catch (error: any) {
    console.error("[KYC] Failed to review document:", error);
    res.status(500).json({ message: "Failed to review document" });
  }
});

export function registerKycRoutes(app: any) {
  app.use("/api/kyc", router);
  console.log("[KYC] Routes registered");
}
