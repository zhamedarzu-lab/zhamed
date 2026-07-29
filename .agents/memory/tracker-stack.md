---
name: Tracker stack decisions
description: Key constraints for the Personal Tracker (Finance/Fitness/Journal) app
---

## Routing
- Frontend: react-router-dom v6, BrowserRouter, no wouter, no shadcn/Tailwind utility classes
- API prefix: all routes at `/api/...` — Vite dev server proxies `/api` → `localhost:8080`

## Styling
- Custom CSS only: `artifacts/tracker/src/styles.css` — "ledger pad" design system
- Fonts: Archivo (UI) + IBM Plex Mono (figures) from Google Fonts in `index.html`
- No Tailwind classes used in components

## Zod
- Workspace catalog has zod `^3.25.76` (v3, not v4)
- DB schema files must NOT use `import { z } from "zod/v4"` — use plain `"zod"` or skip drizzle-zod entirely
- API route files (bundled by esbuild) must also import from `"zod"` not `"zod/v4"`
- `zod` must be listed in `artifacts/api-server/package.json` dependencies (esbuild bundles from artifact's own dep tree)

## esbuild (api-server)
- `@replit/object-storage` must be in the `external` list in `build.mjs` — it transitively depends on `@google-cloud/storage` which is already external and not installed

## Seeding
- `seedIfEmpty()` in `artifacts/api-server/src/lib/seed.ts` seeds 10 bills + 4 debt accounts on first boot
- Called from `src/index.ts` with `.catch()` so failures are non-fatal

**Why:** These constraints were discovered through build/runtime failures and are not obvious from reading the code.
