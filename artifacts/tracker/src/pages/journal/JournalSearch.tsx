import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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

function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}
function fmtFullDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
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
  const [query,   setQuery]   = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Entry[]>("/api/journal/entries")
      .then(setEntries)
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter(e =>
        e.content.toLowerCase().includes(q) ||
        (e.subject ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  }, [query, entries]);

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

      {/* Body */}
      <div className="jsearch-body">
        {loading && <p className="jsearch-status">Loading entries…</p>}

        {!loading && !q && (
          <p className="jsearch-status">Type to search all entries.</p>
        )}

        {!loading && q && results.length === 0 && (
          <p className="jsearch-status">No entries match <strong>"{q}"</strong>.</p>
        )}

        {groups.map(([date, group]) => (
          <div key={date} className="jsearch-group">
            <p className="jsearch-group-date">{fmtFullDate(date)}</p>
            {group.map(e => (
              <div key={e.id} className="jsearch-card">
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
              </div>
            ))}
          </div>
        ))}

        {!loading && q && results.length > 0 && (
          <p className="jsearch-count">{results.length} result{results.length !== 1 ? "s" : ""}</p>
        )}
      </div>
    </div>
  );
}
