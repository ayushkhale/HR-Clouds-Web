// ─────────────────────────────────────────────────────────────────────────────
// PayrollReportsPage — HR payroll reports (#177–#180).
//
// Org-wide scope. Every download is audited; the record appears under Exports.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { organizationAPI, payrollAPI, payrollFiles } from "../../../../shared/api";
import { normalizePaginated } from "../../../../shared/attendance/normalize";
import PayrollReportsView from "../PayrollReportsView";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";

// Reports only cover closed runs — the engine's figures are final from `approved`.
const REPORTABLE = new Set(["approved", "paid"]);

const FETCHERS = {
  "payroll-register": (params) => payrollAPI.getPayrollRegister(params),
  "department-distribution": (params) => payrollAPI.getDepartmentDistribution(params),
  "deduction-summary": (params) => payrollAPI.getDeductionSummary(params),
  components: (params) => payrollAPI.getComponentReport(params),
};

export default function PayrollReportsPage() {
  const [runs, setRuns] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const { toast, showToast, hideToast } = useToast();

  useEffect(() => {
    let alive = true;
    // All three are filter inputs: a failure narrows the form, it never blocks
    // the report, so each one is allowed to fail on its own.
    payrollAPI.getRuns({ limit: 60 })
      .then((res) => {
        if (!alive) return;
        const list = normalizePaginated(res, ["runs", "records"]).items;
        setRuns(list.filter((run) => REPORTABLE.has(run.status)));
      })
      .catch(() => {});
    organizationAPI.getDepartments()
      .then((res) => { if (alive) setDepartments(res?.data || []); })
      .catch(() => {});
    organizationAPI.getLocations()
      .then((res) => { if (alive) setLocations(res?.data || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <>
      <DashboardTopBar title="Payroll Reports" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Payroll Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Registers, department costs and deduction totals for closed payroll runs. View them here, or download CSV and PDF.
          </p>
        </div>

        <PayrollReportsView
          fetchers={FETCHERS}
          filePath={payrollFiles.hrReport}
          runs={runs}
          departments={departments}
          locations={locations}
          showToast={showToast}
          note="Departments and locations come from the payslip as it was at approval, so a later transfer never re-writes past months. Every download is recorded under Exports."
        />
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
