// ─────────────────────────────────────────────────────────────────────────────
// attendance/trendChartMeta.jsx — What every daily attendance chart shares, so the
// HR, manager and employee dashboards read the same way.
//
//   · Sundays carry a faint vertical "SUNDAY", so an empty bar on a weekly off
//     reads as expected rather than as everyone being absent. HR had this and
//     the other two dashboards didn't, which made the same data look worse
//     depending on who was looking at it.
//   · Every day of the month gets a bar slot, data or not (fillMonthDays). The
//     server can return only the days it has records for; drawing just those
//     made a half hold three fat bars one month and fifteen thin ones the next.
//     A fixed 15 / 15–16 slots keeps the chart the same shape every time.
//   · A month is paged in two halves, 1–15 and 16–end. It opens on the half containing
//     today: opening on the 1st–15th on the 28th showed two-week-old data
//     first and hid what people actually came to see.
//
// Recharts only draws a ReferenceLine that is a direct child of the chart, so
// the markers come back as an array of elements, not a wrapper component.
// ─────────────────────────────────────────────────────────────────────────────

import { ReferenceLine } from "recharts";
import { monthRange, parseYMDLocal, todayYMD } from "./dates";
import SundayLabel from "./SundayLabel";

export const CHART_PAGE_SIZE = 15;

// Two halves, always: 1–15 and 16 to the end. Plain 15-day pages made a
// 31-day month three pages, the last holding the 31st alone — and on the
// 31st the chart opened on that single bar.
/** How many halves `rows` (one month of days) splits into: 1 or 2. */
export const chartPageCount = (rows) => (rows.length > CHART_PAGE_SIZE ? 2 : 1);
/** The rows of half `page` (0 or 1). */
export const chartPageRows = (rows, page) => (page <= 0 ? rows.slice(0, CHART_PAGE_SIZE) : rows.slice(CHART_PAGE_SIZE));

/**
 * One row per calendar day of `period` ({ year, month }), in order. Days the
 * server returned keep their row; the rest are made by `make(ymd)` — zero
 * counts, so the slot is drawn empty rather than left out.
 */
export function fillMonthDays(rows, period, make, key = "date") {
  if (!period?.year || !period?.month) return rows;
  const byDay = new Map(rows.map((row) => [String(row[key] || "").slice(0, 10), row]));
  const { from, to } = monthRange(period.year, period.month);
  const prefix = from.slice(0, 8);
  const days = Number(to.slice(8, 10));
  return Array.from({ length: days }, (_, i) => {
    const ymd = `${prefix}${String(i + 1).padStart(2, "0")}`;
    return byDay.get(ymd) || make(ymd);
  });
}

/** An empty day for the three-bar team charts (HR and manager). */
export const emptyTrendDay = (date) => ({ date, final_present_count: 0, on_leave_count: 0, final_absent_count: 0 });

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

/* ─── Y axis ───────────────────────────────────────────────────────────── */

/** The three bars every daily attendance chart draws, in drawing order. */
export const TREND_BAR_KEYS = ["final_present_count", "on_leave_count", "final_absent_count"];

// 1 / 2 / 5 × 10ⁿ — the only step sizes a reader can add up in their head.
// Anything else (3, 7, 12…) turns reading a bar into arithmetic.
const NICE_STEPS = [1, 2, 5];
const MIN_INTERVALS = 3;
const MAX_INTERVALS = 6;

/**
 * Domain and ticks for a daily attendance chart, with headroom above the tallest
 * bar so a full-attendance day doesn't touch the roof — on a ten-person team the
 * "present" bar hit the top border every single day and read as clipped.
 *
 * The top tick sits at least one whole person above the highest count, and every
 * tick is a whole number: `allowDecimals={false}` on its own still let Recharts
 * end the domain exactly on the maximum. Of the step sizes that give a sensible
 * number of gridlines, the one that wastes the least space above the bars wins.
 */
export function trendYAxis(rows, keys = TREND_BAR_KEYS) {
  let max = 0;
  (rows || []).forEach((row) => keys.forEach((key) => {
    const value = Number(row?.[key]);
    if (Number.isFinite(value) && value > max) max = value;
  }));
  // An empty or all-zero month still needs a readable axis to hang the grid on.
  if (max <= 0) return { domain: [0, 4], ticks: [0, 1, 2, 3, 4] };

  // One whole person of headroom on a small team; 5% on a big one, so a
  // 200-person org doesn't get a two-pixel gap above a full day.
  const wanted = max + (max <= 10 ? 1 : Math.max(2, Math.ceil(max * 0.05)));
  let step = 0;
  let top = Infinity;
  for (let pow = 0; pow < 9; pow += 1) {
    NICE_STEPS.forEach((base) => {
      const candidate = base * 10 ** pow;
      const intervals = Math.ceil(wanted / candidate);
      if (intervals < MIN_INTERVALS || intervals > MAX_INTERVALS) return;
      const candidateTop = intervals * candidate;
      if (candidateTop < top || (candidateTop === top && candidate > step)) { step = candidate; top = candidateTop; }
    });
  }
  // Nothing fit the gridline budget (only happens for a one- or two-person
  // team), so fall back to a tick per person.
  if (!step) { step = 1; top = wanted; }

  const ticks = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { domain: [0, top], ticks };
}
