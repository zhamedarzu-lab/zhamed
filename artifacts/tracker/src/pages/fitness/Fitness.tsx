import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { api, useApi } from "../../lib/api";
import { shortDate, todayIso } from "../../lib/format";
import { Empty, Loading, Notice, tagColor } from "../../components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseStat = {
  exerciseId: number;
  name: string;
  unit: string;
  active: boolean;
  sortOrder: number;
  todayTotal: number;
  last7: number;
  prev7: number;
  delta: number;
  bestDay: { date: string; amount: number } | null;
  sparkline: Array<{ date: string; value: number }>;
};

type Summary = {
  consistencyStrip: Array<{ date: string; active: boolean }>;
  exercises: ExerciseStat[];
};

function currentSlot() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 17) return "noon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Fitness() {
  const summary  = useApi<Summary>("/api/fitness/summary");
  const [error,   setError]   = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);

  async function addExercise() {
    if (!newName.trim() || !newUnit.trim()) return;
    setAddBusy(true);
    setError(null);
    try {
      await api.post("/api/fitness/exercises", {
        name: newName.trim(),
        unit: newUnit.trim(),
      });
      setNewName("");
      setNewUnit("");
      nameRef.current?.focus();
      await summary.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add exercise.");
    } finally {
      setAddBusy(false);
    }
  }

  const activeExercises = (summary.data?.exercises ?? []).filter((e) => e.active);
  const activeDays = (summary.data?.consistencyStrip ?? []).filter((d) => d.active).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Fitness</h1></div>
        {summary.data && (
          <div className="ft-cycle-stat">
            <span className="ft-cycle-num">{activeDays}</span>
            <span className="ft-cycle-denom">/14</span>
            <span className="ft-cycle-label">this cycle</span>
          </div>
        )}
      </div>

      <Notice>{error}</Notice>
      {summary.loading && <Loading />}

      {summary.data && (
        <>
          <WeekGrid exercises={activeExercises} />

          {activeExercises.length === 0 ? (
            <Empty title="No exercises yet">
              <p>Add your first exercise below.</p>
            </Empty>
          ) : (
            <div className="ft-list">
              {activeExercises.map((ex) => (
                <ExerciseRow
                  key={ex.exerciseId}
                  stat={ex}
                  onChanged={summary.reload}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Add exercise */}
      <div
        className="panel-body bills-add-row"
        style={{ marginTop: "1.25rem", border: "1px solid var(--rule)", borderRadius: 4 }}
      >
        <input
          ref={nameRef}
          value={newName}
          placeholder="Exercise — Pushups, Plank…"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && unitRef.current?.focus()}
          style={{ flex: 2 }}
        />
        <input
          ref={unitRef}
          value={newUnit}
          placeholder="Unit — reps, secs, mins"
          onChange={(e) => setNewUnit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addExercise()}
          style={{ flex: 1 }}
        />
        <button
          className="primary"
          onClick={addExercise}
          disabled={addBusy || !newName.trim() || !newUnit.trim()}
        >
          Add
        </button>
      </div>
    </>
  );
}

// ─── Activity grid ────────────────────────────────────────────────────────────

function WeekGrid({ exercises }: { exercises: ExerciseStat[] }) {
  const today = todayIso();

  const weekDays = useMemo(() => {
    const t = new Date(today + "T12:00:00");
    const dow = (t.getDay() + 6) % 7; // Mon=0 … Sun=6
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(t);
      d.setDate(t.getDate() - dow + i);
      return d.toISOString().slice(0, 10);
    });
  }, [today]);

  const rows = useMemo(
    () =>
      weekDays.map((date) => ({
        date,
        done: exercises.filter(
          (ex) => (ex.sparkline.find((s) => s.date === date)?.value ?? 0) > 0,
        ),
      })),
    [weekDays, exercises],
  );

  return (
    <div className="ft-week">
      {rows.map(({ date, done }) => {
        const isToday = date === today;
        const d = new Date(date + "T12:00:00");
        const label = d.toLocaleDateString("en-US", { weekday: "narrow" });
        const num = d.getDate();
        return (
          <div key={date} className={`ft-week-col${isToday ? " ft-week-col--today" : ""}`}>
            <div className="ft-week-label">{label}</div>
            <div className="ft-week-date">{num}</div>
            <div className="ft-week-dots">
              {done.map((ex) => (
                <div
                  key={ex.exerciseId}
                  className="ft-week-dot"
                  style={{ background: tagColor(ex.name) }}
                  title={ex.name}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Exercise row ─────────────────────────────────────────────────────────────

function ExerciseRow({
  stat,
  onChanged,
  onError,
}: {
  stat: ExerciseStat;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [amount, setAmount] = useState("");
  const [busy,   setBusy]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = tagColor(stat.name);

  async function deleteExercise(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${stat.name}"? This removes all its history.`)) return;
    onError(null);
    try {
      await api.del(`/api/fitness/exercises/${stat.exerciseId}`);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete exercise.");
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function openRow() {
    setAmount("");
    setOpen(true);
    onError(null);
  }

  async function submit() {
    const n = parseFloat(amount);
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    onError(null);
    try {
      await api.post("/api/fitness/efforts", {
        exerciseId: stat.exerciseId,
        date:       todayIso(),

        amount:     n,
      });
      setAmount("");
      setOpen(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not log effort.");
    } finally {
      setBusy(false);
    }
  }

  const both0   = stat.last7 === 0 && stat.prev7 === 0;
  const deltaText =
    both0              ? null
    : stat.prev7 === 0 ? "first week"
    : stat.delta >= 0  ? `↑ ${stat.delta}%`
    :                    `↓ ${Math.abs(stat.delta)}%`;
  const deltaUp = stat.delta >= 0;

  return (
    <div
      className={`ft-row${open ? " ft-row--open" : ""}`}
      style={{ "--row-color": color } as CSSProperties}
    >
      {/* Main tap target */}
      <div
        className="ft-row-main"
        onClick={() => { if (open) setOpen(false); else openRow(); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            if (open) setOpen(false); else openRow();
          }
        }}
        aria-label={`Log ${stat.name}`}
        aria-expanded={open}
      >
        <div className="ft-row-left">
          <span className="ft-row-name">{stat.name}</span>
          <div className="ft-row-meta">
            {deltaText && (
              <span
                className="ft-row-delta"
                style={{ color: deltaUp ? "#5fc97a" : "var(--stamp)" }}
              >
                {deltaText}
              </span>
            )}
            {stat.bestDay && (
              <span className="ft-row-best">
                {deltaText ? " · " : ""}best {stat.bestDay.amount.toLocaleString()} {shortDate(stat.bestDay.date)}
              </span>
            )}
          </div>
        </div>

        <div className="ft-row-right">
          <div className="ft-row-today">
            <span className={`ft-row-total${stat.todayTotal > 0 ? " ft-row-total--active" : ""}`}>
              {stat.todayTotal > 0 ? stat.todayTotal.toLocaleString() : "—"}
            </span>
            <span className="ft-row-unit">{stat.unit}</span>
          </div>
          <div className="ft-row-trail">
            {stat.sparkline.map((s) => (
              <div
                key={s.date}
                className={`ft-row-dot${s.value > 0 ? " ft-row-dot--on" : ""}`}
                style={s.value > 0 ? { background: color } : undefined}
                title={
                  s.value > 0
                    ? `${s.value.toLocaleString()} on ${shortDate(s.date)}`
                    : shortDate(s.date)
                }
              />
            ))}
          </div>
        </div>

        <button
          className="quiet ft-row-delete"
          onClick={deleteExercise}
          aria-label={`Delete ${stat.name}`}
          title={`Delete ${stat.name}`}
        >
          ✕
        </button>
      </div>

      {/* Inline log form */}
      {open && (
        <div className="ft-log-form">
          <input
            ref={inputRef}
            className="ft-log-input"
            inputMode="decimal"
            value={amount}
            placeholder={stat.unit}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")  submit();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <button
            className="primary ft-log-submit"
            onClick={submit}
            disabled={busy || !amount.trim()}
          >
            ✓
          </button>
          <button
            className="quiet ft-log-cancel"
            onClick={() => setOpen(false)}
            type="button"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
