// ─────────────────────────────────────────────────────────────────────────────
// documents/documentMeta.js — Labels, tones and business rules of the Documents
// module (Phase 1), shared by the HR, manager and self-service screens.
//
// Rules mirror phase1_implementation_plan.md §11 so the UI never offers an
// action the server will refuse. The server stays the authority: every rule
// here is a hint, and every refusal is still shown from its error code.
// ─────────────────────────────────────────────────────────────────────────────

import { todayYMD } from "../attendance/dates";

// ── Status (employee_documents.status + the derived display_status) ─────────
// Tones use the app's purple-family TONE_CLASSES keys (see attendance/enums.js);
// rose is kept for the states that need the employee to act.
export const DOC_STATUS = {
  pending_upload: { label: "Upload not finished", short: "Not finished", tone: "slate", hint: "The file never reached storage. Upload it again or discard it." },
  pending_verification: { label: "In review", short: "In review", tone: "amber", hint: "Waiting for a manager recommendation or an HR decision." },
  available: { label: "Verified", short: "Verified", tone: "emerald", hint: "Accepted and in good standing." },
  expiring_soon: { label: "Expiring soon", short: "Expiring soon", tone: "orange", hint: "Still valid, but its expiry date is close. Upload the renewed copy." },
  expired: { label: "Expired", short: "Expired", tone: "rose", hint: "Its expiry date has passed. Upload the renewed copy." },
  rejected: { label: "Rejected", short: "Rejected", tone: "rose", hint: "Declined in review. Read the reason and upload a corrected copy." },
  superseded: { label: "Older version", short: "Older version", tone: "slate", hint: "A newer version replaced this one. Kept for the record." },
  quarantined: { label: "Quarantined", short: "Quarantined", tone: "rose", hint: "Blocked by a security scan." },
  archived: { label: "Archived", short: "Archived", tone: "slate", hint: "Archived after the employee left." },
  deleted: { label: "Deleted", short: "Deleted", tone: "slate", hint: "Removed. Kept in the audit trail only." },
};

export const docStatusMeta = (status) => DOC_STATUS[status] || { label: humanizeCode(status) || "N/A", short: humanizeCode(status) || "N/A", tone: "slate", hint: "" };

/** Days before expiry that count as "expiring soon". The reminder cron is Phase 4; this is the read-side hint. */
export const EXPIRING_SOON_DAYS = 30;

const daysBetween = (fromYmd, toYmd) => Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);

/** Days until `expires_on` (negative once past), or null when there is no expiry. */
export function daysToExpiry(doc, today = todayYMD()) {
  const exp = String(doc?.expires_on || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return null;
  return daysBetween(today, exp);
}

/**
 * The status to show. The server already derives `expired` on read
 * (`display_status`); `expiring_soon` is the UI's own hint on top of it.
 */
export function displayStatus(doc, today = todayYMD()) {
  const base = doc?.display_status || doc?.status;
  if (base === "available") {
    const days = daysToExpiry(doc, today);
    if (days !== null && days < 0) return "expired";
    if (days !== null && days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  }
  return base;
}

/** Statuses a person counts as "live" (one per group; one per single-instance type). */
export const LIVE_STATUSES = ["pending_verification", "available", "expired"];

// ── Groups (document_types.group) ───────────────────────────────────────────
export const DOC_GROUPS = [
  { value: "identity", label: "Identity" },
  { value: "education", label: "Education" },
  { value: "employment_history", label: "Employment history" },
  { value: "financial", label: "Financial" },
  { value: "medical", label: "Medical" },
  { value: "background_check", label: "Background check" },
  { value: "onboarding", label: "Onboarding" },
  { value: "policy", label: "Policy" },
  { value: "disciplinary", label: "Disciplinary" },
  { value: "exit", label: "Exit" },
];
const GROUP_LABEL = Object.fromEntries(DOC_GROUPS.map((g) => [g.value, g.label]));
export const groupLabel = (group) => GROUP_LABEL[group] || humanizeCode(group) || "N/A";

// ── Who put the file there (employee_documents.source) ──────────────────────
const SOURCE_LABEL = {
  self_upload: "Uploaded by the employee",
  hr_upload: "Added by HR",
  manager_upload: "Added by the manager",
  onboarding: "Onboarding",
  migrated: "Migrated",
};
export const sourceLabel = (source) => SOURCE_LABEL[source] || humanizeCode(source) || "N/A";

// ── File formats: the module's 7-type allow-list (plan §5.3, D-7) ───────────
// SVG / HTML / XML are excluded forever (script-capable). Order = picker order.
export const CONTENT_TYPES = [
  { value: "application/pdf", label: "PDF", ext: ["pdf"] },
  { value: "image/jpeg", label: "JPEG", ext: ["jpg", "jpeg"] },
  { value: "image/png", label: "PNG", ext: ["png"] },
  { value: "image/webp", label: "WebP", ext: ["webp"] },
  { value: "application/msword", label: "Word (.doc)", ext: ["doc"] },
  { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word (.docx)", ext: ["docx"] },
  { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel (.xlsx)", ext: ["xlsx"] },
];
export const ALL_CONTENT_TYPES = CONTENT_TYPES.map((c) => c.value);
const CT_BY_VALUE = Object.fromEntries(CONTENT_TYPES.map((c) => [c.value, c]));
const CT_BY_EXT = Object.fromEntries(CONTENT_TYPES.flatMap((c) => c.ext.map((e) => [e, c.value])));

export const contentTypeLabel = (ct) => CT_BY_VALUE[ct]?.label || (ct ? String(ct).split("/").pop().toUpperCase() : "N/A");
/** "PDF, JPEG or PNG" */
export function formatList(types = []) {
  const labels = [...new Set(types.map(contentTypeLabel))];
  if (labels.length <= 1) return labels[0] || "N/A";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}
/** The `accept` attribute for a file input limited to these types. */
export const acceptAttr = (types = ALL_CONTENT_TYPES) =>
  types.flatMap((t) => [t, ...(CT_BY_VALUE[t]?.ext || []).map((e) => `.${e}`)]).join(",");

const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(String(name || "")) || [])[1]?.toLowerCase() || "";
/** A file's content type: its own when it is one we know, else inferred from the extension. */
export function contentTypeOfFile(file) {
  if (file?.type && CT_BY_VALUE[file.type]) return file.type;
  return CT_BY_EXT[extOf(file?.name)] || file?.type || "";
}

/** Server hard ceiling (plan §18 #63): 25 MB. */
export const HARD_MAX_BYTES = 25 * 1024 * 1024;

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Why this file can't be uploaded to this type, or "" when it can. Checked in
 * the browser so a wrong file never leaves the machine; the server re-checks.
 */
export function fileProblem(file, { allowed = ALL_CONTENT_TYPES, maxBytes = HARD_MAX_BYTES } = {}) {
  if (!file) return "Choose a file.";
  if (!file.size) return "That file is empty. Choose another one.";
  const limit = Math.min(maxBytes || HARD_MAX_BYTES, HARD_MAX_BYTES);
  if (file.size > limit) return `This file is ${formatBytes(file.size)}; the limit is ${formatBytes(limit)}. Choose a smaller file.`;
  const type = contentTypeOfFile(file);
  const usable = (allowed?.length ? allowed : ALL_CONTENT_TYPES).filter((t) => ALL_CONTENT_TYPES.includes(t));
  if (!usable.includes(type)) return `This format isn't allowed here. Use ${formatList(usable)}.`;
  return "";
}

/** File name cut to 255 characters, keeping its extension. */
export function trimFileName(name) {
  const text = String(name || "file");
  if (text.length <= 255) return text;
  const ext = extOf(text);
  const dot = ext ? `.${ext}` : "";
  return text.slice(0, 255 - dot.length) + dot;
}

export const isImageType = (ct) => /^image\//.test(String(ct || ""));
export const isReferenceDoc = (doc) => doc?.storage_backend === "reference";

// ── Business rules (plan §11, §13.1) ────────────────────────────────────────
/** Replace is allowed from available or expired only (R: DOCUMENT_NOT_REPLACEABLE). References can't be replaced by a file. */
export const canReplace = (doc) => ["available", "expired"].includes(doc?.status) && !isReferenceDoc(doc);

/** Only `pending_verification` can be verified, rejected or recommended (R-22). */
export const isReviewable = (doc) => doc?.status === "pending_verification";

/**
 * Self-service delete (R-29, R-30). Unverified → always. A verified one needs
 * the type and the org to allow it and the type not to be statutory; the
 * employee's type list doesn't carry those flags, so it's offered with a note
 * and the server has the final word.
 */
export function selfDeleteRule(doc) {
  if (["pending_upload", "pending_verification"].includes(doc?.status)) return { allowed: true, note: "" };
  if (doc?.status === "available") {
    return { allowed: true, note: "Verified documents can only be deleted if your company allows it. Statutory documents (PAN, Aadhaar…) are always kept." };
  }
  return { allowed: false, note: "Only HR can delete this document." };
}

/** Audit action → readable sentence. */
const ACTION_LABEL = {
  "document.upload_issued": "Upload started",
  "document.confirmed": "File received",
  "document.verification_failed": "File check failed",
  "document.replace_issued": "New version started",
  "document.upload_abandoned": "Unfinished upload discarded",
  "document.reference_linked": "External link added",
  "document.verified": "Verified",
  "document.rejected": "Rejected",
  "document.recommended": "Manager recommendation",
  "document.stale_recommendation_overridden": "Decided despite a stale recommendation",
  "document.deleted": "Deleted",
  "document.viewed": "Viewed",
};
export const auditActionLabel = (action) => ACTION_LABEL[action] || humanizeCode(String(action || "").split(".").pop()) || "N/A";

// ── Type helpers ────────────────────────────────────────────────────────────
/** id → type, for rows that carry only document_type_id. */
export const typeIndex = (types = []) => new Map(types.map((t) => [t.id, t]));

/** "10 MB · PDF, JPEG or PNG" */
export function typePolicyLine(type) {
  if (!type) return "";
  const parts = [];
  if (type.max_file_size_bytes) parts.push(`Up to ${formatBytes(type.max_file_size_bytes)}`);
  if (type.allowed_content_types?.length) parts.push(formatList(type.allowed_content_types));
  return parts.join(" · ");
}

/** Pull `{ total, rows }` from a list response, tolerating a bare array. */
export function listPayload(res) {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return { rows: data, total: data.length };
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return { rows, total: Number.isFinite(Number(data?.total)) ? Number(data.total) : rows.length };
}

/** Pull an array from a response whose `data` is an array. */
export const arrayPayload = (res) => {
  const data = res?.data ?? res;
  return Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
};

export function humanizeCode(value) {
  const s = String(value || "").replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
