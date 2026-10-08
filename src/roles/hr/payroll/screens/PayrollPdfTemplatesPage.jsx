// ─────────────────────────────────────────────────────────────────────────────
// PayrollPdfTemplatesPage — see how a payroll document will actually print,
// before there is any real payroll to print.
//
// WHY IT EXISTS: until #225/#226, the only way to check that the logo, the
// registered address, the statutory identifiers and the signature land in the
// right places was to create real employees, run a real payroll and open a real
// payslip. HR had to commit to a run to find out their letterhead was wrong.
//
// SAMPLE DATA, LIVE BRANDING. The figures are invented; the logo, letterhead
// and watermark are the organisation's real ones. So this answers "does our
// branding look right?" and never "is this person's pay correct?" — the page
// says so, because a realistic-looking payslip with invented numbers is exactly
// the thing somebody forwards by mistake.
//
// BINARY, NOT JSON. #226 streams `application/pdf`, so it cannot go through
// `request()` (JSON-only, CLAUDE.md §7). It is fetched as a blob and shown in
// an <iframe> through an object URL, which is revoked on every change — a blob
// URL that is not revoked keeps the whole PDF in memory for the life of the tab.
//
// The response is `private, no-store`: never cache it, never persist it.
//
// Contract: md_pdfs/frontend_payroll_pdf_preview_integration_guide.md
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { HiDocumentText, HiDownload, HiRefresh } from "react-icons/hi";
import DashboardTopBar from "../../../../shared/components/DashboardTopBar";
import { payrollAPI } from "../../../../shared/api";
import { fetchFileBlob } from "../../../../shared/utils/download";
import { EmptyState, ErrorState, LoadingRows, Spinner } from "../../../../shared/attendance/ui";
import FieldHelp from "../../../../shared/fieldHelp/FieldHelp";

/** A4 at a readable zoom; the iframe scrolls rather than the page. */
const VIEWER_H = "min(78vh, 900px)";

export default function PayrollPdfTemplatesPage() {
  const [list, setList] = useState({ rows: [], loading: true, error: null });
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState({ url: "", loading: false, error: null });
  // Held so the previous object URL can be revoked before the next replaces it.
  const urlRef = useRef("");
  // Guards against a slow render for template A landing after the user has
  // already switched to B (CLAUDE.md §7).
  const reqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    payrollAPI.getPdfTemplates()
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        setList({ rows, loading: false, error: null });
        if (rows.length) setCode(rows[0].code);
      })
      .catch((error) => { if (!cancelled) setList({ rows: [], loading: false, error }); });
    return () => { cancelled = true; };
  }, []);

  const releaseUrl = () => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
  };

  const load = useCallback(async (templateCode) => {
    if (!templateCode) return;
    const token = ++reqRef.current;
    setPreview((p) => ({ ...p, loading: true, error: null }));
    try {
      // POST with an empty body renders the golden sample. `override_fields`
      // exists for what-if text, which this screen does not need — the point
      // here is the branding, not the content.
      const { blob } = await fetchFileBlob(payrollAPI.hrPdfTemplatePreview(templateCode), {
        method: "POST",
        body: {},
      });
      if (token !== reqRef.current) return;
      releaseUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreview({ url, loading: false, error: null });
    } catch (error) {
      if (token === reqRef.current) setPreview({ url: "", loading: false, error });
    }
  }, []);

  useEffect(() => { load(code); }, [code, load]);
  // Revoke on unmount too, or navigating away leaks the last PDF.
  useEffect(() => releaseUrl, []);

  const selected = list.rows.find((t) => t.code === code) || null;

  return (
    <>
      <DashboardTopBar title="Document Previews" />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 space-y-6 max-w-7xl mx-auto w-full">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold text-slate-900">Document Previews</h1>
            <FieldHelp surface="payroll.pdf_templates" field="page" label="document previews" />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            See how each payroll document prints with your letterhead, before you run a payroll.
          </p>
        </div>

        {list.error ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-6">
            <ErrorState error={list.error} onRetry={() => window.location.reload()} fallback="Couldn’t load the document list." />
          </div>
        ) : list.loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-6"><LoadingRows rows={4} /></div>
        ) : list.rows.length === 0 ? (
          <EmptyState icon={HiDocumentText} title="No documents to preview" message="Your server hasn’t registered any payroll documents yet. This list fills itself in." />
        ) : (
          <div className="grid lg:grid-cols-[260px_1fr] gap-5 items-start">
            {/* Which document */}
            <div className="bg-white rounded-3xl border border-slate-100 p-3 space-y-1">
              {list.rows.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => setCode(t.code)}
                  aria-current={t.code === code}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl transition ${t.code === code ? "bg-purple-50 text-purple-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <span className="block text-xs font-bold truncate">{t.title || t.code}</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {t.format || "A4"}{t.landscape ? " · landscape" : ""}
                  </span>
                </button>
              ))}
            </div>

            {/* The render */}
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{selected?.title || "Preview"}</p>
                  {/* Said plainly: the layout is real, the numbers are not. */}
                  <p className="text-[11px] text-slate-500">Sample figures, your real letterhead — not anyone’s actual pay.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => load(code)} disabled={preview.loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
                    <HiRefresh className={`w-3.5 h-3.5 ${preview.loading ? "animate-spin" : ""}`} /> Redraw
                  </button>
                  {preview.url && (
                    <a href={preview.url} download={`${code}-preview.pdf`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100">
                      <HiDownload className="w-3.5 h-3.5" /> Save a copy
                    </a>
                  )}
                </div>
              </div>

              <div className="bg-slate-100" style={{ height: VIEWER_H }}>
                {preview.error ? (
                  <div className="h-full flex items-center justify-center p-6">
                    <ErrorState error={preview.error} onRetry={() => load(code)} fallback="Couldn’t draw this document." />
                  </div>
                ) : preview.loading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Spinner className="w-5 h-5" />
                    <p className="text-xs font-semibold">Drawing the preview…</p>
                  </div>
                ) : preview.url ? (
                  <iframe title={`${selected?.title || code} preview`} src={preview.url} className="w-full h-full border-0" />
                ) : null}
              </div>

              {selected && (
                <div className="px-5 py-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">What this document shows</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.required_fields || []).map((f) => (
                      <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-md border border-purple-100 bg-purple-50 text-purple-700 text-[11px] font-semibold">
                        {String(f).replace(/_/g, " ")}
                      </span>
                    ))}
                    {(selected.optional_fields || []).map((f) => (
                      <span key={f} className="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-[11px] font-semibold">
                        {String(f).replace(/_/g, " ")} · only when there is some
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
