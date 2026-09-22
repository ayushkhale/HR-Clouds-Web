// ─────────────────────────────────────────────────────────────────────────────
// SalaryStructurePanel — one person's pay structure, current and past.
//
// Used by HR's employee profile (Salary tab), the manager's team-member profile
// and the manager's Employee salaries page, so all three read the same thing.
// The viewer decides which endpoints are called:
//   hr      → /payroll/hr/employees/:id/salary-structures[/current]
//   manager → /payroll/manager/employees/:id/salary-structures[/current]
// Managers can be blocked from seeing figures at all (COMPENSATION_VIEW_DISABLED),
// which is a policy, not an error, so it gets its own message.
//
// Every history row already carries its own `components`, so opening a past
// version costs no extra request.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { HiChevronDown, HiChevronRight, HiLockClosed, HiCurrencyRupee } from "react-icons/hi";
import { payrollAPI } from "../api";
import Skeleton from "./Skeleton";
import { StatutorySummary, StatutoryUnavailableNotice } from "./StatutoryBreakdown";
import { normalizeStatutory } from "../utils/statutoryBreakdown";
import { formatMoney, formatDate, formatPercent } from "../utils/formatUtils";

const REVISION_LABELS = { initial: "Initial", increment: "Increment", promotion: "Promotion", correction: "Correction", restructure: "Restructure" };
const STATUS_PILL = {
  approved: "bg-violet-50 text-violet-700 border-violet-200",
  proposed: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : formatMoney(v));
const numeric = (v) => Number.parseFloat(v) || 0;

/** "50% of CTC", "15% of basic", "₹2,500 flat", "Auto (remainder)". */
function componentBasis(c) {
  switch (c?.calculation_type) {
    case "flat": return `${formatMoney(c.value)} flat`;
    case "balancing": return "Auto (remainder)";
    case "percent_of_ctc": return `${formatPercent(c.value)} of CTC`;
    case "percent_of_basic": return `${formatPercent(c.value)} of basic`;
    case "percent_of_gross": return `${formatPercent(c.value)} of gross`;
    default: return c?.calculation_type ? String(c.calculation_type).replace(/_/g, " ") : "N/A";
  }
}

const FLAGS = [
  ["is_taxable", "Taxable"],
  ["pf_applicable", "PF"],
  ["esi_applicable", "ESI"],
  ["is_lop_applicable", "LOP"],
  ["is_part_of_ctc", "In CTC"],
  ["is_statutory", "Statutory"],
];

function Flags({ component }) {
  const on = FLAGS.filter(([key]) => component[key]);
  if (on.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {on.map(([key, label]) => (
        <span key={key} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">{label}</span>
      ))}
    </span>
  );
}

/** Earnings then deductions, each in the order payroll prints them. */
function splitComponents(components = []) {
  const sorted = [...components].sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  const earnings = sorted.filter((c) => c.component_type !== "deduction");
  const deductions = sorted.filter((c) => c.component_type === "deduction");
  const sum = (rows, key) => rows.reduce((t, c) => t + numeric(c[key]), 0);
  return {
    earnings,
    deductions,
    monthlyEarnings: sum(earnings, "monthly_amount"),
    annualEarnings: sum(earnings, "annual_amount"),
    monthlyDeductions: sum(deductions, "monthly_amount"),
    annualDeductions: sum(deductions, "annual_amount"),
  };
}

const TH = "px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide";
const TD = "px-4 py-3 text-sm text-slate-700";

/**
 * The component breakdown of one structure version. `compact` drops the code
 * and the rule flags: inside a profile tab the question is "what is each line
 * worth", not "which statutory rules touch it".
 */
function ComponentTable({ components, compact = false }) {
  const { earnings, deductions, monthlyEarnings, annualEarnings, monthlyDeductions, annualDeductions } = useMemo(
    () => splitComponents(components),
    [components],
  );

  if (!components?.length) {
    return <p className="text-sm text-slate-400 px-4 py-6 text-center">This version has no components recorded.</p>;
  }

  const section = (title, rows, monthlyTotal, annualTotal) => rows.length > 0 && (
    <>
      <tr className="bg-slate-50/70">
        <td colSpan={compact ? 2 : 3} className="px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wide">{title}</td>
        <td className="px-4 py-2 text-right text-[11px] font-bold text-slate-500 tabular-nums">{money(monthlyTotal)}</td>
        <td className="px-4 py-2 text-right text-[11px] font-bold text-slate-500 tabular-nums">{money(annualTotal)}</td>
        <td />
      </tr>
      {rows.map((c) => (
        <tr key={c.id || c.component_code} className="border-t border-slate-50">
          <td className={`${TD} font-semibold text-slate-800`}>{c.component_name || c.component_code}</td>
          {!compact && <td className={`${TD} text-[11px] font-bold text-slate-400`}>{c.component_code}</td>}
          <td className={`${TD} text-slate-500`}>{componentBasis(c)}</td>
          <td className={`${TD} text-right font-bold tabular-nums`}>{money(c.monthly_amount)}</td>
          <td className={`${TD} text-right tabular-nums text-slate-500`}>{money(c.annual_amount)}</td>
          {!compact && <td className="px-4 py-3"><Flags component={c} /></td>}
        </tr>
      ))}
    </>
  );

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${compact ? "min-w-[30rem]" : "min-w-[46rem]"}`}>
        <thead className="bg-slate-50 border-y border-slate-100">
          <tr>
            <th className={`${TH} text-left`}>Component</th>
            {!compact && <th className={`${TH} text-left`}>Code</th>}
            <th className={`${TH} text-left`}>How it&apos;s calculated</th>
            <th className={`${TH} text-right`}>Monthly</th>
            <th className={`${TH} text-right`}>Annual</th>
            {!compact && <th className={`${TH} text-left`}>Applies to</th>}
          </tr>
        </thead>
        <tbody>
          {section("Earnings", earnings, monthlyEarnings, annualEarnings)}
          {section("Deductions", deductions, monthlyDeductions, annualDeductions)}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, value, accent = false }) {
  return (
    <div className={`rounded-2xl px-4 py-3 border ${accent ? "bg-purple-50 border-purple-100" : "bg-white border-slate-100"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${accent ? "text-purple-400" : "text-slate-400"}`}>{label}</p>
      <p className={`text-lg font-bold mt-0.5 tabular-nums ${accent ? "text-purple-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }) {
  if (!status) return null;
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${STATUS_PILL[status] || STATUS_PILL.cancelled}`}>{status}</span>;
}

/** One expandable row of the history table. */
function HistoryRow({ row, open, onToggle, compact = false }) {
  const live = row.status === "approved" && !row.effective_to;
  return (
    <>
      <tr className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50/70 ${open ? "bg-slate-50/70" : ""}`} onClick={onToggle}>
        <td className="px-4 py-3">
          <button type="button" aria-expanded={open} aria-label={open ? "Hide components" : "Show components"} className="flex items-center gap-2 text-sm font-bold text-slate-800">
            {open ? <HiChevronDown className="w-4 h-4 text-slate-400" /> : <HiChevronRight className="w-4 h-4 text-slate-400" />}
            v{row.version ?? "—"}
          </button>
        </td>
        <td className={TD}>
          <span className="font-semibold text-slate-700">{formatDate(row.effective_from)}</span>
          <span className="text-slate-400"> → {live ? "Present" : formatDate(row.effective_to)}</span>
        </td>
        <td className={`${TD} text-right font-bold tabular-nums`}>{money(row.annual_ctc)}</td>
        {!compact && <td className={`${TD} text-right tabular-nums text-slate-500`}>{money(row.monthly_gross)}</td>}
        <td className={TD}>
          <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{REVISION_LABELS[row.revision_type] || row.revision_type || "Revision"}</span>
        </td>
        {!compact && (
          <td className={`${TD} text-slate-500 max-w-[18rem]`}>
            <span className="block truncate" title={row.revision_reason || undefined}>{row.revision_reason || "—"}</span>
          </td>
        )}
        <td className="px-4 py-3"><StatusPill status={row.status} /></td>
        {!compact && <td className={`${TD} text-slate-400 text-xs whitespace-nowrap`}>{formatDate(row.actioned_at || row.created_at)}</td>}
      </tr>
      {open && (
        <tr>
          <td colSpan={compact ? 5 : 8} className="bg-slate-50/40 px-2 pb-4 pt-1">
            <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
              <ComponentTable components={row.components} compact={compact} />
            </div>
            {row.rejection_reason && <p className="text-xs font-semibold text-rose-600 mt-2 px-2">Rejected: {row.rejection_reason}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * @param {boolean} compact  a profile tab: the numbers that matter, not every
 *   statutory flag and audit column. The Employee salaries screen stays full.
 */
export default function SalaryStructurePanel({ userId, viewer = "hr", compact = false }) {
  const [state, setState] = useState({ current: undefined, rows: undefined, denied: false });
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!userId) { setState({ current: null, rows: [], denied: false }); return undefined; }
    let cancelled = false;
    setState({ current: undefined, rows: undefined, denied: false });
    const api = viewer === "manager"
      ? [payrollAPI.getTeamMemberCurrentStructure(userId), payrollAPI.getTeamMemberStructureHistory(userId)]
      : [payrollAPI.getEmployeeCurrentStructure(userId), payrollAPI.getEmployeeStructureHistory(userId)];
    Promise.allSettled(api).then(([curR, histR]) => {
      if (cancelled) return;
      const denied = [curR, histR].some((r) => r.status === "rejected" && r.reason?.data?.errorCode === "COMPENSATION_VIEW_DISABLED");
      if (denied) { setState({ current: null, rows: [], denied: true }); return; }
      const histData = histR.status === "fulfilled" ? histR.value?.data : null;
      setState({
        current: curR.status === "fulfilled" ? (curR.value?.data ?? null) : null,
        rows: Array.isArray(histData) ? histData : (histData?.records || []),
        denied: false,
      });
    });
    return () => { cancelled = true; };
  }, [userId, viewer]);

  const { current, rows, denied } = state;
  const statutory = useMemo(() => normalizeStatutory(current), [current]);
  const componentDeductions = useMemo(
    () => (current?.components || []).filter((c) => c.component_type === "deduction").reduce((t, c) => t + numeric(c.monthly_amount), 0),
    [current],
  );
  // The current structure is already the first history row; showing it twice
  // would read as two revisions on the same day.
  const past = useMemo(() => (rows || []).filter((r) => !current?.id || r.id !== current.id), [rows, current]);

  if (denied) {
    return (
      <div className="flex flex-col items-center text-center py-12 text-slate-500">
        <HiLockClosed className="w-8 h-8 mb-2 text-slate-300" />
        <p className="text-sm font-semibold">Compensation view is disabled</p>
        <p className="text-xs mt-1">Your organisation&apos;s policy prevents managers from seeing per-employee salary figures.</p>
      </div>
    );
  }

  if (rows === undefined) return <Skeleton type="table" rows={5} />;

  if (!current && past.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-12 text-slate-500">
        <HiCurrencyRupee className="w-8 h-8 mb-2 text-slate-300" />
        <p className="text-sm font-semibold">No salary structure yet</p>
        <p className="text-xs mt-1">Once a structure is approved for this person it appears here with every revision.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {current && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-bold text-slate-800">Current structure</h3>
            <StatusPill status={current.status} />
            <span className="text-xs font-semibold text-slate-400">
              v{current.version ?? "—"} · {REVISION_LABELS[current.revision_type] || current.revision_type || "Revision"} · effective {formatDate(current.effective_from)}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Annual CTC" value={money(current.annual_ctc)} accent />
            <Tile label="Monthly gross" value={money(current.monthly_gross)} />
            <Tile label="Effective from" value={formatDate(current.effective_from)} />
            <Tile label="Revisions so far" value={rows?.length || 1} />
          </div>

          {current.revision_reason && <p className="text-xs text-slate-500 italic">“{current.revision_reason}”</p>}

          {!compact && (statutory
            ? <StatutorySummary statutory={statutory} componentDeductions={componentDeductions} />
            : <StatutoryUnavailableNotice compact />)}

          <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            <ComponentTable components={current.components} compact={compact} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-base font-bold text-slate-800">
          Revision history
          <span className="ml-2 text-xs font-semibold text-slate-400">{past.length === 0 ? "No earlier versions" : `${past.length} earlier ${past.length === 1 ? "version" : "versions"} · open a row for its components`}</span>
        </h3>
        {past.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white overflow-x-auto">
            <table className={`w-full ${compact ? "min-w-[34rem]" : "min-w-[56rem]"}`}>
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${TH} text-left`}>Version</th>
                  <th className={`${TH} text-left`}>In effect</th>
                  <th className={`${TH} text-right`}>Annual CTC</th>
                  {!compact && <th className={`${TH} text-right`}>Monthly gross</th>}
                  <th className={`${TH} text-left`}>Change</th>
                  {!compact && <th className={`${TH} text-left`}>Reason</th>}
                  <th className={`${TH} text-left`}>Status</th>
                  {!compact && <th className={`${TH} text-left`}>Decided</th>}
                </tr>
              </thead>
              <tbody>
                {past.map((row, i) => (
                  <HistoryRow
                    key={row.id || i}
                    row={row}
                    open={openId === (row.id || i)}
                    onToggle={() => setOpenId((prev) => (prev === (row.id || i) ? null : row.id || i))}
                    compact={compact}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
