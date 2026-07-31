---
name: Money rounding convention
description: Where amounts get snapped to the nearest cent on the frontend, and why it's done at input time rather than on every derived total.
---

Frontend money inputs (the `MoneyInput` component and the `toAmount()` text
parser in `lib/format.ts`) round to the nearest cent (`Math.round(n*100)/100`)
at the moment a value is parsed, before it ever enters React state.

**Why:** the backend already rounds every derived total before returning or
persisting it (`round()` in the api-server's finance `shared.ts`), but the
frontend recomputes several of its own live totals (paycheck editor pool/
remaining, page-level sums on Biweekly/Summary/Debt/Cash/Bills/Subscriptions)
with plain float addition and no rounding of its own. Quantizing every amount
to cents right at input means those sums can never drift far enough to matter
(realistic row counts keep float error many orders of magnitude below a
cent), so the live preview always agrees with what the backend saves —
without needing a `round()` call sprinkled into every reduce(). User
preference: round at the source, not at every downstream computation.

**How to apply:** any new amount-entry field should go through `MoneyInput`
or `toAmount()`, not a raw `parseFloat`/`Number()` — that's the one choke
point this convention depends on.
