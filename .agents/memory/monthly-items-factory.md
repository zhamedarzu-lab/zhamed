---
name: Bills/subscriptions share one route factory
description: Why the bills table is passed to the shared monthly-items router under the subscriptions table's type, and the condition that keeps that cast safe.
---

## Rule
Bills and subscriptions are served by one shared route factory. The factory is typed against the subscriptions table, and the bills table is passed in with a cast, because the two tables are identical apart from subscriptions' `active` column. The cast stays safe **only** while bills are registered with `supportsActive: false` — that flag is what stops the factory from ever selecting on, patching, or carrying forward a column bills doesn't have.

**Why:** The two resources were near-mirror route blocks (list with carry-forward seeding, history aggregation, create/rename/set-amount/delete). Drizzle's generics make a genuinely generic table parameter unreadable, so one contained cast at the single registration site buys real deduplication without scattering `any` through the query code.

**How to apply:**
- Adding a column to one table but not the other means the factory must gain a matching capability flag, not a widened cast.
- Behavior differences between the two are expressed as factory options, not branches inside the handlers: bills reset amounts to zero each month, subscriptions carry last month's amounts forward.
- An empty month is seeded from the most recent prior month on first read; that seeding is a write triggered by a GET, so don't "optimize" it into a read-only path.
