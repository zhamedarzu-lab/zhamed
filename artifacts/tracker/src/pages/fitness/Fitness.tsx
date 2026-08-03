import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { api, useApi } from "../../lib/api";
import { shortDate, todayIso } from "../../lib/format";
import { Empty, Loading, Notice, tagColor } from "../../components/ui";
import { ENTRY_COLORS } from "../journal/EntryModal";

const FITNESS_COLORS = ENTRY_COLORS.slice(0, 7); // R O Y G B + pink + purple

// ─── Types ────────────────────────────────────────────────────────────────────


type ExerciseStat = {
  exerciseId: number;
  name: string;
  unit: string;
  color: string | null;
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
  const summary  = useApi<Summary>(`/api/fitness/summary?today=${todayIso()}`);
  const [error,    setError]    = useState<string | null>(null);
  const [addOpen,       setAddOpen]       = useState(false);
  const [newName,       setNewName]       = useState("");
  const [newUnit,       setNewUnit]       = useState("");
  const [newColor,      setNewColor]      = useState<string | null>(null);
  const [addColorOpen,  setAddColorOpen]  = useState(false);
  const [addBusy,       setAddBusy]       = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addOpen) nameRef.current?.focus();
  }, [addOpen]);

  function closeAddForm() {
    setAddOpen(false);
    setNewName("");
    setNewUnit("");
    setNewColor(null);
    setAddColorOpen(false);
  }

  async function addExercise() {
    if (!newName.trim() || !newUnit.trim()) return;
    setAddBusy(true);
    setError(null);
    try {
      await api.post("/api/fitness/exercises", {
        name:  newName.trim(),
        unit:  newUnit.trim(),
        color: newColor,
      });
      closeAddForm();
      await summary.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add exercise.");
    } finally {
      setAddBusy(false);
    }
  }

  const [openId,   setOpenId]   = useState<number | null>(null);
  const [swipeId,  setSwipeId]  = useState<number | null>(null);

  const activeExercises = (summary.data?.exercises ?? []).filter((e) => e.active);
  const activeDays = (summary.data?.consistencyStrip ?? []).filter((d) => d.active).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Fitness</h1></div>
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
                  isOpen={openId === ex.exerciseId}
                  onOpen={setOpenId}
                  isSwipeOpen={swipeId === ex.exerciseId}
                  onSwipeOpen={setSwipeId}
                  onChanged={summary.reload}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Add exercise */}
      {!addOpen ? (
        <button
          className="ft-add-btn"
          onClick={() => setAddOpen(true)}
        >
          + Add exercise
        </button>
      ) : (
        <div className="ft-add-form">
          <div className="ft-edit-fields">
            <div className="ft-edit-inputs">
              <button
                type="button"
                className="ft-color-trigger"
                style={{ background: newColor ?? "var(--ink-faint)" }}
                onClick={() => setAddColorOpen(o => !o)}
                title="Choose color"
              />
              <input
                ref={nameRef}
                value={newName}
                placeholder="Name — Pushups, Plank…"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && unitRef.current?.focus()}
                style={{ flex: 2 }}
              />
              <input
                ref={unitRef}
                value={newUnit}
                placeholder="Unit — reps, secs…"
                onChange={(e) => setNewUnit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  addExercise();
                  if (e.key === "Escape") closeAddForm();
                }}
                style={{ flex: 1 }}
              />
            </div>
            {addColorOpen && (
              <div className="ft-edit-swatches">
                {FITNESS_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    className={`ft-swatch${newColor === c.hex ? " ft-swatch--active" : ""}`}
                    style={{ background: c.hex }}
                    onClick={() => {
                      setNewColor(newColor === c.hex ? null : c.hex);
                      setAddColorOpen(false);
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            className="primary"
            onClick={addExercise}
            disabled={addBusy || !newName.trim() || !newUnit.trim()}
          >
            Add
          </button>
          <button className="quiet" onClick={closeAddForm}>✕</button>
        </div>
      )}
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
        done: exercises.filter((ex) => {
          if (date === today) return ex.todayTotal > 0;
          return (ex.sparkline.find((s) => s.date === date)?.value ?? 0) > 0;
        }),
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
                  style={{ background: ex.color ?? tagColor(ex.name) }}
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
  onChanged,
}: {
  stat: ExerciseStat;
  color: string;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [efforts,  setEfforts]  = useState<Effort[] | null>(null);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

  function loadEfforts() {
    return api.get<Effort[]>(`/api/fitness/efforts?exerciseId=${stat.exerciseId}`)
      .then(setEfforts)
      .catch(() => setEfforts([]));
  }
  useEffect(() => { loadEfforts(); }, [stat.exerciseId]);

  async function deleteEffort(id: number) {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await api.del(`/api/fitness/efforts/${id}`);
      setEfforts((prev) => prev?.filter((e) => e.id !== id) ?? null);
      await onChanged();
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  // 30-day chart data built from fetched efforts
  const chartData = useMemo(() => {
    const today = todayIso();
    const byDate = new Map<string, number>();
    for (const e of efforts ?? []) {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.amount);
    }
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() - (29 - i));
      const date = d.toISOString().slice(0, 10);
      return { date, value: byDate.get(date) ?? 0 };
    });
  }, [efforts]);

  // Summary stats
  const stats = useMemo(() => {
    if (!efforts || efforts.length === 0) return null;
    const total      = efforts.reduce((s, e) => s + e.amount, 0);
    const activeDates = new Set(efforts.map((e) => e.date));
    const avg        = Math.round(total / activeDates.size);

    // Current streak — consecutive days with entries ending today or yesterday
    const today = todayIso();
    let streak = 0;
    const cur = new Date(today + "T12:00:00");
    // allow today to be empty (streak carries from yesterday)
    if (!activeDates.has(today)) cur.setDate(cur.getDate() - 1);
    while (activeDates.has(cur.toISOString().slice(0, 10))) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }

    return { total, avg, streak };
  }, [efforts]);

  // Group by date for the log list
  const byDate = useMemo(() => {
    if (!efforts) return [];
    const map = new Map<string, Effort[]>();
    for (const e of efforts) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [efforts]);

  return (
    <div className="ft-history-overlay" onClick={onClose}>
      <div className="ft-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-history-header">
          <span className="ft-history-title" style={{ color }}>{stat.name}</span>
          <button className="quiet" onClick={onClose}>✕</button>
        </div>

        <HistoryChart data={chartData} color={color} unit={stat.unit} />

        {/* Summary stats */}
        {stats && (
          <div className="ft-history-stats">
            <div className="ft-history-stat">
              <span className="ft-history-stat-val" style={{ color }}>{stats.streak}</span>
              <span className="ft-history-stat-lbl">day streak</span>
            </div>
            <div className="ft-history-stat">
              <span className="ft-history-stat-val">{stats.avg.toLocaleString()}</span>
              <span className="ft-history-stat-lbl">avg / day</span>
            </div>
            <div className="ft-history-stat">
              <span className="ft-history-stat-val">{stats.total.toLocaleString()}</span>
              <span className="ft-history-stat-lbl">all time · {stat.unit}</span>
            </div>
          </div>
        )}

        {/* Log list */}
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
                      <button
                        className="quiet ft-entry-delete"
                        onClick={() => deleteEffort(e.id)}
                        disabled={deleting.has(e.id)}
                        title="Delete entry"
                      >
                        ✕
                      </button>
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
  data,
  color,
  unit,
}: {
  data: Array<{ date: string; value: number }>;
  color: string;
  unit: string;
}) {
  const today  = todayIso();
  const maxVal = Math.max(...data.map((s) => s.value), 1);
  const W = 300, H = 110, padX = 4, padBottom = 14;
  const n       = data.length;
  const slotW   = (W - padX * 2) / n;
  const barW    = Math.max(slotW - 2, 2);
  // Show date label every 5 bars + today
  const showLabel = (i: number) => i === n - 1 || i === 0 || (n - 1 - i) % 5 === 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H + padBottom}`}
      width="100%"
      style={{ display: "block", overflow: "visible" }}
      aria-label={`${unit} history`}
    >
      {data.map((s, i) => {
        const barH    = s.value > 0 ? Math.max((s.value / maxVal) * H, 3) : 0;
        const x       = padX + i * slotW;
        const y       = H - barH;
        const isToday = s.date === today;
        const d       = new Date(s.date + "T12:00:00");
        const dateLbl = d.getDate();
        return (
          <g key={s.date}>
            <rect
              x={x + (slotW - barW) / 2}
              y={barH > 0 ? y : H - 2}
              width={barW}
              height={barH > 0 ? barH : 2}
              fill={barH > 0 ? color : "var(--rule-strong)"}
              opacity={barH > 0 ? (isToday ? 1 : 0.5) : 0.15}
              rx={1}
            />
            {isToday && barH > 0 && (
              <text
                x={x + slotW / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="7"
                fill={color}
              >
                {s.value.toLocaleString()}
              </text>
            )}
            {showLabel(i) && (
              <text
                x={x + slotW / 2}
                y={H + 11}
                textAnchor="middle"
                fontSize="7"
                fill={isToday ? color : "var(--ink-faint)"}
                fontWeight={isToday ? "700" : "400"}
              >
                {dateLbl}
              </text>
            )}
          </g>
        );
      })}
      <line x1={padX} y1={H} x2={W - padX} y2={H} stroke="var(--rule)" strokeWidth="1" />
    </svg>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  stat,
  color,
  onClose,
  onChanged,
  onError,
}: {
  stat: ExerciseStat;
  color: string;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [editName,        setEditName]        = useState(stat.name);
  const [editUnit,        setEditUnit]        = useState(stat.unit);
  const [editColor,       setEditColor]       = useState<string | null>(stat.color ?? null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [busy,            setBusy]            = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function saveEdit() {
    if (!editName.trim() || !editUnit.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api.patch(`/api/fitness/exercises/${stat.exerciseId}`, {
        name:  editName.trim(),
        unit:  editUnit.trim(),
        color: editColor,
      });
      onClose();
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update exercise.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ft-edit-overlay" onClick={onClose}>
      <div className="ft-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ft-edit-modal-header">
          <span className="ft-edit-modal-title" style={{ color }}>
            Edit exercise
          </span>
          <button className="quiet" onClick={onClose}>✕</button>
        </div>

        <div className="ft-edit-fields">
          <div className="ft-edit-inputs">
            <button
              type="button"
              className="ft-color-trigger"
              style={{ background: editColor ?? color }}
              onClick={() => setColorPickerOpen((o) => !o)}
              title="Choose color"
            />
            <input
              ref={nameRef}
              className="ft-edit-input"
              value={editName}
              placeholder="Name"
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  saveEdit();
                if (e.key === "Escape") onClose();
              }}
            />
            <input
              className="ft-edit-unit"
              value={editUnit}
              placeholder="Unit"
              onChange={(e) => setEditUnit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  saveEdit();
                if (e.key === "Escape") onClose();
              }}
            />
          </div>
          {colorPickerOpen && (
            <div className="ft-edit-swatches">
              {FITNESS_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`ft-swatch${editColor === c.hex ? " ft-swatch--active" : ""}`}
                  style={{ background: c.hex }}
                  onClick={() => {
                    setEditColor(editColor === c.hex ? null : c.hex);
                    setColorPickerOpen(false);
                  }}
                  title={c.label}
                />
              ))}
            </div>
          )}
        </div>

        <div className="ft-edit-modal-actions">
          <button
            className="primary"
            onClick={saveEdit}
            disabled={busy || !editName.trim() || !editUnit.trim()}
          >
            Save
          </button>
          <button className="quiet" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Exercise row ─────────────────────────────────────────────────────────────

function ExerciseRow({
  stat,
  isOpen,
  onOpen,
  isSwipeOpen,
  onSwipeOpen,
  onChanged,
  onError,
}: {
  stat: ExerciseStat;
  isOpen: boolean;
  onOpen: (id: number | null) => void;
  isSwipeOpen: boolean;
  onSwipeOpen: (id: number | null) => void;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [amount,      setAmount]      = useState("");
  const [busy,        setBusy]        = useState(false);
  const [period,      setPeriod]      = useState<"D" | "W" | "M">("D");
  const [showHistory, setShowHistory] = useState(false);
  const [showEdit,    setShowEdit]    = useState(false);
  const [swipeDir,    setSwipeDir]    = useState<"left" | "right" | null>(null);
  const [liveOffset,  setLiveOffset]  = useState<number | null>(null); // non-null while finger is down

  const touchStartX   = useRef(0);
  const touchStartY   = useRef(0);
  const touchCurX     = useRef(0);
  const isHoriz       = useRef(false);
  const lastTapTime   = useRef(0);
  const inputRef      = useRef<HTMLInputElement>(null);

  const color = stat.color ?? tagColor(stat.name);

  // When another card takes the swipe slot, close this card's swipe
  useEffect(() => {
    if (!isSwipeOpen) setSwipeDir(null);
  }, [isSwipeOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const LEFT_SNAP  = -140; // card shifts left → reveals edit + delete on right
  const RIGHT_SNAP =   90; // card shifts right → reveals history on left
  const THRESHOLD  =   60;

  // Base position from snapped state; liveOffset adds the live finger delta on top
  const snapBase   = swipeDir === "left" ? LEFT_SNAP : swipeDir === "right" ? RIGHT_SNAP : 0;
  const translateX = liveOffset !== null ? snapBase + liveOffset : snapBase;

  // ── Touch handlers ──────────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurX.current   = e.touches[0].clientX;
    isHoriz.current     = false;
    setLiveOffset(null);
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchCurX.current = e.touches[0].clientX;
    const rawDx = e.touches[0].clientX - touchStartX.current;
    const dx    = Math.abs(rawDx);
    const dy    = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dx > 5 || dy > 5) {
      if (dy <= dx * 1.2) isHoriz.current = true;
    }
    if (isHoriz.current) {
      // Clamp so card doesn't fly way past the action zones (soft rubber-band)
      const raw     = snapBase + rawDx;
      const clamped = Math.max(LEFT_SNAP - 24, Math.min(RIGHT_SNAP + 24, raw));
      setLiveOffset(clamped - snapBase);
    }
  }

  function handleTouchEnd() {
    // Zeroing liveOffset re-enables the CSS transition → snaps to new swipeDir
    setLiveOffset(null);
    const dx = touchCurX.current - touchStartX.current;

    if (!isHoriz.current) {
      // ── Tap ──────────────────────────────────────────────────────────
      const now = Date.now();
      const gap = now - lastTapTime.current;

      if (gap < 300 && gap > 0) {
        // Double-tap → open inline input (or close if already open)
        if (swipeDir !== null) { setSwipeDir(null); onSwipeOpen(null); }
        onOpen(isOpen ? null : stat.exerciseId);
        lastTapTime.current = 0; // reset so triple-tap doesn't re-fire
      } else {
        // Single tap → close swipe/input if open, otherwise do nothing
        if (swipeDir !== null) {
          setSwipeDir(null);
          onSwipeOpen(null);
        } else if (isOpen) {
          onOpen(null);
        }
        lastTapTime.current = now;
      }
      return;
    }

    // ── Swipe ─────────────────────────────────────────────────────────
    if (swipeDir === null) {
      if (dx < -THRESHOLD) {
        setSwipeDir("left");
        onOpen(null); // close any open input
        onSwipeOpen(stat.exerciseId);
      } else if (dx > THRESHOLD) {
        setSwipeDir("right");
        onOpen(null);
        onSwipeOpen(stat.exerciseId);
      }
    } else if (swipeDir === "left" && dx > THRESHOLD) {
      setSwipeDir(null);
      onSwipeOpen(null);
    } else if (swipeDir === "right" && dx < -THRESHOLD) {
      setSwipeDir(null);
      onSwipeOpen(null);
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────

  async function deleteExercise() {
    if (!confirm(`Delete "${stat.name}"? This removes all its history.`)) return;
    onError(null);
    setSwipeDir(null);
    onSwipeOpen(null);
    try {
      await api.del(`/api/fitness/exercises/${stat.exerciseId}`);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete exercise.");
    }
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
      onOpen(null);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not log effort.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ft-row" style={{ "--row-color": color } as CSSProperties}>

      {/* Edit modal */}
      {showEdit && (
        <EditModal
          stat={stat}
          color={color}
          onClose={() => setShowEdit(false)}
          onChanged={onChanged}
          onError={onError}
        />
      )}

      {/* History modal */}
      {showHistory && (
        <HistoryModal
          stat={stat}
          color={color}
          onClose={() => setShowHistory(false)}
          onChanged={onChanged}
        />
      )}

      {/* Swipe track */}
      <div className="ft-swipe-track">

        {/* Action buttons revealed by LEFT swipe (sit on right side) */}
        <div className="ft-swipe-actions-right">
          <button
            className="ft-swipe-btn ft-swipe-btn--edit"
            onClick={() => { setSwipeDir(null); onSwipeOpen(null); setShowEdit(true); }}
          >
            Edit
          </button>
          <button
            className="ft-swipe-btn ft-swipe-btn--delete"
            onClick={deleteExercise}
          >
            Delete
          </button>
        </div>

        {/* Action button revealed by RIGHT swipe (sits on left side) */}
        <div className="ft-swipe-actions-left">
          <button
            className="ft-swipe-btn ft-swipe-btn--history"
            onClick={() => { setSwipeDir(null); onSwipeOpen(null); setShowHistory(true); }}
          >
            History
          </button>
        </div>

        {/* Card face — translates over the action buttons */}
        <div
          className="ft-swipe-card"
          style={{
            transform:  `translateX(${translateX}px)`,
            transition: liveOffset !== null ? "none" : undefined,
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="ft-row-main"
            role="button"
            tabIndex={0}
            aria-label={`${stat.name} — click to log`}
            aria-expanded={isOpen}
            onClick={() => {
              // Desktop / pointer fallback: single click toggles inline input
              if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                if (swipeDir !== null) { setSwipeDir(null); onSwipeOpen(null); }
                if (isOpen) { onOpen(null); setAmount(""); }
                else         { onOpen(stat.exerciseId); onSwipeOpen(null); }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                if (isOpen) { onOpen(null); setAmount(""); }
                else         onOpen(stat.exerciseId);
              }
            }}
          >
            <div className="ft-row-left">
              <span className="ft-row-name">{stat.name}</span>
            </div>

            <div className="ft-row-right">
              {/* Desktop-only action buttons — hidden on touch, visible on hover */}
              <div className="ft-row-desktop-actions">
                <button
                  type="button"
                  className="ft-desktop-action-btn"
                  title="History"
                  onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
                >↗</button>
                <button
                  type="button"
                  className="ft-desktop-action-btn"
                  title="Edit"
                  onClick={(e) => { e.stopPropagation(); setShowEdit(true); }}
                >✎</button>
                <button
                  type="button"
                  className="ft-desktop-action-btn ft-desktop-action-btn--delete"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); deleteExercise(); }}
                >🗑</button>
              </div>

              <button
                type="button"
                className="ft-period-cycle"
                onTouchEnd={(e) => e.stopPropagation()}
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
          </div>

          {/* Inline rep input — revealed by double-tap */}
          {isOpen && (
            <div
              className="ft-inline-input"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                className="ft-log-input"
                inputMode="decimal"
                value={amount}
                placeholder={stat.unit}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  submit();
                  if (e.key === "Escape") { onOpen(null); setAmount(""); }
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
                className="quiet"
                onClick={() => { onOpen(null); setAmount(""); }}
                title="Close"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
