// ─────────────────────────────────────────────────────────────────────────────
// documents/LinkReferenceDialog.jsx — HR records an externally hosted document
// (DocuSign, DigiLocker…) against an employee without storing a file
// (POST /hr/employees/:userId/documents/link-reference, #12). It is created
// straight into `available`; viewing it opens the link.
// Rule R-21: https only, at most 1000 characters, no control characters.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiLink, HiLockClosed, HiX, HiInformationCircle } from "react-icons/hi";
import { documentErrorMessage } from "../utils/documentErrors";
import { groupLabel } from "./documentMeta";
import { FIELD, LABEL, PRIMARY_BTN, SECONDARY_BTN } from "./ui";
import { todayYMD } from "../attendance/dates";

function urlProblem(value) {
  const text = value.trim();
  if (!text) return "Paste the document's link.";
  if (text.length > 1000) return "The link is longer than 1000 characters.";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) return "The link contains characters that aren't allowed.";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return "Only secure links (https://) can be linked.";
  } catch {
    return "That isn't a valid web address.";
  }
  return "";
}

export default function LinkReferenceDialog({ types = [], subjectName = "", link, onDone, onClose }) {
  const [form, setForm] = useState({ document_type_id: "", title: "", reference_url: "", document_number: "", issued_on: "", expires_on: "", is_confidential: false });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) { e.stopPropagation(); onCloseRef.current?.(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [saving]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const type = types.find((t) => t.id === form.document_type_id) || null;
  const confidentialForced = !!type?.is_confidential;
  const title = form.title.trim();
  const problems = {
    type: !form.document_type_id ? "Choose a document type." : "",
    title: title.length < 3 ? "Give the document a title (at least 3 characters)." : title.length > 200 ? "Keep the title under 200 characters." : "",
    url: urlProblem(form.reference_url),
    expires: type?.has_expiry && !form.expires_on ? "This document type tracks expiry — add the expiry date." : "",
    order: form.issued_on && form.expires_on && form.expires_on <= form.issued_on ? "The expiry date must be after the issue date." : "",
  };
  const firstProblem = Object.values(problems).find(Boolean);
  const show = (k) => (touched ? problems[k] : "");

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (firstProblem || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await link({
        document_type_id: form.document_type_id,
        title,
        reference_url: form.reference_url.trim(),
        issued_on: form.issued_on || null,
        expires_on: form.expires_on || null,
        document_number: form.document_number.trim() || null,
        is_confidential: confidentialForced || form.is_confidential,
      });
      onDone?.(res?.data ?? res);
    } catch (err) {
      setError(documentErrorMessage(err, "Couldn't link this document."));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label="Link an external document" className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiLink className="w-5 h-5" /></span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Link an external document</h2>
              <p className="text-xs text-slate-500 mt-0.5">{subjectName ? `For ${subjectName}. ` : ""}No file is stored — viewing it opens the link.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <label htmlFor="ref-type" className={LABEL}>Document type</label>
            <select id="ref-type" value={form.document_type_id} onChange={(e) => set("document_type_id", e.target.value)} className={FIELD}>
              <option value="">Choose a type…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.group ? ` · ${groupLabel(t.group)}` : ""}</option>)}
            </select>
            {show("type") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.type}</p>}
          </div>

          <div>
            <label htmlFor="ref-url" className={LABEL}>Secure link</label>
            <input id="ref-url" type="url" inputMode="url" value={form.reference_url} onChange={(e) => set("reference_url", e.target.value)} placeholder="https://na2.docusign.net/…" className={`${FIELD} font-mono text-xs`} />
            {show("url") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.url}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ref-title" className={LABEL}>Title</label>
              <input id="ref-title" type="text" maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Signed employment agreement" className={FIELD} />
              {show("title") && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.title}</p>}
            </div>
            <div>
              <label htmlFor="ref-number" className={LABEL}>Reference number <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
              <input id="ref-number" type="text" maxLength={100} autoComplete="off" value={form.document_number} onChange={(e) => set("document_number", e.target.value)} placeholder="e.g. DS-2026-0987" className={`${FIELD} font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ref-issued" className={LABEL}>Issued on <span className="normal-case font-semibold text-slate-400">(optional)</span></label>
              <input id="ref-issued" type="date" max={todayYMD()} value={form.issued_on} onChange={(e) => set("issued_on", e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="ref-expires" className={LABEL}>Expires on {type?.has_expiry ? <span className="text-rose-500">*</span> : <span className="normal-case font-semibold text-slate-400">(optional)</span>}</label>
              <input id="ref-expires" type="date" min={form.issued_on || undefined} value={form.expires_on} onChange={(e) => set("expires_on", e.target.value)} className={FIELD} />
              {(show("expires") || show("order")) && <p className="text-[11px] font-semibold text-rose-600 mt-1">{problems.expires || problems.order}</p>}
            </div>
          </div>

          <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${confidentialForced ? "bg-slate-50 border-slate-200" : "border-slate-200 hover:border-purple-200 cursor-pointer"}`}>
            <input type="checkbox" checked={confidentialForced || form.is_confidential} disabled={confidentialForced} onChange={(e) => set("is_confidential", e.target.checked)} className="mt-0.5 w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><HiLockClosed className="w-4 h-4 text-purple-500" /> Confidential</span>
              <span className="block text-xs text-slate-500 mt-0.5">{confidentialForced ? "This document type is always confidential." : "Hide it from managers — only HR and the employee can see it."}</span>
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700" role="alert">
              <HiInformationCircle className="w-4 h-4 shrink-0 mt-px" /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BTN}>Cancel</button>
          <button type="submit" disabled={saving || (touched && !!firstProblem)} className={PRIMARY_BTN}>
            {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <HiLink className="w-4 h-4" />}
            {saving ? "Linking…" : "Link document"}
          </button>
        </div>
      </form>
    </div>
  );
}
