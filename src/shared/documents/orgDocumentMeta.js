// ─────────────────────────────────────────────────────────────────────────────
// documents/orgDocumentMeta.js — Labels, tones and business rules of the ORG
// plane (Phase 2): a policy, notice or letter HR issues to a targeted audience.
//
// This is deliberately separate from documentMeta.js. An org document has no
// subject employee, no expiry date and no verification queue; it has a frozen
// audience, a version chain and a recipient roster. Sharing one status map
// between the two planes would mislabel both.
//
// Rules mirror phase2_implementation_plan.md §12 (R-36…R-75). The server stays
// the authority: everything here is a hint that keeps the UI from offering an
// action the server will refuse, and every refusal is still shown from its code.
// ─────────────────────────────────────────────────────────────────────────────

import { humanizeCode } from "./documentMeta";

// ── Status ──────────────────────────────────────────────────────────────────
// `status` is what is stored; `display_status` is what today's date makes of it
// and is the one to show. A published row reads as scheduled / active / expired.
export const ORG_STATUS = {
  draft: { label: "Draft", short: "Draft", tone: "slate", hint: "Not issued yet. Only you can see it." },
  scheduled: { label: "Scheduled", short: "Scheduled", tone: "blue", hint: "Published, and starts on its effective date." },
  active: { label: "Live", short: "Live", tone: "emerald", hint: "In force, and everyone addressed can see it." },
  expired: { label: "Past its end date", short: "Expired", tone: "orange", hint: "Still on file, but its effective period has ended." },
  published: { label: "Published", short: "Published", tone: "emerald", hint: "Issued to its audience." },
  superseded: { label: "Older version", short: "Older version", tone: "slate", hint: "A newer version replaced this one. Recipients keep their copy." },
  retired: { label: "Withdrawn", short: "Withdrawn", tone: "slate", hint: "Taken out of force. Recipients can still read it." },
  rejected: { label: "Declined", short: "Declined", tone: "rose", hint: "HR declined this proposal. Nothing was issued." },
};

export const orgStatusMeta = (status) =>
  ORG_STATUS[status] || { label: humanizeCode(status) || "N/A", short: humanizeCode(status) || "N/A", tone: "slate", hint: "" };

/**
 * The status to show. `display_status` is derived server-side on every read and
 * is the only thing that knows today's date in IST — never redo that maths here
 * (§2.3 of the API guide).
 */
export const orgDisplayStatus = (doc) => doc?.display_status || doc?.status || "draft";

/** Statuses the HR list offers as filters, in lifecycle order. */
export const ORG_STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "superseded", label: "Older versions" },
  { value: "retired", label: "Withdrawn" },
  { value: "rejected", label: "Declined" },
];

// ── Recipient state ─────────────────────────────────────────────────────────
// acknowledged / signed are written by #73 / #74 (Phase 3). Whether someone is
// LATE is not a state — see complianceMeta.js for the derived verdict.
export const RECIPIENT_STATES = {
  pending: { label: "Not opened yet", short: "Not opened", tone: "slate", hint: "Issued, but this person hasn't opened it." },
  viewed: { label: "Opened", short: "Opened", tone: "blue", hint: "Opened at least once." },
  acknowledged: { label: "Acknowledged", short: "Acknowledged", tone: "emerald", hint: "Confirmed they have read it." },
  signed: { label: "Signed", short: "Signed", tone: "emerald", hint: "Signed the document." },
  waived: { label: "Excused", short: "Excused", tone: "purple", hint: "HR excused this person from the document." },
};

export const recipientStateMeta = (state) =>
  RECIPIENT_STATES[state] || { label: humanizeCode(state) || "N/A", short: humanizeCode(state) || "N/A", tone: "slate", hint: "" };

export const RECIPIENT_STATE_ORDER = ["pending", "viewed", "acknowledged", "signed", "waived"];

/** A recipient has done what was asked of them. Waived counts as settled, not done. */
export const isRecipientSettled = (state) => ["acknowledged", "signed", "waived"].includes(state);

/** Waiving is legal from pending / viewed only (R-65). */
export const canWaiveRecipient = (row) => ["pending", "viewed"].includes(row?.state);

/**
 * How far a document has got with its audience, 0–100, counting everyone who
 * has at least opened it. Used for documents that ask for nothing — one that
 * asks for an acknowledgement or signature reads the server's `compliance`
 * block instead (#59), where only acknowledging or signing counts as done.
 */
export function compliancePercent(counts) {
  const total = Number(counts?.total) || 0;
  if (!total) return null;
  const done = ["viewed", "acknowledged", "signed", "waived"].reduce((sum, k) => sum + (Number(counts?.[k]) || 0), 0);
  return Math.round((done / total) * 100);
}

// ── Targeting ───────────────────────────────────────────────────────────────
export const TARGET_DIMENSIONS = [
  { key: "target_departments", label: "Departments", kind: "department" },
  { key: "target_locations", label: "Locations", kind: "location" },
  { key: "target_employment_types", label: "Employment types", kind: "text" },
  { key: "target_job_statuses", label: "Job statuses", kind: "text" },
  { key: "included_users", label: "Only these people", kind: "person" },
  { key: "excluded_users", label: "Except these people", kind: "person" },
];

/** Every dimension is capped at 200 (R-51). */
export const TARGET_ARRAY_MAX = 200;

const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/**
 * The criteria to read, wherever they live. Before publish they are the six
 * columns on the row; after publish the frozen snapshot under `targeting` is
 * the truth, because the columns are no longer what the audience was resolved
 * from (R-53, R-54).
 */
export function targetingCriteria(doc) {
  const frozen = doc?.targeting?.criteria;
  const source = frozen && typeof frozen === "object" ? frozen : doc || {};
  return Object.fromEntries(TARGET_DIMENSIONS.map((d) => [d.key, list(source[d.key])]));
}

/** No restriction on any dimension — the whole active workforce (R-45). */
export const isOrgWide = (criteria) => TARGET_DIMENSIONS.every((d) => list(criteria?.[d.key]).length === 0);

/**
 * Whether this goes to everyone, WITHOUT needing the criteria.
 *
 * The list projection (#52) carries `targeting` as `{ scope, summary,
 * resolved_count }` — no `criteria`, and the six columns aren't in it either.
 * Reading the arrays there would find them all empty and wrongly report
 * "everyone", so the frozen `scope` is trusted whenever it is present and the
 * arrays are only consulted for a draft, which has no snapshot yet.
 */
export function goesToEveryone(doc) {
  const scope = doc?.targeting?.scope;
  if (scope) return scope === "all";
  return isOrgWide(targetingCriteria(doc));
}

/** True when we hold the actual criteria and can list them, not just summarise. */
export const hasCriteria = (doc) =>
  !!doc?.targeting?.criteria || TARGET_DIMENSIONS.some((d) => list(doc?.[d.key]).length > 0);

/**
 * A sentence describing who gets this. `resolve` turns an id into a name; it is
 * given the dimension so a screen can look departments up in one map and people
 * in another. The server's own `targeting.summary` is machine-flavoured
 * ("1 department(s)"), so it is only the last resort.
 */
export function describeAudience(doc, resolve) {
  if (goesToEveryone(doc)) return "Everyone in the organisation";
  // A published row we only have the list projection for: say what the server
  // says rather than inventing an audience out of empty arrays.
  if (!hasCriteria(doc)) return doc?.targeting?.summary || "A limited audience";
  const criteria = targetingCriteria(doc);

  const parts = [];
  TARGET_DIMENSIONS.forEach((dimension) => {
    const ids = list(criteria[dimension.key]);
    if (!ids.length) return;
    const names = ids.map((id) => targetLabel(doc, dimension, id, resolve)).filter(Boolean);
    const shown = names.slice(0, 3);
    // Everything not shown: beyond the first three, or never resolved to a name.
    const hidden = ids.length - shown.length;
    parts.push(`${dimension.label}: ${shown.length
      ? `${shown.join(", ")}${hidden > 0 ? ` +${hidden} more` : ""}`
      : `${ids.length} selected`}`);
  });
  return parts.join(" · ") || doc?.targeting?.summary || "A limited audience";
}

/** The label dictionary frozen alongside the audience, so old names survive a rename (EC-36). */
export function frozenLabel(doc, dimension, id) {
  const labels = doc?.targeting?.labels;
  if (!labels) return null;
  if (dimension.kind === "department") return labels.departments?.[id] || null;
  if (dimension.kind === "location") return labels.locations?.[id] || null;
  return null;
}

/**
 * What to call one targeting value. Employment types and job statuses ARE their
 * own label, so they never need a resolver; departments and locations prefer
 * the name frozen at publish over the live one, so a renamed department still
 * reads as what the audience was actually chosen as.
 */
export function targetLabel(doc, dimension, id, resolve) {
  if (dimension.kind === "text") return id;
  return frozenLabel(doc, dimension, id) || resolve?.(dimension, id) || null;
}

// ── Lifecycle rules (R-52, R-55…R-60) ───────────────────────────────────────
export const isDraft = (doc) => doc?.status === "draft";
export const isProposal = (doc) => !!doc?.proposed_by;
export const isReference = (doc) => doc?.storage_backend === "reference";

/** Title, dates, rules and audience are editable while — and only while — draft. */
export const canEditOrgDraft = (doc) => isDraft(doc);

/**
 * Whether the draft has something to publish (R-56).
 *
 * For an S3 draft this is knowable: `confirmed_at` is only stamped once the
 * server has done a HeadObject against the uploaded object.
 *
 * For a reference draft it is NOT knowable here. `reference_url` is stripped
 * from every list and detail response (§2.2) and comes back only from a
 * view-url call, so the client has nothing to test. The old check read
 * `!!doc.storage_backend`, which for a reference row is `!!"reference"` — true
 * always, a test that could never fail. Publish is therefore offered and the
 * server is left to decide; `ORG_DOCUMENT_FILE_MISSING` is handled where it
 * is raised rather than guessed at here.
 */
export const hasPublishableFile = (doc) => (isReference(doc) ? true : !!doc?.confirmed_at);
export const canPublish = (doc) => isDraft(doc) && hasPublishableFile(doc);

/** Why Publish is disabled, or "" when it isn't. */
export function publishBlocker(doc) {
  if (!isDraft(doc)) return "Only a draft can be published.";
  if (!hasPublishableFile(doc)) return "The file hasn't reached storage yet — attach it before publishing.";
  return "";
}

export const canReplaceOrg = (doc) => doc?.status === "published";
export const canRetire = (doc) => doc?.status === "published";
/** Only a manager's proposal can be declined (R-50); an HR-authored draft is deleted instead. */
export const canRejectProposal = (doc) => isDraft(doc) && isProposal(doc);
export const canDeleteOrg = (doc) => ["draft", "rejected"].includes(doc?.status);

/** Recipients exist only once the audience has been frozen. */
export const hasRecipients = (doc) => ["published", "superseded", "retired"].includes(doc?.status);

export const ACK_DUE_MIN = 1;
export const ACK_DUE_MAX = 365;

// ── Audit ───────────────────────────────────────────────────────────────────
const ORG_ACTION_LABEL = {
  "org_document.created": "Draft created",
  "org_document.updated": "Draft edited",
  "org_document.file_confirmed": "File received",
  "org_document.published": "Published",
  "org_document.replaced": "New version started",
  "org_document.superseded": "Replaced by a newer version",
  "org_document.retired": "Withdrawn",
  "org_document.rejected": "Proposal declined",
  "org_document.deleted": "Deleted",
  "org_document.viewed": "Opened",
  "org_document.recipients_synced": "Audience topped up",
  "org_document_recipient.waived": "Recipient excused",
  "org_document.acknowledged": "Acknowledged",
  "org_document.signed": "Signed",
  "org_document.compliance_exported": "Compliance report downloaded",
};

export const orgAuditActionLabel = (action) =>
  ORG_ACTION_LABEL[action] || humanizeCode(String(action || "").split(".").pop()) || "N/A";

/**
 * What kind of document this is, in words.
 *
 * The employee endpoints (#70/#71) now nest `document_type: { id, name }`,
 * which is the only way someone who is not HR can learn the name — there is no
 * employee-readable org-type list. HR's own reads still carry just
 * `document_type_id`, so the type index remains the fallback, and the title
 * carries it if neither is available.
 */
export function documentTypeName(doc, index) {
  return doc?.document_type?.name || index?.get?.(doc?.document_type_id)?.name || "";
}

// ── Shapes ──────────────────────────────────────────────────────────────────
/**
 * `{ total, rows, counts_by_state }` from a roster or list response. Phase 1's
 * listPayload drops `counts_by_state`, which the roster needs (#59).
 */
export function rosterPayload(res) {
  const data = res?.data ?? res;
  const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
  return {
    rows,
    total: Number.isFinite(Number(data?.total)) ? Number(data.total) : rows.length,
    counts: data?.counts_by_state || null,
  };
}

/**
 * The document out of a create / replace response, which nests it under
 * `document` alongside the upload link, and out of an update / confirm
 * response, which returns it bare (#43 and #48 vs #44 and #46).
 */
export function orgDocumentOf(res) {
  const data = res?.data ?? res;
  return data?.document ?? data ?? null;
}

/** The upload link out of #43 / #45 / #48, whose id fields disagree by endpoint. */
export function uploadTicketOf(res) {
  const data = res?.data ?? res;
  if (!data?.upload_url) return null;
  return {
    document_id: data.document_id ?? data.document?.id ?? data.id ?? null,
    upload_url: data.upload_url,
    expires_at: data.upload_expires_at ?? data.expires_at ?? null,
    required_headers: data.required_headers || null,
  };
}
