import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { type Entry, ENTRY_COLORS, fmtTime, fmtRange, fmtFullDate, EntryModal } from "./EntryModal";
import { type JournalLink, renderLinked, LinkViewModal } from "./LinkedContent";

type PeriodNote = { id: number; periodType: string; periodKey: string; content: string; createdAt: string };

function notePeriodLabel(type: string, key: string): string {
  if (type === "day") {
    const d = new Date(key + "T00:00:00");
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    if (key === todayKey) return "Today";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (type === "week") {
    const [year, wk] = key.split("-W");
    return `Week ${wk}, ${year}`;
  }
  if (type === "month") {
    const [year, mo] = key.split("-");
    const d = new Date(Number(year), Number(mo) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return key; // year
}

function notePeriodTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

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

export default function JournalSearch() {
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [query,        setQuery]        = useState(() => searchParams.get("q") ?? "");
  const [filterMode,   setFilterMode]   = useState<FilterMode>("normal");
  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeColors, setActiveColors] = useState<Set<string>>(new Set());
  const [selected,     setSelected]     = useState<Entry | null>(null);
  const [periodNotes,  setPeriodNotes]  = useState<PeriodNote[]>([]);
  const [entryLinks,   setEntryLinks]   = useState<JournalLink[]>([]);
  const [viewingLink,  setViewingLink]  = useState<JournalLink | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Entry[]>("/api/journal/entries"),
      api.get<PeriodNote[]>("/api/journal/period-notes/all"),
      api.get<JournalLink[]>("/api/journal/links?sourceType=entry"),
    ]).then(([ents, notes, links]) => {
      setEntries(ents);
      setPeriodNotes(notes);
      setEntryLinks(links);
    })
      .catch(() => { /* the empty-state below is the error state */ })
      .finally(() => setLoading(false));

    // Focus once the modal has settled; cleared on unmount so a quick
    // navigation away does not leave the timer running.
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(focusTimer);
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

  // Opener IDs that have an explicit close entry pointing at them via looseEndLink
  const resolvedOpenerIds = useMemo(() => {
    const s = new Set<number>();
    for (const e of entries) {
      if (e.looseEndLink !== null && e.looseEndLink !== undefined) s.add(e.looseEndLink);
    }
    return s;
  }, [entries]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasColors = activeColors.size > 0;

    if (filterMode === "open-ends") {
      return entries
        .filter(e => {
          const colorOk = !hasColors || activeColors.has(e.color);
          return colorOk && e.looseEndType === "open" && !resolvedOpenerIds.has(e.id);
        })
        .sort((a, b) => b.startTime.localeCompare(a.startTime));
    }

    if (filterMode === "closed-ends") {
      return entries
        .filter(e => {
          const colorOk = !hasColors || activeColors.has(e.color);
          return colorOk && e.looseEndType === "close";
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
  }, [query, entries, activeColors, filterMode, resolvedOpenerIds]);

  // Build a map from entryId → its links (for O(1) lookup in the render loop)
  const entryLinksMap = useMemo(() => {
    const map = new Map<number, JournalLink[]>();
    for (const link of entryLinks) {
      const arr = map.get(link.sourceId) ?? [];
      arr.push(link);
      map.set(link.sourceId, arr);
    }
    return map;
  }, [entryLinks]);

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

  // Period notes — only shown on text queries (no color/mode filter applies)
  const noteResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || filterMode !== "normal") return [];
    return periodNotes.filter(n => n.content.toLowerCase().includes(q));
  }, [query, periodNotes, filterMode]);

  const q = query.trim();
  const hasFilter = q.length > 0 || activeColors.size > 0 || filterMode !== "normal";

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
            placeholder=""
            value={query}
            onChange={e => { setQuery(e.target.value); setFilterMode("normal"); }}
            onKeyDown={e => { if (e.key === "Escape") navigate("/journal"); }}
            autoComplete="off"
            spellCheck={false}
          />
          {(query || filterMode !== "normal") && (
            <button className="jsearch-clear" onClick={() => { setQuery(""); setFilterMode("normal"); inputRef.current?.focus(); }} aria-label="Clear">
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
            onClick={() => { setQuery(""); setFilterMode(filterMode === "open-ends" ? "normal" : "open-ends"); }}
          >
            ◎ Open ends
          </button>
          <button
            className={`jsearch-shortcut-chip${filterMode === "closed-ends" ? " active" : ""}`}
            onClick={() => { setQuery(""); setFilterMode(filterMode === "closed-ends" ? "normal" : "closed-ends"); }}
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
            <p className="jsearch-group-date">{fmtFullDate(date + "T00:00:00")}</p>
            {group.map(e => {
              const isOpener = e.looseEndType === "open";
              const isCloser = e.looseEndType === "close";
              const links = entryLinksMap.get(e.id) ?? [];
              return (
                <button key={e.id} className="jsearch-card" onClick={() => setSelected(e)}>
                  <div className="jsearch-card-accent" style={{ background: e.color, ...(e.color === "#1c1c1e" ? { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)" } : {}) }} />
                  <div className="jsearch-card-body">
                    <p className="jsearch-card-time">{fmtRange(e.startTime, e.endTime)}</p>
                    {e.subject && (
                      <p className="jsearch-card-subject">
                        {isOpener && <span className="loose-end-badge loose-end-badge--open" title="Open loose end">◎</span>}
                        {isCloser && <span className="loose-end-badge loose-end-badge--closed" title="Closes a loose end">◉</span>}
                        {" "}
                        <Highlight text={e.subject} query={filterMode === "normal" ? q : ""} />
                      </p>
                    )}
                    {e.content && (
                      <p className="jsearch-card-content">
                        {links.length > 0
                          ? renderLinked(e.content, links, lnk => { setViewingLink(lnk); })
                          : <Highlight text={e.content} query={filterMode === "normal" ? q : ""} />
                        }
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {noteResults.length > 0 && (
          <>
            <p className="jsearch-hits jsearch-hits--notes">
              <strong>{noteResults.length}</strong> {noteResults.length === 1 ? "note" : "notes"}
            </p>
            {noteResults.map(n => (
              <div key={n.id} className="jsearch-note-card">
                <div className="jsearch-note-meta">
                  <span className="jsearch-note-type-badge">{notePeriodTypeLabel(n.periodType)}</span>
                  <span className="jsearch-note-meta-sep">·</span>
                  <span className="jsearch-note-period-label">{notePeriodLabel(n.periodType, n.periodKey)}</span>
                </div>
                <p className="jsearch-note-content">
                  <Highlight text={n.content} query={q} />
                </p>
              </div>
            ))}
          </>
        )}

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
            onNavigate={e => setSelected(e)}
          />
        )}

        {viewingLink && (
          <LinkViewModal
            link={viewingLink}
            onClose={() => setViewingLink(null)}
            onUpdate={updated => {
              setEntryLinks(prev => prev.map(l => l.id === updated.id ? updated : l));
              setViewingLink(updated);
            }}
            onDelete={id => {
              setEntryLinks(prev => prev.filter(l => l.id !== id));
              setViewingLink(null);
            }}
            zIndex={900}
          />
        )}

      </div>
    </div>
  );
}
