/**
 * Integration tests for bank statement upload and spending transaction endpoints.
 *
 * Tests cover CSV parsing (Chase and generic formats), transaction storage,
 * category auto-assignment, category patching, and the summary aggregation.
 * Each test cleans up its own data; tests run serially (singleFork).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { statementUploadsTable, spendingTransactionsTable } from "@workspace/db";
import app from "../../../app.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** A minimal Chase-format CSV: negative amounts = expenses. */
const CHASE_CSV = [
  "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
  "07/03/2099,07/04/2099,STARBUCKS #12345,Food & Drink,Sale,-4.50,",
  "07/05/2099,07/06/2099,AMAZON.COM,Shopping,Sale,-89.99,",
  "07/10/2099,07/11/2099,UBER,Travel,Sale,-22.00,",
  "07/12/2099,07/13/2099,PAYMENT THANK YOU,Payment,Payment,250.00,",
].join("\n");

/** Generic CSV with positive amounts = expenses. */
const GENERIC_CSV = [
  "Date,Description,Amount",
  "2099-07-01,WALMART SUPERCENTER,45.20",
  "2099-07-03,NETFLIX.COM,15.99",
  "2099-07-07,SHELL GAS STATION,60.00",
].join("\n");

/** A minimal synthetic PDF text that matches the line-by-line parser. */
const SYNTHETIC_PDF_TEXT = [
  "Bank Statement — August 2099",
  "",
  "08/01/2099 DOORDASH ORDER                     32.50",
  "08/05/2099 TARGET STORE #0012                 115.75",
  "08/10/2099 SPOTIFY PREMIUM                    9.99",
].join("\n");

// Tracked upload IDs for cleanup
const uploadIds: number[] = [];

afterEach(async () => {
  for (const id of uploadIds.splice(0)) {
    await db.delete(statementUploadsTable).where(eq(statementUploadsTable.id, id));
  }
});

// ─── POST /api/finance/statements/upload (CSV) ────────────────────────────────

describe("POST /api/finance/statements/upload — CSV", () => {
  it("parses a Chase CSV, flips sign, and returns transactions", async () => {
    const buf = Buffer.from(CHASE_CSV, "utf-8");

    const res = await request(app)
      .post("/api/finance/statements/upload")
      .field("month", "2099-07")
      .attach("file", buf, { filename: "chase.csv", contentType: "text/csv" });

    expect(res.status).toBe(201);
    const { upload, transactions } = res.body as {
      upload: { id: number; rowCount: number };
      transactions: Array<{ txnDate: string; merchant: string; amount: number; category: string }>;
    };

    uploadIds.push(upload.id);

    // Chase has 4 data rows; all should be stored
    expect(upload.rowCount).toBe(4);
    expect(transactions).toHaveLength(4);

    // Expenses should be stored as positive after sign flip
    const starbucks = transactions.find((t) => /starbucks/i.test(t.merchant));
    expect(starbucks).toBeDefined();
    expect(starbucks!.amount).toBeGreaterThan(0);
    expect(starbucks!.txnDate).toBe("2099-07-03");

    // Auto-category check
    expect(starbucks!.category).toBe("Food & Dining");
  });

  it("parses a generic CSV with positive amounts", async () => {
    const buf = Buffer.from(GENERIC_CSV, "utf-8");

    const res = await request(app)
      .post("/api/finance/statements/upload")
      .field("month", "2099-07")
      .attach("file", buf, { filename: "generic.csv", contentType: "text/csv" });

    expect(res.status).toBe(201);
    const { upload, transactions } = res.body as {
      upload: { id: number; rowCount: number };
      transactions: Array<{ merchant: string; amount: number; category: string }>;
    };
    uploadIds.push(upload.id);

    expect(upload.rowCount).toBe(3);
    expect(transactions).toHaveLength(3);

    const netflix = transactions.find((t) => /netflix/i.test(t.merchant));
    expect(netflix).toBeDefined();
    expect(netflix!.amount).toBeGreaterThan(0);
    expect(netflix!.category).toBe("Entertainment");

    const shell = transactions.find((t) => /shell/i.test(t.merchant));
    expect(shell!.category).toBe("Transportation");
  });

  it("rejects a missing month param", async () => {
    const buf = Buffer.from(GENERIC_CSV, "utf-8");
    const res = await request(app)
      .post("/api/finance/statements/upload")
      .attach("file", buf, { filename: "generic.csv", contentType: "text/csv" });

    expect(res.status).toBe(400);
  });

  it("rejects a request with no file", async () => {
    const res = await request(app)
      .post("/api/finance/statements/upload")
      .field("month", "2099-07");

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/finance/statements/upload (PDF text extraction) ────────────────

describe("POST /api/finance/statements/upload — PDF (mocked text)", () => {
  it("rejects an empty/corrupt PDF with a 422 rather than a 500", async () => {
    const emptyPDF = Buffer.from("%PDF-1.4\n%%EOF\n");
    const res = await request(app)
      .post("/api/finance/statements/upload")
      .field("month", "2099-08")
      .attach("file", emptyPDF, { filename: "empty.pdf", contentType: "application/pdf" });

    // Must not crash the server — 422 (no transactions found) or 422 (parse
    // error) are both acceptable; 500 is not.
    expect(res.status).toBe(422);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});

// ─── GET /api/finance/statements ─────────────────────────────────────────────

describe("GET /api/finance/statements", () => {
  let uploadId: number;

  beforeEach(async () => {
    const [row] = await db
      .insert(statementUploadsTable)
      .values({ originalFilename: "test.csv", month: "2099-07", rowCount: 2 })
      .returning();
    uploadId = row!.id;
    uploadIds.push(uploadId);
  });

  it("lists uploads for a month", async () => {
    const res = await request(app).get("/api/finance/statements?month=2099-07");
    expect(res.status).toBe(200);
    const found = (res.body as Array<{ id: number }>).find((u) => u.id === uploadId);
    expect(found).toBeDefined();
  });

  it("returns 400 when month param is missing", async () => {
    const res = await request(app).get("/api/finance/statements");
    expect(res.status).toBe(400);
  });

  it("returns empty array for a month with no uploads", async () => {
    const res = await request(app).get("/api/finance/statements?month=2001-01");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── DELETE /api/finance/statements/:id ──────────────────────────────────────

describe("DELETE /api/finance/statements/:id", () => {
  it("deletes the upload and cascades to its transactions", async () => {
    const [upload] = await db
      .insert(statementUploadsTable)
      .values({ originalFilename: "del.csv", month: "2099-06", rowCount: 1 })
      .returning();
    const uploadId = upload!.id;
    await db.insert(spendingTransactionsTable).values({
      uploadId,
      txnDate: "2099-06-01",
      merchant: "TEST MERCHANT",
      amount: "10.00",
      category: "Other",
    });

    const res = await request(app).delete(`/api/finance/statements/${uploadId}`);
    expect(res.status).toBe(204);

    // Upload and its transactions should be gone
    const remaining = await db
      .select()
      .from(spendingTransactionsTable)
      .where(eq(spendingTransactionsTable.uploadId, uploadId));
    expect(remaining).toHaveLength(0);
  });
});

// ─── GET /api/finance/spending/transactions ───────────────────────────────────

describe("GET /api/finance/spending/transactions", () => {
  let uploadId: number;

  beforeEach(async () => {
    const [row] = await db
      .insert(statementUploadsTable)
      .values({ originalFilename: "txn.csv", month: "2099-05", rowCount: 2 })
      .returning();
    uploadId = row!.id;
    uploadIds.push(uploadId);

    await db.insert(spendingTransactionsTable).values([
      { uploadId, txnDate: "2099-05-10", merchant: "AMAZON", amount: "49.99", category: "Shopping" },
      { uploadId, txnDate: "2099-05-20", merchant: "MCDONALDS", amount: "8.75", category: "Food & Dining" },
    ]);
  });

  it("returns transactions for the requested month", async () => {
    const res = await request(app).get("/api/finance/spending/transactions?month=2099-05");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].txnDate).toBeDefined();
  });

  it("does not return transactions outside the month", async () => {
    const res = await request(app).get("/api/finance/spending/transactions?month=2099-06");
    expect(res.status).toBe(200);
    // Our test transactions are in 2099-05 only
    const ours = (res.body as Array<{ uploadId: number }>).filter(
      (t) => t.uploadId === uploadId,
    );
    expect(ours).toHaveLength(0);
  });
});

// ─── PATCH /api/finance/spending/transactions/:id ─────────────────────────────

describe("PATCH /api/finance/spending/transactions/:id", () => {
  let txnId: number;
  let uploadId: number;

  beforeEach(async () => {
    const [row] = await db
      .insert(statementUploadsTable)
      .values({ originalFilename: "patch.csv", month: "2099-04", rowCount: 1 })
      .returning();
    uploadId = row!.id;
    uploadIds.push(uploadId);

    const [txn] = await db
      .insert(spendingTransactionsTable)
      .values({ uploadId, txnDate: "2099-04-01", merchant: "SOME STORE", amount: "25.00", category: "Other" })
      .returning();
    txnId = txn!.id;
  });

  it("updates the category of a transaction", async () => {
    const res = await request(app)
      .patch(`/api/finance/spending/transactions/${txnId}`)
      .send({ category: "Shopping" });

    expect(res.status).toBe(200);
    expect(res.body.category).toBe("Shopping");
    expect(res.body.id).toBe(txnId);
  });

  it("returns 404 for an unknown transaction id", async () => {
    const res = await request(app)
      .patch("/api/finance/spending/transactions/99999999")
      .send({ category: "Shopping" });

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/finance/spending/summary ───────────────────────────────────────

describe("GET /api/finance/spending/summary", () => {
  let uploadId: number;

  beforeEach(async () => {
    const [row] = await db
      .insert(statementUploadsTable)
      .values({ originalFilename: "sum.csv", month: "2099-03", rowCount: 3 })
      .returning();
    uploadId = row!.id;
    uploadIds.push(uploadId);

    await db.insert(spendingTransactionsTable).values([
      { uploadId, txnDate: "2099-03-01", merchant: "MCDONALDS", amount: "12.00", category: "Food & Dining" },
      { uploadId, txnDate: "2099-03-05", merchant: "STARBUCKS", amount: "5.50", category: "Food & Dining" },
      { uploadId, txnDate: "2099-03-10", merchant: "AMAZON", amount: "99.00", category: "Shopping" },
    ]);
  });

  it("aggregates spend by category", async () => {
    const res = await request(app).get("/api/finance/spending/summary?month=2099-03");
    expect(res.status).toBe(200);

    const foodRow = (res.body as Array<{ category: string; total: number; count: number }>).find(
      (r) => r.category === "Food & Dining",
    );
    expect(foodRow).toBeDefined();
    expect(foodRow!.total).toBeCloseTo(17.5);
    expect(foodRow!.count).toBe(2);

    const shoppingRow = (res.body as Array<{ category: string; total: number }>).find(
      (r) => r.category === "Shopping",
    );
    expect(shoppingRow!.total).toBeCloseTo(99.0);
  });
});
