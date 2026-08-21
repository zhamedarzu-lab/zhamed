import { Router, type IRouter } from "express";
import { desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { monthlySubscriptionItemsTable } from "@workspace/db";
import {
  MONTH_RE,
  money,
  monthlyHistory,
  parseBody,
  parseId,
  requireMonthQuery,
} from "./shared.js";

/**
 * Bills and subscriptions are the same thing with a different name: a list of
 * named amounts that belongs to exactly one month, carried forward from the
 * previous month the first time you visit a new one. Deleting April's row
 * never touches March.
 *
 * The two differ in only two ways, both passed in as options:
 *  - bills start each month at zero; subscriptions keep last month's amount
 *  - subscriptions can be paused (`active`), bills cannot
 */
type ItemsTable = typeof monthlySubscriptionItemsTable;

export interface MonthlyItemsOptions {
  /** Bills' table is the same shape minus `active`, which stays untouched for it. */
  table: ItemsTable;
  /** Route prefix — "bills" or "subscriptions". */
  path: string;
  /** Whether a new month inherits last month's amounts or starts blank. */
  carryAmounts: boolean;
  /** Whether rows can be paused. */
  supportsActive: boolean;
}

export function createMonthlyItemsRouter(opts: MonthlyItemsOptions): IRouter {
  const { table, path, carryAmounts, supportsActive } = opts;
  const router: IRouter = Router();

  const shape = (item: typeof table.$inferSelect) => ({ ...item, amount: Number(item.amount) });

  // History powers the charts: every month, every name, all in one payload.
  router.get(`/${path}/history`, async (_req, res): Promise<void> => {
    const items = await db.select().from(table).orderBy(table.month, table.sortOrder);
    res.json(monthlyHistory(items));
  });

  router.get(`/${path}`, async (req, res): Promise<void> => {
    const month = requireMonthQuery(req.query.month, res);
    if (!month) return;

    let items = await db
      .select()
      .from(table)
      .where(eq(table.month, month))
      .orderBy(table.sortOrder);

    if (items.length === 0) items = await carryForward(month);

    res.json(items.map(shape));
  });

  /** Seeds an empty month from the most recent month that has rows. */
  async function carryForward(month: string) {
    const [prev] = await db
      .select({ month: table.month })
      .from(table)
      .where(lt(table.month, month))
      .orderBy(desc(table.month))
      .limit(1);
    if (!prev) return [];

    const source = await db
      .select()
      .from(table)
      .where(eq(table.month, prev.month))
      .orderBy(table.sortOrder);
    if (source.length === 0) return [];

    return db
      .insert(table)
      .values(
        source.map((s) => ({
          month,
          name: s.name,
          amount: carryAmounts ? s.amount : "0",
          sortOrder: s.sortOrder,
          ...(supportsActive ? { active: s.active } : {}),
        })),
      )
      .returning();
  }

  router.post(`/${path}`, async (req, res): Promise<void> => {
    const data = parseBody(
      z.object({
        month: z.string().regex(MONTH_RE),
        name: z.string().min(1),
        sortOrder: z.number().int().optional(),
      }),
      req.body,
      res,
    );
    if (!data) return;

    const [item] = await db
      .insert(table)
      .values({
        month: data.month,
        name: data.name,
        amount: "0",
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();
    res.status(201).json(shape(item));
  });

  router.patch(`/${path}/:id`, async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    const data = parseBody(
      z.object({
        name: z.string().min(1).optional(),
        amount: z.number().min(0).optional(),
        ...(supportsActive ? { active: z.boolean().optional() } : {}),
      }),
      req.body,
      res,
    );
    if (!data) return;

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.amount !== undefined) update.amount = money(data.amount);
    if (supportsActive && data.active !== undefined) update.active = data.active;

    const [item] = await db.update(table).set(update).where(eq(table.id, id)).returning();
    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(shape(item));
  });

  router.delete(`/${path}/:id`, async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    await db.delete(table).where(eq(table.id, id));
    res.sendStatus(204);
  });

  /**
   * PUT /{path}/reorder — accepts { ids: number[] } in the desired order and
   * writes sortOrder = index for each.  Only touches the supplied IDs so other
   * months are unaffected.
   */
  router.put(`/${path}/reorder`, async (req, res): Promise<void> => {
    const data = parseBody(z.object({ ids: z.array(z.number().int()) }), req.body, res);
    if (!data) return;
    await Promise.all(
      data.ids.map((id, idx) =>
        db.update(table).set({ sortOrder: idx }).where(eq(table.id, id)),
      ),
    );
    res.sendStatus(204);
  });

  return router;
}
