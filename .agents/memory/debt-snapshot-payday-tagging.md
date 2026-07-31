---
name: Debt snapshot payday tagging
description: How a debt balance snapshot can optionally be identified by payday (month+seq) instead of only a calendar date
---

`debt_snapshots` has a nullable `paycheck_id` FK (`onDelete: "set null"`) so a
balance entry can optionally be tagged "as of payday X" (e.g. "Aug 1/2")
instead of only a raw calendar date — mirroring how paychecks themselves are
identified by `month` + `seq`, not a date. `GET /debt-snapshots` left-joins
paychecks to return `paycheckMonth`/`paycheckSeq` alongside each row.

This is a **separate mechanism** from the allocation→debt-account link
documented in `paycheck-debt-linking.md`. That one attributes payment money
sent toward a card (`allocations.debt_account_id`); this one just labels which
payday a balance reading corresponds to. Tagging a snapshot with a paycheck
does not touch `pendingPayment`/`appliedSnapshotId` at all.

Display: `Point` (in `components/ui.tsx`, used by `BalanceChart`) has an
optional `label` field that overrides the default `date.slice(5)` axis tick
text — used to show the payday tag on the chart when present.

**Why:** User asked to track debt "by paydays as well" (additive, not a
replacement for date-based tracking) — same reasoning the app already applies
to the allocation link: optional FK, purely additive, never auto-derived or
backfilled.

**How to apply:** If extending snapshot display further, remember a snapshot
can have a payday tag, a plain date, or (rare) both are meaningless without
each other — always fall back to the date when `paycheckMonth`/`paycheckSeq`
are null.
