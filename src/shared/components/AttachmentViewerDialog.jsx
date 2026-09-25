// ─────────────────────────────────────────────────────────────────────────────
// AttachmentViewerDialog.jsx — Views a Phase 5 document (receipt, proof, Form 16
// Part A) through a short-lived pre-signed URL. Images render inline, PDFs in an
// iframe, and external references (TRACES links) as a plain link. The URL is
// never cached: it expires after 5 minutes, so every open and Retry re-fetches.
// Sits above DetailDialog (z-140) at z-165.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiX, HiExternalLink, HiDownload, HiRefresh, HiExclamationCircle } from "react-icons/hi";
import { fetchViewUrl, isImageType, isPdfType, isReferenceAttachment } from "../utils/payrollAttachments";
import { payrollErrorMessage } from "../utils/payrollErrors";

// `errorMessage` maps a failure to text (payroll's map by default). With
// `fetchReferences`, external links are also resolved through `getViewUrl`
// (the Documents module audits every view, links included).
export default function AttachmentViewerDialog({ attachment, getViewUrl, onClose, errorMessage = payrollErrorMessage, fetchReferences = false }) {
  const [url, setUrl] = useState("");
  // What the signing call itself said about the file. The leave-attachment
  // bridge describes it; most endpoints don't, and then the caller's own
  // metadata stands.
  const [resolved, setResolved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const reqRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const id = attachment?.id;
  const isReference = isReferenceAttachment(attachment);
  const referenceUrl = attachment?.reference_url || "";

  const load = useCallback(async () => {
    if (!id) return;
    if (isReference && referenceUrl && !fetchReferences) {
      setUrl(referenceUrl);
      setLoading(false);
      setError("");
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError("");
    try {
      const { view_url, content_type, file_name } = await fetchViewUrl(getViewUrl, id, { disposition: "inline" });
      if (reqId !== reqRef.current) return;
      if (!view_url) throw new Error("No view URL returned.");
      setUrl(view_url);
      if (content_type || file_name) setResolved({ content_type, file_name });
    } catch (err) {
      if (reqId !== reqRef.current) return;
      setError(errorMessage(err, "Couldn't open this file."));
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [id, getViewUrl, isReference, referenceUrl, fetchReferences, errorMessage]);

  useEffect(() => { load(); }, [load]);

  // Escape closes only this viewer (capture, like ReasonDialog).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const download = async () => {
    if (!id || downloading || isReference) return;
    setDownloading(true);
    try {
      // A fresh URL: the inline one may have expired, and this one carries the
      // attachment disposition so the browser saves rather than previews it.
      const { view_url } = await fetchViewUrl(getViewUrl, id, { disposition: "attachment" });
      if (!view_url) throw new Error("No download URL returned.");
      const a = document.createElement("a");
      a.href = view_url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(errorMessage(err, "Couldn't download this file."));
    } finally {
      setDownloading(false);
    }
  };

  const contentType = attachment?.content_type || resolved?.content_type || "";
  const fileName = attachment?.file_name || resolved?.file_name || "File";

  return (
    <div
      className="fixed inset-0 z-[165] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current?.()}
    >
      <div role="dialog" aria-modal="true" aria-label={`View ${fileName}`} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-purple-100">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800 truncate">{fileName}</h2>
            <p className="text-[11px] text-slate-400">{isReference ? "External link" : contentType || "Document"} · Link expires in a few minutes</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition">
                <HiExternalLink className="w-4 h-4" /> Open in new tab
              </a>
            )}
            {!isReference && (
              <button type="button" onClick={download} disabled={downloading || !id} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition disabled:opacity-50">
                <HiDownload className="w-4 h-4" /> {downloading ? "Preparing…" : "Download"}
              </button>
            )}
            <button type="button" onClick={() => onCloseRef.current?.()} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition" aria-label="Close"><HiX className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 min-h-[240px] flex items-center justify-center p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-600">
              <span className="inline-block w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="text-center">
              <HiExclamationCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-rose-700">{error}</p>
              {!isReference && (
                <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition">
                  <HiRefresh className="w-4 h-4" /> Try again
                </button>
              )}
            </div>
          ) : isReference ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition">
              <HiExternalLink className="w-5 h-5" /> Open the linked document
            </a>
          ) : isImageType(contentType) ? (
            <img src={url} alt={fileName} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
          ) : isPdfType(contentType) ? (
            <iframe src={url} title={fileName} className="w-full h-[70vh] rounded-lg bg-white border border-slate-200" />
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition">
              <HiExternalLink className="w-5 h-5" /> Open this file
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
