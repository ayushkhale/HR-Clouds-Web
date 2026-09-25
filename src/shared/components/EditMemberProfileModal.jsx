import { useEffect, useState } from "react";
import { HiExclamationCircle, HiPencil, HiX } from "react-icons/hi";
import { organizationAPI } from "../api";

const FIELD = "w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition";
const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5";

/**
 * Edit one team member's personal details. Used by HR from the employee
 * profile and by a manager from a direct report's profile — the same endpoint
 * (`PATCH /organizations/employees/:id`) serves both, and the server enforces
 * the hierarchy, so a manager reaching outside their team is refused there.
 *
 * The field set matches self-service, which is what the endpoint accepts.
 * Verified against the API on 2026-09-24: `dob`, `blood_group`,
 * `personal_email`, `current_address`, `permanent_address`, `city`, `state`
 * and `pincode` are all accepted; `gender`, `marital_status`, `designation`,
 * `employee_code`, `department` and `pan_number` are rejected (400) and so are
 * not offered.
 *
 * `profile` is the detail record when the caller already has it; otherwise it
 * is loaded here, because the roster projection carries no phone or address and
 * saving blanks over them would clear real values.
 */
// `name`, `phone_number`, `work_location` and `location_id` are deliberately
// absent. Re-verified against the API on 2026-09-26: all four are stripped from
// the payload, and a body containing only one comes back 400 "At least one field
// must be provided to update" — while the same request with `first_name`
// succeeds. So this modal, which previously sent exactly name/phone/avatar,
// could only ever fail unless the photo happened to change too.
//
// THE DISPLAY NAME IS ASYMMETRIC. It is WRITTEN as `display_name` and READ BACK
// as `name` — sending `name` is what fails, sending `display_name` works. It is
// also independent of `first_name` / `last_name`: it is what somebody was called
// when they were invited, so an account can read `name: "mealex517"` while its
// `first_name` is "Diamond". Changing it leaves both untouched, and the new
// value shows up in the roster and the org directory.
//
// Work location genuinely cannot be set here: it comes from the invitation and
// from the location on someone's department, so it moves with a department
// transfer. It is shown locked rather than as a box that silently does nothing.
const FIELDS = [
  {
    key: "display_name", label: "Display name", type: "text", required: true, full: true,
    hint: "How this person's name appears everywhere in HR Clouds — the directory, their dashboard and every list. Independent of the first and last name below.",
  },
  { key: "first_name", label: "First name", type: "text", required: true },
  { key: "last_name", label: "Last name", type: "text" },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "blood_group", label: "Blood group", type: "text", placeholder: "e.g. O+" },
  { key: "personal_email", label: "Personal email", type: "email" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "pincode", label: "Pincode", type: "text", inputMode: "numeric" },
  { key: "current_address", label: "Current address", type: "textarea", full: true },
  { key: "permanent_address", label: "Permanent address", type: "textarea", full: true },
  { key: "avatar_url", label: "Photo URL", type: "url", full: true },
];

/** Shown so the record reads as complete, never sent — the endpoint drops them. */
const LOCKED_FIELDS = [
  { key: "work_location", label: "Work location" },
  { key: "designation", label: "Designation" },
  { key: "department", label: "Department" },
  { key: "employee_code", label: "Employee code" },
];

export default function EditMemberProfileModal({ userId, name, profile, onClose, onSaved }) {
  const blank = Object.fromEntries(FIELDS.map((f) => [f.key, ""]));
  const seed = (d) => {
    // Fall back to splitting the composite name for records that only carry it.
    const [first, ...rest] = String(d?.name || name || "").trim().split(/\s+/);
    return {
      ...blank,
      ...Object.fromEntries(FIELDS.map((f) => [f.key, d?.[f.key] ?? ""])),
      // Written as `display_name`, read back as `name` — see the note above.
      display_name: d?.display_name || d?.name || name || "",
      first_name: d?.first_name || first || "",
      last_name: d?.last_name || rest.join(" ") || "",
      avatar_url: d?.avatar_url || d?.avatar || "",
      dob: String(d?.dob || "").slice(0, 10),
      ...Object.fromEntries(LOCKED_FIELDS.map((f) => {
        const value = d?.[f.key];
        // Department and work location can arrive as an object or a string.
        return [f.key, (value && typeof value === "object" ? value.name : value) || ""];
      })),
    };
  };
  const [form, setForm] = useState(profile ? seed(profile) : blank);
  const [initial, setInitial] = useState(profile ? seed(profile) : blank);
  const [loading, setLoading] = useState(!profile);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) return undefined;
    if (!userId) {
      setError("This team member has no resolvable id.");
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    organizationAPI.getEmployee(userId)
      .then((res) => {
        if (cancelled) return;
        const seeded = seed(res?.data);
        setForm(seeded);
        setInitial(seeded);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.data?.message || "Could not load the current profile. Only fields you edit will be saved.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !submitting && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!userId) return;
    if (!form.display_name.trim()) {
      setError("Display name cannot be empty.");
      return;
    }
    if (!form.first_name.trim()) {
      setError("First name cannot be empty.");
      return;
    }

    // Send only what changed, so untouched fields are never cleared. `initial`
    // is the seeded form, so its `display_name` already holds what the record
    // returned as `name` — no special case needed here.
    const payload = {};
    FIELDS.forEach(({ key }) => {
      const next = String(form[key] ?? "").trim();
      const prev = String(initial[key] ?? "").trim();
      if (next !== prev) payload[key] = next;
    });
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await organizationAPI.updateEmployeeProfile(userId, payload);
      onSaved?.(`${form.display_name.trim() || [form.first_name, form.last_name].filter(Boolean).join(" ").trim() || "This member"}'s profile was updated.`);
    } catch (err) {
      setError(err?.data?.message || err.message || "Failed to update profile.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <HiPencil className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Edit profile</h2>
              <p className="text-xs text-slate-400 mt-0.5">Update {name || "this team member"}&apos;s details.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400" aria-label="Close">
            <HiX className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
                <label className={LABEL} htmlFor={`member-${f.key}`}>
                  {f.label}{f.required && <span className="text-rose-400"> *</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    id={`member-${f.key}`} name={f.key} rows={2} value={form[f.key] ?? ""}
                    onChange={handleChange} disabled={loading} className={`${FIELD} resize-none`}
                  />
                ) : (
                  <input
                    id={`member-${f.key}`} type={f.type} name={f.key} value={form[f.key] ?? ""}
                    onChange={handleChange} disabled={loading} required={f.required}
                    placeholder={f.placeholder} inputMode={f.inputMode} className={FIELD}
                  />
                )}
                {f.hint && <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{f.hint}</p>}
              </div>
            ))}
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Set elsewhere</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LOCKED_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={LABEL} htmlFor={`member-locked-${f.key}`}>{f.label}</label>
                  <input
                    id={`member-locked-${f.key}`}
                    type="text"
                    value={form[f.key] || "Not set"}
                    readOnly
                    disabled
                    className={`${FIELD} bg-slate-50 text-slate-500 cursor-not-allowed`}
                  />
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Role, designation, department, employee code and work location can&apos;t be changed here — a work location
            comes from the invitation and from the location set on someone&apos;s department, so it moves with a
            department transfer rather than being edited per person.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancel</button>
          <button type="submit" disabled={submitting || loading} className="flex-1 px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-60">
            {loading ? "Loading…" : submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
