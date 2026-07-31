import { Router, type IRouter } from "express";
import financeRouter from "./finance/index.js";
import journalRouter from "./journal/index.js";

const router: IRouter = Router();

// Health check
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Domain routers
router.use("/finance", financeRouter);
router.use("/journal", journalRouter);

export default router;
