/**
 * Anything thrown out of a route has to come back as JSON.
 *
 * Express 5 forwards a rejected route promise to the error handler, and there
 * was none — so a thrown `parseId` produced Express's stock HTML error page.
 * The client parses every response body as JSON, so the real message ("Invalid
 * id") was replaced by a JSON parse error, and outside production the page
 * carried a stack trace in the response body.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";

describe("error handling", () => {
  it("answers a thrown 400 as JSON, not HTML", async () => {
    const res = await request(app).delete("/api/finance/debt-accounts/not-a-number");

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: "Invalid id" });
  });

  it("never puts a stack trace in the response body", async () => {
    const res = await request(app).patch("/api/finance/bills/0").send({ amount: 1 });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/\bat \w+.*\(/);
  });

  it("still serves ordinary 404s from the routes themselves", async () => {
    const res = await request(app).patch("/api/finance/debt-accounts/999999999").send({
      name: "nope",
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
