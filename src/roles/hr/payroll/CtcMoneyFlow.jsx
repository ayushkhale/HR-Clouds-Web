// ─────────────────────────────────────────────────────────────────────────────
// CtcMoneyFlow.jsx — where a CTC actually goes, top to bottom.
//
//   Cost to company  →  (employer statutory reserved)  →  gross pay
//                    →  (withheld from the employee)   →  take-home
//
// HR types one number into the form and four different numbers matter: what the
// company spends, what the employee is promised, what is withheld and what
// actually reaches their bank. Showing only the first two is how a structure
// gets approved that nobody understands.
//
// Laid out as the Invite Team Member form is: a titled section card, then
// labelled fields in a grid, so it reads like the rest of the app rather than
// like a spreadsheet bolted on.
//
// Heads that cannot be known before the structure exists — professional tax
// needs the state slab, income tax needs the employee's regime and declarations
// — are named as missing rather than dropped, because a take-home figure that
// silently omits a real deduction is worse than one that admits a gap.
// ─────────────────────────────────────────────────────────────────────────────

import { HiOfficeBuilding, HiCash, HiUser, HiInformationCircle, HiArrowNarrowDown } from "react-icons/hi";
import { formatMoney } from "../../../shared/utils/formatUtils";

// Same label and read-only "field" look as the invite form's inputs.
const LABEL = "block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 truncate";
const FIELD = "min-h-10 flex items-center bg-slate-50/70 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold tabular-nums";

/** One labelled figure, styled like a read-only form field. */
function Field({ label, value, hint, tone = "plain", title }) {
  const tones = {
    plain: "text-slate-800",
    minus: "text-rose-700 bg-rose-50/60 border-rose-200",
    muted: "text-slate-400 font-semibold",
  };
  return (
    <div className="min-w-0">
      <span className={LABEL} title={title || label}>{label}</span>
      <div className={`${FIELD} ${tones[tone] || tones.plain}`}>
        <span className="truncate">{tone === "minus" ? "− " : ""}{value}</span>
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1 leading-tight">{hint}</p>}
    </div>
  );
}

/** A stage of the journey: a rule, a heading with its running total, then its parts. */
function Stage({ icon: Icon, title, note, total, children, first = false }) {
  return (
    <div>
      {!first && (
        <div className="flex justify-center py-1">
          <HiArrowNarrowDown className="w-4 h-4 text-slate-300" aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2.5">
        <h5 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Icon className="w-3.5 h-3.5 text-purple-500 shrink-0" /> {title}
        </h5>
        {total && <span className="text-xs font-black tabular-nums text-slate-900">{total}</span>}
      </div>
      {note && <p className="text-[10px] text-slate-400 -mt-1.5 mb-2.5 leading-relaxed">{note}</p>}
      {children}
    </div>
  );
}

// Below lg the modal is one column and this gets the full width, so it can hold
// three fields. At lg+ it sits in the right-hand half, where three would truncate
// every label — hence stepping back down rather than up.
const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3";

/**
 * @param {number}  props.annualCtc   the CTC entered
 * @param {object}  props.cost        costFromPreview() output
 * @param {object}  props.deductions  employeeStatutoryDeductions() output
 * @param {Array}   props.lines       preview lines
 */
export default function CtcMoneyFlow({ annualCtc, cost, deductions, lines = [] }) {
  if (!cost || !deductions) return null;

  const yr = (monthly) => formatMoney(monthly * 12);
  const grossAnnual = cost.monthlyGross * 12;
  const reserved = cost.core * 12;
  const ctc = annualCtc > 0 ? annualCtc : grossAnnual + reserved;
  const earnings = lines.filter((l) => (l.component_type || "earning") === "earning");
  const withheld = deductions.lines.filter((l) => l.applicable);
  const grossPct = ctc > 0 ? Math.max(0, Math.min(100, (grossAnnual / ctc) * 100)) : 100;

  return (
    <section className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 border-b border-slate-100">
        <h4 className="text-sm font-bold text-slate-800">Where the money goes</h4>
        <span className="text-xs font-black tabular-nums text-purple-700">{formatMoney(ctc)} / year</span>
      </div>

      <div className="p-5 space-y-4">
        {/* How the company's spend splits, before any of the detail. */}
        {reserved > 0 && (
          <div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden flex" role="presentation">
              <div className="h-full bg-purple-600" style={{ width: `${grossPct}%` }} />
              <div className="h-full bg-indigo-400 flex-1" />
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 mt-1.5 text-[10px] font-semibold">
              <span className="text-purple-700">Gross pay · {grossPct.toFixed(1)}%</span>
              <span className="text-indigo-600">Employer statutory · {(100 - grossPct).toFixed(1)}%</span>
            </div>
          </div>
        )}

        <Stage first icon={HiOfficeBuilding} title="Cost to the company" total={formatMoney(ctc)}
          note={reserved > 0
            ? "The employer's statutory share is reserved out of the CTC before the rest becomes pay."
            : "No employer statutory contribution applies, so the whole CTC becomes pay."}>
          {reserved > 0 && (
            <div className={GRID}>
              <Field label="PF (employer)" value={yr(cost.employerPf)} tone="minus" />
              {cost.edli > 0 && <Field label="EDLI" value={yr(cost.edli)} tone="minus" />}
              {cost.adminCharges > 0 && <Field label="PF admin" value={yr(cost.adminCharges)} tone="minus" />}
              {cost.employerEsi > 0 && <Field label="ESI (employer)" value={yr(cost.employerEsi)} tone="minus" />}
              {cost.source === "estimated" && cost.core > 0 && cost.employerPf === 0 && (
                <Field label="Employer statutory" value={formatMoney(reserved)} tone="minus" />
              )}
            </div>
          )}
        </Stage>

        <Stage icon={HiCash} title="Promised to the employee — gross pay" total={formatMoney(grossAnnual)}>
          <div className={GRID}>
            {earnings.map((l) => (
              <Field
                key={l.code || l.name}
                label={l.name || l.code}
                value={formatMoney(Number.parseFloat(l.annual_amount) || (Number.parseFloat(l.monthly_amount) || 0) * 12)}
                hint={[
                  `${formatMoney(Number.parseFloat(l.monthly_amount) || 0)}/mo`,
                  l.calculation_type === "balancing" ? "takes what is left" : "",
                ].filter(Boolean).join(" · ")}
              />
            ))}
          </div>
        </Stage>

        <Stage icon={HiUser} title="Withheld from the employee"
          total={withheld.length > 0 ? `− ${yr(deductions.known)}` : undefined}>
          {withheld.length === 0 && deductions.unresolved.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nothing is withheld under your current statutory settings.</p>
          ) : (
            <div className={GRID}>
              {withheld.map((l) => <Field key={l.key} label={l.label} value={yr(l.amount)} tone="minus" />)}
              {deductions.unresolved.map((u) => (
                <Field key={u.key} label={u.label} value="Not estimated" tone="muted" hint={u.why} />
              ))}
            </div>
          )}
        </Stage>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">
              {deductions.complete ? "Take-home" : "Take-home before the heads above"}
            </p>
            <p className="text-[10px] text-purple-400 mt-0.5">{formatMoney(deductions.takeHome)} a month</p>
          </div>
          <span className="text-lg font-black tabular-nums text-purple-800">{formatMoney(deductions.takeHome * 12)}</span>
        </div>

        {!deductions.complete && (
          <p className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
            <HiInformationCircle className="w-3.5 h-3.5 shrink-0 text-purple-500 mt-px" />
            <span>
              {deductions.unresolved.map((u) => u.label).join(" and ")} can only be worked out once this structure is
              assigned, so the take-home above is before {deductions.unresolved.length === 1 ? "it" : "them"}.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
