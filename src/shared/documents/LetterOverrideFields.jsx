// ─────────────────────────────────────────────────────────────────────────────
// documents/LetterOverrideFields.jsx — The "what only you can say" boxes of a
// letter, shared by the issue, reissue, proposal and bulk forms.
//
// Four forms drew these boxes with four slightly different copies, and when the
// field contract changed (30 Sep 2026: the issue inputs are now a published
// table, one of them is a number, required ones are really required) all four
// had to change the same way. One component means they can't drift again.
//
// What it knows, per box (from `letterOverridableFields`):
//  · a paragraph or a line (`long`), or a whole-number box (`kind: "number"`,
//    with its range — `response_deadline_days` is 1–90);
//  · whether it is genuinely required (`known && required` — marked with the
//    same rose asterisk as every other form);
//  · whether it starts from the organisation's saved wording, which is said
//    under it so nobody wonders where the text came from.
//
// It also owns the "check this first" note for the letters that print the
// record as it stands (a promotion letter prints the CURRENT title as the new
// one), because that has to be read before the boxes, not after the refusal.
// ─────────────────────────────────────────────────────────────────────────────

import { HiInformationCircle } from "react-icons/hi";
import { FIELD, LABEL } from "./ui";
import { REQUIRED_PROBLEM, isPrefilledFromSaved } from "./letterIssueMeta";
import { letterIssueReminder } from "./letterFieldMatrix";

/** The "before you issue this" note for a letter, or nothing. */
export function LetterIssueReminder({ code, className = "" }) {
  const text = letterIssueReminder(code);
  if (!text) return null;
  return (
    <p className={`flex items-start gap-2 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-3 leading-relaxed ${className}`}>
      <HiInformationCircle className="w-4 h-4 shrink-0 text-indigo-500 mt-px" />
      <span>{text}</span>
    </p>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.fields       from `letterOverridableFields`
 * @param {Record<string,string>} props.values
 * @param {(key: string, value: string) => void} props.onChange
 * @param {Record<string,string>} [props.problems]
 * @param {object} [props.saved]        the template's `config.saved_fields`
 * @param {boolean} [props.disabled]
 * @param {string} props.idPrefix       unique per form, for label/input pairing
 * @param {string} [props.wideClass]    the grid span for a paragraph box
 * @param {string} [props.gridClass]
 * @param {(field: object) => string} [props.defaultHint]  a hint when nothing more specific applies
 * @param {boolean} [props.revealRequired]  show an empty required box in red.
 *   False until the person has tried to send: an untouched form shouldn't open
 *   in red. Until then the box says "Needed on this letter." as a plain hint.
 */
export default function LetterOverrideFields({
  fields, values, onChange, problems = {}, saved = null, disabled = false, idPrefix,
  wideClass = "lg:col-span-2", gridClass = "grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4",
  defaultHint = () => "", revealRequired = false,
}) {
  return (
    <div className={gridClass}>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const needed = field.known && field.required;
        const prefilled = isPrefilledFromSaved(field, saved);
        const raw = problems[field.key];
        // An unfilled required box is only an ERROR once the person has tried to send.
        const problem = raw === REQUIRED_PROBLEM && !revealRequired ? "" : raw;
        const hint = problem
          || (prefilled ? "Filled in from your saved wording — change it here for this letter only." : "")
          || field.help
          || (raw === REQUIRED_PROBLEM ? REQUIRED_PROBLEM : "")
          || defaultHint(field);
        const common = {
          id,
          value: values[field.key] ?? "",
          disabled,
          onChange: (e) => onChange(field.key, e.target.value),
          "aria-invalid": problem ? true : undefined,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        };
        return (
          <div key={field.key} className={field.long ? wideClass : ""}>
            <label htmlFor={id} className={LABEL}>
              {field.label}
              {needed && <span className="text-rose-400 ml-0.5" aria-hidden="true">*</span>}
            </label>
            {field.kind === "number" ? (
              <input
                {...common}
                type="number"
                inputMode="numeric"
                step={1}
                min={field.min}
                max={field.maxValue}
                className={`${FIELD} sm:max-w-[10rem]`}
              />
            ) : field.long ? (
              <textarea {...common} rows={2} maxLength={field.max} className={`${FIELD} resize-y`} />
            ) : (
              <input {...common} type="text" maxLength={field.max} className={FIELD} />
            )}
            {hint && (
              <p id={`${id}-hint`} className={`text-[10px] mt-1 leading-relaxed ${problem ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                {hint}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
