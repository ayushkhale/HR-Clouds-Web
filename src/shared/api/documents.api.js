// ─────────────────────────────────────────────────────────────────────────────
// documents.api.js — Documents module, Phase 1 (#1–#42), Phase 2 (#43–#72),
// Phase 3 (#73–#79), Phase 4 (#80–#98) and Phase 5 (#99–#129).
//
// Contract source of truth: public/ref docs/md_docs/phase1_api_analysis.md,
// phase2_api_analysis.md, phase3_api_analysis.md, phase4_api_analysis-2.md,
// phase5_api_analysis.md, combined_api_analysis-5.md and the release notes
// (documents_phase3_acknowledgements_2026_09_24.md,
// documents_phase4_requests_and_notifications_2026_09_25.md). No later phase
// changed an earlier path, request or response: Phase 3 ADDS fields to
// #59/#70/#71, Phase 4 ADDS `fulfilled_request_id` to the confirm and
// link-reference replies, eight keys to the settings read/write, and one more
// counter to #8's DOCUMENT_TYPE_IN_USE details. Phase 5 ADDS `tags` to every
// employee-document read, three keys to the settings, and one more outcome to
// #47 (see `publishOrgDocument`).
//
// Three planes of document, which never share a row:
//   employee — a document about one person (Phase 1, #1–#42)
//   org      — a policy, notice or letter HR issues to a targeted audience
//              (Phase 2, #43–#72); its recipients are frozen at publish
//   template — a BLANK company form anyone may download (Phase 5, #99–#112).
//              It holds no employee data, so it is the one read in the whole
//              module with no hierarchy scoping: every member of the org sees
//              exactly the same published catalogue.
//
// Three audiences, mounted separately:
//   /documents/hr       — HR (#1–#24, #43–#61, #76–#78, #80–#92, #99–#110,
//                         #113–#125, #127, #129)
//   /documents/manager  — managers, hierarchy-scoped (#25–#33, #62–#69, #79,
//                         #93–#96)
//   /documents/me       — any org member, own rows only (#34–#42, #70–#75,
//                         #97–#98, #126)
//   plus two audience-neutral reads that any member may call: the template
//   catalogue (#111/#112) and the leave-attachment bridge (#128), which works
//   out the caller's plane from their own token.
//
// Uploads never pass through this API: an "issue" call returns a pre-signed
// S3 PUT URL, the browser sends the bytes straight to S3, then "confirm" asks
// the server to check the object landed. See shared/documents/documentUpload.js.
// The same three steps create a template file (#99/#101 → PUT → #102).
//
// List reads answer `{ data: { total, rows } }` and page with limit/offset
// (limit 1–200). Type lists, version chains and audit trails are plain arrays.
//
// THE ONE EXCEPTION, and it is easy to get wrong: `page` + `limit` (limit
// 1–100, page ≥ 1) is used by every Phase 4 list (#82, #87, #94, #97) AND by
// the Phase 5 export ledger (#119). Sending `offset` to one of those is an
// unknown query key. Everything else in Phase 5 — templates (#107/#111),
// search (#113), the expiring report (#117) — is back on limit/offset, and
// search refuses an offset past 10,000 with 422 PAGINATION_TOO_DEEP.
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

/**
 * The same one-item-array problem as `qs`, for the CSV downloads.
 *
 * `downloadFile` builds its own query string and appends each array item once,
 * so a filter with exactly one value — one status, one tag — would arrive as a
 * bare string and be refused with "must be an array". Since Phase 5 is the
 * first place a CSV carries repeatable filters, the duplication is applied here
 * rather than changing `downloadFile`, whose payroll callers pass no arrays and
 * must keep behaving exactly as they do.
 */
function repeatSingles(params) {
  if (!params) return params;
  return Object.fromEntries(Object.entries(params).map(([key, value]) => {
    if (!Array.isArray(value)) return [key, value];
    const items = value.filter((item) => item !== undefined && item !== null && item !== "");
    return [key, items.length === 1 ? [items[0], items[0]] : items];
  }));
}

// Path params are URI-encoded so a hand-edited id can never change the route.
const seg = (value) => encodeURIComponent(String(value ?? ""));
const post = (path, body) => request(path, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
const patch = (path, body) =>
  request(path, body === undefined ? { method: "PATCH" } : { method: "PATCH", body: JSON.stringify(body) });
const del = (path) => request(path, { method: "DELETE" });

const HR = "/documents/hr";
const MGR = "/documents/manager";
const ME = "/documents/me/documents";
// Org plane (Phase 2). Deliberately separate constants: `/me/hr-documents` is
// a different collection from `/me/documents`, not a sub-path of it.
const HR_ORG = "/documents/hr/org-documents";
const MGR_ORG = "/documents/manager/org-documents";
const ME_ORG = "/documents/me/hr-documents";
// Phase 4's self plane hangs off `/documents/me` itself, beside — not inside —
// the two `/me` collections above.
const ME_SELF = "/documents/me";
// Template plane (Phase 5). The HR half is an ordinary `/documents/hr` branch;
// the catalogue half sits at the module root because it belongs to no audience.
const HR_TPL = "/documents/hr/templates";
const TPL = "/documents/templates";

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
  /**
   * #47 Publish + freeze the audience. Idempotent; zero recipients is a success
   * with a ZERO_RECIPIENTS warning.
   *
   * Since Phase 5 this has a second, slower outcome. When the frozen audience
   * is larger than `document_publish_sync_threshold` (default 20,000) the
   * server answers 202 instead of 200: the document IS published and the first
   * 5,000 people already have it, but the rest are filled in by a worker over
   * the following minutes. The reply then carries `materialisation_state:
   * "pending"`, `recipient_target_count`, `recipients_created` and a `poll`
   * path — read the progress with `getMaterialisation` (#127).
   */
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  REQUESTS, CHECKLISTS & AUTOMATION — Phase 4 (#80–#98).
  //
  //  A request is HR or a manager formally asking one person for one kind of
  //  document by a date. Nobody closes it by hand: confirming a matching
  //  upload (#11/#32/#37) or linking a reference (#12) fulfils it inside the
  //  same transaction and reports it back as `fulfilled_request_id`.
  //
  //  Two things to hold on to when reading these:
  //    · Requests and checklists page with `page` + `limit` (1–100), never
  //      limit/offset — see the note at the top of this file.
  //    · Rows are FLAT. A request carries `user_id`, `document_type_id` and
  //      `requested_by` as bare ids, with no nested person or type. Resolve
  //      names from the employee directory and the type list.
  //    · The projection narrows by plane: HR sees `reminder_count` and
  //      `last_reminder_on`, a manager sees only `reminder_count`, and the
  //      person themselves sees neither. Never show a field as "N/A" when the
  //      plane simply withholds it.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── HR (#80–#87) ──────────────────────────────────────────────────────────
  /**
   * #80 Ask one employee for one kind of document. `{ document_type_id, due_on?,
   * note? }` — `due_on` is today..+365 (IST) and defaults to the org's
   * `document_request_default_due_days`; `note` is up to 1000 characters.
   * 409 DOCUMENT_ALREADY_PRESENT when they already have a live one, and
   * 409 DUPLICATE_REQUEST (with `details.request_id`) when one is already open.
   */
  createDocumentRequest: (userId, payload) => post(`${HR}/employees/${seg(userId)}/document-requests`, payload),
  /**
   * #81 One request per outstanding checklist item (missing or expired), each in
   * its own savepoint — an item somebody else just requested is skipped, not
   * failed. Answers `{ created: [{ request_id, document_type_id }], skipped:
   * [{ document_type_id, reason }] }`, or 409 NOTHING_TO_REQUEST when the
   * checklist has nothing outstanding. No body.
   */
  bulkRequestFromChecklist: (userId) => post(`${HR}/employees/${seg(userId)}/document-requests/bulk-from-checklist`),
  /** #82 Org-wide. Filters: status (repeatable), user_id, document_type_id, overdue_only, page, limit. */
  getDocumentRequests: (params) => request(`${HR}/document-requests${qs(params)}`),
  /** #83 One request, HR projection. Anything not readable is a uniform 404. */
  getDocumentRequest: (id) => request(`${HR}/document-requests/${seg(id)}`),
  /** #84 `{ reason }`, 1–500 characters and required. A settled request answers 409 REQUEST_NOT_OPEN. */
  cancelDocumentRequest: (id, reason) => post(`${HR}/document-requests/${seg(id)}/cancel`, { reason }),
  /**
   * #85 Send the overdue notice now. Idempotent per calendar day: a second call
   * the same day is still a 200, with `{ reminded: false, reason:
   * "already_reminded_today" }`. The notice is only queued — #87 is where
   * delivery can be seen.
   */
  remindDocumentRequest: (id) => post(`${HR}/document-requests/${seg(id)}/remind`),
  /** #86 One employee's required-document checklist and completeness score. */
  getEmployeeChecklist: (userId) => request(`${HR}/employees/${seg(userId)}/checklist`),
  /**
   * #87 The email outbox, for looking at — nothing here sends anything. Filters:
   * status, event_type, from, to (ISO dates), page, limit. `dedupe_key` is
   * never returned.
   */
  getDocumentNotifications: (params) => request(`${HR}/notifications${qs(params)}`),

  // ── HR — run a nightly job now (#88–#92) ──────────────────────────────────
  // Each one runs the real cron for the caller's own organisation only: an
  // `org_id` in the body is ignored, so none is sent. They answer 200 even when
  // something inside failed, with the failures listed in `errors[]` — so the
  // caller must read `ok` and `errors`, not just the status code.
  /** #88 Mark documents whose expiry date has passed as expired. */
  runExpirySweep: () => post(`${HR}/jobs/expiry-sweep/run`),
  /** #89 Flip overdue requests, then send the expiry, acknowledgement and overdue-request notices. */
  runDocumentReminders: () => post(`${HR}/jobs/document-reminders/run`),
  /** #90 Send whatever is waiting in the outbox. */
  runNotificationDispatch: () => post(`${HR}/jobs/notification-dispatch/run`),
  /** #91 Destructive: clears abandoned uploads, purges deleted documents past retention (never statutory ones) and trims the outbox. */
  runDocumentSweeper: () => post(`${HR}/jobs/document-sweeper/run`),
  /** #92 Give new joiners the company documents already published to people like them. */
  runRecipientTopup: () => post(`${HR}/jobs/recipient-topup/run`),

  // ── Manager (#93–#96) — own reporting line only ────────────────────────────
  /** #93 Same body as #80. A type whose policy doesn't allow manager requests answers 403 TYPE_NOT_REQUESTABLE; someone outside the line, 403 FORBIDDEN. */
  managerCreateDocumentRequest: (userId, payload) => post(`${MGR}/employees/${seg(userId)}/document-requests`, payload),
  /** #94 Same filters as #82, narrowed to the reporting line. A `user_id` outside it answers an empty list, not a 403. */
  getManagerDocumentRequests: (params) => request(`${MGR}/document-requests${qs(params)}`),
  /** #95 Only a request THIS manager raised, for someone still in their line — anything else is a uniform 404. */
  managerCancelDocumentRequest: (id, reason) => post(`${MGR}/document-requests/${seg(id)}/cancel`, { reason }),
  /** #96 A direct report's checklist. `document_id` comes back null for a type the manager may not open. Out of the line → 403 FORBIDDEN. */
  getManagerChecklist: (userId) => request(`${MGR}/employees/${seg(userId)}/checklist`),

  // ── Self (#97–#98) — always the caller, whatever their role ────────────────
  /** #97 What has been asked of me. Filters: status, document_type_id, overdue_only, page, limit. */
  getMyDocumentRequests: (params) => request(`${ME_SELF}/document-requests${qs(params)}`),
  /** #98 My own required-document checklist and completeness score. */
  getMyChecklist: () => request(`${ME_SELF}/checklist`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEMPLATES — Phase 5 (#99–#112). Blank company forms, not employee files.
  //
  //  A template is a form nobody has filled in yet: a claim sheet, a nomination
  //  form, a declaration. It holds no employee data, which is why it is the one
  //  collection in this module with no hierarchy scoping at all — every member
  //  of the organisation sees the same published catalogue.
  //
  //  Versions work like org documents: one group (`template_group_id`), many
  //  versions, exactly one of them published. Publishing v2 demotes v1 to
  //  `superseded` in the same transaction, so employees can never download
  //  last year's form. Only a draft can be edited or deleted; a published one
  //  is replaced (new draft) or archived.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── HR — the template lifecycle (#99–#110) ────────────────────────────────
  /**
   * #99 New draft, version 1. `storage_backend: "s3"` (the default) answers
   * `{ template, upload_url, upload_expires_at, required_headers }`;
   * `"reference"` needs `reference_url` (https) and is publishable at once.
   */
  createTemplate: (payload) => post(HR_TPL, payload),
  /** #100 Edit a DRAFT's metadata. A published or archived one answers 409 TEMPLATE_NOT_DRAFT. */
  updateTemplate: (id, payload) => patch(`${HR_TPL}/${seg(id)}`, payload),
  /** #101 Re-issue the upload URL for a draft, with the file metadata being claimed. */
  templateIssueUpload: (id, payload) => post(`${HR_TPL}/${seg(id)}/file-url`, payload),
  /** #102 Verify the object landed and record its real size, type and checksum. Idempotent. */
  templateConfirmUpload: (id) => post(`${HR_TPL}/${seg(id)}/confirm`),
  /** #103 Draft → published, demoting the group's previous published version to superseded. */
  publishTemplate: (id) => post(`${HR_TPL}/${seg(id)}/publish`),
  /**
   * #104 Start the next version as a fresh draft. Optional `{ title,
   * description, document_type_id }` overrides, otherwise the current values
   * are copied. 409 TEMPLATE_DRAFT_EXISTS when a draft is already open in this
   * group. Answers the same shape as #99.
   */
  replaceTemplate: (id, payload = {}) => post(`${HR_TPL}/${seg(id)}/replace`, payload),
  /** #105 Retire a published template from the catalogue. `{ reason }` optional. Idempotent. */
  archiveTemplate: (id, reason) => post(`${HR_TPL}/${seg(id)}/archive`, reason ? { reason } : {}),
  /** #106 Delete a DRAFT. Anything published or archived answers 422 TEMPLATE_NOT_DELETABLE. */
  deleteTemplate: (id) => del(`${HR_TPL}/${seg(id)}`),
  /** #107 Every template, any status. Filters: status (repeatable), type_id, q, limit, offset. */
  getTemplates: (params) => request(`${HR_TPL}${qs(params)}`),
  /** #108 */
  getTemplate: (id) => request(`${HR_TPL}/${seg(id)}`),
  /** #109 The whole version chain of this template's group, newest first. */
  getTemplateVersions: (id) => request(`${HR_TPL}/${seg(id)}/versions`),
  /** #110 Short-lived signed GET (attachment) for any version, including superseded ones. */
  getTemplateDownloadUrl: (id) => request(`${HR_TPL}/${seg(id)}/download-url`),

  // ── Everyone — the catalogue (#111–#112) ──────────────────────────────────
  /**
   * #111 Published, employee-visible templates whose type (if any) allows it.
   * Filters: type_id, q, limit, offset. `status` is not accepted here: drafts,
   * superseded and archived versions are never disclosed.
   */
  getPublishedTemplates: (params) => request(`${TPL}${qs(params)}`),
  /** #112 Signed download. Anything hidden from the caller is a uniform 404 TEMPLATE_NOT_FOUND. */
  getPublishedTemplateDownloadUrl: (id) => request(`${TPL}/${seg(id)}/download-url`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEARCH, TAGS, REPORTS & THE EXPORT LEDGER — Phase 5 (#113–#121). HR only.
  //
  //  Every `.csv` here writes a row in the export ledger BEFORE a single byte
  //  is sent, and refuses the whole download with 503 EXPORT_LEDGER_UNAVAILABLE
  //  if it can't. Over 10,000 matching rows is refused as 422 EXPORT_TOO_LARGE,
  //  as JSON, before any bytes — so it reads like any other error.
  //
  //  Search results are deliberately thin: `document_number` (even masked),
  //  `storage_key` and `reference_url` are never returned by a bulk read. To
  //  see those, open the document itself (#15).
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * #113 Org-wide metadata search. Filters: q, type_id, user_id, department_id,
   * status (repeatable), tags (repeatable, max 10), from_issued_on,
   * to_issued_on, from_expires_on, to_expires_on, limit (≤ 100), offset
   * (≤ 10,000 — past that it is 422 PAGINATION_TOO_DEEP).
   */
  searchDocuments: (params) => request(`${HR}/documents/search${qs(params)}`),
  /** #114 The same filters as #113 minus paging, as a CSV. */
  exportDocumentSearch: (params) =>
    downloadFile(`${HR}/documents/search.csv`, {
      params: repeatSingles(params),
      filename: `document-search-${new Date().toISOString().slice(0, 10)}.csv`,
    }),
  /**
   * #115 Who is missing a document they are required to hold. Filters:
   * department_id, employment_type, document_type_id, include_employees,
   * employees_limit (≤ 100), employees_offset. Without `include_employees` the
   * reply is totals only — cheap enough to poll.
   */
  getMissingMandatoryReport: (params) => request(`${HR}/reports/missing-mandatory${qs(params)}`),
  /** #116 One row per incomplete person, as a CSV. Same filters as #115 minus paging. */
  exportMissingMandatoryReport: (params) =>
    downloadFile(`${HR}/reports/missing-mandatory.csv`, {
      params: repeatSingles(params),
      filename: `missing-mandatory-${new Date().toISOString().slice(0, 10)}.csv`,
    }),
  /**
   * #117 Documents with an end date coming up, in six buckets counted against
   * midnight IST. Filters: within_days (1–365, default 30), document_type_id,
   * department_id, include_expired, limit (≤ 100), offset.
   */
  getExpiringReport: (params) => request(`${HR}/reports/expiring${qs(params)}`),
  /** #118 The same, as a CSV. */
  exportExpiringReport: (params) =>
    downloadFile(`${HR}/reports/expiring.csv`, {
      params: repeatSingles(params),
      filename: `expiring-documents-${new Date().toISOString().slice(0, 10)}.csv`,
    }),
  /**
   * #119 The export ledger: every bulk download anyone has taken out of this
   * organisation. Filters: export_type, format, scope, status, from, to, and
   * — note — `page` + `limit`, not limit/offset.
   */
  getDocumentExports: (params) => request(`${HR}/exports${qs(params)}`),
  /** #120 One ledger entry, with the filters that were applied and who took it. */
  getDocumentExport: (id) => request(`${HR}/exports/${seg(id)}`),
  /**
   * #121 Replace a document's tags outright — this is not a merge. Up to 10
   * tags, each ≤ 64 characters, lowercase letters, digits, spaces, hyphens and
   * underscores only. The server normalises and de-duplicates them.
   */
  updateDocumentTags: (id, tags) => patch(`${HR}/documents/${seg(id)}/tags`, { tags }),

  // ═══════════════════════════════════════════════════════════════════════════
  //  OFFBOARDING & EXIT PACKS — Phase 5 (#122–#125, #129). HR only.
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * #122 Close down a leaver's document footprint in one transaction: archive
   * their documents, waive the policies they never signed, cancel what was
   * still being asked of them, and silence the emails already queued to them.
   * Anything they DID sign is never touched.
   *
   * `dry_run: true` counts all four without changing anything. Without `force`
   * it refuses while the last working day is still in the future
   * (422 EXIT_DATE_IN_FUTURE), and refuses outright for somebody who is simply
   * still employed (422 NOT_OFFBOARDING).
   */
  offboardDocuments: (userId, { dryRun = false, force = false, reason } = {}) =>
    post(
      `${HR}/employees/${seg(userId)}/offboard-documents${qs({ dry_run: dryRun || undefined, force: force || undefined })}`,
      reason ? { reason } : {},
    ),
  /**
   * #123 A leaver's whole file as one manifest, each item with its own 15-minute
   * download link. `scope`: all | employee_owned | org_issued (defaults to the
   * org's setting). Over 500 items is 422 EXIT_PACK_TOO_LARGE. An item whose
   * file can't be signed comes back with `url: null` and `url_error` rather
   * than failing the whole pack.
   */
  getExitPack: (userId, params) => request(`${HR}/employees/${seg(userId)}/exit-pack${qs(params)}`),
  /** #124 The same manifest as a CSV. It deliberately carries NO download links. */
  exportExitPack: (userId, params) =>
    downloadFile(`${HR}/employees/${seg(userId)}/exit-pack.csv`, {
      params,
      filename: `exit-pack-${new Date().toISOString().slice(0, 10)}.csv`,
    }),
  /** #125 Run tonight's offboarding sweep now, for this organisation. */
  runOffboardingArchive: () => post(`${HR}/jobs/offboarding-archive/run`),
  /** #129 Fill in the rest of the recipients of a large publish now, one batch. */
  runPublishMaterialisation: () => post(`${HR}/jobs/publish-materialisation/run`),

  // ═══════════════════════════════════════════════════════════════════════════
  //  COMPOSED VIEW, MATERIALISATION & THE LEAVE BRIDGE — Phase 5 (#126–#128)
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * #126 Everything of mine in one read: my own documents, the company
   * documents addressed to me, the blank forms I can download and (if payroll
   * is switched on) my payslips. `sections` is a comma-separated subset;
   * `limit` (≤ 100) caps each section.
   *
   * Two things shape how this must be rendered. Each section can fail on its
   * own and comes back `{ available: false, reason }` while the others are
   * fine — so no section's failure may blank the page. And no item carries a
   * signed URL: each one has `access.path`, the endpoint to call when the
   * person actually clicks. That is why a 60-item dashboard costs nothing and
   * logs nothing until something is opened.
   */
  getMyComposedDocuments: (params) => request(`${ME}/all${qs(params)}`),
  /** #127 How far a large publish has got through its recipient list (#47's 202). */
  getMaterialisation: (id) => request(`${HR_ORG}/${seg(id)}/materialisation`),
  /**
   * #128 The leave-attachment bridge. One stored path serves all three readers:
   * the applicant, their manager chain and HR. The server works out which the
   * caller is from their token; anybody else gets a uniform 404.
   * `disposition`: inline | attachment.
   */
  getAttachmentViewUrl: (id, params) => request(`/documents/attachments/${seg(id)}/view-url${qs(params)}`),
};
