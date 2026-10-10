// ─────────────────────────────────────────────────────────────────────────────
// PlanDetailDialog.jsx — Everything about the plan in force, opened from the
// banner (#226 + the #225 row behind it).
//
// WHY THIS IS A DIALOG AND NOT THE PAGE. The benefit list and the three seat
// meters used to sit on Plan & Billing as two more cards, which pushed the
// plan catalogue — the thing people come here to act on — below the fold, to
// say things most visits don't need. They are reference, not action: you read
// them when you are deciding, and the banner is the obvious place to click
// when you want to know more about what you are on.
//
// It is a DetailDialog because that is the house record inspector (§3), and
// what this shows IS a record: one plan, its allowance, and how much of it is
// gone. There are no actions in it — changing plan is the catalogue's job, and
// the footer note says so rather than leaving an empty bar.
// ─────────────────────────────────────────────────────────────────────────────

import { HiBadgeCheck, HiCalendar, HiCash, HiCheck, HiRefresh, HiSparkles, HiUserGroup } from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailPill, DetailSection, DetailStats,
} from "../../../../shared/components/DetailDialog";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import { isComingSoon } from "../../../../shared/config/plans";
import {
  cycleEveryLabel, featureName, isFreePlan, paymentStatusMeta, priceLabel,
  seatLine, seatMeters, subscriptionStatusMeta,
} from "../billingMeta";
import { SeatMeter } from "./billingUi";

/**
 * @param {object} props
 * @param {object} props.subscription  #226 `subscription`
 * @param {object} [props.usage]
 * @param {object} [props.lastPayment]
 * @param {object[]} [props.plans]     #225 rows, for the benefit list
 * @param {() => void} props.onClose
 */
export default function PlanDetailDialog({ subscription: sub, usage, lastPayment, plans = [], onClose }) {
  const plan = sub?.plan || null;
  const statusMeta = subscriptionStatusMeta(sub?.status);
  const meters = seatMeters(usage);
  const free = isFreePlan(plan);
  const ending = Boolean(sub?.cancel_at_period_end);

  const catalogRow = plans.find((p) => p.code === plan?.code) || null;
  const features = catalogRow?.feature_keys || [];
  const limits = catalogRow?.limits || null;

  const lastPaymentWhen = !lastPayment
    ? "Nothing has been charged"
    : lastPayment.settled_at
      ? fmtDateTime(lastPayment.settled_at)
      : paymentStatusMeta(lastPayment.status).label;

  return (
    <DetailDialog
      eyebrow="Your plan"
      icon={HiBadgeCheck}
      title={plan?.name || "N/A"}
      subtitle={priceLabel(plan?.amount, plan?.billing_cycle)}
      badge={<DetailPill tone={sub?.is_entitled ? "solid" : "muted"}>{statusMeta.label}</DetailPill>}
      width="medium"
      onClose={onClose}
      footer={
        <DetailFooterNote>
          Nothing is changed from here — move between plans on the page behind this.
        </DetailFooterNote>
      }
    >
      <DetailStats
        items={[
          {
            label: ending ? "Ends on" : "Renews on",
            value: sub?.current_period_end ? fmtDate(sub.current_period_end) : "No end date",
            icon: HiCalendar,
            hint: sub?.days_remaining != null
              ? `${sub.days_remaining} day${sub.days_remaining === 1 ? "" : "s"} left`
              : "This plan doesn’t expire",
          },
          {
            label: "Charged",
            value: ending ? "Not again" : free ? "Never — this plan is free" : cycleEveryLabel(plan?.billing_cycle),
            icon: HiRefresh,
            hint: ending ? "You stopped it renewing" : free ? "No card is needed" : "On the renewal date above",
          },
          {
            label: "Last payment",
            value: lastPayment ? formatMoney(lastPayment.amount) : "None yet",
            icon: HiCash,
            hint: lastPaymentWhen,
          },
        ]}
      />

      {/* Seats first: they are the only part of this that can stop a plan
          change going through (#232 SEAT_LIMIT_EXCEEDED). */}
      <DetailSection title="People on this plan" icon={HiUserGroup} collapsible={false}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {meters.map((meter) => <SeatMeter key={meter.key} meter={meter} />)}
        </div>
        {limits && (
          <p className="text-[11px] text-slate-500 mt-4">This plan allows {seatLine(limits)}.</p>
        )}
        {meters.some((m) => m.over || m.full) && (
          <p className="text-[11px] text-slate-500 mt-2">
            A plan change is refused while you have more people than the new plan allows. Move up a plan, or remove people first.
          </p>
        )}
      </DetailSection>

      {/* Absent when the plan is no longer in the catalogue — a feature list
          we can't read is better missing than guessed (§7). */}
      {features.length > 0 && (
        <DetailSection title="What your plan includes" icon={HiSparkles} collapsible={false}>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
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
        </DetailSection>
      )}
    </DetailDialog>
  );
}
