// ─────────────────────────────────────────────────────────────────────────────
// SundayLabel.jsx — Two treatments for Sundays on the attendance chart.
//
// • SundayLabel (default): the faint grey vertical "SUNDAY" spread down the
//   plot area, used when the day has NO data (an empty slot on a weekly off).
//
// • SundayAboveLabel: a single white "SUNDAY" placed ABOVE the plot area,
//   used when bars are present so it doesn't hide behind them. The white text
//   reads against the coloured bars below. (User decision, 2026-10-14: if
//   data is present on a Sunday, write SUNDAY above the data in white.)
// ─────────────────────────────────────────────────────────────────────────────

const SUNDAY_LETTERS = "SUNDAY".split("");
const SUNDAY_EDGE = 30; // padding above the first letter and below the last

/** Vertical faint "SUNDAY", for Sundays with no bars (weekly off). */
export default function SundayLabel({ viewBox }) {
  if (!viewBox) return null;
  const { x, y, height } = viewBox;
  const step = Math.max(height - SUNDAY_EDGE * 2, 0) / (SUNDAY_LETTERS.length - 1);
  return (
    <g pointerEvents="none" opacity={0.35}>
      {SUNDAY_LETTERS.map((ch, i) => (
        <text key={i} x={x} y={y + SUNDAY_EDGE + i * step} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={8} fontWeight={700}>
          {ch}
        </text>
      ))}
    </g>
  );
}

/**
 * Horizontal white "SUNDAY" above the plot area, for Sundays that have data.
 *
 * `viewBox.y` is the top of the plot area. We place the text above that, at a
 * fixed 4px offset, so it sits in the chart margin. It is white so it reads
 * against the card's background — the bars underneath are coloured, and any
 * other colour either vanished into them or clashed.
 */
export function SundayAboveLabel({ viewBox }) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <text
      x={x}
      y={y - 4}
      textAnchor="middle"
      dominantBaseline="auto"
      fill="#7c3aed"
      fontSize={7}
      fontWeight={800}
      letterSpacing={1}
      pointerEvents="none"
    >
      SUNDAY
    </text>
  );
}

/**
 * X-axis day number that turns purple on Sundays. The vertical label sits
 * behind the bars, so a Sunday someone worked hid it completely — the axis
 * keeps the day findable either way. Use as `tick={<DayTick />}`.
 */
export function DayTick({ x, y, payload }) {
  // First ten characters: a full timestamp would otherwise make the day NaN.
  const ymd = String(payload?.value || "").slice(0, 10);
  const [yy, mm, dd] = ymd.split("-").map(Number);
  const sunday = !!dd && new Date(yy, mm - 1, dd).getDay() === 0;
  return (
    <text x={x} y={y} dy={10} textAnchor="middle" fill={sunday ? "#7c3aed" : "#94a3b8"} fontSize={10} fontWeight={sunday ? 800 : 600}>
      {dd || ""}
    </text>
  );
}
