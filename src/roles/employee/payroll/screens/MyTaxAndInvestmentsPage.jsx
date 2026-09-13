import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { listFrom, unwrap } from "../../../../shared/attendance/normalize";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiDocumentReport, HiPlus, HiTrash,
  HiCalculator, HiCalendar, HiScale, HiPaperClip
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div className={`fixed top-5 right-5 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-2 ${isError ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {isError ? <HiExclamationCircle className="w-5 h-5 text-red-500 shrink-0" /> : <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />}
      <span>{toast.message}</span>
      <button onClick={onClose}><HiX className="w-4 h-4 opacity-50 hover:opacity-100" /></button>
    </div>
  );
}

const money = (v) => `₹${parseFloat(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthLabel = (pm) => {
  if (!pm) return "-";
  const [y, m] = String(pm).split("-");
  return `${new Date(0, parseInt(m) - 1).toLocaleString("default", { month: "short" })} ${y}`;
};
function currentFY(d = new Date()) {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
const SECTIONS = ["80C", "80D", "80CCD(1B)", "80E", "80G", "80TTA", "24B (Home Loan Interest)", "HRA", "LTA", "Other"];

const STATUS_PILL = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  under_review: "bg-amber-100 text-amber-700",
  verified: "bg-emerald-100 text-emerald-700",
  partially_verified: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
};

const TABS = [
  { key: "summary", label: "Summary", icon: HiDocumentReport },
  { key: "declarations", label: "Declarations", icon: HiPaperClip },
  { key: "regime", label: "Regime", icon: HiScale },
  { key: "projection", label: "Projection", icon: HiCalculator },
  { key: "monthly", label: "Monthly TDS", icon: HiCalendar },
  { key: "form16", label: "Form 16", icon: HiDocumentReport },
];

export default function MyTaxAndInvestmentsPage() {
  const [tab, setTab] = useState("summary");
  const [fy] = useState(currentFY());
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
        <DashboardTopBar title="Tax & Investments" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Tax &amp; Investments
            </h1>
            <p className="text-sm text-slate-500 mt-1">FY {fy} — your regime, declarations, TDS projection and Form 16.</p>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {tab === "summary" && <SummaryTab fy={fy} showToast={showToast} />}
          {tab === "declarations" && <DeclarationsTab fy={fy} showToast={showToast} />}
          {tab === "regime" && <RegimeTab fy={fy} showToast={showToast} />}
          {tab === "projection" && <TraceTab fy={fy} showToast={showToast} fetcher={payrollAPI.getMyTaxProjection} title="Tax Projection Trace" />}
          {tab === "monthly" && <MonthlyTab fy={fy} showToast={showToast} />}
          {tab === "form16" && <Form16Tab fy={fy} showToast={showToast} />}
        </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function SummaryTab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const res = await payrollAPI.getMyTaxSummary({ financial_year: fy }); setData(res.data || res); }
      catch (err) { showToast(err.message || "Failed to load summary", "error"); }
      finally { setLoading(false); }
    })();
  }, [fy, showToast]);

  if (loading) return <Skeleton type="dashboard" />;
  if (!data) return <Empty text="No tax summary available yet." />;

  const ytd = data.ytd || data.actuals || {};
  const regime = data.regime_code || data.regime;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat k="Regime" v={regime ? String(regime).toUpperCase() : "—"} />
        <Stat k="Projected Annual Tax" v={money(data.projected_annual_tax ?? data.projected_liability)} />
        <Stat k="TDS Deducted (YTD)" v={money(ytd.tds ?? ytd.income_tax)} />
        <Stat k="Remaining TDS" v={money(data.remaining_tds ?? data.balance_tds)} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat k="PF (YTD)" v={money(ytd.pf)} />
        <Stat k="ESI (YTD)" v={money(ytd.esi)} />
        <Stat k="PT (YTD)" v={money(ytd.pt ?? ytd.professional_tax)} />
        <Stat k="Declaration" v={(data.declaration_status || "none").replace(/_/g, " ")} />
      </div>
      {data.previous_employer && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-3">Previous Employer (Form 12B)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <KV k="Gross" v={money(data.previous_employer.gross ?? data.previous_employer.previous_employer_gross)} />
            <KV k="TDS" v={money(data.previous_employer.tds ?? data.previous_employer.previous_employer_tds)} />
            <KV k="PF" v={money(data.previous_employer.pf ?? data.previous_employer.previous_employer_pf)} />
          </div>
        </div>
      )}
    </div>
  );
}

function DeclarationsTab({ fy, showToast }) {
  const [decl, setDecl] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getMyDeclaration({ financial_year: fy });
      const d = res.data || res || {};
      setDecl(d);
      setItems((d.items || []).map((it) => ({
        item_id: it.item_id || it.id,
        section: it.section || "80C",
        sub_category: it.sub_category || "",
        declared_amount: it.declared_amount ?? "",
        verified_amount: it.verified_amount,
        proof_status: it.proof_status,
        proof_reference: it.proof_reference || "",
        locked: it.sub_category === "EPF_AUTO",
      })));
    } catch (err) {
      showToast(err.message || "Failed to load declaration", "error");
    } finally {
      setLoading(false);
    }
  }, [fy, showToast]);

  useEffect(() => { load(); }, [load]);

  const status = decl?.status || "draft";
  const isDraft = status === "draft";
  const canProofs = status === "submitted" || status === "under_review";

  const setRow = (i, patch) => setItems((arr) => arr.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const addRow = () => setItems((arr) => [...arr, { section: "80C", sub_category: "", declared_amount: "", proof_reference: "" }]);
  const removeRow = (i) => setItems((arr) => arr.filter((_, x) => x !== i));

  const declaredTotal = items.reduce((s, i) => s + (parseFloat(i.declared_amount) || 0), 0);
  const verifiedTotal = items.reduce((s, i) => s + (parseFloat(i.verified_amount) || 0), 0);

  const saveDraft = async () => {
    setBusy(true);
    try {
      await payrollAPI.upsertMyDeclaration({
        items: items.filter((r) => !r.locked).map((r) => ({
          item_id: r.item_id || undefined,
          section: r.section,
          sub_category: r.sub_category || undefined,
          declared_amount: parseFloat(r.declared_amount) || 0,
          proof_reference: r.proof_reference || undefined,
        })),
      }, { financial_year: fy });
      showToast("Declaration saved");
      load();
    } catch (err) {
      showToast(err.message || "Save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!window.confirm("Submit to HR? You will no longer be able to edit the declared amounts.")) return;
    setBusy(true);
    try {
      await payrollAPI.submitMyDeclaration({ financial_year: fy });
      showToast("Declaration submitted to HR");
      load();
    } catch (err) {
      showToast(err.message || "Submit failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveProofs = async () => {
    setBusy(true);
    try {
      await payrollAPI.recordMyDeclarationProofs({
        items: items.filter((r) => r.item_id && r.proof_reference).map((r) => ({ item_id: r.item_id, proof_reference: r.proof_reference })),
      }, { financial_year: fy });
      showToast("Proof references saved");
      load();
    } catch (err) {
      showToast(err.message || "Failed to save proofs", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton type="table" rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[status] || "bg-slate-100 text-slate-600"}`}>{status.replace(/_/g, " ")}</span>
          {decl?.proof_deadline && <span className="text-slate-500">Proof deadline: {new Date(decl.proof_deadline).toLocaleDateString()}</span>}
        </div>
        {isDraft && (
          <button onClick={addRow} className="px-3 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition flex items-center gap-1.5"><HiPlus className="w-4 h-4" /> Add Item</button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
              <th className="px-5 py-3">Section</th>
              <th className="px-5 py-3">Detail</th>
              <th className="px-5 py-3 text-right">Declared ₹</th>
              <th className="px-5 py-3 text-right">Verified ₹</th>
              <th className="px-5 py-3">Proof Reference</th>
              {isDraft && <th className="px-5 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((r, i) => (
              <tr key={r.item_id || i}>
                <td className="px-5 py-2.5">
                  {isDraft && !r.locked ? (
                    <select value={r.section} onChange={(e) => setRow(i, { section: e.target.value })} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400">
                      {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className="font-semibold text-slate-800">{r.section}</span>}
                </td>
                <td className="px-5 py-2.5">
                  {isDraft && !r.locked ? (
                    <input value={r.sub_category} onChange={(e) => setRow(i, { sub_category: e.target.value })} placeholder="e.g. LIC premium" className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400 w-40" />
                  ) : <span className="text-slate-500">{r.sub_category || "—"}</span>}
                </td>
                <td className="px-5 py-2.5 text-right">
                  {isDraft && !r.locked ? (
                    <input type="number" min="0" value={r.declared_amount} onChange={(e) => setRow(i, { declared_amount: e.target.value })} className="w-28 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right outline-none focus:border-purple-400" />
                  ) : money(r.declared_amount)}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-600">{r.verified_amount != null ? money(r.verified_amount) : "—"}</td>
                <td className="px-5 py-2.5">
                  {(isDraft || canProofs) && !r.locked ? (
                    <input value={r.proof_reference} onChange={(e) => setRow(i, { proof_reference: e.target.value })} placeholder="link or ref #" className="w-44 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                  ) : <span className="text-slate-500 truncate block max-w-[11rem]">{r.proof_reference || "—"}</span>}
                </td>
                {isDraft && (
                  <td className="px-5 py-2.5">
                    {!r.locked && <button onClick={() => removeRow(i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><HiTrash className="w-4 h-4" /></button>}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={isDraft ? 6 : 5} className="px-5 py-8 text-center text-slate-500">No items declared. {isDraft && "Click “Add Item” to start."}</td></tr>}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-between text-sm">
          <span className="text-slate-500">Declared <span className="font-bold text-slate-800">{money(declaredTotal)}</span></span>
          <span className="text-slate-500">Verified <span className="font-bold text-emerald-600">{money(verifiedTotal)}</span></span>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        {isDraft && (
          <>
            <button disabled={busy} onClick={saveDraft} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">Save Draft</button>
            <button disabled={busy || items.length === 0} onClick={submit} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">Submit to HR</button>
          </>
        )}
        {canProofs && (
          <button disabled={busy} onClick={saveProofs} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-1.5">
            <HiPaperClip className="w-4 h-4" /> Save Proof References
          </button>
        )}
      </div>
    </div>
  );
}

function RegimeTab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await payrollAPI.getMyTaxSummary({ financial_year: fy }); setData(res.data || res); }
    catch (err) { showToast(err.message || "Failed to load", "error"); }
    finally { setLoading(false); }
  }, [fy, showToast]);
  useEffect(() => { load(); }, [load]);

  const switchTo = async (code) => {
    setBusy(true);
    try {
      await payrollAPI.switchMyRegime({ regime_code: code }, { financial_year: fy });
      showToast(`Switched to ${code.toUpperCase()} regime`);
      load();
    } catch (err) {
      showToast(err.message || "Regime switch not allowed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton type="dashboard" />;
  const regime = data?.regime_code || data?.regime;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {[
        { code: "old", title: "Old Regime", blurb: "Lower slabs but you can claim HRA, 80C, 80D and other Chapter VI-A deductions." },
        { code: "new", title: "New Regime", blurb: "Higher standard deduction, wider slabs, but most exemptions are not available." },
      ].map((r) => (
        <div key={r.code} className={`bg-white rounded-2xl border-2 shadow-sm p-6 ${regime === r.code ? "border-purple-500" : "border-slate-100"}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg text-slate-800">{r.title}</h3>
            {regime === r.code && <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded uppercase">Current</span>}
          </div>
          <p className="text-sm text-slate-500 mb-4">{r.blurb}</p>
          <button disabled={busy || regime === r.code} onClick={() => switchTo(r.code)} className="w-full px-4 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-40">
            {regime === r.code ? "Selected" : `Switch to ${r.title}`}
          </button>
        </div>
      ))}
    </div>
  );
}

function TraceTab({ fy, showToast, fetcher, title }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const res = await fetcher({ financial_year: fy }); setData(res.data || res); }
      catch (err) { showToast(err.message || "Failed to load projection", "error"); }
      finally { setLoading(false); }
    })();
  }, [fy, showToast, fetcher]);

  if (loading) return <Skeleton type="dashboard" />;
  if (!data) return <Empty text="No projection available yet." />;

  const steps = data.steps || data.trace || data.breakdown || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat k="Projected Gross" v={money(data.projected_gross ?? data.annual_gross)} />
        <Stat k="Taxable Income" v={money(data.taxable_income)} />
        <Stat k="Annual Tax" v={money(data.total_tax ?? data.annual_tax)} />
        <Stat k="This Month TDS" v={money(data.monthly_tds ?? data.tds_this_month)} />
        <Stat k="Std Deduction" v={money(data.standard_deduction)} />
        <Stat k="Total Exemptions" v={money(data.total_exemptions ?? data.total_deductions)} />
      </div>
      {steps.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50 font-bold text-slate-800 text-sm">{title}</div>
          <table className="w-full text-left border-collapse text-sm">
            <tbody className="divide-y divide-slate-50">
              {steps.map((s, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5 text-slate-600">{s.label || s.name || s.step}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-slate-800">{typeof (s.value ?? s.amount) === "number" ? money(s.value ?? s.amount) : (s.value ?? s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <summary className="text-sm font-bold text-slate-700 cursor-pointer">Raw calculation trace</summary>
          <pre className="text-[11px] text-slate-600 whitespace-pre-wrap overflow-x-auto mt-3 max-h-96">{JSON.stringify(data, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

// `/payroll/me/tax/monthly` has no documented response shape. Accept an array
// under a known key, or a map keyed by month ({ "2026-04": {...} }); anything
// else yields no rows instead of crashing the tab.
function monthlyTaxRows(res) {
  const list = listFrom(res, ["months", "monthly", "breakdown", "records"]);
  if (list.length) return list;
  const payload = unwrap(res);
  const map = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload.months || payload.monthly || payload) : null;
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.entries(map)
    .filter(([key, value]) => /^\d{4}-\d{2}/.test(key) && value && typeof value === "object")
    .map(([key, value]) => ({ period_month: key, ...value }));
}

function MonthlyTab({ fy, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const res = await payrollAPI.getMyMonthlyTax({ financial_year: fy }); setRows(monthlyTaxRows(res)); }
      catch (err) { showToast(err.message || "Failed to load", "error"); }
      finally { setLoading(false); }
    })();
  }, [fy, showToast]);

  if (loading) return <Skeleton type="table" rows={6} />;
  if (rows.length === 0) return <Empty text="No monthly tax data yet." />;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
            <th className="px-5 py-3">Month</th>
            <th className="px-5 py-3 text-right">TDS</th>
            <th className="px-5 py-3 text-right">PF</th>
            <th className="px-5 py-3 text-right">ESI</th>
            <th className="px-5 py-3 text-right">PT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((m) => (
            <tr key={m.period_month || m.month} className="hover:bg-slate-50/50">
              <td className="px-5 py-2.5 font-medium text-slate-700">{monthLabel(m.period_month || m.month)}</td>
              <td className="px-5 py-2.5 text-right font-semibold text-slate-800">{money(m.tds ?? m.income_tax)}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{money(m.pf)}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{money(m.esi)}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{money(m.pt ?? m.professional_tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Form16Tab({ fy, showToast }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | unavailable

  const fetchIt = async () => {
    setState("loading");
    try {
      const res = await payrollAPI.getMyForm16(fy);
      setData(res.data || res);
      setState("ready");
    } catch (err) {
      setState("unavailable");
      showToast(err.message || "Form 16 not finalized yet", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="font-bold text-slate-800">Form 16 — Part B (FY {fy})</h3>
        <p className="text-sm text-slate-500 mt-1">Available only after HR finalizes the financial year. A provisional Form 16 is never issued.</p>
        <button onClick={fetchIt} disabled={state === "loading"} className="mt-4 px-4 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
          {state === "loading" ? "Checking…" : "Fetch My Form 16"}
        </button>
        {state === "unavailable" && <p className="mt-3 text-sm text-red-600">Not finalized yet — check back after year-end closure.</p>}
      </div>
      {state === "ready" && data && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <pre className="text-[11px] text-slate-600 whitespace-pre-wrap overflow-x-auto max-h-[28rem]">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

const Stat = ({ k, v }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
    <p className="text-[11px] font-bold text-slate-400 uppercase">{k}</p>
    <p className="text-lg font-black text-slate-800 mt-1 capitalize">{v}</p>
  </div>
);
const KV = ({ k, v }) => (
  <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800">{v}</span></div>
);
const Empty = ({ text }) => (
  <div className="py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed text-slate-500">{text}</div>
);
