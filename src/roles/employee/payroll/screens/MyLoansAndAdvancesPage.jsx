import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCash, HiCalendar, HiGift, HiTrendingDown, HiTrendingUp, HiSwitchHorizontal, HiCalculator, HiClipboardCheck } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailGrid, DetailPill, DetailSection, DetailText, rowPreviewProps } from "../../../../shared/components/DetailDialog";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatDate } from "../../../../shared/utils/formatUtils";
import { DICTIONARY } from "../../../../shared/config/dictionary";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-violet-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtPeriod = (pm) => {
  if (!pm) return "-";
  const [y, m] = String(pm).split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
const asList = (d) => d?.records || d?.data || (Array.isArray(d) ? d : []);
const outstanding = (l) => l.outstanding_principal ?? l.outstanding_balance ?? l.remaining_balance ?? 0;

const INST_PILL = {
  scheduled: "bg-fuchsia-100 text-fuchsia-700",
  deducted: "bg-violet-100 text-violet-700",
  cancelled: "bg-slate-100 text-slate-500",
  skipped: "bg-red-100 text-red-700",
};

// ── Encashments (#218 GET /payroll/me/encashments) ──────────────────────────
// Leave and comp-off converted to cash. The record is a request with its own
// approval trail; once approved it becomes a payroll adjustment (`adjustment_id`)
// paid in `period_month`.

// The guide suggests yellow/green/red/grey. This app is purple-family only, and
// these are the same four tones the other payroll status pills already use.
const ENCASH_STATUS = {
  pending: { label: "Pending", pill: "bg-fuchsia-100 text-fuchsia-700" },
  approved: { label: "Approved", pill: "bg-violet-100 text-violet-700" },
  rejected: { label: "Rejected", pill: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", pill: "bg-slate-100 text-slate-500" },
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

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [installments, setInstallments] = useState([]);

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

  const handleViewSchedule = async (loan) => {
    try {
      const res = await payrollAPI.getMyLoanInstallments(loan.id);
      setInstallments(asList(res.data));
      setSelectedLoan(loan);
    } catch (err) {
      showToast(err.message || "Failed to fetch schedule", "error");
    }
  };

  const TABS = [
    { key: "loans", label: "Loans & Advances", icon: HiCash },
    { key: "variable", label: "Bonuses & Adjustments", icon: HiGift },
    { key: "encashments", label: "Encashments", icon: HiSwitchHorizontal },
  ];

  const allAdjRows = [
    ...adjustments.earned.map((r) => ({ ...r, _bucket: "earned" })),
    ...adjustments.upcoming.map((r) => ({ ...r, _bucket: "upcoming" })),
  ];
  const allBonusRows = [
    ...bonuses.earned.map((r) => ({ ...r, _bucket: "earned" })),
    ...bonuses.upcoming.map((r) => ({ ...r, _bucket: "upcoming" })),
  ];

  return (
    <>
        <DashboardTopBar title="Loans & Variable Pay" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Loans &amp; Variable Pay
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {loans.map((loan) => (
                <div key={loan.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg capitalize">{(loan.loan_type || "loan").replace(/_/g, " ")}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">From {fmtPeriod(loan.start_period_month)} · {loan.tenure_months} months</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${loan.status === "active" ? "bg-violet-100 text-violet-700" : loan.status === "foreclosed" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                      {loan.status}
                    </span>
                  </div>
                  <div className="p-5 flex-1 space-y-3">
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Principal</p><p className="text-sm font-black text-slate-800">{money(loan.principal_amount)}</p></div>
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Recovered</p><p className="text-sm font-semibold text-violet-600">{money(loan.recovered_amount)}</p></div>
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Outstanding</p><p className="text-sm font-black text-purple-700">{money(outstanding(loan))}</p></div>
                    <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Monthly EMI</p><p className="text-sm font-semibold text-slate-600">{money(loan.emi_amount)}</p></div>
                    {loan.next_due_period_month && (
                      <div className="flex justify-between"><p className="text-xs font-bold text-slate-400 uppercase">Next Due</p><p className="text-sm font-semibold text-slate-600">{fmtPeriod(loan.next_due_period_month)}</p></div>
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-50 bg-white">
                    <button onClick={() => handleViewSchedule(loan)} className="w-full flex justify-center items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                      <HiCalendar className="w-4 h-4" /> View Repayment Schedule
                    </button>
                  </div>
                </div>
              ))}
              {loans.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">You have no active or past loans.</p>
                </div>
              )}
            </div>
          ) : tab === "variable" ? (
            <div className="space-y-8">
              <Section title="Bonuses & Incentives" icon={HiGift} rows={allBonusRows} />
              <Section title="Adjustments" icon={HiTrendingUp} rows={allAdjRows} showType />
            </div>
          ) : (
            <EncashmentsTable rows={encashments} error={encashError} onOpen={setOpenEncashment} />
          )}
        </main>

      {openEncashment && <EncashmentDetail record={openEncashment} onClose={() => setOpenEncashment(null)} />}

      {selectedLoan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Repayment Schedule</h2>
              <button onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">Due</th>
                    <th className="px-5 py-3 text-right">EMI</th>
                    <th className="px-5 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {installments.map((inst) => (
                    <tr key={inst.id || inst.installment_number} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-slate-400 font-bold">{inst.installment_number}</td>
                      <td className="px-5 py-3 text-slate-600 font-medium">{fmtPeriod(inst.due_period_month)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{money(inst.total_amount ?? inst.amount)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${INST_PILL[inst.status] || "bg-slate-100 text-slate-500"}`}>{inst.status}</span>
                      </td>
                    </tr>
                  ))}
                  {installments.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No installments found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function Section({ title, icon: Icon, rows, showType }) {
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
                    <span className={`inline-flex items-center gap-1 text-xs font-bold ${r.adjustment_type === "deduction" ? "text-red-600" : "text-violet-600"}`}>
                      {r.adjustment_type === "deduction" ? <HiTrendingDown className="w-3.5 h-3.5" /> : <HiTrendingUp className="w-3.5 h-3.5" />}
                      {r.adjustment_type === "deduction" ? "Deduction" : "Earning"}
                    </span>
                  </td>
                )}
                <td className="px-6 py-3.5 text-right font-bold text-slate-800">{money(r.amount ?? r.bonus_amount)}</td>
                <td className="px-6 py-3.5 text-center">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${r._bucket === "earned" ? "bg-violet-100 text-violet-700" : "bg-fuchsia-100 text-fuchsia-700"}`}>
                    {r._bucket === "earned" ? "Paid" : "Upcoming"}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showType ? 5 : 4} className="px-6 py-8 text-center text-slate-500">Nothing here yet.</td></tr>
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
              const meta = ENCASH_STATUS[r.status] || { label: r.status || "N/A", pill: "bg-slate-100 text-slate-500" };
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
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${meta.pill}`}>{meta.label}</span>
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
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
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
