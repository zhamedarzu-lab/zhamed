const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const dollars = (n: number) => usd.format(n || 0);
export const dollarsShort = (n: number) => usdCompact.format(n || 0);

/** Signed, for deltas where direction is the point. */
export const signed = (n: number) => (n > 0 ? `+${dollars(n)}` : dollars(n));

/** "2026-07-29" -> "Jul 29" (no timezone shifting). */
export function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "2026-07" -> "July 2026" */
export function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** "2026-07" → "Jul" */
export function shortMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

/** "1/2", "2/2" — fraction label when you know the total paychecks in the month. */
export const seqFrac = (seq: number, total: number) => `${seq}/${total}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

export const currentMonth = () => todayIso().slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Snap to the nearest cent. Every amount gets quantized the instant it's
 * entered, so sums and comparisons downstream never have to guard against
 * float drift themselves — there's nothing finer than a cent left to drift.
 */
export const roundCents = (n: number): number => Math.round(n * 100) / 100;

/** Parse a text field into a number without punishing "$1,200.50". */
export function toAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? roundCents(n) : 0;
}
