// ─────────────────────────────────────────────────────────────────────────────
// documents/complianceMeta.js — Labels, tones and read-side rules for Phase 3
// of the org plane: acknowledging, signing, and who has (#73–#79).
//
// Two different things are easy to confuse, so they are kept apart here:
//
//   state             — what is STORED on a recipient: pending, viewed,
//                       acknowledged, signed, waived (orgDocumentMeta.js)
//   compliance_state  — what TODAY makes of it: completed, pending, overdue,
//                       waived. The server derives it on every read against the
//                       IST date; the client shows it and never redoes the maths.
//
// Everything below is a hint for the UI. The server remains the authority and
// every refusal is still shown from its code.
// ─────────────────────────────────────────────────────────────────────────────

import { humanizeCode } from "./documentMeta";

// ── Compliance verdict ──────────────────────────────────────────────────────
export const COMPLIANCE_STATES = {
  completed: { label: "Done", short: "Done", tone: "emerald", hint: "Acknowledged or signed." },
  pending: { label: "Waiting", short: "Waiting", tone: "blue", hint: "Still to do, and not late yet." },
  overdue: { label: "Overdue", short: "Overdue", tone: "rose", hint: "The date it was due has passed." },
  waived: { label: "Excused", short: "Excused", tone: "purple", hint: "HR excused this person." },
};

export const complianceStateMeta = (state) =>
  COMPLIANCE_STATES[state] || { label: humanizeCode(state) || "N/A", short: humanizeCode(state) || "N/A", tone: "slate", hint: "" };

/** Bucket order everywhere: done first, then what still needs chasing. */
export const COMPLIANCE_ORDER = ["completed", "pending", "overdue", "waived"];

/** The #59 / #70 `compliance_state` filter accepts exactly these (§5.1, §5.2). */
export const COMPLIANCE_FILTER_VALUES = new Set(COMPLIANCE_ORDER);

// ── What a document asks of people ──────────────────────────────────────────
/** A document asks for something only when it needs acknowledging or signing. */
export const asksForSomething = (doc) => !!(doc?.requires_acknowledgement || doc?.requires_signature);

/**
 * What the document asks for, in words. Signing is the stronger of the two and
 * also counts as acknowledging (R-79), so a document that needs both reads as
 * "Signature".
 */
export function obligationLabel(doc) {
  if (doc?.requires_signature) return "Signature needed";
  if (doc?.requires_acknowledgement) return "Acknowledgement needed";
  return "For your information";
}

// ── Deadline wording ────────────────────────────────────────────────────────
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * "Due today" / "Due in 3 days" / "Overdue by 2 days" from the server's
 * `days_remaining` (negative once late). Due today is NOT overdue (R-92), so 0
 * reads as "Due today". Returns "" when there is no deadline.
 */
export function dueLabel(daysRemaining) {
  if (daysRemaining === null || daysRemaining === undefined || daysRemaining === "") return "";
  const n = Number(daysRemaining);
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `Overdue by ${plural(-n, "day", "days")}`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${plural(n, "day", "days")}`;
}

// ── The self plane's per-row block (#70 / #71) ──────────────────────────────
const SETTLED = ["acknowledged", "signed", "waived"];

/**
 * The `acknowledgement` block of a #70/#71 row, normalised. When the server
 * sends it, it is used as-is. A row from before Phase 3 shipped has no block,
 * so one is assembled from the stored state and the document's flags — never
 * guessing "overdue", because only the server knows today's IST date.
 */
export function ackBlockOf(row) {
  const doc = row?.document || {};
  const block = row?.acknowledgement;
  if (block && typeof block === "object") {
    return {
      required: !!block.required,
      signatureRequired: !!block.signature_required,
      state: block.state || null,
      dueOn: block.due_on || row?.due_on || null,
      daysRemaining: block.days_remaining ?? null,
      isOverdue: !!block.is_overdue,
      isBlocking: !!block.is_blocking,
      acknowledgedAt: block.acknowledged_at || null,
      signedAt: block.signed_at || null,
      fromServer: true,
    };
  }
  const state = row?.state;
  return {
    required: !!doc.requires_acknowledgement,
    signatureRequired: !!doc.requires_signature,
    state: state === "waived" ? "waived" : ["acknowledged", "signed"].includes(state) ? "completed" : asksForSomething(doc) ? "pending" : null,
    dueOn: row?.due_on || null,
    daysRemaining: null,
    isOverdue: false,
    isBlocking: false,
    acknowledgedAt: null,
    signedAt: null,
    fromServer: false,
  };
}

/**
 * What this person should do next: "sign", "acknowledge" or null.
 *
 * `document.next_action` is the recipient-aware answer and is the one to read
 * (§7.1) — `is_actionable` is status-only and would offer a button to someone
 * who has already done it. The combined analysis spells the values in capitals
 * in one table ("ACKNOWLEDGE", "NONE"), so they are lower-cased and anything
 * that isn't an action becomes null. Only when the field is absent altogether
 * (a server from before Phase 3) is it worked out from the state and flags.
 */
export function nextActionOf(row) {
  const doc = row?.document || {};
  if (doc.next_action !== undefined) {
    const value = String(doc.next_action || "").toLowerCase();
    return value === "sign" || value === "acknowledge" ? value : null;
  }
  if (SETTLED.includes(row?.state)) return null;
  if (doc.requires_signature) return "sign";
  if (doc.requires_acknowledgement) return "acknowledge";
  return null;
}

/**
 * Whether the action can be taken TODAY. The server refuses anything that is
 * not display-active with ORG_DOCUMENT_NOT_ACTIONABLE (scheduled, expired), and
 * a superseded or retired version can never be newly acknowledged.
 */
export function actionWindow(doc) {
  const display = doc?.display_status || doc?.status;
  if (doc?.status && doc.status !== "published") return { open: false, reason: doc.status === "superseded" ? "superseded" : "closed" };
  if (display === "scheduled") return { open: false, reason: "scheduled" };
  if (display === "expired") return { open: false, reason: "expired" };
  return { open: true, reason: "" };
}

/** Has this person done what was asked (acknowledged or signed)? */
export const hasEvidence = (row) => ["acknowledged", "signed"].includes(row?.state) || row?.acknowledgement?.state === "completed";

// ── Evidence (#73 / #74 / #75 / #78) ────────────────────────────────────────
/** `{ acknowledgement, signature, document_version, recipient_state }` out of any evidence response. */
export function evidenceOf(res) {
  const data = res?.data ?? res ?? {};
  return {
    orgDocumentId: data.org_document_id || data.acknowledgement?.org_document_id || data.signature?.org_document_id || null,
    userId: data.user_id || data.acknowledgement?.user_id || data.signature?.user_id || null,
    version: data.document_version ?? data.acknowledgement?.document_version ?? data.signature?.document_version ?? null,
    recipientState: data.recipient_state || null,
    acknowledgement: data.acknowledgement || null,
    signature: data.signature || null,
  };
}

export const SIGNATURE_PROVIDERS = {
  internal_typed: { label: "Typed name in HR Clouds", hint: "People type their name, and it is checked against their profile.", available: true },
  docusign: { label: "DocuSign", hint: "Not connected yet. While this is chosen, nobody can sign.", available: false },
  adobe_sign: { label: "Adobe Acrobat Sign", hint: "Not connected yet. While this is chosen, nobody can sign.", available: false },
};

export const signatureProviderLabel = (code) => SIGNATURE_PROVIDERS[code]?.label || humanizeCode(code) || "N/A";

/** A checksum is 64 hex characters — show the ends so two can be compared by eye. */
export function shortFingerprint(hash) {
  const text = String(hash || "");
  if (text.length <= 20) return text;
  return `${text.slice(0, 10)}…${text.slice(-8)}`;
}

// ── List shapes (#76 / #79) ─────────────────────────────────────────────────
/** `{ total, as_of, rows }` — both compliance lists carry the IST date they were judged on. */
export function complianceListOf(res) {
  const data = res?.data ?? res ?? {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return {
    rows,
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : rows.length,
    asOf: data.as_of || null,
  };
}

/** Sum the per-document tallies of #76 rows into one set of org totals. */
export function sumCompliance(rows) {
  const out = { total: 0, completed: 0, pending: 0, overdue: 0, waived: 0 };
  (rows || []).forEach((r) => {
    Object.keys(out).forEach((k) => { out[k] += Number(r?.[k]) || 0; });
  });
  out.completion_rate = out.total ? Math.round((out.completed / out.total) * 1000) / 10 : null;
  return out;
}

/** "70%" / "85.4%" — the server rounds to one decimal; whole numbers drop the ".0". */
export function percentLabel(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate))) return "N/A";
  const n = Math.round(Number(rate) * 10) / 10;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}
