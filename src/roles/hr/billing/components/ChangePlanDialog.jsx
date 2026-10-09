// ─────────────────────────────────────────────────────────────────────────────
// ChangePlanDialog.jsx — "Here is what this costs, and here is what it does to
// your plan." The last screen before money moves.
//
// It is a DetailDialog, not a form (§3): there is nothing to fill in. The only
// input the whole purchase takes is the plan code, already chosen on the card
// behind this dialog, because the server refuses to be told a price (see
// billing.api.js). So this is a record inspector over the server's own quote,
// with the payment as its footer action.
//
// Everything shown comes from #238. Nothing is recomputed here — not the
// credit, not the amount due, not the period dates. The quote and the charge
// run the same function server side, so a figure we worked out ourselves could
// only ever disagree with what is about to be taken.
//
// `blocked_reason` is the reason this dialog exists at all. When the server
// says a change can't be made — too many people for the plan, a renewal too
// far ahead, a downgrade that has to be scheduled — the pay button is GONE,
// not disabled-with-a-tooltip, and the panel explains what to do instead. A
// button that 403s is the thing the plane-adapter rule exists to prevent (§2),
// and that applies just as much to a button that would 409.
// ─────────────────────────────────────────────────────────────────────────────

import {
  HiArrowCircleUp, HiCalendar, HiCheckCircle, HiCreditCard, HiExclamationCircle,
  HiInformationCircle, HiRefresh, HiUserGroup,
} from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable,
} from "../../../../shared/components/DetailDialog";
import { fmtDate } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import {
  intentConsequence, intentLabel, intentVerb, priceLabel, VIOLATION_ROLE_LABEL,
} from "../billingMeta";
import { Notice, PRIMARY_BTN, SECONDARY_BTN } from "./billingUi";


/* Why a change is refused, in words that say what to do next. The code is the
   same one #232 would have raised, so these are the only four that reach here. */
const BLOCKED_COPY = {
  SEAT_LIMIT_EXCEEDED: {
    title: "You have more people than this plan allows",
    body: "Move to a plan with room for everyone, or remove the people listed below first.",
  },
  RENEWAL_TOO_EARLY: {
    title: "It’s too soon to renew",
    body: "You can renew in the last fortnight before your plan ends, so you don’t pay for days twice.",
  },
  USE_SCHEDULED_DOWNGRADE: {
    title: "A cheaper plan starts later, not now",
    body: "You’ve already paid for this period, so a cheaper plan takes over when it ends. Schedule it from the plan card instead.",
  },
  PLAN_CHANGE_NOT_SUPPORTED: {
    title: "We can’t make this change for you automatically",
    body: "These two plans cost the same, so there’s nothing to charge or credit. Contact support and we’ll move you across.",
  },
};

/**
 * @param {object} props
 * @param {object} props.plan     the catalogue row being bought (#225)
 * @param {object} props.checkout the useBillingCheckout state and actions
 * @param {() => void} props.onClose
 */
export default function ChangePlanDialog({ plan, checkout, onClose }) {
  const {
    stage, quote, error, pending, waitSeconds, busy,
    confirm, resume, drop,
  } = checkout;

  const loading = stage === "previewing";
  const blocked = quote?.blocked_reason || null;
  const blockedCopy = blocked ? BLOCKED_COPY[blocked] : null;
  const violations = quote?.seat_check?.violations || [];
  const proration = quote?.proration || null;
  const settled = stage === "done";

  // An upgrade whose credit covers the whole cost: there is a change to make
  // but nothing to charge, so the button says so rather than "Pay ₹0".
  const nothingToPay = quote && quote.requires_payment === false;

  const amountDue = quote?.amount_due;

  /* ── The footer: one primary action, and it is never a button the server
     would refuse. Order matters — a pending gateway order outranks everything,
     because nothing else can be bought until it is paid or dropped. ── */
  const footer = (() => {
    if (settled) {
      return <button type="button" onClick={onClose} className={PRIMARY_BTN}><HiCheckCircle className="w-4 h-4" /> Done</button>;
    }
    if (pending?.order_id) {
      return (
        <>
          <DetailFooterNote>
            A payment for this organisation is already open. Finish it, or drop it to choose a different plan.
          </DetailFooterNote>
          <button type="button" onClick={drop} disabled={busy} className={SECONDARY_BTN}>Drop it</button>
          <button type="button" onClick={resume} disabled={busy} className={PRIMARY_BTN}>
            <HiCreditCard className="w-4 h-4" /> Pay now
          </button>
        </>
      );
    }
    if (blocked) {
      return (
        <>
          <DetailFooterNote>There’s nothing to pay — this change can’t be made as it stands.</DetailFooterNote>
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>Close</button>
        </>
      );
    }
    if (loading || !quote) {
      return <button type="button" onClick={onClose} className={SECONDARY_BTN}>Cancel</button>;
    }
    return (
      <>
        {waitSeconds ? (
          <DetailFooterNote>Too many attempts in the last hour. Try again in about {Math.ceil(waitSeconds / 60)} minute{Math.ceil(waitSeconds / 60) === 1 ? "" : "s"}.</DetailFooterNote>
        ) : null}
        <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
        <button type="button" onClick={() => confirm()} disabled={busy || Boolean(waitSeconds)} className={PRIMARY_BTN}>
          {stage === "paying" ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Opening payment…</>
            : stage === "verifying" || stage === "confirming" ? <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
              : nothingToPay ? <><HiArrowCircleUp className="w-4 h-4" /> Make this change</>
                : <><HiCreditCard className="w-4 h-4" /> {intentVerb(quote.intent)} {formatMoney(amountDue)}</>}
        </button>
      </>
    );
  })();

  return (
    <DetailDialog
      eyebrow={quote ? intentLabel(quote.intent) : "Plan change"}
      icon={quote?.intent === "renewal" ? HiRefresh : HiArrowCircleUp}
      title={plan?.name || "Change plan"}
      subtitle={priceLabel(plan?.amount, plan?.billing_cycle)}
      badge={quote ? <DetailPill tone={blocked ? "muted" : "solid"}>{blocked ? "Not available" : intentLabel(quote.intent)}</DetailPill> : null}
      loading={loading}
      width="medium"
      footer={footer}
      onClose={onClose}
    >
      {/* Settled. Say what happened, and stop offering to pay. */}
      {settled && (
        <Notice tone="info" icon={HiCheckCircle} title="Payment received">
          Your plan is active. The page behind this dialog has been refreshed.
        </Notice>
      )}

      {/* Waiting on the bank. Never styled as a failure — the webhook settles
          the same payment, so this is a wait, not a loss. */}
      {stage === "confirming" && (
        <Notice tone="warn" icon={HiInformationCircle} title="Payment received — confirming with the bank">
          This usually takes a few seconds. You can close this window; your plan will switch over on its own.
        </Notice>
      )}

      {error && !settled && (
        <Notice tone={pending?.order_id ? "warn" : "error"} icon={HiExclamationCircle}>{error}</Notice>
      )}

      {blockedCopy && (
        <Notice tone="error" icon={HiExclamationCircle} title={blockedCopy.title}>{blockedCopy.body}</Notice>
      )}

      {/* The numbers. `amount_due` is the headline because it is the only one
          the person is being asked to agree to. */}
      {quote && !blocked && (
        <DetailStats
          items={[
            {
              label: "To pay now",
              value: nothingToPay ? "Nothing" : formatMoney(amountDue),
              icon: HiCreditCard,
              hint: nothingToPay ? "Covered by what you’ve already paid" : "Including any credit below",
              help: { surface: "billing.plan_change", field: "amount_due" },
            },
            {
              label: "New plan",
              value: plan?.name,
              icon: HiArrowCircleUp,
              hint: priceLabel(plan?.amount, plan?.billing_cycle),
            },
            {
              label: "Paid up to",
              value: fmtDate(quote.new_period_end),
              icon: HiCalendar,
              hint: quote.intent === "upgrade" ? "Unchanged by moving up" : "When the next payment is due",
              help: { surface: "billing.plan_change", field: "new_period_end" },
            },
          ]}
        />
      )}

      {/* What paying actually does, in a sentence. The mechanism is in the
          grid below; this is the consequence (§6). */}
      {quote && !blocked && intentConsequence(quote.intent) && (
        <Notice tone="info" icon={HiInformationCircle}>{intentConsequence(quote.intent)}</Notice>
      )}

      {/* How the figure was reached. Folded away on a straight renewal, where
          there is no credit to explain and the headline says everything. */}
      {quote && !blocked && proration && (
        <DetailSection
          title="How this amount is worked out"
          icon={HiInformationCircle}
          defaultOpen={quote.intent === "upgrade"}
          help={{ surface: "billing.plan_change", field: "proration" }}
        >
          <DetailGrid
            cols={4}
            items={[
              {
                label: "Full plan price",
                value: formatMoney(proration.target_prorated ?? plan?.amount),
              },
              {
                label: "Credit for days left",
                value: proration.unused_credit ? `− ${formatMoney(proration.unused_credit)}` : "None",
                help: { surface: "billing.plan_change", field: "unused_credit" },
              },
              ["Days left on your plan", proration.remaining_days != null ? `${proration.remaining_days} of ${proration.period_days}` : null],
              ["To pay now", nothingToPay ? "Nothing" : formatMoney(amountDue)],
            ]}
          />
        </DetailSection>
      )}

      {/* Who is over the limit. Rows, not a sentence with numbers in it, so the
          admin can see exactly how many people have to go. */}
      {violations.length > 0 && (
        <DetailSection title="Over this plan’s limits" icon={HiUserGroup} collapsible={false}>
          <DetailTable
            columns={[
              { header: "Who", render: (v) => VIOLATION_ROLE_LABEL[v.role] || v.role },
              { header: "You have", render: (v) => v.used, align: "right" },
              { header: "This plan allows", render: (v) => v.limit, align: "right" },
              {
                header: "Over by",
                render: (v) => <span className="font-bold text-rose-600">{Math.max(0, Number(v.used) - Number(v.limit))}</span>,
                align: "right",
              },
            ]}
            rows={violations}
          />
        </DetailSection>
      )}
    </DetailDialog>
  );
}
