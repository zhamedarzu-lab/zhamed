---
name: Bills schema per-month items
description: Bills were rewritten from a global registry (bills + bill_payments) to per-month rows (monthly_bill_items). Key behavior and migration notes.
---

## Rule
Use `monthly_bill_items` for all bill reads/writes. The old `billsTable` and `billPaymentsTable` still exist in the DB and schema file but are no longer referenced in the API or frontend.

**Why:** The original design used a global `bills` registry; deleting a bill in one month wiped it from all months. Per-month rows fix this — each row belongs to exactly one month.

**How to apply:**
- Schema: `monthlyBillItemsTable` in `lib/db/src/schema/finance.ts`
- API routes in `artifacts/api-server/src/routes/finance.ts` — GET/POST/PATCH/DELETE `/bills` all operate on `monthly_bill_items`
- GET `/bills?month=YYYY-MM` auto-seeds the requested month from the most recent prior month if no rows exist yet (carry-over behavior)
- Summary route also reads `monthly_bill_items` for `actuallyPaid`
- Migration: `lib/db/migrations/0003_monthly_bill_items.sql` — already applied to dev DB
- Old `bills` + `bill_payments` tables are still in the dev DB and schema but unused; do NOT reference them in new code
