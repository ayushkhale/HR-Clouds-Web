import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiPencil, HiTrash, HiDocumentText, HiEye, HiCog, HiCheck } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import CtcBudgetBar from "../CtcBudgetBar";
import {
  CTC_PRESETS, formatINR, readTarget, writeTarget, readFlatUnit, writeFlatUnit, flatUnitFrom,
  componentMeta, budgetFromPreview, estimateBudget, rowAnnual, estimateLine, moYr, buildSuggestions,
} from "../ctcBudget";

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

export default function PayrollTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "", code: "", definition_mode: "ctc_driven", currency: "INR"
  });

  // Preview asks for the CTC first; nothing is evaluated until HR enters one.
  const [previewTpl, setPreviewTpl] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewCTC, setPreviewCTC] = useState("");

  const [isComponentModalOpen, setIsComponentModalOpen] = useState(false);
  const [managingTemplate, setManagingTemplate] = useState(null);
  const [componentFormData, setComponentFormData] = useState({
    component_id: "", calculation_type: "flat", value: ""
  });

  // Inline edit (#13) — which template-component line is open, and its draft.
  const [editingCompId, setEditingCompId] = useState(null);
  const [editComp, setEditComp] = useState({ calculation_type: "flat", value: "" });
  const [savingComp, setSavingComp] = useState(false);

  // Target-CTC budget for the Manage Components modal (frontend-only target).
  const [budgetTarget, setBudgetTarget] = useState("");
  const [budgetPreview, setBudgetPreview] = useState(null);
  const [budgetError, setBudgetError] = useState("");
  const [budgetLoading, setBudgetLoading] = useState(false);
  const budgetReq = useRef(0);
  // Monthly vs annual flat values, learned from real preview responses.
  const [flatUnit, setFlatUnit] = useState(readFlatUnit);

  const learnFlatUnit = useCallback((data) => {
    const unit = flatUnitFrom(data);
    if (unit) {
      setFlatUnit(unit);
      writeFlatUnit(unit);
    }
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, compRes] = await Promise.all([
        payrollAPI.getTemplates(),
        payrollAPI.getComponents({ is_active: true })
      ]);
      setTemplates(tplRes.data?.records || tplRes.data || []);
      setComponents(compRes.data?.records || compRes.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load templates", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenModal = (tpl = null) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setFormData({ name: tpl.name, code: tpl.code, definition_mode: tpl.definition_mode, currency: tpl.currency || "INR" });
    } else {
      setEditingTemplate(null);
      setFormData({ name: "", code: "", definition_mode: "ctc_driven", currency: "INR" });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await payrollAPI.updateTemplate(editingTemplate.id, formData);
        showToast("Template updated successfully");
      } else {
        await payrollAPI.createTemplate(formData);
        showToast("Template created successfully");
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to save template", "error");
    }
  };

  const handleDeactivate = async (id) => {
    if (!(await window.confirm("Deactivate this template?"))) return;
    try {
      await payrollAPI.deactivateTemplate(id);
      showToast("Template deactivated");
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to deactivate", "error");
    }
  };

  const openPreview = (tpl) => {
    const savedTarget = readTarget(tpl.id);
    if (savedTarget) setPreviewCTC(savedTarget);
    setPreviewTpl(tpl);
    setPreviewData(null);
    setPreviewError("");
  };

  const closePreview = () => {
    setPreviewTpl(null);
    setPreviewData(null);
    setPreviewError("");
  };

  const runPreview = async (e) => {
    e?.preventDefault();
    const ctc = Number(previewCTC);
    if (!ctc || ctc <= 0) {
      setPreviewError("Enter an annual CTC greater than zero");
      return;
    }
    setIsPreviewLoading(true);
    setPreviewError("");
    try {
      const res = await payrollAPI.previewTemplate(previewTpl.id, { annual_ctc: ctc });
      setPreviewData(res.data || res);
      learnFlatUnit(res.data || res);
    } catch (err) {
      setPreviewData(null);
      setPreviewError(err.message || "Evaluation failed. Template might be unbalanced.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!previewTpl) return;
    const onKey = (e) => { if (e.key === "Escape") closePreview(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewTpl]);

  const handleOpenComponentModal = (tpl) => {
    setManagingTemplate(tpl);
    setBudgetTarget(readTarget(tpl.id));
    setBudgetPreview(null);
    setBudgetError("");
    setComponentFormData({ component_id: "", calculation_type: "flat", value: "" });
    cancelEditComponent();
    setIsComponentModalOpen(true);
  };

  // `fillValue` is the fill-up amount computed from the target CTC; the API
  // requires a value even for balancing lines.
  const handleAddComponent = async (e, fillValue) => {
    e.preventDefault();
    const payload = componentFormData.calculation_type === "balancing"
      ? { ...componentFormData, value: String(fillValue ?? 0) }
      : componentFormData;
    try {
      await payrollAPI.addTemplateComponent(managingTemplate.id, payload);
      showToast("Component added successfully");
      loadData();
      const updatedRes = await payrollAPI.getTemplate(managingTemplate.id);
      setManagingTemplate(updatedRes.data);
      setComponentFormData({ component_id: "", calculation_type: "flat", value: "" });
    } catch (err) {
      showToast(err.message || "Failed to add component", "error");
    }
  };

  const startEditComponent = (c) => {
    setEditingCompId(c.id);
    setEditComp({
      calculation_type: c.calculation_type || "flat",
      value: c.value ?? "",
    });
  };

  const cancelEditComponent = () => {
    setEditingCompId(null);
    setEditComp({ calculation_type: "flat", value: "" });
  };

  const handleUpdateComponent = async (compId, fillValue) => {
    // Body must carry at least one field (#13). Balancing sends the computed fill-up amount.
    const payload = { calculation_type: editComp.calculation_type };
    if (editComp.calculation_type === "balancing") {
      payload.value = String(fillValue ?? 0);
    } else {
      if (editComp.value === "" || editComp.value == null) {
        showToast("Enter a value for this component", "error");
        return;
      }
      payload.value = editComp.value;
    }
    setSavingComp(true);
    try {
      await payrollAPI.updateTemplateComponent(managingTemplate.id, compId, payload);
      showToast("Component updated");
      const updatedRes = await payrollAPI.getTemplate(managingTemplate.id);
      setManagingTemplate(updatedRes.data);
      loadData();
      cancelEditComponent();
    } catch (err) {
      showToast(err.message || "Failed to update component", "error");
    } finally {
      setSavingComp(false);
    }
  };

  const handleRemoveComponent = async (compId) => {
    if (!(await window.confirm("Remove this component?"))) return;
    try {
      await payrollAPI.removeTemplateComponent(managingTemplate.id, compId);
      showToast("Component removed");
      loadData();
      const updatedRes = await payrollAPI.getTemplate(managingTemplate.id);
      setManagingTemplate(updatedRes.data);
    } catch (err) {
      showToast(err.message || "Failed to remove component", "error");
    }
  };

  // Balancing has no fixed amount (it's whatever the CTC leaves), so template cards
  // estimate it from the target CTC saved in Manage Components. Null when there's no
  // target or another line (e.g. % of Gross) can't be resolved without the backend.
  const cardEstimate = (tpl) => {
    const target = Number(readTarget(tpl.id));
    if (!(target > 0) || !tpl.components?.length) return null;
    const est = estimateBudget(tpl.components, components, target, flatUnit);
    return est.unresolved > 0 ? null : est;
  };

  const changeBudgetTarget = (value) => {
    setBudgetTarget(value);
    if (managingTemplate) writeTarget(managingTemplate.id, value);
  };

  // Re-run the backend preview whenever the target or the saved components change.
  const managingId = managingTemplate?.id;
  const componentSig = (managingTemplate?.components || [])
    .map((c) => `${c.id}:${c.calculation_type}:${c.value}`)
    .join("|");

  useEffect(() => {
    const ctc = Number(budgetTarget);
    const reqId = ++budgetReq.current;
    if (!isComponentModalOpen || !managingId || !(ctc > 0) || !componentSig) {
      setBudgetPreview(null);
      setBudgetError("");
      setBudgetLoading(false);
      return;
    }
    setBudgetLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await payrollAPI.previewTemplate(managingId, { annual_ctc: ctc });
        if (reqId !== budgetReq.current) return;
        setBudgetPreview(res.data || res);
        setBudgetError("");
        learnFlatUnit(res.data || res);
      } catch (err) {
        if (reqId !== budgetReq.current) return;
        setBudgetPreview(null);
        setBudgetError(err.message || "Couldn't evaluate this template");
      } finally {
        if (reqId === budgetReq.current) setBudgetLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [isComponentModalOpen, managingId, componentSig, budgetTarget, learnFlatUnit]);

  const isCtcDriven = managingTemplate?.definition_mode !== "component_driven";

  const budget = useMemo(() => {
    const target = Number(budgetTarget);
    if (!managingTemplate || !(target > 0)) return null;
    if (budgetPreview) return budgetFromPreview(budgetPreview, components, target);
    return estimateBudget(managingTemplate.components, components, target, flatUnit);
  }, [managingTemplate, budgetTarget, budgetPreview, components, flatUnit]);

  // What a balancing line fills up: the target left over, in the backend's flat unit.
  // `ownAnnual` adds back a row's current amount when that row is being switched to balancing.
  // Null when there's no target to calculate from.
  const balancingFill = (ownAnnual = 0) => {
    if (!budget) return null;
    const annual = Math.max(budget.remaining + ownAnnual, 0);
    const perUnit = flatUnit === "annual" ? annual : annual / 12;
    return Math.round(perUnit * 100) / 100;
  };
  const addBalancingFill = balancingFill();

  // Live hint for the unsaved "Add Component" line. Warns only.
  const draftHint = (() => {
    if (!budget || !componentFormData.component_id) return null;
    const calc = componentFormData.calculation_type;
    const balancingName = budget.balancing?.meta.name || "balancing";
    if (calc === "balancing") {
      if (budget.balancing) return { tone: "text-fuchsia-600", text: `Template already has a balancing component (${balancingName})` };
      return budget.remaining >= 0
        ? { tone: "text-slate-500", text: `Fills up what's left: ≈ ${moYr(budget.remaining)} · calculated automatically` }
        : { tone: "text-red-600", text: `Nothing left to absorb · already over by ${formatINR(-budget.remaining)}` };
    }
    if (componentFormData.value === "") return null;
    const amt = estimateLine(calc, componentFormData.value, budget, flatUnit);
    if (amt == null) {
      return {
        tone: "text-slate-400",
        text: calc === "percent_of_basic" ? "Add a Basic component to estimate this" : "Can't estimate % of Gross until the template previews successfully",
      };
    }
    const unitNote = calc === "flat" && !flatUnit ? " (assuming monthly)" : "";
    const meta = componentMeta({ component_id: componentFormData.component_id }, components);
    if (!meta.partOfCtc) return { tone: "text-slate-500", text: `≈ ${moYr(amt)}${unitNote} · not part of CTC, doesn't use the target` };
    const after = budget.remaining - amt;
    if (after < -0.5) return { tone: "text-red-600", text: `Adds ≈ ${moYr(amt)}${unitNote} · over target by ${formatINR(-after / 12)}/mo` };
    const ctcNote = calc === "percent_of_ctc" && !isCtcDriven ? " · % of CTC uses the target" : "";
    return {
      tone: "text-purple-600",
      text: `Adds ≈ ${moYr(amt)}${unitNote} · leaves ${formatINR(after / 12)}/mo${budget.balancing ? ` for ${balancingName}` : ""}${ctcNote}`,
    };
  })();

  const suggestions = useMemo(
    () => buildSuggestions({ budget, templateComponents: managingTemplate?.components, components, isCtcDriven, flatUnit }),
    [budget, managingTemplate, components, isCtcDriven, flatUnit]
  );

  const addFormRef = useRef(null);

  // Suggestions only prefill (or ask to confirm a removal); HR reviews and saves as usual.
  const applySuggestion = (s) => {
    if (s.kind === "remove") {
      handleRemoveComponent(s.templateComponentId);
      return;
    }
    if (s.kind === "edit") {
      startEditComponent({ id: s.templateComponentId, calculation_type: s.calculation_type, value: s.value });
      return;
    }
    cancelEditComponent();
    setComponentFormData({ component_id: s.component_id, calculation_type: s.calculation_type, value: s.value === "" ? "" : String(s.value) });
    addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
        <DashboardTopBar title="Salary Templates" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Structure Templates
              </h1>
              <p className="text-sm text-slate-500 mt-1">Define templates to standardize compensation packages.</p>
            </div>
            <button onClick={() => handleOpenModal()} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
              <HiPlus className="w-5 h-5" /> New Template
            </button>
          </div>

          {loading ? <Skeleton type="dashboard" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col group">
                  <div className="p-5 border-b border-slate-50">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-slate-800 text-lg">{tpl.name}</h3>
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded">{tpl.code}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-1 rounded-full">{tpl.definition_mode.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <div className="p-5 flex-1 bg-slate-50/50">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-3">Components ({tpl.components?.length || 0})</p>
                    <div className="space-y-2">
                      {(tpl.components || []).slice(0, 4).map((c, i) => {
                        const balAnnual = c.calculation_type === 'balancing' ? cardEstimate(tpl)?.rows[i]?.annual ?? null : null;
                        return (
                         <div key={c.id} className="flex justify-between items-center text-sm">
                           <span className="text-slate-600">{components.find(comp => comp.id === c.component_id)?.name || c.salary_component?.name || 'Unknown'}</span>
                           {c.calculation_type === 'balancing' ? (
                             balAnnual != null ? (
                               <span className="font-medium text-slate-800 tabular-nums" title={`Fill-up amount at the target CTC of ${formatINR(readTarget(tpl.id))}`}>≈ {formatINR(balAnnual / 12)}/mo</span>
                             ) : (
                               <span className="font-medium text-slate-400" title="Takes whatever is left of the CTC. Set a target CTC in Manage to see the amount.">Balancing</span>
                             )
                           ) : (
                             <span className="font-medium text-slate-800">{c.calculation_type === 'flat' ? `₹${c.value}` : `${c.value}%`}</span>
                           )}
                         </div>
                        );
                      })}
                      {(tpl.components?.length || 0) > 4 && (
                        <p className="text-xs text-slate-400 mt-2 italic">+ {tpl.components.length - 4} more components</p>
                      )}
                    </div>
                  </div>
                  <div className="p-4 border-t border-slate-50 flex items-center justify-between bg-white">
                    <div className="flex gap-2">
                      <button onClick={() => handleOpenModal(tpl)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"><HiPencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeactivate(tpl.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><HiTrash className="w-4 h-4" /></button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleOpenComponentModal(tpl)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                        <HiCog className="w-4 h-4" /> Manage
                      </button>
                      <button onClick={() => openPreview(tpl)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition">
                        <HiEye className="w-4 h-4" /> Preview
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">No templates found. Create one to get started.</p>
                </div>
              )}
            </div>
          )}
        </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">{editingTemplate ? "Edit Template" : "New Template"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Template Name</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Code</label>
                <input type="text" required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Definition Mode</label>
                <select value={formData.definition_mode} onChange={e => setFormData({...formData, definition_mode: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                  <option value="ctc_driven">CTC Driven (Top-down)</option>
                  <option value="component_driven">Component Driven (Bottom-up)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4 mt-6 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isComponentModalOpen && managingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Manage Components</h2>
                <p className="text-sm text-slate-500 mt-1">Template: <span className="font-semibold text-purple-600">{managingTemplate.name}</span></p>
              </div>
              <button onClick={() => setIsComponentModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>

            <CtcBudgetBar
              target={budgetTarget}
              onTargetChange={changeBudgetTarget}
              budget={budget}
              loading={budgetLoading}
              error={budgetError}
              isCtcDriven={isCtcDriven}
              suggestions={suggestions}
              onSuggestion={applySuggestion}
            />

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Existing Components */}
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Current Components ({managingTemplate.components?.length || 0})</h3>
                <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] uppercase font-bold text-slate-400">
                        <th className="px-4 py-3">Component</th>
                        <th className="px-4 py-3">Calculation</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(managingTemplate.components || []).map(c => {
                        const isEditing = editingCompId === c.id;
                        const annual = rowAnnual(budget, c, components);
                        const ownAnnual = c.calculation_type !== "balancing" && componentMeta(c, components).partOfCtc ? annual || 0 : 0;
                        const editFill = isEditing ? balancingFill(ownAnnual) : null;
                        return (
                        <tr key={c.id} className={isEditing ? "bg-purple-50/40" : "hover:bg-slate-100/50"}>
                          <td className="px-4 py-3 font-medium text-slate-800">{components.find(comp => comp.id === c.component_id)?.name || c.salary_component?.name || 'Unknown'}</td>
                          {isEditing ? (
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <select value={editComp.calculation_type} onChange={e => setEditComp({ ...editComp, calculation_type: e.target.value })} className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-purple-400 outline-none">
                                  <option value="flat">Flat</option>
                                  <option value="percent_of_basic">% of Basic</option>
                                  <option value="percent_of_gross">% of Gross</option>
                                  <option value="percent_of_ctc">% of CTC</option>
                                  <option value="balancing">Balancing</option>
                                </select>
                                {editComp.calculation_type === "balancing" ? (
                                  <input type="text" readOnly tabIndex={-1} value={editFill != null ? formatINR(editFill) : ""} placeholder="Auto"
                                    title={editFill != null ? "Calculated automatically: what's left of the target CTC" : "Set a target CTC to see the fill-up amount"}
                                    className="w-28 px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 outline-none cursor-not-allowed tabular-nums" />
                                ) : (
                                  <input type="number" step="0.01" value={editComp.value} onChange={e => setEditComp({ ...editComp, value: e.target.value })} placeholder={editComp.calculation_type === "flat" ? "₹" : "%"} className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:border-purple-400 outline-none" />
                                )}
                              </div>
                            </td>
                          ) : (
                            <td className="px-4 py-3 text-xs">
                              <span className="font-bold text-purple-500 capitalize">{c.calculation_type?.replace(/_/g, ' ')}</span>
                              <span className="text-slate-500 ml-1">({c.calculation_type === 'flat' ? `₹${c.value}` : c.calculation_type === 'balancing' ? 'BAL' : `${c.value}%`})</span>
                              {annual != null && (
                                <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                                  ≈ {moYr(annual)}{componentMeta(c, components).partOfCtc ? "" : " · not in CTC"}
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex justify-end gap-1.5">
                                <button disabled={savingComp} onClick={() => handleUpdateComponent(c.id, editFill)} className="p-1.5 text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition disabled:opacity-50" title="Save"><HiCheck className="w-4 h-4" /></button>
                                <button disabled={savingComp} onClick={cancelEditComponent} className="p-1.5 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50" title="Cancel"><HiX className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1.5">
                                <button onClick={() => startEditComponent(c)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition" title="Edit"><HiPencil className="w-4 h-4" /></button>
                                <button onClick={() => handleRemoveComponent(c.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Remove">
                                  <HiTrash className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                      {(!managingTemplate.components || managingTemplate.components.length === 0) && (
                        <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-xs italic">No components added yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Add New Component Form */}
              <div className="pt-6 border-t border-slate-100">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Add Component</h3>
                <form ref={addFormRef} onSubmit={(e) => handleAddComponent(e, addBalancingFill)} className="grid grid-cols-12 gap-4 items-end">
                  <div className="col-span-12 md:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Select Component</label>
                    <select required value={componentFormData.component_id} onChange={e => setComponentFormData({...componentFormData, component_id: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-purple-400 outline-none">
                      <option value="">-- Choose --</option>
                      {components.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Calculation</label>
                    <select value={componentFormData.calculation_type} onChange={e => setComponentFormData({...componentFormData, calculation_type: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-purple-400 outline-none">
                      <option value="flat">Flat Amount</option>
                      <option value="percent_of_basic">Percentage of Basic</option>
                      <option value="percent_of_gross">Percentage of Gross</option>
                      <option value="percent_of_ctc">Percentage of CTC</option>
                      <option value="balancing">Balancing Figure</option>
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Value</label>
                    {componentFormData.calculation_type === 'balancing' ? (
                      <input type="text" readOnly tabIndex={-1} value={addBalancingFill != null ? formatINR(addBalancingFill) : ""} placeholder="Auto"
                        title={addBalancingFill != null ? "Calculated automatically: what's left of the target CTC" : "Set a target CTC to see the fill-up amount"}
                        className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 outline-none cursor-not-allowed tabular-nums" />
                    ) : (
                      <input type="number" step="0.01" value={componentFormData.value} onChange={e => setComponentFormData({...componentFormData, value: e.target.value})} placeholder={componentFormData.calculation_type === 'flat' ? 'Amount' : '%'} required className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-purple-400 outline-none" />
                    )}
                  </div>
                  {draftHint && (
                    <p className={`col-span-12 -mt-1 flex items-center gap-1.5 text-xs font-semibold tabular-nums ${draftHint.tone}`}>
                      {draftHint.tone === "text-red-600" && <HiExclamationCircle className="w-4 h-4 shrink-0" />}
                      {draftHint.text}
                    </p>
                  )}
                  <div className="col-span-12 mt-2">
                    <button type="submit" className="w-full px-4 py-2 bg-purple-600 text-white font-bold text-sm rounded-lg hover:bg-purple-700 transition">Add to Template</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewTpl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full ${previewData ? "max-w-3xl" : "max-w-md"} flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-800">Preview Structure</h2>
                <p className="text-sm text-slate-500 mt-1 truncate">
                  Template: <span className="font-semibold text-purple-600">{previewTpl.name}</span>
                  {previewTpl.code && <span className="ml-2 text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{previewTpl.code}</span>}
                </p>
              </div>
              <button onClick={closePreview} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>

            <form onSubmit={runPreview} className={`px-6 py-5 ${previewData ? "bg-slate-50 border-b border-slate-100" : ""}`}>
              <label htmlFor="preview-ctc" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Annual CTC</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    id="preview-ctc"
                    type="number"
                    min="1"
                    step="1"
                    autoFocus
                    placeholder="e.g. 1200000"
                    value={previewCTC}
                    onChange={e => { setPreviewCTC(e.target.value); setPreviewError(""); }}
                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                  />
                </div>
                <button type="submit" disabled={isPreviewLoading || !previewCTC} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                  <HiEye className="w-4 h-4" />
                  {isPreviewLoading ? "Calculating…" : previewData ? "Re-evaluate" : "Preview split"}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {CTC_PRESETS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setPreviewCTC(String(v)); setPreviewError(""); }}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-full transition ${Number(previewCTC) === v ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600 hover:bg-purple-100"}`}
                    >
                      {v / 100000}L
                    </button>
                  ))}
                </div>
                {Number(previewCTC) > 0 && (
                  <span className="text-xs text-slate-500">≈ {formatINR(Number(previewCTC) / 12)} / month</span>
                )}
              </div>
              {previewError && (
                <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-xs font-semibold text-red-600">
                  <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{previewError}</span>
                </div>
              )}
            </form>

            {previewData && (
            <div className="p-6 overflow-y-auto">
               <div className="grid grid-cols-2 gap-4 mb-6">
                 <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                   <p className="text-[10px] font-bold text-purple-400 uppercase">Annual CTC</p>
                   <p className="text-2xl font-black text-purple-700">{formatINR(previewData.annual_ctc)}</p>
                 </div>
                 <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                   <p className="text-[10px] font-bold text-purple-400 uppercase">Monthly Gross</p>
                   <p className="text-2xl font-black text-purple-700">{formatINR(previewData.monthly_gross)}</p>
                 </div>
               </div>

               <h3 className="text-sm font-bold text-slate-800 mb-4">Component Breakdown</h3>
               <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                     <th className="px-4 py-3">Component</th>
                     <th className="px-4 py-3 text-right">Calculation</th>
                     <th className="px-4 py-3 text-right">Monthly Amount</th>
                     <th className="px-4 py-3 text-right">Annual Amount</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 text-sm">
                   {(previewData.lines || []).map((line, i) => (
                     <tr key={i} className="hover:bg-slate-50/50">
                       <td className="px-4 py-3 font-medium text-slate-800">{line.name}</td>
                       <td className="px-4 py-3 text-right text-xs">
                         <span className="font-bold text-purple-500">
                           {line.calculation_type?.split(/[_\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
                         </span>
                         <span className="text-slate-400 ml-1">({line.value})</span>
                       </td>
                       <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatINR(line.monthly_amount)}</td>
                       <td className="px-4 py-3 text-right font-bold text-slate-800">{formatINR(line.annual_amount)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               </div>
            </div>
            )}
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
