# Personal Tracker

Finance, Fitness, and Journal — three independent books for one person, no login.

## Run & Operate

- `npm run dev` — Express with Vite middleware, hot reload, API and client on one port (5000)
- `npm run build` — builds the client to `dist/public`
- `npm start` — production: Express serves the built client
- `npm run db:push` — pushes the Drizzle schema to Postgres
- `npm run db:studio` — browse the data
- `npm run typecheck` — `tsc --noEmit` across client, server, and shared
- Required env: `DATABASE_URL`. Optional: `STORAGE_DRIVER` (`replit` | `local`), `REPLIT_BUCKET_ID`, `PORT`

## Stack

- React 18 + Vite, plain CSS, React Router — no component library
- Express 4, TypeScript with ES modules, run through `tsx`
- PostgreSQL + Drizzle ORM
- Zod for validation, shared between client types and server routes
- Replit Object Storage for journal photos, with a local-disk fallback

## Where things live

```
shared/schema.ts        Drizzle tables — the nine models from the spec
shared/validation.ts    Zod schemas; every route body and query goes through one
server/index.ts         Express + Vite middleware, one port
server/db.ts            Drizzle client
server/routes/          finance.ts · fitness.ts · journal.ts
server/storage.ts       image storage adapter (Replit Object Storage or ./uploads)
server/seed.ts          first-run bill template + debt accounts
server/util.ts          error middleware, `parse()`, money/month helpers
client/src/pages/       Home · Fitness · Journal · JournalDay · finance/*
client/src/components/ui.tsx   Panel, Field, MoneyInput, MonthPicker, BalanceChart
client/src/lib/         api.ts (fetch + useApi hook) · format.ts (money and dates)
client/src/styles.css   the whole design system
attached_assets/README_PERSONAL_TRACKER.md   the original spec
```

## Architecture decisions

- **Money is `numeric(12,2)` in Postgres and plain numbers over the wire.** The
  driver hands numerics back as strings, so every route maps them through `num()`
  on the way out and `money()` on the way in. Sums run through `cents()` so a
  column of figures never drifts by a penny.
- **Bill allocations and the monthly bill log are deliberately separate tables.**
  What you set aside from a paycheck and what actually left the account are
  different facts; the surplus/shortfall figure is the difference between them.
- **`PATCH /paychecks/:id` replaces allocations wholesale** rather than diffing
  rows. The editor holds the whole split in local state, so a full replace inside
  one transaction is both simpler and impossible to leave half-applied.
- **The debt trend carries forward last-known balances.** A point on the
  aggregate line sums every account's most recent reading as of that date, not
  just the accounts logged that day — otherwise the total would dip whenever you
  only updated one card.
- **Validation errors return `fields[].message` as standalone sentences.** The
  client joins them into one notice, so messages are written to read as prose
  with no field-name prefix.
- **Journal photos are addressed by row id, not storage key.**
  `GET /api/journal/images/:id/raw` streams through the adapter, which keeps the
  bucket private and lets the local fallback work identically.

## Product

- **Finance** — record a paycheck and cut it into piles: bills, debt repayment,
  credit dump, spending. The allocation tape on the right drains as you assign,
  and the remainder is the largest figure on screen. "Repeat last paycheck
  structure" and "fill from bill template" remove most of the typing. Separate
  views for the biweekly log, the monthly roll-up, the bill log, and debt trends.
- **Fitness** — date, optional label, freeform notes. Filterable by label and
  date range. Intentionally minimal.
- **Journal** — a month calendar with marks for days that have text or photos.
  Click a day to write; the entry autosaves. Multiple photos per day.

## User preferences

- Plain, everyday language in the interface — no jargon.
- Red is reserved strictly for money moving the wrong way: debt balances,
  over-allocation, bill shortfalls. Nothing else may use it.

## Gotchas

- `server/*` imports use explicit `.ts` extensions (`allowImportingTsExtensions`);
  `tsx` needs them. Keep the extension when adding imports.
- `/api/finance/paychecks/last` is registered before `/paychecks/:id` — Express
  matches in order, and "last" would otherwise be read as an id.
- The seed only fills empty tables. It never overwrites edits, so deleting all
  bills and restarting brings the template back.
- Without Object Storage, photos land in `./uploads`, which does not survive a
  Repl reset. `STORAGE_DRIVER=local` forces that path deliberately.
- This project is npm, not pnpm. `package-lock.json` is the only lockfile; the
  pnpm-workspace scaffold the repo started from has been removed.
