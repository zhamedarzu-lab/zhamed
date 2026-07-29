---
name: Object storage init
description: @replit/object-storage Client must never be instantiated at module load time
---

## Rule
Never use top-level `await` to construct a `new Client()` from `@replit/object-storage`. The constructor calls `this.init()` which is async and can throw at startup — crashing the Express server before it binds to a port.

## Why
`Client.init()` calls `getDefaultBucketId()` which POSTs to a Replit sidecar endpoint. If the sidecar is slow or the bucket ID env var isn't wired correctly, this throws before the server boots.

## How to apply
Use a lazy-init proxy pattern: define `resolveStore()` that initialises the Client on first call, and export an `imageStore` object whose methods delegate through `resolveStore()`. This way init happens on the first real upload/download request, not at server startup. See `artifacts/api-server/src/lib/imageStore.ts`.

Also pass the bucket ID explicitly: `new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID })` — the auto-detect sidecar call is unreliable.
