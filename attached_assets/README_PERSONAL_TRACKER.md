# Personal Tracker App — Finance, Fitness & Journal

A clean, modular personal tracking app for manual entry, structured around three independent modules: **Finance**, **Fitness**, and **Journal**. No login required — single-user, private.

---

## 1. App Architecture & Navigation

- **Home (`/`)**: Dashboard with three navigation cards — Finance, Fitness, Journal.
- Modules are fully isolated views; each is self-contained with its own data and flows.

---

## 2. Finance Module (`/finance`)

Built around a **biweekly pay cycle** with manual entry. Three distinct sub-systems:

### A. Paycheck Allocations

When a paycheck arrives, manually record it and distribute funds through a priority waterfall:

1. **Income Entry** — Record paycheck amount + date + label (`Paycheck 1 of Month` / `Paycheck 2 of Month`).
2. **Bills / Expenses** — Allocate toward monthly bills.
3. **Debt Repayment** — Allocate toward configurable debt accounts (e.g. Cash App, Afterpay, credit cards).
4. **Credit Dump** — Remaining surplus applied to credit card paydown.

**Friction reducers:**
- *Repeat Last Paycheck Structure* button — pre-fills the prior paycheck's allocation split.
- **Live surplus bar** — running `$Total - Expenses - Debt = Remaining` updates as you type. One-click assigns exact remainder to credit card dump.
- Custom tags + notes field per allocation entry (e.g. "Neo from Vince", "Traffic tickets", "Steam Deck").

**Data:**
- `Paycheck`: id, pay_date, gross_amount, label
- `Allocation`: paycheck_id, category (Bills/Expenses | Debt Repayment | Credit Dump | Surplus/Spend), debt_account_id (optional FK), amount, notes, tags

---

### B. Bill Template & Monthly Bill Log (separate from paycheck allocations)

**Bill Template** — Your editable master list of recurring bills with expected monthly amounts:

| Bill | Default Amount |
|------|---------------|
| Rent | $850 |
| Credit Cards (A/B) | $200 |
| Power | $130 |
| Subscriptions | $200 |
| Web | $120 |
| Student Loans | $150 |
| Phone | $120 |
| Car Insurance | $80 |
| Storage Unit | $0 |

Bills are fully editable (add, rename, remove, change amounts).

**Monthly Bill Log** — Separate manual entry. Each month, record what you *actually paid* per bill:
- Monthly summary: Total saved for bills (from paycheck allocations) vs. total actually paid → **Surplus/Shortfall** calculated automatically.
- Historical log: month-by-month view showing each bill's paid amounts.

Supports two split structures: **$750 + $1,850** or a rounded **$2,000/month** target split across 2 paychecks.

---

### C. Debt Tracker

Fully configurable debt accounts (add, rename, remove — e.g. Cash App, Afterpay, Credit Card A, Credit Card B).

Per account:
- Log the current balance each paycheck.
- Record how much was paid toward it that cycle.
- **Balance trend graph** per account — paycheck-by-paycheck, watching the balance trend downward.
- **Aggregate debt overview** — total owed across all accounts, trending over time.

When an account reaches $0, it can be marked inactive (but retained in history). Over time this frees up allocation room to redirect toward savings.

---

### Finance Views

- **Biweekly View** — Chronological log of every paycheck and its allocation breakdown.
- **Monthly Summary View** — Aggregated roll-up combining both paychecks of a given month.
- **Debt Dashboard** — Balance trends per account + total debt trajectory.
- **Bill Log** — Month-by-month actual payments vs. template targets.

---

## 3. Fitness Module (`/fitness`)

Independent section for logging workouts and activity.

- **Log Entry** — Date, optional workout type/label (freeform text tag), freeform notes. Quick and low-friction.
- **Log View** — Chronological list of entries, filterable by date range or workout tag.
- **Recent Activity Summary** — Dashboard widget showing last few entries.

*Intentionally simple for now — to be expanded later.*

---

## 4. Journal Module (`/journal`)

- **Calendar View** — Interactive calendar to browse days at a glance. Days with entries are visually marked.
- **Daily Entry** — Click any day to open it: text area for notes/thoughts + image upload support.
- **Image Uploads** — Photos stored in cloud object storage (accessible across devices). Supports multiple images per day.

---

## 5. Data Models Summary

| Model | Key Fields |
|-------|-----------|
| `Paycheck` | id, pay_date, amount, label |
| `Allocation` | paycheck_id, category, debt_account_id?, amount, notes, tags |
| `Bill` | id, name, expected_amount, active |
| `MonthlyBillPayment` | bill_id, month (YYYY-MM), amount_paid |
| `DebtAccount` | id, name, active |
| `DebtSnapshot` | debt_account_id, paycheck_id, balance, amount_paid |
| `FitnessLog` | id, date, workout_type, notes |
| `JournalEntry` | id, date, body |
| `JournalImage` | id, journal_entry_id, storage_key, uploaded_at |

---

## 6. Tech Stack

- **Frontend**: React + Vite
- **Backend**: Express (Node.js)
- **Database**: PostgreSQL + Drizzle ORM
- **Image Storage**: Replit Object Storage (cloud, cross-device)
- **Validation**: Zod
