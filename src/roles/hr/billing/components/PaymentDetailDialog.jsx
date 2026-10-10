// ─────────────────────────────────────────────────────────────────────────────
// PaymentDetailDialog.jsx — Everything about one payment, opened by clicking
// its row on Payments & Invoices (#230), with the statutory tax invoice folded
// underneath it (#231).
//
// Two readers, one dialog. The top half is for the HR admin who wants to know
// what was charged and what it bought; the invoice section is for whoever does
// the company's accounts, which is why that one section keeps the words a
// finance team expects — GSTIN, HSN/SAC, taxable amount — rather than the plain
// English the rest of the product uses. Everywhere else, §6 applies.
//
// Contract traps:
//   · The invoice is a separate read and is only available once the payment has
//     SETTLED. A 409 INVOICE_NOT_AVAILABLE is a state, not a failure, so the
//     section says "once this payment settles" instead of "couldn't load" —
//     and the two are kept apart, because "not set" where we mean "couldn't
//     load" is what invites someone to go and fix a thing that isn't broken.
//   · The invoice is FROZEN at the moment it was issued: the company address
//     and GSTIN on it are the ones from that day, not today's. Nothing here
//     re-derives it from the org profile, however tempting that looks.
//   · The invoice read is lazy — it only runs when the section is opened — so
//     a list of fifty payments doesn't fire fifty invoice reads.
//   · `settled_via` (client / webhook / reconciler) is deliberately never
//     shown. Which of our three settlement paths won the race is our business.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiCalendar, HiCash, HiClipboardList, HiCreditCard, HiDocumentText,
  HiOfficeBuilding, HiReceiptRefund, HiReceiptTax,
} from "react-icons/hi";
import DetailDialog, {
  DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable,
} from "../../../../shared/components/DetailDialog";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { formatMoney } from "../../../../shared/utils/formatUtils";
import { billingErrorMessage, isInvoicePending } from "../../../../shared/utils/billingErrors";
import { billingAPI } from "../../../../shared/api";
import { eventLabel, intentLabel, INVOICE_TOTAL_ROWS, paymentStatusMeta } from "../billingMeta";
import { BillingBadge, Notice } from "./billingUi";

// A settled payment is one of these three; anything else has no invoice yet.
const INVOICEABLE = ["success", "partially_refunded", "refunded"];

/** One side of the invoice's seller/buyer pair. */
function Party({ title, icon: Icon, party }) {
  if (!party) return null;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        <Icon className="w-3.5 h-3.5 text-purple-500" /> {title}
      </p>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-xs space-y-1">
        <p className="font-bold text-slate-800">{party.legal_name || party.org_name || "N/A"}</p>
        {party.address && <p className="text-slate-600 leading-relaxed">{party.address}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 text-slate-600">
          {party.gstin && <span><span className="font-semibold text-slate-500">GSTIN</span> {party.gstin}</span>}
          {party.pan && <span><span className="font-semibold text-slate-500">PAN</span> {party.pan}</span>}
          {party.state && <span><span className="font-semibold text-slate-500">State</span> {party.state}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.transactionId
 * @param {object} [props.row]  the list row, shown instantly while #230 loads
 * @param {() => void} props.onClose
 */
export default function PaymentDetailDialog({ transactionId, row, onClose }) {
  // The row opens instantly on what the list already knows; the detail read
  // then replaces it, so no action is taken against a stale status.
  const [detail, setDetail] = useState(row ? { payment: row } : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [invoice, setInvoice] = useState(null);
  const [invoiceState, setInvoiceState] = useState("idle"); // idle | loading | ready | pending | error
  const [invoiceError, setInvoiceError] = useState(null);
  const askedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await billingAPI.getPayment(transactionId);
        if (!cancelled) { setDetail(res?.data || null); setError(null); }
      } catch (err) {
        if (!cancelled) setError(billingErrorMessage(err, "We couldn’t load this payment."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [transactionId]);

  const payment = detail?.payment || row || {};
  const refunds = detail?.refunds || [];
  const events = detail?.events || [];
  const subscription = detail?.subscription || null;
  const hasInvoice = INVOICEABLE.includes(String(payment.status)) && Boolean(payment.invoice_number);

  /** Lazy: only read the invoice when the admin actually opens that section. */
  const loadInvoice = useCallback(async () => {
    if (askedRef.current) return;
    askedRef.current = true;
    setInvoiceState("loading");
    try {
      const res = await billingAPI.getInvoice(transactionId);
      setInvoice(res?.data || null);
      setInvoiceState("ready");
    } catch (err) {
      // Not settled yet is a STATE, not a load failure (see this file's header).
      if (isInvoicePending(err)) {
        setInvoiceState("pending");
      } else {
        setInvoiceError(billingErrorMessage(err, "We couldn’t load this invoice."));
        setInvoiceState("error");
      }
    }
  }, [transactionId]);

  // The section starts open for a settled payment, so fetch as soon as we know
  // there is one to fetch.
  useEffect(() => { if (hasInvoice) loadInvoice(); }, [hasInvoice, loadInvoice]);

  const totals = invoice?.totals || null;
  const lineItems = invoice?.line_items || [];
  const creditNotes = invoice?.credit_notes || [];
  const refunded = parseFloat(payment.refunded_amount) || 0;
  // Settled per the SERVER's status, not per the presence of a timestamp:
  // `settled_at` and `invoice_number` are both null on rows the API itself
  // calls `success`, so reading settlement off a date gets it wrong.
  const settled = INVOICEABLE.includes(String(payment.status));

  return (
    <DetailDialog
      // `intent` is null on older rows, and an eyebrow reading "N/A" above
      // the amount is noise — the dialog is better with no eyebrow at all.
      eyebrow={payment.intent ? intentLabel(payment.intent) : undefined}
      icon={HiCreditCard}
      title={formatMoney(payment.amount)}
      subtitle={payment.settled_at ? `Paid ${fmtDateTime(payment.settled_at)}` : payment.created_at ? `Started ${fmtDateTime(payment.created_at)}` : undefined}
      badge={<BillingBadge meta={paymentStatusMeta(payment.status)} />}
      loading={loading}
      onClose={onClose}
      footer={
        <DetailFooterNote>
          {hasInvoice
            ? "A settled payment can’t be changed from here — its invoice is a statutory record. Contact support for a refund."
            : "There’s nothing to do to a payment from this screen."}
        </DetailFooterNote>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      <DetailStats
        items={[
          {
            label: "Amount charged",
            value: formatMoney(payment.amount),
            icon: HiCash,
            hint: payment.payment_method ? `Paid by ${payment.payment_method}` : undefined,
            help: { surface: "billing.payment_detail", field: "amount" },
          },
          {
            label: "What it was for",
            value: intentLabel(payment.intent),
            icon: HiClipboardList,
            hint: payment.plan?.name,
            help: { surface: "billing.payment_detail", field: "intent" },
          },
          {
            label: "Invoice",
            value: payment.invoice_number || (payment.status === "pending" ? "Not yet" : null),
            icon: HiReceiptTax,
            // "Issued once the payment settles" is only true while it hasn't.
            // The live API returns settled payments with `invoice_number:
            // null`, and that sentence then told an admin to wait for an
            // invoice that is never coming. Settled-but-unnumbered says so.
            hint: payment.invoice_number
              ? "A tax invoice you can give to your accounts team"
              : settled
                ? "No invoice was issued for this payment"
                : "Issued once the payment settles",
            help: { surface: "billing.payment_detail", field: "invoice_number" },
          },
        ]}
      />

      <DetailSection title="This payment" icon={HiCreditCard} collapsible={false}>
        <DetailGrid
          cols={4}
          items={[
            ["Plan", payment.plan?.name],
            ["Status", paymentStatusMeta(payment.status).label],
            ["Started", fmtDateTime(payment.created_at)],
            ["Paid", payment.settled_at ? fmtDateTime(payment.settled_at) : payment.failed_at ? `Failed ${fmtDateTime(payment.failed_at)}` : null],
            {
              label: "Price before tax",
              value: formatMoney(payment.base_amount),
              help: { surface: "billing.payment_detail", field: "base_amount" },
            },
            {
              label: "Tax",
              value: formatMoney(payment.tax_amount),
              help: { surface: "billing.payment_detail", field: "tax_amount" },
            },
            {
              label: "Refunded",
              value: refunded > 0 ? formatMoney(payment.refunded_amount) : "Nothing refunded",
              help: { surface: "billing.payment_detail", field: "refunded_amount" },
            },
            ["Paid by", payment.payment_method],
          ]}
        />
      </DetailSection>

      {subscription && (
        <DetailSection title="What it paid for" icon={HiCalendar}>
          <DetailGrid
            cols={3}
            items={[
              ["Plan", payment.plan?.name],
              ["Covers from", fmtDate(subscription.period?.start)],
              ["Covers until", fmtDate(subscription.period?.end)],
            ]}
          />
        </DetailSection>
      )}

      {/* The statutory invoice. Open for a settled payment, folded otherwise. */}
      <DetailSection
        title={invoice?.invoice_number ? `Tax invoice ${invoice.invoice_number}` : "Tax invoice"}
        icon={HiReceiptTax}
        defaultOpen={hasInvoice}
        help={{ surface: "billing.payment_detail", field: "tax_invoice" }}
      >
        {invoiceState === "loading" && (
          <p className="text-xs font-semibold text-purple-600 flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> Loading the invoice…
          </p>
        )}

        {invoiceState === "pending" && (
          <p className="text-xs text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
            The invoice is issued the moment this payment settles. There’s nothing missing — it just isn’t due yet.
          </p>
        )}

        {invoiceState === "error" && (
          <p className="text-xs text-slate-700 bg-rose-50/70 border border-rose-200 rounded-xl px-4 py-3">{invoiceError}</p>
        )}

        {invoiceState === "idle" && !hasInvoice && (
          <p className="text-xs text-slate-600 bg-purple-50/70 border border-purple-100 rounded-xl px-4 py-3">
            Only a completed payment has a tax invoice.
          </p>
        )}

        {invoiceState === "ready" && invoice && (
          <div className="space-y-5">
            <DetailGrid
              cols={3}
              items={[
                ["Invoice number", invoice.invoice_number],
                ["Invoice date", fmtDate(invoice.invoice_date)],
                ["Total", formatMoney(totals?.total_amount)],
              ]}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Party title="From" icon={HiOfficeBuilding} party={invoice.seller} />
              <Party title="To" icon={HiOfficeBuilding} party={invoice.buyer} />
            </div>

            <DetailTable
              columns={[
                { header: "What was bought", render: (it) => it.description },
                { header: "HSN/SAC", render: (it) => it.hsn_sac },
                { header: "Qty", render: (it) => it.quantity, align: "right" },
                { header: "Amount", render: (it) => formatMoney(it.amount), align: "right" },
              ]}
              rows={lineItems}
              empty="No line items on this invoice."
            />

            {totals && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <dl className="space-y-1.5 text-xs">
                  {INVOICE_TOTAL_ROWS.filter(({ key }) => totals[key] != null && parseFloat(totals[key]) !== 0).map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <dt className="text-slate-600">{label}</dt>
                      <dd className="font-semibold text-slate-800 tabular-nums">{formatMoney(totals[key])}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 pt-2 mt-1 border-t border-slate-200">
                    <dt className="font-bold text-slate-800">Total</dt>
                    <dd className="font-bold text-slate-900 tabular-nums">{formatMoney(totals.total_amount)}</dd>
                  </div>
                </dl>
              </div>
            )}

            {creditNotes.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Credit notes against this invoice</p>
                <DetailTable
                  columns={[
                    { header: "Credit note", render: (c) => c.credit_note_number || c.number },
                    { header: "Date", render: (c) => fmtDate(c.issued_at || c.date) },
                    { header: "Amount", render: (c) => formatMoney(c.amount), align: "right" },
                  ]}
                  rows={creditNotes}
                />
              </div>
            )}
          </div>
        )}
      </DetailSection>

      {refunds.length > 0 && (
        <DetailSection title={`Refunds (${formatMoney(payment.refunded_amount)})`} icon={HiReceiptRefund} defaultOpen={false}>
          <DetailTable
            columns={[
              { header: "Refunded", render: (r) => fmtDateTime(r.processed_at || r.created_at) },
              { header: "Amount", render: (r) => formatMoney(r.amount), align: "right" },
              { header: "Why", render: (r) => r.reason },
              { header: "Status", render: (r) => <DetailPill tone="muted">{paymentStatusMeta(r.status).label}</DetailPill> },
            ]}
            rows={refunds}
          />
        </DetailSection>
      )}

      {events.length > 0 && (
        <DetailSection title={`What happened (${events.length})`} icon={HiDocumentText} defaultOpen={false}>
          <DetailTable
            columns={[
              { header: "When", render: (e) => fmtDateTime(e.occurred_at) },
              { header: "What", render: (e) => eventLabel(e.event_type) },
            ]}
            rows={events}
          />
        </DetailSection>
      )}
    </DetailDialog>
  );
}
