import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type Entry = {
  id: number;
  content: string;
  entryDate: string;   // YYYY-MM-DD
  createdAt: string;   // ISO timestamp
};

type View = "day" | "week" | "month";

/* ── date helpers ──────────────────────────────────────────────────── */
const toYMD = (d: Date) => d.toISOString().slice(0, 10);
const parseYMD = (s: string) => new Date(s + "T00:00:00");

function startOfWeek(d: Date) {
  const c = new Date(d);
  const day = c.getDay(); // 0=Sun
  c.setDate(c.getDate() - day);
  return c;
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function rangeForView(focus: Date, view: View): [string, string] {
  if (view === "day") return [toYMD(focus), toYMD(focus)];
  if (view === "week") {
    const s = startOfWeek(focus);
    return [toYMD(s), toYMD(addDays(s, 6))];
  }
  return [toYMD(startOfMonth(focus)), toYMD(endOfMonth(focus))];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}
function fmtDayHeader(d: Date) {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}
function minuteOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

const HOUR_H = 64; // px per hour in day timeline

/* ── icons ─────────────────────────────────────────────────────────── */
const IcPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const IcTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
  </svg>
);
const IcLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6"/>
  </svg>
);
const IcRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════ */
export default function Journal() {
  const [view, setView] = useState<View>("day");
  const [focus, setFocus] = useState(() => new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [nowMin, setNowMin] = useState(nowMinutes());
  const timelineRef = useRef<HTMLDivElement>(null);

  // Update current-time marker every minute
  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch entries for the visible range
  const fetchEntries = useCallback(async () => {
    const [from, to] = rangeForView(focus, view);
    setLoading(true);
    try {
      const data = await api.get<Entry[]>(`/api/journal/entries?from=${from}&to=${to}`);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [focus, view]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  // Scroll day timeline to current time on mount / when switching to day
  useEffect(() => {
    if (view !== "day" || !timelineRef.current) return;
    const scrollTo = (nowMin / 60) * HOUR_H - 160;
    timelineRef.current.scrollTop = Math.max(0, scrollTo);
  }, [view, focus]);

  /* navigation */
  function navigate(dir: 1 | -1) {
    setFocus((f) => {
      const c = new Date(f);
      if (view === "day")   c.setDate(c.getDate() + dir);
      if (view === "week")  c.setDate(c.getDate() + dir * 7);
      if (view === "month") c.setMonth(c.getMonth() + dir);
      return c;
    });
  }

  function goToday() { setFocus(new Date()); }

  /* add entry */
  async function addEntry() {
    const content = newContent.trim();
    if (!content) return;
    const entryDate = view === "day" ? toYMD(focus) : toYMD(new Date());
    const row = await api.post<Entry>("/api/journal/entries", { content, entryDate });
    setEntries((prev) => [row, ...prev]);
    setNewContent("");
    setAdding(false);
  }

  /* delete entry */
  async function deleteEntry(id: number) {
    await api.del(`/api/journal/entries/${id}`);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  /* period label */
  function periodLabel() {
    if (view === "day") {
      const today = toYMD(new Date());
      if (toYMD(focus) === today) return "Today";
      return focus.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    if (view === "week") {
      const s = startOfWeek(focus);
      const e = addDays(s, 6);
      if (s.getMonth() === e.getMonth())
        return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
      return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
    }
    return `${MONTHS[focus.getMonth()]} ${focus.getFullYear()}`;
  }

  /* group entries by date */
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.entryDate) ?? [];
    arr.push(e);
    byDate.set(e.entryDate, arr);
  }

  const isToday = toYMD(focus) === toYMD(new Date());

  return (
    <div className="journal-shell">
      {/* ── Top bar ── */}
      <div className="journal-topbar">
        <div className="journal-view-toggle">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="journal-nav">
          <button className="journal-nav-btn" onClick={() => navigate(-1)} aria-label="Previous">‹</button>
          <span
            className="journal-period"
            data-today={view === "day" && isToday ? "true" : "false"}
          >
            {periodLabel()}
          </span>
          <button className="journal-nav-btn" onClick={() => navigate(1)} aria-label="Next">›</button>
          {toYMD(focus) !== toYMD(new Date()) && view === "day" && (
            <button className="journal-today-btn" onClick={goToday}>Today</button>
          )}
        </div>

        <button
          className="journal-add-btn"
          onClick={() => setAdding((a) => !a)}
          aria-label="Add entry"
        >
          <IcPlus /> New entry
        </button>
      </div>

      {/* ── Add entry form ── */}
      {adding && (
        <div className="journal-add-form">
          <textarea
            autoFocus
            placeholder="What's on your mind?"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addEntry();
              if (e.key === "Escape") { setAdding(false); setNewContent(""); }
            }}
            rows={3}
          />
          <div className="journal-add-actions">
            <span className="journal-add-hint">⌘↵ to save · Esc to cancel</span>
            <button className="primary" onClick={addEntry} disabled={!newContent.trim()}>Save</button>
          </div>
        </div>
      )}

      {loading && <div className="journal-loading">Loading…</div>}

      {/* ════════════════════════════════════════════ DAY VIEW */}
      {view === "day" && (() => {
        const dayEntries = [...(byDate.get(toYMD(focus)) ?? [])].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const past   = isToday ? dayEntries.filter(e => minuteOfDay(e.createdAt) <= nowMin) : dayEntries;
        const future = isToday ? dayEntries.filter(e => minuteOfDay(e.createdAt) >  nowMin) : [];
        const dayPct = Math.min(100, Math.round((nowMin / (24 * 60)) * 100));

        const nowLabel = (() => {
          const n = new Date();
          const h = n.getHours(), m = n.getMinutes();
          const ampm = h >= 12 ? "pm" : "am";
          return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
        })();

        const FeedEntry = ({ entry, dim }: { entry: Entry; dim?: boolean }) => (
          <div className={`journal-feed-row${dim ? " is-future" : ""}`} key={entry.id}>
            <span className="journal-feed-time">{fmtTime(entry.createdAt)}</span>
            <span className="journal-feed-node" aria-hidden="true" />
            <div className="journal-feed-card">
              <p className="journal-feed-text">{entry.content}</p>
              <button
                className="journal-delete-btn"
                onClick={() => deleteEntry(entry.id)}
                aria-label="Delete entry"
              ><IcTrash /></button>
            </div>
          </div>
        );

        return (
          <div className="journal-day-v2">
            {/* Day progress bar */}
            {isToday && (
              <div className="journal-progress-bar">
                <div className="journal-progress-fill" style={{ width: `${dayPct}%` }} />
                <span className="journal-progress-label">{dayPct}%</span>
              </div>
            )}

            <div className="journal-feed">
              {/* Past entries */}
              {past.map(e => <FeedEntry key={e.id} entry={e} />)}

              {/* NOW divider — only on today */}
              {isToday && (
                <div className="journal-feed-now">
                  <span className="journal-feed-now-dot" aria-hidden="true" />
                  <span className="journal-feed-now-label">now · {nowLabel}</span>
                  <span className="journal-feed-now-rule" aria-hidden="true" />
                </div>
              )}

              {/* Future entries (backdated or clocked past midnight) */}
              {future.map(e => <FeedEntry key={e.id} entry={e} dim />)}

              {/* Empty state */}
              {dayEntries.length === 0 && (
                <p className="journal-feed-empty">
                  {isToday ? "Nothing logged yet — add your first entry above." : "No entries for this day."}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════ WEEK VIEW */}
      {view === "week" && (() => {
        const COL_H = 720; // px — 30px per hour
        const todayYmd = toYMD(new Date());
        const weekStart = startOfWeek(focus);

        return (
          <div className="journal-week-outer">
            {/* Day headers */}
            <div className="journal-week-head-row">
              <div className="journal-week-axis-spacer" />
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(weekStart, i);
                const ymd = toYMD(day);
                const isT = ymd === todayYmd;
                return (
                  <div key={ymd} className={`journal-week-col-head${isT ? " is-today" : ""}`}>
                    <span className="journal-week-dow">{WEEKDAYS[day.getDay()]}</span>
                    <span className={`journal-week-date${isT ? " is-today" : ""}`}>{day.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {/* Scrollable body */}
            <div className="journal-week-body">
              {/* Time axis */}
              <div className="journal-week-axis" style={{ height: COL_H }}>
                {Array.from({ length: 9 }, (_, i) => {
                  const h = i * 3;
                  return (
                    <span key={h} className="journal-week-axis-label" style={{ top: (h / 24) * COL_H }}>
                      {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                    </span>
                  );
                })}
              </div>

              {/* Day columns */}
              <div className="journal-week-cols">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(weekStart, i);
                  const ymd = toYMD(day);
                  const isT = ymd === todayYmd;
                  const dayEntries = byDate.get(ymd) ?? [];

                  return (
                    <div
                      key={ymd}
                      className={`journal-week-col${isT ? " is-today" : ""}`}
                      style={{ height: COL_H }}
                    >
                      {/* Hour grid lines every 3h */}
                      {Array.from({ length: 9 }, (_, h) => (
                        <div
                          key={h}
                          className="journal-week-hour-line"
                          style={{ top: (h * 3 / 24) * COL_H }}
                        />
                      ))}

                      {/* NOW line — today's column only */}
                      {isT && (
                        <div
                          className="journal-week-now-line"
                          style={{ top: (nowMin / 1440) * COL_H }}
                        >
                          <span className="journal-week-now-dot" aria-hidden="true" />
                        </div>
                      )}

                      {/* Entries */}
                      {dayEntries.map(e => {
                        const min = minuteOfDay(e.createdAt);
                        return (
                          <div
                            key={e.id}
                            className="journal-week-entry"
                            style={{ top: (min / 1440) * COL_H }}
                          >
                            <span className="journal-week-entry-time">{fmtTime(e.createdAt)}</span>
                            <p className="journal-week-entry-content">{e.content}</p>
                            <button
                              className="journal-delete-btn"
                              onClick={() => deleteEntry(e.id)}
                              aria-label="Delete entry"
                            ><IcTrash /></button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════ MONTH VIEW */}
      {view === "month" && (() => {
        const monthStart = startOfMonth(focus);
        const monthEnd = endOfMonth(focus);
        // Grid starts on the Sunday before monthStart
        const gridStart = startOfWeek(monthStart);
        const totalDays = Math.ceil((endOfMonth(focus).getDate() + monthStart.getDay()) / 7) * 7;
        const todayYmd = toYMD(new Date());

        return (
          <div className="journal-month">
            <div className="journal-month-header">
              {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="journal-month-grid">
              {Array.from({ length: totalDays }, (_, i) => {
                const day = addDays(gridStart, i);
                const ymd = toYMD(day);
                const inMonth = day >= monthStart && day <= monthEnd;
                const dayEntries = byDate.get(ymd) ?? [];
                const isT = ymd === todayYmd;
                return (
                  <div
                    key={ymd}
                    className={`journal-month-cell${!inMonth ? " out-of-month" : ""}${isT ? " is-today" : ""}`}
                    onClick={() => { setFocus(day); setView("day"); }}
                  >
                    <span className="journal-month-cell-num">{day.getDate()}</span>
                    {dayEntries.slice(0, 3).map((e) => (
                      <div key={e.id} className="journal-month-dot" title={e.content} />
                    ))}
                    {dayEntries.length > 3 && (
                      <span className="journal-month-more">+{dayEntries.length - 3}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
