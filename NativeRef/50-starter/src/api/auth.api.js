// ─────────────────────────────────────────────────────────────────────────────
// api/auth.api.js — sign-in, OTP, password reset, organisation selection.
//
// Signup and organisation registration are OUT OF SCOPE for this app: an
// employee arrives by invitation, and accepting an invitation is a web link.
//
// A 401 from these endpoints means WRONG CREDENTIALS, not an expired session —
// api/client.js already knows that and will not sign anyone out. The one
// exception is `/auth/switch-organization`, which uses the live access token
// and so really can report a dead session.
// ─────────────────────────────────────────────────────────────────────────────

import { request, requestWithToken } from './client';

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

export const authAPI = {
  /**
   * Sign in with email or phone.
   * @param {{identifier: string, password: string}} payload
   * @returns {Promise<object>} Either a session, or
   *   `{ requires_org_selection: true, selection_token, organizations[] }`
   *   for someone who belongs to more than one organisation.
   */
  login: ({ identifier, password }) => post('/auth/login', { identifier, password }),

  /**
   * Google SSO. Get `idToken` from @react-native-google-signin/google-signin.
   * A GOOGLE_TOKEN_INVALID 401 is a credential failure, not a dead session.
   */
  googleAuth: ({ idToken }) => post('/auth/google', { idToken }),

  /** Step 1 of a password reset → { requestId, identifier, identifierType, context }. */
  forgotPassword: ({ identifier }) => post('/auth/forgot-password', { identifier }),

  /** Step 2 — verifies the OTP and sets the new password. */
  verifyForgotPasswordOtp: ({ identifier, otp, context, requestId, newPassword }) =>
    post('/auth/forgot-password/verify', { identifier, otp, context, requestId, newPassword }),

  /**
   * Resend an OTP. INVALIDATES the old `requestId` and returns a new one plus
   * `resendCount` — carry the new id forward or the next verify will fail.
   */
  resendOtp: ({ identifier, context, requestId }) =>
    post('/auth/otp/resend', { identifier, context, requestId }),

  /**
   * Pick an organisation after a multi-org login.
   *
   * Uses the SHORT-LIVED `selection_token` from the login response, not the
   * normal access token — which is why it goes through requestWithToken(). That
   * token is held in memory only and never written to the Keychain.
   */
  selectOrganization: ({ org_id }, selectionToken) =>
    requestWithToken('/auth/select-organization', selectionToken, {
      method: 'POST',
      body: JSON.stringify({ org_id }),
    }),

  /** Switch organisation while already signed in. Uses the live access token. */
  switchOrganization: ({ org_id }) => post('/auth/switch-organization', { org_id }),

  /**
   * The signed-in person's profile.
   *
   * There is no `/auth/me` — this deliberately points at `/organizations/me`,
   * exactly as the web app's authAPI.me() does.
   */
  me: () => request('/organizations/me', { method: 'GET' }),
};

export default authAPI;
