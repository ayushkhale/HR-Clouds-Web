// PeriodPicker — month + year selects that always emit a valid "YYYY-MM".
// A free number input for the year let HR clear it and send "NaN-09".

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString("en-IN", { month: "long" }));

export default function PeriodPicker({ value, onChange, idPrefix, selectClassName = "", yearsBack = 2, yearsAhead = 2, disabled = false }) {
  const now = new Date();
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
  const [year, month] = valid ? value.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const thisYear = now.getFullYear();
  const years = [];
  for (let y = Math.min(thisYear - yearsBack, year); y <= Math.max(thisYear + yearsAhead, year); y += 1) years.push(y);

  const emit = (y, m) => onChange(`${y}-${String(m).padStart(2, "0")}`);

  return (
    <div className="grid grid-cols-[1.5fr_1fr] gap-2">
      <select
        id={idPrefix ? `${idPrefix}-month` : undefined}
        aria-label="Month"
        value={month}
        disabled={disabled}
        onChange={(e) => emit(year, Number(e.target.value))}
        className={selectClassName}
      >
        {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
      </select>
      <select
        id={idPrefix ? `${idPrefix}-year` : undefined}
        aria-label="Year"
        value={year}
        disabled={disabled}
        onChange={(e) => emit(Number(e.target.value), month)}
        className={selectClassName}
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
