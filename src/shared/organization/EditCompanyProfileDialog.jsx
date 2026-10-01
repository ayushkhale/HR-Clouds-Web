// ─────────────────────────────────────────────────────────────────────────────
// organization/EditCompanyProfileDialog.jsx — HR edits the company's own
// details: name, what it does, where it is, and its tax registrations.
//
// A form, not a record inspector (CLAUDE.md §3), and a big one, so it follows
// the Create Attendance Policy shape: max-w-5xl, max-h-[92vh], uppercase 11px
// labels, a two-column grid, a pinned footer. Nobody should scroll to find the
// Save button, and nobody should meet sixteen stacked full-width boxes.
//
// Contract: PATCH /organizations/profile (`public/ref docs/
// 6_org_profile_management_api.md` §1). Traps, each handled here:
// • The PATCH is PARTIAL and rejects an empty body. Save sends only what
//   changed (`changedFields`) and is disabled until something has.
// • `org_name` renames the ORGANISATION, not just this card — it is the one
//   field with a consequence outside this page, so the form says so.
// • `gst_number` / `company_pan_number` come back to HR only, as absent keys.
//   The two boxes appear only when the read returned them; otherwise they are
//   omitted from the payload entirely, so a save can never blank a value this
//   session was never shown.
// • The logo is NOT here. PATCH strips `logo_url` / `logo_storage_key`; it has
//   its own handshake (CompanyLogoDialog).
// • The response IS the refreshed details payload, so the page takes it
//   straight — no second read, no stale card.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiOfficeBuilding, HiX, HiCheck, HiExclamationCircle, HiLockClosed } from "react-icons/hi";
import FieldHelp from "../fieldHelp/FieldHelp";
import { organizationAPI } from "../api";
import { organizationErrorMessage } from "../utils/organizationErrors";
import {
  FOUNDED_MIN, INDUSTRY_OPTIONS, SIZE_OPTIONS, STATUTORY_FIELDS, changedFields, foundedMax,
  profileFormFrom, statutoryVisible, validateProfileForm,
} from "./orgProfileMeta";
import { isIndianPincode, lookupIndianPincode } from "../api/pincode.api";
import { INDIAN_STATES, findIndianStateByName } from "../data/indianStates";

// What the PIN code line says after a lookup.
const PIN_HINT = {
  looking: "Looking up the PIN code…",
  filled: "City and state filled in from the PIN code.",
  notfound: "We couldn’t find this PIN code. Fill in the city and state yourself.",
  failed: "Couldn’t look up the PIN code right now. Fill in the city and state yourself.",
};
const isIndia = (country) => ["", "india", "bharat"].includes(String(country || "").trim().toLowerCase());
/** The list a select offers: the known options, plus a saved value that isn't one of them. */
const withCurrent = (options, current) => (current && !options.includes(current) ? [current, ...options] : options);

const SURFACE = "organization.company_profile_edit";

const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5";
const INPUT = "w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-purple-100 transition";
const ok = "border-slate-200 focus:border-purple-500";
const bad = "border-rose-300 focus:border-rose-500 focus:ring-rose-100";

/** One labelled box. `help` puts the ⓘ beside the label, never inside it. */
function Field({ id, label, help, error, hint, className = "", children }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center">
        <label htmlFor={id} className={LABEL}>{label}</label>
        {help && <FieldHelp surface={SURFACE} field={help} label={label} size="sm" className="mb-1.5" />}
      </div>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-semibold text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export default function EditCompanyProfileDialog({ details, onClose, onSaved }) {
  const initial = useMemo(() => profileFormFrom(details), [details]);
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  savingRef.current = saving;

  const showStatutory = statutoryVisible(details);
  const omit = showStatutory ? [] : STATUTORY_FIELDS;

  const problems = validateProfileForm(form);
  const payload = changedFields(initial, form, { omit });
  const changed = Object.keys(payload).length > 0;
  const blocked = Object.keys(problems).length > 0;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // PIN code → city and state (India Post, pincode.api.js). Only a PIN the
  // person typed is looked up — opening the dialog on a saved address never
  // rewrites it — and a slower, older answer never lands over a newer one.
  const [pinStatus, setPinStatus] = useState("");
  const pinTyped = useRef(false);
  const onPinChange = (e) => { pinTyped.current = true; setPinStatus(""); set("zip_code")(e); };
  useEffect(() => {
    const pin = form.zip_code.trim();
    if (!pinTyped.current || !isIndianPincode(pin) || !isIndia(form.country)) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPinStatus("looking");
      try {
        const found = await lookupIndianPincode(pin, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!found) { setPinStatus("notfound"); return; }
        const state = findIndianStateByName(found.state)?.name || found.state;
        setForm((f) => ({ ...f, city: found.city || f.city, state: state || f.state, country: f.country.trim() ? f.country : "India" }));
        setPinStatus("filled");
      } catch {
        if (!controller.signal.aborted) setPinStatus("failed");
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form.zip_code, form.country]);
  const stateOptions = withCurrent(INDIAN_STATES.map((st) => st.name), form.state);

  // Escape closes — but never mid-save, where closing would hide a write in flight.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !savingRef.current) onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (blocked || !changed || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await organizationAPI.updateOrganizationProfile(payload);
      onSaved(res?.data ?? null, "org_name" in payload);
    } catch (err) {
      setError(organizationErrorMessage(err, "Couldn’t save the company details. Try again."));
      setSaving(false);
    }
  }

  const err = (key) => (touched ? problems[key] : "");
  const cls = (key) => `${INPUT} ${err(key) ? bad : ok}`;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-edit-title"
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-5xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiOfficeBuilding className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h3 id="company-edit-title" className="text-base font-bold text-slate-900">Edit company details</h3>
              <p className="text-xs text-slate-500">Everyone in the organisation sees this on Company Profile.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-8">
          {/* ── The company ── */}
          <section className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700">The company</h4>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field
                id="org_name"
                label="Company name"
                help="org_name"
                error={err("org_name")}
                hint="Used across the app, not only here."
              >
                <input id="org_name" value={form.org_name} onChange={set("org_name")} maxLength={150} className={cls("org_name")} placeholder="Acme Technologies Pvt Ltd" />
              </Field>

              <Field id="org_alias" label="Short name" error={err("org_alias")} hint="What people call it day to day. Optional.">
                <input id="org_alias" value={form.org_alias} onChange={set("org_alias")} maxLength={100} className={cls("org_alias")} placeholder="Acme" />
              </Field>

              <Field id="industry" label="Industry" error={err("industry")}>
                <select id="industry" value={form.industry} onChange={set("industry")} className={cls("industry")}>
                  <option value="">Select industry</option>
                  {withCurrent(INDUSTRY_OPTIONS, form.industry).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>

              <Field id="size" label="Company size" help="size" error={err("size")}>
                <input
                  id="size"
                  list="org-size-options"
                  value={form.size}
                  onChange={set("size")}
                  maxLength={50}
                  className={cls("size")}
                  placeholder="51-200"
                />
                <datalist id="org-size-options">
                  {SIZE_OPTIONS.map((o) => <option key={o} value={o} />)}
                </datalist>
              </Field>

              <Field id="founded_year" label="Founded" error={err("founded_year")} hint={`Any year from ${FOUNDED_MIN} to ${foundedMax()}.`}>
                <input id="founded_year" inputMode="numeric" value={form.founded_year} onChange={set("founded_year")} maxLength={4} className={cls("founded_year")} placeholder="2014" />
              </Field>

              <Field id="website" label="Website" error={err("website")}>
                <input id="website" value={form.website} onChange={set("website")} maxLength={255} className={cls("website")} placeholder="acme.com" />
              </Field>

              <Field id="phone_number" label="Phone" error={err("phone_number")}>
                <input id="phone_number" value={form.phone_number} onChange={set("phone_number")} maxLength={20} className={cls("phone_number")} placeholder="+91 80 4567 8900" />
              </Field>

              <Field id="description" label="About the company" className="sm:col-span-2" hint="A short paragraph. New people read this first.">
                <textarea id="description" value={form.description} onChange={set("description")} rows={4} className={`${cls("description")} resize-y`} placeholder="What the company does, in a few sentences." />
              </Field>
            </div>
          </section>

          {/* ── Address ── */}
          <section className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700">Address</h4>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field id="address_line_1" label="Address line 1" className="sm:col-span-2" error={err("address_line_1")}>
                <input id="address_line_1" value={form.address_line_1} onChange={set("address_line_1")} maxLength={255} className={cls("address_line_1")} placeholder="4th Floor, Prestige Tower" />
              </Field>
              <Field id="address_line_2" label="Address line 2" className="sm:col-span-2" error={err("address_line_2")}>
                <input id="address_line_2" value={form.address_line_2} onChange={set("address_line_2")} maxLength={255} className={cls("address_line_2")} placeholder="MG Road" />
              </Field>
              {/* PIN first: typing it fills the city and state below. */}
              <Field id="zip_code" label="PIN code" error={err("zip_code")} hint={PIN_HINT[pinStatus] || (isIndia(form.country) ? "Enter the PIN code to fill in the city and state." : "")}>
                <input id="zip_code" value={form.zip_code} onChange={onPinChange} maxLength={20} inputMode={isIndia(form.country) ? "numeric" : undefined} className={cls("zip_code")} placeholder="560001" />
              </Field>
              <Field id="city" label="City" error={err("city")}>
                <input id="city" value={form.city} onChange={set("city")} maxLength={100} className={cls("city")} placeholder="Bengaluru" />
              </Field>
              <Field id="state" label="State" error={err("state")}>
                {isIndia(form.country) ? (
                  <select id="state" value={form.state} onChange={set("state")} className={cls("state")}>
                    <option value="">Select state</option>
                    {stateOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id="state" value={form.state} onChange={set("state")} maxLength={100} className={cls("state")} placeholder="State or region" />
                )}
              </Field>
              <Field id="country" label="Country" error={err("country")}>
                <input id="country" value={form.country} onChange={set("country")} maxLength={100} className={cls("country")} placeholder="India" />
              </Field>
            </div>
          </section>

          {/* ── Tax & legal ── */}
          {showStatutory && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-700">Tax &amp; legal registration</h4>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <HiLockClosed className="w-3 h-3" /> HR only
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                <Field id="gst_number" label="GSTIN" help="gst_number" error={err("gst_number")}>
                  <input id="gst_number" value={form.gst_number} onChange={set("gst_number")} maxLength={50} className={`${cls("gst_number")} font-mono tracking-wide`} placeholder="29AABCA1234A1Z5" />
                </Field>
                <Field id="company_pan_number" label="Company PAN" help="company_pan_number" error={err("company_pan_number")}>
                  <input id="company_pan_number" value={form.company_pan_number} onChange={set("company_pan_number")} maxLength={50} className={`${cls("company_pan_number")} font-mono tracking-wide`} placeholder="AABCA1234A" />
                </Field>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              <HiExclamationCircle className="w-5 h-5 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          <p className="text-[11px] text-slate-500 sm:mr-auto">
            {changed ? "Only what you changed is saved." : "Nothing changed yet."}
          </p>
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !changed}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiCheck className="w-4 h-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
