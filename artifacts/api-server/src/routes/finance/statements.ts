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
    const name = file.originalname.toLowerCase();
    const ok =
      file.mimetype === "text/csv" ||
      file.mimetype === "text/tab-separated-values" ||
      file.mimetype === "application/pdf" ||
      // Some browsers send generic MIME for TSV/TXT exports
      file.mimetype === "text/plain" ||
      name.endsWith(".csv") ||
      name.endsWith(".tsv") ||
      name.endsWith(".txt") ||
      name.endsWith(".pdf");
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

/** Parse a single delimited line respecting quoted fields. */
function splitDelimitedLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (!inQ && line.startsWith(delim, i)) {
      result.push(cur.trim());
      cur = "";
      i += delim.length - 1;
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

interface ParseResult {
  rows: ParsedRow[];
  diagnostic?: string; // human-readable hint when rows is empty
}

/** Detect whether content is tab-separated (TSV) or comma-separated (CSV). */
function detectDelimiter(lines: string[]): string {
  let tabCount = 0;
  let commaCount = 0;
  const sample = lines.filter((l) => l.trim()).slice(0, 5);
  for (const l of sample) {
    tabCount += (l.match(/\t/g) ?? []).length;
    commaCount += (l.match(/,/g) ?? []).length;
  }
  return tabCount > commaCount ? "\t" : ",";
}

function parseCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const delim = detectDelimiter(lines);

  // Find header row: first row with ≥3 delimited fields within the first 15 lines
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const cols = splitDelimitedLine(lines[i], delim);
    if (cols.length >= 3) {
      headerIdx = i;
      headers = cols.map((h) => h.toLowerCase().replace(/['"]/g, "").trim());
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      rows: [],
      diagnostic:
        "Could not find a header row with at least 3 columns in the first 15 lines. " +
        `The file appears to be ${delim === "\t" ? "tab" : "comma"}-separated — ` +
        "make sure you're exporting the full CSV/TSV from your bank.",
    };
  }

  // ---- Date column ----
  // Try specific patterns first; fall back to any column containing "date".
  let dateCol = headers.findIndex((h) =>
    /transaction.?date|^date$|posted.?date|trans.?date|posting.?date|value.?date|process.?date|settlement.?date|activity.?date/.test(h),
  );
  if (dateCol === -1) dateCol = headers.findIndex((h) => h.includes("date"));

  // ---- Description column ----
  const descCol = headers.findIndex((h) =>
    /description|payee|merchant|memo|^name$|details|narrative|original.?description|transaction(?!.*date|.*amount)/.test(h),
  );

  // ---- Amount columns ----
  // Single-column formats (Chase, Discover, BofA): "Amount", "Transaction Amount", "Charge"
  const amountCol = headers.findIndex((h) =>
    /^amount$|transaction.?amount|charge[s]?$/.test(h),
  );
  // Two-column debit/credit formats (Capital One, Citi, Wells Fargo)
  const debitCol = headers.findIndex((h) =>
    /^debit[s]?$|debit.?amount|withdrawal[s]?/.test(h),
  );
  const creditCol = headers.findIndex((h) =>
    /^credit[s]?$|credit.?amount|deposit[s]?/.test(h),
  );

  const effectiveDateCol = dateCol !== -1 ? dateCol : 0;
  const effectiveDescCol = descCol !== -1 ? descCol : 1;

  const hasAmountCol = amountCol !== -1 || debitCol !== -1 || creditCol !== -1;

  const rows: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitDelimitedLine(line, delim);
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

  if (rows.length === 0) {
    const foundCols = headers.filter(Boolean).join(", ");
    const missing: string[] = [];
    if (dateCol === -1) missing.push("date");
    if (descCol === -1) missing.push("description/merchant");
    if (!hasAmountCol) missing.push("amount (or debit/credit/withdrawal/deposit)");

    const hint = missing.length > 0
      ? `Missing recognizable column(s): ${missing.join(", ")}. ` +
        `Found columns: ${foundCols}.`
      : `Columns found (${foundCols}) but no rows had a parseable date and non-zero amount. ` +
        "Check that the file contains actual transactions.";

    return { rows: [], diagnostic: hint };
  }

  return { rows: normalizeSign(rows) };
}

// ---------------------------------------------------------------------------
// PDF parsing (best-effort line-by-line extraction with two-pass fallback)
// ---------------------------------------------------------------------------

/** Try to extract ParsedRows from an array of text lines (single-pass). */
function extractPDFRows(lines: string[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
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

  return rows;
}

async function parsePDF(buffer: Buffer): Promise<ParseResult> {
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

  const lines = data.text.split(/\r?\n/);

  // Pass 1: single-line match
  let rows = extractPDFRows(lines);

  // Pass 2: if too few results, try merging consecutive short lines (handles
  // PDFs where descriptions wrap onto the next line or a running balance
  // appears on its own line after the transaction line).
  if (rows.length < 3) {
    const merged: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cur = lines[i].trim();
      const next = (lines[i + 1] ?? "").trim();
      // If the current line ends with a date-only pattern and no amount, try
      // appending the next line to it.
      if (cur && next) {
        merged.push(`${cur} ${next}`);
        i++; // consume the next line so we don't double-count it
      } else if (cur) {
        merged.push(cur);
      }
    }
    const mergedRows = extractPDFRows(merged);
    if (mergedRows.length > rows.length) rows = mergedRows;
  }

  if (rows.length === 0) {
    return {
      rows: [],
      diagnostic:
        "Could not extract transaction lines from the PDF. " +
        "Bank PDFs often use complex layouts that don't parse well. " +
        "Try exporting or downloading as CSV from your bank's website instead.",
    };
  }

  return { rows: normalizeSign(rows) };
}

// ---------------------------------------------------------------------------
// Cash App plain-text statement parser
// ---------------------------------------------------------------------------

const MONTH_ABBR: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Detect Cash App plain-text format by looking for abbreviated-month dates and header markers. */
export function isCashAppText(lines: string[]): boolean {
  const sample = lines.slice(0, 40).join("\n");
  const hasCashAppMarker =
    /cash\s*app/i.test(sample) ||
    /account\s+statement/i.test(sample);
  const monDRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i;
  const hasMonDDates = lines.some((l) => monDRe.test(l));
  return hasCashAppMarker && hasMonDDates;
}

/** Parse a Cash App account statement (copied from PDF) into ParsedRow[]. */
export function parseCashAppText(content: string): ParseResult {
  const rawLines = content.split(/\r?\n/);

  // Infer statement year from a "Month YYYY" header line (e.g. "July 2026")
  let statementYear = new Date().getFullYear().toString();
  for (const line of rawLines) {
    const ym = line.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    );
    if (ym) { statementYear = ym[2]; break; }
  }

  // Noise patterns to discard entirely
  const noisePatterns: RegExp[] = [
    /^\d+\s*\/\s*\d+$/,                                   // page counter "1 / 13"
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i, // "July 2026"
    /^Account\s+Statement$/i,
    /^Transactions$/i,
    /^Date\s+Description/i,                               // column header row
  ];

  // Trim to content before the footer disclaimer
  const footerIdx = rawLines.findIndex((l) =>
    /all\s+transactions\s+shown\s+in/i.test(l),
  );
  const trimmed = footerIdx === -1 ? rawLines : rawLines.slice(0, footerIdx);

  // Strip noise lines, keep non-empty content
  const cleanLines = trimmed
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !noisePatterns.some((re) => re.test(l)));

  // Rejoin ATM / continuation lines.
  // A continuation line does NOT start with a Mon D date and looks like a
  // fee note (e.g. "App fee, $1.50" / "operator fee, $2.00").
  const monDStartRe = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i;
  const continuationRe = /^(App\s+fee|operator\s+fee|cash\s+app\s+fee)/i;

  const joinedLines: string[] = [];
  for (let i = 0; i < cleanLines.length; i++) {
    const cur = cleanLines[i];
    const next = cleanLines[i + 1] ?? "";
    if (next && !monDStartRe.test(next) && continuationRe.test(next)) {
      joinedLines.push(`${cur} ${next}`);
      i++; // consume continuation
    } else {
      joinedLines.push(cur);
    }
  }

  // Amount regex: optional leading +/-, optional whitespace, then $digits.cents
  const allAmountsRe = /([+-])?\s*\$([\d,]+\.\d{2})/g;

  const rows: ParsedRow[] = [];

  for (const line of joinedLines) {
    // Must start with Mon D date
    const dateMatch = line.match(
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i,
    );
    if (!dateMatch) continue;

    const monthKey = dateMatch[1].toLowerCase().slice(0, 3);
    const monthNum = MONTH_ABBR[monthKey];
    if (!monthNum) continue;
    const dayNum = dateMatch[2].padStart(2, "0");
    const date = `${statementYear}-${monthNum}-${dayNum}`;

    const rest = line.slice(dateMatch[0].length).trim();

    // Collect all amount tokens from the rest of the line
    const amounts: Array<{ value: number; index: number; raw: string }> = [];
    let m: RegExpExecArray | null;
    allAmountsRe.lastIndex = 0;
    while ((m = allAmountsRe.exec(rest)) !== null) {
      const sign = m[1] ?? "";
      const n = parseFloat(m[2].replace(/,/g, ""));
      if (!isNaN(n)) {
        // + prefix = credit (money in) → negative in our convention (positive = expense)
        const value = sign === "+" ? -n : n;
        amounts.push({ value, index: m.index, raw: m[0] });
      }
    }

    // Need at least one amount
    if (amounts.length < 1) continue;

    const txnAmt = amounts[amounts.length - 1];
    // When two+ amounts exist, the second-to-last is the fee and bounds the
    // description. When only one amount exists (no fee), it bounds the description.
    const descBound = amounts.length >= 2
      ? amounts[amounts.length - 2]
      : txnAmt;

    // Description: everything between the date token and the bounding amount
    const merchant = rest.slice(0, descBound.index).replace(/\s+/g, " ").trim();
    if (!merchant) continue;

    // Skip zero-amount rows
    if (txnAmt.value === 0) continue;

    rows.push({ date, merchant, amount: txnAmt.value });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      diagnostic:
        "Detected Cash App statement format but could not parse any transactions. " +
        "Make sure you copied the full statement text including dates and amounts.",
    };
  }

  return { rows };
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

    const name = req.file.originalname.toLowerCase();
    const isPDF = name.endsWith(".pdf");
    // Plain-text pastes (.txt) or TSV files route through a dual-path: try CSV/TSV
    // first, then fall back to the PDF line-extractor on the raw text so that text
    // copied straight out of a bank PDF also works.
    const isPlainText =
      name.endsWith(".txt") ||
      name.endsWith(".tsv") ||
      req.file.mimetype === "text/plain" ||
      req.file.mimetype === "text/tab-separated-values";

    // Parse transactions from the file
    let parseResult: ParseResult = { rows: [] };
    try {
      if (isPDF) {
        parseResult = await parsePDF(req.file.buffer);
      } else if (isPlainText) {
        const content = req.file.buffer.toString("utf-8");
        const textLines = content.split(/\r?\n/);
        // Route Cash App statements to the dedicated parser before trying CSV/TSV
        if (isCashAppText(textLines)) {
          parseResult = parseCashAppText(content);
        } else {
          // Try structured CSV/TSV first (handles .tsv and well-formed plain-text exports)
          parseResult = parseCSV(content);
          // If CSV found nothing, run the PDF line-extractor directly on the raw text —
          // this handles text that was copy-pasted out of a bank PDF viewer.
          if (parseResult.rows.length === 0) {
            const lines = content.split(/\r?\n/);
            let pdfRows = extractPDFRows(lines);
            // Two-pass merge for wrapped lines (same as parsePDF)
            if (pdfRows.length < 3) {
              const merged: string[] = [];
              for (let i = 0; i < lines.length; i++) {
                const cur = lines[i].trim();
                const next = (lines[i + 1] ?? "").trim();
                if (cur && next) { merged.push(`${cur} ${next}`); i++; }
                else if (cur) merged.push(cur);
              }
              const mergedRows = extractPDFRows(merged);
              if (mergedRows.length > pdfRows.length) pdfRows = mergedRows;
            }
            if (pdfRows.length > 0) {
              parseResult = { rows: normalizeSign(pdfRows) };
            } else {
              parseResult = {
                rows: [],
                diagnostic:
                  parseResult.diagnostic ??
                  "No transactions found in pasted text. " +
                  "Make sure you copied the full statement — including dates, descriptions, and amounts.",
              };
            }
          }
        }
      } else {
        parseResult = parseCSV(req.file.buffer.toString("utf-8"));
      }
    } catch (err) {
      res.status(422).json({ error: `Could not parse file: ${(err as Error).message}` });
      return;
    }

    if (parseResult.rows.length === 0) {
      res.status(422).json({
        error: parseResult.diagnostic ??
          "No transactions found. Make sure you're uploading a valid bank statement CSV or PDF.",
      });
      return;
    }

    const parsed = parseResult.rows;

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

    // Derive the statement month from parsed transaction dates (most-common
    // YYYY-MM wins) so uploading a July statement while viewing August still
    // lands in July.  Fall back to the client-supplied month when no dates.
    let statementMonth = month;
    if (parsed.length > 0) {
      const freq: Record<string, number> = {};
      for (const row of parsed) {
        const ym = row.date.slice(0, 7);
        freq[ym] = (freq[ym] ?? 0) + 1;
      }
      const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      if (/^\d{4}-\d{2}$/.test(dominant)) statementMonth = dominant;
    }

    // Save upload record + transactions atomically
    const [uploadRecord] = await db
      .insert(statementUploadsTable)
      .values({
        originalFilename: req.file.originalname,
        storageKey,
        month: statementMonth,
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

// ---------------------------------------------------------------------------
// GET /spending/trend?months=6  — last N months totals by category
// ---------------------------------------------------------------------------
router.get("/spending/trend", async (req, res): Promise<void> => {
  const months = Math.min(12, Math.max(1, parseInt(String(req.query.months ?? "6"), 10) || 6));

  // Compute start date: beginning of (current month - (months-1))
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      month:    sql<string>`to_char(${spendingTransactionsTable.txnDate}, 'YYYY-MM')`,
      category: spendingTransactionsTable.category,
      total:    sql<string>`SUM(${spendingTransactionsTable.amount})`,
    })
    .from(spendingTransactionsTable)
    .where(
      and(
        gte(spendingTransactionsTable.txnDate, from),
        sql`${spendingTransactionsTable.amount} > 0`,
      ),
    )
    .groupBy(
      sql`to_char(${spendingTransactionsTable.txnDate}, 'YYYY-MM')`,
      spendingTransactionsTable.category,
    )
    .orderBy(sql`to_char(${spendingTransactionsTable.txnDate}, 'YYYY-MM') ASC`);

  // Roll up into per-month buckets
  const monthMap = new Map<string, { total: number; byCategory: Record<string, number> }>();
  for (const row of rows) {
    if (!monthMap.has(row.month)) monthMap.set(row.month, { total: 0, byCategory: {} });
    const entry = monthMap.get(row.month)!;
    const amt = round(Number(row.total));
    entry.total = round(entry.total + amt);
    entry.byCategory[row.category] = amt;
  }

  const result = Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, total: data.total, byCategory: data.byCategory }))
    .sort((a, b) => a.month.localeCompare(b.month));

  res.json(result);
});

export default router;
