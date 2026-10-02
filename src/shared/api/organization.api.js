// ─────────────────────────────────────────────────────────────────────────────
// organization.api.js — Organization, employee, department & location endpoints
//
// Organized by role hierarchy: HR → Manager → Employee
// Within each role, APIs are grouped by sub-module
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

export const organizationAPI = {

  // ═══════════════════════════════════════════════════════════════════════════
  //  HR
  //  Admin-level APIs for org setup, invitations, employees, depts, locations
  // ═══════════════════════════════════════════════════════════════════════════

  // ── HR › Organization Registration ─────────────────────────────────────────
  //    Initial org setup with plan selection and payment verification
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

  // ── HR › Invitations ───────────────────────────────────────────────────────
  //    Invite users, revoke/resend invitations
  /**
   * HR invites a user to the organization
   * POST /organizations/users/invite
   * @param {{ email, role, reporting_person?, department_id?, make_hod? }} payload
   */
  inviteUser(payload) {
    return request("/organizations/users/invite", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * List invitations sent by this organisation.
   * GET /organizations/users/invite
   *
   * Same path as the POST that creates them, differing only by verb. Contract:
   * `public/ref docs/md_updates/invitation_list_manager_daily_log_and_type_contracts_2026_09_24.md` §1.
   *
   * HR sees the whole org; a manager sees only invitations they sent. `status`
   * is repeatable and derived on read. Unknown keys are silently DROPPED, not
   * rejected — a typo returns an unfiltered page. Answers 500 until migration
   * 00052 is applied; the Invites screen shows a plain notice for that.
   *
   * @param {{ status?: string|string[], q?: string, role?: string,
   *           department_id?: string, limit?: number, offset?: number }} params
   */
  listInvitations(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) value.forEach((v) => v !== "" && search.append(key, v));
      else search.append(key, String(value));
    });
    const query = search.toString();
    return request(`/organizations/users/invite${query ? `?${query}` : ""}`);
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

  // ── HR › Employee Management ───────────────────────────────────────────────
  //    List, view, update, deactivate, and delete employees
  /**
   * Get organization employees.
   * GET /organizations/employees?purpose=emp_report&include_inactive=true
   *
   * SCREENS DO NOT CALL THIS. It is paginated (100 per page) and its `purpose`
   * decides which fields come back — `shift_assignment` and `all_*_list` carry
   * no `avatar_url` — so calling it per screen gave the same person a photo on
   * one and initials on the next, and lost everyone past page one. The whole
   * app reads `useEmployeeDirectory()`
   * (shared/contexts/EmployeeDirectoryContext), which pages the widest
   * projection once per session and shares it.
   * @param {Object} params
   */
  getEmployees(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/organizations/employees${query ? `?${query}` : ""}`);
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

  /**
   * Transfer an employee/manager to a new department and rewire reporting lines.
   * PUT /organizations/users/:id/department-transfer
   * @param {string} id - The global user_id
   * @param {Object} payload - { role, new_department_id, new_manager_id, is_current_hod, is_new_hod, replacement_hod_id, old_dept_fallback_manager_id }
   */
  transferDepartment(id, payload) {
    return request(`/organizations/users/${id}/department-transfer`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  // ── HR › Departments ───────────────────────────────────────────────────────
  //    Create and manage organizational departments
  //
  //    THE HEAD IS NOW A MEMBER OF THE DEPARTMENT THEY HEAD (changed
  //    2026-10-02, `md_organization/3_org_structure_api.md` §4). Assigning a
  //    head writes `department_id` on them when they have none; a candidate who
  //    already belongs to a DIFFERENT department is refused with
  //    `409 HOD_IN_OTHER_DEPARTMENT` rather than silently relocated, because
  //    moving someone has to move their reporting lines and their old
  //    department's headship too — `transferDepartment()` with
  //    `is_new_hod: true` does both atomically.
  //
  //    Second-order effect worth knowing before you touch the deactivate path:
  //    because the head now counts as a member, `updateDepartment` with
  //    `is_active: false` can return `409 DEPARTMENT_IN_USE` for a department
  //    that reported zero members before.
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

  // ── HR › Locations (Geofencing) ────────────────────────────────────────────
  //    Office location CRUD for geofence-based clock-in/out
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

  // ── HR › My Own Job Profile (fill-once) ───────────────────────────────────
  //    Contract: `md_organization/4_org_employee_api.md` §11. HR only — a
  //    manager or employee gets 403, so the UI is hidden for them rather than
  //    offered and refused.
  //
  //    These exist because the org CREATOR is provisioned before the org has
  //    any structure: no joining date, department, location, designation,
  //    employment type, work mode, gender or marital status. Every other writer
  //    of those fields (§5 transfer, §10 hr-fields) refuses a self-edit, and the
  //    creator is normally the only HR — so nobody could fill them, and that one
  //    blank joining date is enough to keep them out of leave assignment
  //    (NO_JOINING_DATE) and out of every payroll run.
  /**
   * What is still blank on the caller's own job profile, and whether the org has
   * the structure needed to fill it.
   * GET /organizations/me/setup-status
   * @returns `{ is_complete, missing_fields, locked_fields, current_values,
   *             org_structure: { locations_count, departments_count,
   *                              can_set_location, can_set_department } }`
   */
  getMySetupStatus() {
    return request("/organizations/me/setup-status");
  },

  /**
   * Fill blanks on the caller's own job profile. **Fill-once per field.**
   * PATCH /organizations/me/job-profile
   *
   * Three rules the caller must have already applied — build the body with
   * `jobProfileBody()` (`shared/organization/profileSetupMeta.js`) and they are:
   *  · send ONLY the fields being filled; `null` and `""` are rejected outright,
   *    so a key you have no value for is omitted, never nulled;
   *  · never send a key listed in `locked_fields` — the SQL guard is
   *    `WHERE column IS NULL`, so the second write loses with
   *    `409 FIELD_ALREADY_SET` rather than silently overwriting;
   *  · `reason` is not a field on its own — a body carrying only `reason` is a
   *    400.
   *
   * Anything outside the eight fields (`employee_code`, `job_status`, `dob`,
   * addresses…) is silently stripped server-side, so a stray key fails quietly
   * instead of erroring — which is exactly why the body is built from a
   * whitelist rather than from form state.
   *
   * @param {Object} payload `{ joining_date?, department_id?, location_id?,
   *   designation?, employment_type?, work_mode?, gender?, marital_status?,
   *   reason? }`
   * @returns `{ profile, changes, setup_status }` — `setup_status` is recomputed
   *   after the write, so the wizard advances on it without a second GET.
   */
  updateMyJobProfile(payload) {
    return request("/organizations/me/job-profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },


  // ═══════════════════════════════════════════════════════════════════════════
  //  MANAGER
  //  Direct report profile management
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Manager › Direct Report Profiles ───────────────────────────────────────
  //    Update a direct report's basic profile fields
  /**
   * PATCH /organizations/employees/:id
   * Manager updates direct report's profile
   */
  updateEmployeeProfile(id, payload) {
    return request(`/organizations/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },


  // ═══════════════════════════════════════════════════════════════════════════
  //  EMPLOYEE
  //  Self-service APIs — own profile, org directory
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Employee › My Profile ──────────────────────────────────────────────────
  //    View and update own personal profile fields
  /**
   * Fetch the logged-in user's own full profile
   * GET /organizations/me
   */
  getMyProfile() {
    return request("/organizations/me");
  },

  /**
   * Update the logged-in user's own personal fields (whitelisted)
   * PATCH /organizations/me
   * @param {Object} payload - Allowed fields only (dept/designation/gender/marital_status/employee_code are locked)
   */
  updateMyProfile(payload) {
    return request("/organizations/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  // ── Employee › Profile Photo (presigned handshake) ─────────────────────────
  //    Contract: `public/ref docs/md_updates/5_org_details_and_hierarchy_api.md` §3.
  //    Step 2 (the PUT of the bytes) goes straight to storage, not through
  //    `request()` — see `shared/organization/avatarUpload.js`.
  /**
   * Step 1 — mint a presigned PUT for the caller's own photo.
   * POST /organizations/me/avatar/upload-url
   * @param {{ content_type: "image/png"|"image/jpeg"|"image/webp", size_bytes: number, file_name?: string }} payload
   * @returns `{ upload_url, storage_key_token, expires_in, required_headers }`
   */
  requestAvatarUploadUrl(payload) {
    return request("/organizations/me/avatar/upload-url", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Step 3 — verify the uploaded object and make it the caller's photo.
   * POST /organizations/me/avatar/confirm
   * Idempotent: replaying the same token returns the current profile.
   * @param {{ storage_key_token: string }} payload
   * @returns the caller's full profile (same shape as GET /organizations/me)
   */
  confirmAvatarUpload(payload) {
    return request("/organizations/me/avatar/confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Everyone › Company Profile & Org Chart ─────────────────────────────────
  //    Both are whole-org reads open to every tenant role.
  /**
   * The company detail sheet: org core, company profile, HR contacts, stats.
   * GET /organizations/details
   *
   * `profile.gst_number` / `profile.company_pan_number` are returned to HR only;
   * for everyone else the keys are ABSENT (not null). `profile` itself may be null.
   */
  getOrganizationDetails() {
    return request("/organizations/details");
  },

  // ── HR › Company Profile (edit + logo) ─────────────────────────────────────
  //    Contract: `public/ref docs/6_org_profile_management_api.md`. HR only.
  /**
   * Change the company's own details. PARTIAL — send only what changed, and at
   * least one field, or the server rejects it (`.min(1)`).
   * PATCH /organizations/profile
   *
   * `org_name` also renames the organisation itself (one transaction). Nullable
   * fields take `null` or "" to clear. Unknown keys are stripped, so the logo
   * CANNOT be set here — it has its own handshake below.
   * @param {Object} payload only the changed keys
   * @returns the refreshed GET /organizations/details payload
   */
  updateOrganizationProfile(payload) {
    return request("/organizations/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Step 1 of the company-logo handshake — mint a presigned PUT.
   * POST /organizations/logo/upload-url
   * PNG/JPEG/WebP, ≤ 5 MB. 50 per hour per org (429 `LOGO_RATE_LIMITED`).
   * @param {{ content_type: "image/png"|"image/jpeg"|"image/webp", size_bytes: number, file_name?: string }} payload
   * @returns `{ upload_url, storage_key_token, expires_in, required_headers }`
   */
  requestLogoUploadUrl(payload) {
    return request("/organizations/logo/upload-url", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * Step 3 — verify the uploaded object and make it the company logo.
   * POST /organizations/logo/confirm
   * Idempotent: replaying a committed token is a no-op.
   * @param {{ storage_key_token: string }} payload
   * @returns the refreshed GET /organizations/details payload
   */
  confirmLogoUpload(payload) {
    return request("/organizations/logo/confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /**
   * The live reporting tree of every active member.
   * GET /organizations/hierarchy → `{ total_members, roots: Node[] }`, each Node
   * carrying `children` recursively. `roots` is a forest (several top nodes).
   * No pagination. Avatar URLs are presigned and last ~5 minutes.
   */
  getOrganizationHierarchy() {
    return request("/organizations/hierarchy");
  },

  // ── Employee › Organization Directory ──────────────────────────────────────
  //    Browse colleagues across the organization (public-safe data)
  /**
   * Fetch the public-safe employee directory
   * GET /organizations/directory
   * @param {Object} params - e.g. { search, department, page, limit }
   */
  getDirectory(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/organizations/directory${query ? `?${query}` : ""}`);
  },

  // ── Employee › Invitation Acceptance (Public) ──────────────────────────────
  //    Validate and accept an org invitation (used during onboarding)
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
};
