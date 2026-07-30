---
name: Paycheck-to-debt-card linking
description: How paycheck allocations connect to credit card balances on the Debt page (attribution + prefill, not auto-apply)
---

An allocation row on a paycheck can optionally link to a debt (credit card)
account via `allocations.debt_account_id`. This is attribution only — it does
**not** change the card's balance by itself. Balance is still a manually
entered snapshot (`debt_snapshots`), because interest and new purchases mean
"balance − payments sent" often isn't the real new balance.

The link's only effect: `GET /api/finance/debt-accounts` returns
`pendingPayment` per card = sum of linked allocations where
`applied_snapshot_id IS NULL`. The Debt page shows this as "Sent via
paychecks: $X" with an "Apply to balance" button that pre-fills the balance
input as `currentBalance - pendingPayment`, which the user can adjust before
confirming. Logging a new snapshot (`POST /debt-snapshots`) marks all
currently-unapplied linked allocations for that account as applied (sets
their `applied_snapshot_id`), so the pending total resets to zero.

**Why:** The user explicitly chose this "prefill" middle ground over full
automation (which risks balance drift) or link-only display (which still
requires manual subtraction), when asked directly.

**How to apply:** If extending this — e.g. a payment history view — read
unapplied vs. applied allocations via `appliedSnapshotId`, don't try to infer
timing from paycheck month vs. snapshot date.
