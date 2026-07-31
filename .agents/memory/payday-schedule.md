---
name: Payday schedule (masthead countdown + calendar)
description: How the "next payday" date/countdown in the global header is computed, why the schedule is a hardcoded constant, and why the calendar view is a popover rather than a page.
---

The masthead shows today's date and a live countdown to the next payday.
The schedule (every 14 days, 4:00 AM, anchored on a confirmed past payday —
Thu Jul 23, 2026) is a **hardcoded constant** (`ANCHOR_PAYDAY` in
`lib/payday.ts`), not a DB-backed or user-editable setting.

**Why:** the user gave this as a fixed personal fact ("every two Thursdays,
4am, last was July 23"), not a preference they asked to configure — building
a settings UI for it would be unrequested scope. `nextPayday()` derives every
future occurrence from that one anchor + a 14-day cycle length.

**How to apply:** if the real-world schedule ever shifts (new job, pay dates
move), update `ANCHOR_PAYDAY` to any one confirmed payday on the new
schedule — don't add a second source of truth. This is separate from the
existing paycheck *records* (`paychecks` table, month+seq) — those are
manually logged actuals, not derived from this recurring-schedule guess.

## Calendar is a popover, not a page

The payday calendar (month grid, paydays highlighted, prev/next nav) opens as
a popover from clicking the masthead date/countdown — it is not a dedicated
`/calendar` route or nav entry.

**Why:** offered as an explicit choice ("popover from the masthead" vs "a
dedicated Calendar page") and the user picked the popover.

**How to apply:** extend the existing popover (`PaydayCalendar.tsx`) for
calendar-related requests rather than assuming it doesn't exist or adding a
second, redundant calendar surface. Only build a dedicated page if the user
asks for one specifically.
