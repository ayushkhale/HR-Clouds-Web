// ─────────────────────────────────────────────────────────────────────────────
// DocumentTypeFormDialog.jsx — Create a custom document type (#4) or edit an
// existing one (#7), with deactivate (#8) / reactivate (#9) in the footer.
//
// A type belongs to one of two planes, chosen at creation and fixed for good:
//   employee — a document about one person, which they or HR upload
//   org      — a policy, notice or letter the organisation issues to an
//              audience (Phase 2). Its rules are different, so the form swaps
//              the permission and rule sets rather than showing both.
//
// Rules (plan §11.1): code / plane / source / statutory are immutable after
// create (R-5), a custom type is never statutory (R-6), formats must be a
// non-empty subset of the module's 7 types (R-7), and the size cap may only
// narrow the org ceiling (R-8 — a larger value is clamped by the server).
//
// Since Phase 4, "Everyone has to provide this" is the switch that makes the
// whole required-document checklist work: a type that isn't marked required
// appears on nobody's list, however important it is. So the switch, and who it
// applies to, are asked for here — and the answer is validated strictly, because
// the server no longer accepts anything it doesn't recognise in that subtree.
//
// The reason it is strict is worth keeping in mind while editing this file: an
// empty targeting object means "required of EVERYONE". A typo that got silently
// dropped would therefore widen the rule rather than narrow it, which is the one
// direction a mistake here must never go. Hence the fixed enum lists below
// rather than values read off the roster, and the disjoint check before saving.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiBan, HiCheck, HiClipboardCheck, HiLockClosed, HiTemplate, HiX, HiInformationCircle, HiOfficeBuilding, HiUser } from "react-icons/hi";
import { documentErrorCode, documentErrorMessage, typeInUseSummary } from "../../../shared/utils/documentErrors";
import { CONTENT_TYPES, DOC_GROUPS, HARD_MAX_BYTES, formatBytes } from "../../../shared/documents/documentMeta";
import {
  EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS, MANDATORY_ARRAY_MAX, buildMandatoryFor, describeRequiredFor,
  isRequiredOfEveryone, mandatoryCriteria, mandatoryForProblem,
} from "../../../shared/documents/requestMeta";
import MultiSelectDropdown from "../../../shared/components/MultiSelectDropdown";
import { PersonMultiSelect } from "../../../shared/components/PersonPicker";
import { useTargetingOptions, withSelected } from "../../../shared/attendance/useTargetingOptions";
import { DANGER_BTN, FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "../../../shared/documents/ui";

const MB = 1024 * 1024;
const CODE_RE = /^[a-z][a-z0-9_]{1,63}$/;

const blank = (defaultVerification = true) => ({
  plane: "employee",
  code: "", name: "", group: "identity", description: "",
  requires_acknowledgement: false, requires_signature: false,
  is_confidential: false, employee_can_upload: true, employee_can_view: true, employee_can_delete: false,
  manager_can_view: false, manager_can_request: false, requires_verification: defaultVerification,
  has_expiry: false, expiry_reminder_days: "30, 15, 7", allows_multiple: false,
  max_file_size_mb: "10", allowed_content_types: ["application/pdf", "image/jpeg", "image/png"],
  retention_days: "2555", display_order: "0",
  is_mandatory: false,
  target_departments: [], target_locations: [], target_employment_types: [], target_job_statuses: [],
  included_users: [], excluded_users: [],
});

const fromType = (t) => ({
  ...blank(),
  plane: t.plane || "employee",
  ...Object.fromEntries(Object.entries(t).filter(([, v]) => v !== null && v !== undefined)),
  description: t.description || "",
  expiry_reminder_days: (t.expiry_reminder_days || []).join(", "),
  max_file_size_mb: String(Math.round(((t.max_file_size_bytes || 10 * MB) / MB) * 10) / 10),
  allowed_content_types: t.allowed_content_types || [],
  retention_days: String(t.retention_days ?? 2555),
  display_order: String(t.display_order ?? 0),
  is_mandatory: !!t.is_mandatory,
  // Flattened out of the stored `mandatory_for`, dropping anything that isn't
  // one of the six keys — a row written before Phase 4 validated this field may
  // hold a typo, and carrying it back would fail the save.
  ...mandatoryCriteria(t),
});

/** "30, 15, 7" → [30, 15, 7] (unique, positive, descending) or null when malformed. */
function parseDays(text) {
  const parts = String(text || "").split(/[\s,]+/).filter(Boolean);
  if (parts.some((p) => !/^\d+$/.test(p))) return null;
  return [...new Set(parts.map(Number).filter((n) => n > 0 && n <= 365))].sort((a, b) => b - a);
}

/**
 * @param {object} props
 * @param {object} [props.type]            the type being edited; absent = create
 * @param {boolean} [props.defaultVerification]  org default for new custom types (#67)
 * @param {object} props.api               { create, update, deactivate, activate }
 * @param {(type: object, message: string) => void} props.onSaved
 * @param {() => void} props.onClose
 */
export default function DocumentTypeFormDialog({ type, defaultVerification = true, api, onSaved, onClose }) {
  const editing = !!type;
  const [form, setForm] = useState(() => (editing ? fromType(type) : blank(defaultVerification)));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onCloseRef.current?.(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy]);

  const orgPlane = form.plane === "org";
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  /** Switching plane before anything is saved also moves the category to a sensible default. */
  const setPlane = (plane) =>
    setForm((f) => ({ ...f, plane, group: plane === "org" ? (f.group === "identity" ? "policy" : f.group) : (f.group === "policy" ? "identity" : f.group) }));
  const toggleFormat = (ct) => set("allowed_content_types", form.allowed_content_types.includes(ct) ? form.allowed_content_types.filter((x) => x !== ct) : [...form.allowed_content_types, ct]);

  // Departments, locations and the people picker come from the live org; the
  // two enum dimensions do not (see the note at the top of this file).
  const targeting = useTargetingOptions();

  const criteria = useMemo(() => ({
    target_departments: form.target_departments,
    target_locations: form.target_locations,
    target_employment_types: form.target_employment_types,
    target_job_statuses: form.target_job_statuses,
    included_users: form.included_users,
    excluded_users: form.excluded_users,
  }), [form.target_departments, form.target_locations, form.target_employment_types, form.target_job_statuses, form.included_users, form.excluded_users]);

  // "Required" only means anything on the employee plane: an organisation
  // document is issued to people, not collected from them, so there is nothing
  // for a checklist to be missing.
  const showRequired = !orgPlane;
  const requiredOfEveryone = isRequiredOfEveryone(criteria);

  const sizeMb = Number(form.max_file_size_mb);
  const days = parseDays(form.expiry_reminder_days);
  const problems = {
    code: editing ? "" : !CODE_RE.test(form.code.trim()) ? "Use 2–64 lowercase letters, digits or underscores, starting with a letter." : "",
    name: form.name.trim().length < 2 ? "Give the type a name." : form.name.trim().length > 150 ? "Keep the name under 150 characters." : "",
    formats: form.allowed_content_types.length === 0 ? "Choose at least one file format." : "",
    size: !(sizeMb > 0) ? "Enter a size in MB." : sizeMb * MB > HARD_MAX_BYTES ? `The maximum is ${formatBytes(HARD_MAX_BYTES)}.` : "",
    reminders: !orgPlane && form.has_expiry && days === null ? "List days as numbers, e.g. 30, 15, 7." : "",
    retention: !(Number(form.retention_days) >= 30) ? "Keep documents for at least 30 days." : "",
    // Checked in the browser because the server rejects an overlap outright,
    // and a 400 here would otherwise lose the whole form.
    requiredFor: showRequired && form.is_mandatory ? mandatoryForProblem(criteria) : "",
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (k) => (touched ? problems[k] : "");

  const payload = () => {
    const body = {
      name: form.name.trim(),
      group: form.group,
      description: form.description.trim() || null,
      is_confidential: !!form.is_confidential,
      max_file_size_bytes: Math.round(sizeMb * MB),
      allowed_content_types: form.allowed_content_types,
      retention_days: Number(form.retention_days),
      display_order: Number(form.display_order) || 0,
    };

    if (orgPlane) {
      // An org document is issued, not collected: nobody uploads their own copy
      // and nothing waits in the verification queue. What it can ask for is an
      // acknowledgement or a signature, and whether managers may propose one.
      Object.assign(body, {
        requires_acknowledgement: !!form.requires_acknowledgement,
        requires_signature: !!form.requires_signature,
        manager_can_request: !!form.manager_can_request,
        manager_can_view: !!form.manager_can_request,
        employee_can_upload: false,
        employee_can_view: true,
        employee_can_delete: false,
        requires_verification: false,
        has_expiry: false,
        expiry_reminder_days: type?.expiry_reminder_days || [30, 15, 7],
        allows_multiple: true,
      });
    } else {
      Object.assign(body, {
        employee_can_upload: !!form.employee_can_upload,
        employee_can_view: !!form.employee_can_view,
        employee_can_delete: !!form.employee_can_delete,
        manager_can_view: !!form.manager_can_view && !form.is_confidential,
        manager_can_request: !!form.manager_can_request && !form.is_confidential,
        requires_verification: !!form.requires_verification,
        has_expiry: !!form.has_expiry,
        expiry_reminder_days: form.has_expiry ? (days || []) : (type?.expiry_reminder_days || [30, 15, 7]),
        allows_multiple: !!form.allows_multiple,
        requires_acknowledgement: false,
        requires_signature: false,
      });
    }

    // Sent on create AND on edit, because Phase 4 made this field the source of
    // every checklist. An org-plane type is never required of anybody, so it is
    // pinned off rather than left to whatever the form happens to hold.
    Object.assign(body, showRequired
      ? { is_mandatory: !!form.is_mandatory, mandatory_for: form.is_mandatory ? buildMandatoryFor(criteria) : {} }
      : { is_mandatory: false, mandatory_for: {} });

    if (!editing) Object.assign(body, { code: form.code.trim(), plane: form.plane });
    return body;
  };

  const save = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;
    setBusy("save");
    setError("");
    try {
      const res = editing ? await api.update(type.id, payload()) : await api.create(payload());
      const saved = res?.data ?? res;
      const clamped = saved?.max_file_size_bytes && saved.max_file_size_bytes < Math.round(sizeMb * MB);
      onSaved(saved, clamped
        ? `Saved. The size limit was capped at ${formatBytes(saved.max_file_size_bytes)} — your organisation's maximum.`
        : editing ? "Document type updated" : "Custom document type created");
    } catch (err) {
      const code = documentErrorCode(err);
      const fields = err?.data?.details?.fields || err?.data?.details;
      setError(code === "DOCUMENT_TYPE_FIELD_IMMUTABLE" && Array.isArray(fields)
        ? `${documentErrorMessage(err)} (${fields.join(", ")})`
        : documentErrorMessage(err, "Couldn't save this document type."));
      setBusy("");
    }
  };

  const toggleActive = async () => {
    const deactivating = type.is_active !== false;
    if (deactivating && !(await window.confirm(`Deactivate “${type.name}”?\n\nNobody can add new documents of this type. Existing documents stay readable.\n\nIt can only be switched off once nothing of this type is still waiting for upload, checking or publishing.`))) return;
    setBusy("active");
    setError("");
    try {
      const res = deactivating ? await api.deactivate(type.id) : await api.activate(type.id);
      onSaved(res?.data ?? res, deactivating ? "Document type deactivated" : "Document type reactivated — its settings were kept");
    } catch (err) {
      setError(typeInUseSummary(err) || documentErrorMessage(err, "Couldn't change this type's status."));
      setBusy("");
    }
  };

  const confidential = !!form.is_confidential;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={save} noValidate role="dialog" aria-modal="true" aria-label={editing ? `Edit ${type.name}` : "New custom document type"} className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiTemplate className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800 truncate">{editing ? type.name : orgPlane ? "New organisation document type" : "New custom document type"}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editing
                  ? [type.source === "catalog" ? "From the platform catalog" : "Custom type", type.is_statutory ? "Statutory" : null, type.is_active === false ? "Deactivated" : "Active"].filter(Boolean).join(" · ")
                  : orgPlane
                    ? "A kind of document your organisation issues to its people — a policy, a notice, a letter."
                    : "For documents the standard catalog doesn't cover — an NDA, a laptop handover, a policy sign-off."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Two columns on a wide screen: what the type IS on the left, what
              it ALLOWS on the right, so the form fits without a long scroll. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-6 min-w-0">
            {/* Identity */}
            <section className="space-y-4">
              {/* The plane decides which rules apply, so it is asked first and
                  can never be changed afterwards — documents already filed
                  under it would change meaning. */}
              <div>
                <span className={LABEL}>What kind of document is this?</span>
                {editing ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5">
                    {orgPlane ? <HiOfficeBuilding className="w-4 h-4 text-purple-500" /> : <HiUser className="w-4 h-4 text-purple-500" />}
                    <span className="text-sm font-semibold text-slate-800">{orgPlane ? "Issued by the organisation" : "About one employee"}</span>
                    <HiLockClosed className="w-3 h-3 text-slate-400 ml-auto" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="What kind of document is this?">
                    {[
                      { value: "employee", label: "About one employee", blurb: "A PAN card, a degree, an NDA — collected from or about a person.", icon: HiUser },
                      { value: "org", label: "Issued by the organisation", blurb: "A policy, notice or letter sent out to a group of people.", icon: HiOfficeBuilding },
                    ].map((o) => {
                      const active = form.plane === o.value;
                      const Icon = o.icon;
                      return (
                        <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => setPlane(o.value)}
                          className={`text-left px-3.5 py-3 rounded-xl border transition ${active ? "border-purple-400 bg-purple-50 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-200"}`}>
                          <span className={`flex items-center gap-1.5 text-xs font-bold ${active ? "text-purple-800" : "text-slate-700"}`}><Icon className="w-4 h-4" /> {o.label}</span>
                          <span className="block text-[11px] text-slate-500 mt-1 leading-snug">{o.blurb}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!editing && <p className="text-[10px] text-slate-400 mt-1.5">This can’t be changed later.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dt-name" className={LABEL}>Name</label>
                  <input id="dt-name" type="text" maxLength={150} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={orgPlane ? "e.g. Leave Policy" : "e.g. Company NDA 2026"} className={FIELD} />
                  {show("name") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.name}</p>}
                </div>
                <div>
                  <label htmlFor="dt-code" className={LABEL}>Code {editing && <HiLockClosed className="inline w-3 h-3 text-slate-400" />}</label>
                  <input id="dt-code" type="text" maxLength={64} value={form.code} disabled={editing} onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder={orgPlane ? "e.g. leave_policy" : "e.g. company_nda_2026"} className={`${FIELD} font-mono`} />
                  {show("code") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.code}</p>
                    : <p className="text-[10px] text-slate-400 mt-1">{editing ? "Codes can't change once created." : "Permanent. Can't match a catalog code."}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="dt-group" className={LABEL}>Category</label>
                  <select id="dt-group" value={form.group} onChange={(e) => set("group", e.target.value)} className={FIELD}>
                    {DOC_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="dt-order" className={LABEL}>Display order</label>
                  <input id="dt-order" type="number" min={0} value={form.display_order} onChange={(e) => set("display_order", e.target.value)} className={FIELD} />
                </div>
              </div>
              <div>
                <label htmlFor="dt-desc" className={LABEL}>{orgPlane ? "What this kind of document is for" : "Instructions for employees"} <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                <textarea id="dt-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={orgPlane ? "e.g. Company-wide policies that everyone has to read and accept." : "e.g. Upload all 3 pages, signed and dated."} className={`${FIELD} resize-none`} />
              </div>
            </section>

            {/* Files */}
            <section className="space-y-4">
              <div>
                <span className={LABEL}>Allowed formats</span>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_TYPES.map((ct) => {
                    const on = form.allowed_content_types.includes(ct.value);
                    return (
                      <button key={ct.value} type="button" onClick={() => toggleFormat(ct.value)} aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition ${on ? "border-purple-300 bg-purple-50 text-purple-700" : "border-slate-200 text-slate-500 hover:border-purple-200"}`}>
                        {on && <HiCheck className="w-3.5 h-3.5" />} {ct.label}
                      </button>
                    );
                  })}
                </div>
                {show("formats") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.formats}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dt-size" className={LABEL}>Largest file (MB)</label>
                  <input id="dt-size" type="number" min={0.1} step={0.5} max={25} value={form.max_file_size_mb} onChange={(e) => set("max_file_size_mb", e.target.value)} className={FIELD} />
                  {show("size") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.size}</p>
                    : <p className="text-[10px] text-slate-400 mt-1">Can’t exceed the organisation limit in Document Settings.</p>}
                </div>
                <div>
                  <label htmlFor="dt-ret" className={LABEL}>Keep for (days)</label>
                  <input id="dt-ret" type="number" min={30} value={form.retention_days} onChange={(e) => set("retention_days", e.target.value)} className={FIELD} />
                  {show("retention") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.retention}</p>
                    : <p className="text-[10px] text-slate-400 mt-1">2555 days = 7 years. Purging starts in a later release.</p>}
                </div>
              </div>
            </section>
            </div>

            <div className="space-y-6 min-w-0">
            {orgPlane ? (
              <>
                {/* Org plane: nobody uploads their own copy and nothing is
                    verified, so those switches would be meaningless here. What
                    a policy can do is demand an acknowledgement or a signature. */}
                <section className="rounded-2xl border border-slate-200 px-5 py-2 divide-y divide-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-3 pb-2">Who can do what</p>
                  <SwitchRow title="Confidential" description="Only HR and the people it's issued to can open it — never their managers." checked={confidential} onChange={(v) => set("is_confidential", v)} />
                  <SwitchRow
                    title="Managers can propose one"
                    description="A manager can draft this for someone on their team and send it to HR to issue. HR always decides."
                    checked={form.manager_can_request}
                    onChange={(v) => set("manager_can_request", v)}
                  />
                </section>

                <section className="rounded-2xl border border-slate-200 px-5 py-2 divide-y divide-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-3 pb-2">What it asks of people</p>
                  <SwitchRow
                    title="Always needs acknowledgement"
                    description="Everyone who receives it is asked to confirm they've read it. Each document can ask for more than this, never less."
                    checked={form.requires_acknowledgement}
                    onChange={(v) => set("requires_acknowledgement", v)}
                  />
                  <SwitchRow
                    title="Always needs a signature"
                    description="A signature is recorded as well. Collecting signatures in the app isn't available yet, so this is stored and shown but nobody is asked to sign."
                    checked={form.requires_signature}
                    onChange={(v) => set("requires_signature", v)}
                  />
                </section>

                <p className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                  <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
                  Each document of this kind picks its own audience and its own dates when it’s written. These settings are the floor that every one of them has to meet.
                </p>
              </>
            ) : (
              <>
                {/* Visibility */}
                <section className="rounded-2xl border border-slate-200 px-5 py-2 divide-y divide-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-3 pb-2">Who can do what</p>
                  <SwitchRow title="Confidential" description="Only HR and the employee can see these documents — never managers." checked={confidential} onChange={(v) => set("is_confidential", v)} />
                  <SwitchRow title="Employees can upload" description="Shown in My Documents so employees can add it themselves." checked={form.employee_can_upload} onChange={(v) => set("employee_can_upload", v)} />
                  <SwitchRow title="Employees can view" description="Employees can open and download their copy." checked={form.employee_can_view} onChange={(v) => set("employee_can_view", v)} />
                  <SwitchRow
                    title="Employees can delete a verified copy"
                    description="Also needs the organisation setting. Unverified uploads can always be deleted by their owner."
                    checked={form.employee_can_delete}
                    onChange={(v) => set("employee_can_delete", v)}
                    disabled={type?.is_statutory}
                    note={type?.is_statutory ? "Statutory documents can never be deleted by employees." : ""}
                  />
                  <SwitchRow title="Managers can view" description="Direct managers see their team's copies." checked={form.manager_can_view && !confidential} onChange={(v) => set("manager_can_view", v)} disabled={confidential} note={confidential ? "Off while the type is confidential." : ""} />
                  <SwitchRow title="Managers can upload" description="Managers can add this document for their direct reports." checked={form.manager_can_request && !confidential} onChange={(v) => set("manager_can_request", v)} disabled={confidential} />
                </section>

                {/* Rules */}
                <section className="rounded-2xl border border-slate-200 px-5 py-2 divide-y divide-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-3 pb-2">Rules</p>
                  <SwitchRow title="Needs verification" description="New uploads wait in the Verification Queue before they count." checked={form.requires_verification} onChange={(v) => set("requires_verification", v)} />
                  <SwitchRow title="Several copies allowed" description="Off = one live document per person (use Replace to update). Applies to new uploads only." checked={form.allows_multiple} onChange={(v) => set("allows_multiple", v)} />
                  <SwitchRow title="Tracks expiry" description="An expiry date becomes required on upload (visas, licences, certifications)." checked={form.has_expiry} onChange={(v) => set("has_expiry", v)} />
                  {form.has_expiry && (
                    <div className="py-3">
                      <label htmlFor="dt-rem" className={LABEL}>Reminder days before expiry</label>
                      <input id="dt-rem" type="text" value={form.expiry_reminder_days} onChange={(e) => set("expiry_reminder_days", e.target.value)} placeholder="30, 15, 7" className={FIELD} />
                      {show("reminders") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.reminders}</p>
                        : <p className="text-[10px] text-slate-400 mt-1">One email on each of these days before the expiry date, if expiry warnings are on in Document Settings.</p>}
                    </div>
                  )}
                </section>

                {/* Required, and of whom. This is what puts a document on
                    somebody's checklist — nothing else does. */}
                <section className="rounded-2xl border border-slate-200 px-5 py-2 divide-y divide-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 pt-3 pb-2">Is it required?</p>
                  <SwitchRow
                    title="People have to provide this"
                    description="Puts it on their Required documents list and counts towards their onboarding score. Without this, nobody is ever shown as missing it — however important it is."
                    checked={form.is_mandatory}
                    onChange={(v) => set("is_mandatory", v)}
                  />

                  {form.is_mandatory && (
                    <div className="py-4 space-y-4">
                      <div>
                        <p className={LABEL}>Who has to provide it</p>
                        <p className={`text-xs font-semibold rounded-xl px-3.5 py-2.5 border ${requiredOfEveryone ? "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900" : "bg-purple-50 border-purple-200 text-purple-900"}`}>
                          {requiredOfEveryone
                            ? "Everyone in the organisation. Narrow it below if only some people need it."
                            : describeRequiredFor(criteria, (kind, id) => (
                              kind === "department" ? targeting.departmentOptions.find((o) => o.value === id)?.label
                                : kind === "location" ? targeting.locationOptions.find((o) => o.value === id)?.label
                                  : targeting.employeePeople.find((pp) => (pp.user_id ?? pp.id) === id)?.name
                            ))}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <MultiSelectDropdown
                          label="Departments"
                          placeholder="Every department"
                          options={withSelected(targeting.departmentOptions, form.target_departments)}
                          value={form.target_departments}
                          onChange={(v) => set("target_departments", v)}
                        />
                        <MultiSelectDropdown
                          label="Locations"
                          placeholder="Every location"
                          options={withSelected(targeting.locationOptions, form.target_locations)}
                          value={form.target_locations}
                          onChange={(v) => set("target_locations", v)}
                        />
                        <MultiSelectDropdown
                          label="Employment types"
                          placeholder="Every employment type"
                          options={withSelected(EMPLOYMENT_TYPE_OPTIONS, form.target_employment_types)}
                          value={form.target_employment_types}
                          onChange={(v) => set("target_employment_types", v)}
                        />
                        <MultiSelectDropdown
                          label="Job statuses"
                          placeholder="Every job status"
                          options={withSelected(JOB_STATUS_OPTIONS, form.target_job_statuses)}
                          value={form.target_job_statuses}
                          onChange={(v) => set("target_job_statuses", v)}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={LABEL} htmlFor="dt-included">Only these people <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                          <PersonMultiSelect
                            id="dt-included" people={targeting.employeePeople} value={form.included_users}
                            onChange={(v) => set("included_users", v)} max={MANDATORY_ARRAY_MAX}
                            placeholder="Anyone who matches above" loading={targeting.loading} unknownLabel="Former employee"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">They still have to match the boxes above.</p>
                        </div>
                        <div>
                          <label className={LABEL} htmlFor="dt-excluded">Except these people <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                          <PersonMultiSelect
                            id="dt-excluded" people={targeting.employeePeople} value={form.excluded_users}
                            onChange={(v) => set("excluded_users", v)} max={MANDATORY_ARRAY_MAX}
                            placeholder="Nobody" loading={targeting.loading} unknownLabel="Former employee"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Always wins, whatever else matches.</p>
                        </div>
                      </div>

                      {problems.requiredFor && <p className="text-[11px] font-semibold text-rose-600">{problems.requiredFor}</p>}

                      <p className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                        <HiClipboardCheck className="w-4 h-4 shrink-0 text-purple-500 mt-px" />
                        Each list narrows it further; leaving one empty means it doesn’t narrow on that. Somebody’s list is worked out fresh every time it’s read, so a change here shows up immediately — including on people who have already been asked for things.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
            </div>
          </div>

          {editing && type.is_active === false && (
            <p className="flex items-start gap-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
              <HiInformationCircle className="w-4 h-4 shrink-0 text-purple-500 mt-px" /> Deactivated — no new uploads. Reactivate to collect it again; these settings are kept.
            </p>
          )}
          {error && <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5" role="alert">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {editing && (
            <button type="button" onClick={toggleActive} disabled={!!busy} className={`${type.is_active === false ? SECONDARY_BTN : DANGER_BTN} mr-auto`}>
              {type.is_active === false ? <><HiCheck className="w-4 h-4" /> Reactivate</> : <><HiBan className="w-4 h-4" /> Deactivate</>}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={!!busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={!!busy || (touched && !!firstProblem)} className={PRIMARY_BTN}>{busy === "save" ? "Saving…" : editing ? "Save changes" : "Create type"}</button>
        </div>
      </form>
    </div>
  );
}
