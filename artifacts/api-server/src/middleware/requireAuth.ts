import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // If no password is configured, the gate is disabled — allow everything.
  if (!process.env.APP_PASSWORD) {
    next();
    return;
  }
  if (req.signedCookies?.["zh_sess"] === "1") {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
