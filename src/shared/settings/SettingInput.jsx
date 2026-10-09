// ─────────────────────────────────────────────────────────────────────────────
// settings/SettingInput.jsx — One control per setting, chosen from the
// catalogue's `data_type` rather than from a hand-maintained list of keys.
//
// This is what makes the hub survive the backend adding a setting: a new entry
// in the catalogue arrives with its type, range and unit, and gets a working
// control with no frontend release (the brief's "zero maintenance burden").
//
// WHAT IS DELIBERATELY NOT EDITABLE HERE:
//   · `jsonb` — a structured blob has no honest generic editor, and guessing
//     one risks writing a shape the owning module can't read. Read-only, with
//     the card's link out to the screen that owns it.
//   · anything the catalogue marks `deprecated` or `sensitive` — the gateway's
//     allowlist refuses them anyway (422 SETTING_NOT_WRITABLE), so offering a
//     control would be the button that 403s.
// Both render as plain text, which is the Phase 1 behaviour they already had.
//
// Arrays ARE editable, as chips. Two things make that safe rather than a
// guess: the catalogue's `default` tells us whether the items are numbers or
// strings, so a list of lead-days round-trips as numbers and a list of emails
// as strings; and `range.max_items` caps the list the way the server will.
//
// Every control is uncontrolled-by-value-only: it reports changes upward and
// holds no state, so the card owns the whole group's dirty tracking and a
// Discard really does discard.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { HiPlus, HiX } from "react-icons/hi";
import { arrayItemIsNumber, displaySettingValue, isEditable } from "./settingsMeta";

const INPUT = "w-full px-3 py-2 text-sm rounded-xl border bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-purple-100 transition disabled:bg-slate-50 disabled:text-slate-400";
const OK = "border-slate-200 focus:border-purple-500";
const BAD = "border-rose-300 focus:border-rose-500 focus:ring-rose-100";

/** A list of values, added and removed one at a time. */
function ChipList({ id, value, entry, disabled, onChange }) {
  const [draft, setDraft] = useState("");
  const items = Array.isArray(value) ? value : [];
  const max = entry?.range?.max_items ?? null;
  const full = max !== null && items.length >= max;

  const add = () => {
    const text = draft.trim();
    if (!text || full) return;
    const next = arrayItemIsNumber(entry) ? Number(text) : text;
    if (arrayItemIsNumber(entry) && !Number.isFinite(next)) return;
    if (items.some((i) => String(i) === String(next))) { setDraft(""); return; }
    onChange([...items, next]);
    setDraft("");
  };

  return (
    <div className="min-w-0">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {items.map((item) => (
            <li key={String(item)} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-xs text-purple-800 max-w-full">
              <span className="truncate">{String(item)}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => String(i) !== String(item)))}
                disabled={disabled}
                className="p-0.5 rounded-full text-purple-400 hover:text-purple-900 hover:bg-purple-100 disabled:opacity-40"
                aria-label={`Remove ${item}`}
              >
                <HiX className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type={arrayItemIsNumber(entry) ? "number" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          disabled={disabled || full}
          placeholder={full ? "That’s the most you can add" : "Type, then press Add"}
          className={`${INPUT} ${OK} flex-1`}
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || full || !draft.trim()}
          className="shrink-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"
        >
          <HiPlus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.entry   the catalogue definition
 * @param {any} props.value      the current (possibly edited) value
 * @param {boolean} props.disabled
 * @param {(value: any) => void} props.onChange
 */
export default function SettingInput({ id, entry, value, disabled = false, invalid = false, onChange }) {
  if (!isEditable(entry)) {
    // Read-only by design — see this file's header for which types and why.
    return (
      <span className="text-xs font-bold text-slate-800">{displaySettingValue(value, entry)}</span>
    );
  }

  const cls = `${INPUT} ${invalid ? BAD : OK}`;

  switch (entry.data_type) {
    case "boolean":
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 accent-purple-600"
          />
          {/* The word carries the state, so the control reads the same way the
              read-only card did: On / Off, never true / false (§4). */}
          <span className="text-xs font-bold text-slate-700">{value ? "On" : "Off"}</span>
        </label>
      );

    case "enum":
      return (
        <select
          id={id}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        >
          {/* A nullable setting can be cleared; one that isn't shows no blank
              option, so it cannot be emptied by accident. */}
          {entry.nullable && <option value="">Not set</option>}
          {(entry.range?.enum || []).map((option) => (
            <option key={option} value={option}>{displaySettingValue(option, entry)}</option>
          ))}
        </select>
      );

    case "integer":
    case "decimal":
      return (
        <input
          id={id}
          type="number"
          value={value ?? ""}
          disabled={disabled}
          min={entry.range?.min}
          max={entry.range?.max}
          step={entry.data_type === "integer" ? 1 : "any"}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") { onChange(entry.nullable ? null : ""); return; }
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : raw);
          }}
          className={cls}
        />
      );

    case "date":
      return (
        <input
          id={id}
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          className={cls}
        />
      );

    case "array":
      return <ChipList id={id} value={value} entry={entry} disabled={disabled} onChange={onChange} />;

    case "string":
    default:
      return (
        <input
          id={id}
          type="text"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
  }
}
