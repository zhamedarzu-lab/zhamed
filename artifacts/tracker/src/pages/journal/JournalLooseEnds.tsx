import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { type Entry, fmtRange, fmtFullDate, EntryModal } from "./EntryModal";

const IcBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);

type Tab = "open" | "close";

export default function JournalLooseEnds() {
  const navigate = useNavigate();
  const [tab,      setTab]      = useState<Tab>("open");
  const [entries,  setEntries]  = useState<Entry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Entry | null>(null);

  useEffect(() => {
    api.get<Entry[]>("/api/journal/entries")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  // Opener IDs that have a close entry pointing at them
  const resolvedOpenerIds = useMemo(() => {
    const s = new Set<number>();
    for (const e of entries) {
      if (e.looseEndLink != null) s.add(e.looseEndLink);
    }
    return s;
  }, [entries]);

  const results = useMemo(() => {
    if (tab === "open") {
      return entries
        .filter(e => e.looseEndType === "open" && !resolvedOpenerIds.has(e.id))
        .sort((a, b) => b.startTime.localeCompare(a.startTime));
    }
    return entries
      .filter(e => e.looseEndType === "close")
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  }, [tab, entries, resolvedOpenerIds]);

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of results) {
      const arr = map.get(e.entryDate) ?? [];
      arr.push(e);
      map.set(e.entryDate, arr);
    }
    return Array.from(map.entries());
  }, [results]);

  return (
    <div className="jsearch-shell">
      {/* Header */}
      <div className="jsearch-header jle-header">
        <button className="jsearch-back" onClick={() => navigate("/journal")} aria-label="Back to journal">
          <IcBack />
        </button>
        <div className="jle-tabs">
          <button
            className={`jle-tab${tab === "open" ? " active" : ""}`}
            onClick={() => setTab("open")}
          >◎ Open ends</button>
          <button
            className={`jle-tab${tab === "close" ? " active" : ""}`}
            onClick={() => setTab("close")}
          >◉ Closed ends</button>
        </div>
      </div>

      {/* Results */}
      <div className="jsearch-body">
        {loading && <p className="jsearch-empty">Loading…</p>}

        {!loading && groups.length === 0 && (
          <p className="jsearch-empty">
            {tab === "open" ? "No open loose ends." : "No closed loose ends."}
          </p>
        )}

        {!loading && groups.length > 0 && (
          <p className="jsearch-meta">
            {results.length} {results.length === 1 ? "entry" : "entries"}
            {groups.length > 1 ? ` across ${groups.length} days` : ""}
          </p>
        )}

        {groups.map(([date, group]) => (
          <div key={date} className="jsearch-group">
            <p className="jsearch-group-date">{fmtFullDate(date + "T00:00:00").toUpperCase()}</p>
            {group.map(e => {
              const isOpener = e.looseEndType === "open";
              const isCloser = e.looseEndType === "close";
              return (
                <button key={e.id} className="jsearch-card" onClick={() => setSelected(e)}>
                  <div className="jsearch-card-accent" style={{ background: e.color, ...(e.color === "#1c1c1e" ? { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)" } : {}) }} />
                  <div className="jsearch-card-body">
                    <p className="jsearch-card-time">{fmtRange(e.startTime, e.endTime)}</p>
                    {e.subject && (
                      <p className="jsearch-card-subject">
                        {isOpener && <span className="loose-end-badge loose-end-badge--open">◎</span>}
                        {isCloser && <span className="loose-end-badge loose-end-badge--closed">◉</span>}
                        {" "}{e.subject}
                      </p>
                    )}
                    {e.content && <p className="jsearch-card-content">{e.content}</p>}
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
            onNavigate={e => setSelected(e)}
          />
        )}
      </div>
    </div>
  );
}
