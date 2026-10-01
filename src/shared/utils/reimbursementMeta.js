// ─────────────────────────────────────────────────────────────────────────────
// reimbursementMeta.js — Plain-language labels, the claim state machine and
// defensive normalizers for Phase 5 reimbursement claims and categories.
// Pure helpers (no JSX), shared by the HR, manager and employee claim screens.
//
// Contract A (see PAYROLL_PHASE5_FRONTEND_PLAN.md §0). Claim states:
//   draft → submitted → under_review (2 levels only) → approved → processed,
//   plus rejected and cancelled. Final approval fixes the payout month, and the
//   claim is paid on top of net pay, never as part of gross (D-31).
// ─────────────────────────────────────────────────────────────────────────────

import { formatPeriod } from "./formatUtils";
import { prettifyCode, toCount } from "../../roles/hr/payroll/runMeta";
import { currentFY } from "../../roles/hr/payroll/fyUtils";
import { payrollErrorCode } from "./payrollErrors";

// ── Money ─────────────────────────────────────────────────────────────────────

/**
 * A money value with at most 2 decimals, sent to the API as a JSON number.
 * Returns NaN when the text isn't a clean amount. `allowZero` lets a period
 * cap or an override be 0 (a 0 override means "free"); otherwise 0 is rejected.
 */
export function parseMoney(value, { allowZero = false } = {}) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  const n = Number(text);
  if (!Number.isFinite(n)) return NaN;
  if (allowZero) return n >= 0 ? n : NaN;
  return n > 0 ? n : NaN;
}

/** Money arrives as DECIMAL strings; compare in paise so "4500" equals "4500.00". */
export function sameMoney(a, b) {
  const x = Number.parseFloat(a);
  const y = Number.parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.round(x * 100) === Math.round(y * 100);
}

/** A finite number from a decimal string, or null when absent/blank. */
export function moneyOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

// ── Status labels & pills ───────────────────────────────────────────────────

// "in payroll" and "paid" are purple; the rest follow the maker–checker palette.
export const CLAIM_STATUS = {
  draft: { label: "Draft", pill: "bg-slate-100 text-slate-500 border-slate-200" },
  submitted: { label: "Submitted", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  under_review: { label: "In review", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  approved: { label: "Approved", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  processed: { label: "Paid", pill: "bg-purple-700 text-white border-purple-700" },
  rejected: { label: "Rejected", pill: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Withdrawn", pill: "bg-slate-100 text-slate-500 border-slate-200" },
};

export const claimStatusMeta = (status) =>
  CLAIM_STATUS[status] || { label: prettifyCode(status) || "Unknown", pill: "bg-slate-50 text-slate-600 border-slate-200" };

/** Claim-aware label: a cancelled draft reads "Discarded", a live claim "Withdrawn". */
export function claimStatusLabel(claim) {
  if (claim?.status === "cancelled" && !claim?.claim_number) return "Discarded";
  return claimStatusMeta(claim?.status).label;
}

// Item decision within a claim.
export const ITEM_STATUS = {
  pending: { label: "Waiting", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  approved: { label: "Approved", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  rejected: { label: "Rejected", pill: "bg-rose-50 text-rose-700 border-rose-200" },
};
export const itemStatusMeta = (status) =>
  ITEM_STATUS[status] || { label: prettifyCode(status) || "Waiting", pill: "bg-slate-50 text-slate-600 border-slate-200" };

export const LIMIT_PERIOD_LABEL = { month: "per month", financial_year: "per financial year" };

// Status filter options per screen (the value is sent as `status`).
export const CLAIM_STATUS_FILTERS = {
  hr: [
    ["", "All statuses"],
    ["submitted", "Submitted"],
    ["under_review", "Waiting for HR (after manager)"],
    ["approved", "Approved"],
    ["processed", "Paid"],
    ["rejected", "Rejected"],
    ["cancelled", "Withdrawn"],
  ],
  manager: [
    ["submitted", "Submitted"],
    ["under_review", "Waiting for HR"],
    ["approved", "Approved"],
    ["processed", "Paid"],
    ["rejected", "Rejected"],
    ["", "All statuses"],
  ],
  self: [
    ["", "All statuses"],
    ["draft", "Draft"],
    ["submitted", "Submitted"],
    ["under_review", "Waiting for HR"],
    ["approved", "Approved"],
    ["processed", "Paid"],
    ["rejected", "Rejected"],
    ["cancelled", "Withdrawn"],
  ],
};

// ── Ownership ────────────────────────────────────────────────────────────────

/** True when this claim belongs to the signed-in user (both are users.id). */
export const isOwnClaim = (claim, viewerId) => !!viewerId && !!claim?.user_id && claim.user_id === viewerId;

// ── State machine ────────────────────────────────────────────────────────────

/**
 * Who a claim is waiting on, from the list fields only.
 * @returns {{ waitingOn: "employee"|"manager"|"hr"|"run"|"none", label: string }}
 */
export function claimStage(claim) {
  const status = claim?.status;
  const totalLevels = toCount(claim?.total_levels) || 1;
  const month = claim?.payout_period_month;
  switch (status) {
    case "draft":
      return { waitingOn: "employee", label: "Draft" };
    case "submitted":
      return totalLevels >= 2
        ? { waitingOn: "manager", label: "Waiting for manager" }
        : { waitingOn: "hr", label: "Waiting for HR" };
    case "under_review":
      return { waitingOn: "hr", label: "Waiting for HR (manager approved)" };
    case "approved":
      if (claim?.applied_run_id) return { waitingOn: "run", label: month ? `Approved, in ${formatPeriod(month)} payroll` : "Approved, in payroll" };
      return { waitingOn: "run", label: month ? `Approved, to be paid with ${formatPeriod(month)} payroll` : "Approved, pay month set at final approval" };
    case "processed":
      return { waitingOn: "none", label: "Paid" };
    case "rejected":
      return { waitingOn: "none", label: "Rejected" };
    case "cancelled":
      return { waitingOn: "none", label: claim?.claim_number ? "Withdrawn" : "Discarded" };
    default:
      return { waitingOn: "none", label: prettifyCode(status) || "Unknown" };
  }
}

const SOLE_HR_HINT = " If you're the only HR user, invite a second HR user to approve it.";

/**
 * Which actions the given audience may take on a claim right now, plus a reason
 * shown as a footer note when nothing is offered.
 * @param {object} claim
 * @param {{ audience: "self"|"manager"|"hr", viewerId?: string }} ctx
 */
export function claimActions(claim, { audience, viewerId } = {}) {
  const status = claim?.status;
  const totalLevels = toCount(claim?.total_levels) || 1;
  const stage = claimStage(claim);
  const own = isOwnClaim(claim, viewerId);
  const month = claim?.payout_period_month ? formatPeriod(claim.payout_period_month) : "";

  const base = { canEdit: false, canSubmit: false, canDiscard: false, canWithdraw: false, canDecide: false, reason: "" };

  if (audience === "self") {
    if (status === "draft") return { ...base, canEdit: true, canSubmit: true, canDiscard: true };
    if (status === "submitted" || status === "under_review") return { ...base, canWithdraw: true };
    if (status === "approved") return { ...base, reason: claim?.applied_run_id ? `Approved. Included in ${month || "an upcoming"} payroll.` : `Approved. It will be paid with ${month || "an upcoming"} payroll.` };
    if (status === "processed") return { ...base, reason: `Paid${month ? ` with ${month} payroll` : ""}.` };
    if (status === "rejected") return { ...base, reason: claim?.rejection_reason ? `Rejected: ${claim.rejection_reason}` : "Rejected." };
    if (status === "cancelled") return { ...base, reason: claim?.claim_number ? "Withdrawn." : "Draft discarded." };
    return base;
  }

  if (audience === "manager") {
    const canDecide = status === "submitted" && stage.waitingOn === "manager" && !!viewerId && !own;
    if (canDecide) return { ...base, canDecide: true };
    if (own && (status === "submitted" || status === "under_review")) return { ...base, reason: `You can't approve your own claim. Another approver has to review it.${SOLE_HR_HINT}` };
    if (stage.waitingOn === "hr") return { ...base, reason: "You've approved this. It's with HR now." };
    return { ...base, reason: terminalReason(claim, month) };
  }

  if (audience === "hr") {
    const waitingForHr = (status === "submitted" && totalLevels === 1) || status === "under_review";
    const canDecide = waitingForHr && !!viewerId && !own;
    if (canDecide) return { ...base, canDecide: true };
    if (own && waitingForHr) return { ...base, reason: `You can't approve your own claim. Another approver has to review it.${SOLE_HR_HINT}` };
    if (status === "submitted" && stage.waitingOn === "manager") return { ...base, reason: "Waiting for the manager. HR reviews it after the manager approves." };
    return { ...base, reason: terminalReason(claim, month) };
  }

  return base;
}

function terminalReason(claim, month) {
  switch (claim?.status) {
    case "approved": return claim?.applied_run_id ? `Approved. Included in ${month || "an upcoming"} payroll.` : `Approved. It will be paid with ${month || "an upcoming"} payroll.`;
    case "processed": return `Paid${month ? ` with ${month} payroll` : ""}.`;
    case "rejected": return claim?.rejection_reason ? `Rejected: ${claim.rejection_reason}` : "Rejected.";
    case "cancelled": return "Withdrawn by the employee.";
    case "draft": return "Still a draft with the employee.";
    default: return "There's nothing to do on this claim.";
  }
}

// ── Category text ────────────────────────────────────────────────────────────

/** "₹X per month" / "₹X per financial year" / "No limit" ("Blocked" when 0). */
export function periodLimitText(category, formatMoney) {
  const cap = category?.max_amount_per_period;
  if (cap === null || cap === undefined || cap === "") return "No limit";
  if (sameMoney(cap, 0)) return "Blocked";
  return `${formatMoney(cap)} ${LIMIT_PERIOD_LABEL[category?.limit_period] || "per financial year"}`;
}

/** "₹X" per-claim cap, or "No limit". */
export function claimLimitText(category, formatMoney) {
  const cap = category?.max_amount_per_claim;
  if (cap === null || cap === undefined || cap === "") return "No limit";
  return formatMoney(cap);
}

/** "Always" / "Above ₹X" / "Not needed". */
export function receiptRuleText(category, formatMoney) {
  if (!category?.requires_receipt) return "Not needed";
  const above = category?.receipt_required_above_amount;
  if (above === null || above === undefined || above === "") return "Always";
  return `Above ${formatMoney(above)}`;
}

/** True when an item of this amount needs a receipt (client-side pre-check). */
export function receiptNeeded(category, amount) {
  if (!category?.requires_receipt) return false;
  const above = category?.receipt_required_above_amount;
  if (above === null || above === undefined || above === "") return true;
  const threshold = Number.parseFloat(above);
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(threshold)) return true;
  return Number.isFinite(value) && value > threshold;
}

export const CATEGORY_STATUS_FILTERS = [
  ["true", "Active"],
  ["false", "Inactive"],
  ["", "All"],
];

// ── Normalizers ──────────────────────────────────────────────────────────────

const attId = (a) => a?.id ?? a?.attachment_id ?? null;

/** One attachment as the UI reads it. `pending` files are never returned by the API. */
export function normalizeAttachment(a) {
  if (!a || typeof a !== "object") return null;
  return {
    id: attId(a),
    file_name: a.file_name || a.name || "File",
    content_type: a.content_type || a.mime_type || "",
    size_bytes: toCount(a.size_bytes ?? a.size),
    status: a.status || "available",
    storage_backend: a.storage_backend || a.backend || "s3",
    reference_url: a.reference_url || "",
  };
}

const normalizeAttachments = (list) => (Array.isArray(list) ? list.map(normalizeAttachment).filter((x) => x && x.id) : []);

/** One claim line item. */
export function normalizeItem(it) {
  if (!it || typeof it !== "object") return null;
  return {
    id: it.id ?? it.item_id,
    category_id: it.category_id,
    category_code: it.category_code,
    category_name: it.category_name,
    expense_date: it.expense_date,
    merchant: it.merchant,
    description: it.description,
    amount: it.amount,
    approved_amount: it.approved_amount,
    item_status: it.item_status || "pending",
    approver_remarks: it.approver_remarks,
    display_order: toCount(it.display_order),
    attachments: normalizeAttachments(it.attachments),
  };
}

/** One approval-chain level. */
export function normalizeApproval(a) {
  if (!a || typeof a !== "object") return null;
  return {
    level: toCount(a.level),
    role: a.approver_role || a.role || "",
    status: a.status || "pending",
    approver_id: a.approver_id ?? a.approved_by ?? null,
    approver_name: a.approver_name || "",
    acted_at: a.acted_at || a.decided_at || a.actioned_at || null,
    remarks: a.remarks || a.approver_remarks || "",
  };
}

/** One `category_limits[]` window on a claim detail. */
export function normalizeLimitRow(r) {
  if (!r || typeof r !== "object") return null;
  return {
    category_id: r.category_id,
    category_code: r.category_code,
    category_name: r.category_name,
    period_key: r.period_key || "",
    limit_period: r.limit_period || "",
    limit: r.limit ?? r.max_amount_per_period ?? null,
    prior_approved: r.prior_approved ?? r.consumed ?? "0",
    remaining: r.remaining ?? null,
  };
}

/** Full claim detail (items, approvals, category_limits) merged onto the header. */
export function normalizeClaimDetail(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    ...d,
    items: Array.isArray(d.items) ? d.items.map(normalizeItem).filter(Boolean) : [],
    approvals: Array.isArray(d.approvals) ? d.approvals.map(normalizeApproval).filter(Boolean) : [],
    limits: Array.isArray(d.category_limits) ? d.category_limits.map(normalizeLimitRow).filter(Boolean) : [],
  };
}

/**
 * One row of #154 (`getMyReimbursementCategories`): a category plus this user's
 * used / remaining amounts in the current window.
 */
export function normalizeHeadroomRow(row) {
  const r = row && typeof row === "object" ? row : {};
  const category = r.category && typeof r.category === "object" ? r.category : r;
  return {
    category,
    period_key: r.period_key || "",
    consumed: r.consumed ?? null,
    remaining: r.remaining ?? null,
  };
}

// ── Item → limit-window mapping (approval preview, §7.5) ─────────────────────

/** FY label ("2026-27") for an expense date. */
const fyLabelFor = (date) => {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : currentFY(d);
};
/** "YYYY-MM" for an expense date. */
const monthKeyFor = (date) => {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * The `category_limits[]` row an item counts against, or null when it can't be
 * matched (then the server decides). Matches by category, then, when a category
 * has several windows, by the expense date's month / financial year.
 */
export function itemBucketKey(item, limitRows) {
  const rows = (Array.isArray(limitRows) ? limitRows : []).filter(
    (r) => r.category_code && item?.category_code && r.category_code === item.category_code,
  );
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const month = monthKeyFor(item?.expense_date);
  const fy = fyLabelFor(item?.expense_date);
  return (
    rows.find((r) => r.period_key && (r.period_key === month || r.period_key === fy)) || null
  );
}

// ── Error detail readers ────────────────────────────────────────────────────

/** Raw per-limit violation entries for CATEGORY_LIMIT_EXCEEDED, else []. */
export function limitViolations(err) {
  if (payrollErrorCode(err) !== "CATEGORY_LIMIT_EXCEEDED") return [];
  const details = err?.data?.details;
  const list = Array.isArray(details?.violations) ? details.violations
    : Array.isArray(details?.errors) ? details.errors
    : Array.isArray(details) ? details
    : [];
  return list.filter((e) => e && typeof e === "object");
}

/**
 * The item a RECEIPT_REQUIRED error points at: its id when the server sends one,
 * else "". The editor uses this to mark the offending row.
 */
export function receiptProblem(err) {
  if (payrollErrorCode(err) !== "RECEIPT_REQUIRED") return "";
  return err?.data?.details?.item_id || "";
}
