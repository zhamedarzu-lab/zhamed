/**
 * Payday schedule: every 14 days, 4:00 AM, anchored on a confirmed past
 * payday. This is a fixed personal schedule, not a user-editable setting —
 * if the cadence ever actually changes, update ANCHOR_PAYDAY to any one
 * confirmed payday on the new schedule and everything else follows from it.
 */
const ANCHOR_PAYDAY = new Date(2026, 6, 23, 4, 0, 0); // Thu Jul 23, 2026, 4:00 AM
const CYCLE_DAYS = 14;
const CYCLE_MS = CYCLE_DAYS * 24 * 60 * 60 * 1000;

/** The next payday strictly after `from` (defaults to now). */
export function nextPayday(from: Date = new Date()): Date {
  const diff = from.getTime() - ANCHOR_PAYDAY.getTime();
  const cyclesElapsed = Math.floor(diff / CYCLE_MS) + 1;
  return new Date(ANCHOR_PAYDAY.getTime() + cyclesElapsed * CYCLE_MS);
}

/** "6d 4h" / "3h 12m" / "42s" — coarsens as the gap grows so it doesn't jitter. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
