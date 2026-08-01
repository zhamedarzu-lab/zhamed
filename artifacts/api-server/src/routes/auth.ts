import { Router } from "express";
import type { Response } from "express";

const router = Router();

const COOKIE_NAME = "zh_sess";
const COOKIE_OPTS = {
  signed: true,
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function setSession(res: Response) {
  res.cookie(COOKIE_NAME, "1", COOKIE_OPTS);
}

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "APP_PASSWORD secret is not configured on the server." });
    return;
  }
  if (!password || password !== expected) {
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  setSession(res);
  res.json({ ok: true });
});

// GET /api/auth/check
router.get("/check", (req, res) => {
  if (req.signedCookies?.["zh_sess"] === "1") {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

export default router;
