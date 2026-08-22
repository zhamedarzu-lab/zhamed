export const JOURNAL_VIEWS = ["day", "week", "month", "year"] as const;

export type JournalView = (typeof JOURNAL_VIEWS)[number];

export type JournalUrlState = {
  view: JournalView;
  focus: Date;
};

export function viewFromSearchParams(searchParams: URLSearchParams): JournalView {
  const view = searchParams.get("view");
  return JOURNAL_VIEWS.includes(view as JournalView) ? view as JournalView : "month";
}

export function focusFromSearchParams(searchParams: URLSearchParams): Date {
  const date = searchParams.get("date");
  if (date) {
    const parsed = new Date(date + "T00:00:00");
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function journalUrlStateFromSearchParams(searchParams: URLSearchParams): JournalUrlState {
  return {
    view: viewFromSearchParams(searchParams),
    focus: focusFromSearchParams(searchParams),
  };
}

export function searchParamsForJournalState(
  searchParams: URLSearchParams,
  view: JournalView,
  focus: Date,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.set("view", view);
  next.set("date", toYMD(focus));
  return next;
}

function toYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}