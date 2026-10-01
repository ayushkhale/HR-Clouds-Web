// ─────────────────────────────────────────────────────────────────────────────
// documents/reportMeta.js — Org-wide search, tags, the two compliance reports
// and the export ledger (Phase 5, #113–#121).
//
// Three things here are contract, not preference, and the screens depend on
// them being kept in one place:
//
//  1. A search result is deliberately thin. `document_number` — even masked —
//     `storage_key` and `reference_url` are never in a bulk reply. So a search
//     row can never be shown as a full document record; opening one has to go
//     and fetch it (#15). SEARCH_COLUMNS_NOTE says so in the words the screen
//     uses.
//
//  2. The six expiry buckets are counted against midnight IST, by the same
//     clock the nightly expiry job uses. That is why `days_remaining` on a row
//     can be trusted: it is not "now minus then" in the reader's timezone.
//
//  3. Every CSV here writes a ledger row BEFORE the first byte leaves, and the
//     whole download is refused if it can't (503). Two refusals matter to a
//     person: over 10,000 rows (narrow the filters) and the ledger being
//     unavailable (nothing was exported — try again).
// ─────────────────────────────────────────────────────────────────────────────

import { humanizeCode } from "./documentMeta";

// ── Search (#113 / #114) ────────────────────────────────────────────────────
/** `quarantined` is deliberately absent: it is excluded from every bulk read. */
export const SEARCH_STATUS_OPTIONS = [
  { value: "available", label: "Verified" },
  { value: "pending_verification", label: "In review" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

export const SEARCH_Q_MAX = 200;
/** Verified live: a one-character `q` is refused with 422 SEARCH_QUERY_TOO_SHORT. */
export const SEARCH_Q_MIN = 2;
export const SEARCH_PAGE_MAX = 100;
/**
 * The deep-paging ceiling, and it is `offset + limit` that is measured — NOT
 * offset alone. Verified live: limit 25 / offset 9975 is fine and 9976 is
 * 422 PAGINATION_TOO_DEEP, at every page size. `maxSearchPage` is built on that,
 * so the pager never offers a page the server will refuse.
 */
export const SEARCH_MAX_WINDOW = 10_000;
/** Both the CSV row cap and what EXPORT_TOO_LARGE means. */
export const EXPORT_MAX_ROWS = 10_000;

export const SEARCH_PRIVACY_NOTE =
  "Searches never show ID numbers or file locations, and quarantined files are left out. Open a document to see its full record.";

/** #113 → `{ rows, total, limit, offset, filters }`. */
export function searchResultOf(res) {
  const data = res?.data ?? res ?? {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return {
    rows,
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : rows.length,
    limit: Number(data.limit) || null,
    offset: Number(data.offset) || 0,
    filters: data.filters || {},
  };
}

/**
 * The last page the server will actually serve at this page size. The last
 * usable offset is `SEARCH_MAX_WINDOW - limit`, which lands on page
 * `SEARCH_MAX_WINDOW / limit` — not one more than that.
 */
export const maxSearchPage = (limit) => Math.max(1, Math.floor(SEARCH_MAX_WINDOW / Math.max(1, limit)));

/**
 * Search refuses to run at all on status, department or dates alone: it wants
 * at least one of `q` (two characters or more), `type_id`, `user_id` or `tags`,
 * and answers 422 SEARCH_FILTER_REQUIRED otherwise. Verified live — the spec
 * calls every filter optional, and it is not.
 *
 * That is a sensible rule (the alternative is dumping the whole organisation
 * into a table), so the screen asks for one of the four up front rather than
 * firing a request it knows will be refused.
 */
export function hasSearchAnchor(filters) {
  return (
    String(filters?.q || "").trim().length >= SEARCH_Q_MIN
    || !!filters?.type_id
    || !!filters?.user_id
    || (Array.isArray(filters?.tags) && filters.tags.length > 0)
  );
}

// ── Tags (#121) ─────────────────────────────────────────────────────────────
export const TAGS_MAX_PER_DOCUMENT = 10;
export const TAG_MAX_LENGTH = 64;
/** The server's own pattern: starts alphanumeric, then letters, digits, space, _ or -. */
const TAG_PATTERN = /^[a-z0-9][a-z0-9 _-]*$/;

/** Lowercase and collapse the whitespace, the way the server stores it. */
export const normalizeTag = (tag) => String(tag ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * "travel, audit-2026" or a newline-separated list → normalised, de-duplicated
 * tags. Typing is forgiving on purpose; the rules are enforced by tagsProblem.
 */
export function parseTags(text) {
  return [...new Set(String(text ?? "").split(/[,\n]/).map(normalizeTag).filter(Boolean))];
}

/** Why one tag is not allowed, or "" when it is fine. */
export function tagProblem(tag) {
  const value = normalizeTag(tag);
  if (!value) return "A tag can't be blank.";
  if (value.length > TAG_MAX_LENGTH) return `“${value.slice(0, 20)}…” is longer than ${TAG_MAX_LENGTH} characters.`;
  if (!TAG_PATTERN.test(value)) {
    return `“${value}” can't be used. Tags use lowercase letters, numbers, spaces, hyphens and underscores, and must start with a letter or number.`;
  }
  return "";
}

/** Why a whole tag set would be refused, or "" when it is fine. */
export function tagsProblem(tags = []) {
  if (tags.length > TAGS_MAX_PER_DOCUMENT) return `A document can hold up to ${TAGS_MAX_PER_DOCUMENT} tags. Remove ${tags.length - TAGS_MAX_PER_DOCUMENT}.`;
  for (const tag of tags) {
    const problem = tagProblem(tag);
    if (problem) return problem;
  }
  return "";
}

export const sameTags = (a = [], b = []) =>
  a.length === b.length && [...a].sort().every((tag, i) => tag === [...b].sort()[i]);

/** Tags off any document read; always an array, never null. */
export const tagsOf = (doc) => (Array.isArray(doc?.tags) ? doc.tags : []);

/**
 * Does this server know about tags at all?
 *
 * Phase 5 added `tags` to every employee-document read, so a row carrying the
 * key — even as an empty array — comes from a server that has them. A row
 * without it does not, and offering an Edit tags button there would hand
 * somebody a 404 for nothing. Same rule the settings page uses: only offer back
 * what the read came back with.
 */
export const supportsTags = (doc) => Array.isArray(doc?.tags);

// ── Missing-mandatory report (#115 / #116) ──────────────────────────────────
export const EMPLOYMENT_TYPE_FILTERS = [
  { value: "", label: "Everyone" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Interns" },
];

const EMPTY_SUMMARY = { employees_total: 0, employees_complete: 0, employees_incomplete: 0, completeness_pct: null };

/**
 * #115 → a shape the screen can render without guarding every field.
 * `completeness_pct` stays null when the server didn't send one, because 0%
 * and "we don't know" are different things and must not read the same.
 */
export function missingReportOf(res) {
  const data = res?.data ?? res ?? {};
  const summary = data.summary || {};
  const pct = Number(summary.completeness_pct);
  return {
    generatedAt: data.generated_at || null,
    summary: {
      ...EMPTY_SUMMARY,
      employees_total: Number(summary.employees_total) || 0,
      employees_complete: Number(summary.employees_complete) || 0,
      employees_incomplete: Number(summary.employees_incomplete) || 0,
      completeness_pct: Number.isFinite(pct) ? pct : null,
    },
    byType: Array.isArray(data.by_type) ? data.by_type : [],
    byDepartment: Array.isArray(data.by_department) ? data.by_department : [],
    employees: Array.isArray(data.employees) ? data.employees : [],
    employeesLimit: Number(data.employees_limit) || null,
    employeesOffset: Number(data.employees_offset) || 0,
    hasMore: data.has_more === true,
  };
}

/** Departments worst first — the order a person reading this actually wants. */
export function rankDepartments(rows = []) {
  return [...rows]
    .map((row) => {
      const total = Number(row.employees_total) || 0;
      const incomplete = Number(row.employees_incomplete) || 0;
      return { ...row, total, incomplete, pct: total ? Math.round(((total - incomplete) / total) * 100) : null };
    })
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.incomplete - a.incomplete);
}

// ── Expiring report (#117 / #118) ───────────────────────────────────────────
/**
 * The six buckets, in the order they should be read: the ones that need doing
 * something about first. `within` is the horizon that has to be asked for
 * before that bucket can contain anything.
 */
export const EXPIRY_BUCKETS = [
  { key: "expired", label: "Already expired", short: "Expired", tone: "rose", within: 0, blurb: "Past its end date. Needs a renewed copy now." },
  { key: "due_7", label: "Within 7 days", short: "7 days", tone: "amber", within: 7, blurb: "Expires this week." },
  { key: "due_30", label: "Within 30 days", short: "30 days", tone: "purple", within: 30, blurb: "Expires this month." },
  { key: "due_60", label: "Within 60 days", short: "60 days", tone: "blue", within: 60, blurb: "Worth a nudge." },
  { key: "due_90", label: "Within 90 days", short: "90 days", tone: "indigo", within: 90, blurb: "Early warning." },
  { key: "later", label: "Later than 90 days", short: "Later", tone: "slate", within: 91, blurb: "Nothing to do yet." },
];

const BUCKET_BY_KEY = Object.fromEntries(EXPIRY_BUCKETS.map((b) => [b.key, b]));

export const expiryBucketMeta = (key) =>
  BUCKET_BY_KEY[key] || { key, label: humanizeCode(key) || "N/A", short: humanizeCode(key) || "N/A", tone: "slate", blurb: "" };

export const EXPIRY_HORIZONS = [
  { value: 7, label: "Next 7 days" },
  { value: 30, label: "Next 30 days" },
  { value: 60, label: "Next 60 days" },
  { value: 90, label: "Next 90 days" },
  { value: 180, label: "Next 6 months" },
  { value: 365, label: "Next year" },
];
export const EXPIRY_HORIZON_MIN = 1;
export const EXPIRY_HORIZON_MAX = 365;

/** #117 → buckets that always hold all six keys, plus the rows. */
export function expiringReportOf(res) {
  const data = res?.data ?? res ?? {};
  const buckets = data.buckets || {};
  return {
    generatedAt: data.generated_at || null,
    asOf: data.as_of || null,
    withinDays: Number(data.within_days) || null,
    buckets: Object.fromEntries(EXPIRY_BUCKETS.map((b) => [b.key, Number(buckets[b.key]) || 0])),
    rows: Array.isArray(data.rows) ? data.rows : [],
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : null,
  };
}

/** "in 6 days" / "today" / "12 days ago", from a row's `days_remaining`. */
export function daysRemainingLabel(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return "N/A";
  if (n < 0) return `${Math.abs(n)} ${Math.abs(n) === 1 ? "day" : "days"} ago`;
  if (n === 0) return "today";
  return `in ${n} ${n === 1 ? "day" : "days"}`;
}

// ── The export ledger (#119 / #120) ─────────────────────────────────────────
/**
 * What each kind of export was. The server has written `document_search` since
 * Phase 5 shipped but the table's own enum says `search`, so both are mapped —
 * a ledger row must never render as a raw code.
 */
export const EXPORT_TYPES = {
  document_search: { label: "Document search", blurb: "A search across employee documents, taken as a spreadsheet." },
  search: { label: "Document search", blurb: "A search across employee documents, taken as a spreadsheet." },
  missing_mandatory: { label: "Missing documents report", blurb: "Who is missing something they're required to hold." },
  expiring: { label: "Expiring documents report", blurb: "Documents with an end date coming up." },
  compliance: { label: "Policy compliance export", blurb: "Who has and hasn't signed a company document." },
  exit_pack: { label: "Leaver's document pack", blurb: "One person's whole file, gathered for their exit." },
};

export const exportTypeMeta = (type) =>
  EXPORT_TYPES[type] || { label: humanizeCode(type) || "N/A", blurb: "" };

export const EXPORT_TYPE_FILTERS = [
  { value: "", label: "Any kind" },
  { value: "document_search", label: "Document search" },
  { value: "missing_mandatory", label: "Missing documents" },
  { value: "expiring", label: "Expiring documents" },
  { value: "compliance", label: "Policy compliance" },
  { value: "exit_pack", label: "Leaver's pack" },
];

export const EXPORT_STATUS = {
  started: { label: "Started", short: "Started", tone: "amber", hint: "The download was opened. It should finish within seconds." },
  completed: { label: "Completed", short: "Done", tone: "emerald", hint: "The file left the server." },
  failed: { label: "Failed", short: "Failed", tone: "rose", hint: "Something went wrong and the file was not delivered." },
};

export const exportStatusMeta = (status) =>
  EXPORT_STATUS[status] || { label: humanizeCode(status) || "N/A", short: humanizeCode(status) || "N/A", tone: "slate", hint: "" };

export const EXPORT_STATUS_ORDER = ["completed", "started", "failed"];

/** #119 → `{ rows, total, page, limit, totalPages }`. It pages with `page`, not offset. */
export function exportListOf(res) {
  const data = res?.data ?? res ?? {};
  const rows = Array.isArray(data.exports) ? data.exports : Array.isArray(data.rows) ? data.rows : [];
  const pagination = data.pagination || {};
  const total = Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : rows.length;
  const limit = Number(pagination.limit) || rows.length || 1;
  return {
    rows,
    total,
    page: Number(pagination.page) || 1,
    limit,
    totalPages: Number(pagination.total_pages) || Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * The filters a ledger row recorded, as label/value pairs. They are an
 * open-ended JSON blob by design (it is whatever that report took), so this
 * renders whatever is there rather than a fixed list.
 */
export function describeExportFilters(filters) {
  if (!filters || typeof filters !== "object") return [];
  return Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => ({
      label: humanizeCode(key) || key,
      value: Array.isArray(value) ? value.join(", ") : String(value),
    }));
}

/** "a moment", "1.2 s" — how long a completed export took, or "" when unknown. */
export function exportDuration(row) {
  const from = Date.parse(row?.started_at || "");
  const to = Date.parse(row?.completed_at || "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return "";
  const ms = to - from;
  return ms < 1000 ? "under a second" : `${(ms / 1000).toFixed(1)} s`;
}
