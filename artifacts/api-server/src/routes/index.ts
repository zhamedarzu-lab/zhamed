import { Router, type IRouter } from "express";
import financeRouter from "./finance.js";
import fitnessRouter from "./fitness.js";
import journalRouter from "./journal.js";

const router: IRouter = Router();

// Health check
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Domain routers
router.use("/finance", financeRouter);
router.use("/fitness", fitnessRouter);
router.use("/journal", journalRouter);

export default router;
