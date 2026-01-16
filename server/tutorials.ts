import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { authMiddleware } from "./auth";

const router = Router();

router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const completedTutorials = await storage.getCompletedTutorials(userId);
    res.json({ completedTutorials });
  } catch (error: any) {
    console.error("[Tutorials] Error fetching status:", error);
    res.status(500).json({ message: "Failed to fetch tutorial status" });
  }
});

router.post("/complete/:tutorialId", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { tutorialId } = req.params;
    
    if (!tutorialId) {
      return res.status(400).json({ message: "Tutorial ID is required" });
    }
    
    await storage.markTutorialComplete(userId, tutorialId);
    res.json({ success: true, message: "Tutorial marked as complete" });
  } catch (error: any) {
    console.error("[Tutorials] Error completing tutorial:", error);
    res.status(500).json({ message: "Failed to mark tutorial complete" });
  }
});

router.post("/reset", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await storage.resetTutorials(userId);
    res.json({ success: true, message: "Tutorials reset successfully" });
  } catch (error: any) {
    console.error("[Tutorials] Error resetting tutorials:", error);
    res.status(500).json({ message: "Failed to reset tutorials" });
  }
});

export function registerTutorialRoutes(app: any) {
  app.use("/api/tutorials", router);
  console.log("[Tutorials] Routes registered");
}
