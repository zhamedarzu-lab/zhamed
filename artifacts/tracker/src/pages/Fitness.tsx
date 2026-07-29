import { useState } from "react";
import { api, useApi } from "../lib/api";
import { shortDate, todayIso } from "../lib/format";
import { Empty, Field, Loading, Notice, Panel } from "../components/ui";

type Log = {
  id: number;
  date: string;
  workoutType: string | null;
  notes: string | null;
};

export default function Fitness() {
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterTag, setFilterTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = new URLSearchParams();
  if (filterTag) query.set("tag", filterTag);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const qs = query.toString();

  const logs = useApi<Log[]>(`/api/fitness/logs${qs ? `?${qs}` : ""}`, [qs]);
  const types = useApi<string[]>("/api/fitness/types");

  async function add() {
    setError(null);
    setSaving(true);
    try {
      await api.post("/api/fitness/logs", {
        date,
        workoutType: type.trim() || null,
        notes: notes.trim() || null,
      });
      setType("");
      setNotes("");
      await Promise.all([logs.reload(), types.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that entry.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    await api.del(`/api/fitness/logs/${id}`);
    await logs.reload();
  }

  const recent = (logs.data ?? []).slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Fitness</span>
          <h1>Training log</h1>
          <p>Date, label, a few words. That's the whole form.</p>
        </div>
      </div>

      <Notice>{error}</Notice>

      <Panel title="Log a session">
        <div className="grid" style={{ gridTemplateColumns: "150px 1fr", gap: "0.75rem" }}>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="What kind">
            <input
              value={type}
              placeholder="Push day, run, climbing…"
              list="workout-types"
              onChange={(e) => setType(e.target.value)}
            />
            <datalist id="workout-types">
              {(types.data ?? []).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Notes">
            <textarea
              value={notes}
              placeholder="Sets, distance, how it felt — whatever you'll want to read back."
              style={{ minHeight: "5.5rem" }}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="button-row" style={{ marginTop: "0.75rem" }}>
          <button className="primary" onClick={add} disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </button>
          {(types.data ?? []).slice(0, 5).map((t) => (
            <button key={t} className="quiet" onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
      </Panel>

      <div style={{ height: "1.25rem" }} />

      {recent.length > 0 && (
        <div className="stats" style={{ marginBottom: "1.25rem" }}>
          <div className="stat-cell">
            <span className="eyebrow">Sessions logged</span>
            <span className="amount fig">{logs.data?.length ?? 0}</span>
          </div>
          <div className="stat-cell">
            <span className="eyebrow">Most recent</span>
            <span className="amount fig">{shortDate(recent[0].date)}</span>
          </div>
          <div className="stat-cell">
            <span className="eyebrow">Labels in use</span>
            <span className="amount fig">{types.data?.length ?? 0}</span>
          </div>
        </div>
      )}

      <Panel
        title="History"
        action={
          <div className="button-row">
            <select
              aria-label="Filter by workout type"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              style={{ width: "auto" }}
            >
              <option value="">All types</option>
              {(types.data ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ width: "auto" }}
            />
            <input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ width: "auto" }}
            />
            {(filterTag || from || to) && (
              <button
                className="quiet"
                onClick={() => {
                  setFilterTag("");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        }
        bodyless
      >
        {logs.loading && <Loading />}
        {logs.data?.length === 0 && (
          <Empty title="Nothing logged in this range">
            <p>Log a session above and it lands here.</p>
          </Empty>
        )}
        {(logs.data?.length ?? 0) > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Date</th>
                <th style={{ width: 160 }}>Type</th>
                <th>Notes</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {logs.data!.map((l) => (
                <tr key={l.id}>
                  <td className="fig">{shortDate(l.date)}</td>
                  <td>{l.workoutType ? <span className="tag">{l.workoutType}</span> : <span className="faint">—</span>}</td>
                  <td className="muted" style={{ whiteSpace: "pre-wrap" }}>
                    {l.notes}
                  </td>
                  <td>
                    <button className="quiet danger" onClick={() => remove(l.id)} aria-label="Delete entry">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
