import { request } from "./client.js";

// Helper to construct query string
const buildQuery = (params) => {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    // Phase 6 report filters repeat a key: department_id=a&department_id=b
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") query.append(key, item);
      });
      return;
    }
    query.append(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

// PAYROLL_BACKEND_GAPS_RESPONSE.md §0.2: one comma-separated `include` param.
// Only `employee` is asked for; list screens never read the snapshots (G-6).
const WITH_EMPLOYEE = { include: "employee" };

export const payrollAPI = {
  // ─────────────────────────────────────────────────────────────────────────────
  // HR APIs
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Components
  bootstrapComponents: () => request("/payroll/hr/components/bootstrap", { method: "POST" }),
  getComponents: (params) => request(`/payroll/hr/components${buildQuery(params)}`),
  getComponent: (id) => request(`/payroll/hr/components/${id}`),
  createComponent: (payload) => request("/payroll/hr/components", { method: "POST", body: JSON.stringify(payload) }),
  updateComponent: (id, payload) => request(`/payroll/hr/components/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivateComponent: (id) => request(`/payroll/hr/components/${id}`, { method: "DELETE" }),

  // Templates
  getTemplates: () => request("/payroll/hr/structure-templates"),
  getTemplate: (id) => request(`/payroll/hr/structure-templates/${id}`),
  createTemplate: (payload) => request("/payroll/hr/structure-templates", { method: "POST", body: JSON.stringify(payload) }),
  updateTemplate: (id, payload) => request(`/payroll/hr/structure-templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivateTemplate: (id) => request(`/payroll/hr/structure-templates/${id}`, { method: "DELETE" }),
  
  // Template Components
  addTemplateComponent: (id, payload) => request(`/payroll/hr/structure-templates/${id}/components`, { method: "POST", body: JSON.stringify(payload) }),
  updateTemplateComponent: (id, compId, payload) => request(`/payroll/hr/structure-templates/${id}/components/${compId}`, { method: "PUT", body: JSON.stringify(payload) }),
  removeTemplateComponent: (id, compId) => request(`/payroll/hr/structure-templates/${id}/components/${compId}`, { method: "DELETE" }),
  previewTemplate: (id, payload) => request(`/payroll/hr/structure-templates/${id}/preview`, { method: "POST", body: JSON.stringify(payload) }),

  // Employee Structures (HR)
  // Every employee's active structure in one paginated list (page, limit ≤ 100),
  // with `employee.profile` and `components` embedded. Use this for the grid;
  // the per-employee route below is for one row after an assignment.
  getCurrentSalaryStructures: (params) => request(`/payroll/hr/salary-structures/current${buildQuery(params)}`),
  getEmployeeStructureHistory: (userId) => request(`/payroll/hr/employees/${userId}/salary-structures`),
  getEmployeeCurrentStructure: (userId) => request(`/payroll/hr/employees/${userId}/salary-structures/current`),
  assignEmployeeStructure: (userId, payload) => request(`/payroll/hr/employees/${userId}/salary-structures`, { method: "POST", body: JSON.stringify(payload) }),
  
  // Proposals
  getProposals: (params) => request(`/payroll/hr/salary-structures/proposals${buildQuery(params)}`),
  approveProposal: (id) => request(`/payroll/hr/salary-structures/${id}/approve`, { method: "POST" }),
  rejectProposal: (id, payload) => request(`/payroll/hr/salary-structures/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),

  // Settings & Bank & Logs
  getSettings: () => request("/payroll/hr/settings"),
  updateSettings: (payload) => request("/payroll/hr/settings", { method: "PUT", body: JSON.stringify(payload) }),
  // Every employee's bank account in one paginated list (page, limit ≤ 100).
  // Use this for the verification grid; the per-employee route below is for one row's details.
  getBankAccounts: (params) => request(`/payroll/hr/bank-accounts${buildQuery(params)}`),
  getEmployeeBankAccount: (userId) => request(`/payroll/hr/employees/${userId}/bank-account`),
  verifyEmployeeBankAccount: (userId) => request(`/payroll/hr/employees/${userId}/bank-account/verify`, { method: "POST" }),
  getAuditLogs: (params) => request(`/payroll/hr/audit-logs${buildQuery(params)}`),

  // ─────────────────────────────────────────────────────────────────────────────
  // HR APIs — Engine Operations
  // ─────────────────────────────────────────────────────────────────────────────
  getRunEligibility: (params) => request(`/payroll/hr/runs/eligibility${buildQuery(params)}`),
  createRun: (payload) => request("/payroll/hr/runs", { method: "POST", body: JSON.stringify(payload) }),
  getRuns: (params) => request(`/payroll/hr/runs${buildQuery(params)}`),
  getRun: (id) => request(`/payroll/hr/runs/${id}`),
  calculateRun: (id) => request(`/payroll/hr/runs/${id}/calculate`, { method: "POST" }),
  // Gap G-2: `include=employee` embeds `employee` and `*_by_user` objects. Until
  // the backend ships it the param is ignored and rows carry bare user_ids.
  getRunPreview: (id) => request(`/payroll/hr/runs/${id}/preview${buildQuery(WITH_EMPLOYEE)}`),
  getRunItems: (id, params) => request(`/payroll/hr/runs/${id}/items${buildQuery({ ...params, ...WITH_EMPLOYEE })}`),
  getRunItem: (id, itemId) => request(`/payroll/hr/runs/${id}/items/${itemId}${buildQuery(WITH_EMPLOYEE)}`),
  excludeRunItem: (id, itemId, payload) => request(`/payroll/hr/runs/${id}/items/${itemId}/exclude`, { method: "POST", body: JSON.stringify(payload) }),
  includeRunItem: (id, itemId) => request(`/payroll/hr/runs/${id}/items/${itemId}/include`, { method: "POST" }),
  overrideRunItemPeriod: (id, itemId, payload) => request(`/payroll/hr/runs/${id}/items/${itemId}/period`, { method: "PATCH", body: JSON.stringify(payload) }),
  approveRun: (id) => request(`/payroll/hr/runs/${id}/approve`, { method: "POST" }),
  // Cancel requires `cancellation_reason` (1–1000 chars, trimmed). Only an
  // approved, unpaid run can be cancelled.
  cancelRun: (id, reason) => request(`/payroll/hr/runs/${id}/cancel`, { method: "POST", body: JSON.stringify({ cancellation_reason: reason }) }),
  payRun: (id) => request(`/payroll/hr/runs/${id}/pay`, { method: "POST" }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Manager APIs
  // ─────────────────────────────────────────────────────────────────────────────
  getTeamSalaryStructures: () => request("/payroll/manager/team/salary-structures"),
  getTeamMemberStructureHistory: (userId) => request(`/payroll/manager/employees/${userId}/salary-structures`),
  getTeamMemberCurrentStructure: (userId) => request(`/payroll/manager/employees/${userId}/salary-structures/current`),
  proposeTeamMemberStructure: (userId, payload) => request(`/payroll/manager/employees/${userId}/salary-structures/propose`, { method: "POST", body: JSON.stringify(payload) }),
  getMyProposals: (params) => request(`/payroll/manager/salary-structures/proposals${buildQuery(params)}`),
  cancelMyProposal: (id) => request(`/payroll/manager/salary-structures/${id}/cancel`, { method: "POST" }),
  
  // Manager — Runs & Payslips
  getTeamRunSummary: (runId) => request(`/payroll/manager/runs/${runId}/team-summary`),
  getTeamRunItems: (runId, params) => request(`/payroll/manager/runs/${runId}/team-items${buildQuery(params)}`),
  getReportPayslips: (userId) => request(`/payroll/manager/employees/${userId}/payslips`),
  getReportPayslip: (userId, runId) => request(`/payroll/manager/employees/${userId}/payslips/${runId}`),

  // Manager — Reports (#187–#190). Auto-scoped to the manager's reporting line;
  // with compensation visibility off they collapse to totals only (EC-25/EC-67).
  getManagerPayrollRegister: (params) => request(`/payroll/manager/reports/payroll-register${buildQuery({ ...params, format: "json" })}`),
  getManagerDepartmentDistribution: (params) => request(`/payroll/manager/reports/department-distribution${buildQuery({ ...params, format: "json" })}`),
  getManagerDeductionSummary: (params) => request(`/payroll/manager/reports/deduction-summary${buildQuery({ ...params, format: "json" })}`),
  getManagerComponentReport: (params) => request(`/payroll/manager/reports/components${buildQuery({ ...params, format: "json" })}`),

  // ─────────────────────────────────────────────────────────────────────────────
  // Employee Self-Service APIs
  // ─────────────────────────────────────────────────────────────────────────────
  getMyCurrentStructure: () => request("/payroll/me/salary-structure"),
  getMyStructureHistory: () => request("/payroll/me/salary-structure/history"),
  getMyBankAccount: () => request("/payroll/me/bank-account"),
  upsertMyBankAccount: (payload) => request("/payroll/me/bank-account", { method: "PUT", body: JSON.stringify(payload) }),
  
  // Employee — Payslips
  getMyPayslips: () => request("/payroll/me/payslips"),
  getMyPayslip: (runId) => request(`/payroll/me/payslips/${runId}`),
  // #192 — the financial year's month-by-month salary grid.
  getMyAnnualStatement: (params) => request(`/payroll/me/annual-statement${buildQuery(params)}`),
  // #218 — your own leave / comp-off encashments. Mounted at /payroll/me like
  // every other self route (the `/payroll/self/me/...` form in the Phase 6–7
  // drafts was never real and 404s). The response shape is not documented
  // anywhere yet, so nothing reads this at the moment — see the note in
  // payroll_self_endpoints_frontend_guide.md.
  getMyEncashments: (params) => request(`/payroll/me/encashments${buildQuery(params)}`),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3: Variable Pay (Adjustments, Bonuses, Loans & Advances) — API #57–#94
  // ─────────────────────────────────────────────────────────────────────────────

  // HR — Adjustments (#57–#62)
  createAdjustment: (payload) => request("/payroll/hr/adjustments", { method: "POST", body: JSON.stringify(payload) }),
  getAdjustments: (params) => request(`/payroll/hr/adjustments${buildQuery({ ...params, ...WITH_EMPLOYEE })}`),
  getAdjustment: (id) => request(`/payroll/hr/adjustments/${id}${buildQuery(WITH_EMPLOYEE)}`),
  approveAdjustment: (id) => request(`/payroll/hr/adjustments/${id}/approve`, { method: "POST" }),
  rejectAdjustment: (id, payload) => request(`/payroll/hr/adjustments/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  cancelAdjustment: (id) => request(`/payroll/hr/adjustments/${id}/cancel`, { method: "POST" }),

  // HR — Bulk Adjustments (#63–#65)
  previewBulkAdjustments: (payload) => request("/payroll/hr/adjustments/bulk/preview", { method: "POST", body: JSON.stringify(payload) }),
  commitBulkAdjustments: (payload) => request("/payroll/hr/adjustments/bulk", { method: "POST", body: JSON.stringify(payload) }),
  cancelAdjustmentBatch: (batchId) => request(`/payroll/hr/adjustments/batches/${batchId}/cancel`, { method: "POST" }),

  // HR — Bonus Rules (#66–#74)
  createBonusRule: (payload) => request("/payroll/hr/bonus-rules", { method: "POST", body: JSON.stringify(payload) }),
  getBonusRules: (params) => request(`/payroll/hr/bonus-rules${buildQuery(params)}`),
  getBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}`),
  updateBonusRule: (id, payload) => request(`/payroll/hr/bonus-rules/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  approveBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}/approve`, { method: "POST" }),
  rejectBonusRule: (id, payload) => request(`/payroll/hr/bonus-rules/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  previewBonusRuleImpact: (id) => request(`/payroll/hr/bonus-rules/${id}/preview-impact${buildQuery(WITH_EMPLOYEE)}`, { method: "POST" }),
  applyBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}/apply`, { method: "POST" }),
  cancelBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}/cancel`, { method: "POST" }),

  // HR — Loans & Advances (#75–#82)
  grantLoan: (userId, payload) => request(`/payroll/hr/employees/${userId}/loans`, { method: "POST", body: JSON.stringify(payload) }),
  getLoans: (params) => request(`/payroll/hr/loans${buildQuery(params)}`),
  getLoan: (id) => request(`/payroll/hr/loans/${id}`),
  getLoanInstallments: (id) => request(`/payroll/hr/loans/${id}/installments`),
  approveLoan: (id) => request(`/payroll/hr/loans/${id}/approve`, { method: "POST" }),
  rejectLoan: (id, payload) => request(`/payroll/hr/loans/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  cancelLoan: (id) => request(`/payroll/hr/loans/${id}/cancel`, { method: "POST" }),
  forecloseLoan: (id, payload) => request(`/payroll/hr/loans/${id}/foreclose`, { method: "POST", body: JSON.stringify(payload) }),

  // Manager — Team Variable Pay (#83–#90)
  proposeTeamAdjustment: (userId, payload) => request(`/payroll/manager/employees/${userId}/adjustments/propose`, { method: "POST", body: JSON.stringify(payload) }),
  getTeamAdjustments: (params) => request(`/payroll/manager/adjustments${buildQuery(params)}`),
  cancelTeamAdjustment: (id) => request(`/payroll/manager/adjustments/${id}/cancel`, { method: "POST" }),
  proposeTeamBonusRule: (payload) => request("/payroll/manager/bonus-rules/propose", { method: "POST", body: JSON.stringify(payload) }),
  getTeamBonusRules: (params) => request(`/payroll/manager/bonus-rules${buildQuery(params)}`),
  recommendTeamLoan: (userId, payload) => request(`/payroll/manager/employees/${userId}/loans/recommend`, { method: "POST", body: JSON.stringify(payload) }),
  getTeamLoans: (params) => request(`/payroll/manager/loans${buildQuery(params)}`),
  getTeamLoan: (id) => request(`/payroll/manager/loans/${id}`),

  // Employee Self-Service — Variable Pay (#91–#94)
  getMyBonuses: () => request("/payroll/me/bonuses"),
  getMyAdjustments: () => request("/payroll/me/adjustments"),
  getMyLoans: (params) => request(`/payroll/me/loans${buildQuery(params)}`),
  getMyLoanInstallments: (id) => request(`/payroll/me/loans/${id}/installments`),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 4: Statutory & Tax (PF, ESI, PT, TDS, Declarations, Form 16) — API #95–#127
  // ─────────────────────────────────────────────────────────────────────────────

  // HR — Statutory config & PT slabs (#95–#99)
  getStatutoryConfig: () => request("/payroll/hr/statutory/config"),
  updateStatutoryConfig: (payload) => request("/payroll/hr/statutory/config", { method: "PUT", body: JSON.stringify(payload) }),
  getPtSlabs: (params) => request(`/payroll/hr/statutory/pt-slabs${buildQuery(params)}`),
  replacePtSlabs: (stateCode, payload) => request(`/payroll/hr/statutory/pt-slabs/states/${encodeURIComponent(stateCode)}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivatePtSlabs: (stateCode) => request(`/payroll/hr/statutory/pt-slabs/states/${encodeURIComponent(stateCode)}`, { method: "DELETE" }),

  // HR — Income-tax regimes & slabs (#100–#104)
  bootstrapTaxTables: (payload) => request("/payroll/hr/tax/bootstrap", { method: "POST", body: JSON.stringify(payload) }),
  getTaxRegimes: (params) => request(`/payroll/hr/tax/regimes${buildQuery(params)}`),
  updateTaxRegime: (id, payload) => request(`/payroll/hr/tax/regimes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  getTaxRegimeSlabs: (id) => request(`/payroll/hr/tax/regimes/${id}/slabs`),
  replaceTaxRegimeSlabs: (id, payload) => request(`/payroll/hr/tax/regimes/${id}/slabs`, { method: "PUT", body: JSON.stringify(payload) }),

  // HR — Investment declaration verification queue (#105–#109)
  getDeclarationQueue: (params) => request(`/payroll/hr/tax/declarations${buildQuery(params)}`),
  getDeclaration: (id) => request(`/payroll/hr/tax/declarations/${id}`),
  verifyDeclaration: (id, payload) => request(`/payroll/hr/tax/declarations/${id}/verify`, { method: "POST", body: JSON.stringify(payload) }),
  rejectDeclaration: (id, payload) => request(`/payroll/hr/tax/declarations/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  reopenDeclaration: (id, payload) => request(`/payroll/hr/tax/declarations/${id}/reopen`, { method: "POST", body: JSON.stringify(payload) }),

  // HR — Per-employee tax (#110–#116)
  getEmployeeTaxSummary: (userId, params) => request(`/payroll/hr/employees/${userId}/tax/summary${buildQuery(params)}`),
  overrideEmployeeRegime: (userId, payload, params) => request(`/payroll/hr/employees/${userId}/tax/regime${buildQuery(params)}`, { method: "PUT", body: JSON.stringify(payload) }),
  setPreviousEmployer: (userId, payload, params) => request(`/payroll/hr/employees/${userId}/tax/previous-employer${buildQuery(params)}`, { method: "PUT", body: JSON.stringify(payload) }),
  getEmployeeTaxProjection: (userId, params) => request(`/payroll/hr/employees/${userId}/tax/projection${buildQuery(params)}`),
  getEmployeeForm16: (userId, financialYear) => request(`/payroll/hr/employees/${userId}/tax/form16/${encodeURIComponent(financialYear)}`),
  setForm16PartA: (userId, financialYear, payload) => request(`/payroll/hr/employees/${userId}/tax/form16/${encodeURIComponent(financialYear)}/part-a`, { method: "PUT", body: JSON.stringify(payload) }),
  finalizeEmployeeFY: (userId, financialYear) => request(`/payroll/hr/employees/${userId}/tax/financial-years/${encodeURIComponent(financialYear)}/finalize`, { method: "POST" }),

  // HR — Year-end closure (#117–#118)
  finalizeOrgFY: (financialYear, payload) => request(`/payroll/hr/tax/financial-years/${encodeURIComponent(financialYear)}/finalize`, { method: "POST", body: JSON.stringify(payload) }),
  getStatutorySummary: (financialYear) => request(`/payroll/hr/tax/financial-years/${encodeURIComponent(financialYear)}/statutory-summary`),

  // Employee Self-Service — Tax (#119–#127)
  getMyTaxSummary: (params) => request(`/payroll/me/tax/summary${buildQuery(params)}`),
  getMyTaxProjection: (params) => request(`/payroll/me/tax/projection${buildQuery(params)}`),
  getMyMonthlyTax: (params) => request(`/payroll/me/tax/monthly${buildQuery(params)}`),
  getMyDeclaration: (params) => request(`/payroll/me/tax/declarations${buildQuery(params)}`),
  upsertMyDeclaration: (payload, params) => request(`/payroll/me/tax/declarations${buildQuery(params)}`, { method: "PUT", body: JSON.stringify(payload) }),
  submitMyDeclaration: (params) => request(`/payroll/me/tax/declarations/submit${buildQuery(params)}`, { method: "POST" }),
  switchMyRegime: (payload, params) => request(`/payroll/me/tax/regime${buildQuery(params)}`, { method: "PUT", body: JSON.stringify(payload) }),
  getMyForm16: (financialYear) => request(`/payroll/me/tax/form16/${encodeURIComponent(financialYear)}`),
  recordMyDeclarationProofs: (payload, params) => request(`/payroll/me/tax/declarations/proofs${buildQuery(params)}`, { method: "PUT", body: JSON.stringify(payload) }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 5: Reimbursements, Benefits & Documents — API #128–#166
  // Contract: phase5_api_analysis.md / api_registry.md (see PAYROLL_PHASE5_FRONTEND_PLAN.md §0)
  // ─────────────────────────────────────────────────────────────────────────────

  // HR — Reimbursement categories (#128–#132)
  createReimbursementCategory: (payload) => request("/payroll/hr/reimbursements/categories", { method: "POST", body: JSON.stringify(payload) }),
  getReimbursementCategories: (params) => request(`/payroll/hr/reimbursements/categories${buildQuery(params)}`),
  getReimbursementCategory: (id) => request(`/payroll/hr/reimbursements/categories/${id}`),
  updateReimbursementCategory: (id, payload) => request(`/payroll/hr/reimbursements/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivateReimbursementCategory: (id) => request(`/payroll/hr/reimbursements/categories/${id}`, { method: "DELETE" }),

  // HR — Claims queue (#133–#136)
  getReimbursementClaims: (params) => request(`/payroll/hr/reimbursements/claims${buildQuery(params)}`),
  getReimbursementClaim: (id) => request(`/payroll/hr/reimbursements/claims/${id}`),
  approveReimbursementClaim: (id, payload) => request(`/payroll/hr/reimbursements/claims/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectReimbursementClaim: (id, reason) => request(`/payroll/hr/reimbursements/claims/${id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: reason }) }),

  // HR — Documents (#137, #147)
  getAttachmentViewUrl: (attachmentId, params) => request(`/payroll/hr/attachments/${attachmentId}/view-url${buildQuery(params)}`),
  attachForm16PartA: (userId, financialYear, payload) => request(`/payroll/hr/employees/${userId}/tax/form16/${encodeURIComponent(financialYear)}/part-a/attachment`, { method: "POST", body: JSON.stringify(payload) }),

  // HR — Benefit plans & enrollments (#138–#146)
  createBenefitPlan: (payload) => request("/payroll/hr/benefit-plans", { method: "POST", body: JSON.stringify(payload) }),
  getBenefitPlans: (params) => request(`/payroll/hr/benefit-plans${buildQuery(params)}`),
  getBenefitPlan: (id) => request(`/payroll/hr/benefit-plans/${id}`),
  updateBenefitPlan: (id, payload) => request(`/payroll/hr/benefit-plans/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deactivateBenefitPlan: (id) => request(`/payroll/hr/benefit-plans/${id}`, { method: "DELETE" }),
  enrollInBenefitPlan: (planId, payload) => request(`/payroll/hr/benefit-plans/${planId}/enrollments`, { method: "POST", body: JSON.stringify(payload) }),
  getBenefitPlanEnrollments: (planId, params) => request(`/payroll/hr/benefit-plans/${planId}/enrollments${buildQuery(params)}`),
  getEmployeeBenefitEnrollments: (userId, params) => request(`/payroll/hr/employees/${userId}/benefit-enrollments${buildQuery(params)}`),
  endEmployeeBenefitEnrollment: (userId, enrollmentId, payload) => request(`/payroll/hr/employees/${userId}/benefit-enrollments/${enrollmentId}/end`, { method: "POST", body: JSON.stringify(payload) }),

  // Manager — Team claims & benefits (#148–#153)
  getTeamReimbursementClaims: (params) => request(`/payroll/manager/reimbursements/claims${buildQuery(params)}`),
  getTeamReimbursementClaim: (id) => request(`/payroll/manager/reimbursements/claims/${id}`),
  approveTeamReimbursementClaim: (id, payload) => request(`/payroll/manager/reimbursements/claims/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  rejectTeamReimbursementClaim: (id, reason) => request(`/payroll/manager/reimbursements/claims/${id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: reason }) }),
  getTeamAttachmentViewUrl: (attachmentId, params) => request(`/payroll/manager/attachments/${attachmentId}/view-url${buildQuery(params)}`),
  getTeamBenefitEnrollments: (params) => request(`/payroll/manager/team/benefit-enrollments${buildQuery(params)}`),

  // Employee Self-Service — Claims, documents & benefits (#154–#166)
  getMyReimbursementCategories: () => request("/payroll/me/reimbursements/categories"),
  createMyReimbursementClaim: (payload) => request("/payroll/me/reimbursements/claims", { method: "POST", body: JSON.stringify(payload) }),
  getMyReimbursementClaims: (params) => request(`/payroll/me/reimbursements/claims${buildQuery(params)}`),
  getMyReimbursementClaim: (id) => request(`/payroll/me/reimbursements/claims/${id}`),
  replaceMyReimbursementClaim: (id, payload) => request(`/payroll/me/reimbursements/claims/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  submitMyReimbursementClaim: (id) => request(`/payroll/me/reimbursements/claims/${id}/submit`, { method: "POST" }),
  cancelMyReimbursementClaim: (id, reason) => request(`/payroll/me/reimbursements/claims/${id}/cancel`, { method: "POST", body: JSON.stringify(reason ? { cancellation_reason: reason } : {}) }),
  requestClaimReceiptUpload: (claimId, itemId, payload) => request(`/payroll/me/reimbursements/claims/${claimId}/items/${itemId}/attachments`, { method: "POST", body: JSON.stringify(payload) }),
  requestDeclarationProofUpload: (itemId, payload) => request(`/payroll/me/tax/declarations/items/${itemId}/attachments`, { method: "POST", body: JSON.stringify(payload) }),
  confirmMyAttachment: (attachmentId) => request(`/payroll/me/attachments/${attachmentId}/confirm`, { method: "POST" }),
  deleteMyAttachment: (attachmentId) => request(`/payroll/me/attachments/${attachmentId}`, { method: "DELETE" }),
  getMyAttachmentViewUrl: (attachmentId, params) => request(`/payroll/me/attachments/${attachmentId}/view-url${buildQuery(params)}`),
  getMyBenefits: () => request("/payroll/me/benefits"),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 6: Payslips, Reports, Exports & Bank Advice — API #167–#194
  // Contract: md_payrolls/phases/phase6_api_analysis.md + phase6_implementation_plan.md §6.
  //
  // The binary endpoints (PDF, CSV, ZIP) are NOT here: `request()` always parses
  // JSON. They are fetched through `payrollFiles` below with downloadFile().
  // ─────────────────────────────────────────────────────────────────────────────

  // HR — Payslips (#167–#169, #171–#173, #175–#176)
  getRunPayslips: (runId, params) => request(`/payroll/hr/runs/${runId}/payslips${buildQuery(params)}`),
  getEmployeePayslipHistory: (userId, params) => request(`/payroll/hr/employees/${userId}/payslips${buildQuery(params)}`),
  getEmployeePayslip: (userId, runId, params) => request(`/payroll/hr/employees/${userId}/payslips/${runId}${buildQuery(params)}`),
  publishRunPayslips: (runId, payload) => request(`/payroll/hr/runs/${runId}/payslips/publish`, { method: "POST", body: JSON.stringify(payload || {}) }),
  backfillRunPayslips: (runId, payload) => request(`/payroll/hr/runs/${runId}/payslips/backfill`, { method: "POST", body: JSON.stringify(payload || {}) }),
  reissuePayslip: (payslipId, payload) => request(`/payroll/hr/payslips/${payslipId}/reissue`, { method: "POST", body: JSON.stringify(payload) }),
  dispatchRunPayslips: (runId, payload) => request(`/payroll/hr/runs/${runId}/payslips/dispatch`, { method: "POST", body: JSON.stringify(payload || {}) }),
  getRunDispatchStatus: (runId) => request(`/payroll/hr/runs/${runId}/payslips/dispatch-status`),

  // HR — Reports (#177–#180). `format=json` previews on screen; csv/pdf download.
  getPayrollRegister: (params) => request(`/payroll/hr/reports/payroll-register${buildQuery({ ...params, format: "json" })}`),
  getDepartmentDistribution: (params) => request(`/payroll/hr/reports/department-distribution${buildQuery({ ...params, format: "json" })}`),
  getDeductionSummary: (params) => request(`/payroll/hr/reports/deduction-summary${buildQuery({ ...params, format: "json" })}`),
  getComponentReport: (params) => request(`/payroll/hr/reports/components${buildQuery({ ...params, format: "json" })}`),

  // HR — Export audit trail (#182) and the FY salary statement (#183)
  getExports: (params) => request(`/payroll/hr/exports${buildQuery(params)}`),
  getEmployeeAnnualStatement: (userId, params) => request(`/payroll/hr/employees/${userId}/annual-statement${buildQuery(params)}`),
};

/**
 * Paths for the binary Phase 6 endpoints (PDF · CSV · ZIP). Pass one to
 * `downloadFile()` from shared/utils/download.js — every response is
 * `Content-Disposition: attachment`, and every download writes an audit row.
 */
export const payrollFiles = {
  // HR
  hrPayslipPdf: (userId, runId) => `/payroll/hr/employees/${userId}/payslips/${runId}/pdf`,          // #170
  hrRunPayslipsZip: (runId) => `/payroll/hr/runs/${runId}/payslips/download`,                        // #174
  hrReport: (reportKey) => `/payroll/hr/reports/${reportKey}`,                                       // #177–#180
  hrBankAdvice: (runId) => `/payroll/hr/runs/${runId}/bank-advice`,                                  // #181
  hrAnnualStatementPdf: (userId) => `/payroll/hr/employees/${userId}/annual-statement/pdf`,          // #184
  hrForm16Pdf: (userId, financialYear) => `/payroll/hr/employees/${userId}/tax/form16/${encodeURIComponent(financialYear)}/pdf`, // #185

  // Manager
  managerPayslipPdf: (userId, runId) => `/payroll/manager/employees/${userId}/payslips/${runId}/pdf`, // #186
  managerReport: (reportKey) => `/payroll/manager/reports/${reportKey}`,                              // #187–#190

  // Self
  myPayslipPdf: (runId) => `/payroll/me/payslips/${runId}/pdf`,                                       // #191
  myAnnualStatementPdf: () => "/payroll/me/annual-statement/pdf",                                     // #193
  myForm16Pdf: (financialYear) => `/payroll/me/tax/form16/${encodeURIComponent(financialYear)}/pdf`,  // #194
};
