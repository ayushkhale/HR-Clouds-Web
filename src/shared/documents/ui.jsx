// ─────────────────────────────────────────────────────────────────────────────
// documents/ui.jsx — Small presentational pieces shared by every Documents
// screen: the status badge, the file drop zone, form field styles, the
// feature-off state and an error state that knows the Documents error codes.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { HiCloudUpload, HiDocumentText, HiExclamationCircle, HiPhotograph, HiRefresh, HiX, HiLink, HiTable } from "react-icons/hi";
import FeatureNotAvailable from "../components/FeatureNotAvailable";
import { TONE_CLASSES, TONE_DOT } from "../attendance/enums";
import { documentErrorMessage, isDocumentsDisabled, isFeatureNotDeployed } from "../utils/documentErrors";
import { ALL_CONTENT_TYPES, HARD_MAX_BYTES, acceptAttr, contentTypeLabel, contentTypeOfFile, docStatusMeta, formatBytes, formatList, isImageType, isReferenceDoc } from "./documentMeta";

export const FIELD = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition disabled:opacity-60";
export const LABEL = "block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2";
export const SELECT = "h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:border-purple-400 outline-none";
export const PRIMARY_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 transition shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed";
export const SECONDARY_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed";
export const DANGER_BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed";

/** Status pill for a document. Pass the display status (see displayStatus). */
export function DocStatusBadge({ status, className = "" }) {
  const meta = docStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${TONE_CLASSES[meta.tone] || TONE_CLASSES.slate} ${className}`} title={meta.hint || meta.label}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.slate}`} aria-hidden="true" />
      {meta.short}
    </span>
  );
}

/** Icon tile for a document: link, image, sheet or generic file. */
export function DocIcon({ doc, className = "w-9 h-9" }) {
  const Icon = isReferenceDoc(doc) ? HiLink : isImageType(doc?.content_type) ? HiPhotograph : /sheet/.test(doc?.content_type || "") ? HiTable : HiDocumentText;
  return (
    <span className={`${className} rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0`}>
      <Icon className="w-[55%] h-[55%]" />
    </span>
  );
}

/**
 * Click-or-drop file field. Shows the chosen file with its size and format,
 * or the limits when empty. `problem` is the validation message to display.
 */
export function FileDropField({ file, onChange, allowed, maxBytes, problem, disabled = false, id }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const types = allowed?.length ? allowed : ALL_CONTENT_TYPES;
  const limit = Math.min(maxBytes || HARD_MAX_BYTES, HARD_MAX_BYTES);

  const pick = (files) => {
    const next = files?.[0];
    if (next) onChange(next);
  };

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={acceptAttr(types)}
        disabled={disabled}
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />
      {file ? (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${problem ? "border-rose-200 bg-rose-50/40" : "border-purple-200 bg-purple-50/40"}`}>
          <span className="w-10 h-10 rounded-xl bg-white border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            {isImageType(contentTypeOfFile(file)) ? <HiPhotograph className="w-5 h-5" /> : <HiDocumentText className="w-5 h-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
            <p className="text-[11px] text-slate-500">{formatBytes(file.size)} · {contentTypeLabel(contentTypeOfFile(file))}</p>
          </div>
          {!disabled && (
            <>
              <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-bold text-purple-600 hover:text-purple-800 px-2">Change</button>
              <button type="button" onClick={() => onChange(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white" aria-label="Remove file"><HiX className="w-4 h-4" /></button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) pick(e.dataTransfer.files); }}
          className={`w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${dragging ? "border-purple-400 bg-purple-50" : "border-slate-200 bg-slate-50/60 hover:border-purple-300 hover:bg-purple-50/40"} disabled:opacity-60`}
        >
          <HiCloudUpload className="w-8 h-8 text-purple-500" />
          <span className="text-sm font-bold text-slate-700">Drop a file here or <span className="text-purple-600">browse</span></span>
          <span className="text-[11px] text-slate-500">{formatList(types)} · up to {formatBytes(limit)}</span>
        </button>
      )}
      {problem && <p className="text-[11px] font-semibold text-rose-600 mt-1.5">{problem}</p>}
    </div>
  );
}

/**
 * Error block that turns the two "this isn't a fault" cases into clear notices:
 * a disabled `documents.access` flag, and a part of the module the server
 * hasn't been updated to yet. Neither gets a Try again button, because trying
 * again is not what fixes them.
 */
export function DocErrorState({ error, onRetry, fallback = "Couldn't load documents.", className = "" }) {
  if (isDocumentsDisabled(error)) {
    return (
      <div className={`py-6 ${className}`}>
        <FeatureNotAvailable title="Documents aren't enabled" message={documentErrorMessage(error)} />
      </div>
    );
  }
  if (isFeatureNotDeployed(error)) {
    return (
      <div className={`py-6 ${className}`}>
        <FeatureNotAvailable title="Not on your server yet" message={documentErrorMessage(error)} />
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center justify-center text-center gap-3 py-10 px-4 ${className}`} role="alert">
      <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-400">
        <HiExclamationCircle className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-slate-700 max-w-md">{documentErrorMessage(error, fallback)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition">
          <HiRefresh className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

/** Empty list block with an optional call to action. */
export function DocEmptyState({ title, message, action, icon: Icon = HiDocumentText }) {
  return (
    <div className="p-12 text-center">
      <span className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-400 flex items-center justify-center mx-auto mb-3"><Icon className="w-7 h-7" /></span>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {message && <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Plain on/off switch (same look as the attendance policy toggles). */
export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${checked ? "bg-purple-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

/** A labelled switch row with a one-line explanation. */
export function SwitchRow({ title, description, checked, onChange, disabled = false, note }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
        {note && <p className="text-[11px] font-semibold text-fuchsia-700 mt-1">{note}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}
