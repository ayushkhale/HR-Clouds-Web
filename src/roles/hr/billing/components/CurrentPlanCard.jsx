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
// EVERY PLAN WEARS THE PURPLE BANNER AND A RANK MARK — free, paid, private,
// lapsed, cancelled, no exceptions (user decision, 14 Oct 2026: "show it no
// matter what"). The card renders on the house hero gradient, the same tokens
// PageHeader uses (§5 — not a new colour), and `rankArtFor` always returns a
// mark. There is no plain variant any more; don't reintroduce one.
//
// THIS REVERSED TWO EARLIER DECISIONS, so that a later reader doesn't "fix" it
// back to what the comment here used to say. The banner was once reserved for
// `is_entitled && !free`, on the reasoning that dressing up a free plan sells
// the customer something they have not bought, and that a premium banner over
// a workspace whose paid features are off is a lie the rest of the page then
// has to correct. Both arguments stand on their own; they were overruled in
// favour of one consistent plan card. The STATUS PILL is what still tells the
// truth about a lapsed or ending plan, so keep it prominent.
//
// `is_entitled` is the server's own verdict and is never recomputed here. It
// no longer decides the skin, but it is still what the status pill and the
// cancel gate are built on.
//
// A ₹0 PLAN IS NOT NECESSARILY THE FREE TIER. An internal or negotiated plan
// arrives as `amount: "0.00"` on `billing_cycle: "lifetime"` — the same shape
// as the public `free` row — so this card asks `isFreeTier(plan, plans)`,
// which also checks the plan is in the #225 catalogue, before it says "Free"
// or "No card is needed". `isFreePlan` alone called a negotiated plan free.
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
  HiRefresh,
} from "react-icons/hi";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";

import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import {
  CYCLE_LABEL, cycleEveryLabel, isFreeTier, paymentStatusMeta, rankArtFor,
  seatMeters, seatUsageLine, subscriptionStatusMeta,
} from "../billingMeta";

const HERO = "bg-gradient-to-r from-[#5B21B6] via-[#6328D7] to-[#4C1D95]";
const HERO_BTN = "px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-white/15 border border-white/25 hover:bg-white/25 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 backdrop-blur-sm";

/** One cell on the facts strip — label over value, with an optional second line. */
function Fact({ icon: Icon, label, value, hint, help }) {
  return (
    <div className="px-5 sm:px-6 py-4 min-w-0">
      <div className="flex items-center gap-1.5 text-purple-200/80">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider truncate">
          {help ? <HelpLabel text={label} help={help} /> : label}
        </span>
      </div>
      <p className="text-sm font-bold mt-1.5 truncate text-white">{value}</p>
      {hint && <p className="text-[11px] mt-0.5 truncate text-purple-200/70">{hint}</p>}
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
  // The free TIER, not merely a ₹0 plan — an internal or negotiated plan looks
  // identical on amount and cycle, and is not free (billingMeta).
  const freeTier = isFreeTier(plan, plans);
  const ending = Boolean(sub?.cancel_at_period_end);
  // A plan that is never charged again, free tier or not. Both kinds arrive on
  // `billing_cycle: "lifetime"`, and neither has a renewal date to point at.
  const lifetime = String(plan?.billing_cycle || "").toLowerCase() === "lifetime";


  // When the last payment happened, or — failing a date — what became of it.
  const lastPaymentWhen = !lastPayment
    ? "Nothing has been charged"
    : lastPayment.settled_at
      ? fmtDateTime(lastPayment.settled_at)
      : paymentStatusMeta(lastPayment.status).label;

  // Which rank mark this plan earns, from its position in the live catalogue
  // (billingMeta). Never null: a plan the catalogue doesn't carry — private,
  // internal or withdrawn — wears the top mark.
  const art = rankArtFor(plan?.code, plans);

  return (
    <div className="space-y-4">
      {/* `plan-card-enter` runs once per mount — the "it arrived" moment, not
          a loop. The sheen rides inside it, over the gradient that is now
          always there for it to catch. */}
      <section className={`relative rounded-2xl overflow-hidden plan-card-enter ${HERO} shadow-sm`}>
        <span className="plan-sheen z-20" aria-hidden="true" />
        {/* ── Identity, price, and the two actions ────────────────────────── */}
        <div className="p-5 sm:p-6 relative">
          <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* THE RANK MARK SITS LEFT OF THE WORDS (user instruction, 14 Oct
                2026). It used to be absolutely centred on the banner, which
                only worked from `lg`: below that it would have floated over
                the plan name, so it was hidden — and the mark this card is
                supposed to always show vanished on a phone. In flow, first in
                the row, it is there at every width and the banner no longer
                has to keep a hole in its middle for it.

                Sized by HEIGHT so a different asset letterboxes rather than
                resizing the row, and hidden from screen readers because it
                says nothing the heading and the price don't already say.
                `rankArtFor` never returns null, so there is no "no mark" case
                left to guard.

                NO ANIMATION ON IT. A looping glint on a mark that is always on
                screen reads as something asking to be clicked; the card's
                one-time entrance carries the arrival, and the mark just sits
                there being the mark. */}
            {art && (
              <img
                key={art}
                src={art}
                alt=""
                aria-hidden="true"
                className="shrink-0 self-start sm:self-auto h-16 sm:h-20 lg:h-24 w-auto object-contain drop-shadow-2xl pointer-events-none select-none"
              />
            )}

            <div className="min-w-0 flex-1">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-200">
                <HiBadgeCheck className="w-3.5 h-3.5" />
                Your plan
              </p>
              <div className="flex items-center flex-wrap gap-2.5 mt-1.5">
                <h2 className="text-2xl font-bold tracking-tight truncate text-white">
                  {plan?.name || "N/A"}
                </h2>
                {/* The house badge would fight the gradient, so the status
                    reads as a light pill. Same words. It is now the ONLY
                    thing on the card that distinguishes an active plan from a
                    lapsed or ending one, since the skin no longer does — so
                    it stays beside the name, not tucked into the facts. */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/25 text-[10px] font-bold text-white whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-300" aria-hidden="true" />
                  {statusMeta.label}
                </span>
                <FieldHelp
                  surface={surface}
                  field="status"
                  label="this status"
                  tone="onDark"
                  className="mb-0"
                />
              </div>
              {/* What is USED, not what is allowed: the allowance is what they
                  bought and already know; how close they are to it is what
                  they came to check. The full meters are in the dialog. */}
              <p className="text-sm mt-1.5 text-purple-100/90">
                {seatUsageLine(meters)}
              </p>
            </div>

            {/* The price, given the weight it has on a bill rather than being
                folded into a sentence. `priceLabel` carries the period word,
                so it is split here to set the number apart from it. */}
            <div className="flex flex-col sm:items-end gap-3 shrink-0">
              <p className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight text-white">
                  {/* "Free" only for the tier that IS free. A negotiated plan
                      at ₹0 shows its own figure — calling it free would be a
                      statement about a deal we don't know the terms of. */}
                  {freeTier ? "Free" : formatMoney(plan?.amount)}
                </span>
                {!freeTier && CYCLE_LABEL[String(plan?.billing_cycle || "").toLowerCase()] && (
                  <span className="text-xs font-semibold text-purple-200/80">
                    {CYCLE_LABEL[String(plan.billing_cycle).toLowerCase()]}
                  </span>
                )}
              </p>
              {/* Absent, not disabled, when the server wouldn't allow it (§2):
                  a ₹0 plan has nothing to stop (#235 CANNOT_CANCEL_FREE_PLAN)
                  and an already-cancelled one has nothing to cancel twice.
                  The gate is the page's (`canCancel`), which still uses
                  `isFreePlan` — the server refuses on the AMOUNT, not on
                  whether the plan was public, so an internal ₹0 plan is
                  correctly uncancellable here too. */}
              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                {/* The benefit list and the seat meters used to be two more
                    cards on the page. They are reference, read while deciding
                    rather than on every visit, so they moved behind this. */}
                <button type="button" onClick={onOpenDetail} className={HERO_BTN}>
                  Plan details <HiChevronRight className="w-3.5 h-3.5" />
                </button>
                {canCancel && (
                  <button type="button" onClick={onCancel} disabled={busy} className={HERO_BTN}>
                    <HiExclamationCircle className="w-3.5 h-3.5" /> Cancel plan
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── The three supporting facts, on one strip. ──────────────────── */}
        <dl className="grid grid-cols-1 sm:grid-cols-3 border-t border-white/15 divide-white/15 bg-black/10 divide-y sm:divide-y-0 sm:divide-x">
          <Fact
            icon={HiCalendar}
            label={ending ? "Ends on" : "Renews on"}
            value={sub?.current_period_end ? fmtDate(sub.current_period_end) : "No end date"}
            hint={sub?.days_remaining != null
              ? `${sub.days_remaining} day${sub.days_remaining === 1 ? "" : "s"} left`
              : "This plan doesn’t expire"}
            help={{ surface, field: "current_period_end" }}
          />
          <Fact
            icon={HiRefresh}
            label="Charged"
            // A plan set to end is not going to be charged again, and saying
            // "Every month" there would be a promise we have already undone.
            value={ending ? "Not again" : cycleEveryLabel(plan?.billing_cycle)}
            // Three different reasons nothing is coming, and each one has to
            // agree with the "Renews on" fact beside it. A lifetime plan has
            // no renewal date at all, so pointing at one ("On the renewal date
            // above") contradicted the "No end date" printed next to it.
            hint={ending
              ? "You stopped it renewing"
              : freeTier
                ? "No card is needed"
                : lifetime
                  ? "Nothing further is charged"
                  : "On the renewal date above"}
          />
          <Fact
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
