import { Router, type IRouter } from "express";
import financeRouter from "./finance.js";

const router: IRouter = Router();

// Health check
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Domain routers
router.use("/finance", financeRouter);

export default router;
