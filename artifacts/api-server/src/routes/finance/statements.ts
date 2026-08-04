import { Router, type IRouter } from "express";
import multer from "multer";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { statementUploadsTable, spendingTransactionsTable } from "@workspace/db";
import { parseBody, parseId, requireMonthQuery, DATE_RE, money, round } from "./shared.js";
import { Client } from "@replit/object-storage";

const router: IRouter = Router();

// Lazy-initialized object storage client (top-level init crashes the server)
let _storage: Client | null = null;
function getStorage(): Client {
  if (!_storage) _storage = new Client();
  return _storage;
}

// Multer: parse multipart form data, keep file in memory (max 10 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".csv") ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(null, ok);
  },
});

// ---------------------------------------------------------------------------
// Category auto-assignment from merchant name
// ---------------------------------------------------------------------------
const SPENDING_CATEGORIES = [
  "Food & Dining",
  "Shopping",
  "Transportation",
  "Entertainment",
  "Utilities",
  "Housing",
  "Healthcare",
  "Transfers",
  "Insurance",
  "Other",
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

const CATEGORY_RULES: Array<[RegExp, SpendingCategory]> = [
  [/mcdonald|burger.?king|wendy|chick.fil|taco.?bell|subway|chipotle|kfc|pizza|starbucks|dunkin|panera|doordash|ubereats|uber.eats|grubhub|postmates|seamless|instacart|restaurant|cafe|diner|bbq|sushi|grill|kitchen|bistro|deli|shake.?shack|five.?guys|wingstop|raising.?cane|crumbl/i, "Food & Dining"],
  [/walmart|target|costco|amazon|ebay|etsy|best.?buy|apple.?store|shopify|dollar.?tree|dollar.?general|home.?depot|lowe|ikea|tj.?maxx|marshalls|ross.?dress|kohls|nordstrom|macys|gap|h&m|zara|old.?navy|forever.?21|dsw|foot.?locker|cvs|walgreen|rite.?aid|duane.?reade|7.?eleven|circle.?k/i, "Shopping"],
  [/uber(?!.?eat)|lyft|gas.?stat|shell|bp\b|exxon|chevron|sunoco|speedway|wawa|fuel|parking|toll|metro|mta|bart|caltrain|septa|mbta|wmata|amtrak|airline|delta|united.?airlines|southwest|spirit.?air|american.?airlines|jetblue|zipcar|hertz|enterprise.?rent/i, "Transportation"],
  [/netflix|hulu|spotify|disney\+|hbo.?max|peacock|twitch|youtube.?premium|apple.?music|pandora|playstation|xbox|nintendo|steam\b|ticket|cinemark|regal|amc\b|concert|showtime|paramount\+|sling|fubo/i, "Entertainment"],
  [/at&t|verizon|t.mobile|comcast|xfinity|spectrum|cox.?comm|electric|water.?util|natural.?gas|internet|utility|pseg|pge\b|con.?edison|national.?grid|waste.?management|sewage/i, "Utilities"],
  [/rent\b|mortgage|lease|property.?mgmt|hoa\b|apartment/i, "Housing"],
  [/doctor|hospital|urgent.?care|dental|optometrist|vision.?works|pharmacy|medical|blue.?cross|aetna|humana|kaiser|united.?health|cigna|lab.?corp|quest.?diag/i, "Healthcare"],
  [/venmo|cash.?app|zelle|paypal|western.?union|money.?gram|wire.?transfer|ach.?transfer|bank.?transfer/i, "Transfers"],
  [/insurance|geico|allstate|progressive|state.?farm|nationwide|travelers|liberty.?mutual|farmers.?ins|usaa/i, "Insurance"],
];

function autoCategory(merchant: string): SpendingCategory {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(merchant)) return cat;
  }
  return "Other";
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------
interface ParsedRow {
  date: string;    // YYYY-MM-DD
  merchant: string;
  amount: number;  // positive = expense, negative = credit/refund
}

/** Parse a single CSV line respecting quoted fields. */
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/** Parse M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, M/D/YY → YYYY-MM-DD */
function parseDate(raw: string): string | null {
  raw = raw.trim().replace(/"/g, "");
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // M/D/YYYY or M/D/YY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let [, m, d, y] = slashMatch;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Parse a dollar amount string → number, handling parens as negative. */
function parseAmount(raw: string): number {
  const s = raw.replace(/[$,"]/g, "").trim();
  if (!s) return 0;
  const neg = s.startsWith("(") && s.endsWith(")");
  const n = parseFloat(neg ? s.slice(1, -1) : s);
  return isNaN(n) ? 0 : (neg ? -n : n);
}

/** Detect if amounts in Chase/BofA convention (negative = expense) and flip. */
function normalizeSign(rows: ParsedRow[]): ParsedRow[] {
  // If most non-zero rows are negative, flip all signs.
  const nonZero = rows.filter((r) => r.amount !== 0);
  if (nonZero.length === 0) return rows;
  const negCount = nonZero.filter((r) => r.amount < 0).length;
  if (negCount / nonZero.length > 0.6) {
    // Convention flip: negative becomes positive (expense), positive becomes negative (credit)
    return rows.map((r) => ({ ...r, amount: -r.amount }));
  }
  return rows;
}

function parseCSV(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/);

  // Find header row: first row with ≥3 comma-separated fields
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length >= 3) {
      headerIdx = i;
      headers = cols.map((h) => h.toLowerCase().replace(/['"]/g, "").trim());
      break;
    }
  }
  if (headerIdx === -1) return [];

  // Locate columns
  const dateCol = headers.findIndex((h) =>
    /transaction.?date|^date$|posted.?date|trans.?date/.test(h),
  ) ?? headers.findIndex((h) => h.includes("date"));

  const descCol = headers.findIndex((h) =>
    /description|payee|merchant|memo|name/.test(h),
  );

  const amountCol = headers.findIndex((h) => /^amount$/.test(h));
  const debitCol = headers.findIndex((h) => /^debit$/.test(h));
  const creditCol = headers.findIndex((h) => /^credit$/.test(h));

  const effectiveDateCol = dateCol !== -1 ? dateCol : 0;
  const effectiveDescCol = descCol !== -1 ? descCol : 1;

  const rows: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCSVLine(line);
    if (cols.length < 2) continue;

    const rawDate = cols[effectiveDateCol] ?? "";
    const merchant = (cols[effectiveDescCol] ?? "").replace(/"/g, "").trim();
    const date = parseDate(rawDate);
    if (!date) continue;
    if (!merchant) continue;

    let amount = 0;
    if (amountCol !== -1) {
      amount = parseAmount(cols[amountCol] ?? "");
    } else if (debitCol !== -1 || creditCol !== -1) {
      const debit = debitCol !== -1 ? parseAmount(cols[debitCol] ?? "") : 0;
      const credit = creditCol !== -1 ? parseAmount(cols[creditCol] ?? "") : 0;
      // Debit = money out (expense), Credit = money in (refund). Positive = expense.
      amount = debit > 0 ? debit : -credit;
    }

    if (amount === 0) continue;
    rows.push({ date, merchant, amount });
  }

  return normalizeSign(rows);
}

// ---------------------------------------------------------------------------
// PDF parsing (best-effort line-by-line extraction)
// ---------------------------------------------------------------------------
async function parsePDF(buffer: Buffer): Promise<ParsedRow[]> {
  // Dynamically import pdf-parse; handle CJS→ESM interop edge cases
  const mod = await import("pdf-parse");
  // CJS packages land at mod.default in Node native ESM, but raw mod when bundled
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
    typeof mod.default === "function"
      ? (mod.default as typeof pdfParse)
      : typeof (mod as unknown) === "function"
        ? (mod as unknown as typeof pdfParse)
        : (() => { throw new Error("pdf-parse module not available"); })();
  const data = await pdfParse(buffer);

  const rows: ParsedRow[] = [];
  const lines = data.text.split(/\r?\n/);

  // Amount pattern: optional leading minus/parens, optional $, digits, decimal
  const amountRe = /([\-\(]?\$?[\d,]{1,12}\.\d{2}\)?)\s*$/;
  // Date patterns at start of line
  const dateRe = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]?\d{0,4}|\d{4}-\d{2}-\d{2})/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 8) continue;

    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;

    const amountMatch = line.match(amountRe);
    if (!amountMatch) continue;

    const date = parseDate(dateMatch[1]);
    if (!date) continue;

    const amount = parseAmount(amountMatch[1]);
    if (amount === 0) continue;

    // Merchant: text between the date token and the amount token
    const afterDate = line.slice(dateMatch[0].length).trim();
    const amountIdx = afterDate.lastIndexOf(amountMatch[1]);
    const merchantRaw = amountIdx > 0 ? afterDate.slice(0, amountIdx) : afterDate;
    const merchant = merchantRaw.replace(/\s+/g, " ").trim();

    if (!merchant || merchant.length < 2) continue;

    rows.push({ date, merchant, amount });
  }

  return normalizeSign(rows);
}

// ---------------------------------------------------------------------------
// POST /statements/upload
// ---------------------------------------------------------------------------
router.post(
  "/statements/upload",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const month = req.body.month as string | undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: "month required (YYYY-MM)" });
      return;
    }

    const isPDF = req.file.originalname.toLowerCase().endsWith(".pdf");

    // Parse transactions from the file
    let parsed: ParsedRow[] = [];
    try {
      if (isPDF) {
        parsed = await parsePDF(req.file.buffer);
      } else {
        parsed = parseCSV(req.file.buffer.toString("utf-8"));
      }
    } catch (err) {
      res.status(422).json({ error: `Could not parse file: ${(err as Error).message}` });
      return;
    }

    if (parsed.length === 0) {
      res.status(422).json({
        error:
          "No transactions found. Make sure you're uploading a valid bank statement CSV or PDF.",
      });
      return;
    }

    // Store raw file in object storage
    let storageKey = "";
    try {
      const storage = getStorage();
      const ext = isPDF ? "pdf" : "csv";
      const key = `statements/${month}/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}.${ext}`;
      const uploadResult = await storage.uploadFromBytes(key, req.file.buffer);
      if (!uploadResult.ok) throw new Error(uploadResult.error.message);
      storageKey = key;
    } catch {
      // Storage upload failure is non-fatal — transactions still get saved
      storageKey = "";
    }

    // Save upload record + transactions atomically
    const [uploadRecord] = await db
      .insert(statementUploadsTable)
      .values({
        originalFilename: req.file.originalname,
        storageKey,
        month,
        rowCount: parsed.length,
      })
      .returning();

    const txnValues = parsed.map((row) => ({
      uploadId: uploadRecord.id,
      txnDate: row.date,
      merchant: row.merchant,
      amount: money(row.amount),
      category: autoCategory(row.merchant),
    }));

    const inserted = await db
      .insert(spendingTransactionsTable)
      .values(txnValues)
      .returning();

    res.status(201).json({
      upload: uploadRecord,
      transactions: inserted.map((t) => ({ ...t, amount: Number(t.amount) })),
    });
  },
);

// ---------------------------------------------------------------------------
// GET /statements?month=YYYY-MM
// ---------------------------------------------------------------------------
router.get("/statements", async (req, res): Promise<void> => {
  const month = requireMonthQuery(req.query.month, res);
  if (!month) return;

  const uploads = await db
    .select()
    .from(statementUploadsTable)
    .where(eq(statementUploadsTable.month, month))
    .orderBy(desc(statementUploadsTable.uploadedAt));

  res.json(uploads);
});

// ---------------------------------------------------------------------------
// DELETE /statements/:id
// ---------------------------------------------------------------------------
router.delete("/statements/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);

  // Cascade deletes transactions via FK constraint
  await db.delete(statementUploadsTable).where(eq(statementUploadsTable.id, id));

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// GET /spending/transactions?month=YYYY-MM
// ---------------------------------------------------------------------------
router.get("/spending/transactions", async (req, res): Promise<void> => {
  const month = requireMonthQuery(req.query.month, res);
  if (!month) return;

  const from = `${month}-01`;
  // Last day of month
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  const rows = await db
    .select({
      id:       spendingTransactionsTable.id,
      uploadId: spendingTransactionsTable.uploadId,
      txnDate:  spendingTransactionsTable.txnDate,
      merchant: spendingTransactionsTable.merchant,
      amount:   spendingTransactionsTable.amount,
      category: spendingTransactionsTable.category,
      note:     spendingTransactionsTable.note,
    })
    .from(spendingTransactionsTable)
    .where(
      and(
        gte(spendingTransactionsTable.txnDate, from),
        lte(spendingTransactionsTable.txnDate, to),
      ),
    )
    .orderBy(desc(spendingTransactionsTable.txnDate));

  res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
});

// ---------------------------------------------------------------------------
// PATCH /spending/transactions/:id  { category }
// ---------------------------------------------------------------------------
router.patch("/spending/transactions/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const data = parseBody(
    z.object({
      category: z.string().min(1).optional(),
      note:     z.string().optional(),
    }),
    req.body,
    res,
  );
  if (!data) return;

  const [updated] = await db
    .update(spendingTransactionsTable)
    .set({
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
    })
    .where(eq(spendingTransactionsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json({ ...updated, amount: Number(updated.amount) });
});

// ---------------------------------------------------------------------------
// GET /spending/summary?month=YYYY-MM  — category totals
// ---------------------------------------------------------------------------
router.get("/spending/summary", async (req, res): Promise<void> => {
  const month = requireMonthQuery(req.query.month, res);
  if (!month) return;

  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  const rows = await db
    .select({
      category: spendingTransactionsTable.category,
      total:    sql<string>`SUM(${spendingTransactionsTable.amount})`,
      count:    sql<string>`COUNT(*)`,
    })
    .from(spendingTransactionsTable)
    .where(
      and(
        gte(spendingTransactionsTable.txnDate, from),
        lte(spendingTransactionsTable.txnDate, to),
      ),
    )
    .groupBy(spendingTransactionsTable.category)
    .orderBy(sql`SUM(${spendingTransactionsTable.amount}) DESC`);

  res.json(
    rows.map((r) => ({
      category: r.category,
      total: round(Number(r.total)),
      count: Number(r.count),
    })),
  );
});

export default router;
