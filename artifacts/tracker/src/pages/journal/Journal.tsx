import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type Entry = {
  id: number;
  subject: string | null;
  content: string;
  entryDate: string;
  startTime: string;
  endTime: string | null;
  color: string;
  createdAt: string;
};

const ENTRY_COLORS: { hex: string; label: string }[] = [
  { hex: "#e0b04e", label: "Amber"  },
  { hex: "#e05555", label: "Red"    },
  { hex: "#e08c3a", label: "Orange" },
  { hex: "#4ecb71", label: "Green"  },
  { hex: "#4e90e0", label: "Blue"   },
  { hex: "#9b4ee0", label: "Purple" },
  { hex: "#e04ea3", label: "Pink"   },
  { hex: "#8a9aaa", label: "Muted"  },
];

type View = "day" | "week" | "month";

/* ── date helpers ──────────────────────────────────────────────────── */
const toYMD = (d: Date) => d.toISOString().slice(0, 10);

function startOfWeek(d: Date) {
  const c = new Date(d); c.setDate(c.getDate() - c.getDay()); return c;
}
function addDays(d: Date, n: number) {
  const c = new Date(d); c.setDate(c.getDate() + n); return c;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function rangeForView(focus: Date, view: View): [string, string] {
  if (view === "day") return [toYMD(focus), toYMD(focus)];
  if (view === "week") { const s = startOfWeek(focus); return [toYMD(s), toYMD(addDays(s, 6))]; }
  return [toYMD(startOfMonth(focus)), toYMD(endOfMonth(focus))];
}

const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS   = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes(), ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${ampm}`;
}
function fmtRange(start: string, end: string | null) {
  return end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
}
function minuteOfDay(iso: string) {
  const d = new Date(iso); return d.getHours() * 60 + d.getMinutes();
}
function nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

/** Convert local HH:MM string + a reference ISO date → full ISO string */
function toISOWithDate(dateIso: string, timeHHMM: string): string {
  return new Date(`${dateIso}T${timeHHMM}:00`).toISOString();
}
/** Extract HH:MM from an ISO timestamp in local time */
function toHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function nowHHMM(): string { return toHHMM(new Date().toISOString()); }

/* ── icons ─────────────────────────────────────────────────────────── */
const IcPlus  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
const IcTrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>;
const IcEdit  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;

/* ── add/edit form ─────────────────────────────────────────────────── */
type EntryFormProps = {
  entryDate: string;
  initial?: Entry;
  onSave: (e: Entry) => void;
  onCancel: () => void;
};
function EntryForm({ entryDate, initial, onSave, onCancel }: EntryFormProps) {
  const [subject,   setSubject]   = useState(initial?.subject ?? "");
  const [content,   setContent]   = useState(initial?.content ?? "");
  const [startHHMM, setStartHHMM] = useState(initial ? toHHMM(initial.startTime) : nowHHMM());
  const [hasEnd,    setHasEnd]    = useState(Boolean(initial?.endTime));
  const [endHHMM,   setEndHHMM]   = useState(initial?.endTime ? toHHMM(initial.endTime) : "");
  const [color,     setColor]     = useState(initial?.color ?? ENTRY_COLORS[0].hex);
  const [date,      setDate]      = useState(initial?.entryDate ?? entryDate);
  const [timesOpen, setTimesOpen] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const showSubject = content.trim().length >= 100 || Boolean(initial?.subject);

  async function submit() {
    setSaving(true);
    try {
      const startIso = toISOWithDate(date, startHHMM);
      const endIso   = hasEnd && endHHMM ? toISOWithDate(date, endHHMM) : null;
      const payload  = {
        subject:   subject.trim() || null,
        content:   content.trim(),
        entryDate: date,
        startTime: startIso,
        endTime:   endIso,
        color,
      };
      const row: Entry = initial
        ? await api.patch<Entry>(`/api/journal/entries/${initial.id}`, payload)
        : await api.post<Entry>("/api/journal/entries", payload);
      onSave(row);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="entry-form">
      {/* Note first */}
      <textarea
        className="entry-form-content"
        placeholder="What's on your mind…"
        value={content}
        rows={2}
        autoFocus={!initial}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
      />

      {/* Subject appears once note is long enough */}
      {showSubject && (
        <input
          className="entry-form-subject"
          placeholder="Subject (shown in previews)"
          value={subject}
          onChange={e => setSubject(e.target.value)}
        />
      )}

      {/* Date / time — collapsed by default */}
      {timesOpen && (
        <div className="entry-form-times">
          <label className="entry-form-time-label">
            <span>Day</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <label className="entry-form-time-label">
            <span>From</span>
            <input type="time" value={startHHMM} onChange={e => setStartHHMM(e.target.value)} />
          </label>
          {hasEnd ? (
            <label className="entry-form-time-label">
              <span>To</span>
              <input type="time" value={endHHMM} onChange={e => setEndHHMM(e.target.value)} />
              <button className="entry-form-remove-end" onClick={() => { setHasEnd(false); setEndHHMM(""); }} aria-label="Remove end time">×</button>
            </label>
          ) : (
            <button className="entry-form-add-end" onClick={() => setHasEnd(true)}>+ end time</button>
          )}
        </div>
      )}

      {/* Bottom row: color · time toggle · cancel · save */}
      <div className="entry-form-actions">
        <div className="entry-form-colors">
          {ENTRY_COLORS.map(c => (
            <button
              key={c.hex}
              className={`entry-color-swatch${color === c.hex ? " selected" : ""}`}
              style={{ background: c.hex }}
              aria-label={c.label}
              onClick={() => setColor(c.hex)}
            />
          ))}
        </div>
        <div className="entry-form-action-right">
          <button
            className={`entry-form-time-toggle${timesOpen ? " active" : ""}`}
            onClick={() => setTimesOpen(o => !o)}
            aria-label="Edit date and time"
            title={timesOpen ? "Hide time" : "Edit date & time"}
          >
            🕐
          </button>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : initial ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── entry card (display mode) ─────────────────────────────────────── */
type EntryCardProps = {
  entry: Entry;
  dim?: boolean;
  onDelete: (id: number) => void;
  onUpdate: (e: Entry) => void;
  entryDate: string;
};
function EntryCard({ entry, dim, onDelete, onUpdate, entryDate }: EntryCardProps) {
  const [editing, setEditing] = useState(false);
  if (editing) return (
    <EntryForm
      entryDate={entryDate}
      initial={entry}
      onSave={e => { onUpdate(e); setEditing(false); }}
      onCancel={() => setEditing(false)}
    />
  );
  return (
    <div className={`journal-feed-row${dim ? " is-future" : ""}`}>
      <span className="journal-feed-time">{fmtRange(entry.startTime, entry.endTime)}</span>
      <span className="journal-feed-node" aria-hidden="true" />
      <div className="journal-feed-card">
        <div className="journal-feed-body">
          {entry.subject && <p className="journal-feed-subject">{entry.subject}</p>}
          {entry.content && <p className="journal-feed-text">{entry.content}</p>}
        </div>
        <div className="journal-feed-actions">
          <button className="journal-action-btn" onClick={() => setEditing(true)} aria-label="Edit"><IcEdit /></button>
          <button className="journal-action-btn danger" onClick={() => onDelete(entry.id)} aria-label="Delete"><IcTrash /></button>
        </div>
      </div>
    </div>
  );
}

/* ── Entry detail modal ─────────────────────────────────────────────── */
function fmtFullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
}

type EntryModalProps = {
  entry: Entry;
  onClose: () => void;
  onUpdate: (e: Entry) => void;
  onDelete: (id: number) => void;
};
function EntryModal({ entry, onClose, onUpdate, onDelete }: EntryModalProps) {
  const [editing, setEditing] = useState(false);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="entry-modal-backdrop" onClick={handleBackdrop}>
      <div className="entry-modal" role="dialog" aria-modal="true">
        <div className="entry-modal-header">
          <span className="entry-modal-date">{fmtFullDate(entry.entryDate + "T00:00:00")}</span>
          <button className="entry-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {editing ? (
          <div className="entry-modal-body">
            <EntryForm
              entryDate={entry.entryDate}
              initial={entry}
              onSave={e => { onUpdate(e); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <div className="entry-modal-body">
              <p className="entry-modal-time">{fmtRange(entry.startTime, entry.endTime)}</p>
              {entry.subject && <h2 className="entry-modal-subject">{entry.subject}</h2>}
              {entry.content && <p className="entry-modal-content">{entry.content}</p>}
              {!entry.subject && !entry.content && (
                <p className="entry-modal-empty">No content.</p>
              )}
            </div>
            <div className="entry-modal-footer">
              <button
                className="journal-action-btn danger"
                onClick={() => { onDelete(entry.id); onClose(); }}
                aria-label="Delete"
              >
                <IcTrash /> Delete
              </button>
              <button className="primary" onClick={() => setEditing(true)}>
                <IcEdit /> Edit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function Journal() {
  const [view,    setView]    = useState<View>("month");
  const [focus,   setFocus]   = useState(() => new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [nowMin,  setNowMin]  = useState(nowMinutes());
  const [modal,   setModal]   = useState<Entry | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchEntries = useCallback(async () => {
    const [from, to] = rangeForView(focus, view);
    setLoading(true);
    try {
      const data = await api.get<Entry[]>(`/api/journal/entries?from=${from}&to=${to}`);
      setEntries(data);
    } finally { setLoading(false); }
  }, [focus, view]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    if (view !== "day" || !timelineRef.current) return;
    timelineRef.current.scrollTop = Math.max(0, (nowMin / 60) * 64 - 160);
  }, [view, focus]);

  function navigate(dir: 1 | -1) {
    setFocus(f => {
      const c = new Date(f);
      if (view === "day")   c.setDate(c.getDate() + dir);
      if (view === "week")  c.setDate(c.getDate() + dir * 7);
      if (view === "month") c.setMonth(c.getMonth() + dir);
      return c;
    });
  }

  async function deleteEntry(id: number) {
    await api.del(`/api/journal/entries/${id}`);
    setEntries(prev => prev.filter(e => e.id !== id));
    setModal(prev => prev?.id === id ? null : prev);
  }
  function updateEntry(updated: Entry) {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
    setModal(prev => prev?.id === updated.id ? updated : prev);
  }

  function periodLabel() {
    if (view === "day") {
      if (toYMD(focus) === toYMD(new Date())) return "Today";
      return focus.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
    }
    if (view === "week") {
      const s = startOfWeek(focus), e = addDays(s, 6);
      return s.getMonth() === e.getMonth()
        ? `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`
        : `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
    }
    return `${MONTHS[focus.getMonth()]} ${focus.getFullYear()}`;
  }

  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.entryDate) ?? []; arr.push(e); byDate.set(e.entryDate, arr);
  }

  const isToday  = toYMD(focus) === toYMD(new Date());
  const todayYmd = toYMD(new Date());

  const nowLabel = (() => {
    const n = new Date(), h = n.getHours(), m = n.getMinutes();
    return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "pm" : "am"}`;
  })();

  return (
    <div className="journal-shell">
      {/* Top bar */}
      <div className="journal-topbar">
        <div className="journal-view-toggle">
          {(["day","week","month"] as View[]).map(v => (
            <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="journal-nav">
          <button className="journal-nav-btn" onClick={() => navigate(-1)} aria-label="Previous">‹</button>
          <span className="journal-period" data-today={view === "day" && isToday ? "true" : "false"}>
            {periodLabel()}
          </span>
          <button className="journal-nav-btn" onClick={() => navigate(1)} aria-label="Next">›</button>
          {!isToday && view === "day" && (
            <button className="journal-today-btn" onClick={() => setFocus(new Date())}>Today</button>
          )}
        </div>
        <button className="journal-add-btn" onClick={() => setAdding(a => !a)} aria-label="Add entry">
          <IcPlus /> New entry
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="journal-add-form">
          <EntryForm
            entryDate={view === "day" ? toYMD(focus) : todayYmd}
            onSave={e => { setEntries(prev => [e, ...prev]); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {loading && <div className="journal-loading">Loading…</div>}

      {/* Entry detail modal */}
      {modal && (
        <EntryModal
          entry={modal}
          onClose={() => setModal(null)}
          onUpdate={updateEntry}
          onDelete={deleteEntry}
        />
      )}

      {/* ════ DAY VIEW ════ */}
      {view === "day" && (() => {
        const dayEntries = [...(byDate.get(toYMD(focus)) ?? [])].sort(
          (a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const past   = isToday ? dayEntries.filter(e => minuteOfDay(e.startTime) <= nowMin) : dayEntries;
        const future = isToday ? dayEntries.filter(e => minuteOfDay(e.startTime) >  nowMin) : [];
        const dayPct = Math.min(100, Math.round((nowMin / 1440) * 100));

        return (
          <div className="journal-day-v2">
            {isToday && (
              <div className="journal-progress-bar">
                <div className="journal-progress-fill" style={{ width:`${dayPct}%` }} />
                <span className="journal-progress-label">{dayPct}%</span>
              </div>
            )}
            <div className="journal-feed">
              {past.map(e => (
                <EntryCard key={e.id} entry={e} entryDate={toYMD(focus)}
                  onDelete={deleteEntry} onUpdate={updateEntry} />
              ))}
              {isToday && (
                <div className="journal-feed-now">
                  <span className="journal-feed-now-dot" aria-hidden="true" />
                  <span className="journal-feed-now-label">now · {nowLabel}</span>
                </div>
              )}
              {future.map(e => (
                <EntryCard key={e.id} entry={e} dim entryDate={toYMD(focus)}
                  onDelete={deleteEntry} onUpdate={updateEntry} />
              ))}
              {dayEntries.length === 0 && (
                <p className="journal-feed-empty">
                  {isToday ? "Nothing logged yet — add your first entry above." : "No entries for this day."}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* ════ WEEK VIEW ════ */}
      {view === "week" && (() => {
        const COL_H = 720;
        const weekStart = startOfWeek(focus);
        return (
          <div className="journal-week-outer">
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
            <div className="journal-week-body">
              <div className="journal-week-axis" style={{ height: COL_H }}>
                {Array.from({ length: 9 }, (_, i) => {
                  const h = i * 3;
                  return (
                    <span key={h} className="journal-week-axis-label" style={{ top: (h/24)*COL_H }}>
                      {h===0?"12a":h<12?`${h}a`:h===12?"12p":`${h-12}p`}
                    </span>
                  );
                })}
              </div>
              <div className="journal-week-cols">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(weekStart, i);
                  const ymd = toYMD(day);
                  const isT = ymd === todayYmd;
                  const dayEntries = byDate.get(ymd) ?? [];
                  return (
                    <div key={ymd} className={`journal-week-col${isT?" is-today":""}`} style={{ height: COL_H }}>
                      {Array.from({ length: 9 }, (_, h) => (
                        <div key={h} className="journal-week-hour-line" style={{ top: (h*3/24)*COL_H }} />
                      ))}
                      {isT && (
                        <div className="journal-week-now-line" style={{ top: (nowMin/1440)*COL_H }}>
                          <span className="journal-week-now-dot" aria-hidden="true" />
                        </div>
                      )}
                      {dayEntries.map(e => {
                        const startMin = minuteOfDay(e.startTime);
                        const endMin   = e.endTime ? minuteOfDay(e.endTime) : null;
                        const top      = (startMin / 1440) * COL_H;
                        const height   = endMin && endMin > startMin
                          ? ((endMin - startMin) / 1440) * COL_H
                          : 3;
                        const snippet  = (e.subject || e.content || "").slice(0, 80);
                        return (
                          <div key={e.id} className="journal-week-line"
                            style={{ top, height, background: e.color }}
                            onClick={() => setModal(e)}
                            role="button" tabIndex={0}
                            onKeyDown={ev => ev.key === "Enter" && setModal(e)}>
                            <div className="journal-week-line-tip">
                              <span className="tip-time">{fmtRange(e.startTime, e.endTime)}</span>
                              {e.subject && <strong className="tip-subject">{e.subject}</strong>}
                              {e.content && <span className="tip-content">{e.content.slice(0, 80)}{e.content.length > 80 ? "…" : ""}</span>}
                              {!e.subject && !e.content && <span className="tip-content">No content</span>}
                            </div>
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

      {/* ════ MONTH VIEW ════ */}
      {view === "month" && (() => {
        const monthStart = startOfMonth(focus);
        const monthEnd   = endOfMonth(focus);
        const gridStart  = startOfWeek(monthStart);
        const totalDays  = Math.ceil((monthEnd.getDate() + monthStart.getDay()) / 7) * 7;
        return (
          <div className="journal-month">
            <div className="journal-month-header">
              {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
            </div>
            <div className="journal-month-grid">
              {Array.from({ length: totalDays }, (_, i) => {
                const day = addDays(gridStart, i);
                const ymd = toYMD(day);
                const inMonth   = day >= monthStart && day <= monthEnd;
                const dayEntries = byDate.get(ymd) ?? [];
                const isT = ymd === todayYmd;
                return (
                  <div key={ymd}
                    className={`journal-month-cell${!inMonth?" out-of-month":""}${isT?" is-today":""}`}
                    onClick={() => { setFocus(day); setView("day"); }}>
                    {isT && (
                      <div className="journal-month-now-bar"
                        style={{ width:`${Math.min(100,(nowMin/1440)*100)}%` }} />
                    )}
                    <span className="journal-month-cell-num">{day.getDate()}</span>
                    <div className="journal-month-lines">
                      {dayEntries.slice(0, 5).map(e => (
                        <div key={e.id} className="journal-month-line"
                          style={{ background: e.color }}
                          onClick={ev => { ev.stopPropagation(); setModal(e); }}>
                          <div className="journal-month-line-tip">
                            <span className="tip-time">{fmtRange(e.startTime, e.endTime)}</span>
                            {e.subject && <strong className="tip-subject">{e.subject}</strong>}
                            {e.content && <span className="tip-content">{e.content.slice(0, 80)}{e.content.length > 80 ? "…" : ""}</span>}
                          </div>
                        </div>
                      ))}
                      {dayEntries.length > 5 && (
                        <span className="journal-month-more">+{dayEntries.length - 5}</span>
                      )}
                    </div>
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
