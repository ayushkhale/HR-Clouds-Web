// ─────────────────────────────────────────────────────────────────────────────
// ClaimDetailSections.jsx — The read-only body of every reimbursement claim
// preview, shared by the HR, manager and employee screens. Built only from the
// DetailDialog primitives. A trimmed item shows how much it was lowered and the
// approver's remark; the approval timeline shows each level with its decision.
// ─────────────────────────────────────────────────────────────────────────────

import { HiCollection, HiClipboardCheck, HiCash, HiChartBar, HiEye } from "react-icons/hi";
import { DetailGrid, DetailSection, DetailStats, DetailTable } from "./DetailDialog";
import { formatDate, formatMoney, formatPeriod } from "../utils/formatUtils";
import { claimStatusLabel, itemStatusMeta, sameMoney, moneyOrNull } from "../utils/reimbursementMeta";
import { prettifyCode } from "../../roles/hr/payroll/runMeta";

const roleLabel = (role) => (role === "hr" ? "HR" : role === "manager" ? "Manager" : prettifyCode(role) || "Approver");

export function ClaimStats({ claim }) {
  const approved = moneyOrNull(claim?.approved_amount);
  const decided = approved !== null && ["approved", "processed", "rejected"].includes(claim?.status);
  return (
    <DetailStats
      items={[
        { label: "Claimed", value: formatMoney(claim?.total_amount) },
        { label: decided ? "Approved" : "Items", value: decided ? formatMoney(claim?.approved_amount) : String((claim?.items || []).length) },
        { label: "Status", value: claimStatusLabel(claim) },
        { label: "Pay month", value: claim?.payout_period_month ? formatPeriod(claim.payout_period_month) : "Set at final approval" },
      ]}
    />
  );
}

export function ClaimItemsTable({ claim, onViewAttachment }) {
  const items = Array.isArray(claim?.items) ? claim.items : [];
  return (
    <DetailSection title="Expenses" icon={HiCollection}>
      <DetailTable
        columns={[
          {
            header: "Expense",
            render: (it) => (
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{it.category_name || prettifyCode(it.category_code) || "Expense"}</p>
                <p className="text-[11px] text-slate-400">{[it.expense_date ? formatDate(it.expense_date) : "", it.merchant].filter(Boolean).join(" · ") || "N/A"}</p>
                {it.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{it.description}</p>}
              </div>
            ),
          },
          { header: "Claimed", align: "right", render: (it) => <span className="tabular-nums">{formatMoney(it.amount)}</span> },
          {
            header: "Approved",
            align: "right",
            render: (it) => {
              if (it.item_status === "rejected") return <span className="text-rose-600 font-semibold">Rejected</span>;
              if (it.approved_amount === null || it.approved_amount === undefined) return null;
              const lowered = !sameMoney(it.approved_amount, it.amount);
              return (
                <div className="tabular-nums">
                  <span className="font-semibold text-slate-800">{formatMoney(it.approved_amount)}</span>
                  {lowered && <p className="text-[11px] text-fuchsia-600">Lowered by {formatMoney(Number(it.amount) - Number(it.approved_amount))}</p>}
                </div>
              );
            },
          },
          { header: "Status", render: (it) => { const m = itemStatusMeta(it.item_status); return <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${m.pill}`}>{m.label}</span>; } },
          { header: "Remark", render: (it) => (it.approver_remarks ? <span className="text-[11px] text-slate-600">{it.approver_remarks}</span> : null) },
          {
            header: "Receipts",
            render: (it) => {
              const atts = Array.isArray(it.attachments) ? it.attachments : [];
              if (atts.length === 0) return <span className="text-[11px] text-slate-400">None</span>;
              return (
                <div className="flex flex-col gap-1 items-start">
                  {atts.map((att) => (
                    <button key={att.id} type="button" data-row-action onClick={() => onViewAttachment?.(att)} className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:underline">
                      <HiEye className="w-3.5 h-3.5" /> View
                    </button>
                  ))}
                </div>
              );
            },
          },
        ]}
        rows={items}
        rowKey={(it, i) => it.id ?? i}
        empty="No expenses on this claim."
      />
    </DetailSection>
  );
}

export function ApprovalTimeline({ claim, nameOf }) {
  const approvals = Array.isArray(claim?.approvals) ? claim.approvals : [];
  if (approvals.length === 0) return null;
  return (
    <DetailSection title="Approval steps" icon={HiClipboardCheck}>
      <DetailTable
        columns={[
          { header: "Step", render: (a) => <span className="font-semibold text-slate-800">{a.level ? `Step ${a.level}` : "Step"} · {roleLabel(a.role)}</span> },
          {
            header: "Decision",
            render: (a) => {
              if (a.status === "skipped") return <span className="text-[11px] text-slate-400">Not needed</span>;
              const m = itemStatusMeta(a.status === "pending" ? "pending" : a.status);
              const label = a.status === "pending" ? "Waiting" : a.status === "approved" ? "Approved" : a.status === "rejected" ? "Rejected" : prettifyCode(a.status);
              return <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${m.pill}`}>{label}</span>;
            },
          },
          { header: "By", render: (a) => (a.status === "pending" || a.status === "skipped") ? null : (a.approver_name || (a.approver_id && nameOf ? nameOf(a.approver_id) : "") || roleLabel(a.role)) },
          { header: "When", render: (a) => (a.acted_at ? formatDate(a.acted_at) : null) },
          { header: "Remark", render: (a) => (a.remarks ? <span className="text-[11px] text-slate-600">{a.remarks}</span> : null) },
        ]}
        rows={approvals}
        rowKey={(a, i) => `${a.level}-${i}`}
        empty="No approval steps yet."
      />
    </DetailSection>
  );
}

export function CategoryLimitsTable({ claim }) {
  const limits = Array.isArray(claim?.limits) ? claim.limits : [];
  if (limits.length === 0) return null;
  return (
    <DetailSection title="Category limits" icon={HiChartBar}>
      <DetailTable
        columns={[
          { header: "Category", render: (r) => <span className="font-semibold text-slate-800">{r.category_name || prettifyCode(r.category_code) || "Category"}</span> },
          { header: "Window", render: (r) => r.period_key || (r.limit_period === "month" ? "This month" : r.limit_period === "financial_year" ? "This financial year" : "N/A") },
          { header: "Limit", align: "right", render: (r) => (r.limit === null || r.limit === undefined ? <span className="text-slate-400">No limit</span> : <span className="tabular-nums">{formatMoney(r.limit)}</span>) },
          { header: "Already approved", align: "right", render: (r) => <span className="tabular-nums">{formatMoney(r.prior_approved)}</span> },
          { header: "Remaining", align: "right", render: (r) => (r.remaining === null || r.remaining === undefined ? <span className="text-slate-400">No limit</span> : <span className="tabular-nums">{formatMoney(r.remaining)}</span>) },
        ]}
        rows={limits}
        rowKey={(r, i) => `${r.category_code}-${r.period_key}-${i}`}
        empty="No limits apply."
      />
    </DetailSection>
  );
}

export function PayoutSection({ claim }) {
  if (!["approved", "processed"].includes(claim?.status)) return null;
  return (
    <DetailSection title="Payout" icon={HiCash}>
      <DetailGrid
        items={[
          ["Pay month", claim?.payout_period_month ? formatPeriod(claim.payout_period_month) : "Set at final approval"],
          ["In a payroll run", claim?.applied_run_id ? "Yes" : "Not yet"],
          ["Paid on", claim?.paid_at ? formatDate(claim.paid_at) : claim?.status === "processed" ? "Paid" : "Not yet"],
        ]}
        cols={3}
      />
      <p className="text-[11px] text-slate-500 mt-2">A reimbursement is added on top of net pay. It isn&apos;t part of gross pay and isn&apos;t used for PF, ESI or income tax unless the category is marked taxable.</p>
    </DetailSection>
  );
}

/**
 * The whole claim body. `audience` is "hr" | "manager" | "self"; `showLimits`
 * turns on the category-limits table (approvers see it, employees don't).
 */
export default function ClaimDetailSections({ claim, audience = "self", nameOf, onViewAttachment, showLimits = false }) {
  return (
    <>
      <ClaimStats claim={claim} />
      {claim?.description && (
        <DetailSection>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{claim.description}</p>
        </DetailSection>
      )}
      <ClaimItemsTable claim={claim} onViewAttachment={onViewAttachment} />
      {showLimits && <CategoryLimitsTable claim={claim} />}
      <ApprovalTimeline claim={claim} nameOf={nameOf} />
      <PayoutSection claim={claim} />
      {claim?.rejection_reason && (
        <DetailSection title="Why it was rejected">
          <p className="text-sm text-rose-700 whitespace-pre-wrap">{claim.rejection_reason}</p>
        </DetailSection>
      )}
      {audience === "self" && claim?.cancellation_reason && (
        <DetailSection title="Withdrawal reason">
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{claim.cancellation_reason}</p>
        </DetailSection>
      )}
    </>
  );
}
