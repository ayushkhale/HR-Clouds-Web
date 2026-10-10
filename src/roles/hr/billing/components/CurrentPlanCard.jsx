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
  HiBadgeCheck, HiCalendar, HiCash, HiChevronRight, HiExclamationCircle,
  HiRefresh, HiSparkles,
} from "react-icons/hi";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";

import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import {
  CYCLE_LABEL, cycleEveryLabel, isFreePlan, paymentStatusMeta, rankArtFor,
  seatMeters, seatUsageLine, subscriptionStatusMeta,
} from "../billingMeta";
import { BillingBadge } from "./billingUi";

const HERO = "bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95]";
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
  onCancel, onOpenDetail, busy = false, surface,
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


  // When the last payment happened, or — failing a date — what became of it.
  const lastPaymentWhen = !lastPayment
    ? "Nothing has been charged"
    : lastPayment.settled_at
      ? fmtDateTime(lastPayment.settled_at)
      : paymentStatusMeta(lastPayment.status).label;

  // Which rank mark this plan earns, from its position among the paid tiers
  // of the live catalogue (billingMeta). Null when the plan is no longer on
  // sale, and the banner then renders without art rather than guessing.
  const art = rankArtFor(plan?.code, plans);

  return (
    <div className="space-y-4">
      {/* `plan-card-enter` runs once per mount — the "it arrived" moment, not
          a loop. The sheen rides inside it and only on the premium skin,
          where there is a gradient for it to catch. */}
      <section className={`relative rounded-2xl overflow-hidden plan-card-enter ${premium ? `${HERO} shadow-sm` : "bg-white border border-slate-100 shadow-xs"}`}>
        {premium && <span className="plan-sheen z-20" aria-hidden="true" />}
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
              {/* What is USED, not what is allowed: the allowance is what they
                  bought and already know; how close they are to it is what
                  they came to check. The full meters are in the dialog. */}
              <p className={`text-sm mt-1.5 ${premium ? "text-purple-100/90" : "text-slate-500"}`}>
                {seatUsageLine(meters)}
              </p>
            </div>

            {/* The rank mark, the same way the three dashboards carry their
                PageHeader art: a remote URL, sized by HEIGHT so a different
                asset letterboxes rather than resizing the banner, and hidden
                from screen readers because it says nothing the heading and
                the price don't already say. It rides only on the premium
                banner — a rank over a free or lapsed plan would be claiming
                something. Hidden below `sm`, where the width belongs to the
                words. Which mark it is comes from `rankArtFor` above. */}
            {/* Centred on the CARD, not between its two text blocks: absolute
                so the rank sits on the banner's midline however long the plan
                name or the price happens to be. Only from `lg`, because below
                that the words need the whole width and a mark floating over
                them would be in the way. `key` on the src so swapping rank
                restarts the shine rather than leaving it mid-sweep. */}
            {premium && art && (
              <div
                key={art}
                aria-hidden="true"
                className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
              >
                <div className="relative overflow-hidden">
                  <img
                    src={art}
                    alt=""
                    className="h-28 xl:h-32 w-auto object-contain drop-shadow-2xl"
                  />
                  <span className="plan-medal-shine" />
                </div>
              </div>
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
              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                {/* The benefit list and the seat meters used to be two more
                    cards on the page. They are reference, read while deciding
                    rather than on every visit, so they moved behind this. */}
                <button type="button" onClick={onOpenDetail} className={premium ? HERO_BTN : PLAIN_BTN}>
                  Plan details <HiChevronRight className="w-3.5 h-3.5" />
                </button>
                {canCancel && (
                  <button type="button" onClick={onCancel} disabled={busy} className={premium ? HERO_BTN : PLAIN_BTN}>
                    <HiExclamationCircle className="w-3.5 h-3.5" /> Cancel plan
                  </button>
                )}
              </div>
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
            // The settled date is the nicest answer, but it is NOT reliably
            // present: the live API returns rows with `status: "success"` and
            // `settled_at: null`, and the old wording then printed "Nothing
            // has been charged" directly beneath the amount that had been
            // charged. The status is the thing we can always trust, so it is
            // the fallback — never a sentence that contradicts the figure
            // above it.
            hint={lastPaymentWhen}
          />
        </dl>
      </section>
    </div>
  );
}
