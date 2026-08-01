import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.signedCookies?.["zh_sess"] === "1") {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
