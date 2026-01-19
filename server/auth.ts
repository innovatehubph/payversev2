import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const sessions = new Map<string, number>();

export function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.substring(7);
  const userId = sessions.get(token);

  if (!userId) {
    return res.status(401).json({ message: "Invalid session" });
  }

  const user = await storage.getUser(userId);
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ message: "User not found" });
  }

  req.user = user;
  next();
}

/**
 * Optional auth middleware - populates user if token is valid, but allows guests
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token - continue as guest
    return next();
  }

  const token = authHeader.substring(7);
  const userId = sessions.get(token);

  if (!userId) {
    // Invalid token - continue as guest
    return next();
  }

  const user = await storage.getUser(userId);
  if (user) {
    req.user = user;
  }

  next();
}
