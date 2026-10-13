// ─────────────────────────────────────────────────────────────────────────────
// api/organization.api.js — the caller's own profile, the company, and the
// public-safe people directory.
//
// WHAT IS DELIBERATELY ABSENT: `GET /organizations/employees`.
// That endpoint is readable by HR and managers only — an employee gets a 403.
// The web app's employee-directory store knows this and reports
// `status: "unavailable"` for employees, requesting nothing.
//
// So in this app, people come from TWO places and no others:
//   • `getDirectory()` below — the public-safe roster, open to every role
//   • names already embedded in each payload — read with personName()
//
// Do not add a second roster fetch, and do not port the directory store.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
import { qs } from './attendance.api';

export const organizationAPI = {
  // ── Me ─────────────────────────────────────────────────────────────────────
  /**
   * The signed-in person's profile. THIS IS WHAT SUPPLIES THEIR NAME — a login
   * response and a JWT both carry only an id, a role and an identifier, so
   * without this the app greets people by their email address.
   *
   * Call it on every session start (sign-in, org selection, org switch, token
   * restore) and treat a failure as NON-FATAL: every screen that shows a name
   * already falls back, and a profile read that times out must not cost
   * somebody their session.
   *
   * `avatar_url` is a presigned link that dies in ~5 minutes — never cache it.
   */
  getMyProfile: () => request('/organizations/me'),

  /** Update the caller's own editable fields. HR-maintained fields are read-only. */
  updateMyProfile: (payload) => request('/organizations/me', { method: 'PUT', body: JSON.stringify(payload) }),

  /** Step 1 of the presigned avatar upload → { upload_url }. */
  requestAvatarUpload: (payload) =>
    request('/organizations/me/avatar/upload-url', { method: 'POST', body: JSON.stringify(payload) }),
  /** Step 3. Without it the photo is in storage but not on the profile. */
  confirmAvatarUpload: (payload) =>
    request('/organizations/me/avatar/confirm', { method: 'POST', body: JSON.stringify(payload) }),

  /** Onboarding completeness — a good source for a "finish your profile" nudge. */
  getMySetupStatus: () => request('/organizations/me/setup-status'),
  updateMyJobProfile: (payload) =>
    request('/organizations/me/job-profile', { method: 'PUT', body: JSON.stringify(payload) }),

  // ── The organisation ───────────────────────────────────────────────────────
  /** Company Profile. Open to every tenant role, same org for all of them. */
  getOrganizationDetails: () => request('/organizations/details'),

  /** The reporting tree for the Org Chart. Render it as a drill-down on a phone. */
  getOrganizationHierarchy: () => request('/organizations/hierarchy'),

  // ── People ─────────────────────────────────────────────────────────────────
  /**
   * The PUBLIC-SAFE directory — the one people source in this app.
   * @param {{search?: string, department?: string, page?: number, limit?: number}} params
   */
  getDirectory: (params = {}) => request(`/organizations/directory${qs(params)}`),
};

export default organizationAPI;
