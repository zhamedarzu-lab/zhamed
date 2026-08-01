import React, { useCallback, useEffect, useRef, useState } from "react";
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
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
const IcSun   = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5"/>
    <line x1="12" y1="2"    x2="12" y2="5"/>
    <line x1="12" y1="19"   x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
    <line x1="2"  y1="12"   x2="5"  y2="12"/>
    <line x1="19" y1="12"   x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
  </svg>
);

/* ── punch clock ───────────────────────────────────────────────────── */
const PUNCH_MAX = 3;
type PunchState = { id: string; startTime: string; entryDate: string; content: string; color: string };
const PUNCH_KEY = "journal-punches";

function loadPunches(): PunchState[] {
  try { return JSON.parse(localStorage.getItem(PUNCH_KEY) ?? "[]"); }
  catch { return []; }
}
function savePunches(ps: PunchState[]) {
  localStorage.setItem(PUNCH_KEY, JSON.stringify(ps));
}

function fmtElapsed(startIso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2,"0"), ss = String(s).padStart(2,"0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

type PunchRowProps = {
  punch: PunchState;
  onUpdate: (p: PunchState) => void;
  onPunchOut: (id: string) => void;
  onCancel: (id: string) => void;
};
function PunchRow({ punch, onUpdate, onPunchOut, onCancel }: PunchRowProps) {
  const [elapsed, setElapsed] = useState(() => fmtElapsed(punch.startTime));
  useEffect(() => {
    const id = setInterval(() => setElapsed(fmtElapsed(punch.startTime)), 1000);
    return () => clearInterval(id);
  }, [punch.startTime]);

  const since = new Date(punch.startTime).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <div className="punch-banner-row">
      <span className="punch-banner-live" style={{ background: punch.color }} aria-hidden="true" />
      <span className="punch-banner-since">since {since}</span>
      <span className="punch-banner-elapsed">{elapsed}</span>
      <span className="punch-banner-label">{punch.content || <em>no note</em>}</span>
      <button className="punch-banner-out" onClick={() => onPunchOut(punch.id)}>Punch out</button>
      <button className="punch-banner-cancel" onClick={() => onCancel(punch.id)} aria-label="Cancel punch" title="Discard without saving">✕</button>
    </div>
  );
}

/* ── add/edit form ─────────────────────────────────────────────────── */
type EntryFormProps = {
  entryDate: string;
  initial?: Entry;
  onSave: (e: Entry) => void;
  onCancel: () => void;
  onPunch?: (note: string, color: string) => void;
};
function EntryForm({ entryDate, initial, onSave, onCancel, onPunch }: EntryFormProps) {
  const [subject,    setSubject]    = useState(initial?.subject ?? "");
  const [content,    setContent]    = useState(initial?.content ?? "");
  const [startHHMM,  setStartHHMM]  = useState(initial ? toHHMM(initial.startTime) : nowHHMM());
  const [hasEnd,     setHasEnd]     = useState(Boolean(initial?.endTime));
  const [endHHMM,    setEndHHMM]    = useState(initial?.endTime ? toHHMM(initial.endTime) : "");
  const [color,      setColor]      = useState(initial?.color ?? ENTRY_COLORS[0].hex);
  const [date,       setDate]       = useState(initial?.entryDate ?? entryDate);
  const [timesOpen,  setTimesOpen]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [punchMode,  setPunchMode]  = useState(false);
  const [punchNote,  setPunchNote]  = useState("");

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

  /* Punch-prep mode — type first, then confirm to start the clock */
  if (punchMode) return (
    <div className="entry-form entry-form--punch">
      <input
        className="entry-form-content punch-prep-input"
        placeholder="What are you about to do?"
        value={punchNote}
        autoFocus
        onChange={e => setPunchNote(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && punchNote.trim()) onPunch?.(punchNote.trim(), color); }}
      />
      <div className="entry-form-actions">
        <div className="entry-form-colors">
          {ENTRY_COLORS.map(c => (
            <button key={c.hex} className={`entry-color-swatch${color === c.hex ? " selected" : ""}`}
              style={{ background: c.hex }} aria-label={c.label} onClick={() => setColor(c.hex)} />
          ))}
        </div>
        <div className="entry-form-action-right">
          <button onClick={() => setPunchMode(false)}>Cancel</button>
          <button className="primary" disabled={!punchNote.trim()}
            onClick={() => onPunch?.(punchNote.trim(), color)}>
            Punch in
          </button>
        </div>
      </div>
    </div>
  );

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
          {onPunch && !punchMode && (
            <button
              className="entry-form-punch-btn"
              onClick={() => setPunchMode(true)}
              type="button"
            >Punch</button>
          )}
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
    <div className="journal-feed-row">
      <span className="journal-feed-time">{fmtRange(entry.startTime, entry.endTime)}</span>
      <span className="journal-feed-node" style={{ "--dot-color": entry.color } as React.CSSProperties} aria-hidden="true" />
      <EntryForm
        entryDate={entryDate}
        initial={entry}
        onSave={e => { onUpdate(e); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    </div>
  );
  return (
    <div className={`journal-feed-row${dim ? " is-future" : ""}`}>
      <span className="journal-feed-time">{fmtRange(entry.startTime, entry.endTime)}</span>
      <span className="journal-feed-node" style={{ "--dot-color": entry.color } as React.CSSProperties} aria-hidden="true" />
      <div className="journal-feed-card" style={{ "--entry-color": entry.color } as React.CSSProperties}>
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

/* ── Day entries popup ──────────────────────────────────────────────── */
type DayPopupProps = {
  date: Date;
  entries: Entry[];
  onClose: () => void;
  onSelect: (e: Entry) => void;
  onGoToDay: () => void;
};
function DayPopup({ date, entries, onClose, onSelect, onGoToDay }: DayPopupProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return (
    <div className="entry-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="day-popup" role="dialog" aria-modal="true">
        <div className="day-popup-header">
          <span className="day-popup-title">
            {date.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
          </span>
          <button className="entry-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="day-popup-list">
          {sorted.map(e => (
            <button key={e.id} className="day-popup-row" onClick={() => { onClose(); onSelect(e); }}>
              <span className="day-popup-dot" style={{ background: e.color }} />
              <span className="day-popup-time">{fmtRange(e.startTime, e.endTime)}</span>
              <span className="day-popup-label">
                {e.subject || e.content.slice(0, 60) || "—"}
              </span>
            </button>
          ))}
        </div>
        <div className="day-popup-footer">
          <button onClick={() => { onClose(); onGoToDay(); }}>Open day view</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function Journal() {
  const [view,     setView]     = useState<View>("month");
  const [focus,    setFocus]    = useState(() => new Date());
  const [entries,  setEntries]  = useState<Entry[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [nowMin,   setNowMin]   = useState(nowMinutes());
  const [modal,    setModal]    = useState<Entry | null>(null);
  const [dayPopup, setDayPopup] = useState<{ date: Date; entries: Entry[] } | null>(null);
  const [punches,  setPunchesRaw] = useState<PunchState[]>(loadPunches);
  const timelineRef  = useRef<HTMLDivElement>(null);
  const hdayScrollRef = useRef<HTMLDivElement>(null);

  function setPunches(ps: PunchState[]) { savePunches(ps); setPunchesRaw(ps); }

  function punchIn(note: string, color: string) {
    if (punches.length >= PUNCH_MAX) return;
    const now = new Date();
    const p: PunchState = { id: String(Date.now()), startTime: now.toISOString(), entryDate: toYMD(now), content: note, color };
    setPunches([...punches, p]);
    setAdding(false);
  }

  async function punchOut(id: string) {
    const punch = punches.find(p => p.id === id);
    if (!punch) return;
    const endTime = new Date().toISOString();
    try {
      const entry = await api.post<Entry>("/api/journal/entries", {
        entryDate: punch.entryDate,
        content:   punch.content.trim() || "(punched in)",
        startTime: punch.startTime,
        endTime,
        color:     punch.color,
      });
      setEntries(prev => [entry, ...prev]);
      setPunches(punches.filter(p => p.id !== id));  // only remove on success
    } catch {
      // save failed — leave the punch alive so nothing is lost
    }
  }

  function updatePunch(updated: PunchState) {
    const next = punches.map(p => p.id === updated.id ? updated : p);
    setPunches(next);
  }

  function cancelPunch(id: string) {
    setPunches(punches.filter(p => p.id !== id));
  }

  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday  = toYMD(focus) === toYMD(new Date());

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
    if (view !== "day" || !hdayScrollRef.current) return;
    const COL_W = 1200 / 24;
    const currentHour = Math.floor(nowMin / 60);
    const targetX = isToday ? Math.max(0, currentHour * COL_W - 160) : 0;
    hdayScrollRef.current.scrollLeft = targetX;
  }, [view, focus, isToday, nowMin]);

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
            onPunch={punches.length >= PUNCH_MAX ? undefined : punchIn}
          />
        </div>
      )}

      {loading && <div className="journal-loading">Loading…</div>}

      {/* Day entries popup */}
      {dayPopup && (
        <DayPopup
          date={dayPopup.date}
          entries={dayPopup.entries}
          onClose={() => setDayPopup(null)}
          onSelect={e => setModal(e)}
          onGoToDay={() => { setFocus(dayPopup.date); setView("day"); }}
        />
      )}

      {/* Entry detail modal */}
      {modal && (
        <EntryModal
          entry={modal}
          onClose={() => setModal(null)}
          onUpdate={updateEntry}
          onDelete={deleteEntry}
        />
      )}

      {/* ════ DAY VIEW — 2D grid: X=hour, Y=minute within hour ════ */}
      {view === "day" && (() => {
        const dayEntries = [...(byDate.get(toYMD(focus)) ?? [])].sort(
          (a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const TW     = 1200;
        const COL_W  = TW / 24;   // 50 px per hour column
        const GRID_H = 240;       // px — top=:00, bottom=:59
        const AXIS_H = 28;

        const fmtH = (h: number) =>
          h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;

        const curHour  = Math.floor(nowMin / 60);
        const curMinIH = nowMin % 60;                     // minute within current hour
        const nowY     = (curMinIH / 60) * GRID_H;

        return (
          <>
          <div className="journal-hday journal-hday--2d">
            {/* Fixed minute-axis panel */}
            <div className="journal-hday-min-axis" style={{ paddingTop: AXIS_H }}>
              <div style={{ position: "relative", height: GRID_H }}>
                {[0, 15, 30, 45].map(m => (
                  <span key={m} className="journal-hday-min-label"
                    style={{ top: (m / 60) * GRID_H }}>
                    :{String(m).padStart(2, "0")}
                  </span>
                ))}
              </div>
            </div>

            {/* Scrollable 2D grid */}
            <div className="journal-hday-scroll" ref={hdayScrollRef}>
              <div className="journal-hday-inner" style={{ width: TW, height: AXIS_H + GRID_H }}>

                {/* Hour axis */}
                <div className="journal-hday-axis" style={{ height: AXIS_H }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h}
                      className={`journal-hday-hour${h === 12 ? " is-noon" : ""}${isToday && h === curHour ? " is-current" : ""}`}
                      style={{ left: h * COL_W + COL_W / 2 }}>
                      {h === 12 ? <><IcSun /><em>noon</em></> : fmtH(h)}
                    </span>
                  ))}
                </div>

                {/* Grid area */}
                <div className="journal-hday-lane" style={{ top: AXIS_H, height: GRID_H }}>

                  {/* Vertical hour separators */}
                  {Array.from({ length: 25 }, (_, h) => (
                    <div key={h}
                      className={`journal-hday-gridline${h === 12 ? " is-noon" : ""}`}
                      style={{ left: h * COL_W }} />
                  ))}

                  {/* Horizontal minute guides */}
                  {[0, 15, 30, 45].map(m => (
                    <div key={m} className={`journal-hday-hguide${m === 0 ? " is-top" : ""}`}
                      style={{ top: (m / 60) * GRID_H }} />
                  ))}

                  {/* Current-hour column highlight */}
                  {isToday && (
                    <div className="journal-hday-curhour"
                      style={{ left: curHour * COL_W, width: COL_W }} />
                  )}

                  {/* NOW — horizontal line + pulsing dot at exact (hour, minute) */}
                  {isToday && (
                    <div className="journal-hday-now-row" style={{ top: nowY }}>
                      <span className="journal-hday-now-dot"
                        style={{ left: curHour * COL_W + COL_W / 2 }} />
                      <span className="journal-hday-now-time"
                        style={{ left: curHour * COL_W + COL_W / 2 + 8 }}>
                        {nowLabel}
                      </span>
                    </div>
                  )}

                  {/* Span overlays — low-opacity fill for timed entries */}
                  {dayEntries.filter(e => e.endTime).map(e => {
                    const sH = new Date(e.startTime).getHours();
                    const sM = new Date(e.startTime).getMinutes();
                    const eH = new Date(e.endTime!).getHours();
                    const eM = new Date(e.endTime!).getMinutes();
                    if (eH * 60 + eM <= sH * 60 + sM) return null;
                    const slices = [];
                    for (let h = sH; h <= eH; h++) {
                      const sliceTop    = h === sH ? (sM / 60) * GRID_H : 0;
                      const sliceBottom = h === eH ? (eM / 60) * GRID_H : GRID_H;
                      if (sliceBottom > sliceTop) slices.push(
                        <div key={h}
                          className="journal-hday-span"
                          style={{ left: h * COL_W, top: sliceTop, width: COL_W, height: sliceBottom - sliceTop, background: e.color } as React.CSSProperties} />
                      );
                    }
                    return <React.Fragment key={e.id}>{slices}</React.Fragment>;
                  })}

                  {/* Entries — placed at (startHour col, startMinute row) */}
                  {dayEntries.map(e => {
                    const startH   = new Date(e.startTime).getHours();
                    const startM   = new Date(e.startTime).getMinutes();
                    const endH     = e.endTime ? new Date(e.endTime).getHours()   : null;
                    const endM     = e.endTime ? new Date(e.endTime).getMinutes() : null;

                    const top      = (startM / 60) * GRID_H;
                    const durMin   = endH !== null && endM !== null
                      ? Math.max(0, (endH - startH) * 60 + (endM - startM)) : 0;
                    // height: proportional to duration within the starting hour, min 22px
                    const heightPx = durMin > 0
                      ? Math.max(22, (Math.min(durMin, 60 - startM) / 60) * GRID_H)
                      : 22;

                    const isFuture = isToday && (startH * 60 + startM) > nowMin;
                    return (
                      <div key={e.id}
                        className={`journal-hday-entry${isFuture ? " is-future" : ""}`}
                        style={{
                          left:   startH * COL_W + 2,
                          top,
                          width:  COL_W - 4,
                          height: heightPx,
                          "--entry-color": e.color,
                        } as React.CSSProperties}
                        onClick={() => setModal(e)}
                        role="button" tabIndex={0}
                        onKeyDown={ev => ev.key === "Enter" && setModal(e)}>
                        <p className="journal-hday-entry-label">
                          {e.subject || (e.content ? e.content.slice(0, 60) : "—")}
                        </p>
                        <p className="journal-hday-entry-time">{fmtRange(e.startTime, e.endTime)}</p>
                      </div>
                    );
                  })}

                  {dayEntries.length === 0 && (
                    <p className="journal-hday-empty">
                      {isToday ? "Nothing logged yet." : "No entries for this day."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Entry list below grid */}
          {dayEntries.length > 0 && (
            <div className="journal-hday-list">
              {dayEntries.map(e => (
                <button key={e.id} className="journal-hday-list-row" onClick={() => setModal(e)}>
                  <span className="journal-hday-list-dot" style={{ background: e.color } as React.CSSProperties} />
                  <span className="journal-hday-list-time">{fmtRange(e.startTime, e.endTime)}</span>
                  <span className="journal-hday-list-label">{e.subject || e.content || "—"}</span>
                </button>
              ))}
            </div>
          )}
          </>
        );
      })()}

      {/* ════ WEEK VIEW ════ */}
      {view === "week" && (() => {
        const MAJOR_HOURS = new Set([6, 12, 18]);
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
              <div className="journal-week-axis">
                {Array.from({ length: 9 }, (_, i) => {
                  const h = i * 3;
                  const isMajor = MAJOR_HOURS.has(h);
                  return (
                    <span key={h}
                      className={`journal-week-axis-label${isMajor ? " major" : ""}`}
                      style={{ top: `${(h/24)*100}%` }}>
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
                    <div key={ymd} className={`journal-week-col${isT?" is-today":""}`}>
                      {Array.from({ length: 9 }, (_, h) => {
                        const hour = h * 3;
                        const isMajor = MAJOR_HOURS.has(hour);
                        return (
                          <div key={h}
                            className={`journal-week-hour-line${isMajor ? " major" : ""}`}
                            style={{ top: `${(hour/24)*100}%` }} />
                        );
                      })}
                      {isT && (
                        <div className="journal-week-now-line" style={{ top: `${(nowMin/1440)*100}%` }}>
                          <span className="journal-week-now-dot" aria-hidden="true" />
                        </div>
                      )}
                      {dayEntries.map(e => {
                        const startMin = minuteOfDay(e.startTime);
                        const endMin   = e.endTime ? minuteOfDay(e.endTime) : null;
                        const topPct   = `${(startMin / 1440) * 100}%`;
                        const heightVal = endMin && endMin > startMin
                          ? `${((endMin - startMin) / 1440) * 100}%`
                          : 3;
                        return (
                          <div key={e.id} className="journal-week-line"
                            style={{ top: topPct, height: heightVal, background: e.color }}
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
                    onClick={() => {
                      if (dayEntries.length > 0) setDayPopup({ date: day, entries: dayEntries });
                      else { setFocus(day); setView("day"); }
                    }}>
                    {isT && (
                      <div className="journal-month-now-bar"
                        style={{ width:`${Math.min(100,(nowMin/1440)*100)}%` }} />
                    )}
                    <span className="journal-month-cell-num">{day.getDate()}</span>
                    <div className="journal-month-lines">
                      {dayEntries.slice(0, 5).map(e => (
                        <div key={e.id} className="journal-month-line"
                          style={{ background: e.color }} />
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

      {/* Punch banners — up to 3, stacked at the bottom */}
      {punches.length > 0 && (
        <div className="punch-banner">
          {punches.map(p => (
            <PunchRow key={p.id} punch={p} onUpdate={updatePunch} onPunchOut={punchOut} onCancel={cancelPunch} />
          ))}
        </div>
      )}
    </div>
  );
}
