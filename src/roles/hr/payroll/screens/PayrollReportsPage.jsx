// ─────────────────────────────────────────────────────────────────────────────
// PayrollReportsPage — HR payroll reports (#177–#180).
//
// Org-wide scope. Every download is audited; the record appears under Exports.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { organizationAPI, payrollAPI, payrollFiles } from "../../../../shared/api";
import { listFrom, normalizePaginated } from "../../../../shared/attendance/normalize";
import PayrollReportsView from "../PayrollReportsView";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
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
  const [components, setComponents] = useState(undefined);
  const { toast, showToast, hideToast } = useToast();

  const [runsError, setRunsError] = useState("");
  const alive = useRef(true);
  // Set on every mount: StrictMode mounts, unmounts and mounts again in development.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Closed runs only, asked for by status so cancelled and draft runs (which
  // pile up) can never push an older paid month out of a "latest N" window.
  const loadRuns = useCallback(() => {
    setRunsError("");
    Promise.all([...REPORTABLE].map((status) => payrollAPI.getRuns({ status, limit: 100 })))
      .then((responses) => {
        if (!alive.current) return;
        const byId = new Map();
        responses.forEach((res) => normalizePaginated(res, ["runs", "records"]).items.forEach((run) => run?.id && byId.set(run.id, run)));
        const list = [...byId.values()].sort((a, b) => String(b.period_month || "").localeCompare(String(a.period_month || "")));
        setRuns(list);
      })
      .catch((err) => {
        if (alive.current) setRunsError(payrollErrorMessage(err, "Couldn't load the payroll runs."));
      });
  }, []);

  useEffect(() => {
    loadRuns();
    // Departments, locations and components are filter inputs: a failure
    // narrows the form, it never blocks the report, so each may fail alone.
    organizationAPI.getDepartments()
      .then((res) => { if (alive.current) setDepartments(res?.data || []); })
      .catch(() => {});
    organizationAPI.getLocations()
      .then((res) => { if (alive.current) setLocations(res?.data || []); })
      .catch(() => {});
    payrollAPI.getComponents()
      .then((res) => {
        if (!alive.current) return;
        const list = listFrom(res, ["components", "records"])
          .filter((c) => c?.code)
          .map((c) => ({ code: c.code, name: c.name || c.code }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setComponents(list);
      })
      .catch(() => {});
  }, [loadRuns]);

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
          runsError={runsError}
          onRetryRuns={loadRuns}
          departments={departments}
          locations={locations}
          componentOptions={components}
          showToast={showToast}
          note="Departments and locations come from the payslip as it was at approval, so a later transfer never re-writes past months. Every download is recorded under Exports."
        />
      </main>

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
