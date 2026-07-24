// ─────────────────────────────────────────────────────────────────────────────
// api.js — Centralized API Client for HR Clouds
// All network calls across Auth, HRMS, ERP, Payroll etc. are made from here.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "http://192.168.29.131:4500" || import.meta.env.VITE_API_BASE_URL;

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
