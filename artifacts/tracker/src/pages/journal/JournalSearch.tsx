import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { type Entry, ENTRY_COLORS, fmtTime, fmtRange, fmtFullDate, EntryModal } from "./EntryModal";

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

/** Special filter modes triggered by shortcut queries */
type FilterMode = "normal" | "open-ends" | "closed-ends";

function detectMode(q: string): FilterMode {
  const lower = q.toLowerCase().trim();
  if (lower === "(((" || lower === "(((open") return "open-ends";
  if (lower === ")))" || lower === ")))closed") return "closed-ends";
  return "normal";
}

export default function JournalSearch() {
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [query,        setQuery]        = useState(() => searchParams.get("q") ?? "");
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

  // Always show all palette colors in fixed ROYGBIV order
  const colorPalette = useMemo(() => {
    const freq = new Map<string, number>();
    for (const e of entries) freq.set(e.color, (freq.get(e.color) ?? 0) + 1);
    return ENTRY_COLORS.map(c => ({ ...c, count: freq.get(c.hex) ?? 0 }));
  }, [entries]);

  function toggleColor(color: string) {
    setActiveColors(prev => {
      const next = new Set(prev);
      next.has(color) ? next.delete(color) : next.add(color);
      return next;
    });
  }

  // Compute which opener IDs have been closed (client-side, from loaded entries)
  const closedOpenerIds = useMemo(() => {
    const s = new Set<number>();
    for (const e of entries) {
      if (e.looseEndLink !== null && e.looseEndLink !== undefined) s.add(e.looseEndLink);
    }
    return s;
  }, [entries]);

  const filterMode = detectMode(query);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasColors = activeColors.size > 0;

    if (filterMode === "open-ends") {
      // All (((  entries with no closer
      return entries
        .filter(e => {
          const colorOk = !hasColors || activeColors.has(e.color);
          return colorOk && e.subject?.includes("(((") && !closedOpenerIds.has(e.id);
        })
        .sort((a, b) => b.startTime.localeCompare(a.startTime));
    }

    if (filterMode === "closed-ends") {
      // All (((  entries that have been closed
      return entries
        .filter(e => {
          const colorOk = !hasColors || activeColors.has(e.color);
          return colorOk && e.subject?.includes("(((") && closedOpenerIds.has(e.id);
        })
        .sort((a, b) => b.startTime.localeCompare(a.startTime));
    }

    // Normal text filter
    const hasText = q.length > 0;
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
  }, [query, entries, activeColors, filterMode, closedOpenerIds]);

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

  const modeLabel = filterMode === "open-ends"
    ? "Open loose ends"
    : filterMode === "closed-ends"
    ? "Closed loose ends"
    : null;

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
            placeholder="Search entries… (try (((open or )))closed)"
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

      {/* Shortcut chips */}
      {!loading && (
        <div className="jsearch-shortcuts">
          <button
            className={`jsearch-shortcut-chip${filterMode === "open-ends" ? " active" : ""}`}
            onClick={() => setQuery(filterMode === "open-ends" ? "" : "(((open")}
          >
            ◎ Open ends
          </button>
          <button
            className={`jsearch-shortcut-chip${filterMode === "closed-ends" ? " active" : ""}`}
            onClick={() => setQuery(filterMode === "closed-ends" ? "" : ")))closed")}
          >
            ◉ Closed ends
          </button>
        </div>
      )}

      {/* Color filter strip */}
      {!loading && (
        <div className="jsearch-colors">
          {colorPalette.map(({ hex, hint, count }) => (
            <button
              key={hex}
              className={`jsearch-color-chip${activeColors.has(hex) ? " active" : ""}${count === 0 ? " unused" : ""}`}
              style={{ "--chip-color": hex } as React.CSSProperties}
              onClick={() => toggleColor(hex)}
              aria-label={`Filter by ${hint}`}
              aria-pressed={activeColors.has(hex)}
            >
              <span className="jsearch-chip-dot" />
            </button>
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

        {!loading && modeLabel && (
          <p className="jsearch-mode-label">{modeLabel}</p>
        )}

        {!loading && hasFilter && results.length === 0 && (
          <p className="jsearch-status">
            {modeLabel
              ? `No ${modeLabel.toLowerCase()}.`
              : <>No entries match{q ? <> "<strong>{q}</strong>"</> : null}{activeColors.size > 0 ? " with the selected color" + (activeColors.size > 1 ? "s" : "") : ""}.</>
            }
          </p>
        )}

        {!loading && hasFilter && results.length > 0 && (
          <p className="jsearch-hits">
            <strong>{results.length}</strong> {results.length === 1 ? "entry" : "entries"}
            {filterMode === "normal" && (
              <>
                {" across "}
                <strong>{groups.length}</strong> {groups.length === 1 ? "day" : "days"}
              </>
            )}
          </p>
        )}

        {groups.map(([date, group]) => (
          <div key={date} className="jsearch-group">
            <p className="jsearch-group-date">{fmtFullDate(date)}</p>
            {group.map(e => {
              const isOpener = e.subject?.includes("(((");
              const isCloser = e.subject?.includes(")))");
              const isClosed = isOpener && closedOpenerIds.has(e.id);
              return (
                <button key={e.id} className="jsearch-card" onClick={() => setSelected(e)}>
                  <div className="jsearch-card-accent" style={{ background: e.color, ...(e.color === "#1c1c1e" ? { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)" } : {}) }} />
                  <div className="jsearch-card-body">
                    <p className="jsearch-card-time">{fmtRange(e.startTime, e.endTime)}</p>
                    {e.subject && (
                      <p className="jsearch-card-subject">
                        {isOpener && <span className={`loose-end-badge loose-end-badge--${isClosed ? "closed" : "open"}`} title={isClosed ? "Closed loose end" : "Open loose end"}>{isClosed ? "◉" : "◎"}</span>}
                        {isCloser && <span className="loose-end-badge loose-end-badge--closer" title="Closes a loose end">◉</span>}
                        {" "}
                        <Highlight text={e.subject} query={filterMode === "normal" ? q : ""} />
                      </p>
                    )}
                    {e.content && (
                      <p className="jsearch-card-content">
                        <Highlight text={e.content} query={filterMode === "normal" ? q : ""} />
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
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
