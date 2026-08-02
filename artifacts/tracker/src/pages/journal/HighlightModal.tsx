/**
 * HighlightModal — create / edit / delete a day highlight.
 * Supports whole-day, single time, or block time.
 */
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ENTRY_COLORS } from "./EntryModal";

export type DayHighlight = {
  id: number;
  date: string;
  label: string;
  color: string;
  showCountdown: boolean;
  startTime: string | null;
  endTime:   string | null;
  createdAt: string;
};

type TimeType = "allday" | "time" | "block";

type Props = {
  date: string; // YYYY-MM-DD
  existing: DayHighlight | null;
  onClose: () => void;
  onSave: (h: DayHighlight) => void;
  onDelete: (id: number) => void;
};

function inferTimeType(h: DayHighlight | null): TimeType {
  if (!h || !h.startTime) return "allday";
  if (h.endTime) return "block";
  return "time";
}

export default function HighlightModal({ date, existing, onClose, onSave, onDelete }: Props) {
  const [label,         setLabel]         = useState(existing?.label         ?? "");
  const [color,         setColor]         = useState(existing?.color         ?? "#4eaaee");
  const [showCountdown, setShowCountdown] = useState(existing?.showCountdown ?? false);
  const [timeType,      setTimeType]      = useState<TimeType>(() => inferTimeType(existing));
  const [startTime,     setStartTime]     = useState(existing?.startTime ?? "");
  const [endTime,       setEndTime]       = useState(existing?.endTime   ?? "");
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        date,
        label:         label.trim(),
        color,
        showCountdown,
        startTime: timeType !== "allday" && startTime ? startTime : null,
        endTime:   timeType === "block"  && endTime   ? endTime   : null,
      };
      const row: DayHighlight = existing
        ? await api.patch<DayHighlight>(`/api/journal/highlights/${existing.id}`, payload)
        : await api.post<DayHighlight>("/api/journal/highlights", payload);
      onSave(row);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    try {
      await api.del(`/api/journal/highlights/${existing.id}`);
      onDelete(existing.id);
    } finally {
      setDeleting(false);
    }
  }

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="entry-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="entry-modal highlight-modal" role="dialog" aria-modal="true">
        <div className="entry-modal-header">
          <span className="entry-modal-date">✦ {displayDate}</span>
          <button className="entry-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="entry-modal-body">
          <div className="highlight-form">

            {/* Label */}
            <input
              className="highlight-form-input highlight-label-input"
              type="text"
              placeholder="Label (e.g. dentist, concert…)"
              value={label}
              autoFocus
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && label.trim()) void save(); }}
            />

            {/* Colors */}
            <div className="entry-form-colors">
              {ENTRY_COLORS.filter(c => c.hex !== "#1c1c1e").map(c => (
                <button
                  key={c.hex}
                  className={`entry-color-swatch${color === c.hex ? " selected" : ""}`}
                  style={{ background: c.hex }}
                  aria-label={c.label}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>

            {/* Time type + countdown on one row */}
            <div className="highlight-controls-row">
              <div className="highlight-time-tabs">
                {(["allday", "time", "block"] as TimeType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`highlight-time-tab${timeType === t ? " active" : ""}`}
                    onClick={() => {
                      setTimeType(t);
                      if (t === "allday") { setStartTime(""); setEndTime(""); }
                      if (t === "time")   { setEndTime(""); }
                    }}
                  >
                    {t === "allday" ? "All day" : t === "time" ? "Time" : "Block"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`highlight-toggle${showCountdown ? " on" : ""}`}
                onClick={() => setShowCountdown(v => !v)}
                aria-pressed={showCountdown}
                title="Show countdown in month view"
              >
                {showCountdown ? "🔔 On" : "🔔"}
              </button>
            </div>

            {/* Time inputs — key on timeType forces remount on tab switch, clearing browser-held values */}
            {timeType !== "allday" && (
              <div className="highlight-time-row">
                <input
                  key={`start-${timeType}`}
                  className="highlight-form-input highlight-time-input"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                />
                {timeType === "block" && (
                  <>
                    <span className="highlight-time-arrow">→</span>
                    <input
                      key="end-block"
                      className="highlight-form-input highlight-time-input"
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                    />
                  </>
                )}
              </div>
            )}

          </div>
        </div>

        <div className="entry-modal-footer">
          {existing && (
            <button
              className="journal-action-btn danger"
              onClick={remove}
              disabled={deleting}
            >
              {deleting ? "Removing…" : "Remove"}
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving || !label.trim()}>
            {saving ? "Saving…" : existing ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
