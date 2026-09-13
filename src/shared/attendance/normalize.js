// ─────────────────────────────────────────────────────────────────────────────
// attendance/normalize.js — Response normalisers.
//
// Many attendance list endpoints have no documented response shape (audit
// C14). These helpers accept the documented shape first and degrade
// predictably, so screens never chain `data.data || data.x || data` guesses.
// They NEVER surface a UUID as a human label.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === "string" && UUID_RE.test(value.trim());

/** Coerce to a finite number or return the fallback. */
export function num(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** `{ success, data }` envelope → `data`. */
export function unwrap(res) {
  if (res && typeof res === "object" && !Array.isArray(res) && "data" in res) return res.data;
  return res;
}

const DEFAULT_LIST_KEYS = ["records", "requests", "items", "rows", "results", "list", "data"];

/** Find the array inside a payload, preferring `keys` (in order). */
export function toList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of [...keys, ...DEFAULT_LIST_KEYS]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    // One nested level, e.g. { data: { records: [] } }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const inner of [...keys, ...DEFAULT_LIST_KEYS]) {
        if (Array.isArray(value[inner])) return value[inner];
      }
    }
  }
  return [];
}

/** Envelope → array (for unpaginated lists). */
export const listFrom = (res, keys = []) => toList(unwrap(res), keys);

/**
 * Normalise a paginated response. Accepts `pagination.totalPages` (documented)
 * and `total_pages` (legacy).
 * @returns {{items: any[], total: number, page: number, limit: number, totalPages: number}}
 */
export function normalizePaginated(res, keys = [], requested = {}) {
  const payload = unwrap(res);
  const items = toList(payload, keys);
  const meta = (payload && !Array.isArray(payload) && (payload.pagination || payload.meta)) || (Array.isArray(payload) ? {} : payload) || {};
  const rawTotal = meta.total ?? meta.totalItems ?? meta.total_count ?? meta.totalCount ?? meta.count;
  const rawPages = meta.totalPages ?? meta.total_pages ?? meta.pages;
  const requestedLimit = num(requested.limit, 0);
  const requestedPage = Math.max(1, num(requested.page, 1));

  // No pagination metadata: the endpoint is unpaginated or ignored page/limit.
  // Never fabricate pages from the requested limit — every "page" would
  // re-render the same full list.
  if (rawTotal === undefined && rawPages === undefined) {
    if (!requestedLimit || items.length > requestedLimit) {
      return { items, total: items.length, page: 1, limit: Math.max(1, items.length), totalPages: 1 };
    }
    const mayHaveMore = items.length === requestedLimit;
    return {
      items,
      total: (requestedPage - 1) * requestedLimit + items.length,
      page: requestedPage,
      limit: requestedLimit,
      totalPages: mayHaveMore ? requestedPage + 1 : requestedPage,
    };
  }

  const limit = num(meta.limit ?? meta.per_page ?? meta.pageSize, requestedLimit || items.length || 1);
  const total = num(rawTotal, items.length);
  const page = Math.max(1, num(meta.page ?? meta.currentPage ?? meta.current_page, requestedPage));
  const computedPages = limit > 0 ? Math.ceil(total / limit) : 1;
  const totalPages = Math.max(1, num(rawPages, computedPages));
  return { items, total, page, limit, totalPages };
}

const pickString = (...values) => {
  for (const v of values) {
    if (typeof v === "string" && v.trim() && !isUuid(v)) return v.trim();
  }
  return "";
};

const joinName = (obj) => {
  if (!obj || typeof obj !== "object") return "";
  const first = pickString(obj.first_name, obj.firstName);
  const last = pickString(obj.last_name, obj.lastName);
  return [first, last].filter(Boolean).join(" ");
};

/**
 * Human name for any attendance entity (record, request, anomaly, user).
 * Order: flat name → nested user/employee → profile first/last → email.
 * Never returns a UUID.
 */
export function personName(entity, fallback = "Unknown employee") {
  if (!entity || typeof entity !== "object") return fallback;
  const nested = [entity.user, entity.employee, entity.User, entity.Employee, entity.requester].filter(
    (x) => x && typeof x === "object"
  );

  const direct = pickString(entity.name, entity.employee_name, entity.full_name, entity.user_name, entity.fullName, entity.display_name, entity.profile?.display_name);
  if (direct) return direct;
  const own = joinName(entity) || joinName(entity.profile);
  if (own) return own;

  for (const n of nested) {
    const label = pickString(n.name, n.full_name, n.fullName, n.display_name, n.profile?.display_name) || joinName(n.profile) || joinName(n);
    if (label) return label;
  }

  const email = pickString(entity.email, entity.identifier, ...nested.map((n) => n.email || n.identifier));
  return email || fallback;
}

/** Employee code if present (never a UUID). */
export function employeeCode(entity) {
  if (!entity || typeof entity !== "object") return "";
  const nested = [entity.user, entity.employee, entity.profile, entity.user?.profile, entity.employee?.profile];
  return pickString(
    entity.employee_code,
    entity.emp_code,
    entity.employeeCode,
    ...nested.map((n) => n?.employee_code || n?.emp_code || n?.employeeCode)
  );
}

/** Email / login identifier if present. */
export function personEmail(entity) {
  if (!entity || typeof entity !== "object") return "";
  return pickString(entity.email, entity.identifier, entity.user?.email, entity.user?.identifier, entity.employee?.email);
}

/** Initials for avatars. */
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Stable id across `id` / `_id` / `request_id` variants. */
export const entityId = (entity) => entity?.id ?? entity?._id ?? entity?.request_id ?? entity?.uuid ?? null;

/** Department label from flat or nested shapes. */
export function departmentName(entity) {
  if (!entity || typeof entity !== "object") return "";
  return pickString(
    entity.department_name,
    typeof entity.department === "string" ? entity.department : entity.department?.name,
    entity.user?.department_name,
    entity.profile?.department?.name
  );
}
