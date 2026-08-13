import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import {
  type Entry,
  ENTRY_COLORS,
  toISOWithDate, toHHMM, nowHHMM,
  fmtTime, fmtRange, fmtFullDate,
  IcTrash, IcEdit,
  EntryForm, EntryModal,
} from "./EntryModal";
import HighlightModal, { type DayHighlight } from "./HighlightModal";
import HighlightCountdown from "../../components/HighlightCountdown";

type View = "day" | "week" | "month" | "year";

/** Format a raw "HH:MM" (24-hour) string → "h:mm am/pm" */
function fmtHHMM(hhmm: string): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "pm" : "am"}`;
}

/* ── black color visibility helper ────────────────────────────────── */
const BLACK = "#1c1c1e";
const BLACK_STRIPE      = "repeating-linear-gradient(45deg, #1c1c1e, #1c1c1e 4px, rgba(255,255,255,0.6) 4px, rgba(255,255,255,0.6) 5px)";
const BLACK_STRIPE_WEEK = "repeating-linear-gradient(45deg, #1c1c1e, #1c1c1e 4px, rgba(255,255,255,0.28) 4px, rgba(255,255,255,0.28) 5px)";
const blackRing: React.CSSProperties = { boxShadow: "0 0 0 2px #ffffff" };
function br(color: string): React.CSSProperties { return color === BLACK ? blackRing : {}; }

/** Return #111 or #fff depending on which gives better contrast on the given hex bg. */
function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#111" : "#fff";
}

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

/* ── Period notes ──────────────────────────────────────────────────── */
type PeriodNote = { id: number; periodType: string; periodKey: string; content: string; createdAt: string };

function isoWeekKey(d: Date): string {
  const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const w = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}-W${String(w).padStart(2, "0")}`;
}
function periodKeyFor(tab: string, d: Date): string {
  if (tab === "day")   return toYMD(d);
  if (tab === "week")  return isoWeekKey(d);
  if (tab === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return String(d.getFullYear());
}

function rangeForView(focus: Date, view: View): [string, string] {
  // Fetch one extra day back so cross-midnight entries (started yesterday,
  // ended today) are included in the result set.
  if (view === "day") return [toYMD(addDays(focus, -1)), toYMD(focus)];
  if (view === "week") { const s = startOfWeek(focus); return [toYMD(addDays(s, -1)), toYMD(addDays(s, 6))]; }
  if (view === "year") { const y = focus.getFullYear(); return [`${y}-01-01`, `${y}-12-31`]; }
  // Fetch one extra day back so cross-midnight carryovers from the last day of the previous month appear on the 1st.
  return [toYMD(addDays(startOfMonth(focus), -1)), toYMD(endOfMonth(focus))];
}

/** Entries that started the day before `ymd` but ended on `ymd` (cross-midnight). */
function carryoversForDate(ymd: string, allEntries: Entry[]): Entry[] {
  const prevYmd = toYMD(addDays(new Date(ymd + "T00:00:00"), -1));
  return allEntries.filter(e =>
    e.entryDate === prevYmd &&
    !!e.endTime &&
    toYMD(new Date(e.endTime)) >= ymd
  );
}

const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS   = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function minuteOfDay(iso: string) {
  const d = new Date(iso); return d.getHours() * 60 + d.getMinutes();
}
function nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

/* ── icons (local only) ─────────────────────────────────────────────── */
const IcPlus  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
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


/* ── entry card (display mode) ─────────────────────────────────────── */
type EntryCardProps = {
  entry: Entry;
  dim?: boolean;
  onDelete: (id: number) => void;
  onUpdate: (e: Entry) => void;
  entryDate: string;
};
function EntryCard({ entry, dim, onDelete, onUpdate, entryDate }: EntryCardProps) {
  const [editing,    setEditing]    = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [isOpenEnd,  setIsOpenEnd]  = useState(false);

  const isOpener = entry.subject?.startsWith("(((");
  const isCloser = entry.subject?.startsWith(")))");

  // Check if this opener is still unresolved
  useEffect(() => {
    if (!isOpener) return;
    api.get<Entry[]>("/api/journal/loose-ends")
      .then(list => setIsOpenEnd(list.some(e => e.id === entry.id)))
      .catch(() => setIsOpenEnd(false));
  }, [isOpener, entry.id]);

  function handleDeleteClick() {
    if (isOpener && isOpenEnd) {
      setConfirmMsg("This is an open loose end — delete anyway?");
      return;
    }
    if (isCloser && entry.looseEndLink) {
      setConfirmMsg("This will reopen the linked loose end — delete anyway?");
      return;
    }
    onDelete(entry.id);
  }

  if (editing) return (
    <div className="journal-feed-row">
      <span className="journal-feed-time">{fmtRange(entry.startTime, entry.endTime)}</span>
      <span className="journal-feed-node" style={{ "--dot-color": entry.color, ...(entry.color === BLACK ? { "--dot-ring": "rgba(255,255,255,0.65)" } : {}) } as React.CSSProperties} aria-hidden="true" />
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
      <span className="journal-feed-node" style={{ "--dot-color": entry.color, ...(entry.color === BLACK ? { "--dot-ring": "rgba(255,255,255,0.65)" } : {}) } as React.CSSProperties} aria-hidden="true" />
      <div className="journal-feed-card" style={{ "--entry-color": entry.color, ...(entry.color === BLACK ? { borderLeftColor: "rgba(255,255,255,0.55)" } : {}) } as React.CSSProperties}>
        <div className="journal-feed-body">
          {entry.subject && <p className="journal-feed-subject">{entry.subject}</p>}
          {entry.content && <p className="journal-feed-text">{entry.content}</p>}
        </div>
        {confirmMsg ? (
          <div className="journal-feed-confirm">
            <span className="journal-feed-confirm-msg">{confirmMsg}</span>
            <button onClick={() => setConfirmMsg(null)}>Cancel</button>
            <button className="journal-action-btn danger" onClick={() => onDelete(entry.id)}>
              <IcTrash /> Delete
            </button>
          </div>
        ) : (
          <div className="journal-feed-actions">
            <button className="journal-action-btn" onClick={() => setEditing(true)} aria-label="Edit"><IcEdit /></button>
            <button className="journal-action-btn danger" onClick={handleDeleteClick} aria-label="Delete"><IcTrash /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Day entries popup ──────────────────────────────────────────────── */
type DayPopupProps = {
  date: Date;
  entries: Entry[];
  highlight: DayHighlight | null;
  dayNotes: PeriodNote[];
  onClose: () => void;
  onSelect: (e: Entry) => void;
  onGoToDay: () => void;
  onGoToWeek: () => void;
  onHighlight: () => void;
  onAddEntry: () => void;
  onDeleteDayNote: (id: number) => Promise<void>;
  onAddDayNote: (content: string) => Promise<void>;
  onEditDayNote: (id: number, content: string) => Promise<void>;
};
function DayPopup({ date, entries, highlight, dayNotes, onClose, onSelect, onGoToDay, onGoToWeek, onHighlight, onAddEntry, onDeleteDayNote, onAddDayNote, onEditDayNote }: DayPopupProps) {
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [noteInputOpen, setNoteInputOpen] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (notesModalOpen) { setNotesModalOpen(false); setNoteInputOpen(false); setNoteInput(""); setEditingId(null); }
        else onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, notesModalOpen]);

  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const notesTitle = dayNotes.length === 1 ? `Note for ${dateLabel}` : `Notes for ${dateLabel}`;
  const closeDpNotesModal = () => { setNotesModalOpen(false); setNoteInputOpen(false); setNoteInput(""); setEditingId(null); setEditContent(""); };

  async function handleAddNote() {
    const content = noteInput.trim();
    if (!content || noteSaving) return;
    setNoteSaving(true);
    try { await onAddDayNote(content); setNoteInput(""); setNoteInputOpen(false); }
    finally { setNoteSaving(false); }
  }

  async function handleEditSave(id: number) {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    await onEditDayNote(id, trimmed);
    setEditingId(null);
    setEditContent("");
  }

  return (
    <>
    <div className="entry-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="day-popup" role="dialog" aria-modal="true">
        <div className="day-popup-header">
          <span className="day-popup-title">
            {date.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
          </span>
          {highlight && (
            <span className="day-popup-highlight-badge"
              style={{ background: highlight.color, color: contrastColor(highlight.color) }}>
              {highlight.label}
            </span>
          )}
          <button className="entry-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="day-popup-list">
          {/* Note block — opens modal */}
          <div className="dp-note-block">
            <button className="dp-note-hd" onClick={() => setNotesModalOpen(true)}>
              <span className="dp-note-hd-label">{dayNotes.length === 1 ? "Note" : dayNotes.length > 1 ? `Notes` : "Note"}</span>
              {dayNotes.length > 0 && <span className="pnote-count">{dayNotes.length}</span>}
            </button>
          </div>
          {highlight && (
            <button className="day-popup-row day-popup-row--highlight" onClick={() => { onClose(); onHighlight(); }}>
              <span className="day-popup-dot" style={{ background: highlight.color, ...br(highlight.color) }} />
              <span className="day-popup-time">
                {highlight.startTime
                  ? highlight.endTime
                    ? `${fmtHHMM(highlight.startTime)} – ${fmtHHMM(highlight.endTime)}`
                    : fmtHHMM(highlight.startTime)
                  : "All day"}
              </span>
              <span className="day-popup-label">✦ {highlight.label || "Highlight"}</span>
            </button>
          )}
          {sorted.length === 0 && !highlight
            ? <p className="day-popup-empty">No entries yet.</p>
            : sorted.map(e => {
                const isCarryover = e.entryDate !== toYMD(date);
                return (
                  <button key={e.id} className={`day-popup-row${isCarryover ? " is-carryover" : ""}`} onClick={() => { onClose(); onSelect(e); }}>
                    <span className="day-popup-dot" style={{ background: e.color, ...br(e.color) }} />
                    {isCarryover
                      ? <span className="day-popup-time" style={{ fontStyle: "italic" }}>— {e.endTime ? fmtTime(e.endTime) : ""}</span>
                      : <span className="day-popup-time">{fmtRange(e.startTime, e.endTime)}</span>
                    }
                    <span className="day-popup-label">{e.subject || e.content.slice(0, 60) || "—"}</span>
                  </button>
                );
              })
          }
        </div>
        <div className="day-popup-footer">
          {!highlight && (
            <button className="day-popup-highlight-btn" onClick={() => { onClose(); onHighlight(); }}>Highlight</button>
          )}
          <button onClick={() => { onClose(); onGoToWeek(); }}>Week</button>
          <button onClick={() => { onClose(); onGoToDay(); }}>Day</button>
          <button className="day-popup-add-btn" onClick={() => { onClose(); onAddEntry(); }} aria-label="Add entry">+Entry</button>
        </div>
      </div>
    </div>

    {/* Day notes modal — rendered above DayPopup */}
    {notesModalOpen && (
      <div className="pnm-backdrop pnm-backdrop--above" onClick={closeDpNotesModal}>
        <div className="pnm-sheet" onClick={e => e.stopPropagation()}>
          <div className="pnm-header">
            <span className="pnm-title">{notesTitle}</span>
            <button className="pnm-close" onClick={closeDpNotesModal} aria-label="Close">✕</button>
          </div>
          <div className="pnm-body">
            {dayNotes.length === 0 ? (
              <p className="pnm-empty">No notes yet.</p>
            ) : (
              <div className="pnm-list">
                {dayNotes.map((n, i) => (
                  <div key={n.id} className="pnm-entry">
                    <span className="pnm-entry-num">{i + 1}</span>
                    {editingId === n.id ? (
                      <input
                        className="pnm-inline-edit"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") void handleEditSave(n.id); if (e.key === "Escape") { setEditingId(null); setEditContent(""); } }}
                        onBlur={() => void handleEditSave(n.id)}
                        autoFocus
                      />
                    ) : (
                      <p className="pnm-entry-text" onDoubleClick={() => { setEditingId(n.id); setEditContent(n.content); }}>{n.content}</p>
                    )}
                    <button className="pnm-entry-del" onClick={() => void onDeleteDayNote(n.id)} aria-label="Delete note">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="pnm-footer">
              {noteInputOpen ? (
                <div className="pnm-input-row">
                  <input
                    className="pnm-input"
                    placeholder={`Add a note for ${dateLabel}…`}
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleAddNote(); if (e.key === "Escape") { setNoteInputOpen(false); setNoteInput(""); } }}
                    autoFocus
                  />
                  <button className="pnm-submit" onClick={() => void handleAddNote()} disabled={!noteInput.trim() || noteSaving}>↑</button>
                </div>
              ) : (
                <button className="pnm-add-trigger" onClick={() => setNoteInputOpen(true)}>+ Add note</button>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function Journal() {
  const [searchParams] = useSearchParams();
  const [view,     setView]     = useState<View>(() => {
    const v = searchParams.get("view");
    return (v === "day" || v === "week" || v === "month" || v === "year") ? v : "month";
  });
  const [focus,    setFocus]    = useState(() => {
    const d = searchParams.get("date");
    if (d) { const p = new Date(d + "T00:00:00"); if (!isNaN(p.getTime())) return p; }
    return new Date();
  });
  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [highlights, setHighlights] = useState<DayHighlight[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [openEndsCount, setOpenEndsCount] = useState<number | null>(null);
  const [nowMin,     setNowMin]     = useState(nowMinutes());
  const [modal,      setModal]      = useState<Entry | null>(null);
  const [dayPopup,   setDayPopup]   = useState<{ date: Date; entries: Entry[] } | null>(null);
  const [hlModal,    setHlModal]    = useState<{ date: string; existing: DayHighlight | null } | null>(null);
  const [punches,  setPunchesRaw] = useState<PunchState[]>(loadPunches);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const timelineRef  = useRef<HTMLDivElement>(null);
  const hdayScrollRef = useRef<HTMLDivElement>(null);
  const [periodNotesOpen, setPeriodNotesOpen] = useState(false);
  const [periodInputOpen, setPeriodInputOpen] = useState(false);
  const [periodNotes,    setPeriodNotes]    = useState<PeriodNote[]>([]);
  const [periodInput,    setPeriodInput]    = useState("");
  const [periodSaving,   setPeriodSaving]   = useState(false);
  const [allPeriodNotes, setAllPeriodNotes] = useState<PeriodNote[]>([]);
  const [editingNoteId,  setEditingNoteId]  = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

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

  const fetchHighlights = useCallback(async () => {
    const data = await api.get<DayHighlight[]>("/api/journal/highlights");
    setHighlights(data);
  }, []);

  // Fetch open loose ends count for the badge
  const fetchOpenEnds = useCallback(async () => {
    try {
      const data = await api.get<Entry[]>("/api/journal/loose-ends");
      setOpenEndsCount(data.length);
    } catch { /* silently ignore */ }
  }, []);

  const fetchAllPeriodNotes = useCallback(async () => {
    try {
      const data = await api.get<PeriodNote[]>("/api/journal/period-notes/all");
      setAllPeriodNotes(data);
    } catch {}
  }, []);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);
  useEffect(() => { void fetchHighlights(); }, [fetchHighlights]);
  useEffect(() => { void fetchOpenEnds(); }, [fetchOpenEnds]);
  useEffect(() => { void fetchAllPeriodNotes(); }, [fetchAllPeriodNotes]);

  // Fetch period notes whenever the view or focus date changes
  useEffect(() => {
    setPeriodNotesOpen(false);
    setPeriodInputOpen(false);
    setPeriodInput("");
    const key = periodKeyFor(view, focus);
    api.get<PeriodNote[]>(`/api/journal/period-notes?periodType=${view}&periodKey=${encodeURIComponent(key)}`)
      .then(setPeriodNotes)
      .catch(() => {});
  }, [view, focus]);

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
      if (view === "year")  c.setFullYear(c.getFullYear() + dir);
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

  async function addPeriodNote() {
    const content = periodInput.trim();
    if (!content || periodSaving) return;
    const key = periodKeyFor(view, focus);
    setPeriodSaving(true);
    try {
      const note = await api.post<PeriodNote>("/api/journal/period-notes", { periodType: view, periodKey: key, content });
      setPeriodNotes(prev => [note, ...prev]);
      setAllPeriodNotes(prev => [note, ...prev]);
      setPeriodInput("");
      setPeriodInputOpen(false);
    } finally { setPeriodSaving(false); }
  }

  async function deletePeriodNote(id: number) {
    await api.del(`/api/journal/period-notes/${id}`);
    setPeriodNotes(prev => prev.filter(n => n.id !== id));
    setAllPeriodNotes(prev => prev.filter(n => n.id !== id));
  }

  async function addDayNoteForDate(ymd: string, content: string): Promise<void> {
    const note = await api.post<PeriodNote>("/api/journal/period-notes", { periodType: "day", periodKey: ymd, content });
    setAllPeriodNotes(prev => [note, ...prev]);
    if (view === "day" && toYMD(focus) === ymd) setPeriodNotes(prev => [note, ...prev]);
  }

  async function deleteDayNoteForDate(id: number): Promise<void> {
    await api.del(`/api/journal/period-notes/${id}`);
    setAllPeriodNotes(prev => prev.filter(n => n.id !== id));
    setPeriodNotes(prev => prev.filter(n => n.id !== id));
  }

  async function editPeriodNote(id: number, content: string): Promise<void> {
    const updated = await api.patch<PeriodNote>(`/api/journal/period-notes/${id}`, { content });
    setPeriodNotes(prev => prev.map(n => n.id === id ? updated : n));
    setAllPeriodNotes(prev => prev.map(n => n.id === id ? updated : n));
    setEditingNoteId(null);
    setEditingContent("");
  }

  async function editDayNoteForDate(id: number, content: string): Promise<void> {
    const updated = await api.patch<PeriodNote>(`/api/journal/period-notes/${id}`, { content });
    setAllPeriodNotes(prev => prev.map(n => n.id === id ? updated : n));
    setPeriodNotes(prev => prev.map(n => n.id === id ? updated : n));
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
    if (view === "year") return String(focus.getFullYear());
    return `${MONTHS[focus.getMonth()]} ${focus.getFullYear()}`;
  }

  // IDs of entries that back a highlight — exclude them from the timeline
  // so the highlight overlay is the sole visual, no duplicate block at wrong position.
  const hlEntryIdSet = new Set(highlights.map(h => h.entryId).filter((id): id is number => id !== null));

  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    if (hlEntryIdSet.has(e.id)) continue;           // skip linked entries in timeline
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
          {(["day","week","month","year"] as View[]).map(v => (
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
        <Link
          to="/journal/loose-ends"
          className="journal-open-ends-link"
          aria-label="Open loose ends"
          title="Open loose ends"
        >
          ◎{openEndsCount != null && openEndsCount > 0 && (
            <span className="journal-open-ends-count">{openEndsCount}</span>
          )}
        </Link>
        <Link to="/journal/search" className="journal-search-link" aria-label="Search entries">
          Search
        </Link>
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
          highlight={highlights.find(h => h.date === toYMD(dayPopup.date)) ?? null}
          dayNotes={allPeriodNotes.filter(n => n.periodType === "day" && n.periodKey === toYMD(dayPopup.date))}
          onClose={() => setDayPopup(null)}
          onAddEntry={() => { setFocus(dayPopup.date); setView("day"); setAdding(true); }}
          onSelect={e => setModal(e)}
          onGoToWeek={() => { setFocus(dayPopup.date); setView("week"); }}
          onGoToDay={() => { setFocus(dayPopup.date); setView("day"); }}
          onHighlight={() => {
            const ymd = toYMD(dayPopup.date);
            setHlModal({ date: ymd, existing: highlights.find(h => h.date === ymd) ?? null });
          }}
          onDeleteDayNote={deleteDayNoteForDate}
          onAddDayNote={content => addDayNoteForDate(toYMD(dayPopup!.date), content)}
          onEditDayNote={editDayNoteForDate}
        />
      )}

      {/* Highlight form modal */}
      {hlModal && (
        <HighlightModal
          date={hlModal.date}
          existing={hlModal.existing}
          onClose={() => setHlModal(null)}
          onSave={row => {
            setHighlights(prev => {
              const exists = prev.some(h => h.id === row.id);
              return exists ? prev.map(h => h.id === row.id ? row : h) : [...prev, row];
            });
            setHlModal(null);
          }}
          onDelete={id => {
            const hl = highlights.find(h => h.id === id);
            if (hl?.entryId) setEntries(prev => prev.filter(e => e.id !== hl.entryId));
            setHighlights(prev => prev.filter(h => h.id !== id));
            setHlModal(null);
          }}
        />
      )}

      {/* Entry detail modal */}
      {modal && (
        <EntryModal
          entry={modal}
          onClose={() => setModal(null)}
          onUpdate={updateEntry}
          onDelete={deleteEntry}
          onNavigate={e => setModal(e)}
        />
      )}

      {/* Period notes modal */}
      {periodNotesOpen && (() => {
        const fYmd = toYMD(focus);
        const title = view === "day"
          ? (fYmd === todayYmd
            ? (periodNotes.length === 1 ? "Note for today" : "Notes for today")
            : (periodNotes.length === 1
              ? `Note for ${focus.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`
              : `Notes for ${focus.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`))
          : view === "week" ? "Notes for this week"
          : view === "month" ? `Notes for ${focus.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
          : `Notes for ${focus.getFullYear()}`;
        const placeholder = view === "day"
          ? (fYmd === todayYmd ? "Add a note for today…" : `Add a note for ${focus.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}…`)
          : view === "week" ? "Add a note for this week…"
          : view === "month" ? `Add a note for ${focus.toLocaleDateString("en-US", { month: "long" })}…`
          : `Add a note for ${focus.getFullYear()}…`;
        const closeModal = () => { setPeriodNotesOpen(false); setPeriodInputOpen(false); setPeriodInput(""); setEditingNoteId(null); setEditingContent(""); };
        return (
          <div className="pnm-backdrop" onClick={closeModal}>
            <div className="pnm-sheet" onClick={e => e.stopPropagation()}>
              <div className="pnm-header">
                <span className="pnm-title">{title}</span>
                <button className="pnm-close" onClick={closeModal} aria-label="Close">✕</button>
              </div>
              <div className="pnm-body">
                {periodNotes.length === 0 ? (
                  <p className="pnm-empty">No notes yet.</p>
                ) : (
                  <div className="pnm-list">
                    {periodNotes.map((n, i) => (
                      <div key={n.id} className="pnm-entry">
                        <span className="pnm-entry-num">{i + 1}</span>
                        {editingNoteId === n.id ? (
                          <input
                            className="pnm-inline-edit"
                            value={editingContent}
                            onChange={e => setEditingContent(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") void editPeriodNote(n.id, editingContent);
                              if (e.key === "Escape") { setEditingNoteId(null); setEditingContent(""); }
                            }}
                            onBlur={() => { if (editingContent.trim()) void editPeriodNote(n.id, editingContent); else { setEditingNoteId(null); setEditingContent(""); } }}
                            autoFocus
                          />
                        ) : (
                          <p className="pnm-entry-text" onDoubleClick={() => { setEditingNoteId(n.id); setEditingContent(n.content); }} title="Double-click to edit">{n.content}</p>
                        )}
                        <button className="pnm-entry-del" onClick={() => void deletePeriodNote(n.id)} aria-label="Delete note">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pnm-footer">
                  {periodInputOpen ? (
                    <div className="pnm-input-row">
                      <input
                        className="pnm-input"
                        placeholder={placeholder}
                        value={periodInput}
                        onChange={e => setPeriodInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") void addPeriodNote(); if (e.key === "Escape") { setPeriodInputOpen(false); setPeriodInput(""); } }}
                        autoFocus
                      />
                      <button className="pnm-submit" onClick={() => void addPeriodNote()} disabled={!periodInput.trim() || periodSaving}>↑</button>
                    </div>
                  ) : (
                    <button className="pnm-add-trigger" onClick={() => setPeriodInputOpen(true)}>+ Add note</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════ DAY VIEW — 2D grid: X=hour, Y=minute within hour ════ */}
      {view === "day" && (() => {
        const focusYmd  = toYMD(focus);
        const focusHl   = highlights.find(h => h.date === focusYmd) ?? null;
        const focusHlAllDay = focusHl && !focusHl.startTime;
        const carryovers = carryoversForDate(focusYmd, entries);
        const dayEntries = [...(byDate.get(focusYmd) ?? []), ...carryovers].sort(
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
          <div className="journal-hday journal-hday--2d"
            style={focusHlAllDay ? { boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${focusHl!.color} 40%, transparent)` } as React.CSSProperties : undefined}>
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
                      className={`journal-hday-hour${h === 6 ? " is-dawn" : ""}${h === 12 ? " is-noon" : ""}${h === 18 ? " is-dusk" : ""}${isToday && h === curHour ? " is-current" : ""}`}
                      style={{ left: h * COL_W + COL_W / 2 }}>
                      {h === 6 ? <><span className="journal-hday-hour-mark">☽</span><em>6am</em></> : h === 12 ? <><IcSun /><em>noon</em></> : h === 18 ? <><span className="journal-hday-hour-mark">◐</span><em>6pm</em></> : fmtH(h)}
                    </span>
                  ))}
                </div>

                {/* Grid area */}
                <div className="journal-hday-lane" style={{ top: AXIS_H, height: GRID_H }}>

                  {/* Vertical hour separators */}
                  {Array.from({ length: 25 }, (_, h) => (
                    <div key={h}
                      className={`journal-hday-gridline${h === 6 ? " is-dawn" : ""}${h === 12 ? " is-noon" : ""}${h === 18 ? " is-dusk" : ""}`}
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

                  {/* Highlight overlay — single time: thin line; block: per-column slices */}
                  {focusHl && focusHl.startTime && (() => {
                    const [sH, sM] = focusHl.startTime!.split(":").map(Number);
                    if (!focusHl.endTime) {
                      return (
                        <div style={{
                          position: "absolute",
                          left: sH * COL_W, top: (sM / 60) * GRID_H,
                          width: COL_W, height: 3,
                          background: focusHl.color, opacity: 0.8,
                          borderRadius: 1, pointerEvents: "none", zIndex: 2,
                        }} />
                      );
                    }
                    const [eH, eM] = focusHl.endTime.split(":").map(Number);
                    const slices = [];
                    for (let h = sH; h <= eH; h++) {
                      const sliceTop    = h === sH ? (sM / 60) * GRID_H : 0;
                      const sliceBottom = h === eH ? (eM / 60) * GRID_H : GRID_H;
                      if (sliceBottom > sliceTop) slices.push(
                        <div key={h} style={{
                          position: "absolute",
                          left: h * COL_W, top: sliceTop,
                          width: COL_W, height: sliceBottom - sliceTop,
                          background: focusHl.color, opacity: 0.25,
                          pointerEvents: "none", zIndex: 0,
                        }} />
                      );
                    }
                    return <React.Fragment>{slices}</React.Fragment>;
                  })()}

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
                    const isCarryover = e.entryDate !== focusYmd;
                    // Carryovers started yesterday — pin to midnight on today's grid
                    const sH = isCarryover ? 0 : new Date(e.startTime).getHours();
                    const sM = isCarryover ? 0 : new Date(e.startTime).getMinutes();
                    let eH = new Date(e.endTime!).getHours();
                    let eM = new Date(e.endTime!).getMinutes();
                    // Same-day cross-midnight: cap the span at end of day
                    if (!isCarryover && eH * 60 + eM <= sH * 60 + sM) { eH = 23; eM = 59; }
                    const slices = [];
                    for (let h = sH; h <= eH; h++) {
                      const sliceTop    = h === sH ? (sM / 60) * GRID_H : 0;
                      const sliceBottom = h === eH ? (eM / 60) * GRID_H : GRID_H;
                      if (sliceBottom > sliceTop) slices.push(
                        <div key={h}
                          className="journal-hday-span"
                          style={{ left: h * COL_W, top: sliceTop, width: COL_W, height: sliceBottom - sliceTop, background: e.color === BLACK ? BLACK_STRIPE : e.color, ...(e.color === BLACK ? { outline: "1px solid rgba(255,255,255,0.5)", outlineOffset: "-1px" } : {}) } as React.CSSProperties} />
                      );
                    }
                    return <React.Fragment key={e.id}>{slices}</React.Fragment>;
                  })}

                  {/* Highlight entry block — timed highlights only */}
                  {focusHl && focusHl.startTime && (() => {
                    const [sH, sM] = focusHl.startTime!.split(":").map(Number);
                    const top = (sM / 60) * GRID_H;
                    const durMin = focusHl.endTime
                      ? (() => { const [eH, eM] = focusHl.endTime!.split(":").map(Number); return (eH - sH) * 60 + (eM - sM); })()
                      : 0;
                    const heightPx = durMin > 0
                      ? Math.max(22, (Math.min(durMin, 60 - sM) / 60) * GRID_H)
                      : 22;
                    const isFuture = isToday && (sH * 60 + sM) > nowMin;
                    return (
                      <div
                        className={`journal-hday-entry journal-hday-entry--highlight${isFuture ? " is-future" : ""}`}
                        style={{ left: sH * COL_W + 2, top, width: COL_W - 4, height: heightPx, "--entry-color": focusHl.color } as React.CSSProperties}
                        onClick={() => setHlModal({ date: focusYmd, existing: focusHl })}
                        role="button" tabIndex={0}
                        onKeyDown={ev => ev.key === "Enter" && setHlModal({ date: focusYmd, existing: focusHl })}>
                        <p className="journal-hday-entry-label">✦ {focusHl.label || "Highlight"}</p>
                        <p className="journal-hday-entry-time">
                          {focusHl.endTime
                            ? `${fmtHHMM(focusHl.startTime!)} – ${fmtHHMM(focusHl.endTime)}`
                            : fmtHHMM(focusHl.startTime!)}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Entries — placed at (startHour col, startMinute row) */}
                  {dayEntries.map(e => {
                    const isCarryover = e.entryDate !== focusYmd;
                    // Pin carryovers to midnight column on today's grid
                    const startH   = isCarryover ? 0 : new Date(e.startTime).getHours();
                    const startM   = isCarryover ? 0 : new Date(e.startTime).getMinutes();
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

          {/* Period note + entry list below grid */}
          <div className="journal-hday-list">
            <div className="pnote-block">
              <button className="pnote-hd" onClick={() => setPeriodNotesOpen(true)}>
                <span className="pnote-hd-label">
                  {focusYmd === todayYmd
                    ? periodNotes.length === 1 ? "Note for today" : "Notes for today"
                    : periodNotes.length === 1
                      ? `Note for ${focus.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
                      : `Notes for ${focus.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`}
                </span>
                {periodNotes.length > 0 && <span className="pnote-count">{periodNotes.length}</span>}
              </button>
            </div>
            {(dayEntries.length > 0 || focusHl) && (
              <>
                {focusHl && (
                  <button className="journal-hday-list-row journal-hday-list-row--highlight"
                    onClick={() => setHlModal({ date: focusYmd, existing: focusHl })}>
                    <span className="journal-hday-list-dot" style={{ background: focusHl.color, ...br(focusHl.color) } as React.CSSProperties} />
                    <span className="journal-hday-list-time">
                      {focusHl.startTime
                        ? focusHl.endTime
                          ? `${fmtHHMM(focusHl.startTime)} – ${fmtHHMM(focusHl.endTime)}`
                          : fmtHHMM(focusHl.startTime)
                        : "All day"}
                    </span>
                    <span className="journal-hday-list-label">✦ {focusHl.label || "Highlight"}</span>
                  </button>
                )}
                {dayEntries.map(e => {
                  const isCarryover = e.entryDate !== focusYmd;
                  const isOpener = e.looseEndType === 'open';
                  const isCloser = e.looseEndType === 'close';
                  const hasCloseEntry = !isCloser && entries.some(x => x.looseEndLink === e.id && x.looseEndType === 'close');
                  return (
                    <button key={e.id} className={`journal-hday-list-row${isCarryover ? " is-carryover" : ""}`} onClick={() => setModal(e)}>
                      <span className="journal-hday-list-dot" style={{ background: e.color, ...br(e.color) } as React.CSSProperties} />
                      {isCarryover
                        ? <span className="journal-hday-list-time">— {e.endTime ? fmtTime(e.endTime) : ""}</span>
                        : <span className="journal-hday-list-time">{fmtRange(e.startTime, e.endTime)}</span>
                      }
                      <span className="journal-hday-list-label">
                        {(isOpener || hasCloseEntry) && <span className="loose-end-badge loose-end-badge--open">◎ </span>}
                        {isCloser && <span className="loose-end-badge loose-end-badge--closed">◉ </span>}
                        {e.subject || e.content || "—"}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          </>
        );
      })()}

      {/* ════ WEEK VIEW ════ */}
      {view === "week" && (() => {
        const MAJOR_HOURS = new Set([6, 12, 18]);
        const weekStart = startOfWeek(focus);
        return (
          <>
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
                {(() => {
                  const weekEnd = addDays(weekStart, 6);
                  const isThisWeek = todayYmd >= toYMD(weekStart) && todayYmd <= toYMD(weekEnd);
                  if (!isThisWeek) return null;
                  const n = new Date();
                  const dayFrac = (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
                  const weekNowPct = (n.getDay() + dayFrac) / 7 * 100;
                  return <div className="journal-grid-now-line" style={{ left: `${weekNowPct}%` }} />;
                })()}
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(weekStart, i);
                  const ymd = toYMD(day);
                  const wkHl = highlights.find(h => h.date === ymd) ?? null;
                  if (!wkHl) return null;
                  const pct = (i + 0.5) / 7 * 100;
                  const timeFrac = wkHl.startTime
                    ? (() => { const [h2, m2] = wkHl.startTime!.split(":").map(Number); return (h2 * 60 + m2) / 1440; })()
                    : 0.5;
                  const adjustedPct = (i + timeFrac) / 7 * 100;
                  return (
                    <div key={wkHl.id}
                      className="journal-grid-hl-line"
                      style={{ left: `${adjustedPct}%`, background: wkHl.color }} />
                  );
                })}
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(weekStart, i);
                  const ymd = toYMD(day);
                  const isT = ymd === todayYmd;
                  const colHl = highlights.find(h => h.date === ymd) ?? null;
                  const dayEntries = [
                    ...(byDate.get(ymd) ?? []),
                    ...carryoversForDate(ymd, entries),
                  ];
                  return (
                    <div key={ymd}
                      className={`journal-week-col${isT?" is-today":""}`}
                      style={colHl && !colHl.startTime ? { boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${colHl.color} 40%, transparent)` } as React.CSSProperties : undefined}>
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
                      {/* Highlight time marker — subtle horizontal line at startTime */}
                      {colHl && colHl.startTime && (() => {
                        const [sH, sM] = colHl.startTime!.split(":").map(Number);
                        const startMin = sH * 60 + sM;
                        return (
                          <div className="journal-week-hl-marker"
                            style={{ top: `${(startMin/1440)*100}%`, borderColor: colHl.color }} />
                        );
                      })()}
                      {/* Highlight entry block in week column */}
                      {colHl && colHl.startTime && (() => {
                        const [sH, sM] = colHl.startTime!.split(":").map(Number);
                        const startMin = sH * 60 + sM;
                        const topPct = `${(startMin / 1440) * 100}%`;
                        const durMin = colHl.endTime
                          ? (() => { const [eH, eM] = colHl.endTime!.split(":").map(Number); return eH * 60 + eM - startMin; })()
                          : 0;
                        const heightVal = durMin > 0 ? `${(durMin / 1440) * 100}%` : "3%";
                        return (
                          <div className="journal-week-line journal-week-line--highlight"
                            style={{ top: topPct, height: heightVal, background: colHl.color }}
                            onClick={() => setHlModal({ date: ymd, existing: colHl })}
                            role="button" tabIndex={0}
                            onKeyDown={ev => ev.key === "Enter" && setHlModal({ date: ymd, existing: colHl })}>
                            <span className="journal-week-line-label">✦ {colHl.label || ""}</span>
                          </div>
                        );
                      })()}
                      {dayEntries.map(e => {
                        const isCarryover = e.entryDate !== ymd;
                        // Carryovers started yesterday — pin to top of this column
                        const startMin = isCarryover ? 0 : minuteOfDay(e.startTime);
                        const endMin   = e.endTime ? minuteOfDay(e.endTime) : null;
                        const topPct   = `${(startMin / 1440) * 100}%`;
                        // If endMin < startMin the entry crossed midnight — run it to end of day
                        const durMin   = endMin !== null
                          ? endMin > startMin ? endMin - startMin : 1440 - startMin
                          : null;
                        const heightVal = durMin !== null && durMin > 0
                          ? `${(durMin / 1440) * 100}%`
                          : 3;
                        return (
                          <div key={e.id} className="journal-week-line"
                            style={{ top: topPct, height: heightVal, background: e.color === BLACK ? BLACK_STRIPE_WEEK : e.color, opacity: e.color === "#f5f5f5" ? 0.45 : 1, ...(e.color === BLACK ? { outline: "1px solid rgba(255,255,255,0.3)", outlineOffset: "-1px" } : {}) }}
                            onClick={() => setModal(e)}
                            role="button" tabIndex={0}
                            onKeyDown={ev => ev.key === "Enter" && setModal(e)}>
                            <span className="journal-week-line-label">
                              {e.subject || e.content || ""}
                            </span>
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

          {/* Entry list for the week — grouped by day, including carryovers */}
          {entries.length > 0 && (() => {
            // Build groups day-by-day so carryovers appear under the day they end on
            const groups: [string, Entry[]][] = [];
            for (let i = 0; i < 7; i++) {
              const day = addDays(weekStart, i);
              const ymd = toYMD(day);
              const carryovers = carryoversForDate(ymd, entries);
              const own = [...(byDate.get(ymd) ?? [])].sort(
                (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
              );
              const combined = [...carryovers, ...own];
              const hasHl = highlights.some(h => h.date === ymd);
              if (combined.length > 0 || hasHl) groups.push([ymd, combined]);
            }

            return (
              <div className="journal-week-list">
                <div className="journal-week-group">
                  <button className="journal-week-group-hd" onClick={() => setPeriodNotesOpen(true)}>
                    <span className="journal-week-group-day">Notes for this week</span>
                    {periodNotes.length > 0 && <span className="pnote-count">{periodNotes.length}</span>}
                  </button>
                </div>
                {groups.map(([ymd, group], gi) => {
                  const expanded = expandedDays.has(ymd);
                  const hl = highlights.find(h => h.date === ymd) ?? null;
                  const day = new Date(ymd + "T00:00:00");
                  const dayLabel = ymd === todayYmd
                    ? "Today"
                    : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  const toggleCollapse = () => setExpandedDays(prev => {
                    const next = new Set(prev);
                    next.has(ymd) ? next.delete(ymd) : next.add(ymd);
                    return next;
                  });
                  const totalCount = group.length + (hl ? 1 : 0);
                  return (
                    <div key={ymd} className={`journal-week-group${gi > 0 ? " journal-week-group--sep" : ""}`}>
                      <button className="journal-week-group-hd" onClick={toggleCollapse}>
                        <span className="journal-week-group-day">{dayLabel}</span>
                        <span className="journal-week-group-count">{totalCount} {totalCount === 1 ? "entry" : "entries"}</span>
                        <span className={`journal-week-group-chevron${!expanded ? " collapsed" : ""}`}>›</span>
                      </button>
                      {expanded && (
                        <>
                          {hl && (() => {
                            const hlStartMin = hl.startTime
                              ? (() => { const [h2,m2] = hl.startTime!.split(":").map(Number); return h2*60+m2; })()
                              : null;
                            const hlEndMin = hl.endTime
                              ? (() => { const [h2,m2] = hl.endTime!.split(":").map(Number); return h2*60+m2; })()
                              : null;
                            return (
                              <button className="journal-week-list-row journal-week-list-row--highlight"
                                onClick={() => setHlModal({ date: ymd, existing: hl })}>
                                <span className="journal-week-list-dot" style={{ background: hl.color, ...br(hl.color) } as React.CSSProperties} />
                                <span className="journal-week-list-time">
                                  {hl.startTime
                                    ? hl.endTime ? `${fmtHHMM(hl.startTime)} – ${fmtHHMM(hl.endTime)}` : fmtHHMM(hl.startTime)
                                    : "All day"}
                                </span>
                                <span className="journal-week-list-label">✦ {hl.label || "Highlight"}</span>
                                {hlStartMin !== null && (
                                  <span className="journal-week-list-sweep" aria-hidden="true">
                                    <span className="journal-week-list-sweep-pip"
                                      style={{
                                        left: `${(hlStartMin/1440)*100}%`,
                                        background: hl.color,
                                        width: hlEndMin !== null
                                          ? `${Math.max(2, ((hlEndMin - hlStartMin)/1440)*100)}%`
                                          : undefined,
                                      }} />
                                  </span>
                                )}
                              </button>
                            );
                          })()}
                          {group.map(e => {
                            const isCarryover = e.entryDate !== ymd;
                            const isOpener = e.looseEndType === 'open';
                            const isCloser = e.looseEndType === 'close';
                            const hasCloseEntry = !isCloser && entries.some(x => x.looseEndLink === e.id && x.looseEndType === 'close');
                            return (
                              <button key={e.id} className={`journal-week-list-row${isCarryover ? " is-carryover" : ""}`} onClick={() => setModal(e)}>
                                <span className="journal-week-list-dot" style={{ background: e.color, ...br(e.color) } as React.CSSProperties} />
                                {isCarryover
                                  ? <span className="journal-week-list-time" style={{ fontStyle: "italic" }}>— {e.endTime ? fmtTime(e.endTime) : ""}</span>
                                  : <span className="journal-week-list-time">{fmtRange(e.startTime, e.endTime)}</span>
                                }
                                <span className="journal-week-list-label">
                                  {(isOpener || hasCloseEntry) && <span className="loose-end-badge loose-end-badge--open">◎ </span>}
                                  {isCloser && <span className="loose-end-badge loose-end-badge--closed">◉ </span>}
                                  {e.subject || e.content || "—"}
                                </span>
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          </>
        );
      })()}

      {/* ════ MONTH VIEW ════ */}
      {view === "year" && (() => {
        const year = focus.getFullYear();
        const isThisYear = year === new Date().getFullYear();
        const yearDayNoteSet = new Set(allPeriodNotes.filter(n => n.periodType === "day").map(n => n.periodKey));
        const yearStart = new Date(year, 0, 1);
        const daysInYear = (new Date(year, 11, 31).getTime() - yearStart.getTime()) / 86400000 + 1;
        const yearNowPct = isThisYear ? (() => {
          const n = new Date();
          const dayFrac = (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
          const dayOfYear = (new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - yearStart.getTime()) / 86400000;
          return (dayOfYear + dayFrac) / daysInYear * 100;
        })() : -1;
        return (
          <>
            <div className="journal-year">
              {yearNowPct >= 0 && (
                <div className="journal-grid-now-line" style={{ left: `${yearNowPct}%` }} />
              )}
              {Array.from({ length: 12 }, (_, mi) => {
                const monthDate = new Date(year, mi, 1);
                const mStart    = startOfMonth(monthDate);
                const mEnd      = endOfMonth(monthDate);
                const gridStart = startOfWeek(mStart);
                const totalDays = Math.ceil((mEnd.getDate() + mStart.getDay()) / 7) * 7;
                const isCurMonth = mi === focus.getMonth() && year === new Date().getFullYear()
                  ? false // don't mark "current month" — just mark today's month
                  : false;
                const isTodayMonth = mi === new Date().getMonth() && year === new Date().getFullYear();
                return (
                  <div key={mi} className={`journal-year-month${isTodayMonth ? " is-today-month" : ""}`}>
                    <div className="journal-year-month-title">{MONTHS[mi].slice(0, 3)}</div>
                    <div className="journal-year-mini-grid">
                      {WEEKDAYS.map(w => (
                        <span key={w} className="journal-year-mini-hd">{w[0]}</span>
                      ))}
                      {Array.from({ length: totalDays }, (_, i) => {
                        const day  = addDays(gridStart, i);
                        const ymd  = toYMD(day);
                        const inMonth    = day >= mStart && day <= mEnd;
                        const isT        = ymd === todayYmd;
                        const hl         = highlights.find(h => h.date === ymd) ?? null;
                        const dayEntries = byDate.get(ymd) ?? [];
                        const hasDayNote = yearDayNoteSet.has(ymd);
                        return (
                          <button
                            key={ymd}
                            className={`journal-year-day${!inMonth ? " out-of-month" : ""}${isT ? " is-today" : ""}${hl ? " has-highlight" : ""}${hasDayNote ? " has-day-note" : ""}`}
                            style={hl ? { "--hl-color": hl.color } as React.CSSProperties : undefined}
                            onClick={() => { setFocus(day); setView("month"); }}
                            tabIndex={inMonth ? 0 : -1}
                          >
                            <span className="journal-year-day-num">{day.getDate()}</span>
                            {(dayEntries.length > 0 || hl) && (
                              <span className="journal-year-day-dots">
                                {hl && <span className="journal-year-day-dot" style={{ background: hl.color }} />}
                                {dayEntries.slice(0, hl ? 3 : 4).map(e => (
                                  <span key={e.id} className="journal-year-day-dot" style={{ background: e.color }} />
                                ))}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pnote-block pnote-block--period">
              <button className="pnote-hd" onClick={() => setPeriodNotesOpen(true)}>
                <span className="pnote-hd-label">Notes for {focus.getFullYear()}</span>
                {periodNotes.length > 0 && <span className="pnote-count">{periodNotes.length}</span>}
              </button>
            </div>
            <HighlightCountdown highlights={highlights} />
          </>
        );
      })()}

      {view === "month" && (() => {
        const monthStart = startOfMonth(focus);
        const monthEnd   = endOfMonth(focus);
        const gridStart  = startOfWeek(monthStart);
        const totalDays  = Math.ceil((monthEnd.getDate() + monthStart.getDay()) / 7) * 7;
        const isThisMonth = focus.getFullYear() === new Date().getFullYear() && focus.getMonth() === new Date().getMonth();
        const daysInMonth = monthEnd.getDate();
        const monthNowPct = isThisMonth ? (() => {
          const n = new Date();
          const dayFrac = (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
          return (n.getDate() - 1 + dayFrac) / daysInMonth * 100;
        })() : -1;
        const dayNoteSet = new Set(
          allPeriodNotes.filter(n => n.periodType === "day").map(n => n.periodKey)
        );
        const weekNotesMap = new Map<string, number>();
        for (const n of allPeriodNotes) {
          if (n.periodType === "week") {
            weekNotesMap.set(n.periodKey, (weekNotesMap.get(n.periodKey) ?? 0) + 1);
          }
        }
        return (
          <>
          <div className="journal-month">
            <div className="journal-month-header">
              {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
            </div>
            <div className="journal-month-grid-wrap">
              {monthNowPct >= 0 && (
                <div className="journal-grid-now-line" style={{ left: `${monthNowPct}%` }} />
              )}
              {highlights
                .filter(h => {
                  const d = new Date(h.date + "T00:00:00");
                  return d >= monthStart && d <= monthEnd;
                })
                .map(h => {
                  const day = new Date(h.date + "T00:00:00").getDate();
                  const pct = ((day - 1 + 0.5) / daysInMonth) * 100;
                  return (
                    <div key={h.id}
                      className="journal-grid-hl-line"
                      style={{ left: `${pct}%`, background: h.color }} />
                  );
                })}
            <div className="journal-month-grid">
              {Array.from({ length: totalDays }, (_, i) => {
                const day = addDays(gridStart, i);
                const ymd = toYMD(day);
                const inMonth   = day >= monthStart && day <= monthEnd;
                const dayEntries = byDate.get(ymd) ?? [];
                const allDayEntries = [...carryoversForDate(ymd, entries), ...dayEntries];
                const isT = ymd === todayYmd;
                const hl  = highlights.find(h => h.date === ymd) ?? null;
                const hasDayNote = dayNoteSet.has(ymd);
                // Week marks live in the Saturday cell (i % 7 === 6)
                const isSaturday = i % 7 === 6;
                // Use Wednesday of each row (i-3) — mid-week, always the correct ISO week
                const weekWed = isSaturday ? addDays(gridStart, i - 3) : null;
                const weekKey = weekWed ? isoWeekKey(weekWed) : null;
                const weekNoteCount = weekKey ? Math.min(weekNotesMap.get(weekKey) ?? 0, 2) : 0;
                return (
                  <div key={ymd}
                    className={`journal-month-cell${!inMonth?" out-of-month":""}${isT?" is-today":""}${hl?" has-highlight":""}${hasDayNote?" has-day-note":""}`}
                    style={hl ? { "--hl-color": hl.color } as React.CSSProperties : undefined}
                    onClick={() => setDayPopup({ date: day, entries: allDayEntries })}>
                    {isT && (
                      <div className="journal-month-now-bar"
                        style={{ left:`${Math.min(100,(nowMin/1440)*100)}%` }} />
                    )}
                    {hl && <span className="journal-month-cell-hlabel" style={{ background: hl.color, color: contrastColor(hl.color) }}>{hl.label}</span>}
                    <span className="journal-month-cell-num">{day.getDate()}</span>
                    <div className="journal-month-lines">
                      {[...dayEntries]
                        .sort((a, b) => {
                          const WHITE = "#f5f5f5";
                          if (a.color === WHITE && b.color !== WHITE) return -1;
                          if (b.color === WHITE && a.color !== WHITE) return 1;
                          const ai = ENTRY_COLORS.findIndex(c => c.hex === a.color);
                          const bi = ENTRY_COLORS.findIndex(c => c.hex === b.color);
                          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                        })
                        .map(e => (
                        <div key={e.id} className="journal-month-line"
                          style={{ background: e.color === BLACK ? undefined : e.color, ...(e.color === BLACK ? { background: "rgba(255,255,255,0.5)" } : {}) }} />
                      ))}
                    </div>
                    {isSaturday && weekNoteCount > 0 && (
                      <div className="journal-month-week-marks" aria-hidden="true">
                        {Array.from({ length: weekNoteCount }, (_, ni) => (
                          <span key={ni} className="journal-month-week-dash" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>{/* journal-month-grid-wrap */}
          </div>
          <div className="pnote-block pnote-block--period">
            <button className="pnote-hd" onClick={() => setPeriodNotesOpen(true)}>
              <span className="pnote-hd-label">Notes for {focus.toLocaleDateString("en-US", { month: "long" })}</span>
              {periodNotes.length > 0 && <span className="pnote-count">{periodNotes.length}</span>}
            </button>
          </div>
          <HighlightCountdown highlights={highlights} />
        </>
        );
      })()}


      {/* Punch banners — up to 3, stacked at the bottom */}
      {punches.length > 0 && (
        <div className="punch-banner">
          {punches.map(p => (
            <PunchRow key={p.id} punch={p} onUpdate={updatePunch} onPunchOut={punchOut} onCancel={cancelPunch} />
          ))}
          {punches.length >= PUNCH_MAX && (
            <p className="punch-banner-max-note">
              {PUNCH_MAX} timers running — punch one out to start another
            </p>
          )}
        </div>
      )}
    </div>
  );
}
