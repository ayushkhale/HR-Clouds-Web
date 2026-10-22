// ─────────────────────────────────────────────────────────────────────────────
// attendance/ShiftPolicyPanel — "the shift and the rules that applied here",
// as the body of a section, in whatever shell the host already uses.
//
// WHY A BODY AND NOT A SECTION. The two places this belongs sit in different
// dialogs: the approval dialog's own compact panels (DecisionContext) and the
// DetailDialog record inspector the day drilldown is built from (CLAUDE.md §3).
// A component that owned its own section header would look foreign in one of
// them, and a fork would let the two drift — which is exactly what happened:
// the approval dialog has shown the policy since it was written, while the day
// inspector beside it showed a shift and nothing else. So the SHELL belongs to
// the host and the CONTENT belongs here.
//
// WHOSE DAY IS THIS. `viewer="other"` is a manager or HR reading an employee's
// day, so every sentence is written about "the employee", never "you" — a
// screen about somebody else never reuses copy written to the person whose data
// it is (CLAUDE.md §10, workspaces). The same component serves both roles with
// one prop; it is never forked per role (§2).
//
// HISTORY, NOT TODAY. `policyOf`/`shiftOf` prefer `policy_snapshot` /
// `shift_snapshot`, the copy frozen onto the record when the day was evaluated.
// A day inspector must show the rules that ACTUALLY applied — a policy edited
// last week would otherwise rewrite how an older day appears to have been
// judged.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtClockTime, fmtMinutes } from "./dates.js";
import { SHIFT_TYPES, humanize } from "./enums.js";
import { policyOf, ruleLines, shiftOf } from "./policyRules.js";

const hasNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** Shift length in minutes, carrying an overnight shift past midnight. */
function shiftWindow(shift) {
  const parse = (v) => {
    const m = String(v || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = parse(shift?.start_time);
  let end = parse(shift?.end_time);
  if (start === null || end === null) return null;
  if (shift.is_overnight || end <= start) end += 1440;
  return { start, end, length: end - start };
}

function Rule({ rule }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-slate-400">{rule.label}</p>
      <p className="text-xs font-bold text-slate-700 break-words">{rule.value}</p>
      <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{rule.note}</p>
    </div>
  );
}

/**
 * @param {{ source: object, viewer?: "self"|"other", emptyNote?: string }} props
 *   `source` is anything `policyOf`/`shiftOf` understand: an attendance record,
 *   a daily log, a `/attendance/shift` wrapper, a manager approval payload.
 * @returns the content of a "shift & rules" section, or null when there is
 *   neither a shift nor a policy to show — which is what hides the host's
 *   section entirely rather than printing an empty box (§5).
 */
export default function ShiftPolicyPanel({ source, viewer = "other", emptyNote }) {
  const shift = shiftOf(source);
  const policy = policyOf(source);
  if (!shift && !policy) return null;

  const win = shiftWindow(shift);
  const typeKey = shift?.shift_type || shift?.type;
  const rules = ruleLines(shift, policy, { viewer });
  const hasBuffer = hasNum(shift?.buffer_minutes_before) || hasNum(shift?.buffer_minutes_after);

  return (
    <>
      <div className={rules.length > 0 ? "pb-3 mb-3 border-b border-slate-200/70" : ""}>
        {shift ? (
          <>
            <p className="text-xs font-bold text-slate-700">
              {shift.name || "Shift"}
              {typeKey && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{SHIFT_TYPES[typeKey]?.label || humanize(typeKey)}</span>}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {fmtClockTime(shift.start_time)} – {fmtClockTime(shift.end_time)}
              {win && win.end >= 1440 && " (next day)"}
              {win && ` · ${fmtMinutes(win.length)}`}
              {shift.timezone && ` · ${shift.timezone}`}
            </p>
            {hasBuffer && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                Buffer {fmtMinutes(shift.buffer_minutes_before)} before · {fmtMinutes(shift.buffer_minutes_after)} after
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-700">No shift assigned</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {viewer === "self"
                ? "You worked this day without set hours, so only the rules below applied."
                : "This day was worked without a shift, so only the rules below applied."}
            </p>
          </>
        )}
      </div>

      {rules.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-3">
          {rules.map((rule) => <Rule key={rule.key} rule={rule} />)}
        </div>
      ) : (
        // "Couldn't load" and "nothing on file" must not read alike (§7). This
        // is the second: the shift is here, its rules are not.
        emptyNote && <p className="text-[11px] text-slate-400">{emptyNote}</p>
      )}

      {policy?.name && <p className="text-[10px] text-slate-400 mt-3">{policy.name}</p>}
    </>
  );
}
