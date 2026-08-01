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
