// ─────────────────────────────────────────────────────────────────────────────
// BillingPaymentsPage.jsx — "Payments & Invoices": every rupee this
// organisation has paid us, with its tax invoice (#229, #230, #231), plus the
// two ledgers behind it — the plans it has held (#227) and the billing audit
// trail (#228).
//
// Contract: public/ref docs/md_money/phase1_api_analysis.md.
//
// Why this shape:
//   · A table, because this IS tabular — who/when/how much/what state is
//     exactly what §3's list rule describes, and the breakdown, refunds and
//     invoice belong in the record inspector behind the row.
//   · The ROW opens the payment; there is no View button and no eye icon (§3).
//     The only real action a payment has is none: a settled payment can't be
//     altered from a screen, and the dialog's footer note says so rather than
//     leaving an empty footer.
//   · No Actions column at all, because no row has an action — §5 says drop it
//     rather than render a column of empty cells.
//   · The two ledgers are collapsed by default with their totals in the title.
//     They are the "what happened to our subscription" reads an admin needs
//     about twice a year, and open they would bury the payments.
//   · `invoice_number` is the one identifier shown anywhere in this module.
//     It is not a database id — it is the statutory serial a finance team
//     quotes back at us, so §4's rule is satisfied, not bent.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  HiBadgeCheck, HiChevronDown, HiChevronLeft, HiChevronRight, HiClipboardList,
  HiDocumentText,
} from "react-icons/hi";
import { Link } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import Skeleton from "../../../../shared/components/Skeleton";
import { billingAPI } from "../../../../shared/api";
import { ErrorState, FilterTabs, Pagination } from "../../../../shared/attendance/ui";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import { billingErrorMessage } from "../../../../shared/utils/billingErrors";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import {
  eventLabel, intentLabel, PAYMENT_FILTERS, paymentStatusMeta, subscriptionStatusMeta,
} from "../billingMeta";
import { BillingBadge, Notice, SECONDARY_BTN } from "../components/billingUi";
import PaymentDetailDialog from "../components/PaymentDetailDialog";

const SURFACE = "billing.payments";
const PAGE = 20;
const LEDGER_PAGE = 20;

/** A collapsible ledger card — the two reads nobody opens every day. */
function Ledger({ title, icon: Icon, count, help, children, open, onToggle }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer group"
        >
          <Icon className="w-4 h-4 shrink-0 text-purple-500" />
          <span className="text-sm font-bold text-slate-800 group-hover:text-purple-700 transition truncate">
            {title}
          </span>
          {/* The count as a pill rather than "(2)" in the heading: it is a fact
              about the contents, not part of what the section is called. */}
          {count != null && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold tabular-nums">
              {count}
            </span>
          )}
          <HiChevronDown
            className={`ml-auto w-4 h-4 shrink-0 text-slate-400 group-hover:text-purple-600 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {/* Beside the fold toggle, never inside it: a button in a button is
            invalid and the click would fold the card (FieldHelp.jsx). */}
        {help && <FieldHelp surface={SURFACE} field={help} className="mb-0" />}
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

export default function BillingPaymentsPage() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null });
  const [selected, setSelected] = useState(null);

  // The two ledgers load only when opened — nobody pays for a read they didn't ask for.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState({ rows: [], total: null, loading: false, error: null });
  const [eventsOpen, setEventsOpen] = useState(false);
  const [events, setEvents] = useState({ rows: [], total: null, loading: false, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await billingAPI.getPayments({
        // "refunded" covers both fully and partly refunded rows, which is how
        // an admin thinks about it — two tabs for that would be noise.
        status: filter === "refunded" ? ["refunded", "partially_refunded"] : filter || undefined,
        limit: PAGE,
        offset: (page - 1) * PAGE,
      });
      const data = res?.data || {};
      setState({ rows: data.rows || [], total: data.count ?? (data.rows?.length || 0), loading: false, error: null });
    } catch (error) {
      setState({ rows: [], total: 0, loading: false, error });
    }
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  const loadHistory = useCallback(async () => {
    setHistory((h) => ({ ...h, loading: true, error: null }));
    try {
      const res = await billingAPI.getSubscriptionHistory({ limit: LEDGER_PAGE });
      const data = res?.data || {};
      setHistory({ rows: data.rows || [], total: data.count ?? null, loading: false, error: null });
    } catch (error) {
      setHistory({ rows: [], total: null, loading: false, error: billingErrorMessage(error, "We couldn’t load your plan history.") });
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEvents((e) => ({ ...e, loading: true, error: null }));
    try {
      const res = await billingAPI.getSubscriptionEvents({ limit: LEDGER_PAGE });
      const data = res?.data || {};
      setEvents({ rows: data.rows || [], total: data.count ?? null, loading: false, error: null });
    } catch (error) {
      setEvents({ rows: [], total: null, loading: false, error: billingErrorMessage(error, "We couldn’t load the billing activity.") });
    }
  }, []);

  const toggleHistory = () => {
    setHistoryOpen((open) => {
      if (!open && !history.rows.length && !history.error) loadHistory();
      return !open;
    });
  };

  const toggleEvents = () => {
    setEventsOpen((open) => {
      if (!open && !events.rows.length && !events.error) loadEvents();
      return !open;
    });
  };

  const totalPages = Math.max(1, Math.ceil((state.total || 0) / PAGE));
  const pick = (next) => { setFilter(next); setPage(1); };

  return (
    <>
      <DashboardTopBar title="Payments & Invoices" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-slate-900">Payments & Invoices</h1>
              <FieldHelp surface={SURFACE} field="page" label="this page" className="mb-0 ml-1" />
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Everything your organisation has paid for HR Clouds, with a tax invoice for each one. Click a payment to open it.
            </p>
          </div>
          <Link to="/dashboard/hr/billing" className={SECONDARY_BTN}>
            <HiChevronLeft className="w-4 h-4" /> Back to plan
          </Link>
        </div>

        <FilterTabs options={PAYMENT_FILTERS} value={filter} onChange={pick} />

        {state.loading ? (
          <Skeleton type="table" rows={6} />
        ) : state.error ? (
          <ErrorState error={state.error} onRetry={load} fallback="We couldn’t load your payments." />
        ) : state.rows.length === 0 ? (
          <Notice tone="info" title={filter ? "Nothing matches this filter" : "No payments yet"}>
            {filter
              ? "Try another filter, or show all payments."
              : "Once you pay for a plan, the payment and its tax invoice will appear here."}
          </Notice>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              {/* Four columns, not six. The invoice serial leads because it
                  is what a finance team quotes back at us, and the two facts
                  that only qualify it — which plan, and what the payment was
                  for — ride beneath it instead of taking a column each. On
                  this organisation's real data those two columns were "N/A"
                  all the way down. */}
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-100">
                    <th className="px-6 py-3.5">
                      <span className="inline-flex items-center whitespace-nowrap">
                        <HelpLabel text="Invoice" help={{ surface: SURFACE, field: "invoice_number" }} />
                      </span>
                    </th>
                    <th className="px-6 py-3.5 text-right">Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Date</th>
                    {/* The chevron's column. Headed blank, not "Actions":
                        there is no action here, only the affordance that the
                        row opens (§5 — drop an Actions column nobody uses). */}
                    <th className="px-6 py-3.5 w-10" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {state.rows.map((row) => {
                    // "Renewal · Starter Monthly", dropping whichever the
                    // server left null rather than printing N/A twice.
                    const detail = [
                      row.intent ? intentLabel(row.intent) : null,
                      row.plan?.name || null,
                    ].filter(Boolean).join(" · ");
                    return (
                      <tr key={row.id} className="group" {...rowPreviewProps(() => setSelected(row), "Payment details")}>
                        <td className="px-6 py-3.5 min-w-0">
                          <p className="font-semibold text-slate-900 tabular-nums">
                            {row.invoice_number || <span className="text-slate-400 font-medium">No invoice yet</span>}
                          </p>
                          {detail && <p className="text-[11px] text-slate-500 mt-0.5">{detail}</p>}
                        </td>
                        {/* The amount is what the reader came for, so it is
                            the one thing on the row set above body size. */}
                        <td className="px-6 py-3.5 text-right text-[15px] font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatMoney(row.amount)}
                        </td>
                        <td className="px-6 py-3.5"><BillingBadge meta={paymentStatusMeta(row.status)} /></td>
                        <td className="px-6 py-3.5 text-slate-600 whitespace-nowrap tabular-nums">
                          {fmtDate(row.settled_at || row.created_at)}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <HiChevronRight
                            className="w-4 h-4 text-slate-300 group-hover:text-purple-500 transition-colors inline-block"
                            aria-hidden="true"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {state.total > PAGE && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                <Pagination page={page} totalPages={totalPages} total={state.total} limit={PAGE} onPageChange={setPage} noun="payment" />
              </div>
            )}
          </div>
        )}

        {/* ── The plans this organisation has held ───────────────────────── */}
        <Ledger
          title="Plans you’ve been on"
          icon={HiBadgeCheck}
          count={history.total}
          help="history"
          open={historyOpen}
          onToggle={toggleHistory}
        >
          {history.loading ? (
            <Skeleton type="table" rows={3} />
          ) : history.error ? (
            <Notice tone="error">{history.error}</Notice>
          ) : history.rows.length === 0 ? (
            <p className="text-sm text-slate-500">Only your current plan so far.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-xs min-w-[640px]">
                <thead className="bg-slate-50/80 text-[11px] uppercase font-bold tracking-wider text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">Until</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{row.plan?.name || "N/A"}</td>
                      <td className="px-4 py-2.5 text-slate-600">{fmtDate(row.current_period_start)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{fmtDate(row.ended_at || row.current_period_end)}</td>
                      <td className="px-4 py-2.5"><BillingBadge meta={subscriptionStatusMeta(row.status)} /></td>
                      <td className="px-4 py-2.5 text-slate-600">{row.transaction?.invoice_number || <span className="text-slate-400">N/A</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Ledger>

        {/* ── The audit trail ────────────────────────────────────────────── */}
        <Ledger
          title="Billing activity"
          icon={HiClipboardList}
          count={events.total}
          help="events"
          open={eventsOpen}
          onToggle={toggleEvents}
        >
          {events.loading ? (
            <Skeleton type="table" rows={3} />
          ) : events.error ? (
            <Notice tone="error">{events.error}</Notice>
          ) : events.rows.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {events.rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                  <HiDocumentText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{eventLabel(row.event_type)}</p>
                    {row.reason && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{row.reason}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">{fmtDateTime(row.occurred_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </Ledger>
      </main>

      {selected && (
        <PaymentDetailDialog
          transactionId={selected.id}
          row={selected}
          onClose={() => setSelected(null)}
        />
      )}

    </>
  );
}
