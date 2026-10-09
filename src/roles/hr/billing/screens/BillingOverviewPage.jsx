// ─────────────────────────────────────────────────────────────────────────────
// BillingOverviewPage.jsx — "Plan & Billing": what the organisation is paying
// for, how much of it is being used, and how to change it (#225, #226, #232–
// #238).
//
// Contract: public/ref docs/md_money/phase1_api_analysis.md.
//
// HR-only, and not because of a UI decision: every billing endpoint but the
// plan catalogue is gated `authorize(HR_ONLY)`, and platform admins are
// refused too. So there is no manager twin of this screen and no `viewer`
// prop — §2's parity rule is about a capability two roles SHARE, and this one
// genuinely belongs to one. A manager has no billing page rather than a broken
// one.
//
// Why it is built this way:
//   · The page leads with ENTITLEMENT, not with the plan name. The one thing an
//     admin opening this screen needs to know is whether the workspace is about
//     to stop working, and `is_entitled` is the server's own verdict on that —
//     never recomputed here from status and dates.
//   · Seat meters are the second thing, because they are the reason a plan
//     change gets blocked (#232 SEAT_LIMIT_EXCEEDED) and an admin who can see
//     "98 of 100" coming is an admin who doesn't hit it mid-purchase.
//   · Every figure is the server's. No price, total, credit or renewal date is
//     computed on this page; `amount` fields arrive as decimal strings and go
//     straight to formatMoney (see billing.api.js).
//   · A cheaper plan is SCHEDULED, never bought. The catalogue card knows this,
//     so the page never opens a payment dialog for one.
//   · A cancellation scheduled for the period end is reversible (#236) and the
//     Undo sits next to the notice that announced it — the one place an admin
//     will look after a change of heart.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiBadgeCheck, HiCalendar, HiCash, HiCreditCard,
  HiExclamationCircle, HiReceiptTax, HiRefresh, HiUserGroup, HiXCircle,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { billingAPI, organizationAPI } from "../../../../shared/api";
import { ErrorState, Toast, useToast } from "../../../../shared/attendance/ui";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import { billingErrorMessage } from "../../../../shared/utils/billingErrors";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import {
  isFreePlan, priceLabel, seatMeters, subscriptionStatusMeta,
} from "../billingMeta";
import useBillingCheckout from "../useBillingCheckout";
import { DANGER_BTN, Notice, SECONDARY_BTN, SeatMeter } from "../components/billingUi";
import PlanCatalogue from "../components/PlanCatalogue";
import ChangePlanDialog from "../components/ChangePlanDialog";
import CancelPlanDialog from "../components/CancelPlanDialog";
import BillingNoticesCard from "../components/BillingNoticesCard";

const SURFACE = "billing.overview";

/** One headline tile. Same shape as the tiles on the document screens. */
function Tile({ label, value, hint, icon: Icon, help, tone = "text-purple-500", alert = false }) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 min-w-0 ${alert ? "bg-rose-50/40 border-rose-200" : "bg-white border-slate-100 shadow-xs"}`}>
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className={`w-4 h-4 shrink-0 ${alert ? "text-rose-500" : tone}`} />
        <span className="text-[11px] font-semibold truncate">
          {help ? <HelpLabel text={label} help={help} /> : label}
        </span>
      </div>
      <p className={`text-lg font-bold tracking-tight leading-tight mt-2 truncate ${alert ? "text-rose-700" : "text-slate-800"}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

export default function BillingOverviewPage() {
  const { toast, showToast, clearToast } = useToast();

  const [state, setState] = useState({ subscription: null, usage: null, lastPayment: null, loading: true, error: null });
  const [plans, setPlans] = useState([]);
  const [plansError, setPlansError] = useState(null);
  // Only for the two billing settings on PATCH /organizations/profile (#97,
  // #98). `null` means we haven't read it; a read that fails leaves it null and
  // the card simply isn't offered, rather than offering to save over values we
  // never saw (§7 — "nothing on file" and "couldn't load" are not the same).
  const [orgProfile, setOrgProfile] = useState(null);

  // Dialogs
  const [changing, setChanging] = useState(null);   // the plan being bought
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [acting, setActing] = useState(false);      // a cancel / undo / schedule write

  const loadSubscription = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await billingAPI.getSubscription();
      const data = res?.data || {};
      setState({
        subscription: data.subscription || null,
        usage: data.usage || null,
        lastPayment: data.last_payment || null,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState({ subscription: null, usage: null, lastPayment: null, loading: false, error });
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const res = await billingAPI.getPlans();
      setPlans(res?.data?.plans || []);
      setPlansError(null);
    } catch (error) {
      // The catalogue failing must not take the page down: the current plan and
      // the seat meters are still worth reading, and "couldn't load" has to be
      // distinguishable from "no plans on offer" (§7).
      setPlans([]);
      setPlansError(billingErrorMessage(error, "We couldn’t load the plans. Reload the page to try again."));
    }
  }, []);

  const loadOrgProfile = useCallback(async () => {
    try {
      const res = await organizationAPI.getOrganizationDetails();
      setOrgProfile(res?.data?.profile || null);
    } catch {
      // The notices card is the only thing that needs this, and it hides itself
      // when the read didn't land.
      setOrgProfile(null);
    }
  }, []);

  useEffect(() => { loadSubscription(); loadPlans(); loadOrgProfile(); }, [loadSubscription, loadPlans, loadOrgProfile]);

  const refresh = useCallback(() => { loadSubscription(); loadPlans(); }, [loadSubscription, loadPlans]);

  const checkout = useBillingCheckout({ onSettled: refresh, showToast });

  const { subscription: sub, usage, lastPayment, loading, error } = state;
  const plan = sub?.plan || null;
  const statusMeta = subscriptionStatusMeta(sub?.status);
  const meters = seatMeters(usage);
  const free = isFreePlan(plan);
  const scheduled = sub?.scheduled_change || null;

  /** Open the quote dialog for a plan, asking #238 before anything is charged. */
  const choosePlan = (nextPlan) => {
    setChanging(nextPlan);
    checkout.preview(nextPlan.code);
  };

  const closeChange = () => {
    setChanging(null);
    checkout.reset();
  };

  /** A cheaper plan can only be queued for the period boundary (#237). */
  const schedulePlan = async (nextPlan) => {
    const when = sub?.current_period_end ? fmtDate(sub.current_period_end) : "the end of this period";
    if (!(await window.confirm(
      `Switch to ${nextPlan.name} on ${when}?\n\nNothing is charged now, and your current plan keeps working until then. You can undo this before it starts.`
    ))) return;
    setActing(true);
    try {
      await billingAPI.scheduleChange(nextPlan.code);
      showToast(`${nextPlan.name} will take over on ${when}.`);
      refresh();
    } catch (err) {
      showToast(billingErrorMessage(err, "We couldn’t schedule that change."), "error");
    } finally {
      setActing(false);
    }
  };

  /** Drop a queued downgrade (#237 with a null plan code). */
  const clearSchedule = async () => {
    if (!(await window.confirm("Keep your current plan and cancel the scheduled switch?"))) return;
    setActing(true);
    try {
      await billingAPI.scheduleChange(null);
      showToast("The scheduled switch has been called off — you stay on your current plan.");
      refresh();
    } catch (err) {
      showToast(billingErrorMessage(err, "We couldn’t cancel that scheduled change."), "error");
    } finally {
      setActing(false);
    }
  };

  const submitCancellation = async ({ effective, reason, confirm }) => {
    setActing(true);
    setCancelError("");
    try {
      const res = await billingAPI.cancelSubscription({ effective, reason, confirm });
      setCancelling(false);
      // The server writes the sentence that explains what it did, and it is
      // more accurate than anything we could assemble from the flags.
      showToast(res?.data?.message || (effective === "immediate"
        ? "Your plan has ended and access has stopped."
        : "Your plan won’t renew. Everything keeps working until the period ends."));
      refresh();
    } catch (err) {
      setCancelError(billingErrorMessage(err, "We couldn’t cancel the plan. Try again."));
    } finally {
      setActing(false);
    }
  };

  /** Put a period-end cancellation back (#236). */
  const undoCancellation = async () => {
    setActing(true);
    try {
      await billingAPI.undoCancellation();
      showToast("Your plan will keep renewing as normal.");
      refresh();
    } catch (err) {
      showToast(billingErrorMessage(err, "We couldn’t restore the plan."), "error");
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <DashboardTopBar title="Plan & Billing" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-slate-900">Plan & Billing</h1>
              <FieldHelp surface={SURFACE} field="page" label="this page" className="mb-0 ml-1" />
            </div>
            <p className="text-sm text-slate-500 mt-1">
              What your organisation pays for, how much of it you’re using, and how to change it.
            </p>
          </div>
          <Link to="/dashboard/hr/billing/payments" className={SECONDARY_BTN}>
            <HiReceiptTax className="w-4 h-4" /> Payments & invoices
          </Link>
        </div>

        {loading ? (
          <Skeleton type="table" rows={6} />
        ) : error ? (
          <ErrorState error={error} onRetry={refresh} fallback="We couldn’t load your plan." />
        ) : !sub ? (
          <Notice tone="warn" title="No plan on file">
            This organisation has never had a subscription. Choose one below to switch the workspace on.
          </Notice>
        ) : (
          <>
            {/* ── Is the workspace about to stop working? ─────────────────── */}
            {!sub.is_entitled && (
              <Notice tone="error" title="Your workspace needs a plan">
                {statusMeta.meaning} Everyone can still sign in, but the paid features are off until a plan is active.
              </Notice>
            )}
            {sub.is_entitled && (sub.status === "in_grace" || sub.status === "past_due") && (
              <Notice tone="warn" title="Your plan has run out">
                We’ve kept everything on for a few more days{sub.grace_ends_at ? <> — until <span className="font-semibold">{fmtDate(sub.grace_ends_at)}</span></> : null}. Renew below to keep it that way.
              </Notice>
            )}

            {/* ── Scheduled cancellation, with its undo right beside it ───── */}
            {sub.cancel_at_period_end && (
              <Notice tone="warn" title="This plan is set to end">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-1">
                  <span className="min-w-0">
                    Everything keeps working until <span className="font-semibold">{fmtDate(sub.current_period_end)}</span>, then it won’t renew.
                  </span>
                  <button type="button" onClick={undoCancellation} disabled={acting} className={`${SECONDARY_BTN} shrink-0`}>
                    <HiRefresh className="w-4 h-4" /> Keep my plan
                  </button>
                </div>
              </Notice>
            )}

            {/* ── Scheduled downgrade ─────────────────────────────────────── */}
            {scheduled?.plan_code && (
              <Notice tone="info" title="A different plan is queued">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-1">
                  <span className="min-w-0">
                    {plans.find((p) => p.code === scheduled.plan_code)?.name || scheduled.plan_code} takes over on{" "}
                    <span className="font-semibold">{fmtDate(scheduled.effective_at || sub.current_period_end)}</span>. Nothing is charged before then.
                  </span>
                  <button type="button" onClick={clearSchedule} disabled={acting} className={`${SECONDARY_BTN} shrink-0`}>
                    <HiXCircle className="w-4 h-4" /> Call it off
                  </button>
                </div>
              </Notice>
            )}

            {/* ── The headline four ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <Tile
                label="Your plan"
                value={plan?.name || "N/A"}
                hint={priceLabel(plan?.amount, plan?.billing_cycle)}
                icon={HiBadgeCheck}
              />
              <Tile
                label="Status"
                value={statusMeta.label}
                hint={sub.is_entitled ? "Paid features are on" : "Paid features are off"}
                icon={HiCreditCard}
                alert={!sub.is_entitled}
                help={{ surface: SURFACE, field: "status" }}
              />
              <Tile
                label={sub.cancel_at_period_end ? "Ends on" : "Paid up to"}
                value={sub.current_period_end ? fmtDate(sub.current_period_end) : "No end date"}
                hint={sub.days_remaining != null
                  ? `${sub.days_remaining} day${sub.days_remaining === 1 ? "" : "s"} left`
                  : "This plan doesn’t expire"}
                icon={HiCalendar}
                help={{ surface: SURFACE, field: "current_period_end" }}
              />
              <Tile
                label="Last payment"
                value={lastPayment ? formatMoney(lastPayment.amount) : "None yet"}
                hint={lastPayment?.settled_at ? fmtDateTime(lastPayment.settled_at) : "Nothing has been charged"}
                icon={HiCash}
              />
            </div>

            {/* ── Seats ──────────────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center gap-2 mb-4">
                <HiUserGroup className="w-4 h-4 text-purple-500" />
                <h2 className="text-sm font-bold text-slate-800">People on this plan</h2>
                <FieldHelp surface={SURFACE} field="usage" label="how people are counted" className="mb-0" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {meters.map((meter) => <SeatMeter key={meter.key} meter={meter} />)}
              </div>
              {meters.some((m) => m.over || m.full) && (
                <p className="text-[11px] text-slate-500 mt-4 pt-3 border-t border-slate-100">
                  A plan change is refused while you have more people than the new plan allows. Move up a plan, or remove people first.
                </p>
              )}
            </section>
          </>
        )}

        {/* ── The catalogue ───────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-slate-900">
              {sub ? "Change your plan" : "Choose a plan"}
            </h2>
            <FieldHelp surface={SURFACE} field="plans" label="moving between plans" className="mb-0 ml-1" />
          </div>
          {plansError ? (
            <Notice tone="error">{plansError}</Notice>
          ) : (
            <PlanCatalogue
              plans={plans}
              currentPlan={plan}
              scheduledCode={scheduled?.plan_code}
              periodEnd={scheduled?.effective_at || sub?.current_period_end}
              onChoose={choosePlan}
              onSchedule={schedulePlan}
              busy={acting || checkout.busy}
            />
          )}
        </section>

        {/* ── Who hears about invoices and renewals (#97, #98) ───────────── */}
        {orgProfile && (
          <BillingNoticesCard
            profile={orgProfile}
            onSaved={(details) => setOrgProfile(details?.profile || orgProfile)}
            showToast={showToast}
          />
        )}

        {/* ── Leaving. Absent for a free plan, which has nothing to stop. ── */}
        {sub && sub.is_entitled && !free && !sub.cancel_at_period_end && (
          <section className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800">Thinking of leaving?</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                You can stop the plan renewing and keep everything working until the period you’ve paid for runs out.
              </p>
            </div>
            <button type="button" onClick={() => { setCancelError(""); setCancelling(true); }} disabled={acting} className={`${DANGER_BTN} shrink-0`}>
              <HiExclamationCircle className="w-4 h-4" /> Cancel my plan
            </button>
          </section>
        )}
      </main>

      {changing && (
        <ChangePlanDialog plan={changing} checkout={checkout} onClose={closeChange} />
      )}

      {cancelling && (
        <CancelPlanDialog
          periodEnd={sub?.current_period_end}
          busy={acting}
          error={cancelError}
          onSubmit={submitCancellation}
          onClose={() => setCancelling(false)}
        />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
