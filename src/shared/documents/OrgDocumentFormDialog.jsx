// ─────────────────────────────────────────────────────────────────────────────
// documents/OrgDocumentFormDialog.jsx — Write an organisation document: what it
// is, when it applies, what it asks of people, and who gets it.
//
//   HR      — create a draft (#43) or edit one (#44), any audience
//   manager — propose one for a single direct report (#63 / #64); HR decides
//
// The API cannot create and issue a document in one call: the browser uploads
// straight to S3 through a pre-signed PUT, and signing that URL needs a row to
// exist first. So it is always create (#43) → PUT → confirm (#46) → publish
// (#47), and #47 refuses with ORG_DOCUMENT_FILE_MISSING until the object is
// confirmed (R-56).
//
// That is four calls, but it does not have to be four decisions. "Save and
// publish" runs the whole chain; "Save as draft" stops after the file lands,
// for a document being prepared over several sittings. Publishing is
// irreversible — the audience freezes and the document can no longer be
// edited — so it is never the accidental outcome of pressing Enter.
//
// Two traps this form has to respect, both from the contract:
//  · The file's name, format and size are fixed when the draft is created
//    (#43). #45 re-issues the upload link with an empty body and the signature
//    pins the content type, so a later file must be the same format.
//  · Acknowledgement, signature and confidentiality can be asked for MORE
//    strictly than the document type requires, never less (R-39, R-40).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheck, HiClipboardCheck, HiInformationCircle, HiLink, HiPaperAirplane, HiPencilAlt,
  HiRefresh, HiUpload, HiUserGroup, HiX,
} from "react-icons/hi";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import { PersonMultiSelect, PersonSelect } from "../components/PersonPicker";
import { withSelected } from "../attendance/useTargetingOptions";
import { DocumentUploadError, documentUploadMessage, uploadDocument } from "./documentUpload";
import { documentErrorMessage } from "../utils/documentErrors";
import { contentTypeLabel, fileProblem, formatBytes, typePolicyLine } from "./documentMeta";
import { FIELD, FileDropField, LABEL, PRIMARY_BTN, SECONDARY_BTN, SwitchRow } from "./ui";
import {
  ACK_DUE_MAX, ACK_DUE_MIN, TARGET_ARRAY_MAX, orgDocumentOf, uploadTicketOf,
} from "./orgDocumentMeta";

const STAGES = [
  { key: "issue", label: "Saving the draft" },
  { key: "put", label: "Sending the file to encrypted storage" },
  { key: "confirm", label: "Checking the file arrived intact" },
  { key: "publish", label: "Issuing it to the audience" },
];

const HTTPS_RE = /^https:\/\/\S+$/i;

const blank = (ackDays = 14) => ({
  document_type_id: "",
  title: "",
  description: "",
  storage_backend: "s3",
  reference_url: "",
  file_name: "",
  effective_from: "",
  effective_to: "",
  requires_acknowledgement: false,
  acknowledgement_due_days: String(ackDays),
  requires_signature: false,
  is_confidential: false,
  target_departments: [],
  target_locations: [],
  target_employment_types: [],
  target_job_statuses: [],
  included_users: [],
  excluded_users: [],
});

const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const fromDoc = (doc, ackDays) => ({
  ...blank(ackDays),
  document_type_id: doc.document_type_id || "",
  title: doc.title || "",
  description: doc.description || "",
  storage_backend: doc.storage_backend || "s3",
  // Correctable on an edit (see the note by the inputs). `reference_url` is
  // never returned by a read, so a link draft starts blank and is only sent
  // when something is actually typed.
  reference_url: "",
  file_name: doc.file_name || "",
  effective_from: String(doc.effective_from || "").slice(0, 10),
  effective_to: String(doc.effective_to || "").slice(0, 10),
  requires_acknowledgement: !!doc.requires_acknowledgement,
  acknowledgement_due_days: doc.acknowledgement_due_days ? String(doc.acknowledgement_due_days) : String(ackDays ?? 14),
  requires_signature: !!doc.requires_signature,
  is_confidential: !!doc.is_confidential,
  target_departments: arr(doc.target_departments),
  target_locations: arr(doc.target_locations),
  target_employment_types: arr(doc.target_employment_types),
  target_job_statuses: arr(doc.target_job_statuses),
  included_users: arr(doc.included_users),
  excluded_users: arr(doc.excluded_users),
});

/** A section heading inside the form, so a long form still reads as a few steps. */
function Block({ step, title, description, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white">
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 text-xs font-bold">
          {Icon ? <Icon className="w-4 h-4" /> : step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </header>
      <div className="px-5 pb-5 space-y-4">{children}</div>
    </section>
  );
}

/**
 * @param {object} props
 * @param {"create"|"edit"} props.mode
 * @param {object} props.plane            ORG_PLANES entry (hr | manager)
 * @param {object[]} props.types          org-plane types this viewer may use
 * @param {object} [props.doc]            the draft being edited
 * @param {object} props.targeting        useTargetingOptions() result
 * @param {object[]} [props.people]       roster for the person pickers
 * @param {boolean} [props.peopleLoading]
 * @param {(doc: object, message: string, opts?: { published?: boolean, tone?: string }) => void} props.onSaved
 * @param {boolean} [props.canPublish]   this viewer may issue as well as save (HR only)
 * @param {() => void} [props.onDraftLeft]  a draft exists whose file never landed
 * @param {number} [props.defaultAckDays]    the org's default deadline (settings), used to prefill
 * @param {() => void} props.onClose
 */
export default function OrgDocumentFormDialog({
  mode = "create", plane, types = [], doc = null, targeting, people = [], peopleLoading = false,
  canPublish = false, onSaved, onDraftLeft, defaultAckDays = 14, onClose,
}) {
  const editing = mode === "edit";
  const proposing = plane.key === "manager";

  const [form, setForm] = useState(() => (editing && doc ? fromDoc(doc, defaultAckDays) : blank(defaultAckDays)));
  const [file, setFile] = useState(null);
  const [changeFile, setChangeFile] = useState(false);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState(null); // null | issue | put | confirm | done
  const [error, setError] = useState("");
  const [draftTicket, setDraftTicket] = useState(null);
  const [nameNotSaved, setNameNotSaved] = useState(false);

  const busy = !!stage && stage !== "done";
  const locked = busy || !!draftTicket;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onCloseRef.current?.(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const type = useMemo(() => types.find((t) => t.id === form.document_type_id) || null, [types, form.document_type_id]);

  // Floors: the type's defaults, and on an edit also whatever the draft already
  // promises — #44 refuses a value below either one.
  const floor = {
    requires_acknowledgement: !!type?.requires_acknowledgement || (editing && !!doc?.requires_acknowledgement),
    requires_signature: !!type?.requires_signature || (editing && !!doc?.requires_signature),
    is_confidential: !!type?.is_confidential || (editing && !!doc?.is_confidential),
  };
  const needsAck = floor.requires_acknowledgement || form.requires_acknowledgement;
  const needsSignature = floor.requires_signature || form.requires_signature;
  const confidential = floor.is_confidential || form.is_confidential;

  const reference = form.storage_backend === "reference";
  // On an edit the backend is settled: the row's shape constraint won't allow a swap.
  const backendLocked = editing;
  const fileConfirmed = editing && !!doc?.confirmed_at;
  // A later file must keep the format the signed link was issued for.
  const fileFormats = fileConfirmed || (editing && doc?.content_type) ? [doc.content_type] : type?.allowed_content_types;
  const wantsFile = !reference && (!editing || !fileConfirmed || changeFile);
  // On a create the file is part of the draft. On an edit it is optional:
  // fixing a title shouldn't force someone to re-send the whole document.
  const fileRequired = wantsFile && !editing;

  const title = form.title.trim();
  const description = form.description.trim();
  const ackDays = Number(form.acknowledgement_due_days);
  const overCap = [
    form.target_departments, form.target_locations, form.target_employment_types,
    form.target_job_statuses, form.included_users, form.excluded_users,
  ].some((a) => a.length > TARGET_ARRAY_MAX);
  const overlap = form.included_users.filter((id) => form.excluded_users.includes(id));

  const problems = {
    type: !form.document_type_id ? "Choose what kind of document this is." : "",
    title: title.length < 3 ? "Give the document a title (at least 3 characters)." : title.length > 200 ? "Keep the title under 200 characters." : "",
    description: description.length > 2000 ? "Keep the description under 2,000 characters." : "",
    window: form.effective_from && form.effective_to && form.effective_to < form.effective_from ? "The end date is before the start date." : "",
    ack: needsAck && !(Number.isInteger(ackDays) && ackDays >= ACK_DUE_MIN && ackDays <= ACK_DUE_MAX)
      ? `Give people between ${ACK_DUE_MIN} and ${ACK_DUE_MAX} days to acknowledge it.` : "",
    // On an edit the link is optional: empty means "keep the current one".
    link: reference && (!editing || form.reference_url.trim())
      ? (!HTTPS_RE.test(form.reference_url.trim()) ? "Enter a secure link that starts with https://"
        : form.reference_url.trim().length > 1000 ? "Keep the link under 1,000 characters." : "")
      : "",
    fileName: editing && !reference && form.file_name.trim().length > 255 ? "Keep the file name under 255 characters." : "",
    file: fileRequired || (wantsFile && file) ? fileProblem(file, { allowed: fileFormats, maxBytes: type?.max_file_size_bytes }) : "",
    audience: proposing
      ? (form.included_users.length !== 1 ? "Choose exactly one team member." : "")
      : overlap.length ? "Someone is in both “only these people” and “except these people”. Take them out of one."
        : overCap ? `Each part of the audience can hold at most ${TARGET_ARRAY_MAX} entries.` : "",
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (key) => (touched ? problems[key] : "");

  // ── Payloads ───────────────────────────────────────────────────────────────
  const rules = () => ({
    requires_acknowledgement: needsAck,
    // The column must be null when acknowledgement is off (DB check constraint).
    acknowledgement_due_days: needsAck ? ackDays : null,
    requires_signature: needsSignature,
    is_confidential: confidential,
  });

  /**
   * The six arrays, sent in full. #44 merges per dimension, so sending every
   * one of them makes the saved audience exactly the audience on screen —
   * no dimension silently keeps an old value the user can't see.
   * A manager's proposal carries `included_users` and nothing else (R-71).
   */
  const audience = () => (proposing ? { included_users: form.included_users } : {
    target_departments: form.target_departments,
    target_locations: form.target_locations,
    target_employment_types: form.target_employment_types,
    target_job_statuses: form.target_job_statuses,
    included_users: form.included_users,
    excluded_users: form.excluded_users,
  });

  const createPayload = () => {
    const body = {
      document_type_id: form.document_type_id,
      title,
      description: description || null,
      storage_backend: form.storage_backend,
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      ...rules(),
      ...audience(),
    };
    if (reference) body.reference_url = form.reference_url.trim();
    return body;
  };

  const updatePayload = () => {
    const body = {
      title,
      description: description || null,
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      ...rules(),
      ...audience(),
    };
    // Each backend accepts only its own field; sending the other is a
    // 409 INVALID_FIELD_FOR_BACKEND, so only ever send one.
    if (reference) {
      const url = form.reference_url.trim();
      if (url) body.reference_url = url;
    } else {
      const fileName = form.file_name.trim();
      if (fileName && fileName !== (doc?.file_name || "")) body.file_name = fileName;
    }
    return body;
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  /**
   * Create is one call for a link-backed draft, and create → PUT → confirm for
   * a file-backed one. `uploadDocument` owns the three-step dance; it is handed
   * an `issue` that also captures the created row, because the confirm response
   * carries the document but the create response is what proves the draft
   * exists if the upload then fails.
   */
  const runCreate = async () => {
    if (reference) {
      const res = await plane.create(createPayload());
      return orgDocumentOf(res);
    }
    let created = null;
    const issue = async (fileMeta) => {
      const res = await plane.create({ ...createPayload(), ...fileMeta });
      created = orgDocumentOf(res);
      const ticket = uploadTicketOf(res);
      if (!ticket) throw new Error("Storage didn't return an upload link.");
      return { ...ticket, document_id: ticket.document_id || created?.id };
    };
    try {
      return await uploadDocument({ issue, confirm: plane.confirm, file, meta: {}, onStage: setStage, resume: draftTicket });
    } catch (err) {
      // The draft survives a failed upload; say so instead of losing the work.
      if (err instanceof DocumentUploadError && (err.issued || created)) {
        setDraftTicket(err.issued || null);
        onDraftLeft?.();
      }
      throw err;
    }
  };

  const runEdit = async () => {
    const body = updatePayload();
    const res = await plane.update(doc.id, body);
    const updated = orgDocumentOf(res);
    // Verified 2026-09-24: this deployment strips `file_name` and
    // `reference_url` from the update body. The response carries the saved
    // row, so compare rather than assume — a rename that silently did nothing
    // is worse than one that says so.
    if (body.file_name && updated && updated.file_name !== body.file_name) {
      setNameNotSaved(true);
    }
    if (!wantsFile || !file) return updated;
    // A draft's declared file metadata is immutable, so #45 re-issues a link for
    // the same object and confirm re-reads the real size from storage.
    const issue = async () => {
      const ticket = uploadTicketOf(await plane.issueUpload(doc.id));
      if (!ticket) throw new Error("Storage didn't return an upload link.");
      return { ...ticket, document_id: ticket.document_id || doc.id };
    };
    return uploadDocument({ issue, confirm: plane.confirm, file, meta: {}, onStage: setStage, resume: draftTicket });
  };

  /**
   * Issue what was just saved. Kept here so the whole chain is one action: a
   * file that has landed but never got published is the state that produces
   * the 409 everyone then has to dig themselves out of.
   */
  const runPublish = async (saved) => {
    setStage("publish");
    const res = await plane.publish(saved.id, {});
    const data = res?.data ?? res;
    const issued = orgDocumentOf(res) || saved;
    const count = Number(data?.recipient_count ?? data?.document?.recipient_count) || 0;
    if ((data?.warnings || []).includes("ZERO_RECIPIENTS")) {
      return { doc: issued, message: "Published, but nobody matched the audience. Check who it targets, then use Top up once it's fixed.", tone: "error" };
    }
    return { doc: issued, message: `Published to ${count} ${count === 1 ? "person" : "people"}`, tone: "success" };
  };

  const submit = async (e, intent = "draft") => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;

    const publishing = intent === "publish" && canPublish && !!plane.publish;
    if (publishing) {
      const who = proposing ? "this person" : goesToEveryoneNow ? "everyone in the organisation" : "the audience you chose";
      const ack = needsAck ? `\n\nThey will be asked to acknowledge it within ${ackDays} ${ackDays === 1 ? "day" : "days"}.` : "";
      if (!(await window.confirm(`Publish “${title}” to ${who}?${ack}\n\nThe list of people is fixed at this moment, and the document can't be edited afterwards.`))) return;
    }

    setError("");
    setStage("issue");
    try {
      const saved = editing ? await runEdit() : await runCreate();
      if (!publishing) {
        setStage("done");
        onSaved(
          saved,
          nameNotSaved
            ? "Draft saved, but the server kept the original file name."
            : editing ? "Draft saved" : proposing ? "Proposal sent to HR" : "Saved as a draft — publish it when you're ready",
          nameNotSaved ? { tone: "error" } : undefined,
        );
        return;
      }
      // The file is in storage by now, so a failure from here leaves a
      // publishable draft rather than losing the work.
      const result = await runPublish(saved);
      setStage("done");
      onSaved(result.doc, result.message, { published: true, tone: result.tone });
    } catch (err) {
      setStage(null);
      setError(err instanceof DocumentUploadError ? documentUploadMessage(err) : documentErrorMessage(err, "Couldn't save this document."));
    }
  };

  // ── Copy ───────────────────────────────────────────────────────────────────
  const heading = editing ? "Edit draft" : proposing ? "Propose a document" : "New organisation document";
  const sub = editing
    ? "Changes stay private until the document is published."
    : proposing
      ? "HR reviews your proposal and decides whether to issue it. You can edit it until they do."
      : "It is saved as a draft. Nobody sees it until you publish it.";

  const audienceCount = proposing ? form.included_users.length : null;
  // What the form describes right now. The published document's audience comes
  // from the server's own snapshot; this is only for the confirmation wording.
  // A manager can never publish (R-70), and neither button should fire twice.
  const showPublish = canPublish && !!plane.publish && !proposing;
  const saveDisabled = busy || !!draftTicket || (touched && !!firstProblem);
  const goesToEveryoneNow = !proposing && [
    form.target_departments, form.target_locations, form.target_employment_types,
    form.target_job_statuses, form.included_users, form.excluded_users,
  ].every((a) => a.length === 0);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={(e) => submit(e, "draft")}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              {editing ? <HiPencilAlt className="w-5 h-5" /> : <HiClipboardCheck className="w-5 h-5" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{heading}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto bg-slate-50/40">
          {/* ── What it is ───────────────────────────────────────────────── */}
          <Block step="1" title="What this document is" description="The kind of document decides the rules it must follow.">
            <div>
              <label htmlFor="org-type" className={LABEL}>Kind of document</label>
              {editing ? (
                <div className="min-h-10 flex items-center justify-between gap-3 bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-800">
                  <span className="truncate">{type?.name || "This document type"}</span>
                  <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Can’t be changed</span>
                </div>
              ) : types.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  {proposing
                    ? "Your organisation hasn't opened any document types for managers to propose."
                    : "No organisation document types exist yet. Create one under Document Types first — pick “Organisation document” as the kind."}
                </p>
              ) : (
                <select id="org-type" value={form.document_type_id} onChange={(e) => set("document_type_id", e.target.value)} disabled={locked} className={FIELD}>
                  <option value="">Choose a kind…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {show("type") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.type}</p>}
              {type && (
                <div className="mt-2 rounded-xl bg-purple-50/50 border border-purple-100 px-3.5 py-2.5 text-[11px] text-slate-600 leading-relaxed space-y-1">
                  {type.description && <p>{type.description}</p>}
                  <p className="font-semibold text-slate-500">
                    {[
                      typePolicyLine(type),
                      type.requires_acknowledgement ? "Always needs acknowledgement" : "",
                      type.requires_signature ? "Always needs a signature" : "",
                      type.is_confidential ? "Always confidential" : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="org-title" className={LABEL}>Title</label>
              <input
                id="org-title" type="text" value={form.title} maxLength={200} disabled={locked}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Leave Policy 2026" className={FIELD}
              />
              {show("title") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.title}</p>}
            </div>

            <div>
              <label htmlFor="org-desc" className={LABEL}>
                What changed, in a line or two <span className="normal-case font-semibold text-slate-400">(optional)</span>
              </label>
              <textarea
                id="org-desc" rows={3} value={form.description} maxLength={2000} disabled={locked}
                onChange={(e) => set("description", e.target.value)}
                placeholder="e.g. Carry-forward is now capped at 15 days, and the encashment window moves to March."
                className={`${FIELD} resize-none`}
              />
              {show("description")
                ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.description}</p>
                : <p className="text-[10px] text-slate-400 mt-1">Everyone who receives the document sees this.</p>}
            </div>
          </Block>

          {/* ── The file ─────────────────────────────────────────────────── */}
          <Block step="2" title="The document itself" description="Upload a file, or point at one your organisation already hosts.">
            {!backendLocked && (
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Where the document lives">
                {[
                  { value: "s3", label: "Upload a file", blurb: "Kept in encrypted storage.", icon: HiUpload },
                  { value: "reference", label: "Link to it", blurb: "An https link you already host.", icon: HiLink },
                ].map((o) => {
                  const active = form.storage_backend === o.value;
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.value} type="button" role="radio" aria-checked={active} disabled={locked}
                      onClick={() => { set("storage_backend", o.value); setFile(null); }}
                      className={`text-left px-3.5 py-3 rounded-xl border transition disabled:opacity-60 ${active ? "border-purple-400 bg-purple-50 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-200"}`}
                    >
                      <span className={`flex items-center gap-1.5 text-xs font-bold ${active ? "text-purple-800" : "text-slate-700"}`}><Icon className="w-4 h-4" /> {o.label}</span>
                      <span className="block text-[11px] text-slate-500 mt-1 leading-snug">{o.blurb}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {reference ? (
              editing ? (
                <div>
                  <label htmlFor="org-link-edit" className={LABEL}>
                    Link to the document <span className="normal-case font-semibold text-slate-400">(leave empty to keep the current one)</span>
                  </label>
                  <input
                    id="org-link-edit" type="url" inputMode="url" value={form.reference_url} maxLength={1000} disabled={locked}
                    onChange={(e) => set("reference_url", e.target.value)}
                    placeholder="Paste a new link to replace the current one" className={FIELD}
                  />
                  {show("link")
                    ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.link}</p>
                    : <p className="text-[11px] text-slate-500 mt-1">The current link isn&rsquo;t shown back for security, so there is nothing to compare against — paste the full address to correct it.</p>}
                </div>
              ) : (
                <div>
                  <label htmlFor="org-link" className={LABEL}>Link to the document</label>
                  <input
                    id="org-link" type="url" inputMode="url" value={form.reference_url} maxLength={1000} disabled={locked}
                    onChange={(e) => set("reference_url", e.target.value)}
                    placeholder="https://intranet.example.com/policies/leave-2026.pdf" className={FIELD}
                  />
                  {show("link")
                    ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.link}</p>
                    : <p className="text-[10px] text-slate-400 mt-1">People need to be able to reach this link for the document to be any use to them.</p>}
                </div>
              )
            ) : fileConfirmed && !changeFile ? (
              <div className="flex items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50/40 px-4 py-3">
                <span className="w-10 h-10 rounded-xl bg-white border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                  <HiCheck className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{doc.file_name}</p>
                  <p className="text-[11px] text-slate-500">{contentTypeLabel(doc.content_type)} · {formatBytes(doc.size_bytes)} · already in storage</p>
                </div>
                <button type="button" onClick={() => setChangeFile(true)} disabled={locked} className="text-xs font-bold text-purple-600 hover:text-purple-800 px-2 disabled:opacity-50">Replace</button>
              </div>
            ) : (
              <div>
                <span className={LABEL}>File</span>
                <FileDropField
                  file={file} onChange={setFile} allowed={fileFormats} maxBytes={type?.max_file_size_bytes}
                  problem={file || (touched && fileRequired) ? problems.file : ""} disabled={locked} id="org-file"
                />
                {editing && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    {fileConfirmed
                      ? `The replacement has to be a ${contentTypeLabel(doc.content_type)} file — its format is fixed by the upload link signed for this draft.`
                      : `The file for this draft was declared as “${doc?.file_name}”. Send that file — a different format won't be accepted.`}
                    {changeFile && (
                      <button type="button" onClick={() => { setChangeFile(false); setFile(null); }} className="ml-1 font-bold text-purple-600 hover:underline">Keep the current file</button>
                    )}
                  </p>
                )}
              </div>
            )}

            {editing && !reference && (
              <div>
                <label htmlFor="org-filename" className={LABEL}>
                  File name <span className="normal-case font-semibold text-slate-400">(what people see when they download it)</span>
                </label>
                <input
                  id="org-filename" type="text" value={form.file_name} maxLength={255} disabled={locked}
                  onChange={(e) => set("file_name", e.target.value)}
                  placeholder="e.g. Leave Policy 2026.pdf" className={FIELD}
                />
                {show("fileName")
                  ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.fileName}</p>
                  : <p className="text-[11px] text-slate-500 mt-1">Renaming doesn&rsquo;t re-upload anything — it only changes the name the file is saved under.</p>}
              </div>
            )}
          </Block>

          {/* ── When and what it asks ────────────────────────────────────── */}
          <Block step="3" title="When it applies, and what people must do">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="org-from" className={LABEL}>In force from <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                <input id="org-from" type="date" value={form.effective_from} disabled={locked} onChange={(e) => set("effective_from", e.target.value)} className={FIELD} />
                <p className="text-[10px] text-slate-400 mt-1">Leave empty to apply as soon as it’s published.</p>
              </div>
              <div>
                <label htmlFor="org-to" className={LABEL}>Until <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                <input id="org-to" type="date" min={form.effective_from || undefined} value={form.effective_to} disabled={locked} onChange={(e) => set("effective_to", e.target.value)} className={FIELD} />
                {show("window")
                  ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.window}</p>
                  : <p className="text-[10px] text-slate-400 mt-1">Leave empty if it stays in force until you withdraw it.</p>}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              <SwitchRow
                title="People must acknowledge it"
                description="Everyone who receives it is asked to confirm they've read it."
                checked={needsAck}
                disabled={locked || floor.requires_acknowledgement}
                note={floor.requires_acknowledgement ? (type?.requires_acknowledgement ? "This kind of document always needs acknowledgement." : "Already promised on this draft — it can't be taken back.") : ""}
                onChange={(v) => set("requires_acknowledgement", v)}
              />
              <SwitchRow
                title="People must sign it"
                description="Each person types their name to sign it. Signing also counts as acknowledging."
                checked={needsSignature}
                disabled={locked || floor.requires_signature}
                note={floor.requires_signature ? (type?.requires_signature ? "This kind of document always needs a signature." : "Already promised on this draft — it can't be taken back.") : ""}
                onChange={(v) => set("requires_signature", v)}
              />
              <SwitchRow
                title="Confidential"
                description="Only HR and the people who receive it can open the file."
                checked={confidential}
                disabled={locked || floor.is_confidential}
                note={floor.is_confidential ? (type?.is_confidential ? "This kind of document is always confidential." : "Already set on this draft — it can't be undone.") : ""}
                onChange={(v) => set("is_confidential", v)}
              />
            </div>

            {needsAck && (
              <div className="max-w-xs">
                <label htmlFor="org-ack-days" className={LABEL}>Days to acknowledge it</label>
                <input
                  id="org-ack-days" type="number" inputMode="numeric" min={ACK_DUE_MIN} max={ACK_DUE_MAX}
                  value={form.acknowledgement_due_days} disabled={locked}
                  onChange={(e) => set("acknowledgement_due_days", e.target.value)} className={FIELD}
                />
                {show("ack")
                  ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.ack}</p>
                  : <p className="text-[10px] text-slate-400 mt-1">Counted from the day it is published. People who haven’t acknowledged by then show as overdue.</p>}
              </div>
            )}

            {needsSignature && !needsAck && (
              <p className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-[11px] font-semibold text-indigo-800">
                <HiInformationCircle className="w-4 h-4 shrink-0 mt-px" />
                There’s no deadline for signing on its own. To give people a deadline and see who is late, also turn on “People must acknowledge it”.
              </p>
            )}
          </Block>

          {/* ── Audience ─────────────────────────────────────────────────── */}
          <Block
            step="4"
            icon={HiUserGroup}
            title={proposing ? "Who it's for" : "Who gets it"}
            description={proposing
              ? "A proposal is for one team member at a time."
              : "Leave everything empty to send it to the whole organisation. Each box you fill narrows it further."}
          >
            {proposing ? (
              <div>
                <label className={LABEL} htmlFor="org-person">Team member</label>
                <PersonSelect
                  id="org-person"
                  people={people}
                  value={form.included_users[0] || ""}
                  onChange={(id) => set("included_users", id ? [id] : [])}
                  placeholder="Choose a team member"
                  emptyText="No team members found."
                  loading={peopleLoading}
                  disabled={locked}
                />
                {show("audience")
                  ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.audience}</p>
                  : <p className="text-[10px] text-slate-400 mt-1">It has to be someone who reports to you. {audienceCount === 1 ? "" : "Choose one person."}</p>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MultiSelectDropdown
                    label="Departments"
                    placeholder="All departments"
                    options={withSelected(targeting.departmentOptions, form.target_departments)}
                    value={form.target_departments}
                    onChange={(v) => set("target_departments", v)}
                  />
                  <MultiSelectDropdown
                    label="Locations"
                    placeholder="All locations"
                    options={withSelected(targeting.locationOptions, form.target_locations)}
                    value={form.target_locations}
                    onChange={(v) => set("target_locations", v)}
                  />
                  <MultiSelectDropdown
                    label="Employment types"
                    placeholder="All employment types"
                    options={withSelected(targeting.employmentTypeOptions, form.target_employment_types)}
                    value={form.target_employment_types}
                    onChange={(v) => set("target_employment_types", v)}
                  />
                  <MultiSelectDropdown
                    label="Job statuses"
                    placeholder="All job statuses"
                    options={withSelected(targeting.jobStatusOptions, form.target_job_statuses)}
                    value={form.target_job_statuses}
                    onChange={(v) => set("target_job_statuses", v)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL} htmlFor="org-included">Only these people <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                    <PersonMultiSelect
                      id="org-included" people={people} value={form.included_users}
                      onChange={(v) => set("included_users", v)} max={TARGET_ARRAY_MAX}
                      placeholder="Anyone who matches above" loading={peopleLoading} disabled={locked}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Narrows it further — they still have to match the boxes above.</p>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="org-excluded">Except these people <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
                    <PersonMultiSelect
                      id="org-excluded" people={people} value={form.excluded_users}
                      onChange={(v) => set("excluded_users", v)} max={TARGET_ARRAY_MAX}
                      placeholder="Nobody" loading={peopleLoading} disabled={locked}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Always wins, whatever else matches.</p>
                  </div>
                </div>

                {show("audience") && <p className="text-[11px] font-semibold text-rose-600">{problems.audience}</p>}

                <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 leading-relaxed">
                  <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-slate-400" />
                  The exact list of people is worked out when you publish, and fixed from then on. Anyone who joins later can be added from the document’s page.
                </p>
              </>
            )}
          </Block>

          {/* ── Progress and errors ──────────────────────────────────────── */}
          {stage && !reference && (
            <ol className="rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 space-y-2" aria-live="polite">
              {STAGES.map((s) => {
                const order = STAGES.findIndex((x) => x.key === stage);
                const idx = STAGES.findIndex((x) => x.key === s.key);
                const done = stage === "done" || idx < order;
                const active = idx === order && stage !== "done";
                return (
                  <li key={s.key} className={`flex items-center gap-2.5 text-xs font-semibold ${done ? "text-violet-700" : active ? "text-purple-700" : "text-slate-400"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-violet-600 text-white" : active ? "bg-white border-2 border-purple-500" : "bg-white border border-slate-200"}`}>
                      {done ? <HiCheck className="w-3 h-3" /> : active ? <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" /> : null}
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
              <span>
                {error}
                {draftTicket ? " The draft was saved — close this and open it from the list to attach the file again." : ""}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {showPublish && (
            <p className="mr-auto text-[11px] text-slate-500 max-w-xs leading-relaxed hidden sm:block">
              Publishing fixes who gets it and can’t be undone. Saving keeps it private until you’re ready.
            </p>
          )}
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>{draftTicket ? "Close" : "Cancel"}</button>
          <button type="submit" disabled={saveDisabled} className={showPublish ? SECONDARY_BTN : PRIMARY_BTN}>
            {busy && stage !== "publish"
              ? <span className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${showPublish ? "border-slate-300 border-t-slate-600" : "border-white/40 border-t-white"}`} />
              : editing ? <HiRefresh className="w-4 h-4" /> : <HiCheck className="w-4 h-4" />}
            {busy && stage !== "publish" ? "Saving…" : proposing ? "Send to HR" : "Save as draft"}
          </button>
          {showPublish && (
            <button type="button" onClick={(e) => submit(e, "publish")} disabled={saveDisabled} className={PRIMARY_BTN}>
              {busy
                ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <HiPaperAirplane className="w-4 h-4" />}
              {busy ? (stage === "publish" ? "Publishing…" : "Preparing…") : "Save and publish"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
