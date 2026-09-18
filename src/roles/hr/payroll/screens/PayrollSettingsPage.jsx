import React, { useState, useEffect, useCallback, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCog } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";

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

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  // The last saved value of benefit charging, so a confirm only fires when it
  // is switched from off to on.
  const benefitsWereOn = useRef(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getSettings();
      const loaded = res.data || {
        lop_basis: "calendar_days",
        rounding_policy: "nearest_rupee",
        payroll_require_separate_checker: false,
        manager_direct_compensation_authority: false,
        manager_can_view_team_compensation: true,
        // Phase 5 — reimbursements & benefits (registry #51–#53).
        reimbursement_approval_levels: 2,
        reimbursement_payout_lookahead_months: 2,
        benefit_deductions_enabled: false,
        // Phase 6 — payslip delivery (registry #54). These defaults match the
        // backend's and keep today's behaviour: released at once, no email.
        payslip_auto_publish: true,
        payslip_auto_email: false,
      };
      benefitsWereOn.current = !!loaded.benefit_deductions_enabled;
      setSettings(loaded);
    } catch (err) {
      showToast(err.message || "Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    // Turning benefit charging on starts deductions on the next calculation.
    if (settings.benefit_deductions_enabled && !benefitsWereOn.current) {
      const ok = await window.confirm("Every active benefit enrollment will be charged from the next payroll calculation. Check the benefit totals on the Payroll Runs readiness panel first.");
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await payrollAPI.updateSettings(settings);
      const saved = res?.data ?? settings;
      benefitsWereOn.current = !!saved.benefit_deductions_enabled;
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
            <h1 className="text-2xl font-bold text-slate-900">Payroll Settings
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
                        <span className="block text-xs text-slate-500 mt-0.5">If enabled, manager-proposed salaries and bonuses take effect immediately without HR approval (Tier B to Tier A).</span>
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

                {/* Reimbursements & Benefits */}
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Reimbursements & Benefits</h3>
                  <div className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Reimbursement approval</span>
                        <div className="grid grid-cols-1 gap-1 bg-slate-100 rounded-xl p-1" role="radiogroup" aria-label="Reimbursement approval levels">
                          {[[2, "Manager, then HR"], [1, "HR only"]].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={Number(settings.reimbursement_approval_levels) === value}
                              onClick={() => setSettings({ ...settings, reimbursement_approval_levels: value })}
                              className={`py-2 rounded-lg text-sm font-bold transition ${Number(settings.reimbursement_approval_levels) === value ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">Applies to claims submitted after you save. Claims already in review keep their steps.</p>
                      </div>
                      <div>
                        <label htmlFor="payout-lookahead" className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Payout look-ahead months</label>
                        <select
                          id="payout-lookahead"
                          value={Number(settings.reimbursement_payout_lookahead_months) || 0}
                          onChange={(e) => setSettings({ ...settings, reimbursement_payout_lookahead_months: Number(e.target.value) })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none"
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 0 ? "This month only" : `${n} month${n === 1 ? "" : "s"} ahead`}</option>)}
                        </select>
                        <p className="text-xs text-slate-400 mt-1.5">If this month&apos;s payroll is already approved, pay approved claims in one of the next N months. 0 means only this month.</p>
                      </div>
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={!!settings.benefit_deductions_enabled} onChange={e => setSettings({ ...settings, benefit_deductions_enabled: e.target.checked })} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Charge benefit deductions in payroll</span>
                        <span className="block text-xs text-slate-500 mt-0.5">When on, every active benefit enrollment is charged from the next payroll calculation. When off, plans and enrollments are kept but nothing is charged.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Payslip delivery */}
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Payslip Delivery</h3>
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={settings.payslip_auto_publish !== false} onChange={e => setSettings({ ...settings, payslip_auto_publish: e.target.checked })} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Release payslips as soon as a run is approved</span>
                        <span className="block text-xs text-slate-500 mt-0.5">On by default. Switch it off to hold payslips back for a final check — they are still created and frozen at approval, but employees and managers see nothing until you release them from the run&apos;s Payslips panel.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={!!settings.payslip_auto_email} onChange={e => setSettings({ ...settings, payslip_auto_email: e.target.checked })} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Email employees when their payslip is released</span>
                        <span className="block text-xs text-slate-500 mt-0.5">Off by default. The email carries a secure link to this portal, never the PDF itself. Delivery, retries and failures are shown on the run&apos;s Payslips panel.</span>
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
