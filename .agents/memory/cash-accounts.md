---
name: Cash accounts (spendable balances)
description: Why cash/spending balances (Cash App, Venmo, checking) live in their own tables and page, separate from debt accounts.
---

Cash accounts (`cash_accounts` + `cash_snapshots`, "Cash" nav tab) track a
spendable balance you top up and draw down day to day — the mirror image of a
debt account, which you draw up and pay down.

**Why a separate table/page from `debt_accounts`, not a new `kind`:**
- "Total owed" on the Debt page must never include spendable cash — mixing
  them into one table means every aggregate query needs kind-filtering.
- The sign is inverted: for debt, paycheck money sent toward an account
  *reduces* the balance ("apply to balance" = balance − pending). For a cash
  account, money added/borrowed *increases* the balance. Reusing debt's
  "sent via paychecks" attribution flow verbatim would do the math backwards.
- No credit limit, utilization bar, or pending-payment framing applies to
  cash — those are debt-specific UI/columns.

**What was deliberately left out (v1):** no payday tagging, no paycheck-link
attribution/"sent via paychecks" flow. Cash snapshots are just date + balance,
entered manually, same as debt snapshots were before payday tagging existed.
If paycheck→cash-account linking is ever added, remember the sign flip above.

A "Cash App" row is seeded by default in `cash_accounts` (moved there from
the old debt-accounts seed list, where it used to sit as a `kind: "other"`
debt account before this feature existed).
