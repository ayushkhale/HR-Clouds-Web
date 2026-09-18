import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiExclamationCircle, HiArrowLeft, HiCalculator, HiCheck, HiCash, HiSearch, HiChevronLeft,
  HiChevronRight, HiBan, HiRefresh, HiCalendar, HiClock, HiLightBulb,
  HiDocumentText, HiUserGroup, HiShieldCheck, HiCurrencyRupee, HiExternalLink, HiInformationCircle,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import ReasonDialog from "../../../../shared/components/ReasonDialog";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage, runFailureAdvice } from "../../../../shared/utils/payrollErrors";
import { formatPeriod, formatMoney, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizePaginated, personName, employeeCode, departmentName } from "../../../../shared/attendance/normalize";
import PayrollToast from "../PayrollToast";
import useToast from "../useToast";
import useEmployeeDirectory from "../useEmployeeDirectory";
import { embeddedEmployee } from "../variablePayMeta";
import {
  runStatusMeta, runActions, RUN_CONFIRM, RUN_ACTION_SUCCESS, RUN_ACTION_FAILURE, cancelRunDescription, cancelBlockedReason,
  itemErrorMeta, parseWarnings, periodBounds, inferredExitDate, COMPONENT_SOURCE_LABEL, ENGINE_COMPONENT_LABEL,
  LEDGER_META, ledgerReasonText, ledgerDataIssues, STATUTORY_NOTE, PREVIEW_WARNING_LABEL, VARIABLE_PAY_FIELDS,
  STATUTORY_FIELDS, PAYOUT_FIELDS, toCount, plural, prettifyCode, itemsLockedReason,
} from "../runMeta";
import RunPayslipsPanel from "../RunPayslipsPanel";

const PAGE_SIZE = 20;
// Backend maximum for run items. The preview's error_items carry no item id, so
// the "needs attention" list always comes from the items endpoint.
const PROBLEM_LIMIT = 200;

const ITEM_FILTERS = [
  ["", "Everyone"],
  ["calculated", "Calculated"],
  ["error", "Needs attention"],
  ["excluded", "Excluded"],
  ["pending", "Waiting"],
];

const ITEM_STATUS = {
  pending: { label: "Waiting", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  calculated: { label: "Calculated", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  error: { label: "Needs attention", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  excluded: { label: "Excluded", cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
};

const dayCount = (v) => String(toCount(v));
const minutesLabel = (mins) => {
  const m = Math.round(toCount(mins));
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ""}` : `${r}m`;
};
const hasValue = (v) => v !== undefined && v !== null && v !== "";
const itemIdOf = (item) => item?.id ?? item?.item_id ?? null;

function Spinner({ light = false }) {
  return <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${light ? "border-white/30 border-t-white" : "border-purple-200 border-t-purple-600"}`} />;
}

function ItemStatusPill({ status }) {
  const s = ITEM_STATUS[status] || { label: prettifyCode(status) || "Unknown", cls: "bg-slate-50 text-slate-600 border-slate-200" };
  return <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

// ── Payslip preview for one employee (#44) ──────────────────────────────────
function RunItemDialog({ runId, seed, person, canEdit, lockedReason, busy, busyAction, onClose, onChangePeriod, onExclude, onInclude, onOpenLink }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const seedId = itemIdOf(seed);

  useEffect(() => {
    let cancelled = false;
    if (!seedId) {
      setState({ loading: false, data: null, error: "This row has no payslip id, so the full payslip can't be loaded. Refresh the page and try again." });
      return undefined;
    }
    setState({ loading: true, data: null, error: "" });
    payrollAPI.getRunItem(runId, seedId)
      .then((res) => { if (!cancelled) setState({ loading: false, data: res?.data ?? res, error: "" }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, data: null, error: payrollErrorMessage(err, "Couldn't load this payslip.") }); });
    return () => { cancelled = true; };
  }, [runId, seedId]);

  const detail = state.data && typeof state.data === "object" ? state.data : {};
  // `{ item, components, day_ledger }`; day_ledger is item.attendance_snapshot under a second name.
  const item = { ...seed, ...(detail.item && typeof detail.item === "object" ? detail.item : {}) };
  const components = Array.isArray(detail.components) ? detail.components : [];
  const ledgerSource = detail.day_ledger || item.attendance_snapshot;
  const ledger = Array.isArray(ledgerSource?.per_date) ? ledgerSource.per_date : [];
  const dataIssues = ledgerDataIssues(ledger);
  // Error and excluded items have every figure zeroed; showing ₹0 pay would mislead.
  const hasFigures = item.status === "calculated";
  const warnings = parseWarnings(item.calculation_warnings);
  const errorMeta = item.status === "error" ? itemErrorMeta(item.error_code) : null;

  const byType = (type) => components.filter((c) => c.component_type === type);
  // D-31: a reimbursement is paid on top of net pay and is NOT part of gross, so
  // it must not sit under Earnings (else "gross − deductions" stops equalling net).
  // A taxable reimbursement is emitted as an `earning` and stays in Earnings.
  const earnings = byType("earning");
  const reimbursements = byType("reimbursement");
  const deductions = byType("deduction");
  const employer = byType("employer_contribution");
  const reimbursementAmount = Number.parseFloat(item.reimbursement_amount) || 0;
  const benefitEmployeeAmount = Number.parseFloat(item.benefit_employee_amount) || 0;
  const benefitEmployerAmount = Number.parseFloat(item.benefit_employer_amount) || 0;

  const lineColumns = (tone) => [
    { header: "Component", render: (c) => <span className="font-semibold text-slate-700">{ENGINE_COMPONENT_LABEL[c.component_code] || c.component_name || prettifyCode(c.component_code)}</span> },
    { header: "From", render: (c) => <DetailPill tone="muted">{COMPONENT_SOURCE_LABEL[c.source] || prettifyCode(c.source) || "Salary"}</DetailPill> },
    { header: "Full month", align: "right", render: (c) => (hasValue(c.full_month_amount) ? <span className="tabular-nums text-slate-500">{formatMoney(c.full_month_amount)}</span> : null) },
    { header: "This month", align: "right", render: (c) => <span className={`font-bold tabular-nums ${tone}`}>{formatMoney(c.amount)}</span> },
  ];

  const hasStatutory = hasFigures && ["pf_employee_amount", "esi_employee_amount", "professional_tax_amount", "income_tax_amount", "pf_wage"].some((k) => hasValue(item[k]));
  const statutoryNote = STATUTORY_NOTE[item.statutory_status];
  const periodChanged = !!item.period_override_reason;

  return (
    <DetailDialog
      eyebrow="Payslip in this run"
      icon={HiDocumentText}
      title={person.name}
      subtitle={[person.department, person.code].filter(Boolean).join(" · ") || undefined}
      badge={<DetailPill tone="onDark">{ITEM_STATUS[item.status]?.label || prettifyCode(item.status) || "N/A"}</DetailPill>}
      loading={state.loading}
      onClose={onClose}
      footer={state.loading ? null : !canEdit ? (
        <DetailFooterNote>{lockedReason}</DetailFooterNote>
      ) : !seedId ? null : item.status === "excluded" ? (
        <button type="button" onClick={() => onInclude(item)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
          {busyAction === `include:${seedId}` ? <Spinner light /> : <HiRefresh className="w-4 h-4" />} Include again
        </button>
      ) : (
        <>
          <button type="button" onClick={() => onExclude(item)} disabled={busy} className="sm:mr-auto px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
            <HiBan className="w-4 h-4" /> Exclude from run
          </button>
          <button type="button" onClick={() => onChangePeriod(item)} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
            <HiCalendar className="w-4 h-4" /> Change pay period
          </button>
        </>
      )}
    >
      {state.error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{state.error}</p>}

      {errorMeta && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-800"><HiExclamationCircle className="w-5 h-5" /> {errorMeta.title}</p>
          <p className="text-sm text-rose-800/90 mt-1.5">{errorMeta.explain}</p>
          <p className="text-sm text-rose-900 font-semibold mt-1.5">How to fix: <span className="font-normal">{errorMeta.fix}</span></p>
          {item.error_reason && <p className="text-xs text-rose-700 mt-2 bg-white/70 border border-rose-100 rounded-lg px-3 py-2"><b>Details from payroll:</b> {item.error_reason}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {errorMeta.setPeriod && canEdit && seedId && (
              <button type="button" onClick={() => onChangePeriod(item)} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition">Set last working day</button>
            )}
            {errorMeta.link && (
              <button type="button" onClick={() => onOpenLink(errorMeta.link.to)} className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-100 rounded-lg transition inline-flex items-center gap-1">
                {errorMeta.link.label} <HiExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            {item.error_code && <span className="text-[10px] font-mono text-rose-500">{item.error_code}</span>}
          </div>
        </section>
      )}

      {item.status === "excluded" && (
        <DetailText label="Excluded from this run because">{item.exclusion_reason}</DetailText>
      )}

      {warnings.length > 0 && (
        <DetailSection title={`Heads-up (${warnings.length})`} icon={HiLightBulb}>
          <ul className="space-y-2">
            {warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className="rounded-xl bg-fuchsia-50/70 border border-fuchsia-100 px-3.5 py-2.5">
                <p className="text-sm font-bold text-fuchsia-900">{w.title}</p>
                {w.explain && <p className="text-xs text-fuchsia-800 mt-0.5">{w.explain}</p>}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {statutoryNote && (
        <p className="flex items-start gap-2 text-xs text-purple-800 bg-purple-100/60 border border-purple-200 rounded-xl px-3.5 py-2.5">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5" /> {statutoryNote}
        </p>
      )}

      {hasFigures ? (
        <DetailStats
          items={[
            { label: "Gross pay", value: formatMoney(item.gross_earnings), icon: HiCurrencyRupee },
            { label: "Deductions", value: formatMoney(item.total_deductions), icon: HiBan },
            { label: "Net pay", value: formatMoney(item.net_pay), icon: HiCheck },
            { label: "Cost to company", value: formatMoney(item.ctc_cost), hint: hasValue(item.total_employer_contributions) ? `Employer contributions ${formatMoney(item.total_employer_contributions)}` : undefined, icon: HiUserGroup },
          ]}
        />
      ) : !state.loading && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          {item.status === "excluded"
            ? "No pay is worked out for someone excluded from the run."
            : item.status === "error"
              ? "No pay was worked out because of the problem above. The figures appear once it's fixed and the run is recalculated."
              : "Pay hasn't been worked out yet. Calculate the run to see the figures."}
        </p>
      )}

      {hasFigures && reimbursementAmount > 0 && (
        <p className="flex items-start gap-2 text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-xl px-3.5 py-2.5">
          <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5" /> Net pay includes {formatMoney(reimbursementAmount)} of reimbursements, which aren&apos;t part of gross pay.
        </p>
      )}

      <DetailSection title="Pay period & days" icon={HiCalendar}>
        <DetailGrid
          items={[
            ["Pay period starts", item.period_start ? formatDate(item.period_start) : null],
            ["Pay period ends", item.period_end ? formatDate(item.period_end) : null],
            ...(hasFigures ? [
              ["Days paid", dayCount(item.payable_days)],
              ["Unpaid days (LOP)", dayCount(item.lop_days)],
              ["Paid holidays & week-offs", dayCount(item.paid_non_working_days)],
              ["Working days in month", dayCount(item.standard_working_days)],
              ["Days used for a day's pay", dayCount(item.lop_divisor)],
              ["Unpaid leave deduction", formatMoney(item.lop_amount)],
              ["Overtime", `${minutesLabel(item.overtime_minutes)} · ${formatMoney(item.overtime_amount)}`],
              ["Shortfall recovered", formatMoney(item.carry_forward_in)],
              ["Shortfall carried forward", formatMoney(item.carry_forward_out)],
              ...(reimbursementAmount > 0 ? [["Reimbursements (paid on top)", formatMoney(item.reimbursement_amount)]] : []),
              ...(benefitEmployeeAmount > 0 ? [["Benefits (employee share)", formatMoney(item.benefit_employee_amount)]] : []),
              ...(benefitEmployerAmount > 0 ? [["Benefits (company share)", formatMoney(item.benefit_employer_amount)]] : []),
              ["Calculated on", item.calculated_at ? formatDate(item.calculated_at) : null],
            ] : []),
          ]}
        />
        {periodChanged && (
          <div className="mt-3"><DetailText label="Pay period was changed because">{item.period_override_reason}</DetailText></div>
        )}
      </DetailSection>

      {hasFigures && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <DetailSection title="Earnings" icon={HiCurrencyRupee}>
            <DetailTable columns={lineColumns("text-slate-800")} rows={earnings} empty="No earnings in this payslip." />
          </DetailSection>
          <DetailSection title="Deductions" icon={HiBan}>
            <DetailTable columns={lineColumns("text-rose-600")} rows={deductions} empty="No deductions in this payslip." />
          </DetailSection>
        </div>
      )}

      {hasFigures && reimbursements.length > 0 && (
        <DetailSection title="Reimbursements (added to net pay, not part of gross)" icon={HiCurrencyRupee}>
          <DetailTable columns={lineColumns("text-purple-700")} rows={reimbursements} />
        </DetailSection>
      )}

      {hasFigures && employer.length > 0 && (
        <DetailSection title="Paid by the company (not deducted)" icon={HiUserGroup}>
          <DetailTable columns={lineColumns("text-purple-700")} rows={employer} />
        </DetailSection>
      )}

      {hasStatutory && (
        <DetailSection title="Statutory figures" icon={HiShieldCheck}>
          <DetailGrid
            items={[
              ["Pay counted for PF", formatMoney(item.pf_wage)],
              ["Pay counted for ESI", formatMoney(item.esi_wage)],
              ["Taxable earnings", formatMoney(item.taxable_earnings)],
              ["Covered by ESI", item.esi_covered ? "Yes" : "No"],
              ["PF (employee)", formatMoney(item.pf_employee_amount)],
              ["PF (employer)", formatMoney(item.pf_employer_amount)],
              ["Pension (EPS)", formatMoney(item.eps_amount)],
              ["ESI (employee)", formatMoney(item.esi_employee_amount)],
              ["ESI (employer)", formatMoney(item.esi_employer_amount)],
              ["Professional tax", formatMoney(item.professional_tax_amount)],
              ["Income tax (TDS)", formatMoney(item.income_tax_amount)],
            ]}
          />
        </DetailSection>
      )}

      {ledger.length > 0 && (
        <DetailSection title="Attendance used for pay" icon={HiClock}>
          {(dataIssues.noRecord > 0 || dataIssues.orphanLeave > 0) && (
            <p className="mb-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
              {[
                dataIssues.noRecord ? `${plural(dataIssues.noRecord, "working day")} had no attendance marked` : "",
                dataIssues.orphanLeave ? `${plural(dataIssues.orphanLeave, "day")} showed leave with no approved leave behind it` : "",
              ].filter(Boolean).join(", and ")}
              . {dataIssues.noRecord + dataIssues.orphanLeave === 1 ? "It was" : "These were"} counted as unpaid. If that’s wrong, correct the attendance or leave, then recalculate.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {ledger.map((day, i) => {
              const meta = LEDGER_META[day.c] || { label: prettifyCode(day.c) || "Other", cls: "bg-slate-100 text-slate-500" };
              const dayNum = String(day.d || "").split("-").pop();
              const paid = Number(day.p);
              const title = [...new Set([
                formatDate(day.d),
                meta.label,
                day.r ? ledgerReasonText(day.r) : "",
                paid > 0 && paid < 1 ? "half paid" : "",
              ].filter(Boolean))].join(" · ");
              return (
                <span key={day.d || i} title={title} className={`w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold tabular-nums ${meta.cls}`}>
                  {dayNum || "?"}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
            {Object.entries(LEDGER_META).filter(([k]) => ledger.some((day) => day.c === k)).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${v.cls}`} /> {v.label}</span>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailDialog>
  );
}

export default function PayrollRunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();

  const [run, setRun] = useState(null);
  const [header, setHeader] = useState({ loading: true, error: "" });
  const [preview, setPreview] = useState(null);
  // Every employee, leavers included: someone who left this month is still in the run.
  // Fetched only once a row arrives without an embedded employee (gap G-2).
  const [needDirectory, setNeedDirectory] = useState(false);
  const people = useEmployeeDirectory({ enabled: needDirectory });

  const rawStatus = searchParams.get("status") || "";
  const statusFilter = ITEM_FILTERS.some(([v]) => v === rawStatus) ? rawStatus : "";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState({ list: [], total: 0, totalPages: 1 });
  const [itemsState, setItemsState] = useState({ loading: true, error: "" });
  const [problems, setProblems] = useState({ list: [], loading: false, error: "" });

  const [busyAction, setBusyAction] = useState("");
  const busyRef = useRef(false);
  const [detail, setDetail] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: "cancel" | "exclude" | "period", item? }
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [periodDraft, setPeriodDraft] = useState({ start: "", end: "" });
  const problemsRef = useRef(null);
  const tableRef = useRef(null);
  const itemsReq = useRef(0);

  const lookup = people.directory.byId;
  const lookupName = people.nameOf;
  const who = useCallback((item) => {
    // The backend's embedded employee (gap G-2) resolves leavers, so it wins.
    const embedded = embeddedEmployee(item);
    if (embedded) return { name: embedded.name, code: embedded.code, department: embedded.department };
    // Payroll rows carry `user_id` (a users.id); never the role-profile `employee_id`.
    const emp = lookup.get(item?.user_id);
    return {
      // Directory name, any other name on the row, then "Loading…" / "Employee not found".
      name: emp?.name || personName(item, "") || employeeCode(item) || lookupName(item?.user_id),
      code: emp?.code || employeeCode(item),
      department: emp?.department || departmentName(item),
    };
  }, [lookup, lookupName]);

  // ── Loading ───────────────────────────────────────────────────────────────
  const loadHeader = useCallback(async () => {
    try {
      const res = await payrollAPI.getRun(runId);
      const data = res?.data ?? res;
      setRun(data);
      setHeader({ loading: false, error: "" });
      // The preview is read over calculated figures; a draft has none yet.
      if (data && data.status !== "draft" && data.status !== "calculating") {
        payrollAPI.getRunPreview(runId).then((p) => setPreview(p?.data ?? p ?? null)).catch(() => setPreview(null));
      } else {
        setPreview(null);
      }
      return data;
    } catch (err) {
      setHeader({ loading: false, error: payrollErrorMessage(err, "Couldn't load this payroll run.") });
      return null;
    }
  }, [runId]);

  const loadItems = useCallback(async () => {
    const reqId = ++itemsReq.current;
    setItemsState({ loading: true, error: "" });
    try {
      const params = { page, limit: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      const res = await payrollAPI.getRunItems(runId, params);
      if (reqId !== itemsReq.current) return;
      const norm = normalizePaginated(res, ["items", "records"], params);
      setItems({ list: norm.items, total: norm.total, totalPages: norm.totalPages });
      setItemsState({ loading: false, error: "" });
    } catch (err) {
      if (reqId !== itemsReq.current) return;
      setItemsState({ loading: false, error: payrollErrorMessage(err, "Couldn't load the employees in this run.") });
    }
  }, [runId, page, statusFilter]);

  const loadProblems = useCallback(async (errorCount) => {
    if (!errorCount) {
      setProblems({ list: [], loading: false, error: "" });
      return;
    }
    setProblems((p) => ({ ...p, loading: true, error: "" }));
    try {
      const params = { status: "error", page: 1, limit: PROBLEM_LIMIT };
      const res = await payrollAPI.getRunItems(runId, params);
      setProblems({ list: normalizePaginated(res, ["items", "records"], params).items, loading: false, error: "" });
    } catch (err) {
      setProblems({ list: [], loading: false, error: payrollErrorMessage(err, "Couldn't load the employees with problems.") });
    }
  }, [runId]);

  const refreshAll = useCallback(async () => {
    const data = await loadHeader();
    loadItems();
    if (data) loadProblems(toCount(data.error_count));
  }, [loadHeader, loadItems, loadProblems]);

  useEffect(() => {
    setHeader({ loading: true, error: "" });
    loadHeader().then((data) => { if (data) loadProblems(toCount(data.error_count)); });
  }, [loadHeader, loadProblems]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Every row shown by name comes from these three lists. One row without an
  // embedded employee means the backend hasn't shipped G-2: load the directory.
  useEffect(() => {
    if (needDirectory) return;
    const warningRows = Array.isArray(preview?.variable_pay?.warning_items) ? preview.variable_pay.warning_items : [];
    if ([...items.list, ...problems.list, ...warningRows].some((r) => r && !embeddedEmployee(r))) setNeedDirectory(true);
  }, [needDirectory, items.list, problems.list, preview]);

  // While the engine is working, poll the header; reload the lists when it finishes.
  useEffect(() => {
    if (run?.status !== "calculating") return undefined;
    // Only while the tab is watched; returning to it checks immediately.
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const data = await loadHeader();
      if (data && data.status !== "calculating") {
        loadItems();
        loadProblems(toCount(data.error_count));
      }
    };
    const timer = setInterval(tick, 8000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [run?.status, loadHeader, loadItems, loadProblems]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const acts = runActions(run);
  const cancelBlocked = cancelBlockedReason(run);
  const status = run?.status;
  const meta = runStatusMeta(status);
  const bounds = periodBounds(run);

  const setFilter = (value) => {
    setPage(1);
    setSearchParams(value ? { status: value } : {}, { replace: true });
  };

  const runAction = async (action) => {
    if (busyRef.current || !run) return;
    busyRef.current = true;
    let started = false;
    try {
      const prompt = RUN_CONFIRM[action]?.(run);
      if (prompt && !(await window.confirm(prompt))) return;
      started = true;
      setBusyAction(action);
      if (action === "calculate") await payrollAPI.calculateRun(runId);
      else if (action === "approve") await payrollAPI.approveRun(runId);
      else if (action === "pay") await payrollAPI.payRun(runId);
      showToast(RUN_ACTION_SUCCESS[action]);
    } catch (err) {
      showToast(payrollErrorMessage(err, RUN_ACTION_FAILURE[action]), "error");
    } finally {
      busyRef.current = false;
      setBusyAction("");
      if (started) refreshAll();
    }
  };

  const withDialog = async (call, okMessage, failMessage) => {
    setDialogBusy(true);
    setDialogError("");
    try {
      await call();
      setDialog(null);
      setDetail(null);
      showToast(okMessage);
      refreshAll();
    } catch (err) {
      setDialogError(payrollErrorMessage(err, failMessage));
    } finally {
      setDialogBusy(false);
    }
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError("");
  };

  const openPeriod = (item) => {
    const inRange = (d) => (d && (!bounds.start || d >= bounds.start) && (!bounds.end || d <= bounds.end) ? d : "");
    // No inferred day (G-4 `null`, or "unknown" in older reasons): the run's last day stays.
    const inferred = item.error_code === "EXIT_DATE_REQUIRED" ? inferredExitDate(item) : "";
    setPeriodDraft({
      start: inRange(String(item.period_start || "").slice(0, 10)) || bounds.start,
      end: inRange(inferred) || inRange(String(item.period_end || "").slice(0, 10)) || bounds.end,
    });
    setDialogError("");
    setDialog({ kind: "period", item });
  };

  const openExclude = (item) => {
    setDialogError("");
    setDialog({ kind: "exclude", item });
  };

  const includeItem = async (item) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (!(await window.confirm(`Include ${who(item).name} in this run again? Recalculate the run afterwards to work out their pay.`))) return;
      setBusyAction(`include:${itemIdOf(item)}`);
      await payrollAPI.includeRunItem(runId, itemIdOf(item));
      setDetail(null);
      showToast("Employee included again. Recalculate the run to work out their pay.");
      refreshAll();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Couldn't include this employee."), "error");
    } finally {
      busyRef.current = false;
      setBusyAction("");
    }
  };

  const periodValid = !!periodDraft.start && !!periodDraft.end
    && periodDraft.start <= periodDraft.end
    && (!bounds.start || periodDraft.start >= bounds.start)
    && (!bounds.end || periodDraft.end <= bounds.end);

  const scrollToProblems = () => problemsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const showAllProblemsInTable = () => {
    setFilter("error");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── Derived view data ─────────────────────────────────────────────────────
  const problemList = problems.list;

  const query = search.trim().toLowerCase();
  const visibleItems = query
    ? items.list.filter((it) => {
      const p = who(it);
      return [p.name, p.code, p.department].some((v) => (v || "").toLowerCase().includes(query));
    })
    : items.list;

  const variablePay = preview?.variable_pay && typeof preview.variable_pay === "object" ? preview.variable_pay : null;
  const statutory = preview?.statutory && typeof preview.statutory === "object" ? preview.statutory : null;
  const payouts = preview?.payouts && typeof preview.payouts === "object" ? preview.payouts : null;
  const warningItems = Array.isArray(variablePay?.warning_items) ? variablePay.warning_items.filter((w) => parseWarnings(w.warnings).length > 0) : [];
  // `warnings` is an object of counts. Error and excluded counts already have
  // their own panel and filter tabs; the rest are the reasons behind the errors.
  const warningCounts = preview?.warnings && typeof preview.warnings === "object" && !Array.isArray(preview.warnings)
    ? Object.entries(preview.warnings).filter(([key, v]) => toCount(v) > 0 && key !== "error_items" && key !== "excluded_items")
    : [];
  // People who will be paid but have no verified bank account (calculated items only).
  const missingBank = status === "calculated" || status === "approved" ? toCount(preview?.missing_bank_account_count) : 0;
  const hasHeadsUp = warningItems.length > 0 || warningCounts.length > 0 || missingBank > 0;
  const departments = Array.isArray(preview?.department_breakdown) ? preview.department_breakdown : [];

  // ── Render ────────────────────────────────────────────────────────────────
  if (header.loading && !run) {
    return (
      <>
        <DashboardTopBar title="Payroll Run" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full"><Skeleton type="dashboard" /></main>
      </>
    );
  }

  if (!run) {
    return (
      <>
        <DashboardTopBar title="Payroll Run" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-3xl mx-auto w-full">
          <div className="py-14 px-6 text-center bg-white rounded-2xl border border-rose-200">
            <HiExclamationCircle className="w-9 h-9 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-700">{header.error || "This payroll run couldn't be found."}</p>
            <div className="flex justify-center gap-3 mt-5">
              <button type="button" onClick={() => navigate("/dashboard/hr/payroll/runs")} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition">All runs</button>
              <button type="button" onClick={() => { setHeader({ loading: true, error: "" }); refreshAll(); }} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition">Try again</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  const busy = !!busyAction;

  return (
    <>
      <DashboardTopBar title="Payroll Run" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
        <button type="button" onClick={() => navigate("/dashboard/hr/payroll/runs")} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-purple-700 transition mb-5">
          <HiArrowLeft className="w-4 h-4" /> All runs
        </button>

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{formatPeriod(run.period_month)}</h1>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${meta.pill}`}>{meta.label}</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">{run.notes || meta.hint}</p>
            <p className="text-xs text-slate-400 mt-1">
              {[
                bounds.start && bounds.end ? `${formatDate(bounds.start)} to ${formatDate(bounds.end)}` : "",
                run.calculated_at ? `Calculated ${formatDate(run.calculated_at)}` : "",
                run.approved_at ? `Approved ${formatDate(run.approved_at)}` : "",
                run.paid_at ? `Paid ${formatDate(run.paid_at)}` : "",
              ].filter(Boolean).join(" · ")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={refreshAll} disabled={busy} aria-label="Refresh" title="Refresh" className="p-2.5 text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition disabled:opacity-50">
              <HiRefresh className="w-4 h-4" />
            </button>
            {acts.canCalculate && (
              <button type="button" onClick={() => runAction("calculate")} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-xl transition flex items-center gap-2 disabled:opacity-50">
                {busyAction === "calculate" ? <Spinner /> : <HiCalculator className="w-4 h-4" />} {acts.calculateLabel}
              </button>
            )}
            {status === "calculated" && (
              <button type="button" onClick={() => runAction("approve")} disabled={busy || !acts.canApprove} title={acts.approveBlockers.join(" ")} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed">
                {busyAction === "approve" ? <Spinner light /> : <HiCheck className="w-4 h-4" />} Approve
              </button>
            )}
            {acts.canPay && (
              <button type="button" onClick={() => runAction("pay")} disabled={busy} className="px-4 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200 disabled:opacity-50">
                {busyAction === "pay" ? <Spinner light /> : <HiCash className="w-4 h-4" />} Mark as paid
              </button>
            )}
            {acts.showCancel && (
              // The span carries the tooltip: a disabled button fires no mouse
              // events, so a `title` on it would never show.
              <span title={cancelBlocked || undefined} className="inline-flex">
                <button
                  type="button"
                  onClick={() => { setDialogError(""); setDialog({ kind: "cancel" }); }}
                  disabled={busy || !acts.canCancel}
                  aria-label={cancelBlocked ? `Cancel run — unavailable. ${cancelBlocked}` : "Cancel run"}
                  className="px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <HiBan className="w-4 h-4" /> Cancel run
                </button>
              </span>
            )}
          </div>
        </div>

        {/* ── State banners ── */}
        {busyAction === "calculate" && (
          // Calculate is one synchronous request that returns the finished run;
          // for a large organisation it can take tens of seconds.
          <div role="status" className="mb-5 flex items-center gap-3 text-sm text-purple-800 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <Spinner /> <span><b>Working out everyone’s pay…</b> This can take up to a minute for large teams. Keep this page open.</span>
          </div>
        )}
        {acts.isCalculating && busyAction !== "calculate" && (
          <div className="mb-5 flex items-center gap-3 text-sm text-purple-800 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <Spinner /> <span><b>Calculating pay…</b> This page updates by itself when it’s done.</span>
          </div>
        )}
        {acts.stuck && (
          <div className="mb-5 flex items-start gap-2.5 text-sm text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-3">
            <HiClock className="w-5 h-5 shrink-0 text-fuchsia-600" />
            <span><b>The calculation seems stuck.</b> It started over 30 minutes ago. Use “Retry calculation” to start it again.</span>
          </div>
        )}
        {status === "failed" && (
          <div className="mb-5 flex items-start gap-2.5 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
            <HiExclamationCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-bold">The calculation failed.</p>
              <p className="mt-0.5">{run.failure_reason || "No reason was recorded."}</p>
              <p className="mt-1 text-rose-700/90">
                {runFailureAdvice(run)
                  ? <><b>What to do:</b> {runFailureAdvice(run)} Then use “Retry calculation”.</>
                  : "Fix the cause (for example, missing tax slabs), then use “Retry calculation”."}
              </p>
            </div>
          </div>
        )}
        {status === "cancelled" && (
          <div className="mb-5 flex items-start gap-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <HiBan className="w-5 h-5 shrink-0 text-slate-500" />
            <div>
              <p className="font-bold">Cancelled{run.cancelled_at ? ` on ${formatDate(run.cancelled_at)}` : ""}.</p>
              <p className="mt-0.5">Reason: {run.cancellation_reason || "No reason was recorded."}</p>
            </div>
          </div>
        )}

        {status === "calculated" && acts.approveBlockers.length > 0 && (
          <div className="mb-5 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-bold text-fuchsia-900"><HiExclamationCircle className="w-5 h-5 text-fuchsia-600" /> Before you can approve</p>
            <ul className="mt-1.5 space-y-1 text-sm text-fuchsia-800 list-disc pl-6">
              {acts.approveBlockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2 mt-3">
              {acts.stale && (
                <button type="button" onClick={() => runAction("calculate")} disabled={busy} className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition disabled:opacity-50">Recalculate now</button>
              )}
              {acts.errorCount > 0 && (
                <button type="button" onClick={scrollToProblems} className="px-3 py-1.5 text-xs font-bold text-fuchsia-900 bg-white border border-fuchsia-200 hover:bg-fuchsia-100 rounded-lg transition">Show the problems</button>
              )}
            </div>
          </div>
        )}

        {/* ── Totals ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Employees</p>
            <p className="text-xl font-black text-slate-800 mt-1 tabular-nums">{toCount(run.total_employees)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {[toCount(run.error_count) ? `${toCount(run.error_count)} need attention` : "", toCount(run.excluded_count) ? `${toCount(run.excluded_count)} excluded` : ""].filter(Boolean).join(" · ") || "No problems"}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Gross pay</p>
            <p className="text-xl font-black text-slate-800 mt-1 tabular-nums">{formatMoney(run.total_gross)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Cost to company {formatMoney(run.total_employer_cost)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase">Deductions</p>
            <p className="text-xl font-black text-rose-600 mt-1 tabular-nums">{formatMoney(run.total_deductions)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-4">
            <p className="text-[11px] font-bold text-purple-500 uppercase">Net pay</p>
            <p className="text-xl font-black text-purple-700 mt-1 tabular-nums">{formatMoney(run.total_net)}</p>
          </div>
        </div>

        {/* ── Payslips, email delivery and the bank file ── */}
        <RunPayslipsPanel run={run} showToast={showToast} />

        {/* ── Problems that block approval ── */}
        {acts.errorCount > 0 && (
          <section ref={problemsRef} className="bg-white rounded-2xl border border-rose-200 shadow-sm mb-5 overflow-hidden scroll-mt-6">
            <div className="px-5 py-4 border-b border-rose-100 bg-rose-50/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-rose-800 flex items-center gap-2">
                  <HiExclamationCircle className="w-5 h-5" /> {plural(acts.errorCount, "employee")} need{acts.errorCount === 1 ? "s" : ""} attention
                </h2>
                <p className="text-xs text-rose-700/90 mt-0.5">The run can’t be approved until each one is fixed or excluded. After fixing the cause, recalculate the run.</p>
              </div>
              {acts.canCalculate && (
                <button type="button" onClick={() => runAction("calculate")} disabled={busy} className="px-3 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50">
                  <HiRefresh className="w-4 h-4" /> Recalculate
                </button>
              )}
            </div>

            {problems.loading ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">Loading problems…</div>
            ) : problemList.length === 0 ? (
              <div className="px-5 py-6 text-sm text-slate-600 flex flex-wrap items-center gap-3">
                <span>{problems.error || "No employees with problems were found, so the count above may be out of date."}</span>
                <button type="button" onClick={refreshAll} className="text-xs font-bold text-purple-700 underline">Refresh</button>
                <button type="button" onClick={showAllProblemsInTable} className="text-xs font-bold text-purple-700 underline">Show them in the table below</button>
              </div>
            ) : (
              <ul className="divide-y divide-rose-50">
                {problemList.map((raw, i) => {
                  const item = { ...raw, id: itemIdOf(raw) };
                  const person = who(item);
                  const em = itemErrorMeta(item.error_code);
                  // Starts with the visible text so voice control ("click Review & fix") matches.
                  const reviewLabel = `Review & fix: ${person.name}`;
                  return (
                    <li
                      key={item.id || item.user_id || i}
                      {...rowPreviewProps(() => setDetail(item), reviewLabel)}
                      className="px-5 py-4 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3 lg:gap-5 items-start cursor-pointer hover:bg-rose-50/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{person.name}</p>
                        <p className="text-xs text-slate-400 truncate">{[person.department, person.code].filter(Boolean).join(" · ") || "N/A"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-rose-700">{em.title}</p>
                        <p className="text-sm text-slate-600 mt-0.5">{em.explain}</p>
                        <p className="text-xs text-slate-500 mt-1"><b className="text-slate-700">How to fix:</b> {em.fix}</p>
                        {item.error_reason && <p className="text-xs text-slate-500 mt-1"><b className="text-slate-700">Details from payroll:</b> {item.error_reason}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {acts.errorCount > problemList.length && problemList.length > 0 && (
              <p className="px-5 py-3 text-xs text-slate-500 border-t border-rose-50">
                Showing the first {problemList.length} of {acts.errorCount}. <button type="button" onClick={showAllProblemsInTable} className="font-bold text-purple-700 underline">See all in the table</button>
              </p>
            )}
          </section>
        )}

        {/* ── Heads-up: warnings that don't block approval ── */}
        {hasHeadsUp && (
          <section className="bg-white rounded-2xl border border-fuchsia-200 shadow-sm mb-5 overflow-hidden">
            <div className="px-5 py-4 border-b border-fuchsia-100 bg-fuchsia-50/60">
              <h2 className="text-sm font-bold text-fuchsia-900 flex items-center gap-2"><HiLightBulb className="w-5 h-5" /> Worth checking before you approve</h2>
              <p className="text-xs text-fuchsia-800/90 mt-0.5">These don’t stop approval, but they change what some employees receive.</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {missingBank > 0 && (
                <p className="flex items-start gap-2 text-sm text-fuchsia-900 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-3.5 py-2.5">
                  <HiCash className="w-4 h-4 shrink-0 mt-0.5" />
                  <span><b>{plural(missingBank, "employee")} will be paid but {missingBank === 1 ? "has" : "have"} no verified bank account.</b> Verify their bank details before salaries are sent.</span>
                </p>
              )}
              {warningCounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Behind the problems:</span>
                  {warningCounts.map(([key, value]) => (
                    <span key={key} className="text-xs font-semibold text-fuchsia-900 bg-fuchsia-50 border border-fuchsia-200 rounded-lg px-2.5 py-1">{PREVIEW_WARNING_LABEL[key] || prettifyCode(key)}: {toCount(value)}</span>
                  ))}
                </div>
              )}
              {warningItems.length > 0 && (
                <ul className="divide-y divide-fuchsia-50 border border-fuchsia-100 rounded-xl">
                  {warningItems.slice(0, 50).map((w, i) => {
                    const person = who(w);
                    const parsed = parseWarnings(w.warnings);
                    return (
                      <li key={w.user_id || i} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate">{person.name}</p>
                        <ul className="space-y-1">
                          {parsed.map((p, j) => <li key={`${p.code}-${j}`} className="text-xs text-slate-600"><b className="text-fuchsia-900">{p.title}:</b> {p.explain}</li>)}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ── Extra pay and statutory totals ── */}
        {(() => {
          const blocks = [
            ["Bonuses, adjustments & loans", variablePay, VARIABLE_PAY_FIELDS, HiCurrencyRupee],
            ["Tax & statutory", statutory, STATUTORY_FIELDS, HiShieldCheck],
            ["Reimbursements & benefits", payouts, PAYOUT_FIELDS, HiCash],
          ]
            .filter(([, block]) => block)
            .map(([title, block, fields, Icon]) => [title, block, fields.filter(([key]) => hasValue(block[key])), Icon])
            // A block of all zeros (e.g. no reimbursements this month) is noise.
            .filter(([, block, present]) => present.some(([key]) => toCount(block[key]) !== 0));
          if (blocks.length === 0) return null;
          return (
            <div className={`grid grid-cols-1 ${blocks.length > 1 ? "xl:grid-cols-2" : ""} gap-5 mb-5`}>
              {blocks.map(([title, block, present, Icon]) => (
                <section key={title} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Icon className="w-4 h-4 text-purple-600" /> {title}</h3>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {present.map(([key, label, kind, tone]) => {
                      // e.g. employees who had ₹0 professional tax deducted.
                      const flagged = tone === "bad" && toCount(block[key]) > 0;
                      return (
                        <div key={key} className={`rounded-xl border px-3 py-2.5 ${flagged ? "bg-rose-50 border-rose-200" : "bg-purple-50/60 border-purple-100/70"}`}>
                          <dt className={`text-[10px] font-bold uppercase tracking-wider ${flagged ? "text-rose-600" : "text-purple-500"}`}>{label}</dt>
                          <dd className={`text-sm font-bold tabular-nums mt-0.5 ${flagged ? "text-rose-700" : "text-slate-800"}`}>{kind === "money" ? formatMoney(block[key]) : toCount(block[key])}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ))}
            </div>
          );
        })()}

        {/* ── Department breakdown ── */}
        {departments.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Cost by department</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Calculated employees only, so headcounts add up to the processed count. */}
              {departments.map((d, i) => (
                <div key={d.department_id || `unassigned-${i}`} className="flex justify-between items-center gap-3 bg-purple-50/50 rounded-xl px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{d.department || "Unassigned"}</p>
                    <p className="text-[11px] text-slate-400">
                      {[plural(toCount(d.headcount), "employee"), toCount(d.total_lop_days) > 0 ? `${toCount(d.total_lop_days)} unpaid days` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{formatMoney(d.total_net)}</p>
                    <p className="text-[11px] text-slate-400 tabular-nums">net · cost {formatMoney(d.total_employer_cost)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Employees in this run ── */}
        <section ref={tableRef} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden scroll-mt-6">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
            <div className="relative w-full lg:max-w-xs">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter this page by name or code" aria-label="Filter this page by name or code" className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs font-semibold overflow-x-auto" role="tablist" aria-label="Filter employees by status">
              {ITEM_FILTERS.map(([value, label]) => {
                const count = value === "error" ? toCount(run.error_count) : value === "excluded" ? toCount(run.excluded_count) : null;
                return (
                  <button key={value} type="button" role="tab" aria-selected={statusFilter === value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded-md transition whitespace-nowrap ${statusFilter === value ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    {label}{count ? ` (${count})` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[820px]">
              <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide">Employee</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide text-right">Days paid / unpaid</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide text-right">Gross</th>
                  <th className="px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {itemsState.loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">Loading employees…</td></tr>
                ) : itemsState.error ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center">
                    <p className="text-sm text-rose-700">{itemsState.error}</p>
                    <button type="button" onClick={loadItems} className="mt-3 text-xs font-bold text-purple-700 underline">Try again</button>
                  </td></tr>
                ) : visibleItems.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    {items.list.length === 0
                      ? statusFilter ? "No employees with this status." : status === "draft" ? "Calculate the run to list everyone's pay." : "No employees in this run."
                      : "No employees on this page match your filter."}
                  </td></tr>
                ) : visibleItems.map((raw) => {
                  const it = { ...raw, id: itemIdOf(raw) };
                  const person = who(it);
                  const warningsCount = parseWarnings(it.calculation_warnings).length;
                  const needsFix = it.status === "error";
                  const openLabel = `${needsFix ? "Review" : "View"} payslip for ${person.name}`;
                  return (
                    <tr key={it.id || it.user_id} {...rowPreviewProps(() => setDetail(it), openLabel)}>
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-800">{person.name}</p>
                        <p className="text-xs text-slate-400">{[person.department, person.code].filter(Boolean).join(" · ") || "N/A"}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <ItemStatusPill status={it.status} />
                        {it.status === "error" && <p className="text-xs font-semibold text-rose-600 mt-1">{itemErrorMeta(it.error_code).title}</p>}
                        {it.status === "excluded" && <p className="text-xs text-fuchsia-700 mt-1 max-w-[240px] truncate" title={it.exclusion_reason || undefined}>{it.exclusion_reason || "No reason recorded"}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {warningsCount > 0 && <span className="text-[10px] font-bold text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200 rounded px-1.5 py-0.5">{plural(warningsCount, "heads-up", "heads-ups")}</span>}
                          {it.period_override_reason && <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">Pay period changed</span>}
                        </div>
                      </td>
                      {/* Error, excluded and pending rows have every figure zeroed; "₹0" would read as "paid nothing". */}
                      <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">{it.status === "calculated" ? `${dayCount(it.payable_days)} / ${dayCount(it.lop_days)}` : <span className="text-slate-400">N/A</span>}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-slate-800">{it.status === "calculated" ? formatMoney(it.gross_earnings) : <span className="font-medium text-slate-400">N/A</span>}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums font-bold text-purple-700">{it.status === "calculated" ? formatMoney(it.net_pay) : <span className="font-medium text-slate-400">N/A</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!itemsState.loading && !itemsState.error && items.totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Page {page} of {items.totalPages} · {plural(items.total, "employee")}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronLeft className="w-4 h-4" /></button>
                <button type="button" onClick={() => setPage((p) => Math.min(items.totalPages, p + 1))} disabled={page >= items.totalPages} aria-label="Next page" className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition"><HiChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </section>
      </main>

      {detail && (
        <RunItemDialog
          runId={runId}
          seed={detail}
          person={who(detail)}
          canEdit={acts.canEditItems}
          lockedReason={itemsLockedReason(run)}
          busy={busy}
          busyAction={busyAction}
          onClose={() => setDetail(null)}
          onChangePeriod={openPeriod}
          onExclude={openExclude}
          onInclude={includeItem}
          onOpenLink={(to) => navigate(to)}
        />
      )}

      {dialog?.kind === "cancel" && (
        <ReasonDialog
          title={`Cancel payroll for ${formatPeriod(run.period_month)}?`}
          description={cancelRunDescription(run)}
          label="Why are you cancelling?"
          placeholder="e.g. Wrong attendance was used for three employees"
          confirmLabel="Cancel run"
          tone="danger"
          busy={dialogBusy}
          error={dialogError}
          onSubmit={(reason) => withDialog(() => payrollAPI.cancelRun(runId, reason), RUN_ACTION_SUCCESS.cancel, RUN_ACTION_FAILURE.cancel)}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === "exclude" && (
        <ReasonDialog
          title={`Exclude ${who(dialog.item).name} from this run?`}
          description="They won't be paid in this run. You can include them again any time before approval. Recalculate the run afterwards to update the totals."
          label="Why are you excluding them?"
          placeholder="e.g. Pay on hold until bank details are confirmed"
          confirmLabel="Exclude"
          tone="danger"
          busy={dialogBusy}
          error={dialogError}
          onSubmit={(reason) => withDialog(
            () => payrollAPI.excludeRunItem(runId, dialog.item.id, { exclusion_reason: reason }),
            `${who(dialog.item).name} excluded. Recalculate the run to update the totals.`,
            "Couldn't exclude this employee.",
          )}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === "period" && (
        <ReasonDialog
          title={`Change pay period for ${who(dialog.item).name}`}
          description={`Use this for someone who joined or left during the month. Dates must be between ${formatDate(bounds.start)} and ${formatDate(bounds.end)}. Recalculate the run afterwards.`}
          label="Why is the pay period changing?"
          placeholder="e.g. Last working day was 15 September"
          confirmLabel="Save pay period"
          busy={dialogBusy}
          error={dialogError}
          canSubmit={periodValid}
          onSubmit={(reason) => withDialog(
            () => payrollAPI.overrideRunItemPeriod(runId, dialog.item.id, {
              period_start: periodDraft.start,
              period_end: periodDraft.end,
              period_override_reason: reason,
            }),
            "Pay period saved. Recalculate the run to apply it.",
            "Couldn't change the pay period.",
          )}
          onClose={closeDialog}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="period-start" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">First paid day</label>
              <input id="period-start" type="date" value={periodDraft.start} min={bounds.start || undefined} max={periodDraft.end || bounds.end || undefined} onChange={(e) => setPeriodDraft((d) => ({ ...d, start: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
            <div>
              <label htmlFor="period-end" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Last paid day</label>
              <input id="period-end" type="date" value={periodDraft.end} min={periodDraft.start || bounds.start || undefined} max={bounds.end || undefined} onChange={(e) => setPeriodDraft((d) => ({ ...d, end: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
            </div>
          </div>
          {dialog.item.error_code === "EXIT_DATE_REQUIRED" && (
            <p className="text-xs text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
              {inferredExitDate(dialog.item)
                ? `Payroll’s best guess for the last working day is ${formatDate(inferredExitDate(dialog.item))} (their last attendance or approved leave). Please confirm it.`
                : "Payroll couldn’t work out their last working day. Set the last paid day from their exit records."}
            </p>
          )}
          {!periodValid && <p className="text-xs font-semibold text-rose-600">Choose a first and last day inside this run’s month, with the first day on or before the last.</p>}
        </ReasonDialog>
      )}

      <PayrollToast toast={toast} onClose={hideToast} />
    </>
  );
}
