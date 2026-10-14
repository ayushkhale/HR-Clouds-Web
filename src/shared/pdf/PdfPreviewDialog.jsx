// ─────────────────────────────────────────────────────────────────────────────
// pdf/PdfPreviewDialog.jsx — Show a generated PDF on screen instead of saving
// it. The house inline-PDF viewer: letters (#134 / #138 / #271), payslips,
// annual statements and Form 16 all come through here.
//
// The point of the screen is that the real printed page is what is checked, so
// this is an inline PDF in an iframe and never the same data re-drawn in HTML:
// margins, page balance and table borders are exactly what somebody opens this
// for. Four things about these responses drive the design:
//
//   · The reply is `application/pdf` bytes, not JSON, so it is fetched through
//     `fetchFileBlob()` and shown from an object URL. That URL is revoked when
//     it is replaced and again when the dialog closes — a blob left behind is a
//     whole PDF held in memory for the rest of the session.
//   · These routes answer `Cache-Control: private, no-store`, so nothing is
//     remembered between opens. Every open re-renders, which is why a stray
//     re-render here spends somebody's hourly preview quota — hence the request
//     token and the `render` ref, so a parent re-render never refetches.
//   · Failures split in two, and only the caller knows which is which: a busy
//     or unconfigured renderer is nothing the person typed and sometimes not
//     worth a Try again, while a 422 names something they can fix. So the
//     caller passes `errorMessage` and `retryable` rather than this file
//     guessing from a module's error codes.
//   · What the page IS has to be stated, not left to be noticed — a sample
//     render, a watermarked draft and a real issued payslip look alike at a
//     glance. `footnote` is therefore required reading, not decoration.
//
// Rendered as a SIBLING of DetailDialog, never a child: z-[165] over z-[140],
// and its Escape is captured so it never closes the dialog underneath.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiDownload, HiExclamationCircle, HiExternalLink, HiEye, HiInformationCircle, HiRefresh, HiX } from "react-icons/hi";

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string} [props.eyebrow]                 what kind of page this is
 * @param {React.ComponentType} [props.icon]
 * @param {() => Promise<{ blob: Blob, filename?: string }>} props.render  the fetch
 * @param {(err: unknown, fallback?: string) => string} props.errorMessage  the
 *   owning module's mapper, so a refusal reads in that module's words
 * @param {string} [props.fallback]  what a refusal nothing maps reads as. Say what
 *   this screen was drawing ("Couldn’t draw this letter."), not what failed
 * @param {(err: unknown) => boolean} [props.retryable]  default: anything may be
 *   retried. Return false where waiting is the only cure (a spent quota, a
 *   renderer that isn't switched on) — offering Try again there burns the next
 *   attempt and teaches the person to distrust the button
 * @param {(err: unknown) => string} [props.errorNote]  one reassuring line under a
 *   failure, where there is something true to say ("nothing you set up was
 *   affected"). Return "" to say nothing
 * @param {React.ReactNode} [props.footnote]        what this page is and isn't
 * @param {string} [props.fallbackName]             filename when the header can't be read
 * @param {(err: unknown) => void} [props.onError]  so the screen behind can stop
 *   offering previews the server plainly cannot do
 * @param {() => void} props.onClose
 */
export default function PdfPreviewDialog({
  title,
  subtitle,
  eyebrow = "Preview",
  icon: Icon = HiEye,
  render,
  errorMessage,
  fallback = "Couldn’t draw this page.",
  retryable,
  errorNote,
  footnote,
  fallbackName = "preview.pdf",
  onError,
  onClose,
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState(fallbackName);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // `render` is normally an inline arrow; a ref keeps the effect from re-running
  // — and re-rendering the PDF — on every parent render.
  const renderRef = useRef(render);
  renderRef.current = render;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fallbackNameRef = useRef(fallbackName);
  fallbackNameRef.current = fallbackName;
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
      const { blob, filename, contentType } = await renderRef.current();
      if (token !== reqRef.current) return;
      // A successful answer that is plainly a WEB PAGE or a JSON envelope never
      // goes in the frame: an expired session served the sign-in page, or a
      // proxy served its own error page, and both arrive as a perfectly good
      // 200. Framed, they read as a document that came back wrong rather than
      // one that was never sent.
      //
      // Deliberately a denylist, not `/pdf/.test(type)`: a real PDF labelled
      // `application/octet-stream` by some gateway must still render, so only
      // the two answers that are certainly not documents are refused.
      const type = contentType || blob?.type || "";
      if (/text\/html|application\/(json|xhtml)/i.test(type)) {
        const wrong = new Error("What came back wasn’t a document. Your sign-in may have expired — sign in again, then try once more.");
        wrong.status = 200;
        throw wrong;
      }
      releaseUrl();
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setUrl(next);
      setName(filename || fallbackNameRef.current);
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

  // Fetched once per open, and only once: every render spends a slice of the
  // org's hourly preview quota, so this effect must not be able to re-run
  // because a parent re-rendered with a new title or filename. `load` holds no
  // props for the same reason — a retry is the person's decision, never a
  // side effect of state changing on the screen underneath.
  useEffect(() => {
    load();
    return () => {
      // Abandon any render still in flight, then free the bytes.
      reqRef.current += 1;
      releaseUrl();
    };
  }, [load]);

  // Escape closes only this dialog, even when it sits over a form or a detail.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const canRetry = !!error && (retryable ? retryable(error) : true);
  // A refusal nobody can act on reads as information, not as a fault.
  const informational = !!error && !canRetry;

  return (
    <div
      className="fixed inset-0 z-[165] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-6"
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
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">{eyebrow}</p>
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
              <p className="text-xs text-slate-500 max-w-xs">This takes a couple of seconds — the page is being typeset at print size.</p>
            </div>
          ) : error ? (
            <div className="text-center max-w-md px-4">
              <span className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${informational ? "bg-fuchsia-50 text-fuchsia-500" : "bg-rose-50 text-rose-400"}`}>
                {informational ? <HiInformationCircle className="w-6 h-6" /> : <HiExclamationCircle className="w-6 h-6" />}
              </span>
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                {errorMessage(error, fallback)}
              </p>
              {errorNote?.(error) && <p className="text-xs text-slate-500 mt-2">{errorNote(error)}</p>}
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

        {footnote && (
          <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
            <p className="text-[11px] text-slate-500 leading-relaxed">{footnote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
