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
    localStorage.setItem("hrclouds_token", accessToken);
    if (refreshToken) localStorage.setItem("hrclouds_refresh_token", refreshToken);
  },
  get() {
    return localStorage.getItem("hrclouds_token");
  },
  getRefresh() {
    return localStorage.getItem("hrclouds_refresh_token");
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
};

// ─────────────────────────────────────────────────────────────────────────────
// HRMS ENDPOINTS (Placeholder — expand as the module is built)
// ─────────────────────────────────────────────────────────────────────────────

export const hrmsAPI = {
  getEmployees(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/hrms/employees${query ? `?${query}` : ""}`);
  },
  getEmployee(id) {
    return request(`/hrms/employees/${id}`);
  },
  createEmployee(payload) {
    return request("/hrms/employees", { method: "POST", body: JSON.stringify(payload) });
  },
  updateEmployee(id, payload) {
    return request(`/hrms/employees/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  deleteEmployee(id) {
    return request(`/hrms/employees/${id}`, { method: "DELETE" });
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
  getLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/attendance/logs${query ? `?${query}` : ""}`);
  },
  markAttendance(payload) {
    return request("/attendance/mark", { method: "POST", body: JSON.stringify(payload) });
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
