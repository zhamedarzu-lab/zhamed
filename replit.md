# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## Fitness — agreed spec (not built yet)

Agreed between the user, Replit's agent and Claude Code. Build this, not a
variation of it. If something here turns out to be wrong, change this file in
the same commit that changes the code.

**What the user actually does:** bodyweight work at home — pushups, situps,
planks, jumping jacks, burpees — plus a single pair of 20 lb dumbbells and a
bike. No gym. Load is therefore *not* a variable: progress shows up as more
reps, longer holds, and showing up more often. There is no weight-progression
chart to build.

**The one question the page answers:** "am I doing better than I was?" —
measured as consistency, the last 7 days against the 7 before, and a personal
best.

### Model

```
exercises   id, name, unit, active, sortOrder
efforts     id, exerciseId → exercises (cascade), date, slot, amount
```

- **`unit` lives on the exercise, not the effort.** It never changes per
  exercise — pushups are always reps, planks always seconds, bike always
  minutes. Ask once when the exercise is created, never again.
- **`slot` is one of `morning | noon | evening | night`.** The user cares
  which quarter of the day, not the clock time. This is the same move the app
  already made for paychecks, where the calendar date was dropped in favour of
  1st/2nd/3rd of the month. Four tappable buttons, no time picker.
- `slot` being an enum is deliberate and is *not* a contradiction of the
  no-enums rule elsewhere: it is a closed partition of the day with no "other"
  bucket. Exercise names stay freeform text and get their colour from
  `tagColor()`, exactly like allocation notes.
- Indexes from the start: `efforts(date)`, `efforts(exercise_id)`.
- There is **no session/workout container.** The user's training is scattered
  through the day rather than done in discrete gym sessions; the day groups the
  efforts. Do not add one.

### API — `/api/fitness`, mounted beside finance and journal behind `requireAuth`

```
GET    /api/fitness/exercises            list (active first, sortOrder)
POST   /api/fitness/exercises            { name, unit }
PATCH  /api/fitness/exercises/:id        rename / archive / reorder
DELETE /api/fitness/exercises/:id
GET    /api/fitness/efforts    ?from=&to=
POST   /api/fitness/efforts              { exerciseId, date, slot, amount }
DELETE /api/fitness/efforts/:id
GET    /api/fitness/summary              per-exercise stats, see below
```

`GET /summary` returns, per exercise: today's total, the last-7-days total, the
previous-7-days total, the percentage delta between them, the best single day
with its date, and the daily totals for the sparkline. Plus a top-level list of
which of the last 14 days had any effort at all.

**Register both new tables in `routes/export.ts` in the same commit.** The
export is the only backup; a table added without touching it is silently
missing from every backup taken afterwards. This has already happened once
with `day_highlights`.

### Page — one screen at `/fitness`

1. **Consistency strip** across the top: the last 14 days, one dot per day,
   filled if anything was logged. 14 days because that is one pay cycle, the
   rhythm the rest of the app already runs on.
2. **A card per exercise**, in the Debt/Cash card style: name, today's total,
   last-7 vs previous-7 with the delta, best single day, and a small sparkline
   of daily totals (`BalanceChart`).
3. **Inline logging on each card** — a `+` that opens
   `[amount] [morning · noon · evening · night] [✓]` in place, like the balance
   footer on a Debt card. Logging must be: open page → `+` → type number → tap
   slot → done. No separate editor page, no navigation.
4. Inline "add an exercise" row at the bottom (name + unit), same pattern as
   `AddItemRow` on the bills page.

**Compare rolling 7-day windows, never calendar weeks.** "This week vs last
week" reads as a loss every Monday and Tuesday no matter how well the user is
doing, because a partial week is being compared against a complete one. The
last 7 days against the 7 before is honest on every day of the week.

### Out of scope

No sessions or workout containers. No sets/reps grids. No exercise library or
dropdown of preset movements. No weight, body-fat, waist or other body metrics
— the user explicitly does not want them. No calories or food logging. No
wearable or health-app import. No rest timers or workout programs.

### Build order

Schema and migration first, then the API, then the page — each verified
against a live database before the next starts.

The Fitness pane on the home page stays without a progress bar for now. Home
currently makes **zero API calls** and paints instantly because of it; adding a
fitness figure there is a deliberate follow-up decision, not part of this work.

## User preferences

- The home page stays minimal: the zh monogram with the live clock and date,
  then three panes — Finance with the pay-cycle progress bar, Journal with the
  end-of-day progress bar, Fitness blank for now. No masthead / top banner on
  home. No debt figures, no journal previews, no stats. "As simple as
  possible, real animated like, sleek."

## Gotchas

- A paycheck is keyed by `month` (YYYY-MM) + `seq` (1, 2, or 3). There is no pay
  date — which day it landed on never affected any figure the app reports.
  `(month, seq)` is unique, so re-recording a slot returns 409 and the editor
  shows the message inline.
- An allocation is an amount plus a note, nothing else. The note is the tag the
  money is filed under, so a month's breakdown is its notes totalled up
  (`summary.byNote`). There are deliberately no categories or account links.
- `db push` only syncs structure, never data. A change that moves or drops a
  column needs a SQL script in `lib/db/migrations/` run against the database
  first; push then has nothing left to do.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
