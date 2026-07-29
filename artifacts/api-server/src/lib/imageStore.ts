import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface ImageStore {
  put(buffer: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function generateKey(contentType: string): string {
  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  const stamp = new Date().toISOString().slice(0, 10);
  return `journal/${stamp}/${crypto.randomUUID()}.${ext}`;
}

// ---- Local filesystem fallback ----

const LOCAL_ROOT = path.resolve(process.cwd(), "uploads");

const localStore: ImageStore = {
  async put(buffer, contentType) {
    const key = generateKey(contentType);
    const dest = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return key;
  },
  async get(key) {
    return fs.readFile(path.join(LOCAL_ROOT, key));
  },
  async remove(key) {
    await fs.rm(path.join(LOCAL_ROOT, key), { force: true });
  },
};

// ---- Replit Object Storage ----

let _store: ImageStore | null = null;

async function resolveStore(): Promise<ImageStore> {
  if (_store) return _store;

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    _store = localStore;
    return localStore;
  }

  try {
    const { Client } = await import("@replit/object-storage");
    const client = new Client({ bucketId });

    const store: ImageStore = {
      async put(buffer, contentType) {
        const key = generateKey(contentType);
        const result = await client.uploadFromBytes(key, buffer, {
          contentType,
        });
        if (!result.ok) {
          throw new Error(
            `Upload failed: ${(result as { error?: { message?: string } }).error?.message ?? "unknown"}`
          );
        }
        return key;
      },
      async get(key) {
        const result = await client.downloadAsBytes(key);
        if (!result.ok) {
          throw new Error(
            `Download failed: ${(result as { error?: { message?: string } }).error?.message ?? "unknown"}`
          );
        }
        return Buffer.from(result.value as Uint8Array);
      },
      async remove(key) {
        await client.delete(key);
      },
    };

    _store = store;
    return store;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[imageStore] Object storage init failed, falling back to local: ${msg}`);
    _store = localStore;
    return localStore;
  }
}

/**
 * Lazy proxy — defers initialisation until first use so a bad bucket ID
 * or missing Replit sidecar won't crash the server at startup.
 */
export const imageStore: ImageStore = {
  put: async (buffer, contentType) => (await resolveStore()).put(buffer, contentType),
  get: async (key) => (await resolveStore()).get(key),
  remove: async (key) => (await resolveStore()).remove(key),
};
