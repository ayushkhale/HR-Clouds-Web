// ─────────────────────────────────────────────────────────────────────────────
// auth.api.js — Authentication endpoints
// ─────────────────────────────────────────────────────────────────────────────

import { request, requestWithToken } from "./client.js";

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
