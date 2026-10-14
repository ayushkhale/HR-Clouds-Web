// ─────────────────────────────────────────────────────────────────────────────
// api/documents.api.js — the employee's four document collections.
//
// THESE ARE NOT SUB-PATHS OF EACH OTHER. The constants are deliberately
// separate, because `/me/hr-documents` is a DIFFERENT COLLECTION from
// `/me/documents`, not a branch of it. Mixing them up gets you a 404 that
// looks like a permissions problem.
//
//   ME       /documents/me/documents      documents I uploaded about myself
//   ME_ORG   /documents/me/hr-documents   company documents issued TO me
//   ME_SELF  /documents/me                the self plane: requests, checklist
//   TPL      /documents/templates         blank forms, belonging to nobody
//
// Nothing HR-side is here: no catalog, no types admin, no verification queue,
// no letters, no org-document publishing, no proposals.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
import { qs, seg } from './attendance.api';

const post = (path, body) =>
  request(path, body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

const ME = '/documents/me/documents';
const ME_ORG = '/documents/me/hr-documents';
const ME_SELF = '/documents/me';
const TPL = '/documents/templates';

export const documentsAPI = {
  // ── My Document Home — everything of mine in one read ──────────────────────
  /**
   * My own documents + the company documents addressed to me + the blank forms
   * I can download + (if payroll is on) my payslips.
   *
   * TWO PROPERTIES SHAPE THE WHOLE SCREEN:
   *
   *  1. Each section can fail ON ITS OWN, arriving as
   *     `{ available: false, reason }` while the others are fine. NO SECTION'S
   *     FAILURE MAY BLANK THE SCREEN.
   *
   *  2. No item carries a signed URL. Each has `access.path` — the endpoint to
   *     call when the person actually taps it. That is why a 60-item screen
   *     costs nothing and logs nothing until something is opened. DO NOT
   *     PRE-FETCH those URLs: you would be generating audit-logged access
   *     events for documents nobody opened.
   *
   * @param {{sections?: string, limit?: number}} params `limit` caps EACH section (≤ 100)
   */
  getMyComposedDocuments: (params) => request(`${ME}/all${qs(params)}`),

  // ── My own documents ───────────────────────────────────────────────────────
  /** Which types I may upload. Never offer a free-text type. */
  getMyUploadTypes: () => request(`${ME}/types`),
  getMyDocuments: (params) => request(`${ME}${qs(params)}`),
  getMyDocument: (id) => request(`${ME}/${seg(id)}`),
  getMyVersions: (id) => request(`${ME}/${seg(id)}/versions`),
  /** `?disposition=inline|attachment`. Short-lived and signed — never cache it. */
  myGetViewUrl: (id, params) => request(`${ME}/${seg(id)}/view-url${qs(params)}`),

  /**
   * Step 1 of the upload → { id, upload_url }.
   * body: { document_type, file_name, content_type, file_size,
   *         document_number?, is_confidential?, expires_on? }
   */
  myIssueUpload: (payload) => post(ME, payload),
  /** Step 3. MISS THIS and the document is in storage but not on the record. */
  myConfirmUpload: (id) => post(`${ME}/${seg(id)}/confirm`),

  /** A new VERSION — the old one becomes `superseded` and stays in history. */
  myReplaceDocument: (id, payload) => post(`${ME}/${seg(id)}/replace`, payload),
  /** Confirm first, and say what is lost. A document used as leave evidence may be refused. */
  myDeleteDocument: (id) => del(`${ME}/${seg(id)}`),

  // ── Company documents issued to me ─────────────────────────────────────────
  /** `?compliance_state=pending|overdue|completed|waived`. */
  getMyIssuedDocuments: (params) => request(`${ME_ORG}${qs(params)}`),
  getMyIssuedDocument: (id) => request(`${ME_ORG}/${seg(id)}`),
  myIssuedGetViewUrl: (id, params) => request(`${ME_ORG}/${seg(id)}/view-url${qs(params)}`),

  /**
   * Body is EXACTLY { confirm: true }.
   * Do not enable the control until the document has been OPENED — an
   * acknowledgement of something unread is worthless to the organisation and
   * unfair to the employee. It is not reversible: confirm it.
   */
  acknowledgeIssuedDocument: (id) => post(`${ME_ORG}/${seg(id)}/acknowledge`, { confirm: true }),

  /** A named attestation, separate from acknowledging. */
  signIssuedDocument: (id, signerName) => post(`${ME_ORG}/${seg(id)}/sign`, { signer_name: signerName }),

  /** Read the evidence back after acknowledging — when, from which device. People ask. */
  getMyIssuedEvidence: (id) => request(`${ME_ORG}/${seg(id)}/acknowledgement`),

  // ── Requests HR has made of me, and my checklist ───────────────────────────
  getMyDocumentRequests: (params) => request(`${ME_SELF}/document-requests${qs(params)}`),
  /** What's still missing from my file — the same facts, from the other direction. */
  getMyChecklist: () => request(`${ME_SELF}/checklist`),

  // ── Blank forms ────────────────────────────────────────────────────────────
  /** Published templates only. A form belongs to nobody — hence no "my". */
  getPublishedTemplates: (params) => request(`${TPL}${qs(params)}`),
  getPublishedTemplateDownloadUrl: (id) => request(`${TPL}/${seg(id)}/download-url`),

  // ── The attachment bridge ──────────────────────────────────────────────────
  /**
   * ONE stored path serves three readers — the applicant, their manager chain
   * and HR. The server works out which you are from your token; anybody else
   * gets a uniform 404.
   *
   * This is what a LEAVE ATTACHMENT resolves through. A leave request's
   * `document_url` may hold the relative path
   * `/api/v1/documents/attachments/:id/view-url`, which is NOT a URL a client
   * can follow — always come through here.
   *
   * @param {{disposition?: 'inline'|'attachment'}} params
   */
  getAttachmentViewUrl: (id, params) => request(`/documents/attachments/${seg(id)}/view-url${qs(params)}`),
};

export default documentsAPI;
