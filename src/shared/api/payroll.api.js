import { request } from "./client.js";

// Helper to construct query string
const buildQuery = (params) => {
  if (!params) return "";
  const query = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return query ? `?${query}` : "";
};

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
  getRunPreview: (id) => request(`/payroll/hr/runs/${id}/preview`),
  getRunItems: (id, params) => request(`/payroll/hr/runs/${id}/items${buildQuery(params)}`),
  getRunItem: (id, itemId) => request(`/payroll/hr/runs/${id}/items/${itemId}`),
  excludeRunItem: (id, itemId, payload) => request(`/payroll/hr/runs/${id}/items/${itemId}/exclude`, { method: "POST", body: JSON.stringify(payload) }),
  includeRunItem: (id, itemId) => request(`/payroll/hr/runs/${id}/items/${itemId}/include`, { method: "POST" }),
  overrideRunItemPeriod: (id, itemId, payload) => request(`/payroll/hr/runs/${id}/items/${itemId}/period`, { method: "PATCH", body: JSON.stringify(payload) }),
  approveRun: (id) => request(`/payroll/hr/runs/${id}/approve`, { method: "POST" }),
  cancelRun: (id) => request(`/payroll/hr/runs/${id}/cancel`, { method: "POST" }),
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3: Variable Pay (Adjustments, Bonuses, Loans & Advances) — API #57–#94
  // ─────────────────────────────────────────────────────────────────────────────

  // HR — Adjustments (#57–#62)
  createAdjustment: (payload) => request("/payroll/hr/adjustments", { method: "POST", body: JSON.stringify(payload) }),
  getAdjustments: (params) => request(`/payroll/hr/adjustments${buildQuery(params)}`),
  getAdjustment: (id) => request(`/payroll/hr/adjustments/${id}`),
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
  previewBonusRuleImpact: (id) => request(`/payroll/hr/bonus-rules/${id}/preview-impact`, { method: "POST" }),
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
  // ⚠️  UNVERIFIED — Phase 5 (Reimbursements & Benefits) and Phase 6 (Reports &
  //     Delivery) are NOT yet implemented on the backend (confirmed 2026-09-12).
  //     None of the endpoints below appear in combined_api_analysis-2.md; the
  //     paths were written speculatively and must not be wired into any screen
  //     until the backend contract is published. Do not delete — kept as the
  //     starting point once those phases ship.
  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 5: Reimbursements & Benefits
  // getBenefitPlans: () => request("/payroll/hr/benefit-plans"),
  // createBenefitPlan: (payload) => request("/payroll/hr/benefit-plans", { method: "POST", body: JSON.stringify(payload) }),
  // getReimbursementClaims: (params) => request(`/payroll/hr/reimbursements${buildQuery(params)}`),
  // processReimbursementClaim: (id, payload) => request(`/payroll/hr/reimbursements/${id}/process`, { method: "POST", body: JSON.stringify(payload) }),
  // getTeamReimbursementClaims: (params) => request(`/payroll/manager/reimbursements${buildQuery(params)}`),
  // approveTeamReimbursementClaim: (id, payload) => request(`/payroll/manager/reimbursements/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  // getMyReimbursementClaims: () => request("/payroll/me/reimbursements"),
  // submitReimbursementClaim: (payload) => request("/payroll/me/reimbursements", { method: "POST", body: JSON.stringify(payload) }),
  // getMyBenefitPlans: () => request("/payroll/me/benefit-plans"),
  // enrollBenefitPlan: (id, payload) => request(`/payroll/me/benefit-plans/${id}/enroll`, { method: "POST", body: JSON.stringify(payload) }),
  //
  // Phase 6: Reports & Delivery
  // getPayrollRegisters: (params) => request(`/payroll/hr/reports/registers${buildQuery(params)}`),
  // exportPayrollRegister: (params) => request(`/payroll/hr/reports/registers/export${buildQuery(params)}`),
  // exportNEFTAdvice: (runId) => request(`/payroll/hr/reports/neft/${runId}/export`),
};
