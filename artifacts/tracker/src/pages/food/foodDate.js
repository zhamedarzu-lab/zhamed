/**
 * PostgreSQL DATE values arrive as YYYY-MM-DD. Parse those as a local calendar
 * date, never as UTC midnight, so the displayed day stays correct worldwide.
 */
export function foodCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

export function formatFoodDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(foodCalendarDate(value));
}