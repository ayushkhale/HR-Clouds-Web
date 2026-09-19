import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiLibrary, HiClock, HiChevronDown, HiChevronRight,
  HiCurrencyRupee, HiTrendingUp, HiTrendingDown, HiDocumentText, HiSwitchHorizontal, HiPencil,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import DetailDialog, { DetailFooterNote, DetailGrid, DetailPill, DetailSection, DetailStats, DetailTable, DetailText } from "../../../../shared/components/DetailDialog";
import StatutoryBreakdownPanel, { StatutoryUnavailableNotice } from "../../../../shared/components/StatutoryBreakdown";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { formatMoney, formatDate } from "../../../../shared/utils/formatUtils";
import { normalizeStatutory, statutoryTotals } from "../../../../shared/utils/statutoryBreakdown";
import { humanize } from "../../../../shared/attendance/enums";

const REVISION_LABELS = {
  initial: "Initial",
  increment: "Increment",
  promotion: "Promotion",
  correction: "Correction",
  restructure: "Restructure",
};
const revisionLabel = (s) => REVISION_LABELS[s?.revision_type] || humanize(s?.revision_type) || "Revision";

// Same label / input look as the Invite Team Member form.
const labelCls = "block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5";
const inputCls = "w-full h-10 bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 outline-none focus:border-purple-500 focus:bg-white transition-all";
const EMPTY_BANK = { account_holder_name: "", bank_name: "", account_number: "", ifsc_code: "", branch_name: "" };

const amount = (v) => parseFloat(v) || 0;

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

// A structure mixes earnings and deductions in one `components` array. Split
// them so deductions (e.g. a salary advance) never inflate gross.
//
// PF, ESI, professional tax and TDS are never components — they are statutory
// withholdings the backend recomputes on every read into `statutory_breakdown`.
// So take-home is gross minus BOTH sides, and the two are summed here exactly
// once: `statutory_breakdown.figures.net_pay` nets only the statutory heads and
// knows nothing about contractual deduction components.
function breakdownOf(structure) {
  const comps = (Array.isArray(structure?.components) ? structure.components : [])
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.component_name).localeCompare(String(b.component_name)));
  const sum = (arr, key) => arr.reduce((s, c) => s + amount(c[key]), 0);
  const earnings = comps.filter((c) => c.component_type === "earning");
  const deductions = comps.filter((c) => c.component_type === "deduction");
  const statutory = normalizeStatutory(structure);
  const componentDeductions = sum(deductions, "monthly_amount");
  // One derivation shared with StatutoryBreakdownPanel, so the headline cards
  // and the panel below them can never show different take-home figures.
  const totals = statutoryTotals(statutory, {
    monthlyGross: amount(structure?.monthly_gross) || sum(earnings, "monthly_amount"),
    componentDeductions,
  });
  const { gross: monthlyGross, deductions: monthlyDeductions, statutoryDeductions, net: monthlyNet } = totals;
  const annualGross = sum(earnings, "annual_amount");
  const annualDeductions = sum(deductions, "annual_amount");
  return {
    earnings, deductions, comps, statutory,
    monthlyGross, annualGross, monthlyDeductions, annualDeductions,
    componentDeductions, statutoryDeductions,
    monthlyNet,
    // TDS is trued up month to month, so twelve times the current month is an
    // estimate — not the contractual annual figure it used to be.
    annualNet: statutory ? monthlyNet * 12 : annualGross - annualDeductions,
  };
}

const SHORT_HEAD = { pf: "PF", esi: "ESI", pt: "professional tax", tds: "income tax" };

/** "PF and income tax" — names what is actually coming off, not just a count. */
function deductionHint(b) {
  // Only heads with a real amount: an applicable head sitting at ₹0 (no tax due
  // this year) would otherwise be named as if it were reducing the pay.
  const parts = b.statutory ? b.statutory.employeeLines.filter((l) => l.applicable && l.amount > 0).map((l) => SHORT_HEAD[l.key]) : [];
  if (b.deductions.length) parts.push(`${b.deductions.length} salary deduction${b.deductions.length === 1 ? "" : "s"}`);
  if (parts.length === 0) return b.statutory ? "No statutory deductions apply" : "No deductions";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "40% of CTC", "Fixed amount", "Balance of CTC". */
function calcLabel(c) {
  const v = amount(c.value);
  const pct = Number.isInteger(v) ? v : Number(v.toFixed(2));
  switch (c.calculation_type) {
    case "flat": return "Fixed amount";
    case "percent_of_ctc": return `${pct}% of CTC`;
    case "percent_of_basic": return `${pct}% of Basic`;
    case "percent_of_gross": return `${pct}% of Gross`;
    case "balancing": return "Balance of CTC";
    default: return humanize(c.calculation_type) || "N/A";
  }
}

const componentKey = (c) => c.component_code || c.component_id || c.component_name;

/** Components added, removed or re-priced between two versions. */
function componentChanges(current, previous) {
  if (!previous) return [];
  const before = new Map((previous.components || []).map((c) => [componentKey(c), c]));
  const after = new Map((current.components || []).map((c) => [componentKey(c), c]));
  const rows = [];
  after.forEach((c, key) => {
    const old = before.get(key);
    if (!old) rows.push({ id: key, name: c.component_name, type: c.component_type, before: null, after: amount(c.monthly_amount), note: "Added" });
    else if (amount(old.monthly_amount) !== amount(c.monthly_amount)) rows.push({ id: key, name: c.component_name, type: c.component_type, before: amount(old.monthly_amount), after: amount(c.monthly_amount), note: "Changed" });
  });
  before.forEach((c, key) => {
    if (!after.has(key)) rows.push({ id: key, name: c.component_name, type: c.component_type, before: amount(c.monthly_amount), after: null, note: "Removed" });
  });
  return rows;
}

function CtcChange({ current, previous, compact = false }) {
  if (!previous) return compact ? null : <span className="text-slate-400">First salary structure</span>;
  const diff = amount(current.annual_ctc) - amount(previous.annual_ctc);
  if (diff === 0) return <span className="text-[11px] font-semibold text-slate-400">No CTC change</span>;
  const pct = amount(previous.annual_ctc) ? (diff / amount(previous.annual_ctc)) * 100 : null;
  const Icon = diff > 0 ? HiTrendingUp : HiTrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${diff > 0 ? "text-purple-700" : "text-rose-600"}`}>
      <Icon className="w-3.5 h-3.5" />
      {diff > 0 ? "+" : "−"}{formatMoney(Math.abs(diff))}{pct !== null && ` (${diff > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}

function ComponentTable({ rows, sign = "" }) {
  return (
    <DetailTable
      rows={rows}
      empty="None."
      columns={[
        { header: "Component", render: (c) => <span className="font-semibold text-slate-800">{c.component_name || c.component_code || "Component"}</span> },
        { header: "How it's worked out", render: (c) => <span className="text-slate-500">{calcLabel(c)}</span> },
        { header: "Monthly", align: "right", render: (c) => <span className="font-semibold tabular-nums">{sign}{formatMoney(c.monthly_amount)}</span> },
        { header: "Annual", align: "right", render: (c) => <span className="tabular-nums">{sign}{formatMoney(c.annual_amount)}</span> },
      ]}
    />
  );
}

export default function MySalaryPage() {
  const [structure, setStructure] = useState(null);
  const [history, setHistory] = useState([]);
  const [bankAccount, setBankAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [openRevision, setOpenRevision] = useState(null);

  const [bankDialog, setBankDialog] = useState(null); // null | "view" | "edit"
  const [bankFormData, setBankFormData] = useState(EMPTY_BANK);
  const [bankSaving, setBankSaving] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [structRes, histRes, bankRes] = await Promise.all([
        payrollAPI.getMyCurrentStructure().catch(() => ({ data: null })),
        payrollAPI.getMyStructureHistory().catch(() => ({ data: [] })),
        payrollAPI.getMyBankAccount().catch(() => ({ data: null })),
      ]);
      setStructure(structRes.data);
      setHistory(histRes.data?.records || histRes.data || []);
      setBankAccount(bankRes.data || null);
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to load salary data"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const breakdown = useMemo(() => breakdownOf(structure), [structure]);
  // Newest first; each revision is compared with the one right below it. Only
  // the "current structure" read carries `statutory_breakdown` — history rows
  // never do — so the live one is carried across onto its own revision instead
  // of leaving the current version looking like it has no deductions.
  const revisions = useMemo(() => {
    const rows = (Array.isArray(history) ? history : []).slice()
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0) || String(b.effective_from).localeCompare(String(a.effective_from)));
    if (!structure?.statutory_breakdown) return rows;
    return rows.map((r) => (r.id && r.id === structure.id && !r.statutory_breakdown
      ? { ...r, statutory_breakdown: structure.statutory_breakdown }
      : r));
  }, [history, structure]);
  // Match by id, not object identity: `revisions` is rebuilt whenever history or
  // the current structure reloads, and an open dialog still holds a row from the
  // previous array. indexOf would return -1 and `revisions[0]` — the newest
  // revision — would be presented as the one before this.
  const previousOf = (rev) => {
    const key = rev?.id ?? rev?.version;
    const i = revisions.findIndex((r) => (r?.id ?? r?.version) === key);
    return i < 0 ? null : revisions[i + 1] || null;
  };

  const openBankEditor = () => {
    // The full account number is never returned (masked at rest), so it must
    // be re-entered on edit — which also intentionally re-triggers HR verification.
    setBankFormData(bankAccount ? {
      account_holder_name: bankAccount.account_holder_name || "",
      bank_name: bankAccount.bank_name || "",
      account_number: "",
      ifsc_code: bankAccount.ifsc_code || "",
      branch_name: bankAccount.branch_name || "",
    } : EMPTY_BANK);
    setBankDialog("edit");
  };

  const handleBankSubmit = async (e) => {
    e.preventDefault();
    if (bankSaving) return;
    setBankSaving(true);
    try {
      await payrollAPI.upsertMyBankAccount(bankFormData);
      showToast("Bank details updated successfully");
      setBankDialog(null);
      loadData();
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to update bank details"), "error");
    } finally {
      setBankSaving(false);
    }
  };

  const bankStatus = bankAccount ? (bankAccount.is_verified ? "Verified" : "Pending verification") : "Not added";
  // Nobody can be paid without this, and only the account holder can enter it
  // (`PUT /payroll/me/bank-account` is self-scoped), so a missing account is the
  // one thing on this page that needs chasing.
  const bankMissing = !loading && !bankAccount;

  return (
    <>
      <DashboardTopBar title="My Salary Details" />
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 w-full">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Salary & Bank Details</h1>
            <p className="text-sm text-slate-500 mt-1">Your current salary structure, how it has changed, and where your salary is paid.</p>
          </div>
          <button
            type="button"
            onClick={() => (bankMissing ? openBankEditor() : setBankDialog("view"))}
            aria-haspopup="dialog"
            className={`flex items-center gap-3 pl-3 pr-4 py-2.5 bg-white rounded-xl shadow-2xs transition text-left border ${bankMissing ? "border-fuchsia-300 hover:border-fuchsia-400 hover:bg-fuchsia-50/40" : "border-slate-200 hover:border-purple-300 hover:bg-purple-50/40"}`}
          >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bankMissing ? "bg-fuchsia-50 text-fuchsia-600" : "bg-purple-50 text-purple-600"}`}><HiLibrary className="w-5 h-5" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">{bankMissing ? "Add bank details" : "Bank details"}</span>
              <span className={`block text-[11px] font-semibold ${bankMissing ? "text-fuchsia-600" : "text-slate-500"}`}>
                {loading ? "Checking…" : bankMissing ? "Needed before you can be paid" : `${bankAccount?.masked_account_number ? `${bankAccount.masked_account_number} · ` : ""}${bankStatus}`}
              </span>
            </span>
            <HiChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>

        {loading ? <Skeleton type="dashboard" /> : (
          <>
            {/* ── Current salary structure (full width, collapsible) ── */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiCurrencyRupee className="w-5 h-5" /></div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">Current Salary Structure</h2>
                    {structure && (
                      <p className="text-xs text-slate-500">
                        Effective from {formatDate(structure.effective_from)}
                        {structure.version != null && ` · Version ${structure.version}`}
                        {structure.revision_type && ` · ${revisionLabel(structure)}`}
                      </p>
                    )}
                  </div>
                </div>
                {structure && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Annual CTC</p>
                    <p className="text-xl font-black text-purple-700 tabular-nums">{formatMoney(structure.annual_ctc)}</p>
                  </div>
                )}
              </div>

              {structure ? (
                <>
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-purple-600 text-white px-5 py-4 shadow-sm shadow-purple-200">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-purple-100">Take-home / month</p>
                      <p className="text-2xl font-black mt-1 tabular-nums">{formatMoney(breakdown.monthlyNet)}</p>
                      <p className="text-[11px] text-purple-100 mt-0.5">{breakdown.statutory ? "After PF, ESI, PT and tax" : "Before PF, ESI and tax"}</p>
                    </div>
                    {[
                      ["Gross / month", formatMoney(breakdown.monthlyGross), `${breakdown.earnings.length} earning${breakdown.earnings.length === 1 ? "" : "s"}`],
                      ["Deductions / month", `− ${formatMoney(breakdown.monthlyDeductions)}`, deductionHint(breakdown)],
                      ["Take-home / year", formatMoney(breakdown.annualNet), breakdown.statutory ? "Estimated at this month's rate" : "Before PF, ESI, tax and variable pay"],
                    ].map(([label, value, hint]) => (
                      <div key={label} className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
                      </div>
                    ))}
                  </div>

                  {expanded && (
                    <div className="px-6 pb-6 space-y-5">
                      {/* Contractual deduction lines only, and only when there
                          are any. PF / ESI / PT / TDS are never components; they
                          live in the statutory block below. */}
                      <div className={`grid grid-cols-1 gap-5 ${breakdown.deductions.length > 0 ? "xl:grid-cols-2" : ""}`}>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-slate-800">Earnings</h3>
                            <span className="text-xs font-bold text-purple-700 tabular-nums">{formatMoney(breakdown.monthlyGross)} / month</span>
                          </div>
                          <ComponentTable rows={breakdown.earnings} />
                        </div>
                        {breakdown.deductions.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-sm font-bold text-slate-800">Salary deductions</h3>
                              <span className="text-xs font-bold text-rose-600 tabular-nums">− {formatMoney(breakdown.componentDeductions)} / month</span>
                            </div>
                            <ComponentTable rows={breakdown.deductions} sign="− " />
                          </div>
                        )}
                      </div>

                      {breakdown.statutory
                        ? <StatutoryBreakdownPanel statutory={breakdown.statutory} componentDeductions={breakdown.componentDeductions} />
                        : <StatutoryUnavailableNotice />}

                      <p className="text-[11px] text-slate-400">
                        Annual CTC is the total cost to the company. Take-home is gross earnings minus deductions
                        {breakdown.statutory ? ", and moves with attendance, unpaid leave and your tax declarations." : ", before payroll-time tax and any variable pay."}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="w-full flex items-center justify-center gap-1.5 px-6 py-3 border-t border-slate-100 bg-slate-50/60 hover:bg-purple-50/60 text-xs font-bold text-purple-700 transition"
                  >
                    {expanded ? "Hide salary breakdown" : `View salary breakdown (${breakdown.comps.length} components)`}
                    <HiChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </>
              ) : (
                <div className="p-12 text-center">
                  <p className="text-slate-500">Your salary structure has not been assigned yet.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {bankMissing
                      ? "You can add your bank details now — they don't depend on a salary structure."
                      : "HR will assign one; your bank details are already on file."}
                  </p>
                  {bankMissing && (
                    <button type="button" onClick={openBankEditor} aria-haspopup="dialog"
                      className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs">
                      <HiLibrary className="w-3.5 h-3.5" /> Add bank details
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* ── Salary history as a log ── */}
            {revisions.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><HiClock className="w-4 h-4 text-purple-600" /> Salary History</h2>
                  <p className="text-xs text-slate-500">{revisions.length} revision{revisions.length === 1 ? "" : "s"} · open one to see the full details</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {revisions.map((rev) => {
                    const isCurrent = !rev.effective_to;
                    return (
                      <li key={rev.id || rev.version}>
                        <button
                          type="button"
                          onClick={() => setOpenRevision(rev)}
                          aria-haspopup="dialog"
                          className="w-full text-left px-6 py-4 grid grid-cols-[auto_1fr_auto] items-center gap-4 hover:bg-purple-50/40 focus:bg-purple-50/60 outline-none transition-colors"
                        >
                          <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${isCurrent ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                            v{rev.version ?? "?"}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{revisionLabel(rev)}</span>
                              {isCurrent && <DetailPill tone="solid">Current</DetailPill>}
                              <span className="text-xs text-slate-500">{formatDate(rev.effective_from)} – {isCurrent ? "Present" : formatDate(rev.effective_to)}</span>
                            </span>
                            <span className="block text-xs text-slate-400 truncate mt-0.5">{rev.revision_reason || "No reason recorded"}</span>
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="text-right">
                              <span className="block text-sm font-bold text-slate-900 tabular-nums">{formatMoney(rev.annual_ctc)}<span className="text-[11px] font-semibold text-slate-400"> / year</span></span>
                              <CtcChange current={rev} previous={previousOf(rev)} compact />
                            </span>
                            <HiChevronRight className="w-4 h-4 text-slate-400" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {/* ── Salary revision popup ── */}
      {openRevision && (() => {
        const rev = openRevision;
        const prev = previousOf(rev);
        const b = breakdownOf(rev);
        const changes = componentChanges(rev, prev);
        const isCurrent = !rev.effective_to;
        return (
          <DetailDialog
            eyebrow="Salary revision"
            icon={HiClock}
            title={`${revisionLabel(rev)} · Version ${rev.version ?? "?"}`}
            subtitle={`${formatDate(rev.effective_from)} – ${isCurrent ? "Present" : formatDate(rev.effective_to)}`}
            badge={<DetailPill tone={isCurrent ? "solid" : "soft"}>{isCurrent ? "Current" : humanize(rev.status) || "Past"}</DetailPill>}
            onClose={() => setOpenRevision(null)}
            footer={<button type="button" onClick={() => setOpenRevision(null)} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">Close</button>}
          >
            <DetailStats
              items={[
                { label: "Annual CTC", value: formatMoney(rev.annual_ctc), hint: <CtcChange current={rev} previous={prev} /> },
                { label: "Gross / month", value: formatMoney(b.monthlyGross) },
                { label: "Deductions / month", value: `− ${formatMoney(b.monthlyDeductions)}`, hint: deductionHint(b) },
                { label: "Take-home / month", value: formatMoney(b.monthlyNet) },
              ]}
            />

            <DetailSection title="Revision details" icon={HiDocumentText}>
              <DetailGrid
                items={[
                  ["Type", revisionLabel(rev)],
                  ["Effective from", formatDate(rev.effective_from)],
                  ["Effective until", isCurrent ? "Present" : formatDate(rev.effective_to)],
                  ["Approved on", rev.actioned_at ? formatDate(rev.actioned_at) : null],
                ]}
              />
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DetailText label="Reason">{rev.revision_reason || "No reason recorded"}</DetailText>
                {rev.rejection_reason && <DetailText label="Why it was rejected">{rev.rejection_reason}</DetailText>}
              </div>
            </DetailSection>

            {prev && (
              <DetailSection title={`What changed from version ${prev.version ?? "?"}`} icon={HiSwitchHorizontal}>
                {changes.length === 0 ? (
                  <p className="text-xs text-slate-500">Same components and monthly amounts as version {prev.version ?? "?"}.</p>
                ) : (
                  <DetailTable
                    rows={changes}
                    columns={[
                      { header: "Component", render: (r) => <span className="font-semibold text-slate-800">{r.name || "Component"}</span> },
                      { header: "Type", render: (r) => humanize(r.type) },
                      { header: "Before / month", align: "right", render: (r) => (r.before === null ? <span className="text-slate-400">Not included</span> : <span className="tabular-nums">{formatMoney(r.before)}</span>) },
                      { header: "After / month", align: "right", render: (r) => (r.after === null ? <span className="text-slate-400">Removed</span> : <span className="font-semibold tabular-nums">{formatMoney(r.after)}</span>) },
                      {
                        header: "Change",
                        align: "right",
                        render: (r) => {
                          if (r.note !== "Changed") return <DetailPill tone={r.note === "Added" ? "soft" : "muted"}>{r.note}</DetailPill>;
                          const d = r.after - r.before;
                          return <span className={`font-bold tabular-nums ${d > 0 ? "text-purple-700" : "text-rose-600"}`}>{d > 0 ? "+" : "−"}{formatMoney(Math.abs(d))}</span>;
                        },
                      },
                    ]}
                  />
                )}
              </DetailSection>
            )}

            <DetailSection title={`Earnings · ${formatMoney(b.monthlyGross)} / month`} icon={HiTrendingUp}>
              <ComponentTable rows={b.earnings} />
            </DetailSection>

            {b.deductions.length > 0 && (
              <DetailSection title={`Salary deductions · − ${formatMoney(b.componentDeductions)} / month`} icon={HiTrendingDown}>
                <ComponentTable rows={b.deductions} sign="− " />
              </DetailSection>
            )}

            {/* Statutory figures are recomputed on read and only ship with the
                current structure, so past revisions say so rather than showing
                a take-home that silently ignores PF and tax. */}
            {b.statutory
              ? <StatutoryBreakdownPanel statutory={b.statutory} componentDeductions={b.componentDeductions} />
              : <StatutoryUnavailableNotice />}
          </DetailDialog>
        );
      })()}

      {/* ── Bank details popup (view + edit) ── */}
      {bankDialog && (
        <DetailDialog
          eyebrow="Bank account"
          icon={HiLibrary}
          title={bankDialog === "edit" ? (bankAccount ? "Update bank details" : "Add bank details") : (bankAccount?.bank_name || "Bank details")}
          subtitle={bankDialog === "view" && bankAccount ? bankAccount.account_holder_name : "Your salary is paid into this account"}
          badge={bankAccount && <DetailPill tone={bankAccount.is_verified ? "solid" : "soft"}>{bankStatus}</DetailPill>}
          onClose={() => { if (!bankSaving) setBankDialog(null); }}
          footer={bankDialog === "view" ? (
            <>
              {bankAccount && !bankAccount.is_verified && <DetailFooterNote>HR still needs to verify this account.</DetailFooterNote>}
              <button type="button" onClick={() => setBankDialog(null)} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all">Close</button>
              <button type="button" onClick={openBankEditor} className="px-6 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2">
                <HiPencil className="w-3.5 h-3.5" /> {bankAccount ? "Update details" : "Add bank details"}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={bankSaving} onClick={() => setBankDialog(bankAccount ? "view" : null)} className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50">Cancel</button>
              <button type="submit" form="bank-details-form" disabled={bankSaving} className="px-6 py-2.5 bg-[#6D28D9] hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-60">
                {bankSaving ? "Saving…" : "Save bank details"}
              </button>
            </>
          )}
        >
          {bankDialog === "view" ? (
            bankAccount ? (
              <DetailSection title="Account" icon={HiLibrary}>
                <DetailGrid
                  cols={3}
                  items={[
                    ["Account holder", bankAccount.account_holder_name],
                    ["Bank", bankAccount.bank_name],
                    { label: "Account number", value: bankAccount.masked_account_number || "••••••••", mono: true },
                    { label: "IFSC code", value: bankAccount.ifsc_code, mono: true },
                    ["Branch", bankAccount.branch_name],
                    ["Verification", bankStatus],
                  ]}
                />
              </DetailSection>
            ) : (
              <DetailSection title="Account" icon={HiLibrary}>
                <p className="text-sm text-slate-500">You haven&apos;t added a bank account yet. Add one so your salary can be paid.</p>
              </DetailSection>
            )
          ) : (
            <form id="bank-details-form" onSubmit={handleBankSubmit}>
              <DetailSection title="Account details" icon={HiLibrary}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="bank-holder" className={labelCls}>Account holder name <span className="text-red-400">*</span></label>
                    <input id="bank-holder" type="text" required value={bankFormData.account_holder_name} onChange={(e) => setBankFormData({ ...bankFormData, account_holder_name: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="bank-name" className={labelCls}>Bank name <span className="text-red-400">*</span></label>
                    <input id="bank-name" type="text" required value={bankFormData.bank_name} onChange={(e) => setBankFormData({ ...bankFormData, bank_name: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="bank-number" className={labelCls}>Account number <span className="text-red-400">*</span></label>
                    <input id="bank-number" type="text" required value={bankFormData.account_number} onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value })} placeholder={bankAccount ? "Re-enter the full number" : ""} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="bank-ifsc" className={labelCls}>IFSC code <span className="text-red-400">*</span></label>
                    <input id="bank-ifsc" type="text" required value={bankFormData.ifsc_code} onChange={(e) => setBankFormData({ ...bankFormData, ifsc_code: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
                  </div>
                  <div>
                    <label htmlFor="bank-branch" className={labelCls}>Branch</label>
                    <input id="bank-branch" type="text" value={bankFormData.branch_name} onChange={(e) => setBankFormData({ ...bankFormData, branch_name: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-4">
                  {bankAccount ? "For security the full account number isn't shown, so enter it again. Saving sends the account back to HR for verification." : "By saving, you confirm these details are correct. HR may verify this account."}
                </p>
              </DetailSection>
            </form>
          )}
        </DetailDialog>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
