/**
 * Journal linked-text feature:
 *   - JournalLink type (includes occurrence for repeated-anchor disambiguation)
 *   - useTextSelection hook (returns charOffset for occurrence detection)
 *   - renderLinked() — renders plain text with occurrence-aware anchor highlights
 *   - LinkedContentArea — selection UX + link creation form
 *   - LinkViewModal — view / edit / delete a single link
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

/* ── type ──────────────────────────────────────────────────────────── */
export type JournalLink = {
  id: number;
  anchorText: string;
  content: string;
  sourceType: "entry" | "period_note";
  sourceId: number;
  occurrence: number;   // 0 = first match, 1 = second, etc.
  createdAt: string;
};

/* ── char-offset helper ────────────────────────────────────────────── */
/**
 * Walk the text nodes inside `container` in document order and return the
 * cumulative character offset at which `targetNode` (a Text node) at
 * `targetOffset` falls.  This works even when the DOM contains <mark>
 * elements (existing links), because those contribute their text content
 * to the total just like any other text.
 */
function getCharOffset(container: HTMLElement, targetNode: Node, targetOffset: number): number {
  if (targetNode.nodeType !== Node.TEXT_NODE) return targetOffset; // fallback: element node
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === targetNode) return total + targetOffset;
    total += (n.textContent ?? "").length;
  }
  return total + targetOffset; // unreachable in normal flow
}

/**
 * Given the full source text and a charOffset pointing into it, find which
 * occurrence (0-indexed) of `anchorText` the offset falls within.
 * Returns 0 if no match is found (graceful fallback).
 */
function findOccurrence(text: string, anchorText: string, charOffset: number): number {
  let pos = 0;
  let occ = 0;
  while (pos <= text.length) {
    const idx = text.indexOf(anchorText, pos);
    if (idx < 0) break;
    if (idx <= charOffset && charOffset < idx + anchorText.length) return occ;
    occ++;
    pos = idx + 1;
  }
  return 0;
}

/* ── hook: detect text selection inside a container ──────────────── */
export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [sel, setSel] = useState<{
    text: string;
    rect: DOMRect;
    charOffset: number;   // start char index in the full source text
  } | null>(null);

  useEffect(() => {
    function onUp() {
      const s = window.getSelection();
      if (!s || s.isCollapsed || !containerRef.current) { setSel(null); return; }
      const text = s.toString().trim();
      if (text.replace(/\s+/g, "").length < 2) { setSel(null); return; }
      const range = s.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) { setSel(null); return; }
      const charOffset = getCharOffset(containerRef.current, range.startContainer, range.startOffset);
      setSel({ text, rect: range.getBoundingClientRect(), charOffset });
    }
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => setSel(null), []);
  return { selection: sel, clear };
}

/* ── renderer: text → nodes with occurrence-aware anchor highlights ── */
export function renderLinked(
  text: string,
  links: JournalLink[],
  onLinkClick: (link: JournalLink) => void,
): React.ReactNode {
  if (!text) return text;
  if (!links.length) return text;

  type Seg = { link: JournalLink; start: number; end: number };
  const segs: Seg[] = [];

  for (const link of links) {
    const anchor = link.anchorText;
    const targetOcc = link.occurrence ?? 0;
    let pos = 0;
    let occ = 0;
    while (pos <= text.length) {
      const idx = text.indexOf(anchor, pos);
      if (idx < 0) break;
      if (occ === targetOcc) {
        segs.push({ link, start: idx, end: idx + anchor.length });
        break;
      }
      occ++;
      pos = idx + 1;
    }
    // If occurrence index is out of range, link is silently skipped (anchor edited away)
  }

  // Sort by position, then drop overlapping segments (keep whichever appears first)
  segs.sort((a, b) => a.start - b.start);
  const nonOverlapping: Seg[] = [];
  let lastEnd = 0;
  for (const s of segs) {
    if (s.start >= lastEnd) {
      nonOverlapping.push(s);
      lastEnd = s.end;
    }
  }

  const nodes: React.ReactNode[] = [];
  let cur = 0;
  for (const { link, start, end } of nonOverlapping) {
    if (start > cur) nodes.push(text.slice(cur, start));
    nodes.push(
      <mark
        key={link.id}
        className="jlink-anchor"
        onClick={e => { e.stopPropagation(); onLinkClick(link); }}
        title="Tap to view note"
      >
        {link.anchorText}
      </mark>
    );
    cur = end;
  }
  if (cur < text.length) nodes.push(text.slice(cur));
  return nodes;
}

/* ── LinkedContentArea ─────────────────────────────────────────────── */
type LinkedContentAreaProps = {
  text: string;
  links: JournalLink[];
  /** Called with the anchor text, link content, and occurrence index. */
  onCreateLink: (anchorText: string, content: string, occurrence: number) => Promise<void>;
  onLinkClick: (link: JournalLink) => void;
  className?: string;
  onDoubleClick?: () => void;
};

export function LinkedContentArea({
  text, links, onCreateLink, onLinkClick, className, onDoubleClick,
}: LinkedContentAreaProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const { selection, clear } = useTextSelection(containerRef as React.RefObject<HTMLElement | null>);
  const [creating, setCreating] = useState(false);
  const [linkContent, setLinkContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Captured at button-tap time so the form can persist after the browser
  // clears the selection (which happens on mobile when you tap the button).
  const [captured, setCaptured] = useState<{
    anchorText: string;
    occurrence: number;
    rect: DOMRect;
  } | null>(null);

  // Close create form on Escape
  useEffect(() => {
    if (!creating) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cancel(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [creating]); // eslint-disable-line react-hooks/exhaustive-deps

  function cancel() {
    setCreating(false);
    setLinkContent("");
    setCaptured(null);
    clear();
  }

  /** Called when the user taps/clicks the "Link" button. */
  function startCreating() {
    if (!selection) return;
    const occurrence = findOccurrence(text, selection.text, selection.charOffset);
    setCaptured({ anchorText: selection.text, occurrence, rect: selection.rect });
    setCreating(true);
  }

  async function handleCreate() {
    if (!captured || !linkContent.trim() || saving) return;
    setSaving(true);
    try {
      await onCreateLink(captured.anchorText, linkContent.trim(), captured.occurrence);
      setLinkContent("");
      setCreating(false);
      setCaptured(null);
      clear();
    } finally { setSaving(false); }
  }

  // Use captured rect (persists after selection clears) for positioning.
  const posRect = captured?.rect ?? selection?.rect;
  const floatStyle: React.CSSProperties | undefined = posRect
    ? {
        position: "fixed",
        top:  Math.min(posRect.bottom + 6, window.innerHeight - 180),
        left: Math.max(8, Math.min(posRect.left, window.innerWidth - 260)),
        zIndex: 900,
      }
    : undefined;

  return (
    <>
      <span
        ref={containerRef}
        className={`jlink-content-area${className ? ` ${className}` : ""}`}
        onDoubleClick={onDoubleClick}
      >
        {renderLinked(text, links, onLinkClick)}
      </span>

      {selection && !creating && (
        <button
          className="jlink-float-btn"
          style={floatStyle}
          // Desktop: preventDefault stops mousedown from collapsing the selection.
          onMouseDown={e => { e.preventDefault(); startCreating(); }}
          // Mobile: preventDefault on touchstart keeps the selection alive while
          // the finger is on the button; touchend fires startCreating().
          onTouchStart={e => { e.preventDefault(); }}
          onTouchEnd={e => { e.preventDefault(); startCreating(); }}
        >
          🔗 Link
        </button>
      )}

      {/* Form is keyed on captured.anchorText, not on selection, so it stays
          visible after the browser clears the selection on mobile. */}
      {creating && captured && (
        <div className="jlink-form" style={floatStyle}>
          <p className="jlink-form-anchor">"{captured.anchorText}"</p>
          <textarea
            className="jlink-form-input"
            placeholder="What should this link say?"
            value={linkContent}
            onChange={e => setLinkContent(e.target.value)}
            autoFocus
            rows={3}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleCreate();
            }}
          />
          <div className="jlink-form-actions">
            <button className="jlink-form-cancel" onClick={cancel}>
              Cancel
            </button>
            <button
              className="jlink-form-save"
              onClick={() => void handleCreate()}
              disabled={!linkContent.trim() || saving}
            >
              {saving ? "Saving…" : "Save link"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── LinkViewModal ─────────────────────────────────────────────────── */
type LinkViewModalProps = {
  link: JournalLink;
  onClose: () => void;
  onUpdate: (link: JournalLink) => void;
  onDelete: (id: number) => void;
  zIndex?: number;
};

export function LinkViewModal({ link, onClose, onUpdate, onDelete, zIndex = 850 }: LinkViewModalProps) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(link.content);
  const [saving,  setSaving]  = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) { setEditing(false); setContent(link.content); }
        else onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editing, link.content, onClose]);

  async function save() {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const updated = await api.patch<JournalLink>(`/api/journal/links/${link.id}`, { content: trimmed });
      onUpdate(updated);
      setEditing(false);
    } finally { setSaving(false); }
  }

  async function del() {
    await api.del(`/api/journal/links/${link.id}`);
    onDelete(link.id);
    onClose();
  }

  return (
    <div
      className="jlm-backdrop"
      style={{ zIndex }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="jlm-sheet" role="dialog" aria-modal="true">
        <div className="jlm-header">
          <mark className="jlm-anchor-badge">{link.anchorText}</mark>
          <button className="jlm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="jlm-body">
          {editing ? (
            <textarea
              className="jlm-edit-input"
              value={content}
              onChange={e => setContent(e.target.value)}
              autoFocus
              rows={5}
            />
          ) : (
            <p className="jlm-content">{link.content}</p>
          )}
        </div>
        <div className="jlm-footer">
          {confirming ? (
            <>
              <span className="jlm-confirm-msg">Delete this link?</span>
              <button onClick={() => setConfirming(false)}>Cancel</button>
              <button className="jlm-del-confirm" onClick={() => void del()}>Delete</button>
            </>
          ) : editing ? (
            <>
              <button onClick={() => { setEditing(false); setContent(link.content); }}>Cancel</button>
              <button className="jlm-save" onClick={() => void save()} disabled={!content.trim() || saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              <button className="jlm-del" onClick={() => setConfirming(true)}>Delete</button>
              <button className="jlm-edit-btn" onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
