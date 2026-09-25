// ─────────────────────────────────────────────────────────────────────────────
// ComplianceReportsPage.jsx — The two questions an auditor asks, answered for
// the whole organisation at once: who is missing something they're required to
// hold (#115/#116), and what is about to run out (#117/#118).
//
// They are one screen with two tabs because they are the same worry at
// different ends. A missing passport and a passport expiring on Friday are both
// "this person can't prove something they're supposed to be able to prove".
//
// Two things worth knowing about what is on screen:
//
// · The missing report only counts document types somebody marked as required.
//   An organisation that has never ticked that box gets a spotless 100%, which
//   is misleading rather than wrong — so when there is nothing to be required
//   of anyone, the screen says so instead of celebrating.
//
// · The expiry windows are counted against midnight India time, by the same
//   clock the nightly expiry job uses. So "expires in 6 days" here and the
//   reminder that goes out are never a day apart.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  HiBadgeCheck, HiClipboardCheck, HiClock, HiCloudDownload, HiExclamationCircle,
  HiExternalLink, HiInformationCircle, HiOfficeBuilding, HiRefresh, HiUserGroup, HiX,
} from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { documentsAPI } from "../../../../shared/api";
import { Pagination, PersonCell, Toast, useToast } from "../../../../shared/attendance/ui";
import { rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { fmtDate, fmtDateTime } from "../../../../shared/attendance/dates";
import { useTargetingOptions } from "../../../../shared/attendance/useTargetingOptions";
import { documentErrorMessage, exportTooLargeDetail, isExportLedgerDown } from "../../../../shared/utils/documentErrors";
import useDocumentTypes from "../../../../shared/documents/useDocumentTypes";
import { CompletenessRing } from "../../../../shared/documents/requestUi";
import { ExpiryBucketBadge, ExpiryBucketStrip, PercentBar } from "../../../../shared/documents/phase5Ui";
import {
  EMPLOYMENT_TYPE_FILTERS, EXPIRY_BUCKETS, EXPIRY_HORIZONS, daysRemainingLabel,
  expiringReportOf, missingReportOf, rankDepartments,
} from "../../../../shared/documents/reportMeta";
import { DocEmptyState, DocErrorState, PRIMARY_BTN, SECONDARY_BTN, SELECT } from "../../../../shared/documents/ui";
import useEmployeeDirectory from "../../payroll/useEmployeeDirectory";

const EMPLOYEE_PAGE = 25;
const ROW_PAGE = 50;

const TABS = [
  { key: "missing", label: "Missing documents", icon: HiClipboardCheck },
  { key: "expiring", label: "Expiring soon", icon: HiClock },
];

/* ── Missing mandatory (#115 / #116) ───────────────────────────────────────── */
function MissingReport({ types, departmentOptions, orgLoading, showToast, nameOf }) {
  const [filters, setFilters] = useState({ department_id: "", employment_type: "", document_type_id: "" });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => ({
    department_id: filters.department_id || undefined,
    employment_type: filters.employment_type || undefined,
    document_type_id: filters.document_type_id || undefined,
  }), [filters]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getMissingMandatoryReport({
        ...query,
        include_employees: true,
        employees_limit: EMPLOYEE_PAGE,
        employees_offset: (page - 1) * EMPLOYEE_PAGE,
      });
      if (token !== reqRef.current) return;
      setState({ data: missingReportOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ data: null, loading: false, error });
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { filename } = await documentsAPI.exportMissingMandatoryReport(query);
      showToast(`Downloaded ${filename}. It's recorded in the export log.`);
    } catch (err) {
      const tooLarge = exportTooLargeDetail(err);
      showToast(
        tooLarge
          ? "Too many people match to fit in one spreadsheet. Narrow it by department or employment type and try again."
          : isExportLedgerDown(err)
            ? "Nothing was exported. Downloads are recorded for audit before they're sent, and that record couldn't be written — try again in a moment."
            : documentErrorMessage(err, "Couldn't export this report."),
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  const report = state.data;
  const summary = report?.summary;
  const active = Object.values(filters).filter(Boolean).length;
  const departments = useMemo(() => rankDepartments(report?.byDepartment || []), [report]);
  // Every organisation starts with nothing marked as required, and then this
  // report reads 100% — which is true and useless. Say which it is.
  const nothingRequired = !!report && report.byType.length === 0;
  const totalPages = Math.max(1, Math.ceil(((summary?.employees_incomplete) || 0) / EMPLOYEE_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <select aria-label="Department" value={filters.department_id} onChange={(e) => update({ department_id: e.target.value })} className={SELECT} disabled={orgLoading}>
          <option value="">Every department</option>
          {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select aria-label="Employment type" value={filters.employment_type} onChange={(e) => update({ employment_type: e.target.value })} className={SELECT}>
          {EMPLOYMENT_TYPE_FILTERS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Kind of document" value={filters.document_type_id} onChange={(e) => update({ document_type_id: e.target.value })} className={SELECT}>
          <option value="">Everything that’s required</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {active > 0 && (
          <button type="button" onClick={() => { setFilters({ department_id: "", employment_type: "", document_type_id: "" }); setPage(1); }} className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline px-2">
            <HiX className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <div className="md:ml-auto flex items-center gap-2">
          <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting || state.loading || !summary?.employees_incomplete} className={`${SECONDARY_BTN} !h-10 !py-0`}>
            {exporting ? <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> : <HiCloudDownload className="w-4 h-4" />}
            Spreadsheet
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
          <DocErrorState error={state.error} onRetry={load} fallback="Couldn't run the compliance report." />
        </div>
      ) : state.loading && !report ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : nothingRequired ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
          <DocEmptyState
            icon={HiInformationCircle}
            title="Nothing is required of anybody yet"
            message="No document type has been marked as required, so this report has nothing to measure and everyone counts as complete. Open Document Types, mark the ones people genuinely must hold — ID proof, PAN, signed handbook — and this fills in straight away."
            action={<Link to="/dashboard/hr/documents/types" className={PRIMARY_BTN}><HiBadgeCheck className="w-4 h-4" /> Set what’s required</Link>}
          />
        </div>
      ) : (
        <div className={state.loading ? "opacity-60 space-y-5" : "space-y-5"}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex items-center gap-5">
              <CompletenessRing
                completeness={{
                  required: summary.employees_total,
                  satisfied: summary.employees_complete,
                  percent: summary.completeness_pct,
                  threshold: null,
                }}
                size={104}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Fully compliant</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {summary.employees_complete.toLocaleString("en-IN")} of {summary.employees_total.toLocaleString("en-IN")} people have everything their job requires on file.
                </p>
                {summary.employees_incomplete > 0 && (
                  <p className="text-xs font-bold text-fuchsia-700 mt-2">
                    {summary.employees_incomplete.toLocaleString("en-IN")} {summary.employees_incomplete === 1 ? "person is" : "people are"} missing something.
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center gap-2 mb-3">
                <HiClipboardCheck className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-bold text-slate-800">What’s missing most</h3>
              </div>
              {report.byType.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing outstanding.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {[...report.byType].sort((a, b) => (Number(b.missing_count) || 0) - (Number(a.missing_count) || 0)).slice(0, 5).map((row) => {
                    const missing = Number(row.missing_count) || 0;
                    const requiredFor = Number(row.required_for) || 0;
                    const asked = Number(row.open_request_count) || 0;
                    return (
                      <li key={row.document_type_id} className="flex items-center gap-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800 truncate">{row.name}</span>
                          <span className="block text-[11px] text-slate-400">
                            Required of {requiredFor.toLocaleString("en-IN")} {requiredFor === 1 ? "person" : "people"}
                            {asked > 0 ? ` · ${asked} already asked for` : ""}
                          </span>
                        </span>
                        <span className={`text-sm font-bold tabular-nums shrink-0 ${missing > 0 ? "text-fuchsia-700" : "text-violet-600"}`}>
                          {missing > 0 ? `${missing} missing` : "All in"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {departments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center gap-2 mb-4">
                <HiOfficeBuilding className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-bold text-slate-800">By department</h3>
                <span className="text-[11px] text-slate-400">Least complete first</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {departments.map((row) => (
                  <PercentBar
                    key={row.department_id || row.department_name}
                    value={row.pct}
                    label={row.department_name || "No department"}
                    sub={`${row.incomplete.toLocaleString("en-IN")} of ${row.total.toLocaleString("en-IN")} still missing something`}
                    tone={row.pct !== null && row.pct < 50 ? "rose" : "purple"}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HiUserGroup className="w-4 h-4 text-purple-500" />
                <h3 className="text-sm font-bold text-slate-800">Who still needs chasing</h3>
              </div>
              <p className="text-[11px] text-slate-400">Open anyone to ask them for everything outstanding in one go.</p>
            </div>
            {report.employees.length === 0 ? (
              <DocEmptyState
                icon={HiBadgeCheck}
                title="Everybody is up to date"
                message={active ? "Nobody in this slice of the organisation is missing a required document." : "Every person has every document their job requires. Worth keeping an eye on the expiring tab."}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[720px]">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Person</th>
                        <th className="px-5 py-3.5">Department</th>
                        <th className="px-5 py-3.5">What’s missing</th>
                        <th className="px-5 py-3.5 w-48">How complete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {report.employees.map((row) => {
                        const missing = Array.isArray(row.missing_types) ? row.missing_types : [];
                        return (
                          <tr key={row.user_id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="px-5 py-3.5">
                              {/* The report identifies people by id and code only — it
                                  carries no name — so the name comes from the directory
                                  and the code is the fallback, never both at once. */}
                              <Link to={`/dashboard/hr/documents/employees?user=${row.user_id}`} className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-purple-700">
                                <PersonCell
                                  entity={{ name: nameOf(row.user_id, row.employee_code || "An employee"), employee_code: row.employee_code }}
                                  secondary={row.employee_code || undefined}
                                />
                              </Link>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-600">{row.department_name || <span className="text-slate-300">—</span>}</td>
                            <td className="px-5 py-3.5">
                              <span className="text-xs text-slate-600">
                                {missing.length ? missing.join(", ") : `${(Number(row.required) || 0) - (Number(row.satisfied) || 0)} outstanding`}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <PercentBar value={Number(row.completeness_pct)} sub={`${Number(row.satisfied) || 0} of ${Number(row.required) || 0} on file`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {summary.employees_incomplete > EMPLOYEE_PAGE && (
                  <div className="px-5 py-4 border-t border-slate-100">
                    <Pagination page={page} totalPages={totalPages} total={summary.employees_incomplete} limit={EMPLOYEE_PAGE} onPageChange={setPage} noun="person" />
                  </div>
                )}
              </>
            )}
          </div>

          {report.generatedAt && (
            <p className="text-[11px] text-slate-400">Worked out fresh at {fmtDateTime(report.generatedAt)}. Nothing here is cached, so it is always the state of the organisation right now.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Expiring documents (#117 / #118) ──────────────────────────────────────── */
function ExpiringReport({ types, departmentOptions, orgLoading, showToast }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ within_days: 30, document_type_id: "", department_id: "", include_expired: true });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => ({
    within_days: filters.within_days,
    document_type_id: filters.document_type_id || undefined,
    department_id: filters.department_id || undefined,
    include_expired: filters.include_expired || undefined,
  }), [filters]);

  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await documentsAPI.getExpiringReport({ ...query, limit: ROW_PAGE, offset: (page - 1) * ROW_PAGE });
      if (token !== reqRef.current) return;
      setState({ data: expiringReportOf(res), loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setState({ data: null, loading: false, error });
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  const update = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { filename } = await documentsAPI.exportExpiringReport(query);
      showToast(`Downloaded ${filename}. It's recorded in the export log.`);
    } catch (err) {
      const tooLarge = exportTooLargeDetail(err);
      showToast(
        tooLarge
          ? "Too many documents match to fit in one spreadsheet. Shorten the time window or filter by department, then try again."
          : isExportLedgerDown(err)
            ? "Nothing was exported. Downloads are recorded for audit before they're sent, and that record couldn't be written — try again in a moment."
            : documentErrorMessage(err, "Couldn't export this report."),
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  const report = state.data;
  const rows = report?.rows || [];
  // A row count isn't returned, so paging is offered while a full page came back.
  const hasMore = rows.length === ROW_PAGE;
  const expiredCount = report?.buckets?.expired || 0;

  /**
   * The strip is a summary, and clicking a window changes the horizon rather
   * than filtering what's already on screen — which is what the server can
   * actually do. "Already expired" is the one toggle rather than a horizon.
   */
  const pickBucket = (key) => {
    if (!key) return;
    if (key === "expired") { update({ include_expired: !filters.include_expired }); return; }
    const bucket = EXPIRY_BUCKETS.find((b) => b.key === key);
    update({ within_days: bucket.key === "later" ? 365 : bucket.within });
  };
  const activeBucket = EXPIRY_BUCKETS.find((b) => b.within === filters.within_days)?.key || "";

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <select aria-label="Time window" value={filters.within_days} onChange={(e) => update({ within_days: Number(e.target.value) })} className={SELECT}>
          {EXPIRY_HORIZONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
        <select aria-label="Kind of document" value={filters.document_type_id} onChange={(e) => update({ document_type_id: e.target.value })} className={SELECT}>
          <option value="">Any kind</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="Department" value={filters.department_id} onChange={(e) => update({ department_id: e.target.value })} className={SELECT} disabled={orgLoading}>
          <option value="">Every department</option>
          {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 px-2">
          <input type="checkbox" checked={filters.include_expired} onChange={(e) => update({ include_expired: e.target.checked })} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
          Include ones that already expired
        </label>
        <div className="md:ml-auto flex items-center gap-2">
          <button type="button" onClick={load} disabled={state.loading} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-purple-600 disabled:opacity-50" aria-label="Refresh" title="Refresh">
            <HiRefresh className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting || state.loading || rows.length === 0} className={`${SECONDARY_BTN} !h-10 !py-0`}>
            {exporting ? <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> : <HiCloudDownload className="w-4 h-4" />}
            Spreadsheet
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
          <DocErrorState error={state.error} onRetry={load} fallback="Couldn't run the expiry report." />
        </div>
      ) : state.loading && !report ? (
        <div className="space-y-4">
          <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      ) : (
        <div className={state.loading ? "opacity-60 space-y-5" : "space-y-5"}>
          <ExpiryBucketStrip buckets={report.buckets} active={activeBucket} onPick={pickBucket} includeExpired={filters.include_expired} />

          {expiredCount > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-rose-800">
                {expiredCount} {expiredCount === 1 ? "document has" : "documents have"} already passed their end date. Whatever they prove, they no longer prove it — ask for the renewed copies from each person’s file.
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            {rows.length === 0 ? (
              <DocEmptyState
                icon={HiBadgeCheck}
                title="Nothing runs out in this window"
                message="No document with an end date falls inside it. Try a longer window, or check the missing-documents tab for what was never provided at all."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[860px]">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Document</th>
                        <th className="px-5 py-3.5">Whose</th>
                        <th className="px-5 py-3.5">Expires</th>
                        <th className="px-5 py-3.5">When</th>
                        <th className="px-5 py-3.5">Window</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.map((row) => {
                        const late = Number(row.days_remaining) < 0;
                        return (
                          <tr
                            key={row.id}
                            {...rowPreviewProps(() => navigate(`/dashboard/hr/documents/employees?user=${row.owner?.user_id || ""}`), `Open ${row.owner?.name || "this person"}'s file`)}
                            className={`cursor-pointer outline-none transition-colors ${late ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-purple-50/30 focus:bg-purple-50/40"}`}
                          >
                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-slate-800 truncate max-w-[240px]">{row.title}</p>
                              <p className="text-[11px] text-slate-400 truncate max-w-[240px]">{row.document_type?.name || "Document"}</p>
                            </td>
                            <td className="px-5 py-3.5">
                              <PersonCell entity={{ name: row.owner?.name || "An employee", employee_code: row.owner?.employee_code }} secondary={row.owner?.employee_code || undefined} />
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(row.expires_on)}</td>
                            <td className={`px-5 py-3.5 text-xs font-semibold whitespace-nowrap ${late ? "text-rose-700" : "text-slate-600"}`}>{daysRemainingLabel(row.days_remaining)}</td>
                            <td className="px-5 py-3.5"><ExpiryBucketBadge bucket={row.bucket} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(page > 1 || hasMore) && (
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || state.loading} className={SECONDARY_BTN}>Previous</button>
                    <p className="text-xs font-semibold text-slate-500">Page {page}</p>
                    <button type="button" onClick={() => setPage((p) => p + 1)} disabled={!hasMore || state.loading} className={SECONDARY_BTN}>Next</button>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            Counted against midnight India time on {report.asOf ? fmtDate(report.asOf) : "today"} — the same clock the nightly expiry check uses, so nothing here is ever a day out of step with the reminder emails.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ComplianceReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "missing";
  const { toast, showToast, clearToast } = useToast();
  const { types } = useDocumentTypes("hr");
  const { departmentOptions, loading: orgLoading } = useTargetingOptions();
  const { nameOf } = useEmployeeDirectory();

  const employeeTypes = useMemo(() => types.filter((t) => (t.plane || "employee") === "employee"), [types]);

  return (
    <>
      <DashboardTopBar title="Compliance Reports" />
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Compliance Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              Two questions an auditor always asks, answered for the whole organisation: who is missing paperwork they’re required to have, and what is about to run out. Both can be taken away as a spreadsheet.
            </p>
          </div>
          <Link to="/dashboard/hr/documents/requests" className={`${SECONDARY_BTN} shrink-0 self-start sm:self-auto`}>
            <HiExternalLink className="w-4 h-4" /> Document Requests
          </Link>
        </div>

        <div className="inline-flex gap-1 bg-slate-100/80 p-1 rounded-xl" role="tablist" aria-label="Report">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                onClick={() => setParams(t.key === "missing" ? {} : { tab: t.key }, { replace: true })}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === t.key ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "missing"
          ? <MissingReport types={employeeTypes} departmentOptions={departmentOptions} orgLoading={orgLoading} showToast={showToast} nameOf={nameOf} />
          : <ExpiringReport types={employeeTypes} departmentOptions={departmentOptions} orgLoading={orgLoading} showToast={showToast} />}
      </main>

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
