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
//
// It is laid out with the shared record-inspector primitives (DetailStats /
// DetailSection / DetailGrid / DetailTable), the same ones the Employee salaries
// history dialog uses, so one person's pay reads the same whether it is opened
// from a profile tab or from a popup.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { HiLockClosed, HiCurrencyRupee, HiClock, HiCheckCircle } from "react-icons/hi";
import { payrollAPI } from "../api";
import Skeleton from "./Skeleton";
import { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText } from "./DetailDialog";
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
  if (on.length === 0) return null;
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

/**
 * The component breakdown of one structure version, as the two columns a
 * payslip uses. `compact` drops the code and the rule flags: inside a profile
 * tab the question is "what is each line worth", not "which statutory rules
 * touch it".
 */
function ComponentTables({ components, compact = false }) {
  const { earnings, deductions, monthlyEarnings, annualEarnings, monthlyDeductions, annualDeductions } = useMemo(
    () => splitComponents(components),
    [components],
  );

  if (!components?.length) {
    return <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">No component breakdown was recorded for this version.</p>;
  }

  const columns = (tone) => [
    {
      header: "Component",
      render: (c) => (
        <span className="font-semibold text-slate-700">
          {c.component_name || c.component_code}
          {!compact && c.component_code && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{c.component_code}</span>}
        </span>
      ),
    },
    { header: "How it’s worked out", render: (c) => <DetailPill tone="muted">{componentBasis(c)}</DetailPill> },
    { header: "Monthly", align: "right", render: (c) => <span className={`font-bold tabular-nums ${tone}`}>{money(c.monthly_amount)}</span> },
    { header: "Annual", align: "right", render: (c) => <span className="tabular-nums text-slate-500">{money(c.annual_amount)}</span> },
    ...(compact ? [] : [{ header: "Applies to", render: (c) => <Flags component={c} /> }]),
  ];

  // The totals line is what makes the two columns add up to the CTC above it.
  const total = (label, monthly, annual) => (
    <p className="flex items-center justify-between gap-3 mt-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
      <span>{label}</span>
      <span className="tabular-nums normal-case">{money(monthly)} / month · {money(annual)} / year</span>
    </p>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Earnings</p>
        <DetailTable columns={columns("text-slate-800")} rows={earnings} empty="No earnings recorded." rowKey={(c, i) => c.id || c.component_code || i} />
        {earnings.length > 0 && total("Total earnings", monthlyEarnings, annualEarnings)}
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Deductions</p>
        <DetailTable columns={columns("text-rose-600")} rows={deductions} empty="No deductions in this structure." rowKey={(c, i) => c.id || c.component_code || i} />
        {deductions.length > 0 && total("Total deductions", monthlyDeductions, annualDeductions)}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  if (!status) return null;
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${STATUS_PILL[status] || STATUS_PILL.cancelled}`}>{status}</span>;
}

/**
 * @param {boolean} compact  a profile tab: the numbers that matter, not every
 *   statutory flag and audit column. The Employee salaries screen stays full.
 */
export default function SalaryStructurePanel({ userId, viewer = "hr", compact = false }) {
  const [state, setState] = useState({ current: undefined, rows: undefined, denied: false });

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
        <>
          <DetailStats
            items={[
              { label: "Annual CTC", value: money(current.annual_ctc), hint: "per year", icon: HiCurrencyRupee },
              { label: "Monthly gross", value: money(current.monthly_gross), hint: "before deductions", icon: HiCurrencyRupee },
              { label: "In force since", value: formatDate(current.effective_from), icon: HiCheckCircle },
              { label: "Revisions", value: String(rows?.length || 1), hint: (rows?.length || 1) === 1 ? "on record" : "on record to date", icon: HiClock },
            ]}
          />

          <DetailSection
            title="Current structure"
            icon={HiCurrencyRupee}
            collapsible={false}
            action={
              <span className="flex items-center gap-2">
                <DetailPill tone="soft">v{current.version ?? "?"} · {REVISION_LABELS[current.revision_type] || current.revision_type || "Revision"}</DetailPill>
                <StatusPill status={current.status} />
              </span>
            }
          >
            <DetailGrid
              items={[
                ["Annual CTC", money(current.annual_ctc)],
                ["Monthly gross", money(current.monthly_gross)],
                ["In force from", formatDate(current.effective_from)],
                ["Currency", current.currency],
              ]}
            />

            {current.revision_reason && (
              <div className="mt-4"><DetailText label="Why it changed">{current.revision_reason}</DetailText></div>
            )}

            {!compact && (
              <div className="mt-4">
                {statutory
                  ? <StatutorySummary statutory={statutory} componentDeductions={componentDeductions} />
                  : <StatutoryUnavailableNotice compact />}
              </div>
            )}

            <div className="mt-5">
              <ComponentTables components={current.components} compact={compact} />
            </div>
          </DetailSection>
        </>
      )}

      {/* One collapsible card per earlier revision, newest first — the same
          shape the Employee salaries history dialog uses. */}
      {past.length === 0 ? (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
          No earlier versions. Every future revision is kept here alongside the one above.
        </p>
      ) : (
        <>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Earlier versions ({past.length}) · open one for its components
          </p>
          {past.map((row, i) => (
            <DetailSection
              key={row.id || i}
              title={`v${row.version ?? "?"} · ${REVISION_LABELS[row.revision_type] || row.revision_type || "Revision"} · ${money(row.annual_ctc)}`}
              icon={HiClock}
              defaultOpen={false}
              action={<StatusPill status={row.status} />}
            >
              <DetailGrid
                items={[
                  ["Annual CTC", money(row.annual_ctc)],
                  ["Monthly gross", money(row.monthly_gross)],
                  ["In force from", formatDate(row.effective_from)],
                  ["In force until", row.effective_to ? formatDate(row.effective_to) : "Present"],
                  ...(compact ? [] : [
                    ["Decided on", formatDate(row.actioned_at || row.created_at)],
                    ["Currency", row.currency],
                  ]),
                ]}
              />

              {row.revision_reason && <div className="mt-4"><DetailText label="Why it changed">{row.revision_reason}</DetailText></div>}
              {row.rejection_reason && <div className="mt-4"><DetailText label="Why it was rejected">{row.rejection_reason}</DetailText></div>}

              <div className="mt-5">
                <ComponentTables components={row.components} compact={compact} />
              </div>
            </DetailSection>
          ))}
        </>
      )}
    </div>
  );
}
