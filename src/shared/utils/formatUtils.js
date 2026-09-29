export const formatDecimalHours = (val) => {
  if (val == null || isNaN(val) || val === 0) return '0h';
  const hrs = Math.floor(val);
  const mins = Math.round((val - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

// ── Day counts ───────────────────────────────────────────────────────────────
// A day off is only ever whole or half — there is no quarter day anywhere in
// leave, comp-off, encashment or payroll. The API still sends decimals
// ("2.50"), and "2.5 days" reads as a sum to work out rather than a number of
// days, so it is never printed. A value that is not a multiple of a half is a
// backend bug; it is snapped to the nearest half instead of leaking a decimal.
//
// ONE rendering, everywhere, and it spells the half out:
//   0.5 → "1 Half Day"      2   → "2 Days"
//   1   → "1 Day"           2.5 → "2 Days and 1 Half Day"
// No decimal, no "2½", no "2 and a half" — this is the only form the screen is
// allowed to use. Because the phrase carries its own unit, a tile must NOT put
// a "days" caption beside it; say "left", "paid", "unpaid" instead.
// Eight near-identical local copies of this used to disagree with each other;
// don't write a ninth.
const halvesOf = (val) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n)) return null;
  return { halves: Math.round(Math.abs(n) * 2), sign: n < 0 ? "-" : "" };
};

/**
 * "1 Half Day" / "1 Day" / "2 Days and 1 Half Day". Pass `lower` mid-sentence,
 * where Title Case would read as a proper noun.
 */
export const formatDayCount = (val, { fallback = "N/A", lower = false } = {}) => {
  const parsed = halvesOf(val);
  if (!parsed) return fallback;
  const { halves, sign } = parsed;
  let text = "0 Days";
  if (halves > 0) {
    const whole = Math.floor(halves / 2);
    const parts = [];
    if (whole > 0) parts.push(`${sign}${whole} ${whole === 1 ? "Day" : "Days"}`);
    if (halves % 2 === 1) parts.push(`${whole > 0 ? "" : sign}1 Half Day`);
    text = parts.join(" and ");
  }
  return lower ? text.toLowerCase() : text;
};

// "2026-09" → "September 2026". Payroll periods are always YYYY-MM strings.
export const formatPeriod = (periodMonth) => {
  if (!periodMonth) return "N/A";
  const [year, month] = String(periodMonth).split("-");
  const idx = parseInt(month, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return periodMonth;
  return `${new Date(0, idx).toLocaleString("default", { month: "long" })} ${year}`;
};

// Money arrives as a number or a numeric string (integer-paise safe on the
// backend). Render it as INR without forcing a currency symbol the caller may
// want to place itself.
// Whole rupees print without decimals; anything with paise prints exactly two
// ("₹57,559.40", never "₹57,559.4"), so a column of amounts lines up.
export const formatMoney = (val, { withSymbol = true } = {}) => {
  const n = parseFloat(val);
  const safe = Number.isFinite(n) ? n : 0;
  const rounded = Math.round(safe * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  const formatted = Math.abs(rounded).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = rounded < 0 ? "-" : "";
  return withSymbol ? `${sign}₹${formatted}` : `${sign}${formatted}`;
};

// Rates arrive as fixed-scale strings ("50.0000", "0.2500"). Show at most two
// decimals with trailing zeros dropped: "50%", "0.25%", "3.75%".
export const formatPercent = (val) => {
  const n = parseFloat(val);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
};

// A salary component's value as shown everywhere (catalog, templates):
// flat → money, balancing → the remainder of CTC, anything else → a rate.
export const formatComponentValue = (component, { balancingLabel = "Auto (remainder)" } = {}) => {
  if (!component) return "N/A";
  if (component.calculation_type === "flat") return formatMoney(component.value);
  if (component.calculation_type === "balancing") return balancingLabel;
  return formatPercent(component.value);
};

// Safe date rendering — payroll dates are YYYY-MM-DD strings (DATEONLY, no TZ).
export const formatDate = (d) => {
  if (!d) return "N/A";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "N/A"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
