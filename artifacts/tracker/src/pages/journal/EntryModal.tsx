/**
 * Shared entry modal + form used by both Journal and JournalSearch.
 */
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { type JournalLink, LinkedContentArea, LinkViewModal } from "./LinkedContent";

/* ── types ─────────────────────────────────────────────────────────── */
export type Entry = {
  id: number;
  subject: string | null;
  content: string;
  entryDate: string;
  startTime: string;
  endTime: string | null;
  color: string;
  looseEndLink: number | null;
  looseEndType: 'open' | 'close' | null;
  createdAt: string;
};

/* ── colors ─────────────────────────────────────────────────────────── */
export const ENTRY_COLORS: { hex: string; label: string; hint: string }[] = [
  { hex: "#e82020", label: "Red",         hint: "Bad habits"    },
  { hex: "#8b1a1a", label: "Dark Red",    hint: "Dark Red"      },
  { hex: "#e55c00", label: "Orange",      hint: "Food & drink"  },
  { hex: "#7c4a1e", label: "Brown",       hint: "Brown"         },
  { hex: "#f5c800", label: "Yellow",      hint: "Fitness"       },
  { hex: "#a07800", label: "Dark Yellow", hint: "Dark Yellow"   },
  { hex: "#1fcc55", label: "Green",       hint: "Green"         },
  { hex: "#145c28", label: "Dark Green",  hint: "Dark Green"    },
  { hex: "#2b7fff", label: "Blue",        hint: "Social"        },
  { hex: "#1a3a8a", label: "Dark Blue",   hint: "Dark Blue"     },
  { hex: "#e04e8a", label: "Pink",        hint: "Pink"          },
  { hex: "#9b4ee0", label: "Purple",      hint: "Purple"        },
  { hex: "#f5f5f5", label: "White",       hint: "Work"          },
  { hex: "#8a9aaa", label: "Gray",        hint: "Sleep"         },
  { hex: "#1c1c1e", label: "Black",       hint: "Black"         },
];

export function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
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
export function fmtDuration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins <= 0) return "";
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  const hLabel = h === 1 ? "1hr" : `${h}hrs`;
  return m === 0 ? hLabel : `${hLabel} ${m}min`;
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

/* ── OpenEndPickerPopup ─────────────────────────────────────────────── */
type OpenEndPickerPopupProps = {
  onSelect: (entry: Entry) => void;
  onCancel: () => void;
};
function OpenEndPickerPopup({ onSelect, onCancel }: OpenEndPickerPopupProps) {
  const [openEnds, setOpenEnds] = useState<Entry[] | null>(null);

  useEffect(() => {
    api.get<Entry[]>("/api/journal/loose-ends").then(setOpenEnds).catch(() => setOpenEnds([]));
  }, []);

  return (
    <div className="open-end-popup-backdrop" onClick={onCancel}>
      <div className="open-end-popup" onClick={e => e.stopPropagation()}>
        <p className="open-end-popup-label">Which open end does this close?</p>
        {openEnds === null && <p className="open-end-popup-status">Loading…</p>}
        {openEnds?.length === 0 && <p className="open-end-popup-status">No open ends found.</p>}
        {openEnds?.map(e => (
          <button key={e.id} className="open-end-popup-item" onClick={() => onSelect(e)}>
            <span className="loose-end-badge loose-end-badge--open">◎</span>
            <span className="open-end-popup-subject">{e.subject ?? "(no subject)"}</span>
            <span className="open-end-popup-date">{e.entryDate}</span>
          </button>
        ))}
        <button className="open-end-popup-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── EntryForm ──────────────────────────────────────────────────────── */
type EntryFormProps = {
  entryDate: string;
  initial?: Entry;
  onSave: (e: Entry) => void;
  onCancel: () => void;
  onPunch?: (note: string, color: string) => void;
};
export function EntryForm({ entryDate, initial, onSave, onCancel, onPunch }: EntryFormProps) {
  const [subject,      setSubject]      = useState(initial?.subject ?? "");
  const [content,      setContent]      = useState(initial?.content ?? "");
  const [startHHMM,    setStartHHMM]    = useState(initial ? toHHMM(initial.startTime) : nowHHMM());
  const [hasEnd,       setHasEnd]       = useState(Boolean(initial?.endTime));
  const [endHHMM,      setEndHHMM]      = useState(initial?.endTime ? toHHMM(initial.endTime) : "");
  const [color,        setColor]        = useState(initial?.color ?? "#8a9aaa");

  const [date,         setDate]         = useState(initial?.entryDate ?? entryDate);
  const [timesOpen,    setTimesOpen]    = useState(false);
  const [showSubject,  setShowSubject]  = useState(Boolean(initial?.subject));
  const [saving,       setSaving]       = useState(false);
  const [punchMode,    setPunchMode]    = useState(false);
  const [punchNote,    setPunchNote]    = useState("");
  const [looseEndType,    setLooseEndType]    = useState<'open' | 'close' | null>(initial?.looseEndType ?? null);
  const [looseEndLink,    setLooseEndLink]    = useState<number | null>(initial?.looseEndLink ?? null);
  const [showOpenPicker,  setShowOpenPicker]  = useState(false);
  const [swatchOpen,      setSwatchOpen]      = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.key === "s") { e.preventDefault(); void submit(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, startHHMM, hasEnd, endHHMM, content, subject, color, looseEndType, looseEndLink]);

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
        subject:      subject.trim() || null,
        content:      content.trim(),
        entryDate:    date,
        startTime:    startIso,
        endTime:      endIso,
        color,
        looseEndType,
        looseEndLink: looseEndType === 'close' ? looseEndLink : null,
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
        <div className="entry-form-color-trigger-group">
          <button
            className="entry-color-trigger"
            style={{ background: color }}
            aria-label="Pick color"
            onClick={() => setSwatchOpen(o => !o)}
          />
          {swatchOpen && (
            <div className="entry-form-colors">
              {ENTRY_COLORS.map(c => (
                <button key={c.hex}
                  className={`entry-color-swatch${color === c.hex ? " selected" : ""}`}
                  style={{ background: c.hex }} aria-label={c.label}
                  onClick={() => { setColor(c.hex); setSwatchOpen(false); }} />
              ))}
            </div>
          )}
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
      {showOpenPicker && (
        <OpenEndPickerPopup
          onSelect={opener => { setLooseEndLink(opener.id); setLooseEndType('close'); setShowOpenPicker(false); }}
          onCancel={() => setShowOpenPicker(false)}
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
        <div className="entry-form-color-trigger-group">
          <button
            className="entry-color-trigger"
            style={{ background: color }}
            aria-label="Pick color"
            onClick={() => setSwatchOpen(o => !o)}
          />
          {swatchOpen && (
            <div className="entry-form-colors">
              {ENTRY_COLORS.map(c => (
                <button key={c.hex}
                  className={`entry-color-swatch${color === c.hex ? " selected" : ""}`}
                  style={{ background: c.hex }} aria-label={c.label}
                  onClick={() => { setColor(c.hex); setSwatchOpen(false); }} />
              ))}
            </div>
          )}
        </div>
        <div className="entry-form-action-right">
          <div className="entry-form-loose-end-group">
            <button
              className={`entry-form-loose-btn${looseEndType === 'open' ? ' active' : ''}`}
              onClick={() => { setLooseEndType(t => t === 'open' ? null : 'open'); setLooseEndLink(null); }}
              title="Open loose end"
              type="button"
            >◎</button>
            <button
              className={`entry-form-loose-btn${looseEndType === 'close' ? ' active' : ''}${looseEndType === 'close' && !looseEndLink ? ' needs-link' : ''}`}
              onClick={() => {
                if (looseEndType === 'close' && looseEndLink !== null) { setLooseEndType(null); setLooseEndLink(null); }
                else setShowOpenPicker(true);
              }}
              title={looseEndType === 'close' ? 'Remove close link' : 'Close an open end'}
              type="button"
            >◉</button>
          </div>
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
          <button className="primary" onClick={submit} disabled={saving || (!content.trim() && !subject.trim())}>
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
  onNavigate?: (entry: Entry) => void;
};
export function EntryModal({ entry, onClose, onUpdate, onDelete, onNavigate }: EntryModalProps) {
  const [currentEntry, setCurrentEntry] = useState(entry);
  const [history,      setHistory]      = useState<Entry[]>([]);
  const [editing,      setEditing]      = useState(false);
  const [confirmMsg,   setConfirmMsg]   = useState<string | null>(null);
  const [closeEntry,   setCloseEntry]   = useState<Entry | null>(null);
  const [links,        setLinks]        = useState<JournalLink[]>([]);
  const [viewingLink,  setViewingLink]  = useState<JournalLink | null>(null);

  // When parent opens a different entry, reset internal navigation
  useEffect(() => {
    setCurrentEntry(entry);
    setHistory([]);
    setEditing(false);
    setConfirmMsg(null);
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch links for the current entry
  useEffect(() => {
    api.get<JournalLink[]>(`/api/journal/links?sourceType=entry&sourceId=${currentEntry.id}`)
      .then(setLinks)
      .catch(() => {});
  }, [currentEntry.id]);

  const isOpener = currentEntry.looseEndType === 'open';
  const isCloser = currentEntry.looseEndType === 'close';

  // Fetch the close entry for any non-close entry (looseEndType may be null on old resolved openers)
  useEffect(() => {
    if (isCloser) { setCloseEntry(null); return; }
    api.get<Entry[]>(`/api/journal/entries?looseEndLink=${currentEntry.id}`)
      .then(rows => setCloseEntry(rows[0] ?? null))
      .catch(() => setCloseEntry(null));
  }, [currentEntry.id, isCloser]);

  function navigateTo(target: Entry) {
    setHistory(prev => [...prev, currentEntry]);
    setCurrentEntry(target);
    setEditing(false);
    setConfirmMsg(null);
  }

  function goBack() {
    setHistory(prev => {
      const next = [...prev];
      const prev_entry = next.pop()!;
      setCurrentEntry(prev_entry);
      setEditing(false);
      setConfirmMsg(null);
      return next;
    });
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmMsg) setConfirmMsg(null);
        else if (history.length > 0) goBack();
        else onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, confirmMsg, history.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDeleteClick() {
    if (isOpener) {
      setConfirmMsg("This is an open loose end — delete anyway?");
      return;
    }
    if (isCloser) {
      setConfirmMsg("This will remove this loose end closure — delete anyway?");
      return;
    }
    onDelete(currentEntry.id);
    onClose();
  }

  function confirmAndDelete() {
    onDelete(currentEntry.id);
    onClose();
  }

  return (
    <>
    {viewingLink && (
      <LinkViewModal
        link={viewingLink}
        zIndex={900}
        onClose={() => setViewingLink(null)}
        onUpdate={updated => { setLinks(prev => prev.map(l => l.id === updated.id ? updated : l)); setViewingLink(updated); }}
        onDelete={id => { setLinks(prev => prev.filter(l => l.id !== id)); setViewingLink(null); }}
      />
    )}
    <div className="entry-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !viewingLink) onClose(); }}>
      <div className="entry-modal" role="dialog" aria-modal="true">
        <div className="entry-modal-header">
          {history.length > 0 && (
            <button className="entry-modal-back" onClick={goBack} aria-label="Back">‹</button>
          )}
          <span className="entry-modal-date">{fmtFullDate(currentEntry.entryDate + "T00:00:00")}</span>
          <button className="entry-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {editing ? (
          <div className="entry-modal-body">
            <EntryForm
              entryDate={currentEntry.entryDate}
              initial={currentEntry}
              onSave={e => { setCurrentEntry(e); onUpdate(e); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            <div className="entry-modal-body">
              <p className="entry-modal-time">
                {(isOpener || (!isCloser && closeEntry)) && <span className="loose-end-badge loose-end-badge--open" title="Open loose end">◎ </span>}
                {isCloser && <span className="loose-end-badge loose-end-badge--closed" title="Closes a loose end">◉ </span>}
                {fmtRange(currentEntry.startTime, currentEntry.endTime)}
                {currentEntry.endTime && (
                  <span className="entry-modal-duration">
                    {fmtDuration(currentEntry.startTime, currentEntry.endTime)}
                  </span>
                )}
              </p>
              {currentEntry.subject && (
                <h2 className="entry-modal-subject">{currentEntry.subject}</h2>
              )}
              {currentEntry.content && (
                <p className="entry-modal-content">
                  <LinkedContentArea
                    text={currentEntry.content}
                    links={links}
                    onCreateLink={async (anchorText, content, occurrence) => {
                      const link = await api.post<JournalLink>("/api/journal/links", {
                        anchorText, content, occurrence, sourceType: "entry", sourceId: currentEntry.id,
                      });
                      setLinks(prev => [link, ...prev]);
                    }}
                    onLinkClick={setViewingLink}
                  />
                </p>
              )}
              {!currentEntry.subject && !currentEntry.content && (
                <p className="entry-modal-empty">No content.</p>
              )}
              {isCloser && (
                currentEntry.looseEndLink
                  ? <button
                      className="entry-modal-open-link"
                      onClick={async () => {
                        const opener = await api.get<Entry>(`/api/journal/entries/${currentEntry.looseEndLink}`);
                        navigateTo(opener);
                      }}
                    >◎ View open end →</button>
                  : <p className="entry-modal-link-note unlinked">No open end linked — edit to add one</p>
              )}
              {!isCloser && closeEntry && (
                <button
                  className="entry-modal-open-link entry-modal-open-link--close"
                  onClick={() => navigateTo(closeEntry)}
                >◉ View close entry →</button>
              )}
            </div>
            {confirmMsg ? (
              <div className="entry-modal-footer entry-modal-footer--confirm">
                <span className="entry-modal-confirm-msg">{confirmMsg}</span>
                <button onClick={() => setConfirmMsg(null)}>Cancel</button>
                <button className="journal-action-btn danger" onClick={confirmAndDelete}>
                  <IcTrash /> Delete
                </button>
              </div>
            ) : (
              <div className="entry-modal-footer">
                <button
                  className="journal-action-btn danger"
                  onClick={handleDeleteClick}
                  aria-label="Delete"
                >
                  <IcTrash /> Delete
                </button>
                <button className="primary" onClick={() => setEditing(true)}>
                  <IcEdit /> Edit
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
