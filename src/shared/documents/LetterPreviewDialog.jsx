// ─────────────────────────────────────────────────────────────────────────────
// LetterPreviewDialog.jsx — Shows a letter or letterhead proof as a real A4 PDF
// (#134 / #138). The point of the screen is that HR sees the actual printed
// page, so this is an inline PDF and not a rendering of the same data in HTML:
// margins, page balance and table borders are exactly what this is for.
//
// Four things about these two endpoints drive the design:
//
//   · The reply is `application/pdf` bytes, not JSON, so it is fetched through
//     `fetchFileBlob()` and shown from an object URL. The URL is revoked when
//     the dialog closes — a blob left in memory is a whole PDF per preview.
//   · The server sends `Cache-Control: private, no-store`, so nothing is
//     remembered between opens. Every open re-renders, which is also why the
//     hourly cap exists and why a stray re-render here would spend somebody's
//     quota.
//   · Failures split cleanly in two. A 429, a 502/504 or a 503 is nothing the
//     person typed — the renderer is busy, unreachable or not switched on — and
//     only two of those three are worth a Try again. A 422 is the opposite: a
//     required piece of wording came out blank, and it names which.
//   · Every preview carries a diagonal PREVIEW watermark and made-up employee
//     details. That is said on the dialog rather than left to be noticed,
//     because the whole safeguard depends on nobody sending one to a bank.
//
// Rendered as a SIBLING of DetailDialog, never a child: z-[165] over z-[140].
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiDownload, HiExclamationCircle, HiExternalLink, HiEye, HiInformationCircle, HiRefresh, HiX } from "react-icons/hi";
import {
  isPreviewRateLimited, isPreviewTransient, isRendererNotConfigured, letterErrorMessage,
} from "../utils/documentErrors";

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {() => Promise<{ blob: Blob, filename: string }>} props.render  the preview call
 * @param {string} [props.note]  one line about what this particular preview used
 * @param {(err: unknown) => void} [props.onError]  told about a failed render, so the
 *   screen behind can stop offering previews the server plainly can't do
 * @param {() => void} props.onClose
 */
export default function LetterPreviewDialog({ title, subtitle, render, note, onError, onClose }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("preview.pdf");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // The render call is passed as an inline arrow; a ref keeps the effect from
  // re-running — and re-rendering the PDF — on every parent render.
  const renderRef = useRef(render);
  renderRef.current = render;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // The object URL currently on screen, so it can be revoked before the next
  // one replaces it and once more when the dialog closes.
  const urlRef = useRef("");
  const reqRef = useRef(0);

  const releaseUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
  };

  const load = useCallback(async () => {
    const token = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const { blob, filename } = await renderRef.current();
      if (token !== reqRef.current) return;
      releaseUrl();
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setUrl(next);
      setName(filename || "preview.pdf");
    } catch (err) {
      if (token !== reqRef.current) return;
      releaseUrl();
      setUrl("");
      setError(err);
      onErrorRef.current?.(err);
    } finally {
      if (token === reqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      // Abandon any render still in flight, then free the bytes.
      reqRef.current += 1;
      releaseUrl();
    };
  }, [load]);

  // Escape closes only this dialog, even when it sits over a form.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const rendererOff = isRendererNotConfigured(error);
  const capped = isPreviewRateLimited(error);
  // A missing renderer and a spent quota are both cured by waiting, not by
  // asking again — offering Try again there would just burn the next attempt.
  const canRetry = !!error && !rendererOff && !capped;

  return (
    <div
      className="fixed inset-0 z-[165] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-purple-100 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiEye className="w-5 h-5" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Preview only</p>
              <h2 className="text-base font-bold text-slate-800 truncate">{title}</h2>
              {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <>
                <a
                  href={url} target="_blank" rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 transition"
                >
                  <HiExternalLink className="w-4 h-4" /> Open in new tab
                </a>
                <a
                  href={url} download={name}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
                >
                  <HiDownload className="w-4 h-4" /> Save a copy
                </a>
              </>
            )}
            <button type="button" onClick={() => onCloseRef.current?.()} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition" aria-label="Close preview">
              <HiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[280px] overflow-auto bg-slate-100 flex items-center justify-center p-3 sm:p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="inline-block w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
              <p className="text-sm font-semibold text-purple-700">Drawing the page…</p>
              <p className="text-xs text-slate-500 max-w-xs">This takes a couple of seconds — the letter is being typeset at print size.</p>
            </div>
          ) : error ? (
            <div className="text-center max-w-md px-4">
              <span className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${rendererOff || capped ? "bg-fuchsia-50 text-fuchsia-500" : "bg-rose-50 text-rose-400"}`}>
                {rendererOff || capped ? <HiInformationCircle className="w-6 h-6" /> : <HiExclamationCircle className="w-6 h-6" />}
              </span>
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                {letterErrorMessage(error, "Couldn’t draw this letter.")}
              </p>
              {isPreviewTransient(error) && (
                <p className="text-xs text-slate-500 mt-2">Nothing you’ve set up was affected.</p>
              )}
              {canRetry && (
                <button
                  type="button" onClick={load}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition"
                >
                  <HiRefresh className="w-4 h-4" /> Try again
                </button>
              )}
            </div>
          ) : (
            <iframe src={url} title={title} className="w-full h-[68vh] rounded-lg bg-white border border-slate-200 shadow-sm" />
          )}
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            <span className="font-bold text-slate-600">This is a test page, not a real letter.</span>{" "}
            It is stamped PREVIEW across every page and filled with made-up details — no employee’s name, pay or dates are used, and nothing is saved to anyone’s file.
            {note && <span className="block mt-1 font-semibold text-fuchsia-700">{note}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
