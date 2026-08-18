import type { Response } from "express";
import type { z } from "zod";

export const MONTH_RE = /^\d{4}-\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Money is stored as numeric(10,2); these convert between that and JS numbers. */
export const round = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => n.toFixed(2);

export function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw Object.assign(new Error("Invalid id"), { status: 400 });
  return n;
}

/** `?accountId=` style filters — undefined when absent or unparseable. */
export function optionalIdQuery(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = parseInt(raw, 10);
  return isNaN(n) ? undefined : n;
}

/**
 * `?dayStart=2026-08-18T00:00:00-04:00` style filters — an instant supplied by
 * the client, so a window is bounded by the viewer's midnight rather than the
 * server's. Undefined when absent or unparseable, which leaves the caller to
 * fall back to its own arithmetic.
 */
export function optionalInstantQuery(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * `?tz=America/New_York` — a validated IANA zone name, for the queries that
 * bucket a whole history by calendar day and so need the zone rather than a
 * fixed offset. Falls back to UTC, which is what these endpoints did before
 * they took a zone at all.
 */
export function timeZoneQuery(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64) return "UTC";
  try {
    // Throws RangeError on anything Node's ICU does not recognise, which is
    // what keeps an arbitrary string from reaching the database.
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

/** `?from=YYYY-MM-DD` / `?to=YYYY-MM-DD` style filters — undefined when absent or invalid. */
export function optionalDateQuery(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  return DATE_RE.test(raw) ? raw : undefined;
}

/**
 * Validates a body and replies 400 itself when it doesn't fit, so routes read
 * as `const data = parseBody(...); if (!data) return;`.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  res: Response,
): z.infer<T> | undefined {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return undefined;
  }
  return parsed.data;
}

/** Requires a `?month=YYYY-MM` query param, replying 400 when it's missing. */
export function requireMonthQuery(raw: unknown, res: Response): string | undefined {
  const month = typeof raw === "string" ? raw : undefined;
  if (!month || !MONTH_RE.test(month)) {
    res.status(400).json({ error: "month query param required (YYYY-MM)" });
    return undefined;
  }
  return month;
}

/**
 * Postgres unique-violation, raised when a month already has that paycheck.
 * Drizzle wraps driver errors, so the pg code sits further down `cause`.
 */
export function isDuplicate(err: unknown): boolean {
  for (let cur = err, depth = 0; cur && depth < 5; depth++) {
    if (typeof cur === "object" && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Bills and subscriptions both chart the same way: one row per month, one
 * column per name, plus a total.
 */
export function monthlyHistory(items: Array<{ month: string; name: string; amount: string }>) {
  const byMonth = new Map<string, Record<string, number>>();
  for (const item of items) {
    let row = byMonth.get(item.month);
    if (!row) {
      row = {};
      byMonth.set(item.month, row);
    }
    row[item.name] = (row[item.name] ?? 0) + Number(item.amount);
  }

  const allNames = new Set<string>();
  for (const row of byMonth.values()) for (const name of Object.keys(row)) allNames.add(name);

  return {
    months: [...byMonth.entries()].map(([month, row]) => ({
      month,
      total: round(Object.values(row).reduce((s, v) => s + v, 0)),
      ...row,
    })),
    allNames: [...allNames].sort(),
  };
}
