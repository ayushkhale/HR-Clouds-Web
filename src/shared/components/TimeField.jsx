// ─────────────────────────────────────────────────────────────────────────────
// TimeField.jsx — The one time picker for the whole app (every role).
//
// Wraps react-time-picker: type the time, or open the clock and pick it. The
// value is always a 24-hour "HH:mm" string — the same shape <input type="time">
// used — so forms and validation need no changes. It is displayed as 12-hour
// with am/pm, which is how the rest of the app shows times.
//
// Styling lives in index.css under .hrc-time-field.
// ─────────────────────────────────────────────────────────────────────────────

import TimePicker from "react-time-picker";
import { HiClock, HiX } from "react-icons/hi";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";

/** react-time-picker may hand back "HH:mm:ss" or null; forms want "HH:mm" or "". */
const toHHmm = (value) => (value ? String(value).slice(0, 5) : "");

export default function TimeField({
  value,
  onChange,
  invalid = false,
  disabled = false,
  clearable = true,
  label,
  className = "",
}) {
  return (
    <div className={`hrc-time-field ${invalid ? "hrc-time-field--invalid" : ""} ${className}`} role="group" aria-label={label}>
      <TimePicker
        value={value || null}
        onChange={(v) => onChange(toHHmm(v))}
        disabled={disabled}
        format="hh:mm a"
        maxDetail="minute"
        locale="en-IN"
        clockIcon={<HiClock className="w-4 h-4" />}
        clearIcon={clearable && value ? <HiX className="w-3.5 h-3.5" /> : null}
        clockProps={{ renderNumbers: true, size: 160 }}
      />
    </div>
  );
}
