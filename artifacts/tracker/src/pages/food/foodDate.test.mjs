import assert from "node:assert/strict";
import test from "node:test";
import { formatFoodDate } from "./foodDate.js";

test("formats PostgreSQL DATE values as their local calendar day in a western timezone", () => {
  process.env.TZ = "America/Los_Angeles";
  assert.equal(formatFoodDate("2099-04-15"), "Apr 15, 2099");
});