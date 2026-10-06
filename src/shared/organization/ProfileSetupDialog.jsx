// ─────────────────────────────────────────────────────────────────────────────
// ProfileSetupDialog — an HR filling in their own job profile: the day they
// joined, their office, department, job title, how they're employed and where,
// and the two personal fields leave rules can depend on.
//
// It is a form, so it follows the form rules and not the record-inspector ones
// (CLAUDE.md §3): wide and gridded rather than tall, `max-w-3xl`, pinned
// footer, nothing to scroll past at eight fields.
//
// FOUR THINGS ABOUT THIS FORM THAT ARE NOT OPTIONAL:
//
//  · THE SERVER DECIDES WHAT IS EDITABLE, NOT THIS FILE. Fields come from
//    `missing_fields`; `locked_fields` are shown read-only. Every field is
//    fill-once, guarded in SQL, so a field that was blank when the dialog
//    opened can be locked by the time it submits — which is what
//    `FIELD_ALREADY_SET` means, and why that case re-reads the status and
//    re-renders rather than just showing an error.
//
//  · A PARTIAL SAVE IS A REAL OUTCOME. The call writes the fields it was given;
//    if a later one is rejected the earlier ones are already on file. So the
//    dialog never resets its form from scratch after a failure, and it always
//    hands the caller the `setup_status` the response carried.
//
//  · DEPARTMENTS ARE FILTERED BY THE CHOSEN OFFICE. A department sitting at
//    another office is a `400 LOCATION_MISMATCH` — checked against the office
//    in this payload OR the one already on file. Filtering the list is what
//    stops the user meeting that error at all; the handler for it exists for
//    the case where the office was filled in a previous session.
//
//  · NO DEFAULT JOINING DATE. Not today, not the account's creation date. It is
//    fill-once and feeds payroll proration, leave accrual and tenure, and the
//    only correction route is another HR — which a one-HR organisation hasn't
//    got.
//
// Contract: `md_organization/4_org_employee_api.md` §11.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheckCircle, HiExclamationCircle, HiLockClosed, HiSparkles, HiX } from "react-icons/hi";
import { organizationAPI } from "../api";
import { todayYMD } from "../attendance/dates.js";
import FieldHelp from "../fieldHelp/FieldHelp";
import { organizationErrorCode, organizationErrorMessage } from "../utils/organizationErrors.js";
import {
  MIN_JOINING_DATE,
  fieldError,
  fieldIsReady,
  jobProfileBody,
  lockedFields,
  normalizeSetupStatus,
  setupFieldShort,
  setupFields,
  setupValueLabel,
} from "./profileSetupMeta.js";

const FIELD = "w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";
const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider";
// Which fields get an ⓘ. The others are ordinary — a job title and the day
// someone joined need no explaining (CLAUDE.md §10). These five are either our
// own vocabulary or they land on payroll and leave, and each is an onboarding
// entry, so the 4-per-screen cap doesn't apply to them.
const HELP_FIELDS = new Set(["joining_date", "employment_type", "work_mode", "marital_status", "department_id"]);
const rowsOf = (res) => (Array.isArray(res?.data) ? res.data : []);
const activeOnly = (rows) => rows.filter((r) => r.is_active !== false);
const idOf = (row) => row.id || row._id;

/**
 * @param {object} props
 * @param {object} props.status      normalised setup status (see profileSetupMeta)
 * @param {Function} props.onStatus  called with every fresh status the server sends
 * @param {Function} props.onSaved   called with a sentence to toast, after a write
 * @param {Function} props.onClose
 */
export default function ProfileSetupDialog({ status, onStatus, onSaved, onClose }) {
  const today = todayYMD();
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  // A partial save leaves this dialog open, and the host's confirmation may be
  // behind it (My Profile reports inline, not as a toast). The fields that
  // landed do disappear from the form, but "some boxes went away" is not
  // confirmation that anything was written.
  const [savedNote, setSavedNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState({ departments: [], locations: [], loading: true, failed: [] });
  // `submitting` is a render behind the click, so a fast second Enter can get
  // past it. Fill-once makes the duplicate harmless on the server (it 409s),
  // but the 409 would then be shown as if the user had done something wrong.
  const inFlight = useRef(false);

  const fields = useMemo(() => setupFields(status).filter((f) => fieldIsReady(f.key, status)), [status]);
  const locked = useMemo(() => lockedFields(status), [status]);
  const needsDepartments = fields.some((f) => f.kind === "department");
  const needsLocations = fields.some((f) => f.kind === "location");
  const needsPickers = needsDepartments || needsLocations;
  // Everything still to fill is a picker with nothing to pick from yet. Not the
  // same as "nothing left to do", and saying so would be a lie — the checklist
  // behind this dialog has the step that fixes it.
  const onlyBlockedByOrg = fields.length === 0 && (status?.missing?.length || 0) > 0;

  const loadPickers = useCallback(async () => {
    setPicker((p) => ({ ...p, loading: true, failed: [] }));
    const [deptRes, locRes] = await Promise.allSettled([
      organizationAPI.getDepartments(),
      organizationAPI.getLocations(),
    ]);
    setPicker({
      departments: deptRes.status === "fulfilled" ? activeOnly(rowsOf(deptRes.value)) : [],
      locations: locRes.status === "fulfilled" ? activeOnly(rowsOf(locRes.value)) : [],
      loading: false,
      // Only a failed read of a list this form is actually offering counts.
      // Both are fetched in one go because either may be needed, but an HR who
      // only has a department left to pick must not be told the offices
      // couldn't load.
      failed: [
        deptRes.status === "rejected" && "departments",
        locRes.status === "rejected" && "locations",
      ].filter(Boolean),
    });
  }, []);

  useEffect(() => { if (needsPickers) loadPickers(); else setPicker((p) => ({ ...p, loading: false })); }, [needsPickers, loadPickers]);

  // Escape closes it, as every other dialog in the app does. Safe here because
  // closing loses nothing that was saved — each successful call has already
  // landed, and the form holds only answers not yet sent.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The office this person is being put at: the one they just chose, else the
  // one already on file. Both are cross-checked by the server, so both filter.
  const effectiveLocationId = form.location_id || status?.values?.location_id || "";
  const departmentOptions = useMemo(() => {
    if (!effectiveLocationId) return picker.departments;
    // A department with no office of its own belongs to no office in
    // particular, so it can't mismatch and stays available.
    return picker.departments.filter((d) => !d.location_id || String(d.location_id) === String(effectiveLocationId));
  }, [picker.departments, effectiveLocationId]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
    setError("");
    // Changing the office can strand a department chosen at the old one, and
    // sending that pair is the exact 400 this form is built to avoid.
    if (key === "location_id") {
      setForm((f) => {
        if (!f.department_id) return f;
        const dept = picker.departments.find((d) => String(idOf(d)) === String(f.department_id));
        const stillValid = !dept?.location_id || !value || String(dept.location_id) === String(value);
        return stillValid ? f : { ...f, department_id: "" };
      });
    }
  };

  /** Re-read the status after a 409, so the locked fields flip without a reload. */
  const refreshStatus = useCallback(async () => {
    try {
      const next = normalizeSetupStatus(await organizationAPI.getMySetupStatus());
      onStatus?.(next);
      return next;
    } catch {
      return null;
    }
  }, [onStatus]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (inFlight.current) return;

    const found = {};
    for (const f of fields) {
      const message = fieldError(f.key, form[f.key], today);
      if (message) found[f.key] = message;
    }
    if (Object.keys(found).length) { setErrors(found); return; }

    const body = jobProfileBody(form, status?.missing);
    if (!body) {
      setError("Fill in at least one of these before saving.");
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError("");
    setSavedNote("");
    try {
      const res = await organizationAPI.updateMyJobProfile(body);
      // The response normally carries the recomputed status, so the wizard
      // advances on it with no second GET. When it doesn't, that is NOT an
      // empty status — normalising `undefined` would hand back "nothing
      // missing, not complete", which reads on the card as "still has 0 details
      // missing" with everything disabled. Re-read instead.
      const fresh = res?.data?.setup_status;
      const next = fresh ? normalizeSetupStatus(fresh) : await refreshStatus();
      const saved = Object.keys(body).filter((k) => k !== "reason");
      if (!next) {
        // The write landed but we can no longer say what is left. Report the
        // write and close; the card re-reads on its next mount.
        onSaved?.(`Saved ${saved.length} ${saved.length === 1 ? "answer" : "answers"}.`);
        onClose?.();
        return;
      }
      if (fresh) onStatus?.(next);   // refreshStatus already reported it
      onSaved?.(
        next.isComplete
          ? "Your profile is complete — leave and payroll can include you now."
          : `Saved. ${saved.length} ${saved.length === 1 ? "answer" : "answers"} on file, ${next.missing.length} to go.`,
      );
      if (next.isComplete || next.missing.length === 0) onClose?.();
      else {
        setForm({});
        setSavedNote(`${saved.length === 1 ? "That answer is" : `Those ${saved.length} answers are`} saved. ${next.missing.length} still to go.`);
      }
    } catch (err) {
      const code = organizationErrorCode(err);
      if (code === "FIELD_ALREADY_SET") {
        // Not a fault: a second tab, a retry, or the department step having
        // already filled this in. Re-read and let the form re-render — the
        // fields that landed leave `missing`, so they stop being asked for.
        const next = await refreshStatus();
        if (next?.isComplete) {
          // This dialog is about to be unmounted by the card, so a message set
          // in its own state would never be read.
          onSaved?.("That was already saved, and your profile is now complete.");
          onClose?.();
          return;
        }
        // Drop only the answers that are no longer askable; a 409 writes
        // nothing, so everything else the user typed is still needed.
        if (next) {
          const stillOpen = new Set(next.missing);
          setForm((f) => Object.fromEntries(Object.entries(f).filter(([k]) => stillOpen.has(k))));
        }
        setError(organizationErrorMessage(err, "Some of this was already saved. We’ve reloaded what’s on file."));
      } else if (code === "DEPARTMENT_NOT_FOUND" || code === "LOCATION_NOT_FOUND" || code === "DEPARTMENT_INACTIVE" || code === "LOCATION_INACTIVE") {
        // The list this form offered is out of date; reload it before the user
        // picks again, or they'd pick the same dead row.
        await loadPickers();
        setError(organizationErrorMessage(err));
      } else if (code === "LOCATION_MISMATCH") {
        await loadPickers();
        setForm((f) => ({ ...f, department_id: "" }));
        setError(organizationErrorMessage(err));
      } else {
        setError(organizationErrorMessage(err, "Couldn’t save that. Check the details and try again."));
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const nameOfDept = (id) => picker.departments.find((d) => String(idOf(d)) === String(id))?.name || "";
  const nameOfLoc = (id) => picker.locations.find((l) => String(idOf(l)) === String(id))?.name || "";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <HiSparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-bold text-slate-800">Finish your own profile</h2>
                <FieldHelp surface="organization.profile_setup" field="page" label="finishing your profile" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                These are your own staff details. Each one can only be set once.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400" aria-label="Close">
            <HiX className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}

          {savedNote && !error && (
            <div role="status" className="flex items-start gap-2 text-sm font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
              <HiCheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-violet-500" />{savedNote}
            </div>
          )}

          {((needsDepartments && picker.failed.includes("departments")) || (needsLocations && picker.failed.includes("locations"))) && (
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <span>
                Couldn’t load the {needsDepartments && picker.failed.includes("departments") ? "departments" : "offices"} to choose from.
              </span>
              <button type="button" onClick={loadPickers} className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-100 transition">Try again</button>
            </div>
          )}

          {fields.length === 0 ? (
            <p className="text-sm text-slate-500 leading-relaxed">
              {onlyBlockedByOrg
                ? `Your ${status.missing.map(setupFieldShort).join(" and ")} can’t be chosen until the organisation has one. Close this, add ${status.missing.length === 1 ? "it" : "them"} from the checklist, then come back.`
                : "There’s nothing left for you to fill in here."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {fields.map((f) => {
                const id = `setup-${f.key}`;
                const help = HELP_FIELDS.has(f.key) ? <FieldHelp surface="organization.profile_setup" field={f.key} label={f.label} overlay /> : null;
                const options = f.kind === "department" ? departmentOptions : f.kind === "location" ? picker.locations : f.options;
                return (
                  <div key={f.key} className={f.span ? "sm:col-span-2" : ""}>
                    <div className="flex items-center mb-1.5">
                      <label className={LABEL} htmlFor={id}>{f.label}</label>
                      {help}
                    </div>
                    {f.kind === "date" ? (
                      <input
                        id={id} type="date" value={form[f.key] || ""} max={today} min={MIN_JOINING_DATE}
                        onChange={(e) => set(f.key, e.target.value)} disabled={submitting}
                        className={`${FIELD} ${errors[f.key] ? "border-rose-300" : ""}`}
                      />
                    ) : f.kind === "text" ? (
                      <input
                        id={id} type="text" value={form[f.key] || ""} maxLength={f.maxLength} placeholder={f.placeholder}
                        onChange={(e) => set(f.key, e.target.value)} disabled={submitting}
                        className={`${FIELD} ${errors[f.key] ? "border-rose-300" : ""}`}
                      />
                    ) : (
                      <select
                        id={id} value={form[f.key] || ""} disabled={submitting || (f.kind !== "select" && picker.loading)}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={`${FIELD} ${errors[f.key] ? "border-rose-300" : ""}`}
                      >
                        <option value="">
                          {f.kind === "select" ? "Choose one" : picker.loading ? "Loading…" : "Choose one"}
                        </option>
                        {(options || []).map((o) => (
                          f.kind === "select"
                            ? <option key={o.value} value={o.value}>{o.label}</option>
                            : <option key={idOf(o)} value={idOf(o)}>{o.name}</option>
                        ))}
                      </select>
                    )}
                    {errors[f.key]
                      ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{errors[f.key]}</p>
                      : f.note && <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{f.note}</p>}
                    {/* Said where it happens: a department list that went empty
                        because of the chosen office looks like a broken select. */}
                    {/* The office is no longer chosen here (2026-10-05), so this
                        can't tell anyone to pick a different one — and with no
                        office to filter by, every department is offered. */}
                    {f.kind === "department" && !picker.loading && departmentOptions.length === 0 && picker.departments.length > 0 && (
                      <p className="text-[11px] text-fuchsia-600 font-medium mt-1">
                        No department is available to join yet. Add one from the checklist, then come back.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {locked.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <HiLockClosed className="w-3 h-3 text-slate-400" />
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Already on file</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {locked.map(({ field, value }) => (
                  <div key={field.key}>
                    <label className={LABEL} htmlFor={`setup-locked-${field.key}`}>{field.label}</label>
                    <input
                      id={`setup-locked-${field.key}`} type="text" readOnly disabled
                      value={setupValueLabel(field.key, value, { departmentName: nameOfDept(value), locationName: nameOfLoc(value) }) || "N/A"}
                      className={`${FIELD} mt-1.5 bg-slate-50 text-slate-500 cursor-not-allowed`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                These feed payroll, leave and your length of service, so they’re set once and then only another HR can
                correct them — from your profile under People.
              </p>
            </div>
          )}

          {status?.unknownMissing?.length > 0 && (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {status.unknownMissing.length === 1 ? "One more detail is" : `${status.unknownMissing.length} more details are`} still
              needed on your record, and another HR will have to add {status.unknownMissing.length === 1 ? "it" : "them"} for you.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
            {/* Not "Cancel": anything already saved stays saved, and a button
                that says Cancel next to a fill-once write reads like an undo. */}
            Close
          </button>
          <button type="submit" disabled={submitting || fields.length === 0} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60">
            {submitting ? "Saving…" : "Save these answers"}
          </button>
        </div>
      </form>
    </div>
  );
}
