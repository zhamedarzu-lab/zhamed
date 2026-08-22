import assert from "node:assert/strict";
import test from "node:test";
import {
  JOURNAL_VIEWS,
  journalUrlStateFromSearchParams,
  searchParamsForJournalState,
} from "./journalUrlState.ts";

const FOCUS_DATE = "2026-08-22";

function dateString(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

test("Journal bookmarks load every view with their focus date", async (t) => {
  for (const view of JOURNAL_VIEWS) {
    await t.test(view, () => {
      const state = journalUrlStateFromSearchParams(
        new URLSearchParams({ view, date: FOCUS_DATE }),
      );

      assert.equal(state.view, view);
      assert.equal(dateString(state.focus), FOCUS_DATE);
    });
  }
});

test("switching Journal views updates the query without losing the focus date", () => {
  const initial = journalUrlStateFromSearchParams(
    new URLSearchParams({ view: "month", date: FOCUS_DATE }),
  );

  for (const view of JOURNAL_VIEWS) {
    const next = searchParamsForJournalState(
      new URLSearchParams({ view: initial.view, date: FOCUS_DATE }),
      view,
      initial.focus,
    );

    assert.equal(next.get("view"), view);
    assert.equal(next.get("date"), FOCUS_DATE);
  }
});

test("a Journal reload restores the selected view and focus date", () => {
  for (const view of JOURNAL_VIEWS) {
    const firstLoad = searchParamsForJournalState(
      new URLSearchParams(),
      view,
      new Date(`${FOCUS_DATE}T00:00:00`),
    );
    const reloaded = journalUrlStateFromSearchParams(firstLoad);

    assert.equal(reloaded.view, view);
    assert.equal(dateString(reloaded.focus), FOCUS_DATE);
  }
});