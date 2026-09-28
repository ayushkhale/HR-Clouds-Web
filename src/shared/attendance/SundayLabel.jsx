// Vertical "SUNDAY" label for a Recharts ReferenceLine (see trendChartMeta).

const SUNDAY_LETTERS = "SUNDAY".split("");
const SUNDAY_EDGE = 30; // padding above the first letter and below the last

/** Vertical "SUNDAY", letters spread evenly from the top of the plot to the baseline. */
export default function SundayLabel({ viewBox }) {
  if (!viewBox) return null;
  const { x, y, height } = viewBox;
  const step = Math.max(height - SUNDAY_EDGE * 2, 0) / (SUNDAY_LETTERS.length - 1);
  return (
    <g pointerEvents="none">
      {SUNDAY_LETTERS.map((ch, i) => (
        <text key={i} x={x} y={y + SUNDAY_EDGE + i * step} textAnchor="middle" dominantBaseline="middle" fill="#cbd5e1" fontSize={9} fontWeight={700}>
          {ch}
        </text>
      ))}
    </g>
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
