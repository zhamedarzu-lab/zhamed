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
  weekTotal: number;
  monthTotal: number;
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
    const dow = t.getDay(); // Sun=0 … Sat=6
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

// ─── Slot labels ──────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  morning:    "Morning",
  before_noon:"Before Noon",
  noon:       "Noon",
  afternoon:  "Afternoon",
  evening:    "Evening",
  night:      "Night",
};

type Effort = { id: number; exerciseId: number; date: string; slot: string; amount: number };

// ─── History modal ────────────────────────────────────────────────────────────

function HistoryModal({
  stat,
  color,
  onClose,
}: {
  stat: ExerciseStat;
  color: string;
  onClose: () => void;
}) {
  const [efforts, setEfforts] = useState<Effort[] | null>(null);

  useEffect(() => {
    api.get<Effort[]>(`/api/fitness/efforts?exerciseId=${stat.exerciseId}`)
      .then(setEfforts)
      .catch(() => setEfforts([]));
  }, [stat.exerciseId]);

  // Group efforts by date for the list
  const byDate = useMemo(() => {
    if (!efforts) return [];
    const map = new Map<string, Effort[]>();
    for (const e of efforts) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30); // last 30 days that have entries
  }, [efforts]);

  return (
    <div className="ft-history-overlay" onClick={onClose}>
      <div className="ft-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-history-header">
          <span className="ft-history-title" style={{ color }}>{stat.name}</span>
          <button className="quiet" onClick={onClose}>✕</button>
        </div>

        <HistoryChart sparkline={stat.sparkline} color={color} unit={stat.unit} />

        <div className="ft-history-log">
          {efforts === null && <p className="ft-history-empty">Loading…</p>}
          {efforts !== null && byDate.length === 0 && (
            <p className="ft-history-empty">No entries yet.</p>
          )}
          {byDate.map(([date, entries]) => {
            const d = new Date(date + "T12:00:00");
            const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
            return (
              <div key={date} className="ft-history-day">
                <span className="ft-history-day-label">{label}</span>
                <div className="ft-history-entries">
                  {entries.map((e) => (
                    <div key={e.id} className="ft-history-entry">
                      <span className="ft-history-slot">{SLOT_LABELS[e.slot] ?? e.slot}</span>
                      <span className="ft-history-amount">
                        {Number(e.amount).toLocaleString()}
                        <span className="ft-history-unit"> {stat.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── History chart ────────────────────────────────────────────────────────────

function HistoryChart({
  sparkline,
  color,
  unit,
}: {
  sparkline: Array<{ date: string; value: number }>;
  color: string;
  unit: string;
}) {
  const today  = todayIso();
  const maxVal = Math.max(...sparkline.map((s) => s.value), 1);
  const W = 300, H = 120, padX = 8, padBottom = 20;
  const n    = sparkline.length;
  const slot = (W - padX * 2) / n;
  const barW = Math.max(slot - 3, 4);

  return (
    <svg
      viewBox={`0 0 ${W} ${H + padBottom}`}
      width="100%"
      style={{ display: "block", overflow: "visible" }}
      aria-label={`${unit} history`}
    >
      {sparkline.map((s, i) => {
        const barH   = s.value > 0 ? Math.max((s.value / maxVal) * H, 4) : 0;
        const x      = padX + i * slot;
        const y      = H - barH;
        const isToday = s.date === today;
        const d      = new Date(s.date + "T12:00:00");
        const dayLbl = d.toLocaleDateString("en-US", { weekday: "narrow" });
        const dateLbl = d.getDate();
        return (
          <g key={s.date}>
            {barH > 0 && (
              <rect
                x={x + (slot - barW) / 2}
                y={y}
                width={barW}
                height={barH}
                fill={color}
                opacity={isToday ? 1 : 0.55}
                rx={2}
              />
            )}
            {barH > 0 && (
              <text
                x={x + slot / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="8"
                fill={color}
                opacity={isToday ? 1 : 0.7}
              >
                {s.value.toLocaleString()}
              </text>
            )}
            <text
              x={x + slot / 2}
              y={H + 11}
              textAnchor="middle"
              fontSize="8"
              fill={isToday ? color : "var(--ink-faint)"}
              fontWeight={isToday ? "700" : "400"}
            >
              {dayLbl}
            </text>
            <text
              x={x + slot / 2}
              y={H + 20}
              textAnchor="middle"
              fontSize="7"
              fill={isToday ? color : "var(--ink-faint)"}
              opacity="0.7"
            >
              {dateLbl}
            </text>
          </g>
        );
      })}
      {/* Baseline */}
      <line x1={padX} y1={H} x2={W - padX} y2={H} stroke="var(--rule)" strokeWidth="1" />
    </svg>
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
  const [open,        setOpen]        = useState(false);
  const [amount,      setAmount]      = useState("");
  const [busy,        setBusy]        = useState(false);
  const [period,      setPeriod]      = useState<"D" | "W" | "M">("D");
  const [showHistory, setShowHistory] = useState(false);
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
          <button
            type="button"
            className="ft-period-cycle"
            onClick={(e) => {
              e.stopPropagation();
              setPeriod((p) => p === "D" ? "W" : p === "W" ? "M" : "D");
            }}
            title="Tap to cycle Day / Week / Month"
          >
            <span className="ft-period-cycle-lbl">
              {period === "D" ? "Day" : period === "W" ? "Week" : "Month"}
            </span>
            <span className={`ft-row-stat-val${
              period === "D" && stat.todayTotal > 0 ? " ft-row-stat-val--active" : ""
            }`}>
              {(period === "D" ? stat.todayTotal : period === "W" ? stat.weekTotal : stat.monthTotal) > 0
                ? (period === "D" ? stat.todayTotal : period === "W" ? stat.weekTotal : stat.monthTotal).toLocaleString()
                : "—"}
            </span>
            <span className="ft-row-stat-unit">{stat.unit}</span>
          </button>
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
          <button
            type="button"
            className="quiet ft-history-btn"
            onClick={() => setShowHistory(true)}
            title="View history"
          >
            ↗
          </button>
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
        </div>
      )}

      {/* History modal */}
      {showHistory && (
        <HistoryModal stat={stat} color={color} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
