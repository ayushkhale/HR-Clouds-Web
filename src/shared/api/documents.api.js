// ─────────────────────────────────────────────────────────────────────────────
// documents.api.js — Documents module, Phase 1 (API #1–#42).
//
// Contract source of truth: public/ref docs/md_docs/phase1_api_analysis.md and
// phase1_implementation_plan.md. Three audiences, mounted separately:
//   /documents/hr       — HR (#1–#24)
//   /documents/manager  — managers, hierarchy-scoped (#25–#33)
//   /documents/me       — any org member, own documents only (#34–#42)
//
// Uploads never pass through this API: an "issue" call returns a pre-signed
// S3 PUT URL, the browser sends the bytes straight to S3, then "confirm" asks
// the server to check the object landed. See shared/documents/documentUpload.js.
//
// List reads answer `{ data: { total, rows } }` and page with limit/offset
// (limit 1–200). Type lists, version chains and audit trails are plain arrays.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";

/**
 * Query string that drops empty values. The server's query parser only builds
 * an array from a REPEATED key (`user_ids=a&user_ids=b`): a lone `user_ids=a`
 * arrives as a string ("must be an array") and `user_ids[]=a` is an unknown
 * key ("is not allowed"). So a one-item array repeats its only value — the
 * same filter, just parsed as a list.
 */
function qs(params) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      const items = value.filter((item) => item !== undefined && item !== null && item !== "");
      (items.length === 1 ? [items[0], items[0]] : items).forEach((item) => search.append(key, item));
      return;
    }
    search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

// Path params are URI-encoded so a hand-edited id can never change the route.
const seg = (value) => encodeURIComponent(String(value ?? ""));
const post = (path, body) => request(path, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
const patch = (path) => request(path, { method: "PATCH" });
const del = (path) => request(path, { method: "DELETE" });

const HR = "/documents/hr";
const MGR = "/documents/manager";
const ME = "/documents/me/documents";

export const documentsAPI = {
  // ═══════════════════════════════════════════════════════════════════════════
  //  HR — catalog & types (#1–#9)
  // ═══════════════════════════════════════════════════════════════════════════
  /** #1 Platform catalog with this org's activation state. Filters: plane, group, country_code, q, activated, include_inactive. */
  getCatalog: (params) => request(`${HR}/catalog${qs(params)}`),
  /** #2 One catalog entry with its default_* policy, for the activation preview. */
  getCatalogEntry: (code) => request(`${HR}/catalog/${seg(code)}`),
  /** #3 Idempotent bulk activation → { activated, reactivated, already_active }. A bad code fails the whole batch. */
  activateCatalogTypes: (codes) => post(`${HR}/types/activate`, { codes }),
  /** #4 Custom type. Never statutory; the code may not collide with a catalog or org code. */
  createType: (payload) => post(`${HR}/types`, payload),
  /** #5 The org's types. Filters: plane, group, source, is_active. An empty list is a valid answer. */
  getTypes: (params) => request(`${HR}/types${qs(params)}`),
  /** #6 */
  getType: (id) => request(`${HR}/types/${seg(id)}`),
  /** #7 Policy edit. code / plane / source / catalog_id / is_statutory are immutable (409). */
  updateType: (id, payload) => put(`${HR}/types/${seg(id)}`, payload),
  /** #8 Stops new uploads; existing documents stay readable and verifiable. */
  deactivateType: (id) => patch(`${HR}/types/${seg(id)}/deactivate`),
  /** #9 Reactivates without resetting the org's edits. */
  activateType: (id) => patch(`${HR}/types/${seg(id)}/activate`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  HR — documents & settings (#10–#24)
  // ═══════════════════════════════════════════════════════════════════════════
  /** #10 Issue an upload URL on behalf of an employee (source = hr_upload). */
  hrIssueUpload: (userId, payload) => post(`${HR}/employees/${seg(userId)}/documents`, payload),
  /** #11 */
  hrConfirmUpload: (id) => post(`${HR}/documents/${seg(id)}/confirm`),
  /** #12 Register an externally hosted document (https only). Born `available`. */
  hrLinkReference: (userId, payload) => post(`${HR}/employees/${seg(userId)}/documents/link-reference`, payload),
  /** #13 One employee's documents. Filters: type_id, status, group_id, expiring_before, limit, offset. */
  hrGetEmployeeDocuments: (userId, params) => request(`${HR}/employees/${seg(userId)}/documents${qs(params)}`),
  /** #14 Org-wide `pending_verification`, oldest first, with the manager recommendation. Filters: type_id, user_ids[], limit, offset. */
  getVerificationQueue: (params) => request(`${HR}/documents/verification-queue${qs(params)}`),
  /** #15 */
  hrGetDocument: (id) => request(`${HR}/documents/${seg(id)}`),
  /** #16 The whole version chain of the document's group. */
  hrGetVersions: (id) => request(`${HR}/documents/${seg(id)}/versions`),
  /** #17 Short-lived signed GET. disposition: inline | attachment. */
  hrGetViewUrl: (id, params) => request(`${HR}/documents/${seg(id)}/view-url${qs(params)}`),
  /** #18 `{ acknowledge_stale_recommendation }` — true only after HR has seen the stale-recommendation warning. */
  verifyDocument: (id, payload = {}) => post(`${HR}/documents/${seg(id)}/verify`, payload),
  /** #19 `{ reason }` — 10 to 500 characters. */
  rejectDocument: (id, reason) => post(`${HR}/documents/${seg(id)}/reject`, { reason }),
  /** #20 Issue a replacement upload URL (version + 1). The current version stays live until it is confirmed. */
  hrReplaceDocument: (id, payload) => post(`${HR}/documents/${seg(id)}/replace`, payload),
  /** #21 Soft delete, any status. */
  hrDeleteDocument: (id) => del(`${HR}/documents/${seg(id)}`),
  /** #22 */
  getDocumentAuditLogs: (id) => request(`${HR}/documents/${seg(id)}/audit-logs`),
  /** #23 Org settings (created on first read). */
  getSettings: () => request(`${HR}/settings`),
  /** #24 Partial update with the cross-field guard rails. */
  updateSettings: (payload) => put(`${HR}/settings`, payload),

  // ═══════════════════════════════════════════════════════════════════════════
  //  Manager (#25–#33) — hierarchy-scoped; no delete / replace / verify
  // ═══════════════════════════════════════════════════════════════════════════
  /** #25 Types the manager may view (manager_can_view) or upload (manager_can_request). Confidential types never appear. */
  getManagerTypes: () => request(`${MGR}/types`),
  /** #26 All direct reports' visible documents. Filters: user_id, type_id, status, limit, offset. */
  getTeamDocuments: (params) => request(`${MGR}/team/documents${qs(params)}`),
  /** #27 One report's visible documents. */
  managerGetEmployeeDocuments: (userId, params) => request(`${MGR}/employees/${seg(userId)}/documents${qs(params)}`),
  /** #28 The caller's own recommendations still waiting for HR. */
  getMyRecommendations: () => request(`${MGR}/documents/recommendations`),
  /** #29 */
  managerGetDocument: (id) => request(`${MGR}/documents/${seg(id)}`),
  /** #30 */
  managerGetViewUrl: (id, params) => request(`${MGR}/documents/${seg(id)}/view-url${qs(params)}`),
  /** #31 Upload for a report, in a manager_can_request type (source = manager_upload). */
  managerIssueUpload: (userId, payload) => post(`${MGR}/employees/${seg(userId)}/documents`, payload),
  /** #32 */
  managerConfirmUpload: (id) => post(`${MGR}/documents/${seg(id)}/confirm`),
  /** #33 Tier-B `{ recommendation: 'verify' | 'reject', note }`. With direct authority ON it decides immediately. */
  recommendDocument: (id, payload) => post(`${MGR}/documents/${seg(id)}/recommend`, payload),

  // ═══════════════════════════════════════════════════════════════════════════
  //  Self (#34–#42) — every org role, own documents only
  // ═══════════════════════════════════════════════════════════════════════════
  /** #34 Types the caller may upload, each with its size and file-type policy. */
  getMyUploadTypes: () => request(`${ME}/types`),
  /** #35 Own documents, including unfinished uploads. Filters: type_id, status, group_id, limit, offset. */
  getMyDocuments: (params) => request(`${ME}${qs(params)}`),
  /** #36 */
  myIssueUpload: (payload) => post(ME, payload),
  /** #37 */
  myConfirmUpload: (id) => post(`${ME}/${seg(id)}/confirm`),
  /** #38 */
  getMyDocument: (id) => request(`${ME}/${seg(id)}`),
  /** #39 */
  getMyVersions: (id) => request(`${ME}/${seg(id)}/versions`),
  /** #40 */
  myGetViewUrl: (id, params) => request(`${ME}/${seg(id)}/view-url${qs(params)}`),
  /** #41 Replace an available or expired document (version + 1). */
  myReplaceDocument: (id, payload) => post(`${ME}/${seg(id)}/replace`, payload),
  /** #42 Always allowed while unverified; a verified one only if the type and org settings allow and it isn't statutory. */
  myDeleteDocument: (id) => del(`${ME}/${seg(id)}`),
};
