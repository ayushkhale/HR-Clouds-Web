// ─────────────────────────────────────────────────────────────────────────────
// leave.api.js — All Leave Management endpoints
//
// Organized by role hierarchy: HR → Manager → Employee
// Within each role, APIs are grouped by sub-module
//
// API Base: /api/v1/leaves
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

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
   * Hard delete — cascades to all child entitlements.
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
   * Assigns a template to an employee. Side effect: pro-rata credits balance ledger.
   * @param {string} userId
   * @param {Object} payload - { template_id }
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
   * @param {Object} payload - { assigned_annual_quota?, accrual_type?, max_carry_forward?, probation_restriction_days?, max_negative_balance? }
   */
  overrideConfig: (userId, leaveTypeId, payload) =>
    request(`/leaves/users/${userId}/configs/${leaveTypeId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

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
   * @param {Object} payload - {
   *   leave_type_id, start_date (YYYY-MM-DD), end_date (YYYY-MM-DD),
   *   is_half_day?, half_day_type? ('first_half'|'second_half'), reason?, document_url?
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
