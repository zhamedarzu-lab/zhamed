import { Router } from "express";
import { db } from "@workspace/db";
import {
  paychecksTable,
  debtAccountsTable,
  debtSnapshotsTable,
  cashAccountsTable,
  cashSnapshotsTable,
  allocationsTable,
  extraIncomeTable,
  monthlySubscriptionItemsTable,
  monthlyBillItemsTable,
  journalEntriesTable,
  dayHighlightsTable,
  journalPeriodNotesTable,
  journalLinksTable,
  cashSpendingLogTable,
  exercisesTable,
  effortsTable,
  foodItemsTable,
  foodActivitiesTable,
} from "@workspace/db";

const router = Router();

// GET /api/export  — full JSON dump of every table; triggers file download.
//
// Every table in the schema has to be listed here. Period notes, journal links
// and the cash spending log were all missing, so an export taken as a backup
// silently dropped them — the one file you would restore from was the one that
// did not have them.
router.get("/export", async (_req, res) => {
  const [
    paychecks,
    debtAccounts,
    debtSnapshots,
    cashAccounts,
    cashSnapshots,
    allocations,
    extraIncome,
    subscriptions,
    bills,
    journalEntries,
    dayHighlights,
    journalPeriodNotes,
    journalLinks,
    cashSpendingLog,
    exercises,
    efforts,
    foodItems,
    foodActivities,
  ] = await Promise.all([
    db.select().from(paychecksTable),
    db.select().from(debtAccountsTable),
    db.select().from(debtSnapshotsTable),
    db.select().from(cashAccountsTable),
    db.select().from(cashSnapshotsTable),
    db.select().from(allocationsTable),
    db.select().from(extraIncomeTable),
    db.select().from(monthlySubscriptionItemsTable),
    db.select().from(monthlyBillItemsTable),
    db.select().from(journalEntriesTable),
    db.select().from(dayHighlightsTable),
    db.select().from(journalPeriodNotesTable),
    db.select().from(journalLinksTable),
    db.select().from(cashSpendingLogTable),
    db.select().from(exercisesTable),
    db.select().from(effortsTable),
    db.select().from(foodItemsTable),
    db.select().from(foodActivitiesTable),
  ]);

  const exportedAt = new Date().toISOString();

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="zh-export-${exportedAt.slice(0, 10)}.json"`,
  );
  res.json({
    exportedAt,
    paychecks,
    debtAccounts,
    debtSnapshots,
    cashAccounts,
    cashSnapshots,
    allocations,
    extraIncome,
    subscriptions,
    bills,
    journalEntries,
    dayHighlights,
    journalPeriodNotes,
    journalLinks,
    cashSpendingLog,
    exercises,
    efforts,
    foodItems,
    foodActivities,
  });
});

export default router;
