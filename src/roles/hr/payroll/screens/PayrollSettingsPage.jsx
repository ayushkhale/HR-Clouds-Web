import React, { useState, useEffect, useCallback, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { HiCheckCircle, HiExclamationCircle, HiX, HiCog, HiChevronDown } from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";

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

const fieldCls = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-2";

/** A titled block of settings. The chevron folds it so a long page reads as a list of groups. */
function Section({ title, blurb, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left border-b border-slate-100 pb-2 group"
      >
        <h3 className="text-base font-bold text-slate-800 group-hover:text-purple-700 transition-colors">{title}</h3>
        <HiChevronDown className={`w-4 h-4 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          {blurb && <p className="text-xs text-slate-500 mt-2 mb-4 leading-relaxed">{blurb}</p>}
          <div className={blurb ? "" : "mt-4"}>{children}</div>
        </>
      )}
    </div>
  );
}

function Check({ checked, onChange, title, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
      <div>
        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">{title}</span>
        {hint && <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{hint}</span>}
      </div>
    </label>
  );
}

function Pick({ label, value, onChange, options, hint }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function Num({ label, value, onChange, min, max, hint, suffix }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input type="number" min={min} max={max} value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={`${fieldCls} ${suffix ? "pr-16" : ""}`} />
        {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

// The two rate bases and the three divisors are shared by final settlement and
// comp-off, and mean the same thing in both places.
const RATE_BASIS = [
  { value: "basic", label: "Basic salary" },
  { value: "gross", label: "Gross salary" },
];
const DIVISOR_BASIS = [
  { value: "fixed_30", label: "Always 30 days" },
  { value: "calendar_days", label: "Days in that month" },
  { value: "standard_working_days", label: "Working days in that month" },
];

export default function PayrollSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  // The last saved value of benefit charging, so a confirm only fires when it
  // is switched from off to on.
  const benefitsWereOn = useRef(false);
  // Deduction components, for the "recover short notice through" picker.
  // A settlement cannot be prepared until one is chosen (#201).
  const [deductionComponents, setDeductionComponents] = useState([]);

  // Shorthands for the Phase 7 sections: `set7` reads safely before load and
  // `upd` merges one key without repeating the spread at every call site.
  const set7 = settings || {};
  const upd = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

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
      // Phase 7 — final settlement (#55) and comp-off encashment (#57).
      //
      // VERIFIED AGAINST THE LIVE BACKEND 2026-09-20: the key names in the
      // phase-7 analysis doc are NOT the names the server stores. The doc's
      // `fnf_leave_encashment_rate_basis` is really `fnf_encashment_rate_basis`,
      // `..._divisor_basis` is `..._divisor`, `fnf_leave_encashment_types` is
      // `fnf_encashment_leave_type_codes`, and `fnf_notice_recovery_basis` is
      // `fnf_notice_recovery_rate_basis`. Saving the doc's names would write
      // keys the server ignores and silently lose the setting.
      //
      // The automation group (#56) does not exist on the server at all — no
      // auto_draft_*, stale_run_sweep_*, attachment_* or calendar-reminder key
      // is returned — so it is not offered here. See the Automation page.
      const PHASE7_DEFAULTS = {
        fnf_default_notice_period_days: 30,
        fnf_notice_recovery_enabled: false,
        fnf_notice_recovery_rate_basis: "basic",
        fnf_notice_recovery_component_id: "",
        fnf_leave_encashment_enabled: false,
        fnf_encashment_leave_type_codes: [],
        fnf_encashment_rate_basis: "basic",
        fnf_encashment_divisor: "fixed_30",
        fnf_encashment_component_id: "",
        fnf_encashment_max_days: "",
        fnf_loan_recovery_mode: "manual",
        compoff_encashment_enabled: false,
        compoff_encashment_rate_basis: "basic",
        compoff_encashment_divisor: "fixed_30",
        compoff_encashment_component_id: "",
        compoff_encashment_max_days_per_fy: "",
      };
      Object.entries(PHASE7_DEFAULTS).forEach(([k, v]) => {
        if (loaded[k] === undefined || loaded[k] === null) loaded[k] = v;
      });
      benefitsWereOn.current = !!loaded.benefit_deductions_enabled;
      setSettings(loaded);
    } catch (err) {
      showToast(err.message || "Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getComponents({ is_active: true })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.records || res.data || [];
        setDeductionComponents(rows.filter((c) => c.component_type === "deduction"));
      })
      // The picker degrades to "Not set"; the rest of the page still works.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
        <main className="flex-1 overflow-y-auto p-6 sm:p-8 max-w-7xl mx-auto w-full">
          
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Payroll Settings
            </h1>
            <p className="text-sm text-slate-500 mt-1">Configure global payroll policies, LOP rules, and manager authorities.</p>
          </div>

          {loading ? <Skeleton type="card" /> : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-10 gap-y-8 items-start">
                {/* General Settings */}
                <Section title="Calculation Policies">
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
                </Section>

                {/* Manager Permissions */}
                <Section title="Manager Permissions">
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
                </Section>

                {/* HR Approvals */}
                <Section title="HR Approval Policies">
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={settings.payroll_require_separate_checker} onChange={e => setSettings({...settings, payroll_require_separate_checker: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Require separate checker (Segregation of Duties)</span>
                        <span className="block text-xs text-slate-500 mt-0.5">Requires two distinct HR users: one to propose a change and another to approve it.</span>
                      </div>
                    </label>
                  </div>
                </Section>

                {/* Reimbursements & Benefits */}
                <Section title="Reimbursements & Benefits">
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
                </Section>

                {/* Payslip delivery */}
                <Section title="Payslip Delivery">
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
                </Section>

                {/* ── Phase 7 · Final settlement (registry #55) ───────────── */}
                <Section
                  title="When someone leaves"
                  blurb="Used to work out the last payment for anyone who leaves — short notice recovered, unused leave paid out, and any outstanding loan settled."
                >
                  <div className="grid sm:grid-cols-2 gap-6">
                    <Num label="Standard notice period" value={set7.fnf_default_notice_period_days} min={0} max={365} suffix="days"
                      onChange={(v) => upd({ fnf_default_notice_period_days: v })}
                      hint="Used when an exit doesn't specify its own notice period." />
                    <Pick label="Recover short notice from" value={set7.fnf_notice_recovery_rate_basis} options={RATE_BASIS}
                      onChange={(v) => upd({ fnf_notice_recovery_rate_basis: v })}
                      hint="Which part of the salary the daily rate is worked out from." />
                    <div className="sm:col-span-2">
                      <Check checked={set7.fnf_notice_recovery_enabled} onChange={(v) => upd({ fnf_notice_recovery_enabled: v })}
                        title="Recover pay for notice that wasn't served"
                        hint="While this is off, leaving early costs the employee nothing, whatever the exit says." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Component used to recover short notice</label>
                      <select value={set7.fnf_notice_recovery_component_id || ""} onChange={(e) => upd({ fnf_notice_recovery_component_id: e.target.value })} className={fieldCls}>
                        <option value="">Not set — settlements will be refused</option>
                        {deductionComponents.map((c) => <option key={c.id} value={c.id}>{c.name}{c.component_code ? ` (${c.component_code})` : ""}</option>)}
                      </select>
                      <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                        The deduction line short notice is charged through. A settlement can&apos;t be prepared until this is chosen.
                      </p>
                    </div>
                    <Pick label="Outstanding loans" value={set7.fnf_loan_recovery_mode}
                      options={[
                        // The server's own values, confirmed live — not the
                        // doc's `recover_via_payroll` / `manual_recovery`.
                        { value: "payroll", label: "Recover from the final payment" },
                        { value: "manual", label: "Collect separately, outside payroll" },
                      ]}
                      onChange={(v) => upd({ fnf_loan_recovery_mode: v })} />
                  </div>

                  <div className="mt-6 space-y-4">
                    <Check checked={set7.fnf_leave_encashment_enabled} onChange={(v) => upd({ fnf_leave_encashment_enabled: v })}
                      title="Pay out unused leave when someone leaves"
                      hint="Their remaining balance in the leave types below is converted to cash on the final payment." />
                    {set7.fnf_leave_encashment_enabled && (
                      <div className="grid sm:grid-cols-2 gap-6 pl-7">
                        <div>
                          <label className={labelCls}>Leave types paid out</label>
                          <input type="text" value={(set7.fnf_encashment_leave_type_codes || []).join(", ")}
                            onChange={(e) => upd({ fnf_encashment_leave_type_codes: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })}
                            placeholder="EL" className={fieldCls} />
                          <p className="text-xs text-slate-400 mt-1.5">Short codes, separated by commas — for example EL, PL.</p>
                        </div>
                        <Pick label="Work the daily rate from" value={set7.fnf_encashment_rate_basis} options={RATE_BASIS}
                          onChange={(v) => upd({ fnf_encashment_rate_basis: v })} />
                        <Pick label="Divide the monthly salary by" value={set7.fnf_encashment_divisor} options={DIVISOR_BASIS}
                          onChange={(v) => upd({ fnf_encashment_divisor: v })}
                          hint="Turns a monthly salary into a per-day amount." />
                      </div>
                    )}
                  </div>
                </Section>

                {/* ── Phase 7 · Comp-off encashment (registry #57) ──────────── */}
                <Section
                  title="Cashing out earned leave"
                  blurb="Earned leave is credited for working on an off day. With this on, a manager can propose paying those days out as cash instead, and HR approves."
                >
                  <div className="space-y-4">
                    <Check checked={set7.compoff_encashment_enabled} onChange={(v) => upd({ compoff_encashment_enabled: v })}
                      title="Allow earned leave to be cashed out"
                      hint="Off by default. While off, earned leave cash-out requests are refused." />
                    {set7.compoff_encashment_enabled && (
                      <div className="grid sm:grid-cols-2 gap-6 pl-7">
                        <Pick label="Work the daily rate from" value={set7.compoff_encashment_rate_basis} options={RATE_BASIS}
                          onChange={(v) => upd({ compoff_encashment_rate_basis: v })} />
                        <Pick label="Divide the monthly salary by" value={set7.compoff_encashment_divisor} options={DIVISOR_BASIS}
                          onChange={(v) => upd({ compoff_encashment_divisor: v })} />
                        <Num label="Most days per person, per year" value={set7.compoff_encashment_max_days_per_fy} min={0} max={365} suffix="days"
                          onChange={(v) => upd({ compoff_encashment_max_days_per_fy: v })}
                          hint="Requests above this are refused." />
                      </div>
                    )}
                  </div>
                </Section>

                {/* Automation (#56) is documented but the server stores none of
                    its keys — a GET of settings returns no auto_draft_*,
                    stale_run_sweep_*, attachment_* or calendar-reminder field.
                    Offering the switches here would save values that are
                    silently dropped, so the jobs are run from the Automation
                    page instead until the backend adds them. */}

                </div>

                <div className="pt-6 mt-8 border-t border-slate-100 flex justify-end">
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
