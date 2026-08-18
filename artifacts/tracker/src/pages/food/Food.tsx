import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../../lib/api";
import { LinkedContentArea, JournalLink, LinkViewModal } from "../journal/LinkedContent";
import { formatFoodDate } from "./foodDate.js";

type FoodItem = {
  id: number;
  name: string;
  storageLocation: "fridge" | "table" | "pantry";
  status: "on_hand" | "finished" | "tossed" | "avoid";
  preparedOn?: string;
  store?: string;
  createdAt: string;
  updatedAt: string;
};

type FoodActivity = {
  id: number;
  foodItemId: number;
  action: "prepared" | "used" | "cooked" | "note" | "moved" | "status";
  occurredOn: string;
  content: string;
  createdAt: string;
};

const locationNames: Record<string, string> = {
  fridge: "Fridge",
  table: "Table",
  pantry: "Pantry",
};

const statusNames: Record<string, string> = {
  on_hand: "On hand",
  finished: "Finished",
  tossed: "Tossed",
  avoid: "Avoid",
};

function formatDate(iso: string) {
  return formatFoodDate(iso);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatMonthDay(dateOnlyStr: string): string {
  const [, m, d] = dateOnlyStr.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function daysOld(dateOnlyStr: string): string {
  const [y, m, d] = dateOnlyStr.split("-").map(Number);
  const prepared = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - prepared.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day old";
  return `${days} days old`;
}

const IcBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);

export default function Food() {
  const navigate = useNavigate();
  const { data: items, reload, loading } = useApi<FoodItem[]>("/api/food/items");
  const [view, setView] = useState<"active" | "history">("active");
  const [showAdd, setShowAdd] = useState(false);
  const [openItemId, setOpenItemId] = useState<number | null>(null);

  const activeStock = useMemo(() => {
    if (!items) return [];
    return items.filter((i) => i.status === "on_hand");
  }, [items]);

  const historyStock = useMemo(() => {
    if (!items) return [];
    return items
      .filter((i) => i.status !== "on_hand")
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items]);

  const groupedActive = useMemo(() => {
    const groups: Record<string, FoodItem[]> = { fridge: [], table: [], pantry: [] };
    for (const item of activeStock) {
      if (groups[item.storageLocation]) groups[item.storageLocation].push(item);
    }
    return groups;
  }, [activeStock]);

  return (
    <div className="food-view">
      <div className="food-header">
        <button className="jsearch-back" onClick={() => navigate("/journal")} aria-label="Back to journal">
          <IcBack />
        </button>
        <div className="food-view-toggle">
          <button className={view === "active" ? "active" : ""} onClick={() => setView("active")}>
            Active Stock
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            History
          </button>
        </div>
        <button className="food-add-btn" onClick={() => setShowAdd(true)}>
          + Add Provision
        </button>
      </div>

      <div className="food-content">
        {loading && !items && <div className="food-loading">Loading inventory...</div>}

        {view === "active" && !loading && activeStock.length === 0 && (
          <div className="food-empty">
            <div className="food-empty-title">Nothing here</div>
            <div className="food-empty-subtitle">Add provisions to start tracking what you have.</div>
          </div>
        )}

        {view === "history" && !loading && historyStock.length === 0 && (
          <div className="food-empty">
            <div className="food-empty-title">No history yet</div>
            <div className="food-empty-subtitle">Items you finish or toss will appear here.</div>
          </div>
        )}

        {view === "active" &&
          (Object.entries(groupedActive) as [FoodItem["storageLocation"], FoodItem[]][]).map(([loc, list]) => {
            if (list.length === 0) return null;
            return (
              <div key={loc} className="food-location-group">
                <div className="food-location-label">{locationNames[loc]}</div>
                <div className="food-rows">
                  {list.map((item) => (
                    <div key={item.id} className="food-row" onClick={() => setOpenItemId(item.id)}>
                      <span className="food-row-name">{item.name}</span>
                      <span className="food-row-age">{item.preparedOn ? daysOld(item.preparedOn) : formatRelative(item.updatedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

        {view === "history" && historyStock.length > 0 && (
          <div className="food-history-list">
            {historyStock.map((item) => (
              <div key={item.id} className="food-history-item" onClick={() => setOpenItemId(item.id)}>
                <div>
                  <div className="food-history-name">{item.name}</div>
                  <div className="food-history-meta">
                    {locationNames[item.storageLocation]}{item.preparedOn ? ` • since ${formatMonthDay(item.preparedOn)}` : ""}
                  </div>
                </div>
                <div className="food-history-status" data-status={item.status}>
                  {statusNames[item.status]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddFoodModal
          onClose={() => setShowAdd(false)}
          onAdd={async (data) => {
            await api.post("/api/food/items", data);
            reload();
          }}
        />
      )}

      {openItemId && (
        <ItemDetailModal
          itemId={openItemId}
          onClose={() => setOpenItemId(null)}
          onUpdateItem={reload}
        />
      )}
    </div>
  );
}

function AddFoodModal({ onClose, onAdd }: { onClose: () => void; onAdd: (d: any) => Promise<void> }) {
  const [name, setName] = useState("");
  const [storageLocation, setStorageLocation] = useState("fridge");
  // locations: fridge, table only
  const [preparedOn, setPreparedOn] = useState(() => new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(),
        storageLocation,
        preparedOn: preparedOn || undefined,
        note: note.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="food-modal-backdrop" onClick={onClose}>
      <form className="food-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="food-modal-header">
          <h2 className="food-modal-title">New Provision</h2>
          <button type="button" className="food-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="food-modal-body">
          <label className="food-field">
            <span>Item Name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="food-field">
            <span>Location</span>
            <div className="food-loc-toggle">
              {(["fridge", "table", "pantry"] as const).map((loc) => (
                <button key={loc} type="button"
                  className={storageLocation === loc ? "active" : ""}
                  onClick={() => setStorageLocation(loc)}>
                  {locationNames[loc]}
                </button>
              ))}
            </div>
          </div>
          <label className="food-field">
            <span>Date</span>
            <input type="date" value={preparedOn} onChange={(e) => setPreparedOn(e.target.value)} />
          </label>
          <label className="food-field">
            <span>Note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any details..." rows={2} />
          </label>
        </div>
        <div className="food-modal-footer food-modal-footer--right">
          <button type="button" className="food-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="food-btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Adding..." : "Add Provision"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ItemDetailModal({ itemId, onClose, onUpdateItem }: { itemId: number; onClose: () => void; onUpdateItem: () => void }) {
  const { data, reload } = useApi<{ item: FoodItem; activities: FoodActivity[] }>(`/api/food/items/${itemId}/activities`);
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);

  if (!data) {
    return (
      <div className="food-modal-backdrop" onClick={onClose}>
        <div className="food-modal" onClick={(e) => e.stopPropagation()}>
          <div className="food-loading" style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>
        </div>
      </div>
    );
  }

  const { item, activities } = data;
  const preparedAct = activities.find((a) => a.action === "prepared");
  const logActivities = activities.filter((a) => a.action !== "prepared");

  async function handleDeleteActivity(actId: number) {
    await api.del(`/api/food/activities/${actId}`);
    reload();
  }

  async function handleDeleteItem() {
    await api.del(`/api/food/items/${itemId}`);
    onUpdateItem();
    onClose();
  }

  async function handleSaveEdit(fields: { name: string; storageLocation: string; preparedOn: string; note: string }) {
    await api.patch(`/api/food/items/${itemId}`, {
      name: fields.name,
      storageLocation: fields.storageLocation,
      preparedOn: fields.preparedOn || undefined,
    });
    if (preparedAct) {
      await api.patch(`/api/food/activities/${preparedAct.id}`, {
        content: fields.note,
        occurredOn: fields.preparedOn || preparedAct.occurredOn,
      });
    }
    reload();
    onUpdateItem();
    setEditing(false);
  }

  return (
    <div className="food-modal-backdrop" onClick={onClose}>
      <div className="food-modal food-modal--sheet" onClick={(e) => e.stopPropagation()}>

        <div className="food-modal-header food-modal-header--compact">
          <div>
            <h2 className="food-modal-title food-modal-title--sm">{item.name}</h2>
            <span className="food-modal-loc">{locationNames[item.storageLocation]}</span>
          </div>
          <button className="food-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="food-modal-body food-modal-body--tight">
          {editing ? (
            <EditItemForm
              item={item}
              note={preparedAct?.content || ""}
              onSave={handleSaveEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <div className="food-detail-meta">
                <div className="food-detail-row">
                  <span className="food-detail-date">{item.preparedOn ? formatMonthDay(item.preparedOn) : "—"}</span>
                  <span className="food-detail-note">{preparedAct?.content || ""}</span>
                  <button className="food-detail-edit" onClick={() => setEditing(true)}>Edit</button>
                </div>
              </div>

              {logActivities.length > 0 && (
                <div className="food-log-list">
                  {logActivities.map((act) => (
                    <FoodActivityNode key={act.id} activity={act} onDelete={() => handleDeleteActivity(act.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="food-modal-footer food-modal-footer--slim">
            <button className="food-link-btn" onClick={() => setShowLog(true)}>+ log</button>
            <button className="food-link-btn food-link-btn--danger" onClick={handleDeleteItem}>delete</button>
          </div>
        )}

        {showLog && (
          <LogActivitySheet
            itemId={itemId}
            onClose={() => setShowLog(false)}
            onSaved={() => { setShowLog(false); reload(); }}
          />
        )}
      </div>
    </div>
  );
}

function EditItemForm({
  item, note, onSave, onCancel,
}: {
  item: FoodItem;
  note: string;
  onSave: (fields: { name: string; storageLocation: string; preparedOn: string; note: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [storageLocation, setStorageLocation] = useState(item.storageLocation);
  const [preparedOn, setPreparedOn] = useState(item.preparedOn || "");
  const [editNote, setEditNote] = useState(note);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave({ name: name.trim(), storageLocation, preparedOn, note: editNote.trim() }); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="food-edit-form">
      <label className="food-field">
        <span>Name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="food-field-row">
        <label className="food-field">
          <span>Location</span>
          <select value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)}>
            <option value="fridge">Fridge</option>
            <option value="table">Table</option>
            <option value="pantry">Pantry</option>
          </select>
        </label>
        <label className="food-field">
          <span>Date</span>
          <input type="date" value={preparedOn} onChange={(e) => setPreparedOn(e.target.value)} />
        </label>
      </div>
      <label className="food-field">
        <span>Note</span>
        <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={3} />
      </label>
      <div className="food-modal-footer food-modal-footer--right">
        <button type="button" className="food-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="food-btn-primary" disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function FoodActivityNode({ activity, onDelete }: { activity: FoodActivity; onDelete: () => void }) {
  const url = activity.content ? `/api/journal/links?sourceType=food_activity&sourceId=${activity.id}` : null;
  const { data: links, reload } = useApi<JournalLink[]>(url);
  const [viewLink, setViewLink] = useState<JournalLink | null>(null);

  async function handleCreateLink(anchorText: string, content: string, occurrence: number) {
    await api.post("/api/journal/links", { sourceType: "food_activity", sourceId: activity.id, anchorText, content, occurrence });
    reload();
  }

  const actionLabels: Record<string, string> = {
    used: "Used", cooked: "Cooked", note: "Note", moved: "Moved", status: "Status",
  };

  return (
    <>
      <div className="food-log-entry">
        <div className="food-log-entry-header">
          {activity.action !== "note" && (
            <span className="food-log-entry-action">{actionLabels[activity.action] || activity.action}</span>
          )}
          <span className="food-log-entry-date">{formatMonthDay(activity.occurredOn)}</span>
          <button className="food-timeline-del" onClick={onDelete} aria-label="Delete">✕</button>
        </div>
        {activity.content && (
          <div className="food-timeline-text">
            <LinkedContentArea text={activity.content} links={links || []} onCreateLink={handleCreateLink} onLinkClick={setViewLink} />
          </div>
        )}
      </div>
      {viewLink && (
        <LinkViewModal link={viewLink} onClose={() => setViewLink(null)}
          onUpdate={() => { reload(); setViewLink(null); }}
          onDelete={() => { reload(); setViewLink(null); }} />
      )}
    </>
  );
}

function LogActivitySheet({ itemId, onClose, onSaved }: { itemId: number; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState("note");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/api/food/items/${itemId}/activities`, {
        action,
        occurredOn: new Date().toISOString().slice(0, 10),
        content: content.trim(),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="food-sheet-overlay" onClick={onClose}>
      <form className="food-sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="food-sheet-title">Log</h3>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What happened?"
          rows={1}
          className="food-sheet-textarea food-sheet-textarea--small"
        />
        <div className="food-modal-footer food-modal-footer--right">
          <button type="button" className="food-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="food-btn-primary" disabled={saving || !content.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MoveSheet({ item, onClose, onSaved }: { item: FoodItem; onClose: () => void; onSaved: () => void }) {
  const [loc, setLoc] = useState(item.storageLocation);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/food/items/${item.id}`, { storageLocation: loc });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="food-sheet-overlay" onClick={onClose}>
      <form className="food-sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="food-sheet-title">Move Provision</h3>
        <select value={loc} onChange={(e) => setLoc(e.target.value as any)} className="food-sheet-textarea" style={{ height: "48px" }}>
          <option value="fridge">Fridge</option>
          <option value="table">Table</option>
          <option value="pantry">Pantry</option>
        </select>
        <div className="food-modal-footer food-modal-footer--right">
          <button type="button" className="food-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="food-btn-primary" disabled={saving || loc === item.storageLocation}>
            {saving ? "Moving..." : "Move"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusSheet({ item, onClose, onSaved }: { item: FoodItem; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/food/items/${item.id}`, { status });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="food-sheet-overlay" onClick={onClose}>
      <form className="food-sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 className="food-sheet-title">Update Status</h3>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="food-sheet-textarea" style={{ height: "48px" }}>
          <option value="on_hand">On hand</option>
          <option value="finished">Finished</option>
          <option value="tossed">Tossed</option>
          <option value="avoid">Avoid</option>
        </select>
        <div className="food-modal-footer food-modal-footer--right">
          <button type="button" className="food-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="food-btn-primary" disabled={saving || status === item.status}>
            {saving ? "Updating..." : "Update"}
          </button>
        </div>
      </form>
    </div>
  );
}
