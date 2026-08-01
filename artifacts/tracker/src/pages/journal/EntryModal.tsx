/**
 * Shared entry modal + form used by both Journal and JournalSearch.
 */
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

/* ── types ─────────────────────────────────────────────────────────── */
export type Entry = {
  id: number;
  subject: string | null;
  content: string;
  entryDate: string;
  startTime: string;
  endTime: string | null;
  color: string;
  createdAt: string;
};

/* ── colors ─────────────────────────────────────────────────────────── */
export const ENTRY_COLORS: { hex: string; label: string; hint: string }[] = [
  { hex: "#e05555", label: "Red",    hint: "Bad habits"    },
  { hex: "#e08c3a", label: "Orange", hint: "Food & drink"  },
  { hex: "#e0b04e", label: "Yellow", hint: "Fitness"       },
  { hex: "#4ecb71", label: "Green",  hint: "Green"         },
  { hex: "#4eaaee", label: "Blue",   hint: "Social"        },
  { hex: "#e04e8a", label: "Pink",   hint: "Pink"          },
  { hex: "#9b4ee0", label: "Purple", hint: "Purple"        },
  { hex: "#f5f5f5", label: "White",  hint: "Work"          },
  { hex: "#8a9aaa", label: "Gray",   hint: "Sleep"         },
  { hex: "#1c1c1e", label: "Black",  hint: "Black"         },
];

/* ── time helpers ───────────────────────────────────────────────────── */
export function toISOWithDate(dateIso: string, timeHHMM: string): string {
  return new Date(`${dateIso}T${timeHHMM}:00`).toISOString();
}
export function toHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
export function nowHHMM(): string { return toHHMM(new Date().toISOString()); }

export function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "pm" : "am"}`;
}
export function fmtRange(start: string, end: string | null) {
  return end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
}
export function fmtFullDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

/* ── icons ──────────────────────────────────────────────────────────── */
export const IcTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
  </svg>
);
export const IcEdit = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

/* ── EntryForm ──────────────────────────────────────────────────────── */
type EntryFormProps = {
  entryDate: string;
  initial?: Entry;
  onSave: (e: Entry) => void;
  onCancel: () => void;
  onPunch?: (note: string, color: string) => void;
};
export function EntryForm({ entryDate, initial, onSave, onCancel, onPunch }: EntryFormProps) {
  const [subject,   setSubject]   = useState(initial?.subject ?? "");
  const [content,   setContent]   = useState(initial?.content ?? "");
  const [startHHMM, setStartHHMM] = useState(initial ? toHHMM(initial.startTime) : nowHHMM());
  const [hasEnd,    setHasEnd]    = useState(Boolean(initial?.endTime));
  const [endHHMM,   setEndHHMM]   = useState(initial?.endTime ? toHHMM(initial.endTime) : "");
  const [color,     setColor]     = useState(initial?.color ?? ENTRY_COLORS[0].hex);
  const [date,      setDate]      = useState(initial?.entryDate ?? entryDate);
  const [timesOpen,    setTimesOpen]    = useState(false);
  const [showSubject,  setShowSubject]  = useState(Boolean(initial?.subject));
  const [saving,       setSaving]       = useState(false);
  const [punchMode,    setPunchMode]    = useState(false);
  const [punchNote,    setPunchNote]    = useState("");

  async function submit() {
    setSaving(true);
    try {
      const startIso = toISOWithDate(date, startHHMM);
      // Cross-midnight: if end time is earlier in the day than start, end is on the next day
      const endDate  = hasEnd && endHHMM && endHHMM <= startHHMM
        ? toYMD(new Date(new Date(`${date}T${startHHMM}:00`).getTime() + 24 * 60 * 60 * 1000))
        : date;
      const endIso   = hasEnd && endHHMM ? toISOWithDate(endDate, endHHMM) : null;
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
      <textarea
        className="entry-form-content"
        placeholder="What's on your mind…"
        value={content}
        rows={2}
        autoFocus={!initial}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
      />
      {showSubject && (
        <input
          className="entry-form-subject"
          placeholder="Subject"
          value={subject}
          autoFocus={!initial?.subject}
          onChange={e => setSubject(e.target.value)}
        />
      )}
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
              <button className="entry-form-remove-end"
                onClick={() => { setHasEnd(false); setEndHHMM(""); }} aria-label="Remove end time">×</button>
            </label>
          ) : (
            <button className="entry-form-add-end" onClick={() => setHasEnd(true)}>+ end time</button>
          )}
        </div>
      )}
      <div className="entry-form-actions">
        <div className="entry-form-colors">
          {ENTRY_COLORS.map(c => (
            <button key={c.hex} className={`entry-color-swatch${color === c.hex ? " selected" : ""}`}
              style={{ background: c.hex }} aria-label={c.label} onClick={() => setColor(c.hex)} />
          ))}
        </div>
        <div className="entry-form-action-right">
          {onPunch && !punchMode && (
            <button className="entry-form-punch-btn" onClick={() => setPunchMode(true)} type="button">
              Punch
            </button>
          )}
          <button
            className={`entry-form-subject-toggle${showSubject ? " active" : ""}`}
            onClick={() => setShowSubject(o => !o)}
            aria-label="Add subject"
            title="Subject (shown in lists)"
            type="button"
          >S</button>
          <button
            className={`entry-form-time-toggle${timesOpen ? " active" : ""}`}
            onClick={() => setTimesOpen(o => !o)}
            aria-label="Edit date and time"
            title={timesOpen ? "Hide time" : "Edit date & time"}
          >🕐</button>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : initial ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── EntryModal ─────────────────────────────────────────────────────── */
export type EntryModalProps = {
  entry: Entry;
  onClose: () => void;
  onUpdate: (e: Entry) => void;
  onDelete: (id: number) => void;
};
export function EntryModal({ entry, onClose, onUpdate, onDelete }: EntryModalProps) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="entry-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
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
