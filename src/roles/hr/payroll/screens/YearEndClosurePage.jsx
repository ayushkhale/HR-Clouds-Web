import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI, organizationAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiDocumentReport, HiLockClosed, HiUser, HiSearch } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { currentFY, fyOptions } from "../fyUtils";

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
const FY_OPTIONS = fyOptions();

export default function YearEndClosurePage() {
  const [fy, setFy] = useState(currentFY());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [employees, setEmployees] = useState([]);

  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [ackMissing, setAckMissing] = useState(false);
  const [finalizeReason, setFinalizeReason] = useState("");
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(null);

  const [empQuery, setEmpQuery] = useState("");
  const [empPanel, setEmpPanel] = useState(null); // { employee, summary }

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, empRes] = await Promise.all([
        payrollAPI.getStatutorySummary(fy).catch(() => ({ data: { months: [] } })),
        organizationAPI.getEmployees({ purpose: "emp_report" }).catch(() => ({ data: [] })),
      ]);
      setSummary(sumRes.data || sumRes);
      setEmployees(empRes.data?.records || empRes.data?.employees || empRes.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => { load(); }, [load]);

  const months = summary?.months || [];
  const totals = months.reduce((acc, m) => {
    ["pf", "esi", "pt", "tds"].forEach((k) => { acc[k] = (acc[k] || 0) + (parseFloat(m[`${k}_total`] ?? m[k]) || 0); });
    return acc;
  }, {});

  const runFinalize = async () => {
    setFinalizeBusy(true);
    setFinalizeResult(null);
    try {
      const res = await payrollAPI.finalizeOrgFY(fy, {
        acknowledge_missing_months: ackMissing,
        reason: ackMissing ? finalizeReason.trim() : undefined,
      });
      setFinalizeResult(res.data || res);
      showToast("Finalization batch completed");
      load();
    } catch (err) {
      showToast(err.message || "Finalization failed", "error");
    } finally {
      setFinalizeBusy(false);
    }
  };

  const openEmployee = async (emp) => {
    const id = emp.id || emp.user_id || emp._id;
    setEmpPanel({ employee: emp, summary: null });
    try {
      const res = await payrollAPI.getEmployeeTaxSummary(id, { financial_year: fy });
      setEmpPanel({ employee: emp, summary: res.data || res });
    } catch (err) {
      showToast(err.message || "Failed to load employee tax summary", "error");
    }
  };

  const filteredEmp = employees.filter((e) => (e.name || "").toLowerCase().includes(empQuery.toLowerCase())).slice(0, 8);

  return (
    <>
        <DashboardTopBar title="Year-End & Form 16" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <HiDocumentReport className="text-purple-600 w-7 h-7" /> Year-End Closure &amp; Form 16
              </h1>
              <p className="text-sm text-slate-500 mt-1">Statutory challan summary, FY finalization, and per-employee Form 16.</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={fy} onChange={(e) => setFy(e.target.value)} className="px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
                {FY_OPTIONS.map((y) => <option key={y} value={y}>FY {y}</option>)}
              </select>
              <button onClick={() => { setFinalizeOpen(true); setFinalizeResult(null); setAckMissing(false); setFinalizeReason(""); }} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiLockClosed className="w-5 h-5" /> Finalize FY
              </button>
            </div>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {["pf", "esi", "pt", "tds"].map((k) => (
                  <div key={k} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase">{k.toUpperCase()} — FY total</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{money(totals[k])}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-50 bg-slate-50/50">
                  <h2 className="font-bold text-slate-800">Monthly Statutory Challan Summary</h2>
                  <p className="text-[11px] text-slate-400">Approved / paid runs only</p>
                </div>
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                      <th className="px-5 py-3">Month</th>
                      <th className="px-5 py-3 text-right">Headcount</th>
                      <th className="px-5 py-3 text-right">PF</th>
                      <th className="px-5 py-3 text-right">ESI</th>
                      <th className="px-5 py-3 text-right">PT</th>
                      <th className="px-5 py-3 text-right">TDS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {months.map((m) => (
                      <tr key={m.period_month || m.month} className="hover:bg-slate-50/50">
                        <td className="px-5 py-2.5 font-medium text-slate-700">{monthLabel(m.period_month || m.month)}</td>
                        <td className="px-5 py-2.5 text-right text-slate-500">{m.headcount ?? m.employee_count ?? "—"}</td>
                        <td className="px-5 py-2.5 text-right">{money(m.pf_total ?? m.pf)}</td>
                        <td className="px-5 py-2.5 text-right">{money(m.esi_total ?? m.esi)}</td>
                        <td className="px-5 py-2.5 text-right">{money(m.pt_total ?? m.pt)}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-slate-800">{money(m.tds_total ?? m.tds)}</td>
                      </tr>
                    ))}
                    {months.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No approved payroll in FY {fy} yet.</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Per-employee lookup */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h2 className="font-bold text-slate-800 mb-3">Employee Tax &amp; Form 16</h2>
                <div className="relative max-w-sm">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} placeholder="Search employee…" className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-purple-400" />
                </div>
                {empQuery && (
                  <div className="mt-2 border border-slate-100 rounded-xl divide-y divide-slate-50">
                    {filteredEmp.map((e) => (
                      <button key={e.id || e.user_id || e._id} onClick={() => { openEmployee(e); setEmpQuery(""); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2">
                        <HiUser className="w-4 h-4 text-slate-400" /> {e.name}
                      </button>
                    ))}
                    {filteredEmp.length === 0 && <p className="px-4 py-2.5 text-sm text-slate-400">No match.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

      {/* Finalize modal */}
      {finalizeOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Finalize FY {fy}</h2>
              <button onClick={() => setFinalizeOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {!finalizeResult ? (
                <>
                  <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    This permanently freezes every employee&apos;s tax records and Form 16 for FY {fy}. Regime, previous-employer figures and declarations become read-only.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={ackMissing} onChange={(e) => setAckMissing(e.target.checked)} className="w-4 h-4 mt-0.5 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                    <span className="text-sm text-slate-700">Acknowledge missing payroll months and proceed anyway</span>
                  </label>
                  {ackMissing && (
                    <textarea value={finalizeReason} onChange={(e) => setFinalizeReason(e.target.value)} rows={2} placeholder="Business justification (required)" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none resize-none" />
                  )}
                </>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Finalized</span><span className="font-bold text-emerald-600">{finalizeResult.successful ?? finalizeResult.success_count ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Failed</span><span className="font-bold text-red-600">{finalizeResult.failed ?? finalizeResult.failure_count ?? 0}</span></div>
                  {(finalizeResult.errors || []).slice(0, 6).map((e, i) => (
                    <p key={i} className="text-[11px] text-red-500">{e.user_id || e.name}: {e.message || e.error}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setFinalizeOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition">{finalizeResult ? "Close" : "Cancel"}</button>
              {!finalizeResult && (
                <button disabled={finalizeBusy || (ackMissing && !finalizeReason.trim())} onClick={runFinalize} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 disabled:opacity-50">
                  {finalizeBusy ? "Finalizing…" : "Finalize Now"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {empPanel && (
        <EmployeeTaxPanel
          fy={fy}
          employee={empPanel.employee}
          summary={empPanel.summary}
          onClose={() => setEmpPanel(null)}
          onChanged={() => openEmployee(empPanel.employee)}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function EmployeeTaxPanel({ fy, employee, summary, onClose, onChanged, showToast }) {
  const userId = employee.id || employee.user_id || employee._id;
  const finalized = summary?.is_finalized || summary?.financial_year_finalized;
  const [prevEmp, setPrevEmp] = useState({
    previous_employer_gross: "", previous_employer_taxable: "", previous_employer_tds: "", previous_employer_pf: "", previous_employer_pt: "",
  });
  const [form16, setForm16] = useState(null);
  const [projection, setProjection] = useState(null);
  const [partA, setPartA] = useState({ ack_number: "", issued_on: "", reference_url: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pe = summary?.previous_employer || {};
    setPrevEmp({
      previous_employer_gross: pe.gross ?? pe.previous_employer_gross ?? "",
      previous_employer_taxable: pe.taxable ?? pe.previous_employer_taxable ?? "",
      previous_employer_tds: pe.tds ?? pe.previous_employer_tds ?? "",
      previous_employer_pf: pe.pf ?? pe.previous_employer_pf ?? "",
      previous_employer_pt: pe.pt ?? pe.previous_employer_pt ?? "",
    });
  }, [summary]);

  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); showToast(ok); onChanged(); }
    catch (err) { showToast(err.message || "Action failed", "error"); }
    finally { setBusy(false); }
  };

  const overrideRegime = (code) => act(
    () => payrollAPI.overrideEmployeeRegime(userId, { regime_code: code }, { financial_year: fy }),
    `Regime set to ${code.toUpperCase()}`
  );

  const savePrevEmp = () => act(
    () => payrollAPI.setPreviousEmployer(userId, Object.fromEntries(Object.entries(prevEmp).map(([k, v]) => [k, parseFloat(v) || 0])), { financial_year: fy }),
    "Previous-employer figures saved"
  );

  const finalizeOne = () => {
    if (!window.confirm(`Finalize FY ${fy} for ${employee.name}? This is permanent.`)) return;
    act(() => payrollAPI.finalizeEmployeeFY(userId, fy), "Employee FY finalized");
  };

  const loadForm16 = async () => {
    try {
      const res = await payrollAPI.getEmployeeForm16(userId, fy);
      setForm16(res.data || res);
    } catch (err) {
      showToast(err.message || "Form 16 not available", "error");
    }
  };

  const loadProjection = async () => {
    try {
      const res = await payrollAPI.getEmployeeTaxProjection(userId, { financial_year: fy });
      setProjection(res.data || res);
    } catch (err) {
      showToast(err.message || "Projection not available", "error");
    }
  };

  const savePartA = () => {
    if (!partA.ack_number.trim()) return showToast("Acknowledgement number required", "error");
    act(() => payrollAPI.setForm16PartA(userId, fy, {
      ack_number: partA.ack_number.trim(),
      issued_on: partA.issued_on || undefined,
      reference_url: partA.reference_url || undefined,
    }), "Form 16 Part-A reference saved");
  };

  const rawRegime = summary?.regime_code ?? summary?.regime;
  const regime =
    typeof rawRegime === "object" && rawRegime !== null
      ? rawRegime.code || rawRegime.regime_code || rawRegime.name || ""
      : rawRegime || "";
  const ytd = summary?.ytd || summary?.actuals || {};

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{employee.name}</h2>
            <p className="text-xs text-slate-500">FY {fy} {finalized && <span className="text-purple-600 font-bold">· FINALIZED</span>}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
        </div>

        {!summary ? <div className="p-10"><Skeleton type="dashboard" /></div> : (
          <div className="p-6 space-y-6 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["TDS YTD", ytd.tds ?? ytd.income_tax],
                ["PF YTD", ytd.pf],
                ["ESI YTD", ytd.esi],
                ["PT YTD", ytd.pt ?? ytd.professional_tax],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{k}</p>
                  <p className="text-sm font-black text-slate-800 mt-0.5">{money(v)}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Tax Regime {regime && <span className="ml-1 text-slate-800">(current: {String(regime).toUpperCase()})</span>}</p>
              <div className="flex gap-2">
                {["old", "new"].map((c) => (
                  <button key={c} disabled={busy || finalized} onClick={() => overrideRegime(c)} className={`px-4 py-2 text-sm font-bold rounded-xl transition disabled:opacity-40 ${regime === c ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {c === "old" ? "Old Regime" : "New Regime"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Previous Employer (Form 12B)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  ["previous_employer_gross", "Gross ₹"],
                  ["previous_employer_taxable", "Taxable ₹"],
                  ["previous_employer_tds", "TDS ₹"],
                  ["previous_employer_pf", "PF ₹"],
                  ["previous_employer_pt", "PT ₹"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{label}</label>
                    <input type="number" disabled={finalized} value={prevEmp[k]} onChange={(e) => setPrevEmp({ ...prevEmp, [k]: e.target.value })} className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400 disabled:opacity-40" />
                  </div>
                ))}
              </div>
              <button disabled={busy || finalized} onClick={savePrevEmp} className="mt-3 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition disabled:opacity-40">Save Figures</button>
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Form 16 Part-A Reference (TRACES)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <input value={partA.ack_number} onChange={(e) => setPartA({ ...partA, ack_number: e.target.value })} placeholder="ACK number" className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                <input type="date" value={partA.issued_on} onChange={(e) => setPartA({ ...partA, issued_on: e.target.value })} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                <input value={partA.reference_url} onChange={(e) => setPartA({ ...partA, reference_url: e.target.value })} placeholder="reference URL" className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
              </div>
              <button disabled={busy} onClick={savePartA} className="mt-3 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition disabled:opacity-40">Save Part-A Reference</button>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 flex-wrap">
              <button onClick={loadProjection} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition">View Projection Trace</button>
              <button onClick={loadForm16} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition">View Form 16 Part-B</button>
              <button disabled={busy || finalized} onClick={finalizeOne} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200 disabled:opacity-50 flex items-center gap-1.5">
                <HiLockClosed className="w-4 h-4" /> Finalize This Employee
              </button>
            </div>

            {projection && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tax Projection Trace</p>
                <pre className="text-[11px] text-slate-600 whitespace-pre-wrap overflow-x-auto max-h-60">{JSON.stringify(projection, null, 2)}</pre>
              </div>
            )}

            {form16 && (
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                  Form 16 Part-B {form16.is_provisional && <span className="text-amber-600">· PROVISIONAL</span>}
                </p>
                <pre className="text-[11px] text-slate-600 whitespace-pre-wrap overflow-x-auto max-h-60">{JSON.stringify(form16, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
