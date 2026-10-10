// ─────────────────────────────────────────────────────────────────────────────
// settings/SettingInput.jsx — One control per setting, chosen from the
// catalogue's `data_type` rather than from a hand-maintained list of keys.
//
// This is what makes the hub survive the backend adding a setting: a new entry
// in the catalogue arrives with its type, range and unit, and gets a working
// control with no frontend release (the brief's "zero maintenance burden").
//
// WHY SOME CONTROLS ARE NOT THE OBVIOUS ONE. The brief's §3 asks for
// "conversational pickers" over raw inputs, and the first pass here had none:
// a payday was a number box reading `25`, a yes/no was a bare checkbox, and a
// retention period was a number with its unit in grey text below it. Three
// changes, each decided from the catalogue (see settingsMeta):
//   · a short `enum` becomes a SEGMENTED row, so the alternatives are visible
//     without opening anything. A dropdown answers "what is this set to?"; a
//     pill row answers "what else could it be?", and on a settings screen
//     both questions are being asked at once.
//   · `boolean` becomes a SWITCH on the label's own line (2026-10-10). It was
//     an On/Off pill pair, which was correct and expensive: a full row per
//     yes/no, with no room left for the sentence that explains it.
//   · an integer the catalogue ranges 1–31 and names `*_day` becomes "25th of
//     the month". Anything carrying a `unit` is excluded — a COUNT of days is
//     not a day of the month, and dressing one as the other would misstate
//     what is stored.
//   · a `unit` is drawn ON the box (`30 days`, `₹ 50000`), where it belongs to
//     the number, instead of in a caption the eye reaches after the input.
// Everything else falls through to the plain control it always had, so an
// unrecognised type is still editable rather than missing.
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
import { HiMail, HiPlus, HiX } from "react-icons/hi";
import {
  arrayItemHint, arrayItemIsNumber, dayOfMonthOptions, displaySettingValue, isDayOfMonth,
  isEditable, looksLikeEmail, segmentedOptions, unitAffix,
} from "./settingsMeta";
import { META, TEXT } from "./settingsText";

const INPUT = "w-full px-3 py-2 text-sm rounded-xl border bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-purple-100 transition disabled:bg-slate-50 disabled:text-slate-400";
const OK = "border-slate-200 focus:border-purple-500";
const BAD = "border-rose-300 focus:border-rose-500 focus:ring-rose-100";

/**
 * A number with its unit printed on the box.
 *
 * The affix is `pointer-events-none` and the input is padded around it, so the
 * unit never eats a click meant for the field and the digits never run under
 * the word.
 */
function NumberWithUnit({ affix, children, suffixWidth }) {
  return (
    <div className="relative min-w-0">
      {affix.prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 pointer-events-none">
          {affix.prefix}
        </span>
      )}
      {children}
      {affix.suffix && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none"
          style={{ maxWidth: suffixWidth }}
        >
          {affix.suffix}
        </span>
      )}
    </div>
  );
}

/**
 * A yes/no, as the switch everybody already knows.
 *
 * It replaced an On/Off pill pair (user decision, 2026-10-10). The pills were
 * honest — both states visible — but they ate a full row per setting, and a
 * card of six yes/nos was six rows of pills saying almost nothing. A switch is
 * 44px, reads at a glance, and sits on the label's own line, which is what
 * buys the space for the sentence explaining what the setting does.
 *
 * `role="switch"` + `aria-checked` is the native pairing, so the state is
 * announced without a label of its own; the word beside it is for everyone
 * else, since "which way is on" is not knowable from a shape alone.
 */
function Switch({ id, value, disabled, labelledBy, onChange }) {
  const on = Boolean(value);
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative w-10 h-[22px] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-purple-100 ${
          on ? "bg-purple-600" : "bg-slate-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0"
          }`}
        />
      </button>
      <span className={`text-[11px] font-bold w-6 ${on ? "text-purple-700" : "text-slate-400"}`}>
        {on ? "On" : "Off"}
      </span>
    </span>
  );
}

/** A row of pills: every choice visible, the current one filled. */
function Segmented({ id, options, value, disabled, onChange }) {
  return (
    <div
      id={id}
      role="radiogroup"
      className="inline-flex w-full min-w-0 gap-1 bg-slate-100 rounded-xl p-1"
    >
      {options.map((option) => {
        const active = String(value ?? "") === String(option.value);
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
              active ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="block truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   A list of values — billing notice recipients, reminder lead days — added
   and removed one at a time.

   THE 2026-10-10 PASS. This was a chip row, a text box and an Add button:
   correct, and it told you nothing. Typing a malformed address got you a
   chip, and the refusal arrived from the gateway's Joi after Save; the cap
   was invisible until the box went dead; and taking a chip off left no way
   back to it. The billing notices card on Plan & Billing had all three
   answers already (BillingNoticesCard), so this brings them here rather
   than inventing a second idea of the same control:
     · the typo is caught before Save, in our words, not Joi's (§6),
     · the cap is stated in words while there is still room ("2 more can be
       added"), and
     · the catalogue's own `default` items come back as one-click pills, so
       removing the one you ship with is undoable without remembering it.
   All three are read from the catalogue (`range`, `default`, `data_type`),
   so the next array setting the backend adds gets them too.
   ───────────────────────────────────────────────────────────────────────── */
function ChipList({ id, value, entry, disabled, onChange }) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const items = Array.isArray(value) ? value : [];
  const numeric = arrayItemIsNumber(entry);
  const shape = arrayItemHint(entry) || {};
  const max = entry?.range?.max_items ?? null;
  const full = max !== null && items.length >= max;
  const left = max === null ? null : max - items.length;

  const has = (candidate) => items.some((i) => String(i).toLowerCase() === String(candidate).toLowerCase());
  // The item's own unit, from the catalogue — "7 days", not a bare 7, and a
  // bare number where the catalogue gives no unit.
  const itemLabel = (item) => (numeric
    ? displaySettingValue(item, { data_type: "integer", unit: entry?.unit })
    : String(item));

  /** One place for both the Add button and a put-back pill. */
  const commit = (raw) => {
    const text = String(raw).trim();
    if (!text) return false;
    if (full) { setProblem(`That’s the most you can add (${max}).`); return false; }
    if (numeric) {
      const n = Number(text);
      const { min, max: ceiling } = entry.range || {};
      const usable = Number.isFinite(n) && Number.isInteger(n)
        && (min === undefined || n >= min) && (ceiling === undefined || n <= ceiling);
      if (!usable) { setProblem(shape.invalid || "That isn’t a number we can use."); return false; }
      if (has(n)) { setProblem("That one is already on the list."); return false; }
      // Biggest first, so a list of reminder lead days reads as a countdown.
      onChange([...items, n].sort((a, b) => b - a));
      setProblem("");
      return true;
    }
    const cleaned = shape.kind === "email" ? text.toLowerCase() : text;
    if (shape.kind === "email" && !looksLikeEmail(cleaned)) { setProblem(shape.invalid); return false; }
    if (has(cleaned)) { setProblem("That one is already on the list."); return false; }
    onChange([...items, cleaned]);
    setProblem("");
    return true;
  };

  const add = () => { if (commit(draft)) setDraft(""); };

  // The shipped items this list is missing: putting one back shouldn't mean
  // remembering what it was.
  const putBack = (Array.isArray(entry?.default) ? entry.default : []).filter((item) => !has(item));

  return (
    <div className="min-w-0">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {items.map((item) => (
            <li key={String(item)} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-purple-50 border border-purple-200 text-xs text-purple-800 max-w-full">
              {shape.kind === "email" && <HiMail className="w-3 h-3 shrink-0 text-purple-500" aria-hidden="true" />}
              {/* `break-all`, not `truncate`: a billing address the reader
                  can't finish reading is one they can't check. */}
              <span className="break-all">{itemLabel(item)}</span>
              <button
                type="button"
                onClick={() => { onChange(items.filter((i) => String(i) !== String(item))); setProblem(""); }}
                disabled={disabled}
                className="p-0.5 rounded-full text-purple-400 hover:text-purple-900 hover:bg-purple-100 disabled:opacity-40 shrink-0"
                aria-label={`Remove ${itemLabel(item)}`}
              >
                <HiX className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The box is capped rather than stretched: the field spans the card's
          full width so the chips above can flow across it, and a 1100px box
          for one email address reads as a mistake. */}
      <div className="flex gap-2 max-w-lg">
        <input
          id={id}
          type={numeric ? "number" : shape.kind === "email" ? "email" : "text"}
          value={draft}
          min={numeric ? entry.range?.min : undefined}
          max={numeric ? entry.range?.max : undefined}
          onChange={(e) => { setDraft(e.target.value); setProblem(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          disabled={disabled || full}
          placeholder={full ? "That’s the most you can add" : shape.placeholder}
          className={`${INPUT} ${problem ? BAD : OK} flex-1`}
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

      {/* What went wrong, in our words, before anything is sent. `role=alert`
          because a refusal is the only feedback a screen reader gets for a
          press that did nothing. */}
      {problem ? (
        <p role="alert" className="text-[11px] font-semibold text-rose-600 mt-1.5">{problem}</p>
      ) : (
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 ${META}`}>
          {left !== null && (
            <span>{left === 0 ? `That’s the most you can add (${max}).` : `${left} more can be added.`}</span>
          )}
          {!full && putBack.length > 0 && (
            <>
              <span>Put back:</span>
              {putBack.map((item) => (
                <button
                  key={String(item)}
                  type="button"
                  onClick={() => commit(item)}
                  disabled={disabled}
                  className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[11px] font-bold text-purple-700 hover:bg-purple-50 hover:border-purple-200 disabled:opacity-40"
                >
                  + {itemLabel(item)}
                </button>
              ))}
            </>
          )}
        </div>
      )}
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
export default function SettingInput({
  id, entry, value, disabled = false, invalid = false, labelledBy, onChange,
}) {
  if (!isEditable(entry)) {
    // Read-only by design — see this file's header for which types and why.
    return (
      <span className={`text-xs font-bold ${TEXT.value}`}>{displaySettingValue(value, entry)}</span>
    );
  }

  const cls = `${INPUT} ${invalid ? BAD : OK}`;

  switch (entry.data_type) {
    case "boolean":
      // A switch, on the label's own line — see the Switch header for why it
      // is no longer a pair of pills. The card lays the row out (it is the
      // only control that shares a line with its label).
      return (
        <Switch id={id} value={value} disabled={disabled} labelledBy={labelledBy} onChange={onChange} />
      );

    case "enum": {
      const segments = segmentedOptions(entry);
      if (segments) {
        return (
          <Segmented id={id} options={segments} value={value} disabled={disabled} onChange={onChange} />
        );
      }
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
    }

    case "integer":
    case "decimal": {
      // "25th of the month" rather than `25`, where the catalogue's range and
      // key say that is what the number means.
      if (isDayOfMonth(entry)) {
        return (
          <select
            id={id}
            value={value ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className={cls}
          >
            {entry.nullable && <option value="">Not set</option>}
            {dayOfMonthOptions(entry).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      }

      const affix = unitAffix(entry);
      const field = (
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
          className={`${cls} ${affix?.prefix ? "pl-8" : ""} ${affix?.suffix ? "pr-16" : ""}`}
        />
      );
      return affix ? <NumberWithUnit affix={affix} suffixWidth="3.25rem">{field}</NumberWithUnit> : field;
    }

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
