import React, { useState, useEffect, useCallback } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCog } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";

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

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getSettings();
      setSettings(res.data || {
        lop_basis: "calendar_days",
        rounding_policy: "nearest_rupee",
        payroll_require_separate_checker: false,
        manager_direct_compensation_authority: false,
        manager_can_view_team_compensation: true
      });
    } catch (err) {
      showToast(err.message || "Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.updateSettings(settings);
      showToast("Payroll settings updated successfully");
    } catch (err) {
      showToast(payrollErrorMessage(err, "Failed to update settings"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
        <DashboardTopBar title="Payroll Settings" />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-4xl mx-auto w-full">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HiCog className="text-purple-600 w-7 h-7" /> Payroll Settings
            </h1>
            <p className="text-sm text-slate-500 mt-1">Configure global payroll policies, LOP rules, and manager authorities.</p>
          </div>

          {loading ? <Skeleton type="card" /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* General Settings */}
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Calculation Policies</h3>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">LOP Divisor Basis</label>
                      <select value={settings.lop_basis} onChange={e => setSettings({...settings, lop_basis: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                        <option value="calendar_days">Calendar Days in Month</option>
                        <option value="standard_working_days">Standard Working Days in Month</option>
                        <option value="fixed_30">Fixed 30 Days</option>
                      </select>
                      <p className="text-xs text-slate-400 mt-1.5">Determines the per-day rate for Loss of Pay.</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Rounding Policy</label>
                      <select value={settings.rounding_policy} onChange={e => setSettings({...settings, rounding_policy: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                        <option value="nearest_rupee">Nearest Rupee</option>
                        <option value="two_decimals">Two Decimals (Paise)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Manager Permissions */}
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Manager Permissions</h3>
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={settings.manager_can_view_team_compensation} onChange={e => setSettings({...settings, manager_can_view_team_compensation: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Managers can view team compensation</span>
                        <span className="block text-xs text-slate-500 mt-0.5">Allows managers to see the salary structures and payslips of their direct reports.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={settings.manager_direct_compensation_authority} onChange={e => setSettings({...settings, manager_direct_compensation_authority: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Manager direct compensation authority</span>
                        <span className="block text-xs text-slate-500 mt-0.5">If enabled, manager-proposed salaries and bonuses take effect immediately without HR approval (Tier B -> Tier A).</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* HR Approvals */}
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">HR Approval Policies</h3>
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={settings.payroll_require_separate_checker} onChange={e => setSettings({...settings, payroll_require_separate_checker: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Require separate checker (Segregation of Duties)</span>
                        <span className="block text-xs text-slate-500 mt-0.5">Requires two distinct HR users: one to propose a change and another to approve it.</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50">
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
