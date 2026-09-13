import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiPlus, HiPencil, HiTrash, HiCurrencyRupee } from "react-icons/hi";
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

export default function PayrollComponentsPage() {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComp, setEditingComp] = useState(null);
  const [formData, setFormData] = useState({
    name: "", code: "", component_type: "earning", calculation_type: "flat", value: 0,
    is_basic: false, is_part_of_ctc: true, is_taxable: true, is_lop_applicable: true,
    is_prorated_on_joining: true, pf_applicable: false, esi_applicable: false, display_order: 100
  });

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchComponents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getComponents();
      setComponents(res.data?.records || res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load components", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchComponents(); }, [fetchComponents]);

  const handleBootstrap = async () => {
    try {
      await payrollAPI.bootstrapComponents();
      showToast("Default components bootstrapped successfully");
      fetchComponents();
    } catch (err) {
      showToast(err.message || "Failed to bootstrap", "error");
    }
  };

  const handleOpenModal = (comp = null) => {
    if (comp) {
      setEditingComp(comp);
      setFormData({
        name: comp.name, code: comp.code, component_type: comp.component_type, calculation_type: comp.calculation_type,
        value: comp.value || 0, is_basic: comp.is_basic, is_part_of_ctc: comp.is_part_of_ctc, is_taxable: comp.is_taxable,
        is_lop_applicable: comp.is_lop_applicable, is_prorated_on_joining: comp.is_prorated_on_joining,
        pf_applicable: comp.pf_applicable, esi_applicable: comp.esi_applicable, display_order: comp.display_order
      });
    } else {
      setEditingComp(null);
      setFormData({
        name: "", code: "", component_type: "earning", calculation_type: "flat", value: 0,
        is_basic: false, is_part_of_ctc: true, is_taxable: true, is_lop_applicable: true,
        is_prorated_on_joining: true, pf_applicable: false, esi_applicable: false, display_order: 100
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingComp) {
        await payrollAPI.updateComponent(editingComp.id, formData);
        showToast("Component updated successfully");
      } else {
        await payrollAPI.createComponent(formData);
        showToast("Component created successfully");
      }
      setIsModalOpen(false);
      fetchComponents();
    } catch (err) {
      showToast(err.message || "Failed to save component", "error");
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("Are you sure you want to deactivate this component?")) return;
    try {
      await payrollAPI.deactivateComponent(id);
      showToast("Component deactivated");
      fetchComponents();
    } catch (err) {
      showToast(err.message || "Failed to deactivate", "error");
    }
  };

  return (
    <>
        <DashboardTopBar title="Salary Components" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Salary Components
              </h1>
              <p className="text-sm text-slate-500 mt-1">Manage the catalog of earnings, deductions, and reimbursements.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleBootstrap} className="px-4 py-2.5 text-sm font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-xl transition">
                Bootstrap Defaults
              </button>
              <button onClick={() => handleOpenModal()} className="px-4 py-2.5 text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 rounded-xl transition flex items-center gap-2 shadow-md shadow-purple-200">
                <HiPlus className="w-5 h-5" /> New Component
              </button>
            </div>
          </div>

          {loading ? <Skeleton type="table" rows={6} /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="px-6 py-4 border-b border-slate-100">Name / Code</th>
                    <th className="px-6 py-4 border-b border-slate-100">Type</th>
                    <th className="px-6 py-4 border-b border-slate-100">Calculation</th>
                    <th className="px-6 py-4 border-b border-slate-100">Value</th>
                    <th className="px-6 py-4 border-b border-slate-100">Flags</th>
                    <th className="px-6 py-4 border-b border-slate-100 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm">
                  {components.map(comp => (
                    <tr key={comp.id} className={`hover:bg-slate-50/50 transition-colors ${!comp.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{comp.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 font-mono mt-0.5">{comp.code}</p>
                      </td>
                      <td className="px-6 py-4 capitalize font-semibold text-slate-600">{comp.component_type.replace(/_/g, ' ')}</td>
                      <td className="px-6 py-4 capitalize text-slate-600">{comp.calculation_type.replace(/_/g, ' ')}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{comp.calculation_type === 'flat' ? `₹${comp.value}` : comp.calculation_type !== 'balancing' ? `${comp.value}%` : '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {comp.is_basic && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded">BASIC</span>}
                          {comp.is_part_of_ctc && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-bold rounded">CTC</span>}
                          {comp.is_taxable && <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 text-[9px] font-bold rounded">TAX</span>}
                          {comp.pf_applicable && <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded">PF</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleOpenModal(comp)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"><HiPencil className="w-4 h-4" /></button>
                          {comp.is_active && !comp.is_system && (
                            <button onClick={() => handleDeactivate(comp.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><HiTrash className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {components.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No components found. Click "Bootstrap Defaults" to seed standard components.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">{editingComp ? "Edit Component" : "New Component"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg transition"><HiX className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form id="compForm" onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Name <span className="text-red-500">*</span></label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Code <span className="text-red-500">*</span></label>
                    <input type="text" required disabled={editingComp?.is_system} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none transition-all disabled:opacity-50" placeholder="E.g. BASIC_SALARY" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Type</label>
                    <select disabled={editingComp?.is_system} value={formData.component_type} onChange={e => setFormData({...formData, component_type: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-50">
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                      <option value="employer_contribution">Employer Contribution</option>
                      <option value="reimbursement">Reimbursement</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Calculation</label>
                    <select disabled={editingComp?.is_system} value={formData.calculation_type} onChange={e => setFormData({...formData, calculation_type: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none disabled:opacity-50">
                      <option value="flat">Flat Amount</option>
                      <option value="percent_of_basic">Percentage of Basic</option>
                      <option value="percent_of_gross">Percentage of Gross</option>
                      <option value="percent_of_ctc">Percentage of CTC</option>
                      <option value="balancing">Balancing (Absorbs remainder)</option>
                    </select>
                  </div>
                </div>

                {formData.calculation_type !== 'balancing' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Value {formData.calculation_type === 'flat' ? '(Amount)' : '(%)'}</label>
                    <input type="number" step="0.01" value={formData.value} onChange={e => setFormData({...formData, value: parseFloat(e.target.value)})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none" />
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 mb-3">Behavioural Flags</h4>
                  <div className="grid grid-cols-2 gap-y-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={formData.is_basic} onChange={e => setFormData({...formData, is_basic: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      Is Basic Component
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={formData.is_part_of_ctc} onChange={e => setFormData({...formData, is_part_of_ctc: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      Part of CTC
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={formData.is_taxable} onChange={e => setFormData({...formData, is_taxable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      Taxable (TDS)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={formData.is_lop_applicable} onChange={e => setFormData({...formData, is_lop_applicable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      LOP Applicable
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={formData.pf_applicable} onChange={e => setFormData({...formData, pf_applicable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      PF Applicable
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={formData.esi_applicable} onChange={e => setFormData({...formData, esi_applicable: e.target.checked})} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      ESI Applicable
                    </label>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button form="compForm" type="submit" className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200">
                {editingComp ? "Update Component" : "Create Component"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
