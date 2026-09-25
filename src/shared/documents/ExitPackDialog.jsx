// ─────────────────────────────────────────────────────────────────────────────
// documents/ExitPackDialog.jsx — Gather everything on one person's file into a
// pack for their exit (#123 on screen, #124 as a spreadsheet).
//
// The two formats are not the same thing with different punctuation, and the
// difference matters enough to be on screen rather than in a manual:
//
//   On screen   every item with its own download link, good for a quarter of
//               an hour. Use it to actually hand the documents over.
//   Spreadsheet titles, dates and states only — no links at all. Use it as the
//               list that goes in the personnel file.
//
// The spreadsheet leaves the links out on purpose. A signed link pasted into a
// spreadsheet that sits on a shared drive is a door left open long after the
// person has gone, and a CSV is exactly the kind of file that gets forwarded.
//
// An item whose file can't be signed comes back without a link rather than
// failing the whole pack, so one swept-up file never costs somebody the other
// forty. Those are counted and named.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HiArchive, HiCheckCircle, HiCloudDownload, HiDocumentText, HiDownload, HiExclamationCircle,
  HiInformationCircle, HiOfficeBuilding, HiTable, HiX,
} from "react-icons/hi";
import { fmtDate, fmtDateTime } from "../attendance/dates";
import { documentErrorMessage, isExitPackTooLarge, isExportLedgerDown } from "../utils/documentErrors";
import {
  EXIT_PACK_SCOPES, EXIT_PACK_URL_MINUTES, exitPackOf, exitPackPlaneLabel,
} from "./offboardingMeta";
import { triggerDownload } from "./documentUpload";
import { DocStatusBadge, PRIMARY_BTN, SECONDARY_BTN } from "./ui";

/**
 * @param {object} props
 * @param {string} props.subjectName
 * @param {string} [props.defaultScope]  the org's own default (setting #81)
 * @param {(params: object) => Promise} props.fetchPack   bound to documentsAPI.getExitPack
 * @param {(params: object) => Promise} props.exportPack  bound to documentsAPI.exportExitPack
 * @param {(message: string, tone?: string) => void} [props.showToast]
 * @param {() => void} props.onClose
 */
export default function ExitPackDialog({ subjectName = "this employee", defaultScope = "all", fetchPack, exportPack, showToast, onClose }) {
  const [scope, setScope] = useState(defaultScope || "all");
  const [state, setState] = useState({ pack: null, loading: false, error: "", tooLarge: false });
  const [exporting, setExporting] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current?.(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  /**
   * Nothing is fetched until it is asked for. Generating a pack signs a link
   * for every document and writes an audit row, so it is a deliberate act
   * rather than something that happens because a dialog opened.
   */
  const build = useCallback(async () => {
    setState({ pack: null, loading: true, error: "", tooLarge: false });
    try {
      const res = await fetchPack({ scope });
      setState({ pack: exitPackOf(res), loading: false, error: "", tooLarge: false });
    } catch (err) {
      setState({
        pack: null,
        loading: false,
        tooLarge: isExitPackTooLarge(err),
        error: isExportLedgerDown(err)
          ? "Nothing was gathered. Packs are recorded for audit before they're built, and that record couldn't be written — try again in a moment."
          : documentErrorMessage(err, "Couldn't gather their documents."),
      });
    }
  }, [fetchPack, scope]);

  const downloadCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { filename } = await exportPack({ scope });
      showToast?.(`Downloaded ${filename}. It lists the documents but carries no links, on purpose.`);
    } catch (err) {
      showToast?.(
        isExitPackTooLarge(err)
          ? "Too many documents for one pack. Choose a narrower scope and take two."
          : isExportLedgerDown(err)
            ? "Nothing was exported. Downloads are recorded for audit before they're sent, and that record couldn't be written — try again in a moment."
            : documentErrorMessage(err, "Couldn't export the list."),
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  const pack = state.pack;
  const items = pack?.items || [];

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Their document pack" className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0"><HiArchive className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-800">Their document pack</h2>
              <p className="text-xs text-slate-500 mt-0.5">Everything on {subjectName}’s file, gathered in one place for their handover.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-lg" aria-label="Close"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">What to include</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {EXIT_PACK_SCOPES.map((option) => (
                <button
                  key={option.value} type="button"
                  onClick={() => { setScope(option.value); setState({ pack: null, loading: false, error: "", tooLarge: false }); }}
                  aria-pressed={scope === option.value}
                  className={`text-left rounded-xl border px-3.5 py-2.5 transition ${scope === option.value ? "border-purple-300 bg-purple-50/70 ring-2 ring-purple-100" : "border-slate-200 bg-white hover:border-purple-200"}`}
                >
                  <span className="block text-xs font-bold text-slate-800">{option.label}</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{option.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          {!pack && !state.loading && !state.error && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm font-bold text-slate-800">Two ways to take it</p>
              <ul className="mt-2 space-y-2 text-xs text-slate-600 leading-relaxed">
                <li className="flex items-start gap-2">
                  <HiDownload className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                  <span><strong>On screen</strong> — every document with its own download link, good for about {EXIT_PACK_URL_MINUTES} minutes. This is the one for actually handing the files over.</span>
                </li>
                <li className="flex items-start gap-2">
                  <HiTable className="w-4 h-4 text-purple-500 shrink-0 mt-px" />
                  <span><strong>Spreadsheet</strong> — titles, dates and states, with no links at all. This is the list for the personnel file. Links are left out on purpose: a spreadsheet gets forwarded, and a link in it would still work after they’ve gone.</span>
                </li>
              </ul>
            </div>
          )}

          {state.loading && (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          )}

          {state.error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700" role="alert">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{state.tooLarge ? `${subjectName} has more documents than one pack can hold. Take two: their own documents, then the company ones.` : state.error}</span>
            </div>
          )}

          {pack && (
            <>
              <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3.5">
                <span className="w-9 h-9 rounded-xl bg-white text-violet-600 flex items-center justify-center shrink-0"><HiCheckCircle className="w-5 h-5" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-violet-900">{pack.itemCount} {pack.itemCount === 1 ? "document" : "documents"} gathered</p>
                  <p className="text-xs text-violet-800 mt-0.5 leading-relaxed">
                    Each link below works for about {EXIT_PACK_URL_MINUTES} minutes and then stops. Generated {pack.generatedAt ? fmtDateTime(pack.generatedAt) : "just now"} and recorded in the export log.
                    {pack.unavailable > 0 && ` ${pack.unavailable} ${pack.unavailable === 1 ? "file couldn't" : "files couldn't"} be opened — marked below.`}
                  </p>
                </div>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  There is nothing on {subjectName}’s file in this scope. Try “Everything”, or their documents may already have been cleared.
                </p>
              ) : (
                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Document</th>
                        <th className="px-4 py-3">State</th>
                        <th className="px-4 py-3">Dates</th>
                        <th className="px-4 py-3 text-right">File</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((item) => (
                        <tr key={`${item.plane}-${item.document_id}`} className="hover:bg-purple-50/20">
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                {item.plane === "org" ? <HiOfficeBuilding className="w-4 h-4" /> : <HiDocumentText className="w-4 h-4" />}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate max-w-[240px]">{item.title}</p>
                                <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                                  {exitPackPlaneLabel(item.plane)}{item.version ? ` · v${item.version}` : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><DocStatusBadge status={item.status} /></td>
                          <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">
                            {item.issued_on ? `Issued ${fmtDate(item.issued_on)}` : item.due_on ? `Due ${fmtDate(item.due_on)}` : "—"}
                            {item.expires_on ? <><br />Expires {fmtDate(item.expires_on)}</> : null}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.url ? (
                              <button
                                type="button" onClick={() => triggerDownload(item.url)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 px-2 py-1 rounded-lg hover:bg-purple-50"
                              >
                                <HiCloudDownload className="w-3.5 h-3.5" /> Get
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-400" title={item.url_error || "The file couldn't be opened"}>Not available</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <p className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
            <HiInformationCircle className="w-4 h-4 shrink-0 mt-px text-purple-400" />
            Generating a pack is recorded in the export log with your name against it, the same as any other bulk download.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
          <button type="button" onClick={onClose} className={`${SECONDARY_BTN} mr-auto`}>Close</button>
          <button type="button" onClick={downloadCsv} disabled={exporting} className={SECONDARY_BTN}>
            {exporting ? <span className="inline-block w-4 h-4 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" /> : <HiTable className="w-4 h-4" />}
            Spreadsheet list
          </button>
          <button type="button" onClick={build} disabled={state.loading} className={PRIMARY_BTN}>
            {state.loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <HiDownload className="w-4 h-4" />}
            {state.loading ? "Gathering…" : pack ? "Refresh the links" : "Gather on screen"}
          </button>
        </div>
      </div>
    </div>
  );
}
