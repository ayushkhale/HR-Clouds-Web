// ─────────────────────────────────────────────────────────────────────────────
// DeviceRegistrationSettings.jsx — the device-trust policy form (registry #14,
// #15), one tab of the Registered Devices page.
//
// It was its own screen until 16 Oct 2026 ("Device Checks"). It moved in beside
// the people list because the two are read together: the only safe way to turn
// Required on is to look at who has a device first, and a separate page meant
// doing that from memory.
//
// ─── THE CONTRACT TRAPS ────────────────────────────────────────────────────
// · THE PUT IS A PARTIAL UPDATE and needs AT LEAST ONE field. This form sends
//   only what HR actually changed (`patchOf`), so an untouched key can never be
//   rewritten with a value the form rounded, and "Save" on an unchanged form is
//   a blocked press with a sentence, not a 400.
// · `If-Match` IS MANDATORY. The token is `data.updated_at` from the GET, not a
//   response header — `request()` parses JSON and can't read `ETag`. A 428 means
//   we sent none, a 412 means somebody else saved first; on 412 we re-read, say
//   which settings moved underneath us, and KEEP the edits in the form. Never a
//   blind retry: that would silently overwrite the other person's change.
//   `saved` is therefore component state, not the prop — a 412 refreshes what
//   the patch is diffed against WITHOUT throwing away what HR typed.
// · ENFORCING WITH NO WAY IN. With both platforms off, nobody can register a
//   device, so Required would refuse every punch in the organisation and the
//   server answers DEVICE_TRUST_MISCONFIGURED. Caught here, before the call.
// · OFF HIDES EVERYTHING ELSE, so with Off chosen the mode is the only key that
//   can have been changed deliberately, and the only one sent.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  HiCheckCircle, HiEye, HiLockClosed, HiShieldCheck, HiShieldExclamation,
} from "react-icons/hi";
import { attendanceAPI } from "../../../../shared/api";
import { TONE_CLASSES } from "../../../../shared/attendance/enums.js";
import { fmtDate, fmtDateTime, todayYMD } from "../../../../shared/attendance/dates";
import { unwrap } from "../../../../shared/attendance/normalize";
import { EmptyState, ErrorState, FieldError, InlineAlert, LoadingRows, Spinner } from "../../../../shared/attendance/ui";
import {
  DEVICE_APPROVAL_OPTIONS, DEVICE_MODES, DEVICE_MODE_OPTIONS,
  DEVICE_OPERATION_OPTIONS, defaultEnforceFrom, platformLabel,
} from "../../../../shared/attendance/deviceTrustMeta";
import { invalidateDeviceTrustContext } from "../../../../shared/attendance/deviceTrust";
import { attendanceErrorMessage, isStalePolicyEdit } from "../../../../shared/utils/attendanceErrors";
import { focusFirstProblem } from "../../../../shared/utils/formGuard";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";

const SURFACE = "attendance.device_checks";
const idFor = (key) => `device-policy-${key}`;

/* The nine keys the PUT accepts. Anything outside this list fails the whole
   request, so the patch is built from it rather than from the form object. */
const POLICY_KEYS = [
  "enforcement_mode", "enforced_operations", "enforce_from", "max_active_devices",
  "registration_approval", "require_device_bound", "allow_platform_web",
  "allow_mobile_key", "challenge_ttl_seconds",
];

const DEVICES_MIN = 1;
const DEVICES_MAX = 10;
const TTL_MIN = 30;
const TTL_MAX = 600;

const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2";
const inputClass = (invalid) =>
  `w-full px-4 py-3 text-sm border rounded-xl bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition ${invalid ? "border-rose-300" : "border-slate-200"}`;

/** The icon per mode, the same three the employee's own page uses. */
const MODE_ICONS = {
  [DEVICE_MODES.OFF]: HiShieldExclamation,
  [DEVICE_MODES.MONITOR]: HiEye,
  [DEVICE_MODES.ENFORCE]: HiShieldCheck,
};

/* ─── Small shared bits ──────────────────────────────────────────────────── */

function Toggle({ id, checked, onChange, label }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-purple-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function ToggleRow({ field, title, description, checked, onChange, error }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 transition ${checked ? "border-purple-200 bg-purple-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">
            {title}
            <FieldHelp surface={SURFACE} field={field} label={title} size="sm" className="ml-1" />
          </p>
          {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
        </div>
        <Toggle id={idFor(field)} label={title} checked={checked} onChange={onChange} />
      </div>
      <FieldError message={error} />
    </div>
  );
}

/** A titled block inside the form, so this reads as four decisions, not twelve boxes. */
function Block({ title, caption, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {caption && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{caption}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─── Form state ─────────────────────────────────────────────────────────── */

const str = (v, d = "") => (v === null || v === undefined ? d : String(v));

/** Server row → form values. Numbers become strings so a cleared box stays cleared. */
function formOf(policy) {
  return {
    enforcement_mode: policy?.enforcement_mode || DEVICE_MODES.OFF,
    enforced_operations: Array.isArray(policy?.enforced_operations) ? policy.enforced_operations : [],
    enforce_from: str(policy?.enforce_from).slice(0, 10),
    max_active_devices: str(policy?.max_active_devices, "1"),
    registration_approval: policy?.registration_approval || "otp",
    require_device_bound: policy?.require_device_bound !== false,
    allow_platform_web: policy?.allow_platform_web !== false,
    allow_mobile_key: policy?.allow_mobile_key !== false,
    challenge_ttl_seconds: str(policy?.challenge_ttl_seconds, "180"),
  };
}

/** Form values → the typed payload the PUT expects. */
function payloadOf(form) {
  return {
    enforcement_mode: form.enforcement_mode,
    enforced_operations: form.enforced_operations,
    // Empty box means "no start date" — the mode applies the moment it is saved.
    enforce_from: form.enforce_from ? form.enforce_from : null,
    max_active_devices: Number(form.max_active_devices),
    registration_approval: form.registration_approval,
    require_device_bound: form.require_device_bound,
    allow_platform_web: form.allow_platform_web,
    allow_mobile_key: form.allow_mobile_key,
    challenge_ttl_seconds: Number(form.challenge_ttl_seconds),
  };
}

/** Order-insensitive for the operations list: the server stores a set. */
const same = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    const x = [...a].sort();
    const y = [...b].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return a === b;
};

/** Only what HR changed. The PUT is partial and needs at least one key. */
function patchOf(form, policy) {
  const next = payloadOf(form);
  const saved = payloadOf(formOf(policy));
  const patch = {};
  for (const key of POLICY_KEYS) if (!same(next[key], saved[key])) patch[key] = next[key];
  // Off hides every other setting, so the mode is the only thing that can have
  // been changed deliberately. Anything else in the patch is leftover editing
  // from before the switch — an emptied operations list, a half-typed number —
  // and sending it would earn a 400 for a box nobody can see.
  if (form.enforcement_mode === DEVICE_MODES.OFF) {
    return "enforcement_mode" in patch ? { enforcement_mode: patch.enforcement_mode } : {};
  }
  return patch;
}

/**
 * §11: the press does the checking. Keys are payload keys, so the message lands
 * under the control it belongs to.
 */
function policyProblems(form) {
  const problems = {};
  // With the check Off, none of the settings below are on screen and none of
  // them do anything. Blocking the save on one would be a dead end: the press
  // reveals and travels (§11), and there is nothing to travel to.
  if (form.enforcement_mode === DEVICE_MODES.OFF) return problems;
  if (form.enforced_operations.length === 0) {
    problems.enforced_operations = "Choose at least one punch to check.";
  }
  const devices = Number(form.max_active_devices);
  if (!Number.isInteger(devices) || devices < DEVICES_MIN || devices > DEVICES_MAX) {
    problems.max_active_devices = `Pick a whole number between ${DEVICES_MIN} and ${DEVICES_MAX}.`;
  }
  const ttl = Number(form.challenge_ttl_seconds);
  if (!Number.isInteger(ttl) || ttl < TTL_MIN || ttl > TTL_MAX) {
    problems.challenge_ttl_seconds = `Pick a whole number of seconds between ${TTL_MIN} and ${TTL_MAX}.`;
  }
  if (!form.allow_platform_web && !form.allow_mobile_key) {
    problems.allow_platform_web = "Leave at least one of these on, or nobody can register a device.";
  }
  return problems;
}

/** A payload key as HR reads it here — used in the 412 message only. */
function settingLabel(key) {
  const LABELS = {
    enforcement_mode: "what the check does",
    enforced_operations: "which punches are checked",
    enforce_from: "the start date",
    max_active_devices: "how many devices each person may keep",
    registration_approval: "what happens before a new device works",
    require_device_bound: "whether copied screen locks are refused",
    allow_platform_web: platformLabel("web").toLowerCase(),
    allow_mobile_key: "the phone app",
    challenge_ttl_seconds: "the time to finish a check",
  };
  return LABELS[key] || key;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

/**
 * @param {object} props
 * @param {object|null} props.policy      GET /device-trust/policy data
 * @param {boolean} props.loading
 * @param {unknown} props.error
 * @param {() => void} props.onReload
 * @param {(fresh: object) => void} props.onSaved
 * @param {object|null} props.coverage    for the confirm, which quotes it
 * @param {boolean} props.coverageKnown
 * @param {number} props.uncovered
 * @param {(message: string) => void} props.showToast
 */
export default function DeviceRegistrationSettings({
  policy, loading, error, onReload, onSaved,
  coverage, coverageKnown, uncovered, showToast,
}) {
  // What the patch is diffed against and what If-Match carries. Starts as the
  // prop and is replaced on a 412 (see the header) — never by the prop alone.
  const [saved, setSaved] = useState(policy);
  const [form, setForm] = useState(() => formOf(policy));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState("");

  useEffect(() => {
    setSaved(policy);
    setForm(formOf(policy));
    setAttempted(false);
    setConflict("");
    setSaveError("");
  }, [policy]);

  const problems = useMemo(() => policyProblems(form), [form]);
  const patch = useMemo(() => patchOf(form, saved), [form, saved]);
  const changed = Object.keys(patch).length > 0;

  const set = (key, value) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Switching to Required with no date set fills in two weeks out rather
      // than locking out the uncovered half tomorrow (frontend guide §5).
      if (key === "enforcement_mode" && value === DEVICE_MODES.ENFORCE && !f.enforce_from) {
        next.enforce_from = defaultEnforceFrom();
      }
      return next;
    });
    setConflict("");
  };

  const toggleOperation = (value) => {
    setForm((f) => ({
      ...f,
      enforced_operations: f.enforced_operations.includes(value)
        ? f.enforced_operations.filter((v) => v !== value)
        : [...f.enforced_operations, value],
    }));
    setConflict("");
  };

  async function save() {
    if (saving) return;
    setSaveError("");
    if (focusFirstProblem(problems, idFor)) { setAttempted(true); return; }
    if (!changed) {
      setAttempted(true);
      setSaveError("Nothing has changed yet. Adjust a setting first.");
      return;
    }

    // The one decision worth a second look: it is the only setting that can
    // stop somebody clocking in tomorrow morning. Bringing the start date
    // forward while already on Required does exactly the same thing, so it
    // asks too — the grace window is the only reason nobody was refused yet.
    const makesItCompulsory = patch.enforcement_mode === DEVICE_MODES.ENFORCE
      || (form.enforcement_mode === DEVICE_MODES.ENFORCE && "enforce_from" in patch);
    if (makesItCompulsory) {
      const when = form.enforce_from ? `from ${fmtDate(form.enforce_from)}` : "straight away";
      const where = coverageKnown
        ? `${coverage.enrolled_users} of ${coverage.active_members} people have registered a device (${Number(coverage.coverage_percentage)}%).`
        : "We couldn’t check how many people have registered a device.";
      const bite = uncovered > 0
        ? ` ${uncovered} ${uncovered === 1 ? "person" : "people"} would not be able to clock in ${when}.`
        : "";
      if (!(await window.confirm(`Make a registered device compulsory ${when}?\n\n${where}${bite}`))) return;
    }

    setSaving(true);
    try {
      const data = unwrap(await attendanceAPI.updateDeviceTrustPolicy(patch, saved?.updated_at));
      setSaved(data || null);
      setForm(formOf(data));
      setAttempted(false);
      setConflict("");
      // Everybody's punch path reads this; drop the cached copy so the next
      // clock-in asks for a device check (or stops asking) without a reload.
      invalidateDeviceTrustContext();
      showToast?.("Device registration settings saved.");
      onSaved?.(data || null);
    } catch (err) {
      // Only a token we actually sent can go stale. Without one (428) nobody
      // else has saved anything — that is ours to fix, so it takes the plain
      // message instead of accusing a colleague.
      if (saved?.updated_at && isStalePolicyEdit(err)) {
        const fresh = unwrap(await attendanceAPI.getDeviceTrustPolicy().catch(() => null));
        if (fresh) {
          const theirs = payloadOf(formOf(fresh));
          const ours = payloadOf(formOf(saved));
          const moved = POLICY_KEYS.filter((key) => !same(theirs[key], ours[key])).map(settingLabel);
          setSaved(fresh);
          setConflict(moved.length
            ? `Somebody else changed ${moved.join(", ")} while this page was open. Your edits are still here — check them against the new values and save again.`
            : "Somebody else saved these settings while this page was open. Your edits are still here — save again to apply them.");
        } else {
          setConflict("Somebody else saved these settings while this page was open. Reload the page before saving again.");
        }
      } else {
        setSaveError(attendanceErrorMessage(err, "Couldn’t save the device registration settings."));
      }
    } finally {
      setSaving(false);
    }
  }

  const modeNow = form.enforcement_mode;
  const startsLater = form.enforce_from && form.enforce_from > todayYMD();

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center shrink-0">
          <HiLockClosed className="w-4 h-4" />
        </span>
        <h2 className="text-base font-bold text-slate-800">Device registration settings</h2>
        {saved?.updated_at && (
          <span className="ml-auto text-[11px] font-medium text-slate-500">Last changed {fmtDateTime(saved.updated_at)}</span>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={onReload} fallback="Couldn’t load the device registration settings." />
      ) : loading ? (
        <div className="p-6"><LoadingRows rows={4} /></div>
      ) : !saved ? (
        <EmptyState
          icon={HiShieldCheck}
          title="Device registration isn’t set up on this server"
          message="Nothing here applies yet. Clocking in works exactly as it does today."
        />
      ) : (
        <div className="px-6 sm:px-8 py-7 space-y-8">
          {conflict && <InlineAlert tone="amber">{conflict}</InlineAlert>}
          {saveError && <InlineAlert tone="rose">{saveError}</InlineAlert>}

          {/* Mode: three cards, because the consequence is the choice. */}
          <Block
            title="What the check does"
            caption="The only setting here that can stop somebody clocking in."
          >
            <div className="flex items-center -mt-2">
              <p className={LABEL}>Choose one</p>
              <FieldHelp surface={SURFACE} field="enforcement_mode" label="what the check does" className="mb-2" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3" role="radiogroup" aria-label="What the check does">
              {DEVICE_MODE_OPTIONS.map((opt) => {
                const active = modeNow === opt.value;
                const Icon = MODE_ICONS[opt.value] || HiShieldCheck;
                return (
                  <button
                    key={opt.value}
                    id={idFor(`enforcement_mode-${opt.value}`)}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set("enforcement_mode", opt.value)}
                    className={`text-left p-4 rounded-2xl border transition ${active ? "border-purple-400 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${active ? "bg-white border-purple-200 text-purple-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                      {opt.value === DEVICE_MODES.ENFORCE && (
                        <span className={`ml-auto px-2 py-0.5 rounded-full border text-[10px] font-bold ${TONE_CLASSES.rose}`}>Can block punches</span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-600 mt-2.5 leading-relaxed">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </Block>

          {modeNow !== DEVICE_MODES.OFF && (
            <>
              <div className="border-t border-slate-100" />

              <Block
                title="What it applies to"
                caption="Which punches are checked, from when, and how many devices each person may keep."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {/* Which punches */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center">
                      <p className={LABEL}>Which punches are checked</p>
                      <FieldHelp surface={SURFACE} field="enforced_operations" label="which punches are checked" className="mb-2" />
                    </div>
                    <div id={idFor("enforced_operations")} className="flex flex-wrap gap-2">
                      {DEVICE_OPERATION_OPTIONS.map((opt) => {
                        const on = form.enforced_operations.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleOperation(opt.value)}
                            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition ${on ? "bg-purple-600 border-purple-600 text-white" : attempted && problems.enforced_operations ? "bg-white border-rose-300 text-slate-600" : "bg-white border-slate-200 text-slate-600 hover:border-purple-300"}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <FieldError message={attempted ? problems.enforced_operations : ""} />
                  </div>

                  {/* When it starts */}
                  <div>
                    <div className="flex items-center">
                      <label htmlFor={idFor("enforce_from")} className={LABEL}>Starts on</label>
                      <FieldHelp surface={SURFACE} field="enforce_from" label="when the check starts" className="mb-2" />
                    </div>
                    <input
                      id={idFor("enforce_from")}
                      type="date"
                      value={form.enforce_from}
                      onChange={(e) => set("enforce_from", e.target.value)}
                      className={inputClass(false)}
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      {form.enforce_from
                        ? startsLater
                          ? `Nothing changes for anyone until ${fmtDate(form.enforce_from)}.`
                          : "Already in force."
                        : "Leave empty to apply it as soon as you save."}
                    </p>
                  </div>

                  {/* Devices per person */}
                  <div>
                    <div className="flex items-center">
                      <label htmlFor={idFor("max_active_devices")} className={LABEL}>Devices each person may keep</label>
                      <FieldHelp surface={SURFACE} field="max_active_devices" label="devices each person may keep" className="mb-2" />
                    </div>
                    <input
                      id={idFor("max_active_devices")}
                      type="number"
                      inputMode="numeric"
                      min={DEVICES_MIN}
                      max={DEVICES_MAX}
                      step={1}
                      value={form.max_active_devices}
                      onChange={(e) => set("max_active_devices", e.target.value)}
                      className={inputClass(attempted && !!problems.max_active_devices)}
                      aria-invalid={attempted && !!problems.max_active_devices}
                    />
                    {attempted && problems.max_active_devices
                      ? <FieldError message={problems.max_active_devices} />
                      : <p className="text-[11px] text-slate-500 mt-1.5">At the limit, registering a new one replaces an old one.</p>}
                  </div>

                  {/* Approval route */}
                  <div>
                    <div className="flex items-center">
                      <label htmlFor={idFor("registration_approval")} className={LABEL}>Before a new device works</label>
                      <FieldHelp surface={SURFACE} field="registration_approval" label="before a new device works" className="mb-2" />
                    </div>
                    <select
                      id={idFor("registration_approval")}
                      value={form.registration_approval}
                      onChange={(e) => set("registration_approval", e.target.value)}
                      className={inputClass(false)}
                    >
                      {DEVICE_APPROVAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      {DEVICE_APPROVAL_OPTIONS.find((o) => o.value === form.registration_approval)?.hint}
                    </p>
                  </div>

                  {/* Challenge lifetime */}
                  <div>
                    <div className="flex items-center">
                      <label htmlFor={idFor("challenge_ttl_seconds")} className={LABEL}>Time to finish a check</label>
                      <FieldHelp surface={SURFACE} field="challenge_ttl_seconds" label="time to finish a check" className="mb-2" overlay />
                    </div>
                    <div className="relative">
                      <input
                        id={idFor("challenge_ttl_seconds")}
                        type="number"
                        inputMode="numeric"
                        min={TTL_MIN}
                        max={TTL_MAX}
                        step={10}
                        value={form.challenge_ttl_seconds}
                        onChange={(e) => set("challenge_ttl_seconds", e.target.value)}
                        className={inputClass(attempted && !!problems.challenge_ttl_seconds)}
                        aria-invalid={attempted && !!problems.challenge_ttl_seconds}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">seconds</span>
                    </div>
                    {attempted && problems.challenge_ttl_seconds
                      ? <FieldError message={problems.challenge_ttl_seconds} />
                      : <p className="text-[11px] text-slate-500 mt-1.5">Longer gives people more time at the fingerprint prompt.</p>}
                  </div>
                </div>
              </Block>

              <div className="border-t border-slate-100" />

              <Block
                title="How a device may be registered"
                caption="Turn both off and nobody can register one, so Required would refuse every punch."
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <ToggleRow
                    field="require_device_bound"
                    title="Only devices that can’t be copied"
                    description="Refuses a screen lock that syncs to the person’s other devices"
                    checked={form.require_device_bound}
                    onChange={(v) => set("require_device_bound", v)}
                  />
                  <ToggleRow
                    field="allow_platform_web"
                    title={platformLabel("web")}
                    description="Register from a laptop or desktop browser"
                    checked={form.allow_platform_web}
                    onChange={(v) => set("allow_platform_web", v)}
                    error={attempted ? problems.allow_platform_web : ""}
                  />
                  <ToggleRow
                    field="allow_mobile_key"
                    title="Phone app"
                    description="Register from the mobile app"
                    checked={form.allow_mobile_key}
                    onChange={(v) => set("allow_mobile_key", v)}
                  />
                </div>
              </Block>
            </>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {changed ? "Only the settings you changed are saved." : "Nothing has changed yet."}
            </p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 transition shadow-md shadow-purple-200 disabled:opacity-60"
            >
              {saving ? <Spinner /> : <HiCheckCircle className="w-4 h-4" />} Save settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
