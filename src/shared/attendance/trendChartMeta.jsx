// ─────────────────────────────────────────────────────────────────────────────
// attendance/trendChartMeta.jsx — What every daily attendance chart shares, so the
// HR, manager and employee dashboards read the same way.
//
//   · Sundays carry a faint vertical "SUNDAY", so an empty bar on a weekly off
//     reads as expected rather than as everyone being absent. HR had this and
//     the other two dashboards didn't, which made the same data look worse
//     depending on who was looking at it.
//   · A month is paged in two halves, 1–15 and 16–end. It opens on the half containing
//     today: opening on the 1st–15th on the 28th showed two-week-old data
//     first and hid what people actually came to see.
//
// Recharts only draws a ReferenceLine that is a direct child of the chart, so
// the markers come back as an array of elements, not a wrapper component.
// ─────────────────────────────────────────────────────────────────────────────

import { ReferenceLine } from "recharts";
import { parseYMDLocal, todayYMD } from "./dates";
import SundayLabel from "./SundayLabel";

export const CHART_PAGE_SIZE = 15;

// Two halves, always: 1–15 and 16 to the end. Plain 15-day pages made a
// 31-day month three pages, the last holding the 31st alone — and on the
// 31st the chart opened on that single bar.
/** How many halves `rows` (one month of days) splits into: 1 or 2. */
export const chartPageCount = (rows) => (rows.length > CHART_PAGE_SIZE ? 2 : 1);
/** The rows of half `page` (0 or 1). */
export const chartPageRows = (rows, page) => (page <= 0 ? rows.slice(0, CHART_PAGE_SIZE) : rows.slice(CHART_PAGE_SIZE));

export const isSunday = (ymd) => parseYMDLocal(String(ymd || "").slice(0, 10))?.getDay() === 0;

/**
 * One transparent ReferenceLine per Sunday in `rows`, labelled "SUNDAY".
 * zIndex sits below the bars (300) so the label never hides data.
 */
export function sundayMarkers(rows, key = "date") {
  return rows
    .filter((row) => isSunday(row[key]))
    .map((row) => <ReferenceLine key={`sun-${row[key]}`} x={row[key]} stroke="transparent" zIndex={250} label={SundayLabel} />);
}

/**
 * The half of the month to open on. The current month opens on the half that
 * holds today (or the last day on or before it, if today has no row yet); any
 * other month opens on its first half, the natural place to start reading.
 */
export function defaultChartPage(rows, period, key = "date") {
  const today = todayYMD();
  const [year, month] = today.split("-").map(Number);
  if (period?.year !== year || period?.month !== month) return 0;
  // Compare calendar days only: a row dated "2026-09-29T00:00:00Z" is today,
  // but as a string it sorts after "2026-09-29".
  let last = -1;
  rows.forEach((row, i) => { const day = String(row[key] || "").slice(0, 10); if (day && day <= today) last = i; });
  return last < CHART_PAGE_SIZE ? 0 : chartPageCount(rows) - 1;
}
