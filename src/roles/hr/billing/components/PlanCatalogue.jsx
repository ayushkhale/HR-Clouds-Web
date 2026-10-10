// ─────────────────────────────────────────────────────────────────────────────
// PlanCatalogue.jsx — The plans you can move to, as cards (#225).
//
// Cards, not a table, and this is the one place in the product where that is
// right: §3's "tall cards for tabular data were rejected" is about rows of
// records. A plan is a thing being chosen, not a record being scanned, and the
// choice turns on a feature list that a table cell can't hold.
//
// ONE CARD PER TIER, NOT PER PLAN CODE. #225 is a flat list of purchasable
// codes, so "starter_monthly" and "starter_yearly" arrive as two rows. Rendered
// one card each, the screen asked an admin to compare a tier against its own
// other billing cycle, and any count that wasn't a multiple of the grid left an
// orphan card alone on the last row. `planTiers()` groups them and the cycle
// moves to one toggle above the cards — which is the shape the public pricing
// page and the registration picker have always had.
//
// WHY THE BUTTON SITS ABOVE THE FEATURE LIST: feature lists are different
// lengths, so a button after them lands at a different height on every card.
// Above them, the name, the price and the action line up across the whole row
// whatever the server sends, and the list below reads as the reference it is.
// That is the only way this grid stays symmetrical without capping the list.
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
// A move between two cycles of the SAME tier is one of those two underneath —
// the server still decides — but it is labelled as the cycle switch it is,
// because "Move up" is a strange thing to read about the plan you are on.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { HiArrowCircleUp, HiBadgeCheck, HiCheck, HiClock, HiRefresh, HiSparkles } from "react-icons/hi";
import { isComingSoon, tierOf } from "../../../../shared/config/plans";
import { fmtDate } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import {
  CYCLE_LABEL, CYCLE_OPTIONS, bestSavingPct, featureName, planStanding, planTiers,
  seatLine, variantOf, yearlySaving,
} from "../billingMeta";
import { PRIMARY_BTN, SECONDARY_BTN } from "./billingUi";

/* The column count is a literal class string per size, never built by
   concatenation — Tailwind scans source text, so a composed class name never
   reaches the stylesheet. Four tiers is the common case and gets its own row;
   five or more wrap three to a row rather than squeezing. */
const GRID = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
};

/** Monthly / Yearly, in the house segmented-control shape (see FilterTabs). */
function CycleToggle({ value, onChange, saving }) {
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="Billing cycle">
      {CYCLE_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 ${active ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
          >
            {opt.label}
            {/* The saving rides on the Yearly tab rather than sitting beside
                the toggle, so it reads as a property of that choice. */}
            {opt.value === "yearly" && saving > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-violet-100 text-violet-700" : "bg-white/70 text-slate-500"}`}>
                save {saving}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({ tier, cycle, currentPlan, standing, scheduledCode, onChoose, onSchedule, periodEnd, busy }) {
  const plan = variantOf(tier, cycle);
  const isCurrent = standing === "current";
  const isScheduled = Boolean(scheduledCode) && plan.code === scheduledCode;
  const cheaper = standing === "down";
  const free = parseFloat(plan.amount) === 0;
  const saving = cycle === "yearly" ? yearlySaving(tier) : null;

  // Same tier, other cycle: the server still decides whether that is charged
  // now or queued, but calling it "Move up" would be nonsense on the plan the
  // organisation is already on.
  const cycleSwitch = Boolean(currentPlan)
    && tierOf(currentPlan.code) === tier.tier
    && plan.code !== currentPlan.code;

  const actionLabel = cycleSwitch
    ? (cycle === "yearly" ? "Switch to yearly" : "Switch to monthly")
    : isCurrent ? "Renew" : standing === "none" ? "Choose this plan" : "Move up";

  return (
    <article
      className={`relative flex flex-col rounded-2xl border bg-white p-5 transition ${
        isCurrent ? "border-purple-300 ring-2 ring-purple-100 shadow-sm"
          : isScheduled ? "border-fuchsia-200 ring-2 ring-fuchsia-50"
            : "border-slate-100 shadow-xs hover:border-purple-200 hover:shadow-sm"
      }`}
    >
      {/* A fixed-height strip whether or not there is a tag in it, so every
          card's name starts on the same line across the row. */}
      <div className="h-5 mb-1.5 flex items-center">
        {isCurrent ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white">
            <HiBadgeCheck className="w-3 h-3" /> Your plan
          </span>
        ) : isScheduled ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
            <HiClock className="w-3 h-3" /> Starting soon
          </span>
        ) : free ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
            <HiSparkles className="w-3 h-3" /> No charge
          </span>
        ) : null}
      </div>

      <h3 className="text-base font-bold text-slate-900 truncate">{tier.name}</h3>
      {/* Two lines reserved either way — an empty description must not pull the
          price up a line on one card and not on its neighbour. */}
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 min-h-[2rem] mt-1">
        {tier.description}
      </p>

      <div className="mt-4">
        <p className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[1.75rem] leading-none font-bold text-slate-900 tracking-tight">
            {free ? "Free" : formatMoney(plan.amount)}
          </span>
          {!free && CYCLE_LABEL[plan.billing_cycle] && (
            <span className="text-xs font-semibold text-slate-400">{CYCLE_LABEL[plan.billing_cycle]}</span>
          )}
        </p>
        {/* Reserved whether or not there is a saving, for the same reason the
            tag strip above is. */}
        <p className="min-h-[1.125rem] mt-1.5 text-[11px] leading-[1.125rem]">
          {saving ? (
            <span className="font-bold text-violet-700">Save {formatMoney(saving.saved)} against paying monthly</span>
          ) : (
            <span className="text-slate-400">{free ? "Free for as long as you like" : "for the whole workspace"}</span>
          )}
        </p>
      </div>

      {/* The action, at the same height on every card in the row. */}
      <div className="mt-4">
        {isScheduled ? (
          <p className="text-xs text-fuchsia-700 bg-fuchsia-50/70 border border-fuchsia-200 rounded-xl px-3.5 py-2.5 leading-relaxed text-center">
            Takes over on {fmtDate(periodEnd)}. Nothing to pay.
          </p>
        ) : cheaper ? (
          <button type="button" onClick={() => onSchedule(plan)} disabled={busy} className={`${SECONDARY_BTN} w-full`}>
            <HiClock className="w-4 h-4" /> {cycleSwitch ? actionLabel : "Switch"} from {fmtDate(periodEnd)}
          </button>
        ) : (
          <button type="button" onClick={() => onChoose(plan)} disabled={busy} className={`${PRIMARY_BTN} w-full`}>
            {isCurrent ? <HiRefresh className="w-4 h-4" /> : <HiArrowCircleUp className="w-4 h-4" />} {actionLabel}
          </button>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">What you get</p>
        <p className="text-xs text-slate-700 font-semibold mt-2 leading-relaxed">{seatLine(plan.limits)}</p>
        <ul className="mt-3 space-y-1.5">
          {(plan.feature_keys || []).map((key) => (
            <li key={key} className="flex items-start gap-1.5 text-xs text-slate-600">
              <HiCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
              <span>{featureName(key)}{isComingSoon(key) ? <span className="text-slate-400"> (coming soon)</span> : null}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.plans           #225 rows, flat — grouped into tiers here
 * @param {object} [props.currentPlan]     #226 `subscription.plan`
 * @param {string} [props.scheduledCode]   #226 `subscription.scheduled_change.plan_code`
 * @param {string} [props.periodEnd]       when a scheduled change would start
 * @param {"monthly"|"yearly"} props.cycle the billing-cycle toggle's position
 * @param {(cycle: string) => void} props.onCycleChange
 * @param {(plan: object) => void} props.onChoose
 * @param {(plan: object) => void} props.onSchedule
 * @param {boolean} [props.busy]
 * @param {React.ReactNode} [props.help]   the ⓘ for the toggle, placed by the page
 */
export default function PlanCatalogue({
  plans, currentPlan, scheduledCode, periodEnd, cycle, onCycleChange,
  onChoose, onSchedule, busy = false, help = null,
}) {
  const tiers = useMemo(() => planTiers(plans), [plans]);
  const saving = useMemo(() => bestSavingPct(tiers), [tiers]);
  // Nothing to toggle when no tier sells two cycles — a control with one
  // meaningful position is noise.
  const showToggle = tiers.some((t) => t.monthly.code !== t.yearly.code);

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
        No plans are on offer right now. Contact support and we’ll sort one out for you.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {showToggle && (
        <div className="flex items-center gap-2 flex-wrap">
          <CycleToggle value={cycle} onChange={onCycleChange} saving={saving} />
          {help}
        </div>
      )}

      <div className={`grid gap-4 items-stretch ${GRID[tiers.length] || GRID[3]}`}>
        {tiers.map((tier) => (
          <PlanCard
            key={tier.tier}
            tier={tier}
            cycle={cycle}
            currentPlan={currentPlan}
            standing={planStanding(variantOf(tier, cycle), currentPlan)}
            scheduledCode={scheduledCode}
            periodEnd={periodEnd}
            onChoose={onChoose}
            onSchedule={onSchedule}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}
