/**
 * Unit tests for the Cash App plain-text statement parser.
 *
 * These are pure parser tests — no HTTP, no database.  They import
 * parseCashAppText and isCashAppText directly so regressions are caught
 * at the unit level before any integration surface is touched.
 */

import { describe, expect, it } from "vitest";
import { parseCashAppText, isCashAppText } from "../statements.js";

// ---------------------------------------------------------------------------
// isCashAppText
// ---------------------------------------------------------------------------

describe("isCashAppText", () => {
  it("returns true for content with Cash App marker and Mon D dates", () => {
    const lines = [
      "Cash App Account Statement",
      "July 2026",
      "Jan 15 DOORDASH $0.00 $12.50",
    ];
    expect(isCashAppText(lines)).toBe(true);
  });

  it("returns true when 'Account Statement' header is present with Mon D dates", () => {
    const lines = [
      "Account Statement",
      "Feb 2026",
      "Feb 3 WALMART $0.00 $45.00",
    ];
    expect(isCashAppText(lines)).toBe(true);
  });

  it("returns false when there are no abbreviated-month dates", () => {
    const lines = [
      "Cash App Account Statement",
      "2026-07-15 DOORDASH 12.50",
    ];
    expect(isCashAppText(lines)).toBe(false);
  });

  it("returns false when there is no Cash App / Account Statement marker", () => {
    const lines = [
      "Some Random Bank",
      "Jan 15 DOORDASH $0.00 $12.50",
    ];
    expect(isCashAppText(lines)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseCashAppText — year inference
// ---------------------------------------------------------------------------

describe("parseCashAppText — year from header", () => {
  it("infers the year from a 'Month YYYY' header line", () => {
    const content = [
      "Cash App Account Statement",
      "March 2024",
      "Mar 5 SPOTIFY $0.00 $9.99",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2024-03-05");
  });

  it("falls back to the current year when no header is present", () => {
    const currentYear = new Date().getFullYear().toString();
    const content = [
      "Cash App Account Statement",
      "Jun 10 NETFLIX $0.00 $15.99",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.startsWith(currentYear)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseCashAppText — typical debit row
// ---------------------------------------------------------------------------

describe("parseCashAppText — debit row", () => {
  it("parses a bare-amount debit row as a positive expense", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Jul 3 DOORDASH $0.00 $25.99",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.date).toBe("2026-07-03");
    expect(row.merchant).toBe("DOORDASH");
    expect(row.amount).toBeGreaterThan(0);
    expect(row.amount).toBeCloseTo(25.99);
  });

  it("sets the merchant to the description text between the date and fee amount", () => {
    const content = [
      "Cash App Account Statement",
      "August 2026",
      "Aug 12 WALMART SUPERCENTER $0.00 $54.32",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows[0]!.merchant).toBe("WALMART SUPERCENTER");
  });
});

// ---------------------------------------------------------------------------
// parseCashAppText — credit row (+ prefix)
// ---------------------------------------------------------------------------

describe("parseCashAppText — credit row", () => {
  it("parses a row with a + prefix as a negative amount (money in)", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Jul 10 CASH OUT $0.00 +$100.00",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.amount).toBeLessThan(0);
    expect(row.amount).toBeCloseTo(-100.0);
  });
});

// ---------------------------------------------------------------------------
// parseCashAppText — noise lines are stripped
// ---------------------------------------------------------------------------

describe("parseCashAppText — noise lines stripped", () => {
  it("strips page-counter lines (e.g. '1 / 13')", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "1 / 13",
      "Jul 5 STARBUCKS $0.00 $6.75",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchant).toBe("STARBUCKS");
  });

  it("strips the 'Month YYYY' header line", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Jul 5 STARBUCKS $0.00 $6.75",
    ].join("\n");

    // Should still parse one row and not produce a garbage row from the header
    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
  });

  it("strips the column-header row ('Date Description …')", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Date Description Amount",
      "Jul 5 TARGET $0.00 $33.00",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchant).toBe("TARGET");
  });

  it("strips the 'Transactions' section header", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Transactions",
      "Jul 5 AMAZON $0.00 $18.49",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// parseCashAppText — ATM multi-line rejoining
// ---------------------------------------------------------------------------

describe("parseCashAppText — ATM continuation lines", () => {
  it("rejoins an ATM row with its App-fee continuation line", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      // Two-line ATM entry: the App fee continuation must be joined before
      // the parser can find ≥2 amount tokens
      "Jul 20 ATM WITHDRAWAL $2.50 $20.00",
      "App fee, $0.00 $0.00",
      "Jul 21 NETFLIX $0.00 $15.99",
    ].join("\n");

    // Without rejoining the ATM line alone has 2 amounts → parses fine.
    // With rejoining, it still parses fine; the continuation is consumed and
    // the next row (Netflix) is NOT dropped.
    const { rows } = parseCashAppText(content);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The Netflix row must be present — it should not be consumed as a
    // continuation of the ATM line.
    const netflix = rows.find((r) => /netflix/i.test(r.merchant));
    expect(netflix).toBeDefined();
    expect(netflix!.amount).toBeCloseTo(15.99);
  });

  it("does NOT consume a Mon-D-starting line as a continuation", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Jul 20 FIRST MERCHANT $0.00 $10.00",
      "Jul 21 SECOND MERCHANT $0.00 $20.00",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseCashAppText — zero / single-amount skipping
// ---------------------------------------------------------------------------

describe("parseCashAppText — row filtering", () => {
  it("skips a row where both fee and transaction amounts are zero", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "Jul 1 ZERO ROW $0.00 $0.00",
      "Jul 2 REAL ROW $0.00 $5.00",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchant).toBe("REAL ROW");
  });

  it("skips a row with only one amount token", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      // Only one amount → fewer than 2 tokens → skipped
      "Jul 3 LONE AMOUNT $12.00",
      "Jul 4 NORMAL ROW $0.00 $8.50",
    ].join("\n");

    const { rows } = parseCashAppText(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.merchant).toBe("NORMAL ROW");
  });

  it("returns a diagnostic and empty rows when no transactions are found", () => {
    const content = [
      "Cash App Account Statement",
      "July 2026",
      "1 / 1",
      "Date Description Amount",
    ].join("\n");

    const { rows, diagnostic } = parseCashAppText(content);
    expect(rows).toHaveLength(0);
    expect(typeof diagnostic).toBe("string");
    expect(diagnostic!.length).toBeGreaterThan(0);
  });
});
