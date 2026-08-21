import { Router, type IRouter } from "express";
import { monthlyBillItemsTable, monthlySubscriptionItemsTable } from "@workspace/db";
import paychecksRouter from "./paychecks.js";
import debtRouter from "./debt.js";
import cashRouter from "./cash.js";
import cashSpendingRouter from "./cash-spending.js";
import summaryRouter from "./summary.js";
import { createMonthlyItemsRouter } from "./monthly-items.js";

const router: IRouter = Router();

router.use(paychecksRouter);

// Bills reset to zero each month (you re-enter what you actually paid);
// subscriptions keep their amount because they rarely change.
router.use(
  createMonthlyItemsRouter({
    // Same columns as the subscriptions table apart from `active`, which the
    // bills routes never read or write.
    table: monthlyBillItemsTable as unknown as typeof monthlySubscriptionItemsTable,
    path: "bills",
    carryAmounts: false,
    supportsActive: false,
  }),
);

router.use(
  createMonthlyItemsRouter({
    table: monthlySubscriptionItemsTable,
    path: "subscriptions",
    carryAmounts: true,
    supportsActive: true,
    supportsDueDay: true,
    supportsBillingCycle: true,
  }),
);

router.use(debtRouter);
router.use(cashRouter);
router.use(cashSpendingRouter);
router.use(summaryRouter);

export default router;
