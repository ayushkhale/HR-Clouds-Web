// ─────────────────────────────────────────────────────────────────────────────
// CancelPlanDialog.jsx — Stopping the subscription (#235).
//
// Built on the house ReasonDialog rather than a new modal: this is a reason
// prompt with two extra controls, which is exactly what its `children` slot is
// for (§5 — don't rebuild ReasonDialog). `minLength={0}` because the API takes
// the reason as optional; we ask for it anyway, because the audit trail is the
// only record of WHY a company left.
//
// The whole point of this dialog is the difference between its two options,
// which the API expresses as `effective` and which nobody outside billing
// would guess from the words "period end" and "immediate":
//
//   period_end  — the default, and reversible (#236). Keeps everything working
//                 until the paid period runs out, then stops renewing. Almost
//                 everyone wants this, so it is pre-selected.
//   immediate   — ends access today, needs `confirm: true`, CANNOT be undone,
//                 and triggers no automatic refund. Three separate reasons to
//                 make someone tick a box, so the box is the gate and the copy
//                 says all three consequences before they do.
//
// A free plan has nothing to stop (#235 answers CANNOT_CANCEL_FREE_PLAN), so
// the caller never opens this dialog for one — the button is absent, not
// disabled (§2).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import { fmtDate } from "../../../../shared/attendance/dates";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";

// #235 caps the reason at 500 characters.
const REASON_MAX = 500;

const OPTIONS = [
  {
    value: "period_end",
    title: "Stop it renewing",
    body: "Everything keeps working until the period you’ve paid for runs out. Nothing more is charged, and you can change your mind.",
  },
  {
    value: "immediate",
    title: "End access today",
    body: "Everyone loses access to the workspace straight away. You won’t be refunded for the days you’ve already paid for, and this can’t be undone.",
  },
];

/**
 * @param {object} props
 * @param {string} [props.periodEnd]  ISO date the paid period ends
 * @param {boolean} props.busy
 * @param {string} [props.error]
 * @param {(payload: { effective: string, reason: string, confirm: boolean }) => void} props.onSubmit
 * @param {() => void} props.onClose
 */
export default function CancelPlanDialog({ periodEnd, busy, error, onSubmit, onClose }) {
  const [effective, setEffective] = useState("period_end");
  const [confirmed, setConfirmed] = useState(false);

  const immediate = effective === "immediate";

  return (
    <ReasonDialog
      title="Cancel your plan"
      description={
        periodEnd
          ? <>You’ve paid up to <span className="font-semibold text-slate-700">{fmtDate(periodEnd)}</span>. Choose what happens then.</>
          : "Choose what happens to your workspace."
      }
      label="Why are you leaving?"
      placeholder="This helps us fix what pushed you away. Optional."
      confirmLabel={immediate ? "End access today" : "Stop it renewing"}
      tone="danger"
      minLength={0}
      maxLength={REASON_MAX}
      busy={busy}
      error={error}
      canSubmit={!immediate || confirmed}
      onSubmit={(reason) => onSubmit({ effective, reason, confirm: immediate ? confirmed : undefined })}
      onClose={onClose}
    >
      {/* A radiogroup rather than a fieldset/legend: the ⓘ has to sit BESIDE
          the caption (never inside a label — FieldHelp.jsx), and a <legend>
          wrapped in a div to make room for it stops being the fieldset's
          caption at all. aria-labelledby does the same job without that. */}
      <div role="radiogroup" aria-labelledby="cancel-mode-caption" className="space-y-2.5">
        <div className="flex items-center">
          <p id="cancel-mode-caption" className="text-[11px] font-bold text-slate-500 uppercase">What should happen</p>
          <FieldHelp surface="billing.cancel" field="effective" label="the two ways to cancel" className="mb-0" />
        </div>
        {OPTIONS.map((opt) => {
          const active = effective === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition ${active ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
            >
              <input
                type="radio"
                name="cancel-effective"
                value={opt.value}
                checked={active}
                onChange={() => { setEffective(opt.value); setConfirmed(false); }}
                className="mt-0.5 w-4 h-4 accent-purple-600 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-800">{opt.title}</span>
                <span className="block text-xs text-slate-500 leading-relaxed mt-0.5">{opt.body}</span>
              </span>
            </label>
          );
        })}
      </div>

      {/* The API refuses an immediate cancellation without this (#235
          CONFIRMATION_REQUIRED), and so do we — before the request, so the
          person is stopped by the sentence rather than by an error. */}
      {immediate && (
        <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-3.5 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-rose-600 shrink-0"
          />
          <span className="text-xs text-slate-700 leading-relaxed">
            I understand everyone loses access to this workspace today, that there’s no refund for the remaining days, and that this can’t be undone.
          </span>
        </label>
      )}
    </ReasonDialog>
  );
}
