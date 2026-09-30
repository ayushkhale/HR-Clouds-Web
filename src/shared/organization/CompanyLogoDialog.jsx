// ─────────────────────────────────────────────────────────────────────────────
// organization/CompanyLogoDialog.jsx — HR changes the company logo: choose an
// image, check it, save. Opened from the logo on Company Profile.
//
// A form, not a record inspector (CLAUDE.md §3), and single-purpose, so it
// stays narrow.
//
// Unlike a profile photo there is no framing step: a logo keeps its own
// proportions (see logoUpload.js). The preview instead shows it the two ways it
// will actually be seen — on the white profile card and on the purple header
// band — because a white wordmark is invisible on one and a dark one on the
// other, and nobody finds that out until it is saved.
//
// Nothing is uploaded until Save. The object URL made for the preview is
// revoked when the picture changes or the dialog closes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { HiPhotograph, HiX, HiRefresh, HiCheck, HiExclamationCircle, HiOfficeBuilding } from "react-icons/hi";
import { LOGO_TYPES, loadLogoImage, logoFileProblem, logoUploadMessage, prepareLogo, uploadCompanyLogo } from "./logoUpload";

const STEPS = [
  { key: "issue", label: "Getting a secure upload link" },
  { key: "put", label: "Sending the image" },
  { key: "confirm", label: "Saving it to the company profile" },
];

export default function CompanyLogoDialog({ currentLogo, companyName, onClose, onSaved }) {
  const [source, setSource] = useState(null); // { file, img, url }
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const savingRef = useRef(false);
  savingRef.current = saving;

  useEffect(() => () => { if (source?.url) URL.revokeObjectURL(source.url); }, [source]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !savingRef.current) onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  async function takeFile(file) {
    setError("");
    const problem = logoFileProblem(file);
    if (problem) { setError(problem); return; }
    try {
      const { img, url } = await loadLogoImage(file);
      setSource({ file, img, url });
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    if (!source || saving) return;
    setError("");
    setSaving(true);
    setStage("issue");
    try {
      const file = await prepareLogo(source.file, source.img);
      const details = await uploadCompanyLogo(file, setStage);
      onSaved(details);
    } catch (err) {
      setError(logoUploadMessage(err));
      setSaving(false);
      setStage(null);
    }
  }

  const preview = source?.url || currentLogo || "";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-logo-title"
        className="bg-white rounded-2xl shadow-2xl shadow-purple-900/20 w-full max-w-md flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-purple-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiPhotograph className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h3 id="company-logo-title" className="text-base font-bold text-slate-900">Change company logo</h3>
              <p className="text-xs text-slate-500">Everyone in the organisation sees it on Company Profile.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40">
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-5">
          <input
            ref={inputRef}
            type="file"
            accept={LOGO_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) takeFile(f); }}
          />

          {preview ? (
            <div className="space-y-3">
              {/* The two backgrounds it has to work on. */}
              <div className="grid grid-cols-2 gap-3">
                <figure className="rounded-2xl border border-slate-200 bg-white p-3 flex flex-col items-center gap-2">
                  <span className="h-20 w-full flex items-center justify-center overflow-hidden">
                    <img src={preview} alt="" className="max-h-20 max-w-full object-contain" />
                  </span>
                  <figcaption className="text-[10px] font-bold uppercase tracking-wider text-slate-400">On white</figcaption>
                </figure>
                <figure className="rounded-2xl border border-purple-200 bg-gradient-to-r from-[#5B21B6] to-[#4C1D95] p-3 flex flex-col items-center gap-2">
                  <span className="h-20 w-full flex items-center justify-center overflow-hidden">
                    <img src={preview} alt="" className="max-h-20 max-w-full object-contain" />
                  </span>
                  <figcaption className="text-[10px] font-bold uppercase tracking-wider text-white/60">On purple</figcaption>
                </figure>
              </div>
              <p className="text-xs text-slate-500">
                {source ? "This replaces the current logo when you save." : `The logo ${companyName || "your organisation"} uses now.`}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="w-12 h-12 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center shrink-0"><HiOfficeBuilding className="w-6 h-6" /></span>
              <p className="text-xs text-slate-600 leading-relaxed">There’s no logo yet — the profile shows the company’s initials instead.</p>
            </div>
          )}

          {!saving && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) takeFile(f); }}
              className={`w-full flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl border-2 border-dashed transition-colors outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                dragOver ? "border-purple-500 bg-purple-50" : "border-purple-200 bg-purple-50/30 hover:bg-purple-50 hover:border-purple-300"
              }`}
            >
              <span className="w-12 h-12 rounded-2xl bg-white shadow-sm text-purple-600 flex items-center justify-center"><HiPhotograph className="w-6 h-6" /></span>
              <span className="text-sm font-bold text-slate-800">{source ? "Choose a different image" : "Choose an image"} <span className="font-medium text-slate-500">or drop it here</span></span>
              <span className="text-xs text-slate-500">PNG, JPG or WebP, up to 5 MB. A PNG with a transparent background looks best.</span>
            </button>
          )}

          {saving && (
            <ol className="space-y-2" aria-live="polite">
              {STEPS.map((s, i) => {
                const at = STEPS.findIndex((x) => x.key === stage);
                const done = i < at;
                const now = i === at;
                return (
                  <li key={s.key} className={`flex items-center gap-3 text-sm ${done ? "text-slate-500" : now ? "text-slate-900 font-semibold" : "text-slate-400"}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-violet-100 text-violet-600" : now ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {done ? <HiCheck className="w-3.5 h-3.5" /> : now ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                    </span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              <HiExclamationCircle className="w-5 h-5 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-6 py-4 border-t border-purple-100 bg-purple-50/40 rounded-b-2xl">
          {source && !saving && (
            <button type="button" onClick={() => setSource(null)} className="sm:mr-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors">
              <HiRefresh className="w-4 h-4" /> Keep the current one
            </button>
          )}
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 sm:ml-auto">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!source || saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiCheck className="w-4 h-4" />}
            {saving ? "Saving…" : "Save logo"}
          </button>
        </div>
      </div>
    </div>
  );
}
