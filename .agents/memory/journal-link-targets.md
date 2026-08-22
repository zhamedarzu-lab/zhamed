---
name: Journal link targets
description: How direct note-to-entry associations coexist with free-form journal text links.
---

Use nullable target metadata on the generic journal link record for direct journal associations. A day note's direct association points to an entry by ID and is rendered as an explicit entry pill, rather than trying to insert or match a synthetic anchor phrase in the note body.

**Why:** A free-form link's content is display text, not a stable identity. Keeping the target ID separate makes the association survive note editing and lets the UI open the exact linked entry.

**How to apply:** Preserve ordinary text-link behavior for links without target metadata. When adding another structured journal target, extend the target type deliberately and give it its own explicit display/open behavior.