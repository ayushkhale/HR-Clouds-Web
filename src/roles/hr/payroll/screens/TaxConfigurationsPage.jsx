import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiDocumentText, HiCurrencyRupee,
  HiScale, HiPlus, HiTrash, HiSparkles, HiPencil
} from "react-icons/hi";
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
const FY_OPTIONS = fyOptions();

const TABS = [
  { key: "config", label: "PF / ESI / PT / TDS", icon: HiCurrencyRupee },
  { key: "pt", label: "Professional Tax Slabs", icon: HiScale },
  { key: "regimes", label: "Income-Tax Regimes", icon: HiDocumentText },
];

// ── Field groups for the statutory config form ──
const CONFIG_GROUPS = [
  {
    title: "Provident Fund (PF)",
    toggle: "pf_enabled",
    fields: [
      { key: "pf_employee_rate", label: "Employee Rate %", type: "pct" },
      { key: "pf_employer_rate", label: "Employer Rate %", type: "pct" },
      { key: "pf_wage_ceiling", label: "Wage Ceiling ₹", type: "money" },
      { key: "pf_restrict_to_ceiling", label: "Restrict to ceiling", type: "bool" },
      { key: "pf_lop_reduces_ceiling", label: "LOP reduces ceiling", type: "bool" },
      { key: "pf_include_overtime", label: "Include overtime in wage", type: "bool" },
      { key: "pf_admin_charge_rate", label: "Admin Charge %", type: "pct" },
      { key: "pf_admin_charge_min", label: "Admin Charge Min ₹", type: "money" },
    ],
  },
  {
    title: "Pension (EPS) & EDLI",
    toggle: "eps_enabled",
    fields: [
      { key: "eps_rate", label: "EPS Rate %", type: "pct" },
      { key: "eps_wage_ceiling", label: "EPS Wage Ceiling ₹", type: "money" },
      { key: "edli_enabled", label: "EDLI enabled", type: "bool" },
      { key: "edli_rate", label: "EDLI Rate %", type: "pct" },
      { key: "edli_wage_ceiling", label: "EDLI Wage Ceiling ₹", type: "money" },
    ],
  },
  {
    title: "Employee State Insurance (ESI)",
    toggle: "esi_enabled",
    fields: [
      { key: "esi_employee_rate", label: "Employee Rate %", type: "pct" },
      { key: "esi_employer_rate", label: "Employer Rate %", type: "pct" },
      { key: "esi_wage_threshold", label: "Gross Threshold ₹", type: "money" },
      { key: "esi_include_overtime", label: "Include overtime", type: "bool" },
    ],
  },
  {
    title: "Professional Tax (PT)",
    toggle: "pt_enabled",
    fields: [],
  },
  {
    title: "Income Tax / TDS",
    toggle: "income_tax_enabled",
    fields: [
      { key: "tds_no_pan_rate", label: "No-PAN TDS Rate %", type: "pct" },
      { key: "tds_no_pan_enforced", label: "Enforce No-PAN rate", type: "bool" },
      { key: "cess_rate", label: "Health & Education Cess %", type: "pct" },
    ],
  },
];

export default function TaxConfigurationsPage() {
  const [tab, setTab] = useState("config");
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
        <DashboardTopBar title="Statutory & Tax Setup" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Statutory &amp; Tax Setup
            </h1>
            <p className="text-sm text-slate-500 mt-1">Organisation-wide PF, ESI, Professional Tax and Income-Tax rules that drive every payroll run.</p>
          </div>

          <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${tab === t.key ? "border-purple-600 text-purple-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {tab === "config" && <ConfigTab showToast={showToast} />}
          {tab === "pt" && <PtSlabsTab showToast={showToast} />}
          {tab === "regimes" && <RegimesTab showToast={showToast} />}
        </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ───────────────────────── Config tab ─────────────────────────
function ConfigTab({ showToast }) {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [affected, setAffected] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getStatutoryConfig();
      const cfg = res.data?.config || res.data || {};
      setConfig(cfg);
      setDraft(cfg);
    } catch (err) {
      showToast(err.message || "Failed to load statutory config", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = config && JSON.stringify(config) !== JSON.stringify(draft);

  const save = async () => {
    setSaving(true);
    try {
      // send only changed keys
      const patch = {};
      Object.keys(draft).forEach((k) => { if (draft[k] !== config[k]) patch[k] = draft[k]; });
      const res = await payrollAPI.updateStatutoryConfig(patch);
      const cfg = res.data?.config || res.data || draft;
      setConfig(cfg);
      setDraft(cfg);
      setAffected(res.data?.affected_runs || []);
      showToast("Statutory config saved");
    } catch (err) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton type="dashboard" />;

  return (
    <div className="space-y-6">
      {affected.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <span className="font-bold">{affected.length} live run(s)</span> use an older snapshot — cancel and recreate them to adopt the new config.
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {CONFIG_GROUPS.map((g) => {
          const on = !!draft[g.toggle];
          return (
            <div key={g.toggle} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 bg-slate-50/50">
                <h2 className="font-bold text-slate-800">{g.title}</h2>
                <button
                  type="button"
                  onClick={() => set(g.toggle, !on)}
                  className={`relative w-11 h-6 rounded-full transition ${on ? "bg-purple-600" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition ${on ? "translate-x-5" : ""}`} />
                </button>
              </div>
              {g.fields.length > 0 && (
                <div className={`p-5 grid grid-cols-2 gap-4 ${on ? "" : "opacity-40 pointer-events-none"}`}>
                  {g.fields.map((f) => (
                    <div key={f.key} className={f.type === "bool" ? "col-span-2" : ""}>
                      {f.type === "bool" ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!draft[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                          <span className="text-sm font-medium text-slate-700">{f.label}</span>
                        </label>
                      ) : (
                        <>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">{f.label}</label>
                          <input
                            type="number" step={f.type === "pct" ? "0.01" : "1"} min="0"
                            value={draft[f.key] ?? ""}
                            onChange={(e) => set(f.key, e.target.value === "" ? "" : parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none"
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {g.toggle === "pt_enabled" && (
                <div className="p-5 text-xs text-slate-500">State-wise slabs are managed in the <span className="font-bold text-purple-600">Professional Tax Slabs</span> tab.</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-3 sticky bottom-4">
        <button disabled={!dirty} onClick={() => setDraft(config)} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40">Reset</button>
        <button disabled={!dirty || saving} onClick={save} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── PT slabs tab ─────────────────────────
const emptyPtRow = () => ({ from_amount: "", to_amount: "", monthly_amount: "", gender: "any" });

// Shared half-open [from, to) slab-set rule used by both PT slabs (per gender) and tax-regime
// slabs (per age_band), per phase4_implementation_plan.md §7.2: sorted ascending by from_amount,
// the lowest band must start at exactly 0, contiguous with next.from === prev.to exactly (no gap/
// overlap), and exactly one band — the highest — is open-ended (to_amount = null).
function validateSlabRanges(rows, groupField, groupLabel) {
  const byGroup = rows.reduce((acc, r) => {
    const key = r[groupField] || "any";
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});
  for (const [key, group] of Object.entries(byGroup)) {
    const tag = `${groupLabel} "${key}"`;
    const sorted = [...group].sort((a, b) => (parseFloat(a.from_amount) || 0) - (parseFloat(b.from_amount) || 0));
    const firstFrom = parseFloat(sorted[0].from_amount) || 0;
    if (firstFrom !== 0) {
      return `❌ ${tag}: The first (lowest) band must start at exactly ₹0, but yours starts at ${money(firstFrom)}.\n\n💡 Fix: Edit the first band's "From" field to 0. If you want PT only for salaries above ${money(firstFrom)}, add a new band first: From ₹0, To ₹${firstFrom}, PT ₹0.`;
    }
    const openEnded = sorted.filter((r) => r.to_amount === "" || r.to_amount === null || r.to_amount === undefined);
    if (openEnded.length === 0) {
      const top = money(parseFloat(sorted[sorted.length - 1].from_amount) || 0);
      return `❌ ${tag}: Every band has a fixed "To" amount, but there's no top band covering high earners.\n\n💡 Fix: The highest band (${top} and above) must have "To" left blank. Edit Band ${sorted.length}'s "To" field and delete the value — leave it completely empty. This tells the system "everyone earning ${top} or more gets this PT amount."`;
    }
    if (openEnded.length > 1) {
      return `❌ ${tag}: Multiple bands are left open-ended (${openEnded.length} of them), but only the highest one can be.\n\n💡 Fix: Give every band a fixed "To" value except the last (highest) band. Only the top band should have a blank "To".`;
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const prevTo = sorted[i].to_amount === "" || sorted[i].to_amount === null || sorted[i].to_amount === undefined ? null : parseFloat(sorted[i].to_amount);
      const curFrom = parseFloat(sorted[i + 1].from_amount) || 0;
      if (prevTo === null) {
        return `❌ ${tag}: Band ${i + 1} has no upper limit (open-ended), but it's followed by Band ${i + 2}. This creates a gap in coverage.\n\n💡 Fix: Only the highest/last band can be open-ended. Band ${i + 1} should have a fixed "To" value.`;
      }
      if (prevTo !== curFrom) {
        return `❌ ${tag}: Bands ${i + 1} and ${i + 2} don't connect properly.\n\n Band ${i + 1} ends at ${money(prevTo)}\n Band ${i + 2} starts at ${money(curFrom)}\n\n💡 Fix: The upper limit of one band must exactly match the lower limit of the next. Either change Band ${i + 1}'s "To" to ${money(curFrom)} OR change Band ${i + 2}'s "From" to ${money(prevTo)}.`;
      }
    }
  }
  return null;
}
const validatePtSlabRows = (rows) => validateSlabRanges(rows, "gender", "Gender");

function PtSlabsTab({ showToast }) {
  const [slabs, setSlabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorState, setEditorState] = useState(null); // { stateCode, stateName, rows }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getPtSlabs();
      setSlabs(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load PT slabs", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const byState = slabs.reduce((acc, s) => {
    const k = s.state_code || "—";
    (acc[k] = acc[k] || { state_name: s.state_name, code: k, rows: [] }).rows.push(s);
    return acc;
  }, {});

  const openEditor = (group) => setEditorState({
    stateCode: group?.code || "",
    stateName: group?.state_name || "",
    rows: group ? group.rows.map((r) => ({ from_amount: r.from_amount, to_amount: r.to_amount ?? "", monthly_amount: r.monthly_amount, gender: r.gender || "any" })) : [emptyPtRow()],
  });

  const saveEditor = async () => {
    if (!editorState.stateCode.trim()) return showToast("State code required", "error");
    const validationError = validatePtSlabRows(editorState.rows);
    if (validationError) return showToast(validationError, "error");
    try {
      await payrollAPI.replacePtSlabs(editorState.stateCode.trim().toUpperCase(), {
        state_name: editorState.stateName.trim(),
        slabs: editorState.rows.map((r) => ({
          from_amount: parseFloat(r.from_amount) || 0,
          to_amount: r.to_amount === "" ? null : parseFloat(r.to_amount),
          monthly_amount: parseFloat(r.monthly_amount) || 0,
          gender: r.gender,
        })),
      });
      showToast("PT slabs saved");
      setEditorState(null);
      load();
    } catch (err) {
      showToast(err.message || "Failed to save slabs", "error");
    }
  };

  const deactivate = async (code) => {
    if (!window.confirm(`Deactivate all PT slabs for ${code}?`)) return;
    try {
      await payrollAPI.deactivatePtSlabs(code);
      showToast("Slabs deactivated");
      load();
    } catch (err) {
      showToast(err.message || "Failed to deactivate", "error");
    }
  };

  if (loading) return <Skeleton type="table" rows={5} />;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => openEditor(null)} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
          <HiPlus className="w-5 h-5" /> Add State Slabs
        </button>
      </div>
      <div className="space-y-4">
        {Object.values(byState).map((g) => (
          <div key={g.code} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
              <h3 className="font-bold text-slate-800">{g.state_name || g.code} <span className="text-xs font-mono text-slate-400">{g.code}</span></h3>
              <div className="flex gap-2">
                <button onClick={() => openEditor(g)} className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition" title="Edit"><HiPencil className="w-4 h-4" /></button>
                <button onClick={() => deactivate(g.code)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition" title="Deactivate"><HiTrash className="w-4 h-4" /></button>
              </div>
            </div>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-[10px] uppercase font-bold text-slate-400">
                  <th className="px-5 py-2.5">From</th><th className="px-5 py-2.5">To</th><th className="px-5 py-2.5">Monthly PT</th><th className="px-5 py-2.5">Gender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {g.rows.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="px-5 py-2">{money(r.from_amount)}</td>
                    <td className="px-5 py-2">{r.to_amount ? money(r.to_amount) : "and above"}</td>
                    <td className="px-5 py-2 font-semibold">{money(r.monthly_amount)}</td>
                    <td className="px-5 py-2 capitalize text-slate-500">{r.gender || "any"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {Object.keys(byState).length === 0 && (
          <div className="py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed text-slate-500">No PT slabs configured yet.</div>
        )}
      </div>

      {editorState && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">State PT Slabs</h2>
              <button onClick={() => setEditorState(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">State Code <span className="text-red-500">*</span></label>
                  <input value={editorState.stateCode} onChange={(e) => setEditorState({ ...editorState, stateCode: e.target.value })} placeholder="KA" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm uppercase focus:bg-white focus:border-purple-400 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">State Name</label>
                  <input value={editorState.stateName} onChange={(e) => setEditorState({ ...editorState, stateName: e.target.value })} placeholder="Karnataka" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" />
                </div>
              </div>
              <div className="space-y-3">
                {editorState.rows.map((r, i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Band {i + 1}</span>
                      <button onClick={() => setEditorState({ ...editorState, rows: editorState.rows.filter((_, x) => x !== i) })} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition" title="Remove band"><HiTrash className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Field label="From ₹">
                        <input type="number" value={r.from_amount} onChange={(e) => { const rows = [...editorState.rows]; rows[i] = { ...r, from_amount: e.target.value }; setEditorState({ ...editorState, rows }); }} placeholder="0" className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                      </Field>
                      <Field label="To ₹ (blank = ∞)">
                        <input type="number" value={r.to_amount} onChange={(e) => { const rows = [...editorState.rows]; rows[i] = { ...r, to_amount: e.target.value }; setEditorState({ ...editorState, rows }); }} placeholder={i === editorState.rows.length - 1 ? "Leave blank for top band" : ""} className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                      </Field>
                      <Field label="Monthly PT ₹">
                        <input type="number" value={r.monthly_amount} onChange={(e) => { const rows = [...editorState.rows]; rows[i] = { ...r, monthly_amount: e.target.value }; setEditorState({ ...editorState, rows }); }} className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                      </Field>
                      <Field label="Gender">
                        <select value={r.gender} onChange={(e) => { const rows = [...editorState.rows]; rows[i] = { ...r, gender: e.target.value }; setEditorState({ ...editorState, rows }); }} className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400">
                          <option value="any">Any</option><option value="male">Male</option><option value="female">Female</option>
                        </select>
                      </Field>
                    </div>
                  </div>
                ))}
                <button onClick={() => setEditorState({ ...editorState, rows: [...editorState.rows, emptyPtRow()] })} className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1"><HiPlus className="w-3.5 h-3.5" /> Add slab row</button>
              </div>
              <p className="text-[11px] text-slate-400">Ranges are half-open <span className="font-mono">[from, to)</span> and must be contiguous per gender — the lowest band per gender must start at ₹0, and the highest band must have blank "To" to cover all high earners.</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditorState(null)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition">Cancel</button>
              <button onClick={saveEditor} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200">Replace Slab Set</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Regimes tab ─────────────────────────
function RegimesTab({ showToast }) {
  const [fy, setFy] = useState(currentFY());
  const [regimes, setRegimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // regime
  const [slabEditor, setSlabEditor] = useState(null); // { regime, rows }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getTaxRegimes({ financial_year: fy });
      setRegimes(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load regimes", "error");
    } finally {
      setLoading(false);
    }
  }, [fy, showToast]);

  useEffect(() => { load(); }, [load]);

  const bootstrap = async () => {
    try {
      const res = await payrollAPI.bootstrapTaxTables({ financial_year: fy });
      const created = res.data?.created?.length ?? 0;
      showToast(`Bootstrapped ${fy} — ${created} regime(s) created`);
      load();
    } catch (err) {
      showToast(err.message || "Bootstrap failed", "error");
    }
  };

  const saveRegime = async () => {
    try {
      await payrollAPI.updateTaxRegime(editing.id, {
        name: editing.name,
        standard_deduction: parseFloat(editing.standard_deduction) || 0,
        rebate_87a_income_limit: parseFloat(editing.rebate_87a_income_limit) || 0,
        rebate_87a_max_amount: parseFloat(editing.rebate_87a_max_amount) || 0,
        allows_hra_exemption: !!editing.allows_hra_exemption,
        allows_chapter_via: !!editing.allows_chapter_via,
        is_default: !!editing.is_default,
        is_active: editing.is_active !== false,
      });
      showToast("Regime updated");
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.message || "Failed to update regime", "error");
    }
  };

  const openSlabs = async (regime) => {
    try {
      const res = await payrollAPI.getTaxRegimeSlabs(regime.id);
      const recordsArray = res.data?.records || res.data || [];
      const rows = (Array.isArray(recordsArray) ? recordsArray : []).map((s) => ({
        age_band: s.age_band || "below_60", from_amount: s.from_amount, to_amount: s.to_amount ?? "", rate_percent: s.rate_percent,
      }));
      setSlabEditor({ regime, rows: rows.length ? rows : [{ age_band: "below_60", from_amount: 0, to_amount: "", rate_percent: 0 }] });
    } catch (err) {
      showToast(err.message || "Failed to load slabs", "error");
    }
  };

  const saveSlabs = async () => {
    const validationError = validateSlabRanges(slabEditor.rows, "age_band", "Age band");
    if (validationError) return showToast(validationError, "error");
    try {
      await payrollAPI.replaceTaxRegimeSlabs(slabEditor.regime.id, {
        slabs: slabEditor.rows.map((r, i) => ({
          age_band: r.age_band,
          from_amount: parseFloat(r.from_amount) || 0,
          to_amount: r.to_amount === "" ? null : parseFloat(r.to_amount),
          rate_percent: parseFloat(r.rate_percent) || 0,
          display_order: i + 1,
        })),
      });
      showToast("Slabs replaced");
      setSlabEditor(null);
      load();
    } catch (err) {
      showToast(err.message || "Failed to save slabs", "error");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <select value={fy} onChange={(e) => setFy(e.target.value)} className="px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-purple-400">
          {FY_OPTIONS.map((y) => <option key={y} value={y}>FY {y}</option>)}
        </select>
        <button onClick={bootstrap} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
          <HiSparkles className="w-5 h-5" /> Bootstrap Tax Tables
        </button>
      </div>

      {loading ? <Skeleton type="table" rows={3} /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {regimes.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 capitalize">{r.name || r.code}</h3>
                  <p className="text-[11px] text-slate-400">{r.slab_count ?? r.slabs_count ?? "?"} slabs {r.is_default && <span className="text-purple-600 font-bold">· DEFAULT</span>}</p>
                </div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${r.is_active === false ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>{r.is_active === false ? "inactive" : "active"}</span>
              </div>
              <div className="p-5 space-y-2 text-sm">
                <Row k="Standard Deduction" v={money(r.standard_deduction)} />
                <Row k="87A income limit" v={money(r.rebate_87a_income_limit)} />
                <Row k="87A max rebate" v={money(r.rebate_87a_max_amount)} />
                <Row k="HRA exemption" v={r.allows_hra_exemption ? "Allowed" : "—"} />
                <Row k="Chapter VI-A" v={r.allows_chapter_via ? "Allowed" : "—"} />
              </div>
              <div className="p-4 border-t border-slate-50 flex gap-2">
                <button onClick={() => setEditing({ ...r })} className="flex-1 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Edit Params</button>
                <button onClick={() => openSlabs(r)} className="flex-1 px-3 py-2 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">Edit Slabs</button>
              </div>
            </div>
          ))}
          {regimes.length === 0 && (
            <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed text-slate-500">No regimes for FY {fy}. Click <span className="font-bold">Bootstrap Tax Tables</span>.</div>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Edit Regime</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Name"><input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Standard Deduction ₹"><input type="number" value={editing.standard_deduction ?? ""} onChange={(e) => setEditing({ ...editing, standard_deduction: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" /></Field>
                <Field label="87A Income Limit ₹"><input type="number" value={editing.rebate_87a_income_limit ?? ""} onChange={(e) => setEditing({ ...editing, rebate_87a_income_limit: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" /></Field>
              </div>
              <Field label="87A Max Rebate ₹"><input type="number" value={editing.rebate_87a_max_amount ?? ""} onChange={(e) => setEditing({ ...editing, rebate_87a_max_amount: e.target.value })} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-purple-400 outline-none" /></Field>
              <div className="space-y-2">
                <Check label="Allows HRA exemption" checked={!!editing.allows_hra_exemption} onChange={(v) => setEditing({ ...editing, allows_hra_exemption: v })} />
                <Check label="Allows Chapter VI-A" checked={!!editing.allows_chapter_via} onChange={(v) => setEditing({ ...editing, allows_chapter_via: v })} />
                <Check label="Set as default regime" checked={!!editing.is_default} onChange={(v) => setEditing({ ...editing, is_default: v })} />
                <Check label="Active" checked={editing.is_active !== false} onChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition">Cancel</button>
              <button onClick={saveRegime} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200">Save</button>
            </div>
          </div>
        </div>
      )}

      {slabEditor && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 capitalize">{slabEditor.regime.name || slabEditor.regime.code} — Slabs</h2>
              <button onClick={() => setSlabEditor(null)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto flex-1">
              {slabEditor.rows.map((r, i) => (
                <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Slab {i + 1}</span>
                    <button onClick={() => setSlabEditor({ ...slabEditor, rows: slabEditor.rows.filter((_, x) => x !== i) })} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition" title="Remove slab"><HiTrash className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Age Band">
                      <select value={r.age_band} onChange={(e) => { const rows = [...slabEditor.rows]; rows[i] = { ...r, age_band: e.target.value }; setSlabEditor({ ...slabEditor, rows }); }} className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400">
                        <option value="below_60">Below 60</option><option value="60_to_79">60–79</option><option value="80_plus">80+</option>
                      </select>
                    </Field>
                    <Field label="From ₹">
                      <input type="number" value={r.from_amount} onChange={(e) => { const rows = [...slabEditor.rows]; rows[i] = { ...r, from_amount: e.target.value }; setSlabEditor({ ...slabEditor, rows }); }} placeholder="0" className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                    </Field>
                    <Field label="To ₹ (blank = ∞)">
                      <input type="number" value={r.to_amount} onChange={(e) => { const rows = [...slabEditor.rows]; rows[i] = { ...r, to_amount: e.target.value }; setSlabEditor({ ...slabEditor, rows }); }} placeholder={i === slabEditor.rows.length - 1 ? "Leave blank for top slab" : ""} className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                    </Field>
                    <Field label="Rate %">
                      <input type="number" value={r.rate_percent} onChange={(e) => { const rows = [...slabEditor.rows]; rows[i] = { ...r, rate_percent: e.target.value }; setSlabEditor({ ...slabEditor, rows }); }} placeholder="e.g., 30" className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-400" />
                    </Field>
                  </div>
                </div>
              ))}
              <button onClick={() => setSlabEditor({ ...slabEditor, rows: [...slabEditor.rows, { age_band: "below_60", from_amount: 0, to_amount: "", rate_percent: 0 }] })} className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1"><HiPlus className="w-3.5 h-3.5" /> Add slab</button>
              <p className="text-[11px] text-slate-400">Half-open <span className="font-mono">[from, to)</span> ranges, contiguous per age band — the lowest slab starts at ₹0, and the highest slab is left open-ended (blank "To").</p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setSlabEditor(null)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition">Cancel</button>
              <button onClick={saveSlabs} className="px-4 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition shadow-md shadow-purple-200">Replace Slabs</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800">{v}</span></div>
);
const Field = ({ label, children }) => (
  <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">{label}</label>{children}</div>
);
const Check = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
    <span className="text-sm font-medium text-slate-700">{label}</span>
  </label>
);
