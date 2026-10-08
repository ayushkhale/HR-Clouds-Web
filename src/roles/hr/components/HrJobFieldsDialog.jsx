// ─────────────────────────────────────────────────────────────────────────────
// HrJobFieldsDialog — the job record only HR may change, for somebody else.
//
// HR-ONLY BY DESIGN, and never on yourself. The server refuses a self-target
// with `SELF_EDIT_NOT_ALLOWED`, because these are exactly the fields a person
// must not be able to set for themselves: `work_mode` and `location_id` decide
// where attendance is geofenced, so self-service would let someone exempt
// themselves from it. That is also why this is NOT in EditMemberProfileModal —
// that dialog is shared with the manager workspace and edits personal details.
//
// `reason` IS REQUIRED and is written to the audit log beside a before/after
// diff, so the field asks for a sentence rather than accepting a full stop.
//
// TWO VOCABULARIES: the dropdown offers "On-site / Office" as ONE option whose
// value is `on-site`. The server accepts `office` as an alias but stores and
// returns `on-site`, so a profile never reads back as `office`. Attendance
// reports call the same mode `office` — never compare the two directly
// (shared/attendance/geofence.js).
//
// JOINING DATE IS FILL-ONCE. It drives payroll proration, leave accrual and
// tenure, so once set it can only be corrected elsewhere. The input is disabled
// when a value is already on file rather than letting the save 409.
//
// Contract: md_updates/2026-10-07_hr_fields_expansion_and_work_mode_update_apis.md §2
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { HiBriefcase, HiX } from "react-icons/hi";
import { organizationAPI } from "../../../shared/api";
import { organizationErrorMessage } from "../../../shared/utils/organizationErrors";
import { FieldError, Spinner } from "../../../shared/attendance/ui";
import FieldHelp from "../../../shared/fieldHelp/FieldHelp";

const LBL = "block text-xs font-semibold text-slate-600 mb-1.5";
const CTL = "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white shadow-sm";

// `on-site` is the stored value; "Office" is only ever a label. Listing an
// `office` option as well would let two values mean one mode.
const WORK_MODE_OPTIONS = [
  { value: "on-site", label: "On-site / Office" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "field", label: "Field" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];

const JOB_STATUS_OPTIONS = [
  { value: "probation", label: "On probation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "notice_period", label: "Serving notice" },
  { value: "terminated", label: "Terminated" },
  { value: "trainee", label: "Trainee" },
  { value: "contract", label: "On contract" },
  { value: "temporary", label: "Temporary" },
];

/** Which keys this endpoint accepts, in the order the form shows them. */
const KEYS = [
  "work_mode", "location_id", "designation", "employee_code",
  "employment_type", "job_status", "notice_period_started_on",
  "gender", "marital_status", "joining_date",
];

const ymd = (v) => String(v || "").slice(0, 10);

/** Human names for the `changes` diff, so the toast can say what moved. */
const FIELD_LABELS = {
  work_mode: "work mode", location_id: "base office", designation: "designation",
  employee_code: "employee code", employment_type: "employment type",
  job_status: "job status", notice_period_started_on: "notice start date",
  gender: "gender", marital_status: "marital status", joining_date: "joining date",
};

export default function HrJobFieldsDialog({ userId, name, employee, onClose, onSaved }) {
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(() => ({
    work_mode: employee?.work_mode || "",
    location_id: employee?.location_id || "",
    designation: employee?.designation || "",
    employee_code: employee?.employee_code || "",
    employment_type: employee?.employment_type || "",
    job_status: employee?.job_status || "",
    notice_period_started_on: ymd(employee?.notice_period_started_on),
    gender: employee?.gender || "",
    marital_status: employee?.marital_status || "",
    joining_date: ymd(employee?.joining_date),
    reason: "",
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Fill-once: an existing joining date can only be cleared through a
  // correction workflow, so the field is locked rather than left to 409.
  const joiningLocked = !!ymd(employee?.joining_date);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    organizationAPI.getLocations()
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        setLocations(rows.filter((l) => l.is_active !== false));
      })
      // A failed read leaves the picker empty rather than blocking the dialog;
      // every other field still saves (CLAUDE.md §7).
      .catch(() => { if (!cancelled) setLocations([]); });
    return () => { cancelled = true; };
  }, []);

  /**
   * Only what actually moved, so an untouched field is never written.
   *
   * How a field is CLEARED differs by type and the server is strict about it:
   *   · `designation` / `employee_code` — `""` clears to null.
   *   · `location_id` / `notice_period_started_on` — need an explicit `null`;
   *     `""` is not a uuid or a date.
   *   · the enums — `work_mode` explicitly REJECTS an empty string (§2.2), and
   *     the others are no better. So a "Not set" choice on an enum that
   *     already holds a value is treated as "leave it alone" rather than
   *     silently sending a payload the server will 400. Clearing one of those
   *     is not something this screen offers.
   */
  const CLEAR_WITH_NULL = new Set(["location_id", "notice_period_started_on"]);
  const ENUMS = new Set(["work_mode", "employment_type", "job_status", "gender"]);

  const payload = useMemo(() => {
    const body = {};
    KEYS.forEach((k) => {
      if (k === "joining_date" && joiningLocked) return;
      const now = form[k] ?? "";
      const was = k === "notice_period_started_on" || k === "joining_date"
        ? ymd(employee?.[k])
        : (employee?.[k] ?? "");
      if (String(now) === String(was ?? "")) return;
      if (now === "") {
        if (CLEAR_WITH_NULL.has(k)) body[k] = null;
        else if (!ENUMS.has(k)) body[k] = "";   // designation / employee_code / marital_status
        // enums: skipped — see above
        return;
      }
      body[k] = now;
    });
    return body;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, employee, joiningLocked]);

  const nothingToSave = Object.keys(payload).length === 0;

  const submit = async (e) => {
    e.preventDefault();
    if (nothingToSave) return setError("Nothing has changed yet.");
    const reason = form.reason.trim();
    if (reason.length < 3) return setError("Say why this is changing — it goes in the audit log for whoever reads it later.");
    setError("");
    setSaving(true);
    try {
      const res = await organizationAPI.updateEmployeeHrFields(userId, { ...payload, reason });
      // The server reports exactly what it wrote, so the confirmation names
      // the fields instead of us re-diffing (contract §2.3).
      const changed = Object.keys(res?.data?.changes || {});
      const named = changed.map((k) => FIELD_LABELS[k] || k).join(", ");
      onSaved?.(changed.length ? `Updated ${named} for ${name}.` : `No change was needed for ${name}.`);
    } catch (err) {
      setError(organizationErrorMessage(err, "Couldn't update these job details."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[140] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Job details for ${name}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiBriefcase className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 truncate">Job details</h2>
              <p className="text-xs text-slate-500 truncate">{name} · only HR can change these</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="hrf-work-mode" className={LBL}>Work mode</label>
                <FieldHelp surface="organization.hr_job_fields" field="work_mode" label="work mode" className="mb-1.5" />
              </div>
              <select id="hrf-work-mode" value={form.work_mode} onChange={(e) => set("work_mode", e.target.value)} className={CTL}>
                <option value="">Not set</option>
                {WORK_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="hrf-location" className={LBL}>Base office</label>
                <FieldHelp surface="organization.hr_job_fields" field="location_id" label="base office" className="mb-1.5" />
              </div>
              <select id="hrf-location" value={form.location_id} onChange={(e) => set("location_id", e.target.value)} className={CTL}>
                <option value="">No fixed office</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="hrf-designation" className={LBL}>Designation</label>
              <input id="hrf-designation" type="text" value={form.designation} onChange={(e) => set("designation", e.target.value)} maxLength={150} placeholder="e.g. Senior Field Engineer" className={CTL} />
            </div>

            <div>
              <label htmlFor="hrf-code" className={LBL}>Employee code</label>
              <input id="hrf-code" type="text" value={form.employee_code} onChange={(e) => set("employee_code", e.target.value)} maxLength={100} placeholder="e.g. EMP-0421" className={CTL} />
            </div>

            <div>
              <label htmlFor="hrf-emp-type" className={LBL}>Employment type</label>
              <select id="hrf-emp-type" value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)} className={CTL}>
                <option value="">Not set</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="hrf-job-status" className={LBL}>Job status</label>
                <FieldHelp surface="organization.hr_job_fields" field="job_status" label="job status" className="mb-1.5" />
              </div>
              <select id="hrf-job-status" value={form.job_status} onChange={(e) => set("job_status", e.target.value)} className={CTL}>
                <option value="">Not set</option>
                {JOB_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="hrf-notice" className={LBL}>Notice started on</label>
                <FieldHelp surface="organization.hr_job_fields" field="notice_period_started_on" label="the notice start date" className="mb-1.5" />
              </div>
              <input id="hrf-notice" type="date" value={form.notice_period_started_on} onChange={(e) => set("notice_period_started_on", e.target.value)} className={CTL} />
            </div>

            <div>
              <label htmlFor="hrf-joining" className={LBL}>Joining date</label>
              <input id="hrf-joining" type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} disabled={joiningLocked} className={`${CTL} disabled:bg-slate-50 disabled:text-slate-500`} />
              <p className="text-[10px] text-slate-400 mt-1">
                {joiningLocked
                  ? "Already on file. It drives payroll, leave and tenure, so it can’t be changed here."
                  : "Set once. It drives payroll, leave and tenure."}
              </p>
            </div>

            <div>
              <label htmlFor="hrf-gender" className={LBL}>Gender</label>
              <select id="hrf-gender" value={form.gender} onChange={(e) => set("gender", e.target.value)} className={CTL}>
                <option value="">Not set</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            <div>
              <label htmlFor="hrf-marital" className={LBL}>Marital status</label>
              <input id="hrf-marital" type="text" value={form.marital_status} onChange={(e) => set("marital_status", e.target.value)} maxLength={50} className={CTL} />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="hrf-reason" className={LBL}>Why is this changing? *</label>
              <textarea id="hrf-reason" rows={2} value={form.reason} onChange={(e) => set("reason", e.target.value)} maxLength={500} placeholder="e.g. Moved to the Tata Steel project as a field engineer" className={`${CTL} resize-none`} />
              <p className="text-[10px] text-slate-400 mt-1">Saved with the change so whoever reads the record later knows why.</p>
            </div>
          </div>

          <FieldError message={error} />
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-100 shrink-0">
          {!nothingToSave && (
            <p className="mr-auto text-[11px] font-semibold text-slate-500">
              {Object.keys(payload).length === 1 ? "1 field" : `${Object.keys(payload).length} fields`} will change
            </p>
          )}
          <button type="button" onClick={onClose} disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <button type="submit" disabled={saving || nothingToSave} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-purple-600/20 transition-all active:scale-95 inline-flex items-center gap-2">
            {saving && <Spinner />} Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
