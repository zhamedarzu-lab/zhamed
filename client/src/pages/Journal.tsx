import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/api";
import { currentMonth, monthName, todayIso } from "../lib/format";
import { Loading, MonthPicker, Notice, Panel } from "../components/ui";

type DayMark = {
  date: string;
  hasText: boolean;
  imageCount: number;
  preview: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Journal() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error } = useApi<DayMark[]>(`/api/journal/month/${month}`, [month]);

  const [year, mon] = month.split("-").map(Number);
  const firstWeekday = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const today = todayIso();

  const marks = new Map<string, DayMark>((data ?? []).map((d) => [d.date, d]));

  const cells: Array<string | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      return `${month}-${String(i + 1).padStart(2, "0")}`;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const written = data?.filter((d) => d.hasText).length ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Journal</span>
          <h1>{monthName(month)}</h1>
          <p>
            {written === 0
              ? "Nothing written this month yet. Click any day to start."
              : `${written} ${written === 1 ? "day" : "days"} written this month.`}
          </p>
        </div>
        <div className="button-row">
          <button onClick={() => navigate(`/journal/${today}`)}>Write today</button>
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <Notice>{error}</Notice>
      {loading && <Loading />}

      <Panel bodyless>
        <div className="calendar">
          {WEEKDAYS.map((d) => (
            <div className="cal-head" key={d}>
              {d}
            </div>
          ))}

          {cells.map((date, i) => {
            if (!date) {
              return <div className="cal-day" data-empty="true" key={`pad-${i}`} />;
            }
            const mark = marks.get(date);
            return (
              <button
                key={date}
                className="cal-day"
                data-today={date === today}
                onClick={() => navigate(`/journal/${date}`)}
                aria-label={`Open ${date}${mark?.hasText ? " — has an entry" : ""}`}
              >
                <span className="cal-daynum">{Number(date.slice(-2))}</span>
                {mark?.preview && <span className="cal-preview">{mark.preview}</span>}
                <span className="cal-marks">
                  {mark?.hasText && <span className="cal-mark" />}
                  {(mark?.imageCount ?? 0) > 0 && <span className="cal-mark" data-kind="image" />}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
