import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Journal images live behind this adapter so the app runs the same way on
 * Replit (Object Storage, synced across devices) and on a plain machine
 * (a local ./uploads folder).
 */
export interface ImageStore {
  put(buffer: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function newKey(contentType: string) {
  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  const stamp = new Date().toISOString().slice(0, 10);
  return `journal/${stamp}/${crypto.randomUUID()}.${ext}`;
}

const LOCAL_ROOT = path.resolve(process.cwd(), "uploads");

const localStore: ImageStore = {
  async put(buffer, contentType) {
    const key = newKey(contentType);
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

async function makeReplitStore(): Promise<ImageStore> {
  const { Client } = await import("@replit/object-storage");
  const client = new Client(
    process.env.REPLIT_BUCKET_ID
      ? { bucketId: process.env.REPLIT_BUCKET_ID }
      : undefined,
  );

  return {
    async put(buffer, contentType) {
      const key = newKey(contentType);
      const res = await client.uploadFromBytes(key, buffer);
      if (!res.ok) throw new Error(`Upload failed: ${res.error?.message}`);
      return key;
    },
    async get(key) {
      const res = await client.downloadAsBytes(key);
      if (!res.ok) throw new Error(`Download failed: ${res.error?.message}`);
      return Buffer.from(res.value[0]);
    },
    async remove(key) {
      await client.delete(key);
    },
  };
}

const driver =
  process.env.STORAGE_DRIVER ??
  (process.env.REPL_ID || process.env.REPLIT_BUCKET_ID ? "replit" : "local");

export const imageStore: ImageStore =
  driver === "replit"
    ? await makeReplitStore().catch((err) => {
        console.warn(
          "Replit Object Storage unavailable (%s) — falling back to ./uploads",
          err.message,
        );
        return localStore;
      })
    : localStore;

console.log("Image storage driver: %s", driver);
