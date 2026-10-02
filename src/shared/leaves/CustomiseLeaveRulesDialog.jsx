// ─────────────────────────────────────────────────────────────────────────────
// leaves/CustomiseLeaveRulesDialog.jsx — change ONE leave type's rules for ONE
// person, leaving the policy alone for everybody else
// (PUT /leaves/users/:userId/configs/:leaveTypeId).
//
// Lifted out of the employee profile's Leave tab so the Leave Assignment record
// inspector and that tab share one editor (CLAUDE.md §2). Two callers, one form.
//
// WHAT CHANGED WHEN IT MOVED, AND WHY IT MATTERS:
// It used to open with every field BLANK and a note saying "leave a field blank
// to keep it as it is", because the balances endpoint it was fed carried no
// current-config object. So HR edited leave rules without being able to see
// them — the one thing a rules editor has to show. `GET …/leave-config` now
// returns, per leave type, `effective` (what applies now), `policy_default`
// (what the policy says) and `template_current` (what the template says today).
// The form therefore PREFILLS from `effective` and prints the policy's own value
// under each label, so a customisation reads as a difference, not a guess.
//
// It still sends ONLY what changed. That is no longer about not knowing the
// current values — it is because the PUT is partial and sending a field back
// unchanged would re-apply it, and on `assigned_annual_quota` re-applying means
// another balance adjustment.
//
// LEGACY CONFIGS have no `policy_default`: those people were set up before the
// backend recorded which policy gave them their leave. There is nothing to show
// beneath the labels and nothing for Revert to restore (409 NO_POLICY_DEFAULT),
// so the form says so instead of showing blanks that look like zeroes.
//
// It is a FORM, so it is not a DetailDialog (§3): gridded, wide enough not to
// scroll, pinned footer. It renders as a SIBLING of the record inspector at
// z-[170], never a child (§3 stacking).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { HiExclamationCircle, HiInformationCircle, HiRefresh, HiX } from "react-icons/hi";
import { leaveAPI } from "../api";
import { leaveErrorMessage } from "../utils/leaveErrors";
import { noticeModeOf, noticeValue } from "../utils/leaveConfig";
import { formatDayCount } from "../utils/formatUtils";
import FieldHelp from "../fieldHelp/FieldHelp";

// The policy rules' own hints — each reads the same for one person (§10: once
// per concept, so no second set of hints for the same fields).
const POLICY = (field) => ({ surface: "leaves.policy_setup", field });

const FIELD = "w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";
const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";
const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed";
const SECONDARY_BTN = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed";

const TOGGLE = (on) =>
  `flex-1 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${on ? "bg-purple-600 border-purple-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`;

/** "" for null/undefined so a controlled input never flips to uncontrolled. */
const str = (v) => (v === null || v === undefined ? "" : String(v));

/** What the policy says for one field, as a line of text under its label. */
function policyNote(policyDefault, key, { days = false } = {}) {
  if (!policyDefault) return "";
  const v = policyDefault[key];
  if (v === null || v === undefined) return "";
  if (days) return `Policy: ${formatDayCount(v, { lower: true, fallback: "0 days" })}`;
  return `Policy: ${v}`;
}

/**
 * @param {object} props
 * @param {string} props.userId
 * @param {string} props.leaveTypeId
 * @param {string} [props.leaveTypeName]
 * @param {string} [props.subjectName]      whose rules these are
 * @param {object} [props.effective]        the values now — the prefill
 * @param {object} [props.policyDefault]    what Revert restores; null = legacy
 * @param {object} [props.templateCurrent]  what the template says today
 * @param {string[]} [props.overriddenFields]
 * @param {(message: string) => void} props.onSaved
 * @param {() => void} props.onClose
 * @param {string} [props.zIndex]
 */
export default function CustomiseLeaveRulesDialog({
  userId, leaveTypeId, leaveTypeName = "this leave", subjectName = "",
  effective = null, policyDefault = null, templateCurrent = null, overriddenFields = [],
  onSaved, onClose, zIndex = "z-[170]",
}) {
  const initial = useMemo(() => ({
    assigned_annual_quota: str(effective?.assigned_annual_quota),
    accrual_type: str(effective?.accrual_type),
    max_carry_forward: str(effective?.max_carry_forward),
    probation_restriction_days: str(effective?.probation_restriction_days),
    max_negative_balance: str(effective?.max_negative_balance),
    notice_mode: noticeModeOf(effective?.notice_period_max_days),
    notice_days: effective?.notice_period_max_days ? String(effective.notice_period_max_days) : "",
  }), [effective]);

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState("");
  const busy = saving || reverting;

  const legacy = !policyDefault;
  const who = subjectName || "this employee";

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  }

  // Only genuine differences from what loaded are sent: re-sending
  // assigned_annual_quota unchanged would adjust the balance again.
  const changed = useMemo(() => {
    const keys = ["assigned_annual_quota", "accrual_type", "max_carry_forward", "probation_restriction_days", "max_negative_balance"];
    const out = keys.filter((k) => form[k] !== initial[k]);
    if (form.notice_mode !== initial.notice_mode) out.push("notice_period_max_days");
    else if (form.notice_mode === "capped" && form.notice_days !== initial.notice_days) out.push("notice_period_max_days");
    return out;
  }, [form, initial]);

  // The template moved on after this person was assigned. Worth saying out loud:
  // editing a policy never moves people already on it, so HR expecting the new
  // numbers here would otherwise think the edit failed.
  const drift = useMemo(() => {
    if (!policyDefault || !templateCurrent) return [];
    return Object.keys(policyDefault)
      .filter((k) => templateCurrent[k] !== undefined && String(templateCurrent[k] ?? "") !== String(policyDefault[k] ?? ""))
      .slice(0, 4);
  }, [policyDefault, templateCurrent]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (changed.length === 0) {
      setError("Nothing has been changed yet.");
      return;
    }
    if (form.notice_mode === "capped" && (form.notice_days === "" || parseInt(form.notice_days, 10) < 1)) {
      setError("Enter the most days allowed during the notice period, or choose No limit / Not allowed.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {};
    if (changed.includes("assigned_annual_quota")) payload.assigned_annual_quota = parseFloat(form.assigned_annual_quota) || 0;
    if (changed.includes("accrual_type")) payload.accrual_type = form.accrual_type;
    if (changed.includes("max_carry_forward")) payload.max_carry_forward = parseFloat(form.max_carry_forward) || 0;
    if (changed.includes("probation_restriction_days")) payload.probation_restriction_days = parseInt(form.probation_restriction_days, 10) || 0;
    if (changed.includes("max_negative_balance")) payload.max_negative_balance = parseFloat(form.max_negative_balance) || 0;
    if (changed.includes("notice_period_max_days")) payload.notice_period_max_days = noticeValue(form.notice_mode, form.notice_days);
    try {
      await leaveAPI.overrideConfig(userId, leaveTypeId, payload);
      onSaved?.(`${leaveTypeName} rules updated for ${who}. Their balance was adjusted if it needed to be.`);
    } catch (err) {
      setError(leaveErrorMessage(err, "Couldn’t save these rules. Nothing was changed."));
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (busy) return;
    if (!(await window.confirm(`Put ${leaveTypeName} back to what the policy says for ${who}? Anything set just for them is lost, and their balance is adjusted to match.`))) return;
    setReverting(true);
    setError("");
    try {
      const res = await leaveAPI.revertUserConfig(userId, leaveTypeId);
      const unchanged = res?.data?.outcome === "unchanged";
      onSaved?.(unchanged
        ? `${leaveTypeName} was already exactly what the policy says for ${who}.`
        : `${leaveTypeName} is back to what the policy says for ${who}.`);
    } catch (err) {
      setError(leaveErrorMessage(err, "Couldn’t go back to the policy’s rules."));
      setReverting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4`}
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customise leave rules"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">Customise Leave Rules</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Change the <strong>{leaveTypeName}</strong> rules for {who} only — the policy stays the same for everyone else.
            </p>
          </div>
          <button type="button" onClick={() => onClose?.()} disabled={busy} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 disabled:opacity-40" aria-label="Close">
            <HiX className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5" noValidate>
          {error && (
            <p className="flex items-start gap-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </p>
          )}

          {legacy ? (
            <p className="flex items-start gap-2 text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 leading-relaxed">
              <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
              <span>
                These rules were set up before we started recording which policy they came from, so there is nothing to
                compare them against and nothing to go back to. Assign {who} a policy to get that back.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-xs text-purple-800 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 leading-relaxed">
              <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />
              <span>
                The values below are what {who} has now; the policy’s own figure is shown under each one.
                If you raise the days per year for leave that is <strong>given all at once</strong>, the extra days are added straight away.
                {overriddenFields.length > 0 && " Anything already set just for them is marked."}
              </span>
            </p>
          )}

          {drift.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 leading-relaxed">
              <HiInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
              The policy has been edited since {who} was put on it. The figures below are the ones they were given, not
              the policy’s newest ones — re-assign the policy to move them onto those.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label className={LABEL} htmlFor="clr-quota">
                Days per year{overriddenFields.includes("assigned_annual_quota") && <span className="ml-2 normal-case font-semibold text-purple-600">set for them</span>}
              </label>
              <input id="clr-quota" type="number" step="0.5" min="0" max="365" value={form.assigned_annual_quota}
                onChange={(e) => set("assigned_annual_quota", e.target.value)} disabled={busy} className={FIELD} />
              <p className="text-[10px] text-slate-400 mt-1.5">{policyNote(policyDefault, "annual_quota", { days: true }) || " "}</p>
            </div>

            <div>
              <label className={LABEL}>How it’s given</label>
              <div className="flex gap-2">
                {[{ v: "upfront", l: "All at once" }, { v: "monthly", l: "Every month" }].map((t) => (
                  <label key={t.v} className={`${TOGGLE(form.accrual_type === t.v)} flex items-center justify-center`}>
                    <input type="radio" name="clr-accrual" value={t.v} checked={form.accrual_type === t.v}
                      onChange={() => set("accrual_type", t.v)} disabled={busy} className="sr-only" />
                    {t.l}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {policyDefault?.accrual_type ? `Policy: ${policyDefault.accrual_type === "monthly" ? "Every month" : "All at once"}` : " "}
              </p>
            </div>

            <div>
              <div className="flex items-center">
                <label className={LABEL} htmlFor="clr-carry">Unused days kept for next year</label>
                <FieldHelp {...POLICY("max_carry_forward")} label="days kept for next year" className="mb-1.5" overlay />
              </div>
              <input id="clr-carry" type="number" step="0.5" min="0" value={form.max_carry_forward}
                onChange={(e) => set("max_carry_forward", e.target.value)} disabled={busy} className={FIELD} />
              <p className="text-[10px] text-slate-400 mt-1.5">{policyNote(policyDefault, "max_carry_forward", { days: true }) || " "}</p>
            </div>

            <div>
              <label className={LABEL} htmlFor="clr-probation">Wait after joining (days)</label>
              <input id="clr-probation" type="number" step="1" min="0" value={form.probation_restriction_days}
                onChange={(e) => set("probation_restriction_days", e.target.value)} disabled={busy} className={FIELD} />
              <p className="text-[10px] text-slate-400 mt-1.5">{policyNote(policyDefault, "probation_restriction_days") || " "}</p>
            </div>

            <div>
              <div className="flex items-center">
                <label className={LABEL} htmlFor="clr-negative">Extra days allowed (below zero)</label>
                <FieldHelp {...POLICY("max_negative_balance")} label="extra days below zero" className="mb-1.5" overlay />
              </div>
              <input id="clr-negative" type="number" step="0.5" min="0" value={form.max_negative_balance}
                onChange={(e) => set("max_negative_balance", e.target.value)} disabled={busy} className={FIELD} />
              <p className="text-[10px] text-slate-400 mt-1.5">{policyNote(policyDefault, "max_negative_balance", { days: true }) || " "}</p>
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center">
                <label className={LABEL}>Leave during notice period</label>
                <FieldHelp {...POLICY("notice_period_max_days")} label="leave during notice period" className="mb-1.5" overlay />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { v: "unrestricted", l: "No limit" },
                  { v: "blocked", l: "Not allowed" },
                  { v: "capped", l: "Limited" },
                ].map((opt) => (
                  <button type="button" key={opt.v} onClick={() => set("notice_mode", opt.v)} disabled={busy} className={TOGGLE(form.notice_mode === opt.v)}>
                    {opt.l}
                  </button>
                ))}
              </div>
              {form.notice_mode === "capped" && (
                <input type="number" step="1" min="1" value={form.notice_days} onChange={(e) => set("notice_days", e.target.value)}
                  disabled={busy} placeholder="Most days allowed during notice period" className={`mt-2 ${FIELD}`} />
              )}
              <p className="text-[10px] text-slate-400 mt-1.5">
                “Not allowed” means no leave after resigning; “Limited” allows up to the number of days you enter.
                {policyDefault && ` Policy: ${noticeModeOf(policyDefault.notice_period_max_days) === "unrestricted" ? "no limit" : noticeModeOf(policyDefault.notice_period_max_days) === "blocked" ? "not allowed" : `up to ${policyDefault.notice_period_max_days} days`}.`}
              </p>
            </div>
          </div>
        </form>

        <div className="shrink-0 flex flex-wrap items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {/* Revert is the way out of a customisation nobody remembers making,
              so it sits on the left as a quiet action, not beside Save. */}
          {!legacy && (
            <button type="button" onClick={handleRevert} disabled={busy}
              className="mr-auto inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50 px-3 py-2 rounded-lg transition disabled:opacity-50">
              <HiRefresh className={`w-3.5 h-3.5 ${reverting ? "animate-spin" : ""}`} />
              {reverting ? "Going back…" : "Go back to the policy’s rules"}
            </button>
          )}
          {legacy && <span className="mr-auto" />}
          <button type="button" onClick={() => onClose?.()} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={busy || changed.length === 0} className={PRIMARY_BTN}>
            {saving ? "Saving…" : changed.length === 0 ? "Change something to save" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
