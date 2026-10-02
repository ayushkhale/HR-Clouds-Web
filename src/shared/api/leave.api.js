// ─────────────────────────────────────────────────────────────────────────────
// leave.api.js — All Leave Management endpoints
//
// Organized by role hierarchy: HR → Manager → Employee
// Within each role, APIs are grouped by sub-module
//
// API Base: /api/v1/leaves
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

// Path params are URI-encoded: a hand-edited /employees/:userId URL must never
// change which endpoint is called.
const seg = (value) => encodeURIComponent(String(value ?? ""));

const post = (path, payload) =>
  request(path, payload === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(payload) });
const del = (path) => request(path, { method: "DELETE" });

/**
 * GET /leaves/assignments REJECTS an unknown query key with 400 VALIDATION_ERROR
 * (md_updates/phase7_api_analysis.md §1), so filters are allow-listed here
 * rather than passed through: a typo would blank the screen instead of being
 * ignored. Never send `org_id`.
 */
const ASSIGNMENT_FILTERS = ["template_id", "coverage", "has_overrides", "department_id", "role", "q", "page", "limit"];

function filterQuery(params, allowed) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (!allowed.includes(key)) {
      if (import.meta.env?.DEV) console.warn(`[leaveAPI] "${key}" is not a supported filter here and was not sent.`);
      return;
    }
    search.append(key, String(value));
  });
  const str = search.toString();
  return str ? `?${str}` : "";
}

export const leaveAPI = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  HR
  //  Admin-level APIs for configuring leave types, policies, and overrides
  // ═══════════════════════════════════════════════════════════════════════════

  // ── HR › Leave Types ───────────────────────────────────────────────────────
  //    Create/update/deactivate leave type definitions (Casual, Sick, etc.)
  /**
   * GET /leaves/types
   * @param {Object} params - e.g. { include_inactive: true }
   */
  getLeaveTypes: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/leaves/types${query ? `?${query}` : ""}`);
  },

  /**
   * POST /leaves/types
   * @param {Object} payload - { name, code, is_paid, sandwich_rule_applies, description?, requires_document_threshold? }
   */
  createLeaveType: (payload) =>
    request("/leaves/types", { method: "POST", body: JSON.stringify(payload) }),

  /**
   * PUT /leaves/types/:id
   * @param {string} id
   * @param {Object} payload - partial or full leave type fields
   */
  updateLeaveType: (id, payload) =>
    request(`/leaves/types/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  /**
   * DELETE /leaves/types/:id
   * Soft-delete. Use force=true to bypass ACTIVE_BALANCES_EXIST (but not PENDING_REQUESTS_EXIST).
   * @param {string} id
   * @param {boolean} force - pass true to force deactivate despite existing balances
   */
  deleteLeaveType: (id, force = false) =>
    request(`/leaves/types/${id}${force ? "?force=true" : ""}`, { method: "DELETE" }),

  // ── HR › Policy Templates ─────────────────────────────────────────────────
  //    Template containers that hold entitlement quotas per leave type
  /**
   * GET /leaves/templates
   * Each template carries `assigned_user_count` — how many people are on it.
   */
  getTemplates: () => request("/leaves/templates"),

  /**
   * POST /leaves/templates
   * @param {Object} payload - { name, description? }
   */
  createTemplate: (payload) =>
    request("/leaves/templates", { method: "POST", body: JSON.stringify(payload) }),

  /**
   * PUT /leaves/templates/:id
   * @param {string} id
   * @param {Object} payload - { name?, description? }
   */
  updateTemplate: (id, payload) =>
    request(`/leaves/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  /**
   * DELETE /leaves/templates/:id
   * Hard delete — cascades to all child entitlements. Refused with
   * 409 TEMPLATE_IN_USE (details.assigned_user_count) while anyone is on it.
   * @param {string} id
   */
  deleteTemplate: (id) =>
    request(`/leaves/templates/${id}`, { method: "DELETE" }),

  // ── HR › Entitlements ──────────────────────────────────────────────────────
  //    Per-leave-type quotas within a policy template
  /**
   * POST /leaves/templates/:templateId/entitlements
   * @param {string} templateId
   * @param {Object} payload - { leave_type_id, annual_quota, accrual_type, max_carry_forward?, probation_restriction_days?, max_negative_balance? }
   */
  addEntitlement: (templateId, payload) =>
    request(`/leaves/templates/${templateId}/entitlements`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * PUT /leaves/templates/:templateId/entitlements/:entitlementId
   * NOTE: leave_type_id is IMMUTABLE — never send it in the payload.
   * @param {string} templateId
   * @param {string} entitlementId
   * @param {Object} payload - any fields except leave_type_id
   */
  updateEntitlement: (templateId, entitlementId, payload) =>
    request(`/leaves/templates/${templateId}/entitlements/${entitlementId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  /**
   * DELETE /leaves/templates/:templateId/entitlements/:entitlementId
   * @param {string} templateId
   * @param {string} entitlementId
   */
  deleteEntitlement: (templateId, entitlementId) =>
    request(`/leaves/templates/${templateId}/entitlements/${entitlementId}`, {
      method: "DELETE",
    }),

  // ── HR › Policy Assignment & Config Overrides ──────────────────────────────
  //    Assign a template to an employee, override individual configs
  /**
   * POST /leaves/users/:userId/assign-policy
   * Assigns a template to an employee. Side effect: pro-rata credits the balance
   * ledger from 1 January, or from their joining date if they joined this year.
   * Taken leave is NEVER reset.
   *
   * Reply carries `data: { assignment_id, outcome, types_added, types_removed,
   * types_updated, overrides_replaced }`. `outcome: "unchanged"` means they were
   * already on this policy and nothing was written — custom rules are kept.
   *
   * Errors: 400 TEMPLATE_EMPTY, 400 NO_JOINING_DATE, 409 EMPLOYEE_INACTIVE,
   * 400 EFFECTIVE_DATE_NOT_SUPPORTED.
   * @param {string} userId
   * @param {Object} payload - { template_id, effective_from? } — `effective_from`
   *   must be TODAY (IST). Future dating is not implemented, so callers omit it
   *   and let the server date it rather than offering a picker that only has one
   *   legal value.
   */
  assignPolicy: (userId, payload) =>
    request(`/leaves/users/${userId}/assign-policy`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * PUT /leaves/users/:userId/configs/:leaveTypeId
   * Overrides an individual employee's leave config for one leave type.
   * Side effect: if upfront accrual and quota increases, balance is auto-credited.
   * @param {string} userId
   * @param {string} leaveTypeId - the leave_type ID (not config ID)
   * Reply now also carries `overridden_fields` — which fields differ from the policy.
   * @param {Object} payload - { assigned_annual_quota?, accrual_type?, max_carry_forward?, probation_restriction_days?, max_negative_balance? }
   */
  overrideConfig: (userId, leaveTypeId, payload) =>
    request(`/leaves/users/${userId}/configs/${leaveTypeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  /**
   * DELETE /leaves/users/:userId/configs/:leaveTypeId
   * Puts one leave type back to the policy's own rules, undoing a customisation.
   * Adjusts the balance the same way the PUT does.
   * Outcomes: `data.outcome` is "reverted", or "unchanged" when nothing was customised.
   * Errors: 409 NO_POLICY_DEFAULT (assigned before policies were tracked), 404 CONFIG_NOT_FOUND.
   * @param {string} userId
   * @param {string} leaveTypeId
   */
  revertUserConfig: (userId, leaveTypeId) =>
    del(`/leaves/users/${seg(userId)}/configs/${seg(leaveTypeId)}`),

  // ── HR › Assignment Ledger (who is on which policy) ────────────────────
  //    Phase 7. Before it the backend only copied a template's values onto a
  //    person and kept no record of WHICH policy they were on; these endpoints
  //    read that new record. `hr` only — admin / super-admin are platform
  //    accounts with no organisation and are refused.
  /**
   * GET /leaves/assignments
   * One row per active member, INCLUDING people with no policy
   * (`coverage: "none"`, `assignment: null`) — those are the rows HR opens this
   * screen for, so they are never filtered out by default.
   * @param {Object} params - { template_id?, coverage?: "on_policy"|"legacy"|"none",
   *   has_overrides?, department_id?, role?, q?, page?, limit? } — limit max 100.
   */
  getAssignments: (params = {}) =>
    request(`/leaves/assignments${filterQuery(params, ASSIGNMENT_FILTERS)}`),

  /**
   * GET /leaves/assignments/summary
   * The coverage tiles in one request: { on_policy, legacy, unassigned, with_overrides, templates[] }.
   */
  getAssignmentSummary: () => request("/leaves/assignments/summary"),

  /**
   * GET /leaves/users/:userId/leave-config
   * One person's rules per leave type, each with three value sets: `effective`
   * (what applies now), `policy_default` (what Revert restores) and
   * `template_current` (what the template says today — it differs when the
   * template was edited after this person was assigned, because editing a
   * template does not move people already on it).
   * Legacy configs return null for policy_default / template_current / the
   * override flags: that reads "assigned before policies were tracked", never
   * "no rules".
   * @param {string} userId
   */
  getUserLeaveConfig: (userId) => request(`/leaves/users/${seg(userId)}/leave-config`),

  /**
   * GET /leaves/users/:userId/assignments
   * One person's assignment history, newest first, ended ones included (max 100).
   * @param {string} userId
   */
  getUserAssignments: (userId) => request(`/leaves/users/${seg(userId)}/assignments`),

  /**
   * POST /leaves/assignments/preview — writes NOTHING.
   * Returns { matched, cap, over_cap, preview_token, unchanged[], changing[], blocked[] }.
   * Send the `preview_token` on to bulkAssignPolicy; anything changed in between
   * is a 409 PREVIEW_STALE.
   * @param {Object} payload - { template_id, target_departments?, target_locations?,
   *   target_employment_types?, target_job_statuses?, included_users?, excluded_users?,
   *   scope?: "selection"|"all" } — `scope: "all"` is REQUIRED when every array is
   *   empty, otherwise 400 TARGETING_REQUIRED.
   */
  previewBulkAssign: (payload) => post("/leaves/assignments/preview", payload),

  /**
   * POST /leaves/assignments/bulk
   * One person per transaction, so partial success is real: HTTP 200 carries
   * { assigned[], skipped[], failed[] } and the UI must report per person.
   * Cap 200 people (400 BULK_LIMIT_EXCEEDED with details.cap). Retry-safe —
   * people already done come back as `skipped`.
   * @param {Object} payload - the preview body plus `preview_token`.
   */
  bulkAssignPolicy: (payload) => post("/leaves/assignments/bulk", payload),

  /**
   * POST /leaves/assignments/:id/end
   * Balances are left exactly as they are; no leave can be applied for after
   * `effective_to` (inclusive) and monthly accrual stops.
   * Errors: 409 ASSIGNMENT_HAS_LEAVES_AFTER_END (details.request_ids must be
   * cancelled or rejected first), 409 ASSIGNMENT_ALREADY_ENDED,
   * 400 EFFECTIVE_TO_IN_PAST, 400 INVALID_DATE, 404 ASSIGNMENT_NOT_FOUND.
   * There is deliberately NO delete: a started assignment's balances are already
   * written and cannot be honestly reversed.
   * @param {string} id
   * @param {Object} payload - { effective_to: "YYYY-MM-DD", reason? }
   */
  endAssignment: (id, payload) => post(`/leaves/assignments/${seg(id)}/end`, payload),

  // ── HR › Employee Balances ─────────────────────────────────────────────────
  //    View any employee's leave balance ledger
  /**
   * GET /leaves/users/:userId/balances
   * HR view of any employee's leave balance ledger.
   * @param {string} userId
   * @param {number|null} year - defaults to current year on backend
   */
  getUserBalances: (userId, year = null) => {
    const query = year ? `?year=${year}` : "";
    return request(`/leaves/users/${userId}/balances${query}`);
  },

  // ── HR › Automation & Maintenance ──────────────────────────────────────────
  //    Trigger monthly accruals and year-end rollovers
  /**
   * POST /leaves/automation/accrual/run
   * Triggers monthly accrual calculation for all active employees.
   * @param {string|null} referenceDate - optional YYYY-MM-DD to run for a specific month.
   */
  runAccrual: (referenceDate = null) =>
    request("/leaves/automation/accrual/run", {
      method: "POST",
      body: JSON.stringify(referenceDate ? { reference_date: referenceDate } : {}),
    }),

  /**
   * POST /leaves/automation/rollover/run
   * Triggers year-end balance rollover.
   * @param {string|null} referenceDate - optional YYYY-MM-DD to run across a year boundary.
   */
  runRollover: (referenceDate = null) =>
    request("/leaves/automation/rollover/run", {
      method: "POST",
      body: JSON.stringify(referenceDate ? { reference_date: referenceDate } : {}),
    }),


  // ═══════════════════════════════════════════════════════════════════════════
  //  MANAGER
  //  Team leave oversight and approval workflows
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Manager › Team Leave Requests ──────────────────────────────────────────
  //    View pending requests, full team history, and per-member drill-downs
  /**
   * GET /leaves/team/requests/pending
   * Returns pending leave requests from direct reports.
   */
  getTeamPendingRequests: () => request("/leaves/team/requests/pending"),

  /**
   * GET /leaves/team/requests
   * Fetches team leave history (any status).
   */
  getTeamRequests: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/leaves/team/requests${qs ? `?${qs}` : ""}`);
  },

  /**
   * GET /leaves/team/member/:userId/requests
   * Fetches a specific direct report's leave history.
   * @param {string} userId
   * @param {Object} params - optional { status, page, limit }
   */
  getTeamMemberRequests: (userId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/leaves/team/member/${userId}/requests${qs ? `?${qs}` : ""}`);
  },

  /**
   * GET /leaves/team/member/:userId/balances
   * Fetches a specific direct report's leave balances.
   */
  getTeamMemberBalances: (userId) => request(`/leaves/team/member/${userId}/balances`),

  // ── Manager › Leave Approvals ──────────────────────────────────────────────
  //    Approve or reject pending leave requests
  /**
   * POST /leaves/requests/:id/approve
   * Approves a pending request. May fail with 403 (BOLA) or 400 (conflict: employee present).
   * @param {string} id
   */
  approveRequest: (id) =>
    request(`/leaves/requests/${id}/approve`, { method: "POST" }),

  /**
   * POST /leaves/requests/:id/reject
   * Requires mandatory rejection_reason.
   * @param {string} id
   * @param {Object} payload - { rejection_reason: string (required, max 1000 chars) }
   */
  rejectRequest: (id, payload) =>
    request(`/leaves/requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),


  // ═══════════════════════════════════════════════════════════════════════════
  //  EMPLOYEE
  //  Self-service APIs — own leave types, balances, requests
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Employee › Leave Types & Balances ──────────────────────────────────────
  //    View own configured leave types and current balance wallet
  /**
   * GET /leaves/my-leave-types
   * Fetches active leave types tailored to the caller's per-user config.
   */
  getMyLeaveTypes: () => request("/leaves/my-leave-types"),

  /**
   * GET /leaves/my-balances
   * @param {number|null} year
   */
  getMyBalances: (year = null) => {
    const query = year ? `?year=${year}` : "";
    return request(`/leaves/my-balances${query}`);
  },

  // ── Employee › Leave Requests ──────────────────────────────────────────────
  //    Submit, view, and cancel own leave applications
  /**
   * GET /leaves/my-requests
   * Returns own leave request history ordered by created_at DESC.
   */
  getMyRequests: () => request("/leaves/my-requests"),

  /**
   * GET /leaves/requests/:id
   * Fetches details of a specific leave request belonging to the user.
   */
  getLeaveRequest: (id) => request(`/leaves/requests/${id}`),

  /**
   * POST /leaves/request
   * Submit a leave application. Backend auto-handles holidays/weekends/sandwich/LWP.
   *
   * Two ways to attach evidence, and only one of them per request:
   *   `document_url`  a link the applicant pasted, stored as given
   *   `document_id`   a document of theirs already in this portal (Documents
   *                   Phase 5). The server checks it belongs to the applicant
   *                   and is in an evidence-grade state (`available` or
   *                   `pending_verification`), then stores the relative path
   *                   `/api/v1/documents/attachments/:id/view-url` in
   *                   `document_url`. That path is NOT a link a browser can
   *                   follow — see shared/documents/AttachmentLink.jsx, which
   *                   every screen showing a leave attachment goes through.
   *
   * @param {Object} payload - {
   *   leave_type_id, start_date (YYYY-MM-DD), end_date (YYYY-MM-DD),
   *   is_half_day?, half_day_type? ('first_half'|'second_half'), reason?,
   *   document_url?, document_id?
   * }
   */
  submitRequest: (payload) =>
    request("/leaves/request", { method: "POST", body: JSON.stringify(payload) }),

  /**
   * POST /leaves/requests/:id/cancel
   * Future leave → immediate cancel. Past leave → cancellation_pending (needs manager approval).
   * Check response.message for "pending manager approval" string to show correct toast.
   * @param {string} id - leave request UUID
   */
  cancelRequest: (id) =>
    request(`/leaves/requests/${id}/cancel`, { method: "POST" }),
};
