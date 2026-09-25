// ─────────────────────────────────────────────────────────────────────────────
// documents/TemplateFormDialog.jsx — Write a blank company form: a new one
// (#99), an edit to a draft (#100), or the next version of a published one
// (#104). The file, when there is one, goes browser → S3 the usual way
// (#101 → PUT → #102).
//
// Three things shape this form.
//
// · A form either holds a file here or points at a link somewhere else, and
//   that choice is fixed when the draft is created. So the pair of buttons
//   appears on a new form and becomes a plain sentence afterwards — offering a
//   switch the server refuses (409 INVALID_FIELD_FOR_BACKEND) would be worse
//   than not offering it.
//
// · Nothing here publishes. Saving leaves a draft that only HR can see; the
//   catalogue changes at the moment somebody presses Publish, on the card or in
//   the detail. Keeping those apart is what makes "replace the 2026 claim form"
//   safe to do in the middle of a working day.
//
// · The upload is a separate step from the metadata, and the failures are
//   reported separately too. If the details saved and the file didn't, the
//   draft is still there — the dialog says so and offers the file again,
//   rather than making somebody retype the description.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiCheck, HiCloud, HiDocumentAdd, HiInformationCircle, HiLink, HiRefresh, HiX } from "react-icons/hi";
import { putToSignedUrl } from "../utils/payrollAttachments";
import { documentErrorMessage } from "../utils/documentErrors";
import { contentTypeOfFile, fileProblem, groupLabel, trimFileName } from "./documentMeta";
import {
  TEMPLATE_BACKENDS, TEMPLATE_DESCRIPTION_MAX, TEMPLATE_REFERENCE_URL_MAX, TEMPLATE_TITLE_MAX,
  templateOf, templateTicketOf,
} from "./templateMeta";
import { FIELD, FileDropField, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "./ui";

const STAGES = [
  { key: "save", label: "Saving the form's details" },
  { key: "issue", label: "Preparing a secure upload link" },
  { key: "put", label: "Sending the file to encrypted storage" },
  { key: "confirm", label: "Checking the file arrived intact" },
];

const httpsProblem = (url) => {
  const value = String(url || "").trim();
  if (!value) return "Paste the link to the form.";
  if (!/^https:\/\/\S+$/i.test(value)) return "The link has to start with https:// — an http link isn't accepted.";
  if (value.length > TEMPLATE_REFERENCE_URL_MAX) return `Keep the link under ${TEMPLATE_REFERENCE_URL_MAX} characters.`;
  return "";
};

/**
 * @param {object} props
 * @param {"create"|"edit"|"replace"} props.mode
 * @param {object} [props.template]   the draft being edited, or the live version being replaced
 * @param {object[]} [props.types]    active document types this form may be filed under
 * @param {object} props.plane        TEMPLATE_PLANES.hr
 * @param {(template: object, note: string) => void} props.onDone
 * @param {() => void} props.onClose
 */
export default function TemplateFormDialog({ mode = "create", template = null, types = [], plane, onDone, onClose }) {
  const editing = mode === "edit";
  const replacing = mode === "replace";

  const [form, setForm] = useState(() => ({
    title: template?.title || "",
    description: template?.description || "",
    document_type_id: template?.document_type_id || "",
    storage_backend: template?.storage_backend || "s3",
    reference_url: editing ? template?.reference_url || "" : "",
    is_employee_visible: template ? template.is_employee_visible !== false : true,
  }));
  const [file, setFile] = useState(null);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState(null); // null | save | issue | put | confirm | done
  const [error, setError] = useState("");
  // Set once the draft exists on the server. From then on a retry uploads the
  // file against that draft instead of creating a second one.
  const [draft, setDraft] = useState(editing ? template : null);
  const busy = !!stage && stage !== "done";

  const reference = form.storage_backend === "reference";
  const backendLocked = editing || replacing;
  const type = useMemo(() => types.find((t) => t.id === form.document_type_id) || null, [types, form.document_type_id]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const title = form.title.trim();
  // An edited draft that already has a confirmed file doesn't need another one.
  const fileAlreadyThere = !!draft?.confirmed_at || !!draft?.has_file;
  const fileOptional = reference || (editing && fileAlreadyThere) || replacing;

  const problems = {
    title: !title ? "Give the form a name." : title.length > TEMPLATE_TITLE_MAX ? `Keep the name under ${TEMPLATE_TITLE_MAX} characters.` : "",
    description: form.description.length > TEMPLATE_DESCRIPTION_MAX ? `Keep the description under ${TEMPLATE_DESCRIPTION_MAX} characters.` : "",
    reference: reference ? httpsProblem(form.reference_url) : "",
    file: reference || (fileOptional && !file) ? "" : fileProblem(file),
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (key) => (touched ? problems[key] : "");

  /** The metadata call for this mode. Each one accepts a different set of keys. */
  const saveMetadata = async () => {
    if (editing) {
      const body = {};
      if (title !== (template.title || "")) body.title = title;
      if (form.description.trim() !== (template.description || "")) body.description = form.description.trim();
      if (form.is_employee_visible !== (template.is_employee_visible !== false)) body.is_employee_visible = form.is_employee_visible;
      // A file name only exists on an uploaded form, a link only on a linked one.
      if (reference && form.reference_url.trim() !== (template.reference_url || "")) body.reference_url = form.reference_url.trim();
      if (!Object.keys(body).length) return template;
      return templateOf(await plane.update(template.id, body));
    }
    if (replacing) {
      // #104 takes overrides only — file metadata here would be an unknown key.
      const body = { title };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.document_type_id) body.document_type_id = form.document_type_id;
      return templateTicketOf(await plane.replace(template.id, body)).template;
    }
    const body = {
      title,
      storage_backend: form.storage_backend,
      is_employee_visible: form.is_employee_visible,
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (form.document_type_id) body.document_type_id = form.document_type_id;
    if (reference) body.reference_url = form.reference_url.trim();
    return templateTicketOf(await plane.create(body)).template;
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;
    setError("");

    let row;
    try {
      setStage("save");
      row = await saveMetadata();
      setDraft(row);
    } catch (err) {
      setStage(null);
      setError(documentErrorMessage(err, "Couldn't save the form's details."));
      return;
    }

    if (!file) {
      setStage("done");
      onDone?.(row, editing ? "Form updated." : replacing ? "New version started as a draft." : "Draft created.");
      return;
    }

    // The upload is issued against the draft that now exists, so a failure
    // here never costs the details that were just saved.
    const contentType = contentTypeOfFile(file);
    try {
      setStage("issue");
      const ticket = templateTicketOf(await plane.issue(row.id, {
        file_name: trimFileName(file.name),
        content_type: contentType,
        size_bytes: file.size,
      }));
      if (!ticket.upload_url) throw new Error("Storage didn't return an upload link.");
      setStage("put");
      await putToSignedUrl(ticket.upload_url, file, ticket.required_headers, contentType);
      setStage("confirm");
      const confirmed = templateOf(await plane.confirm(row.id));
      setStage("done");
      onDone?.(confirmed || row, editing ? "Form updated and the new file checked." : replacing ? "New version drafted with its file." : "Draft created with its file.");
    } catch (err) {
      setStage(null);
      setFile(null);
      setError(`${documentErrorMessage(err, "The file couldn't be uploaded.")} The form's details are saved — choose the file again to finish it.`);
    }
  };

  const heading = editing ? "Edit this form" : replacing ? "Publish a new version" : "New form";
  const sub = editing
    ? "Only drafts can be edited. Nobody outside HR sees this until it's published."
    : replacing
      ? `Starts version ${(Number(template?.version) || 1) + 1} as a draft. “${template?.title || "The current version"}” stays live until you publish the new one.`
      : "Blank company forms — claim sheets, declarations, nomination forms. Everyone in your organisation can download them once published.";

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={heading} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              {replacing ? <HiRefresh className="w-5 h-5" /> : <HiDocumentAdd className="w-5 h-5" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{heading}</h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{sub}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <label htmlFor="tpl-title" className={LABEL}>What is this form called?</label>
            <input
              id="tpl-title" type="text" value={form.title} maxLength={TEMPLATE_TITLE_MAX} disabled={busy}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Medical reimbursement claim form 2026"
              className={FIELD}
            />
            {show("title") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.title}</p>
              : <p className="text-[10px] text-slate-400 mt-1">Put the year in the name if the form changes every year — it makes replaced versions easy to tell apart.</p>}
          </div>

          <div>
            <label htmlFor="tpl-desc" className={LABEL}>When should people use it? <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
            <textarea
              id="tpl-desc" rows={3} value={form.description} maxLength={TEMPLATE_DESCRIPTION_MAX} disabled={busy}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Fill this in for outpatient treatment claims under the company health policy. Attach the original bills."
              className={`${FIELD} resize-none`}
            />
            <p className={`text-[10px] mt-1 ${problems.description ? "font-semibold text-rose-600" : "text-slate-400"}`}>
              {problems.description || `${form.description.length}/${TEMPLATE_DESCRIPTION_MAX} — this shows under the form's name in the catalogue.`}
            </p>
          </div>

          {!editing && (
            <div>
              <label htmlFor="tpl-type" className={LABEL}>File it under <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
              <select id="tpl-type" value={form.document_type_id} disabled={busy} onChange={(e) => set("document_type_id", e.target.value)} className={FIELD}>
                <option value="">No particular type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.group ? ` · ${groupLabel(t.group)}` : ""}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                {type
                  ? "Linking a type groups the form with documents of that kind — and hides it from employees if that type is hidden from them."
                  : "Only needed if you want the form grouped with a kind of document. Most blank forms don’t need one."}
              </p>
            </div>
          )}

          {/* Where the form lives. Fixed once the draft exists. */}
          <div>
            <span className={LABEL}>Where is the form?</span>
            {backendLocked ? (
              <p className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                {reference ? <HiLink className="w-4 h-4 text-purple-500 shrink-0 mt-px" /> : <HiCloud className="w-4 h-4 text-purple-500 shrink-0 mt-px" />}
                <span>{reference ? "This form is a link to somewhere else. That can't be changed — create a new form to switch to an uploaded file." : "This form is a file kept in this portal. That can't be changed — create a new form to switch to a link."}</span>
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATE_BACKENDS.map((option) => (
                  <button
                    key={option.value} type="button" disabled={busy}
                    onClick={() => set("storage_backend", option.value)}
                    aria-pressed={form.storage_backend === option.value}
                    className={`text-left rounded-xl border px-4 py-3 transition ${form.storage_backend === option.value ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      {option.value === "reference" ? <HiLink className="w-4 h-4 text-purple-500" /> : <HiCloud className="w-4 h-4 text-purple-500" />}
                      {option.label}
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">{option.blurb}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {reference ? (
            <div>
              <label htmlFor="tpl-url" className={LABEL}>Link to the form</label>
              <input
                id="tpl-url" type="url" value={form.reference_url} maxLength={TEMPLATE_REFERENCE_URL_MAX} disabled={busy}
                onChange={(e) => set("reference_url", e.target.value)}
                placeholder="https://www.epfindia.gov.in/forms/form-11.pdf"
                className={FIELD}
              />
              {show("reference") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.reference}</p>
                : <p className="text-[10px] text-slate-400 mt-1">Nothing is stored here, so if the page moves the link stops working. For a form that matters, upload a copy instead.</p>}
            </div>
          ) : (
            <div>
              <span className={LABEL}>
                The form file {fileOptional && <span className="normal-case font-semibold text-slate-400">(optional{fileAlreadyThere ? " — there's one already" : ""})</span>}
              </span>
              <FileDropField file={file} onChange={setFile} problem={file || touched ? problems.file : ""} disabled={busy} id="tpl-file" />
              {fileAlreadyThere && !file && (
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Currently {draft?.file_name || "a file"}. Choosing another replaces it in this draft.
                </p>
              )}
              {replacing && !file && (
                <p className="text-[11px] font-semibold text-fuchsia-700 mt-1.5">
                  You can add the file now or later — but the new version can’t be published until it has one.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 px-4">
            <SwitchRow
              title="Employees can find this form"
              description="On, it appears in everyone's Forms &amp; Templates. Off, it stays in HR's list — useful for a form only HR fills in on somebody's behalf."
              checked={form.is_employee_visible}
              onChange={(v) => set("is_employee_visible", v)}
              disabled={busy}
            />
          </div>

          {stage && (
            <ol className="rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 space-y-2" aria-live="polite">
              {STAGES.filter((s) => s.key === "save" || !!file).map((s) => {
                const order = STAGES.findIndex((x) => x.key === stage);
                const idx = STAGES.findIndex((x) => x.key === s.key);
                const doneStep = stage === "done" || idx < order;
                const active = idx === order && stage !== "done";
                return (
                  <li key={s.key} className={`flex items-center gap-2.5 text-xs font-semibold ${doneStep ? "text-violet-700" : active ? "text-purple-700" : "text-slate-400"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${doneStep ? "bg-violet-600 text-white" : active ? "bg-white border-2 border-purple-500" : "bg-white border border-slate-200"}`}>
                      {doneStep ? <HiCheck className="w-3 h-3" /> : active ? <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" /> : null}
                    </span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700" role="alert">
              <HiInformationCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <p className="mr-auto text-[11px] text-slate-400 hidden sm:block">Saving leaves it as a draft. Publish it when you’re ready.</p>
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={busy || (touched && !!firstProblem)} className={PRIMARY_BTN}>
            {busy ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <HiCheck className="w-4 h-4" />}
            {busy ? "Saving…" : editing ? "Save changes" : replacing ? "Start the new version" : "Create the draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
