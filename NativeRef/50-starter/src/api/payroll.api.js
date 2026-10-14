// ─────────────────────────────────────────────────────────────────────────────
// api/payroll.api.js — /payroll/me/* ONLY.
//
// Every payroll self route lives under `/payroll/me`. There is no
// `/payroll/self/me/...` form, whatever an older doc says.
//
// NOTHING HR-SIDE IS IN HERE: no runs, no structures for other people, no
// registers, no reports. An employee reads their own pay and nothing else.
//
// Binary routes (3 PDFs) are NOT methods — they are path builders in
// `payrollFiles`, because a PDF must go through api/files.js and never through
// request(), which always parses JSON.
// ─────────────────────────────────────────────────────────────────────────────

import { request } from './client';
import { qs, seg } from './attendance.api';

const put = (path, payload) => request(path, { method: 'PUT', body: JSON.stringify(payload) });
const post = (path, payload) =>
  request(path, payload === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(payload) });

const ME = '/payroll/me';

export const payrollAPI = {
  // ── Salary structure ───────────────────────────────────────────────────────
  /** { structure, statutory_breakdown }. `statutory_breakdown` MAY BE ABSENT — hide the panel, don't crash. */
  getMyCurrentStructure: () => request(`${ME}/salary-structure`),
  getMyStructureHistory: () => request(`${ME}/salary-structure/history`),

  // ── Bank account ───────────────────────────────────────────────────────────
  /** May legitimately be "nothing on file" — distinguish that from "couldn't load". */
  getMyBankAccount: () => request(`${ME}/bank-account`),
  /**
   * body: { account_holder_name, bank_name, account_number, ifsc_code,
   *         branch_name, account_type }
   *
   * `account_type` must be EXACTLY "savings" or "current", lowercase.
   * Verified against the live API 2026-09-26: anything else — including
   * "SAVINGS" or "salary" — is refused. Default to savings, which is what
   * salary is almost always paid into.
   */
  upsertMyBankAccount: (payload) => put(`${ME}/bank-account`, payload),

  // ── Payslips & statements ──────────────────────────────────────────────────
  /** A HELD payslip is indistinguishable from one that doesn't exist. Don't invent a badge. */
  getMyPayslips: () => request(`${ME}/payslips`),
  getMyPayslip: (runId) => request(`${ME}/payslips/${seg(runId)}`),
  getMyAnnualStatement: (params) => request(`${ME}/annual-statement${qs(params)}`),
  /** Leave Payouts. Never called "encashments" on screen. */
  getMyEncashments: (params) => request(`${ME}/encashments${qs(params)}`),

  // ── Tax ────────────────────────────────────────────────────────────────────
  // Every tax route takes an optional financial year. PASS IT EXPLICITLY
  // rather than relying on the server's idea of the current one.
  getMyTaxSummary: (params) => request(`${ME}/tax/summary${qs(params)}`),
  getMyTaxProjection: (params) => request(`${ME}/tax/projection${qs(params)}`),
  getMyMonthlyTax: (params) => request(`${ME}/tax/monthly${qs(params)}`),
  getMyDeclaration: (params) => request(`${ME}/tax/declarations${qs(params)}`),
  /** Upserts the WHOLE declaration. Send everything, not a patch. */
  upsertMyDeclaration: (payload, params) => put(`${ME}/tax/declarations${qs(params)}`, payload),
  /** Locks it for HR verification. After this, rows are read-only. */
  submitMyDeclaration: (params) => post(`${ME}/tax/declarations/submit${qs(params)}`),
  recordMyDeclarationProofs: (payload, params) => put(`${ME}/tax/declarations/proofs${qs(params)}`, payload),
  /** Step 1 of the presigned upload for a proof document. */
  requestDeclarationProofUpload: (itemId, payload) =>
    post(`${ME}/tax/declarations/items/${seg(itemId)}/attachments`, payload),
  /** Changes someone's take-home. CONFIRM IT, and say what changes. */
  switchMyRegime: (payload, params) => put(`${ME}/tax/regime${qs(params)}`, payload),
  getMyForm16: (financialYear) => request(`${ME}/tax/form16/${seg(financialYear)}`),

  // ── Loans & variable pay ───────────────────────────────────────────────────
  /** "Still to repay" · "monthly repayment" · "money paid out on". */
  getMyLoans: (params) => request(`${ME}/loans${qs(params)}`),
  getMyLoanInstallments: (id) => request(`${ME}/loans/${seg(id)}/installments`),
  getMyBonuses: () => request(`${ME}/bonuses`),
  /** Includes backdated pay — never "arrears" on screen. */
  getMyAdjustments: () => request(`${ME}/adjustments`),

  // ── Claims & benefits ──────────────────────────────────────────────────────
  /** Carries each category's limits and the caller's remaining headroom. */
  getMyReimbursementCategories: () => request(`${ME}/reimbursements/categories`),
  createMyReimbursementClaim: (payload) => post(`${ME}/reimbursements/claims`, payload),
  getMyReimbursementClaims: (params) => request(`${ME}/reimbursements/claims${qs(params)}`),
  getMyReimbursementClaim: (id) => request(`${ME}/reimbursements/claims/${seg(id)}`),
  /** REPLACES the claim — send the whole thing, not a patch. Drafts only. */
  replaceMyReimbursementClaim: (id, payload) => put(`${ME}/reimbursements/claims/${seg(id)}`, payload),
  submitMyReimbursementClaim: (id) => post(`${ME}/reimbursements/claims/${seg(id)}/submit`),
  cancelMyReimbursementClaim: (id, reason) =>
    post(`${ME}/reimbursements/claims/${seg(id)}/cancel`, reason ? { cancellation_reason: reason } : {}),
  /** Step 1 of the presigned upload for a receipt. */
  requestClaimReceiptUpload: (claimId, itemId, payload) =>
    post(`${ME}/reimbursements/claims/${seg(claimId)}/items/${seg(itemId)}/attachments`, payload),
  getMyBenefits: () => request(`${ME}/benefits`),

  // ── Attachments — shared by claims and tax proofs ──────────────────────────
  // The three-step flow:
  //   1. request…Upload()            → { attachment_id, upload_url }
  //   2. uploadToPresignedUrl()      (api/files.js — no token, exact Content-Type)
  //   3. confirmMyAttachment()       ← MISS THIS and the file is in storage
  //                                     but not on the record
  confirmMyAttachment: (attachmentId) => post(`${ME}/attachments/${seg(attachmentId)}/confirm`),
  deleteMyAttachment: (attachmentId) => request(`${ME}/attachments/${seg(attachmentId)}`, { method: 'DELETE' }),
  /** A SHORT-LIVED signed URL. Fetch at the moment of use; never cache it. */
  getMyAttachmentViewUrl: (attachmentId, params) =>
    request(`${ME}/attachments/${seg(attachmentId)}/view-url${qs(params)}`),
};

/**
 * Binary routes. Pass these to downloadFile() / shareFile() from api/files.js —
 * NEVER to request(), which would try to parse a PDF as JSON.
 */
export const payrollFiles = {
  myPayslipPdf: (runId) => `${ME}/payslips/${seg(runId)}/pdf`,
  myAnnualStatementPdf: () => `${ME}/annual-statement/pdf`,
  myForm16Pdf: (financialYear) => `${ME}/tax/form16/${seg(financialYear)}/pdf`,
};

export default payrollAPI;
