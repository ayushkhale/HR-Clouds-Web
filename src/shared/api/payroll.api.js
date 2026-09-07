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
  getRunEligibility: () => request("/payroll/hr/runs/eligibility"),
  createRun: (payload) => request("/payroll/hr/runs", { method: "POST", body: JSON.stringify(payload) }),
  getRuns: (params) => request(`/payroll/hr/runs${buildQuery(params)}`),
  getRun: (id) => request(`/payroll/hr/runs/${id}`),
  calculateRun: (id) => request(`/payroll/hr/runs/${id}/calculate`, { method: "POST" }),
  getRunPreview: (id) => request(`/payroll/hr/runs/${id}/preview`),
  getRunItems: (id, params) => request(`/payroll/hr/runs/${id}/items${buildQuery(params)}`),
  getRunItem: (id, itemId) => request(`/payroll/hr/runs/${id}/items/${itemId}`),
  excludeRunItem: (id, itemId, payload) => request(`/payroll/hr/runs/${id}/items/${itemId}/exclude`, { method: "POST", body: JSON.stringify(payload) }),
  includeRunItem: (id, itemId) => request(`/payroll/hr/runs/${id}/items/${itemId}/include`, { method: "POST" }),
  overrideRunItemPeriod: (id, itemId, payload) => request(`/payroll/hr/runs/${id}/items/${itemId}/override-period`, { method: "POST", body: JSON.stringify(payload) }),
  approveRun: (id) => request(`/payroll/hr/runs/${id}/approve`, { method: "POST" }),
  cancelRun: (id) => request(`/payroll/hr/runs/${id}/cancel`, { method: "POST" }),
  payRun: (id) => request(`/payroll/hr/runs/${id}/pay`, { method: "POST" }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Manager APIs
  // ─────────────────────────────────────────────────────────────────────────────
  getTeamSalaryStructures: () => request("/payroll/manager/team/salary-structures"),
  getTeamMemberStructureHistory: (userId) => request(`/payroll/manager/employees/${userId}/salary-structures`),
  getTeamMemberCurrentStructure: (userId) => request(`/payroll/manager/employees/${userId}/salary-structures/current`),
  proposeTeamMemberStructure: (userId, payload) => request(`/payroll/manager/employees/${userId}/salary-structures`, { method: "POST", body: JSON.stringify(payload) }),
  getMyProposals: () => request("/payroll/manager/salary-structures/proposals"),
  cancelMyProposal: (id) => request(`/payroll/manager/salary-structures/proposals/${id}/cancel`, { method: "POST" }),
  
  // Manager — Runs & Payslips
  getTeamRunSummary: (runId) => request(`/payroll/manager/runs/${runId}/summary`),
  getTeamRunItems: (runId) => request(`/payroll/manager/runs/${runId}/items`),
  getReportPayslips: (userId) => request(`/payroll/manager/employees/${userId}/payslips`),
  getReportPayslip: (userId, runId) => request(`/payroll/manager/employees/${userId}/payslips/${runId}`),

  // ─────────────────────────────────────────────────────────────────────────────
  // Employee Self-Service APIs
  // ─────────────────────────────────────────────────────────────────────────────
  getMyCurrentStructure: () => request("/payroll/me/salary-structure/current"),
  getMyStructureHistory: () => request("/payroll/me/salary-structures"),
  getMyBankAccount: () => request("/payroll/me/bank-account"),
  upsertMyBankAccount: (payload) => request("/payroll/me/bank-account", { method: "PUT", body: JSON.stringify(payload) }),
  
  // Employee — Payslips
  getMyPayslips: () => request("/payroll/me/payslips"),
  getMyPayslip: (runId) => request(`/payroll/me/payslips/${runId}`),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 3: Variable Pay (Adjustments, Bonuses, Loans)
  // ─────────────────────────────────────────────────────────────────────────────
  
  // HR Adjustments
  createAdjustment: (payload) => request("/payroll/hr/adjustments", { method: "POST", body: JSON.stringify(payload) }),
  getAdjustments: (params) => request(`/payroll/hr/adjustments${buildQuery(params)}`),
  getAdjustment: (id) => request(`/payroll/hr/adjustments/${id}`),
  approveAdjustment: (id) => request(`/payroll/hr/adjustments/${id}/approve`, { method: "POST" }),
  rejectAdjustment: (id, payload) => request(`/payroll/hr/adjustments/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  cancelAdjustment: (id) => request(`/payroll/hr/adjustments/${id}/cancel`, { method: "POST" }),
  
  // HR Bulk Adjustments
  previewBulkAdjustments: (payload) => request("/payroll/hr/adjustments/bulk/preview", { method: "POST", body: JSON.stringify(payload) }),
  commitBulkAdjustments: (payload) => request("/payroll/hr/adjustments/bulk/commit", { method: "POST", body: JSON.stringify(payload) }),
  
  // HR Bonus Rules
  createBonusRule: (payload) => request("/payroll/hr/bonus-rules", { method: "POST", body: JSON.stringify(payload) }),
  getBonusRules: (params) => request(`/payroll/hr/bonus-rules${buildQuery(params)}`),
  getBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}`),
  approveBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}/approve`, { method: "POST" }),
  rejectBonusRule: (id, payload) => request(`/payroll/hr/bonus-rules/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  applyBonusRule: (id) => request(`/payroll/hr/bonus-rules/${id}/apply`, { method: "POST" }),
  
  // HR Loans
  grantLoan: (payload) => request("/payroll/hr/loans", { method: "POST", body: JSON.stringify(payload) }),
  getLoans: (params) => request(`/payroll/hr/loans${buildQuery(params)}`),
  getLoanInstallments: (id) => request(`/payroll/hr/loans/${id}/installments`),
  approveLoan: (id) => request(`/payroll/hr/loans/${id}/approve`, { method: "POST" }),
  rejectLoan: (id, payload) => request(`/payroll/hr/loans/${id}/reject`, { method: "POST", body: JSON.stringify(payload) }),
  forecloseLoan: (id) => request(`/payroll/hr/loans/${id}/foreclose`, { method: "POST" }),

  // Manager Adjustments
  proposeTeamAdjustment: (userId, payload) => request(`/payroll/manager/employees/${userId}/adjustments`, { method: "POST", body: JSON.stringify(payload) }),
  getTeamAdjustments: (params) => request(`/payroll/manager/adjustments${buildQuery(params)}`),
  cancelTeamAdjustment: (id) => request(`/payroll/manager/adjustments/${id}/cancel`, { method: "POST" }),

  // Employee Loans
  getMyLoans: (params) => request(`/payroll/me/loans${buildQuery(params)}`),
  getMyLoanInstallments: (id) => request(`/payroll/me/loans/${id}/installments`),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 4: Statutory & Tax
  // ─────────────────────────────────────────────────────────────────────────────
  getTaxConfigurations: () => request("/payroll/hr/tax-configurations"),
  updateTaxConfigurations: (payload) => request("/payroll/hr/tax-configurations", { method: "PUT", body: JSON.stringify(payload) }),
  getInvestmentDeclarations: (params) => request(`/payroll/hr/investment-declarations${buildQuery(params)}`),
  approveInvestmentDeclaration: (id, payload) => request(`/payroll/hr/investment-declarations/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  submitInvestmentDeclaration: (payload) => request("/payroll/me/investment-declarations", { method: "POST", body: JSON.stringify(payload) }),
  getMyTaxProjections: () => request("/payroll/me/tax-projections"),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 5: Reimbursements & Benefits
  // ─────────────────────────────────────────────────────────────────────────────
  getBenefitPlans: () => request("/payroll/hr/benefit-plans"),
  createBenefitPlan: (payload) => request("/payroll/hr/benefit-plans", { method: "POST", body: JSON.stringify(payload) }),
  getReimbursementClaims: (params) => request(`/payroll/hr/reimbursements${buildQuery(params)}`),
  processReimbursementClaim: (id, payload) => request(`/payroll/hr/reimbursements/${id}/process`, { method: "POST", body: JSON.stringify(payload) }),
  
  getTeamReimbursementClaims: (params) => request(`/payroll/manager/reimbursements${buildQuery(params)}`),
  approveTeamReimbursementClaim: (id, payload) => request(`/payroll/manager/reimbursements/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  
  getMyReimbursementClaims: () => request("/payroll/me/reimbursements"),
  submitReimbursementClaim: (payload) => request("/payroll/me/reimbursements", { method: "POST", body: JSON.stringify(payload) }),
  getMyBenefitPlans: () => request("/payroll/me/benefit-plans"),
  enrollBenefitPlan: (id, payload) => request(`/payroll/me/benefit-plans/${id}/enroll`, { method: "POST", body: JSON.stringify(payload) }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 6: Reports & Delivery
  // ─────────────────────────────────────────────────────────────────────────────
  getPayrollRegisters: (params) => request(`/payroll/hr/reports/registers${buildQuery(params)}`),
  exportPayrollRegister: (params) => request(`/payroll/hr/reports/registers/export${buildQuery(params)}`),
  exportNEFTAdvice: (runId) => request(`/payroll/hr/reports/neft/${runId}/export`)
};
