// ─────────────────────────────────────────────────────────────────────────────
// api.js — Centralized API Client for HR Clouds
// All network calls across Auth, HRMS, ERP, Payroll etc. are made from here.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://development.hrclouds.in/api/v1"

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch wrapper — handles headers, JSON, and error responses centrally
// ─────────────────────────────────────────────────────────────────────────────

async function request(endpoint, options = {}) {
  const token = tokenHelper.get();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Like request(), but uses an explicitly provided token instead of the stored one
async function requestWithToken(endpoint, customToken, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(customToken ? { Authorization: `Bearer ${customToken}` } : {}),
    ...(options.headers || {}),
  };

  const config = { ...options, headers };
  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN HELPERS — localStorage access / refresh token management
// ─────────────────────────────────────────────────────────────────────────────

export const tokenHelper = {
  save(accessToken, refreshToken) {
    if (accessToken && accessToken !== "undefined" && accessToken !== "null") {
      localStorage.setItem("hrclouds_token", accessToken);
    }
    if (refreshToken && refreshToken !== "undefined" && refreshToken !== "null") {
      localStorage.setItem("hrclouds_refresh_token", refreshToken);
    }
  },
  get() {
    const token = localStorage.getItem("hrclouds_token");
    if (!token || token === "undefined" || token === "null") return null;
    return token;
  },
  getRefresh() {
    const token = localStorage.getItem("hrclouds_refresh_token");
    if (!token || token === "undefined" || token === "null") return null;
    return token;
  },
  clear() {
    localStorage.removeItem("hrclouds_token");
    localStorage.removeItem("hrclouds_refresh_token");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

export const authAPI = {
  /**
   * Step 1 of Signup — sends OTP to the user's email
   * POST /auth/signup
   * @param {{ identifier: string }} payload
   * @returns {{ success, message, requestId, identifier, identifierType, context }}
   */
  initiateSignup({ identifier }) {
    return request("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    });
  },

  /**
   * Step 2 of Signup — verifies OTP and sets password, returns access token
   * POST /auth/signup/verify
   * @param {{ identifier, otp, context, password, requestId }} payload
   * @returns {{ success, message, data: { user: { accessToken, refreshToken, ... } } }}
   */
  verifySignupOtp({ identifier, otp, context, password, requestId }) {
    return request("/auth/signup/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, otp, context, password, requestId }),
    });
  },

  /**
   * Login with email/phone and password
   * POST /auth/login
   * @param {{ identifier: string, password: string }} payload
   * @returns {{ success, message, data: { user: { accessToken, refreshToken, onboarding_step, ... } } }}
   */
  login({ identifier, password }) {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },

  /**
   * Step 1 of Forgot Password — sends OTP to the user's email/phone
   * POST /auth/forgot-password
   * @param {{ identifier: string }} payload
   * @returns {{ success, message, requestId, identifier, identifierType, context }}
   */
  forgotPassword({ identifier }) {
    return request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    });
  },

  /**
   * Step 2 of Forgot Password — verifies OTP and resets password
   * POST /auth/forgot-password/verify
   * @param {{ identifier, otp, context, requestId, newPassword }} payload
   * @returns {{ success, message }}
   */
  verifyForgotPasswordOtp({ identifier, otp, context, requestId, newPassword }) {
    return request("/auth/forgot-password/verify", {
      method: "POST",
      body: JSON.stringify({ identifier, otp, context, requestId, newPassword }),
    });
  },

  /**
   * Resend OTP — invalidates old requestId and returns new one
   * POST /auth/otp/resend
   * @param {{ identifier, context, requestId }} payload
   * @returns {{ success, message, requestId, resendCount }}
   */
  resendOtp({ identifier, context, requestId }) {
    return request("/auth/otp/resend", {
      method: "POST",
      body: JSON.stringify({ identifier, context, requestId }),
    });
  },

  /**
   * Google Authentication — login or auto-register via Google ID Token
   * POST /auth/google
   * @param {{ idToken: string }} payload
   * @returns {{ success, message, data: { user: { accessToken, refreshToken, ... } } }}
   */
  googleAuth({ idToken }) {
    return request("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
  },

  /**
   * Get the currently authenticated user's profile
   * GET /auth/me
   */
  me() {
    return request("/auth/me", { method: "GET" });
  },

  /**
   * Logout — invalidate server-side session
   * POST /auth/logout
   */
  logout() {
    return request("/auth/logout", { method: "POST" });
  },

  /**
   * Select organization after multi-org login
   * POST /auth/select-organization
   * Uses the short-lived selection_token (not the normal access token)
   * @param {{ org_id: string }} payload
   * @param {string} selectionToken — the temporary token from login response
   */
  selectOrganization({ org_id }, selectionToken) {
    return requestWithToken("/auth/select-organization", selectionToken, {
      method: "POST",
      body: JSON.stringify({ org_id }),
    });
  },

  /**
   * Switch to a different organization (already authenticated)
   * POST /auth/switch-organization
   * Uses the current access token
   * @param {{ org_id: string }} payload
   */
  switchOrganization({ org_id }) {
    return request("/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify({ org_id }),
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATION ENDPOINTS — Registration, Payment, Invitations
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// HRMS ENDPOINTS (Placeholder — expand as the module is built)
// ─────────────────────────────────────────────────────────────────────────────

export const hrmsAPI = {
  getEmployees(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/hr/employees${query ? `?${query}` : ""}`);
  },
  getEmployee(id) {
    return request(`/hr/employees/${id}`);
  },
  createEmployee(payload) {
    return request("/hr/employees", { method: "POST", body: JSON.stringify(payload) });
  },
  updateEmployee(id, payload) {
    return request(`/hr/employees/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  deleteEmployee(id) {
    return request(`/hr/employees/${id}`, { method: "DELETE" });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL ENDPOINTS (Placeholder — expand when Payroll module is built)
// ─────────────────────────────────────────────────────────────────────────────

export const payrollAPI = {
  getPayrollRuns(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/payroll/runs${query ? `?${query}` : ""}`);
  },
  runPayroll(payload) {
    return request("/payroll/runs", { method: "POST", body: JSON.stringify(payload) });
  },
  getPayslip(employeeId, period) {
    return request(`/payroll/payslips/${employeeId}?period=${period}`);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE ENDPOINTS (Placeholder)
// ─────────────────────────────────────────────────────────────────────────────

export const attendanceAPI = {
  // ── Employee (self-service) ──────────────────────────────────────
  clockIn: (payload) => request("/attendance/clock-in", { method: "POST", body: JSON.stringify(payload) }),
  clockOut: (payload) => request("/attendance/clock-out", { method: "POST", body: JSON.stringify(payload) }),
  breakStart: () => request("/attendance/break/start", { method: "POST" }),
  breakEnd: () => request("/attendance/break/end", { method: "POST" }),
  getToday: () => request("/attendance/today"),
  getHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/history${query ? `?${query}` : ""}`);
  },
  getSummary: (month, year) => request(`/attendance/summary?month=${month}&year=${year}`),
  submitRegularization: (payload) => request("/attendance/regularization", { method: "POST", body: JSON.stringify(payload) }),
  getMyRegularizations: () => request("/attendance/regularizations"),
  getMyShift: () => request("/attendance/shift"),

  // ── Phase 7 Employee APIs ──────────────────────────────────────
  getDailyLog: (date) => request(`/attendance/daily-log${date ? `?date=${date}` : ""}`),
  getGraphData: (month, year) => request(`/attendance/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),
  getWeeklyCalendar: (date) => request(`/attendance/weekly-calendar${date ? `?date=${date}` : ""}`),
  getTrends: (months) => request(`/attendance/trends${months ? `?months=${months}` : ""}`),


  // ── HR — Policies ────────────────────────────────────────────────
  getPolicies: () => request("/attendance/hr/policies"),
  getPolicy: (id) => request(`/attendance/hr/policies/${id}`),
  createPolicy: (payload) => request("/attendance/hr/policies", { method: "POST", body: JSON.stringify(payload) }),
  updatePolicy: (id, payload) => request(`/attendance/hr/policies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivatePolicy: (id) => request(`/attendance/hr/policies/${id}/deactivate`, { method: "PATCH" }),

  // ── HR — Shifts ──────────────────────────────────────────────────
  getShifts: () => request("/attendance/hr/shifts"),
  getShift: (id) => request(`/attendance/hr/shifts/${id}`),
  createShift: (payload) => request("/attendance/hr/shifts", { method: "POST", body: JSON.stringify(payload) }),
  updateShift: (id, payload) => request(`/attendance/hr/shifts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteShift: (id) => request(`/attendance/hr/shifts/${id}`, { method: "DELETE" }),

  // ── HR — Rotations ───────────────────────────────────────────────
  getRotations: () => request("/attendance/hr/rotations"),
  createRotation: (payload) => request("/attendance/hr/rotations", { method: "POST", body: JSON.stringify(payload) }),
  deleteRotation: (id) => request(`/attendance/hr/rotations/${id}`, { method: "DELETE" }),

  // ── HR — Shift Roster / Assignments ─────────────────────────────
  getAssignments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/shifts/assignments${query ? `?${query}` : ""}`);
  },
  assignShift: (payload) => request("/attendance/hr/shifts/assign", { method: "POST", body: JSON.stringify(payload) }),
  updateAssignment: (id, payload) => request(`/attendance/hr/shifts/assignments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  // ── HR — Holidays ────────────────────────────────────────────────
  getHolidays: (year = new Date().getFullYear()) => request(`/attendance/hr/holidays?year=${year}`),
  createHoliday: (payload) => request("/attendance/hr/holidays", { method: "POST", body: JSON.stringify(payload) }),
  updateHoliday: (id, payload) => request(`/attendance/hr/holidays/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteHoliday: (id) => request(`/attendance/hr/holidays/${id}`, { method: "DELETE" }),

  // ── HR — Weekly Offs ─────────────────────────────────────────────
  getWeeklyOffs: () => request("/attendance/hr/weekly-offs"),
  createWeeklyOff: (payload) => request("/attendance/hr/weekly-offs", { method: "POST", body: JSON.stringify(payload) }),
  updateWeeklyOff: (id, payload) => request(`/attendance/hr/weekly-offs/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteWeeklyOff: (id) => request(`/attendance/hr/weekly-offs/${id}`, { method: "DELETE" }),

  // ── HR — Reports & Lock ──────────────────────────────────────────
  getDailyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/daily${query ? `?${query}` : ""}`);
  },
  getMonthlyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/monthly${query ? `?${query}` : ""}`);
  },
  lockPeriod: (payload) => request("/attendance/hr/lock", { method: "POST", body: JSON.stringify(payload) }),
  getLockPeriods: () => request("/attendance/hr/lock-periods"),

  // ── HR — Regularizations (all org) ──────────────────────────────
  getOrgRegularizations: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/regularizations${query ? `?${query}` : ""}`);
  },
  approveRegularization: (id) => request(`/attendance/hr/regularizations/${id}/approve`, { method: "POST" }),
  rejectRegularization: (id, payload) => request(`/attendance/hr/regularizations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Manager — Approvals & Inbox ──────────────────────────────────
  getManagerTeamToday: () => request("/attendance/manager/team/today"),
  getManagerTeamHistory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/manager/team/history${query ? `?${query}` : ""}`);
  },
  getManagerAnomalies: () => request("/attendance/manager/team/anomalies"),
  resolveManagerAnomaly: (id, payload) => request(`/attendance/manager/anomalies/${id}/resolve`, { method: "POST", body: JSON.stringify(payload) }),
  
  getManagerPendingRegularizations: () => request("/attendance/manager/regularizations/pending"),
  approveManagerRegularization: (id, payload) => request(`/attendance/manager/regularizations/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectManagerRegularization: (id, payload) => request(`/attendance/manager/regularizations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  
  getManagerPendingOvertime: () => request("/attendance/manager/overtime/pending"),
  approveManagerOvertime: (id, payload) => request(`/attendance/manager/overtime/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectManagerOvertime: (id, payload) => request(`/attendance/manager/overtime/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Phase 7 Manager APIs ───────────────────────────────────────
  getTeamSummary: (date) => request(`/attendance/manager/team/summary${date ? `?date=${date}` : ""}`),
  getTeamMemberHistory: (userId, month, year) => request(`/attendance/manager/team/member/${userId}/history${month && year ? `?month=${month}&year=${year}` : ""}`),
  getTeamMemberSummary: (userId, month, year) => request(`/attendance/manager/team/member/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getTeamGraphData: (month, year) => request(`/attendance/manager/team/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),

  // ── Phase 7 HR APIs ────────────────────────────────────────────
  getAllEmployeesAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/employees/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualEmployeeAttendanceDetail: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/employees/${userId}/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualEmployeeMonthlySummary: (userId, month, year) => request(`/attendance/hr/employees/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getAllManagersAttendance: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/managers/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualManagerAttendanceDetail: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/managers/${userId}/attendance${query ? `?${query}` : ""}`);
  },
  getIndividualManagerMonthlySummary: (userId, month, year) => request(`/attendance/hr/managers/${userId}/summary${month && year ? `?month=${month}&year=${year}` : ""}`),
  getLiveDashboard: () => request("/attendance/hr/dashboard/live"),
  getDashboardGraphData: (month, year) => request(`/attendance/hr/dashboard/graph-data${month && year ? `?month=${month}&year=${year}` : ""}`),
  getDepartmentSummary: (date) => request(`/attendance/hr/dashboard/department-summary${date ? `?date=${date}` : ""}`),
  getTopDefaulters: (month, year) => request(`/attendance/hr/dashboard/top-defaulters${month && year ? `?month=${month}&year=${year}` : ""}`),
  getWorkModeDistribution: (date) => request(`/attendance/hr/dashboard/work-mode-distribution${date ? `?date=${date}` : ""}`),

  // ── Phase 5 — HR Locations (Geofencing) ───────────────────────────
  getLocations: (params) => organizationAPI.getLocations(params),
  createLocation: (payload) => organizationAPI.createLocation(payload),
  updateLocation: (id, payload) => organizationAPI.updateLocation(id, payload),

  // ── Phase 5 — HR Comp Offs ────────────────────────────────────────
  getCompOffs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/comp-offs${query ? `?${query}` : ""}`);
  },
  approveCompOff: (id) => request(`/attendance/hr/comp-offs/${id}/approve`, { method: "POST" }),
  rejectCompOff: (id, payload) => request(`/attendance/hr/comp-offs/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Phase 5 — Manager Comp Offs ───────────────────────────────────
  getManagerCompOffs: () => request("/attendance/manager/comp-offs/pending"),
  approveManagerCompOff: (id) => request(`/attendance/manager/comp-offs/${id}/approve`, { method: "POST" }),
  rejectManagerCompOff: (id, payload) => request(`/attendance/manager/comp-offs/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // ── Phase 6 — HR Lock Periods ─────────────────────────────────────
  getLockPeriods: () => request("/attendance/hr/locks"),
  createLockPeriod: (payload) => request("/attendance/hr/locks", { method: "POST", body: JSON.stringify(payload) }),
  deleteLockPeriod: (id) => request(`/attendance/hr/locks/${id}`, { method: "DELETE" }),

  // ── Phase 6 — HR Reports & Analytics ──────────────────────────────
  getDailyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/daily${query ? `?${query}` : ""}`);
  },
  getMonthlyReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/monthly${query ? `?${query}` : ""}`);
  },
  getEmployeeReport: (userId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/hr/reports/employee/${userId}${query ? `?${query}` : ""}`);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ERP ENDPOINTS (Placeholder)
// ─────────────────────────────────────────────────────────────────────────────

export const erpAPI = {
  getDashboard() {
    return request("/erp/dashboard");
  },
};
