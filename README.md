# zh — Personal Life Tracker

A private, password-protected personal tracking suite covering finance, journaling, and fitness. Built as a pnpm monorepo with a React SPA frontend and an Express/PostgreSQL backend, running on Replit.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Running the App](#running-the-app)
- [Authentication](#authentication)
- [Finance](#finance)
- [Journal](#journal)
- [Fitness](#fitness)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Migrations](#migrations)

---

## Overview

**zh** is a single-user personal dashboard built around three life domains:

| Section  | Purpose |
|----------|---------|
| Finance  | Paycheck-based budgeting, debt tracking, subscriptions, bills, and cash accounts |
| Journal  | Timestamped daily entries with color-coding, search, and a "loose ends" linkage system |
| Fitness  | Placeholder — reserved for future workout/health logging |

The home screen shows a live clock, today's date, and animated cards with a payday countdown (Finance), a day-progress bar (Journal), and a link to Fitness.

---

## Architecture

```
monorepo (pnpm workspaces)
├── artifacts/
│   ├── tracker/          ← React SPA  (Vite, port from $PORT)
│   └── api-server/       ← Express API (Node, port from $PORT)
└── lib/
    └── db/               ← Shared Drizzle ORM schema + migrations
```

The two artifacts run as separate Replit workflows:

| Workflow | Command |
|----------|---------|
| `artifacts/tracker: web` | `pnpm --filter @workspace/tracker run dev` |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |

The frontend proxies all `/api/*` requests to the API server through Replit's path-based routing. The API server is never accessed directly by the browser.

---

## Tech Stack

### Frontend (`artifacts/tracker`)
- **React 18** with functional components and hooks
- **React Router v6** — client-side routing
- **Vite** — dev server and build tool
- **Recharts** — charts for the finance and journal views
- **Custom CSS** — single `styles.css`, no Tailwind or component library
- **TypeScript** throughout

### Backend (`artifacts/api-server`)
- **Node.js + Express** — HTTP server
- **Drizzle ORM** — type-safe PostgreSQL queries
- **Zod** — runtime request validation
- **Pino** — structured JSON logging
- **esbuild** (`build.mjs`) — custom production build script

### Database
- **PostgreSQL** (Replit-managed)
- **Drizzle Kit** — migration runner (`lib/db/drizzle.config.ts`)

### Infrastructure
- **Replit Object Storage** — available for binary assets (configured via secrets)
- **Signed session cookies** — auth state (`zh_sess`)

---

## Project Structure

```
artifacts/
  tracker/
    src/
      App.tsx                     # Root router, nav, auth gate
      main.tsx
      styles.css                  # All styles — single file
      lib/
        api.ts                    # Typed fetch wrapper
        payday.ts                 # Payday anchor + 14-day cycle math
      components/
        PaydayCountdown.tsx       # Masthead countdown chip
        MoneyInput.tsx            # Cent-snapping currency input
      pages/
        Home.tsx                  # Dashboard: clock, progress bars, section nav
        Login.tsx                 # Password gate
        finance/
          Biweekly.tsx            # Paycheck list + allocations
          PaycheckEditor.tsx      # Create/edit a paycheck
          Bills.tsx               # Monthly bill items
          Subscriptions.tsx       # Recurring subscriptions
          Debt.tsx                # Debt accounts + balance snapshots
          Cash.tsx                # Cash accounts + balance snapshots
          MonthlySummary.tsx      # Aggregate monthly view
        journal/
          Journal.tsx             # Main journal: day/week/month/year views
          EntryModal.tsx          # View, edit, and navigate journal entries
          JournalSearch.tsx       # Full-text + color + loose-end search
          JournalLooseEnds.tsx    # Dedicated open/closed loose-ends browser
          HighlightModal.tsx      # Day highlight editor
        fitness/
          Fitness.tsx             # Placeholder

  api-server/
    src/
      index.ts                    # Express app setup, middleware, route mounts
      routes/
        auth.ts                   # Login / logout / session check
        finance/
          paychecks.ts
          bills.ts
          subscriptions.ts
          debt.ts
          cash.ts
        journal/
          index.ts                # All journal routes
      lib/
        db.ts                     # Drizzle client singleton
        objectStorage.ts          # Lazy-initialised Replit Object Storage client

lib/
  db/
    src/
      schema/
        finance.ts                # Finance tables (Drizzle definitions)
        journal.ts                # Journal + highlights tables
      index.ts                    # Re-exports all schemas
    migrations/                   # Raw SQL migration files (0001 – 0020)
    drizzle.config.ts
```

---

## Running the App

Both workflows start automatically in Replit. To restart manually:

```bash
# Frontend
pnpm --filter @workspace/tracker run dev

# API server
pnpm --filter @workspace/api-server run dev
```

Environment secrets required:

| Secret | Purpose |
|--------|---------|
| `SESSION_SECRET` | Signs the `zh_sess` session cookie |
| `DATABASE_URL` | PostgreSQL connection string |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Replit Object Storage bucket |
| `PRIVATE_OBJECT_DIR` | Object storage private path prefix |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Object storage public search paths |

Migrations are **not auto-applied**. Run them manually via Drizzle Kit when the schema changes.

---

## Authentication

The app is single-user. A hardcoded password (set via environment) protects all routes.

- **Login**: `POST /api/auth/login` — checks the password, sets a signed `zh_sess` cookie
- **Check**: `GET /api/auth/check` — returns 200 if the cookie is valid, 401 otherwise
- **Logout**: `POST /api/auth/logout` — clears the cookie

The React app checks `/api/auth/check` on load. If it returns 401, the entire UI is replaced by the `Login` page. All API routes (except `/api/auth/*` and `/api/healthz`) are protected by `requireAuth` middleware.

---

## Finance

The finance section is built around **paychecks**, not calendar months. Money flows from a paycheck into allocations; bills and subscriptions are tracked separately per month.

### Paychecks (`/finance`)

Each paycheck is identified by `month` (YYYY-MM) and `seq` (1, 2, or 3 — its position within that month). The actual deposit date is never stored. The biweekly view lists all paychecks in reverse chronological order.

**Paycheck editor** (`/finance/new`, `/finance/paycheck/:id`):
- Record the gross deposit amount
- Add **allocations** — line items describing where the money went (rent, card payment, groceries, etc.)
- Optionally link an allocation to a **debt account** (e.g. "Chase Sapphire — $400") for payment tracking
- Add **extra income** rows — refunds, gifts, bill surpluses — that increase the spendable pool without changing the recorded paycheck amount
- The running total shows remaining unallocated balance in real time

### Bills (`/finance/bills`)

Monthly bill items per `YYYY-MM` — recurring fixed costs like rent, utilities, and insurance. Not linked to paychecks. Each item has a name and amount; amounts snap to the nearest cent.

### Subscriptions (`/finance/subscriptions`)

Monthly subscription items per `YYYY-MM` — streaming services, software, memberships. Like bills but tracked separately. Items can be toggled active/inactive.

### Debt (`/finance/debt`)

Tracks credit card and loan balances over time.

- **Debt accounts**: named accounts with a `kind` (card, loan, etc.), a credit limit, and active status
- **Balance snapshots**: point-in-time balance records. Each snapshot optionally links to a paycheck (to mark "this balance is as of payday X") and records `amount_paid` at that moment
- **Trend view**: a Recharts line chart showing balance history per account
- **Paycheck linking**: allocations to a debt account feed a "money sent since last update" figure on the debt page, helping you know how much to expect the next balance to drop

### Cash (`/finance/cash`)

Tracks spendable balances in accounts like Cash App — the inverse of debt. You top them up and draw them down; there is no credit limit or utilization concept.

- **Cash accounts**: named accounts with active/inactive status
- **Balance snapshots**: dated balance records, separate from debt snapshots

### Monthly Summary (`/finance/monthly`)

An aggregate view of a selected month showing total income (paychecks + extra income), total allocations, total bills, total subscriptions, and net.

---

## Journal

The journal is the most feature-rich section. Entries are timestamped records with a subject, freeform content, a color code, and optional loose-end linkage.

### Views (`/journal`)

The main journal page has four view modes selectable from a tab bar:

| View | Description |
|------|-------------|
| **Day** | Hour-grid timeline + entry list for one day. Carryover entries (started the previous day, end today) appear at the top. |
| **Week** | Seven-column layout — one column per day — each showing a mini timeline and entry list. |
| **Month** | Calendar grid with dot indicators per day. Click a day to expand its entries. Open-end count shown in the header. |
| **Year** | 12-month strip with proportional day markers. |

Navigation uses prev/next arrows and a "Today" jump button. The masthead shows a payday countdown chip on all journal pages.

### Entries

Each entry has:

| Field | Details |
|-------|---------|
| `subject` | Optional short title |
| `content` | Freeform body text |
| `entryDate` | The calendar date (YYYY-MM-DD) |
| `startTime` | ISO timestamp — required |
| `endTime` | ISO timestamp — optional (makes it a range entry) |
| `color` | Hex color from the 11-color swatch |
| `looseEndType` | `'open'` \| `'close'` \| `null` |
| `looseEndLink` | FK to another entry — set on close entries, points to the opener |

**Entry form** features:
- Time inputs with live preview
- Color swatch (Red, Orange, Yellow, Green, Blue, Pink, Purple, White, Gray, Black, Brown)
- Loose-end toggle buttons (see below)

### Color Swatch

Entries are color-coded using one of 11 colors. The swatch appears in the entry form and in the search page as filter chips.

| Color | Hex |
|-------|-----|
| Red | `#e05555` |
| Orange | `#e08c3a` |
| Yellow | `#e0b04e` |
| Green | `#4ecb71` |
| Blue | `#4eaaee` |
| Pink | `#e04e8a` |
| Purple | `#9b4ee0` |
| White | `#f5f5f5` |
| Gray | `#8a9aaa` |
| Black | `#1c1c1e` |
| Brown | `#7c4a1e` |

### Loose Ends

The loose-ends system lets you flag an entry as unresolved and later close it with a linked entry.

**Marking an opener (◎)**
- Tap ◎ in the entry form to toggle `looseEndType = 'open'`
- The entry appears in the Open Ends count in the journal header

**Marking a closer (◉)**
- Tap ◉ in the entry form to open the **Open End Picker** — a bottom sheet listing all current unresolved open ends
- Selecting one sets `looseEndType = 'close'` and `looseEndLink = <opener id>` on the new entry
- Tapping ◉ again when a link is already set clears both fields

**Visual indicators:**
- ◎ badge appears on opener rows in day/week lists (detected even if `looseEndType` was previously cleared to null — the app checks for close entries pointing at the row)
- ◉ badge appears on closer rows
- The entry modal shows a navigable "◎ View open end →" or "◉ View close entry →" link
- The modal supports internal navigation history — tapping a linked entry pushes a back stack; `‹` or Escape pops it

**Open-end count** in the journal header (◎ N) shows only unresolved openers — those with `looseEndType = 'open'` and no close entry pointing at them.

### Loose Ends Page (`/journal/loose-ends`)

A dedicated browser for the loose-ends system. Two tabs:

- **Open ends** — entries with `looseEndType = 'open'` that have no close entry
- **Closed ends** — all entries with `looseEndType = 'close'`

No search bar, no color filters. Entries are grouped by date. Tapping an entry opens the full entry modal with linked-entry navigation.

### Search (`/journal/search`)

Full-text search across all entries. Features:

- **Text search** — matches subject and content (case-insensitive, highlights matches inline)
- **Color filter chips** — toggle one or more colors; chips show entry count per color
- **Loose-end filter chips** — toggle "Open ends" or "Closed ends" mode (mutually exclusive with each other; independent of text and color)
- Results grouped by date, with match count and day count summary

### Highlights

Day highlights are short labeled events that appear on the Home dashboard. They are associated with a specific date and optionally link to a full journal entry. Each highlight has a color, optional start/end times, and a `showCountdown` flag that, when set, displays a countdown to that event on the home screen.

---

## Fitness

`/fitness` is a placeholder page. The `fitness_logs` table exists in the schema, reserved for future workout and health data.

---

## Database Schema

All tables are defined in `lib/db/src/schema/`. Drizzle ORM generates type-safe query builders from these definitions.

### Finance Tables

#### `paychecks`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `month` | text | YYYY-MM |
| `seq` | integer | 1, 2, or 3 — position within month |
| `amount` | numeric(10,2) | Gross deposit |

Unique index on `(month, seq)`.

#### `allocations`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `paycheck_id` | integer FK → paychecks | Cascades on delete |
| `amount` | numeric(10,2) | |
| `note` | text | Free-form label |
| `debt_account_id` | integer FK → debt_accounts | Nullable — links payment to a card |
| `applied_snapshot_id` | integer FK → debt_snapshots | Set when payment is folded into a balance update |

#### `extra_income`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `paycheck_id` | integer FK → paychecks | Cascades on delete |
| `amount` | numeric(10,2) | |
| `note` | text | |

#### `monthly_bill_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `month` | text | YYYY-MM |
| `name` | text | |
| `amount` | numeric(10,2) | |
| `sort_order` | integer | |

#### `monthly_subscription_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `month` | text | YYYY-MM |
| `name` | text | |
| `amount` | numeric(10,2) | |
| `sort_order` | integer | |
| `active` | boolean | |

#### `debt_accounts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `name` | text | |
| `kind` | text | card, loan, etc. |
| `active` | boolean | |
| `sort_order` | integer | |
| `credit_limit` | numeric(10,2) | Nullable |

#### `debt_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `debt_account_id` | integer FK → debt_accounts | Cascades on delete |
| `snapshot_date` | date | |
| `balance` | numeric(10,2) | |
| `amount_paid` | numeric(10,2) | |
| `paycheck_id` | integer FK → paychecks | Nullable — "as of payday X" label |
| `logged_at` | timestamptz | |

#### `cash_accounts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `name` | text | |
| `active` | boolean | |
| `sort_order` | integer | |

#### `cash_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `cash_account_id` | integer FK → cash_accounts | Cascades on delete |
| `snapshot_date` | date | |
| `balance` | numeric(10,2) | |
| `logged_at` | timestamptz | |

### Journal Tables

#### `journal_entries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `subject` | text | Nullable short title |
| `content` | text | Body (default `""`) |
| `entry_date` | date | YYYY-MM-DD — the calendar date |
| `start_time` | timestamptz | Required |
| `end_time` | timestamptz | Nullable — makes it a range entry |
| `color` | text | Hex color, default `#e0b04e` |
| `loose_end_type` | text | `'open'` \| `'close'` \| null |
| `loose_end_link` | integer FK → journal_entries | Set on close entries — points to opener |
| `created_at` | timestamptz | |

#### `day_highlights`
| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `date` | text | YYYY-MM-DD |
| `label` | text | Display label |
| `color` | text | Hex color, default `#4eaaee` |
| `show_countdown` | boolean | Show countdown on home screen |
| `start_time` | text | HH:MM optional |
| `end_time` | text | HH:MM optional |
| `entry_id` | integer | Nullable link to a journal entry |
| `created_at` | timestamptz | |

---

## API Reference

All endpoints require authentication (valid `zh_sess` cookie) except `/api/auth/*` and `/api/healthz`.

Base path: `/api`

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/login` | Submit password, receive session cookie |
| `GET` | `/auth/check` | 200 if authenticated, 401 if not |
| `POST` | `/auth/logout` | Clear session cookie |

### Finance — Paychecks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/finance/paychecks` | List all paychecks (reverse chrono) |
| `GET` | `/finance/paychecks/last` | Most recent paycheck |
| `GET` | `/finance/paychecks/:id` | Single paycheck with allocations and extra income |
| `POST` | `/finance/paychecks` | Create a paycheck |
| `PATCH` | `/finance/paychecks/:id` | Update a paycheck |
| `DELETE` | `/finance/paychecks/:id` | Delete a paycheck (cascades allocations) |

### Finance — Bills & Subscriptions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/finance/bills` | List bill items (filter by `?month=`) |
| `POST` | `/finance/bills` | Create bill item |
| `PATCH` | `/finance/bills/:id` | Update bill item |
| `DELETE` | `/finance/bills/:id` | Delete bill item |
| `GET` | `/finance/subscriptions` | List subscription items (filter by `?month=`) |
| `POST` | `/finance/subscriptions` | Create subscription item |
| `PATCH` | `/finance/subscriptions/:id` | Update subscription item |
| `DELETE` | `/finance/subscriptions/:id` | Delete subscription item |

### Finance — Debt

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/finance/debt-accounts` | List all debt accounts |
| `POST` | `/finance/debt-accounts` | Create debt account |
| `PATCH` | `/finance/debt-accounts/:id` | Update debt account |
| `DELETE` | `/finance/debt-accounts/:id` | Delete debt account |
| `GET` | `/finance/debt-snapshots` | List snapshots (filter by `?accountId=`) |
| `POST` | `/finance/debt-snapshots` | Record a new balance snapshot |
| `GET` | `/finance/debt-payments` | Unapplied allocations linked to a debt account |
| `GET` | `/finance/debt/trend` | Balance history for all accounts (for chart) |

### Finance — Cash

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/finance/cash-accounts` | List all cash accounts |
| `POST` | `/finance/cash-accounts` | Create cash account |
| `PATCH` | `/finance/cash-accounts/:id` | Update cash account |
| `DELETE` | `/finance/cash-accounts/:id` | Delete cash account |
| `GET` | `/finance/cash-snapshots` | List snapshots (filter by `?accountId=`) |
| `POST` | `/finance/cash-snapshots` | Record a new cash balance snapshot |

### Journal — Entries

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/journal/entries` | List entries. Optional: `?from=`, `?to=`, `?looseEndLink=` |
| `GET` | `/journal/entries/:id` | Single entry by ID |
| `POST` | `/journal/entries` | Create an entry |
| `PATCH` | `/journal/entries/:id` | Update an entry |
| `DELETE` | `/journal/entries/:id` | Delete an entry |

Query params on `GET /journal/entries`:
- `from` / `to` — ISO date strings, filter by `entry_date` range
- `looseEndLink` — integer ID, returns entries whose `loose_end_link` matches (used to find the close entry for a given opener)

### Journal — Loose Ends

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/journal/loose-ends` | All entries with `loose_end_type = 'open'` |

### Journal — Highlights

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/journal/highlights` | List all day highlights |
| `POST` | `/journal/highlights` | Create a highlight |
| `PUT` | `/journal/highlights/:id` | Replace a highlight |
| `PATCH` | `/journal/highlights/:id` | Partial update a highlight |
| `DELETE` | `/journal/highlights/:id` | Delete a highlight |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check — returns 200 |
| `GET` | `/export` | Full JSON dump of all database tables |

---

## Migrations

Migrations live in `lib/db/migrations/` as plain SQL files. They are applied manually using Drizzle Kit. **They are never auto-applied on startup.**

| File | Change |
|------|--------|
| `0001_paychecks_month_seq.sql` | Add `month` + `seq` columns to paychecks |
| `0002_allocations_amount_note.sql` | Add `amount` + `note` to allocations |
| `0003_monthly_bill_items.sql` | Create `monthly_bill_items` table |
| `0004_monthly_subscription_items.sql` | Create `monthly_subscription_items` table |
| `0005_subs_active.sql` | Add `active` flag to subscriptions |
| `0006_debt_credit_limit.sql` | Add `credit_limit` to debt accounts |
| `0007_alloc_debt_link.sql` | Add `debt_account_id` FK to allocations |
| `0008_extra_income.sql` | Create `extra_income` table |
| `0009_drop_old_bills_tables.sql` | Drop legacy `bills` + `bill_payments` tables |
| `0010_debt_snapshot_paycheck_link.sql` | Add `paycheck_id` FK to debt snapshots |
| `0011_cash_accounts.sql` | Create `cash_accounts` + `cash_snapshots` tables |
| `0012_journal_entries_timestamped.sql` | Add `start_time`, `end_time`, `entry_date` to journal |
| `0013_journal_subject_times.sql` | Add `subject` column to journal entries |
| `0014_journal_entry_color.sql` | Add `color` column to journal entries |
| `0015_snapshot_logged_at.sql` | Add `logged_at` to debt + cash snapshots |
| `0016_day_highlights.sql` | Create `day_highlights` table |
| `0017_highlight_times.sql` | Add `start_time` + `end_time` to highlights |
| `0018_highlight_entry_link.sql` | Add `entry_id` FK to highlights |
| `0019_loose_end_link.sql` | Add `loose_end_link` FK to journal entries |
| `0020_loose_end_type.sql` | Add `loose_end_type` column + backfill from legacy text markers |

---

## Design Notes

**Rounding**: Money amounts are snapped to cents at the point of input (via `MoneyInput`), never during derived totals. This avoids accumulated rounding drift.

**Payday schedule**: The masthead countdown uses a hardcoded anchor date and a fixed 14-day cycle. It is not a user setting — update the anchor in `lib/payday.ts` if the real schedule shifts.

**Object Storage**: The `@replit/object-storage` client is lazy-initialized (top-level `await` causes a server crash on import). Any usage must go through the lazy getter in `artifacts/api-server/src/lib/objectStorage.ts`.

**Loose-end badge detection**: Because some opener entries had their `loose_end_type` cleared to `null` by an earlier version of the code, the frontend does not rely solely on `looseEndType === 'open'` to decide whether to show the ◎ badge. It also checks whether any loaded entry has `looseEndLink` pointing to the current row's ID.
