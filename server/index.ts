import express from "express";
import path from "node:path";
import fs from "node:fs";
import financeRouter from "./routes/finance.ts";
import fitnessRouter from "./routes/fitness.ts";
import journalRouter from "./routes/journal.ts";
import { seedIfEmpty } from "./seed.ts";
import { errorHandler } from "./util.ts";

const app = express();
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 5000;
const projectRoot = path.resolve(import.meta.dirname, "..");

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/finance", financeRouter);
app.use("/api/fitness", fitnessRouter);
app.use("/api/journal", journalRouter);

app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint." }));
app.use(errorHandler);

/* The client is served from the same origin and port — one URL, one process,
   which is what Replit expects. In dev, Vite runs as middleware so HMR works. */
if (isProd) {
  const dist = path.join(projectRoot, "dist/public");
  if (!fs.existsSync(dist)) {
    throw new Error("dist/public is missing. Run `npm run build` first.");
  }
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    appType: "spa",
    server: { middlewareMode: true, hmr: true },
    root: path.join(projectRoot, "client"),
  });
  app.use(vite.middlewares);
}

await seedIfEmpty().catch((err) => {
  console.error("Seed skipped:", err.message);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Personal Tracker running at http://localhost:${port}`);
});
