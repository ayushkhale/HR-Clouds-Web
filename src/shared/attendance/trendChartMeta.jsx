// ─────────────────────────────────────────────────────────────────────────────
// attendance/trendChartMeta.jsx — What every daily attendance chart shares, so the
// HR, manager and employee dashboards read the same way.
//
//   · Sundays with data carry a white "SUNDAY" label ABOVE the tallest bar of
//     that day. A Sunday with no data keeps a faint grey vertical label behind
//     the empty slot, so the weekly off reads as expected rather than absence.
//   · Every day of the month gets a bar slot, data or not (fillMonthDays). The
//     server can return only the days it has records for; drawing just those
//     made a page hold three fat bars one month and fifteen thin ones the next.
//     A fixed 15–16 slots keeps the chart the same shape every time.
//   · A month is paged into two halves. It opens on the half containing today:
//     opening on the 1st on the 28th showed two-week-old data first and hid
//     what people actually came to see.
//
// Recharts only draws a ReferenceLine that is a direct child of the chart, so
// the markers come back as an array of elements, not a wrapper component.
// ─────────────────────────────────────────────────────────────────────────────

import { ReferenceLine } from "recharts";
import { fmtDate, monthRange, parseYMDLocal, todayYMD } from "./dates";
import { num } from "./normalize";
import SundayLabel, { SundayAboveLabel } from "./SundayLabel";
import { TREND_COLORS, TREND_STROKES } from "./dayStatus";

/* ─── The bars ───────────────────────────────────────────────────────────── */

// Just enough to round the cap without the bar reading as a pill — at 16px
// wide and 1–200 people tall, 3px is a softened corner and 6px is a lozenge.
const TREND_BAR_RADIUS = 3;

// How wide one bar may grow. A literal, not an object, so it can be exported
// out of a file that also exports components without tripping react-refresh.
export const TREND_BAR_MAX_SIZE = 16;

// Which step of the palette each series wears. The chart's keys are the API's
// and the palette's are the status names; this is the one place they meet, so
// HR and the manager can't drift a shade apart (§2).
const TREND_BAR_SERIES = {
  final_present_count: "present",
  final_leave_count: "on_leave",
  final_absent_count: "absent",
  // The employee dashboard's one-series chart: hours worked IS that person's
  // present, so it wears the same darkest step as the team charts' Present bar
  // rather than a fourth purple nobody else uses. Stated here rather than left
  // to the fallback below, so it reads as a decision.
  hours: "present",
};

/**
 * One bar: flat bottom, rounded top, outlined in its own darker step.
 *
 * It reads its own colours off `dataKey` rather than taking them as props, so a
 * screen only ever says WHICH series it is drawing. The alternative — a helper
 * that hands back fill and stroke — has to be exported as a function, and this
 * file already exports components; one more non-component export is one more
 * react-refresh warning for the next person to wade through.
 *
 * It is a hand-drawn path rather than `<Bar radius>` because of one defect that
 * came back twice: Recharts paints the rounded cap even when the bar's value is
 * ZERO, so every day with nobody absent drew a 3px nub along the axis and the
 * chart read as a trickle of absences that didn't exist. (The caps were dropped
 * entirely in 2026-10 for exactly this, and restored on 2026-10-14 with the
 * guard below.) Returning `null` at no height is the fix — a day with none of
 * something draws nothing, which is also what §5's "never render a dash" means
 * for a chart.
 *
 * The left/right edges are inset by half the stroke so the outline lands inside
 * the bar's own slot: bars touch (`barGap={0}`), and without the inset the two
 * strokes overlap into one thick line that belongs to neither.
 */
export function TrendBar({ x, y, width, height, dataKey, strokeWidth = 1 }) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) return null;
  const series = TREND_BAR_SERIES[dataKey] || "present";
  const r = Math.min(TREND_BAR_RADIUS, w / 2, h);
  const inset = strokeWidth / 2;
  const left = Number(x) + inset;
  const right = Number(x) + w - inset;
  const top = Number(y) + inset;
  const bottom = Number(y) + h;
  const d = `M${left},${bottom}V${top + r}Q${left},${top} ${left + r},${top}H${right - r}Q${right},${top} ${right},${top + r}V${bottom}Z`;
  return (
    <path
      d={d}
      fill={TREND_COLORS[series]}
      stroke={TREND_STROKES[series]}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  );
}

/**
 * Horizontal message blob hover tooltip for attendance trends.
 *
 * It is the same light card as the ⓘ field-help popover — white, purple-100
 * hairline, soft shadow — so a hover bubble anywhere in the product looks like
 * the same object. The dark slate version it replaced (2026-10-14) was the one
 * black surface on an otherwise white dashboard.
 *
 * The three counts are labelled P / L / A, not Present / Leave / Absent: the
 * bubble sits over the bars it describes, and the full words made it wide
 * enough to cover half the chart. The coloured dot beside each letter is the
 * same colour as the bar — fill AND outline, because the palest of the three is
 * invisible on white without its outline — which is what actually identifies
 * it, so the letter only has to be a reminder. The whole word is still there
 * for a screen reader, which gets no colour at all.
 */
export function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload || {};
  const dateStr = row.date || label;
  const present = row.final_present_count ?? 0;
  const leave = row.final_leave_count ?? 0;
  const absent = row.final_absent_count ?? 0;

  return (
    <div className="pointer-events-none select-none z-50 animate-in fade-in duration-150">
      <div className="flex items-center gap-3 px-3.5 py-2 bg-white rounded-xl shadow-lg border border-purple-100 text-xs font-semibold whitespace-nowrap">
        <span className="font-bold text-slate-900 border-r border-purple-100 pr-2.5">
          {fmtDate(dateStr, { weekday: "short", day: "numeric", month: "short" })}
        </span>
        <div className="flex items-center gap-3">
          {[["P", "Present", "present", present],
            ["L", "Leave", "on_leave", leave],
            ["A", "Absent", "absent", absent]].map(([initial, word, series, count]) => (
              <span key={word} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border" style={{ backgroundColor: TREND_COLORS[series], borderColor: TREND_STROKES[series] }} />
                <span className="text-slate-500" aria-hidden="true">{initial}</span>
                <span className="sr-only">{word}</span>
                <span className="font-bold text-slate-900 tabular-nums">{count}</span>
              </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// A month is read in two halves, "1/2" and "2/2". 15–16 bars fit with every
// date still printed at the chart's current width (changed from 4 pages of
// 7–8 bars on 2026-10-14: the user found 7 bars too little context — a
// fortnight is a natural reading unit and the axis labels still clear at 15).
//
// Two pages, not "every 15 days": a 31-day month would otherwise be three
// pages, the last holding just the 31st alone. Dividing into two gives
// 14/14 in February and 16/15 in a long month — always a fortnight, give or
// take a day, and always the same two tabs.
export const CHART_PAGES = 2;

// Below this the month is short enough to read in one go (it never happens for
// a real calendar month — it is the guard that keeps a stub or an empty
// fixture from being split into four pages of two bars).
const MIN_PAGED_ROWS = 8;

const pageSize = (total) => Math.ceil(total / CHART_PAGES);

/** How many pages `rows` (one month of days) splits into: 1 or 4. */
export const chartPageCount = (rows) => (rows.length >= MIN_PAGED_ROWS ? CHART_PAGES : 1);

/** The rows of page `page` (0-based). */
export const chartPageRows = (rows, page) => {
  if (rows.length < MIN_PAGED_ROWS) return rows;
  const size = pageSize(rows.length);
  const start = Math.min(Math.max(page, 0), CHART_PAGES - 1) * size;
  return rows.slice(start, start + size);
};

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

/**
 * A day the month has but the API didn't report — in practice every date after
 * today, since the graph endpoints stop at the current day.
 *
 * The counts are `null`, NOT `0`. Nothing was measured on a day that hasn't
 * happened, and zero would claim it was measured and found empty (the same
 * null-is-not-zero rule as `metric()` in dayStatus.js). It also keeps a visible
 * defect away: a rounded cap gets painted even on a bar whose value is 0, so a
 * month of future days drew a row of stubs and the back half of the chart
 * looked like real attendance data. `TrendBar` now refuses to draw at no
 * height, which covers a real zero too, but the nulls stay — Recharts skips a
 * null outright, and "not yet" is still not the same fact as "nobody".
 * `trendYAxis` reads these through `Number()`, where null lands on 0, so the
 * axis is unaffected.
 */
export const emptyTrendDay = (date) => ({ date, final_present_count: null, final_leave_count: null, final_absent_count: null });

/**
 * The chart's middle bar: everyone not expected to work that day — approved
 * leave PLUS weekly-offs PLUS holidays. The HR dashboard endpoints return this
 * precomputed as `final_leave_count` (2026-10-03), so it's used as-is there.
 * The manager team endpoint doesn't carry it, so we reconstruct it from the
 * per-status counts — flat or nested under `counts`, as the manager payload
 * nests them — by the backend's own formula. Any field absent counts as 0, so
 * a manager payload with only `on_leave_count` degrades to that one number
 * (unchanged from before) and auto-completes if the backend adds the field.
 * Drawing just `on_leave_count` left weekly-offs and holidays out of the bar.
 */
export function leaveCountOf(day) {
  const d = day || {};
  const c = d.counts || {};
  if (d.final_leave_count != null) return num(d.final_leave_count);
  if (c.final_leave_count != null) return num(c.final_leave_count);
  const pick = (key) => num(d[key] ?? c[key]);
  return pick("on_leave_count") + pick("weekly_off_count") + pick("holiday_count");
}

export const isSunday = (ymd) => parseYMDLocal(String(ymd || "").slice(0, 10))?.getDay() === 0;

/** Whether a day row has at least one non-null bar. */
const hasData = (row) =>
  (row.final_present_count != null && row.final_present_count > 0) ||
  (row.final_leave_count != null && row.final_leave_count > 0) ||
  (row.final_absent_count != null && row.final_absent_count > 0);

/**
 * Sundays in `rows`, rendered two different ways (user decision, 2026-10-14):
 *
 * • **With data:** the word "SUNDAY" sits ABOVE the tallest bar in white,
 *   `isFront` so it paints over the gridlines. The label is a Recharts
 *   `<ReferenceLine>` whose custom label component positions the text at a
 *   fixed Y offset above the plot area — not on the bar itself, because
 *   `viewBox.y` of a ReferenceLine is the plot's top edge (it doesn't know
 *   the bar height). The white text reads against the coloured bars.
 *
 * • **Without data:** the old faint vertical "SUNDAY" behind the empty slot
 *   (`SundayLabel`), so the weekly off reads as expected.
 */
export function sundayMarkers(rows, key = "date") {
  return rows
    .filter((row) => isSunday(row[key]))
    .map((row) => {
      const withBars = hasData(row);
      return (
        <ReferenceLine
          key={`sun-${row[key]}`}
          x={row[key]}
          stroke="transparent"
          isFront={withBars}
          zIndex={withBars ? 350 : 250}
          label={withBars ? SundayAboveLabel : SundayLabel}
        />
      );
    });
}

/**
 * The page of the month to open on. The current month opens on the week that
 * holds today (or the last day on or before it, if today has no row yet); any
 * other month opens on its first page, the natural place to start reading.
 */
export function defaultChartPage(rows, period, key = "date") {
  const today = todayYMD();
  const [year, month] = today.split("-").map(Number);
  if (period?.year !== year || period?.month !== month) return 0;
  // Compare calendar days only: a row dated "2026-09-29T00:00:00Z" is today,
  // but as a string it sorts after "2026-09-29".
  let last = -1;
  rows.forEach((row, i) => { const day = String(row[key] || "").slice(0, 10); if (day && day <= today) last = i; });
  if (last < 0 || rows.length < MIN_PAGED_ROWS) return 0;
  return Math.min(Math.floor(last / pageSize(rows.length)), chartPageCount(rows) - 1);
}

/* ─── Y axis ───────────────────────────────────────────────────────────── */

/** The three bars every daily attendance chart draws, in drawing order. */
export const TREND_BAR_KEYS = ["final_present_count", "final_leave_count", "final_absent_count"];

// 1 / 2 / 5 × 10ⁿ — the only step sizes a reader can add up in their head.
// Anything else (3, 7, 12…) turns reading a bar into arithmetic.
const NICE_STEPS = [1, 2, 5];
const MIN_INTERVALS = 3;
const MAX_INTERVALS = 6;
// Up to twelve gridlines is still a readable axis; past that the labels start
// touching. Below it, every whole number gets its own tick.
const TICK_PER_UNIT_MAX = 12;

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

  // A tick per person while they still fit — 1, 2, 3, 4 rather than 0, 2, 4,
  // 6, 8. The axis counts people, and on a team of eight a reader shouldn't
  // have to halve a gridline to find out whether a bar is five or six.
  if (wanted <= TICK_PER_UNIT_MAX) {
    return { domain: [0, wanted], ticks: Array.from({ length: wanted + 1 }, (_, i) => i) };
  }

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
