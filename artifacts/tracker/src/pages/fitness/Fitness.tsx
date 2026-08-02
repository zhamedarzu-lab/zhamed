import { useState, useRef, useEffect } from "react";
import { api, useApi } from "../../lib/api";
import { shortDate, todayIso } from "../../lib/format";
import {
  Panel,
  Empty,
  Loading,
  Notice,
  BalanceChart,
  tagColor,
  type Point,
} from "../../components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type StripDay = { date: string; active: boolean };

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
  consistencyStrip: StripDay[];
  exercises: ExerciseStat[];
};

const SLOTS = ["morning", "noon", "evening", "night"] as const;
type Slot = (typeof SLOTS)[number];

const SLOT_LABELS: Record<Slot, string> = {
  morning: "AM",
  noon:    "Noon",
  evening: "PM",
  night:   "Night",
};

function currentSlot(): Slot {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "morning";
  if (h >= 12 && h < 17) return "noon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Fitness() {
  const summary = useApi<Summary>("/api/fitness/summary");
  const [error, setError]     = useState<string | null>(null);
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

  return (
    <>
      <div className="page-head">
        <div><h1>Fitness</h1></div>
      </div>

      <Notice>{error}</Notice>
      {summary.loading && <Loading />}

      {/* ── Consistency strip ── */}
      {summary.data && (
        <ConsistencyStrip strip={summary.data.consistencyStrip} />
      )}

      {/* ── Exercise cards ── */}
      {!summary.loading && activeExercises.length === 0 ? (
        <Empty title="No exercises yet">
          <p>Add your first exercise below.</p>
        </Empty>
      ) : (
        <div className="grid grid-2">
          {activeExercises.map((ex) => (
            <ExerciseCard
              key={ex.exerciseId}
              stat={ex}
              onChanged={summary.reload}
              onError={setError}
            />
          ))}
        </div>
      )}

      {/* ── Add exercise ── */}
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

// ─── Consistency strip ────────────────────────────────────────────────────────

function ConsistencyStrip({ strip }: { strip: StripDay[] }) {
  const today = todayIso();
  return (
    <div className="fitness-strip-wrap">
      <span className="fitness-strip-label">14 days</span>
      <div className="fitness-strip-dots">
        {strip.map((day) => (
          <div
            key={day.date}
            className={[
              "fitness-dot",
              day.active   ? "fitness-dot--on"    : "",
              day.date === today ? "fitness-dot--today" : "",
            ].join(" ").trim()}
            title={shortDate(day.date)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  stat,
  onChanged,
  onError,
}: {
  stat: ExerciseStat;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const [amount,  setAmount]  = useState("");
  const [slot,    setSlot]    = useState<Slot>(currentSlot());
  const [busy,    setBusy]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = tagColor(stat.name);

  useEffect(() => {
    if (logOpen) inputRef.current?.focus();
  }, [logOpen]);

  function openLog() {
    setSlot(currentSlot());
    setAmount("");
    setLogOpen(true);
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
        slot,
        amount:     n,
      });
      setAmount("");
      setLogOpen(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not log effort.");
    } finally {
      setBusy(false);
    }
  }

  // Delta display
  const both0 = stat.last7 === 0 && stat.prev7 === 0;
  const deltaText =
    both0             ? null
    : stat.prev7 === 0 ? `↑ first week`
    : stat.delta >= 0  ? `↑ ${stat.delta}%`
    :                    `↓ ${Math.abs(stat.delta)}%`;
  const deltaPositive = stat.delta >= 0;

  // Sparkline — only render when there's something to show
  const sparkPoints: Point[] = stat.sparkline.map((p) => ({
    date:  p.date,
    value: p.value,
  }));
  const hasData = sparkPoints.some((p) => p.value > 0);

  return (
    <Panel bodyless>
      <div className="fitness-card-body">
        {/* Name + today's total */}
        <div className="fitness-card-name-row">
          <span className="fitness-card-name" style={{ color }}>
            {stat.name}
          </span>
          {stat.todayTotal > 0 && (
            <span className="fitness-today-badge">
              {stat.todayTotal.toLocaleString()} {stat.unit} today
            </span>
          )}
        </div>

        {/* Stats strip */}
        <div className="fitness-stats-row">
          <div className="fitness-stat">
            <span className="eyebrow">Last 7 days</span>
            <span className="fig fitness-stat-fig">
              {stat.last7.toLocaleString()}
              <span className="fitness-stat-unit"> {stat.unit}</span>
            </span>
          </div>

          {deltaText && (
            <div className="fitness-stat">
              <span className="eyebrow">vs prev 7</span>
              <span
                className="fig fitness-stat-fig fitness-delta"
                style={{ color: deltaPositive ? "#5fc97a" : "var(--stamp)" }}
              >
                {deltaText}
              </span>
            </div>
          )}

          {stat.bestDay && (
            <div className="fitness-stat">
              <span className="eyebrow">Best day</span>
              <span className="fig fitness-stat-fig">
                {stat.bestDay.amount.toLocaleString()}
                <span className="fitness-stat-unit"> · {shortDate(stat.bestDay.date)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Sparkline */}
        {hasData && (
          <div className="fitness-sparkline-wrap">
            <BalanceChart points={sparkPoints} color={color} height={80} />
          </div>
        )}
      </div>

      {/* Log footer */}
      <div className="fitness-log-footer">
        {!logOpen ? (
          <button
            className="quiet fitness-log-open"
            onClick={openLog}
            aria-label={`Log ${stat.name}`}
          >
            +
          </button>
        ) : (
          <div className="fitness-log-form">
            <input
              ref={inputRef}
              className="fitness-amount-input"
              inputMode="decimal"
              value={amount}
              placeholder={stat.unit}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  submit();
                if (e.key === "Escape") setLogOpen(false);
              }}
            />
            <div className="fitness-slots">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`fitness-slot-btn${slot === s ? " fitness-slot-btn--active" : ""}`}
                  onClick={() => setSlot(s)}
                >
                  {SLOT_LABELS[s]}
                </button>
              ))}
            </div>
            <button
              className="primary fitness-log-submit"
              onClick={submit}
              disabled={busy || !amount.trim()}
            >
              ✓
            </button>
            <button
              className="quiet fitness-log-cancel"
              onClick={() => setLogOpen(false)}
              type="button"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
