// ─────────────────────────────────────────────────────────────────────────────
// documents.api.js — Documents module, Phase 1 (#1–#42), Phase 2 (#43–#72)
// and Phase 3 (#73–#79).
//
// Contract source of truth: public/ref docs/md_docs/phase1_api_analysis.md,
// phase2_api_analysis.md, phase3_api_analysis.md and
// documents_phase3_acknowledgements_2026_09_24.md. Phase 2 changed no Phase-1
// path, request or response; Phase 3 only ADDS fields to #59/#70/#71 and the
// settings read/write.
//
// Two planes of document, which never share a row:
//   employee — a document about one person (Phase 1, #1–#42)
//   org      — a policy, notice or letter HR issues to a targeted audience
//              (Phase 2, #43–#72); its recipients are frozen at publish
//
// Three audiences, mounted separately:
//   /documents/hr       — HR (#1–#24, #43–#61, #76–#78)
//   /documents/manager  — managers, hierarchy-scoped (#25–#33, #62–#69, #79)
//   /documents/me       — any org member, own documents only (#34–#42, #70–#75)
//
// Uploads never pass through this API: an "issue" call returns a pre-signed
// S3 PUT URL, the browser sends the bytes straight to S3, then "confirm" asks
// the server to check the object landed. See shared/documents/documentUpload.js.
//
// List reads answer `{ data: { total, rows } }` and page with limit/offset
// (limit 1–200). Type lists, version chains and audit trails are plain arrays.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from "./client.js";
import { downloadFile } from "../utils/download.js";

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
// Org plane (Phase 2). Deliberately separate constants: `/me/hr-documents` is
// a different collection from `/me/documents`, not a sub-path of it.
const HR_ORG = "/documents/hr/org-documents";
const MGR_ORG = "/documents/manager/org-documents";
const ME_ORG = "/documents/me/hr-documents";

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

  // ═══════════════════════════════════════════════════════════════════════════
  //  ORG PLANE — HR (#43–#61). Authoring, publishing and the recipient roster.
  // ═══════════════════════════════════════════════════════════════════════════
  /** #43 New draft. `storage_backend: "s3"` returns an upload URL; `"reference"` is publishable at once. */
  createOrgDocument: (payload) => post(HR_ORG, payload),
  /**
   * #44 Edit a draft. Targeting arrays MERGE per dimension: a dimension you
   * omit keeps its stored value, and an explicit `[]` clears just that one.
   * File metadata is NOT editable here — it is fixed at #43.
   */
  updateOrgDocument: (id, payload) => put(`${HR_ORG}/${seg(id)}`, payload),
  /** #45 Re-issue the upload URL for the same storage key. Empty body — the declared file metadata cannot change. */
  orgIssueUpload: (id) => post(`${HR_ORG}/${seg(id)}/file`),
  /** #46 Verify the object landed and record its real size/checksum. Idempotent. */
  orgConfirmUpload: (id) => post(`${HR_ORG}/${seg(id)}/file/confirm`),
  /** #47 Publish + freeze the audience. Idempotent; zero recipients is a success with a ZERO_RECIPIENTS warning. */
  publishOrgDocument: (id, payload = {}) => post(`${HR_ORG}/${seg(id)}/publish`, payload),
  /** #48 Start the next-version draft in the same group. */
  replaceOrgDocument: (id, payload = {}) => post(`${HR_ORG}/${seg(id)}/replace`, payload),
  /** #49 Withdraw a live policy. `{ reason }`, 10–500 characters. Idempotent. */
  retireOrgDocument: (id, reason) => post(`${HR_ORG}/${seg(id)}/retire`, { reason }),
  /** #50 Decline a manager proposal. `{ reason }`. Only a proposal draft — else ORG_DOCUMENT_NOT_A_PROPOSAL. */
  rejectOrgDocument: (id, reason) => post(`${HR_ORG}/${seg(id)}/reject`, { reason }),
  /** #51 Soft-delete a draft or rejected row. Idempotent. */
  deleteOrgDocument: (id) => del(`${HR_ORG}/${seg(id)}`),
  /** #52 List + filter. `status` is repeatable. Filters: status, type_id, group_id, proposed, q, limit, offset. */
  getOrgDocuments: (params) => request(`${HR_ORG}${qs(params)}`),
  /** #53 Manager-proposed drafts waiting for HR. */
  getOrgProposals: (params) => request(`${HR_ORG}/proposals${qs(params)}`),
  /** #54 Every version of a policy group, oldest first. */
  getOrgGroupVersions: (groupId) => request(`${HR_ORG}/groups/${seg(groupId)}`),
  /** #55 */
  getOrgDocument: (id) => request(`${HR_ORG}/${seg(id)}`),
  /** #56 The version chain, reached from any member of it. */
  getOrgVersions: (id) => request(`${HR_ORG}/${seg(id)}/versions`),
  /** #57 Short-lived signed GET. disposition: inline | attachment. */
  orgGetViewUrl: (id, params) => request(`${HR_ORG}/${seg(id)}/view-url${qs(params)}`),
  /** #58 */
  getOrgAuditLogs: (id) => request(`${HR_ORG}/${seg(id)}/audit-logs`),
  /**
   * #59 Roster + `counts_by_state`, and since Phase 3 a top-level `compliance`
   * block and per-row evidence fields. Filters: state (repeatable),
   * compliance_state (completed | pending | overdue | waived), limit, offset.
   */
  getOrgRecipients: (id, params) => request(`${HR_ORG}/${seg(id)}/recipients${qs(params)}`),
  /** #60 Add employees who now match the frozen criteria. Never removes anyone; a re-run adds 0. */
  syncOrgRecipients: (id) => post(`${HR_ORG}/${seg(id)}/recipients/sync`),
  /** #61 Excuse one recipient. `{ reason }`. Legal from pending/viewed only. */
  waiveOrgRecipient: (id, userId, reason) => post(`${HR_ORG}/${seg(id)}/recipients/${seg(userId)}/waive`, { reason }),

  // ═══════════════════════════════════════════════════════════════════════════
  //  ORG PLANE — manager (#62–#69). Propose for one direct report; never publish.
  // ═══════════════════════════════════════════════════════════════════════════
  /** #62 Org types with `manager_can_request`. An empty array means the org turned team documents off — not an error. */
  getManagerOrgTypes: () => request(`${MGR_ORG}/types`),
  /** #63 Proposal for exactly one direct report: `included_users` must hold that one id and no other array may be set. */
  createManagerProposal: (payload) => post(MGR_ORG, payload),
  /** #64 Edit own proposal while it is still a draft. */
  updateManagerProposal: (id, payload) => put(`${MGR_ORG}/${seg(id)}`, payload),
  /** #65 */
  managerOrgIssueUpload: (id) => post(`${MGR_ORG}/${seg(id)}/file`),
  /** #66 */
  managerOrgConfirmUpload: (id) => post(`${MGR_ORG}/${seg(id)}/file/confirm`),
  /** #67 Own proposals and what HR did with them. */
  getMyProposals: (params) => request(`${MGR_ORG}/mine${qs(params)}`),
  /** #68 Anything that isn't the caller's own proposal answers a uniform 404. */
  getManagerProposal: (id) => request(`${MGR_ORG}/${seg(id)}`),
  /** #69 */
  managerOrgGetViewUrl: (id, params) => request(`${MGR_ORG}/${seg(id)}/view-url${qs(params)}`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  ORG PLANE — self (#70–#72). Documents issued TO me.
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * #70 Rows are recipient records with the scrubbed document under `document`.
   * Filters: state (repeatable), type_id, requires_acknowledgement,
   * compliance_state, overdue_only, limit, offset. Limit is capped at 100 here.
   * Each row carries an `acknowledgement` block and `document.next_action`.
   */
  getMyIssuedDocuments: (params) => request(`${ME_ORG}${qs(params)}`),
  /** #71 `:id` is the ORG DOCUMENT id, not the recipient row id. */
  getMyIssuedDocument: (id) => request(`${ME_ORG}/${seg(id)}`),
  /** #72 Also flips this recipient pending → viewed, exactly once. */
  myIssuedGetViewUrl: (id, params) => request(`${ME_ORG}/${seg(id)}/view-url${qs(params)}`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMPLIANCE — Phase 3 (#73–#79). Acknowledging, signing, and who has.
  //  Evidence is append-only: nothing here edits or removes a record.
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * #73 Confirm I've read it. 201 on the first write, 200 with
   * `already_acknowledged: true` on a replay — both carry the same evidence row,
   * so a double click or a retry after a dropped connection is harmless.
   */
  acknowledgeIssuedDocument: (id) => post(`${ME_ORG}/${seg(id)}/acknowledge`, { confirm: true }),
  /**
   * #74 Sign by typing my name. The server checks it against my profile and
   * never says what it expected (SIGNER_NAME_MISMATCH has no details). A replay
   * answers 200 with `already_signed: true`.
   */
  signIssuedDocument: (id, signerName) => post(`${ME_ORG}/${seg(id)}/sign`, { signer_name: signerName }),
  /** #75 My own receipt. 404 DOCUMENT_NOT_FOUND until I have acknowledged or signed. */
  getMyIssuedEvidence: (id) => request(`${ME_ORG}/${seg(id)}/acknowledgement`),

  /**
   * #76 One row per published document that asks for something, with its
   * tallies. Filters: type_id, document_id, department_id, overdue_only,
   * limit (≤ 100), offset. `as_of` is the IST date overdue was judged against.
   */
  getOrgCompliance: (params) => request(`${HR_ORG}/compliance${qs(params)}`),
  /**
   * #77 The same filters minus paging, one CSV row per recipient. Refused as
   * JSON 422 EXPORT_TOO_LARGE (`{ row_count, max_rows }`) before any bytes are
   * sent, so the refusal reads like any other error.
   */
  exportOrgCompliance: (params) =>
    downloadFile(`${HR_ORG}/compliance/export`, {
      params,
      filename: `document-compliance-${new Date().toISOString().slice(0, 10)}.csv`,
    }),
  /**
   * #78 One person's acknowledgement / signature on one document. 404
   * RECIPIENT_NOT_FOUND if they never received it; 404 DOCUMENT_NOT_FOUND if
   * they did but haven't acted yet.
   */
  getOrgRecipientEvidence: (id, userId) => request(`${HR_ORG}/${seg(id)}/acknowledgements/${seg(userId)}`),

  /**
   * #79 My team, one row per person with the documents still asked of them.
   * Filters: user_id, document_id, overdue_only, limit (≤ 100), offset. A
   * user_id outside my team answers an empty list, never a 403; the whole
   * endpoint answers 403 FORBIDDEN when the org hides team documents.
   */
  getTeamCompliance: (params) => request(`${MGR_ORG}/compliance${qs(params)}`),
};
