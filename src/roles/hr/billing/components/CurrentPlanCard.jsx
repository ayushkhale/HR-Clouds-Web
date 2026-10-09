// ─────────────────────────────────────────────────────────────────────────────
// CurrentPlanCard.jsx — "What you are on, what it gives you, and how much of
// it you are using" (#226), as the one thing this page opens with.
//
// It replaces four identical headline tiles and a separate seat section. Those
// five boxes gave equal visual weight to the plan's name, its status, its
// renewal date, the last payment and the meters — five answers to a question
// nobody asked in that order. An admin opening this screen wants one thing
// first ("is the workspace fine?"), one thing second ("how close am I to the
// limits?"), and the actions within reach of both.
//
// WHY THE PAID BANNER IS PURPLE AND THE FREE ONE IS NOT. A customer who is
// paying should be able to see that they are, at a glance — the same reason a
// membership tier gets its own skin rather than a line of text. So an entitled
// paid plan renders on the house hero gradient (the same tokens PageHeader
// uses, §5 — not a new colour), and everything else renders plain:
//   · a FREE plan is plain, because dressing it up would sell the customer
//     something they have not bought, and
//   · a LAPSED plan is plain, because a premium banner over a workspace whose
//     paid features are off is a lie the rest of the page then has to correct.
// `is_entitled` is the server's own verdict and is never recomputed here.
//
// The actions live in this card, not at the foot of the page. Cancelling used
// to sit below the plan catalogue, which put the most consequential control on
// the screen furthest from the thing it acts on.
//
// Nothing here is computed: `is_entitled`, `days_remaining` and every amount
// are the server's. The benefit list is read from the live catalogue row that
// matches the subscription's plan code, and is simply absent when there is no
// match (§7 — gate on what the server returned, never invent a feature list).
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiBadgeCheck, HiCalendar, HiCash, HiCheck, HiExclamationCircle,
  HiRefresh, HiSparkles, HiUserGroup,
} from "react-icons/hi";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import { isComingSoon } from "../../../../shared/config/plans";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import {
  CYCLE_LABEL, cycleEveryLabel, featureName, isFreePlan, seatLine, seatMeters,
  subscriptionStatusMeta,
} from "../billingMeta";
import { BillingBadge, SeatMeter } from "./billingUi";

const HERO = "bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95]";

/* The membership mark on the premium banner. A remote URL, matching how all
   three dashboards supply their PageHeader art — swapping it for a local
   asset is fine, but do it for all four at once rather than leaving the app
   with two conventions. It is decoration: if it 404s the banner is unchanged
   apart from a gap, because the layout sizes it rather than being sized by it. */
const ART = "https://cdn3d.iconscout.com/3d/premium/thumb/rank-silver-3d-icon-png-download-10163266.png";
const HERO_BTN = "px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-white/15 border border-white/25 hover:bg-white/25 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 backdrop-blur-sm";
const PLAIN_BTN = "px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5";

/** One cell on the facts strip — label over value, with an optional second line. */
function Fact({ icon: Icon, label, value, hint, help, premium }) {
  return (
    <div className="px-5 sm:px-6 py-4 min-w-0">
      <div className={`flex items-center gap-1.5 ${premium ? "text-purple-200/80" : "text-slate-400"}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider truncate">
          {help ? <HelpLabel text={label} help={help} /> : label}
        </span>
      </div>
      <p className={`text-sm font-bold mt-1.5 truncate ${premium ? "text-white" : "text-slate-800"}`}>{value}</p>
      {hint && <p className={`text-[11px] mt-0.5 truncate ${premium ? "text-purple-200/70" : "text-slate-500"}`}>{hint}</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.subscription  #226 `subscription`
 * @param {object} [props.usage]       #226 `usage`
 * @param {object} [props.lastPayment] #226 `last_payment`
 * @param {object[]} [props.plans]     #225 rows, for this plan's benefit list
 * @param {boolean} [props.canCancel]  the server-shaped gate from the page
 * @param {() => void} [props.onCancel]
 * @param {boolean} [props.busy]
 * @param {string} props.surface       the field-help surface id of the host page
 */
export default function CurrentPlanCard({
  subscription: sub, usage, lastPayment, plans = [], canCancel = false,
  onCancel, busy = false, surface,
}) {
  const plan = sub?.plan || null;
  const statusMeta = subscriptionStatusMeta(sub?.status);
  const meters = seatMeters(usage);
  const free = isFreePlan(plan);
  const ending = Boolean(sub?.cancel_at_period_end);

  // The premium skin is for a paying customer whose features are actually on.
  const premium = Boolean(sub?.is_entitled) && !free;

  // The live catalogue row behind this subscription, for what the plan gives
  // them. No match (a plan withdrawn from sale) simply means no list.
  const catalogRow = plans.find((p) => p.code === plan?.code) || null;
  const features = catalogRow?.feature_keys || [];
  const limits = catalogRow?.limits || null;

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl overflow-hidden ${premium ? `${HERO} shadow-sm` : "bg-white border border-slate-100 shadow-xs"}`}>
        {/* ── Identity, price, and the two actions ────────────────────────── */}
        <div className={`p-5 sm:p-6 ${premium ? "relative" : ""}`}>
          {premium && (
            <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          )}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${premium ? "text-purple-200" : "text-purple-600"}`}>
                {premium ? <HiBadgeCheck className="w-3.5 h-3.5" /> : <HiSparkles className="w-3.5 h-3.5" />}
                Your plan
              </p>
              <div className="flex items-center flex-wrap gap-2.5 mt-1.5">
                <h2 className={`text-2xl font-bold tracking-tight truncate ${premium ? "text-white" : "text-slate-900"}`}>
                  {plan?.name || "N/A"}
                </h2>
                {/* On the banner the badge would fight the gradient, so the
                    status reads as a light pill there and as the house badge
                    on the plain card. Same words either way. */}
                {premium ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-[10px] font-bold text-white whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-300" aria-hidden="true" />
                    {statusMeta.label}
                  </span>
                ) : (
                  <BillingBadge meta={statusMeta} />
                )}
                <FieldHelp
                  surface={surface}
                  field="status"
                  label="this status"
                  tone={premium ? "onDark" : "default"}
                  className="mb-0"
                />
              </div>
              {limits && (
                <p className={`text-sm mt-1.5 ${premium ? "text-purple-100/90" : "text-slate-500"}`}>
                  {seatLine(limits)}
                </p>
              )}
            </div>

            {/* Decorative art, the same way the three dashboards carry theirs
                in PageHeader: a remote URL, sized by HEIGHT so a different
                asset letterboxes rather than resizing the banner, and hidden
                from screen readers because it says nothing the heading
                doesn't. It rides only on the premium banner — a tier badge
                over a free or lapsed plan would be claiming something. Hidden
                below `sm`, where the width belongs to the words. */}
            {premium && (
              <img
                src={ART}
                alt=""
                aria-hidden="true"
                className="hidden sm:block shrink-0 h-20 md:h-24 w-auto object-contain drop-shadow-2xl select-none pointer-events-none"
              />
            )}

            {/* The price, given the weight it has on a bill rather than being
                folded into a sentence. `priceLabel` carries the period word,
                so it is split here to set the number apart from it. */}
            <div className="flex flex-col sm:items-end gap-3 shrink-0">
              <p className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-bold tracking-tight ${premium ? "text-white" : "text-slate-900"}`}>
                  {free ? "Free" : formatMoney(plan?.amount)}
                </span>
                {!free && CYCLE_LABEL[String(plan?.billing_cycle || "").toLowerCase()] && (
                  <span className={`text-xs font-semibold ${premium ? "text-purple-200/80" : "text-slate-400"}`}>
                    {CYCLE_LABEL[String(plan.billing_cycle).toLowerCase()]}
                  </span>
                )}
              </p>
              {/* Absent, not disabled, when the server wouldn't allow it (§2):
                  a free plan has nothing to stop (#235 CANNOT_CANCEL_FREE_PLAN)
                  and an already-cancelled one has nothing to cancel twice. */}
              {canCancel && (
                <button type="button" onClick={onCancel} disabled={busy} className={premium ? HERO_BTN : PLAIN_BTN}>
                  <HiExclamationCircle className="w-3.5 h-3.5" /> Cancel plan
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── The three supporting facts, on one strip. ──────────────────── */}
        <dl className={`grid grid-cols-1 sm:grid-cols-3 border-t ${premium ? "border-white/15 divide-white/15 bg-black/10" : "border-slate-100 divide-slate-100"} divide-y sm:divide-y-0 sm:divide-x`}>
          <Fact
            premium={premium}
            icon={HiCalendar}
            label={ending ? "Ends on" : "Renews on"}
            value={sub?.current_period_end ? fmtDate(sub.current_period_end) : "No end date"}
            hint={sub?.days_remaining != null
              ? `${sub.days_remaining} day${sub.days_remaining === 1 ? "" : "s"} left`
              : "This plan doesn’t expire"}
            help={{ surface, field: "current_period_end" }}
          />
          <Fact
            premium={premium}
            icon={HiRefresh}
            label="Charged"
            // A plan set to end is not going to be charged again, and saying
            // "Every month" there would be a promise we have already undone.
            value={ending ? "Not again" : free ? "Never — this plan is free" : cycleEveryLabel(plan?.billing_cycle)}
            hint={ending ? "You stopped it renewing" : free ? "No card is needed" : "On the renewal date above"}
          />
          <Fact
            premium={premium}
            icon={HiCash}
            label="Last payment"
            value={lastPayment ? formatMoney(lastPayment.amount) : "None yet"}
            hint={lastPayment?.settled_at ? fmtDateTime(lastPayment.settled_at) : "Nothing has been charged"}
          />
        </dl>
      </section>

      {/* ── What it gives you, and how much of it is left ─────────────────── */}
      <div className={`grid gap-4 ${features.length > 0 ? "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {features.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
            <div className="flex items-center gap-2 mb-3.5">
              <HiSparkles className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-bold text-slate-800">What your plan includes</h3>
            </div>
            <ul className="space-y-2">
              {features.map((key) => (
                <li key={key} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-violet-50 text-violet-600 inline-flex items-center justify-center">
                    <HiCheck className="w-3 h-3" />
                  </span>
                  <span>
                    {featureName(key)}
                    {isComingSoon(key) ? <span className="text-slate-400"> (coming soon)</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Seats sit beside the benefits because they are the limit ON them,
            and the reason a plan change gets refused (#232). */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
          <div className="flex items-center gap-2 mb-4">
            <HiUserGroup className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-bold text-slate-800">People on this plan</h3>
            <FieldHelp surface={surface} field="usage" label="how people are counted" className="mb-0" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-7">
            {meters.map((meter) => <SeatMeter key={meter.key} meter={meter} />)}
          </div>
          {meters.some((m) => m.over || m.full) && (
            <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-100">
              A plan change is refused while you have more people than the new plan allows. Move up a plan, or remove people first.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
