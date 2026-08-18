---
name: Food inventory model
description: The durable boundaries for food inventory, dated activity, and linked observations.
---

Food inventory uses a dedicated food domain: an item represents the current provision, and dated activities record purchases, use, cooking, moves, status changes, and observations.

**Why:** A journal entry cannot express the lifecycle of a single provision without losing its current storage/status or making later food trends difficult.

**How to apply:** Put user-entered observations in a food activity and attach linked text to that activity, not to the item itself.