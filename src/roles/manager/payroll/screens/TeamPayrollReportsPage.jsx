// ─────────────────────────────────────────────────────────────────────────────
// TeamPayrollReportsPage — the same four reports as HR, scoped to the manager's
// own reporting line (#187–#190).
//
// The scope is enforced by the server: asking for "every department" still
// returns only the people this manager oversees. When the organisation has
// manager compensation visibility switched off, the per-employee reports come
// back as totals only (EC-67) and the view says so.
// ─────────────────────────────────────────────────────────────────────────────

import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, payrollFiles } from "../../../../shared/api";
import PayrollReportsView from "../../../hr/payroll/PayrollReportsView";
import PayrollToast from "../../../hr/payroll/PayrollToast";
import useToast from "../../../hr/payroll/useToast";

const FETCHERS = {
  "payroll-register": (params) => payrollAPI.getManagerPayrollRegister(params),
  "department-distribution": (params) => payrollAPI.getManagerDepartmentDistribution(params),
  "deduction-summary": (params) => payrollAPI.getManagerDeductionSummary(params),
  components: (params) => payrollAPI.getManagerComponentReport(params),
};

export default function TeamPayrollReportsPage() {
  const { toast, showToast, hideToast } = useToast();

  return (
    <>
      <DashboardTopBar title="Team Reports" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Team Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Payroll figures for the people who report to you, for closed payroll months. View them here, or download CSV and PDF.
          </p>
        </div>

        {/* Managers have no run list of their own, so reports run over a period. */}
        <PayrollReportsView
          fetchers={FETCHERS}
          filePath={payrollFiles.managerReport}
          allowRunPicker={false}
          showToast={showToast}
          note="Only your own team appears, whatever filters you choose. Bank details are never included in a manager report."
        />
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
