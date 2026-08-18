/**
 * The live-clock pieces, in one place.
 *
 * `useNow`, `pad2` and `fmtClock` were each copied into Home, PaydayCountdown
 * and HighlightCountdown, and `getModes` into two of them with the cells
 * shaped slightly differently in each — so a fix to the countdown formatting
 * only ever landed in whichever copy was being read at the time.
 */
import { useEffect, useState } from "react";

/** Re-renders the caller every `intervalMs` with a fresh Date. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** "3:07:22 pm" */
export const fmtClock = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${h >= 12 ? "pm" : "am"}`;
};

/** "Thu, Jul 23" */
export const weekdayDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Minutes elapsed of the day's 1440, as a percentage. */
export const dayProgressPct = (d: Date) => ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;

/**
 * One cell of a countdown readout: [value, label, pad]. `pad` is true for
 * remainder units (0–59, zero-padded to two digits) and false for a leading
 * total, which can run to three or more digits.
 */
export type CountdownCell = [number, string, boolean];

/**
 * The four ways to read the same duration, from "3d 04h 12m 45s" down to a
 * single total in seconds. Tapping a countdown steps through them.
 */
export function countdownModes(totalSeconds: number): CountdownCell[][] {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    // All components, each padded to two digits.
    [[days, "days", true], [hours, "hrs", true], [minutes, "min", true], [seconds, "sec", true]],
    // Days folded into hours, m/s remainders kept.
    [[Math.floor(totalSeconds / 3600), "hrs", false], [minutes, "min", true], [seconds, "sec", true]],
    // Hours folded into minutes, s remainder kept.
    [[Math.floor(totalSeconds / 60), "min", false], [seconds, "sec", true]],
    // Seconds only.
    [[totalSeconds, "sec", false]],
  ];
}

/**
 * The instants at which today, this week and this month began **for the person
 * looking at the screen**.
 *
 * The spending summary used to compute these on the server, where "midnight"
 * is the server's midnight — on a UTC host that rolls "today's spending" over
 * at the wrong time for everyone who is not on UTC. The browser is the only
 * party that knows the viewer's zone and its DST rules, so it does the
 * arithmetic and sends the three instants along.
 *
 * The week starts Monday, which is what the summary has always used.
 */
export function localPeriodStarts(now: Date = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay(); // 0 = Sunday

  return {
    dayStart:   new Date(y, m, d),
    weekStart:  new Date(y, m, d + (dow === 0 ? -6 : 1 - dow)),
    monthStart: new Date(y, m, 1),
  };
}

/** Those three instants as query params, ready to append to a request. */
export function periodStartParams(now: Date = new Date()): string {
  const { dayStart, weekStart, monthStart } = localPeriodStarts(now);
  return (
    `dayStart=${encodeURIComponent(dayStart.toISOString())}` +
    `&weekStart=${encodeURIComponent(weekStart.toISOString())}` +
    `&monthStart=${encodeURIComponent(monthStart.toISOString())}`
  );
}

/**
 * The viewer's IANA zone ("America/New_York"), for the endpoints that have to
 * bucket a whole history by calendar day rather than compare against a few
 * fixed instants — only the database can do that per row, and it needs the
 * zone by name to get past DST changes right.
 */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
