// ─────────────────────────────────────────────────────────────────────────────
// PlanCatalogue.jsx — The plans you can move to, as cards (#225).
//
// Cards, not a table, and this is the one place in the product where that is
// right: §3's "tall cards for tabular data were rejected" is about rows of
// records. A plan is a thing being chosen, not a record being scanned, and the
// choice turns on a feature list that a table cell can't hold.
//
// The feature keys come back from the server (#225 `feature_keys`), but their
// human names already live in shared/config/plans.js, which the marketing
// pricing page uses — including which features are granted but have no screens
// yet. Reusing that catalog is what keeps the pricing page and this screen from
// disagreeing about what a plan includes, which is the exact drift that file
// was written to end.
//
// What each card offers depends on where the plan sits against the current one,
// and the rules are the server's, not ours:
//   current  → Renew (and #238 will refuse it until the last fortnight)
//   dearer   → Move up, charged today with credit for unused days
//   cheaper  → Schedule only. It CANNOT be bought (#232 answers
//              USE_SCHEDULED_DOWNGRADE), because this period is already paid
//              for, so the card says "from <date>" and never shows a price to
//              pay now.
// ─────────────────────────────────────────────────────────────────────────────

import { HiArrowCircleUp, HiBadgeCheck, HiCheck, HiClock, HiRefresh, HiUserGroup } from "react-icons/hi";
import { PLAN_FEATURES, isComingSoon } from "../../../../shared/config/plans";
import { humanize } from "../../../../shared/attendance/enums";
import { fmtDate } from "../../../../shared/attendance/dates";
import { CYCLE_LABEL, planStanding } from "../billingMeta";
import { PRIMARY_BTN, SECONDARY_BTN } from "./billingUi";
import { formatMoney } from "../../../../shared/utils/formatUtils";

const FEATURE_NAME = Object.fromEntries(PLAN_FEATURES.map((f) => [f.key, f.name]));

/** "payroll.access" → "Payroll", and an unknown key still reads as words (§4). */
const featureName = (key) => FEATURE_NAME[key] || humanize(String(key).split(".")[0]);

/** "1 manager" / "5 managers" — a seat line reading "1 HR admins" looks broken. */
const plural = (count, one, many) => `${count} ${Number(count) === 1 ? one : many}`;

/** "Up to 100 employees · 15 managers · 5 HR admins". A null limit is unlimited. */
const seatLine = (limits) => {
  const parts = [
    limits?.max_employees == null ? "Unlimited employees" : `Up to ${plural(limits.max_employees, "employee", "employees")}`,
    limits?.max_managers == null ? null : plural(limits.max_managers, "manager", "managers"),
    limits?.max_hrs == null ? null : plural(limits.max_hrs, "HR admin", "HR admins"),
  ].filter(Boolean);
  return parts.join(" · ");
};

function PlanCard({ plan, standing, scheduledCode, onChoose, onSchedule, periodEnd, busy }) {
  const isCurrent = standing === "current";
  const isScheduled = scheduledCode && plan.code === scheduledCode;
  const cheaper = standing === "down";

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-5 transition ${
        isCurrent ? "border-purple-300 ring-2 ring-purple-100 shadow-sm"
          : isScheduled ? "border-fuchsia-200 ring-2 ring-fuchsia-50"
            : "border-slate-100 shadow-xs hover:border-purple-200"
      }`}
    >
      {(isCurrent || isScheduled) && (
        <span className={`absolute -top-2.5 left-5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isCurrent ? "bg-purple-600 text-white border-purple-600" : "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"}`}>
          {isCurrent ? <><HiBadgeCheck className="w-3 h-3" /> Your plan</> : <><HiClock className="w-3 h-3" /> Starting soon</>}
        </span>
      )}

      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-900 truncate">{plan.name}</h3>
        {plan.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{plan.description}</p>}
      </div>

      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900 tracking-tight">
          {parseFloat(plan.amount) === 0 ? "Free" : formatMoney(plan.amount)}
          {CYCLE_LABEL[plan.billing_cycle] && (
            <span className="text-xs font-semibold text-slate-400"> {CYCLE_LABEL[plan.billing_cycle]}</span>
          )}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">for the whole workspace</p>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-slate-600 mt-4 pt-4 border-t border-slate-100">
        <HiUserGroup className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-500" />
        <span>{seatLine(plan.limits)}</span>
      </p>

      <ul className="mt-3 space-y-1.5 flex-1">
        {(plan.feature_keys || []).map((key) => (
          <li key={key} className="flex items-start gap-1.5 text-xs text-slate-600">
            <HiCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
            <span>{featureName(key)}{isComingSoon(key) ? <span className="text-slate-400"> (coming soon)</span> : null}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {isScheduled ? (
          <p className="text-xs text-fuchsia-700 bg-fuchsia-50/70 border border-fuchsia-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
            Takes over on {fmtDate(periodEnd)}. Nothing to pay.
          </p>
        ) : cheaper ? (
          <button type="button" onClick={() => onSchedule(plan)} disabled={busy} className={`${SECONDARY_BTN} w-full`}>
            <HiClock className="w-4 h-4" /> Switch from {fmtDate(periodEnd)}
          </button>
        ) : (
          <button type="button" onClick={() => onChoose(plan)} disabled={busy} className={`${PRIMARY_BTN} w-full`}>
            {isCurrent ? <><HiRefresh className="w-4 h-4" /> Renew</> : <><HiArrowCircleUp className="w-4 h-4" /> Move up</>}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.plans           #225 rows
 * @param {object} [props.currentPlan]     #226 `subscription.plan`
 * @param {string} [props.scheduledCode]   #226 `subscription.scheduled_change.plan_code`
 * @param {string} [props.periodEnd]       when a scheduled change would start
 * @param {(plan: object) => void} props.onChoose
 * @param {(plan: object) => void} props.onSchedule
 * @param {boolean} [props.busy]
 */
export default function PlanCatalogue({
  plans, currentPlan, scheduledCode, periodEnd, onChoose, onSchedule, busy = false,
}) {
  if (!plans?.length) {
    return (
      <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
        No plans are on offer right now. Contact support and we’ll sort one out for you.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {plans.map((plan) => (
        <PlanCard
          key={plan.code}
          plan={plan}
          standing={planStanding(plan, currentPlan)}
          scheduledCode={scheduledCode}
          periodEnd={periodEnd}
          onChoose={onChoose}
          onSchedule={onSchedule}
          busy={busy}
        />
      ))}
    </div>
  );
}
