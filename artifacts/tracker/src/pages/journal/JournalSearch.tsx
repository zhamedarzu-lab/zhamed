import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { type Entry, fmtTime, fmtFullDate, EntryModal } from "./EntryModal";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap matched spans in a <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="search-hl">{part}</mark>
          : part
      )}
    </>
  );
}

const IcBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);


export default function JournalSearch() {
  const navigate  = useNavigate();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [query,        setQuery]        = useState("");
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeColors, setActiveColors] = useState<Set<string>>(new Set());
  const [selected,     setSelected]     = useState<Entry | null>(null);

  useEffect(() => {
    api.get<Entry[]>("/api/journal/entries")
      .then(setEntries)
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // Colors ordered by frequency of use (most-used first)
  const colorPalette = useMemo(() => {
    const freq = new Map<string, number>();
    for (const e of entries) freq.set(e.color, (freq.get(e.color) ?? 0) + 1);
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);
  }, [entries]);

  function toggleColor(color: string) {
    setActiveColors(prev => {
      const next = new Set(prev);
      next.has(color) ? next.delete(color) : next.add(color);
      return next;
    });
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasText   = q.length > 0;
    const hasColors = activeColors.size > 0;

    // Need at least one active filter to show anything
    if (!hasText && !hasColors) return [];

    return entries
      .filter(e => {
        const colorOk = !hasColors || activeColors.has(e.color);
        const textOk  = !hasText  ||
          e.content.toLowerCase().includes(q) ||
          (e.subject ?? "").toLowerCase().includes(q);
        return colorOk && textOk;
      })
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  }, [query, entries, activeColors]);

  // Group results by date
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of results) {
      const arr = map.get(e.entryDate) ?? [];
      arr.push(e);
      map.set(e.entryDate, arr);
    }
    return Array.from(map.entries());
  }, [results]);

  const q = query.trim();
  const hasFilter = q.length > 0 || activeColors.size > 0;

  return (
    <div className="jsearch-shell">
      {/* Header */}
      <div className="jsearch-header">
        <button className="jsearch-back" onClick={() => navigate("/journal")} aria-label="Back to journal">
          <IcBack />
        </button>
        <div className="jsearch-input-wrap">
          <input
            ref={inputRef}
            className="jsearch-input"
            placeholder="Search entries…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") navigate("/journal"); }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="jsearch-clear" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Color filter strip */}
      {!loading && colorPalette.length > 0 && (
        <div className="jsearch-colors">
          {colorPalette.map(color => (
            <button
              key={color}
              className={`jsearch-color-chip${activeColors.has(color) ? " active" : ""}`}
              style={{ "--chip-color": color } as React.CSSProperties}
              onClick={() => toggleColor(color)}
              aria-label={`Filter by color ${color}`}
              aria-pressed={activeColors.has(color)}
            />
          ))}
          {activeColors.size > 0 && (
            <button
              className="jsearch-color-clear"
              onClick={() => setActiveColors(new Set())}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="jsearch-body">
        {loading && <p className="jsearch-status">Loading entries…</p>}

        {!loading && !hasFilter && (
          <p className="jsearch-status">Search by keyword, or tap a color to filter.</p>
        )}

        {!loading && hasFilter && results.length === 0 && (
          <p className="jsearch-status">No entries match{q ? <> "<strong>{q}</strong>"</> : null}{activeColors.size > 0 ? " with the selected color" + (activeColors.size > 1 ? "s" : "") : ""}.</p>
        )}

        {!loading && hasFilter && results.length > 0 && (
          <p className="jsearch-hits">
            <strong>{results.length}</strong> {results.length === 1 ? "entry" : "entries"}
            {" across "}
            <strong>{groups.length}</strong> {groups.length === 1 ? "day" : "days"}
          </p>
        )}

        {groups.map(([date, group]) => (
          <div key={date} className="jsearch-group">
            <p className="jsearch-group-date">{fmtFullDate(date)}</p>
            {group.map(e => (
              <button key={e.id} className="jsearch-card" onClick={() => setSelected(e)}>
                <div className="jsearch-card-accent" style={{ background: e.color }} />
                <div className="jsearch-card-body">
                  <p className="jsearch-card-time">{fmtTime(e.startTime)}</p>
                  {e.subject && (
                    <p className="jsearch-card-subject">
                      <Highlight text={e.subject} query={q} />
                    </p>
                  )}
                  {e.content && (
                    <p className="jsearch-card-content">
                      <Highlight text={e.content} query={q} />
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ))}

        {selected && (
          <EntryModal
            entry={selected}
            onClose={() => setSelected(null)}
            onUpdate={updated => {
              setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
              setSelected(updated);
            }}
            onDelete={id => {
              setEntries(prev => prev.filter(e => e.id !== id));
              setSelected(null);
            }}
          />
        )}

      </div>
    </div>
  );
}
