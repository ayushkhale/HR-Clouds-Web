// ─────────────────────────────────────────────────────────────────────────────
// PayrollSettingsPage.jsx — The organisation-wide payroll rules (registry
// #22/#23): unpaid days, rounding, who approves what, payslip delivery, and how
// a leaver's last payment is worked out.
//
// Three things shape this screen.
//
// · It is READ far more often than it is changed, so it answers "what are we
//   on?" before it offers to change anything: a four-tile summary at the top,
//   and a folded card that still shows what its group is currently set to.
//
// · The PUT is a PARTIAL update and this page only ever sends what HR actually
//   changed (see settingsMeta.js). Sending the whole object used to fail the
//   entire save with a VALIDATION_ERROR on fnf_encashment_max_days, because the
//   nullable Phase 7 keys were defaulted into the form as "" and that one was
//   never even rendered. An emptied nullable box now goes out as null, and an
//   untouched key is not sent at all.
//
// · A key the server never returned is NOT offered (serverKnows). An unknown
//   field doesn't fail quietly — it fails the whole request — so a setting this
//   backend lacks stays off the screen rather than breaking every other one.
//
// Phase 7 key names were verified against the live backend on 2026-09-20 and do
// NOT match the phase-7 analysis doc; see the note inside loadSettings.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { leaveAPI, payrollAPI } from "../../../../shared/api";
import {
  HiCheckCircle, HiExclamationCircle, HiX, HiChevronDown, HiCalculator, HiUserGroup,
  HiShieldCheck, HiReceiptRefund, HiMail, HiDocumentDownload, HiLogout, HiSwitchHorizontal,
} from "react-icons/hi";
import Skeleton from "../../../../shared/components/Skeleton";
import { payrollErrorMessage } from "../../../../shared/utils/payrollErrors";
import { PDF_CACHE_NUMBERS, hasPdfCacheSettings, pdfNumberProblem } from "../pdfRenderMeta";
import { useBulkGenerationPaused } from "../../../../shared/pdf/bulkGeneration";
import FieldHelp, { HelpLabel } from "../../../../shared/fieldHelp/FieldHelp";
import { blankRequiredNumber, settingsPatch } from "../settingsMeta";

const help = (field, label) => ({ surface: "payroll.settings", field, label });

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

/**
 * One group of settings, as its own card.
 *
 * It used to be a heading with a fold inside one giant card, and a page of
 * twelve of them read as one wall: nothing said where a group ended, and
 * folding one left a hole in the middle of the two-column grid. A card per
 * group carries its own icon, its purpose in a line, and — while it is folded —
 * a summary of what it is currently set to, so HR can check the rules without
 * opening everything.
 */
function Section({ title, blurb, icon: Icon, summary, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 text-left group"
      >
        {Icon && (
          <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold text-slate-800 group-hover:text-purple-700 transition-colors">{title}</span>
          {blurb && <span className="block text-xs text-slate-500 mt-1 leading-relaxed">{blurb}</span>}
          {!open && summary && <span className="block text-[11px] font-semibold text-purple-700 mt-2 leading-relaxed">{summary}</span>}
        </span>
        <HiChevronDown className={`w-4 h-4 mt-2 text-slate-400 group-hover:text-purple-600 transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-5">{children}</div>}
    </section>
  );
}

function Check({ checked, onChange, title, hint, help }) {
  const box = (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
      <div>
        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">{title}</span>
        {hint && <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{hint}</span>}
      </div>
    </label>
  );
  // overlay: drawn in the gutter beside the row, so the hint text keeps its wrap.
  return help ? <div className="flex items-start">{box}<FieldHelp {...help} overlay /></div> : box;
}

/**
 * The salary line a payout or a recovery is made through.
 *
 * Only offered when the server actually stores the key: this page sends the
 * settings HR changed, and a key this backend has never heard of fails the
 * whole save, not just that field.
 */
function ComponentPick({ label, value, onChange, components, hint, emptyLabel = "Not set", className = "sm:col-span-2" }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        <option value="">{emptyLabel}</option>
        {components.map((c) => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</option>)}
      </select>
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

/**
 * The leave types a payout covers, as toggles over the org's real types.
 *
 * The setting is stored as a list of short CODES. Typing them by hand meant
 * knowing them by heart, and a typo saved silently and paid out nothing. If the
 * types can't be read, the plain code box comes back rather than an empty list.
 */
function LeaveTypePicker({ codes, types, onChange, help }) {
  // A type with no code can't be stored in this setting, so it isn't offered —
  // a toggle for it would save an empty string into the list.
  const options = (types || []).filter((t) => String(t?.code || "").trim());
  const chosen = (codes || []).map((c) => String(c).toUpperCase());
  const toggle = (code) => {
    const up = String(code).toUpperCase();
    onChange(chosen.includes(up) ? chosen.filter((c) => c !== up) : [...chosen, up]);
  };
  // A saved code with no active leave type behind it — the type was renamed,
  // deactivated or typed in by hand before this was a picker. It still counts at
  // settlement time, so it is shown rather than hidden: a setting nobody can see
  // is one nobody can fix.
  const orphans = chosen.filter((c) => !options.some((t) => String(t.code).toUpperCase() === c));
  return (
    <div>
      <div className="flex items-center">
        <label className={labelCls}>Leave types paid out</label>
        {help ? <FieldHelp {...help} className="mb-2" /> : null}
      </div>
      {options.length === 0 ? (
        <>
          <input
            type="text"
            value={chosen.join(", ")}
            onChange={(e) => onChange(e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))}
            placeholder="EL"
            className={fieldCls}
          />
          <p className="text-xs text-slate-400 mt-1.5">Short codes, separated by commas — for example EL, PL.</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {options.map((t) => {
              const code = String(t.code).toUpperCase();
              const on = chosen.includes(code);
              return (
                <button
                  key={t.id || code}
                  type="button"
                  onClick={() => toggle(code)}
                  aria-pressed={on}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${on ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}
                >
                  {t.name || code}
                </button>
              );
            })}
            {orphans.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                aria-pressed
                title="No active leave type uses this code any more. Click to remove it."
                className="px-3 py-1.5 rounded-xl border border-fuchsia-300 bg-fuchsia-50 text-xs font-bold text-fuchsia-700 transition hover:border-fuchsia-400"
              >
                {code} · not in use
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            {chosen.length === 0
              ? "Nothing is paid out until you pick at least one."
              : "Only these are paid out; every other balance is lost on the last day."}
          </p>
        </>
      )}
    </div>
  );
}

function Pick({ label, value, onChange, options, hint, help }) {
  return (
    <div>
      {help ? (
        <div className="flex items-center">
          <label className={labelCls}>{label}</label>
          <FieldHelp {...help} className="mb-2" />
        </div>
      ) : <label className={labelCls}>{label}</label>}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function Num({ label, value, onChange, min, max, hint, suffix, problem }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input type="number" min={min} max={max} value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={`${fieldCls} ${suffix ? "pr-16" : ""} ${problem ? "border-rose-300" : ""}`} />
        {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{suffix}</span>}
      </div>
      {/* Only ever shown when the value is out of range — a permanent
          "between 1 and 500" line says nothing the input's own min/max doesn't. */}
      {problem
        ? <p className="text-xs font-semibold text-rose-600 mt-1.5 leading-relaxed">{problem}</p>
        : hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

// The two rate bases and the three divisors are shared by final settlement and
// comp-off, and mean the same thing in both places.
// What each stored value means in a sentence, for the summary strip and the
// folded cards. Settings are read far more often than they are changed, so the
// page answers "what are we on?" before it offers to change anything.
const LOP_SAID = {
  calendar_days: "a calendar day’s pay",
  standard_working_days: "a working day’s pay",
  fixed_30: "a thirtieth of the month",
};
const ROUNDING_SAID = {
  nearest_rupee: "Nearest rupee",
  two_decimals: "Exact, to the paisa",
};

/** The four rules HR checks most, shown without opening anything. */
function GlanceStrip({ settings }) {
  const tiles = [
    { label: "One unpaid day costs", value: LOP_SAID[settings.lop_basis] || "Not set" },
    { label: "Amounts rounded to", value: ROUNDING_SAID[settings.rounding_policy] || "Not set" },
    {
      label: "Payslips",
      value: settings.payslip_auto_publish === false ? "Held for a final check" : "Out on approval",
      note: settings.payslip_auto_email ? "and emailed" : "no email sent",
    },
    {
      label: "When someone leaves",
      value: settings.fnf_leave_encashment_enabled ? "Unused leave paid out" : "No leave payout",
      note: settings.fnf_notice_recovery_enabled ? "short notice recovered" : "short notice not recovered",
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      {tiles.map((t) => (
        <div key={t.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.label}</p>
          <p className="text-sm font-bold text-slate-800 mt-1 leading-snug">{t.value}</p>
          {t.note && <p className="text-[11px] text-slate-400 mt-0.5">{t.note}</p>}
        </div>
      ))}
    </div>
  );
}

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
  // The settings EXACTLY as the server last returned them. Everything the page
  // sends is a diff against this, so a default the user never touched is never
  // written and a key this backend lacks is never invented (see settingsMeta).
  const [saved, setSaved] = useState(null);
  // The defaulted form exactly as it was loaded, for Discard.
  const loadedForm = useRef(null);
  // Nullable Phase 7 keys are only offered when the server actually stores them.
  const serverKnows = useCallback((key) => !!saved && key in saved, [saved]);
  // Leave types, so the payout list is picked rather than typed as codes.
  const [leaveTypes, setLeaveTypes] = useState([]);
  // Deduction components, for the "recover short notice through" picker.
  // A settlement cannot be prepared until one is chosen (#201).
  const [deductionComponents, setDeductionComponents] = useState([]);
  // Earning components, for the "pay it through" pickers on the two payouts.
  const [earningComponents, setEarningComponents] = useState([]);

  // Shorthands for the Phase 7 sections: `set7` reads safely before load and
  // `upd` merges one key without repeating the spread at every call site.
  const set7 = settings || {};
  const upd = (patch) => setSettings((prev) => ({ ...prev, ...patch }));
  // The payslip-cache settings (#88–#90). Shown only once the server returns
  // them — a server without them would reject them on the way back in. The
  // render-engine switch (#87) is gone: since 30 Sep 2026 there is one engine,
  // the setting is inert, and it is no longer shown or sent.
  const showPdfCache = hasPdfCacheSettings(settings);
  // Whole-run PDF work paused on this server (learned from a 503 elsewhere this
  // session). While it is, "prepare on release" is accepted but does nothing.
  const bulkPaused = useBulkGenerationPaused();

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
        fnf_encashment_max_days: "",       // blank = no cap; sent as null, never ""
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
      setSaved(res.data || {});
      loadedForm.current = loaded;
      // Payslip-cache settings (#88–#90): NOT defaulted into the form. A key the
      // server never sent must not be sent back, because this page PUTs the
      // whole settings object and an unknown field would fail the entire save.
      setSettings(loaded);
    } catch (err) {
      showToast(err.message || "Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // The payout list used to be typed in as comma-separated codes, which meant
  // knowing them by heart and getting no warning for a typo. Active types only:
  // a payout can't be set up against a type nobody can take.
  useEffect(() => {
    let cancelled = false;
    leaveAPI.getLeaveTypes({ include_inactive: false })
      .then((res) => { if (!cancelled) setLeaveTypes(res?.data?.records || res?.data || []); })
      // Falls back to the plain code boxes below; the rest of the page is fine.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getComponents({ is_active: true })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.records || res.data || [];
        setDeductionComponents(rows.filter((c) => c.component_type === "deduction"));
        setEarningComponents(rows.filter((c) => c.component_type !== "deduction"));
      })
      // The picker degrades to "Not set"; the rest of the page still works.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // The two Phase 3 numbers, checked before the save so an out-of-range value is
  // caught in the box it was typed into rather than coming back as a Joi message
  // about the whole form.
  const pdfProblems = showPdfCache
    ? Object.fromEntries(
      Object.keys(PDF_CACHE_NUMBERS)
        .filter((key) => key in (settings || {}))
        .map((key) => [key, pdfNumberProblem(key, settings[key])])
        .filter(([, problem]) => problem),
    )
    : {};

  // What is waiting to be saved. Also what gets sent: the PUT is a partial
  // update, so an untouched setting is left out entirely — which is what stops
  // a blank cap going out as "" and failing the whole save.
  const pending = settings && saved ? settingsPatch(settings, saved) : {};
  const changeCount = Object.keys(pending).length;
  // A number box the server stores as NOT NULL, left empty. settingsPatch won't
  // send it either way, so without this the box would quietly snap back to the
  // old value on the next read.
  const blankNumber = blankRequiredNumber(settings);

  // Back to the form as it was loaded — including the client-side defaults for
  // the keys this backend doesn't store, which `saved` alone would not restore.
  const discardChanges = () => {
    if (loadedForm.current) setSettings(loadedForm.current);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (blankNumber) {
      showToast(`${blankNumber}: enter a number of days.`, "error");
      return;
    }

    const firstPdfProblem = Object.keys(pdfProblems).find((key) => key in pending);
    if (firstPdfProblem) {
      showToast(`${PDF_CACHE_NUMBERS[firstPdfProblem].label}: ${pdfProblems[firstPdfProblem]}`, "error");
      return;
    }

    if (changeCount === 0) {
      showToast("Nothing has changed yet.", "error");
      return;
    }
    // Turning benefit charging on starts deductions on the next calculation.
    if (settings.benefit_deductions_enabled && !benefitsWereOn.current) {
      const ok = await window.confirm("Every active benefit enrollment will be charged from the next payroll calculation. Check the benefit totals on the Payroll Runs readiness panel first.");
      if (!ok) return;
    }
    setSaving(true);
    try {
      // Only the changed keys. `pdf_render_engine` and emptied cache numbers are
      // stripped inside settingsPatch, so this save keeps working the day those
      // inert columns go.
      const res = await payrollAPI.updateSettings(pending);
      const next = { ...(saved || {}), ...pending, ...(res?.data || {}) };
      setSaved(next);
      // The response carries the stored values, so a box the user emptied on a
      // NOT NULL setting fills back in rather than looking like it saved blank.
      const merged = { ...settings, ...(res?.data || {}) };
      loadedForm.current = merged;
      setSettings(merged);
      benefitsWereOn.current = !!next.benefit_deductions_enabled;
      showToast(`Saved — ${changeCount === 1 ? "1 setting" : `${changeCount} settings`} updated.`);
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
            <h1 className="text-2xl font-bold text-slate-900">
              <HelpLabel text="Payroll Settings" help={help("page", "the Payroll Settings page")} />
            </h1>
            <p className="text-sm text-slate-500 mt-1">The rules every payroll run follows: how pay is worked out, who signs off what, when payslips go out, and what happens when somebody leaves.</p>
          </div>

          {loading ? <Skeleton type="card" /> : !settings ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
              <p className="text-sm font-bold text-slate-700">Couldn’t load the payroll settings.</p>
              <p className="text-xs text-slate-500 mt-1">Nothing has been changed. Try again in a moment.</p>
              <button type="button" onClick={loadSettings} className="mt-4 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition">
                Try again
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <GlanceStrip settings={settings} />
              {/* A card per group, each one closing over its own rules. Folding
                  one no longer leaves a hole in the middle of the grid. */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                {/* General Settings */}
                <Section
                  title="How pay is worked out"
                  icon={HiCalculator}
                  blurb="The two rules behind every amount on a payslip: what a day off without pay costs, and how figures are rounded."
                  summary={`${LOP_SAID[settings.lop_basis] || "Not set"} per unpaid day · ${ROUNDING_SAID[settings.rounding_policy] || "Not set"}`}
                >
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Unpaid days: month divided by</label>
                        <FieldHelp surface="payroll.settings" field="lop_basis" label="what an unpaid day costs" className="mb-2" />
                      </div>
                      <select value={settings.lop_basis} onChange={e => setSettings({...settings, lop_basis: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                        <option value="calendar_days">The days in that month</option>
                        <option value="standard_working_days">That month’s working days</option>
                        <option value="fixed_30">Always 30 days</option>
                      </select>
                      <p className="text-xs text-slate-400 mt-1.5">Sets what one day without pay costs the employee.</p>
                    </div>
                    <div>
                      <div className="flex items-center">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Rounding</label>
                        <FieldHelp {...help("rounding_policy", "the rounding policy")} className="mb-2" />
                      </div>
                      <select value={settings.rounding_policy} onChange={e => setSettings({...settings, rounding_policy: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 outline-none">
                        <option value="nearest_rupee">Nearest rupee</option>
                        <option value="two_decimals">Exact, to the paisa</option>
                      </select>
                    </div>
                  </div>
                </Section>

                {/* Manager Permissions */}
                <Section
                  title="What managers may do"
                  icon={HiUserGroup}
                  blurb="How much of their team’s pay a manager can see, and whether their proposals need HR behind them."
                  summary={`${settings.manager_can_view_team_compensation ? "Can see team pay" : "Cannot see team pay"} · ${settings.manager_direct_compensation_authority ? "changes apply without HR" : "HR approves changes"}`}
                >
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input type="checkbox" checked={settings.manager_can_view_team_compensation} onChange={e => setSettings({...settings, manager_can_view_team_compensation: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                      <div>
                        <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Managers can view team compensation</span>
                        <span className="block text-xs text-slate-500 mt-0.5">Allows managers to see the salary structures and payslips of their direct reports.</span>
                      </div>
                    </label>
                    <div className="flex items-start">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input type="checkbox" checked={settings.manager_direct_compensation_authority} onChange={e => setSettings({...settings, manager_direct_compensation_authority: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                        <div>
                          <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Manager direct compensation authority</span>
                          <span className="block text-xs text-slate-500 mt-0.5">If enabled, manager-proposed salaries and bonuses take effect immediately without HR approval (Tier B to Tier A).</span>
                        </div>
                      </label>
                      <FieldHelp {...help("manager_direct_compensation_authority", "manager direct compensation authority")} overlay />
                    </div>
                  </div>
                </Section>

                {/* HR Approvals */}
                <Section
                  title="HR approvals"
                  icon={HiShieldCheck}
                  blurb="Whether one HR admin can both propose and approve a pay change."
                  summary={settings.payroll_require_separate_checker ? "A second HR admin must approve" : "One HR admin can approve their own change"}
                >
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input type="checkbox" checked={settings.payroll_require_separate_checker} onChange={e => setSettings({...settings, payroll_require_separate_checker: e.target.checked})} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                        <div>
                          <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Require separate checker (Segregation of Duties)</span>
                          <span className="block text-xs text-slate-500 mt-0.5">Requires two distinct HR users: one to propose a change and another to approve it.</span>
                        </div>
                      </label>
                      <FieldHelp {...help("payroll_require_separate_checker", "a separate checker")} overlay />
                    </div>
                  </div>
                </Section>

                {/* Reimbursements & Benefits */}
                <Section
                  title="Claims & benefits"
                  icon={HiReceiptRefund}
                  blurb="Who signs off an expense claim, how far ahead an approved claim may be paid, and whether benefit enrolments are charged in payroll."
                  summary={`${Number(settings.reimbursement_approval_levels) === 1 ? "HR approves claims" : "Manager, then HR"} · ${settings.benefit_deductions_enabled ? "benefits charged" : "benefits not charged"}`}
                >
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
                <Section
                  title="Payslip delivery"
                  icon={HiMail}
                  blurb="When employees get to see a payslip, and whether they are told by email."
                  summary={`${settings.payslip_auto_publish === false ? "Held back until you release them" : "Released when a run is approved"} · ${settings.payslip_auto_email ? "email sent" : "no email"}`}
                >
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

                {/* ── Payslip PDFs (#88–#90). One engine since 30 Sep 2026; the
                    old Classic / New switch (#87) is inert and not shown. ── */}
                {showPdfCache && (
                  <Section
                    title="Payslip PDFs"
                    icon={HiDocumentDownload}
                    blurb="Payslips, annual salary statements and Form 16 are all made the same way. Released payslips are kept ready after the first download, so the next one is instant."
                    summary={settings.payslip_prerender_on_publish === false ? "Prepared the first time somebody downloads one" : "Prepared as soon as a run is released"}
                    defaultOpen={false}
                  >
                    <div className="space-y-5">
                      {"payslip_prerender_on_publish" in settings && (
                        <div className={bulkPaused ? "opacity-60" : ""}>
                          <label className={`flex items-start gap-3 group ${bulkPaused ? "cursor-not-allowed" : "cursor-pointer"}`}>
                            <input
                              type="checkbox"
                              checked={settings.payslip_prerender_on_publish !== false}
                              onChange={(e) => upd({ payslip_prerender_on_publish: e.target.checked })}
                              disabled={bulkPaused}
                              className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                            />
                            <div>
                              <span className="block text-sm font-bold text-slate-700 group-hover:text-purple-700 transition-colors">Get payslips ready as soon as a run is released</span>
                              <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">
                                {bulkPaused
                                  ? "Paused on this server for now, along with every other whole-run PDF job — each payslip is prepared the first time somebody downloads it. Your choice is kept and takes effect once it’s switched back on."
                                  : "Releasing a run prepares its payslips in the background, so downloading them later is instant. Only works while whole-run PDF jobs are switched on for this server; otherwise each one is prepared the first time somebody asks for it."}
                              </span>
                            </div>
                          </label>
                        </div>
                      )}
                      <div className="grid sm:grid-cols-2 gap-6">
                        {Object.entries(PDF_CACHE_NUMBERS).map(([key, rule]) => (
                          key in settings ? (
                            <Num
                              key={key}
                              label={rule.label}
                              value={settings[key]}
                              min={rule.min}
                              max={rule.max}
                              suffix={rule.unit}
                              hint={rule.hint}
                              problem={pdfProblems[key]}
                              onChange={(v) => upd({ [key]: v })}
                            />
                          ) : null
                        ))}
                      </div>
                    </div>
                  </Section>
                )}

                {/* ── Phase 7 · Final settlement (registry #55) ───────────── */}
                <Section
                  title="When someone leaves"
                  icon={HiLogout}
                  blurb="Used to work out the last payment for anyone who leaves — short notice recovered, unused leave paid out, and any outstanding loan settled."
                  summary={`${settings.fnf_notice_recovery_enabled ? "Short notice recovered" : "Short notice not recovered"} · ${settings.fnf_leave_encashment_enabled ? "unused leave paid out" : "no leave payout"} · notice ${Number(settings.fnf_default_notice_period_days) || 0} days`}
                >
                  <div className="grid sm:grid-cols-2 gap-6">
                    <Num label="Standard notice period" value={set7.fnf_default_notice_period_days} min={0} max={365} suffix="days"
                      onChange={(v) => upd({ fnf_default_notice_period_days: v })}
                      problem={blankNumber ? "Enter a number of days — this one can’t be left empty." : ""}
                      hint="Used when an exit doesn't specify its own notice period." />
                    <Pick label="Recover short notice from" value={set7.fnf_notice_recovery_rate_basis} options={RATE_BASIS} help={help("fnf_notice_recovery_rate_basis", "the daily rate basis")}
                      onChange={(v) => upd({ fnf_notice_recovery_rate_basis: v })}
                      hint="Which part of the salary the daily rate is worked out from." />
                    <div className="sm:col-span-2">
                      <Check checked={set7.fnf_notice_recovery_enabled} onChange={(v) => upd({ fnf_notice_recovery_enabled: v })} help={help("fnf_notice_recovery_enabled", "recovering unserved notice")}
                        title="Recover pay for notice that wasn't served"
                        hint="While this is off, leaving early costs the employee nothing, whatever the exit says." />
                    </div>
                    <ComponentPick
                      label="Short notice is charged through"
                      value={set7.fnf_notice_recovery_component_id}
                      onChange={(v) => upd({ fnf_notice_recovery_component_id: v })}
                      components={deductionComponents}
                      emptyLabel="Not set — settlements will be refused"
                      hint="The deduction line it appears on. A settlement can’t be prepared until this is chosen."
                    />
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
                        <LeaveTypePicker
                          codes={set7.fnf_encashment_leave_type_codes}
                          types={leaveTypes}
                          onChange={(codes) => upd({ fnf_encashment_leave_type_codes: codes })}
                          help={help("fnf_encashment_leave_type_codes", "the leave types paid out")}
                        />
                        <Pick label="Work the daily rate from" value={set7.fnf_encashment_rate_basis} options={RATE_BASIS}
                          onChange={(v) => upd({ fnf_encashment_rate_basis: v })} />
                        <Pick label="Divide the monthly salary by" value={set7.fnf_encashment_divisor} options={DIVISOR_BASIS}
                          onChange={(v) => upd({ fnf_encashment_divisor: v })}
                          hint="Turns a monthly salary into a per-day amount." />
                        {/* The cap the server validates. It was never drawn
                            here, so nobody could see — let alone clear — the
                            blank value that was failing every save. */}
                        {serverKnows("fnf_encashment_max_days") && (
                          <Num label="Most days paid out per person" value={set7.fnf_encashment_max_days} min={0} max={365} suffix="days"
                            onChange={(v) => upd({ fnf_encashment_max_days: v })}
                            hint="Anything above this is not paid out. Leave it blank for no limit." />
                        )}
                        {serverKnows("fnf_encashment_component_id") && (
                          <ComponentPick
                            label="Paid through"
                            value={set7.fnf_encashment_component_id}
                            onChange={(v) => upd({ fnf_encashment_component_id: v })}
                            components={earningComponents}
                            emptyLabel="Not set — nothing will be paid out"
                            hint="The earning line the payout appears on, on the final payslip."
                          />
                        )}
                      </div>
                    )}
                  </div>
                </Section>

                {/* ── Phase 7 · Comp-off encashment (registry #57) ──────────── */}
                <Section
                  title="Cashing out earned leave"
                  icon={HiSwitchHorizontal}
                  blurb="Earned leave is credited for working on an off day. With this on, a manager can propose paying those days out as cash instead, and HR approves."
                  summary={settings.compoff_encashment_enabled ? "Allowed, with HR approval" : "Not allowed"}
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
                          hint="Requests above this are refused. Leave it blank for no limit." />
                        {serverKnows("compoff_encashment_component_id") && (
                          <ComponentPick
                            label="Paid through"
                            value={set7.compoff_encashment_component_id}
                            onChange={(v) => upd({ compoff_encashment_component_id: v })}
                            components={earningComponents}
                            className=""
                            emptyLabel="Not set — cash-outs can’t be paid"
                            hint="The earning line a cash-out appears on in that month’s payslip."
                          />
                        )}
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

              {/* The bar follows the page: these cards are tall, and the Save
                  button used to be a scroll away from whatever was just changed.
                  It also says how much is waiting, because only the changed
                  settings are sent. */}
              <div className="sticky bottom-0 z-10 mt-6 -mx-6 sm:-mx-8 px-6 sm:px-8 py-4 border-t border-slate-200 bg-white/95 backdrop-blur-sm flex flex-wrap items-center gap-3">
                <p className={`text-xs font-bold flex-1 min-w-[12rem] ${changeCount > 0 ? "text-purple-700" : "text-slate-400"}`}>
                  {changeCount === 0
                    ? "Everything on this page is saved."
                    : `${changeCount === 1 ? "1 setting" : `${changeCount} settings`} changed — not saved yet.`}
                </p>
                <button
                  type="button"
                  onClick={discardChanges}
                  disabled={saving || changeCount === 0}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Discard changes
                </button>
                <button type="submit" disabled={saving || changeCount === 0} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </form>
          )}
        </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
