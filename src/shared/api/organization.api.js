// ─────────────────────────────────────────────────────────────────────────────
// organization.api.js — Organization, employee, department & location endpoints
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

export const organizationAPI = {
  /**
   * Initiate organization registration (with plan selection)
   * POST /organizations/register/initiate
   * @param {Object} payload — { plan_code, org_name, org_alias, industry, size, website, phone_number, gst_number, company_pan_number }
   */
  initiateRegistration(payload) {
    return request("/organizations/register/initiate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Verify Razorpay payment after checkout
   * POST /organizations/register/verify-payment
   * @param {{ razorpay_order_id, razorpay_payment_id, razorpay_signature, org_id }} payload
   */
  verifyPayment(payload) {
    return request("/organizations/register/verify-payment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * HR invites a user to the organization
   * POST /organizations/users/invite
   * @param {{ email, role }} payload
   */
  inviteUser(payload) {
    return request("/organizations/users/invite", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Revoke a pending invitation
   * POST /organizations/users/invite/revoke
   * @param {{ email }} payload
   */
  revokeInvitation(payload) {
    return request("/organizations/users/invite/revoke", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Resend a pending invitation
   * POST /organizations/users/invite/resend
   * @param {{ email }} payload
   */
  resendInvitation(payload) {
    return request("/organizations/users/invite/resend", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Validate an invitation token (public — no auth required)
   * GET /organizations/invitations/validate?token=XYZ
   * @param {string} token
   */
  validateInvitation(token) {
    return request(`/organizations/invitations/validate?token=${encodeURIComponent(token)}`, {
      method: "GET",
      headers: {},  // no auth header
    });
  },

  /**
   * Accept an invitation
   * POST /organizations/invitations/accept
   * For new users: { token, password } — no auth header
   * For existing users: { token } — with Bearer auth header
   * @param {{ token, password? }} payload
   * @param {boolean} isNewUser
   */
  acceptInvitation(payload, isNewUser = true) {
    const options = {
      method: "POST",
      body: JSON.stringify(payload),
    };
    // New users don't have an auth token
    if (isNewUser) {
      options.headers = {};  // override — no auth header
    }
    return request("/organizations/invitations/accept", options);
  },

  /**
   * Get organization employees (for shift assignments / dropdowns)
   * GET /organizations/employees?purpose=shift_assignment
   * @param {Object} params
   */
  getEmployees(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/organizations/employees${query ? `?${query}` : ""}`);
  },

  getDepartments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/organizations/departments${query ? `?${query}` : ""}`);
  },
  createDepartment(payload) {
    return request("/organizations/departments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateDepartment(id, payload) {
    return request(`/organizations/departments/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get organization locations
   * GET /organizations/locations
   */
  getLocations(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/organizations/locations${query ? `?${query}` : ""}`);
  },
  createLocation(payload) {
    return request("/organizations/locations", { method: "POST", body: JSON.stringify(payload) });
  },
  updateLocation(id, payload) {
    return request(`/organizations/locations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },

  /**
   * Get deep, eager-loaded profile data for a specific employee
   * GET /organizations/employees/:id
   * @param {string} id - The global user_id
   */
  getEmployee(id) {
    return request(`/organizations/employees/${id}`);
  },

  /**
   * Deactivates an employee's access to the specific organization
   * PATCH /organizations/employees/:id/status
   * @param {string} id - The global user_id
   * @param {{ is_active: boolean }} payload
   */
  updateEmployeeStatus(id, payload) {
    return request(`/organizations/employees/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Permanently severs an employee's access (soft-delete)
   * DELETE /organizations/employees/:id
   * @param {string} id - The global user_id
   */
  deleteEmployee(id) {
    return request(`/organizations/employees/${id}`, {
      method: "DELETE",
    });
  },
};
