import { Router, type IRouter } from "express";
import multer from "multer";
// Import from lib directly to avoid pdf-parse v1's top-level test-file read
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, statementsTable, transactionsTable } from "@workspace/db";
import { parseBody, parseId } from "./shared.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router: IRouter = Router();

/* ── category auto-assignment ───────────────────────────────────────── */

const CATEGORY_RULES: [RegExp, string][] = [
  [/mcdonald|burger.king|wendy.?s|taco.bell|chipotle|subway|pizza|kfc|domino|popeyes|chick.fil|five.guys|sonic|dairy.queen|jack.in.the.box/i, "Fast Food"],
  [/uber.eats|doordash|grubhub|instacart|postmates|seamless/i, "Food Delivery"],
  [/restaurant|cafe|coffee|starbucks|dunkin|donut|bakery|diner|grill|kitchen|eatery|sushi|bistro|tavern/i, "Dining"],
  [/kroger|safeway|whole.foods|trader.joe|aldi|publix|wegmans|costco|sam.s.club|sprouts|food.lion|heb |giant.food|fresh.market/i, "Groceries"],
  [/shell|exxon|bp |chevron|citgo|sunoco|mobil|speedway|circle.k|pilot.*flying|flying.j|quik.trip|wawa|kwiktrip/i, "Gas"],
  [/uber(?!.?eats)|lyft|taxi|transit|mta|bart|metro|bus |amtrak|parking|toll|ezpass/i, "Transport"],
  [/amazon|ebay|etsy|walmart|target|best.buy|apple.com\/bill|google.*store|newegg|chewy|wayfair|overstock/i, "Shopping"],
  [/netflix|spotify|hulu|disney|apple.*music|youtube.*premium|twitch|xbox|playstation|steam|peacock|paramount|max |hbo/i, "Entertainment"],
  [/electric|power.company|gas.co|water.bill|internet|comcast|att |verizon|t.mobile|spectrum|utilities|xfinity|frontier/i, "Bills & Utilities"],
  [/cvs|walgreen|rite.aid|pharmacy|rx|doctor|dental|hospital|medical|health|insurance|optum|aetna|cigna|humana/i, "Health"],
  [/gym|planet.fitness|equinox|24.hour|anytime.fitness|la.fitness|crossfit|peloton/i, "Fitness"],
  [/transfer|zelle|venmo|paypal|cash.app|cashapp|direct.dep|payroll|ach.deposit|wire/i, "Transfer"],
  [/rent|mortgage|hoa |lease/i, "Housing"],
];

function assignCategory(description: string): string {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(description)) return cat;
  }
  return "Other";
}

/* ── CSV parser ─────────────────────────────────────────────────────── */

function parseCSVRow(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

interface ParsedTx { date: string; description: string; amountCents: number }

function normalizeDate(raw: string): string | null {
  raw = raw.trim().replace(/"/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? (parseInt(y) < 50 ? `20${y}` : `19${y}`) : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) {
    const [, m, d, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseCSV(text: string): ParsedTx[] {
  const lines = text.trim().split(/\r?\n/);

  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = parseCSVRow(lines[i]).map((s) => s.toLowerCase().replace(/"/g, ""));
    if (
      cols.some((c) => c.includes("date")) &&
      cols.some((c) => c.includes("amount") || c.includes("debit") || c.includes("credit") || c.includes("transaction"))
    ) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const find = (...terms: string[]) =>
    headers.findIndex((h) => terms.some((t) => h.includes(t)));

  const transDateIdx = find("transaction date", "trans date", "trans. date");
  const postDateIdx  = find("posting date", "post date", "posted date");
  const dateIdx      = transDateIdx >= 0 ? transDateIdx : postDateIdx >= 0 ? postDateIdx : find("date");
  const descIdx      = find("description", "payee", "merchant", "memo", "details");
  const amountIdx    = find("amount");
  const debitIdx     = find("debit");
  const creditIdx    = find("credit");

  if (dateIdx < 0 || descIdx < 0) return [];

  const txns: ParsedTx[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const cols = parseCSVRow(raw);
    if (cols.length <= Math.max(dateIdx, descIdx)) continue;

    const date = normalizeDate(cols[dateIdx] ?? "");
    const description = cols[descIdx]?.replace(/"/g, "").trim();
    if (!date || !description) continue;

    let amountCents = 0;
    if (amountIdx >= 0 && cols[amountIdx] != null) {
      const n = parseFloat(cols[amountIdx].replace(/[$",\s]/g, ""));
      amountCents = isNaN(n) ? 0 : Math.round(n * 100);
    } else if (debitIdx >= 0 || creditIdx >= 0) {
      const debit  = debitIdx  >= 0 ? parseFloat(cols[debitIdx ]?.replace(/[$",\s]/g, "") ?? "0") || 0 : 0;
      const credit = creditIdx >= 0 ? parseFloat(cols[creditIdx]?.replace(/[$",\s]/g, "") ?? "0") || 0 : 0;
      amountCents = Math.round((credit - debit) * 100); // positive = credit
    }

    txns.push({ date, description, amountCents });
  }
  return txns;
}

/* ── PDF parser ─────────────────────────────────────────────────────── */

function parsePDFText(text: string): ParsedTx[] {
  const txns: ParsedTx[] = [];
  const lines = text.split(/\n/);

  // Match: date (description) amount — handles common statement layouts
  const re = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})[\s\-]*$/;

  for (const line of lines) {
    const m = line.trim().match(re);
    if (!m) continue;
    const [, rawDate, rawDesc, rawAmt] = m;
    const date = normalizeDate(rawDate);
    if (!date) continue;
    const amt = parseFloat(rawAmt.replace(/[$,]/g, ""));
    if (isNaN(amt)) continue;
    txns.push({ date, description: rawDesc.trim(), amountCents: Math.round(amt * 100) });
  }
  return txns;
}

/* ── routes ─────────────────────────────────────────────────────────── */

// POST /finance/statements/upload
router.post(
  "/statements/upload",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    let txns: ParsedTx[] = [];
    const mime = file.mimetype.toLowerCase();
    const name = file.originalname.toLowerCase();

    try {
      if (mime === "application/pdf" || name.endsWith(".pdf")) {
        const parsed = await pdfParse(file.buffer);
        txns = parsePDFText(parsed.text);
      } else {
        // CSV / text
        const text = file.buffer.toString("utf-8");
        txns = parseCSV(text);
      }
    } catch {
      res.status(422).json({ error: "Could not parse this file. Try exporting as CSV." });
      return;
    }

    if (txns.length === 0) {
      res.status(422).json({ error: "No transactions found. Make sure the file is a bank CSV or statement PDF." });
      return;
    }

    const [stmt] = await db
      .insert(statementsTable)
      .values({ filename: file.originalname, txCount: txns.length })
      .returning();

    const rows = txns.map((t) => ({
      statementId: stmt.id,
      date:        t.date,
      description: t.description,
      amountCents: t.amountCents,
      category:    assignCategory(t.description),
    }));

    await db.insert(transactionsTable).values(rows);

    res.status(201).json({ ...stmt, txCount: txns.length });
  },
);

// GET /finance/statements
router.get("/statements", async (_req, res): Promise<void> => {
  const rows = await db.select().from(statementsTable).orderBy(desc(statementsTable.uploadedAt));
  res.json(rows);
});

// DELETE /finance/statements/:id
router.delete("/statements/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(statementsTable).where(eq(statementsTable.id, id));
  res.status(204).end();
});

// GET /finance/transactions?statementId=&month=
router.get("/transactions", async (req, res): Promise<void> => {
  let query = db.select().from(transactionsTable).$dynamic();

  const stmtId = parseInt(String(req.query.statementId ?? ""), 10);
  if (!isNaN(stmtId) && stmtId > 0) {
    query = query.where(eq(transactionsTable.statementId, stmtId));
  }

  const rows = await query.orderBy(desc(transactionsTable.date));
  res.json(rows);
});

// PATCH /finance/transactions/:id
router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const data = parseBody(
    z.object({ category: z.string().min(1).optional(), notes: z.string().optional() }),
    req.body,
    res,
  );
  if (!data) return;

  const [row] = await db
    .update(transactionsTable)
    .set(data)
    .where(eq(transactionsTable.id, id))
    .returning();
  res.json(row);
});

export default router;
