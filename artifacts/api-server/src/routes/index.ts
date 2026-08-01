import { Router, type IRouter } from "express";
import financeRouter from "./finance/index.js";
import journalRouter from "./journal/index.js";
import authRouter from "./auth.js";
import exportRouter from "./export.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router: IRouter = Router();

// Health check (unprotected)
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Auth routes (unprotected — login/check/logout)
router.use("/auth", authRouter);

// Everything below this line requires a valid session
router.use(requireAuth);

// Full data export
router.use(exportRouter);

// Domain routers
router.use("/finance", financeRouter);
router.use("/journal", journalRouter);

export default router;
