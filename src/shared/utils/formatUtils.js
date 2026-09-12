export const formatDecimalHours = (val) => {
  if (val == null || isNaN(val) || val === 0) return '0h';
  const hrs = Math.floor(val);
  const mins = Math.round((val - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

// "2026-09" → "September 2026". Payroll periods are always YYYY-MM strings.
export const formatPeriod = (periodMonth) => {
  if (!periodMonth) return "—";
  const [year, month] = String(periodMonth).split("-");
  const idx = parseInt(month, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return periodMonth;
  return `${new Date(0, idx).toLocaleString("default", { month: "long" })} ${year}`;
};

// Money arrives as a number or a numeric string (integer-paise safe on the
// backend). Render it as INR without forcing a currency symbol the caller may
// want to place itself.
export const formatMoney = (val, { withSymbol = true } = {}) => {
  const n = parseFloat(val);
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = safe.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return withSymbol ? `₹${formatted}` : formatted;
};

// Safe date rendering — payroll dates are YYYY-MM-DD strings (DATEONLY, no TZ).
export const formatDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
