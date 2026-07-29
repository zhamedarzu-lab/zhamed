import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { longDate } from "../lib/format";
import { Notice, Panel } from "../components/ui";

type Image = { id: number; originalName: string | null };
type Entry = { date: string; body: string; images: Image[] };

export default function JournalDay() {
  const { date = "" } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useApi<Entry>(`/api/journal/entries/${date}`, [date]);

  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (data && loadedFor.current !== date) {
      setBody(data.body);
      loadedFor.current = date;
      setStatus("idle");
    }
  }, [data, date]);

  /* Autosave a beat after typing stops — no save button to remember. */
  useEffect(() => {
    if (loadedFor.current !== date) return;
    if (data && body === data.body) return;
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await api.put(`/api/journal/entries/${date}`, { body });
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, date]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("images", f));
    try {
      await api.upload(`/api/journal/entries/${date}/images`, form);
      loadedFor.current = null;
      await reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Those photos didn't upload.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeImage(id: number) {
    await api.del(`/api/journal/images/${id}`);
    loadedFor.current = null;
    await reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Journal</span>
          <h1>{date ? longDate(date) : "Entry"}</h1>
          <p className="fig" style={{ fontSize: "0.75rem" }}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "\u00a0"}
          </p>
        </div>
        <button onClick={() => navigate("/journal")}>Back to calendar</button>
      </div>

      <Notice>{error}</Notice>

      <Panel>
        <textarea
          value={body}
          placeholder="What happened today?"
          style={{ minHeight: "16rem", border: "none", padding: 0, fontSize: "1rem" }}
          onChange={(e) => setBody(e.target.value)}
        />
      </Panel>

      <div style={{ height: "1.25rem" }} />

      <Panel
        title="Photos"
        action={
          <div className="button-row">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => upload(e.target.files)}
            />
            <button onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Add photos"}
            </button>
          </div>
        }
      >
        <Notice>{uploadError}</Notice>
        {(data?.images.length ?? 0) === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
            No photos on this day yet.
          </p>
        ) : (
          <div className="image-grid">
            {data!.images.map((img) => (
              <figure className="image-tile" key={img.id} style={{ margin: 0 }}>
                <img
                  src={`/api/journal/images/${img.id}/raw`}
                  alt={img.originalName ?? "Journal photo"}
                  loading="lazy"
                />
                <button
                  className="danger"
                  onClick={() => removeImage(img.id)}
                  aria-label="Remove this photo"
                >
                  ×
                </button>
              </figure>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
