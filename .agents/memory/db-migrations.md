---
name: Tracker DB migrations are hand-run
description: Why schema changes in lib/db/migrations don't take effect on their own, and the failure signature when they haven't been applied
---

## The rule
SQL files in `lib/db/migrations/` are one-shot scripts that nothing applies
automatically. There is no migration runner, and no startup hook executes them.
After adding one, it must be run by hand:

```
psql "$DATABASE_URL" -f lib/db/migrations/<file>.sql
```

Each script is written to be idempotent (backfill is skipped once the old column
is gone), so re-running is safe. They are meant to run *before*
`pnpm --filter @workspace/db run push` — push only syncs structure and would drop
the old columns without carrying data across.

**Why:** A round of schema edits landed in the Drizzle schema and the API routes
while the database was never migrated. The app looked correct in source and
still failed at runtime.

## Failure signature
When a migration hasn't been applied, the error usually names a field that no
longer exists anywhere in the source. Symptoms seen:

- A zod error demanding a field (e.g. an allocation `category` enum) that had
  already been deleted from the route's schema.
- A bare `Failed query: insert into ...` from Drizzle with no column detail,
  because the table still had `NOT NULL` columns the new code never sends.

**How to apply:** When a validation or insert error references a field absent
from the source, check the live table before editing code:

```
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='<table>' ORDER BY ordinal_position;
```

If the columns are stale, the fix is a migration run, not a code change.

## Second half of that trap
The api-server serves a bundled `dist/index.mjs`. If its mtime is older than the
source, the running validation is not the code on disk — the same "field that
doesn't exist in source" symptom appears. The dev script rebuilds on boot, so
restarting the API Server workflow is what picks source changes up. Confirm with
`ls -la artifacts/api-server/dist/index.mjs` against the source mtime.
