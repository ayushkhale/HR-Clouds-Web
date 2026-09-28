import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCash, HiCalendar, HiGift, HiTrendingDown, HiTrendingUp, HiSwitchHorizontal, HiCalculator, HiClipboardCheck, HiDocumentText } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { STATUS_CHIP } from "../../../../shared/utils/statusChip";
import { humanize } from "../../../../shared/attendance/enums";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatDate } from "../../../../shared/utils/formatUtils";
import { DICTIONARY } from "../../../../shared/config/dictionary";
import { interestMethodLabel } from "../../../hr/payroll/runMeta";

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

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPeriod = (pm) => {
  if (!pm) return "N/A";
  const [y, m] = String(pm).split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const asList = (d) => d?.records || d?.data || (Array.isArray(d) ? d : []);
const outstanding = (l) => l.outstanding_principal ?? l.outstanding_balance ?? l.remaining_balance ?? 0;


// Same tones as HR's loan register, so a loan reads the same to both sides.
const LOAN_PILL = {
  pending: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  active: "bg-violet-50 text-violet-700 border-violet-200",
  closed: "bg-slate-50 text-slate-600 border-slate-200",
  foreclosed: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-50 text-slate-600 border-slate-200",
};
const INST_TONE = { deducted: "solid", scheduled: "soft", cancelled: "muted", skipped: "outline" };
const INST_LABEL = { deducted: "Deducted", scheduled: "Due", cancelled: "Cancelled", skipped: "Skipped" };

// ── Encashments (#218 GET /payroll/me/encashments) ──────────────────────────
// Leave and comp-off converted to cash. The record is a request with its own
// approval trail; once approved it becomes a payroll adjustment (`adjustment_id`)
// paid in `period_month`.

// The guide suggests yellow/green/red/grey. This app is purple-family only, and
// these are the same four tones the other payroll status pills already use.
const ENCASH_STATUS = {
  pending: { label: "Pending", pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  approved: { label: "Approved", pill: "bg-violet-50 text-violet-700 border-violet-200" },
  rejected: { label: "Rejected", pill: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", pill: "bg-slate-50 text-slate-600 border-slate-200" },
};

// "Compensatory Off" in the guide; this app names the entitlement through the
// dictionary ("Complimentary Off"), so the tab has to follow the app.
const sourceLabel = (r) => {
  if (r?.source_kind === "comp_off") return DICTIONARY.TERMS.COMP_OFF;
  if (r?.source_kind === "leave_balance") return r?.leave_type_code ? `Leave balance (${r.leave_type_code})` : "Leave balance";
  return "N/A";
};

const RATE_BASIS = { basic: "Basic pay", gross: "Gross pay" };
const DIVISOR_BASIS = {
  fixed_30: "a fixed 30-day month",
  calendar_days: "the calendar days in the month",
  working_days: "the working days in the month",
};

/** "1 day" / "2.5 days" — `days` arrives as a decimal string ("1.00"). */
const daysLabel = (v) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "N/A";
  return `${Number.isInteger(n) ? n : Number(n.toFixed(2))} ${n === 1 ? "day" : "days"}`;
};

export default function MyLoansAndAdvancesPage() {
  const [tab, setTab] = useState("loans");
  const [loans, setLoans] = useState([]);
  const [bonuses, setBonuses] = useState({ earned: [], upcoming: [] });
  const [adjustments, setAdjustments] = useState({ earned: [], upcoming: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // { loan, installments, loading } — the row opens at once and the
  // schedule fills in, as on HR's loan register.
  const [openLoan, setOpenLoan] = useState(null);

  const [encashments, setEncashments] = useState([]);
  // A failed read must not look like "you have no encashments" — same reason the
  // HR grid keeps a LOAD_ERROR state instead of falling back to "Not set".
  const [encashError, setEncashError] = useState("");
  const [openEncashment, setOpenEncashment] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loanRes, bonusRes, adjRes, encashRes] = await Promise.all([
        payrollAPI.getMyLoans().catch(() => ({ data: [] })),
        payrollAPI.getMyBonuses().catch(() => ({ data: {} })),
        payrollAPI.getMyAdjustments().catch(() => ({ data: {} })),
        // #218 returns a plain array in `data` (no pagination envelope), newest
        // first, capped at 200 server-side.
        payrollAPI.getMyEncashments().then((res) => ({ res })).catch((err) => ({ err })),
      ]);
      if (encashRes.err) {
        setEncashments([]);
        setEncashError(payrollErrorMessage(encashRes.err, "Couldn't load your encashments"));
      } else {
        setEncashments(asList(encashRes.res?.data));
        setEncashError("");
      }
      setLoans(asList(loanRes.data));
      const b = bonusRes.data || {};
      setBonuses({ earned: b.earned || asList(b), upcoming: b.upcoming || [] });
      const a = adjRes.data || {};
      setAdjustments({ earned: a.earned || asList(a), upcoming: a.upcoming || [] });
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openLoanDetail = async (loan) => {
    setOpenLoan({ loan, installments: [], loading: true });
    try {
      const res = await payrollAPI.getMyLoanInstallments(loan.id);
      setOpenLoan((cur) => (cur?.loan.id === loan.id ? { loan, installments: asList(res.data), loading: false } : cur));
    } catch (err) {
      setOpenLoan((cur) => (cur?.loan.id === loan.id ? { ...cur, loading: false, failed: true } : cur));
      showToast(payrollErrorMessage(err, "Couldn't load the repayment schedule"), "error");
    }
  };

  const TABS = [
    { key: "loans", label: "Loans & Advances", icon: HiCash },
    { key: "variable", label: "Bonuses & Adjustments", icon: HiGift },
    { key: "encashments", label: "Encashments", icon: HiSwitchHorizontal },
  ];

  const allBonusRows = [
    ...bonuses.earned.map((r) => ({ ...r, _bucket: "earned" })),
    ...bonuses.upcoming.map((r) => ({ ...r, _bucket: "upcoming" })),
  ];
  const bonusIds = new Set(allBonusRows.map((r) => r.id).filter(Boolean));
  // A bonus IS an adjustment (`category: "bonus"`): the bonuses read returns
  // the same records, same ids, as the adjustments read, so every bonus was
  // listed twice. It's shown once, under Bonuses.
  const allAdjRows = [
    ...adjustments.earned.map((r) => ({ ...r, _bucket: "earned" })),
    ...adjustments.upcoming.map((r) => ({ ...r, _bucket: "upcoming" })),
  ].filter((r) => !bonusIds.has(r.id));


  return (
    <>
        <DashboardTopBar title="My Loans & Variable Pay" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">My Loans &amp; Variable Pay
            </h1>
            <p className="text-sm text-slate-500 mt-1">Your loan balances, EMI schedules, bonuses, one-off adjustments and encashed leave.</p>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {loading ? <Skeleton type="dashboard" /> : tab === "loans" ? (
            <LoansTable loans={loans} onOpen={openLoanDetail} />
          ) : tab === "variable" ? (
            <div className="space-y-8">
              <Section title="Bonuses & Incentives" icon={HiGift} rows={allBonusRows} empty="No bonuses yet." />
              <Section title="Adjustments" icon={HiTrendingUp} rows={allAdjRows} showType empty="No other one-off additions or deductions. Bonuses are listed above." />
            </div>
          ) : (
            <EncashmentsTable rows={encashments} error={encashError} onOpen={setOpenEncashment} />
          )}
        </main>

      {openEncashment && <EncashmentDetail record={openEncashment} onClose={() => setOpenEncashment(null)} />}

      {openLoan && <LoanDetail {...openLoan} onClose={() => setOpenLoan(null)} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ── Loans (GET /payroll/me/loans) ────────────────────────────────────────────
// A table like every other list, each row opening the record HR sees on its
// loan register, without HR's actions. These used to be tall cards with a
// "View Repayment Schedule" button that opened a hand-rolled modal.
function LoansTable({ loans, onOpen }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <th className="px-6 py-3.5 border-b border-slate-100">Loan</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Borrowed</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Monthly EMI</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Still to repay</th>
              <th className="px-6 py-3.5 border-b border-slate-100">Next EMI</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm">
            {loans.map((loan) => (
              <tr key={loan.id} {...rowPreviewProps(() => onOpen(loan), "Loan details")}>
                <td className="px-6 py-3.5">
                  <span className="font-semibold text-slate-800">{humanize(loan.loan_type) || "Loan"}</span>
                  <span className="block text-[11px] text-slate-400">From {fmtPeriod(loan.start_period_month)} · {loan.tenure_months ?? 0} months</span>
                </td>
                <td className="px-6 py-3.5 text-right font-semibold text-slate-800 tabular-nums">{money(loan.principal_amount)}</td>
                <td className="px-6 py-3.5 text-right text-slate-600 tabular-nums">{money(loan.emi_amount)}</td>
                <td className="px-6 py-3.5 text-right font-bold text-purple-700 tabular-nums">{money(outstanding(loan))}</td>
                <td className="px-6 py-3.5 text-slate-600">{loan.next_due_period_month ? fmtPeriod(loan.next_due_period_month) : "N/A"}</td>
                <td className="px-6 py-3.5 text-center">
                  <span className={`${STATUS_CHIP} ${LOAN_PILL[loan.status] || "bg-slate-50 text-slate-600 border-slate-200"}`}>{humanize(loan.status) || "N/A"}</span>
                </td>
              </tr>
            ))}
            {loans.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">You have no loans or salary advances. HR sets these up when one is agreed.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LoanDetail({ loan, installments, loading, failed = false, onClose }) {
  const type = humanize(loan.loan_type) || "Loan";
  return (
    <DetailDialog
      eyebrow="Loan details"
      icon={HiCash}
      title={type}
      subtitle={`First EMI ${fmtPeriod(loan.start_period_month)} · ${loan.tenure_months ?? 0} months`}
      badge={<DetailPill tone="onDark">{humanize(loan.status) || "N/A"}</DetailPill>}
      loading={loading}
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">Close</button>}
    >
      <DetailStats
        items={[
          { label: "Borrowed", value: money(loan.principal_amount), icon: HiCash },
          { label: "Monthly EMI", value: money(loan.emi_amount), icon: HiCalendar },
          { label: "Repaid so far", value: money(loan.recovered_amount ?? loan.total_recovered), icon: HiCheckCircle },
          { label: "Still to repay", value: money(outstanding(loan)), icon: HiTrendingUp },
        ]}
      />

      <DetailSection title="Loan terms" icon={HiDocumentText}>
        <DetailGrid
          cols={3}
          items={[
            ["Type", type],
            ["Interest rate", `${parseFloat(loan.interest_rate || 0)}% a year`],
            ["How interest is worked out", interestMethodLabel(loan.interest_method)],
            ["Tenure", `${loan.tenure_months ?? 0} months`],
            ["First EMI", fmtPeriod(loan.start_period_month)],
            ["Next EMI", loan.next_due_period_month ? fmtPeriod(loan.next_due_period_month) : null],
          ]}
        />
        {loan.reason && <div className="mt-3"><DetailText label="Reason">{loan.reason}</DetailText></div>}
      </DetailSection>

      <DetailSection title={failed ? "Repayment schedule" : `Repayment schedule (${installments.length})`} icon={HiCalendar}>
        <DetailTable
          rows={installments}
          rowKey={(inst, i) => inst.id || inst.installment_number || i}
          // A failed read must not look like "no EMIs": it would read as nothing owed.
          empty={failed ? "Couldn’t load the repayment schedule. Close this and open the loan again." : loan.status === "pending" ? "The schedule is created once the loan is approved." : "No EMIs scheduled."}
          columns={[
            { header: "#", render: (inst) => inst.installment_number },
            { header: "Due", render: (inst) => fmtPeriod(inst.due_period_month) },
            { header: "EMI", align: "right", render: (inst) => <span className="font-semibold text-slate-800">{money(inst.total_amount ?? inst.amount)}</span> },
            { header: "Status", align: "center", render: (inst) => <DetailPill tone={INST_TONE[inst.status] || "soft"}>{INST_LABEL[inst.status] || humanize(inst.status) || "N/A"}</DetailPill> },
          ]}
        />
      </DetailSection>
    </DetailDialog>
  );
}

function Section({ title, icon: Icon, rows, showType, empty = "Nothing here yet." }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-purple-600" /> {title}
      </h2>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <th className="px-6 py-3.5 border-b border-slate-100">Item</th>
              <th className="px-6 py-3.5 border-b border-slate-100">Period</th>
              {showType && <th className="px-6 py-3.5 border-b border-slate-100">Type</th>}
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Amount</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-3.5 font-semibold text-slate-800">
                  {r.component_name || r.name || "N/A"}
                  {r.reason && <span className="block text-[11px] text-slate-400 font-normal line-clamp-1">{r.reason}</span>}
                </td>
                <td className="px-6 py-3.5 text-slate-600">{fmtPeriod(r.period_month)}</td>
                {showType && (
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold ${r.adjustment_type === "deduction" ? "text-rose-600" : "text-violet-600"}`}>
                      {r.adjustment_type === "deduction" ? <HiTrendingDown className="w-3.5 h-3.5" /> : <HiTrendingUp className="w-3.5 h-3.5" />}
                      {r.adjustment_type === "deduction" ? "Deduction" : "Earning"}
                    </span>
                  </td>
                )}
                <td className="px-6 py-3.5 text-right font-bold text-slate-800">{money(r.amount ?? r.bonus_amount)}</td>
                <td className="px-6 py-3.5 text-center">
                  <span className={`${STATUS_CHIP} ${r._bucket === "earned" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"}`}>
                    {r._bucket === "earned" ? "Paid" : "Upcoming"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showType ? 5 : 4} className="px-6 py-8 text-center text-slate-500">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Encashments (#218) ───────────────────────────────────────────────────────

/**
 * History of leave / comp-off turned into cash. Read-only: an employee can't
 * raise one here — a manager proposes it and HR approves, which is why the row
 * carries an approval trail rather than any action.
 */
function EncashmentsTable({ rows, error, onOpen }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[860px]">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <th className="px-6 py-3.5 border-b border-slate-100">Requested</th>
              <th className="px-6 py-3.5 border-b border-slate-100">Type</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Days</th>
              <th className="px-6 py-3.5 border-b border-slate-100">Paid with</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-right">Amount</th>
              <th className="px-6 py-3.5 border-b border-slate-100 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm">
            {rows.map((r) => {
              const meta = ENCASH_STATUS[r.status] || { label: humanize(r.status) || "N/A", pill: "bg-slate-50 text-slate-600 border-slate-200" };
              return (
                <tr key={r.id} {...rowPreviewProps(() => onOpen(r), `View this ${sourceLabel(r).toLowerCase()} encashment`)}>
                  <td className="px-6 py-3.5 text-slate-600">{formatDate(r.created_at)}</td>
                  <td className="px-6 py-3.5">
                    <span className="font-semibold text-slate-800">{sourceLabel(r)}</span>
                    {r.balance_year && <span className="block text-[11px] text-slate-400 font-normal">{r.balance_year} entitlement</span>}
                  </td>
                  <td className="px-6 py-3.5 text-right text-slate-600 tabular-nums">{daysLabel(r.days)}</td>
                  <td className="px-6 py-3.5 text-slate-600">{r.period_month ? `${fmtPeriod(r.period_month)} payroll` : "N/A"}</td>
                  <td className="px-6 py-3.5 text-right font-bold text-slate-800 tabular-nums">{money(r.amount)}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className={`${STATUS_CHIP} ${meta.pill}`}>{meta.label}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                {/* A failed read and an empty history must not look the same —
                    "nothing has been encashed" is a claim, and after a 403 on the
                    payroll feature flag it would be a false one. */}
                <td colSpan={6} className="px-6 py-10 text-center">
                  {error ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600">
                      <HiExclamationCircle className="w-4 h-4 shrink-0" /> {error}
                    </span>
                  ) : (
                    <span className="text-slate-500">None of your leave or {DICTIONARY.TERMS.COMP_OFF.toLowerCase()} has been encashed yet.</span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** How the payout was worked out, plus who approved it. */
function EncashmentDetail({ record: r, onClose }) {
  const meta = ENCASH_STATUS[r.status] || { label: r.status || "N/A" };
  const rate = RATE_BASIS[r.rate_basis] || r.rate_basis || "N/A";
  const divisor = DIVISOR_BASIS[r.divisor_basis];

  return (
    <DetailDialog
      eyebrow="Encashment"
      icon={HiSwitchHorizontal}
      title={`${daysLabel(r.days)} · ${money(r.amount)}`}
      subtitle={sourceLabel(r)}
      badge={<DetailPill tone={r.status === "approved" ? "solid" : "soft"}>{meta.label}</DetailPill>}
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">Close</button>}
    >
      <DetailSection title="How the amount was worked out" icon={HiCalculator}>
        <DetailGrid
          cols={3}
          items={[
            ["Days encashed", daysLabel(r.days)],
            ["Rate based on", rate],
            ["Per day", money(r.per_day_amount)],
            ["Month divided by", r.divisor_days ? `${r.divisor_days} days` : null],
            ["Total", money(r.amount)],
            ["Paid with", r.period_month ? `${fmtPeriod(r.period_month)} payroll` : null],
          ]}
        />
        <p className="mt-4 text-[11px] text-slate-500">
          {daysLabel(r.days)} at {money(r.per_day_amount)} a day. The daily rate is your {rate.toLowerCase()}
          {divisor ? ` divided by ${divisor}` : ""}
          {r.divisor_days ? ` (${r.divisor_days} days)` : ""}.
        </p>
      </DetailSection>

      <DetailSection title="Request" icon={HiClipboardCheck}>
        <DetailGrid
          cols={3}
          items={[
            ["Source", sourceLabel(r)],
            ["Entitlement year", r.balance_year || null],
            // A comp-off encashment names the days it consumed; a leave one doesn't.
            [`${DICTIONARY.TERMS.COMP_OFF} days used`, Array.isArray(r.comp_off_ids) && r.comp_off_ids.length ? r.comp_off_ids.length : null],
            ["Requested on", formatDate(r.created_at)],
            ["Last updated", formatDate(r.updated_at)],
            ["Pay component", r.component_code || null],
          ]}
        />
      </DetailSection>

      {r.status === "rejected" && (
        <DetailSection title="Why it was rejected" icon={HiExclamationCircle}>
          <DetailText>{r.rejection_reason || "No reason was recorded."}</DetailText>
        </DetailSection>
      )}
      {/* Stored since 29 Sep 2026 (R-4); a cancellation from before then has none. */}
      {r.status === "cancelled" && r.cancellation_reason && (
        <DetailSection title="Why it was cancelled" icon={HiExclamationCircle}>
          <DetailText>{r.cancellation_reason}</DetailText>
        </DetailSection>
      )}

      {r.status === "approved" && (
        <DetailSection title="Payment" icon={HiCash}>
          <p className="text-xs text-slate-600">
            {r.adjustment_id
              ? `Approved and queued as a payroll addition${r.period_month ? ` for ${fmtPeriod(r.period_month)}` : ""}. It shows on that month's payslip.`
              : `Approved. It will be added to ${r.period_month ? `${fmtPeriod(r.period_month)} payroll` : "an upcoming payroll"}.`}
            {r.exit_id ? " This forms part of your full-and-final settlement." : ""}
          </p>
        </DetailSection>
      )}
    </DetailDialog>
  );
}
