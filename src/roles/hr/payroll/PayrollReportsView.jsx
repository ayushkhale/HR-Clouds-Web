// ─────────────────────────────────────────────────────────────────────────────
// PayrollReportsView — the four payroll report families, shared by HR (#177–#180)
// and managers (#187–#190). Same screen for both planes; only the endpoints and
// the run picker differ. A manager's scope is forced server-side, so nothing
// here needs to know about hierarchy.
//
// Preview on screen is `format=json`; CSV and PDF stream as downloads and each
// one writes a row in the export audit trail before the first byte.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import { downloadFile } from "../../../shared/utils/download";
import { payrollErrorMessage } from "../../../shared/utils/payrollErrors";
import { formatMoney, formatPeriod } from "../../../shared/utils/formatUtils";
import Skeleton from "../../../shared/components/Skeleton";
import {
  REPORTS, currentPeriodMonth, exportFileName, reportByKey, reportRangeProblem, shiftPeriodMonth,
} from "./phase6Meta";
import {
  HiDocumentDownload, HiDocumentReport, HiExclamationCircle, HiInformationCircle, HiPlay, HiX,
} from "react-icons/hi";

const labelCls = "block text-[10px] font-bold text-slate-400 uppercase mb-1.5";
const fieldCls = "w-full h-[42px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none";

const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : formatMoney(v));
const count = (v) => (v === null || v === undefined || v === "" ? "N/A" : v);
const codesToArray = (text) => String(text || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

/** Column sets per report family. `dynamic` pulls the component columns the response declares. */
function columnsFor(reportKey, data) {
  const dynamic = Array.isArray(data?.columns) ? data.columns : [];
  if (reportKey === "payroll-register") {
    return [
      { key: "period_month", label: "Period", render: (r) => formatPeriod(r.period_month), sticky: true },
      { key: "employee_code", label: "Code", render: (r) => r.employee_code || "N/A" },
      { key: "full_name", label: "Employee", render: (r) => r.full_name || "N/A" },
      { key: "department_name", label: "Department", render: (r) => r.department_name || "Unassigned" },
      { key: "paid_days", label: "Paid days", align: "right", render: (r) => count(r.paid_days) },
      { key: "lop_days", label: "Unpaid days", align: "right", render: (r) => count(r.lop_days) },
      ...dynamic.map((c) => ({
        key: c.key,
        label: c.name || c.label || c.code,
        align: "right",
        render: (r) => money(r.components?.[c.key]),
      })),
      { key: "gross_earnings", label: "Gross", align: "right", render: (r) => money(r.gross_earnings) },
      { key: "total_deductions", label: "Deductions", align: "right", render: (r) => money(r.total_deductions) },
      { key: "net_pay", label: "Net pay", align: "right", strong: true, render: (r) => money(r.net_pay) },
      { key: "ctc_cost", label: "Cost to company", align: "right", render: (r) => money(r.ctc_cost) },
    ];
  }
  if (reportKey === "department-distribution") {
    return [
      { key: "department_name", label: "Department", sticky: true, render: (r) => r.department_name || "Unassigned" },
      { key: "location_name", label: "Location", render: (r) => r.location_name || "N/A" },
      { key: "headcount", label: "People", align: "right", render: (r) => count(r.headcount) },
      { key: "gross_earnings", label: "Gross", align: "right", render: (r) => money(r.gross_earnings) },
      { key: "total_deductions", label: "Deductions", align: "right", render: (r) => money(r.total_deductions) },
      { key: "total_employer_contributions", label: "Employer share", align: "right", render: (r) => money(r.total_employer_contributions) },
      { key: "net_pay", label: "Net pay", align: "right", strong: true, render: (r) => money(r.net_pay) },
      { key: "ctc_cost", label: "Cost to company", align: "right", render: (r) => money(r.ctc_cost) },
    ];
  }
  if (reportKey === "deduction-summary") {
    return [
      { key: "component_name", label: "Deduction", sticky: true, render: (r) => r.component_name || r.component_code || "N/A" },
      { key: "component_code", label: "Code", render: (r) => r.component_code || "N/A" },
      { key: "component_type", label: "Type", render: (r) => (r.component_type === "employer_contribution" ? "Employer contribution" : "Deduction") },
      { key: "headcount", label: "People", align: "right", render: (r) => count(r.headcount) },
      { key: "total_amount", label: "Total", align: "right", strong: true, render: (r) => money(r.total_amount) },
    ];
  }
  return [
    { key: "period_month", label: "Period", sticky: true, render: (r) => formatPeriod(r.period_month) },
    { key: "employee_code", label: "Code", render: (r) => r.employee_code || "N/A" },
    { key: "full_name", label: "Employee", render: (r) => r.full_name || "N/A" },
    { key: "department_name", label: "Department", render: (r) => r.department_name || "Unassigned" },
    { key: "component_name", label: "Component", render: (r) => r.component_name || r.component_code || "N/A" },
    { key: "component_type", label: "Type", render: (r) => (r.component_type ? String(r.component_type).replace(/_/g, " ") : "N/A") },
    { key: "amount", label: "Amount", align: "right", strong: true, render: (r) => money(r.amount) },
  ];
}

/** Totals the response carries, as label/value pairs worth printing under the table. */
function totalsFor(reportKey, data) {
  const t = data?.totals;
  if (!t || typeof t !== "object") return [];
  if (reportKey === "deduction-summary") return [["Total deducted", money(t.total_amount)]];
  if (reportKey === "components") return [["Total", money(t.amount)]];
  return [
    ["Gross", money(t.gross_earnings)],
    ["Deductions", money(t.total_deductions)],
    ["Net pay", money(t.net_pay)],
    ["Cost to company", money(t.ctc_cost)],
  ].filter(([, v]) => v !== "N/A");
}

export default function PayrollReportsView({
  fetchers,
  filePath,
  runs = [],
  allowRunPicker = true,
  departments = [],
  locations = [],
  note,
  showToast,
}) {
  const [reportKey, setReportKey] = useState(REPORTS[0].key);
  const [mode, setMode] = useState(allowRunPicker ? "run" : "period");
  const [runId, setRunId] = useState("");
  const [periodFrom, setPeriodFrom] = useState(() => shiftPeriodMonth(currentPeriodMonth(), -2));
  const [periodTo, setPeriodTo] = useState(() => currentPeriodMonth());
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [componentCodes, setComponentCodes] = useState("");
  const [groupBy, setGroupBy] = useState("department");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyFormat, setBusyFormat] = useState("");
  const [error, setError] = useState("");

  const report = reportByKey(reportKey);

  const params = useMemo(() => {
    const next = {};
    if (mode === "run" && runId) next.run_id = runId;
    else {
      next.period_from = periodFrom;
      next.period_to = periodTo;
    }
    if (departmentId) next.department_id = departmentId;
    if (locationId) next.location_id = locationId;
    if (report.key === "components") {
      const codes = codesToArray(componentCodes);
      if (codes.length) next.component_code = codes;
    }
    if (report.groupBy) next.group_by = groupBy === "department,location" ? "department,location" : "department";
    return next;
  }, [mode, runId, periodFrom, periodTo, departmentId, locationId, componentCodes, groupBy, report]);

  const rangeProblem = reportRangeProblem({
    runId: mode === "run" ? runId : "",
    periodFrom: mode === "period" ? periodFrom : "",
    periodTo: mode === "period" ? periodTo : "",
  });

  const runReport = useCallback(async () => {
    if (rangeProblem) { setError(rangeProblem); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetchers[report.key](params);
      setResult(res?.data || null);
    } catch (err) {
      setResult(null);
      setError(payrollErrorMessage(err, "Couldn't build this report"));
    } finally {
      setLoading(false);
    }
  }, [fetchers, report.key, params, rangeProblem]);

  const exportAs = useCallback(async (format) => {
    if (rangeProblem) { setError(rangeProblem); return; }
    setBusyFormat(format);
    setError("");
    try {
      const period = params.run_id ? "run" : `${params.period_from}_${params.period_to}`;
      await downloadFile(filePath(report.key), {
        params: { ...params, format },
        filename: exportFileName({ kind: report.key, period, extension: format }),
      });
      showToast?.(`${report.label} downloaded as ${format.toUpperCase()}.`);
    } catch (err) {
      const message = payrollErrorMessage(err, `Couldn't export this report as ${format.toUpperCase()}`);
      setError(message);
      showToast?.(message, "error");
    } finally {
      setBusyFormat("");
    }
  }, [filePath, report, params, rangeProblem, showToast]);

  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const columns = columnsFor(report.key, result);
  const totals = totalsFor(report.key, result);
  const hasRun = result !== null;
  // EC-67: a manager without compensation visibility gets totals but no rows.
  const collapsedToTotals = hasRun && rows.length === 0 && totals.length > 0;

  return (
    <div className="space-y-5">
      {/* Which report */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {REPORTS.map((r) => {
          const active = r.key === reportKey;
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={active}
              onClick={() => { setReportKey(r.key); setResult(null); setError(""); }}
              className={`text-left rounded-2xl border p-4 transition ${active ? "border-purple-500 bg-purple-50/60 ring-2 ring-purple-100" : "bg-white border-slate-100 shadow-sm hover:border-purple-200"}`}
            >
              <p className={`text-sm font-bold ${active ? "text-purple-800" : "text-slate-800"}`}>{r.label}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.hint}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5 space-y-4">
        {allowRunPicker && (
          <div className="inline-flex bg-slate-100 rounded-xl p-1" role="tablist" aria-label="Report period">
            {[["run", "One payroll run"], ["period", "A period"]].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => { setMode(value); setResult(null); setError(""); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${mode === value ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {mode === "run" ? (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="report-run">Payroll run</label>
              <select id="report-run" value={runId} onChange={(e) => setRunId(e.target.value)} className={fieldCls}>
                <option value="">Choose a run…</option>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {formatPeriod(run.period_month)} · {run.status === "paid" ? "Paid" : "Approved"}
                  </option>
                ))}
              </select>
              {runs.length === 0 && <p className="text-[11px] text-slate-400 mt-1.5">No approved or paid runs yet — reports only cover closed runs.</p>}
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls} htmlFor="report-from">From month</label>
                <input id="report-from" type="month" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="report-to">To month</label>
                <input id="report-to" type="month" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={fieldCls} />
              </div>
            </>
          )}

          {departments.length > 0 && (
            <div>
              <label className={labelCls} htmlFor="report-dept">Department</label>
              <select id="report-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={fieldCls}>
                <option value="">Every department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {locations.length > 0 && (
            <div>
              <label className={labelCls} htmlFor="report-location">Location</label>
              <select id="report-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={fieldCls}>
                <option value="">Every location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}

          {report.groupBy && (
            <div>
              <label className={labelCls} htmlFor="report-groupby">Group by</label>
              <select id="report-groupby" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={fieldCls}>
                <option value="department">Department</option>
                <option value="department,location">Department and location</option>
              </select>
            </div>
          )}

          {report.key === "components" && (
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="report-codes">Component codes</label>
              <input
                id="report-codes"
                value={componentCodes}
                onChange={(e) => setComponentCodes(e.target.value)}
                placeholder="e.g. BASIC, HRA, SPECIAL_ALLOWANCE"
                className={fieldCls}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">Separate codes with commas. Leave empty for every component.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={runReport}
            disabled={loading || !!rangeProblem}
            className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <HiPlay className="w-4 h-4" /> {loading ? "Building…" : "Show report"}
          </button>
          {report.formats.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => exportAs(format)}
              disabled={!!busyFormat || !!rangeProblem}
              className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiDocumentDownload className="w-4 h-4" />
              {busyFormat === format ? "Preparing…" : `Download ${format.toUpperCase()}`}
            </button>
          ))}
          {rangeProblem && <span className="text-xs font-semibold text-fuchsia-700">{rangeProblem}</span>}
        </div>

        {note && (
          <p className="flex items-start gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" /> {note}
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          <HiExclamationCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss"><HiX className="w-4 h-4 opacity-60" /></button>
        </div>
      )}

      {/* Result */}
      {loading ? (
        <Skeleton type="table" rows={6} />
      ) : !hasRun ? (
        <div className="bg-white rounded-2xl border border-slate-100 border-dashed shadow-sm py-16 px-6 text-center">
          <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <HiDocumentReport className="w-7 h-7 text-purple-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">{report.label}</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{report.hint} Choose what it should cover, then show it on screen or download it.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">{report.label}</h3>
              <p className="text-[11px] text-slate-400">
                {result?.row_count ?? rows.length} row{(result?.row_count ?? rows.length) === 1 ? "" : "s"}
                {params.run_id ? " · one run" : ` · ${formatPeriod(params.period_from)} to ${formatPeriod(params.period_to)}`}
              </p>
            </div>
            {totals.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {totals.map(([label, value]) => (
                  <div key={label} className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
                    <p className="text-sm font-black text-purple-700 tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {collapsedToTotals ? (
            <p className="px-5 py-8 text-sm text-slate-600 text-center">
              Your organisation doesn&apos;t let managers see individual pay, so this report shows totals only.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-sm text-slate-500 text-center">Nothing matched. Try a wider period or fewer filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {columns.map((c) => (
                      <th key={c.key} className={`px-4 py-3 whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map((row, i) => (
                    <tr key={`${row.user_id || row.component_code || row.department_id || "row"}-${i}`} className="hover:bg-purple-50/40 transition-colors">
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={`px-4 py-3 whitespace-nowrap ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.strong ? "font-bold text-purple-700" : "text-slate-700"}`}
                        >
                          {c.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
