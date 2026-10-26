import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { sortNewestFirst } from "../../../../shared/utils/sortUtils";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiAdjustments, HiGift, HiCash, HiTrash,
  HiCalendar, HiTrendingUp, HiDocumentText,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { PersonMultiSelect, PersonSelect } from "../../../../shared/components/PersonPicker";
import { useAuth } from "../../../../shared/contexts/AuthContext";
import { useEmployeeDirectory } from "../../../../shared/contexts/EmployeeDirectoryContext";
import { personName } from "../../../../shared/attendance/normalize";
import { formatDate } from "../../../../shared/utils/formatUtils";
import { STATUS_CHIP } from "../../../../shared/utils/statusChip";
import { humanize } from "../../../../shared/attendance/enums";
import { interestMethodLabel } from "../../../hr/payroll/runMeta";
import { codeFromName, componentCodeProblem } from "../../../hr/payroll/variablePayMeta";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { ATTENDANCE_EVENTS, emitAttendanceChanged } from "../../../../shared/attendance/events";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-rose-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

/* ── Record inspectors for a proposal ──────────────────────────────────────
   HR's Salary Adjustments rows open a record; the manager's didn't, so the same
   job felt like a different product. Built from the list row: the manager
   endpoints return every field shown here, and there is no per-proposal read. */
function AdjustmentDetail({ adj, memberName, onCancel, cancelling, onClose }) {
  const pending = adj.status === "pending";
  return (
    <DetailDialog
      eyebrow="Salary adjustment"
      icon={HiAdjustments}
      title={memberName}
      subtitle={`${adj.adjustment_type === "deduction" ? "Deduction" : "Addition"} · ${fmtPeriod(adj.period_month)}`}
      badge={adj.status ? <DetailPill tone="onDark">{prettify(adj.status)}</DetailPill> : undefined}
      onClose={onClose}
      footer={pending ? (
        <button
          type="button"
          disabled={cancelling}
          onClick={async () => { const ok = await onCancel(adj.id); if (ok) onClose(); }}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {cancelling ? (
            <span className="w-4 h-4 border-2 border-rose-600/30 border-t-rose-600 rounded-full animate-spin shrink-0" />
          ) : (
            <HiTrash className="w-4 h-4" />
          )}
          <span>{cancelling ? "Cancelling..." : "Cancel proposal"}</span>
        </button>
      ) : null}
    >
      <DetailStats items={[{ label: adj.adjustment_type === "deduction" ? "Taken off" : "Added", value: money(adj.amount), icon: HiCash }]} />
      <DetailSection title="What was proposed" icon={HiDocumentText} collapsible={false}>
        <DetailGrid
          cols={3}
          items={[
            ["Kind", prettify(adj.category)],
            ["Shown on the payslip as", adj.component_name || null],
            ["Paid in", fmtPeriod(adj.period_month)],
            ["Proposed on", adj.created_at ? formatDate(adj.created_at) : null],
            ["Why", adj.reason || null],
            ...(adj.rejection_reason ? [["Why HR turned it down", adj.rejection_reason]] : []),
          ]}
        />
      </DetailSection>
    </DetailDialog>
  );
}

// "flat" is an amount; the two percent types say what they're a percent OF.
// (The inspector once called every percent bonus "% of basic pay".)
const bonusValueLabel = (b) => (b.bonus_type === "flat"
  ? money(b.value)
  : `${parseFloat(b.value || 0)}% of ${b.bonus_type === "percent_of_gross" ? "gross pay" : "basic pay"}`);

function BonusProposalDetail({ bonus, nameOf, onClose }) {
  const ids = bonus.eligibility_config?.user_ids || [];
  return (
    <DetailDialog
      eyebrow="Bonus proposal"
      icon={HiGift}
      title={bonus.name || "Bonus"}
      subtitle={fmtPeriod(bonus.period_month)}
      badge={bonus.status ? <DetailPill tone="onDark">{prettify(bonus.status)}</DetailPill> : undefined}
      onClose={onClose}
    >
      <DetailStats items={[
        { label: "Each person gets", value: bonusValueLabel(bonus), icon: HiCash },
        { label: "People", value: String(ids.length), icon: HiGift },
      ]} />
      {bonus.reason && <DetailSection title="Why" icon={HiDocumentText} collapsible={false}><p className="text-sm text-slate-600">{bonus.reason}</p></DetailSection>}
      <DetailSection title={`Who it's for (${ids.length})`} icon={HiGift} defaultOpen={ids.length <= 8}>
        <DetailTable rows={ids.map((id) => ({ id }))} empty="Nobody chosen." columns={[{ header: "Person", render: (r) => nameOf(r.id) }]} />
      </DetailSection>
    </DetailDialog>
  );
}

const MONTHS = Array.from({ length: 12 }).map((_, i) => new Date(0, i).toLocaleString("default", { month: "long" }));
// The org roster keys people by `user_id`; the proposal endpoints need that GUID.
const memberId = (m) => m.user_id || m.id || m._id;
const money = (v) => (v === null || v === undefined || v === "" ? "N/A" : `₹${parseFloat(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
// "personal_loan" reads as "Personal loan" — never a raw enum in front of a user.
const prettify = (v) => (v ? String(v).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null);
const fmtPeriod = (pm) => {
  if (!pm) return "N/A";
  const [y, m] = pm.split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const STATUS_PILL = {
  pending: "bg-fuchsia-100 text-fuchsia-700",
  approved: "bg-violet-100 text-violet-700",
  active: "bg-violet-100 text-violet-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
};
const Pill = ({ s }) => <span className={`${STATUS_CHIP} border-transparent ${STATUS_PILL[s] || "bg-slate-100 text-slate-600"}`}>{humanize(s)}</span>;

// Team loan detail + installment schedule (#90).
// The same record-inspector HR reads on Payroll > Loans, so a manager and HR
// looking at one loan see it laid out identically.
function LoanDetailModal({ loanId, memberName, onClose, showToast }) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    payrollAPI.getTeamLoan(loanId)
      .then((res) => { if (!cancelled) setData(res.data || res); })
      .catch((err) => { if (!cancelled) { showToast(err.message || "Failed to load loan", "error"); setData(null); } });
    return () => { cancelled = true; };
  }, [loanId, showToast]);

  const loan = data?.loan || data || {};
  const installments = data?.installments || loan.installments || [];
  const outstanding = loan.outstanding_amount ?? loan.outstanding_balance;

  return (
    <DetailDialog
      eyebrow="Loan details"
      icon={HiCash}
      title={memberName}
      subtitle={loan.loan_type ? `${prettify(loan.loan_type)} · first instalment ${fmtPeriod(loan.start_period_month)}` : undefined}
      badge={loan.status ? <DetailPill tone="onDark">{loan.status}</DetailPill> : undefined}
      loading={data === undefined}
      onClose={onClose}
    >
      {data !== undefined && (
        <>
          <DetailStats
            items={[
              { label: "Principal", value: money(loan.principal_amount), icon: HiCash },
              { label: "Monthly instalment", value: money(loan.emi_amount), icon: HiCalendar },
              { label: "Recovered", value: money(loan.recovered_amount ?? loan.total_recovered), icon: HiCheckCircle },
              { label: "Still to repay", value: money(outstanding), icon: HiTrendingUp },
            ]}
          />

          <DetailSection title="Loan terms" icon={HiDocumentText}>
            <DetailGrid
              cols={3}
              items={[
                ["Type", prettify(loan.loan_type)],
                ["Interest rate", loan.interest_rate != null ? `${parseFloat(loan.interest_rate) || 0}% a year` : null],
                ["How interest is worked out", interestMethodLabel(loan.interest_method)],
                ["Repaid over", loan.tenure_months != null ? `${loan.tenure_months} months` : null],
                ["First instalment", fmtPeriod(loan.start_period_month)],
                ["Money paid out on", loan.disbursed_on ? formatDate(loan.disbursed_on) : null],
              ]}
            />
          </DetailSection>

          <DetailSection title={`Repayment schedule (${installments.length})`} icon={HiCalendar}>
            <DetailTable
              rows={installments}
              rowKey={(inst, i) => inst.id || inst.installment_number || i}
              empty={loan.status === "pending" ? "The schedule is drawn up once the loan is approved." : "No instalments scheduled yet."}
              columns={[
                { header: "Month", render: (inst) => fmtPeriod(inst.period_month || inst.due_period_month) },
                { header: "Amount", align: "right", render: (inst) => <span className="font-semibold text-slate-800 tabular-nums">{money(inst.amount ?? inst.emi_amount ?? inst.installment_amount ?? inst.total_amount)}</span> },
                { header: "Status", align: "center", render: (inst) => <DetailPill tone={inst.status === "deducted" || inst.status === "paid" ? "solid" : "soft"}>{inst.status || "N/A"}</DetailPill> },
              ]}
            />
          </DetailSection>
        </>
      )}
    </DetailDialog>
  );
}

// Pure client-side EMI estimate, mirrors loan_schedule.utils (flat / reducing_balance)
function estimateSchedule(principal, annualRate, tenure, method) {
  const P = parseFloat(principal) || 0;
  const n = parseInt(tenure) || 0;
  const r = parseFloat(annualRate) || 0;
  if (P <= 0 || n <= 0) return null;
  if (r === 0) {
    const emi = P / n;
    return { emi, totalInterest: 0, totalPayable: P };
  }
  if (method === "flat") {
    const totalInterest = (P * r * n) / 1200;
    const totalPayable = P + totalInterest;
    return { emi: totalPayable / n, totalInterest, totalPayable };
  }
  const i = r / 1200;
  const pow = Math.pow(1 + i, n);
  const emi = (P * i * pow) / (pow - 1);
  const totalPayable = emi * n;
  return { emi, totalInterest: totalPayable - P, totalPayable };
}

const now = new Date();
const TABS = [
  { key: "adjustments", label: "Adjustments", icon: HiAdjustments },
  { key: "bonuses", label: "Bonus Proposals", icon: HiGift },
  { key: "loans", label: "Loan Recommendations", icon: HiCash },
];

export default function ManagerAdjustmentsPage() {
  const [tab, setTab] = useState("adjustments");
  const { user } = useAuth();
  // The reports come from the app-wide roster (read once, photos included), not
  // from a fetch of this screen's own.
  const { activeRows: team } = useEmployeeDirectory();
  const [adjustments, setAdjustments] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // 'adj' | 'bonus' | 'loan'
  const [loanDetail, setLoanDetail] = useState(null); // { id, name } | null
  const [adjDetail, setAdjDetail] = useState(null);
  const [bonusDetail, setBonusDetail] = useState(null);

  const [submittingAdj, setSubmittingAdj] = useState(false);
  const [submittingBonus, setSubmittingBonus] = useState(false);
  const [submittingLoan, setSubmittingLoan] = useState(false);
  const [cancellingAdjId, setCancellingAdjId] = useState(null);

  const [adjForm, setAdjForm] = useState({
    user_id: "",
    adjustment_type: "earning",
    category: "incentive",
    component_name: "",
    component_code: "",
    codeEdited: false,
    amount: "",
    reason: "",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });
  const [bonusForm, setBonusForm] = useState({ name: "", bonus_type: "flat", value: "", user_ids: [], reason: "", month: now.getMonth() + 1, year: now.getFullYear() });
  const [loanForm, setLoanForm] = useState({
    user_id: "",
    loan_type: "salary_advance",
    principal_amount: "",
    tenure_months: "3",
    interest_rate: "0",
    interest_method: "reducing_balance",
    disbursed_on: now.toISOString().slice(0, 10),
    reason: "",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  const loanEst = useMemo(
    () => estimateSchedule(loanForm.principal_amount, loanForm.interest_rate, loanForm.tenure_months, loanForm.interest_method),
    [loanForm.principal_amount, loanForm.interest_rate, loanForm.tenure_months, loanForm.interest_method]
  );

  // Stable identity: LoanDetailModal's fetch effect lists showToast in its deps,
  // so an unstable function would re-fire the fetch on every parent re-render.
  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [adjRes, bonusRes, loanRes] = await Promise.all([
        payrollAPI.getTeamAdjustments().catch(() => ({ data: [] })),
        payrollAPI.getTeamBonusRules().catch(() => ({ data: [] })),
        payrollAPI.getTeamLoans().catch(() => ({ data: [] })),
      ]);
      setAdjustments(sortNewestFirst(adjRes.data?.records || adjRes.data || []));
      setBonuses(sortNewestFirst(bonusRes.data?.records || bonusRes.data || []));
      setLoans(sortNewestFirst(loanRes.data?.records || loanRes.data || []));
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Never show a raw user_id. The list can hold people who are not among the
  // current direct reports (someone who moved teams, or the manager's own
  // rows), so fall back through the row's embedded employee, the team, the
  // signed-in user and finally a plain label.
  const teamName = (id, row) => {
    const embedded = personName({ employee: row?.employee, user: row?.user }, "");
    if (embedded) return embedded;
    const member = team.find((m) => memberId(m) === id);
    if (member) return personName(member, "") || "Team member";
    if (id && id === user?.id) return `${personName(user, "") || "You"} (you)`;
    return "Former team member";
  };
  // Only a pending proposal can be cancelled; with none, the column is dropped.
  const hasCancellable = adjustments.some((a) => a.status === "pending");
  const period = (f) => `${f.year}-${String(f.month).padStart(2, "0")}`;

  const submitAdj = async (e) => {
    e.preventDefault();
    if (submittingAdj) return;
    const uid = typeof adjForm.user_id === "string" ? adjForm.user_id.trim() : "";
    if (!uid) return showToast("Choose a team member", "error");
    const amount = parseFloat(adjForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("Enter a valid adjustment amount", "error");
    if (!adjForm.reason.trim()) return showToast("A reason is required", "error");

    const compName = adjForm.component_name.trim() || (adjForm.adjustment_type === "earning" ? "Spot Award" : "Deduction");
    const compCode = (adjForm.component_code.trim() || codeFromName(compName) || (adjForm.adjustment_type === "earning" ? "SPOT_AWARD" : "DEDUCTION")).toUpperCase();

    const codeProblem = componentCodeProblem(compCode);
    if (codeProblem) return showToast(codeProblem, "error");

    setSubmittingAdj(true);
    try {
      await payrollAPI.proposeTeamAdjustment(uid, {
        period_month: period(adjForm),
        adjustment_type: adjForm.adjustment_type,
        category: adjForm.category,
        component_code: compCode,
        component_name: compName,
        amount,
        reason: adjForm.reason.trim(),
      });
      showToast("Adjustment proposed to HR");
      emitAttendanceChanged(ATTENDANCE_EVENTS.SALARY_PROPOSAL, { id: uid, action: "propose" });
      setModal(null);
      setAdjForm({
        user_id: "",
        adjustment_type: "earning",
        category: "incentive",
        component_name: "",
        component_code: "",
        codeEdited: false,
        amount: "",
        reason: "",
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      loadData();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to propose adjustment"), "error");
    } finally {
      setSubmittingAdj(false);
    }
  };

  const submitBonus = async (e) => {
    e.preventDefault();
    if (submittingBonus) return;
    if (!bonusForm.name.trim()) return showToast("Enter a rule name", "error");
    if (bonusForm.user_ids.length === 0) return showToast("Select at least one report", "error");
    const val = parseFloat(bonusForm.value);
    if (!Number.isFinite(val) || val <= 0) return showToast("Enter a valid bonus value", "error");
    if (!bonusForm.reason.trim()) return showToast("A reason is required", "error");
    setSubmittingBonus(true);
    try {
      await payrollAPI.proposeTeamBonusRule({
        name: bonusForm.name.trim(),
        period_month: period(bonusForm),
        bonus_type: bonusForm.bonus_type,
        value: val,
        eligibility_source: "manual",
        eligibility_config: { user_ids: bonusForm.user_ids },
        reason: bonusForm.reason.trim(),
      });
      showToast("Bonus proposal sent to HR");
      emitAttendanceChanged(ATTENDANCE_EVENTS.SALARY_PROPOSAL, { action: "propose" });
      setModal(null);
      loadData();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to propose bonus"), "error");
    } finally {
      setSubmittingBonus(false);
    }
  };

  const submitLoan = async (e) => {
    e.preventDefault();
    if (submittingLoan) return;
    const uid = typeof loanForm.user_id === "string" ? loanForm.user_id.trim() : "";
    if (!uid) return showToast("Choose a team member", "error");
    const principal = parseFloat(loanForm.principal_amount);
    if (!Number.isFinite(principal) || principal <= 0) return showToast("Enter a valid loan amount", "error");
    const tenure = parseInt(loanForm.tenure_months);
    if (!Number.isFinite(tenure) || tenure <= 0) return showToast("Enter a valid tenure in months", "error");
    if (!loanForm.reason.trim()) return showToast("A reason is required", "error");
    setSubmittingLoan(true);
    try {
      await payrollAPI.recommendTeamLoan(uid, {
        loan_type: loanForm.loan_type,
        principal_amount: principal,
        tenure_months: tenure,
        // recommendLoanSchema strips unknown keys, so this must be interest_rate.
        interest_rate: parseFloat(loanForm.interest_rate) || 0,
        interest_method: loanForm.interest_method,
        start_period_month: period(loanForm),
        disbursed_on: loanForm.disbursed_on || null,
        reason: loanForm.reason.trim(),
      });
      showToast("Loan recommendation sent to HR");
      emitAttendanceChanged(ATTENDANCE_EVENTS.LOAN, { id: uid, action: "recommend" });
      setModal(null);
      setLoanForm({
        user_id: "",
        loan_type: "salary_advance",
        principal_amount: "",
        tenure_months: "3",
        interest_rate: "0",
        interest_method: "reducing_balance",
        disbursed_on: now.toISOString().slice(0, 10),
        reason: "",
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      loadData();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to recommend loan"), "error");
    } finally {
      setSubmittingLoan(false);
    }
  };

  const cancelAdj = async (id) => {
    if (cancellingAdjId) return false;
    if (!(await window.confirm("Cancel this proposal?"))) return false;
    setCancellingAdjId(id);
    try {
      await payrollAPI.cancelTeamAdjustment(id);
      showToast("Proposal cancelled");
      emitAttendanceChanged(ATTENDANCE_EVENTS.SALARY_PROPOSAL, { id, action: "cancel" });
      loadData();
      return true;
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to cancel proposal"), "error");
      return false;
    } finally {
      setCancellingAdjId(null);
    }
  };

  const addBtn = {
    adjustments: { label: "Propose Adjustment", onClick: () => setModal("adj") },
    bonuses: { label: "Propose Bonus", onClick: () => setModal("bonus") },
    loans: { label: "Recommend Loan", onClick: () => setModal("loan") },
  }[tab];

  return (
    <>
        <DashboardTopBar title="Salary Adjustments" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">

          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Salary Adjustments</h1>
              <p className="text-sm text-slate-500 mt-1">Propose bonuses, one-off adjustments and loan recommendations — HR gives the final approval.</p>
            </div>
            <button onClick={addBtn.onClick} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlus className="w-5 h-5" /> {addBtn.label}
            </button>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                {tab === "adjustments" && (
                  <>
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4 border-b border-slate-100">Team Member</th>
                        <th className="px-6 py-4 border-b border-slate-100">Period</th>
                        <th className="px-6 py-4 border-b border-slate-100">Type</th>
                        <th className="px-6 py-4 border-b border-slate-100">Amount</th>
                        <th className="px-6 py-4 border-b border-slate-100">Status</th>
                        {hasCancellable && <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {adjustments.map((a) => (
                        <tr key={a.id} {...rowPreviewProps(() => setAdjDetail(a), "Adjustment details")}>
                          <td className="px-6 py-4 font-bold text-slate-800">{teamName(a.user_id, a)}</td>
                          <td className="px-6 py-4 text-slate-600">{fmtPeriod(a.period_month)}</td>
                          <td className="px-6 py-4 capitalize text-slate-600">{a.adjustment_type}<span className="block text-[10px] text-slate-400 font-bold">{a.category?.replace(/_/g, " ")}</span></td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{money(a.amount)}</td>
                          <td className="px-6 py-4"><Pill s={a.status} /></td>
                          {hasCancellable && (
                            <td className="px-6 py-4 text-right">
                              {a.status === "pending" && (
                                <button
                                  type="button"
                                  disabled={cancellingAdjId === a.id}
                                  onClick={() => cancelAdj(a.id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
                                  title="Cancel proposal"
                                >
                                  {cancellingAdjId === a.id ? (
                                    <span className="w-3.5 h-3.5 border-2 border-rose-600/30 border-t-rose-600 rounded-full animate-spin shrink-0" />
                                  ) : (
                                    <HiTrash className="w-4 h-4" />
                                  )}
                                  <span>{cancellingAdjId === a.id ? "Cancelling..." : "Cancel"}</span>
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                      {adjustments.length === 0 && <tr><td colSpan={hasCancellable ? 6 : 5} className="px-6 py-10 text-center text-slate-500">No adjustment proposals yet.</td></tr>}
                    </tbody>
                  </>
                )}

                {tab === "bonuses" && (
                  <>
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4 border-b border-slate-100">Proposal</th>
                        <th className="px-6 py-4 border-b border-slate-100">Period</th>
                        <th className="px-6 py-4 border-b border-slate-100">Value</th>
                        <th className="px-6 py-4 border-b border-slate-100">Reports</th>
                        <th className="px-6 py-4 border-b border-slate-100">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {bonuses.map((b) => (
                        <tr key={b.id} {...rowPreviewProps(() => setBonusDetail(b), "Bonus proposal details")}>
                          <td className="px-6 py-4 font-bold text-slate-800">{b.name}<span className="block text-[11px] text-slate-400 font-normal line-clamp-1">{b.reason}</span></td>
                          <td className="px-6 py-4 text-slate-600">{fmtPeriod(b.period_month)}</td>
                          <td className="px-6 py-4 text-slate-600">{bonusValueLabel(b)}</td>
                          <td className="px-6 py-4 text-slate-600">{(b.eligibility_config?.user_ids || []).length}</td>
                          <td className="px-6 py-4"><Pill s={b.status} /></td>
                        </tr>
                      ))}
                      {bonuses.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No bonus proposals yet.</td></tr>}
                    </tbody>
                  </>
                )}

                {tab === "loans" && (
                  <>
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="px-6 py-4 border-b border-slate-100">Team Member</th>
                        <th className="px-6 py-4 border-b border-slate-100">Type</th>
                        <th className="px-6 py-4 border-b border-slate-100">Principal</th>
                        <th className="px-6 py-4 border-b border-slate-100">Tenure</th>
                        <th className="px-6 py-4 border-b border-slate-100">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {loans.map((l) => (
                        <tr key={l.id} {...rowPreviewProps(() => setLoanDetail({ id: l.id, name: teamName(l.user_id, l) }), "Loan details")}>
                          <td className="px-6 py-4 font-bold text-slate-800">{teamName(l.user_id, l)}</td>
                          <td className="px-6 py-4 capitalize text-slate-600">{(l.loan_type || "").replace(/_/g, " ")}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{money(l.principal_amount)}</td>
                          <td className="px-6 py-4 text-slate-600">{l.tenure_months} mo</td>
                          <td className="px-6 py-4"><Pill s={l.status} /></td>
                        </tr>
                      ))}
                      {loans.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No loan recommendations yet.</td></tr>}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </main>

      {/* Propose Adjustment */}
      {modal === "adj" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Propose Adjustment</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitAdj} className="p-6 grid sm:grid-cols-2 gap-x-6 gap-y-4 items-start overflow-y-auto">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Team Member <span className="text-rose-500">*</span></label>
                <PersonSelect people={team} value={adjForm.user_id} onChange={(id) => setAdjForm({ ...adjForm, user_id: id })} placeholder="Choose a report" emptyText="No reports found." />
              </div>
              <div className="contents">
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                    <FieldHelp surface="payroll.adjustment_proposal" field="adjustment_type" label="the adjustment type" className="mb-2" />
                  </div>
                  <select
                    value={adjForm.adjustment_type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setAdjForm((prev) => ({
                        ...prev,
                        adjustment_type: type,
                        category: type === "earning" ? "incentive" : "ad_hoc_deduction",
                        component_name: prev.codeEdited ? prev.component_name : "",
                        component_code: prev.codeEdited ? prev.component_code : "",
                      }));
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none"
                  >
                    <option value="earning">Earning (+)</option>
                    <option value="deduction">Deduction (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Amount <span className="text-rose-500">*</span></label>
                  <input type="number" required min="1" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="contents">
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                    <FieldHelp surface="payroll.adjustment_proposal" field="period_month" label="the pay month" className="mb-2" />
                  </div>
                  <select value={adjForm.month} onChange={(e) => setAdjForm({ ...adjForm, month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={adjForm.year} onChange={(e) => setAdjForm({ ...adjForm, year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div>
                <div className="flex items-center">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Payslip Label</label>
                  <FieldHelp surface="payroll.adjustment_proposal" field="component_name" label="the payslip label" className="mb-2" />
                </div>
                <input
                  type="text"
                  value={adjForm.component_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setAdjForm((prev) => ({
                      ...prev,
                      component_name: name,
                      component_code: prev.codeEdited ? prev.component_code : codeFromName(name),
                    }));
                  }}
                  placeholder={adjForm.adjustment_type === "earning" ? "e.g. Spot Award" : "e.g. Equipment Deduction"}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Component Code <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={adjForm.component_code}
                  maxLength={50}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase().replace(/[\s-]+/g, "_");
                    setAdjForm((prev) => ({
                      ...prev,
                      component_code: code,
                      codeEdited: code !== "",
                    }));
                  }}
                  placeholder={adjForm.adjustment_type === "earning" ? "SPOT_AWARD" : "DEDUCTION"}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:border-purple-400 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-rose-500">*</span></label>
                <input type="text" required value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <p className="sm:col-span-2 text-xs text-slate-400 italic">Sent to HR for final approval before it reaches payroll.</p>
              <div className="sm:col-span-2 flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" disabled={submittingAdj} onClick={() => setModal(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition">Cancel</button>
                <button
                  type="submit"
                  disabled={submittingAdj}
                  className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md shadow-purple-200 flex items-center justify-center gap-2"
                >
                  {submittingAdj ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Proposing to HR...</span>
                    </>
                  ) : (
                    "Propose to HR"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Propose Bonus */}
      {modal === "bonus" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Propose Team Bonus</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitBonus} className="p-6 grid sm:grid-cols-2 gap-x-6 gap-y-4 items-start overflow-y-auto">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Name <span className="text-rose-500">*</span></label>
                <input type="text" required value={bonusForm.name} onChange={(e) => setBonusForm({ ...bonusForm, name: e.target.value })} placeholder="e.g. Sprint Delivery Award" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div className="contents">
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                    <FieldHelp surface="payroll.bonus_proposal" field="bonus_type" label="the bonus type" className="mb-2" />
                  </div>
                  <select value={bonusForm.bonus_type} onChange={(e) => setBonusForm({ ...bonusForm, bonus_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="flat">Flat ₹</option>
                    <option value="percent_of_basic">% of Basic</option>
                    <option value="percent_of_gross">% of Gross</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Value <span className="text-rose-500">*</span></label>
                  <input type="number" required min="0.01" step="0.01" value={bonusForm.value} onChange={(e) => setBonusForm({ ...bonusForm, value: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="contents">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                  <select value={bonusForm.month} onChange={(e) => setBonusForm({ ...bonusForm, month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={bonusForm.year} onChange={(e) => setBonusForm({ ...bonusForm, year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reports <span className="text-rose-500">*</span></label>
                <PersonMultiSelect people={team} value={bonusForm.user_ids} onChange={(ids) => setBonusForm((f) => ({ ...f, user_ids: ids }))} placeholder="Choose reports" emptyText="No reports found." />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-rose-500">*</span></label>
                <textarea required value={bonusForm.reason} onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })} rows={2} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none resize-none" />
              </div>
              <div className="sm:col-span-2 flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" disabled={submittingBonus} onClick={() => setModal(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition">Cancel</button>
                <button
                  type="submit"
                  disabled={submittingBonus}
                  className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md shadow-purple-200 flex items-center justify-center gap-2"
                >
                  {submittingBonus ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Proposing to HR...</span>
                    </>
                  ) : (
                    "Propose to HR"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recommend Loan */}
      {modal === "loan" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Recommend Loan / Advance</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitLoan} className="p-6 grid sm:grid-cols-2 gap-x-6 gap-y-4 items-start overflow-y-auto">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Team Member <span className="text-rose-500">*</span></label>
                <PersonSelect people={team} value={loanForm.user_id} onChange={(id) => setLoanForm({ ...loanForm, user_id: id })} placeholder="Choose a report" emptyText="No reports found." />
              </div>
              <div className="contents">
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                    <FieldHelp surface="payroll.loan_recommendation" field="loan_type" label="the loan type" className="mb-2" />
                  </div>
                  <select value={loanForm.loan_type} onChange={(e) => setLoanForm({ ...loanForm, loan_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="salary_advance">Salary Advance</option>
                    <option value="loan">Company Loan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Principal (₹) <span className="text-rose-500">*</span></label>
                  <input type="number" required min="1" value={loanForm.principal_amount} onChange={(e) => setLoanForm({ ...loanForm, principal_amount: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Tenure (mo) <span className="text-rose-500">*</span></label>
                    <FieldHelp surface="payroll.loan_recommendation" field="tenure_months" label="the tenure" className="mb-2" />
                  </div>
                  <input type="number" required min="1" value={loanForm.tenure_months} onChange={(e) => setLoanForm({ ...loanForm, tenure_months: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Interest % p.a.</label>
                  <input type="number" min="0" max="100" step="0.01" value={loanForm.interest_rate} onChange={(e) => setLoanForm({ ...loanForm, interest_rate: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Method</label>
                    <FieldHelp surface="payroll.loan_recommendation" field="interest_method" label="the interest method" className="mb-2" />
                  </div>
                  <select value={loanForm.interest_method} onChange={(e) => setLoanForm({ ...loanForm, interest_method: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    <option value="reducing_balance">Reducing</option>
                    <option value="flat">Flat</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Month</label>
                    <FieldHelp surface="payroll.loan_recommendation" field="start_period_month" label="the first instalment month" className="mb-2" />
                  </div>
                  <select value={loanForm.month} onChange={(e) => setLoanForm({ ...loanForm, month: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                    {MONTHS.map((mo, i) => <option key={i} value={i + 1}>{mo.slice(0, 3)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Year</label>
                  <input type="number" required value={loanForm.year} onChange={(e) => setLoanForm({ ...loanForm, year: parseInt(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="sm:col-span-2 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Money paid out on</label>
                  <input type="date" value={loanForm.disbursed_on} onChange={(e) => setLoanForm({ ...loanForm, disbursed_on: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reason <span className="text-rose-500">*</span></label>
                  <input type="text" required value={loanForm.reason} onChange={(e) => setLoanForm({ ...loanForm, reason: e.target.value })} placeholder="e.g. Medical emergency" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              {loanEst && (
                <div className="sm:col-span-2 bg-purple-50 rounded-xl p-4 grid grid-cols-3 gap-3 text-center border border-purple-100">
                  <div>
                    <p className="text-[10px] font-bold text-purple-600 uppercase">Est. monthly</p>
                    <p className="text-base font-black text-purple-700 mt-0.5">{money(loanEst.emi)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-purple-600 uppercase">Total Interest</p>
                    <p className="text-base font-black text-purple-700 mt-0.5">{money(loanEst.totalInterest)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-purple-600 uppercase">Total Payable</p>
                    <p className="text-base font-black text-purple-700 mt-0.5">{money(loanEst.totalPayable)}</p>
                  </div>
                </div>
              )}
              <p className="sm:col-span-2 text-xs text-slate-400 italic">HR reviews and, if approved, generates the instalment schedule.</p>
              <div className="sm:col-span-2 flex gap-3 pt-4 mt-2 border-t border-slate-100">
                <button type="button" disabled={submittingLoan} onClick={() => setModal(null)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition">Cancel</button>
                <button
                  type="submit"
                  disabled={submittingLoan}
                  className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md shadow-purple-200 flex items-center justify-center gap-2"
                >
                  {submittingLoan ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Sending to HR...</span>
                    </>
                  ) : (
                    "Send to HR"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {adjDetail && (
        <AdjustmentDetail
          adj={adjDetail}
          memberName={teamName(adjDetail.user_id, adjDetail)}
          onCancel={cancelAdj}
          cancelling={cancellingAdjId === adjDetail.id}
          onClose={() => setAdjDetail(null)}
        />
      )}
      {bonusDetail && (
        <BonusProposalDetail bonus={bonusDetail} nameOf={(id) => teamName(id)} onClose={() => setBonusDetail(null)} />
      )}
      {loanDetail && (
        <LoanDetailModal loanId={loanDetail.id} memberName={loanDetail.name} onClose={() => setLoanDetail(null)} showToast={showToast} />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
