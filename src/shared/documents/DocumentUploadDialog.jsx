// ─────────────────────────────────────────────────────────────────────────────
// documents/DocumentUploadDialog.jsx — Add a document, or upload a new version
// of one (replace). One form for every audience:
//   self    — POST /me/documents               · POST /me/documents/:id/replace
//   manager — POST /manager/employees/:id/documents (no replace for managers)
//   hr      — POST /hr/employees/:id/documents · POST /hr/documents/:id/replace
//
// The chosen type drives the form: its allowed formats and size cap validate
// the file before anything is sent, "tracks expiry" makes the expiry date
// required, and a confidential type can't be made visible (tighten-only, D-12).
// A replace keeps the predecessor live until the new version is confirmed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { HiCheck, HiClipboardList, HiLockClosed, HiUpload, HiX, HiInformationCircle, HiRefresh } from "react-icons/hi";
import { DocumentUploadError, documentUploadMessage, uploadDocument } from "./documentUpload";
import { fileProblem, groupLabel, typePolicyLine } from "./documentMeta";
import { FIELD, FileDropField, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { fmtDate, todayYMD } from "../attendance/dates";

const STAGES = [
  { key: "issue", label: "Preparing a secure upload link" },
  { key: "put", label: "Sending the file to encrypted storage" },
  { key: "confirm", label: "Checking the file arrived intact" },
];

/**
 * @param {object} props
 * @param {"upload"|"replace"} [props.mode]
 * @param {object[]} props.types           types this viewer may upload into
 * @param {string}   [props.presetTypeId]  pre-select (and, for replace, lock) this type
 * @param {string}   [props.presetTitle]   start the title off filled in (opened from a request or a checklist row)
 * @param {object}   [props.askedFor]      { headline, note, dueOn } — what was asked, kept in view while filling the form
 * @param {object}   [props.predecessor]   the document being replaced
 * @param {string}   [props.subjectName]   whose file this goes into (HR / manager)
 * @param {(payload: object) => Promise} props.issue   issue or replace call, bound to its target
 * @param {(documentId: string) => Promise} props.confirm
 * @param {(doc: object) => void} props.onDone      after a confirmed upload
 * @param {() => void} [props.onDraftLeft]          an unfinished draft now exists or was discarded (refresh lists)
 * @param {(documentId: string) => Promise} [props.discard]  delete the failed draft on "Start over" (planes that can delete)
 * @param {() => void} props.onClose
 */
export default function DocumentUploadDialog({ mode = "upload", types = [], presetTypeId = "", presetTitle = "", askedFor = null, predecessor = null, subjectName = "", issue, confirm, discard, onDone, onDraftLeft, onClose }) {
  const replacing = mode === "replace";
  const [form, setForm] = useState(() => ({
    document_type_id: predecessor?.document_type_id || presetTypeId || "",
    title: predecessor?.title || presetTitle || "",
    document_number: "",
    issued_on: "",
    expires_on: "",
    is_confidential: !!predecessor?.is_confidential,
  }));
  const [file, setFile] = useState(null);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState(null); // null | issue | put | confirm | done
  const [error, setError] = useState("");
  // The issued link of a failed attempt. The server recorded the details it was
  // issued with, so while it exists the form is locked: "Try again" resends
  // exactly that, and "Start over" discards it before anything can change.
  const [draft, setDraft] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const busy = (stage && stage !== "done") || discarding;
  const locked = busy || !!draft;

  const type = useMemo(() => types.find((t) => t.id === form.document_type_id) || null, [types, form.document_type_id]);
  const typeLocked = replacing || (!!presetTypeId && types.some((t) => t.id === presetTypeId));
  const confidentialForced = !!type?.is_confidential || (replacing && !!predecessor?.is_confidential);

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

  const today = todayYMD();
  const title = form.title.trim();
  const problems = {
    type: !form.document_type_id ? "Choose what kind of document this is." : "",
    title: title.length < 3 ? "Give the document a title (at least 3 characters)." : title.length > 200 ? "Keep the title under 200 characters." : "",
    number: form.document_number.trim().length > 100 ? "Keep the document number under 100 characters." : "",
    expires: type?.has_expiry && !form.expires_on ? "This kind of document runs out — add the date it expires." : "",
    order: form.issued_on && form.expires_on && form.expires_on <= form.issued_on ? "The expiry date must be after the issue date." : "",
    issued: form.issued_on && form.issued_on > today ? "The issue date can't be in the future." : "",
    file: fileProblem(file, { allowed: type?.allowed_content_types, maxBytes: type?.max_file_size_bytes }),
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (key) => (touched ? problems[key] : "");
  const expiredAlready = form.expires_on && form.expires_on < today;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || busy) return;
    setError("");
    const meta = {
      document_type_id: form.document_type_id,
      title,
      issued_on: form.issued_on || null,
      expires_on: form.expires_on || null,
      document_number: form.document_number.trim() || null,
      is_confidential: confidentialForced || form.is_confidential,
    };
    try {
      const doc = await uploadDocument({ issue, confirm, file, meta, onStage: setStage, resume: draft });
      setStage("done");
      onDone?.(doc);
    } catch (err) {
      setStage(null);
      if (err instanceof DocumentUploadError && err.issued) {
        setDraft(err.issued);
        onDraftLeft?.();
      }
      setError(documentUploadMessage(err));
    }
  };

  const canRetry = !!draft && !busy;

  const startOver = async () => {
    if (!draft || busy) return;
    setDiscarding(true);
    try {
      // Best effort: an undeleted draft is reaped by the server after the upload-link TTL.
      if (discard && draft.document_id) await discard(draft.document_id).catch(() => {});
    } finally {
      setDraft(null);
      setError("");
      setStage(null);
      setDiscarding(false);
      onDraftLeft?.();
    }
  };
  const heading = replacing ? "Upload a new version" : "Add a document";
  const sub = replacing
    ? `Replaces “${predecessor?.title || "this document"}”. The current version stays in force until the new one is checked.`
    : subjectName ? `For ${subjectName}` : "It goes straight to encrypted storage.";

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label={heading} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">{replacing ? <HiRefresh className="w-5 h-5" /> : <HiUpload className="w-5 h-5" />}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">{heading}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg disabled:opacity-40" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* What was asked, kept in view. Opening the form from a request used
              to mean leaving the note and the deadline behind on the other
              screen — which is exactly the detail needed to fill it in. */}
          {askedFor && (
            <div className="flex items-start gap-3 rounded-2xl border border-purple-200 bg-purple-50/60 px-4 py-3.5">
              <span className="w-9 h-9 rounded-xl bg-white text-purple-600 flex items-center justify-center shrink-0">
                <HiClipboardList className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">{askedFor.headline}</p>
                {askedFor.dueOn && <p className="text-xs font-semibold text-purple-700 mt-0.5">Needed by {fmtDate(askedFor.dueOn)}</p>}
                {askedFor.note && <p className="text-xs text-slate-600 mt-1.5 leading-relaxed whitespace-pre-line">“{askedFor.note}”</p>}
                <p className="text-[11px] text-slate-500 mt-1.5">Uploading it here ticks the request off by itself.</p>
              </div>
            </div>
          )}

          {/* Type */}
          <div>
            <label htmlFor="doc-type" className={LABEL}>Kind of document</label>
            {typeLocked ? (
              <div className="min-h-10 flex items-center justify-between gap-3 bg-slate-50/70 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-800">
                <span className="truncate">{type?.name || "This kind of document"}</span>
                {type?.group && <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">{groupLabel(type.group)}</span>}
              </div>
            ) : types.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">There’s nothing you can upload here yet.</p>
            ) : (
              <select id="doc-type" value={form.document_type_id} onChange={(e) => set("document_type_id", e.target.value)} disabled={locked} className={FIELD}>
                <option value="">Choose one…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.group ? ` · ${groupLabel(t.group)}` : ""}</option>)}
              </select>
            )}
            {show("type") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.type}</p>}
            {type && (
              <div className="mt-2 rounded-xl bg-purple-50/50 border border-purple-100 px-3.5 py-2.5 text-[11px] text-slate-600 leading-relaxed space-y-1">
                {type.description && <p>{type.description}</p>}
                <p className="font-semibold text-slate-500">
                  {[typePolicyLine(type), type.has_expiry ? "Expiry date required" : "", type.requires_verification === false ? "Active immediately" : type.requires_verification ? "Reviewed before it counts" : "", type.allows_multiple ? "You can keep several" : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
          </div>

          {/* Title + number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="doc-title" className={LABEL}>Title</label>
              <input id="doc-title" type="text" value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} disabled={locked} placeholder="e.g. PAN card — front side" className={FIELD} />
              {show("title") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.title}</p>}
            </div>
            <div>
              <label htmlFor="doc-number" className={LABEL}>Document number <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
              <input id="doc-number" type="text" value={form.document_number} maxLength={100} autoComplete="off" onChange={(e) => set("document_number", e.target.value)} disabled={locked} placeholder={replacing ? "Re-enter if it changed" : "e.g. ABCDE1234F"} className={`${FIELD} font-mono`} />
              {show("number") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.number}</p>
                : <p className="text-[10px] text-slate-400 mt-1">Stored securely; only the last 4 characters are ever shown.</p>}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="doc-issued" className={LABEL}>Issued on <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
              <input id="doc-issued" type="date" max={today} value={form.issued_on} onChange={(e) => set("issued_on", e.target.value)} disabled={locked} className={FIELD} />
              {show("issued") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.issued}</p>}
            </div>
            <div>
              <label htmlFor="doc-expires" className={LABEL}>Expires on {type?.has_expiry ? <span className="text-rose-500">*</span> : <span className="normal-case font-semibold text-slate-400">(optional)</span>}</label>
              <input id="doc-expires" type="date" min={form.issued_on || undefined} value={form.expires_on} onChange={(e) => set("expires_on", e.target.value)} disabled={locked} className={FIELD} />
              {show("expires") || show("order") ? <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.expires || problems.order}</p>
                : expiredAlready ? <p className="text-[11px] font-semibold text-fuchsia-700 mt-1">This date has passed — the document will be recorded as expired.</p> : null}
            </div>
          </div>

          {/* Confidential */}
          <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${confidentialForced ? "bg-slate-50 border-slate-200 cursor-not-allowed" : "border-slate-200 hover:border-purple-200 cursor-pointer"}`}>
            <input type="checkbox" checked={confidentialForced || form.is_confidential} disabled={confidentialForced || locked} onChange={(e) => set("is_confidential", e.target.checked)} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><HiLockClosed className="w-4 h-4 text-purple-500" /> Confidential</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                {confidentialForced ? "This document is confidential and stays hidden from managers." : "Hide it from managers — only HR and the employee can see it. Can't be undone."}
              </span>
            </span>
          </label>

          {/* File */}
          <div>
            <span className={LABEL}>File</span>
            <FileDropField file={file} onChange={setFile} allowed={type?.allowed_content_types} maxBytes={type?.max_file_size_bytes} problem={file || touched ? problems.file : ""} disabled={locked} id="doc-file" />
          </div>

          {/* Progress */}
          {stage && (
            <ol className="rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 space-y-2" aria-live="polite">
              {STAGES.map((s) => {
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
              <span>{error}{canRetry ? " Your draft is kept — Try again resends the same file and details. To change anything, choose Start over." : ""}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          {canRetry && <button type="button" onClick={startOver} className={`${SECONDARY_BTN} mr-auto`}>Start over</button>}
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={busy || (touched && !!firstProblem)} className={PRIMARY_BTN}>
            {busy ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : canRetry ? <HiRefresh className="w-4 h-4" /> : <HiUpload className="w-4 h-4" />}
            {busy ? "Uploading…" : canRetry ? "Try again" : replacing ? "Upload new version" : "Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}
