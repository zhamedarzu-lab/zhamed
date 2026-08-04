import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { api, useApi } from "../../lib/api";
import { todayIso } from "../../lib/format";
import { Empty, Loading, Notice } from "../../components/ui";
import { ENTRY_COLORS } from "../journal/EntryModal";

const FITNESS_COLOR_HEXES = new Set(["#e82020","#e55c00","#f5c800","#1fcc55","#2b7fff","#e04e8a","#9b4ee0"]);
const FITNESS_COLORS = ENTRY_COLORS.filter(c => FITNESS_COLOR_HEXES.has(c.hex));
const FITNESS_DEFAULT_COLOR = "#888888";

// ─── Types ────────────────────────────────────────────────────────────────────


type GoalPeriod = "day" | "week" | "month";

type ExerciseStat = {
  exerciseId: number;
  name: string;
  unit: string;
  color: string | null;
  active: boolean;
  sortOrder: number;
  goalAmount:    number | null;
  goalPeriod:    GoalPeriod | null;
  goalDeadline:  string | null;
  goalStartDate: string | null;
  todayTotal:    number;
  weekTotal:     number;
  monthTotal:    number;
  deadlineTotal: number;
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
  if (h >=  5 && h <  8) return "early morning";
  if (h >=  8 && h < 11) return "morning";
  if (h >= 11 && h < 12) return "after morning";
  if (h >= 12 && h < 13) return "noon";
  if (h >= 13 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  if (h >= 20 && h < 23) return "night";
  return "midnight";
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

  const [numpadStat,  setNumpadStat]  = useState<ExerciseStat | null>(null);
  const [editStat,    setEditStat]    = useState<ExerciseStat | null>(null);
  const [historyStat, setHistoryStat] = useState<ExerciseStat | null>(null);
  const [goalStat,    setGoalStat]    = useState<ExerciseStat | null>(null);
  const [swipeId,     setSwipeId]     = useState<number | null>(null);

  // ── Drag-to-reorder ──────────────────────────────────────────────────
  type DragState = { fromId: number; overId: number; startY: number; currentY: number; rowHeight: number };
  const [localOrder, setLocalOrder] = useState<ExerciseStat[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Sync from server (skip while a drag is in flight to avoid jank)
  useEffect(() => {
    if (dragRef.current) return;
    setLocalOrder((summary.data?.exercises ?? []).filter((e) => e.active));
  }, [summary.data]);

  // Reordered list — used only for WeekGrid (stable DOM uses localOrder)
  const displayOrder = useMemo(() => {
    if (!dragState || dragState.fromId === dragState.overId) return localOrder;
    const fromIdx = localOrder.findIndex((e) => e.exerciseId === dragState.fromId);
    const overIdx = localOrder.findIndex((e) => e.exerciseId === dragState.overId);
    if (fromIdx === -1 || overIdx === -1) return localOrder;
    const arr = [...localOrder];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(overIdx, 0, item);
    return arr;
  }, [localOrder, dragState]);

  // Compute where to show the insertion-point indicator.
  // Uses localOrder indices directly — direction-aware:
  //   Drag UP   (fromIdx > overIdx): item lands before overId → top-edge on overId
  //   Drag DOWN (fromIdx < overIdx): item lands after  overId → top-edge on the next row,
  //                                  or bottom-edge on overId when it is the last row.
  const dropIndicator = useMemo<{ topId: number | null; bottomId: number | null }>(() => {
    const none = { topId: null, bottomId: null };
    if (!dragState || dragState.fromId === dragState.overId) return none;
    const fromIdx = localOrder.findIndex((e) => e.exerciseId === dragState.fromId);
    const overIdx = localOrder.findIndex((e) => e.exerciseId === dragState.overId);
    if (fromIdx === -1 || overIdx === -1) return none;
    if (fromIdx > overIdx) {
      // dragging UP — item will be inserted before overId
      return { topId: dragState.overId, bottomId: null };
    }
    // dragging DOWN — item will be inserted after overId
    const nextId = localOrder[overIdx + 1]?.exerciseId ?? null;
    if (nextId !== null) return { topId: nextId, bottomId: null };
    // landing at the very end — mark the bottom edge of the last row
    return { topId: null, bottomId: dragState.overId };
  }, [localOrder, dragState]);

  // CSS translateY for each row — dragging item follows finger; others slide into gap
  function getTranslateY(exerciseId: number, ds: DragState | null): number {
    if (!ds) return 0;
    const { fromId, overId, startY, currentY, rowHeight } = ds;
    if (exerciseId === fromId) return currentY - startY;
    const fromIdx = localOrder.findIndex((e) => e.exerciseId === fromId);
    const overIdx = localOrder.findIndex((e) => e.exerciseId === overId);
    const myIdx  = localOrder.findIndex((e) => e.exerciseId === exerciseId);
    if (fromIdx === -1 || overIdx === -1 || myIdx === -1) return 0;
    if (fromIdx < overIdx && myIdx > fromIdx && myIdx <= overIdx) return -rowHeight;
    if (fromIdx > overIdx && myIdx >= overIdx && myIdx < fromIdx) return  rowHeight;
    return 0;
  }

  function handleDragStart(exerciseId: number, clientY: number, rowHeight: number) {
    setSwipeId(null);
    const state: DragState = { fromId: exerciseId, overId: exerciseId, startY: clientY, currentY: clientY, rowHeight };
    dragRef.current = state;
    setDragState({ ...state });
    document.documentElement.style.overflow = "hidden";   // lock page scroll
    document.body.style.userSelect = "none";               // prevent text selection while dragging
  }

  function handleDragMove(clientX: number, clientY: number) {
    if (!dragRef.current) return;
    dragRef.current.currentY = clientY;
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const rowEl = el?.closest("[data-exercise-id]") as HTMLElement | null;
    if (rowEl) {
      const overId = parseInt(rowEl.dataset.exerciseId ?? "", 10);
      if (!isNaN(overId)) dragRef.current.overId = overId;
    }
    setDragState({ ...dragRef.current });
  }

  function handleDragEnd() {
    if (!dragRef.current) return;
    document.documentElement.style.overflow = "";
    document.body.style.userSelect = "";
    const { fromId, overId } = dragRef.current;
    dragRef.current = null;
    setDragState(null);
    if (fromId === overId) return;
    const fromIdx = localOrder.findIndex((e) => e.exerciseId === fromId);
    const overIdx = localOrder.findIndex((e) => e.exerciseId === overId);
    if (fromIdx === -1 || overIdx === -1) return;
    const newOrder = [...localOrder];
    const [item] = newOrder.splice(fromIdx, 1);
    newOrder.splice(overIdx, 0, item);
    setLocalOrder(newOrder);
    api.put("/api/fitness/exercises/reorder", { ids: newOrder.map((e) => e.exerciseId) })
      .catch(() => setError("Could not save order. Please try again."));
  }
  // ─────────────────────────────────────────────────────────────────────

  const activeDays = (summary.data?.consistencyStrip ?? []).filter((d) => d.active).length;

  return (
    <>
      <Notice>{error}</Notice>
      {summary.loading && <Loading />}

      {summary.data && (
        <>
          <WeekGrid exercises={displayOrder} />
          <OverallGoalBar exercises={localOrder} />

          {displayOrder.length === 0 ? (
            <Empty title="No exercises yet">
              <p>Add your first exercise below.</p>
            </Empty>
          ) : (
            <div className="ft-list">
              {localOrder.map((ex) => (
                <ExerciseRow
                  key={ex.exerciseId}
                  stat={ex}
                  isSwipeOpen={swipeId === ex.exerciseId}
                  onSwipeOpen={setSwipeId}
                  onOpenNumpad={setNumpadStat}
                  onOpenEdit={setEditStat}
                  onOpenHistory={setHistoryStat}
                  onOpenGoal={setGoalStat}
                  onChanged={summary.reload}
                  onError={setError}
                  isDragging={dragState?.fromId === ex.exerciseId}
                  isDropTarget={
                    dropIndicator.topId === ex.exerciseId ? "top" :
                    dropIndicator.bottomId === ex.exerciseId ? "bottom" :
                    false
                  }
                  translateY={getTranslateY(ex.exerciseId, dragState)}
                  onDragStart={(clientY, rowHeight) => handleDragStart(ex.exerciseId, clientY, rowHeight)}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Overlays — rendered here (outside the transformed rows) so position:fixed works */}
      {numpadStat && (
        <Numpad
          stat={numpadStat}
          onClose={() => setNumpadStat(null)}
          onChanged={summary.reload}
          onError={setError}
        />
      )}
      {editStat && (
        <EditModal
          stat={editStat}
          color={editStat.color ?? FITNESS_DEFAULT_COLOR}
          onClose={() => setEditStat(null)}
          onChanged={summary.reload}
          onError={setError}
        />
      )}
      {historyStat && (
        <HistoryModal
          stat={historyStat}
          color={historyStat.color ?? FITNESS_DEFAULT_COLOR}
          onClose={() => setHistoryStat(null)}
          onChanged={summary.reload}
        />
      )}
      {goalStat && (
        <GoalModal
          stat={goalStat}
          color={goalStat.color ?? FITNESS_DEFAULT_COLOR}
          onClose={() => setGoalStat(null)}
          onChanged={summary.reload}
          onError={setError}
        />
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
                  style={{ background: ex.color ?? FITNESS_DEFAULT_COLOR }}
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
  "early morning": "Early Morning",
  morning:         "Morning",
  "after morning": "After Morning",
  noon:            "Noon",
  afternoon:       "Afternoon",
  evening:         "Evening",
  night:           "Night",
  midnight:        "Midnight",
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

// ─── Goal modal ───────────────────────────────────────────────────────────────

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type GoalMode = GoalPeriod | "date";

const GOAL_TABS: { key: GoalMode; label: string }[] = [
  { key: "day",   label: "Day"     },
  { key: "week",  label: "Week"    },
  { key: "month", label: "Month"   },
  { key: "date",  label: "By date" },
];

function GoalModal({
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
  const initMode: GoalMode = stat.goalDeadline ? "date" : (stat.goalPeriod ?? "week");
  const [mode,     setMode]     = useState<GoalMode>(initMode);
  const [value,    setValue]    = useState(stat.goalAmount !== null ? String(stat.goalAmount) : "");
  const [deadline, setDeadline] = useState(stat.goalDeadline ?? tomorrowIso());
  const [busy,     setBusy]     = useState(false);

  const n = parseFloat(value);
  const canSave = !!value && Number.isFinite(n) && n > 0 && (mode !== "date" || !!deadline);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "Backspace") { setValue((v) => v.slice(0, -1)); return; }
      if (e.key === "Enter")     { void save(); return; }
      if (/^[0-9.]$/.test(e.key)) setValue((v) => appendDigit(v, e.key));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode, deadline]);

  function press(key: string) {
    if (key === "⌫") { setValue((v) => v.slice(0, -1)); return; }
    setValue((v) => appendDigit(v, key));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    onError(null);
    try {
      if (mode !== "date") {
        await api.patch(`/api/fitness/exercises/${stat.exerciseId}`, {
          goalAmount:    n,
          goalPeriod:    mode,
          goalDeadline:  null,
          goalStartDate: null,
        });
      } else {
        await api.patch(`/api/fitness/exercises/${stat.exerciseId}`, {
          goalAmount:    n,
          goalPeriod:    null,
          goalDeadline:  deadline,
          goalStartDate: todayIso(),
        });
      }
      await onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save goal.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    onError(null);
    try {
      await api.patch(`/api/fitness/exercises/${stat.exerciseId}`, {
        goalAmount: null, goalPeriod: null, goalDeadline: null, goalStartDate: null,
      });
      await onChanged();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove goal.");
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = (() => {
    if (busy) return "Saving…";
    if (!canSave) return "Set goal";
    if (mode === "date") {
      const d = new Date(deadline + "T12:00:00Z");
      const fmt = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${value} ${stat.unit} by ${fmt}`;
    }
    return `${value} ${stat.unit} / ${mode}`;
  })();

  const keys = ["7","8","9","4","5","6","1","2","3","0","⌫"];

  return (
    <div className="ft-numpad-overlay" onPointerDown={onClose}>
      <div
        className="ft-numpad-sheet ft-goal-sheet"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ft-numpad-header" style={{ "--row-color": color } as CSSProperties}>
          <span className="ft-numpad-name">{stat.name}</span>
          <span className="ft-goal-sheet-badge">goal</span>
          <button className="ft-numpad-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Big number display */}
        <div className="ft-numpad-display">
          <span className="ft-numpad-value">{value || "0"}</span>
          <span className="ft-numpad-unit">{stat.unit}</span>
        </div>

        {/* Period / mode tabs */}
        <div className="ft-goal-tabs">
          {GOAL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`ft-goal-tab${mode === t.key ? " ft-goal-tab--active" : ""}`}
              style={mode === t.key ? { "--tab-color": color } as CSSProperties : undefined}
              onPointerDown={(e) => { e.preventDefault(); setMode(t.key); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Date input — only for "date" mode */}
        {mode === "date" && (
          <div className="ft-goal-date-row">
            <span className="ft-goal-date-label">by</span>
            <input
              className="ft-goal-date-input"
              type="date"
              min={tomorrowIso()}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        )}

        {/* Numpad */}
        <div className="ft-numpad-grid">
          {keys.map((k) => (
            <button
              key={k}
              className={[
                "ft-numpad-key",
                k === "⌫" ? "ft-numpad-key--backspace" : "",
                k === "0"  ? "ft-numpad-key--zero"      : "",
              ].filter(Boolean).join(" ")}
              onPointerDown={(e) => { e.preventDefault(); press(k); }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Submit */}
        <button
          className="ft-numpad-submit"
          onClick={save}
          disabled={busy || !canSave}
        >
          {submitLabel}
        </button>

        {/* Remove (only if a goal exists) */}
        {stat.goalAmount !== null && (
          <button className="ft-goal-remove" onClick={remove} disabled={busy}>
            Remove goal
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Exercise row ─────────────────────────────────────────────────────────────

// ─── Numpad ───────────────────────────────────────────────────────────────────

function appendDigit(cur: string, key: string): string {
  if (key === "." && cur.includes(".")) return cur;
  if (cur === "0" && key !== ".") return key;
  return cur + key;
}

function Numpad({
  stat,
  onClose,
  onChanged,
  onError,
}: {
  stat: ExerciseStat;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [busy,  setBusy]  = useState(false);
  const color = stat.color ?? FITNESS_DEFAULT_COLOR;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "Backspace") { setValue((v) => v.slice(0, -1)); return; }
      if (e.key === "Enter")     { void handleSubmit(); return; }
      if (/^[0-9.]$/.test(e.key)) setValue((v) => appendDigit(v, e.key));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function press(key: string) {
    if (key === "⌫") { setValue((v) => v.slice(0, -1)); return; }
    setValue((v) => appendDigit(v, key));
  }

  async function handleSubmit() {
    const n = parseFloat(value);
    if (!value || !Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    onError(null);
    try {
      await api.post("/api/fitness/efforts", {
        exerciseId: stat.exerciseId,
        date:       todayIso(),
        amount:     n,
        slot:       currentSlot(),
      });
      onClose();
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not log effort.");
    } finally {
      setBusy(false);
    }
  }

  const keys = ["7","8","9","4","5","6","1","2","3","0","⌫"];
  const n = parseFloat(value);
  const canSubmit = !!value && Number.isFinite(n) && n > 0;

  return (
    <div className="ft-numpad-overlay" onPointerDown={onClose}>
      <div
        className="ft-numpad-sheet"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="ft-numpad-header" style={{ "--row-color": color } as CSSProperties}>
          <span className="ft-numpad-name">{stat.name}</span>
          <button className="ft-numpad-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ft-numpad-display">
          <span className="ft-numpad-value">{value || "0"}</span>
          <span className="ft-numpad-unit">{stat.unit}</span>
        </div>

        <div className="ft-numpad-grid">
          {keys.map((k) => (
            <button
              key={k}
              className={[
                "ft-numpad-key",
                k === "⌫" ? "ft-numpad-key--backspace" : "",
                k === "0"  ? "ft-numpad-key--zero"      : "",
              ].filter(Boolean).join(" ")}
              onPointerDown={(e) => { e.preventDefault(); press(k); }}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          className="ft-numpad-submit"
          onClick={handleSubmit}
          disabled={busy || !canSubmit}
        >
          {busy ? "Logging…" : canSubmit ? `Log ${value} ${stat.unit}` : `Log ${stat.unit}`}
        </button>
      </div>
    </div>
  );
}

// ─── OverallGoalBar ───────────────────────────────────────────────────────────

function OverallGoalBar({ exercises }: { exercises: ExerciseStat[] }) {
  const now = new Date();

  type GoalPoint = { fill: number; pace: number };
  const points: GoalPoint[] = [];

  for (const ex of exercises) {
    if (!ex.goalAmount) continue;
    const goal = ex.goalAmount;
    let total: number;
    let pace: number;

    if (ex.goalDeadline) {
      total = ex.deadlineTotal;
      const start   = new Date((ex.goalStartDate ?? todayIso()) + "T12:00:00Z");
      const end     = new Date(ex.goalDeadline + "T12:00:00Z");
      const totalMs = Math.max(end.getTime() - start.getTime(), 1);
      pace  = Math.min(Math.max((now.getTime() - start.getTime()) / totalMs, 0), 1);
    } else if (ex.goalPeriod) {
      total = ex.goalPeriod === "day" ? ex.todayTotal : ex.goalPeriod === "week" ? ex.weekTotal : ex.monthTotal;
      if (ex.goalPeriod === "day") {
        pace = (now.getHours() + now.getMinutes() / 60) / 24;
      } else if (ex.goalPeriod === "week") {
        pace = (now.getDay() * 24 + now.getHours() + now.getMinutes() / 60) / 168;
      } else {
        const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        pace = ((now.getDate() - 1) + (now.getHours() + now.getMinutes() / 60) / 24) / dim;
      }
    } else {
      continue;
    }

    points.push({ fill: Math.min(total / goal, 1), pace: Math.min(pace, 1) });
  }

  if (points.length === 0) return null;

  const avgFill    = points.reduce((s, p) => s + p.fill, 0) / points.length;
  const avgPace    = points.reduce((s, p) => s + p.pace, 0) / points.length;
  const onPaceCount = points.filter(p => p.fill >= p.pace).length;
  const complete   = avgFill >= 1;
  const fillPct    = avgFill * 100;
  const pacePct    = Math.min(avgPace * 100, 100);

  const pctLabel = complete ? "100%" : `${Math.round(avgFill * 100)}%`;

  return (
    <div className="ft-overall-bar">
      <div className="ft-overall-bar-header">
        <span className="ft-overall-bar-label">Overall goals</span>
        <span className="ft-overall-bar-tally">
          <span className="ft-overall-bar-pct">{pctLabel}</span>
          <span className="ft-overall-bar-sep"> · </span>
          {onPaceCount} / {points.length} on pace
        </span>
      </div>
      {!complete && <div className="ft-overall-bar-pace" style={{ left: `${pacePct}%` }} />}
      <div className="ft-overall-bar-rail">
        <div className={`ft-overall-bar-track${complete ? " ft-overall-bar-track--complete" : ""}`}>
          <div className="ft-overall-bar-fill" style={{ width: `${fillPct}%` }} />
        </div>
        {!complete && <div className="ft-overall-bar-you"  style={{ left: `${fillPct}%` }} />}
      </div>
    </div>
  );
}

// ─── GoalBar ──────────────────────────────────────────────────────────────────

function GoalBar({ stat }: { stat: ExerciseStat }) {
  if (!stat.goalAmount) return null;

  const goal           = stat.goalAmount;
  const isDeadlineMode = !!stat.goalDeadline;

  let total: number;
  let pace: number;
  let expired = false;

  if (isDeadlineMode) {
    total = stat.deadlineTotal;
    const now   = new Date();
    const start = new Date((stat.goalStartDate ?? todayIso()) + "T12:00:00Z");
    const end   = new Date(stat.goalDeadline!  + "T12:00:00Z");
    const totalMs   = Math.max(end.getTime() - start.getTime(), 1);
    const elapsedMs = now.getTime() - start.getTime();
    pace    = Math.min(Math.max(elapsedMs / totalMs, 0), 1);
    expired = now > end;
  } else if (stat.goalPeriod) {
    const period = stat.goalPeriod;
    total = period === "day" ? stat.todayTotal : period === "week" ? stat.weekTotal : stat.monthTotal;
    const now = new Date();
    if (period === "day") {
      pace = (now.getHours() + now.getMinutes() / 60) / 24;
    } else if (period === "week") {
      pace = (now.getDay() * 24 + now.getHours() + now.getMinutes() / 60) / 168;
    } else {
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      pace = ((now.getDate() - 1) + (now.getHours() + now.getMinutes() / 60) / 24) / dim;
    }
  } else {
    return null;
  }

  const fillPct  = Math.min(total / goal, 1) * 100;
  const pacePct  = Math.min(pace * 100, 100);
  const complete = total >= goal;

  // Tooltip text
  let title: string;
  if (isDeadlineMode) {
    const deadlineDate = new Date(stat.goalDeadline! + "T12:00:00Z");
    const daysLeft     = Math.ceil((deadlineDate.getTime() - Date.now()) / 86_400_000);
    if (complete)      title = `Goal complete! ${total.toLocaleString()} / ${goal.toLocaleString()} ${stat.unit}`;
    else if (expired)  title = `Deadline passed · ${total.toLocaleString()} / ${goal.toLocaleString()} ${stat.unit}`;
    else               title = `${total.toLocaleString()} / ${goal.toLocaleString()} ${stat.unit} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  } else {
    const lbl = stat.goalPeriod === "day" ? "today" : stat.goalPeriod === "week" ? "this week" : "this month";
    title = complete
      ? `Goal complete! ${total.toLocaleString()} / ${goal.toLocaleString()} ${stat.unit} ${lbl}`
      : `${total.toLocaleString()} / ${goal.toLocaleString()} ${stat.unit} ${lbl} · ${Math.round(pacePct)}% of period elapsed`;
  }

  return (
    <div
      className={[
        "ft-goal-bar",
        complete          ? "ft-goal-bar--complete" : "",
        expired && !complete ? "ft-goal-bar--expired"  : "",
      ].filter(Boolean).join(" ")}
      title={title}
      aria-label={title}
    >
      <div className="ft-goal-bar-track">
        <div className="ft-goal-bar-fill" style={{ width: `${fillPct}%` }} />
        {!complete && !expired && <div className="ft-goal-bar-pace" style={{ left: `${pacePct}%` }} />}
      </div>
    </div>
  );
}

// ─── Goal pace helper ─────────────────────────────────────────────────────────

function getPeriodTarget(stat: ExerciseStat, period: "D" | "W" | "M"): number | null {
  if (!stat.goalAmount || !stat.goalPeriod || stat.goalDeadline) return null;
  const amount = stat.goalAmount;
  const gp = stat.goalPeriod;

  if (period === "D") {
    if (gp === "day")   return amount;
    if (gp === "week")  return Math.ceil(amount / 7);
    if (gp === "month") {
      const t = new Date(todayIso() + "T12:00:00");
      const days = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
      return Math.ceil(amount / days);
    }
  }
  if (period === "W" && gp === "week")  return amount;
  if (period === "M" && gp === "month") return amount;
  return null;
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({
  stat,
  isSwipeOpen,
  onSwipeOpen,
  onOpenNumpad,
  onOpenEdit,
  onOpenHistory,
  onOpenGoal,
  onChanged,
  onError,
  isDragging,
  isDropTarget,
  translateY,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  stat: ExerciseStat;
  isSwipeOpen: boolean;
  onSwipeOpen: (id: number | null) => void;
  onOpenNumpad:   (stat: ExerciseStat) => void;
  onOpenEdit:     (stat: ExerciseStat) => void;
  onOpenHistory:  (stat: ExerciseStat) => void;
  onOpenGoal:     (stat: ExerciseStat) => void;
  onChanged: () => Promise<unknown>;
  onError: (m: string | null) => void;
  isDragging: boolean;
  isDropTarget: "top" | "bottom" | false;
  translateY: number;
  onDragStart: (clientY: number, rowHeight: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const [period, setPeriod] = useState<"D" | "W" | "M">("D");
  const [swipeDir,    setSwipeDir]    = useState<"left" | "right" | null>(null);
  const [liveOffset,  setLiveOffset]  = useState<number | null>(null); // non-null while finger is down

  const touchStartX   = useRef(0);
  const touchStartY   = useRef(0);
  const touchCurX     = useRef(0);
  const isHoriz       = useRef(false);
  const cardRef       = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragActive     = useRef(false);

  // Non-passive touchmove listener — React's onTouchMove is passive so
  // e.preventDefault() inside it is silently ignored by the browser.
  // Attaching directly lets us block scroll once a horizontal swipe is confirmed
  // or a long-press drag is active.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    function onMove(e: TouchEvent) {
      if (isHoriz.current || dragActive.current) e.preventDefault();
    }
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  const color = stat.color ?? FITNESS_DEFAULT_COLOR;

  // When another card takes the swipe slot, close this card's swipe
  useEffect(() => {
    if (!isSwipeOpen) setSwipeDir(null);
  }, [isSwipeOpen]);

  const LEFT_SNAP  = -140; // card shifts left → reveals edit + delete on right
  const RIGHT_SNAP =  185; // card shifts right → reveals history + goal on left
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

    // Long-press activates drag-to-reorder after 500 ms
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      dragActive.current = true;
      navigator.vibrate?.(40);
      const rowEl = cardRef.current?.closest("[data-exercise-id]") as HTMLElement | null;
      const rowHeight = rowEl?.getBoundingClientRect().height ?? 64;
      onDragStart(touchStartY.current, rowHeight);
    }, 500);
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchCurX.current = e.touches[0].clientX;
    const rawDx = e.touches[0].clientX - touchStartX.current;
    const dx    = Math.abs(rawDx);
    const dy    = Math.abs(e.touches[0].clientY - touchStartY.current);

    // Cancel long-press if finger moved significantly before the timer fired
    if ((dx > 8 || dy > 8) && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // If drag is active, route all movement to the drag handler
    if (dragActive.current) {
      onDragMove(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }

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
    // Clear long-press timer if it hasn't fired yet
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // End drag if it was active
    if (dragActive.current) {
      dragActive.current = false;
      onDragEnd();
      return;
    }

    // Zeroing liveOffset re-enables the CSS transition → snaps to new swipeDir
    setLiveOffset(null);
    const dx = touchCurX.current - touchStartX.current;

    if (!isHoriz.current) {
      // ── Tap — only closes an open swipe; + button handles numpad ────
      if (swipeDir !== null) {
        setSwipeDir(null);
        onSwipeOpen(null);
      }
      return;
    }

    // ── Swipe ─────────────────────────────────────────────────────────
    if (swipeDir === null) {
      if (dx < -THRESHOLD) {
        setSwipeDir("left");
        onSwipeOpen(stat.exerciseId);
      } else if (dx > THRESHOLD) {
        setSwipeDir("right");
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

  return (
    <div
      className={[
        "ft-row",
        isDragging    ? "ft-row--dragging"   : "",
        isDropTarget === "top"    ? "ft-row--drag-over"     : "",
        isDropTarget === "bottom" ? "ft-row--drag-over-end" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--row-color": color, transform: translateY !== 0 ? `translateY(${translateY}px)` : undefined } as CSSProperties}
      data-exercise-id={stat.exerciseId}
    >

      {/* Swipe track */}
      <div className="ft-swipe-track">

        {/* Action buttons revealed by LEFT swipe (sit on right side) */}
        <div className="ft-swipe-actions-right">
          <button
            className="ft-swipe-btn ft-swipe-btn--edit"
            onClick={() => { setSwipeDir(null); onSwipeOpen(null); onOpenEdit(stat); }}
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

        {/* Action buttons revealed by RIGHT swipe (sit on left side) */}
        <div className="ft-swipe-actions-left">
          <button
            className="ft-swipe-btn ft-swipe-btn--history"
            onClick={() => { setSwipeDir(null); onSwipeOpen(null); onOpenHistory(stat); }}
          >
            History
          </button>
          <button
            className="ft-swipe-btn ft-swipe-btn--goal"
            onClick={() => { setSwipeDir(null); onSwipeOpen(null); onOpenGoal(stat); }}
          >
            Goal
          </button>
        </div>

        {/* Card face — translates over the action buttons */}
        <div
          ref={cardRef}
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
            onClick={() => {
              // Desktop / pointer fallback: single click opens numpad
              if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                if (swipeDir !== null) { setSwipeDir(null); onSwipeOpen(null); }
                onOpenNumpad(stat);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onOpenNumpad(stat);
            }}
          >
            {/* + zone — tap to log reps; hold the card body to drag-to-reorder */}
            <div
              className="ft-add-btn"
              role="button"
              aria-label="Log reps"
              tabIndex={0}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onOpenNumpad(stat); }}
              onClick={(e) => { e.stopPropagation(); onOpenNumpad(stat); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpenNumpad(stat); }}
            >
              +
            </div>

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
                  onClick={(e) => { e.stopPropagation(); onOpenHistory(stat); }}
                >↗</button>
                <button
                  type="button"
                  className="ft-desktop-action-btn"
                  title="Edit"
                  onClick={(e) => { e.stopPropagation(); onOpenEdit(stat); }}
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
                <div className="ft-row-stat-num">
                  <span className={`ft-row-stat-val${
                    period === "D" && stat.todayTotal > 0 ? " ft-row-stat-val--active" : ""
                  }`}>
                    {(period === "D" ? stat.todayTotal : period === "W" ? stat.weekTotal : stat.monthTotal) > 0
                      ? (period === "D" ? stat.todayTotal : period === "W" ? stat.weekTotal : stat.monthTotal).toLocaleString()
                      : "—"}
                  </span>
                  {getPeriodTarget(stat, period) !== null && (
                    <span className="ft-row-stat-target">
                      / {getPeriodTarget(stat, period)!.toLocaleString()}
                    </span>
                  )}
                </div>
                <span className="ft-row-stat-unit">{stat.unit}</span>
              </button>
            </div>
          </div>

          <GoalBar stat={stat} />

        </div>
      </div>
    </div>
  );
}
